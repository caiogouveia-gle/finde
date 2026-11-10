'use strict';
// Servidor do motor: a API de leitura que o protótipo consome (M11), o envio
// das produtoras (M1), o uso (M13) e a agenda de coletas (M12).
// `node servidor.js` sobe tudo. Node puro.

const http = require('node:http');
const crypto = require('node:crypto');
const { listarRegistros, VERSAO_CONTRATO } = require('./nucleo/contrato');
const { produtoraDoToken, hashToken } = require('./nucleo/produtoras');
const { descreverFontes, fontesLigadas } = require('./fontes');
const { executar } = require('./nucleo/coleta');
const { iniciarAgenda, HORARIOS_PADRAO } = require('./nucleo/agenda');
const { resumoDeUso } = require('./nucleo/uso');
const { modeloAtual } = require('./nucleo/classificar');

const LIMITE_ENVIO = 256 * 1024;
const ID_FESTA = /^[a-z0-9-]{1,60}$/;

const hojeSP = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const dataOk = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function iguaisSeguro(a, b) {
  const ha = Buffer.from(hashToken(a), 'hex');
  const hb = Buffer.from(hashToken(b), 'hex');
  return crypto.timingSafeEqual(ha, hb);
}

function criarServidor({ db, amb, config, agora = () => new Date(), log = console }) {
  const gUso = db.prepare('INSERT INTO uso_api (quando, metodo, rota, status, ms, cliente) VALUES (?, ?, ?, ?, ?, ?)');

  function responder(res, status, corpo, extra = {}) {
    const json = JSON.stringify(corpo);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extra,
    });
    res.end(json);
  }

  function token(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/);
    return m ? m[1] : null;
  }

  function ehAdmin(req) {
    const t = token(req);
    return Boolean(amb.adminToken && t && iguaisSeguro(t, amb.adminToken));
  }

  function lerCorpo(req) {
    return new Promise((ok, falha) => {
      let tamanho = 0;
      const partes = [];
      req.on('data', (p) => {
        tamanho += p.length;
        if (tamanho > LIMITE_ENVIO) {
          falha(Object.assign(new Error('corpo grande demais'), { status: 413 }));
          req.destroy();
          return;
        }
        partes.push(p);
      });
      req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
      req.on('error', falha);
    });
  }

  async function rotear(req, res, u, marca) {
    const { pathname } = u;
    if (req.method === 'GET' && pathname === '/saude') {
      marca.rota = '/saude';
      return responder(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/festas') {
      marca.rota = '/api/festas';
      const de = u.searchParams.get('de');
      const ate = u.searchParams.get('ate');
      if ((de && !dataOk(de)) || (ate && !dataOk(ate))) return responder(res, 400, { erro: 'de e ate são AAAA-MM-DD' });
      let festas = listarRegistros(db, { de: de || hojeSP(agora()), ate, todas: u.searchParams.get('todas') === '1' });
      if (u.searchParams.get('exemplos') === '0') festas = festas.filter((f) => !f.exemplo);
      return responder(res, 200, { contrato: VERSAO_CONTRATO, geradoEm: agora().toISOString(), total: festas.length, festas });
    }

    const mFesta = pathname.match(/^\/api\/festas\/([^/]+)$/);
    if (req.method === 'GET' && mFesta) {
      marca.rota = '/api/festas/:id';
      if (!ID_FESTA.test(mFesta[1])) return responder(res, 404, { erro: 'festa não encontrada' });
      const [r] = listarRegistros(db, { ids: [mFesta[1]], todas: true });
      return r ? responder(res, 200, r) : responder(res, 404, { erro: 'festa não encontrada' });
    }

    if (req.method === 'GET' && pathname === '/api/fontes') {
      marca.rota = '/api/fontes';
      return responder(res, 200, { fontes: descreverFontes(config) });
    }

    if (req.method === 'POST' && pathname === '/api/envios') {
      marca.rota = '/api/envios';
      const p = produtoraDoToken(db, token(req));
      if (!p) return responder(res, 401, { erro: 'token de produtora ausente ou inválido' }, { 'WWW-Authenticate': 'Bearer' });
      marca.cliente = `produtora:${p.id}`;
      let corpo;
      try {
        corpo = JSON.parse(await lerCorpo(req));
      } catch (e) {
        return responder(res, e.status || 400, { erro: e.status === 413 ? 'envio maior que 256 KB' : 'JSON inválido' });
      }
      if (!corpo || !Array.isArray(corpo.festas) || corpo.festas.length === 0) {
        return responder(res, 400, { erro: 'o envio precisa de uma lista "festas" com ao menos uma festa' });
      }
      db.prepare('INSERT INTO envios (produtora_id, recebido_em, corpo) VALUES (?, ?, ?)')
        .run(p.id, agora().toISOString(), JSON.stringify(corpo));
      return responder(res, 202, { recebido: corpo.festas.length, produtora: p.nome, processa: 'na próxima coleta' });
    }

    if (req.method === 'GET' && (pathname === '/api/uso' || pathname === '/api/execucoes')) {
      marca.rota = pathname;
      if (!ehAdmin(req)) return responder(res, 401, { erro: 'precisa do token de admin' }, { 'WWW-Authenticate': 'Bearer' });
      marca.cliente = 'admin';
      if (pathname === '/api/uso') return responder(res, 200, resumoDeUso(db, agora()));
      const execucoes = db.prepare('SELECT id, inicio, fim, estado, gatilho, resumo FROM execucoes ORDER BY id DESC LIMIT 20').all()
        .map((e) => ({ ...e, resumo: e.resumo ? JSON.parse(e.resumo) : null }));
      return responder(res, 200, { execucoes });
    }

    marca.rota = 'outra';
    return responder(res, 404, { erro: 'não encontrado' });
  }

  const servidor = http.createServer(async (req, res) => {
    const t0 = process.hrtime.bigint();
    const marca = { rota: 'outra', cliente: 'publico' };
    const origem = req.headers.origin;
    if (origem && amb.cors.includes(origem)) {
      res.setHeader('Access-Control-Allow-Origin', origem);
      res.setHeader('Vary', 'Origin');
    }
    res.on('finish', () => {
      const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
      try {
        gUso.run(agora().toISOString(), req.method, marca.rota, res.statusCode, ms, marca.cliente);
      } catch (e) {
        log.warn(`[motor] uso não gravado: ${e.message}`);
      }
    });
    try {
      await rotear(req, res, new URL(req.url, 'http://motor'), marca);
    } catch (e) {
      log.error(`[motor] erro em ${req.method} ${req.url}: ${e.message}`);
      if (!res.headersSent) responder(res, 500, { erro: 'erro interno' });
    }
  });
  return servidor;
}

// ---------------------------------------------------------------- execução direta

if (require.main === module) {
  const { preparar } = require('./nucleo/ambiente');
  const { amb, db, config, claude } = preparar();
  const servidor = criarServidor({ db, amb, config });
  servidor.listen(amb.porta, () => {
    console.info(`[motor] no ar em http://localhost:${amb.porta} · banco ${amb.banco}`);
    console.info(`[motor] classificação: ${claude ? `Claude (${modeloAtual()})` : 'por regras (sem ANTHROPIC_API_KEY)'}`);
  });
  if (amb.horarios) {
    const horarios = amb.horarios === 'padrao' ? HORARIOS_PADRAO : amb.horarios;
    iniciarAgenda({
      horarios,
      tarefa: async () => {
        const { fontes, config: cfg } = fontesLigadas(config, { exemplos: amb.comExemplos });
        const r = await executar({ db, fontes, gatilho: 'agenda', claude, config: cfg });
        if (!r.recusada) console.info(`[motor] coleta ${r.execucaoId}: ${r.festasTocadas} festas, ${r.festasNovas} novas, US$ ${r.classificacao.gastoUsd}`);
      },
    });
  } else {
    console.info('[motor] agenda desligada (defina FINDE_HORARIOS, ex.: "padrao" ou "07:00,12:00,17:00,21:00")');
  }
  const fechar = () => servidor.close(() => { db.close(); process.exit(0); });
  process.on('SIGTERM', fechar);
  process.on('SIGINT', fechar);
}

module.exports = { criarServidor };

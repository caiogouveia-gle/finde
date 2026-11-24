'use strict';
// Servidor do motor: a API de leitura que o protótipo consome (M11, M36), o
// envio das produtoras (M1), as avaliações do app (M38), as imagens de
// divulgação, o uso (M13), a coleta sob comando e a agenda (M12, M37).
// `node servidor.js` sobe tudo. Node puro.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { listarRegistros } = require('./nucleo/contrato');
const { produtoraDoToken, hashToken } = require('./nucleo/produtoras');
const { descreverFontes, fontesLigadas } = require('./fontes');
const { executar } = require('./nucleo/coleta');
const { iniciarAgenda, criarTarefaDeColeta, HORARIOS_PADRAO } = require('./nucleo/agenda');
const { resumoDeUso } = require('./nucleo/uso');
const { modeloAtual } = require('./nucleo/classificar');
const { resolverId } = require('./nucleo/correlacao');
const { caminhoSeguro } = require('./nucleo/imagens');
const { hojeSP, dataOk, limitarDe, registrosParaEntregar, envelope, etagDaLista, etagConfere } = require('./nucleo/exportar');
const avaliacoesFonte = require('./fontes/avaliacoes');

const LIMITE_ENVIO = 256 * 1024;
const ID_FESTA = /^[a-z0-9-]{1,60}$/;
const RESPOSTAS = ['mais-novo', 'na-medida', 'mais-velho'];
const CODIGO = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_AVALIACOES_POR_PEDIDO = 200;

function iguaisSeguro(a, b) {
  const ha = Buffer.from(hashToken(a), 'hex');
  const hb = Buffer.from(hashToken(b), 'hex');
  return crypto.timingSafeEqual(ha, hb);
}

// `claude`, `fetch` e `executarColeta` vão para POST /api/coletar; os testes trocam
// a execução. `amb.imagens` é a pasta das imagens (FINDE_IMAGENS).
function criarServidor({ db, amb, config, agora = () => new Date(), log = console, claude = null, fetch = globalThis.fetch, executarColeta = executar }) {
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

  // As festas de uma imagem; true quando ela tem festa e todas estão ocultas.
  const qFestasDaImagem = db.prepare(`SELECT DISTINCT v.festa_id AS id,
      EXISTS (SELECT 1 FROM valores x WHERE x.festa_id = v.festa_id AND x.campo = 'oculta' AND x.valor NOT IN ('false', 'null')) AS oculta
    FROM imagens_item ii JOIN vinculos v ON v.fonte = ii.fonte AND v.id_externo = ii.id_externo
    WHERE substr(ii.sha, 1, 16) = ?`);
  function soDeFestasOcultas(sha16) {
    const festas = qFestasDaImagem.all(sha16);
    return festas.length > 0 && festas.every((f) => f.oculta);
  }

  // GET /imagens/<sha16>-(480|1080).webp: só o nome que o motor grava, só imagem
  // que está no banco e não foi ocultada, sempre de dentro da pasta das imagens.
  function servirImagem(res, nomeBruto) {
    let nome = null;
    try {
      nome = caminhoSeguro(decodeURIComponent(nomeBruto));
    } catch {
      nome = null;
    }
    if (!nome) return responder(res, 404, { erro: 'imagem não encontrada' });
    const linha = db.prepare('SELECT oculta FROM imagens WHERE substr(sha, 1, 16) = ?').get(nome.slice(0, 16));
    if (!linha || linha.oculta) return responder(res, 404, { erro: 'imagem não encontrada' });
    // A peça só das festas que a curadoria ocultou também não sai (KTD12).
    if (soDeFestasOcultas(nome.slice(0, 16))) return responder(res, 404, { erro: 'imagem não encontrada' });
    const raiz = amb.imagens;
    const arquivo = raiz ? [path.join(raiz, nome), path.join(raiz, 'imagens', nome)].find((c) => fs.existsSync(c)) : null;
    if (!arquivo) return responder(res, 404, { erro: 'imagem não encontrada' });
    const tamanho = fs.statSync(arquivo).size;
    res.writeHead(200, {
      'Content-Type': 'image/webp',
      'Content-Length': tamanho,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    const leitura = fs.createReadStream(arquivo);
    leitura.on('error', () => res.destroy());
    leitura.pipe(res);
  }

  // POST /api/avaliacoes (KTD13): o lote que o app manda, sem nome. Idempotente
  // pela chave: a mesma chave de novo não conta duas vezes.
  async function receberAvaliacoes(req, res, marca) {
    const t = token(req);
    if (!(amb.appToken && t && iguaisSeguro(t, amb.appToken))) {
      return responder(res, 401, { erro: 'token do app ausente ou inválido' }, { 'WWW-Authenticate': 'Bearer' });
    }
    marca.cliente = 'app';
    let corpo;
    try {
      corpo = JSON.parse(await lerCorpo(req));
    } catch (e) {
      return responder(res, e.status || 400, { erro: e.status === 413 ? 'pedido maior que 256 KB' : 'JSON inválido' });
    }
    const itens = corpo && Array.isArray(corpo.avaliacoes) ? corpo.avaliacoes : null;
    if (!itens || itens.length === 0 || itens.length > MAX_AVALIACOES_POR_PEDIDO) {
      return responder(res, 400, { erro: `mande "avaliacoes" com de 1 a ${MAX_AVALIACOES_POR_PEDIDO} itens` });
    }
    if (itens.some((x) => x && typeof x === 'object' && ('nome' in x || 'name' in x))) {
      return responder(res, 400, { erro: 'a avaliação não leva nome: só a chave, o aparelho e a resposta' });
    }
    const existe = db.prepare('SELECT 1 FROM festas WHERE id = ?');
    const ins = db.prepare(`INSERT INTO avaliacoes (chave, festa_id, aparelho, plano, resposta, idade, recebida_em) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (chave) DO NOTHING`);
    const quando = agora().toISOString();
    let novas = 0;
    let repetidas = 0;
    let recusadas = 0;
    for (const x of itens) {
      const plano = x && (x.planoId ?? x.plano);
      const festa = x && typeof (x.festaId ?? corpo.festaId) === 'string' ? resolverId(db, x.festaId ?? corpo.festaId) : null;
      const ok = x && typeof x === 'object' && CODIGO.test(String(x.chave || '')) && CODIGO.test(String(x.aparelho || ''))
        && RESPOSTAS.includes(x.resposta) && festa && ID_FESTA.test(festa) && existe.get(festa)
        && (plano === undefined || plano === null || CODIGO.test(String(plano)));
      if (!ok) {
        recusadas += 1;
        continue;
      }
      // Idade fora de 18 a 60 não conta: a resposta fica, sem idade.
      const idade = Number.isInteger(x.idade) && x.idade >= avaliacoesFonte.IDADE_MIN && x.idade <= avaliacoesFonte.IDADE_MAX ? x.idade : null;
      const r = ins.run(String(x.chave), festa, String(x.aparelho), plano ? String(plano) : null, x.resposta, idade, quando);
      if (r.changes) novas += 1;
      else repetidas += 1;
    }
    if (novas + repetidas === 0) return responder(res, 400, { erro: 'nenhuma avaliação válida', recusadas });
    // A média sai já: não espera a próxima coleta.
    if (!(config.avaliacoes && config.avaliacoes.ligada === false)) {
      try {
        await avaliacoesFonte.aplicar({ db, agora, config: config.avaliacoes || {}, log });
      } catch (e) {
        log.warn(`[motor] a média das avaliações não foi atualizada: ${e.message}`);
      }
    }
    return responder(res, 202, { novas, repetidas, recusadas });
  }

  // POST /api/coletar (admin): dispara uma coleta e responde logo. 202 com o id
  // da execução, ou 409 quando já há uma rodando (a trava de coleta.js).
  async function coletarAgora(req, res, marca) {
    if (!ehAdmin(req)) return responder(res, 401, { erro: 'precisa do token de admin' }, { 'WWW-Authenticate': 'Bearer' });
    marca.cliente = 'admin';
    let pedido = {};
    try {
      const texto = await lerCorpo(req);
      if (texto.trim()) pedido = JSON.parse(texto);
    } catch (e) {
      return responder(res, e.status || 400, { erro: e.status === 413 ? 'pedido maior que 256 KB' : 'JSON inválido' });
    }
    if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) pedido = {};
    const { fontes, config: cfg } = fontesLigadas(config, { so: typeof pedido.fonte === 'string' ? pedido.fonte : null, exemplos: amb.comExemplos, poc: Boolean(amb.poc) });
    if (!fontes.length) return responder(res, 400, { erro: 'nenhuma fonte ligada para rodar' });
    const antes = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM execucoes').get().id;
    // A trava é tomada na parte síncrona de executar: o id já existe aqui.
    const p = executarColeta({ db, fontes, gatilho: 'comando', claude, config: cfg, agora, log, fetch, forcar: pedido.forcar === true, dirImagens: amb.imagens });
    const nova = db.prepare("SELECT id FROM execucoes WHERE id > ? AND estado = 'rodando' ORDER BY id DESC LIMIT 1").get(antes);
    if (!nova) {
      const r = await p.catch(() => null);
      const rodando = db.prepare("SELECT id FROM execucoes WHERE estado = 'rodando' ORDER BY id DESC LIMIT 1").get();
      if (r && r.recusada) return responder(res, 409, { erro: 'já há uma coleta rodando', execucaoId: rodando ? rodando.id : null });
      return responder(res, 500, { erro: 'a coleta não começou' });
    }
    p.then((r) => {
      if (r && !r.recusada) log.info(`[motor] coleta ${r.execucaoId} (comando): ${r.festasTocadas} festas, ${r.festasNovas} novas`);
    }, (e) => log.error(`[motor] a coleta ${nova.id} falhou: ${e.message}`));
    return responder(res, 202, { execucaoId: nova.id, estado: 'rodando' });
  }

  async function rotear(req, res, u, marca) {
    const { pathname } = u;
    // O motor não é para busca: nada dele (JSON nem imagem) entra em índice.
    if (req.method === 'GET' && pathname === '/robots.txt') {
      marca.rota = '/robots.txt';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end('User-agent: *\nDisallow: /\n');
    }
    if (req.method === 'GET' && pathname === '/saude') {
      marca.rota = '/saude';
      return responder(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/festas') {
      marca.rota = '/api/festas';
      const de = u.searchParams.get('de');
      const ate = u.searchParams.get('ate');
      if ((de && !dataOk(de)) || (ate && !dataOk(ate))) return responder(res, 400, { erro: 'de e ate são AAAA-MM-DD' });
      // `todas` traz as ocultas pela curadoria, as que não são festa e as de
      // fora de SP: é para quem cuida do motor, com o token de admin (o app não usa).
      const todas = u.searchParams.get('todas') === '1';
      if (todas && !ehAdmin(req)) return responder(res, 401, { erro: 'todas=1 precisa do token de admin' }, { 'WWW-Authenticate': 'Bearer' });
      if (todas) marca.cliente = 'admin';
      // `de` mais antigo que 7 dias atrás vira 7 dias atrás, sem recusa (M36).
      const filtros = {
        de: limitarDe(de, agora()),
        ate: ate || null,
        todas,
        semExemplos: u.searchParams.get('exemplos') === '0',
      };
      const etag = etagDaLista(db, filtros);
      const cabecalhos = { ETag: etag, 'Cache-Control': 'no-cache' };
      if (etagConfere(req.headers['if-none-match'], etag)) {
        res.writeHead(304, { ...cabecalhos, 'X-Content-Type-Options': 'nosniff' });
        return res.end();
      }
      return responder(res, 200, envelope(db, registrosParaEntregar(db, filtros), agora), cabecalhos);
    }

    const mFesta = pathname.match(/^\/api\/festas\/([^/]+)$/);
    if (req.method === 'GET' && mFesta) {
      marca.rota = '/api/festas/:id';
      if (!ID_FESTA.test(mFesta[1])) return responder(res, 404, { erro: 'festa não encontrada' });
      // O id antigo de uma festa unida a outra continua resolvendo (festas_alias).
      const [r] = listarRegistros(db, { ids: [resolverId(db, mFesta[1])] });
      return r ? responder(res, 200, r) : responder(res, 404, { erro: 'festa não encontrada' });
    }

    const mImagem = pathname.match(/^\/imagens\/([^/]+)$/);
    if (req.method === 'GET' && mImagem) {
      marca.rota = '/imagens/:nome';
      return servirImagem(res, mImagem[1]);
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

    if (req.method === 'POST' && pathname === '/api/avaliacoes') {
      marca.rota = '/api/avaliacoes';
      return receberAvaliacoes(req, res, marca);
    }

    if (req.method === 'POST' && pathname === '/api/coletar') {
      marca.rota = '/api/coletar';
      return coletarAgora(req, res, marca);
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
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex, nofollow');
    const origem = req.headers.origin;
    if (origem && amb.cors.includes(origem)) {
      res.setHeader('Access-Control-Allow-Origin', origem);
      res.setHeader('Vary', 'Origin');
    }
    res.on('finish', () => {
      // A checagem de saúde do Fly bate a cada 30 s: não vira linha em uso_api (M37).
      if (marca.rota === '/saude') return;
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
  // No fechar, derruba as conexões abertas (keep-alive) para o close não esperar.
  const fecharOriginal = servidor.close.bind(servidor);
  servidor.close = (cb) => {
    const r = fecharOriginal(cb);
    if (typeof servidor.closeAllConnections === 'function') servidor.closeAllConnections();
    return r;
  };
  return servidor;
}

// ---------------------------------------------------------------- execução direta

if (require.main === module) {
  const { preparar } = require('./nucleo/ambiente');
  const { amb, db, config, claude } = preparar();
  const servidor = criarServidor({ db, amb, config, claude });
  servidor.listen(amb.porta, () => {
    console.info(`[motor] no ar em http://localhost:${amb.porta} · banco ${amb.banco}`);
    console.info(`[motor] classificação: ${claude ? `Claude (${modeloAtual()})` : 'por regras (sem ANTHROPIC_API_KEY)'}`);
    console.info(`[motor] prova acadêmica (FINDE_POC): ${amb.poc ? 'ligada, a agenda coleta Instagram e páginas' : 'desligada'} · avaliações do app: ${amb.appToken ? 'com token' : 'sem FINDE_APP_TOKEN (POST /api/avaliacoes fechado)'}`);
  });
  let agenda = null;
  if (amb.horarios) {
    const horarios = amb.horarios === 'padrao' ? HORARIOS_PADRAO : amb.horarios;
    agenda = iniciarAgenda({ horarios, tarefa: criarTarefaDeColeta({ db, amb, config, claude }) });
  } else {
    console.info('[motor] agenda desligada (defina FINDE_HORARIOS, ex.: "padrao" ou "07:00,12:00,17:00,21:00")');
  }
  const fechar = () => {
    if (agenda) agenda.parar();
    servidor.close(() => { db.close(); process.exit(0); });
  };
  process.on('SIGTERM', fechar);
  process.on('SIGINT', fechar);
}

module.exports = { criarServidor };

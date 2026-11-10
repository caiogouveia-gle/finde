'use strict';
// Servidor do Finde: estáticos de publico/, a API e as páginas de plano.
// Node puro, sem dependências. `node servidor.js` sobe tudo.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const motor = require('./nucleo/motor');
const { entender } = require('./nucleo/entender');
const { criarPlanos, ErroPlano } = require('./nucleo/planos');

const RAIZ = __dirname;
const PUBLICO = path.join(RAIZ, 'publico');
const FIXTURE = path.join(RAIZ, 'teste', 'fixture.json');
const LIMITE_CORPO = 16 * 1024;
const LIMITE_TEXTO = 500;

const TIPOS_ARQUIVO = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const CABECALHOS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

// ---------------------------------------------------------------- base

function lerLinhas(caminho) {
  const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (Array.isArray(bruto)) return bruto;
  if (bruto && Array.isArray(bruto.experiencias)) return bruto.experiencias;
  throw new Error('o arquivo não traz uma lista de experiências');
}

// Lê a base; se ela não existir ou não abrir, cai na fixture com aviso.
// Relê sozinha quando o arquivo muda (a curadoria pode estar escrevendo).
function criarFonteDaBase(caminho, reserva, log) {
  let atual = { base: [], fonte: null, marca: null };

  function carregar() {
    let marca = null;
    try {
      marca = fs.statSync(caminho).mtimeMs;
    } catch {
      marca = 'sem-arquivo';
    }
    if (marca === atual.marca) return atual.base;

    let linhas;
    let fonte = caminho;
    try {
      linhas = lerLinhas(caminho);
    } catch (e) {
      const motivo = e.code === 'ENOENT' ? 'não existe' : `não abriu (${e.message})`;
      log.warn(`[finde] a base ${caminho} ${motivo}; usando a fixture ${reserva}`);
      fonte = reserva;
      try {
        linhas = lerLinhas(reserva);
      } catch (e2) {
        log.warn(`[finde] a fixture também não abriu (${e2.message}); base vazia`);
        linhas = [];
      }
    }
    const { base, avisos } = motor.prepararBase(linhas);
    for (const a of avisos) log.warn(`[finde] ${a}`);
    log.info(`[finde] base: ${base.length} experiências de ${fonte}`);
    atual = { base, fonte, marca };
    return base;
  }

  return { base: carregar, fonte: () => atual.fonte };
}

// ---------------------------------------------------------------- respostas

function json(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    ...CABECALHOS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
}

const erro = (res, status, mensagem) => json(res, status, { erro: mensagem });

function enviarArquivo(req, res, caminho) {
  fs.stat(caminho, (e, st) => {
    if (e || !st.isFile()) return erro(res, 404, 'Não achei essa página.');
    const tipo = TIPOS_ARQUIVO[path.extname(caminho).toLowerCase()];
    if (!tipo) return erro(res, 404, 'Não achei essa página.');
    res.writeHead(200, {
      ...CABECALHOS,
      'Content-Type': tipo,
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(caminho).pipe(res);
  });
}

function estatico(req, res, pathname) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(pathname);
  } catch {
    return erro(res, 400, 'Endereço malformado.');
  }
  if (decodificado.includes('\0') || decodificado.includes('\\')) return erro(res, 400, 'Endereço malformado.');
  const alvo = path.resolve(PUBLICO, '.' + path.posix.normalize('/' + decodificado));
  if (!alvo.startsWith(PUBLICO + path.sep)) return erro(res, 404, 'Não achei essa página.');
  enviarArquivo(req, res, alvo);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    let grande = Number(req.headers['content-length'] || 0) > LIMITE_CORPO;
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > LIMITE_CORPO) grande = true;
      if (tamanho > 1024 * 1024) req.destroy();
      if (!grande) partes.push(parte);
    });
    req.on('end', () => {
      if (grande) return reject(new ErroPlano(413, 'O pedido veio grande demais.'));
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto.trim()) return resolve({});
      try {
        const corpo = JSON.parse(texto);
        if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error();
        resolve(corpo);
      } catch {
        reject(new ErroPlano(400, 'Não entendi o pedido: o corpo precisa ser um objeto JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------- API

function criteriosCompletos(bruto) {
  const c = motor.sanearCriterios(bruto);
  if (motor.falta(c).length) throw new ErroPlano(400, 'Faltam critérios. Termine a conversa antes.');
  return motor.completar(c);
}

function criarServidor({
  dados = process.env.FINDE_DADOS || path.join(RAIZ, 'dados', 'experiencias.json'),
  reserva = FIXTURE,
  varDir = process.env.FINDE_VAR || path.join(RAIZ, 'var'),
  log = console,
} = {}) {
  const fonte = criarFonteDaBase(path.resolve(dados), reserva, log);
  fonte.base();
  const planos = criarPlanos(path.resolve(varDir));

  const rotas = {
    'GET /api/base': () => {
      const base = fonte.base();
      return [200, {
        total: base.length,
        regioes: motor.REGIOES.map((id) => ({
          id,
          nome: motor.NOME_REGIAO[id],
          total: base.filter((e) => e.regiao === id).length,
        })),
      }];
    },

    'POST /api/conversa': (corpo) => {
      const criterios = motor.sanearCriterios(corpo.criterios);
      let entendido = [];
      if (corpo.texto !== undefined && corpo.texto !== null) {
        if (typeof corpo.texto !== 'string') throw new ErroPlano(400, 'O texto precisa ser uma frase.');
        if (corpo.texto.length > LIMITE_TEXTO) throw new ErroPlano(400, 'Frase longa demais. Tente em poucas palavras.');
        const pergunta = motor.ORDEM_PERGUNTAS.includes(corpo.pergunta) ? corpo.pergunta : undefined;
        const parcial = motor.sanearCriterios(entender(corpo.texto, criterios, pergunta));
        delete parcial.evitar;
        entendido = Object.keys(parcial);
        Object.assign(criterios, parcial);
      }
      const falta = motor.falta(criterios);
      if (falta.length) return [200, { criterios, falta, entendido }];
      const base = fonte.base();
      if (base.length === 0) {
        return [200, { criterios, entendido, opcoes: [], aviso: 'Minha lista de lugares está vazia agora. Volte daqui a pouco.' }];
      }
      const r = motor.escolher(criterios, base);
      return [200, { criterios: { ...criterios, evitar: criterios.evitar || [] }, entendido, ...r }];
    },

    'POST /api/trocar': (corpo) => {
      const criterios = criteriosCompletos(corpo.criterios);
      if (typeof corpo.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(corpo.id)) {
        throw new ErroPlano(400, 'Diga qual opção trocar.');
      }
      let atuais;
      if (corpo.atuais !== undefined) {
        if (!Array.isArray(corpo.atuais) || corpo.atuais.length > 3 || !corpo.atuais.every((x) => typeof x === 'string')) {
          throw new ErroPlano(400, 'A lista de opções na mesa veio estranha.');
        }
        atuais = corpo.atuais;
      }
      return [200, motor.trocar(criterios, fonte.base(), corpo.id, atuais)];
    },

    'POST /api/planos': (corpo) => {
      const criterios = criteriosCompletos(corpo.criterios);
      const ids = corpo.opcoes;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || !ids.every((x) => typeof x === 'string') || new Set(ids).size !== ids.length) {
        throw new ErroPlano(400, 'O plano precisa de uma a três opções diferentes.');
      }
      const opcoes = motor.montarOpcoes(criterios, fonte.base(), ids);
      if (!opcoes) throw new ErroPlano(400, 'Alguma dessas opções não está mais na base.');
      const plano = planos.criar({ criterios, opcoes, autor: corpo.autor });
      return [201, { id: plano.id, url: `/p/${plano.id}` }];
    },
  };

  async function api(req, res, pathname) {
    const chave = `${req.method} ${pathname}`;
    const m = pathname.match(/^\/api\/planos\/([^/]+)(?:\/(votos|fechar))?$/);
    let acao = rotas[chave];
    if (!acao && m) {
      const [, id, sub] = m;
      if (!sub && req.method === 'GET') acao = () => [200, planos.ler(id)];
      else if (sub === 'votos' && req.method === 'POST') acao = (c) => [200, planos.votar(id, c.nome, c.opcao)];
      else if (sub === 'fechar' && req.method === 'POST') acao = (c) => [200, planos.fechar(id, c.nome)];
      else return erro(res, 405, 'Esse caminho não aceita esse método.');
    }
    if (!acao) {
      const existe = Object.keys(rotas).some((k) => k.endsWith(` ${pathname}`));
      return existe ? erro(res, 405, 'Esse caminho não aceita esse método.') : erro(res, 404, 'Não achei esse caminho.');
    }
    const corpo = req.method === 'POST' ? await lerCorpo(req) : {};
    const [status, resposta] = acao(corpo);
    json(res, status, resposta);
  }

  return http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://finde').pathname;
    } catch {
      return erro(res, 400, 'Endereço malformado.');
    }
    try {
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') return erro(res, 405, 'Esse caminho não aceita esse método.');
      if (pathname === '/') return enviarArquivo(req, res, path.join(PUBLICO, 'index.html'));
      if (/^\/p\/[^/]+\/?$/.test(pathname)) return enviarArquivo(req, res, path.join(PUBLICO, 'plano.html'));
      return estatico(req, res, pathname);
    } catch (e) {
      if (e instanceof ErroPlano) return erro(res, e.status, e.message);
      log.error('[finde] erro inesperado', e);
      if (!res.headersSent) erro(res, 500, 'Algo deu errado aqui do meu lado. Tente de novo.');
    }
  });
}

if (require.main === module) {
  const porta = Number(process.env.FINDE_PORTA || 8760);
  const servidor = criarServidor();
  servidor.listen(porta, () => console.log(`[finde] no ar em http://localhost:${porta}`));
}

module.exports = { criarServidor };

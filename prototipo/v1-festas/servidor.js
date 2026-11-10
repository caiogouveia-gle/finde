'use strict';
// Servidor do Finde v1: estáticos de publico/, a API e as páginas de convite.
// Node puro, sem dependências. `node servidor.js` sobe tudo.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const C = require('./nucleo/catalogo');
const motor = require('./nucleo/motor');
const conversa = require('./nucleo/conversa');
const { entender } = require('./nucleo/entender');
const { prepararBase, lerLinhas } = require('./nucleo/base');
const { criarPlanos, ErroPlano } = require('./nucleo/planos');

const RAIZ = __dirname;
const PUBLICO = path.join(RAIZ, 'publico');
const LIMITE_CORPO = 16 * 1024;
const LIMITE_TEXTO = 300;
const FORMATO_ID_FESTA = /^[a-z0-9-]{1,60}$/;

const TIPOS_ARQUIVO = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Tudo vem daqui: scripts, estilos e fontes (servidas de publico/fontes).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
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
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ---------------------------------------------------------------- base

// Lê a base e relê quando o arquivo muda. Linhas inválidas saem com aviso no log.
function criarFonteDaBase(caminho, log) {
  let atual = { base: [], marca: null };

  function carregar() {
    let marca;
    try {
      marca = fs.statSync(caminho).mtimeMs;
    } catch {
      marca = 'sem-arquivo';
    }
    if (marca === atual.marca) return atual.base;
    let linhas = [];
    try {
      linhas = lerLinhas(JSON.parse(fs.readFileSync(caminho, 'utf8')));
    } catch (e) {
      const motivo = e.code === 'ENOENT' ? 'não existe' : `não abriu (${e.message})`;
      log.warn(`[finde] a base ${caminho} ${motivo}; sigo com a base vazia`);
    }
    const { base, avisos } = prepararBase(linhas);
    for (const a of avisos) log.warn(`[finde] ${a}`);
    log.info(`[finde] base: ${base.length} festas de ${caminho}`);
    atual = { base, marca };
    return base;
  }

  return { base: carregar };
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

const erro = (res, status, mensagem, dados = {}) => json(res, status, { erro: mensagem, ...dados });

// Para texto que entra em atributo ou corpo de HTML gerado no servidor.
function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Origem para os endereços absolutos das imagens de compartilhamento.
function origem(req) {
  const host = String(req.headers.host || '');
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `http://${host}` : '';
}

// Páginas HTML com as metas de compartilhamento preenchidas.
function enviarPagina(req, res, arquivo, { status = 200, titulo, descricao, dados } = {}) {
  fs.readFile(arquivo, 'utf8', (e, html) => {
    if (e) return erro(res, 404, 'Não achei essa página.');
    let pagina = html.replaceAll('__ORIGEM__', escapar(origem(req)));
    // JSON dentro de <script type="application/json">: "<" escapado, nada executa.
    pagina = pagina.replace('__DADOS__', () => (dados ? JSON.stringify(dados).replace(/</g, '\\u003c') : 'null'));
    if (titulo) {
      pagina = pagina
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapar(titulo)}$2`)
        .replace(/<title>[^<]*<\/title>/, `<title>${escapar(titulo)}</title>`);
    }
    if (descricao) pagina = pagina.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapar(descricao)}$2`);
    const corpo = Buffer.from(pagina, 'utf8');
    res.writeHead(status, {
      ...CABECALHOS,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': corpo.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : corpo);
  });
}

function enviarArquivo(req, res, caminho) {
  fs.stat(caminho, (e, st) => {
    if (e || !st.isFile()) return erro(res, 404, 'Não achei essa página.');
    const tipo = TIPOS_ARQUIVO[path.extname(caminho).toLowerCase()];
    if (!tipo) return erro(res, 404, 'Não achei essa página.');
    res.writeHead(200, {
      ...CABECALHOS,
      'Content-Type': tipo,
      'Content-Length': st.size,
      // Fontes não mudam: guardam por um ano. O resto revalida.
      'Cache-Control': tipo === 'font/woff2' ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(caminho).pipe(res);
  });
}

// Só serve o que está dentro de publico/, depois de decodificar e normalizar.
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

function exigirCriterios(bruto) {
  const c = motor.sanearCriterios(bruto);
  const faltam = motor.falta(c);
  if (faltam.length) throw new ErroPlano(400, 'Faltou responder umas perguntas. Vamos do começo?', { faltam });
  return motor.completar(c);
}

function idsNaTela(bruto) {
  if (bruto === undefined) return [];
  if (!Array.isArray(bruto) || bruto.length > 3 || !bruto.every((x) => typeof x === 'string' && FORMATO_ID_FESTA.test(x))) {
    throw new ErroPlano(400, 'A lista de festas na tela veio estranha.');
  }
  return bruto;
}

// A data da festa: o próximo dia da semana dela que ainda não acabou.
// Devolve { data: 'AAAA-MM-DD', ate: ISO do fim da festa }.
function dataDaFesta(f, agora) {
  const alvo = { sex: 5, sab: 6, dom: 0 }[f.dia];
  for (let i = 0; i < 8; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    if (d.getDay() !== alvo) continue;
    const fim = new Date(d.getTime() + f.fim * 3600 * 1000);
    if (fim > agora) {
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { data: dia, ate: fim.toISOString() };
    }
  }
  return null;
}

// A próxima pista que abre, pelo relógio: no fim de semana, a próxima do dia
// (ou do dia seguinte); de segunda a quinta, a primeira da sexta.
function proximaPista(base, agora = new Date()) {
  const ordemDia = { 5: 'sex', 6: 'sab', 0: 'dom' };
  const hoje = ordemDia[agora.getDay()];
  const hora = agora.getHours() + agora.getMinutes() / 60;
  const editoriais = base.filter((f) => f.selo === 'editorial');
  const primeira = (dia, depois = -1) => editoriais
    .filter((f) => f.dia === dia && f.inicio > depois)
    .sort((a, b) => a.inicio - b.inicio || a.id.localeCompare(b.id))[0];
  let f;
  if (hoje) {
    f = primeira(hoje, hora);
    const resto = C.ORDEM_DIAS.slice(C.ORDEM_DIAS.indexOf(hoje) + 1);
    for (const d of resto) f = f || primeira(d);
  }
  f = f || primeira('sex');
  return f ? { linha: C.linhaDaFesta(f), nome: f.nome, origem: f.origemIdade } : null;
}

function formulario(base) {
  const porDia = Object.fromEntries(C.ORDEM_DIAS.map((d) => [d, base.filter((f) => f.dia === d).length]));
  const inicios = base.map((f) => f.inicio);
  return {
    total: base.length,
    porDia,
    abreMaisCedo: inicios.length ? C.hora(Math.min(...inicios)) : null,
    proxima: proximaPista(base),
    ficticia: true,
    dias: C.ORDEM_DIAS.map((id) => ({ id, rotulo: C.DIAS[id].nome })),
    janelas: C.JANELAS.map((j) => ({ id: j.id, rotulo: `${j.rotulo} · ${j.nome}` })),
    faixas: C.FAIXAS.map((f) => ({ id: f.id, rotulo: f.rotulo })),
    tetos: C.TETOS.map((t) => ({ id: t.id, rotulo: t.rotulo })),
    estilos: C.ESTILOS.map((e) => ({ id: e.id, rotulo: e.rotulo })),
  };
}

function criarServidor({
  dados = process.env.FINDE_DADOS || path.join(RAIZ, 'dados', 'festas.json'),
  varDir = process.env.FINDE_VAR || path.join(RAIZ, 'var'),
  log = console,
} = {}) {
  const fonte = criarFonteDaBase(path.resolve(dados), log);
  fonte.base();
  const planos = criarPlanos(path.resolve(varDir), { log });

  function resultado(criterios) {
    const base = fonte.base();
    if (!base.length) return { opcoes: [], afrouxou: [], aviso: 'A lista de festas está vazia agora. Volte daqui a pouco.' };
    return motor.escolher(criterios, base);
  }

  const rotas = {
    'GET /api/formulario': () => [200, formulario(fonte.base())],

    'POST /api/festas': (corpo) => {
      const criterios = exigirCriterios(corpo.criterios);
      const r = resultado(criterios);
      if (r.oferta) criterios.oferta = r.oferta.frase;
      return [200, {
        criterios, pedido: motor.resumoDoPedido(criterios), pedidoPartes: motor.pedidoEmPartes(criterios),
        ...r, resposta: conversa.abertura(r),
      }];
    },

    'POST /api/conversa': (corpo) => {
      const antes = exigirCriterios(corpo.criterios);
      if (typeof corpo.texto !== 'string' || !corpo.texto.trim()) throw new ErroPlano(400, 'Escreva o que quer mudar.');
      if (corpo.texto.length > LIMITE_TEXTO) throw new ErroPlano(400, 'Frase longa demais. Tente em poucas palavras.');
      const antesIds = idsNaTela(corpo.atuais);
      const base = fonte.base();
      const porId = new Map(base.map((f) => [f.id, f]));
      const naTela = antesIds.map((id) => porId.get(id)).filter(Boolean);
      const contexto = {
        ...antes,
        mostradas: antesIds,
        estilosMostrados: naTela.map((f) => f.estilos[0]),
        precosMostrados: naTela.map((f) => f.preco),
      };

      let { mudar, pedidos, duvida, diaRecusado } = entender(corpo.texto, contexto);
      // "sim" aceita a oferta da resposta anterior.
      if (pedidos.length === 1 && pedidos[0] === 'aceitar' && antes.oferta) {
        ({ mudar, pedidos, duvida, diaRecusado } = entender(antes.oferta, contexto));
      }
      const depois = motor.completar({ ...antes, ...motor.sanearCriterios(mudar) });
      delete depois.oferta;
      depois.firmes = conversa.firmesDe(antes, depois);
      let r = resultado(depois);
      const anterior = () => resultado(antes);
      const nomeDe = (id) => (porId.get(id) ? porId.get(id).nome : id);

      // "mais barato" para no preço mais baixo que ainda tem festa.
      let piso = false;
      if (pedidos.includes('mais-barato') && !r.opcoes.length && depois.teto !== antes.teto) {
        const minimo = motor.precoMinimo(depois, base);
        if (minimo !== null && minimo < (antes.teto === 'sem-limite' ? Infinity : antes.teto)) {
          depois.teto = minimo;
          r = resultado(depois);
          piso = true;
        }
      }

      // "outras": se nada novo cabe de verdade no pedido, avisa e mantém a lista.
      if (pedidos.includes('outras')) {
        const novaQueCabe = r.opcoes.some((o) => !antesIds.includes(o.festa.id) && o.atende);
        if (!novaQueCabe) {
          const a = anterior();
          const { oferta: _, ...semOferta } = antes;
          return [200, {
            criterios: semOferta, pedido: motor.resumoDoPedido(antes), pedidoPartes: motor.pedidoEmPartes(antes),
            ...a, aviso: undefined, oferta: undefined, resposta: 'Já mostrei tudo que cabe nesse pedido.', entendeu: true, entraram: [], sairam: [],
          }];
        }
      }

      let impedimento;
      if (pedidos.includes('estilo') && r.casam === 0 && depois.estilos.length) {
        impedimento = motor.impedimentoDoEstilo(depois, base, depois.estilos[depois.estilos.length - 1]);
      }
      const fala = conversa.responder({ pedidos, antes, depois, antesIds, resultado: r, nomeDe, impedimento, duvida, piso, diaRecusado });
      // Não entendeu: a lista e os critérios ficam como estavam.
      const { oferta: _velha, ...antesSemOferta } = antes;
      const criterios = fala.entendeu ? depois : antesSemOferta;
      const final = fala.entendeu ? r : anterior();
      // A oferta vale só para a próxima frase: a do motor, ou a dúvida sobre o dia.
      let oferta = fala.entendeu ? r.oferta : undefined;
      if (duvida && duvida.dia) {
        const nome = C.DIAS[duvida.dia].frase;
        oferta = { frase: nome, rotulo: `Mudar ${duvida.dia === 'sex' ? 'pra' : 'pro'} ${nome}` };
      }
      if (oferta) criterios.oferta = oferta.frase;
      return [200, {
        criterios,
        pedido: motor.resumoDoPedido(criterios),
        pedidoPartes: motor.pedidoEmPartes(criterios),
        ...final,
        aviso: fala.entendeu ? final.aviso : undefined,
        oferta,
        resposta: fala.texto,
        entendeu: fala.entendeu,
        entraram: fala.entraram,
        sairam: fala.sairam,
      }];
    },

    'POST /api/planos': (corpo) => {
      const criterios = exigirCriterios(corpo.criterios);
      if (typeof corpo.festa !== 'string' || !FORMATO_ID_FESTA.test(corpo.festa)) throw new ErroPlano(400, 'Diga qual festa mandar.');
      const festa = fonte.base().find((f) => f.id === corpo.festa);
      if (!festa) throw new ErroPlano(400, 'Essa festa não está mais na lista.');
      const plano = planos.criar({
        festa: motor.opcao(festa, criterios), pedido: motor.resumoDoPedido(criterios), autor: corpo.autor,
        quando: dataDaFesta(festa, new Date()),
      });
      return [201, { id: plano.id, url: `/p/${plano.id}`, data: plano.data }];
    },
  };

  // /p/:id: 404 de verdade quando o convite não existe; quando existe, as
  // metas de compartilhamento dizem a festa.
  function paginaDoConvite(req, res, id) {
    const arquivo = path.join(PUBLICO, 'plano.html');
    if (!planos.existe(id)) {
      return enviarPagina(req, res, arquivo, { status: 404, titulo: 'Esse convite não existe · finde.' });
    }
    const p = planos.ler(id);
    const o = p.festa;
    const dia = C.DIAS[o.festa.dia];
    const titulo = `Bora ${dia.id === 'sex' ? 'na' : 'no'} ${dia.frase}? ${o.festa.nome}, ${o.hora} · média ${o.festa.mediaIdade}`;
    const descricao = `${o.festa.casa} · ${o.preco}. ${o.horario}`;
    return enviarPagina(req, res, arquivo, { titulo, descricao });
  }

  async function api(req, res, pathname) {
    const chave = `${req.method} ${pathname}`;
    let acao = rotas[chave];
    const m = pathname.match(/^\/api\/planos\/([^/]+)(?:\/(respostas))?$/);
    if (!acao && m) {
      const [, id, sub] = m;
      if (!sub && req.method === 'GET') acao = () => [200, planos.ler(id)];
      else if (sub && req.method === 'POST') acao = (c) => [200, planos.responder(id, c.nome, c.resposta, { confirmar: c.confirmar === true })];
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
      if (pathname === '/' || pathname === '/index.html') {
        // Os dados da primeira tela vão junto com o HTML: uma ida e volta a menos.
        return enviarPagina(req, res, path.join(PUBLICO, 'index.html'), { dados: formulario(fonte.base()) });
      }
      const convite = pathname.match(/^\/p\/([^/]+)\/?$/);
      if (convite) return paginaDoConvite(req, res, convite[1]);
      if (pathname === '/plano.html') return erro(res, 404, 'Não achei essa página.');
      return estatico(req, res, pathname);
    } catch (e) {
      if (e instanceof ErroPlano) return erro(res, e.status, e.message, e.dados);
      log.error('[finde] erro inesperado', e);
      if (!res.headersSent) erro(res, 500, 'Algo deu errado aqui do meu lado. Tente de novo.');
    }
  });
}

if (require.main === module) {
  const porta = Number(process.env.FINDE_PORTA || 8763);
  const servidor = criarServidor();
  servidor.listen(porta, () => console.log(`[finde] no ar em http://localhost:${porta}`));
}

module.exports = { criarServidor, proximaPista, dataDaFesta };

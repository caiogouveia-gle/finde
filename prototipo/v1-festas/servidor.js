'use strict';
// Servidor do Finde v1: a landing, o app, estáticos de publico/, a API e as
// páginas de convite. Node puro, sem dependências.
//
// FINDE_SITE escolhe o que sobe:
//   landing  só a landing, em / (finde.fly.dev). /app e /p/<id> mandam para o
//            app, em FINDE_URL_APP; a API não existe aqui, e página que não
//            existe dá o 404 em HTML, com o caminho para o app.
//   app      só o app, em / e em /app (finde-app.fly.dev), com a API e os
//            convites. A landing fica em FINDE_URL_SITE.
//   ausente  tudo junto, para desenvolver e testar: landing em /, app em /app.
// As páginas recebem os dois endereços nos marcadores __URL_SITE__ e __URL_APP__.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const C = require('./nucleo/catalogo');
const motor = require('./nucleo/motor');
const conversa = require('./nucleo/conversa');
const { entender } = require('./nucleo/entender');
const { prepararBase, lerBase, deslocarDatas } = require('./nucleo/base');
const { criarPlanos, ErroPlano } = require('./nucleo/planos');
const R = require('./nucleo/reais');
const L = require('./nucleo/lista');
const FT = require('./publico/festa-texto');
// A base viva do motor, as avaliações e as rotas novas do app (U22 a U25 do
// plano de 24/11/2026) moram em nucleo/; aqui, só a ligação.
const { criarFonteMotor } = require('./nucleo/fonte-motor');
const { criarAvaliacoes } = require('./nucleo/avaliacoes');
const { criarValidacao, criarLimite } = require('./nucleo/validacao');
const A = require('./nucleo/rotas-app');
const { cara: caraDe } = require('./nucleo/cara');

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
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Tudo vem daqui: scripts, estilos e fontes (servidas de publico/fontes).
// No site `app`, o img-src ganha só a origem dos tiles do mapa (FINDE_TILES,
// KTD16); a imagem de festa continua vindo daqui (/imagens/, D4).
const cspCom = (imagensDeFora = '') => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  `img-src 'self' data:${imagensDeFora ? ` ${imagensDeFora}` : ''}`,
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');
const CSP = cspCom();
const TILES_PADRAO = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// A origem (https://host) do endereço dos tiles, para a CSP. Endereço que não
// é https fica fora: o mapa não carrega, e nada estranho entra na CSP.
// O subdomínio "{s}" (a, b, c, d dos provedores) vira "*.".
function origemDosTiles(modelo) {
  const m = String(modelo || '');
  try {
    const u = new URL(m.replace(/\{[a-z]\}/g, 'a'));
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return /^https:\/\/\{s\}\./.test(m) ? `https://*.${u.host.slice(2)}` : u.origin;
  } catch {
    return null;
  }
}

// same-origin: o endereço de origem só vai para o próprio servidor (o app
// sabe se veio da landing); para fora, nada.
const CABECALHOS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Só a página da landing manda a própria origem (sem caminho nem query) para
// outro endereço: em produção o app mora em finde-app.fly.dev, e é por esse
// referrer que ele sabe que a entrada anterior da história é a landing e
// volta por ela. Nenhuma outra página faz isso (nem o 404 da landing), então
// um referrer com a origem da landing quer dizer a landing. O app e os
// convites continuam em same-origin: o id de um convite não sai para fora.
const REFERRER_DA_LANDING = { 'Referrer-Policy': 'strict-origin-when-cross-origin' };

// Os cabeçalhos do site `app` (KTD16, KTD17): a CSP com os tiles e nada de
// buscador. A landing segue com CABECALHOS. Cada resposta do app carrega os
// dela em res.finde (ver cabecalhosDe).
function cabecalhosDoApp(tiles) {
  return { ...CABECALHOS, 'Content-Security-Policy': cspCom(origemDosTiles(tiles) || ''), 'X-Robots-Tag': 'noindex, noimageindex' };
}
const cabecalhosDe = (res) => (res && res.finde) || CABECALHOS;

// ---------------------------------------------------------------- base

// Base fictícia: a cada meia hora os carimbos andam com o relógio (KTD8).
const RELER_FICTICIA_MS = 30 * 60 * 1000;

// Lê a base e relê quando o arquivo muda. Linhas inválidas saem com aviso no log.
// Numa base marcada como fictícia, os carimbos de "conferido" andam com o
// relógio, para "conferido há 2 h" continuar verdade no dia da apresentação.
function criarFonteDaBase(caminho, log, relogio) {
  let atual = { base: [], marca: null, lidaEm: 0, ficticia: false };

  function carregar() {
    let marca;
    try {
      marca = fs.statSync(caminho).mtimeMs;
    } catch {
      marca = 'sem-arquivo';
    }
    const agora = relogio();
    if (marca === atual.marca && !(atual.ficticia && agora - atual.lidaEm >= RELER_FICTICIA_MS)) return atual.base;
    let lida = { linhas: [], ficticia: false, referencia: null };
    try {
      lida = lerBase(JSON.parse(fs.readFileSync(caminho, 'utf8')));
    } catch (e) {
      const motivo = e.code === 'ENOENT' ? 'não existe' : `não abriu (${e.message})`;
      log.warn(`[finde] a base ${caminho} ${motivo}; sigo com a base vazia`);
    }
    const linhas = lida.referencia ? deslocarDatas(lida.linhas, agora - Date.parse(lida.referencia)) : lida.linhas;
    const { base, avisos } = prepararBase(linhas);
    const releitura = marca === atual.marca;
    if (!releitura) {
      for (const a of avisos) log.warn(`[finde] ${a}`);
      log.info(`[finde] base: ${base.length} festas de ${caminho}`);
    }
    atual = { base, marca, lidaEm: agora, ficticia: lida.ficticia };
    return base;
  }

  return { base: carregar };
}

// As festas reais (nucleo/reais.js): o export do motor, convertido para o
// formato da base. Arquivo que falta não é erro: o app segue só com a base
// fictícia, como antes. Relido quando o arquivo muda; o filtro do que já
// passou é feito a cada pedido, pelo relógio, e não aqui.
function criarFonteDosReais(caminho, log) {
  let atual = { festas: [], marca: null, resumo: null };
  function carregar() {
    if (!caminho) return atual.festas;
    let marca;
    try {
      marca = fs.statSync(caminho).mtimeMs;
    } catch {
      marca = 'sem-arquivo';
    }
    if (marca === atual.marca) return atual.festas;
    let festas = [];
    let resumo = null;
    if (marca === 'sem-arquivo') {
      log.info(`[finde] sem festas reais (${caminho} não existe); só a base fictícia`);
    } else {
      try {
        const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        const r = R.converterExport(bruto);
        festas = r.festas;
        resumo = R.resumoDoExport(bruto);
        for (const a of r.avisos) log.warn(`[finde] reais: ${a}`);
        for (const x of r.fora) log.info(`[finde] reais: fora "${x.id}" (${x.motivo})`);
        log.info(`[finde] reais: ${festas.length} festas de ${caminho}`);
      } catch (e) {
        log.warn(`[finde] as festas reais de ${caminho} não abriram (${e.message}); sigo só com a base fictícia`);
      }
    }
    atual = { festas, marca, resumo };
    return festas;
  }
  // O que o export diz de si ("Atualizado há…"), como o estado da fonte do motor.
  const estado = () => {
    carregar();
    const r = atual.resumo || {};
    return { origem: atual.resumo ? 'arquivo' : null, geradoEm: r.atualizadoEm || null, recebidas: r.total || 0, perfis: r.perfis || 0, sites: r.sites || 0, total: atual.festas.length };
  };
  return { festas: carregar, estado };
}

// ---------------------------------------------------------------- respostas

// Texto (HTML, CSS, JS, JSON, SVG) sai comprimido em gzip para quem aceita:
// numa rede lenta, a primeira pintura espera o HTML e o CSS inteiros.
const COMPRIMIVEL = /^(text\/|application\/json|image\/svg\+xml)/;
const MINIMO_PARA_COMPRIMIR = 1024;

function aceitaGzip(req) {
  const aceita = String((req && req.headers['accept-encoding']) || '');
  return /\bgzip\b(?!\s*;\s*q=0(?:\.0+)?\b)/i.test(aceita);
}

// Manda um corpo pronto (Buffer), comprimido quando vale a pena.
function enviarCorpo(req, res, status, cabecalhos, corpo, comprimido) {
  const tipo = cabecalhos['Content-Type'] || '';
  let saida = corpo;
  const extra = {};
  if (corpo.length >= MINIMO_PARA_COMPRIMIR && COMPRIMIVEL.test(tipo)) {
    extra.Vary = 'Accept-Encoding';
    if (aceitaGzip(req)) {
      saida = comprimido ? comprimido() : zlib.gzipSync(corpo);
      extra['Content-Encoding'] = 'gzip';
    }
  }
  res.writeHead(status, { ...cabecalhosDe(res), ...cabecalhos, ...extra, 'Content-Length': saida.length });
  res.end(req && req.method === 'HEAD' ? undefined : saida);
}

function json(res, status, corpo) {
  enviarCorpo(res.req, res, status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, Buffer.from(JSON.stringify(corpo), 'utf8'));
}

const erro = (res, status, mensagem, dados = {}) => json(res, status, { erro: mensagem, ...dados });

// Para texto que entra em atributo ou corpo de HTML gerado no servidor.
function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Origem para os endereços absolutos das imagens de compartilhamento. No Fly
// o pedido chega aqui em http, atrás do proxy, e o esquema de quem pediu vem
// em X-Forwarded-Proto: sem ele, a prévia do link levaria uma imagem em http.
function origem(req) {
  const host = String(req.headers.host || '');
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return '';
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

// Os endereços da landing e do app nos marcadores do modelo, escapados para HTML.
function trocarEnderecos(html, enderecos) {
  let saida = html;
  for (const [marca, valor] of Object.entries(enderecos)) saida = saida.replaceAll(marca, () => escapar(valor));
  return saida;
}

// Páginas HTML com as metas de compartilhamento preenchidas. Os marcadores do
// modelo (a origem e os endereços) saem primeiro, antes de entrar qualquer
// texto montado: nada que venha da base vira endereço.
function enviarPagina(req, res, arquivo, { status = 200, titulo, descricao, dados, trocas, enderecos = {}, cabecalhos = {} } = {}) {
  fs.readFile(arquivo, 'utf8', (e, html) => {
    if (e) return erro(res, 404, 'Não achei essa página.');
    let pagina = trocarEnderecos(html.replaceAll('__ORIGEM__', escapar(origem(req))), enderecos);
    // Trechos de HTML montados (e escapados) aqui no servidor, como o convite da landing.
    for (const [marca, trecho] of Object.entries(trocas || {})) pagina = pagina.replace(marca, () => trecho);
    // JSON dentro de <script type="application/json">: "<" escapado, nada executa.
    pagina = pagina.replace('__DADOS__', () => (dados ? JSON.stringify(dados).replace(/</g, '\\u003c') : 'null'));
    if (titulo) {
      pagina = pagina
        // Função de troca: um "$2" ou "$&" no nome da festa é texto, não padrão.
        .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => a + escapar(titulo) + b)
        .replace(/<title>[^<]*<\/title>/, () => `<title>${escapar(titulo)}</title>`);
    }
    if (descricao) pagina = pagina.replace(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => a + escapar(descricao) + b);
    enviarCorpo(req, res, status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...cabecalhos,
    }, Buffer.from(pagina, 'utf8'));
  });
}

// Estáticos de texto comprimidos uma vez só, enquanto o arquivo não muda.
const comprimidos = new Map();

function enviarArquivo(req, res, caminho) {
  fs.stat(caminho, (e, st) => {
    if (e || !st.isFile()) return erro(res, 404, 'Não achei essa página.');
    const tipo = TIPOS_ARQUIVO[path.extname(caminho).toLowerCase()];
    if (!tipo) return erro(res, 404, 'Não achei essa página.');
    const cabecalhos = {
      'Content-Type': tipo,
      // Fontes não mudam: guardam por um ano. O resto revalida.
      'Cache-Control': tipo === 'font/woff2' ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (COMPRIMIVEL.test(tipo)) {
      return fs.readFile(caminho, (e2, corpo) => {
        if (e2) return erro(res, 404, 'Não achei essa página.');
        const marca = `${st.mtimeMs}:${st.size}`;
        enviarCorpo(req, res, 200, cabecalhos, corpo, () => {
          const guardado = comprimidos.get(caminho);
          if (guardado && guardado.marca === marca) return guardado.gz;
          const gz = zlib.gzipSync(corpo);
          comprimidos.set(caminho, { marca, gz });
          return gz;
        });
      });
    }
    res.writeHead(200, { ...cabecalhosDe(res), ...cabecalhos, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(caminho).pipe(res);
  });
}

// Só serve o que está dentro de publico/, depois de decodificar e normalizar,
// e só o que o site deixa (`pode` recebe o caminho normalizado). HTML nunca
// sai daqui: cada página tem a sua rota, que troca os marcadores.
function estatico(req, res, pathname, pode = () => true) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(pathname);
  } catch {
    return erro(res, 400, 'Endereço malformado.');
  }
  if (decodificado.includes('\0') || decodificado.includes('\\')) return erro(res, 400, 'Endereço malformado.');
  const caminho = path.posix.normalize('/' + decodificado);
  const alvo = path.resolve(PUBLICO, '.' + caminho);
  if (!alvo.startsWith(PUBLICO + path.sep) || path.extname(alvo).toLowerCase() === '.html' || !pode(caminho)) {
    return erro(res, 404, 'Não achei essa página.');
  }
  enviarArquivo(req, res, alvo);
}

// Sem corpo; o navegador segue o Location. Sem cache, para o endereço do app
// poder mudar sem deixar redirecionamento velho guardado no navegador. Sem
// Referrer-Policy: no redirecionamento ela trocaria a de quem pediu, e o
// /app?festa=<id> tocado na landing chegaria ao app sem a origem dela.
function redirecionar(res, status, destino) {
  const { 'Referrer-Policy': _, ...cabecalhos } = cabecalhosDe(res);
  res.writeHead(status, { ...cabecalhos, Location: destino, 'Cache-Control': 'no-cache', 'Content-Length': 0 });
  res.end();
}

// Um segmento do caminho, decodificado e codificado de novo: o que for vai
// inteiro para o outro endereço, sem abrir barra, "?" nem "#".
function recodificar(segmento) {
  try {
    return encodeURIComponent(decodeURIComponent(segmento));
  } catch {
    return encodeURIComponent(segmento);
  }
}

// A página de "não achei" de onde a landing mora (só a landing, ou tudo
// junto): o wordmark, o D para o app e o C de volta para o início, com o
// estilo da landing. Caminho de página (sem extensão ou .html) cai aqui;
// arquivo que falta continua com o 404 curto em JSON.
const NAO_ACHEI = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Não achei essa página · finde.</title>
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#EADCD2">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/landing.css">
</head>
<body>
  <header class="topo faixa">
    <a class="marca" href="__URL_SITE__" aria-label="finde, início">finde<span class="ponto" aria-hidden="true">.</span></a>
  </header>
  <main id="conteudo">
    <section class="hero faixa" aria-labelledby="nao-achei-titulo">
      <div class="hero-texto">
        <p class="rotulo">Erro 404</p>
        <h1 id="nao-achei-titulo">Não achei essa página</h1>
        <p class="hero-lead">Pode ser que o link tenha vindo cortado ou com algum caractere a mais no fim.</p>
        <div class="hero-acoes">
          <a class="botao" href="__URL_APP__">Achar a minha festa</a>
          <a class="link-fio" href="__URL_SITE__">ou volte para o início <svg class="seta" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true" focusable="false"><path d="M3 8h10M9 4l4 4-4 4"/></svg></a>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
`;

const ehCaminhoDePagina = (pathname) => {
  const ext = path.posix.extname(pathname).toLowerCase();
  return !ext || ext === '.html';
};

// ---------------------------------------------------------------- sites

// Um caminho deste servidor ("/", "/app") ou um endereço http(s) inteiro.
function lerEndereco(nome, valor, padrao) {
  const v = valor === undefined || valor === null || String(valor).trim() === '' ? padrao : String(valor).trim();
  if (/^\/(?![/\\])[^\s\\]*$/.test(v)) return v;
  let u = null;
  try {
    u = new URL(v);
  } catch { /* cai no erro abaixo */ }
  if (u && (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password) return u.href;
  throw new Error(`[finde] ${nome} precisa ser um caminho deste servidor (/app) ou um endereço http(s), não "${v}"`);
}

const ehAbsoluto = (endereco) => /^https?:\/\//.test(endereco);

// O modo e os dois endereços, conferidos ao subir: configuração errada para o
// servidor na hora, em vez de virar redirecionamento em círculo (a landing
// mandando /app para ela mesma) ou um app sem caminho de volta.
function configurarSites({ site, urlSite, urlApp }) {
  const modo = site === undefined || site === null ? '' : String(site).trim();
  if (modo && modo !== 'landing' && modo !== 'app') {
    throw new Error(`[finde] FINDE_SITE aceita "landing" ou "app" (ou nada, para tudo junto), não "${modo}"`);
  }
  const conf = {
    modo: modo || null,
    urlSite: lerEndereco('FINDE_URL_SITE', urlSite, '/'),
    // No modo app, o app está na raiz.
    urlApp: lerEndereco('FINDE_URL_APP', urlApp, modo === 'app' ? '/' : '/app'),
  };
  if (conf.modo === 'landing' && !ehAbsoluto(conf.urlApp)) {
    throw new Error('[finde] FINDE_SITE=landing pede FINDE_URL_APP com o endereço do app (https://...)');
  }
  if (conf.modo === 'app' && !ehAbsoluto(conf.urlSite)) {
    throw new Error('[finde] FINDE_SITE=app pede FINDE_URL_SITE com o endereço da landing (https://...)');
  }
  return conf;
}

// O que a landing pede de publico/: os caminhos locais de landing.html (href,
// src e a imagem de compartilhamento) e os url() de landing.css. No modo
// landing, só isso sai; o resto (o app, os cartazes) mora no outro endereço.
function arquivosDaLanding() {
  const ler = (nome) => {
    try {
      return fs.readFileSync(path.join(PUBLICO, nome), 'utf8');
    } catch {
      return '';
    }
  };
  const caminhos = [
    ...ler('landing.html').matchAll(/\b(?:href|src|content)="(?:__ORIGEM__)?(\/[^"?#]*)/g),
    ...ler('landing.css').matchAll(/url\(\s*['"]?(\/[^'")?#\s]+)/g),
  ].map((m) => path.posix.normalize(m[1]));
  return new Set(caminhos.filter((c) => path.extname(c) && path.extname(c).toLowerCase() !== '.html'));
}

// O que cada modo serve de publico/ como arquivo estático.
function estaticosDoModo(modo) {
  if (modo === 'landing') {
    const daLanding = arquivosDaLanding();
    return (caminho) => daLanding.has(caminho);
  }
  if (modo === 'app') return (caminho) => !/^\/landing\./i.test(caminho);
  return () => true;
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
  const completo = motor.completar(c);
  // A semana do pedido (KTD15): "esta" é o padrão; "proxima" segue com os critérios.
  if (bruto && bruto.semana === 'proxima') completo.semana = 'proxima';
  else delete completo.semana;
  return completo;
}

function idsNaTela(bruto) {
  if (bruto === undefined) return [];
  // As três de cima contam como "na tela"; um app que manda a lista do dia
  // inteira (até 100) não leva erro por isso.
  if (!Array.isArray(bruto) || bruto.length > 100 || !bruto.every((x) => typeof x === 'string' && FORMATO_ID_FESTA.test(x))) {
    throw new ErroPlano(400, 'Não consegui ler a lista da tela. Recarregue a página e tente de novo.');
  }
  return bruto.slice(0, 3);
}

// A data da festa: o próximo dia da semana dela que ainda não acabou. A
// véspera conta enquanto a festa dela segue (à 1h de sábado, a de sexta que
// vai até as 5h é de sexta), a mesma régua de quandoDaReal.
// Devolve { data: 'AAAA-MM-DD', ate: ISO do fim da festa }.
function dataDaFesta(f, agora) {
  const alvo = { sex: 5, sab: 6, dom: 0 }[f.dia];
  for (let i = -1; i < 8; i++) {
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

// extra (U24, KTD15): `semanas` ({ esta, proxima }, de rotas-app.diasDoFormulario),
// `zonas` (os 14 bairros, de rotas-app.bairrosDoFormulario) e `base` (de onde
// vem a lista: { atualizadoEm, total, perfis, sites }). Sem extra, como antes.
function formulario(base, reais = 0, extra = {}) {
  const porDia = Object.fromEntries(C.ORDEM_DIAS.map((d) => [d, base.filter((f) => f.dia === d).length]));
  const inicios = base.map((f) => f.inicio);
  return {
    total: base.length,
    porDia,
    abreMaisCedo: inicios.length ? C.hora(Math.min(...inicios)) : null,
    proxima: proximaPista(base),
    // Com festa real vigente, a lista mistura: reais primeiro, e as
    // fictícias que completam vêm marcadas como exemplo.
    ficticia: !reais,
    misto: reais > 0,
    reais,
    // "Sair quando?" com a data e as reais de cada opção, nesta semana e na
    // próxima (R24); `dias` é a desta semana.
    dias: extra.semanas ? extra.semanas.esta : C.ORDEM_DIAS.map((id) => ({ id, rotulo: C.DIAS[id].nome })),
    semanas: extra.semanas || null,
    base: extra.base || null,
    janelas: C.JANELAS.map((j) => ({ id: j.id, rotulo: `${j.rotulo} · ${j.nome}` })),
    faixas: C.FAIXAS.map((f) => ({ id: f.id, rotulo: f.rotulo })),
    // A faixa em que a pessoa se sente bem (R20): de 18 a 50, padrão 28 a 35.
    idade: { min: motor.IDADE_MIN, max: motor.IDADE_MAX, padrao: { min: 28, max: 35 } },
    // Os bairros por zona (R19, R29), na ordem das regiões do catálogo.
    zonas: extra.zonas || Object.entries(C.REGIOES).map(([id, nome]) => ({
      id, nome, bairros: Object.entries(C.BAIRROS).filter(([, b]) => b.regiao === id).map(([bid, b]) => ({ id: bid, rotulo: b.nome })),
    })),
    tetos: C.TETOS.map((t) => ({ id: t.id, rotulo: t.rotulo })),
    estilos: C.ESTILOS.map((e) => ({ id: e.id, rotulo: e.rotulo })),
  };
}

// ---------------------------------------------------------------- landing

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const FESTA_DO_CONVITE = 'sexta-sem-pressa';

// "sex, 20 nov" (a página põe em caixa alta) a partir da data da festa.
function rotuloDaData(f, agora) {
  const q = dataDaFesta(f, agora);
  const curto = C.DIAS[f.dia].curto.toLowerCase();
  if (!q) return curto;
  const [, m, d] = q.data.split('-').map(Number);
  return `${curto}, ${d} ${MESES[m - 1]}`;
}

const bairroDe = (f) => (C.BAIRROS[f.bairro] ? C.BAIRROS[f.bairro].nome : '');
const curtaDe = (f) => f.origemIdadeCurta || '';

// O cartão sobre a foto do herói: a festa do desenho (Sexta Sem Pressa), com
// a hora primeiro, a média com a origem e a marca de exemplo. "Tô dentro"
// desce até a demo, onde a mesma festa abre.
function htmlDoDestaque(f, agora) {
  if (!f) return '';
  const onde = [rotuloDaData(f, agora), bairroDe(f)].filter(Boolean).join(' · ');
  return `<div class="destaque" role="group" aria-label="Exemplo de festa no finde, fictícia">
        <span class="destaque-mini">${escapar(onde)}</span>
        <span class="destaque-hora">${escapar(C.horaCheia(f.inicio))}</span>
        <span class="destaque-nome">${escapar(f.nome)}</span>
        <div class="destaque-pe">
          <span class="destaque-media">Média de ${escapar(f.mediaIdade)} anos<small>${escapar(f.origemIdade)}</small></span>
          <a class="destaque-ir" href="#demo" data-ir-passo="1">Tô dentro</a>
        </div>
        <span class="destaque-exemplo">Exemplo · festa fictícia</span>
      </div>`;
}

// A demo da landing: três telas do app com festas fictícias da base. A
// primeira é a lista da semana (a festa do destaque e mais três, de sexta a
// domingo); a segunda, o detalhe dela; a terceira, o convite no grupo.
const FESTAS_DA_DEMO = ['roda-de-sexta', FESTA_DO_CONVITE, 'vinil-e-vinho', 'domingo-no-terraco'];
function htmlDaDemo(base, agora, urlApp) {
  const f = festaDoConvite(base);
  if (!f) return '';
  const lista = FESTAS_DA_DEMO.map((id) => base.find((x) => x.id === id)).filter(Boolean);
  if (!lista.includes(f)) lista.unshift(f);
  const linha = (x) => {
    const miolo = `<span class="t-quando"><span class="t-hora">${escapar(C.hora(x.inicio))}</span><span class="t-mini">${escapar(C.DIAS[x.dia].curto)}</span></span>
              <span class="t-meio"><span class="t-nome">${escapar(x.nome)}</span><span class="t-info">${escapar(bairroDe(x))}</span></span>
              <span class="t-idade"><span class="t-num">${escapar(x.mediaIdade)}</span><span class="t-mini">Média</span><span class="t-origem">${escapar(curtaDe(x))}</span></span>`;
    return x === f
      ? `<button type="button" class="t-linha alvo" data-passo="1">${miolo}<span class="toque" aria-hidden="true"></span></button>`
      : `<div class="t-linha off">${miolo}</div>`;
  };
  const dia = C.DIAS[f.dia];
  const mini = [rotuloDaData(f, agora), bairroDe(f), FT.precoNaLista(f)].filter(Boolean).join(' · ');
  const tempo = [['Começa', f.inicio], ['Enche', f.esquenta], ['Acaba', f.fim]]
    .filter(([, h]) => Number.isFinite(h))
    .map(([nome, h]) => `<div><span class="t-tempo-hora">${escapar(C.hora(h))}</span><span class="t-mini">${nome}</span></div>`).join('');
  const voltar = (passo, rotulo) => `<button type="button" class="t-voltar" data-passo="${passo}" aria-label="${rotulo}"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" focusable="false"><path d="M13 8H3M7 4L3 8l4 4"/></svg></button>`;
  return `<div class="aparelho" role="group" aria-label="Demonstração do app finde, com festas fictícias">
      <div class="aparelho-tela">
        <div class="trilho-telas" id="telas">
          <div class="tela-demo" aria-label="Tela 1 de 3: a lista da semana">
            <span class="t-marca" aria-hidden="true">finde<span class="ponto">.</span></span>
            <span class="t-titulo">Esta semana</span>
            <div class="t-lista">
              ${lista.map(linha).join('\n              ')}
            </div>
            <span class="t-dica">Toque na ${escapar(f.nome)}</span>
          </div>
          <div class="tela-demo" aria-label="Tela 2 de 3: a festa">
            ${voltar(0, 'Voltar para a lista')}
            <span class="t-mini">${escapar(mini)}</span>
            <span class="t-titulo">${escapar(f.nome)}</span>
            <span class="t-info">${escapar([f.casa, f.produtora].filter(Boolean).join(' · '))}</span>
            <div class="t-tempo">${tempo}</div>
            <div class="t-media"><span class="t-media-num">${escapar(f.mediaIdade)}</span><span><strong>anos, em média</strong><small>${escapar(f.origemIdade)}</small></span></div>
            <span class="t-vao"></span>
            <button type="button" class="t-botao" data-passo="2">Chamar o grupo<span class="toque" aria-hidden="true"></span></button>
          </div>
          <div class="tela-demo" aria-label="Tela 3 de 3: o convite no grupo">
            ${voltar(1, 'Voltar para a festa')}
            <span class="t-mini">Convite enviado pro grupo</span>
            <span class="t-titulo">Bora ${dia.id === 'sex' ? 'na' : 'no'} <i>${escapar(dia.frase)}?</i></span>
            <span class="t-info">${escapar([f.nome, C.hora(f.inicio), bairroDe(f)].filter(Boolean).join(' · '))}</span>
            <ul class="t-respostas" id="respostas">
              <li><span>Você</span><span class="sim">tô dentro</span></li>
              <li><span>Ana</span><span class="sim">tô dentro</span></li>
              <li><span>Bia</span><span class="sim">tô dentro</span></li>
              <li><span>Carol</span><span class="nao">não rola</span></li>
            </ul>
            <span class="t-placar" id="placar">3 de 4 dentro</span>
            <span class="t-vao"></span>
            <a class="t-botao" href="${escapar(urlApp)}">Abrir o app</a>
          </div>
        </div>
      </div>
    </div>`;
}

// A festa do convite: a do desenho (Sexta Sem Pressa) ou, se ela sair da
// base, a primeira editorial.
function festaDoConvite(base) {
  return base.find((f) => f.id === FESTA_DO_CONVITE) || base.find((f) => f.selo === 'editorial') || null;
}

// O detalhe de uma festa sem pedido (/app?festa=<id>): o mesmo formato de
// um item de opcoes, com um pedido neutro tirado da própria festa (o dia
// dela, a janela em que ela cabe, idade de 18 a 50, sem teto). Sem a cara,
// que só existe diante de um pedido de verdade.
function opcaoSemPedido(f, agora, { misto = false } = {}) {
  const pedido = (janela) => motor.completar({ dia: f.dia, janela, idade: { min: motor.IDADE_MIN, max: motor.IDADE_MAX }, teto: 'sem-limite' });
  const opcoes = C.JANELAS.map((j) => motor.opcao(f, pedido(j.id)));
  const o = { ...(opcoes.find((x) => x.atende) || opcoes[0]) };
  delete o.cara;
  // Sem pedido, nada fura: a festa de madrugada, que não cabe em janela
  // nenhuma, também sai sem "depois da sua hora".
  const motivos = o.motivos.filter((m) => !o.fora.includes(m));
  const marca = misto ? { exemplo: !f.real } : {};
  return {
    ...o, atende: true, fora: [], incertos: [], aviso: null, motivos, bloco: 'pedido', ...marca,
    data: f.real ? f.data : (dataDaFesta(f, agora) || {}).data || null,
  };
}

function criarServidor(opcoes = {}) {
  return montarServidor({ ...opcoes, outraBase: opcoes.dados !== undefined });
}

function montarServidor({
  outraBase = false,
  dados = process.env.FINDE_DADOS || path.join(RAIZ, 'dados', 'festas.json'),
  varDir = process.env.FINDE_VAR || path.join(RAIZ, 'var'),
  // As festas reais: FINDE_REAIS, ou dados/reais.json ao lado da base. Quem
  // passa outra base (os testes) passa também as reais, ou fica sem elas.
  reais,
  log = console,
  relogio = () => Date.now(),
  site = process.env.FINDE_SITE,
  urlSite = process.env.FINDE_URL_SITE,
  urlApp = process.env.FINDE_URL_APP,
  // A base viva (U22, KTD14): o motor pela rede privada do Fly. Sem URL, as
  // reais vêm só do arquivo, como antes.
  motorUrl = process.env.FINDE_MOTOR_URL,
  fetch: buscar = globalThis.fetch,
  // Os tiles do mapa (KTD16): o <meta name="finde-tiles"> e o img-src da CSP.
  tiles = process.env.FINDE_TILES || TILES_PADRAO,
  // Tokens só por variável (KTD20): o de admin do app (/api/reais/estado) e o
  // que o app usa para mandar as avaliações ao motor.
  adminToken = process.env.FINDE_ADMIN_TOKEN,
  appToken = process.env.FINDE_APP_TOKEN,
  // As festas fictícias de exemplo (24/11/2026: o app não mostra mais). Só
  // voltam com FINDE_EXEMPLOS=1, ou nos testes que passam outra base.
  exemplos = outraBase || process.env.FINDE_EXEMPLOS === '1',
} = {}) {
  const sites = configurarSites({ site, urlSite, urlApp });
  const temLanding = sites.modo !== 'app';
  const temApp = sites.modo !== 'landing';
  const podeServir = estaticosDoModo(sites.modo);
  const enderecos = { __URL_SITE__: sites.urlSite, __URL_APP__: sites.urlApp, __TILES__: tiles };
  const CABECALHOS_APP = cabecalhosDoApp(tiles);
  // O que é do app num servidor com tudo junto (no modo app, tudo).
  const ehDoApp = (pathname) => sites.modo === 'app'
    || (temApp && (pathname === '/app' || pathname === '/app/' || /^\/(p|api|imagens)\//.test(pathname) || pathname === '/robots.txt'));
  log.info(sites.modo === 'landing' ? `[finde] só a landing; o app fica em ${sites.urlApp}`
    : sites.modo === 'app' ? `[finde] só o app; a landing fica em ${sites.urlSite}`
      : '[finde] landing em / e app em /app');
  const fonte = criarFonteDaBase(path.resolve(dados), log, relogio);
  fonte.base();
  const caminhoReais = reais !== undefined ? reais
    : process.env.FINDE_REAIS || (outraBase ? null : path.join(RAIZ, 'dados', 'reais.json'));
  const reservaReais = caminhoReais ? path.resolve(caminhoReais) : null;
  // Com o motor (e o app no ar), a base viva; a reserva é o arquivo da imagem.
  const fonteMotor = temApp && motorUrl ? criarFonteMotor({
    url: motorUrl, fetch: buscar, cache: path.join(path.resolve(varDir), 'reais-cache.json'), reserva: reservaReais, relogio, log,
  }) : null;
  const fonteReais = fonteMotor ? { festas: fonteMotor.festas, estado: fonteMotor.estado } : criarFonteDosReais(reservaReais, log);
  // A real cujo id já é de uma fictícia fica fora, com aviso: o link, o
  // convite e a lista confundiriam as duas.
  const colidiram = new Set();
  function reaisSemColisao() {
    const ids = new Set(fonte.base().map((f) => f.id));
    return fonteReais.festas().filter((f) => {
      if (!ids.has(f.id)) return true;
      if (!colidiram.has(f.id)) {
        colidiram.add(f.id);
        log.warn(`[finde] reais: fora "${f.id}" (id da base fictícia)`);
      }
      return false;
    });
  }
  reaisSemColisao();
  // As reais que não passaram, pelo relógio de agora (não o da subida).
  const reaisVigentes = () => R.vigentes(reaisSemColisao(), relogio());
  // Para achar uma festa pelo id: a base fictícia e as reais (passadas também,
  // para o convite e o link dizerem que ela passou).
  // Uma real também se acha por um id antigo (festa unida no motor, KTD1):
  // o convite e o link mandados antes da união continuam abrindo.
  const acharFesta = (id) => fonte.base().find((f) => f.id === id)
    || reaisSemColisao().find((f) => f.id === id)
    || reaisSemColisao().find((f) => Array.isArray(f.idsAntigos) && f.idsAntigos.includes(id)) || null;
  // A base de um pedido: as fictícias e as reais do dia pedido.
  const baseDoPedido = (c) => [...L.reaisDoPedido(reaisVigentes(), c, relogio()).festas, ...fonte.base()];
  // A landing sozinha não abre convite nenhum: os convites moram no app.
  // Os convites usam o mesmo relógio: "passou" é o do servidor.
  const agoraIso = () => new Date(relogio()).toISOString();
  // As avaliações pós-festa (U25): no volume, ao lado dos convites; o lote de
  // festa real vai ao motor com FINDE_APP_TOKEN.
  const avaliacoes = temApp ? criarAvaliacoes({ dir: path.resolve(varDir), motorUrl, token: appToken, fetch: buscar, agora: agoraIso, log }) : null;
  const planos = temApp ? criarPlanos(path.resolve(varDir), { log, agora: agoraIso, contarAvaliacoes: avaliacoes.contagem }) : null;
  // O que ficou pendente de outra subida vai agora, por trás.
  if (avaliacoes && motorUrl && appToken && avaliacoes.pendentes().length) avaliacoes.enviarPendentes().catch(() => {});

  // De onde vem a lista ("Atualizado há 3 h · 41 festas lidas de 50 perfis e
  // 3 sites de ingresso", R23). Sem real nenhuma, null.
  function infoDaBase() {
    const e = fonteReais.estado ? fonteReais.estado() : null;
    if (!e || !reaisSemColisao().length) return null;
    return { atualizadoEm: e.geradoEm || null, total: e.recebidas || e.total || 0, perfis: e.perfis || 0, sites: e.sites || 0 };
  }

  // O formulário com as datas, os 14 bairros e a origem da lista (U24).
  function oFormulario() {
    const agoraMs = relogio();
    const reais = reaisSemColisao();
    // Sem real nenhuma, a primeira pergunta oferece os dias da base fictícia.
    const ids = reais.length ? A.DIAS_DO_PEDIDO : ['sex', 'sab', 'dom'];
    const semanas = A.diasDoFormulario({ reais, agoraMs, ids });
    const zonas = A.bairrosDoFormulario({ reais: R.vigentes(reais, agoraMs), datas: semanas.esta.map((d) => d.data) });
    return { ...formulario(fonte.base(), reaisVigentes().length, { semanas, zonas, base: infoDaBase() }), ...(exemplos ? {} : { ficticia: false, misto: false, exemplos: false }) };
  }

  // Cada opção leva a data da festa: o detalhe abre com ela (R4). Fica aqui
  // para valer nos três caminhos da conversa.
  // Sem real nenhuma, o protótipo de antes: as fictícias, com a cara.
  // Com festa real vigente (U24, KTD15, D11), a resposta tem a forma de
  // teste/dados/resposta-festas-r14-3.json, montada por nucleo/lista.js
  // (montarResultado): até 3 reais recomendadas, as demais do dia em
  // maisDoDia, a contagem dos outros dias da semana e as fictícias só quando
  // o dia não tem real, em `exemplos`, sem %. O servidor só junta.
  function resultado(criterios) {
    const base = fonte.base();
    const agoraMs = relogio();
    const agora = new Date(agoraMs);
    // A fictícia de "hoje" leva a data da noite de hoje (antes das 6h, a da
    // véspera): é dela que o filtro abaixo tira as festas.
    const dataFicticia = (f) => (criterios.dia === 'hoje' ? L.noiteEmSaoPaulo(agoraMs) : (dataDaFesta(f, agora) || {}).data || null);
    const comData = (o) => ({ ...o, data: o.festa.real ? o.festa.data : dataFicticia(o.festa) });
    const vigentes = reaisVigentes();
    // Em "hoje", as fictícias só do dia da semana de hoje: o motor não filtra
    // por dia com "hoje" (quem chama passa só as festas da data).
    // "Hoje" é a noite de hoje (antes das 6h, a da véspera), como em lista.js.
    const ficticiasDoPedido = criterios.dia === 'hoje' ? base.filter((f) => f.dia === L.idDoDia(L.noiteEmSaoPaulo(agoraMs))) : base;
    if (!vigentes.length) {
      const vazio = { maisDoDia: [], outrosDias: [], exemplos: [], nota: null, base: null, semMedia: false };
      if (!exemplos) return { opcoes: [], afrouxou: [], ...vazio, aviso: 'Ainda não tenho festa para mostrar agora. A lista se atualiza durante o dia.' };
      if (!base.length) return { opcoes: [], afrouxou: [], ...vazio, aviso: 'A lista de festas está vazia agora. Volte daqui a pouco.' };
      const r = motor.escolher(criterios, ficticiasDoPedido);
      return { ...vazio, ...r, opcoes: r.opcoes.map(comData) };
    }
    const semana = criterios.semana === 'proxima' ? 'proxima' : 'esta';
    const daData = L.reaisDoPedido(vigentes, { ...criterios, semana }, agoraMs).festas;
    // "Hoje" é um dia da semana para o motor: o das festas de hoje.
    const diaReal = criterios.dia === 'hoje' && daData.length ? daData[0].dia : criterios.dia;
    const cReal = { ...criterios, dia: diaReal };
    const pedidoReal = motor.completar(motor.sanearCriterios(cReal));
    // A recusada de propósito (estilo, bairro, casa, "essa não") fica fora
    // até de "ver todas", como em lista.resultadoDoPedido; a esgotada não
    // disputa as 3 recomendadas e desce para o fim de maisDoDia.
    const doPedido = daData.filter((f) => !motor.barrada(f, pedidoReal));
    // O motor tira as recusadas sozinho; sem nenhuma que sobre, a fala dele
    // ("Seguem…" ou a oferta de outro dia) continua valendo.
    const naoEsgotadas = daData.filter((f) => f.esgotado !== true);
    const real = naoEsgotadas.length ? motor.escolher(cReal, naoEsgotadas) : null;
    const ficticio = exemplos && ficticiasDoPedido.length && !daData.length ? motor.escolher(criterios, ficticiasDoPedido) : null;
    const opcaoDe = (f) => ({ ...motor.opcao(f, pedidoReal), cara: caraDe(f, pedidoReal) });
    const m = L.montarResultado({
      real,
      ficticio,
      maisDoDia: doPedido.length ? A.maisDoDia({ festas: doPedido, recomendadas: real ? real.opcoes : [], opcaoDe }) : [],
      outrosDias: A.outrosDias({ reais: vigentes, dia: criterios.dia, semana, agoraMs }),
      criterios: { ...criterios, semana },
    });
    // O que a conversa ainda lê da escolha do motor (o aviso, a oferta, os blocos).
    const fonteDaLista = real || ficticio || {};
    const r = {
      afrouxou: fonteDaLista.afrouxou || [],
      atendem: fonteDaLista.atendem || 0,
      casam: fonteDaLista.casam || 0,
      noPedido: fonteDaLista.noPedido || 0,
      blocos: fonteDaLista.blocos || {},
      ...(fonteDaLista.oferta && !real ? { oferta: fonteDaLista.oferta } : {}),
      misto: true,
      ...m,
      reais: (m.opcoes || []).length,
      base: m.base || infoDaBase(),
      opcoes: (m.opcoes || []).map(comData),
      maisDoDia: (m.maisDoDia || []).map(comData),
      exemplos: (m.exemplos || []).map(comData),
    };
    // Nada no dia: a lista não está vazia (há real vigente). Se o dia tinha
    // real, foi o pedido que as tirou; se outro dia da semana tem, a nota e
    // os outros dias já apontam para lá; só sem nada na semana a frase diz isso.
    if (!r.opcoes.length && !r.exemplos.length && !r.maisDoDia.length && !r.aviso) {
      if (daData.length) r.aviso = 'As festas desse dia são as que você tirou do pedido.';
      else if (!r.outrosDias.some((d) => d.reais > 0)) r.aviso = 'Ainda não achei festa nesta semana. A lista se atualiza durante o dia.';
    }
    return r;
  }

  // A fala do Finde mais a nota da mistura (o que é real e o que é exemplo).
  // Sem real na lista, a nota vem antes ("Ainda não tenho festa real no
  // domingo."); com real, depois da fala.
  const comNota = (fala, r) => (r && r.nota && !r.reais ? [r.nota, fala] : [fala, r && r.nota]).filter(Boolean).join(' ');

  const rotas = {
    'GET /api/formulario': () => [200, oFormulario()],

    'POST /api/festas': (corpo) => {
      // A semana pode vir dentro dos critérios ou ao lado deles.
      const bruto = corpo.semana !== undefined && corpo.criterios && typeof corpo.criterios === 'object' ? { ...corpo.criterios, semana: corpo.semana } : corpo.criterios;
      const criterios = exigirCriterios(bruto);
      const r = resultado(criterios);
      if (r.oferta) criterios.oferta = r.oferta.frase;
      return [200, {
        criterios, pedido: motor.resumoDoPedido(criterios), pedidoPartes: motor.pedidoEmPartes(criterios),
        ...r, resposta: comNota(conversa.abertura(r), r),
      }];
    },

    'POST /api/conversa': (corpo) => {
      const antes = exigirCriterios(corpo.criterios);
      if (typeof corpo.texto !== 'string' || !corpo.texto.trim()) throw new ErroPlano(400, 'Escreva o que quer mudar.');
      if (corpo.texto.length > LIMITE_TEXTO) throw new ErroPlano(400, 'Frase longa demais. Tente em poucas palavras.');
      const antesIds = idsNaTela(corpo.atuais);
      const porId = new Map([...reaisSemColisao(), ...fonte.base()].map((f) => [f.id, f]));
      const naTela = antesIds.map((id) => porId.get(id)).filter(Boolean);
      const contexto = {
        ...antes,
        mostradas: antesIds,
        // Festa real sem som ou sem preço não entra nessas contas.
        estilosMostrados: naTela.map((f) => f.estilos[0]).filter(Boolean),
        precosMostrados: naTela.map((f) => f.preco).filter((p) => typeof p === 'number'),
        // "dia 5" precisa do relógio; com real na tela, o bairro citado filtra
        // (a real não tem a distância em minutos).
        agoraMs: relogio(),
        ...(naTela.some((f) => f.real) ? { comDistancia: false } : {}),
      };

      let { mudar, pedidos, duvida, diaRecusado } = entender(corpo.texto, contexto);
      // "sim" aceita a oferta da resposta anterior.
      if (pedidos.length === 1 && pedidos[0] === 'aceitar' && antes.oferta) {
        ({ mudar, pedidos, duvida, diaRecusado } = entender(antes.oferta, contexto));
      }
      const mudanca = motor.sanearCriterios(mudar);
      // Com o intervalo de idade (R20): "mais velha" e "mais nova" deslocam o
      // intervalo em cinco anos; "de 30 a 40" vira o intervalo dito; uma idade
      // solta ("gente de 40") vira a faixa fixa dela.
      if (antes.idade && (mudanca.faixa || pedidos.some((p) => p === 'mais-velho' || p === 'mais-novo'))) {
        if (pedidos.includes('mais-velho')) mudanca.idade = motor.deslocarIdade(antes.idade, +5);
        else if (pedidos.includes('mais-novo')) mudanca.idade = motor.deslocarIdade(antes.idade, -5);
        else {
          const m = corpo.texto.match(/\b(\d{2})\s*(?:a|até|ate|e|-)\s*(\d{2})\b/);
          const fx = C.FAIXAS.find((x) => x.id === mudanca.faixa);
          mudanca.idade = m ? { min: Number(m[1]), max: Number(m[2]) } : { min: fx.min, max: Math.min(fx.max, motor.IDADE_MAX) };
          Object.assign(mudanca, motor.sanearCriterios({ idade: mudanca.idade }));
        }
        delete mudanca.faixa;
      }
      const depois = motor.completar({ ...antes, ...mudanca });
      if (antes.semana && !depois.semana) depois.semana = antes.semana;
      delete depois.oferta;
      depois.firmes = conversa.firmesDe(antes, depois);
      const base = baseDoPedido(depois);
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
        oferta = { frase: nome, rotulo: `Mudar ${C.proDia(duvida.dia)}` };
      }
      if (oferta) criterios.oferta = oferta.frase;
      return [200, {
        criterios,
        pedido: motor.resumoDoPedido(criterios),
        pedidoPartes: motor.pedidoEmPartes(criterios),
        ...final,
        aviso: fala.entendeu ? final.aviso : undefined,
        oferta,
        resposta: fala.entendeu ? comNota(fala.texto, final) : fala.texto,
        entendeu: fala.entendeu,
        entraram: fala.entraram,
        sairam: fala.sairam,
      }];
    },

    'POST /api/planos': (corpo) => {
      const criterios = exigirCriterios(corpo.criterios);
      if (typeof corpo.festa !== 'string' || !FORMATO_ID_FESTA.test(corpo.festa)) throw new ErroPlano(400, 'Diga qual festa mandar.');
      const festa = acharFesta(corpo.festa);
      if (!festa) throw new ErroPlano(400, 'Essa festa não está na lista.');
      if (festa.real && R.passou(festa, relogio())) throw new ErroPlano(400, 'Essa festa já passou.');
      const plano = planos.criar({
        festa: motor.opcao(festa, criterios), pedido: motor.resumoDoPedido(criterios), autor: corpo.autor,
        // A festa real tem data; a fictícia vai para o próximo dia dela.
        quando: festa.real ? R.quandoDaReal(festa) : dataDaFesta(festa, new Date(relogio())),
      });
      return [201, { id: plano.id, url: `/p/${plano.id}`, data: plano.data }];
    },
  };

  // A imagem da prévia do link: compartilhar.png, ou o flyer da festa real do
  // convite (U24), sempre em endereço absoluto.
  const pagina = (req, res, nome, opcoes = {}) => enviarPagina(req, res, path.join(PUBLICO, nome), {
    ...opcoes,
    enderecos: { ...enderecos, __IMAGEM_COMPARTILHAR__: `${origem(req)}/compartilhar.png`, ...(opcoes.enderecos || {}) },
  });

  // A landing vem montada: o destaque do herói e as telas da demo saem daqui.
  const landing = (req, res) => pagina(req, res, 'landing.html', {
    trocas: {
      __DESTAQUE__: htmlDoDestaque(festaDoConvite(fonte.base()), new Date(relogio())),
      __DEMO__: htmlDaDemo(fonte.base(), new Date(relogio()), sites.urlApp),
      // As festas da landing são sempre fictícias; o app pode já ter festas reais.
      __NOTA_PROTOTIPO__: reaisVigentes().length ? 'Protótipo · as festas desta página são fictícias; o app já tem festas reais' : 'Protótipo · festas fictícias',
    },
    cabecalhos: REFERRER_DA_LANDING,
  });

  const naoAchei = (req, res) => enviarCorpo(req, res, 404, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  }, Buffer.from(trocarEnderecos(NAO_ACHEI, enderecos), 'utf8'));

  // Os dados da primeira tela vão junto com o HTML: uma ida e volta a menos.
  const app = (req, res) => pagina(req, res, 'index.html', { dados: oFormulario() });

  // /p/:id: 404 de verdade quando o convite não existe; quando existe, as
  // metas de compartilhamento dizem a festa.
  function paginaDoConvite(req, res, id) {
    if (!planos.existe(id)) {
      return pagina(req, res, 'plano.html', { status: 404, titulo: 'Esse convite não existe · finde.' });
    }
    const p = planos.ler(id);
    const o = p.festa;
    const f = o.festa;
    const dia = C.DIAS[f.dia];
    // A prévia do link é a primeira coisa que o grupo vê: a média vai sempre
    // com a origem (curta no título, inteira na descrição).
    const temMedia = Number.isInteger(f.mediaIdade);
    const curta = f.origemIdadeCurta || (o.origem && o.origem.curta);
    const media = temMedia ? ` · média ${f.mediaIdade}${curta ? ` (${curta})` : ''}` : '';
    // Festa fictícia: a prévia diz que é exemplo antes de tudo, porque no
    // grupo ninguém vê o rodapé do protótipo.
    const ficticia = f.real !== true;
    const titulo = `${ficticia ? 'Exemplo · ' : ''}Bora ${dia.artigo || (dia.id === 'sex' ? 'na' : 'no')} ${dia.frase}? ${f.nome}, ${o.hora}${media}`;
    // Festa real sem casa ou sem endereço: o que tem, sem "null".
    const onde = [f.casa, f.endereco && f.endereco.texto].filter(Boolean).join(', ') || 'Endereço não divulgado';
    const mediaLonga = temMedia ? ` Média de ${f.mediaIdade} anos${f.origemIdade ? `, ${f.origemIdade}` : ''}.` : '';
    const ondeFrase = ficticia ? `Festa fictícia, exemplo do protótipo. ${onde.replace(/^./, (x) => x.toLocaleUpperCase('pt-BR'))}` : onde;
    const descricao = `${ondeFrase} · ${FT.precoNaLista(f)}. ${o.horario}${mediaLonga}`;
    // Festa real com flyer: a versão 1080 na prévia do link (R35), servida
    // por /imagens/ enquanto o convite estiver vivo.
    const flyer = !ficticia && f.cartaz && typeof f.cartaz === 'object' && /^\/imagens\/[a-f0-9]{16}-1080\.webp$/.test(f.cartaz.arquivo) ? f.cartaz.arquivo : null;
    const enderecosDoConvite = flyer ? { __IMAGEM_COMPARTILHAR__: `${origem(req)}${flyer}` } : {};
    // O flyer é retrato (cerca de 1080×1350): as metas dizem o tamanho dele, ou
    // saem, para o leitor da prévia não montar o cartão paisagem e cortar.
    const lado = (v) => Number.isInteger(v) && v > 0 && v <= 4096;
    const medidas = flyer && lado(f.cartaz.largura) && lado(f.cartaz.altura) ? [f.cartaz.largura, f.cartaz.altura] : null;
    const trocas = flyer ? {
      '<meta property="og:image:width" content="1200">': medidas ? `<meta property="og:image:width" content="${medidas[0]}">` : '',
      '<meta property="og:image:height" content="630">': medidas ? `<meta property="og:image:height" content="${medidas[1]}">` : '',
    } : undefined;
    return pagina(req, res, 'plano.html', { titulo, descricao, enderecos: enderecosDoConvite, trocas });
  }

  async function api(req, res, pathname) {
    const chave = `${req.method} ${pathname}`;
    let acao = rotas[chave];
    const m = pathname.match(/^\/api\/planos\/([^/]+)(?:\/(respostas))?$/);
    const umaFesta = pathname.match(/^\/api\/festa\/([^/]+)$/);
    if (!acao && umaFesta) {
      if (req.method !== 'GET') return erro(res, 405, 'Esse caminho não aceita esse método.');
      const id = umaFesta[1];
      const festa = FORMATO_ID_FESTA.test(id) ? acharFesta(id) : null;
      if (!festa) return erro(res, 404, 'Essa festa não está na lista.');
      // Festa real que já foi: 404 que diz que passou, e o app diz isso.
      if (festa.real && R.passou(festa, relogio())) return erro(res, 404, 'Essa festa já passou.', { passou: true });
      return json(res, 200, { opcao: opcaoSemPedido(festa, new Date(relogio()), { misto: reaisVigentes().length > 0 }) });
    }
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

  // Os dados de validação (nucleo/validacao.js): cada site no próprio volume.
  const validacao = criarValidacao({ dir: path.resolve(varDir), site: temApp ? 'app' : 'landing', agora: agoraIso, log });
  // Limites por IP, largos (a sala do pitch inteira atrás do mesmo Wi-Fi
  // passa: opinião, e-mail e correção somam vários pedidos por pessoa), e por
  // pessoa (IP + aparelho ou e-mail), estreitos. Corte vai para o log.
  const DEZ_MIN = 10 * 60 * 1000;
  const limites = {
    // A sala do pitch inteira atrás do mesmo Wi-Fi: o teto por aparelho e por dia segura o abuso.
    uso: criarLimite({ max: 3000, janelaMs: 60 * 1000, agoraMs: relogio }),
    ip: criarLimite({ max: 600, janelaMs: DEZ_MIN, agoraMs: relogio }),
    pessoa: criarLimite({ max: 6, janelaMs: DEZ_MIN, agoraMs: relogio }),
  };
  let ultimoAvisoDeLimite = 0;
  const cortou = (qual) => {
    if (relogio() - ultimoAvisoDeLimite > 60 * 1000) log.warn(`[finde] validação: limite de ${qual} cortou pedidos`);
    ultimoAvisoDeLimite = relogio();
    return false;
  };
  const ipDe = (req) => String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '');
  const passa = (req, quem) => (limites.ip(ipDe(req)) || cortou('IP')) && (limites.pessoa(`${ipDe(req)}|${quem}`) || cortou('pessoa'));
  // Só a própria página posta aqui: pedido de outro site (Sec-Fetch-Site ou
  // Origin de fora) não entra, para ninguém inscrever e-mail alheio de longe.
  const deOutroSite = (req) => {
    if (req.headers['sec-fetch-site'] === 'cross-site') return true;
    const o = req.headers.origin;
    if (!o || o === 'null') return Boolean(o);
    try {
      return new URL(o).host !== req.headers.host;
    } catch {
      return true;
    }
  };
  const ehJson = (req) => /^application\/json\b/i.test(String(req.headers['content-type'] || ''));
  const adminConfere = (req) => {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/);
    if (!m || typeof adminToken !== 'string' || !adminToken) return false;
    const x = crypto.createHash('sha256').update(m[1]).digest();
    const y = crypto.createHash('sha256').update(adminToken).digest();
    return crypto.timingSafeEqual(x, y);
  };
  // O corpo do formulário comum (sem JavaScript), até 4 KB.
  const lerFormulario = (req) => new Promise((ok, falha) => {
    let t = '';
    req.setEncoding('utf8');
    req.on('data', (p) => {
      t += p;
      if (t.length > 4096) {
        req.removeAllListeners('data');
        req.resume();
        falha(new ErroPlano(413, 'O pedido veio grande demais.'));
      }
    });
    req.on('end', () => ok(t));
    req.on('error', falha);
  });
  async function rotaDaValidacao(req, res, pathname) {
    const rota = `${req.method} ${pathname}`;
    const posta = ['POST /api/uso', 'POST /api/opiniao', 'POST /api/lista'].includes(rota);
    if (posta && deOutroSite(req)) return erro(res, 403, 'Pedido de outro site.'), true;
    const formulario = rota === 'POST /api/lista' && /^application\/x-www-form-urlencoded\b/i.test(String(req.headers['content-type'] || ''));
    if (posta && !formulario && !ehJson(req)) return erro(res, 415, 'O corpo precisa ser JSON.'), true;
    if (rota === 'POST /api/uso') {
      const corpo = await lerCorpo(req);
      if (limites.uso(ipDe(req)) || cortou('uso')) validacao.evento(corpo);
      res.writeHead(204, { ...cabecalhosDe(res), 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    if (rota === 'POST /api/opiniao') {
      const corpo = await lerCorpo(req);
      if (!passa(req, `a:${corpo.aparelho}`)) return erro(res, 429, 'Muitas respostas daqui. Tente daqui a pouco.'), true;
      const r = validacao.opiniao(corpo);
      return (r.ok ? json(res, 200, { ok: true }) : erro(res, 400, r.erro)), true;
    }
    if (rota === 'POST /api/lista') {
      // Sem JavaScript, o formulário da landing posta como formulário comum:
      // grava e volta para a seção, com o resultado no endereço.
      if (formulario) {
        const campos = Object.fromEntries(new URLSearchParams(await lerFormulario(req)));
        const sair = campos.sair === '1';
        if (!passa(req, `e:${String(campos.email || '').trim().toLowerCase()}`)) return redirecionar(res, 303, '/?lista=espera#lista'), true;
        const r = validacao.inscrever({ email: campos.email, site: campos.site, sair, de: temApp ? 'app' : 'landing' });
        return redirecionar(res, 303, `/?lista=${r.ok ? (sair ? 'saiu' : 'ok') : 'erro'}#lista`), true;
      }
      const corpo = await lerCorpo(req);
      if (!passa(req, `e:${String(corpo.email || '').trim().toLowerCase()}`)) return erro(res, 429, 'Muitos pedidos daqui. Tente daqui a pouco.'), true;
      const r = validacao.inscrever(corpo);
      return (r.ok ? json(res, 200, r.saiu ? { ok: true, saiu: true } : { ok: true, ja: r.ja }) : erro(res, 400, r.erro)), true;
    }
    if (rota === 'GET /api/numeros' || rota === 'GET /api/numeros/lista.csv') {
      if (!adminConfere(req)) return erro(res, 401, 'Precisa do token de admin.'), true;
      if (pathname.endsWith('.csv')) {
        enviarCorpo(req, res, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' }, Buffer.from(validacao.listaCsv(), 'utf8'));
        return true;
      }
      return json(res, 200, validacao.numeros()), true;
    }
    if (['/api/uso', '/api/opiniao', '/api/lista', '/api/numeros', '/api/numeros/lista.csv'].includes(pathname)) {
      return erro(res, 405, 'Esse caminho não aceita esse método.'), true;
    }
    return false;
  }

  // As rotas novas do app (nucleo/rotas-app.js): estado da base, agenda,
  // avaliação e imagens.
  const rotaDoApp = temApp ? A.ligarRotasApp({
    fonteMotor,
    reais: reaisSemColisao,
    listaAtual: fonteReais.festas,
    achar: acharFesta,
    planos,
    avaliacoes,
    quando: (f) => (f.real ? { data: f.data } : dataDaFesta(f, new Date(relogio())) || {}),
    imagens: A.criarImagens({ dir: path.join(path.resolve(varDir), 'imagens'), reserva: path.join(RAIZ, 'dados', 'imagens'), motorUrl, fetch: buscar, log }),
    adminToken,
    relogio,
    log,
    origem,
    json,
    erro,
    enviarCorpo,
    lerCorpo,
  }) : null;

  return http.createServer(async (req, res) => {
    let endereco;
    try {
      endereco = new URL(req.url, 'http://finde');
    } catch {
      return erro(res, 400, 'Endereço malformado.');
    }
    const { pathname, search } = endereco;
    // O site app sai com a CSP dos tiles e sem buscador (KTD16, KTD17).
    if (ehDoApp(pathname)) res.finde = CABECALHOS_APP;
    try {
      if (temApp && fonteMotor && (pathname.startsWith('/api/') || pathname.startsWith('/p/') || pathname.startsWith('/imagens/')
        || pathname === '/app' || pathname === '/app/' || (sites.modo === 'app' && (pathname === '/' || pathname === '/index.html')))) {
        // O boot a frio espera a lista nova até 2 s; depois, a atualização
        // corre por trás quando passou a validade (KTD14).
        await fonteMotor.pronta();
        fonteMotor.atualizar().catch(() => {});
      }
      if (pathname.startsWith('/api/') && await rotaDaValidacao(req, res, pathname)) return undefined;
      if (rotaDoApp && rotaDoApp(req, res, endereco)) return undefined;
      if (pathname.startsWith('/api/')) {
        // A landing sozinha não tem API: festas, conversa e convites moram no app.
        if (!temApp) return erro(res, 404, 'Não achei esse caminho.');
        return await api(req, res, pathname);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return erro(res, 405, 'Esse caminho não aceita esse método.');
      // A raiz é a landing; no modo app, é o app.
      if (pathname === '/' || pathname === '/index.html') return temLanding ? landing(req, res) : app(req, res);
      if (pathname === '/app' || pathname === '/app/') {
        if (temApp) return app(req, res);
        // Na landing sozinha, /app leva ao app no outro endereço, com o pedido
        // junto (/app?festa=<id> abre a mesma festa).
        return redirecionar(res, 302, sites.urlApp + (search && sites.urlApp.includes('?') ? `&${search.slice(1)}` : search));
      }
      const convite = pathname.match(/^\/p\/([^/]+)\/?$/);
      if (convite) {
        if (temApp) return paginaDoConvite(req, res, convite[1]);
        // Convite mandado antes da separação: abre no app, no mesmo caminho.
        // Qualquer segmento vai (um ponto colado no fim do link, um
        // parêntese), e quem diz que o convite não existe é a página do app.
        // A origem é fixa: não vira redirecionamento para fora.
        return redirecionar(res, 301, `${new URL(sites.urlApp).origin}/p/${recodificar(convite[1])}${search}`);
      }
      if (pathname === '/fora.html' && temApp) return pagina(req, res, 'fora.html');
      // A opinião mora no app; na landing sozinha, o link leva para lá.
      if (pathname === '/opiniao' || pathname === '/opiniao/') {
        if (temApp) return pagina(req, res, 'opiniao.html', { titulo: 'Sua opinião · finde.' });
        return redirecionar(res, 302, `${new URL(sites.urlApp).origin}/opiniao${search}`);
      }
      if (temLanding && ehCaminhoDePagina(pathname)) return naoAchei(req, res);
      return estatico(req, res, pathname, podeServir);
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

module.exports = { criarServidor, proximaPista, dataDaFesta, opcaoSemPedido, trocarEnderecos };

'use strict';
// Os três jeitos de subir o servidor (FINDE_SITE): só a landing
// (finde.fly.dev), só o app (finde-app.fly.dev) e tudo junto, para
// desenvolver. Rotas, redirecionamentos, a API e os endereços nas páginas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { criarServidor, trocarEnderecos } = require('../servidor');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'publico');
const DADOS = path.join(RAIZ, 'dados', 'festas.json');
const mudo = { info() {}, warn() {}, error() {} };
const AGORA = Date.parse('2026-11-16T12:00:00-03:00');
const URL_SITE = 'https://finde.fly.dev/';
const URL_APP = 'https://finde-app.fly.dev/';
const PEDIDO = { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 };

const MODOS = {
  junto: { site: null, urlSite: null, urlApp: null },
  landing: { site: 'landing', urlSite: null, urlApp: URL_APP },
  app: { site: 'app', urlSite: URL_SITE, urlApp: null },
};
// O que cada modo põe nos marcadores das páginas.
const ENDERECOS = {
  junto: { __URL_SITE__: '/', __URL_APP__: '/app' },
  landing: { __URL_SITE__: '/', __URL_APP__: URL_APP },
  app: { __URL_SITE__: URL_SITE, __URL_APP__: '/' },
};

let pasta;
const raiz = {};
const servidores = [];

async function subir(opcoes) {
  const s = criarServidor({
    dados: DADOS, varDir: path.join(pasta, `var-${servidores.length}`), log: mudo, relogio: () => AGORA, ...opcoes,
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servidores.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-sites-'));
  for (const [modo, opcoes] of Object.entries(MODOS)) raiz[modo] = await subir(opcoes);
});

after(async () => {
  for (const s of servidores) await new Promise((r) => s.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

// Pedido cru: não segue redirecionamento nem normaliza o caminho.
function pedir(base, caminho, { metodo = 'GET', corpo } = {}) {
  const u = new URL(base);
  const headers = corpo === undefined ? {} : { 'Content-Type': 'application/json' };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: caminho, method: metodo, headers }, (res) => {
      let texto = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (texto += d));
      res.on('end', () => resolve({ status: res.statusCode, local: res.headers.location, cabecalhos: res.headers, corpo: texto }));
    });
    req.on('error', reject);
    req.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
}

const ehLanding = (html) => /<link rel="stylesheet" href="\/landing\.css">/.test(html);
const ehApp = (html) => /<script src="\/app\.js" defer><\/script>/.test(html);
function dadosIniciais(html) {
  const m = html.match(/<script type="application\/json" id="dados-iniciais">([^<]*)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

// Os arquivos de publico/ que um navegador pede direto (sem as páginas HTML).
function arquivosDePublico(dir = PUBLICO, prefixo = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? arquivosDePublico(path.join(dir, e.name), `${prefixo}/${e.name}`)
    : [`${prefixo}/${e.name}`])).filter((c) => /\.(css|js|svg|png|webp|woff2)$/.test(c)).sort();
}

// O que a landing pede: os caminhos locais de landing.html e os url() de landing.css.
function pedidosDaLanding() {
  const html = fs.readFileSync(path.join(PUBLICO, 'landing.html'), 'utf8');
  const css = fs.readFileSync(path.join(PUBLICO, 'landing.css'), 'utf8');
  const achados = [
    ...html.matchAll(/\b(?:href|src|content)="(?:__ORIGEM__)?(\/[^"?#]*)/g),
    ...css.matchAll(/url\(\s*['"]?(\/[^'")?#\s]+)/g),
  ].map((m) => m[1]).filter((c) => path.extname(c) && path.extname(c) !== '.html');
  return [...new Set(achados)].sort();
}

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Cada linha do modelo que leva um marcador de endereço (e nenhum outro
// marcador) sai com o endereço do modo, escapado; marcador nenhum sobra.
function conferirEnderecos(rotulo, arquivo, html, enderecos) {
  assert.doesNotMatch(html, /__URL_(SITE|APP)__/, rotulo);
  const modelo = fs.readFileSync(path.join(PUBLICO, arquivo), 'utf8');
  const linhas = modelo.split('\n').filter((l) => /__URL_(SITE|APP)__/.test(l)
    && !/__[A-Z]+__/.test(l.replace(/__URL_(SITE|APP)__/g, '')));
  for (const linha of linhas) {
    let esperada = linha.trim();
    for (const [marca, valor] of Object.entries(enderecos)) esperada = esperada.split(marca).join(escapar(valor));
    assert.ok(html.includes(esperada), `${rotulo}: falta ${esperada}`);
  }
  return linhas.length;
}

// ---------------------------------------------------------------- configuração

test('configuração: FINDE_SITE só aceita landing ou app, e cada um pede o endereço do outro', () => {
  const criar = (opcoes) => criarServidor({ dados: DADOS, varDir: path.join(pasta, 'var-conf'), log: mudo, ...opcoes });
  assert.throws(() => criar({ site: 'tudo' }), /FINDE_SITE/);
  // Sem o endereço do app, a landing mandaria /app para ela mesma.
  assert.throws(() => criar({ site: 'landing', urlApp: null }), /FINDE_URL_APP/);
  assert.throws(() => criar({ site: 'landing', urlApp: '/app' }), /FINDE_URL_APP/);
  assert.throws(() => criar({ site: 'app', urlSite: null }), /FINDE_URL_SITE/);
  assert.throws(() => criar({ site: 'app', urlSite: '/' }), /FINDE_URL_SITE/);
  // Endereço só como caminho deste servidor ou http(s), sem usuário e senha.
  for (const ruim of ['javascript:alert(1)', '//outro.site/', 'ftp://x/', 'app', '/a b', 'https://eu:senha@finde-app.fly.dev/']) {
    assert.throws(() => criar({ site: null, urlApp: ruim }), /FINDE_URL_APP/, ruim);
    assert.throws(() => criar({ site: null, urlSite: ruim }), /FINDE_URL_SITE/, ruim);
  }
  assert.doesNotThrow(() => criar({ site: '', urlSite: '', urlApp: '' }));
});

test('configuração: sem opção, o servidor lê FINDE_SITE, FINDE_URL_SITE e FINDE_URL_APP do ambiente', async () => {
  const antes = { ...process.env };
  process.env.FINDE_SITE = 'app';
  process.env.FINDE_URL_SITE = URL_SITE;
  delete process.env.FINDE_URL_APP;
  let base;
  try {
    base = await subir({ site: undefined, urlSite: undefined, urlApp: undefined });
  } finally {
    for (const k of ['FINDE_SITE', 'FINDE_URL_SITE', 'FINDE_URL_APP']) {
      if (k in antes) process.env[k] = antes[k];
      else delete process.env[k];
    }
  }
  const r = await pedir(base, '/');
  assert.equal(r.status, 200);
  assert.ok(ehApp(r.corpo), 'no modo app, a raiz é o app');
  conferirEnderecos('ambiente', 'index.html', r.corpo, ENDERECOS.app);
  assert.equal((await pedir(base, '/landing.css')).status, 404);
});

test('fly.toml é a landing e fly.app.toml é o app: cada um aponta para o outro', () => {
  const ler = (nome) => fs.readFileSync(path.join(RAIZ, nome), 'utf8');
  const valor = (toml, chave) => (toml.match(new RegExp(`^\\s*${chave}\\s*=\\s*"([^"]*)"`, 'm')) || [])[1];
  const landing = ler('fly.toml');
  const app = ler('fly.app.toml');
  assert.equal(valor(landing, 'app'), 'finde');
  assert.equal(valor(app, 'app'), 'finde-app');
  assert.equal(valor(landing, 'FINDE_SITE'), 'landing');
  assert.equal(valor(app, 'FINDE_SITE'), 'app');
  assert.equal(valor(landing, 'FINDE_URL_APP'), `https://${valor(app, 'app')}.fly.dev/`);
  assert.equal(valor(app, 'FINDE_URL_SITE'), `https://${valor(landing, 'app')}.fly.dev/`);
  assert.match(app, /fly deploy -c fly\.app\.toml/);
  for (const [nome, toml] of [['fly.toml', landing], ['fly.app.toml', app]]) {
    assert.equal(valor(toml, 'primary_region'), 'gru', nome);
    assert.match(toml, /\[mounts\]\s*\n\s*source = "finde_convites"\s*\n\s*destination = "\/data"/, nome);
    assert.equal(valor(toml, 'size'), 'shared-cpu-1x', nome);
    assert.equal(valor(toml, 'memory'), '256mb', nome);
    assert.equal(valor(toml, 'auto_stop_machines'), 'stop', nome);
    assert.match(toml, /min_machines_running = 0/, nome);
    assert.equal(valor(toml, 'path'), '/', nome);
    // O que está no toml sobe sem erro.
    assert.doesNotThrow(() => criarServidor({
      dados: DADOS, varDir: path.join(pasta, 'var-toml'), log: mudo,
      site: valor(toml, 'FINDE_SITE'), urlSite: valor(toml, 'FINDE_URL_SITE'), urlApp: valor(toml, 'FINDE_URL_APP'),
    }), nome);
  }
});

// ---------------------------------------------------------------- só a landing

test('landing: / e /index.html servem a landing, com o convite do herói', async () => {
  const r = await pedir(raiz.landing, '/');
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos['content-type'], /text\/html/);
  assert.ok(ehLanding(r.corpo));
  assert.match(r.corpo, /<figure class="convite"/);
  assert.equal((await pedir(raiz.landing, '/index.html')).corpo, r.corpo);
  assert.equal((await pedir(raiz.landing, '/', { metodo: 'HEAD' })).status, 200);
});

test('landing: serve o que a landing pede e mais nada de publico/', async () => {
  const pedidos = pedidosDaLanding();
  assert.ok(pedidos.includes('/landing.css'), pedidos.join(', '));
  for (const c of arquivosDePublico()) {
    const r = await pedir(raiz.landing, c, { metodo: 'HEAD' });
    assert.equal(r.status, pedidos.includes(c) ? 200 : 404, c);
  }
  // O que a landing pede existe de verdade.
  for (const c of pedidos) assert.equal((await pedir(raiz.landing, c, { metodo: 'HEAD' })).status, 200, c);
  for (const c of ['/fora.html', '/plano.html', '/landing.html', '/servidor.js', '/dados/festas.json', '/app/x', '/p']) {
    assert.equal((await pedir(raiz.landing, c)).status, 404, c);
  }
});

test('landing: /app vai para o app com 302, levando a query string', async () => {
  for (const [caminho, destino] of [
    ['/app', URL_APP],
    ['/app/', URL_APP],
    ['/app?festa=sexta-sem-pressa', `${URL_APP}?festa=sexta-sem-pressa`],
    ['/app/?ver=lista&x=um%20dois', `${URL_APP}?ver=lista&x=um%20dois`],
  ]) {
    const r = await pedir(raiz.landing, caminho);
    assert.equal(r.status, 302, caminho);
    assert.equal(r.local, destino, caminho);
    assert.equal(r.corpo, '', caminho);
    assert.equal(r.cabecalhos['cache-control'], 'no-cache', caminho);
  }
  assert.equal((await pedir(raiz.landing, '/app', { metodo: 'HEAD' })).status, 302);
  assert.equal((await pedir(raiz.landing, '/app', { metodo: 'POST', corpo: {} })).status, 405);
});

test('landing: convite antigo (/p/<id>) vai para o app com 301, no mesmo caminho', async () => {
  for (const [caminho, destino] of [
    ['/p/abcd1234', 'https://finde-app.fly.dev/p/abcd1234'],
    ['/p/abcd1234/', 'https://finde-app.fly.dev/p/abcd1234'],
    ['/p/abcd1234?de=whatsapp', 'https://finde-app.fly.dev/p/abcd1234?de=whatsapp'],
  ]) {
    const r = await pedir(raiz.landing, caminho);
    assert.equal(r.status, 301, caminho);
    assert.equal(r.local, destino, caminho);
  }
  // Link torto também vai: um ponto ou parêntese colado no fim, id longo,
  // caractere codificado. O segmento vai recodificado e nunca abre barra,
  // "?" nem "#"; o destino é sempre a origem do app.
  for (const [caminho, destino] of [
    ['/p/abcd1234.', '/p/abcd1234.'],
    ['/p/abcd1234)', '/p/abcd1234)'],
    ['/p/a.b', '/p/a.b'],
    ['/p/%3Cx%3E', '/p/%3Cx%3E'],
    ['/p/a%2F..%2F..%2Fapi', '/p/a%2F..%2F..%2Fapi'],
    ['/p/a%3Fb%23c', '/p/a%3Fb%23c'],
    ['/p/%E0%A4%A', '/p/%25E0%25A4%25A'],
    ['/p/' + 'x'.repeat(65), '/p/' + 'x'.repeat(65)],
  ]) {
    const r = await pedir(raiz.landing, caminho);
    assert.equal(r.status, 301, caminho);
    assert.equal(r.local, `https://finde-app.fly.dev${destino}`, caminho);
    assert.equal(new URL(r.local).origin, 'https://finde-app.fly.dev', caminho);
  }
});

test('landing: link de convite torto chega ao app, que desenha o 404 do convite em HTML', async () => {
  const app = await subir({ site: 'app', urlSite: URL_SITE });
  const landing = await subir({ site: 'landing', urlApp: `${app}/` });
  for (const caminho of ['/p/abcd1234.', '/p/abcd1234)', '/p/%3Cx%3E']) {
    const ida = await pedir(landing, caminho);
    assert.equal(ida.status, 301, caminho);
    const u = new URL(ida.local);
    assert.equal(u.origin, app, caminho);
    const volta = await pedir(app, u.pathname + u.search);
    assert.equal(volta.status, 404, caminho);
    assert.match(volta.cabecalhos['content-type'], /text\/html/, caminho);
    assert.match(volta.corpo, /<title>Esse convite não existe · finde\.<\/title>/, caminho);
    assert.match(volta.corpo, /<script src="\/plano\.js" defer><\/script>/, caminho);
  }
});

test('landing e tudo junto: caminho de página que não existe dá 404 em HTML, com o app e o início à mão', async () => {
  const casos = [
    ['landing', ['/festas', '/fora.html', '/plano.html', '/landing.html', '/app/x', '/p', '/p/', '/p/a/b', '/x.html', '/%00']],
    ['junto', ['/festas', '/plano.html', '/landing.html', '/app/x', '/p', '/p/a/b']],
  ];
  for (const [modo, caminhos] of casos) {
    for (const c of caminhos) {
      const r = await pedir(raiz[modo], c);
      const rotulo = `${modo} ${c}`;
      assert.equal(r.status, 404, rotulo);
      assert.match(r.cabecalhos['content-type'], /^text\/html/, rotulo);
      assert.equal(r.cabecalhos['content-security-policy'].includes("script-src 'self'"), true, rotulo);
      assert.match(r.corpo, /<h1 id="nao-achei-titulo">Não achei essa página<\/h1>/, rotulo);
      assert.match(r.corpo, /<meta name="robots" content="noindex">/, rotulo);
      // O D leva ao app; o wordmark e o C, ao início. Nada de script.
      assert.match(r.corpo, new RegExp(`<a class="botao" href="${escapar(ENDERECOS[modo].__URL_APP__)}">Achar a minha festa</a>`), rotulo);
      assert.match(r.corpo, new RegExp(`<a class="marca" href="${escapar(ENDERECOS[modo].__URL_SITE__)}"`), rotulo);
      assert.match(r.corpo, new RegExp(`<a class="link-fio" href="${escapar(ENDERECOS[modo].__URL_SITE__)}">ou volte para o início`), rotulo);
      assert.doesNotMatch(r.corpo, /<script\b|style=|__[A-Z_]+__/, rotulo);
      assert.ok(!ehApp(r.corpo), rotulo);
      // A página só pede o que o modo serve.
      for (const pedido of [...r.corpo.matchAll(/\b(?:href|src)="(\/[^"#?]+\.[a-z0-9]+)"/g)].map((m) => m[1])) {
        assert.equal((await pedir(raiz[modo], pedido, { metodo: 'HEAD' })).status, 200, `${rotulo} pede ${pedido}`);
      }
    }
    assert.equal((await pedir(raiz[modo], '/festas', { metodo: 'HEAD' })).status, 404, modo);
    // Arquivo que falta continua com o 404 curto.
    for (const c of ['/nada.css', '/fontes/nada.woff2', '/servidor.js', '/dados/festas.json']) {
      const r = await pedir(raiz[modo], c);
      assert.equal(r.status, 404, `${modo} ${c}`);
      assert.match(r.cabecalhos['content-type'], /application\/json/, `${modo} ${c}`);
    }
  }
  // No app sozinho, a landing não existe: nada de landing.css num 404.
  const r = await pedir(raiz.app, '/festas');
  assert.equal(r.status, 404);
  assert.doesNotMatch(r.corpo, /landing\.css/);
});

test('referrer: só a página da landing manda a própria origem para o app; o redirecionamento não mexe na política', async () => {
  const politica = async (base, caminho) => (await pedir(base, caminho)).cabecalhos['referrer-policy'];
  for (const modo of ['landing', 'junto']) {
    assert.equal(await politica(raiz[modo], '/'), 'strict-origin-when-cross-origin', `${modo} /`);
    assert.equal(await politica(raiz[modo], '/index.html'), 'strict-origin-when-cross-origin', `${modo} /index.html`);
    // O 404 não: um referrer com a origem da landing tem de querer dizer a landing.
    assert.equal(await politica(raiz[modo], '/festas'), 'same-origin', `${modo} 404`);
    assert.equal(await politica(raiz[modo], '/landing.css'), 'same-origin', `${modo} css`);
  }
  for (const [modo, caminho] of [['junto', '/app'], ['junto', '/fora.html'], ['junto', '/p/naoexiste'], ['app', '/'], ['app', '/app'],
    ['app', '/fora.html'], ['app', '/p/naoexiste'], ['app', '/api/formulario']]) {
    assert.equal(await politica(raiz[modo], caminho), 'same-origin', `${modo} ${caminho}`);
  }
  // No 302 e no 301, a política de quem pediu continua valendo: o
  // /app?festa=<id> tocado na landing chega ao app com a origem dela.
  for (const caminho of ['/app', '/app?festa=sexta-sem-pressa', '/p/abcd1234']) {
    const r = await pedir(raiz.landing, caminho);
    assert.ok([301, 302].includes(r.status), caminho);
    assert.equal(r.cabecalhos['referrer-policy'], undefined, caminho);
    assert.ok(r.cabecalhos['content-security-policy'], caminho);
  }
});

test('landing: a API não existe aqui (404), nem para ler nem para gravar', async () => {
  for (const [metodo, caminho, corpo] of [
    ['GET', '/api/formulario'],
    ['GET', '/api/festa/sexta-sem-pressa'],
    ['POST', '/api/festas', { criterios: PEDIDO }],
    ['POST', '/api/conversa', { criterios: PEDIDO, texto: 'mais cedo' }],
    ['POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove' }],
    ['GET', '/api/planos/abcd1234'],
  ]) {
    const r = await pedir(raiz.landing, caminho, { metodo, corpo });
    assert.equal(r.status, 404, `${metodo} ${caminho}`);
    assert.ok(JSON.parse(r.corpo).erro, caminho);
  }
});

test('landing: nada do app vaza (página, dados, scripts)', async () => {
  for (const c of ['/', '/index.html', '/app', '/app?festa=sexta-sem-pressa', '/fora.html', '/p/abcd1234']) {
    const r = await pedir(raiz.landing, c);
    assert.ok(!ehApp(r.corpo), c);
    assert.equal(dadosIniciais(r.corpo), null, c);
    assert.doesNotMatch(r.corpo, /plano\.js|fora\.js|comum\.js/, c);
  }
});

// ---------------------------------------------------------------- só o app

test('app: /, /index.html e /app (com ou sem barra, com query) servem o app com os dados da primeira tela', async () => {
  for (const c of ['/', '/index.html', '/app', '/app/', '/app?festa=sexta-sem-pressa', '/?ver=lista']) {
    const r = await pedir(raiz.app, c);
    assert.equal(r.status, 200, c);
    assert.ok(ehApp(r.corpo), c);
    assert.equal(dadosIniciais(r.corpo).total, 37, c);
  }
  assert.equal((await pedir(raiz.app, '/', { metodo: 'HEAD' })).status, 200);
});

test('app: a API, o detalhe sem pedido e os convites continuam', async () => {
  assert.equal((await pedir(raiz.app, '/api/formulario')).status, 200);
  const festa = await pedir(raiz.app, '/api/festa/sexta-sem-pressa');
  assert.equal(festa.status, 200);
  assert.equal(JSON.parse(festa.corpo).opcao.festa.id, 'sexta-sem-pressa');
  const lista = await pedir(raiz.app, '/api/festas', { metodo: 'POST', corpo: { criterios: PEDIDO } });
  assert.equal(lista.status, 200);
  const criado = await pedir(raiz.app, '/api/planos', { metodo: 'POST', corpo: { criterios: PEDIDO, festa: 'sabado-groove' } });
  assert.equal(criado.status, 201);
  const { url } = JSON.parse(criado.corpo);
  const convite = await pedir(raiz.app, url);
  assert.equal(convite.status, 200);
  assert.match(convite.corpo, /<script src="\/plano\.js" defer><\/script>/);
  assert.match(convite.corpo, /<meta property="og:title" content="Exemplo · Bora no sábado\? Sábado Groove/);
  conferirEnderecos('app /p/<id>', 'plano.html', convite.corpo, ENDERECOS.app);
  assert.equal((await pedir(raiz.app, '/p/naoexiste')).status, 404);
  const fora = await pedir(raiz.app, '/fora.html?servico=Instagram&para=https%3A%2F%2Fwww.instagram.com%2Fx%2F');
  assert.equal(fora.status, 200);
  assert.match(fora.corpo, /<script src="\/fora\.js" defer><\/script>/);
});

test('app: serve os estáticos do app e nenhum landing.*', async () => {
  for (const c of arquivosDePublico()) {
    const r = await pedir(raiz.app, c, { metodo: 'HEAD' });
    assert.equal(r.status, /^\/landing\./.test(c) ? 404 : 200, c);
  }
  for (const c of ['/landing.html', '/landing.css', '/landing.js', '/LANDING.CSS', '/plano.html', '/servidor.js']) {
    assert.equal((await pedir(raiz.app, c)).status, 404, c);
  }
});

test('app: a landing não vaza (nem a página, nem o convite do herói)', async () => {
  for (const c of ['/', '/index.html', '/app', '/landing.html']) {
    const r = await pedir(raiz.app, c);
    assert.ok(!ehLanding(r.corpo), c);
    assert.doesNotMatch(r.corpo, /<figure class="convite"|__CONVITE__|landing\.js/, c);
  }
});

// ---------------------------------------------------------------- tudo junto

test('tudo junto: landing em /, app em /app, API, convites e estáticos dos dois', async () => {
  const inicio = await pedir(raiz.junto, '/');
  assert.equal(inicio.status, 200);
  assert.ok(ehLanding(inicio.corpo));
  assert.equal((await pedir(raiz.junto, '/index.html')).corpo, inicio.corpo);
  for (const c of ['/app', '/app/', '/app?festa=sexta-sem-pressa']) {
    const r = await pedir(raiz.junto, c);
    assert.equal(r.status, 200, c);
    assert.ok(ehApp(r.corpo), c);
  }
  assert.equal((await pedir(raiz.junto, '/api/festa/sexta-sem-pressa')).status, 200);
  assert.equal((await pedir(raiz.junto, '/api/formulario')).status, 200);
  assert.equal((await pedir(raiz.junto, '/fora.html')).status, 200);
  for (const c of arquivosDePublico()) assert.equal((await pedir(raiz.junto, c, { metodo: 'HEAD' })).status, 200, c);
  // HTML só pelas rotas: o modelo cru, com os marcadores, nunca sai.
  for (const c of ['/landing.html', '/plano.html']) assert.equal((await pedir(raiz.junto, c)).status, 404, c);
});

// ---------------------------------------------------------------- endereços nas páginas

test('as páginas saem com __URL_SITE__ e __URL_APP__ trocados pelos endereços do modo', async () => {
  const paginas = {
    junto: [['/', 'landing.html'], ['/app', 'index.html'], ['/fora.html', 'fora.html'], ['/p/naoexiste', 'plano.html']],
    landing: [['/', 'landing.html']],
    app: [['/', 'index.html'], ['/app', 'index.html'], ['/fora.html', 'fora.html'], ['/p/naoexiste', 'plano.html']],
  };
  for (const [modo, lista] of Object.entries(paginas)) {
    for (const [caminho, arquivo] of lista) {
      const r = await pedir(raiz[modo], caminho);
      assert.match(r.cabecalhos['content-type'], /text\/html/, `${modo} ${caminho}`);
      conferirEnderecos(`${modo} ${caminho}`, arquivo, r.corpo, ENDERECOS[modo]);
    }
  }
});

test('endereços com & e aspas saem escapados, e o 302 junta a query do endereço com a do pedido', async () => {
  assert.equal(
    trocarEnderecos('<a href="__URL_APP__">x</a><meta content="__URL_SITE__"> __URL_APP__', {
      __URL_SITE__: '/"><script>alert(1)</script>', __URL_APP__: "/app?de=landing&x='1'",
    }),
    '<a href="/app?de=landing&amp;x=&#39;1&#39;">x</a><meta content="/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"> /app?de=landing&amp;x=&#39;1&#39;',
  );
  // "$&" no endereço não vira padrão de substituição.
  assert.equal(trocarEnderecos('__URL_APP__', { __URL_APP__: '/a$&b' }), '/a$&amp;b');

  const comQuery = 'https://finde-app.fly.dev/?de=landing&x=1';
  const base = await subir({ site: 'landing', urlApp: comQuery });
  const r = await pedir(base, '/app?festa=sexta-sem-pressa');
  assert.equal(r.status, 302);
  assert.equal(r.local, `${comQuery}&festa=sexta-sem-pressa`);
  assert.equal((await pedir(base, '/p/abcd1234')).local, 'https://finde-app.fly.dev/p/abcd1234');
  const inicio = await pedir(base, '/');
  conferirEnderecos('landing com query', 'landing.html', inicio.corpo, { __URL_SITE__: '/', __URL_APP__: comQuery });
  assert.doesNotMatch(inicio.corpo, /\?de=landing&x=1/);

  const estranho = { site: null, urlSite: '/?a=1&b="2"', urlApp: "/app?de=x&y='z'<w>" };
  const outra = await subir(estranho);
  for (const [caminho, arquivo] of [['/', 'landing.html'], ['/app', 'index.html'], ['/fora.html', 'fora.html']]) {
    const p = await pedir(outra, caminho);
    conferirEnderecos(`estranho ${caminho}`, arquivo, p.corpo, { __URL_SITE__: estranho.urlSite, __URL_APP__: estranho.urlApp });
    assert.doesNotMatch(p.corpo, /b="2"|'z'<w>/, caminho);
  }
});

test('o convite do herói é ilustração: nada nele é link nem botão', async () => {
  const { corpo } = await pedir(raiz.landing, '/');
  const convite = corpo.slice(corpo.indexOf('<figure class="convite"'), corpo.indexOf('</figure>') + 9);
  assert.match(convite, /<span class="cv-nome">Sexta Sem Pressa<\/span>/);
  assert.match(convite, /Convite · sex, 20 nov/);
  assert.doesNotMatch(convite, /<a\b|<button\b|href=|tabindex=/);
  // "Tô dentro" e "Não rola" têm cara de botão, ficam fora da leitura um a um,
  // e o par tem um nome só.
  const par = convite.match(/<div class="cv cv-botoes" role="img" aria-label="([^"]+)">([\s\S]*?)<\/div>/);
  assert.ok(par, 'o par de respostas tem nome');
  assert.match(par[1], /Tô dentro ou Não rola/);
  assert.match(par[2], /<span class="cv-botao" aria-hidden="true">Tô dentro<\/span>/);
  assert.match(par[2], /<span class="cv-botao cv-botao--vazado" aria-hidden="true">Não rola<\/span>/);
  // Quem olha a tela lê que é exemplo e que a festa é fictícia; o leitor de
  // tela ouve isso uma vez, pela figcaption.
  assert.match(convite, /<p class="cv-legenda rotulo" aria-hidden="true">Exemplo de convite · festa fictícia<\/p>\s*<\/figure>$/);
  assert.match(convite, /<figcaption id="convite-legenda" class="vh">Exemplo de convite do finde, com uma festa fictícia<\/figcaption>/);
});

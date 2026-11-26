'use strict';
// A captura no cliente (publico/medir.js, com app.js e plano.js): cada passo
// vai com o detalhe certo (p), robô não conta, a equipe se marca e a origem
// sai do endereço. O medir.js roda num DOM de mentira; o app e o convite são
// conferidos pela forma do código, como em movimento-app.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ler = (nome) => fs.readFileSync(path.join(__dirname, '..', 'publico', nome), 'utf8');
const MEDIR = ler('medir.js');
const APP = ler('app.js');
const PLANO = ler('plano.js');

// Um navegador mínimo: o que o medir.js toca, e nada mais.
function abrir({ pagina = 'app', url = 'https://finde-app.fly.dev/', guardado = {}, robo = false, ua = 'Mozilla/5.0 (iPhone)', links = [] } = {}) {
  const enviados = [];
  const ouvintes = {};
  const memoria = new Map(Object.entries(guardado));
  let endereco = new URL(url);
  class Element {}
  class A extends Element {
    constructor({ href, id = '', classes = [], texto = '', dentroDe = [] }) {
      super();
      Object.assign(this, { id, textContent: texto, atributos: { href } });
      this.classList = { contains: (c) => classes.includes(c) };
      this.dentroDe = dentroDe;
    }
    get href() { return new URL(this.atributos.href, endereco.href).href; }
    getAttribute(n) { return this.atributos[n]; }
    setAttribute(n, v) { this.atributos[n] = v; }
    closest(sel) {
      if (sel === 'a[href]') return this;
      return this.dentroDe.includes(sel) ? {} : null;
    }
  }
  const anchors = links.map((l) => new A(l));
  const body = { dataset: {} };
  const document = {
    currentScript: { dataset: { pagina } },
    readyState: 'complete',
    body,
    addEventListener: (tipo, f) => { (ouvintes[tipo] ||= []).push(f); },
    dispatchEvent: (e) => { for (const f of ouvintes[e.type] || []) f(e); },
    querySelectorAll: () => anchors,
  };
  const ctx = {
    console, URL, URLSearchParams, TextEncoder, Blob, JSON,
    crypto: globalThis.crypto,
    Element,
    CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    document,
    navigator: {
      webdriver: robo,
      userAgent: ua,
      sendBeacon: (_u, blob) => { enviados.push(blob); return true; },
    },
    localStorage: {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => { memoria.set(k, String(v)); },
    },
    history: { state: null, replaceState: (_s, _t, novo) => { endereco = new URL(novo, endereco.href); } },
    fetch: () => Promise.resolve(),
  };
  Object.defineProperty(ctx, 'location', { get: () => endereco });
  ctx.window = ctx;
  vm.runInNewContext(MEDIR, ctx);
  return {
    ctx, memoria, body, anchors, document,
    get endereco() { return endereco.href; },
    async eventos() {
      return Promise.all(enviados.map(async (b) => {
        const { evento, p } = JSON.parse(await b.text());
        return p === undefined ? [evento] : [evento, p];
      }));
    },
    clicar(a) { for (const f of ouvintes.click || []) f({ target: a }); },
  };
}

test('contar leva o detalhe só quando ele tem a forma curta', async () => {
  const n = abrir({ pagina: null });
  n.ctx.FindeMedir.contar('filtro', 'som');
  n.ctx.FindeMedir.contar('detalhe', 'sexta-sem-pressa:2026-11-27');
  n.ctx.FindeMedir.contar('detalhe', 'alguem@exemplo.com');
  n.ctx.FindeMedir.contar('detalhe', 'um texto livre');
  n.ctx.FindeMedir.contar('lista');
  assert.deepEqual(await n.eventos(), [['filtro', 'som'], ['detalhe', 'sexta-sem-pressa:2026-11-27'], ['detalhe'], ['detalhe'], ['lista']]);
  assert.equal(typeof n.ctx.FindeMedir.aparelho, 'function', 'o opiniao.js usa o aparelho');
});

test('robô não conta nada: webdriver ou UA de robô', async () => {
  for (const caso of [{ robo: true }, { ua: 'Mozilla/5.0 HeadlessChrome/140' }, { ua: 'WhatsApp/2 preview' }, { ua: 'Googlebot/2.1' }, { ua: 'Chrome-Lighthouse' }]) {
    const n = abrir({ ...caso, url: 'https://finde-app.fly.dev/?de=qr' });
    n.ctx.FindeMedir.contar('lista');
    assert.deepEqual(await n.eventos(), [], JSON.stringify(caso));
  }
});

test('?equipe=1 marca o aparelho, avisa uma vez e sai do endereço', async () => {
  const n = abrir({ url: 'https://finde-app.fly.dev/?equipe=1&festa=x' });
  assert.equal(n.memoria.get('finde.equipe'), '1');
  assert.deepEqual(await n.eventos(), [['equipe'], ['abriu-app']]);
  assert.equal(n.endereco, 'https://finde-app.fly.dev/?festa=x');
  const de2 = abrir({ url: 'https://finde-app.fly.dev/?equipe=1', guardado: { 'finde.equipe': '1' } });
  assert.deepEqual(await de2.eventos(), [['abriu-app']]);
});

test('?de= conta a chegada com a origem e sai do endereço; qr conta também chegou-qr', async () => {
  const qr = abrir({ url: 'https://finde-app.fly.dev/?de=qr&ver=lista' });
  assert.deepEqual(await qr.eventos(), [['abriu-app'], ['chegou', 'qr'], ['chegou-qr']]);
  assert.equal(qr.endereco, 'https://finde-app.fly.dev/?ver=lista');
  // A origem fica para o app.js, que roda depois e começa o QR pelas perguntas.
  assert.equal(qr.ctx.FindeMedir.chegouDe, 'qr');
  for (const de of ['landing', 'insta', 'zap', 'mbm', 'cartaz', 'convite']) {
    const n = abrir({ url: `https://finde-app.fly.dev/?de=${de}` });
    assert.deepEqual(await n.eventos(), [['abriu-app'], ['chegou', de]]);
    assert.equal(n.endereco, 'https://finde-app.fly.dev/');
  }
  const lixo = abrir({ url: 'https://finde-app.fly.dev/?de=outra' });
  assert.deepEqual(await lixo.eventos(), [['abriu-app']]);
  assert.equal(lixo.endereco, 'https://finde-app.fly.dev/');
  // Fora do app (o /opiniao lê o próprio ?de), a marca fica.
  const op = abrir({ pagina: 'opiniao', url: 'https://finde-app.fly.dev/opiniao?de=app' });
  assert.deepEqual(await op.eventos(), [['abriu-opiniao']]);
  assert.equal(op.endereco, 'https://finde-app.fly.dev/opiniao?de=app');
});

test('convite: só conta quando existe, sem o id do convite, e nunca para quem criou', async () => {
  const url = 'https://finde-app.fly.dev/p/ab12cd34';
  const naoExiste = abrir({ pagina: 'convite', url });
  assert.deepEqual(await naoExiste.eventos(), [], 'a página 404 também é o plano.html');
  const n = abrir({ pagina: 'convite', url, guardado: { 'finde.meus': '{"outro":"Ana"}' } });
  n.document.dispatchEvent(new n.ctx.CustomEvent('finde:convite', { detail: { festa: 'sexta-sem-pressa' } }));
  n.document.dispatchEvent(new n.ctx.CustomEvent('finde:convite', { detail: { festa: 'sexta-sem-pressa' } }));
  assert.deepEqual(await n.eventos(), [['abriu-convite']]);
  assert.equal(n.body.dataset.festa, 'sexta-sem-pressa');
  const criador = abrir({ pagina: 'convite', url, guardado: { 'finde.meus': '{"ab12cd34":""}' } });
  criador.document.dispatchEvent(new criador.ctx.CustomEvent('finde:convite', { detail: { festa: '' } }));
  assert.deepEqual(await criador.eventos(), []);
});

test('links: ingresso por festa, convite-ingresso no convite, WhatsApp do convite separado do compartilhar', async () => {
  const links = [
    { href: 'https://shotgun.live/x', classes: ['barra-comprar'] },
    { href: 'https://wa.me/?text=oi', id: 'mandar-zap' },
    { href: 'https://wa.me/?text=oi' },
    { href: 'https://instagram.com/casa' },
    { href: '/api/festa/x/agenda.ics' },
  ];
  const app = abrir({ pagina: 'app', links });
  app.body.dataset.festa = 'sexta-sem-pressa';
  for (const a of app.anchors) app.clicar(a);
  assert.deepEqual((await app.eventos()).slice(1), [
    ['ingresso', 'sexta-sem-pressa'], ['whatsapp'], ['compartilhou', 'zap'], ['link-fora', 'sexta-sem-pressa'],
  ]);
  const conv = abrir({ pagina: 'convite', url: 'https://finde-app.fly.dev/p/ab12cd34', links });
  conv.document.dispatchEvent(new conv.ctx.CustomEvent('finde:convite', { detail: { festa: 'sexta-sem-pressa' } }));
  conv.clicar(conv.anchors[0]);
  assert.deepEqual(await conv.eventos(), [['abriu-convite'], ['convite-ingresso', 'sexta-sem-pressa']]);
  // Festa de exemplo (sem data-festa no body): o ingresso vai sem id.
  const ex = abrir({ pagina: 'app', links });
  ex.clicar(ex.anchors[0]);
  assert.deepEqual((await ex.eventos()).slice(1), [['ingresso']]);
});

test('landing: os links do app ganham ?de=landing (e ?equipe=1 da equipe), mesmo com ? no endereço', async () => {
  const links = [
    { href: 'https://finde-app.fly.dev/' },
    { href: 'https://finde-app.fly.dev/?x=1' },
    { href: '/app' },
    { href: 'https://instagram.com/finde' },
  ];
  const n = abrir({ pagina: 'landing', url: 'https://finde.fly.dev/', links });
  assert.deepEqual(n.anchors.map((a) => a.getAttribute('href')), [
    'https://finde-app.fly.dev/?de=landing', 'https://finde-app.fly.dev/?x=1&de=landing', '/app?de=landing', 'https://instagram.com/finde',
  ]);
  n.clicar(n.anchors[0]);
  n.clicar(n.anchors[3]);
  assert.deepEqual(await n.eventos(), [['abriu-landing'], ['landing-app']]);
  const eq = abrir({ pagina: 'landing', url: 'https://finde.fly.dev/', links: [{ href: 'https://finde-app.fly.dev/' }], guardado: { 'finde.equipe': '1' } });
  assert.equal(eq.anchors[0].getAttribute('href'), 'https://finde-app.fly.dev/?de=landing&equipe=1');
});

// ------------------------------------------------------------ app e convite, pela forma do código

const trecho = (fonte, de, ate) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, `falta ${de}`);
  return fonte.slice(i, ate ? fonte.indexOf(ate, i + de.length) : i + 2000);
};

test('app: detalhe, mandar e convite levam o id; a festa real marca o body', () => {
  assert.match(APP, /const contar = \(evento, p\) => \{ if \(window\.FindeMedir\) window\.FindeMedir\.contar\(evento, p\); \};/);
  assert.match(trecho(APP, 'function abrirFesta', 'function '), /contar\('detalhe', idReal\(o\.festa\)\)/);
  assert.match(trecho(APP, 'async function abrirAvulsa', 'function '), /contar\('detalhe', idReal\(o\.festa\)\)/);
  assert.doesNotMatch(APP, /contar\('detalhe'\)/);
  assert.match(trecho(APP, 'function barraDaFesta', 'function '), /contar\('mandar', idReal\(f\)\)/);
  assert.match(APP, /guardar\(autor, r\.dados\.id\);\s*contar\('convite'\);/);
  assert.match(trecho(APP, 'function desenharJa', 'function '), /document\.body\.dataset\.festa = festaReal;\s*else delete document\.body\.dataset\.festa;/);
  // O id do convite criado fica sempre em finde.meus, com nome ou sem.
  assert.match(trecho(APP, 'function guardar(nome, id)', 'function '), /if \(id\) meus\[id\] = nome \|\| meus\[id\] \|\| '';/);
});

test('app: ver todas, filtro, mapa, dia, ajuste, agenda e compartilhar contam', () => {
  assert.match(trecho(APP, 'function abrirTodas', 'function '), /if \(abrir && anima\) contar\('todas'\);/);
  assert.match(APP, /marcados\.add\(c\.id\);\s*\/\/[^\n]*\n\s*contar\('filtro', String\(c\.id\)\.split\(':'\)\[0\]\);/);
  assert.match(trecho(APP, 'function abrirMapa', 'function '), /contar\('mapa'\);/);
  assert.match(trecho(APP, 'async function trocarDia', 'async function ajustar'), /if \(DIA\[id\]\) contar\('dia', id\);/);
  assert.match(trecho(APP, 'async function ajustar', 'function abrirFesta'), /contar\('ajuste', d\.entendeu \? 'entendido' : 'nao-entendido'\);/);
  const acoes = trecho(APP, 'function acoesDaFesta', 'function ');
  assert.match(acoes, /agenda\.addEventListener\('click', \(\) => contar\('agenda', idReal\(f\)\)\);/);
  assert.match(acoes, /contar\('compartilhou', 'copiou'\);/);
  assert.match(acoes, /await navigator\.share\([^)]*\);\s*contar\('compartilhou', 'nativo'\);/);
});

test('convite: a resposta leva o id; a abertura é avisada uma vez, com a festa real; o app sabe que veio do convite', () => {
  assert.match(PLANO, /window\.FindeMedir\.contar\('convite-resposta'\)/);
  assert.match(PLANO, /plano = r\.dados;\s*avisarAberto\(\);\s*desenhar\(\);/);
  assert.match(trecho(PLANO, 'function avisarAberto', 'function '), /new CustomEvent\('finde:convite', \{ detail: \{ festa: real \} \}\)/);
  assert.match(PLANO, /const APP = '\/app\?ver=lista&de=convite';/);
  // O 404 não avisa.
  assert.doesNotMatch(trecho(PLANO, 'if (r.status === 404)', 'return;'), /avisarAberto/);
});

'use strict';
// O painel ao vivo (/admin): a página mora só no app, os números só saem com
// o token (GET /api/painel), a landing e o motor vêm pela rede com cache, e
// os e-mails nunca saem, só a conta dos únicos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor } = require('../servidor');
const { criarPainel, nomearFestas } = require('../nucleo/painel');

const RAIZ = path.join(__dirname, '..');
const DADOS = path.join(RAIZ, 'dados', 'festas.json');
const AGORA = Date.parse('2026-11-25T15:00:00.000Z');
const TOKEN = 'token-de-teste-do-painel';
const mudo = { info() {}, warn() {}, error() {} };

// A landing e o motor de mentira: o painel do app busca os dois pela rede.
const LANDING = 'https://landing.exemplo';
const MOTOR = 'https://motor.exemplo';
const idas = [];
async function buscarFalso(url, opcoes = {}) {
  idas.push(url);
  const auth = opcoes.headers?.Authorization;
  const resp = (status, corpo, texto) => ({ ok: status < 400, status, json: async () => corpo, text: async () => texto });
  if (url === `${LANDING}/api/numeros`) {
    if (auth !== `Bearer ${TOKEN}`) return resp(401, { erro: 'x' });
    return resp(200, { pessoas: 4, desde: '2026-11-24T10:00:00.000Z', eventos: { 'abriu-landing': { vezes: 5, pessoas: 4 } }, porDia: {}, equipeFora: 1, opiniao: { respostas: 0, comentarios: [] }, lista: { inscritos: 2 } });
  }
  if (url === `${LANDING}/api/numeros/lista.csv`) return resp(200, null, 'email,inscrito_em,de\n"um@exemplo.com","2026-11-24","landing"\n"dois@exemplo.com","2026-11-24","landing"\n');
  if (url === `${MOTOR}/api/festas`) return resp(200, { geradoEm: '2026-11-25T12:00:00.000Z', festas: [{ id: 'f1', nome: 'Festa Fictícia', produtora: { nome: 'Produtora Teste' }, mediaIdade: 30 }] });
  return resp(404, {});
}

let pasta;
const servidores = [];
async function subir(opcoes) {
  const s = criarServidor({ dados: DADOS, varDir: fs.mkdtempSync(path.join(pasta, 'var-')), log: mudo, relogio: () => AGORA, adminToken: TOKEN, fetch: buscarFalso, ...opcoes });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servidores.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}
let app;
let landing;
before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-painel-'));
  app = await subir({ site: 'app', urlSite: `${LANDING}/`, motorUrl: MOTOR });
  landing = await subir({ site: 'landing', urlApp: 'https://app.exemplo/' });
});
after(async () => {
  for (const s of servidores) await new Promise((r) => s.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

const pegar = (base, caminho, token) => fetch(`${base}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual' });

test('/admin: a página mora no app, sem número nenhum no HTML, fora dos buscadores; na landing não existe', async () => {
  const r = await pegar(app, '/admin');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  const html = await r.text();
  assert.match(html, /<script src="\/admin\.js" defer><\/script>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /medir\.js/, 'o painel não entra na contagem de uso');
  assert.doesNotMatch(html, /\sstyle="|<style|<script>|\son[a-z]+="/, 'a CSP só aceita self');
  assert.equal((await pegar(app, '/admin.js')).status, 200);
  assert.equal((await pegar(app, '/admin.css')).status, 200);
  assert.equal((await pegar(landing, '/admin')).status, 404);
  assert.equal((await pegar(landing, '/admin.js')).status, 404);
});

test('GET /api/painel: sem token ou com token errado, 401; com o token, landing + app + motor, só a conta dos e-mails', async () => {
  assert.equal((await pegar(app, '/api/painel')).status, 401);
  assert.equal((await pegar(app, '/api/painel', 'errado')).status, 401);
  const r = await pegar(app, '/api/painel', TOKEN);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const texto = await r.text();
  const p = JSON.parse(texto);
  assert.equal(p.landing.pessoas, 4);
  assert.equal(typeof p.app.pessoas, 'number');
  // A festa do motor ainda traz a média de idade, mas o painel não a conta (26/11/2026).
  assert.deepEqual(p.motor, { festas: 1, produtoras: 1, atualizadoEm: '2026-11-25T12:00:00.000Z' });
  assert.equal(p.listaUnicos, 2);
  assert.equal(p.equipeFora, 1);
  assert.doesNotMatch(texto, /@exemplo\.com/, 'e-mail nunca sai no painel');
  assert.equal((await pegar(landing, '/api/painel', TOKEN)).status, 404);
  const post = await fetch(`${app}/api/painel`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(post.status, 405);
});

test('admin: um teto por IP para token errado, em todas as rotas de admin; token certo nunca esbarra nele', async () => {
  const base = await subir({ site: 'app', urlSite: `${LANDING}/`, motorUrl: MOTOR });
  const status = [];
  // Os chutes vão por /api/numeros: o teto não pode valer só no painel.
  for (let i = 0; i < 31; i++) status.push((await pegar(base, i % 2 ? '/api/numeros' : '/api/numeros/lista.csv', `chute-${i}`)).status);
  assert.ok(status.slice(0, 30).every((s) => s === 401), status.join(','));
  assert.equal(status[30], 429);
  assert.equal((await pegar(base, '/api/painel', 'mais-um-chute')).status, 429);
  // Token certo passa mesmo com o teto estourado, e muitas leituras seguidas
  // (várias abas da equipe no mesmo Wi-Fi) não travam o painel.
  for (let i = 0; i < 40; i++) assert.equal((await pegar(base, '/api/painel', TOKEN)).status, 200);
});

test('criarPainel: dois pedidos juntos fazem uma ida só à landing e ao motor', async () => {
  const contadas = [];
  const p = criarPainel({
    local: () => ({ pessoas: 1 }), listaLocal: () => 'email,inscrito_em,de\n', urlLanding: LANDING, urlMotor: MOTOR, token: TOKEN, agoraMs: () => 0,
    buscar: async (url, o) => { contadas.push(url); await new Promise((r) => setTimeout(r, 5)); return buscarFalso(url, o); },
  });
  await Promise.all([p(), p(), p()]);
  assert.equal(contadas.length, 3, contadas.join(' '));
});

test('criarPainel: sem a lista da landing, a conta dos e-mails sai marcada como incompleta', async () => {
  const p = criarPainel({
    local: () => ({ pessoas: 1 }), listaLocal: () => 'email,inscrito_em,de\n"um@exemplo.com","x","app"\n', urlLanding: LANDING, urlMotor: MOTOR, token: TOKEN,
    buscar: async (url, o) => (url.endsWith('lista.csv') ? { ok: false, status: 500 } : buscarFalso(url, o)),
  });
  const r = await p();
  assert.equal(r.listaUnicos, null);
  assert.match(r.listaErro, /500/);
});

test('criarPainel: landing e motor em cache por alguns segundos; o app é lido na hora', async () => {
  let agora = 0;
  let lidas = 0;
  const contadas = [];
  const p = criarPainel({
    local: () => { lidas++; return { pessoas: lidas, topFestas: [{ id: 'f1', detalhe: { vezes: 1, pessoas: 1 } }, { id: 'sumiu' }] }; },
    listaLocal: () => 'email,inscrito_em,de\n"um@exemplo.com","x","app"\n',
    urlLanding: LANDING,
    urlMotor: MOTOR,
    token: TOKEN,
    cacheMs: 10000,
    agoraMs: () => agora,
    buscar: async (url, o) => { contadas.push(url); return buscarFalso(url, o); },
  });
  const a = await p();
  assert.equal(a.app.pessoas, 1);
  assert.equal(a.listaUnicos, 2, 'o mesmo e-mail nas duas listas conta uma vez');
  assert.deepEqual(a.app.topFestas.map((f) => [f.id, f.nome, f.produtora]), [['f1', 'Festa Fictícia', 'Produtora Teste'], ['sumiu', null, null]]);
  const idasAntes = contadas.length;
  agora = 5000;
  const b = await p();
  assert.equal(b.app.pessoas, 2, 'o app é lido de novo');
  assert.equal(contadas.length, idasAntes, 'landing e motor vêm do cache');
  agora = 11000;
  await p();
  assert.equal(contadas.length, idasAntes * 2, 'passado o cache, busca de novo');
});

test('criarPainel: landing fora do ar vira um aviso, e o painel do app segue', async () => {
  const p = criarPainel({
    local: () => ({ pessoas: 3 }),
    listaLocal: () => 'email,inscrito_em,de\n',
    urlLanding: LANDING,
    urlMotor: MOTOR,
    token: TOKEN,
    buscar: async () => { throw new Error('rede'); },
  });
  const r = await p();
  assert.equal(r.app.pessoas, 3);
  assert.match(r.landing.erro, /sem resposta de landing\.exemplo/);
  assert.match(r.motor.erro, /sem resposta de motor\.exemplo/);
  assert.equal(r.listaUnicos, null, 'lista que falhou não vira número');
});

test('nomearFestas: o nome e a produtora vêm do motor; sem o motor, o id fica', () => {
  assert.deepEqual(nomearFestas([{ id: 'a' }], [{ id: 'a', nome: 'A', produtora: 'P' }]), [{ id: 'a', nome: 'A', produtora: 'P' }]);
  assert.deepEqual(nomearFestas([{ id: 'a' }], null), [{ id: 'a', nome: null, produtora: null }]);
});

'use strict';
// Os dados de validação do protótipo (nucleo/validacao.js, 24/11/2026): a
// contagem anônima, a nota de 0 a 10 e a lista de e-mails, em cada site, e o
// resumo só com o token de admin.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor } = require('../servidor');
const V = require('../nucleo/validacao');

const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
const mudo = { info() {}, warn() {}, error() {} };
const AGORA = Date.parse('2026-11-24T21:00:00-03:00');
const TOKEN = 'token-de-teste-com-mais-de-trinta-e-dois-caracteres';
const APARELHO = 'a'.repeat(32);
const abertos = [];
let pasta;
let app;
let landing;

async function subir(opcoes) {
  const s = criarServidor({ dados: DADOS, reais: null, log: mudo, relogio: () => AGORA, adminToken: TOKEN, ...opcoes });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-validacao-'));
  app = await subir({ varDir: path.join(pasta, 'app'), site: 'app', urlSite: 'https://finde.fly.dev/', urlApp: '/' });
  landing = await subir({ varDir: path.join(pasta, 'landing'), site: 'landing', urlApp: 'https://finde-app.fly.dev/' });
});

after(async () => {
  await Promise.all(abertos.map((s) => new Promise((r) => s.close(r))));
  fs.rmSync(pasta, { recursive: true, force: true });
});

const post = (origem, caminho, corpo, cabecalhos = {}) => fetch(origem + caminho, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...cabecalhos }, body: JSON.stringify(corpo),
});
const numeros = async (origem, token = TOKEN) => {
  const r = await fetch(`${origem}/api/numeros`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, corpo: await r.json() };
};

test('nps: promotores menos detratores sobre o total; sem resposta, nada', () => {
  assert.deepEqual(V.nps([]).nps, null);
  const r = V.nps([10, 9, 8, 7, 6, 0]);
  assert.equal(r.respostas, 6);
  assert.equal(r.promotores, 2);
  assert.equal(r.neutros, 2);
  assert.equal(r.detratores, 2);
  assert.equal(r.nps, 0);
  assert.equal(V.nps([10, 10, 9]).nps, 100);
});

test('e-mail: minúsculo e aparado; o malformado não entra', () => {
  assert.equal(V.emailValido('  Fulana@Exemplo.COM '), 'fulana@exemplo.com');
  for (const ruim of ['', 'sem-arroba', 'a@b', 'a b@c.com', '<x>@c.com', 'a@-c.com', 42, null]) assert.equal(V.emailValido(ruim), null, String(ruim));
});

test('o módulo não guarda o id do aparelho, só o HMAC; e os arquivos ficam 0600', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-v-'));
  const v = V.criarValidacao({ dir, log: mudo });
  assert.equal(v.evento({ evento: 'abriu-app', aparelho: APARELHO }), true);
  assert.equal(v.evento({ evento: 'inventado', aparelho: APARELHO }), false);
  assert.equal(v.evento({ evento: 'lista', aparelho: 'curto' }), false);
  v.opiniao({ nota: 9, texto: 'ajudou', aparelho: APARELHO });
  v.inscrever({ email: 'x@exemplo.com', aparelho: APARELHO });
  for (const nome of ['validacao-uso.jsonl', 'validacao-opinioes.json', 'validacao-lista.json', 'validacao-sal']) {
    const arq = path.join(dir, nome);
    assert.doesNotMatch(fs.readFileSync(arq, 'utf8'), new RegExp(APARELHO), nome);
    assert.equal(fs.statSync(arq).mode & 0o777, 0o600, nome);
  }
  // A lista não guarda o aparelho: o e-mail não se liga à nota nem ao uso.
  const lista = JSON.parse(fs.readFileSync(path.join(dir, 'validacao-lista.json'), 'utf8'));
  assert.deepEqual(Object.keys(lista.inscritos[0]).sort(), ['de', 'em', 'email', 'finalidade']);
  v.expurgar();
  for (const nome of V.ARQUIVOS) assert.equal(fs.existsSync(path.join(dir, nome)), false, nome);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('app: o uso conta pessoas por passo; a opinião vale a última de cada aparelho', async () => {
  for (const evento of ['abriu-app', 'lista', 'detalhe', 'detalhe']) assert.equal((await post(app, '/api/uso', { evento, aparelho: APARELHO })).status, 204);
  await post(app, '/api/uso', { evento: 'abriu-app', aparelho: 'b'.repeat(32) });
  assert.equal((await post(app, '/api/opiniao', { nota: 4, aparelho: APARELHO, de: 'app' })).status, 200);
  assert.equal((await post(app, '/api/opiniao', { nota: 10, texto: '  Achei a festa em dois toques. ', aparelho: APARELHO, de: 'app' })).status, 200);
  const ruim = await post(app, '/api/opiniao', { nota: 11, aparelho: APARELHO });
  assert.equal(ruim.status, 400);
  const { status, corpo } = await numeros(app);
  assert.equal(status, 200);
  assert.equal(corpo.site, 'app');
  assert.equal(corpo.pessoas, 2);
  assert.deepEqual(corpo.eventos.detalhe, { vezes: 2, pessoas: 1 });
  assert.deepEqual(corpo.porDia, { '2026-11-24': 2 });
  assert.equal(corpo.opiniao.respostas, 1);
  assert.equal(corpo.opiniao.nps, 100);
  assert.deepEqual(corpo.opiniao.comentarios.map((c) => c.texto), ['Achei a festa em dois toques.']);
});

test('o resumo e a lista em CSV só com o token de admin', async () => {
  assert.equal((await numeros(app, null)).status, 401);
  assert.equal((await numeros(app, 'errado')).status, 401);
  const csv = await fetch(`${app}/api/numeros/lista.csv`);
  assert.equal(csv.status, 401);
  assert.equal((await fetch(`${app}/api/numeros`, { method: 'POST' })).status, 405);
});

test('landing: a lista guarda uma vez, a isca some calada, e o formulário sem JavaScript volta para a seção', async () => {
  const um = await post(landing, '/api/lista', { email: 'Alguem@Exemplo.com', aparelho: APARELHO, de: 'landing' });
  assert.deepEqual(await um.json(), { ok: true, ja: false });
  const dois = await post(landing, '/api/lista', { email: 'alguem@exemplo.com', de: 'landing' });
  assert.deepEqual(await dois.json(), { ok: true, ja: true });
  const robo = await post(landing, '/api/lista', { email: 'robo@exemplo.com', site: 'http://spam' });
  assert.equal(robo.status, 200);
  assert.equal((await post(landing, '/api/lista', { email: 'nao-e-email' })).status, 400);
  const semJs = await fetch(`${landing}/api/lista`, {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=outra%40exemplo.com&site=',
  });
  assert.equal(semJs.status, 303);
  assert.equal(semJs.headers.get('location'), '/?lista=ok#lista');
  const { corpo } = await numeros(landing);
  assert.equal(corpo.site, 'landing');
  assert.equal(corpo.lista.inscritos, 2);
  const csv = await (await fetch(`${landing}/api/numeros/lista.csv`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text();
  assert.match(csv, /^email,inscrito_em,de\n"alguem@exemplo\.com",/);
  assert.doesNotMatch(csv, /robo@/);
  // A landing conta a própria visita no próprio volume.
  assert.equal((await post(landing, '/api/uso', { evento: 'abriu-landing', aparelho: APARELHO })).status, 204);
  assert.equal((await numeros(landing)).corpo.pessoas, 1);
});

test('limites: a mesma pessoa espera no sétimo pedido; uma turma no mesmo Wi-Fi passa', async () => {
  const origem = await subir({ varDir: path.join(pasta, 'limite'), site: 'landing', urlApp: 'https://finde-app.fly.dev/' });
  const mesma = [];
  for (let i = 0; i < 7; i += 1) mesma.push((await post(origem, '/api/lista', { email: 'repete@exemplo.com' })).status);
  assert.deepEqual(mesma, [200, 200, 200, 200, 200, 200, 429]);
  const turma = [];
  for (let i = 0; i < 30; i += 1) turma.push((await post(origem, '/api/lista', { email: `aluno${i}@exemplo.com` })).status);
  assert.ok(turma.every((s) => s === 200), turma.join(','));
});

test('só a própria página posta: outro site leva 403, e corpo que não é JSON leva 415', async () => {
  assert.equal((await post(landing, '/api/lista', { email: 'x@exemplo.com' }, { Origin: 'https://outro.example' })).status, 403);
  assert.equal((await post(landing, '/api/uso', { evento: 'abriu-landing', aparelho: APARELHO }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const host = new URL(landing).host;
  assert.equal((await post(landing, '/api/lista', { email: 'mesma@exemplo.com' }, { Origin: `http://${host}` })).status, 200);
  const textoPuro = await fetch(`${landing}/api/opiniao`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ nota: 10, aparelho: APARELHO }) });
  assert.equal(textoPuro.status, 415);
});

test('sair da lista: tira o e-mail, pelo JSON e pelo formulário sem JavaScript', async () => {
  const origem = await subir({ varDir: path.join(pasta, 'sair'), site: 'landing', urlApp: 'https://finde-app.fly.dev/' });
  await post(origem, '/api/lista', { email: 'vai@exemplo.com' });
  await post(origem, '/api/lista', { email: 'fica@exemplo.com' });
  assert.deepEqual(await (await post(origem, '/api/lista', { email: 'VAI@exemplo.com', sair: true })).json(), { ok: true, saiu: true });
  const semJs = await fetch(`${origem}/api/lista`, {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=fica%40exemplo.com&site=&sair=1',
  });
  assert.equal(semJs.headers.get('location'), '/?lista=saiu#lista');
  assert.equal((await numeros(origem)).corpo.lista.inscritos, 0);
});

test('lista.csv: célula que começa com = + - @ não vira fórmula', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-csv-'));
  const v = V.criarValidacao({ dir, log: mudo });
  assert.equal(v.inscrever({ email: '=1+1@exemplo.com' }).ok, true);
  assert.match(v.listaCsv(), /\n"'=1\+1@exemplo\.com",/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('o expurgo do D15 leva também os dados de validação', () => {
  const { expurgar } = require('../ferramentas/expurgar');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-exp-'));
  for (const n of [...V.ARQUIVOS, 'validacao-lista.json.123.tmp']) fs.writeFileSync(path.join(dir, n), 'x');
  const r = expurgar({ varDir: dir, simular: true });
  assert.equal(r.apagados.length, V.ARQUIVOS.length + 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('/opiniao: a página no app; na landing, o link leva para lá', async () => {
  const r = await fetch(`${app}/opiniao`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<title>Sua opinião · finde\.<\/title>/);
  assert.match(html, /<script src="\/medir\.js" data-pagina="opiniao" defer><\/script>/);
  assert.match(html, /<body data-tela="opiniao">/);
  const l = await fetch(`${landing}/opiniao`, { redirect: 'manual' });
  assert.equal(l.status, 302);
  assert.equal(l.headers.get('location'), 'https://finde-app.fly.dev/opiniao');
  // O script da contagem sai na landing também (a lista do que ela serve vem do HTML).
  assert.equal((await fetch(`${landing}/medir.js`)).status, 200);
});

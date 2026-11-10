'use strict';
// A API num servidor de verdade, em porta efêmera.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { criarServidor } = require('../servidor');
const { executar } = require('../nucleo/coleta');
const { criarProdutora } = require('../nucleo/produtoras');
const envio = require('../fontes/envio');
const { lerConfig } = require('../fontes');
const { novoBanco, relogio, logMudo } = require('./ajuda');

const EXEMPLOS = path.join(__dirname, '..', 'exemplos', 'envios');
let db;
let base;
let servidor;
let token;
const agora = relogio();

before(async () => {
  db = novoBanco();
  await executar({ db, fontes: [envio], agora, log: logMudo, config: { envio: { pastas: [EXEMPLOS] } } });
  token = criarProdutora(db, 'Coletivo Teste', agora()).token;
  const amb = { adminToken: 'admin-de-teste-123', cors: ['http://localhost:8763'] };
  servidor = criarServidor({ db, amb, config: lerConfig(), agora, log: logMudo });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => new Promise((ok) => servidor.close(ok)));

test('GET /api/festas devolve os registros R14 a partir de hoje', async () => {
  const r = await fetch(`${base}/api/festas`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.contrato, 'finde-r14/1');
  assert.equal(j.total, 4);
  const f = j.festas[0];
  for (const k of ['id', 'nome', 'produtora', 'casa', 'endereco', 'data', 'inicio', 'pistaCheia', 'fim', 'lotes', 'precoAPartirDe',
    'linkCompra', 'linkEvento', 'instagram', 'cartaz', 'lineup', 'estilos', 'idadeMinima', 'regras', 'mediaIdade', 'fontes', 'coletadoEm', 'campos']) {
    assert.ok(k in f, k);
  }
  assert.ok(j.festas.every((x, i, a) => i === 0 || a[i - 1].inicio <= x.inicio), 'em ordem de início');
});

test('filtros: datas validadas, exemplos=0 tira os fictícios', async () => {
  assert.equal((await fetch(`${base}/api/festas?de=amanha`)).status, 400);
  const j = await (await fetch(`${base}/api/festas?exemplos=0`)).json();
  assert.equal(j.total, 0);
  const passado = await (await fetch(`${base}/api/festas?de=2026-11-16`)).json();
  assert.equal(passado.total, 0);
});

test('GET /api/festas/:id e 404', async () => {
  const { festas } = await (await fetch(`${base}/api/festas`)).json();
  const r = await fetch(`${base}/api/festas/${festas[0].id}`);
  assert.equal((await r.json()).id, festas[0].id);
  assert.equal((await fetch(`${base}/api/festas/..%2F..%2Fetc`)).status, 404);
  assert.equal((await fetch(`${base}/api/festas/nao-existe`)).status, 404);
});

test('CORS só para a origem configurada', async () => {
  const sim = await fetch(`${base}/api/festas`, { headers: { Origin: 'http://localhost:8763' } });
  assert.equal(sim.headers.get('access-control-allow-origin'), 'http://localhost:8763');
  const nao = await fetch(`${base}/api/festas`, { headers: { Origin: 'https://outro.example' } });
  assert.equal(nao.headers.get('access-control-allow-origin'), null);
});

test('POST /api/envios: sem token 401; com token grava e entra na próxima coleta com o nome do cadastro', async () => {
  const corpo = { produtora: { nome: 'Fingindo Ser Outra' }, festas: [{ id: 'nova', nome: 'Festa Nova', data: '2026-11-14', inicio: '21:00', estilos: ['funk'], mediaIdade: { valor: 30, origem: 'produtora' } }] };
  const sem = await fetch(`${base}/api/envios`, { method: 'POST', body: JSON.stringify(corpo) });
  assert.equal(sem.status, 401);
  const errado = await fetch(`${base}/api/envios`, { method: 'POST', headers: { Authorization: 'Bearer fnd_errado_0000000' }, body: JSON.stringify(corpo) });
  assert.equal(errado.status, 401);
  const ok = await fetch(`${base}/api/envios`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo) });
  assert.equal(ok.status, 202);
  await executar({ db, fontes: [envio], agora, log: logMudo, config: { envio: { pastas: [] } } });
  const j = await (await fetch(`${base}/api/festas`)).json();
  const nova = j.festas.find((f) => f.nome === 'Festa Nova');
  assert.equal(nova.produtora.nome, 'Coletivo Teste');
  assert.deepEqual(nova.mediaIdade, { valor: 30, origem: 'produtora' });
});

test('POST /api/envios: JSON ruim 400, sem festas 400, grande 413', async () => {
  const h = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${base}/api/envios`, { method: 'POST', headers: h, body: '{' })).status, 400);
  assert.equal((await fetch(`${base}/api/envios`, { method: 'POST', headers: h, body: '{"festas":[]}' })).status, 400);
  const grande = JSON.stringify({ festas: [{ nome: 'x'.repeat(300 * 1024) }] });
  const r = await fetch(`${base}/api/envios`, { method: 'POST', headers: h, body: grande }).catch((e) => e);
  assert.ok(r instanceof Error || r.status === 413);
});

test('M13: /api/uso só com token de admin, e o uso não guarda IP', async () => {
  assert.equal((await fetch(`${base}/api/uso`)).status, 401);
  assert.equal((await fetch(`${base}/api/uso`, { headers: { Authorization: 'Bearer outro' } })).status, 401);
  const r = await fetch(`${base}/api/uso`, { headers: { Authorization: 'Bearer admin-de-teste-123' } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.api24h.some((l) => l.rota === '/api/festas' && l.cliente === 'publico'));
  assert.ok(j.api24h.some((l) => l.rota === '/api/envios' && l.cliente.startsWith('produtora:')));
  const colunas = db.prepare('PRAGMA table_info(uso_api)').all().map((c) => c.name);
  assert.ok(!colunas.some((c) => /ip|endereco/.test(c)));
  const ex = await (await fetch(`${base}/api/execucoes`, { headers: { Authorization: 'Bearer admin-de-teste-123' } })).json();
  assert.ok(ex.execucoes.length >= 2);
});

test('GET /api/fontes lista ligadas e desligadas com motivo', async () => {
  const j = await (await fetch(`${base}/api/fontes`)).json();
  assert.ok(j.fontes.find((f) => f.id === 'instagram' && !f.ligada && f.motivo));
});

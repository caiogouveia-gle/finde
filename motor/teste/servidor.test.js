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
const { VERSAO_CONTRATO } = require('../nucleo/contrato');
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
  assert.equal(j.contrato, VERSAO_CONTRATO);
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

// ---------------------------------------------------------------- operação (U20)
// Servidores à parte, cada um com o banco dele: ETag, o "hoje" de São Paulo, as
// imagens, as avaliações do app, a coleta sob comando e os apelidos de id.

const fs = require('node:fs');
const os = require('node:os');
const { semear, festaDe } = require('./ajuda-operacao');
const curadoria = require('../nucleo/curadoria');

const ADMIN = 'admin-de-teste-123';
const APP = 'app-token-de-teste-456';
const ENDERECO_SP = 'Rua A, 1 - São Paulo/SP';

async function subir(db, { amb = {}, config = {}, relogioDoServidor = relogio(), executarColeta } = {}) {
  const s = criarServidor({
    db, amb: { adminToken: ADMIN, appToken: APP, cors: [], imagens: null, ...amb }, config, agora: relogioDoServidor, log: logMudo, ...(executarColeta ? { executarColeta } : {}),
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  return { s, url: `http://127.0.0.1:${s.address().port}`, fecha: () => new Promise((ok) => s.close(ok)) };
}

const festa = (nome, data, extra = {}) => ({ nome, data, inicio: '22:00', casa: `Casa ${nome}`, endereco: ENDERECO_SP, ...extra });
const esperar = async (cond, ms = 3000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (cond()) return true;
    await new Promise((ok) => setTimeout(ok, 20));
  }
  return false;
};

test('/saude não grava linha em uso_api; as outras rotas gravam', async () => {
  const db = novoBanco();
  const { url, fecha } = await subir(db);
  try {
    for (let i = 0; i < 3; i += 1) assert.equal((await fetch(`${url}/saude`)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM uso_api').get().n, 0);
    await fetch(`${url}/api/festas`);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM uso_api WHERE rota = '/api/festas'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM uso_api WHERE rota = '/saude'").get().n, 0);
  } finally {
    await fecha();
  }
});

test('ETag: dois pedidos sem coleta no meio têm o mesmo ETag e o segundo dá 304; curadoria muda o ETag', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: festa('Baile A', '2026-11-14') }], agora);
  await executar({ db, fontes: [{ id: 'envio', nome: 'envio', coletar: async () => ({ itens: [], avisos: [] }) }], claude: null, apify: null, classificar: false, agora, log: logMudo, config: {} });
  const { url, fecha } = await subir(db);
  try {
    const r1 = await fetch(`${url}/api/festas`);
    const etag = r1.headers.get('etag');
    assert.match(etag, /^"[0-9a-f]{24}"$/);
    const j = await r1.json();
    assert.equal(j.contrato, VERSAO_CONTRATO);
    assert.ok(j.execucaoId > 0, 'o envelope traz a execução');
    assert.equal(j.geradoEm, db.prepare("SELECT fim FROM execucoes WHERE estado = 'ok' ORDER BY id DESC LIMIT 1").get().fim, 'geradoEm é o fim da última execução ok');
    const r2 = await fetch(`${url}/api/festas`);
    assert.equal(r2.headers.get('etag'), etag);
    const r3 = await fetch(`${url}/api/festas`, { headers: { 'If-None-Match': etag } });
    assert.equal(r3.status, 304);
    assert.equal(r3.headers.get('etag'), etag);
    assert.equal(await r3.text(), '');
    assert.equal((await fetch(`${url}/api/festas`, { headers: { 'If-None-Match': `W/${etag}, "outro"` } })).status, 304);
    assert.equal((await fetch(`${url}/api/festas`, { headers: { 'If-None-Match': '"velho"' } })).status, 200);
    // Filtros diferentes, ETag diferente.
    assert.notEqual((await fetch(`${url}/api/festas?todas=1`, { headers: { Authorization: `Bearer ${ADMIN}` } })).headers.get('etag'), etag);
    // Uma correção da curadoria, sem execução nova, troca o ETag e a lista.
    curadoria.ocultar(db, { festaId: j.festas[0].id, motivo: 'teste', agora });
    const r4 = await fetch(`${url}/api/festas`, { headers: { 'If-None-Match': etag } });
    assert.equal(r4.status, 200);
    assert.notEqual(r4.headers.get('etag'), etag);
    assert.equal((await r4.json()).total, 0, 'a festa oculta sai da lista');
    assert.equal((await (await fetch(`${url}/api/festas?todas=1`, { headers: { Authorization: `Bearer ${ADMIN}` } })).json()).total, 1);
  } finally {
    await fecha();
  }
});

test('`de` mais velho que 7 dias atrás vira 7 dias atrás, sem 400', async () => {
  const db = novoBanco();
  const agora = relogio(); // terça, 10/11, 12h em São Paulo
  await semear(db, [
    { fonte: 'envio', idExterno: 'velha', bruto: festa('Festa Velha', '2026-10-25') },
    { fonte: 'envio', idExterno: 'recente', bruto: festa('Festa Recente', '2026-11-05') },
    { fonte: 'envio', idExterno: 'hoje', bruto: festa('Festa Hoje', '2026-11-10') },
    { fonte: 'envio', idExterno: 'amanha', bruto: festa('Festa Amanha', '2026-11-11') },
  ], agora);
  const { url, fecha } = await subir(db);
  try {
    const nomes = async (q) => {
      const r = await fetch(`${url}/api/festas${q}`);
      assert.equal(r.status, 200, q);
      return (await r.json()).festas.map((f) => f.nome);
    };
    assert.deepEqual(await nomes(''), ['Festa Hoje', 'Festa Amanha']);
    assert.deepEqual(await nomes('?de=2026-11-03'), ['Festa Recente', 'Festa Hoje', 'Festa Amanha']);
    // 30 dias atrás: vira 03/11 (7 dias antes de 10/11); a de 25/10 não volta.
    assert.deepEqual(await nomes('?de=2026-10-11'), ['Festa Recente', 'Festa Hoje', 'Festa Amanha']);
    assert.deepEqual(await nomes('?de=2026-11-08'), ['Festa Hoje', 'Festa Amanha']);
    assert.equal((await fetch(`${url}/api/festas?de=2026-13-45`)).status, 400);
    assert.equal((await fetch(`${url}/api/festas?ate=sexta`)).status, 400);
  } finally {
    await fecha();
  }
});

test('às 22h em São Paulo o "hoje" do padrão ainda é o dia certo (e à 1h da manhã de UTC também)', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [
    { fonte: 'envio', idExterno: 'ontem', bruto: festa('Festa Ontem', '2026-11-09') },
    { fonte: 'envio', idExterno: 'hoje', bruto: festa('Festa Hoje', '2026-11-10') },
    { fonte: 'envio', idExterno: 'amanha', bruto: festa('Festa Amanha', '2026-11-11') },
  ], agora);
  // 22h de 10/11 em São Paulo são 01h de 11/11 em UTC.
  const { url, fecha } = await subir(db, { relogioDoServidor: relogio(new Date('2026-11-11T01:00:00Z')) });
  try {
    const j = await (await fetch(`${url}/api/festas`)).json();
    assert.deepEqual(j.festas.map((f) => f.nome), ['Festa Hoje', 'Festa Amanha']);
  } finally {
    await fecha();
  }
});

test('por padrão só São Paulo e sem ocultas; todas=1 devolve tudo; o /api/festas/:id não dá a oculta', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [
    { fonte: 'envio', idExterno: 'sp', bruto: festa('Festa SP', '2026-11-14') },
    { fonte: 'envio', idExterno: 'cotia', bruto: festa('Festa Cotia', '2026-11-14', { endereco: 'Rua B, 2 - Cotia/SP' }) },
    { fonte: 'envio', idExterno: 'sem', bruto: festa('Festa Sem Cidade', '2026-11-14', { endereco: 'Rua C, 3 - Pinheiros' }) },
    { fonte: 'envio', idExterno: 'oculta', bruto: festa('Festa Oculta', '2026-11-14') },
  ], agora);
  curadoria.ocultar(db, { festaId: festaDe(db, 'envio', 'oculta'), motivo: 'não é festa', agora });
  const { url, fecha } = await subir(db);
  try {
    const padrao = (await (await fetch(`${url}/api/festas`)).json()).festas.map((f) => f.nome).sort();
    assert.deepEqual(padrao, ['Festa SP', 'Festa Sem Cidade'], 'Cotia confirmada fica de fora; cidade vazia fica para o app decidir');
    const todas = (await (await fetch(`${url}/api/festas?todas=1`, { headers: { Authorization: `Bearer ${ADMIN}` } })).json()).festas.map((f) => f.nome).sort();
    assert.deepEqual(todas, ['Festa Cotia', 'Festa Oculta', 'Festa SP', 'Festa Sem Cidade']);
    // Sem o token de admin, todas=1 não abre o que a curadoria ocultou.
    for (const headers of [{}, { Authorization: 'Bearer outro-token-qualquer' }, { Authorization: `Bearer ${APP}` }]) {
      const r = await fetch(`${url}/api/festas?todas=1`, { headers });
      assert.equal(r.status, 401);
      assert.doesNotMatch(await r.text(), /Festa Oculta/);
    }
    assert.equal((await fetch(`${url}/api/festas/${festaDe(db, 'envio', 'oculta')}`)).status, 404);
    assert.equal((await fetch(`${url}/api/festas/${festaDe(db, 'envio', 'sp')}`)).status, 200);
  } finally {
    await fecha();
  }
});

test('o id antigo de uma festa unida a outra devolve a festa nova em /api/festas/:id', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: festa('Festa Nova', '2026-11-14') }], agora);
  const nova = festaDe(db, 'envio', 'a');
  db.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?)').run('festa-antiga-20261114-abcd', nova, agora().toISOString());
  const { url, fecha } = await subir(db);
  try {
    const r = await fetch(`${url}/api/festas/festa-antiga-20261114-abcd`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).id, nova);
    assert.equal((await fetch(`${url}/api/festas/festa-que-nunca-existiu-20261114-0000`)).status, 404);
  } finally {
    await fecha();
  }
});

// ---------------------------------------------------------------- /imagens

test('GET /imagens: só o nome seguro, só imagem do banco e não oculta, com os cabeçalhos certos', async () => {
  const db = novoBanco();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-servidor-imagens-'));
  const SHA = '0123456789abcdef';
  const OCULTA = 'fedcba9876543210';
  const SEM_ARQUIVO = '1111111111111111';
  for (const n of [`${SHA}-1080.webp`, `${SHA}-480.webp`, `${OCULTA}-1080.webp`]) fs.writeFileSync(path.join(dir, n), 'RIFFxxxxWEBPfake');
  fs.writeFileSync(path.join(dir, 'segredo.txt'), 'não sai');
  const ins = db.prepare('INSERT INTO imagens (sha, arquivo, miniatura, criada_em, oculta) VALUES (?, ?, ?, ?, ?)');
  ins.run(SHA, `imagens/${SHA}-1080.webp`, `imagens/${SHA}-480.webp`, '2026-11-10T12:00:00.000Z', 0);
  ins.run(OCULTA, `imagens/${OCULTA}-1080.webp`, `imagens/${OCULTA}-480.webp`, '2026-11-10T12:00:00.000Z', 1);
  ins.run(SEM_ARQUIVO, `imagens/${SEM_ARQUIVO}-1080.webp`, `imagens/${SEM_ARQUIVO}-480.webp`, '2026-11-10T12:00:00.000Z', 0);
  const { url, fecha } = await subir(db, { amb: { imagens: dir } });
  try {
    const ok = await fetch(`${url}/imagens/${SHA}-1080.webp`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/webp');
    assert.equal(ok.headers.get('cache-control'), 'public, max-age=86400');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await ok.text(), 'RIFFxxxxWEBPfake');
    assert.equal((await fetch(`${url}/imagens/${SHA}-480.webp`)).status, 200);
    assert.equal((await fetch(`${url}/imagens/${OCULTA}-1080.webp`)).status, 404, 'oculta dá 404');
    assert.equal((await fetch(`${url}/imagens/${SEM_ARQUIVO}-1080.webp`)).status, 404, 'no banco mas sem arquivo');
    assert.equal((await fetch(`${url}/imagens/2222222222222222-1080.webp`)).status, 404, 'fora do banco');
    for (const ruim of ['../x', '..%2Fsegredo.txt', 'segredo.txt', `${SHA}-720.webp`, `${SHA}-1080.png`, `${SHA.toUpperCase()}-1080.webp`, `${SHA}-1080.webp%00`, '%2e%2e%2f%2e%2e%2fetc%2fpasswd']) {
      const r = await fetch(`${url}/imagens/${ruim}`);
      assert.equal(r.status, 404, ruim);
    }
    assert.equal(ok.headers.get('x-robots-tag'), 'noindex, noimageindex, nofollow');
    // A peça só de uma festa que a curadoria ocultou também dá 404.
    await semear(db, [{ fonte: 'envio', idExterno: 'img', bruto: festa('Festa Com Imagem', '2026-11-14') }], relogio());
    db.prepare("INSERT INTO imagens_item (fonte, id_externo, sha, papel, conferido_em) VALUES ('envio', 'img', ?, 'post', 't')").run(SHA);
    assert.equal((await fetch(`${url}/imagens/${SHA}-1080.webp`)).status, 200);
    curadoria.ocultar(db, { festaId: festaDe(db, 'envio', 'img'), motivo: 'teste', agora: relogio() });
    assert.equal((await fetch(`${url}/imagens/${SHA}-1080.webp`)).status, 404, 'imagem de festa oculta');
    curadoria.desfazer(db, { festaId: festaDe(db, 'envio', 'img'), campo: 'oculta', agora: relogio() });
    assert.equal((await fetch(`${url}/imagens/${SHA}-1080.webp`)).status, 200, 'desfeita, volta');
    // Ocultar depois: some na hora.
    db.prepare('UPDATE imagens SET oculta = 1 WHERE sha = ?').run(SHA);
    assert.equal((await fetch(`${url}/imagens/${SHA}-1080.webp`)).status, 404);
  } finally {
    await fecha();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('o motor não entra em busca: robots.txt fecha tudo e toda resposta leva X-Robots-Tag', async () => {
  const { url, fecha } = await subir(novoBanco());
  try {
    const r = await fetch(`${url}/robots.txt`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/plain/);
    assert.equal(await r.text(), 'User-agent: *\nDisallow: /\n');
    for (const caminho of ['/robots.txt', '/saude', '/api/festas', '/api/uso', '/nao-existe']) {
      assert.equal((await fetch(`${url}${caminho}`)).headers.get('x-robots-tag'), 'noindex, noimageindex, nofollow', caminho);
    }
  } finally {
    await fecha();
  }
});

// ---------------------------------------------------------------- /api/avaliacoes

const avaliacao = (i, extra = {}) => ({ chave: `chave-${String(i).padStart(4, '0')}`, aparelho: `aparelho-${String(i).padStart(4, '0')}`, planoId: i < 2 ? 'convite-a' : 'convite-b', resposta: i === 3 ? 'mais-velho' : 'na-medida', idade: 29 + i, ...extra });

test('POST /api/avaliacoes: sem token 401, token errado de mesmo tamanho 401, com token 202', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: festa('Festa Avaliada', '2026-11-14') }], agora);
  const id = festaDe(db, 'envio', 'a');
  const { url, fecha } = await subir(db);
  const pedido = (token, corpo) => fetch(`${url}/api/avaliacoes`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(corpo) });
  const corpo = { festaId: id, avaliacoes: [0, 1, 2, 3, 4].map((i) => avaliacao(i)) };
  try {
    assert.equal((await pedido(null, corpo)).status, 401);
    assert.equal((await pedido('x'.repeat(APP.length), corpo)).status, 401);
    assert.equal((await pedido(ADMIN, corpo)).status, 401, 'o token de admin não vale aqui');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM avaliacoes').get().n, 0);
    const ok = await pedido(APP, corpo);
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json(), { novas: 5, repetidas: 0, recusadas: 0 });
    // Idempotente pela chave.
    assert.deepEqual(await (await pedido(APP, corpo)).json(), { novas: 0, repetidas: 5, recusadas: 0 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM avaliacoes').get().n, 5);
    // A média sai já, sem esperar coleta (AE5).
    const f = await (await fetch(`${url}/api/festas/${id}`)).json();
    assert.deepEqual(f.mediaIdade, { valor: 31, origem: 'avaliacoes', avaliacoes: 5, naMedida: 0.8, faixa: [29, 33], convites: 2 });
    // O app é cliente próprio no uso, sem nome.
    assert.ok(db.prepare("SELECT 1 FROM uso_api WHERE rota = '/api/avaliacoes' AND cliente = 'app'").get());
  } finally {
    await fecha();
  }
});

test('POST /api/avaliacoes: sem nome, formato, festa que não existe, resposta fora das três, 256 KB', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: festa('Festa Avaliada', '2026-11-14') }], agora);
  const id = festaDe(db, 'envio', 'a');
  const { url, fecha } = await subir(db);
  const pedido = (corpo, cru) => fetch(`${url}/api/avaliacoes`, { method: 'POST', headers: { Authorization: `Bearer ${APP}` }, body: cru !== undefined ? cru : JSON.stringify(corpo) });
  try {
    assert.equal((await pedido(null, '{')).status, 400);
    assert.equal((await pedido({ avaliacoes: [] })).status, 400);
    assert.equal((await pedido({ festaId: id })).status, 400);
    assert.equal((await pedido({ festaId: id, avaliacoes: [avaliacao(1, { nome: 'Fulano' })] })).status, 400, 'a avaliação não leva nome');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM avaliacoes').get().n, 0);
    const mistas = await pedido({ avaliacoes: [
      avaliacao(1, { festaId: id }),
      avaliacao(2, { festaId: 'nao-existe-20261114-0000' }),
      avaliacao(3, { festaId: id, resposta: 'talvez' }),
      avaliacao(4, { festaId: id, chave: 'curta' }),
      avaliacao(5, { festaId: id, idade: 17 }),
      avaliacao(6, { festaId: id, idade: null }),
    ] });
    assert.equal(mistas.status, 202);
    assert.deepEqual(await mistas.json(), { novas: 3, repetidas: 0, recusadas: 3 });
    const sem = db.prepare('SELECT chave, idade FROM avaliacoes ORDER BY chave').all();
    assert.deepEqual(sem.map((l) => l.idade), [30, null, null], 'idade fora de 18 a 60 ou ausente fica sem idade (não conta)');
    assert.equal((await pedido({ festaId: 'nao-existe-20261114-0000', avaliacoes: [avaliacao(7)] })).status, 400, 'nenhuma válida');
    const grande = await pedido({ festaId: id, avaliacoes: [avaliacao(1, { aparelho: 'x'.repeat(300 * 1024) })] }).catch((e) => e);
    assert.ok(grande instanceof Error || grande.status === 413);
    const muitas = Array.from({ length: 201 }, (_, i) => avaliacao(i));
    assert.equal((await pedido({ festaId: id, avaliacoes: muitas })).status, 400);
  } finally {
    await fecha();
  }
});

test('POST /api/avaliacoes: sem FINDE_APP_TOKEN configurado a rota fica fechada', async () => {
  const db = novoBanco();
  const { url, fecha } = await subir(db, { amb: { appToken: null } });
  try {
    const r = await fetch(`${url}/api/avaliacoes`, { method: 'POST', headers: { Authorization: 'Bearer qualquer-coisa' }, body: '{}' });
    assert.equal(r.status, 401);
  } finally {
    await fecha();
  }
});

test('o id antigo da festa unida também recebe avaliação, e a média cai na festa nova', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: festa('Festa Nova', '2026-11-14') }], agora);
  const nova = festaDe(db, 'envio', 'a');
  db.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?)').run('festa-antiga-20261114-abcd', nova, agora().toISOString());
  const { url, fecha } = await subir(db);
  try {
    const r = await fetch(`${url}/api/avaliacoes`, { method: 'POST', headers: { Authorization: `Bearer ${APP}` }, body: JSON.stringify({ festaId: 'festa-antiga-20261114-abcd', avaliacoes: [0, 1, 2, 3, 4].map((i) => avaliacao(i)) }) });
    assert.equal(r.status, 202);
    assert.equal(db.prepare('SELECT DISTINCT festa_id FROM avaliacoes').get().festa_id, nova);
  } finally {
    await fecha();
  }
});

// ---------------------------------------------------------------- /api/coletar

test('POST /api/coletar: sem admin 401; sem fonte 400; com admin 202 e a execução termina; com uma rodando 409', async () => {
  const db = novoBanco();
  const config = { envio: { ligada: true, pastas: [] }, curadoria: { arquivo: '/nao/existe/curadoria.json' } };
  const { url, fecha } = await subir(db, { config });
  const coletar = (token, corpo) => fetch(`${url}/api/coletar`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) });
  try {
    assert.equal((await coletar(null)).status, 401);
    assert.equal((await coletar('x'.repeat(ADMIN.length))).status, 401);
    assert.equal((await coletar(APP)).status, 401, 'o token do app não coleta');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM execucoes').get().n, 0);
    // 202 com o id; a execução termina em segundo plano.
    const r = await coletar(ADMIN);
    assert.equal(r.status, 202);
    const { execucaoId, estado } = await r.json();
    assert.ok(execucaoId > 0);
    assert.equal(estado, 'rodando');
    assert.ok(await esperar(() => db.prepare('SELECT estado FROM execucoes WHERE id = ?').get(execucaoId).estado !== 'rodando'), 'a execução termina');
    assert.equal(db.prepare('SELECT estado, gatilho FROM execucoes WHERE id = ?').get(execucaoId).estado, 'ok');
    // Com uma execução rodando: 409 e o id dela.
    const rodando = Number(db.prepare("INSERT INTO execucoes (inicio, estado, gatilho) VALUES (?, 'rodando', 'teste')").run(new Date(Date.parse('2026-11-10T15:00:00.000Z')).toISOString()).lastInsertRowid);
    const r409 = await coletar(ADMIN, { forcar: true });
    assert.equal(r409.status, 409);
    assert.equal((await r409.json()).execucaoId, rodando);
    db.prepare("UPDATE execucoes SET estado = 'erro' WHERE id = ?").run(rodando);
    // Corpo ruim: 400.
    assert.equal((await fetch(`${url}/api/coletar`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}` }, body: '{' })).status, 400);
  } finally {
    await fecha();
  }
});

test('POST /api/coletar: fonte pedida desligada, ou nenhuma ligada, dá 400', async () => {
  const db = novoBanco();
  const { url, fecha } = await subir(db, { config: {} });
  try {
    assert.equal((await fetch(`${url}/api/coletar`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}` } })).status, 400);
  } finally {
    await fecha();
  }
});

test('POST /api/coletar: dispara a execução injetada com a trava, o gatilho e a pasta de imagens', async () => {
  const db = novoBanco();
  const chamadas = [];
  const executarColeta = async (o) => {
    chamadas.push({ gatilho: o.gatilho, dirImagens: o.dirImagens, forcar: o.forcar, fontes: o.fontes.map((f) => f.id) });
    return { execucaoId: 1, festasTocadas: 0, festasNovas: 0, classificacao: { gastoUsd: 0 } };
  };
  const { url, fecha } = await subir(db, { amb: { imagens: '/tmp/imagens-do-teste', poc: false }, config: { envio: { ligada: true, pastas: [] } }, executarColeta });
  try {
    // A execução injetada não toma a trava: o servidor responde 500 em vez de inventar um id.
    const r = await fetch(`${url}/api/coletar`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ forcar: true }) });
    assert.equal(r.status, 500);
    assert.deepEqual(chamadas, [{ gatilho: 'comando', dirImagens: '/tmp/imagens-do-teste', forcar: true, fontes: ['envio'] }]);
  } finally {
    await fecha();
  }
});

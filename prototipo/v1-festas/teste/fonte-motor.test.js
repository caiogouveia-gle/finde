'use strict';
// A base viva do motor (U22, R23, KTD14, AE7): um motor falso em node:http
// local, relógio injetado, nada de rede de fora. A lista só troca por outra
// boa; sem motor, o cache; sem cache, o arquivo da imagem.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { criarFonteMotor } = require('../nucleo/fonte-motor');
const { criarServidor } = require('../servidor');

const MOTOR = path.join(__dirname, '..', '..', '..', 'motor');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(MOTOR, 'teste', 'dados', 'registro-r14-3.json'), 'utf8'));
const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
// Quinta, 26/11/2026, meio-dia em São Paulo: as três festas da fixture valem.
const AGORA = Date.parse('2026-11-26T12:00:00-03:00');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-fonte-motor-'));
const abertos = [];
after(async () => {
  for (const s of abertos) await new Promise((r) => s.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

// Um log que guarda as linhas.
function registro() {
  const linhas = [];
  return { linhas, info: (t) => linhas.push(`info ${t}`), warn: (t) => linhas.push(`warn ${t}`), error: (t) => linhas.push(`erro ${t}`) };
}

// O motor falso: `responder(req, res)` troca a cada teste; os pedidos ficam em `pedidos`.
async function motorFalso() {
  const m = { pedidos: [], responder: null };
  m.servidor = http.createServer((req, res) => {
    m.pedidos.push({ url: req.url, cabecalhos: req.headers });
    m.responder(req, res);
  });
  await new Promise((r) => m.servidor.listen(0, '127.0.0.1', r));
  abertos.push(m.servidor);
  m.url = `http://127.0.0.1:${m.servidor.address().port}`;
  return m;
}
const enviar = (status, corpo, cabecalhos = {}) => (req, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cabecalhos });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
};
const envelope = (festas = FIXTURE.festas, extra = {}) => ({ contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, execucaoId: 42, total: festas.length, festas, ...extra });
const arquivo = (nome, conteudo) => {
  const c = path.join(pasta, nome);
  fs.writeFileSync(c, JSON.stringify(conteudo));
  return c;
};

test('200 grava o cache; 304 mantém; o pedido leva ?exemplos=0&de=<hoje − 7> e o ETag', async () => {
  const m = await motorFalso();
  const cache = path.join(pasta, 'a', 'reais-cache.json');
  let agora = AGORA;
  m.responder = enviar(200, envelope(), { ETag: '"e42"' });
  const log = registro();
  const f = criarFonteMotor({ url: m.url, cache, relogio: () => agora, log });
  assert.deepEqual(f.festas(), []);
  await f.atualizar();
  assert.equal(f.festas().length, 3);
  assert.equal(f.estado().origem, 'motor');
  assert.equal(f.estado().execucaoId, 42);
  assert.equal(f.estado().geradoEm, '2026-11-26T09:05:00-03:00');
  assert.equal(m.pedidos[0].url, '/api/festas?exemplos=0&de=2026-11-19');
  assert.ok(fs.existsSync(cache));
  assert.equal(JSON.parse(fs.readFileSync(cache, 'utf8')).etag, '"e42"');
  // Dentro da validade (10 min), não pede de novo.
  agora += 5 * 60e3;
  await f.atualizar();
  assert.equal(m.pedidos.length, 1);
  // Depois dela, pede com If-None-Match; 304 mantém a lista.
  agora += 6 * 60e3;
  m.responder = (req, res) => { res.writeHead(304); res.end(); };
  const antes = f.festas();
  await f.atualizar();
  assert.equal(m.pedidos.length, 2);
  assert.equal(m.pedidos[1].cabecalhos['if-none-match'], '"e42"');
  assert.equal(f.festas(), antes);
  // O id antigo (festa unida no motor) acha a festa nova.
  assert.equal(f.achar('noite-exemplo-20261205-c3d4').id, 'noite-exemplo-20261205-a1b2');
  assert.equal(f.achar('nao-existe'), null);
});

test('500, demora acima do limite, JSON quebrado, contrato /1 e lista vazia mantêm a última lista boa; log uma vez por mudança', async () => {
  const m = await motorFalso();
  let agora = AGORA;
  const log = registro();
  m.responder = enviar(200, envelope());
  const f = criarFonteMotor({ url: m.url, relogio: () => agora, log, limiteMs: 150 });
  await f.atualizar();
  const boa = f.festas();
  assert.equal(boa.length, 3);
  const ruins = [
    ['respondeu 500', enviar(500, { erro: 'x' })],
    ['respondeu 500', enviar(500, { erro: 'x' })], // o mesmo erro de novo: não loga de novo
    ['sem resposta em 150 ms', (req, res) => setTimeout(() => enviar(200, envelope())(req, res), 400)],
    ['JSON quebrado', enviar(200, '{ não é json')],
    ['contrato "finde-r14/1"', enviar(200, { ...envelope(), contrato: 'finde-r14/1' })],
    ['vazia', enviar(200, envelope([]))],
  ];
  for (const [, responder] of ruins) {
    agora += 11 * 60e3;
    m.responder = responder;
    await f.atualizar();
    assert.equal(f.festas(), boa);
    assert.ok(f.estado().erro);
  }
  const avisos = log.linhas.filter((l) => l.startsWith('warn'));
  assert.equal(avisos.length, 5, avisos.join('\n'));
  assert.match(avisos[0], /respondeu 500/);
  assert.match(avisos[1], /sem resposta em 150 ms/);
  assert.match(avisos[2], /JSON quebrado/);
  assert.match(avisos[3], /finde-r14\/1/);
  assert.match(avisos[4], /vazia/);
  // Voltou: um "ok" só.
  agora += 11 * 60e3;
  m.responder = enviar(200, envelope());
  await f.atualizar();
  assert.equal(f.estado().erro, null);
  assert.equal(log.linhas.filter((l) => l.startsWith('info') && /3 festas de/.test(l)).length, 2);
});

test('sem motor no boot: a lista sai do cache; sem cache, do arquivo da imagem (AE7)', async () => {
  const comCache = arquivo('cache.json', { ...envelope(), etag: '"velho"' });
  const reserva = arquivo('reserva.json', envelope([FIXTURE.festas[1]]));
  const fora = 'http://127.0.0.1:9'; // ninguém escuta: recusa na hora
  const a = criarFonteMotor({ url: fora, cache: comCache, reserva, relogio: () => AGORA, log: registro() });
  assert.equal(a.festas().length, 3);
  assert.equal(a.estado().origem, 'cache');
  assert.equal(a.estado().geradoEm, '2026-11-26T09:05:00-03:00');
  await a.atualizar();
  assert.equal(a.festas().length, 3);
  assert.equal(a.estado().erro, 'fora do ar');
  const b = criarFonteMotor({ url: fora, cache: path.join(pasta, 'nao-existe.json'), reserva, relogio: () => AGORA, log: registro() });
  assert.equal(b.festas().length, 1);
  assert.equal(b.estado().origem, 'arquivo');
  // Cache quebrado também cai no arquivo.
  const quebrado = path.join(pasta, 'quebrado.json');
  fs.writeFileSync(quebrado, '{');
  assert.equal(criarFonteMotor({ url: fora, cache: quebrado, reserva, log: registro() }).estado().origem, 'arquivo');
  assert.equal(criarFonteMotor({}), null);
});

test('boot a frio: com o motor respondendo em 500 ms, o primeiro pedido já serve a lista nova; o modo landing não cria a fonte', async () => {
  const m = await motorFalso();
  m.responder = (req, res) => setTimeout(() => enviar(200, envelope())(req, res), 500);
  const s = criarServidor({
    dados: DADOS, reais: null, varDir: path.join(pasta, 'var-boot'), log: registro(), relogio: () => AGORA, motorUrl: m.url, site: 'app', urlSite: 'https://finde.fly.dev/',
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  const inicio = Date.now();
  const f = await (await fetch(`${raiz}/api/formulario`)).json();
  assert.ok(Date.now() - inicio >= 400);
  assert.equal(f.reais, 3);
  assert.equal(f.base.atualizadoEm, '2026-11-26T09:05:00-03:00');
  assert.ok(fs.existsSync(path.join(pasta, 'var-boot', 'reais-cache.json')));
  // O id antigo abre a festa nova pelo link.
  const antiga = await (await fetch(`${raiz}/api/festa/noite-exemplo-20261205-c3d4`)).json();
  assert.equal(antiga.opcao.festa.id, 'noite-exemplo-20261205-a1b2');
  // A landing sozinha nunca fala com o motor.
  const antes = m.pedidos.length;
  const l = criarServidor({ dados: DADOS, reais: null, varDir: path.join(pasta, 'var-l'), log: registro(), motorUrl: m.url, site: 'landing', urlApp: 'https://finde-app.fly.dev/' });
  await new Promise((r) => l.listen(0, '127.0.0.1', r));
  abertos.push(l);
  await fetch(`http://127.0.0.1:${l.address().port}/`);
  assert.equal(m.pedidos.length, antes);
});

test('boot a frio com o motor mudo: depois de 2 s, segue com o que tem', async () => {
  const m = await motorFalso();
  m.responder = () => {}; // nunca responde
  const reserva = arquivo('reserva-boot.json', envelope([FIXTURE.festas[1]]));
  const f = criarFonteMotor({ url: m.url, reserva, relogio: () => AGORA, log: registro(), bootMs: 200, limiteMs: 1000 });
  const inicio = Date.now();
  await f.pronta();
  assert.ok(Date.now() - inicio < 900);
  assert.equal(f.festas().length, 1);
  // A segunda chamada não espera.
  const t = Date.now();
  await f.pronta();
  assert.ok(Date.now() - t < 50);
});

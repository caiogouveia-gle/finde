'use strict';
// Avaliações pós-festa (U25, R34, KTD13, D15): sem nome, uma por pessoa e
// por aparelho, só com idade, pendentes quando o motor está fora e enviadas
// depois. Motor falso em node:http local; nada sai da máquina.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { criarAvaliacoes, chave, FINALIDADE } = require('../nucleo/avaliacoes');
const { criarServidor } = require('../servidor');

const mudo = { info() {}, warn() {}, error() {} };
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-avaliacoes-'));
const abertos = [];
after(async () => {
  for (const s of abertos) await new Promise((r) => s.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});
let n = 0;
const novaPasta = () => path.join(pasta, `a${n++}`);
const TOKEN = 'token-de-teste-do-app';
const base = { festaId: 'festa-teste-20261128-aaaa', aparelho: 'aparelho-0001', resposta: 'na-medida', idade: 31, real: true };

async function motorFalso() {
  const m = { recebidos: [], status: 202 };
  m.servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (d) => (corpo += d));
    req.on('end', () => {
      m.recebidos.push({ url: req.url, metodo: req.method, auth: req.headers.authorization, corpo });
      res.writeHead(m.status, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise((r) => m.servidor.listen(0, '127.0.0.1', r));
  abertos.push(m.servidor);
  m.url = `http://127.0.0.1:${m.servidor.address().port}`;
  return m;
}

test('chave: HMAC de convite + nome em minúsculas, 16 hex; a mesma pessoa em dois convites tem chaves diferentes', () => {
  const k = chave('sal', 'abcd1234', 'Ju');
  assert.match(k, /^[a-f0-9]{16}$/);
  assert.equal(chave('sal', 'abcd1234', ' ju '), k);
  assert.notEqual(chave('sal', 'efgh5678', 'Ju'), k);
  assert.notEqual(chave('outro', 'abcd1234', 'Ju'), k);
  assert.equal(chave('sal', 'abcd1234', ''), null);
  assert.match(FINALIDADE, /Opcional/);
  assert.match(FINALIDADE, /31\/12\/2026/);
});

test('registrar: sem idade não conta; resposta estranha não entra; uma por nome e uma por aparelho', async () => {
  const dir = novaPasta();
  const a = criarAvaliacoes({ dir, log: mudo });
  assert.equal((await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju', idade: null })).motivo, 'idade');
  assert.equal((await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju', idade: 17 })).motivo, 'idade');
  assert.equal((await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju', resposta: 'talvez' })).motivo, 'resposta');
  assert.equal((await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju', aparelho: '<script>' })).motivo, 'aparelho');
  assert.deepEqual(a.contagem(base.festaId), { avaliacoes: 0, convites: 0 });
  const ok = await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.contagem, { avaliacoes: 1, convites: 1 });
  // A mesma pessoa no mesmo convite, de outro aparelho: repetida.
  assert.equal((await a.registrar({ ...base, planoId: 'abcd1234', nome: 'JU', aparelho: 'aparelho-0002' })).motivo, 'repetida');
  // Outro nome no mesmo aparelho, na mesma festa: o aparelho já avaliou.
  assert.equal((await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Bia' })).motivo, 'aparelho repetido');
  // A mesma pessoa em outro convite da mesma festa, de outro aparelho: conta.
  assert.equal((await a.registrar({ ...base, planoId: 'efgh5678', nome: 'Ju', aparelho: 'aparelho-0003' })).ok, true);
  assert.deepEqual(a.contagem(base.festaId), { avaliacoes: 2, convites: 2 });
  assert.equal(a.jaAvaliou('abcd1234', 'ju'), true);
  assert.equal(a.jaAvaliou('abcd1234', 'Bia'), false);
});

test('o arquivo não guarda nome nem o id do aparelho; o sal é 0600; o lote não leva nome', async () => {
  const dir = novaPasta();
  const a = criarAvaliacoes({ dir, log: mudo });
  await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Marina Exemplo' });
  const texto = fs.readFileSync(path.join(dir, 'avaliacoes.json'), 'utf8');
  assert.doesNotMatch(texto, /Marina|marina/);
  assert.doesNotMatch(texto, /aparelho-0001/);
  const [x] = JSON.parse(texto).avaliacoes;
  assert.deepEqual(Object.keys(x).sort(), ['aparelho', 'chave', 'em', 'festaId', 'idade', 'planoId', 'resposta']);
  assert.equal(fs.statSync(path.join(dir, 'avaliacoes-sal')).mode & 0o777, 0o600);
  const lote = a.loteDaFesta(base.festaId);
  assert.doesNotMatch(JSON.stringify(lote), /Marina|aparelho-0001/);
  assert.deepEqual(Object.keys(lote[0]).sort(), ['aparelho', 'chave', 'em', 'festaId', 'idade', 'plano', 'resposta']);
});

test('motor fora: fica pendente, sobrevive ao reinício e vai quando ele volta, com o Bearer e sem nome', async () => {
  const dir = novaPasta();
  const fora = criarAvaliacoes({ dir, motorUrl: 'http://127.0.0.1:9', token: TOKEN, log: mudo, limiteMs: 300 });
  await fora.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju' });
  await fora.ocioso();
  assert.deepEqual(fora.pendentes(), [base.festaId]);
  const m = await motorFalso();
  // Reinício: outro processo, o mesmo volume.
  const depois = criarAvaliacoes({ dir, motorUrl: m.url, token: TOKEN, log: mudo });
  assert.deepEqual(depois.pendentes(), [base.festaId]);
  assert.deepEqual(await depois.enviarPendentes(), { enviados: 1, pendentes: 0 });
  assert.equal(m.recebidos.length, 1);
  assert.equal(m.recebidos[0].url, '/api/avaliacoes');
  assert.equal(m.recebidos[0].metodo, 'POST');
  assert.equal(m.recebidos[0].auth, `Bearer ${TOKEN}`);
  const corpo = JSON.parse(m.recebidos[0].corpo);
  assert.equal(corpo.festaId, base.festaId);
  assert.equal(corpo.avaliacoes.length, 1);
  assert.doesNotMatch(m.recebidos[0].corpo, /Ju\b|aparelho-0001/);
  // O motor recusando (401) também deixa pendente.
  m.status = 401;
  await depois.registrar({ ...base, planoId: 'abcd1234', nome: 'Bia', aparelho: 'aparelho-0009' });
  await depois.ocioso();
  assert.deepEqual(depois.pendentes(), [base.festaId]);
  // Festa fictícia (demonstração) nunca vai ao motor.
  const antes = m.recebidos.length;
  await depois.registrar({ ...base, festaId: 'sexta-sem-pressa', real: false, planoId: 'abcd1234', nome: 'Caio', aparelho: 'aparelho-0010' });
  await depois.ocioso();
  assert.equal(m.recebidos.length, antes);
  assert.ok(!depois.pendentes().includes('sexta-sem-pressa'));
});

test('revisão app-7: com o motor pendurado, registrar responde sem esperar o reenvio das pendências', async () => {
  // Um motor que aceita a conexão e nunca responde.
  const pendurado = http.createServer(() => {});
  await new Promise((r) => pendurado.listen(0, '127.0.0.1', r));
  abertos.push(pendurado);
  const dir = novaPasta();
  const a = criarAvaliacoes({ dir, motorUrl: `http://127.0.0.1:${pendurado.address().port}`, token: TOKEN, log: mudo, limiteMs: 600 });
  const t0 = Date.now();
  const r = await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju' });
  assert.equal(r.ok, true);
  assert.ok(Date.now() - t0 < 300, `registrar levou ${Date.now() - t0} ms`);
  assert.deepEqual(a.pendentes(), [base.festaId]);
  // Duas respostas seguidas não abrem duas rodadas ao mesmo tempo.
  await a.registrar({ ...base, festaId: 'outra-festa-20261128-bbbb', planoId: 'abcd1234', nome: 'Bia', aparelho: 'aparelho-0002' });
  await a.ocioso();
  assert.deepEqual(a.pendentes().sort(), [base.festaId, 'outra-festa-20261128-bbbb'].sort());
  pendurado.closeAllConnections();
});

test('verif-app-2: a avaliação que entra com o lote da mesma festa em voo vai numa volta seguinte', async () => {
  // Um fetch falso que segura a primeira chamada até o teste soltar.
  const lotes = [];
  let soltar;
  const primeira = new Promise((ok) => (soltar = ok));
  const buscar = async (url, { body }) => {
    const corpo = JSON.parse(body);
    if (!lotes.length) {
      lotes.push(corpo.avaliacoes.length);
      await primeira;
    } else lotes.push(corpo.avaliacoes.length);
    return { status: 202 };
  };
  const a = criarAvaliacoes({ dir: novaPasta(), motorUrl: 'http://motor.invalido', token: TOKEN, fetch: buscar, log: mudo });
  await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ana' });
  await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Bia', aparelho: 'aparelho-0002' });
  soltar();
  await a.ocioso();
  assert.deepEqual(lotes, [1, 2]);
  assert.deepEqual(a.pendentes(), []);
  assert.equal(a.contagem(base.festaId).avaliacoes, 2);
});

test('expurgar apaga as avaliações, as pendências e o sal (D15)', async () => {
  const dir = novaPasta();
  const a = criarAvaliacoes({ dir, log: mudo });
  await a.registrar({ ...base, planoId: 'abcd1234', nome: 'Ju' });
  assert.deepEqual(await a.expurgar(), { apagados: 1 });
  assert.equal(fs.existsSync(path.join(dir, 'avaliacoes.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'avaliacoes-sal')), false);
  assert.deepEqual(a.contagem(base.festaId), { avaliacoes: 0, convites: 0 });
});

// ---------------------------------------------------------------- no servidor

const CONF = '2026-11-16T21:56:00-03:00';
const r14 = (extra = {}) => ({
  contrato: 'finde-r14/3', id: 'festa-teste-20261128-aaaa', nome: 'Festa Teste', produtora: null, casa: 'Casa Teste',
  endereco: { texto: 'Rua Teste, 10', bairro: 'pinheiros', cidade: 'São Paulo', cidadeOrigem: 'fonte' },
  data: '2026-11-28', dataDaNoite: '2026-11-28', inicio: '2026-11-28T22:00:00-03:00', pistaCheia: null, fim: '2026-11-29T04:00:00-03:00',
  lotes: [], precoAPartirDe: null, esgotado: false, entradaNaPorta: null, linkCompra: null, linkEvento: null, instagram: null,
  imagens: [], cartaz: null, paginas: [], lineup: null, estilos: [], idadeMinima: null, regras: {}, mediaIdade: null, ehFesta: true, exemplo: false,
  fontes: [{ id: 'indicacao', nome: 'Lido', url: null, conferidoEm: CONF }], divergencias: [], idsAntigos: [], revisar: [], coletadoEm: CONF, campos: {},
  ...extra,
});

test('POST /api/planos/:id/avaliacao: só "tô dentro", só depois da festa, com idade, uma por aparelho; o lote vai ao motor', async () => {
  const m = await motorFalso();
  const reais = path.join(pasta, 'reais-av.json');
  fs.writeFileSync(reais, JSON.stringify({ contrato: 'finde-r14/3', geradoEm: '2026-11-26T12:00:00.000Z', festas: [r14()] }));
  let agora = Date.parse('2026-11-27T12:00:00-03:00');
  const varDir = path.join(pasta, 'var-av');
  const s = criarServidor({ dados: path.join(__dirname, '..', 'dados', 'festas.json'), reais, varDir, log: mudo, relogio: () => agora, motorUrl: null, appToken: TOKEN });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  const chamar = async (metodo, caminho, corpo) => {
    const r = await fetch(raiz + caminho, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, corpo: await r.json() };
  };
  const PEDIDO = { dia: 'sab', janela: 'noite', faixa: '30-35', teto: 'sem-limite' };
  const p = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'festa-teste-20261128-aaaa', autor: 'Ju' });
  assert.equal(p.status, 201);
  await chamar('POST', `/api/planos/${p.corpo.id}/respostas`, { nome: 'Bia', resposta: 'fora' });
  const avaliar = (corpo) => chamar('POST', `/api/planos/${p.corpo.id}/avaliacao`, { aparelho: 'aparelho-0001', resposta: 'na-medida', idade: 31, ...corpo });
  // Antes da festa: a pergunta ainda não abriu.
  assert.equal((await avaliar({ nome: 'Ju' })).status, 409);
  let v = (await chamar('GET', `/api/planos/${p.corpo.id}`)).corpo;
  assert.equal(v.podeAvaliar, false);
  assert.match(v.finalidadeAvaliacao, /31\/12\/2026/);
  agora = Date.parse('2026-11-29T12:00:00-03:00');
  v = (await chamar('GET', `/api/planos/${p.corpo.id}`)).corpo;
  assert.equal(v.podeAvaliar, true);
  assert.deepEqual(v.avaliacoes, { total: 0, convites: 0 });
  // Quem disse "não rola" e quem nem respondeu não avaliam.
  assert.equal((await avaliar({ nome: 'Bia' })).status, 403);
  assert.equal((await avaliar({ nome: 'Desconhecida' })).status, 403);
  // Sem idade, não conta.
  assert.equal((await avaliar({ nome: 'Ju', idade: null })).status, 400);
  const ok = await avaliar({ nome: 'ju' });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.corpo.avaliacoes, { total: 1, convites: 1 });
  // Repetida: o mesmo nome, ou o mesmo aparelho.
  assert.equal((await avaliar({ nome: 'Ju', aparelho: 'aparelho-0002' })).status, 409);
  v = (await chamar('GET', `/api/planos/${p.corpo.id}`)).corpo;
  assert.deepEqual(v.avaliacoes, { total: 1, convites: 1 });
  assert.doesNotMatch(JSON.stringify(v.avaliacoes), /Ju/);
  // Nome fora do arquivo de avaliações; sem motor ligado, nada pendente.
  assert.doesNotMatch(fs.readFileSync(path.join(varDir, 'avaliacoes.json'), 'utf8'), /"Ju"|ju\b/);
  assert.equal(m.recebidos.length, 0);
  // Método errado.
  assert.equal((await chamar('GET', `/api/planos/${p.corpo.id}/avaliacao`)).status, 405);
});

test('POST /api/planos/:id/avaliacao com o motor ligado: o lote da festa real chega com o Bearer', async () => {
  const m = await motorFalso();
  // O motor também serve a lista, para o app ter a festa real.
  const antigo = m.servidor.listeners('request')[0];
  m.servidor.removeAllListeners('request');
  m.servidor.on('request', (req, res) => {
    if (req.url.startsWith('/api/festas')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ contrato: 'finde-r14/3', geradoEm: '2026-11-26T12:00:00.000Z', execucaoId: 1, total: 1, festas: [r14()] }));
    }
    return antigo(req, res);
  });
  let agora = Date.parse('2026-11-27T12:00:00-03:00');
  const s = criarServidor({ dados: path.join(__dirname, '..', 'dados', 'festas.json'), reais: null, varDir: path.join(pasta, 'var-av2'), log: mudo, relogio: () => agora, motorUrl: m.url, appToken: TOKEN });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  const post = async (caminho, corpo) => fetch(raiz + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const p = await (await post('/api/planos', { criterios: { dia: 'sab', janela: 'noite', faixa: '30-35', teto: 'sem-limite' }, festa: 'festa-teste-20261128-aaaa', autor: 'Ju' })).json();
  agora = Date.parse('2026-11-29T12:00:00-03:00');
  const r = await post(`/api/planos/${p.id}/avaliacao`, { nome: 'Ju', aparelho: 'aparelho-0001', resposta: 'mais-velho', idade: 29 });
  assert.equal(r.status, 201);
  // O lote vai por trás, depois do 201.
  for (let i = 0; i < 80 && !m.recebidos.some((x) => x.url === '/api/avaliacoes'); i++) await new Promise((ok) => setTimeout(ok, 25));
  const enviado = m.recebidos.find((x) => x.url === '/api/avaliacoes');
  assert.ok(enviado);
  assert.equal(enviado.auth, `Bearer ${TOKEN}`);
  const corpo = JSON.parse(enviado.corpo);
  assert.equal(corpo.festaId, 'festa-teste-20261128-aaaa');
  assert.deepEqual(corpo.avaliacoes.map((x) => [x.resposta, x.idade, x.plano]), [['mais-velho', 29, p.id]]);
  assert.doesNotMatch(enviado.corpo, /"Ju"|aparelho-0001/);
});

'use strict';
// A API de verdade, num servidor de teste em porta efêmera.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { criarServidor } = require('../servidor');

const FIXTURE = path.join(__dirname, 'fixture.json');
const mudo = { info() {}, warn() {}, error() {} };
let servidor;
let raiz;
let pasta;

const completos = {
  quem: 'amigos', quando: 'sab-noite', regiao: 'qualquer', preco: 2, clima: 'conversar', comida: 'pode',
};

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-teste-'));
  servidor = criarServidor({ dados: FIXTURE, varDir: pasta, log: mudo });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  raiz = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(raiz + caminho, {
    method: metodo,
    headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, cabecalhos: r.headers, corpo: tipo.includes('json') ? await r.json() : await r.text() };
}

// Caminho cru, sem o fetch normalizar "..".
function cru(caminho) {
  return new Promise((resolve, reject) => {
    const u = new URL(raiz);
    http.get({ host: u.hostname, port: u.port, path: caminho }, (res) => {
      let dados = '';
      res.on('data', (d) => (dados += d));
      res.on('end', () => resolve({ status: res.statusCode, corpo: dados }));
    }).on('error', reject);
  });
}

async function novoPlano(autor = 'Caio') {
  const conversa = await chamar('POST', '/api/conversa', { criterios: completos });
  const ids = conversa.corpo.opcoes.map((o) => o.experiencia.id);
  const r = await chamar('POST', '/api/planos', { criterios: conversa.corpo.criterios, opcoes: ids, autor });
  assert.equal(r.status, 201);
  return { id: r.corpo.id, ids, url: r.corpo.url };
}

test('GET /api/base conta a base e as regiões, sem cache', async () => {
  const r = await chamar('GET', '/api/base');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.total, 14);
  assert.equal(r.corpo.regioes.length, 3);
  assert.equal(r.corpo.regioes.reduce((s, x) => s + x.total, 0), 14);
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
  assert.match(r.cabecalhos.get('content-security-policy'), /script-src 'self'/);
});

test('conversa: pergunta o que falta, na ordem do contrato', async () => {
  const r = await chamar('POST', '/api/conversa', { criterios: {} });
  assert.deepEqual(r.corpo.falta, ['quando', 'quem', 'regiao', 'preco', 'clima', 'comida']);
  const t = await chamar('POST', '/api/conversa', { criterios: {}, texto: 'sábado à noite, somos 4, Pinheiros, até 80' });
  assert.deepEqual(t.corpo.falta, ['clima', 'comida']);
  assert.deepEqual(t.corpo.entendido.sort(), ['preco', 'quando', 'quem', 'regiao']);
  assert.equal(t.corpo.criterios.regiao, 'pinheiros-vila-madalena');
});

test('conversa: com tudo, devolve três opções; ajuste refaz', async () => {
  const r = await chamar('POST', '/api/conversa', { criterios: completos });
  assert.equal(r.corpo.opcoes.length, 3);
  assert.equal(r.corpo.falta, undefined);
  const ajuste = await chamar('POST', '/api/conversa', { criterios: r.corpo.criterios, texto: 'mais barato' });
  assert.equal(ajuste.corpo.criterios.preco, 1);
  assert.deepEqual(ajuste.corpo.entendido, ['preco']);
  assert.ok(ajuste.corpo.opcoes.every((o) => o.experiencia.preco <= 1 || ajuste.corpo.aviso));
  const solta = await chamar('POST', '/api/conversa', { criterios: {}, texto: 'tanto faz', pergunta: 'regiao' });
  assert.equal(solta.corpo.criterios.regiao, 'qualquer');
});

test('conversa: critério inválido é ignorado; texto não-string é 400', async () => {
  const r = await chamar('POST', '/api/conversa', { criterios: { ...completos, preco: 99 } });
  assert.deepEqual(r.corpo.falta, ['preco']);
  const ruim = await chamar('POST', '/api/conversa', { criterios: {}, texto: 42 });
  assert.equal(ruim.status, 400);
  assert.ok(ruim.corpo.erro);
});

test('trocar: substituta nova e id no evitar', async () => {
  const r = await chamar('POST', '/api/conversa', { criterios: completos });
  const ids = r.corpo.opcoes.map((o) => o.experiencia.id);
  const t = await chamar('POST', '/api/trocar', { criterios: r.corpo.criterios, id: ids[2], atuais: ids });
  assert.equal(t.status, 200);
  assert.ok(!ids.includes(t.corpo.opcao.experiencia.id));
  assert.ok(t.corpo.criterios.evitar.includes(ids[2]));
  const incompleto = await chamar('POST', '/api/trocar', { criterios: { quem: 'so' }, id: ids[0] });
  assert.equal(incompleto.status, 400);
});

test('planos: criar e ler com opções inteiras', async () => {
  const { id, ids, url } = await novoPlano();
  assert.match(id, /^[a-z0-9]{8}$/);
  assert.equal(url, `/p/${id}`);
  const r = await chamar('GET', `/api/planos/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.autor, 'Caio');
  assert.deepEqual(r.corpo.opcoes.map((o) => o.experiencia.id), ids);
  assert.ok(r.corpo.opcoes[0].experiencia.nome);
  assert.ok(r.corpo.opcoes[0].motivos.length >= 2);
  assert.deepEqual(r.corpo.opcoes[0].votos, []);
  assert.equal(r.corpo.fechado, null);
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
  // Gravado em disco, sem arquivo temporário sobrando.
  const arquivos = fs.readdirSync(pasta);
  assert.deepEqual(arquivos, ['planos.json']);
  assert.ok(JSON.parse(fs.readFileSync(path.join(pasta, 'planos.json'), 'utf8'))[id]);
});

test('planos: votar, trocar o voto (um por nome, sem caixa)', async () => {
  const { id, ids } = await novoPlano();
  let r = await chamar('POST', `/api/planos/${id}/votos`, { nome: 'Ana', opcao: ids[0] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.opcoes[0].votos, ['Ana']);
  r = await chamar('POST', `/api/planos/${id}/votos`, { nome: 'ana', opcao: ids[1] });
  assert.deepEqual(r.corpo.opcoes[0].votos, []);
  assert.deepEqual(r.corpo.opcoes[1].votos, ['ana']);
  assert.equal(r.corpo.totalVotos, 1);
  const fora = await chamar('POST', `/api/planos/${id}/votos`, { nome: 'Bia', opcao: 'nao-esta-no-plano' });
  assert.equal(fora.status, 400);
  const semNome = await chamar('POST', `/api/planos/${id}/votos`, { nome: '   ', opcao: ids[0] });
  assert.equal(semNome.status, 400);
  assert.match(semNome.corpo.erro, /nome/);
});

test('planos: fechar pede dois votos e desempata pela de cima', async () => {
  const { id, ids } = await novoPlano();
  await chamar('POST', `/api/planos/${id}/votos`, { nome: 'Ana', opcao: ids[2] });
  const cedo = await chamar('POST', `/api/planos/${id}/fechar`, { nome: 'Ana' });
  assert.equal(cedo.status, 409);
  await chamar('POST', `/api/planos/${id}/votos`, { nome: 'Bia', opcao: ids[1] });
  const r = await chamar('POST', `/api/planos/${id}/fechar`, { nome: 'Bia' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.fechado.opcao, ids[1], 'empate 1 a 1: fica a que está mais acima');
  assert.equal(r.corpo.fechado.por, 'Bia');
  assert.ok(r.corpo.fechado.em);
  const depois = await chamar('POST', `/api/planos/${id}/votos`, { nome: 'Caio', opcao: ids[0] });
  assert.equal(depois.status, 409);
  const denovo = await chamar('POST', `/api/planos/${id}/fechar`, { nome: 'Caio' });
  assert.equal(denovo.corpo.fechado.por, 'Bia');
});

test('planos: fechar fica com a mais votada', async () => {
  const { id, ids } = await novoPlano();
  for (const [nome, i] of [['Ana', 0], ['Bia', 2], ['Caio', 2]]) {
    await chamar('POST', `/api/planos/${id}/votos`, { nome, opcao: ids[i] });
  }
  const r = await chamar('POST', `/api/planos/${id}/fechar`, { nome: 'Ana' });
  assert.equal(r.corpo.fechado.opcao, ids[2]);
});

test('planos: nome com HTML vira texto limpo e curto', async () => {
  const { id, ids } = await novoPlano('<img src=x onerror=alert(1)>Duda<b>!</b>');
  let r = await chamar('GET', `/api/planos/${id}`);
  assert.equal(r.corpo.autor, 'Duda!');
  r = await chamar('POST', `/api/planos/${id}/votos`, { nome: '<script>x</script>Eva com um nome comprido demais da conta', opcao: ids[0] });
  const nome = r.corpo.opcoes[0].votos[0];
  assert.doesNotMatch(nome, /[<>]/);
  assert.ok([...nome].length <= 24);
  const soHtml = await chamar('POST', '/api/planos', { criterios: completos, opcoes: ids, autor: '<b></b>' });
  assert.equal(soHtml.status, 400);
});

test('planos: corpo grande demais é recusado', async () => {
  const { id, ids } = await novoPlano();
  const grande = JSON.stringify({ nome: 'Ana', opcao: ids[0], lixo: 'x'.repeat(20 * 1024) });
  const r = await chamar('POST', `/api/planos/${id}/votos`, grande);
  assert.equal(r.status, 413);
  assert.match(r.corpo.erro, /grande/);
  const lido = await chamar('GET', `/api/planos/${id}`);
  assert.equal(lido.corpo.totalVotos, 0);
});

test('planos: id inexistente é 404 com erro em português', async () => {
  for (const [metodo, caminho, corpo] of [
    ['GET', '/api/planos/zzzzzzzz'],
    ['POST', '/api/planos/zzzzzzzz/votos', { nome: 'Ana', opcao: 'masp' }],
    ['POST', '/api/planos/zzzzzzzz/fechar', { nome: 'Ana' }],
    ['GET', '/api/planos/__proto__'],
  ]) {
    const r = await chamar(metodo, caminho, corpo);
    assert.equal(r.status, 404, caminho);
    assert.match(r.corpo.erro, /não existe/);
  }
});

test('planos: pedido malformado é 400', async () => {
  const json = await chamar('POST', '/api/planos', '{isso não é json');
  assert.equal(json.status, 400);
  const semOpcoes = await chamar('POST', '/api/planos', { criterios: completos, opcoes: [], autor: 'Ana' });
  assert.equal(semOpcoes.status, 400);
  const inventada = await chamar('POST', '/api/planos', { criterios: completos, opcoes: ['nao-existe'], autor: 'Ana' });
  assert.equal(inventada.status, 400);
  const repetida = await chamar('POST', '/api/planos', { criterios: completos, opcoes: ['masp', 'masp'], autor: 'Ana' });
  assert.equal(repetida.status, 400);
});

test('páginas e estáticos, com CSP e sem path traversal', async () => {
  const home = await chamar('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.corpo, /<html lang="pt-BR"/);
  assert.doesNotMatch(home.corpo, /<script>(?!<\/script>)/, 'nada de script inline');
  assert.match(home.cabecalhos.get('content-security-policy'), /fonts\.gstatic\.com/);
  const plano = await chamar('GET', '/p/abcdefgh');
  assert.equal(plano.status, 200);
  assert.match(plano.corpo, /plano\.js/);
  const css = await chamar('GET', '/app.css');
  assert.equal(css.status, 200);
  assert.match(css.cabecalhos.get('content-type'), /text\/css/);

  for (const caminho of ['/../servidor.js', '/%2e%2e/servidor.js', '/..%2fservidor.js', '/%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/publico/../../servidor.js']) {
    const r = await cru(caminho);
    assert.ok([400, 404].includes(r.status), `${caminho} -> ${r.status}`);
    assert.doesNotMatch(r.corpo, /criarServidor/);
  }
  const nada = await chamar('GET', '/nao-existe.html');
  assert.equal(nada.status, 404);
  assert.ok(nada.corpo.erro);
  const api = await chamar('GET', '/api/nada');
  assert.equal(api.status, 404);
  assert.match(api.corpo.erro, /Não achei/);
});

test('sem a base, cai na fixture com aviso no log', async () => {
  const avisos = [];
  const log = { info() {}, error() {}, warn: (m) => avisos.push(m) };
  const s = criarServidor({ dados: path.join(pasta, 'nao-existe.json'), varDir: path.join(pasta, 'outra'), log });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/base`).then((x) => x.json());
  await new Promise((r2) => s.close(r2));
  assert.equal(r.total, 14);
  assert.match(avisos.join('\n'), /fixture/);
});

test('linhas inválidas da base são ignoradas com aviso', async () => {
  const linhas = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  linhas.push({ id: 'quebrada', nome: 'Sem o resto' });
  const arquivo = path.join(pasta, 'base-com-erro.json');
  fs.writeFileSync(arquivo, JSON.stringify(linhas));
  const avisos = [];
  const log = { info() {}, error() {}, warn: (m) => avisos.push(m) };
  const s = criarServidor({ dados: arquivo, varDir: path.join(pasta, 'terceira'), log });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/base`).then((x) => x.json());
  await new Promise((r2) => s.close(r2));
  assert.equal(r.total, 14);
  assert.match(avisos.join('\n'), /ignorei quebrada/);
});

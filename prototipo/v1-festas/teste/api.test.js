'use strict';
// A API de verdade, num servidor de teste em porta efêmera.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { criarServidor } = require('../servidor');

const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
const mudo = { info() {}, warn() {}, error() {} };
const PEDIDO = { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80, estilos: ['house-disco', 'pop-2000'] };
let servidor;
let raiz;
let pasta;

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-api-'));
  servidor = criarServidor({ dados: DADOS, varDir: path.join(pasta, 'var'), log: mudo });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  raiz = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function chamar(metodo, caminho, corpo, cabecalhos = {}) {
  const r = await fetch(raiz + caminho, {
    method: metodo,
    headers: corpo === undefined ? cabecalhos : { 'Content-Type': 'application/json', ...cabecalhos },
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

async function conversar(criterios, atuais, texto) {
  return chamar('POST', '/api/conversa', { criterios, atuais, texto });
}

test('GET /api/formulario traz as cinco perguntas e a contagem, sem cache', async () => {
  const r = await chamar('GET', '/api/formulario');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.total, 37);
  assert.equal(r.corpo.ficticia, true);
  assert.deepEqual(r.corpo.dias.map((d) => d.id), ['sex', 'sab', 'dom']);
  assert.deepEqual(r.corpo.faixas.map((f) => f.rotulo), ['18 a 24', '25 a 29', '30 a 35', '36 ou mais']);
  assert.deepEqual(r.corpo.tetos.map((t) => t.rotulo), ['R$ 50', 'R$ 80', 'R$ 150', 'Sem limite']);
  assert.equal(r.corpo.estilos.length, 6);
  assert.match(r.corpo.janelas[1].rotulo, /19h à 1h · começo da noite/);
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
});

test('CSP: tudo daqui, fontes incluídas; sem script inline', async () => {
  const r = await chamar('GET', '/');
  const csp = r.cabecalhos.get('content-security-policy');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.match(csp, /font-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /googleapis|gstatic/);
  assert.doesNotMatch(r.corpo, /googleapis|gstatic/);
  const fonte = await fetch(`${raiz}/fontes/instrument-serif.woff2`);
  assert.equal(fonte.headers.get('content-type'), 'font/woff2');
  assert.match(fonte.headers.get('cache-control'), /immutable/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
  assert.doesNotMatch(r.corpo, /<script(?![^>]*\b(src=|type="application\/json"))[^>]*>/);
  assert.doesNotMatch(r.corpo, /style=/);
});

test('POST /api/festas: três festas com linha, motivos e a fala de abertura', async () => {
  const r = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.opcoes.map((o) => o.festa.id), ['funk-ao-entardecer', 'sabado-groove', 'noite-aurora']);
  assert.equal(r.corpo.resposta, 'A primeira enche antes e custa menos.');
  assert.equal(r.corpo.atendem, 3);
  assert.ok(r.corpo.opcoes.every((o) => o.origem && o.origem.longa));
  assert.deepEqual(r.corpo.pedidoPartes.map((x) => x.texto), ['Sábado', 'das 19h à 1h', 'gente de 30 a 35', 'até R$ 80', 'house ou pop 2000']);
  assert.match(r.corpo.pedido, /^Sáb · 19h à 1h · 30 a 35 · até R\$ 80/);
  assert.equal(r.corpo.opcoes[2].patrocinada, true);
  assert.equal(r.corpo.opcoes[0].patrocinada, false);
});

test('POST /api/festas sem as quatro respostas devolve 400 dizendo o que falta', async () => {
  const r = await chamar('POST', '/api/festas', { criterios: { dia: 'sab' } });
  assert.equal(r.status, 400);
  assert.equal(r.corpo.erro, 'Faltou responder umas perguntas. Vamos do começo?');
  assert.deepEqual(r.corpo.faltam, ['janela', 'faixa', 'teto']);
});

test('conversa: "mais perto de Pinheiros" responde com minutos', async () => {
  const inicio = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  const atuais = inicio.corpo.opcoes.map((o) => o.festa.id);
  const r = await conversar(inicio.corpo.criterios, atuais, 'tem alguma mais perto de Pinheiros?');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.criterios.perto, 'pinheiros');
  assert.match(r.corpo.resposta, /^(Duas|Todas) ficam a até \d+ min de Pinheiros\./);
  assert.equal(r.corpo.entendeu, true);
});

test('conversa: "mais barato" diz o teto e o que entrou e saiu', async () => {
  const inicio = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  const atuais = inicio.corpo.opcoes.map((o) => o.festa.id);
  const r = await conversar(inicio.corpo.criterios, atuais, 'mais barato');
  assert.equal(r.corpo.criterios.teto, 50);
  assert.deepEqual(r.corpo.criterios.firmes, ['preco']);
  assert.match(r.corpo.resposta, /^Até R\$ 50, então\./);
  assert.ok(r.corpo.entraram.length > 0);
  assert.ok(r.corpo.opcoes.every((o) => o.festa.preco <= 50));
});

test('conversa: o slogan só vem quando tudo acaba até a meia-noite; "domingo" troca o dia', async () => {
  const inicio = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  const atuais = inicio.corpo.opcoes.map((o) => o.festa.id);
  const cedo = await conversar(inicio.corpo.criterios, atuais, 'mais cedo');
  assert.match(cedo.corpo.resposta, /^Puxei pro fim de tarde, das 17h às 23h\./);
  const dormeBem = cedo.corpo.opcoes.every((o) => o.festa.fim <= 24);
  assert.equal(/Dança cedo, dorme bem/.test(cedo.corpo.resposta), false);
  const volta = await conversar(inicio.corpo.criterios, atuais, 'quero voltar até as 23h');
  assert.ok(volta.corpo.opcoes.every((o) => o.festa.fim <= 23));
  assert.match(volta.corpo.resposta, /^Voltando até as 23h\./);
  const dom = await conversar(inicio.corpo.criterios, atuais, 'domingo');
  assert.ok(dom.corpo.opcoes.every((o) => o.festa.dia === 'dom'));
  assert.match(dom.corpo.resposta, /^Domingo, então\./);
});

test('conversa: frase que não entende mantém a lista e diz como pedir', async () => {
  const inicio = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  const atuais = inicio.corpo.opcoes.map((o) => o.festa.id);
  const r = await conversar(inicio.corpo.criterios, atuais, 'qual o sentido da vida');
  assert.equal(r.corpo.entendeu, false);
  assert.deepEqual(r.corpo.opcoes.map((o) => o.festa.id), atuais);
  assert.match(r.corpo.resposta, /^Não peguei\. Dá pra pedir/);
});

test('conversa: texto vazio, longo demais ou lista estranha dão 400', async () => {
  assert.equal((await conversar(PEDIDO, [], '   ')).status, 400);
  assert.equal((await conversar(PEDIDO, [], 'a'.repeat(301))).status, 400);
  assert.equal((await conversar(PEDIDO, ['../x'], 'mais cedo')).status, 400);
  assert.equal((await conversar(PEDIDO, 'sabado-groove', 'mais cedo')).status, 400);
});

test('planos: criar, abrir /p/:id, responder, ver os nomes', async () => {
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove', autor: 'Bruna' });
  assert.equal(criado.status, 201);
  assert.match(criado.corpo.url, /^\/p\/[a-z0-9]{8}$/);
  const pagina = await chamar('GET', criado.corpo.url);
  assert.equal(pagina.status, 200);
  assert.match(pagina.corpo, /plano\.js/);

  const caminho = `/api/planos/${criado.corpo.id}`;
  const lido = await chamar('GET', caminho);
  assert.equal(lido.corpo.festa.festa.nome, 'Sábado Groove');
  assert.equal(lido.corpo.festa.linha, 'Sáb · 19h00 · Pinheiros · média 31 anos');
  assert.deepEqual(lido.corpo.dentro, ['Bruna']);

  await chamar('POST', `${caminho}/respostas`, { nome: 'Ju', resposta: 'dentro' });
  const r = await chamar('POST', `${caminho}/respostas`, { nome: 'Léo', resposta: 'fora' });
  assert.deepEqual(r.corpo.dentro, ['Bruna', 'Ju']);
  assert.deepEqual(r.corpo.fora, ['Léo']);
});

test('planos: nome com HTML é guardado como texto e nunca vira HTML na página', async () => {
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove', autor: '<script>x</script>' });
  assert.equal(criado.status, 201);
  const r = await chamar('POST', `/api/planos/${criado.corpo.id}/respostas`, { nome: '<img src=x>Ju', resposta: 'dentro' });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.dentro.includes('<img src=x>Ju'));
  const pagina = await chamar('GET', `/p/${criado.corpo.id}`);
  assert.doesNotMatch(pagina.corpo, /<script>x|<img src=x/);
});

test('planos: autor inválido dá 400', async () => {
  assert.equal((await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove', autor: 42 })).status, 400);
  assert.equal((await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove', autor: '\u0001\u0002' })).status, 400);
});

test('planos: nome repetido pergunta antes de trocar', async () => {
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove', autor: 'Ju' });
  const caminho = `/api/planos/${criado.corpo.id}/respostas`;
  const r = await chamar('POST', caminho, { nome: 'ju', resposta: 'fora' });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro, 'Já tem Ju na lista. É você?');
  assert.equal(r.corpo.duplicado, 'Ju');
  const ok = await chamar('POST', caminho, { nome: 'ju', resposta: 'fora', confirmar: true });
  assert.deepEqual(ok.corpo.fora, ['ju']);
});

test('convite: guarda a data da festa e diz quando já foi', async () => {
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove', autor: 'Bruna' });
  const lido = await chamar('GET', `/api/planos/${criado.corpo.id}`);
  assert.match(lido.corpo.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${lido.corpo.data}T12:00:00`).getDay(), 6);
  assert.equal(lido.corpo.passou, false);
});

test('convite vencido não aceita resposta', () => {
  const { criarPlanos } = require('../nucleo/planos');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-vencido-'));
  let hoje = '2026-11-10T12:00:00.000Z';
  const planos = criarPlanos(dir, { agora: () => hoje, log: mudo });
  const p = planos.criar({ festa: { festa: { id: 'x' } }, quando: { data: '2026-11-14', ate: '2026-11-15T04:00:00.000Z' } });
  assert.equal(planos.ler(p.id).passou, false);
  hoje = '2026-11-16T12:00:00.000Z';
  assert.equal(planos.ler(p.id).passou, true);
  assert.throws(() => planos.responder(p.id, 'Ju', 'dentro'), (e) => e.status === 410);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a página inicial já vem com os dados da primeira tela', async () => {
  const r = await chamar('GET', '/');
  const m = r.corpo.match(/<script type="application\/json" id="dados-iniciais">([^<]*)<\/script>/);
  assert.ok(m, 'sem dados iniciais');
  const dados = JSON.parse(m[1]);
  assert.equal(dados.total, 37);
  assert.ok(dados.proxima && dados.proxima.nome);
});

test('/p/:id: 404 quando não existe; quando existe, as metas de compartilhamento dizem a festa', async () => {
  const nao = await chamar('GET', '/p/naoexiste');
  assert.equal(nao.status, 404);
  assert.match(nao.corpo, /plano\.js/);
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove' });
  const sim = await chamar('GET', `/p/${criado.corpo.id}`);
  assert.equal(sim.status, 200);
  assert.match(sim.corpo, /<meta property="og:title" content="Bora no sábado\? Sábado Groove, 19h00 · média 31">/);
  assert.match(sim.corpo, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/compartilhar\.png">/);
  assert.equal((await chamar('GET', '/plano.html')).status, 404);
  const inicio = await chamar('GET', '/');
  assert.match(inicio.corpo, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/compartilhar\.png"/);
  assert.match(inicio.corpo, /apple-touch-icon" href="\/icone-180\.png"/);
});

test('planos: festa inexistente, id torto, resposta estranha, método errado', async () => {
  assert.equal((await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'nao-existe' })).status, 400);
  assert.equal((await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: '../../x' })).status, 400);
  assert.equal((await chamar('GET', '/api/planos/naoexiste')).status, 404);
  assert.equal((await chamar('GET', '/api/planos/__proto__')).status, 404);
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove' });
  assert.equal((await chamar('POST', `/api/planos/${criado.corpo.id}/respostas`, { nome: 'Ju', resposta: 'talvez' })).status, 400);
  assert.equal((await chamar('DELETE', `/api/planos/${criado.corpo.id}`)).status, 405);
  assert.equal((await chamar('GET', '/api/festas')).status, 405);
  assert.equal((await chamar('GET', '/api/nada')).status, 404);
});

test('corpo grande demais: 413', async () => {
  const r = await chamar('POST', '/api/festas', JSON.stringify({ criterios: PEDIDO, lixo: 'x'.repeat(20 * 1024) }));
  assert.equal(r.status, 413);
});

test('corpo que não é objeto JSON: 400', async () => {
  assert.equal((await chamar('POST', '/api/festas', '{quebrado')).status, 400);
  assert.equal((await chamar('POST', '/api/festas', '[1,2]')).status, 400);
});

test('path traversal não sai de publico/', async () => {
  for (const c of [
    '/../servidor.js', '/..%2fservidor.js', '/%2e%2e/servidor.js', '/%2e%2e%2fdados%2ffestas.json',
    '/..%5cservidor.js', '/publico/../../servidor.js', '/%00', '/%E0%A4%A',
  ]) {
    const r = await cru(c);
    assert.ok([400, 404].includes(r.status), `${c} devolveu ${r.status}`);
    assert.doesNotMatch(r.corpo, /criarServidor|"festas"/, c);
  }
});

test('estáticos: CSS, JS e favicon com o tipo certo', async () => {
  const css = await chamar('GET', '/app.css');
  assert.match(css.cabecalhos.get('content-type'), /text\/css/);
  const js = await chamar('GET', '/tema.js');
  assert.match(js.cabecalhos.get('content-type'), /javascript/);
  const svg = await chamar('GET', '/favicon.svg');
  assert.match(svg.cabecalhos.get('content-type'), /svg/);
});

test('base com linha inválida: o servidor sobe, ignora a linha e avisa no log', async () => {
  const outra = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-base-'));
  const arquivo = path.join(outra, 'festas.json');
  const { festas } = JSON.parse(fs.readFileSync(DADOS, 'utf8'));
  fs.writeFileSync(arquivo, JSON.stringify({ festas: [...festas, { id: 'ruim', nome: '' }] }));
  const avisos = [];
  const s = criarServidor({ dados: arquivo, varDir: path.join(outra, 'var'), log: { info() {}, warn: (m) => avisos.push(m), error() {} } });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/formulario`).then((x) => x.json());
  await new Promise((r2) => s.close(r2));
  fs.rmSync(outra, { recursive: true, force: true });
  assert.equal(r.total, festas.length);
  assert.ok(avisos.some((a) => /"ruim"/.test(a)));
});

test('base ausente: sobe vazio, avisa e responde sem quebrar', async () => {
  const outra = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-vazio-'));
  const avisos = [];
  const s = criarServidor({ dados: path.join(outra, 'nao.json'), varDir: path.join(outra, 'var'), log: { info() {}, warn: (m) => avisos.push(m), error() {} } });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const porta = s.address().port;
  const r = await fetch(`http://127.0.0.1:${porta}/api/festas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: PEDIDO }),
  }).then((x) => x.json());
  await new Promise((r2) => s.close(r2));
  fs.rmSync(outra, { recursive: true, force: true });
  assert.deepEqual(r.opcoes, []);
  assert.match(r.aviso, /vazia/);
  assert.ok(avisos.some((a) => /não existe/.test(a)));
});

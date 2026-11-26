'use strict';
// A API de verdade, num servidor de teste em porta efêmera.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { criarServidor } = require('../servidor');

const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
const mudo = { info() {}, warn() {}, error() {} };
const PEDIDO = { dia: 'sab', janela: 'comeco-da-noite', teto: 80, estilos: ['house-disco', 'pop-2000'] };
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

// Pedido cru, com os cabeçalhos dados e o corpo como veio (sem descomprimir).
function bruto(metodo, caminho, cabecalhos = {}, corpo) {
  return new Promise((resolve, reject) => {
    const u = new URL(raiz);
    const req = http.request({ host: u.hostname, port: u.port, path: caminho, method: metodo, headers: cabecalhos }, (res) => {
      const partes = [];
      res.on('data', (d) => partes.push(d));
      res.on('end', () => resolve({ status: res.statusCode, cabecalhos: res.headers, corpo: Buffer.concat(partes) }));
    });
    req.on('error', reject);
    req.end(corpo);
  });
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
  // Sem real nenhuma, os dias da base fictícia, com data (U24).
  assert.deepEqual(r.corpo.dias.map((d) => d.id).filter((id) => id !== 'hoje' && id !== 'qui'), ['sex', 'sab', 'dom']);
  assert.ok(r.corpo.dias.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.data) && typeof d.rotulo === 'string' && d.reais === 0));
  // A faixa e o intervalo de idade saíram do formulário em 26/11/2026.
  assert.equal(r.corpo.faixas, undefined);
  assert.equal(r.corpo.idade, undefined);
  assert.deepEqual(r.corpo.tetos.map((t) => t.rotulo), ['R$ 50', 'R$ 80', 'R$ 150', 'Sem limite']);
  assert.equal(r.corpo.estilos.length, 6);
  assert.match(r.corpo.janelas[1].rotulo, /19h à 1h · começo da noite/);
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
});

test('CSP: tudo daqui, fontes incluídas; sem script inline', async () => {
  for (const pagina of ['/', '/app']) {
    const p = await chamar('GET', pagina);
    assert.doesNotMatch(p.corpo, /googleapis|gstatic/, pagina);
    assert.doesNotMatch(p.corpo, /<script(?![^>]*\b(src=|type="application\/json"))[^>]*>/, pagina);
    assert.doesNotMatch(p.corpo, /style=/, pagina);
  }
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
  // A landing manda para fora só a própria origem (o app, em outro endereço,
  // sabe que veio dela); o app, nem isso.
  assert.equal(r.cabecalhos.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal((await chamar('GET', '/app')).cabecalhos.get('referrer-policy'), 'same-origin');
  assert.doesNotMatch(r.corpo, /<script(?![^>]*\b(src=|type="application\/json"))[^>]*>/);
  assert.doesNotMatch(r.corpo, /style=/);
});

test('POST /api/festas: três festas com linha, motivos e a fala de abertura', async () => {
  const r = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.opcoes.map((o) => o.festa.id), ['funk-ao-entardecer', 'sabado-groove', 'noite-aurora']);
  assert.equal(r.corpo.resposta, 'A primeira enche antes e custa menos.');
  assert.equal(r.corpo.atendem, 3);
  assert.ok(r.corpo.opcoes.every((o) => o.origem === undefined && o.festa.mediaIdade === undefined && o.festa.origemIdade === undefined));
  assert.deepEqual(r.corpo.pedidoPartes.map((x) => x.texto), ['Sábado', 'das 19h à 1h', 'em toda a cidade', 'até R$ 80', 'house ou pop 2000']);
  assert.match(r.corpo.pedido, /^Sáb · 19h à 1h · até R\$ 80/);
  assert.equal(r.corpo.opcoes[2].patrocinada, true);
  assert.equal(r.corpo.opcoes[0].patrocinada, false);
});

test('POST /api/festas sem as quatro respostas devolve 400 dizendo o que falta', async () => {
  const r = await chamar('POST', '/api/festas', { criterios: { dia: 'sab' } });
  assert.equal(r.status, 400);
  assert.equal(r.corpo.erro, 'Faltou responder umas perguntas. Vamos do começo?');
  assert.deepEqual(r.corpo.faltam, ['janela', 'teto']);
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
  assert.equal(lido.corpo.festa.linha, 'Sáb · 19h00 · Pinheiros');
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
  assert.equal(r.corpo.erro, 'Já tem Ju neste convite. É você?');
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

test('o app (/app) já vem com os dados da primeira tela', async () => {
  const r = await chamar('GET', '/app');
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
  // A prévia do link (o que o grupo vê primeiro) diz o dia, a festa e a
  // hora; a média de idade saiu dela em 26/11/2026.
  assert.match(sim.corpo, /<meta property="og:title" content="Exemplo · Bora no sábado\? Sábado Groove, 19h00">/);
  assert.match(sim.corpo, /<title>Exemplo · Bora no sábado\? Sábado Groove, 19h00<\/title>/);
  assert.match(sim.corpo, /<meta property="og:description" content="[^"]*Começa às 19h, a pista enche às 21h e acaba à 1h\.">/);
  assert.doesNotMatch(sim.corpo, /[Mm]édia|\banos\b/);
  assert.match(sim.corpo, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/compartilhar\.png\?v=\d{8}">/);
  assert.equal((await chamar('GET', '/plano.html')).status, 404);
  const inicio = await chamar('GET', '/');
  assert.match(inicio.corpo, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/compartilhar\.png\?v=\d{8}"/);
  assert.match(inicio.corpo, /apple-touch-icon" href="\/icone-180\.png"/);
});

test('prévia do link atrás do proxy do Fly: a imagem sai em https quando X-Forwarded-Proto diz https', async () => {
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove' });
  for (const pagina of ['/', '/app', `/p/${criado.corpo.id}`]) {
    const imagem = async (cabecalhos) => (await chamar('GET', pagina, undefined, cabecalhos)).corpo
      .match(/<meta property="og:image" content="([^"]*)">/)[1];
    assert.match(await imagem({ 'X-Forwarded-Proto': 'https' }), /^https:\/\/127\.0\.0\.1:\d+\/compartilhar\.png\?v=\d{8}$/, pagina);
    assert.match(await imagem({ 'X-Forwarded-Proto': 'HTTPS, http' }), /^https:\/\//, pagina);
    // Sem o cabeçalho, ou com qualquer outra coisa nele, fica http.
    for (const outro of [{}, { 'X-Forwarded-Proto': 'http' }, { 'X-Forwarded-Proto': 'javascript' }, { 'X-Forwarded-Proto': 'https://mal' }]) {
      assert.match(await imagem(outro), /^http:\/\/127\.0\.0\.1:\d+\/compartilhar\.png\?v=\d{8}$/, `${pagina} ${JSON.stringify(outro)}`);
    }
  }
  // Host estranho: nada de origem.
  const r = await bruto('GET', '/', { Host: 'mal"><script>', 'X-Forwarded-Proto': 'https' });
  assert.match(r.corpo.toString('utf8'), /<meta property="og:image" content="\/compartilhar\.png\?v=\d{8}">/);
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

test('texto sai em gzip para quem aceita; sem o pedido, sai como está; fonte nunca', async () => {
  const gz = { 'accept-encoding': 'gzip, deflate, br' };
  for (const caminho of ['/', '/app', '/landing.css', '/app.js', '/api/formulario']) {
    const com = await bruto('GET', caminho, gz);
    const sem = await bruto('GET', caminho);
    assert.equal(com.status, 200, caminho);
    assert.equal(com.cabecalhos['content-encoding'], 'gzip', caminho);
    assert.equal(com.cabecalhos.vary, 'Accept-Encoding', caminho);
    assert.equal(Number(com.cabecalhos['content-length']), com.corpo.length, caminho);
    assert.ok(com.corpo.length < sem.corpo.length, caminho);
    assert.equal(sem.cabecalhos['content-encoding'], undefined, caminho);
    assert.equal(Number(sem.cabecalhos['content-length']), sem.corpo.length, caminho);
    if (!caminho.startsWith('/api/') && caminho !== '/' && caminho !== '/app') {
      assert.deepEqual(zlib.gunzipSync(com.corpo), sem.corpo, caminho);
    }
  }
  // Quem recusa gzip (q=0) recebe sem compressão; HEAD diz o tamanho e não manda corpo.
  assert.equal((await bruto('GET', '/landing.css', { 'accept-encoding': 'gzip;q=0' })).cabecalhos['content-encoding'], undefined);
  const cabeca = await bruto('HEAD', '/landing.css', gz);
  assert.equal(cabeca.cabecalhos['content-encoding'], 'gzip');
  assert.ok(Number(cabeca.cabecalhos['content-length']) > 0);
  assert.equal(cabeca.corpo.length, 0);
  // A API comprimida continua sendo o mesmo JSON.
  const api = await bruto('POST', '/api/festas', { ...gz, 'content-type': 'application/json' }, JSON.stringify({ criterios: PEDIDO }));
  assert.equal(api.cabecalhos['content-encoding'], 'gzip');
  assert.equal(JSON.parse(zlib.gunzipSync(api.corpo)).opcoes.length, 3);
  // Fonte já é comprimida: vai como está, em fluxo.
  const fonte = await bruto('GET', '/fontes/dm-sans.woff2', gz);
  assert.equal(fonte.cabecalhos['content-encoding'], undefined);
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

// ---------------------------------------------------------------- detalhe da festa

test('cada opção traz a festa inteira do registro e a data', async () => {
  const r = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  assert.equal(r.status, 200);
  for (const o of r.corpo.opcoes) {
    assert.match(o.data, /^\d{4}-\d{2}-\d{2}$/, o.festa.id);
    for (const k of ['endereco', 'lotes', 'entradaNaPorta', 'linkCompra', 'linkEvento', 'instagram', 'cartaz', 'lineup', 'idadeMinima', 'regras', 'fontes', 'campos', 'coletadoEm']) {
      assert.ok(k in o.festa, `${o.festa.id} sem ${k}`);
    }
    assert.equal(o.festa.exemplo, true);
    assert.equal(o.festa.origemIdade, undefined);
    assert.equal(o.festa.mediaIdade, undefined);
    assert.equal(o.festa.campos.mediaIdade, undefined);
    assert.match(o.festa.campos.inicio.conferidoEm, /-03:00$/);
  }
});

test('conversa que não entende devolve as opções anteriores também com a data', async () => {
  const antes = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  const r = await conversar(antes.corpo.criterios, antes.corpo.opcoes.map((o) => o.festa.id), 'algo mais tranquilo');
  assert.equal(r.corpo.entendeu, false);
  assert.ok(r.corpo.opcoes.length > 0);
  for (const o of r.corpo.opcoes) assert.match(o.data, /^\d{4}-\d{2}-\d{2}$/);
});

test('o convite guarda o registro da festa e a descrição de compartilhamento leva o endereço', async () => {
  const criado = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sabado-groove' });
  const lido = await chamar('GET', `/api/planos/${criado.corpo.id}`);
  const f = lido.corpo.festa.festa;
  assert.equal(f.exemplo, true);
  assert.match(f.endereco.texto, /\d/);
  assert.ok(Array.isArray(f.lotes));
  const pagina = await chamar('GET', `/p/${criado.corpo.id}`);
  const desc = pagina.corpo.match(/<meta property="og:description" content="([^"]*)">/)[1];
  assert.ok(desc.includes(f.endereco.texto.replace(/&/g, '&amp;')), desc);
});

test('a base fictícia anda com o relógio do servidor', async () => {
  const outra = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-relogio-'));
  const agora = Date.parse('2026-11-28T21:00:00-03:00');
  const s = criarServidor({ dados: DADOS, varDir: path.join(outra, 'var'), log: mudo, relogio: () => agora });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/festas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: PEDIDO }),
  }).then((x) => x.json());
  await new Promise((r2) => s.close(r2));
  fs.rmSync(outra, { recursive: true, force: true });
  for (const o of r.opcoes) {
    const idade = agora - Date.parse(o.festa.coletadoEm);
    assert.ok(idade >= 0 && idade < 7 * 3600e3, `${o.festa.id}: coletada há ${idade / 3600e3} h`);
  }
});

test('"hoje" sem festa real: as fictícias são só as do dia da semana de hoje (costura)', async () => {
  const outra = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-hoje-'));
  // Sábado, 28/11: só fictícias de sábado; numa segunda, nenhuma (a base é de sexta a domingo).
  let agora = Date.parse('2026-11-28T15:00:00-03:00');
  const s = criarServidor({ dados: DADOS, varDir: path.join(outra, 'var'), log: mudo, relogio: () => agora });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const pedir = () => fetch(`http://127.0.0.1:${s.address().port}/api/festas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: { ...PEDIDO, dia: 'hoje' } }),
  }).then((x) => x.json());
  try {
    const sab = await pedir();
    assert.ok(sab.opcoes.length > 0);
    assert.ok(sab.opcoes.every((o) => o.festa.dia === 'sab'), sab.opcoes.map((o) => o.festa.dia).join());
    agora = Date.parse('2026-11-30T15:00:00-03:00');
    const seg = await pedir();
    assert.equal(seg.opcoes.filter((o) => ['sex', 'sab', 'dom'].includes(o.festa.dia)).length, 0);
  } finally {
    await new Promise((r2) => s.close(r2));
    fs.rmSync(outra, { recursive: true, force: true });
  }
});

test('cartazes: cada festa tem o seu, servido como webp', async () => {
  const { festas } = JSON.parse(fs.readFileSync(DADOS, 'utf8'));
  for (const f of festas) {
    const r = await fetch(raiz + f.cartaz);
    assert.equal(r.status, 200, f.cartaz);
    assert.equal(r.headers.get('content-type'), 'image/webp');
    await r.arrayBuffer();
  }
});

test('/fora.html: a página de saída do protótipo, sem script inline', async () => {
  const r = await chamar('GET', '/fora.html?servico=Instagram&para=https%3A%2F%2Fwww.instagram.com%2Fx%2F');
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos.get('content-security-policy'), /script-src 'self'/);
  assert.match(r.corpo, /<script src="\/fora\.js" defer><\/script>/);
  assert.doesNotMatch(r.corpo, /<script>(?!<)/);
  assert.equal((await chamar('GET', '/fora.js')).status, 200);
});

// ---------------------------------------------------------------- perguntas novas (R18 a R22)

const PEDIDO_NOVO = { dia: 'sab', janela: 'fim-de-tarde', teto: 80, estilos: [], bairros: ['pinheiros', 'centro'] };

test('formulário traz as zonas com os 14 bairros do motor, e não a faixa de idade', async () => {
  const r = await chamar('GET', '/api/formulario');
  assert.equal(r.corpo.idade, undefined);
  assert.deepEqual(r.corpo.zonas.map((z) => z.nome), ['Zona Oeste', 'Centro', 'Centro-Sul', 'Zona Norte', 'Zona Sul', 'Zona Leste']);
  assert.equal(r.corpo.zonas.flatMap((z) => z.bairros).length, 14);
  // Sem festa na semana, o bairro aparece sem contagem.
  assert.ok(r.corpo.zonas.flatMap((z) => z.bairros).every((b) => !('reais' in b)));
  // O ponto de cada bairro, para o círculo dos bairros pedidos no mapa.
  assert.ok(r.corpo.zonas.flatMap((z) => z.bairros).every((b) => b.ponto && b.ponto.lat < -23.3 && b.ponto.lng < -46.3));
});

test('festas com bairros: blocos e frase do pedido; o intervalo de idade de um link antigo cai', async () => {
  const r = await chamar('POST', '/api/festas', { criterios: { ...PEDIDO_NOVO, idade: { min: 28, max: 35 } } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.opcoes.map((o) => o.bloco), ['pedido', 'pedido', 'perto']);
  assert.ok(r.corpo.pedidoPartes.some((p) => p.chave === 'bairros'));
  assert.ok(!r.corpo.pedidoPartes.some((p) => p.chave === 'idade' || p.chave === 'faixa'));
  assert.equal(r.corpo.criterios.idade, undefined);
  assert.equal(r.corpo.criterios.faixa, undefined);
});

test('conversa: "mais velha", "de 30 a 40" e "da minha idade" não mudam o pedido nem falam de idade (26/11/2026)', async () => {
  const antes = await chamar('POST', '/api/festas', { criterios: PEDIDO_NOVO });
  const atuais = antes.corpo.opcoes.map((o) => o.festa.id);
  for (const texto of ['gente mais velha', 'mais nova', 'público de 30 a 40', 'tem gente da minha idade?']) {
    const r = await conversar(antes.corpo.criterios, atuais, texto);
    assert.equal(r.status, 200, texto);
    assert.equal(r.corpo.criterios.idade, undefined, texto);
    assert.equal(r.corpo.criterios.faixa, undefined, texto);
    assert.deepEqual(r.corpo.opcoes.map((o) => o.festa.id), atuais, texto);
    assert.doesNotMatch(r.corpo.resposta, /m[ée]dia|faixa|(?<![a-zà-ú])idade|\d+ a \d+/i, texto);
  }
});

// ---------------------------------------------------------------- U24: o servidor do app

const MOTOR_DIR = path.join(__dirname, '..', '..', '..', 'motor');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(MOTOR_DIR, 'teste', 'dados', 'registro-r14-3.json'), 'utf8'));
const SHA = '0123456789abcdef';
// Um WebP mínimo (cabeçalho RIFF/WEBP): o app só confere os bytes mágicos.
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(12)]);
const extras = [];
after(async () => {
  for (const s of extras) await new Promise((r) => s.close(r));
});

async function subirApp(opcoes = {}) {
  const s = criarServidor({
    dados: DADOS, reais: null, varDir: path.join(pasta, `var-u24-${extras.length}`), log: mudo,
    site: 'app', urlSite: 'https://finde.fly.dev/', ...opcoes,
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  extras.push(s);
  const base = `http://127.0.0.1:${s.address().port}`;
  const ir = async (caminho, init = {}) => {
    const r = await fetch(base + caminho, init);
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, cabecalhos: r.headers, corpo: tipo.includes('json') ? await r.json() : tipo.startsWith('image/') ? Buffer.from(await r.arrayBuffer()) : await r.text() };
  };
  return { base, ir, varDir: path.join(pasta, `var-u24-${extras.length - 1}`) };
}

// O motor falso: serve a lista que estiver em `m.lista` e as imagens de `m.imagens`.
async function motorFalso() {
  const m = { lista: { contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, execucaoId: 1, total: 3, festas: FIXTURE.festas }, imagens: new Map(), pedidos: [] };
  m.servidor = http.createServer((req, res) => {
    m.pedidos.push(req.url);
    if (req.url.startsWith('/api/festas')) {
      res.writeHead(200, { 'Content-Type': 'application/json', ETag: `"${m.lista.execucaoId}"` });
      return res.end(JSON.stringify(m.lista));
    }
    const nome = req.url.replace(/^\/imagens\//, '');
    if (m.imagens.has(nome)) {
      res.writeHead(200, { 'Content-Type': 'image/webp' });
      return res.end(m.imagens.get(nome));
    }
    res.writeHead(404);
    return res.end();
  });
  await new Promise((r) => m.servidor.listen(0, '127.0.0.1', r));
  extras.push(m.servidor);
  m.url = `http://127.0.0.1:${m.servidor.address().port}`;
  return m;
}

const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms));

test('CSP do app: a origem dos tiles só no img-src; trocar FINDE_TILES troca a CSP; a landing segue com a de hoje', async () => {
  const osm = await subirApp();
  const csp = (await osm.ir('/')).cabecalhos.get('content-security-policy');
  assert.match(csp, /img-src 'self' data: https:\/\/tile\.openstreetmap\.org(;|$)/);
  assert.equal(csp.match(/tile\.openstreetmap\.org/g).length, 1);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.match(csp, /default-src 'self'(;|$)/);
  const carto = await subirApp({ tiles: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' });
  assert.match((await carto.ir('/api/formulario')).cabecalhos.get('content-security-policy'), /img-src 'self' data: https:\/\/\*\.basemaps\.cartocdn\.com(;|$)/);
  // Endereço que não é https não entra na CSP.
  const torto = await subirApp({ tiles: 'http://tiles.example/{z}/{x}/{y}.png' });
  assert.match((await torto.ir('/')).cabecalhos.get('content-security-policy'), /img-src 'self' data:(;|$)/);
  // O <meta name="finde-tiles"> leva o endereço (quando a página já tem o marcador, U32).
  const html = (await carto.ir('/')).corpo;
  if (/name="finde-tiles"/.test(fs.readFileSync(path.join(__dirname, '..', 'publico', 'index.html'), 'utf8'))) {
    assert.match(html, /<meta name="finde-tiles" content="https:\/\/\{s\}\.basemaps\.cartocdn\.com\/light_all\/\{z\}\/\{x\}\/\{y\}\.png">/);
  }
  assert.doesNotMatch(html, /__TILES__/);
  // A landing: a CSP de antes, sem tiles e sem X-Robots-Tag.
  const landing = await chamar('GET', '/');
  assert.equal(landing.cabecalhos.get('content-security-policy').includes('openstreetmap'), false);
  assert.match(landing.cabecalhos.get('content-security-policy'), /img-src 'self' data:(;|$)/);
  assert.equal(landing.cabecalhos.get('x-robots-tag'), null);
});

test('noindex: X-Robots-Tag em toda resposta do app; robots.txt fecha só /imagens/ e /api/', async () => {
  const app = await subirApp();
  for (const caminho of ['/', '/app', '/api/formulario', '/app.js', '/robots.txt', '/imagens/nada.webp', '/p/zzzzzzzz']) {
    assert.equal((await app.ir(caminho)).cabecalhos.get('x-robots-tag'), 'noindex, noimageindex', caminho);
  }
  const robots = await app.ir('/robots.txt');
  assert.equal(robots.status, 200);
  assert.equal(robots.corpo, 'User-agent: *\nDisallow: /imagens/\nDisallow: /api/\n');
  assert.doesNotMatch(robots.corpo, /Disallow: \/\s*$/m);
  // Tudo junto: o app em /app leva; a landing em / não.
  assert.equal((await chamar('GET', '/app')).cabecalhos.get('x-robots-tag'), 'noindex, noimageindex');
  assert.equal((await chamar('GET', '/')).cabecalhos.get('x-robots-tag'), null);
});

test('formulário (U24): data, rótulo e reais de cada dia; "Hoje, sexta" uma vez numa sexta; "Hoje" sem festa vai para o fim', async () => {
  const reais = path.join(pasta, 'reais-u24.json');
  fs.writeFileSync(reais, JSON.stringify({ contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, festas: FIXTURE.festas }));
  // Sexta, 27/11: hoje é sexta; a festa de 00h30 de sábado é da sexta.
  let agora = Date.parse('2026-11-27T12:00:00-03:00');
  const app = await subirApp({ reais, relogio: () => agora });
  let f = (await app.ir('/api/formulario')).corpo;
  assert.equal(f.misto, true);
  const hoje = f.dias.filter((d) => d.hoje);
  assert.equal(hoje.length, 1);
  assert.deepEqual([hoje[0].id, hoje[0].rotulo, hoje[0].data, hoje[0].reais], ['sex', 'Hoje, sexta', '2026-11-27', 1]);
  assert.equal(f.dias.filter((d) => d.id === 'hoje').length, 0);
  assert.ok(f.dias.every((d) => d.data >= '2026-11-27'), 'nenhum dia que passou');
  const sab = f.dias.find((d) => d.id === 'sab');
  assert.deepEqual([sab.rotulo, sab.data, sab.reais], ['Sábado, 28 nov', '2026-11-28', 0]);
  const prox = f.semanas.proxima;
  assert.deepEqual(prox.filter((d) => ['sex', 'sab'].includes(d.id)).map((d) => [d.rotulo, d.reais]), [['Sexta, 4 dez', 1], ['Sábado, 5 dez', 1]]);
  assert.ok(prox.every((d) => d.id !== 'hoje' && d.hoje === false));
  // Os 14 bairros; o de Pinheiros tem festa na semana que vem, não nesta.
  assert.equal(f.zonas.flatMap((z) => z.bairros).length, 14);
  // A origem da lista.
  assert.deepEqual(f.base, { atualizadoEm: '2026-11-26T09:05:00-03:00', total: 3, perfis: 0, sites: 1 });
  // Segunda, 30/11: "Hoje" sem festa real vai para o fim.
  agora = Date.parse('2026-11-30T12:00:00-03:00');
  f = (await app.ir('/api/formulario')).corpo;
  const ultimo = f.dias[f.dias.length - 1];
  assert.deepEqual([ultimo.id, ultimo.rotulo, ultimo.reais, ultimo.hoje], ['hoje', 'Hoje, segunda', 0, true]);
  assert.equal(f.dias.filter((d) => d.hoje).length, 1);
});

test('POST /api/festas (U24): a forma de resposta-festas-r14-3.json, com a base e os outros dias', async () => {
  const reais = path.join(pasta, 'reais-u24b.json');
  fs.writeFileSync(reais, JSON.stringify({ contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, festas: FIXTURE.festas }));
  const app = await subirApp({ reais, relogio: () => Date.parse('2026-11-26T12:00:00-03:00') });
  const r = await app.ir('/api/festas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: { dia: 'sab', janela: 'noite', teto: 150 }, semana: 'proxima' }) });
  assert.equal(r.status, 200);
  for (const k of ['criterios', 'pedido', 'pedidoPartes', 'resposta', 'opcoes', 'maisDoDia', 'outrosDias', 'exemplos', 'aviso', 'nota', 'base']) assert.ok(k in r.corpo, k);
  // A linha única "sem média" (D3) saiu com a idade, em 26/11/2026.
  assert.equal(r.corpo.semMedia, undefined);
  assert.deepEqual(r.corpo.opcoes.map((o) => o.festa.id), ['noite-exemplo-20261205-a1b2']);
  assert.equal(r.corpo.opcoes[0].festa.cartaz.arquivo, `/imagens/${SHA}-1080.webp`);
  assert.deepEqual(r.corpo.exemplos, []);
  assert.ok(r.corpo.outrosDias.some((d) => d.dia === 'sex' && d.data === '2026-12-04' && d.reais === 1));
  assert.equal(r.corpo.base.total, 3);
  assert.equal(r.corpo.opcoes[0].festa.mediaIdade, undefined);
});

test('/imagens/: fora do padrão e hash fora da base dão 404; com o motor, grava o cache; a que sai da base dá 404 na atualização seguinte', async () => {
  const m = await motorFalso();
  m.imagens.set(`${SHA}-1080.webp`, WEBP);
  m.imagens.set(`${SHA}-480.webp`, WEBP);
  m.imagens.set('aaaaaaaaaaaaaaaa-480.webp', WEBP);
  let agora = Date.parse('2026-11-26T12:00:00-03:00');
  const app = await subirApp({ motorUrl: m.url, relogio: () => agora, adminToken: 'admin-de-teste' });
  for (const nome of ['x.webp', `${SHA}-720.webp`, `${SHA.toUpperCase()}-480.webp`, '..%2Fservidor.js', `${SHA}-480.webp/../x`]) {
    assert.equal((await app.ir(`/imagens/${nome}`)).status, 404, nome);
  }
  // Hash que a base não cita, mesmo que o motor tenha.
  assert.equal((await app.ir('/imagens/aaaaaaaaaaaaaaaa-480.webp')).status, 404);
  const img = await app.ir(`/imagens/${SHA}-480.webp`);
  assert.equal(img.status, 200);
  assert.equal(img.cabecalhos.get('content-type'), 'image/webp');
  assert.equal(img.cabecalhos.get('cache-control'), 'public, max-age=86400');
  assert.equal(img.cabecalhos.get('x-robots-tag'), 'noindex, noimageindex');
  assert.deepEqual(img.corpo, WEBP);
  const noCache = path.join(app.varDir, 'imagens', `${SHA}-480.webp`);
  assert.ok(fs.existsSync(noCache));
  // Do cache: o motor não é chamado de novo.
  const antes = m.pedidos.filter((u) => u.startsWith('/imagens/')).length;
  assert.equal((await app.ir(`/imagens/${SHA}-480.webp`)).status, 200);
  assert.equal(m.pedidos.filter((u) => u.startsWith('/imagens/')).length, antes);
  // O motor ocultou a imagem: a lista nova chega sem ela.
  m.lista = { ...m.lista, execucaoId: 2, festas: FIXTURE.festas.map((f) => ({ ...f, imagens: [], cartaz: null })) };
  agora += 11 * 60e3;
  await app.ir('/api/formulario'); // passa a validade: a atualização corre por trás
  for (let i = 0; i < 40 && m.pedidos.filter((u) => u.startsWith('/api/festas')).length < 2; i++) await ESPERA(25);
  const estado = async () => (await app.ir('/api/reais/estado', { headers: { Authorization: 'Bearer admin-de-teste' } })).corpo.estado;
  for (let i = 0; i < 40 && (await estado()).execucaoId !== 2; i++) await ESPERA(25);
  assert.equal((await app.ir(`/imagens/${SHA}-480.webp`)).status, 404);
  assert.equal(fs.existsSync(noCache), false);
});

test('/api/reais/estado pede o token de admin do app', async () => {
  const app = await subirApp({ adminToken: 'admin-de-teste' });
  assert.equal((await app.ir('/api/reais/estado')).status, 401);
  assert.equal((await app.ir('/api/reais/estado', { headers: { Authorization: 'Bearer admin-de-test' } })).status, 401);
  assert.equal((await app.ir('/api/reais/estado', { headers: { Authorization: 'Bearer admin-de-testX' } })).status, 401);
  const ok = await app.ir('/api/reais/estado', { headers: { Authorization: 'Bearer admin-de-teste' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.fonte, 'arquivo');
  // Sem token configurado, ninguém entra.
  const sem = await subirApp({ adminToken: undefined });
  assert.equal((await sem.ir('/api/reais/estado', { headers: { Authorization: 'Bearer qualquer' } })).status, 401);
});

test('convite de festa real com flyer: a prévia leva a versão 1080, absoluta; a festa que passou diz que passou', async () => {
  const reais = path.join(pasta, 'reais-u24c.json');
  fs.writeFileSync(reais, JSON.stringify({ contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, festas: FIXTURE.festas }));
  let agora = Date.parse('2026-11-26T12:00:00-03:00');
  const app = await subirApp({ reais, relogio: () => agora });
  const p = await app.ir('/api/planos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: { dia: 'sab', janela: 'noite', teto: 150 }, festa: 'noite-exemplo-20261205-a1b2' }) });
  assert.equal(p.status, 201);
  const html = (await app.ir(`/p/${p.corpo.id}`, { headers: { 'X-Forwarded-Proto': 'https' } })).corpo;
  assert.doesNotMatch(html, /__IMAGEM_COMPARTILHAR__/);
  if (/__IMAGEM_COMPARTILHAR__/.test(fs.readFileSync(path.join(__dirname, '..', 'publico', 'plano.html'), 'utf8'))) {
    assert.match(html, new RegExp(`content="https://127\\.0\\.0\\.1:\\d+/imagens/${SHA}-1080\\.webp"`));
  }
  // O flyer é retrato: as metas dizem 1080×1350, não 1200×630 (revisão app-8).
  assert.match(html, /<meta property="og:image:width" content="1080">/);
  assert.match(html, /<meta property="og:image:height" content="1350">/);
  assert.doesNotMatch(html, /content="630"/);
  // O convite vivo segura a imagem mesmo que a festa saia da base.
  // A festa que passou: o link diz que passou.
  agora = Date.parse('2026-12-07T12:00:00-03:00');
  const passada = await app.ir('/api/festa/noite-exemplo-20261205-a1b2');
  assert.equal(passada.status, 404);
  assert.equal(passada.corpo.passou, true);
});

// ---------------------------------------------------------------- revisão de 24/11 (app-1, app-2, app-3, app-5)

// Cinco reais no sábado 05/12, a partir da noite-exemplo da fixture.
function cincoNoSabado({ funk = null, esgotada = null } = {}) {
  const modelo = FIXTURE.festas[0];
  return ['a', 'b', 'c', 'd', 'e'].map((l, i) => ({
    ...modelo,
    id: `noite-${l}-20261205-a1b${i}`,
    nome: `Noite ${l.toUpperCase()}`,
    inicio: `2026-12-05T${String(22 + (i % 2)).padStart(2, '0')}:00:00-03:00`,
    estilos: l === funk ? ['funk'] : ['house-disco'],
    esgotado: l === esgotada,
  }));
}
async function appCom(festas, agoraIso) {
  const arq = path.join(pasta, `reais-rev-${extras.length}.json`);
  fs.writeFileSync(arq, JSON.stringify({ contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, festas }));
  return subirApp({ reais: arq, relogio: () => Date.parse(agoraIso) });
}
const pedirFestas = (app, criterios, extra = {}) => app.ir('/api/festas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios, ...extra }) });

test('revisão app-1: a festa recusada de propósito não volta em "ver todas" (maisDoDia)', async () => {
  const app = await appCom(cincoNoSabado({ funk: 'a' }), '2026-12-01T12:00:00-03:00');
  const r = (await pedirFestas(app, { dia: 'sab', janela: 'noite', teto: 150, evitarEstilos: ['funk'] })).corpo;
  const ids = [...r.opcoes, ...r.maisDoDia].map((o) => o.festa.id);
  assert.equal(ids.length, 4);
  assert.ok(!ids.includes('noite-a-20261205-a1b0'), 'a de funk ficou fora');
  // "essa não": o id recusado também sai de maisDoDia.
  const r2 = (await pedirFestas(app, { dia: 'sab', janela: 'noite', teto: 150, evitar: ['noite-e-20261205-a1b4'] })).corpo;
  assert.ok(![...r2.opcoes, ...r2.maisDoDia].some((o) => o.festa.id === 'noite-e-20261205-a1b4'));
});

test('revisão app-2: esgotada não ocupa vaga; as 3 recomendadas são abertas e ela desce para o fim', async () => {
  const app = await appCom(cincoNoSabado({ esgotada: 'a' }), '2026-12-01T12:00:00-03:00');
  const r = (await pedirFestas(app, { dia: 'sab', janela: 'noite', teto: 150 })).corpo;
  assert.equal(r.opcoes.length, 3);
  assert.ok(r.opcoes.every((o) => o.festa.esgotado !== true));
  const ultima = r.maisDoDia[r.maisDoDia.length - 1];
  assert.equal(ultima.festa.id, 'noite-a-20261205-a1b0');
  assert.equal(ultima.esgotada, true);
});

test('revisão app-3: à 1h30 de sábado, a festa de sexta que segue rolando é "hoje"', async () => {
  // A fixture tem a "depois da meia-noite": noite de sexta 27/11, começa 00h30 de sábado, sem fim.
  const app = await appCom(FIXTURE.festas, '2026-11-28T01:30:00-03:00');
  const f = (await app.ir('/api/formulario')).corpo;
  const hoje = f.dias.find((d) => d.hoje);
  assert.deepEqual([hoje.id, hoje.rotulo, hoje.data, hoje.reais], ['sex', 'Hoje, sexta', '2026-11-27', 1]);
  const r = (await pedirFestas(app, { dia: 'hoje', janela: 'noite', teto: 150 })).corpo;
  assert.deepEqual([...r.opcoes, ...r.maisDoDia].map((o) => o.festa.id), ['depois-da-meia-noite-20261128-d4e5']);
  assert.deepEqual(r.exemplos, []);
  // Às 7h de sábado a noite virou: "hoje" é sábado, e a de sexta passou.
  const depois = await appCom(FIXTURE.festas, '2026-11-28T07:00:00-03:00');
  const f2 = (await depois.ir('/api/formulario')).corpo;
  assert.equal(f2.dias.find((d) => d.hoje).data, '2026-11-28');
});

test('verif-app-3: entre 0h e 6h, a fictícia de "hoje" é da noite de hoje, não da semana seguinte', async () => {
  for (const hora of ['2026-11-28T00:30:00-03:00', '2026-11-28T05:59:00-03:00']) {
    const app = await appCom([], hora);
    const r = (await pedirFestas(app, { dia: 'hoje', janela: 'noite', teto: 'sem-limite' })).corpo;
    const datas = [...r.opcoes, ...(r.exemplos || [])].map((o) => `${o.festa.dia} ${o.data}`);
    assert.ok(datas.length, hora);
    for (const d of datas) assert.equal(d, 'sex 2026-11-27', hora);
  }
  // A sexta que ainda segue à 1h de sábado: o convite também é de sexta.
  const { dataDaFesta } = require('../servidor');
  assert.equal(dataDaFesta({ dia: 'sex', fim: 29 }, new Date(2026, 10, 28, 1)).data, '2026-11-27');
  assert.equal(dataDaFesta({ dia: 'sex', fim: 25 }, new Date(2026, 10, 28, 2)).data, '2026-12-04');
});

test('verif-app-5: "$2" ou "$&" no nome da festa não vira padrão de troca nas metas do convite', async () => {
  const nome = 'Noite $2 data-x=$2y $& $` fim';
  const app = await appCom([{ ...FIXTURE.festas[0], nome }], '2026-12-01T12:00:00-03:00');
  const p = await app.ir('/api/planos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: { dia: 'sab', janela: 'noite', teto: 150 }, festa: FIXTURE.festas[0].id }) });
  assert.equal(p.status, 201);
  const html = (await app.ir(`/p/${p.corpo.id}`)).corpo;
  const og = html.match(/<meta property="og:title" content="([^"]*)">/);
  assert.ok(og, 'og:title inteiro, sem aspas soltas');
  assert.ok(og[1].includes('Noite $2 data-x=$2y $&amp; $` fim'), og[1]);
  assert.ok(html.match(/<title>([^<]*)<\/title>/)[1].includes('Noite $2 data-x=$2y'));
  assert.doesNotMatch(html, /" data-x=/);
});

test('revisão app-5: "hoje" sem real num dia útil não diz que a lista está vazia quando outro dia tem', async () => {
  const app = await appCom(FIXTURE.festas, '2026-12-01T20:00:00-03:00');
  const r = (await pedirFestas(app, { dia: 'hoje', janela: 'noite', teto: 150 })).corpo;
  assert.deepEqual(r.opcoes, []);
  assert.ok(r.outrosDias.some((d) => d.reais > 0));
  assert.doesNotMatch(`${r.aviso || ''} ${r.resposta}`, /lista de festas está vazia/);
});


test('POST /api/festas com "hoje" numa quarta com festa: 200, não 500 (conserto de 25/11)', async () => {
  // O motor só conhece hoje e quinta a domingo; o dia da festa de quarta
  // ("qua") não pode virar o dia do pedido.
  const base = FIXTURE.festas[0];
  const quarta = { ...base, id: 'quarta-exemplo-20261202', data: '2026-12-02', inicio: '2026-12-02T23:00:00-03:00', fim: '2026-12-03T05:00:00-03:00' };
  const reais = path.join(pasta, 'reais-quarta.json');
  fs.writeFileSync(reais, JSON.stringify({ contrato: 'finde-r14/3', geradoEm: FIXTURE.geradoEm, festas: [quarta] }));
  const app = await subirApp({ reais, relogio: () => Date.parse('2026-12-02T12:00:00-03:00') });
  const r = await app.ir('/api/festas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: { dia: 'hoje', janela: 'noite', teto: 150 } }) });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.criterios.dia, 'hoje');
});

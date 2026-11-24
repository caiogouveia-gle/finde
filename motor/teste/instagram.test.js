'use strict';
// Prova acadêmica: cliente Apify, leitura de flyer pelo Claude e o conector do
// Instagram. Nada toca a rede nem a API paga.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarApify } = require('../nucleo/apify');
const { criarExtrator, validarExtracao } = require('../nucleo/extrair');
const { criarClassificador } = require('../nucleo/classificar');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const instagram = require('../fontes/instagram');
const { novoBanco, relogio, logMudo, claudeFalso } = require('./ajuda');

const FLYER = {
  festas: [{
    nome: 'Baile Exemplo', data: '2026-11-28', inicio: '22:00', fim: '05:00', casa: 'Galpão Exemplo', endereco: 'Rua Exemplo, 1 - Barra Funda',
    lotes: [{ nome: '1º lote', preco: 40, disponivel: false }, { nome: '2º lote', preco: 60, disponivel: null }],
    linkCompra: 'https://www.sympla.com.br/evento/baile-exemplo/123?cod=CURADORA', lineup: ['DJ Exemplo'], estilos: ['funk'], idadeMinima: 18,
  }, {
    nome: 'Edição passada', data: '2026-10-01', inicio: null, fim: null, casa: null, endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null,
  }],
  confianca: 'alta',
};

const POSTS = [{
  id: '1', shortCode: 'AbC1', url: 'https://www.instagram.com/p/AbC1/', caption: 'Sábado tem baile! Ingressos: https://shotgun.live/pt-br/events/baile-exemplo',
  timestamp: '2026-11-20T18:00:00.000Z', ownerUsername: 'coletivo_exemplo', ownerFullName: 'Coletivo Exemplo', displayUrl: 'https://cdn.example/flyer.jpg',
  latestComments: [{ ownerUsername: 'alguem', text: 'vou!' }], likesCount: 10,
}];
const PERFIS = [{ username: 'coletivo_exemplo', externalUrl: 'https://linktr.ee/coletivo_exemplo', externalUrls: [{ url: 'https://www.ingresse.com/baile-exemplo/' }] }];
const LINKTREE = '<a href="https://www.sympla.com.br/evento/outra-festa/456">Ingresso</a><a href="https://open.spotify.com/x">som</a>';

// fetch falso que responde ao Apify, ao Linktree e à imagem, e guarda as chamadas.
function fetchDoMundo() {
  const chamadas = [];
  const f = async (u, op = {}) => {
    const url = String(u);
    chamadas.push({ url, op });
    const run = (ds) => new Response(JSON.stringify({ data: { id: `run-${ds}`, status: 'SUCCEEDED', defaultDatasetId: ds, usageTotalUsd: 0.002 } }));
    if (/\/acts\/apify~instagram-scraper\/runs\?/.test(url)) return run('ds-posts');
    if (/\/acts\/apify~instagram-profile-scraper\/runs\?/.test(url)) return run('ds-perfis');
    if (op.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/datasets/ds-posts/items')) return new Response(JSON.stringify(POSTS));
    if (url.includes('/datasets/ds-perfis/items')) return new Response(JSON.stringify(PERFIS));
    if (url.startsWith('https://linktr.ee/')) return new Response(LINKTREE, { headers: { 'content-type': 'text/html' } });
    if (url === 'https://cdn.example/flyer.jpg') return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'content-type': 'image/jpeg' } });
    return new Response('não', { status: 404 });
  };
  f.chamadas = chamadas;
  return f;
}

test('Apify: rota assíncrona, token no cabeçalho, só os campos usados, dataset apagado, custo real', async () => {
  const db = novoBanco();
  const f = fetchDoMundo();
  const apify = criarApify({ token: 'tok-teste', fetch: f, db, agora: relogio(), log: logMudo });
  const itens = await apify.rodar('apify~instagram-scraper', { a: 1 }, { maxItens: 50, tetoUsd: 0.1, campos: ['caption', 'url'] });
  assert.equal(itens.length, 1);
  const [disparo, leitura, apaga] = f.chamadas;
  assert.match(disparo.url, /^https:\/\/api\.apify\.com\/v2\/acts\/apify~instagram-scraper\/runs\?/);
  assert.match(disparo.url, /maxItems=50/);
  assert.match(disparo.url, /maxTotalChargeUsd=0\.1000/);
  assert.equal(disparo.op.method, 'POST');
  assert.match(leitura.url, /\/datasets\/ds-posts\/items\?.*fields=caption%2Curl/);
  assert.equal(apaga.op.method, 'DELETE');
  assert.match(apaga.url, /\/datasets\/ds-posts$/);
  for (const c of f.chamadas) {
    assert.doesNotMatch(c.url, /tok-teste/);
    assert.equal(c.op.headers.Authorization, 'Bearer tok-teste');
  }
  const uso = db.prepare('SELECT ator, itens, custo_usd, resultado FROM uso_apify').get();
  assert.deepEqual({ ...uso }, { ator: 'apify~instagram-scraper', itens: 1, custo_usd: 0.002, resultado: 'ok' });
  assert.equal(criarApify({ token: null }), null);
  await assert.rejects(apify.rodar('ator sem til', {}), /inválido/);
});

test('Apify: teto do dia conta o que já se gastou hoje e recusa a chamada', async () => {
  const db = novoBanco();
  db.prepare("INSERT INTO uso_apify (quando, ator, itens, custo_usd, resultado) VALUES ('2026-11-10T13:00:00.000Z', 'x~y', 10, 0.249, 'ok')").run();
  const f = fetchDoMundo();
  const apify = criarApify({ token: 't', fetch: f, db, agora: relogio(), log: logMudo, tetoDia: 0.25 });
  await assert.rejects(apify.rodar('apify~instagram-scraper', {}, {}), /teto do Apify/);
  assert.equal(f.chamadas.length, 0);
});

test('Apify: rodada que falha registra o teto da chamada como custo e ainda apaga o dataset', async () => {
  const db = novoBanco();
  const chamadas = [];
  const f = async (u, op = {}) => {
    chamadas.push({ url: String(u), op });
    if (String(u).includes('/runs?')) return new Response(JSON.stringify({ data: { id: 'r', status: 'FAILED', defaultDatasetId: 'ds' } }));
    return new Response(null, { status: 204 });
  };
  const apify = criarApify({ token: 't', fetch: f, db, agora: relogio(), log: logMudo });
  await assert.rejects(apify.rodar('apify~instagram-scraper', {}, { tetoUsd: 0.05 }), /FAILED/);
  assert.equal(chamadas.at(-1).op.method, 'DELETE');
  const uso = db.prepare('SELECT custo_usd, resultado FROM uso_apify').get();
  assert.deepEqual({ ...uso }, { custo_usd: 0.05, resultado: 'erro' });
});

test('extrator: valida a resposta e descarta festa sem data', () => {
  const r = validarExtracao({ festas: [{ ...FLYER.festas[0] }, { ...FLYER.festas[0], data: 'sábado' }, { nome: '', data: '2026-11-28' }], confianca: 'x' });
  assert.equal(r.festas.length, 1);
  assert.equal(r.confianca, 'baixa');
  assert.equal(validarExtracao({ nada: 1 }), undefined);
});

test('extrator: manda a imagem e a legenda, guarda no cache e divide o teto', async () => {
  const db = novoBanco();
  const claude = claudeFalso([FLYER], { entrada: 2000, saida: 400 });
  const classificador = criarClassificador({ db, claude, modelo: 'claude-haiku-5-5', agora: relogio(), log: logMudo });
  const ex = criarExtrator({ db, classificador, agora: relogio(), log: logMudo });
  const r1 = await ex.lerFlyer({ chave: 'AbC1', imagem: { base64: 'AAAA', tipo: 'image/jpeg' }, legenda: 'Sábado tem baile', publicadoEm: '2026-11-20', perfil: 'x' });
  assert.equal(r1.festas.length, 2);
  const p = claude.pedidos[0];
  assert.equal(p.messages[0].content[0].type, 'image');
  assert.equal(p.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.match(p.messages[0].content[1].text, /<material>[\s\S]*Publicado em: 2026-11-20[\s\S]*<\/material>/);
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.ok(!JSON.stringify(p.output_config.format.schema).includes('mediaIdade'));
  await ex.lerFlyer({ chave: 'AbC1', imagem: { base64: 'AAAA', tipo: 'image/jpeg' }, legenda: 'Sábado tem baile', publicadoEm: '2026-11-20', perfil: 'x' });
  assert.equal(claude.pedidos.length, 1, 'o mesmo post não volta ao modelo');
  // Legenda editada ou leitura sem a imagem não ficam presas no cache.
  await ex.lerFlyer({ chave: 'AbC1', imagem: null, legenda: 'Sábado tem baile', publicadoEm: '2026-11-20', perfil: 'x' });
  assert.equal(claude.pedidos.length, 2);
  assert.ok(classificador.resumo().gastoUsd > 0, 'o gasto entra no teto do classificador');

  const parado = criarClassificador({ db, claude: claudeFalso([FLYER]), tetoExecucao: 0.0000001, agora: relogio(), log: logMudo });
  const ex2 = criarExtrator({ db, classificador: parado, agora: relogio(), log: logMudo });
  assert.equal(await ex2.lerFlyer({ chave: 'outro', imagem: null, legenda: 'y', perfil: 'x' }), null);
  assert.equal(ex2.resumo().semModelo, 1);
});

test('Instagram: posts viram festas com o post como origem; comentários não entram', async () => {
  const db = novoBanco();
  const f = fetchDoMundo();
  const claude = claudeFalso([FLYER]);
  const r = await executar({
    db, fontes: [instagram], fetch: f, claude, agora: relogio(), log: logMudo, apifyToken: 'tok',
    config: { instagram: { perfis: ['@coletivo_exemplo'], dias: 3 } },
  });
  assert.equal(r.fontes.instagram.gravados, 1, 'a edição passada fica de fora');
  const [festa] = listarRegistros(db, { todas: true });
  assert.equal(festa.nome, 'Baile Exemplo');
  assert.deepEqual(festa.fontes.map((x) => [x.id, x.url]), [['instagram', 'https://www.instagram.com/p/AbC1/']]);
  assert.equal(festa.linkCompra, 'https://www.sympla.com.br/evento/baile-exemplo/123');
  assert.equal(festa.instagram, 'https://www.instagram.com/coletivo_exemplo/');
  assert.equal(festa.mediaIdade, null);
  const bruto = db.prepare("SELECT bruto FROM itens_brutos WHERE fonte = 'instagram'").get().bruto;
  assert.doesNotMatch(bruto, /alguem|vou!|likesCount|latestComments/);
  // A imagem foi baixada e mandada ao Claude, mas não fica guardada.
  assert.doesNotMatch(bruto, /cdn\.example|AAAA|base64/);
  assert.equal(claude.pedidos[0].messages[0].content[0].type, 'image');
});

test('Instagram: link da bio, Linktree e links do post e do flyer vão para a fila, sem código', async () => {
  const fila = new Set();
  const db = novoBanco();
  const classificador = criarClassificador({ db, claude: claudeFalso([FLYER]), agora: relogio(), log: logMudo });
  const extrator = criarExtrator({ db, classificador, agora: relogio(), log: logMudo });
  const f = fetchDoMundo();
  const apify = criarApify({ token: 'tok', fetch: f, db, agora: relogio(), log: logMudo });
  await instagram.coletar({ fetch: f, agora: relogio(), log: logMudo, config: { perfis: ['coletivo_exemplo'] }, apify, extrator, fila });
  assert.deepEqual([...fila].sort(), [
    'https://shotgun.live/pt-br/events/baile-exemplo',
    'https://www.ingresse.com/baile-exemplo/',
    'https://www.sympla.com.br/evento/baile-exemplo/123',
    'https://www.sympla.com.br/evento/outra-festa/456',
  ]);
});

test('Instagram: perfis do arquivo privado, sem as curadoras', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-ig-'));
  const arq = path.join(dir, 'contatos.json');
  fs.writeFileSync(arq, JSON.stringify([
    { url: 'https://www.instagram.com/casa_x/', tipo: 'casa' },
    { url: 'https://www.instagram.com/curadora_y/', tipo: 'curadoria' },
    { url: 'https://site.example/', tipo: 'casa' },
  ]));
  assert.deepEqual(instagram.perfisDoArquivo(arq), ['https://www.instagram.com/casa_x/']);
  assert.deepEqual(instagram.perfisDoArquivo(path.join(dir, 'nao-existe.json')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram: sem token ou sem perfis, avisa e não roda', async () => {
  const a = await instagram.coletar({ config: { perfis: ['x'] }, apify: null });
  assert.match(a.avisos[0], /sem APIFY_TOKEN/);
  const b = await instagram.coletar({ config: {}, apify: { rodar: async () => [] } });
  assert.match(b.avisos[0], /nenhum perfil/);
});

test('Instagram: sem chave do Claude, posts ficam sem leitura e a execução avisa', async () => {
  const db = novoBanco();
  const r = await executar({
    db, fontes: [instagram], fetch: fetchDoMundo(), claude: null, agora: relogio(), log: logMudo, apifyToken: 'tok',
    config: { instagram: { perfis: ['coletivo_exemplo'], seguirBio: false } },
  });
  assert.equal(r.fontes.instagram.itens, 0);
  assert.match(r.avisos.join('\n'), /sem leitura do flyer/);
});

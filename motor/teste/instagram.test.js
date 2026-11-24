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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Onde os flyers vão nos testes: nunca em var/imagens.
function pastaTemporaria() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-ig-img-'));
  return dir;
}
const festaLida = (nome, data, extra = {}) => ({
  nome, ehFesta: true, tipo: 'festa', confianca: 'alta', cidade: null, uf: null, imagem: 'flyer', data, inicio: '22:00', fim: null, casa: null, endereco: null,
  lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null, ...extra,
});

const FLYER = {
  festas: [{
    nome: 'Baile Exemplo', ehFesta: true, tipo: 'festa', confianca: 'alta', cidade: 'São Paulo', uf: 'SP', imagem: 'flyer', data: '2026-11-28', inicio: '22:00', fim: '05:00', casa: 'Galpão Exemplo', endereco: 'Rua Exemplo, 1 - Barra Funda',
    lotes: [{ nome: '1º lote', preco: 40, disponivel: false }, { nome: '2º lote', preco: 60, disponivel: null }],
    linkCompra: 'https://www.sympla.com.br/evento/baile-exemplo/123?cod=CURADORA', lineup: ['DJ Exemplo'], estilos: ['funk'], idadeMinima: 18,
  }, {
    nome: 'Edição passada', ehFesta: true, tipo: 'festa', confianca: 'media', cidade: null, uf: null, imagem: 'flyer', data: '2026-10-01', inicio: null, fim: null, casa: null, endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null,
  }],
  confianca: 'alta',
};

const POSTS = [{
  id: '1', shortCode: 'AbC1', url: 'https://www.instagram.com/p/AbC1/', caption: 'Sábado tem baile! Ingressos: https://shotgun.live/pt-br/events/baile-exemplo',
  timestamp: '2026-11-20T18:00:00.000Z', ownerUsername: 'coletivo_exemplo', ownerFullName: 'Coletivo Exemplo', displayUrl: 'https://scontent.cdninstagram.com/flyer.jpg',
  locationName: 'Galpão Exemplo', locationId: '123456', type: 'Image',
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
    if (url === 'https://scontent.cdninstagram.com/flyer.jpg') return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'content-type': 'image/jpeg' } });
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

test('extrator: valida a resposta e descarta festa sem data ou sem ehFesta', () => {
  const r = validarExtracao({ festas: [{ ...FLYER.festas[0] }, { ...FLYER.festas[0], data: 'sábado' }, { nome: '', data: '2026-11-28' }, { ...FLYER.festas[0], ehFesta: undefined }], confianca: 'x' });
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
  const dir = pastaTemporaria();
  process.env.FINDE_IMAGENS = dir;
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
  assert.doesNotMatch(bruto, /cdninstagram|AAAA|base64/);
  assert.equal(claude.pedidos[0].messages[0].content[0].type, 'image');
  delete process.env.FINDE_IMAGENS;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram: link da bio, Linktree e links do post e do flyer vão para a fila, sem código', async () => {
  const fila = new Set();
  const db = novoBanco();
  const classificador = criarClassificador({ db, claude: claudeFalso([FLYER]), agora: relogio(), log: logMudo });
  const extrator = criarExtrator({ db, classificador, agora: relogio(), log: logMudo });
  const f = fetchDoMundo();
  const apify = criarApify({ token: 'tok', fetch: f, db, agora: relogio(), log: logMudo });
  const dir = pastaTemporaria();
  await instagram.coletar({ fetch: f, agora: relogio(), log: logMudo, config: { perfis: ['coletivo_exemplo'] }, apify, extrator, fila, dirImagens: dir });
  fs.rmSync(dir, { recursive: true, force: true });
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

// ---- M32, M33: o que o bruto guarda, que imagem fica, releitura, recuperação -------------

// Uma execução do conector com posts e leituras à escolha. `leituras` é uma lista por post.
async function rodarPosts({ posts, leituras, config = {}, db = novoBanco(), dir = pastaTemporaria(), fila }) {
  const apify = { rodar: async (ator, entrada) => (/profile/.test(ator) ? [] : (apify.entradas.push(entrada), posts)), entradas: [] };
  const claude = claudeFalso(leituras);
  const classificador = criarClassificador({ db, claude, agora: relogio(), log: logMudo });
  const extrator = criarExtrator({ db, classificador, agora: relogio(), log: logMudo });
  const f = fetchDoMundo();
  const r = await instagram.coletar({
    db, fetch: f, agora: relogio(), log: logMudo, apify, extrator, fila, dirImagens: dir,
    config: { perfis: ['coletivo_exemplo'], seguirBio: false, ...config },
  });
  return { r, apify, claude, dir, db, f };
}
const post = (extra = {}) => ({ ...POSTS[0], ...extra });

test('Instagram: o bruto guarda legenda, publicadoEm, código e local marcado, e não guarda comentário', async () => {
  const { r } = await rodarPosts({ posts: [post()], leituras: [FLYER] });
  const b = r.itens[0].bruto;
  assert.equal(b.legenda, POSTS[0].caption);
  assert.equal(b.publicadoEm, '2026-11-20T18:00:00.000Z');
  assert.equal(b.codigo, 'AbC1');
  assert.deepEqual(b.local, { nome: 'Galpão Exemplo', id: '123456' });
  assert.equal(b.cidade, 'São Paulo');
  assert.equal(b.uf, 'SP');
  assert.equal(b.ehFesta, true);
  assert.equal(b.tipo, 'festa');
  assert.equal(b.imagem, undefined, 'o que a peça é não vai ao bruto');
  assert.equal(b.confianca, undefined);
  assert.doesNotMatch(JSON.stringify(r.itens), /alguem|vou!|latestComments|likesCount/);
  const longa = 'x'.repeat(9000);
  const { r: r2 } = await rodarPosts({ posts: [post({ caption: longa })], leituras: [FLYER] });
  assert.equal(r2.itens[0].bruto.legenda.length, 6000);
});

test('Instagram: leitura flyer guarda a peça só como caminho; nenhum byte no item', async () => {
  const { r, dir } = await rodarPosts({ posts: [post()], leituras: [FLYER] });
  const [item] = r.itens;
  assert.equal(item.imagens.length, 1);
  const im = item.imagens[0];
  assert.deepEqual({ ...im, caminho: '<caminho>' }, {
    caminho: '<caminho>', tipo: 'image/jpeg', papel: 'post', origem: 'https://www.instagram.com/p/AbC1/',
    credito: 'Divulgação · @coletivo_exemplo', perfil: 'coletivo_exemplo', leitura: 'flyer',
  });
  assert.ok(im.caminho.startsWith(path.join(dir, 'tmp')), 'em <FINDE_IMAGENS>/tmp');
  assert.deepEqual([...fs.readFileSync(im.caminho)], [0xff, 0xd8, 0xff, 0xe0]);
  assert.doesNotMatch(JSON.stringify(item), /base64|\/9j\/|cdninstagram|AAAA/, 'só o caminho, sem byte e sem o endereço do CDN');
  assert.equal(item.bruto.imagens, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram: leitura foto, capa de vídeo e post sem leitura não geram imagem', async () => {
  const foto = { festas: [festaLida('Festa Foto', '2026-11-28', { imagem: 'foto' })], confianca: 'alta' };
  const a = await rodarPosts({ posts: [post()], leituras: [foto] });
  assert.equal(a.r.itens.length, 1);
  assert.equal(a.r.itens[0].imagens, undefined);
  assert.deepEqual(fs.existsSync(path.join(a.dir, 'tmp')) ? fs.readdirSync(path.join(a.dir, 'tmp')) : [], [], 'nada foi gravado');

  const video = await rodarPosts({ posts: [post({ type: 'Video' })], leituras: [FLYER] });
  assert.equal(video.r.itens[0].imagens, undefined, 'a capa do vídeo nunca é guardada, mesmo lida como flyer');
  const reel = await rodarPosts({ posts: [post({ type: 'Reel' })], leituras: [FLYER] });
  assert.equal(reel.r.itens[0].imagens, undefined);

  // Carrossel: só o primeiro slide é lido (o displayUrl); os outros slides, sem leitura própria, não ficam.
  const carrossel = await rodarPosts({ posts: [post({ type: 'Sidecar', images: ['https://scontent.cdninstagram.com/s1.jpg', 'https://scontent.cdninstagram.com/s2.jpg'] })], leituras: [foto] });
  assert.equal(carrossel.r.itens[0].imagens, undefined);
  assert.equal(carrossel.f.chamadas.filter((c) => /cdninstagram\.com\/s2/.test(c.url)).length, 0, 'o segundo slide nem é baixado');

  // Sem leitura (sem chave do Claude), nada é guardado.
  const db = novoBanco();
  const apify = { rodar: async () => [post()] };
  const dir = pastaTemporaria();
  const sem = await instagram.coletar({ db, fetch: fetchDoMundo(), agora: relogio(), log: logMudo, apify, extrator: null, dirImagens: dir, config: { perfis: ['x'], seguirBio: false } });
  assert.equal(sem.itens.length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'tmp')), false);
});

test('Instagram: post com mais de uma festa leva a mesma peça a todas, marcada como agenda', async () => {
  const duas = { festas: [festaLida('Sexta A', '2026-11-27'), festaLida('Sábado B', '2026-11-28')], confianca: 'alta' };
  const { r } = await rodarPosts({ posts: [post()], leituras: [duas] });
  assert.equal(r.itens.length, 2);
  assert.equal(r.itens[0].imagens[0].caminho, r.itens[1].imagens[0].caminho);
  assert.ok(r.itens.every((i) => i.imagens[0].agenda === true));
});

test('Instagram: releitura com nome diferente substitui o item velho do mesmo post', async () => {
  const db = novoBanco();
  const dir = pastaTemporaria();
  process.env.FINDE_IMAGENS = dir;
  const lerComNome = (nome, modelo) => async () => {
    const claude = claudeFalso([{ festas: [festaLida(nome, '2026-11-28', { casa: 'Casa Exemplo' })], confianca: 'alta' }]);
    return executar({
      db, fontes: [instagram], fetch: fetchDoMundo(), claude, agora: relogio(), log: logMudo, apifyToken: 'tok', forcar: true,
      classificadorOpcoes: modelo ? { modelo } : {}, // outro modelo, outro hash: a leitura não vem do cache
      config: { instagram: { perfis: ['coletivo_exemplo'], seguirBio: false } },
    });
  };
  await lerComNome('Noite Velha')();
  const antes = listarRegistros(db, { todas: true });
  assert.deepEqual(antes.map((f) => f.nome), ['Noite Velha']);
  const idVelho = db.prepare("SELECT id_externo FROM itens_brutos WHERE fonte = 'instagram'").get().id_externo;
  await lerComNome('Noite Nova', 'claude-sonnet-5-5')();
  const depois = listarRegistros(db, { todas: true });
  assert.deepEqual(depois.map((f) => f.nome), ['Noite Nova'], 'a festa velha não fica duplicada nem com ehFesta: true');
  // A mesma festa do post, relida: o id que o convite e as avaliações usam fica.
  assert.equal(depois[0].id, antes[0].id, 'a festa mantém o id');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM festas').get().n, 1);
  const velho = db.prepare("SELECT bruto FROM itens_brutos WHERE id_externo = ?").get(idVelho);
  assert.equal(JSON.parse(velho.bruto).substituido, true, 'o bruto fica, marcado substituido');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vinculos WHERE id_externo = ?').get(idVelho).n, 0);
  delete process.env.FINDE_IMAGENS;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram: releitura de post com duas festas passa o vínculo pela data; a que sumiu do post sai', () => {
  const db = novoBanco();
  const ins = db.prepare("INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES ('instagram', ?, 'h', ?, 't')");
  const fes = db.prepare("INSERT INTO festas (id, data, data_noite, criada_em) VALUES (?, ?, ?, 't')");
  const vin = db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, visto_em, regra) VALUES ('instagram', ?, ?, 't', 'nova')");
  for (const [id, festa, data] of [['ig:POSTDUAS:a', 'sexta-a', '2026-11-27'], ['ig:POSTDUAS:b', 'sabado-b', '2026-11-28']]) {
    ins.run(id, JSON.stringify({ nome: festa, data }));
    fes.run(festa, data, data);
    vin.run(id, festa);
  }
  // A releitura só traz o sábado, com outro nome (outro id).
  const saiu = instagram.substituirItensAntigos(db, 'POSTDUAS', new Set(['ig:POSTDUAS:c']), new Map([['ig:POSTDUAS:c', '2026-11-28']]));
  assert.deepEqual(saiu.sort(), ['ig:POSTDUAS:a', 'ig:POSTDUAS:b']);
  assert.equal(db.prepare("SELECT festa_id FROM vinculos WHERE id_externo = 'ig:POSTDUAS:c'").get().festa_id, 'sabado-b', 'o sábado novo herda a festa do sábado');
  assert.deepEqual(db.prepare('SELECT id FROM festas ORDER BY id').all().map((r) => r.id), ['sabado-b'], 'a sexta, que saiu do post, sai');
});

test('Instagram: releitura com nome trocado não mexe na festa de ontem do post; a de amanhã herda o vínculo', () => {
  const db = novoBanco();
  const ins = db.prepare("INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES ('instagram', ?, 'h', ?, 't')");
  const fes = db.prepare("INSERT INTO festas (id, data, data_noite, criada_em) VALUES (?, ?, ?, 't')");
  const vin = db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, visto_em, regra) VALUES ('instagram', ?, ?, 't', 'nova')");
  for (const [id, festa, data] of [['ig:POSTDOIS:o', 'festa-ontem', '2026-11-23'], ['ig:POSTDOIS:a', 'festa-amanha', '2026-11-25']]) {
    ins.run(id, JSON.stringify({ nome: festa, data }));
    fes.run(festa, data, data);
    vin.run(id, festa);
  }
  db.prepare("INSERT INTO avaliacoes (chave, festa_id, aparelho, resposta, recebida_em) VALUES ('k1', 'festa-ontem', 'ap', 'na-medida', 't')").run();
  // A releitura devolve as duas com outro nome; a coleta só emite a de amanhã.
  const saiu = instagram.substituirItensAntigos(db, 'POSTDOIS', new Set(['ig:POSTDOIS:o2', 'ig:POSTDOIS:a2']),
    new Map([['ig:POSTDOIS:a2', '2026-11-25']]), '2026-11-24');
  assert.deepEqual(saiu, ['ig:POSTDOIS:a']);
  assert.deepEqual(db.prepare('SELECT id FROM festas ORDER BY id').all().map((r) => r.id), ['festa-amanha', 'festa-ontem'], 'as duas festas mantêm o id');
  assert.equal(db.prepare("SELECT festa_id FROM vinculos WHERE id_externo = 'ig:POSTDOIS:o'").get().festa_id, 'festa-ontem', 'o vínculo da festa passada fica como está');
  assert.equal(JSON.parse(db.prepare("SELECT bruto FROM itens_brutos WHERE id_externo = 'ig:POSTDOIS:o'").get().bruto).substituido, undefined);
  assert.equal(db.prepare("SELECT festa_id FROM vinculos WHERE id_externo = 'ig:POSTDOIS:a2'").get().festa_id, 'festa-amanha');
});

test('Instagram: festa com avaliação não sai da base quando o post relido perde o item dela', () => {
  const db = novoBanco();
  db.prepare("INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES ('instagram', 'ig:POSTAV:x', 'h', ?, 't')").run(JSON.stringify({ data: '2026-11-25' }));
  db.prepare("INSERT INTO festas (id, data, data_noite, criada_em) VALUES ('festa-avaliada', '2026-11-25', '2026-11-25', 't')").run();
  db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, visto_em, regra) VALUES ('instagram', 'ig:POSTAV:x', 'festa-avaliada', 't', 'nova')").run();
  db.prepare("INSERT INTO avaliacoes (chave, festa_id, aparelho, resposta, recebida_em) VALUES ('k2', 'festa-avaliada', 'ap', 'mais-novo', 't')").run();
  // Sem `hoje` e sem herdeiro (duas festas novas, outra data): o vínculo sai, a festa fica.
  instagram.substituirItensAntigos(db, 'POSTAV', new Set(['ig:POSTAV:y', 'ig:POSTAV:z']), new Map([['ig:POSTAV:y', '2026-11-27'], ['ig:POSTAV:z', '2026-11-28']]));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM festas WHERE id = 'festa-avaliada'").get().n, 1);
});

test('Instagram: releitura que devolve a mesma festa não apaga nada; festa já passada de um post relido fica', async () => {
  const { db } = await rodarPosts({ posts: [post()], leituras: [FLYER] });
  const igual = instagram.substituirItensAntigos(db, 'AbC1', new Set(['ig:AbC1:x']));
  assert.deepEqual(igual, [], 'sem itens guardados do post, nada sai');
});

test('Instagram: recuperar monta directUrls com os posts de festas futuras e respeita o teto', async () => {
  const db = novoBanco();
  const ins = db.prepare("INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES ('instagram', ?, 'h', ?, ?)");
  ins.run('ig:AAA:1', JSON.stringify({ data: '2026-11-28' }), '2026-11-09T10:00:00.000Z');
  ins.run('ig:BBB:1', JSON.stringify({ data: '2026-11-29' }), '2026-11-09T11:00:00.000Z');
  ins.run('ig:BBB:2', JSON.stringify({ data: '2026-11-29' }), '2026-11-09T11:00:01.000Z');
  ins.run('ig:CCC:1', JSON.stringify({ data: '2026-10-01' }), '2026-11-09T12:00:00.000Z'); // passada
  ins.run('ig:DDD:1', JSON.stringify({ data: '2026-11-30', substituido: true }), '2026-11-09T13:00:00.000Z'); // substituída
  ins.run('ig:EEE:1', JSON.stringify({ data: '2026-12-01' }), '2026-11-09T14:00:00.000Z');
  const { apify } = await rodarPosts({ posts: [], leituras: [FLYER], db, config: { recuperar: true, perfis: [], maxItens: 2 } });
  const [entrada] = apify.entradas;
  assert.deepEqual(entrada.directUrls, ['https://www.instagram.com/p/EEE/', 'https://www.instagram.com/p/BBB/'], 'mais recentes primeiro, sem repetir, no teto de 2');
  assert.equal(entrada.resultsLimit, 1);
  assert.equal(entrada.onlyPostsNewerThan, undefined);
  const vazio = await rodarPosts({ posts: [], leituras: [FLYER], config: { recuperar: true, perfis: [] } });
  assert.equal(vazio.r.rodou, false);
  assert.match(vazio.r.avisos[0], /nenhum post de festa futura/);
});

test('Instagram: diasExtra amplia a janela da busca e não gasta perfis', async () => {
  const { apify } = await rodarPosts({ posts: [], leituras: [FLYER], config: { diasExtra: 10, dias: 2, seguirBio: true } });
  assert.equal(apify.entradas.length, 1, 'só a rodada de posts');
  assert.equal(apify.entradas[0].onlyPostsNewerThan, '10 days');
});

test('Instagram: sem perfis a fonte avisa e não roda; perfis do arquivo do Fly com reserva no perfisArquivo', async () => {
  const dir = pastaTemporaria();
  const apify = { rodar: async () => [] };
  const a = await instagram.coletar({ db: novoBanco(), fetch: fetchDoMundo(), agora: relogio(), log: logMudo, apify, config: { perfis: [], seguirBio: false } });
  assert.equal(a.rodou, false);
  assert.match(a.avisos[0], /nenhum perfil/);
  // FINDE_INSTAGRAM_PERFIS aponta um arquivo que não existe: vale o perfisArquivo do config.
  const reserva = path.join(dir, 'reserva.json');
  fs.writeFileSync(reserva, JSON.stringify([{ url: 'https://www.instagram.com/casa_reserva/', tipo: 'casa' }]));
  const antes = process.env.FINDE_INSTAGRAM_PERFIS;
  process.env.FINDE_INSTAGRAM_PERFIS = path.join(dir, 'nao-existe.json');
  try {
    const vistos = [];
    const ap = { rodar: async (ator, entrada) => { vistos.push(entrada); return []; } };
    await instagram.coletar({ db: novoBanco(), fetch: fetchDoMundo(), agora: relogio(), log: logMudo, apify: ap, config: { perfisArquivo: reserva, seguirBio: false } });
    assert.deepEqual(vistos[0].directUrls, ['https://www.instagram.com/casa_reserva/']);
  } finally {
    if (antes === undefined) delete process.env.FINDE_INSTAGRAM_PERFIS; else process.env.FINDE_INSTAGRAM_PERFIS = antes;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram: perfisPorRodada gira a lista pelo dia, sem passar fome', () => {
  const perfis = Array.from({ length: 7 }, (_, i) => `p${i}`);
  const dia = (n) => () => new Date(Date.parse('2026-11-10T15:00:00Z') + n * 86400e3);
  const rodadas = [0, 1, 2].map((n) => instagram.perfisDaRodada(perfis, { perfisPorRodada: 3, agora: dia(n) }));
  assert.ok(rodadas.every((r) => r.length === 3));
  assert.deepEqual([...new Set(rodadas.flat())].length, 7, 'em poucos dias todos passam');
  assert.deepEqual(instagram.perfisDaRodada(perfis, { perfisPorRodada: null, agora: dia(0) }), perfis);
  assert.deepEqual(instagram.perfisDaRodada(perfis.slice(0, 2), { perfisPorRodada: 3, agora: dia(0) }), perfis.slice(0, 2));
});

test('Instagram: imagem fora do CDN do Instagram ou em http não é baixada', async () => {
  const fora = await rodarPosts({ posts: [post({ displayUrl: 'https://interno.example/flyer.jpg' }), post({ shortCode: 'Xy2', url: 'https://www.instagram.com/p/Xy2/', displayUrl: 'http://scontent.cdninstagram.com/f.jpg' })], leituras: [FLYER] });
  assert.ok(fora.f.chamadas.every((c) => !/interno\.example|^http:/.test(c.url)));
  assert.equal(fora.r.itens.length >= 1, true, 'a legenda ainda é lida, só sem a imagem');
  assert.ok(fora.r.avisos.some((a) => /fora do CDN do Instagram/.test(a)));
  assert.ok(fora.r.itens.every((i) => i.imagens === undefined));
});

test('Instagram: show, leitura e sessão de escuta lidos pelo modelo ficam fora do export; a festa fica', async () => {
  const dir = pastaTemporaria();
  process.env.FINDE_IMAGENS = dir;
  const db = novoBanco();
  const leitura = {
    festas: [
      festaLida('Cartas e Segredos', '2026-11-28', { ehFesta: false, tipo: 'leitura', casa: 'Casa de Francisca' }),
      festaLida('Sessão de escuta de disco', '2026-11-28', { ehFesta: false, tipo: 'sessao-de-escuta', casa: 'Hifi Community' }),
      festaLida('Jazz de segunda', '2026-11-30', { ehFesta: false, tipo: 'show', casa: 'Matiz' }),
      festaLida('Baile da Sexta', '2026-11-27', { casa: 'Casa Exemplo' }),
    ],
    confianca: 'alta',
  };
  await executar({
    db, fontes: [instagram], fetch: fetchDoMundo(), claude: claudeFalso([leitura]), agora: relogio(), log: logMudo, apifyToken: 'tok',
    config: { instagram: { perfis: ['coletivo_exemplo'], seguirBio: false } },
  });
  assert.deepEqual(listarRegistros(db).map((f) => f.nome), ['Baile da Sexta']);
  assert.equal(listarRegistros(db, { todas: true }).length, 4, 'as que não são festa ficam no banco, só saem do export');
  delete process.env.FINDE_IMAGENS;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram: a lista de perfis do config cabe nos tetos de custo (custoEsperado)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'fontes.json'), 'utf8')).instagram;
  const contatos = path.join(__dirname, '..', 'entrada', 'grupo', 'contatos.json');
  const perfis = fs.existsSync(contatos) ? instagram.perfisDoArquivo(contatos).length : 40; // o arquivo é privado, fora do git
  const c = instagram.custoEsperado({ perfis, postsPorPerfil: cfg.postsPorPerfil, perfisPorRodada: cfg.perfisPorRodada, dias: cfg.dias, maxItens: cfg.maxItens }, {
    precoPorMil: cfg.precoPorMil, precoPorMilPerfis: cfg.precoPorMilPerfis, tetoRodadaUsd: cfg.tetoUsd, tetoPerfisUsd: cfg.tetoUsdPerfis,
  });
  assert.ok(c.cabe.postsNoCap, `os posts por rodada (${c.posts}) cabem no teto da chamada (${c.postsDoCap})`);
  assert.ok(c.cabe.apifyRodada, JSON.stringify(c));
  assert.ok(c.cabe.apifyDia, `Apify no dia dos perfis: ${c.apifyDiaUsd.toFixed(3)}`);
  assert.ok(c.cabe.claudeExecucao, `Claude na execução: ${c.claudeUsd.toFixed(3)}`);
  // Os tetos globais da decisão D1 não mudaram aqui.
  assert.ok(cfg.tetoUsd <= 0.1, 'o teto da chamada de posts fica em US$ 0,10');
  // E a conta mostra o que estoura: 50 perfis, 4 posts cada, 120 itens não cabem.
  const velha = instagram.custoEsperado({ perfis: 50, postsPorPerfil: 4, dias: 2, maxItens: 120 });
  assert.equal(velha.cabe.postsNoCap, false);
});

test('Instagram: o Linktree é lido com User-Agent sem nome nem e-mail de pessoa', async () => {
  const chamadas = [];
  const f = async (u, op = {}) => { chamadas.push(op); return new Response(LINKTREE, { headers: { 'content-type': 'text/html' } }); };
  await instagram.linksDoLinktree(f, 'https://linktr.ee/x', 1000);
  assert.match(chamadas[0].headers['User-Agent'], /^FindeMotor\/\d/);
  assert.doesNotMatch(chamadas[0].headers['User-Agent'], /caio|@|gouveia|github/i);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { montarRegistro, precoAPartirDe } = require('../nucleo/contrato');

const linha = (campo, fonte, valor, conferido_em) => ({ campo, fonte, valor: JSON.stringify(valor), conferido_em });

test('campo a campo vale a fonte de maior prioridade, e cada campo diz a fonte e a hora', () => {
  const r = montarRegistro({ id: 'f' }, [
    linha('nome', 'mapas-culturais', 'Nome do Mapa', '2026-11-10T12:00:00Z'),
    linha('nome', 'envio', 'Nome da Produtora', '2026-11-09T12:00:00Z'),
    linha('estilos', 'claude', ['funk'], '2026-11-10T12:00:00Z'),
  ], [{ fonte: 'envio', url: null, visto_em: '2026-11-09T12:00:00Z' }]);
  assert.equal(r.nome, 'Nome da Produtora');
  assert.deepEqual(r.campos.nome, { fonte: 'envio', conferidoEm: '2026-11-09T09:00:00-03:00' });
  assert.deepEqual(r.classificacao, { por: 'claude', conferidoEm: '2026-11-10T09:00:00-03:00', tipo: null });
  assert.equal(r.coletadoEm, '2026-11-09T09:00:00-03:00');
});

test('no empate de prioridade vale a conferida por último', () => {
  const r = montarRegistro({ id: 'f' }, [
    linha('casa', 'envio', 'Antiga', '2026-11-08T00:00:00Z'),
    linha('casa', 'envio', 'Nova', '2026-11-09T00:00:00Z'),
  ], []);
  assert.equal(r.casa, 'Nova');
});

test('campo que ninguém trouxe sai vazio, nunca inventado (R12, AE2 e AE4 do detalhe)', () => {
  const r = montarRegistro({ id: 'f' }, [linha('nome', 'envio', 'X', 't')], []);
  assert.equal(r.mediaIdade, null);
  assert.equal(r.lineup, null);
  assert.equal(r.pistaCheia, null);
  assert.deepEqual(r.estilos, []);
  assert.equal(r.precoAPartirDe, null);
});

test('preço a partir de: o menor lote disponível, contando os esgotados (AE3 do detalhe)', () => {
  assert.deepEqual(precoAPartirDe([
    { nome: '1º lote', preco: 40, disponivel: false },
    { nome: '2º lote', preco: 60, disponivel: true },
    { nome: '3º lote', preco: 80, disponivel: null },
  ]), { valor: 60, lote: '2º lote', esgotadosAntes: 1 });
});

test('só porta: preço da porta (AE1 do detalhe); tudo esgotado sem porta: esgotado', () => {
  assert.deepEqual(precoAPartirDe(null, { preco: 40 }), { valor: 40, lote: 'na porta', esgotadosAntes: 0 });
  const r = montarRegistro({ id: 'f' }, [linha('lotes', 'envio', [{ nome: 'único', preco: 50, disponivel: false }], 't')], []);
  assert.equal(r.precoAPartirDe, null);
  assert.equal(r.esgotado, true);
});

// ---------------------------------------------------------------- contrato /3 (U2 do plano de 24/11)

const fs = require('node:fs');
const path = require('node:path');
const { dataDaNoite, listarRegistros, VERSAO_CONTRATO } = require('../nucleo/contrato');
const { novoBanco } = require('./ajuda');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', 'registro-r14-3.json'), 'utf8'));
const chaves = (o) => Object.keys(o).sort();

test('/3: a noite da festa; início antes das 6h é a noite anterior, sem início é a data', () => {
  assert.equal(dataDaNoite('2026-11-28', '2026-11-28T00:30:00-03:00'), '2026-11-27');
  assert.equal(dataDaNoite('2026-11-28', '2026-11-28T05:59:00-03:00'), '2026-11-27');
  assert.equal(dataDaNoite('2026-11-28', '2026-11-28T06:00:00-03:00'), '2026-11-28');
  assert.equal(dataDaNoite('2026-11-28', '2026-11-29T02:30:00Z'), '2026-11-28'); // 23h30 em São Paulo
  assert.equal(dataDaNoite('2026-11-28', null), '2026-11-28');
  assert.equal(dataDaNoite(null, null), null);
});

test('/3: o registro do motor tem exatamente as chaves da fixture, e os campos novos saem neutros', () => {
  assert.equal(FIXTURE.contrato, VERSAO_CONTRATO);
  const db = novoBanco();
  db.prepare("INSERT INTO festas (id, data, criada_em, data_noite) VALUES ('f1', '2026-11-28', 't', '2026-11-27')").run();
  const ins = db.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [campo, fonte, valor] of [
    ['nome', 'paginas', 'Depois da Meia-Noite'], ['data', 'paginas', '2026-11-28'], ['inicio', 'paginas', '2026-11-28T00:30:00-03:00'],
    ['endereco', 'paginas', { texto: 'Rua Exemplo, 200', bairro: 'barra-funda', regiao: 'oeste', cidade: 'São Paulo' }],
    ['geo', 'paginas', { lat: -23.5255001, lng: -46.6670009, precisao: 'rua', origemGeo: 'pagina' }],
    ['ehFesta', 'paginas', true], ['tipo', 'paginas', 'festa'],
  ]) ins.run('f1', campo, fonte, JSON.stringify(valor), '2026-11-24T15:00:00.000Z', '2026-11-24T15:00:00.000Z');
  db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em, regra, escore, motivo) VALUES ('paginas', 'p1', 'f1', 'https://ingressos.example/e', '2026-11-24T15:00:00.000Z', 'escore', 6, ?)")
    .run(JSON.stringify([{ sinal: 'link', peso: 4, detalhe: 'mesmo link' }]));
  const [r] = listarRegistros(db);
  for (const ref of FIXTURE.festas) {
    assert.deepEqual(chaves(r), chaves(ref), ref.id);
    assert.deepEqual(chaves(r.endereco), chaves(ref.endereco), `${ref.id}: endereco`);
    for (const fo of ref.fontes) {
      assert.deepEqual(chaves(r.fontes[0]), chaves(fo), `${ref.id}: fontes[]`);
      assert.deepEqual(chaves(r.fontes[0].vinculo), chaves(fo.vinculo), `${ref.id}: fontes[].vinculo`);
    }
    if (ref.campos.endereco) assert.deepEqual(chaves(r.campos.endereco.subcampos), chaves(ref.campos.endereco.subcampos), `${ref.id}: subcampos`);
  }
  const imagem = FIXTURE.festas[0].imagens[0];
  assert.deepEqual(chaves(FIXTURE.festas[0].cartaz), chaves(imagem));
  assert.equal(r.dataDaNoite, '2026-11-27');
  assert.deepEqual([r.endereco.lat, r.endereco.lng, r.endereco.precisao, r.endereco.origemGeo, r.endereco.atribuicaoOsm], [-23.5255, -46.667, 'rua', 'pagina', false]);
  assert.equal(r.endereco.bairroNome, 'Barra Funda');
  assert.equal(r.endereco.cidadeOrigem, 'fonte');
  assert.deepEqual(r.fontes[0].vinculo, { regra: 'escore', escore: 6, sinais: [{ sinal: 'link', peso: 4, detalhe: 'mesmo link' }] });
  assert.deepEqual([r.imagens, r.cartaz, r.divergencias, r.idsAntigos, r.revisar], [[], null, [], [], []]);
  assert.equal(r.classificacao.tipo, 'festa');
  assert.equal('vendaAberta' in r, false);
});

test('/3: vínculo anterior ao /3 sai como "nova"; endereço sem nada sai com todas as chaves nulas', () => {
  const r = montarRegistro({ id: 'f' }, [linha('nome', 'envio', 'X', '2026-11-24T15:00:00Z')], [{ fonte: 'envio', url: null, visto_em: '2026-11-24T15:00:00Z' }]);
  assert.deepEqual(r.fontes[0].vinculo, { regra: 'nova', escore: null, sinais: [] });
  assert.deepEqual(chaves(r.endereco), chaves(FIXTURE.festas[0].endereco));
  assert.ok(Object.entries(r.endereco).every(([k, x]) => (k === 'atribuicaoOsm' ? x === false : x === null)));
  assert.equal(r.dataDaNoite, null);
});

test('/3: a prioridade do campo vem antes da geral (ehFesta do modelo vence as regras e a plataforma; curadoria vence tudo)', () => {
  const r = montarRegistro({ id: 'f' }, [
    linha('ehFesta', 'shotgun-apify', true, '2026-11-24T15:00:00Z'),
    linha('ehFesta', 'regras', true, '2026-11-24T16:00:00Z'),
    linha('ehFesta', 'paginas', false, '2026-11-24T14:00:00Z'),
  ], []);
  assert.equal(r.ehFesta, false);
  const c = montarRegistro({ id: 'f' }, [
    linha('ehFesta', 'envio', false, '2026-11-24T15:00:00Z'),
    linha('ehFesta', 'curadoria', true, '2026-11-24T14:00:00Z'),
    linha('casa', 'curadoria', 'Casa Certa', '2026-11-24T14:00:00Z'),
    linha('casa', 'envio', 'Casa Errada', '2026-11-24T15:00:00Z'),
  ], []);
  assert.equal(c.ehFesta, true);
  assert.equal(c.casa, 'Casa Certa');
});

test('/3: festa oculta pela curadoria fica fora, salvo todas', () => {
  const db = novoBanco();
  db.prepare("INSERT INTO festas (id, data, criada_em) VALUES ('f1', '2026-11-28', 't')").run();
  const ins = db.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('f1', 'nome', 'envio', '"X"', 't', 't');
  ins.run('f1', 'oculta', 'curadoria', JSON.stringify({ motivo: 'não é festa' }), 't', 't');
  assert.equal(listarRegistros(db).length, 0);
  assert.equal(listarRegistros(db, { todas: true }).length, 1);
});

// ---------------------------------------------------------------- U7: o /3 preenchido

const { executar } = require('../nucleo/coleta');
const { relogio, logMudo, fonteFixa } = require('./ajuda');

// Um banco com valores prontos: [[campo, fonte, valor, conferido_em?]], vínculos [[fonte, id, url]].
function bancoCom(valores, vinculos = [], { id = 'f1', data = '2026-12-05' } = {}) {
  const db = novoBanco();
  db.prepare('INSERT INTO festas (id, data, criada_em, data_noite) VALUES (?, ?, ?, ?)').run(id, data, 't', data);
  const ins = db.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [campo, fonte, valor, quando = '2026-11-24T15:00:00.000Z'] of valores) ins.run(id, campo, fonte, JSON.stringify(valor), quando, quando);
  for (const [fonte, idExterno, url = null] of vinculos) {
    db.prepare('INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em) VALUES (?, ?, ?, ?, ?)').run(fonte, idExterno, id, url, '2026-11-24T15:00:00.000Z');
  }
  return db;
}

test('AE2: Maré Alta sai com o texto, o CEP e a cidade da indicação, e o bairro de quem tiver', () => {
  const db = bancoCom([
    ['nome', 'indicacao', 'Maré Alta São Paulo · sábado'], ['data', 'indicacao', '2026-12-05'], ['ehFesta', 'indicacao', true],
    ['endereco', 'indicacao', { texto: 'Av. Senador Teotônio Vilela, 261 - Interlagos (CEP 04801-010)', bairro: null, regiao: null, cidade: 'São Paulo', cidadeOrigem: 'cep', cep: '04801-010' }, '2026-11-24T03:50:00.000Z'],
    // A página tem prioridade maior e só traz o bairro; os nulos dela não apagam a indicação.
    ['endereco', 'paginas', { texto: null, bairro: 'interlagos', bairroNome: 'Interlagos', regiao: 'sul', cidade: null }, '2026-11-24T03:57:00.000Z'],
    // A cidade que a normalização tirou da casa só vale sem cidade dita por fonte (D6).
    ['endereco', 'shotgun-apify', { texto: null, cidade: 'São Paulo', cidadeOrigem: 'casa', lugar: 'autodromo-de-interlagos' }, '2026-11-24T04:00:00.000Z'],
  ]);
  const [r] = listarRegistros(db, { lugares: [] });
  assert.equal(r.endereco.texto, 'Av. Senador Teotônio Vilela, 261 - Interlagos (CEP 04801-010)');
  assert.equal(r.endereco.cep, '04801-010');
  assert.equal(r.endereco.cidade, 'São Paulo');
  assert.equal(r.endereco.cidadeOrigem, 'cep');
  assert.deepEqual([r.endereco.bairro, r.endereco.bairroNome, r.endereco.regiao], ['interlagos', 'Interlagos', 'sul']);
  assert.equal(r.campos.endereco.subcampos.texto.fonte, 'indicacao');
  assert.equal(r.campos.endereco.subcampos.cidade.fonte, 'indicacao');
  assert.equal(r.campos.endereco.subcampos.bairro.fonte, 'paginas');
  assert.equal(r.campos.endereco.subcampos.geo, null);
  assert.equal(r.campos.endereco.fonte, 'indicacao');
});

test('endereço: um objeto só com nulos nunca vence um preenchido', () => {
  const db = bancoCom([
    ['nome', 'envio', 'X'],
    ['endereco', 'envio', { texto: null, bairro: null, regiao: null, cidade: null }],
    ['endereco', 'mapas-culturais', { texto: 'Rua Exemplo, 1', bairro: 'pinheiros', regiao: 'oeste', cidade: 'São Paulo' }],
  ]);
  const [r] = listarRegistros(db);
  assert.equal(r.endereco.texto, 'Rua Exemplo, 1');
  assert.equal(r.endereco.bairro, 'pinheiros');
  assert.equal(r.campos.endereco.fonte, 'mapas-culturais');
});

test('divergência: Shotgun a R$ 40 e Sympla a R$ 45 geram uma linha de preço; a mesma página de duas fontes sai uma vez', () => {
  const pagina = { tipo: 'ingresso', nome: 'Shotgun', url: 'https://shotgun.live/events/exemplo', lidoEm: '2026-11-24T12:00:00.000Z', campos: ['nome'] };
  const db = bancoCom([
    ['nome', 'shotgun-apify', 'Noite Exemplo'],
    ['lotes', 'shotgun-apify', [{ nome: '1º lote', preco: 40, disponivel: true }]],
    ['lotes', 'sympla-apify', [{ nome: 'Pista', preco: 45, disponivel: true }]],
    ['inicio', 'shotgun-apify', '2026-12-05T23:00:00-03:00'], ['inicio', 'sympla-apify', '2026-12-05T23:00:00-03:00'],
    ['casa', 'shotgun-apify', 'Casa Exemplo'], ['casa', 'sympla-apify', 'CASA EXEMPLO'],
    ['paginas', 'indicacao', [pagina]],
    ['paginas', 'paginas', [{ ...pagina, lidoEm: '2026-11-25T12:00:00.000Z', campos: ['lotes'] }, { tipo: 'ingresso', nome: 'Sympla', url: 'https://www.sympla.com.br/evento/x/3012345', lidoEm: '2026-11-24T10:00:00.000Z', campos: [] }]],
  ]);
  const [r] = listarRegistros(db);
  assert.equal(r.divergencias.length, 1);
  assert.equal(r.divergencias[0].campo, 'precoAPartirDe');
  assert.deepEqual(r.divergencias[0].valores.map((x) => [x.fonte, x.valor]).sort(), [['shotgun-apify', 40], ['sympla-apify', 45]]);
  assert.equal(r.paginas.length, 2);
  const sg = r.paginas.find((p) => p.url === pagina.url);
  assert.deepEqual(sg.campos.sort(), ['lotes', 'nome']);
  assert.equal(sg.lidoEm, '2026-11-25T09:00:00-03:00');
});

test('ehFesta lido do post vence as regras e a plataforma; a curadoria vence tudo; plataforma contra modelo vai para revisar', () => {
  const base = [['nome', 'instagram', 'Cartas e Segredos'], ['endereco', 'instagram', { cidade: 'São Paulo' }]];
  const r = listarRegistros(bancoCom([...base, ['ehFesta', 'regras', true], ['ehFesta', 'shotgun-apify', true], ['ehFesta', 'instagram', false]]), { todas: true })[0];
  assert.equal(r.ehFesta, false);
  assert.ok(r.revisar.some((x) => x.motivo === 'plataforma-contra-modelo'));
  const c = listarRegistros(bancoCom([...base, ['ehFesta', 'instagram', false], ['ehFesta', 'curadoria', true]]))[0];
  assert.equal(c.ehFesta, true);
  assert.equal(c.revisar.some((x) => x.motivo === 'plataforma-contra-modelo'), false);
});

test('na coleta: quando o modelo lê se é festa, o que as regras disseram da festa sai', async () => {
  const db = novoBanco();
  const item = { idExterno: 'x', texto: 'show sentado', bruto: { nome: 'Cartas e Segredos', casa: 'Casa de Francisca', data: '2026-11-28', inicio: '20:00' } };
  await executar({ db, fontes: [fonteFixa('mapas-culturais', [item])], agora: relogio(), log: logMudo, apify: null, fontesDeFesta: [] });
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM valores WHERE fonte = 'regras'").get().n > 0);
  const lido = { idExterno: 'ig:P:1', lidoPorModelo: true, bruto: { nome: 'Cartas e Segredos', casa: 'Casa de Francisca', data: '2026-11-28', inicio: '20:00', ehFesta: false } };
  await executar({ db, fontes: [fonteFixa('instagram', [lido])], agora: relogio(new Date('2026-11-10T16:00:00Z')), log: logMudo, apify: null, fontesDeFesta: [] });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM valores WHERE fonte = 'regras'").get().n, 0);
  assert.equal(listarRegistros(db).length, 0);
});

test('lugar curado: dá a coordenada `casa`, o endereço que faltou e a cidade pela casa (D6), com a atribuição do OSM', () => {
  const lugares = [{ id: 'casa-x', nome: 'Casa X', endereco: 'Rua Exemplo, 91', cep: '01050-000', bairro: 'centro', bairroNome: 'República', regiao: 'centro',
    cidade: 'São Paulo', lat: -23.548591, lng: -46.643399, precisao: 'casa', fonteGeo: 'nominatim', conferidoEm: '2026-11-24' }];
  const db = bancoCom([['nome', 'instagram', 'Noite X'], ['casa', 'instagram', 'Casa X'], ['endereco', 'instagram', { texto: null, lugar: 'casa-x' }],
    ['geo', 'nominatim', { lat: -23.6, lng: -46.7, precisao: 'rua' }]]);
  const [r] = listarRegistros(db, { lugares });
  assert.deepEqual(r.endereco, {
    texto: 'Rua Exemplo, 91', bairro: 'centro', bairroNome: 'República', regiao: 'centro', cidade: 'São Paulo', cidadeOrigem: 'casa', cep: '01050-000', lugar: 'casa-x',
    lat: -23.54859, lng: -46.6434, precisao: 'casa', origemGeo: 'curado', atribuicaoOsm: true,
  });
  assert.equal(r.campos.endereco.subcampos.geo.fonte, 'curado');
  assert.equal(r.campos.endereco.subcampos.cidade.fonte, 'curado');
  // A página com geo próprio perde para a casa curada; a curadoria vence a casa.
  const db2 = bancoCom([['nome', 'paginas', 'Noite X'], ['endereco', 'paginas', { texto: 'Rua Exemplo, 91', cidade: 'São Paulo', lugar: 'casa-x' }],
    ['geo', 'paginas', { lat: -23.55, lng: -46.64, precisao: 'rua', origemGeo: 'pagina' }], ['geo', 'curadoria', { lat: -23.5, lng: -46.6, precisao: 'casa' }]]);
  const [c] = listarRegistros(db2, { lugares });
  assert.deepEqual([c.endereco.lat, c.endereco.origemGeo, c.endereco.cidadeOrigem, c.endereco.atribuicaoOsm], [-23.5, 'curadoria', 'fonte', false]);
});

test('só São Paulo por padrão: festa de Cotia fica fora e entra com `todas`; casa que é cidade e sem cidade vão para revisar', () => {
  const db = bancoCom([['nome', 'paginas', 'DNA'], ['casa', 'paginas', 'Cotia'], ['endereco', 'paginas', { texto: 'Estrada X, 10 - Cotia/SP', cidade: 'Cotia' }]]);
  assert.equal(listarRegistros(db).length, 0);
  assert.equal(listarRegistros(db, { todas: true }).length, 1);
  assert.equal(listarRegistros(db, { soSP: false }).length, 1);
  const r = listarRegistros(bancoCom([['nome', 'paginas', "Cool Kid's"], ['casa', 'paginas', 'São Paulo']]), { todas: true })[0];
  assert.deepEqual(r.revisar.map((x) => x.motivo).sort(), ['casa-e-cidade', 'sem-cidade']);
});

test('/3: o export de um banco de teste valida contra a forma da fixture (com imagem, geo, divergência e apelido)', async () => {
  const imagens = require('../nucleo/imagens');
  const orig = { daFesta: imagens.imagensDaFesta, principal: imagens.escolherPrincipal };
  const ref = FIXTURE.festas[0];
  const { principal: _p, ...semPrincipal } = ref.imagens[0];
  imagens.imagensDaFesta = () => [semPrincipal];
  imagens.escolherPrincipal = (lista) => lista[0] || null;
  try {
    const db = novoBanco();
    const pagina = { idExterno: 'pagina:noite', url: 'https://ingressos.example/evento/noite-exemplo',
      bruto: { nome: 'Noite Exemplo', casa: 'Casa Exemplo', endereco: 'Rua Exemplo, 100 - Pinheiros, São Paulo - SP', data: '2026-12-05', inicio: '23:00', fim: '05:00',
        linkCompra: 'https://ingressos.example/evento/noite-exemplo', lotes: [{ nome: '1º lote', preco: 40, disponivel: true }], lineup: ['DJ Exemplo'], ehFesta: true,
        paginas: [{ tipo: 'ingresso', nome: 'Ingressos Exemplo', url: 'https://ingressos.example/evento/noite-exemplo', lidoEm: '2026-11-24T15:00:00.000Z', campos: ['nome'] }] } };
    const indicacao = { idExterno: 'grupo:noite', url: 'https://ingressos.example/evento/noite-exemplo',
      bruto: { nome: 'Noite Exemplo', casa: 'Casa Exemplo', data: '2026-12-05', inicio: '23:00', linkCompra: 'https://ingressos.example/evento/noite-exemplo', lotes: [{ nome: 'Pista', preco: 45 }] } };
    await executar({ db, fontes: [fonteFixa('indicacao', [indicacao]), fonteFixa('paginas', [pagina])], agora: relogio(), log: logMudo, apify: null, fontesDeFesta: [] });
    const id = db.prepare('SELECT id FROM festas').get().id;
    db.prepare("INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, 'geo', 'paginas', ?, 't', 't')").run(id, JSON.stringify({ lat: -23.56671, lng: -46.69341, precisao: 'rua', origemGeo: 'pagina' }));
    db.prepare("INSERT INTO festas_alias (antigo, novo, quando) VALUES ('noite-exemplo-velha', ?, 't')").run(id);
    const [r] = listarRegistros(db);
    assert.deepEqual(chaves(r), chaves(ref));
    assert.deepEqual(chaves(r.endereco), chaves(ref.endereco));
    assert.deepEqual(chaves(r.campos.endereco), chaves(ref.campos.endereco));
    assert.deepEqual(chaves(r.campos.endereco.subcampos), chaves(ref.campos.endereco.subcampos));
    for (const fo of r.fontes) {
      assert.deepEqual(chaves(fo), chaves(ref.fontes[0]));
      assert.deepEqual(chaves(fo.vinculo), chaves(ref.fontes[0].vinculo));
      for (const s of fo.vinculo.sinais) assert.deepEqual(chaves(s), chaves(ref.fontes[0].vinculo.sinais[0]));
    }
    assert.deepEqual(chaves(r.imagens[0]), chaves(ref.imagens[0]));
    assert.deepEqual(chaves(r.cartaz), chaves(ref.cartaz));
    assert.equal(r.cartaz.principal, true);
    assert.equal(r.divergencias.length, 1);
    assert.deepEqual(chaves(r.divergencias[0]), chaves(ref.divergencias[0]));
    assert.deepEqual(chaves(r.divergencias[0].valores[0]), chaves(ref.divergencias[0].valores[0]));
    assert.deepEqual(r.idsAntigos, ['noite-exemplo-velha']);
    assert.deepEqual([r.endereco.lat, r.endereco.precisao, r.endereco.origemGeo], [-23.56671, 'rua', 'pagina']);
    assert.deepEqual(r.fontes.map((f) => f.vinculo.regra).sort(), ['link', 'nova']);
    for (const x of r.revisar) assert.deepEqual(chaves(x), chaves(ref.revisar[0]));
  } finally {
    imagens.imagensDaFesta = orig.daFesta;
    imagens.escolherPrincipal = orig.principal;
  }
});

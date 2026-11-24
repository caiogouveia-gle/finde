'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarGeocodificador, montarConsulta, USER_AGENT_PADRAO } = require('../nucleo/geocodificar');
const { novoBanco, relogio, logMudo } = require('./ajuda');

const ACHADO = [{ lat: '-23.5605631', lon: '-46.6463614', addresstype: 'amenity', address: { house_number: '830', road: 'Rua Treze de Maio' } }];
const SO_A_RUA = [{ lat: '-23.5528401', lon: '-46.6449087', addresstype: 'road', address: { road: 'Rua São Domingos' } }];
const FORA_DE_SP = [{ lat: '-21.1872727', lon: '-47.8085646', address: { house_number: '1100', road: 'Avenida Nove de Julho' } }];

// fetch de mentira que guarda as chamadas e responde em ordem (a última se repete)
function fetchDe(respostas) {
  const chamadas = [];
  let i = 0;
  const f = async (url, opcoes) => {
    chamadas.push({ url: new URL(url), opcoes });
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  f.chamadas = chamadas;
  return f;
}

function montar({ respostas = [ACHADO], config = {}, agora = relogio() } = {}) {
  const db = novoBanco();
  const dormidos = [];
  const dormir = async (ms) => { dormidos.push(ms); agora.andar(ms); };
  const fetch = fetchDe(respostas);
  const g = criarGeocodificador({ db, fetch, config: { ligada: true, intervaloMs: 1000, maxPorRodada: 20, ...config }, agora, log: logMudo, dormir });
  return { db, g, fetch, agora, dormidos };
}

const MUNDO = { texto: 'R. Treze de Maio, 830 - Bela Vista, São Paulo', cidade: 'São Paulo' };

test('consulta estruturada: rua e número, cidade, estado, país e a caixa da capital', async () => {
  const { g, fetch } = montar();
  const r = await g.localizar(MUNDO);
  assert.deepEqual(r, { lat: -23.56056, lng: -46.64636, precisao: 'casa', origemGeo: 'nominatim' });
  assert.equal(fetch.chamadas.length, 1);
  const u = fetch.chamadas[0].url;
  assert.equal(u.origin + u.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(u.searchParams.get('street'), '830 Rua Treze de Maio');
  assert.equal(u.searchParams.get('city'), 'São Paulo');
  assert.equal(u.searchParams.get('state'), 'SP');
  assert.equal(u.searchParams.get('countrycodes'), 'br');
  assert.equal(u.searchParams.get('bounded'), '1');
  assert.equal(u.searchParams.get('limit'), '1');
  assert.equal(u.searchParams.get('addressdetails'), '1');
  assert.equal(u.searchParams.get('format'), 'jsonv2');
  assert.match(u.searchParams.get('viewbox'), /^-46\.826,-23\.357,-46\.365,-24\.008$/);
  assert.equal(u.searchParams.has('q'), false);
  assert.equal(g.resumo().achou, 1);
});

test('o cache evita o segundo pedido, mesmo com outra grafia da mesma rua e número', async () => {
  const { g, fetch } = montar();
  await g.localizar(MUNDO);
  const de_novo = await g.localizar({ texto: 'Rua Treze de Maio, 830', cidade: 'São Paulo' });
  assert.equal(de_novo.precisao, 'casa');
  assert.equal(fetch.chamadas.length, 1);
  assert.deepEqual(g.resumo(), { ligada: true, consultas: 1, cache: 1, achou: 1, naoAchou: 0, pulados: 0, curados: 0 });
});

test('o cache sobrevive a um geocodificador novo (tabela geocodificacoes)', async () => {
  const { db, g, agora } = montar();
  await g.localizar(MUNDO);
  const fetch2 = fetchDe([[]]);
  const g2 = criarGeocodificador({ db, fetch: fetch2, config: { ligada: true, intervaloMs: 0 }, agora, log: logMudo });
  assert.equal((await g2.localizar(MUNDO)).lat, -23.56056);
  assert.equal(fetch2.chamadas.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM geocodificacoes').get().n, 1);
});

test('"não achou" fica guardado e só volta a ser pedido depois de 30 dias', async () => {
  const { g, fetch, agora } = montar({ respostas: [[], ACHADO] });
  assert.equal(await g.localizar(MUNDO), null);
  assert.equal(g.resumo().naoAchou, 1);
  agora.andar(29 * 86400000);
  assert.equal(await g.localizar(MUNDO), null); // ainda no cache
  assert.equal(fetch.chamadas.length, 1);
  agora.andar(2 * 86400000); // 31 dias
  const r = await g.localizar(MUNDO);
  assert.equal(fetch.chamadas.length, 2);
  assert.equal(r.precisao, 'casa');
  assert.equal(g.resumo().achou, 1);
});

test('o intervalo entre pedidos é respeitado (relógio injetado)', async () => {
  const { g, dormidos } = montar({ config: { intervaloMs: 15000 } });
  await g.localizar(MUNDO);
  assert.deepEqual(dormidos, []); // o primeiro não espera
  await g.localizar({ texto: 'Rua Martins Fontes, 91', cidade: 'São Paulo' });
  assert.deepEqual(dormidos, [15000]);
});

test('o ritmo vale entre execuções: a última consulta gravada conta', async () => {
  const { db, g, agora } = montar({ config: { intervaloMs: 1000 } });
  await g.localizar(MUNDO);
  const dormidos = [];
  const g2 = criarGeocodificador({ db, fetch: fetchDe([ACHADO]), config: { ligada: true, intervaloMs: 1000 }, agora, log: logMudo, dormir: async (ms) => { dormidos.push(ms); agora.andar(ms); } });
  await g2.localizar({ texto: 'Rua Wisard, 149', cidade: 'São Paulo' });
  assert.equal(dormidos.length, 1);
  assert.ok(dormidos[0] > 0 && dormidos[0] <= 1000);
});

test('maxPorRodada corta as consultas; cache não conta', async () => {
  const { g, fetch } = montar({ config: { maxPorRodada: 2 } });
  await g.localizar({ texto: 'Rua A, 1', cidade: 'São Paulo' });
  await g.localizar({ texto: 'Rua B, 2', cidade: 'São Paulo' });
  assert.equal(await g.localizar({ texto: 'Rua C, 3', cidade: 'São Paulo' }), null);
  assert.equal(fetch.chamadas.length, 2);
  assert.equal(g.resumo().pulados, 1);
  assert.ok(await g.localizar({ texto: 'Rua A, 1', cidade: 'São Paulo' })); // do cache, passa do corte
  assert.equal(fetch.chamadas.length, 2);
});

test('ligada: false não pede nada (nem sem a chave, nem com o config vazio)', async () => {
  for (const config of [{ ligada: false }, {}, { ligada: 'true' }]) {
    const db = novoBanco();
    const fetch = fetchDe([ACHADO]);
    const g = criarGeocodificador({ db, fetch, config, log: logMudo });
    assert.equal(await g.localizar(MUNDO), null);
    assert.equal(fetch.chamadas.length, 0);
    assert.equal(g.resumo().ligada, false);
    assert.equal(g.resumo().pulados, 1);
  }
});

test('o User-Agent identifica o aplicativo e não tem nome nem e-mail', async () => {
  const { g, fetch } = montar();
  await g.localizar(MUNDO);
  const ua = fetch.chamadas[0].opcoes.headers['User-Agent'];
  assert.equal(ua, USER_AGENT_PADRAO);
  assert.match(ua, /^[A-Za-z]+\/[\d.]+ \([^@)]*\)$/);
  assert.doesNotMatch(ua, /@/);
  const { g: g2, fetch: f2 } = montar({ config: { userAgent: 'FindeMotor/0.3 (prova academica; +https://finde-app.fly.dev)' } });
  await g2.localizar(MUNDO);
  assert.equal(f2.chamadas[0].opcoes.headers['User-Agent'], 'FindeMotor/0.3 (prova academica; +https://finde-app.fly.dev)');
});

test('endereço sem número, sem rua ou de outra cidade não é consultado', async () => {
  const { g, fetch } = montar();
  for (const e of [
    { texto: 'Praça Charles Miller, s/n', cidade: 'São Paulo' },
    { texto: 'Interlagos' },
    { texto: null, cep: '01004-010' },
    { texto: 'Rua Beija-Flor, 50', cidade: 'Cotia' },
    { texto: 'Rua A, 1', cidade: 'Rio de Janeiro' },
    null,
    undefined,
    'Rua A, 1',
  ]) assert.equal(await g.localizar(e), null, JSON.stringify(e));
  assert.equal(fetch.chamadas.length, 0);
  assert.equal(g.resumo().pulados, 8);
  assert.equal(montarConsulta({ texto: 'Rua A, 1' }).consulta.city, 'São Paulo'); // sem cidade: vale a capital, com a caixa
});

test('precisão: casa quando o número volta, rua quando só achou a via; fora de São Paulo não vale', async () => {
  const a = montar({ respostas: [SO_A_RUA] });
  assert.equal((await a.g.localizar({ texto: 'Rua São Domingos, 251', cidade: 'São Paulo' })).precisao, 'rua');
  const b = montar({ respostas: [FORA_DE_SP] });
  assert.equal(await b.g.localizar({ texto: 'Avenida Nove de Julho, 1100', cidade: 'São Paulo' }), null);
  assert.equal(b.g.resumo().naoAchou, 1); // um ponto fora da caixa conta como "não achou"
});

test('bloqueio é recusa: 429 (e 403, 503) encerram a rodada, sem repetir e sem gravar', async () => {
  for (const status of [429, 403, 503]) {
    const { db, g, fetch } = montar({ respostas: [new Response('devagar', { status })] });
    assert.equal(await g.localizar({ texto: 'Rua A, 1', cidade: 'São Paulo' }), null);
    assert.equal(await g.localizar({ texto: 'Rua B, 2', cidade: 'São Paulo' }), null);
    assert.equal(fetch.chamadas.length, 1, `status ${status}`);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM geocodificacoes').get().n, 0);
    assert.equal(g.resumo().pulados, 1);
  }
});

test('falha de rede, 500 e corpo que não é JSON não gravam nada e não derrubam', async () => {
  for (const r of [new Error('ECONNRESET'), new Response('erro', { status: 500 }), new Response('<html>', { status: 200 })]) {
    const { db, g } = montar({ respostas: [r] });
    assert.equal(await g.localizar(MUNDO), null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM geocodificacoes').get().n, 0);
  }
});

test('casa curada com coordenada não gasta consulta: o pino dela vale mais (KTD2)', async () => {
  const db = novoBanco();
  const fetch = fetchDe([ACHADO]);
  const lugares = [{ id: 'mundo-pensante', nome: 'Mundo Pensante', lat: -23.56056, lng: -46.64636 }, { id: 'sem-pino', nome: 'Sem Pino' }];
  const g = criarGeocodificador({ db, fetch, config: { ligada: true, intervaloMs: 0 }, log: logMudo, lugares });
  assert.equal(await g.localizar({ ...MUNDO, lugar: 'mundo-pensante' }), null);
  assert.equal(fetch.chamadas.length, 0);
  assert.equal(g.resumo().curados, 1);
  // casa curada sem coordenada: consulta como qualquer outra
  assert.ok(await g.localizar({ ...MUNDO, lugar: 'sem-pino' }));
  assert.equal(fetch.chamadas.length, 1);
});

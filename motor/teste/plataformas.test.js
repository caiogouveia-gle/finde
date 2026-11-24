'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sympla, shotgun, ra, emSP } = require('../fontes/plataformas');
const { criarApify } = require('../nucleo/apify');
const { normalizarItem } = require('../nucleo/normalizar');
const { lerConfig, fontesLigadas, CONECTORES } = require('../fontes');
const { AGORA, relogio, novoBanco, logMudo } = require('./ajuda');

const dados = (n) => fs.readFileSync(path.join(__dirname, 'dados', n), 'utf8');

// Cliente real do Apify com fetch falso na rota assíncrona (POST runs, GET dataset, DELETE dataset).
// `pedidos` guarda só os POST de disparo; `todos`, todas as chamadas.
function apifyCom(arquivo, db = null, { status = 200, usd = 0.01 } = {}) {
  const pedidos = [];
  const todos = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    const metodo = init.method || 'GET';
    todos.push({ url: u, metodo, init });
    if (metodo === 'POST' && /\/acts\/[^/]+\/runs\?/.test(u)) {
      pedidos.push({ url: u, init });
      if (status !== 200) return new Response('quota', { status });
      return new Response(JSON.stringify({ data: { id: `run${pedidos.length}`, status: 'SUCCEEDED', defaultDatasetId: `ds${pedidos.length}`, usageTotalUsd: usd } }), { status: 200 });
    }
    if (metodo === 'DELETE') return new Response('', { status: 204 });
    if (/\/datasets\/ds\d+\/items/.test(u)) return new Response(dados(arquivo), { status: 200 });
    return new Response('não achei', { status: 404 });
  };
  fetch.pedidos = pedidos;
  fetch.todos = todos;
  return { fetch, apify: criarApify({ token: 'token-de-teste', fetch, db, agora: relogio(), log: logMudo }) };
}
const corpo = (f, i = 0) => JSON.parse(f.pedidos[i].init.body);

test('emSP: UTC vira −03:00, sem fuso fica como está, só data não ganha hora', () => {
  assert.deepEqual(emSP('2026-11-15T01:00:00.000Z'), { data: '2026-11-14', hora: '22:00' });
  assert.deepEqual(emSP('2026-11-14T22:00:00-03:00'), { data: '2026-11-14', hora: '22:00' });
  assert.deepEqual(emSP('2026-11-20T23:00:00.000'), { data: '2026-11-20', hora: '23:00' });
  assert.deepEqual(emSP('2026-11-20'), { data: '2026-11-20', hora: null });
  assert.deepEqual(emSP('amanhã'), { data: null, hora: null });
});

test('sem APIFY_TOKEN: aviso e nada roda', async () => {
  for (const c of [sympla, shotgun, ra]) {
    const r = await c.coletar({ apify: null, config: {}, agora: relogio() });
    assert.deepEqual(r.itens, []);
    assert.deepEqual(r.avisos, [`sem APIFY_TOKEN: ${c.id} não roda`]);
  }
  assert.equal(criarApify({ token: null }), null);
});

test('Sympla: entrada com a cidade e a fila, token no cabeçalho, mapeamento e descartes', async () => {
  const { fetch, apify } = apifyCom('apify-sympla.json');
  const fila = new Set(['https://www.sympla.com.br/evento/outro/999', 'https://www.ingresse.com/x', 'https://shotgun.live/y']);
  const r = await sympla.coletar({ apify, fila, agora: relogio(), config: { maxItens: 50, tetoUsd: 0.5, precoPorMil: 3, dias: 10 } });
  assert.equal(fetch.pedidos.length, 2); // a principal e a da fila, em chamadas separadas
  assert.match(fetch.pedidos[0].url, /acts\/hypebridge~sympla-events-scraper\/runs\?/);
  assert.match(fetch.pedidos[0].url, /maxItems=50/);
  assert.match(fetch.pedidos[0].url, /maxTotalChargeUsd=0.25/); // 0.5 pedido, cortado ao teto da execução
  assert.match(fetch.pedidos[0].url, /waitForFinish=60/);
  assert.equal(fetch.pedidos[0].init.headers.Authorization, 'Bearer token-de-teste');
  assert.doesNotMatch(fetch.pedidos[0].url, /token-de-teste/);
  assert.deepEqual(corpo(fetch).startUrls.map((u) => u.url), ['https://www.sympla.com.br/eventos/sao-paulo-sp']);
  assert.equal(corpo(fetch).getEventDetails, true);
  assert.deepEqual(corpo(fetch, 1).startUrls.map((u) => u.url), ['https://www.sympla.com.br/evento/outro/999']);
  assert.equal(corpo(fetch, 1).maxItems, 20);
  assert.match(fetch.pedidos[1].url, /maxTotalChargeUsd=0.1/); // teto próprio da fila
  const leitura = fetch.todos.find((c) => /\/datasets\/ds1\/items/.test(c.url));
  assert.match(leitura.url, /fields=id%2Cname%2Curl%2CstartDate/); // só os campos que o mapeador usa
  assert.ok(fetch.todos.some((c) => c.metodo === 'DELETE' && /\/datasets\/ds1$/.test(c.url))); // dataset apagado
  assert.ok(fetch.todos.some((c) => c.metodo === 'DELETE' && /\/datasets\/ds2$/.test(c.url)));
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.itens.map((i) => i.idExterno), ['sympla:3012345', 'sympla:3012348']); // (o mesmo dataset nas duas chamadas não duplica) online e Campos do Jordão ficam fora

  const baile = r.itens[0];
  assert.equal(baile.url, 'https://www.sympla.com.br/evento/baile-do-terraco/3012345');
  assert.deepEqual(baile.categorias, ['Festas e Shows', 'house', 'baile']);
  assert.equal(baile.bruto.ehFesta, undefined); // a classificação decide
  assert.equal(JSON.stringify(baile).includes('@'), false);
  const { campos } = normalizarItem(baile.bruto, 'sympla-apify');
  assert.equal(campos.nome, 'Baile do Terraço');
  assert.equal(campos.produtora.nome, 'Coletivo Exemplo');
  assert.equal(campos.casa, 'Terraço Exemplo');
  assert.equal(campos.fim, '2026-11-15T04:00:00-03:00');
  assert.deepEqual(campos.lotes, [{ nome: 'A partir de', preco: 45.5, disponivel: true }]);
  assert.equal(campos.paginas[0].nome, 'Sympla');
  assert.equal(campos.paginas[0].tipo, 'ingresso');

  const sarau = r.itens[1];
  assert.equal(sarau.bruto.data, '2026-11-14'); // 01:30Z é 22:30 do dia anterior
  assert.equal(sarau.bruto.inicio, '22:30');
  assert.equal(sarau.bruto.endereco, 'Rua das Flores, 10 - Pinheiros');
  assert.deepEqual(sarau.bruto.lotes, [{ nome: 'A partir de', preco: 30, disponivel: false }]);
});

test('Shotgun: UTC para −03:00, lotes com disponibilidade, janela e fila só do host deles', async () => {
  const { fetch, apify } = apifyCom('apify-shotgun.json');
  const fila = new Set(['https://shotgun.live/pt-br/events/da-fila', 'https://www.sympla.com.br/z']);
  const r = await shotgun.coletar({ apify, fila, agora: relogio(), config: { dias: 7 } });
  const e = corpo(fetch);
  assert.equal(fetch.pedidos.length, 2);
  assert.equal(e.mode, 'events');
  assert.deepEqual(e.cities, ['sao-paulo']);
  assert.equal(e.dateFrom, '2026-11-10');
  assert.equal(e.dateTo, '2026-11-17');
  assert.equal(e.scrapeDetails, true);
  assert.equal(e.startUrls, undefined);
  assert.deepEqual(corpo(fetch, 1).startUrls, [{ url: 'https://shotgun.live/pt-br/events/da-fila' }]);
  assert.equal(JSON.stringify(r).includes('cartaz'), false);
  assert.deepEqual(r.itens.map((i) => i.idExterno), ['shotgun:88101', 'shotgun:88102']); // Rio e registro de casa ficam fora

  const techno = r.itens[0];
  assert.equal(techno.bruto.ehFesta, true);
  assert.equal(techno.bruto.data, '2026-11-14');
  assert.equal(techno.bruto.inicio, '22:00');
  assert.equal(techno.bruto.fim, '05:00');
  assert.deepEqual(techno.categorias, ['techno', 'house']);
  assert.deepEqual(techno.bruto.lotes, [
    { nome: '1º lote', preco: 60, disponivel: false },
    { nome: '2º lote', preco: 80, disponivel: true },
    { nome: 'Lote promocional', preco: 50, disponivel: null },
  ]);
  const { campos } = normalizarItem(techno.bruto, 'shotgun-apify');
  assert.equal(campos.fim, '2026-11-15T05:00:00-03:00');
  assert.deepEqual(campos.lineup, ['DJ Um', 'DJ Dois', 'Convidada Três']);
  assert.equal(campos.paginas[0].nome, 'Shotgun');

  const semLotes = r.itens[1];
  assert.equal(semLotes.bruto.data, '2026-11-21');
  assert.equal(semLotes.bruto.inicio, '20:30');
  assert.deepEqual(semLotes.bruto.lotes, [{ nome: 'A partir de', preco: 35, disponivel: false }]);
  assert.deepEqual(semLotes.bruto.lineup, ['Banda Exemplo']);
});

test('Resident Advisor: preço em texto, grátis, fora de SP descartado', async () => {
  const { fetch, apify } = apifyCom('apify-ra.json');
  const r = await ra.coletar({ apify, agora: relogio(), config: {} });
  const e = corpo(fetch);
  assert.deepEqual({ mode: e.mode, countryCode: e.countryCode, city: e.city }, { mode: 'eventsByCity', countryCode: 'br', city: 'sao-paulo' });
  assert.equal(e.dateFrom, '2026-11-10');
  assert.equal(e.dateTo, '2026-12-01'); // 21 dias por padrão
  assert.match(fetch.pedidos[0].url, /parsebird~resident-advisor-scraper/);
  assert.deepEqual(r.itens.map((i) => i.idExterno), ['ra:1900001', 'ra:1900002']);

  const sub = r.itens[0];
  assert.equal(sub.url, 'https://ra.co/events/1900001');
  assert.equal(sub.bruto.ehFesta, true);
  assert.equal(sub.bruto.inicio, '23:00'); // "HH:MM" direto do ator
  assert.equal(sub.bruto.fim, '06:00');
  assert.equal(sub.bruto.cartaz, undefined);
  assert.deepEqual(sub.categorias, ['techno', 'electro']);
  const { campos } = normalizarItem(sub.bruto, 'ra-apify');
  assert.equal(campos.fim, '2026-11-21T06:00:00-03:00');
  assert.equal(campos.produtora.nome, 'Selo Exemplo');
  assert.deepEqual(campos.lineup, ['Artista A', 'Artista B']);
  assert.equal(campos.lotes[0].preco, 70);
  assert.equal(campos.paginas[0].nome, 'Resident Advisor');

  const aberto = normalizarItem(r.itens[1].bruto, 'ra-apify').campos;
  assert.equal(aberto.lotes[0].preco, 0);
  assert.equal(r.itens[1].bruto.linkCompra, undefined); // isTicketed false
});

test('erro do Apify vira aviso e o uso fica registrado', async () => {
  const db = novoBanco();
  const { apify } = apifyCom('apify-sympla.json', db, { status: 402 });
  const r = await sympla.coletar({ apify, agora: relogio(), config: {} });
  assert.deepEqual(r.itens, []);
  assert.match(r.avisos[0], /^sympla-apify: Apify respondeu 402/);
  assert.equal(db.prepare('SELECT resultado FROM uso_apify').get().resultado, 'erro');
});

test('registro: as três plataformas vêm desligadas e a opção poc as liga', () => {
  const config = lerConfig();
  for (const [id, preco] of [['sympla-apify', 3], ['shotgun-apify', 3], ['ra-apify', 2.5]]) {
    assert.ok(CONECTORES[id], id);
    assert.equal(config[id].ligada, false);
    assert.equal(config[id].pocAcademica, true);
    assert.equal(config[id].precoPorMil, preco);
    assert.match(config[id].motivo, /24\/11\/2026/);
  }
  assert.deepEqual(fontesLigadas(config).fontes.map((f) => f.id), ['envio', 'mapas-culturais', 'indicacao']);
  const poc = fontesLigadas(config, { poc: true });
  assert.deepEqual(poc.fontes.map((f) => f.id), ['envio', 'mapas-culturais', 'indicacao', 'instagram', 'paginas']);
  assert.equal(config['ra-apify'].ligada, false); // a original não muda
  void AGORA;
});

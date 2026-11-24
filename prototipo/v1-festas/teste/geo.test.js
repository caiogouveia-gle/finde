'use strict';
// Distância em linha reta e o ponto de cada bairro (U34, R29, KTD15 do plano
// de 24/11/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../nucleo/geo');
const C = require('../nucleo/catalogo');

// Pontos conferidos no OpenStreetMap em 24/11/2026 (Nominatim, consulta à mão).
const BATATA = { lat: -23.5661447, lng: -46.6940096 };
const CALIXTO = { lat: -23.5583317, lng: -46.6807433 };
const RIO = { lat: -22.9068, lng: -43.1729 };

test('haversine: Largo da Batata à Praça Benedito Calixto dá 1,6 km em linha reta', () => {
  // O plano estimou 1,1 km; com os dois pontos conferidos no mapa, são 1,6.
  const km = G.haversineKm(BATATA, CALIXTO);
  assert.ok(Math.abs(km - 1.61) < 0.05, String(km));
  assert.equal(G.haversineKm(BATATA, BATATA), 0);
  assert.ok(Math.abs(G.haversineKm(BATATA, CALIXTO) - G.haversineKm(CALIXTO, BATATA)) < 1e-9);
  // São Paulo ao Rio, uns 360 km.
  assert.ok(Math.abs(G.haversineKm(BATATA, RIO) - 360) < 15);
});

test('haversine: sem os dois pontos, null', () => {
  assert.equal(G.haversineKm(BATATA, null), null);
  assert.equal(G.haversineKm(undefined, BATATA), null);
  assert.equal(G.haversineKm({ lat: NaN, lng: -46.6 }, BATATA), null);
  assert.equal(G.haversineKm({ lat: '-23.5', lng: '-46.6' }, BATATA), null);
});

test('dentroDeSP recusa o Rio e aceita o centro', () => {
  assert.equal(G.dentroDeSP(-23.5432, -46.6426), true);
  assert.equal(G.dentroDeSP(RIO.lat, RIO.lng), false);
  assert.equal(G.dentroDeSP(-23.55, null), false);
});

test('vizinho: até 3 km é vizinho, longe não, sem ponto não se sabe', () => {
  assert.equal(G.vizinho(BATATA, CALIXTO, 3), true);
  assert.equal(G.vizinho(BATATA, CALIXTO, 1), false);
  assert.equal(G.vizinho(BATATA, CALIXTO), true); // raio padrão de 3 km
  const santana = G.pontoDoBairro('santana');
  assert.equal(G.vizinho(BATATA, santana, 3), false);
  assert.equal(G.vizinho(BATATA, null, 3), null);
});

test('pontoDoBairro: os 14 bairros têm ponto dentro de São Paulo', () => {
  const ids = Object.keys(C.TODOS_OS_BAIRROS);
  assert.equal(ids.length, 14);
  for (const id of ids) {
    const p = G.pontoDoBairro(id);
    assert.ok(p, id);
    assert.equal(G.dentroDeSP(p.lat, p.lng), true, id);
  }
  assert.equal(G.pontoDoBairro('atlantida'), null);
  assert.equal(G.pontoDoBairro('__proto__'), null);
  assert.equal(G.pontoDoBairro(null), null);
});

test('pontoDaFesta: só casa ou rua, dentro de São Paulo', () => {
  const f = (local) => ({ local });
  assert.deepEqual(G.pontoDaFesta(f({ lat: -23.56671, lng: -46.69341, precisao: 'rua' })), { lat: -23.56671, lng: -46.69341 });
  assert.ok(G.pontoDaFesta(f({ lat: -23.56671, lng: -46.69341, precisao: 'casa' })));
  assert.equal(G.pontoDaFesta(f({ lat: -23.56671, lng: -46.69341, precisao: 'bairro' })), null);
  assert.equal(G.pontoDaFesta(f({ lat: RIO.lat, lng: RIO.lng, precisao: 'casa' })), null);
  assert.equal(G.pontoDaFesta(f(null)), null);
  assert.equal(G.pontoDaFesta({}), null);
});

test('kmDoBairro: a festa da fixture fica a menos de 1 km do ponto de Pinheiros', () => {
  const festa = require('./dados/festa-r14-3-convertida.json').festa;
  const km = G.kmDoBairro(festa, 'pinheiros');
  assert.equal(typeof km, 'number');
  assert.ok(km >= 0 && km < 1, String(km));
  assert.equal(Math.round(km * 10) / 10, km); // uma casa decimal
  assert.equal(G.kmDoBairro(festa, 'atlantida'), null);
  assert.equal(G.kmDoBairro({ local: null }, 'pinheiros'), null);
});

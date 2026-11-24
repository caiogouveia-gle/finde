'use strict';
// "Como chegar" e a frase da distância (U34, R29, R32, D16 do plano de 24/11/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../publico/local');

const LOCAL = { lat: -23.56671, lng: -46.69341, precisao: 'rua', texto: 'Rua Exemplo, 100 - Pinheiros, São Paulo - SP' };
const porId = (lista) => Object.fromEntries(lista.map((o) => [o.id, o]));

test('com coordenada: Google, Apple e Uber apontam para o ponto', () => {
  const o = L.comoChegar(LOCAL, 'Casa Exemplo');
  assert.deepEqual(o.map((x) => x.id), ['google', 'apple', 'uber']);
  assert.deepEqual(o.map((x) => x.rotulo), ['Google Maps', 'Apple Maps', 'Uber']);
  const p = porId(o);
  assert.equal(p.google.url, 'https://www.google.com/maps/search/?api=1&query=-23.56671,-46.69341');
  assert.equal(p.apple.url, 'https://maps.apple.com/?ll=-23.56671,-46.69341&q=Casa%20Exemplo');
  assert.equal(
    p.uber.url,
    'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=-23.56671&dropoff[longitude]=-46.69341&dropoff[nickname]=Casa%20Exemplo',
  );
  for (const x of o) assert.match(x.url, /^https:\/\//);
});

test('sem coordenada: as mesmas três, pela busca do endereço', () => {
  const p = porId(L.comoChegar({ texto: 'Rua Exemplo, 100 - Pinheiros' }, 'Casa Exemplo'));
  const b = encodeURIComponent('Rua Exemplo, 100 - Pinheiros, São Paulo');
  assert.equal(p.google.url, `https://www.google.com/maps/search/?api=1&query=${b}`);
  assert.equal(p.apple.url, `https://maps.apple.com/?q=${b}`);
  assert.equal(p.uber.url, `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${b}&dropoff[nickname]=Casa%20Exemplo`);
  // O endereço que já diz a cidade não ganha "São Paulo" de novo.
  const q = porId(L.comoChegar({ texto: LOCAL.texto, lat: null, lng: null }, null));
  assert.equal(q.google.url, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCAL.texto)}`);
  assert.doesNotMatch(q.uber.url, /nickname/);
});

test('sem endereço, pela casa com a cidade; sem nada, nenhum link', () => {
  const p = porId(L.comoChegar(null, 'Casa Exemplo'));
  assert.equal(p.google.url, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Casa Exemplo, São Paulo')}`);
  assert.deepEqual(L.comoChegar(null, null), []);
  assert.deepEqual(L.comoChegar({ texto: '   ' }, ''), []);
});

test('precisão de bairro e ponto fora de São Paulo não viram destino: vale o texto', () => {
  const bairro = porId(L.comoChegar({ ...LOCAL, precisao: 'bairro' }, 'Casa Exemplo'));
  assert.doesNotMatch(bairro.google.url, /-23\.56671/);
  assert.match(bairro.google.url, /Rua%20Exemplo/);
  const rio = porId(L.comoChegar({ lat: -22.9068, lng: -43.1729, precisao: 'casa', texto: 'Rua X, 1' }, 'Bar'));
  assert.doesNotMatch(rio.apple.url, /ll=/);
});

test('caractere especial no nome da casa é escapado', () => {
  const casa = 'Bar & Pista #2 / "Sala B"?';
  for (const o of L.comoChegar(LOCAL, casa)) {
    if (o.id === 'google') continue;
    assert.ok(o.url.includes(encodeURIComponent(casa)), o.url);
    assert.doesNotMatch(o.url, /&\s|#|"/);
    // Nenhum parâmetro novo injetado pelo nome.
    assert.equal(new URL(o.url).searchParams.get(o.id === 'apple' ? 'q' : 'dropoff[nickname]'), casa);
  }
  const semPonto = porId(L.comoChegar({ texto: 'Rua A & B, 10' }, casa));
  assert.equal(new URL(semPonto.google.url).searchParams.get('query'), 'Rua A & B, 10, São Paulo');
  assert.equal(new URL(semPonto.uber.url).searchParams.get('dropoff[nickname]'), casa);
});

test('distanciaTexto: a frase com a preposição de cada bairro', () => {
  assert.equal(L.distanciaTexto(2.1, 'Vila Madalena'), 'a 2,1 km da Vila Madalena, em linha reta');
  assert.equal(L.distanciaTexto(0.6, 'Pinheiros'), 'a 0,6 km de Pinheiros, em linha reta');
  assert.equal(L.distanciaTexto(1.23, 'Jardins'), 'a 1,2 km dos Jardins, em linha reta');
  assert.equal(L.distanciaTexto(3, 'Centro'), 'a 3 km do Centro, em linha reta');
  assert.equal(L.distanciaTexto(12.4, 'Interlagos'), 'a 12 km de Interlagos, em linha reta');
  assert.equal(L.distanciaTexto(0, 'Butantã'), 'a 0,1 km do Butantã, em linha reta');
  // O `de` do catálogo e o bairro inteiro também servem.
  assert.equal(L.distanciaTexto(1.5, 'da Mooca'), 'a 1,5 km da Mooca, em linha reta');
  assert.equal(L.distanciaTexto(1.5, { nome: 'Lapa', de: 'da Lapa' }), 'a 1,5 km da Lapa, em linha reta');
  assert.equal(L.distanciaTexto(1.5, 'Bairro Novo'), 'a 1,5 km de Bairro Novo, em linha reta');
});

test('distanciaTexto: sem distância ou sem bairro, nada', () => {
  assert.equal(L.distanciaTexto(null, 'Pinheiros'), '');
  assert.equal(L.distanciaTexto(NaN, 'Pinheiros'), '');
  assert.equal(L.distanciaTexto(-1, 'Pinheiros'), '');
  assert.equal(L.distanciaTexto(2, ''), '');
  assert.equal(L.distanciaTexto(2, null), '');
});

test('sem geolocalização (D16)', () => {
  const fonte = require('node:fs').readFileSync(require.resolve('../publico/local.js'), 'utf8');
  assert.doesNotMatch(fonte, /geolocation|getCurrentPosition|watchPosition/);
});

'use strict';
// O QR Code de divulgação começa sempre pelas perguntas (26/11/2026), mesmo
// o impresso com ?ver=lista&de=qr. Só o "ver outras festas" do convite abre
// a lista sem as perguntas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'publico', 'app.js'), 'utf8');
const iniciar = APP.slice(APP.indexOf('async function iniciar()'), APP.indexOf('desenhar({ focar: false, travar: false });', APP.indexOf('async function iniciar()')));

test('no início do app, o QR desliga o ?ver=lista, pelo endereço ou pela origem que o medir.js guardou', () => {
  assert.match(iniciar, /const deQr = busca\.get\('de'\) === 'qr' \|\| Boolean\(window\.FindeMedir && window\.FindeMedir\.chegouDe === 'qr'\);/);
  assert.match(iniciar, /const verLista = busca\.get\('ver'\) === 'lista' && !deQr;/);
  // A lista neutra e a lista salva só abrem com verLista.
  assert.match(iniciar, /if \(verLista && chegouPorLink\(\) && !\(estado\.resultado && estado\.criterios\)\)/);
  assert.match(iniciar, /const lista = verLista && estado\.resultado && estado\.criterios;/);
});

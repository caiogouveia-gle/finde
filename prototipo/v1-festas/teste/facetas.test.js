'use strict';
// Filtros em facetas do "ver todas": o chip que zeraria a lista some, o
// marcado nunca some, e nenhuma sequência de cliques deixa a lista vazia.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const FT = require('../publico/festa-texto');

const festas = [
  { id: 'a', som: 'funk', bairro: 'Pinheiros', barata: true },
  { id: 'b', som: 'funk', bairro: 'Centro', barata: false },
  { id: 'c', som: 'eletronica', bairro: 'Centro', barata: true },
  { id: 'd', som: 'eletronica', bairro: 'Barra Funda', barata: false },
  { id: 'e', som: null, bairro: 'Pinheiros', barata: false },
];
const zonas = [
  { nome: 'Som', chips: ['funk', 'eletronica'].map((s) => ({ id: `som:${s}`, cabe: (o) => o.som === s })) },
  { nome: 'Bairro', chips: ['Pinheiros', 'Centro', 'Barra Funda'].map((b) => ({ id: `bairro:${b}`, cabe: (o) => o.bairro === b })) },
  { nome: 'Preço', chips: [{ id: 'preco:teto', cabe: (o) => o.barata }] },
];
const chip = (f, id) => f.flatMap((z) => z.chips).find((c) => c.id === id);
const zona = (f, nome) => f.find((z) => z.nome === nome);

test('sem nada marcado, cada chip conta as festas dele e todos aparecem', () => {
  const f = FT.facetas(zonas, festas, new Set());
  assert.equal(chip(f, 'som:funk').n, 2);
  assert.equal(chip(f, 'bairro:Pinheiros').n, 2);
  assert.ok(f.every((z) => z.visivel && z.chips.every((c) => c.visivel)));
});

test('marcar um som some com os bairros que não têm esse som; a própria zona continua somando', () => {
  const f = FT.facetas(zonas, festas, new Set(['som:funk']));
  assert.equal(chip(f, 'bairro:Barra Funda').visivel, false, 'Barra Funda só tem eletrônica');
  assert.equal(chip(f, 'bairro:Pinheiros').n, 1);
  assert.equal(chip(f, 'bairro:Centro').n, 1);
  // Dentro da zona vale qualquer um: eletrônica continua oferecida com as suas 2.
  assert.equal(chip(f, 'som:eletronica').n, 2);
  assert.equal(chip(f, 'som:eletronica').visivel, true);
});

test('marcado nunca some, e a zona inteira some quando não sobra opção', () => {
  const f = FT.facetas(zonas, festas, new Set(['bairro:Barra Funda']));
  assert.equal(chip(f, 'bairro:Barra Funda').visivel, true);
  assert.equal(zona(f, 'Preço').visivel, false, 'a única de Barra Funda não é barata');
  assert.equal(chip(f, 'som:funk').visivel, false);
});

test('nenhuma sequência de cliques em chips visíveis deixa a lista vazia', () => {
  const ids = zonas.flatMap((z) => z.chips.map((c) => c.id));
  const passa = (m) => festas.filter((o) => FT.passaNosFiltros(zonas, m, o)).length;
  const visitar = (m, fundo) => {
    assert.ok(passa(m) > 0, `vazia com ${[...m].join(', ')}`);
    if (fundo === 0) return;
    const f = FT.facetas(zonas, festas, m);
    for (const id of ids) {
      const c = chip(f, id);
      if (!c.visivel) continue;
      const prox = new Set(m);
      if (prox.has(id)) prox.delete(id); else prox.add(id);
      FT.podarFiltros(zonas, festas, prox, zonas.find((z) => z.chips.some((c) => c.id === id)).nome);
      visitar(prox, fundo - 1);
    }
  };
  visitar(new Set(), 4);
});

test('desmarcar o som que segurava o bairro desmarca o bairro junto', () => {
  const m = new Set(['som:funk', 'som:eletronica', 'bairro:Pinheiros']);
  m.delete('som:funk');
  assert.deepEqual(FT.podarFiltros(zonas, festas, m, 'Som'), ['bairro:Pinheiros']);
  assert.deepEqual([...m], ['som:eletronica']);
  assert.ok(festas.some((o) => FT.passaNosFiltros(zonas, m, o)));
});

test('marcar nunca poda: o marcado que fica sem festa continua à vista, com 0', () => {
  const m = new Set(['som:funk', 'som:eletronica']);
  m.add('bairro:Barra Funda');
  assert.deepEqual(FT.podarFiltros(zonas, festas, m, 'Bairro'), []);
  const f = FT.facetas(zonas, festas, m);
  assert.equal(chip(f, 'som:funk').n, 0);
  assert.equal(chip(f, 'som:funk').visivel, true);
});

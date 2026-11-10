'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entender } = require('../nucleo/entender');

const casos = [
  ['sábado à noite, somos 4, Pinheiros, até 80', { quando: 'sab-noite', quem: 'amigos', regiao: 'pinheiros-vila-madalena', preco: 1 }],
  ['domingo de manhã, eu e minha namorada, algo tranquilo', { quando: 'dom', quem: 'casal', clima: 'relaxar' }],
  ['sexta com a galera, quero algo animado', { quando: 'sex-noite', quem: 'turma', clima: 'agitar' }],
  ['de graça, no centro', { preco: 0, regiao: 'centro' }],
  ['algo barato perto da Paulista', { preco: 1, regiao: 'paulista-ibirapuera' }],
  ['queremos conhecer algo novo na Vila Madalena', { clima: 'descobrir', regiao: 'pinheiros-vila-madalena' }],
  ['sem comer, já jantamos', { comida: 'hoje-nao' }],
  ['um jantar para comemorar o niver da Bia', { comida: 'centro', clima: 'comemorar' }],
  ['Sábado no almoço, somos seis', { quando: 'sab-dia', quem: 'turma', comida: 'centro' }],
  ['só eu', { quem: 'so' }],
  ['R$ 150 por pessoa tá ok', { preco: 2 }],
  ['até 200 reais', { preco: 3 }],
  ['Ibirapuera, pra relaxar', { regiao: 'paulista-ibirapuera', clima: 'relaxar' }],
  ['pra colocar o papo em dia na Liberdade', { clima: 'conversar', regiao: 'centro' }],
  ['eu e mais 2 amigos', { quem: 'amigos' }],
  ['bom dia', {}],
  ['sábado', {}],
  ['Somos 3 pessoas, sábado de tarde, sem gastar muito', { quem: 'amigos', quando: 'sab-dia', preco: 1 }],
];

for (const [frase, esperado] of casos) {
  test(`entende: "${frase}"`, () => {
    assert.deepEqual(entender(frase), esperado);
  });
}

test('ajustes relativos usam os critérios atuais', () => {
  assert.deepEqual(entender('mais barato', { preco: 2 }), { preco: 1 });
  assert.deepEqual(entender('mais barato', { preco: 0 }), { preco: 0 });
  assert.deepEqual(entender('outra região', { regiao: 'centro' }), { regiao: 'paulista-ibirapuera' });
  assert.deepEqual(entender('outra região', { regiao: 'qualquer' }), {});
  assert.deepEqual(entender('sem comida'), { comida: 'hoje-nao' });
});

test('respostas soltas valem para a pergunta em aberto', () => {
  assert.deepEqual(entender('tanto faz', {}, 'regiao'), { regiao: 'qualquer' });
  assert.deepEqual(entender('tanto faz', {}, 'preco'), { preco: 3 });
  assert.deepEqual(entender('tanto faz', {}, 'comida'), { comida: 'pode' });
  assert.deepEqual(entender('5', {}, 'quem'), { quem: 'amigos' });
  assert.deepEqual(entender('100', {}, 'preco'), { preco: 2 });
  assert.deepEqual(entender('tanto faz', {}, 'quem'), {});
});

test('número de pessoas não vira preço e vice-versa', () => {
  assert.deepEqual(entender('somos 8, até 50'), { quem: 'turma', preco: 1 });
  assert.deepEqual(entender('até 120, em 2'), { preco: 2, quem: 'casal' });
});

test('texto vazio ou estranho não quebra', () => {
  assert.deepEqual(entender(''), {});
  assert.deepEqual(entender(null), {});
  assert.deepEqual(entender('<script>alert(1)</script>'), {});
});

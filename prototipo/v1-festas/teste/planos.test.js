'use strict';
// Planos: criar, responder, nomes limpos, escrita atômica e releitura do disco.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarPlanos, limparNome, LIMITE_RESPOSTAS } = require('../nucleo/planos');

const mudo = { warn() {}, info() {}, error() {} };
const festa = { festa: { id: 'sabado-groove', nome: 'Sábado Groove' }, linha: 'Sáb · 19h00' };
let pasta;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-planos-'));
});
afterEach(() => {
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('criar com autor já põe o autor em "tô dentro"', () => {
  const p = criarPlanos(pasta, { log: mudo }).criar({ festa, pedido: 'Sáb', autor: 'Bruna' });
  assert.match(p.id, /^[a-z0-9]{8}$/);
  assert.deepEqual(p.dentro, ['Bruna']);
  assert.deepEqual(p.fora, []);
  assert.equal(p.autor, 'Bruna');
});

test('criar sem autor vale; autor em branco vira null; autor inválido é recusado', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  assert.equal(planos.criar({ festa }).autor, null);
  assert.equal(planos.criar({ festa, autor: '   ' }).autor, null);
  assert.throws(() => planos.criar({ festa, autor: 42 }), (e) => e.status === 400);
  assert.throws(() => planos.criar({ festa, autor: '\u0000\u0001' }), (e) => e.status === 400);
});

test('responder: nome repetido pergunta "É você?" antes de trocar', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa, autor: 'Bruna' });
  planos.responder(id, 'Ju', 'dentro');
  planos.responder(id, 'Léo', 'fora');
  assert.throws(() => planos.responder(id, 'léo', 'dentro'), (e) => e.status === 409
    && e.message === 'Já tem Léo na lista. É você?' && e.dados.duplicado === 'Léo');
  const p = planos.responder(id, 'léo', 'dentro', { confirmar: true });
  assert.deepEqual(p.dentro, ['Bruna', 'Ju', 'léo']);
  assert.deepEqual(p.fora, []);
});

test('nome é texto: "<" fica, controle sai, corta em 24', () => {
  assert.equal(limparNome('<img src=x>Ju'), '<img src=x>Ju');
  assert.equal(limparNome('a<b'), 'a<b');
  assert.equal(limparNome('Ju\u0000\u200b'), 'Ju');
  assert.equal(limparNome('  Maria   Clara  '), 'Maria Clara');
  assert.equal(limparNome('x'.repeat(40)).length, 24);
  assert.equal(limparNome(42), null);
});

test('erros: plano que não existe, nome vazio, resposta estranha', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa });
  assert.throws(() => planos.ler('naoexiste'), (e) => e.status === 404);
  assert.throws(() => planos.ler('../../etc'), (e) => e.status === 404);
  assert.throws(() => planos.ler('__proto__'), (e) => e.status === 404);
  assert.throws(() => planos.responder(id, '   ', 'dentro'), (e) => e.status === 400);
  assert.throws(() => planos.responder(id, 'Ju', 'talvez'), (e) => e.status === 400);
});

test('limite de respostas por convite', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa });
  for (let i = 0; i < LIMITE_RESPOSTAS; i += 1) planos.responder(id, `p${i}`, 'dentro');
  assert.throws(() => planos.responder(id, 'mais um', 'dentro'), (e) => e.status === 409);
  assert.doesNotThrow(() => planos.responder(id, 'p0', 'fora', { confirmar: true }));
});

test('escrita atômica: sem temporário sobrando, arquivo íntegro, relido por outra instância', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa, autor: 'Bruna' });
  planos.responder(id, 'Ju', 'fora');
  const arquivos = fs.readdirSync(pasta);
  assert.deepEqual(arquivos, ['planos.json']);
  const outra = criarPlanos(pasta, { log: mudo });
  assert.deepEqual(outra.ler(id).fora, ['Ju']);
});

test('arquivo corrompido: começa vazio, com aviso, sem cair', () => {
  fs.writeFileSync(path.join(pasta, 'planos.json'), '{quebrado');
  const avisos = [];
  const planos = criarPlanos(pasta, { log: { warn: (m) => avisos.push(m) } });
  assert.equal(avisos.length, 1);
  assert.ok(planos.criar({ festa }).id);
});

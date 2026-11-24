'use strict';
// O expurgo do app (D15, revisão seguranca-4): avaliações, sal, imagens e
// cache da lista real saem do volume; --reserva leva dados/reais.json e
// dados/imagens/; --simular não apaga nada.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expurgar, main } = require('../ferramentas/expurgar');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-expurgar-'));
after(() => fs.rmSync(pasta, { recursive: true, force: true }));

function montar(nome) {
  const varDir = path.join(pasta, nome, 'var');
  const raiz = path.join(pasta, nome, 'app');
  fs.mkdirSync(path.join(varDir, 'imagens'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'dados', 'imagens'), { recursive: true });
  fs.writeFileSync(path.join(varDir, 'avaliacoes.json'), '{"avaliacoes":[]}');
  fs.writeFileSync(path.join(varDir, 'avaliacoes-sal'), 'x');
  fs.writeFileSync(path.join(varDir, 'avaliacoes.json.123.ab.tmp'), '{}');
  fs.writeFileSync(path.join(varDir, 'reais-cache.json'), '{}');
  fs.writeFileSync(path.join(varDir, 'imagens', '0123456789abcdef-480.webp'), 'w');
  fs.writeFileSync(path.join(varDir, 'planos.json'), '{}');
  fs.writeFileSync(path.join(raiz, 'dados', 'reais.json'), '{}');
  fs.writeFileSync(path.join(raiz, 'dados', 'imagens', 'a.webp'), 'w');
  fs.writeFileSync(path.join(raiz, 'dados', 'festas.json'), '[]');
  return { varDir, raiz };
}

test('simular lista e não apaga', () => {
  const { varDir, raiz } = montar('sim');
  const r = expurgar({ varDir, raiz, reserva: true, simular: true });
  assert.equal(r.apagados.length, 7);
  assert.ok(fs.existsSync(path.join(varDir, 'avaliacoes.json')));
  assert.ok(fs.existsSync(path.join(raiz, 'dados', 'reais.json')));
});

test('apaga avaliações, sal, imagens, cache e restos; os convites e a base fictícia ficam', () => {
  const { varDir, raiz } = montar('volume');
  expurgar({ varDir, raiz });
  for (const n of ['avaliacoes.json', 'avaliacoes-sal', 'avaliacoes.json.123.ab.tmp', 'reais-cache.json', 'imagens']) {
    assert.equal(fs.existsSync(path.join(varDir, n)), false, n);
  }
  assert.ok(fs.existsSync(path.join(varDir, 'planos.json')));
  // Sem --reserva, a reserva fica.
  assert.ok(fs.existsSync(path.join(raiz, 'dados', 'reais.json')));
  expurgar({ varDir, raiz, reserva: true });
  assert.equal(fs.existsSync(path.join(raiz, 'dados', 'reais.json')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'dados', 'imagens')), false);
  assert.ok(fs.existsSync(path.join(raiz, 'dados', 'festas.json')));
  // De novo: nada a apagar, sem erro.
  assert.deepEqual(expurgar({ varDir, raiz, reserva: true }).apagados, []);
});

test('a linha de comando: --var e --simular; opção estranha dá erro', () => {
  const { varDir } = montar('cli');
  const linhas = [];
  const r = main(['--var', varDir, '--simular'], { saida: (t) => linhas.push(t) });
  assert.equal(r.simulado, true);
  assert.match(linhas[0], /^apagaria:/);
  assert.ok(fs.existsSync(path.join(varDir, 'avaliacoes.json')));
  main(['--var', varDir], { saida: () => {} });
  assert.equal(fs.existsSync(path.join(varDir, 'avaliacoes.json')), false);
  assert.throws(() => main(['--tudo'], { saida: () => {} }), /opção desconhecida/);
});

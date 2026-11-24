'use strict';
// 24/11/2026: o app não mostra mais festa fictícia nem fala em "exemplo".
// Sem FINDE_EXEMPLOS, um dia sem festa responde vazio, com um aviso, e o
// formulário diz que não há exemplos (o rodapé muda a nota).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor } = require('../servidor');

const mudo = { info() {}, warn() {}, error() {} };
let pasta;
let servidor;
let raiz;

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-sem-exemplos-'));
  servidor = criarServidor({ varDir: pasta, log: mudo, reais: null, relogio: () => Date.parse('2026-11-24T12:00:00-03:00') });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  raiz = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('sem festa real, a lista vem vazia e diz isso; nenhuma fictícia entra', async () => {
  const f = await (await fetch(`${raiz}/api/formulario`)).json();
  assert.equal(f.exemplos, false);
  assert.equal(f.misto, false);
  const r = await fetch(`${raiz}/api/festas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criterios: { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 } }),
  });
  const corpo = await r.json();
  assert.deepEqual(corpo.opcoes, []);
  assert.deepEqual(corpo.exemplos, []);
  assert.match(corpo.aviso, /^Ainda não tenho festa para mostrar agora/);
  assert.doesNotMatch(JSON.stringify(corpo), /fictícia|"exemplo":true|Exemplo/);
});

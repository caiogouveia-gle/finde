'use strict';
// A idade saiu do fluxo do app em 25/11/2026, até a idade do público ser
// validada: o pedido vai com a faixa inteira, que o motor lê como "sem
// preferência" e que não aparece na frase do pedido nem pesa na cara.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../nucleo/motor');

const inteira = { min: M.IDADE_MIN, max: M.IDADE_MAX };
const pedido = (idade) => M.completar({ dia: 'sex', janela: 'comeco-da-noite', idade, teto: 'sem-limite' });

test('com a faixa inteira, a frase e o resumo do pedido não falam de idade', () => {
  const c = pedido(inteira);
  const partes = M.pedidoEmPartes(c);
  assert.ok(partes.every((p) => p && p.chave !== 'idade' && p.chave !== 'faixa'), JSON.stringify(partes));
  assert.ok(partes.some((p) => p.chave === 'bairros'), 'a cidade inteira continua na frase');
  assert.doesNotMatch(M.resumoDoPedido(c), /\d+ a \d+/);
});

test('uma faixa dita (pela conversa) ainda aparece no pedido', () => {
  const partes = M.pedidoEmPartes(pedido({ min: 30, max: 40 }));
  assert.ok(partes.some((p) => p.chave === 'idade' && /30 a 40/.test(p.texto)));
});

test('o app não pergunta a idade nem mostra a idade do público no detalhe ou na lista', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'publico', 'app.js'), 'utf8');
  const perguntas = app.slice(app.indexOf('const PERGUNTAS = ['), app.indexOf('];', app.indexOf('const PERGUNTAS = [')));
  assert.doesNotMatch(perguntas, /chave: 'idade'/);
  assert.doesNotMatch(app, /'Idade do público'|divulgou a média de idade|'Com média informada'/);
});

test('a prévia de link do app, da landing e do convite não fala de idade nem de fase', () => {
  for (const nome of ['index.html', 'landing.html', 'plano.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'publico', nome), 'utf8');
    const metas = (html.match(/<meta (?:name|property)="(?:description|og:[a-z:]+|twitter:[a-z]+)"[^>]*>/g) || []).join('\n');
    assert.ok(metas.includes('og:description'), nome);
    assert.doesNotMatch(metas, /\bidade|da sua fase/i, nome);
    // A imagem leva versão no endereço: o WhatsApp guarda a prévia pelo link da imagem.
    if (nome !== 'plano.html') assert.match(metas, /compartilhar\.png\?v=\d{8}"/, nome);
  }
});

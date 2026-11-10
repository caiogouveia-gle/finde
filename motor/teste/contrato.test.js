'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { montarRegistro, precoAPartirDe } = require('../nucleo/contrato');

const linha = (campo, fonte, valor, conferido_em) => ({ campo, fonte, valor: JSON.stringify(valor), conferido_em });

test('campo a campo vale a fonte de maior prioridade, e cada campo diz a fonte e a hora', () => {
  const r = montarRegistro({ id: 'f' }, [
    linha('nome', 'mapas-culturais', 'Nome do Mapa', '2026-11-10T12:00:00Z'),
    linha('nome', 'envio', 'Nome da Produtora', '2026-11-09T12:00:00Z'),
    linha('estilos', 'claude', ['funk'], '2026-11-10T12:00:00Z'),
  ], [{ fonte: 'envio', url: null, visto_em: '2026-11-09T12:00:00Z' }]);
  assert.equal(r.nome, 'Nome da Produtora');
  assert.deepEqual(r.campos.nome, { fonte: 'envio', conferidoEm: '2026-11-09T09:00:00-03:00' });
  assert.deepEqual(r.classificacao, { por: 'claude', conferidoEm: '2026-11-10T09:00:00-03:00' });
  assert.equal(r.coletadoEm, '2026-11-09T09:00:00-03:00');
});

test('no empate de prioridade vale a conferida por último', () => {
  const r = montarRegistro({ id: 'f' }, [
    linha('casa', 'envio', 'Antiga', '2026-11-08T00:00:00Z'),
    linha('casa', 'envio', 'Nova', '2026-11-09T00:00:00Z'),
  ], []);
  assert.equal(r.casa, 'Nova');
});

test('campo que ninguém trouxe sai vazio, nunca inventado (R12, AE2 e AE4 do detalhe)', () => {
  const r = montarRegistro({ id: 'f' }, [linha('nome', 'envio', 'X', 't')], []);
  assert.equal(r.mediaIdade, null);
  assert.equal(r.lineup, null);
  assert.equal(r.pistaCheia, null);
  assert.deepEqual(r.estilos, []);
  assert.equal(r.precoAPartirDe, null);
});

test('preço a partir de: o menor lote disponível, contando os esgotados (AE3 do detalhe)', () => {
  assert.deepEqual(precoAPartirDe([
    { nome: '1º lote', preco: 40, disponivel: false },
    { nome: '2º lote', preco: 60, disponivel: true },
    { nome: '3º lote', preco: 80, disponivel: null },
  ]), { valor: 60, lote: '2º lote', esgotadosAntes: 1 });
});

test('só porta: preço da porta (AE1 do detalhe); tudo esgotado sem porta: esgotado', () => {
  assert.deepEqual(precoAPartirDe(null, { preco: 40 }), { valor: 40, lote: 'na porta', esgotadosAntes: 0 });
  const r = montarRegistro({ id: 'f' }, [linha('lotes', 'envio', [{ nome: 'único', preco: 50, disponivel: false }], 't')], []);
  assert.equal(r.precoAPartirDe, null);
  assert.equal(r.esgotado, true);
});

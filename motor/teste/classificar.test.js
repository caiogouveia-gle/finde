'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarClassificador, porRegras, validarResposta, ESQUEMA } = require('../nucleo/classificar');
const { novoBanco, relogio, logMudo, claudeFalso } = require('./ajuda');

const BOA = {
  ehFesta: true, estilos: ['house-disco'], idadeMinima: 18, lineup: ['DJ A'], documento: null,
  vestimenta: 'traje livre', lista: null, pistaCheia: '19:30', confianca: 'alta',
};
const entrada = (n) => ({ festaId: `f${n}`, nome: `Festa ${n}`, texto: `Texto da festa ${n}, house a noite toda.` });

test('o modelo padrão é o Claude Haiku 5.5, e FINDE_MODELO troca', async () => {
  const { modeloAtual, MODELO_PADRAO } = require('../nucleo/classificar');
  assert.equal(MODELO_PADRAO, 'claude-haiku-5-5');
  assert.equal(modeloAtual({}), 'claude-haiku-5-5');
  assert.equal(modeloAtual({ FINDE_MODELO: 'claude-sonnet-5-5' }), 'claude-sonnet-5-5');
  const db = novoBanco();
  const c = claudeFalso([BOA]);
  await criarClassificador({ db, claude: c, agora: relogio(), log: logMudo }).classificar(entrada(1));
  assert.equal(c.pedidos[0].model, process.env.FINDE_MODELO || 'claude-haiku-5-5');
});

test('o esquema não tem média de idade (R16) e só aceita estilos do catálogo', () => {
  assert.ok(!('mediaIdade' in ESQUEMA.properties));
  assert.equal(validarResposta({ ...BOA, estilos: ['axe'] }), undefined);
  assert.equal(validarResposta({ ...BOA, mediaIdade: 30 }).mediaIdade, undefined);
});

test('pelo Claude: pede saída estruturada, grava uso e custo', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-haiku-5-5', agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.por, 'claude');
  assert.deepEqual(r.resultado.estilos, ['house-disco']);
  const p = c.pedidos[0];
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.match(p.messages[0].content, /<evento>[\s\S]*<\/evento>/);
  const uso = db.prepare('SELECT * FROM uso_llm').all();
  assert.equal(uso.length, 1);
  assert.equal(uso[0].resultado, 'ok');
  assert.ok(Math.abs(uso[0].custo_usd - (900 * 0.1 + 300 * 0.5) / 1e6) < 1e-12);
});

test('mesma entrada não volta ao modelo (cache por hash)', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude: c, agora: relogio(), log: logMudo });
  await cl.classificar(entrada(1));
  const r = await cl.classificar(entrada(1));
  assert.equal(c.pedidos.length, 1);
  assert.equal(r.cache, true);
});

test('resposta fora do esquema cai para regras e conta como inválida', async () => {
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: claudeFalso(['{"ehFesta":"sim"}']), agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.por, 'regras');
  assert.equal(cl.resumo().invalidas, 1);
  assert.equal(db.prepare('SELECT resultado FROM uso_llm').get().resultado, 'invalido');
});

test('erro da API cai para regras nesta festa e segue', async () => {
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: claudeFalso([Object.assign(new Error('boom'), { status: 529 }), BOA]), agora: relogio(), log: logMudo });
  assert.equal((await cl.classificar(entrada(1))).por, 'regras');
  assert.equal((await cl.classificar(entrada(2))).por, 'claude');
  assert.equal(cl.resumo().erros, 1);
});

test('AE4: teto da execução para o modelo; o resto vai por regras', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA], { entrada: 2000, saida: 600 });
  // Modelo caro de propósito, para o teto bater com poucas chamadas. Opus 5.5: estimativa ~ US$ 0,024 por chamada; o custo real de 2000/600 tokens é US$ 0,02.
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-opus-5-5', tetoExecucao: 0.03, tetoDia: 10, agora: relogio(), log: logMudo });
  const r1 = await cl.classificar(entrada(1));
  const r2 = await cl.classificar(entrada(2));
  const r3 = await cl.classificar(entrada(3));
  assert.deepEqual([r1.por, r2.por, r3.por], ['claude', 'regras', 'regras']);
  assert.equal(c.pedidos.length, 1);
  assert.match(cl.resumo().parado, /teto da execução/);
});

test('teto do dia conta o que outras execuções já gastaram hoje', async () => {
  const db = novoBanco();
  db.prepare("INSERT INTO uso_llm (quando, modelo, tokens_entrada, tokens_saida, custo_usd, resultado) VALUES ('2026-11-10T13:00:00.000Z', 'x', 0, 0, 1.99, 'ok')").run();
  const c = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-opus-5-5', tetoExecucao: 1, tetoDia: 2, agora: relogio(), log: logMudo });
  assert.equal((await cl.classificar(entrada(1))).por, 'regras');
  assert.match(cl.resumo().parado, /teto do dia/);
  assert.equal(c.pedidos.length, 0);
});

test('AE5: sem chave, tudo por regras', async () => {
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: null, agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.por, 'regras');
  assert.equal(cl.resumo().parado, 'sem ANTHROPIC_API_KEY');
});

test('regras: festa, estilo e idade mínima por palavras', () => {
  const r = porRegras({ nome: 'Baile do Fim', texto: 'Funk e pop dos anos 2000 a noite toda. Proibida a entrada de menores de 18 anos.' });
  assert.equal(r.ehFesta, true);
  assert.deepEqual(r.estilos.sort(), ['funk', 'pop-2000']);
  assert.equal(r.idadeMinima, 18);
  const expo = porRegras({ nome: 'Exposição Florescer', texto: 'Mostra de artes visuais.' });
  assert.equal(expo.ehFesta, false);
});

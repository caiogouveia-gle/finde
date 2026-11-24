'use strict';
// Avaliações pós-festa (U19, M38, D3, KTD13, AE5): o mínimo de 5 respostas com
// idade de pelo menos 2 convites vira `mediaIdade` com `origem: 'avaliacoes'`.
// Nada de nome: só chave, aparelho e resposta, todos inventados aqui.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listarRegistros } = require('../nucleo/contrato');
const { gravarValores } = require('../nucleo/agregar');
const avaliacoes = require('../fontes/avaliacoes');
const { executar } = require('../nucleo/coleta');
const { novoBanco, relogio, logMudo } = require('./ajuda');
const { fonteFixa, semear, festaDe } = require('./ajuda-operacao');

const linha = (n, plano, resposta, idade) => ({ chave: `chave-${String(n).padStart(4, '0')}`, plano, resposta, idade });

// As cinco respostas do AE5: duas das 5 vêm de um convite, três do outro; quatro "da minha idade".
const CINCO = [
  linha(1, 'convite-a', 'na-medida', 29),
  linha(2, 'convite-a', 'na-medida', 30),
  linha(3, 'convite-b', 'na-medida', 32),
  linha(4, 'convite-b', 'mais-velho', 33),
  linha(5, 'convite-b', 'na-medida', 34),
];

function inserir(db, festaId, linhas, quando = '2026-11-20T12:00:00.000Z') {
  const ins = db.prepare('INSERT INTO avaliacoes (chave, festa_id, aparelho, plano, resposta, idade, recebida_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const l of linhas) ins.run(l.chave, festaId, `aparelho-${l.chave}`, l.plano, l.resposta, l.idade, quando);
}

async function umaFesta(db, agora) {
  await semear(db, [{ fonte: 'envio', idExterno: 'f1', bruto: { nome: 'Festa Exemplo', data: '2026-11-14', inicio: '22:00', casa: 'Casa Exemplo', endereco: 'Rua A, 1 - São Paulo/SP' } }], agora);
  return festaDe(db, 'envio', 'f1');
}

test('AE5: cinco respostas de dois convites geram mediaIdade com naMedida, faixa e convites', () => {
  assert.deepEqual(avaliacoes.calcular(CINCO), {
    valor: 31.6, origem: 'avaliacoes', avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2,
  });
});

test('quatro respostas não geram; cinco de um convite só não geram', () => {
  assert.equal(avaliacoes.calcular(CINCO.slice(0, 4)), null);
  assert.equal(avaliacoes.calcular(CINCO.map((l) => ({ ...l, plano: 'so-um' }))), null);
});

test('resposta sem idade, ou com idade fora de 18 a 60, não conta', () => {
  const seis = [...CINCO, linha(6, 'convite-a', 'na-medida', null)];
  assert.equal(avaliacoes.calcular(seis).avaliacoes, 5, 'a sexta, sem idade, fica de fora');
  assert.equal(avaliacoes.calcular([...CINCO.slice(0, 4), linha(9, 'convite-a', 'na-medida', 17)]), null, '17 anos não conta');
  assert.equal(avaliacoes.calcular([...CINCO.slice(0, 4), linha(9, 'convite-a', 'na-medida', 61)]), null, '61 anos não conta');
  assert.equal(avaliacoes.calcular([...CINCO.slice(0, 4), linha(9, 'convite-a', 'na-medida', 60)]).avaliacoes, 5, '60 conta');
  assert.equal(avaliacoes.calcular([...CINCO.slice(0, 4), { ...linha(9, 'convite-a', 'talvez', 30) }]), null, 'resposta fora das três não conta');
});

test('a mesma chave duas vezes conta uma', () => {
  const dobrado = [...CINCO.slice(0, 4), CINCO[0], CINCO[1]];
  assert.equal(avaliacoes.calcular(dobrado), null, 'quatro chaves diferentes, mesmo com seis linhas');
  assert.equal(avaliacoes.calcular([...CINCO, CINCO[2]]).avaliacoes, 5);
  // E no banco a chave é única.
  const db = novoBanco();
  inserir(db, 'x', [CINCO[0]]);
  assert.throws(() => inserir(db, 'x', [CINCO[0]]), /UNIQUE|constraint/i);
});

test('o mínimo e o mínimo de convites vêm da configuração', () => {
  assert.equal(avaliacoes.calcular(CINCO, { minimo: 6 }), null);
  assert.equal(avaliacoes.calcular(CINCO, { minimoConvites: 3 }), null);
  assert.equal(avaliacoes.calcular(CINCO.slice(0, 3), { minimo: 3, minimoConvites: 2 }).avaliacoes, 3);
});

test('aplicar grava mediaIdade com a fonte avaliacoes, e o registro a mostra', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await umaFesta(db, agora);
  assert.equal(listarRegistros(db)[0].mediaIdade, null);
  inserir(db, id, CINCO);
  const r = await avaliacoes.aplicar({ db, agora, config: { minimo: 5, minimoConvites: 2 }, log: logMudo });
  assert.equal(r.gravados, 1);
  const [f] = listarRegistros(db);
  assert.deepEqual(f.mediaIdade, { valor: 31.6, origem: 'avaliacoes', avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 });
  assert.equal(f.campos.mediaIdade.fonte, 'avaliacoes');
});

test('a média declarada pela produtora vale mais que a das avaliações', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await umaFesta(db, agora);
  gravarValores(db, id, 'envio', { mediaIdade: { valor: 27, origem: 'produtora' } }, agora().toISOString());
  inserir(db, id, CINCO);
  await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  assert.deepEqual(listarRegistros(db)[0].mediaIdade, { valor: 27, origem: 'produtora' });
});

test('avaliação de uma festa depois unida vale na festa nova; de festa que não existe vira aviso', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await umaFesta(db, agora);
  db.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?)').run('festa-antiga-20261114-aaaa', id, agora().toISOString());
  inserir(db, 'festa-antiga-20261114-aaaa', CINCO);
  inserir(db, 'festa-que-sumiu-20261114-bbbb', CINCO.map((l, i) => ({ ...l, chave: `outra-${i}` })));
  const r = await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  assert.equal(r.gravados, 1);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /festa-que-sumiu/);
  assert.equal(listarRegistros(db)[0].mediaIdade.avaliacoes, 5);
});

test('a festa que deixa de bater o mínimo perde o valor (as respostas foram apagadas)', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await umaFesta(db, agora);
  inserir(db, id, CINCO);
  await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  assert.ok(listarRegistros(db)[0].mediaIdade);
  db.exec('DELETE FROM avaliacoes');
  const r = await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  assert.equal(r.gravados, 0);
  assert.equal(listarRegistros(db)[0].mediaIdade, null);
});

test('rodar de novo não muda mudou_em; uma resposta nova muda o valor e anda mudou_em', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await umaFesta(db, agora);
  inserir(db, id, CINCO);
  await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  const antes = db.prepare("SELECT mudou_em FROM valores WHERE festa_id = ? AND fonte = 'avaliacoes'").get(id).mudou_em;
  agora.andar(3600e3);
  await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  assert.equal(db.prepare("SELECT mudou_em FROM valores WHERE festa_id = ? AND fonte = 'avaliacoes'").get(id).mudou_em, antes);
  inserir(db, id, [linha(6, 'convite-a', 'mais-novo', 40)]);
  agora.andar(3600e3);
  await avaliacoes.aplicar({ db, agora, config: {}, log: logMudo });
  assert.equal(listarRegistros(db)[0].mediaIdade.avaliacoes, 6);
  assert.notEqual(db.prepare("SELECT mudou_em FROM valores WHERE festa_id = ? AND fonte = 'avaliacoes'").get(id).mudou_em, antes);
});

test('a fonte de festa roda no tempo 4 de uma execução e respeita ligada:false', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await umaFesta(db, agora);
  inserir(db, id, CINCO);
  const config = { curadoria: { arquivo: '/nao/existe.json' } };
  const r = await executar({ db, fontes: [fonteFixa('envio', [])], claude: null, apify: null, classificar: false, agora, log: logMudo, config });
  assert.equal(r.fontesDeFesta.avaliacoes.gravados, 1);
  assert.equal(listarRegistros(db)[0].mediaIdade.origem, 'avaliacoes');
  // Desligada na configuração: a média some na próxima execução? Não: só deixa de ser recalculada.
  const db2 = novoBanco();
  const id2 = await umaFesta(db2, agora);
  inserir(db2, id2, CINCO);
  const r2 = await executar({ db: db2, fontes: [fonteFixa('envio', [])], claude: null, apify: null, classificar: false, agora, log: logMudo, config: { ...config, avaliacoes: { ligada: false } } });
  assert.equal(r2.fontesDeFesta.avaliacoes, undefined);
  assert.equal(listarRegistros(db2)[0].mediaIdade, null);
});

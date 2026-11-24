'use strict';
// Relatório do trabalho acadêmico (U19, M35): festas por fonte, só Instagram,
// multi-fonte, candidatos, custo por festa que chega ao app, antecedência e o
// funil de corte. Banco de teste com festas e custos inventados.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { relatorio, formatar, mediana, motivoBase } = require('../nucleo/relatorio');
const { abrirBanco } = require('../nucleo/banco');
const { main } = require('../cli');
const { novoBanco, relogio, logQueGuarda } = require('./ajuda');
const { semear, festaDe } = require('./ajuda-operacao');

const LINK = 'https://www.sympla.com.br/evento/festa-dupla/9';
const ENDERECO = 'Rua A, 1 - São Paulo/SP';

// Quatro festas:
//   f1 só Instagram (post de 03/11 para 14/11: 11 dias)
//   f2 Instagram + páginas (mesmo link; post de 07/11 para 14/11: 7 dias)
//   f3 só páginas
//   f4 só Instagram, mais tarde (21/11; post de 18/11: 3 dias)
async function banco() {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [
    { fonte: 'instagram', idExterno: 'ig1', bruto: { nome: 'Baile Um', data: '2026-11-14', inicio: '22:00', casa: 'Casa Um', endereco: ENDERECO, publicadoEm: '2026-11-03T15:00:00.000Z' } },
    { fonte: 'instagram', idExterno: 'ig2', bruto: { nome: 'Festa Dupla', data: '2026-11-14', inicio: '23:00', casa: 'Casa Dois', endereco: ENDERECO, linkEvento: LINK, publicadoEm: '2026-11-07T15:00:00.000Z' } },
    { fonte: 'paginas', idExterno: 'pg2', bruto: { nome: 'Festa Dupla', data: '2026-11-14', inicio: '23:00', casa: 'Casa Dois', endereco: ENDERECO, linkEvento: LINK } },
    { fonte: 'paginas', idExterno: 'pg3', bruto: { nome: 'Samba Três', data: '2026-11-15', inicio: '16:00', casa: 'Casa Três', endereco: ENDERECO } },
    { fonte: 'instagram', idExterno: 'ig4', bruto: { nome: 'Noite Quatro', data: '2026-11-21', inicio: '22:00', casa: 'Casa Quatro', endereco: ENDERECO, publicadoEm: '2026-11-18T15:00:00.000Z' } },
  ], agora);
  const uso = db.prepare('INSERT INTO uso_llm (execucao_id, quando, modelo, festa_id, tokens_entrada, tokens_saida, custo_usd, resultado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  uso.run(1, '2026-11-12T10:00:00.000Z', 'haiku', null, 900, 300, 0.04, 'ok');
  uso.run(1, '2026-11-12T10:01:00.000Z', 'haiku', null, 900, 300, 0.02, 'ok');
  uso.run(2, '2026-11-20T10:00:00.000Z', 'haiku', null, 900, 300, 0.01, 'ok');
  const apify = db.prepare('INSERT INTO uso_apify (execucao_id, quando, ator, itens, custo_usd, resultado) VALUES (?, ?, ?, ?, ?, ?)');
  apify.run(1, '2026-11-12T10:00:00.000Z', 'apify~instagram-scraper', 30, 0.08, 'ok');
  apify.run(2, '2026-11-20T10:00:00.000Z', 'apify~instagram-scraper', 10, 0.03, 'ok');
  db.prepare('INSERT INTO candidatos (fonte, id_externo, festa_id, escore, motivo, visto_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run('paginas', 'pg3', festaDe(db, 'instagram', 'ig1'), 3.5, '[]', '2026-11-12T10:00:00.000Z');
  return db;
}

test('festas por fonte, só o Instagram, mais de uma fonte e candidatos', async () => {
  const db = await banco();
  const r = relatorio(db);
  assert.equal(r.festas, 4);
  assert.deepEqual(r.porFonte, { instagram: 3, paginas: 2 });
  assert.equal(festaDe(db, 'instagram', 'ig2'), festaDe(db, 'paginas', 'pg2'), 'o mesmo link junta as duas');
  assert.equal(r.soInstagram, 2);
  assert.equal(r.multiFonte, 1);
  assert.equal(r.candidatos, 1);
});

test('custo por festa que chega ao app: o total do Claude e do Apify dividido pelas festas aceitas', async () => {
  const db = await banco();
  const sem = relatorio(db);
  assert.equal(sem.custo.claudeUsd, 0.07);
  assert.equal(sem.custo.apifyUsd, 0.11);
  assert.equal(sem.custo.totalUsd, 0.18);
  assert.equal(sem.custo.festasQueChegam, 4, 'sem o conversor, as festas do export');
  assert.equal(sem.custo.porFestaUsd, 0.045);
  // Com o conversor do app: duas festas entram, duas ficam de fora.
  const conversor = (bruto) => ({
    festas: bruto.festas.slice(0, 2).map((f) => ({ id: f.id })),
    fora: bruto.festas.slice(2).map((f, i) => ({ id: f.id, motivo: i ? 'fora de São Paulo (Cotia)' : 'sem início' })),
    avisos: [],
  });
  const com = relatorio(db, { conversor });
  assert.equal(com.funil.exportadas, 4);
  assert.equal(com.funil.aceitas, 2);
  assert.deepEqual(com.funil.fora, { 'fora de São Paulo': 1, 'sem início': 1 });
  assert.equal(com.custo.festasQueChegam, 2);
  assert.equal(com.custo.porFestaUsd, 0.09);
  assert.match(com.custo.base, /aceitas pelo app/);
});

test('o conversor pode vir como módulo com converterExport', async () => {
  const db = await banco();
  const modulo = { converterExport: (b) => ({ festas: b.festas, fora: [], avisos: ['aviso do conversor'] }) };
  const r = relatorio(db, { conversor: modulo });
  assert.equal(r.funil.aceitas, 4);
  assert.deepEqual(r.funil.avisos, ['aviso do conversor']);
});

test('antecedência: a mediana de dias entre o post e a festa, nos posts do Instagram', async () => {
  const db = await banco();
  const a = relatorio(db).antecedencia;
  assert.equal(a.amostra, 3);
  assert.equal(a.medianaDias, 7);
  assert.equal(a.minimo, 3);
  assert.equal(a.maximo, 11);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
});

test('--desde limita as festas e o gasto', async () => {
  const db = await banco();
  const r = relatorio(db, { desde: '2026-11-20' });
  assert.equal(r.festas, 1);
  assert.deepEqual(r.porFonte, { instagram: 1 });
  assert.equal(r.soInstagram, 1);
  assert.equal(r.candidatos, 0);
  assert.equal(r.custo.totalUsd, 0.04);
  assert.equal(r.antecedencia.medianaDias, 3);
});

test('sem posts com data de publicação, sem festas: não quebra e diz isso', () => {
  const db = novoBanco();
  const r = relatorio(db);
  assert.equal(r.festas, 0);
  assert.equal(r.antecedencia, null);
  assert.equal(r.custo.porFestaUsd, null);
  assert.match(formatar(r), /Antecedência: sem posts/);
});

test('formatar põe os números no texto', async () => {
  const db = await banco();
  const t = formatar(relatorio(db));
  assert.match(t, /4 festas no banco/);
  assert.match(t, /instagram\s+3/);
  assert.match(t, /Só o Instagram mostrou: 2/);
  assert.match(t, /Com mais de uma fonte: 1/);
  assert.match(t, /Candidatos a fusão: 1/);
  assert.match(t, /mediana de 7 dias/);
  assert.match(t, /Funil: 4 festas no export/);
});

test('motivoBase tira o detalhe entre parênteses', () => {
  assert.equal(motivoBase('fora de São Paulo (Cotia)'), 'fora de São Paulo');
  assert.equal(motivoBase('sem início'), 'sem início');
  assert.equal(motivoBase(null), 'sem motivo');
});

test('CLI: relatorio --json e --app com um conversor em arquivo; --desde ruim dá 1', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-relatorio-'));
  try {
    const arquivo = path.join(dir, 'finde.sqlite3');
    const db = abrirBanco(arquivo);
    const agora = relogio();
    await semear(db, [{ fonte: 'instagram', idExterno: 'ig1', bruto: { nome: 'Baile Um', data: '2026-11-14', inicio: '22:00', casa: 'Casa Um', endereco: ENDERECO, publicadoEm: '2026-11-04T15:00:00.000Z' } }], agora);
    db.close();
    const conversor = path.join(dir, 'reais.js');
    fs.writeFileSync(conversor, "exports.converterExport = (b) => ({ festas: [], fora: b.festas.map((f) => ({ id: f.id, motivo: 'sem início' })), avisos: [] });\n");
    const env = { FINDE_BANCO: arquivo };
    const l = logQueGuarda();
    assert.equal(await main(['relatorio', '--json', '--app', conversor], { env, log: l }), 0);
    const j = JSON.parse(l.linhas.join('\n').replace(/^info: /, ''));
    assert.equal(j.festas, 1);
    assert.deepEqual(j.funil.fora, { 'sem início': 1 });
    assert.equal(j.antecedencia.medianaDias, 10);
    l.linhas.length = 0;
    assert.equal(await main(['relatorio'], { env, log: l }), 0);
    assert.match(l.linhas.join('\n'), /1 festas no banco/);
    assert.equal(await main(['relatorio', '--desde', 'ontem'], { env, log: l }), 1);
    assert.equal(await main(['relatorio', '--app', path.join(dir, 'nao-existe.js')], { env, log: l }), 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

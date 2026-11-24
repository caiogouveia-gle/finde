'use strict';
// Comandos do motor pelo main([...]) (U18): o export com só São Paulo por
// padrão, o reprocessar que nunca toca o FINDE_BANCO nem escreve na origem, as
// proteções das rodadas pagas e os subcomandos de imagem. Nenhum comando daqui
// chama a rede nem uma API paga.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../cli');
const { abrirBanco } = require('../nucleo/banco');
const { executar } = require('../nucleo/coleta');
const curadoria = require('../nucleo/curadoria');
const { relogio, logQueGuarda } = require('./ajuda');
const { hojeSP, somarDias } = require('../nucleo/exportar');
const { semear, festaDe, fonteFixa } = require('./ajuda-operacao');

async function comBanco(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-cli-teste-'));
  const banco = path.join(dir, 'finde.sqlite3');
  const db = abrirBanco(banco);
  try {
    return await fn({ dir, banco, db, env: { FINDE_BANCO: banco, FINDE_IMAGENS: path.join(dir, 'imagens') }, l: logQueGuarda() });
  } finally {
    try { db.close(); } catch { /* já fechado */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const sha = (arq) => crypto.createHash('sha256').update(fs.readFileSync(arq)).digest('hex');
const saida = (l) => l.linhas.splice(0).join('\n');
const ITEM = (nome, data, extra = {}) => ({ nome, data, inicio: '22:00', casa: `Casa ${nome}`, endereco: 'Rua A, 1 - São Paulo/SP', ...extra });

test('exportar: só São Paulo e sem ocultas por padrão; --todas traz tudo; o envelope tem execucaoId e geradoEm', async () => {
  await comBanco(async ({ dir, db, env, l }) => {
    const agora = relogio();
    // O export corta por hoje (o dia de verdade): as festas ficam 20 dias à frente.
    const dia = somarDias(hojeSP(), 20);
    await semear(db, [
      { fonte: 'envio', idExterno: 'sp', bruto: ITEM('Festa SP', dia) },
      { fonte: 'envio', idExterno: 'cotia', bruto: ITEM('Festa Cotia', dia, { endereco: 'Rua B, 2 - Cotia/SP' }) },
      { fonte: 'envio', idExterno: 'oculta', bruto: ITEM('Festa Oculta', dia) },
    ], agora);
    curadoria.ocultar(db, { festaId: festaDe(db, 'envio', 'oculta'), motivo: 'teste', agora });
    await executar({ db, fontes: [fonteFixa('envio', [])], claude: null, apify: null, classificar: false, agora, log: l, config: { curadoria: { arquivo: '/nao/existe' } } });
    db.close();
    const padrao = path.join(dir, 'padrao.json');
    assert.equal(await main(['exportar', padrao], { env, log: l }), 0);
    const j = JSON.parse(fs.readFileSync(padrao, 'utf8'));
    assert.equal(j.contrato, 'finde-r14/3');
    assert.ok(j.execucaoId > 0);
    assert.match(j.geradoEm, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(j.total, j.festas.length);
    assert.deepEqual(j.festas.map((f) => f.nome), ['Festa SP']);
    const todas = path.join(dir, 'todas.json');
    assert.equal(await main(['exportar', todas, '--todas'], { env, log: l }), 0);
    assert.match(saida(l), /festas em/);
    assert.deepEqual(JSON.parse(fs.readFileSync(todas, 'utf8')).festas.map((f) => f.nome).sort(), ['Festa Cotia', 'Festa Oculta', 'Festa SP']);
  });
});

test('reprocessar: argumentos errados dão 1; nunca cria nem migra o FINDE_BANCO; a origem fica byte a byte igual', async () => {
  await comBanco(async ({ dir, banco, db, env, l }) => {
    const agora = relogio();
    await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: ITEM('Festa A', '2026-11-14') }], agora);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    const origem = path.join(dir, 'origem.sqlite3');
    fs.copyFileSync(banco, origem);
    const antes = sha(origem);
    const outroEnv = { FINDE_BANCO: path.join(dir, 'nao-pode-existir.sqlite3') };
    const destino = path.join(dir, 'destino.sqlite3');
    assert.equal(await main(['reprocessar'], { env: outroEnv, log: l }), 1);
    assert.equal(await main(['reprocessar', '--origem', origem], { env: outroEnv, log: l }), 1, 'sem destino e sem --simular');
    assert.equal(await main(['reprocessar', '--origem', path.join(dir, 'nao-existe.sqlite3'), '--destino', destino], { env: outroEnv, log: l }), 1);
    assert.match(saida(l), /origem não existe/);
    assert.equal(await main(['reprocessar', '--origem', origem, '--destino', origem], { env: outroEnv, log: l }), 1);
    assert.match(saida(l), /mesmo arquivo/);
    fs.writeFileSync(destino, 'ja-existe');
    assert.equal(await main(['reprocessar', '--origem', origem, '--destino', destino], { env: outroEnv, log: l }), 1);
    assert.match(saida(l), /destino já existe/);
    assert.equal(fs.readFileSync(destino, 'utf8'), 'ja-existe', 'nunca sobrescreve');
    fs.rmSync(destino);
    // A simulação roda sem destino, sem rede e sem escrever em lugar nenhum.
    assert.equal(await main(['reprocessar', '--origem', origem, '--simular'], { env: outroEnv, log: l }), 0);
    assert.equal(fs.existsSync(outroEnv.FINDE_BANCO), false, 'o FINDE_BANCO não foi aberto nem criado');
    assert.equal(fs.existsSync(destino), false);
    assert.equal(sha(origem), antes, 'a origem não mudou');
  });
});

test('as rodadas pagas só rodam com --poc, com dias de 1 a 30 e para a fonte instagram', async () => {
  await comBanco(async ({ env, l }) => {
    for (const args of [
      ['coletar', '--recuperar-instagram'],
      ['coletar', '--dias', '5'],
      ['coletar', '--fonte', 'instagram', '--dias', '5'],
    ]) {
      assert.equal(await main(args, { env, log: l }), 1, args.join(' '));
      assert.match(saida(l), /só rodam com --poc/);
    }
    for (const d of ['0', '31', '99', 'x', '-1', '5.5']) {
      assert.equal(await main(['coletar', '--poc', '--dias', d], { env, log: l }), 1, d);
      assert.match(saida(l), /número de 1 a 30/);
    }
    assert.equal(await main(['coletar', '--poc', '--recuperar-instagram', '--fonte', 'paginas'], { env, log: l }), 1);
    assert.match(saida(l), /só vale para a fonte instagram/);
    // Sem --poc, a fonte da prova nem liga pedida por nome.
    assert.equal(await main(['coletar', '--fonte', 'instagram'], { env, log: l }), 1);
    assert.match(saida(l), /desligada/);
  });
});

test('revincular --simular, vinculos --revisar e revisar rodam num banco sem nada', async () => {
  await comBanco(async ({ db, env, l }) => {
    db.close();
    assert.equal(await main(['revincular', '--simular'], { env, log: l }), 0);
    assert.match(saida(l), /simulação|revinculado/);
    assert.equal(await main(['vinculos', '--revisar'], { env, log: l }), 0);
    assert.match(saida(l), /0 candidato/);
    assert.equal(await main(['vinculos'], { env, log: l }), 1);
    assert.equal(await main(['revisar'], { env, log: l }), 0);
    assert.match(saida(l), /0 item/);
    assert.equal(await main(['relatorio'], { env, log: l }), 0);
    assert.equal(await main(['uso'], { env, log: l }), 0);
  });
});

test('imagem: listar uma festa e ocultar um sha que não existe', async () => {
  await comBanco(async ({ db, env, l }) => {
    const agora = relogio();
    await semear(db, [{ fonte: 'envio', idExterno: 'a', bruto: ITEM('Festa A', '2026-11-14') }], agora);
    const id = festaDe(db, 'envio', 'a');
    db.close();
    assert.equal(await main(['imagem', 'listar', id], { env, log: l }), 0);
    assert.match(saida(l), /0 imagem\(ns\) em /);
    assert.equal(await main(['imagem', 'ocultar', 'f'.repeat(16), '--motivo', 'teste'], { env, log: l }), 1);
    assert.match(saida(l), /nenhuma imagem/);
    assert.equal(await main(['imagem'], { env, log: l }), 1);
    assert.equal(await main(['imagem', 'ocultar'], { env, log: l }), 1);
  });
});

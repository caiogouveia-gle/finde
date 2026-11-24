'use strict';
// Expurgo (U19, D15): legendas, local marcado, imagens e arquivos, avaliações
// e, com --tudo, os brutos do Instagram. `--simular` não apaga nada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expurgar } = require('../nucleo/expurgar');
const { listarRegistros } = require('../nucleo/contrato');
const { abrirBanco } = require('../nucleo/banco');
const { main } = require('../cli');
const { novoBanco, relogio, logQueGuarda } = require('./ajuda');
const { semear, festaDe } = require('./ajuda-operacao');

const SHA_A = 'a'.repeat(16);
const SHA_B = 'b'.repeat(16);

// Um banco com um post do Instagram (legenda, local e texto de contexto), um
// item de páginas, duas imagens (com os arquivos num diretório) e avaliações.
async function cenario() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-expurgo-'));
  const imagens = path.join(dir, 'imagens');
  fs.mkdirSync(path.join(imagens, 'tmp'), { recursive: true });
  for (const n of [`${SHA_A}-1080.webp`, `${SHA_A}-480.webp`, `${SHA_B}-1080.webp`, `${SHA_B}-480.webp`]) fs.writeFileSync(path.join(imagens, n), 'webp-de-teste');
  fs.writeFileSync(path.join(imagens, 'tmp', 'c'.repeat(64)), 'temporario');
  fs.writeFileSync(path.join(imagens, 'LEIA-ME.txt'), 'não é do motor: fica');
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [
    {
      fonte: 'instagram', idExterno: 'ig1', texto: 'Legenda com @pessoas e o local marcado.',
      bruto: { nome: 'Baile Um', data: '2026-11-14', inicio: '22:00', casa: 'Casa Um', endereco: 'Rua A, 1 - São Paulo/SP', legenda: 'Legenda com @pessoas', local: 'Casa Um, São Paulo', codigo: 'Cxyz', publicadoEm: '2026-11-04T10:00:00.000Z' },
    },
    { fonte: 'paginas', idExterno: 'pg1', texto: 'Texto da página pública.', bruto: { nome: 'Samba Dois', data: '2026-11-15', inicio: '16:00', casa: 'Casa Dois', endereco: 'Rua B, 2 - São Paulo/SP' } },
  ], agora);
  const ins = db.prepare('INSERT INTO imagens (sha, arquivo, miniatura, criada_em) VALUES (?, ?, ?, ?)');
  ins.run(SHA_A, `imagens/${SHA_A}-1080.webp`, `imagens/${SHA_A}-480.webp`, '2026-11-12T10:00:00.000Z');
  ins.run(SHA_B, `imagens/${SHA_B}-1080.webp`, `imagens/${SHA_B}-480.webp`, '2026-11-12T10:00:00.000Z');
  const ligar = db.prepare('INSERT INTO imagens_item (fonte, id_externo, sha, papel, conferido_em) VALUES (?, ?, ?, ?, ?)');
  ligar.run('instagram', 'ig1', SHA_A, 'post', '2026-11-12T10:00:00.000Z');
  ligar.run('paginas', 'pg1', SHA_B, 'pagina-ingresso', '2026-11-12T10:00:00.000Z');
  const av = db.prepare('INSERT INTO avaliacoes (chave, festa_id, aparelho, plano, resposta, idade, recebida_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const f = festaDe(db, 'instagram', 'ig1');
  for (let i = 0; i < 5; i += 1) av.run(`chave-${i}0000`, f, `ap-${i}0000`, i < 2 ? 'conv-a' : 'conv-b', 'na-medida', 30 + i, '2026-11-20T10:00:00.000Z');
  db.prepare("INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, 'mediaIdade', 'avaliacoes', ?, ?, ?)")
    .run(f, JSON.stringify({ valor: 32, origem: 'avaliacoes' }), '2026-11-20T10:00:00.000Z', '2026-11-20T10:00:00.000Z');
  return { dir, imagens, db, limpa: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const conta = (db, t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const arquivos = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).sort();

test('--simular conta o que sairia e não apaga nada', async () => {
  const { db, imagens, limpa } = await cenario();
  try {
    const antes = arquivos(imagens);
    const bruto = db.prepare("SELECT bruto, contexto FROM itens_brutos WHERE fonte = 'instagram'").get();
    const r = expurgar(db, { dirImagens: imagens, simular: true, tudo: true });
    assert.equal(r.simulado, true);
    assert.equal(r.feito, false);
    assert.deepEqual(r.apagados, { legendas: 1, imagens: 2, arquivos: 5, avaliacoes: 5, brutos: 1 });
    assert.deepEqual(arquivos(imagens), antes);
    assert.deepEqual(db.prepare("SELECT bruto, contexto FROM itens_brutos WHERE fonte = 'instagram'").get(), bruto);
    assert.equal(conta(db, 'imagens'), 2);
    assert.equal(conta(db, 'imagens_item'), 2);
    assert.equal(conta(db, 'avaliacoes'), 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM valores WHERE fonte = 'avaliacoes'").get().n, 1);
  } finally {
    limpa();
  }
});

test('expurgar apaga legendas, local, imagens e arquivos, avaliações e a média delas; guarda o resto', async () => {
  const { db, imagens, limpa } = await cenario();
  try {
    const r = expurgar(db, { dirImagens: imagens });
    assert.equal(r.feito, true);
    assert.deepEqual(r.apagados, { legendas: 1, imagens: 2, arquivos: 5, avaliacoes: 5, brutos: 0 });
    const ig = db.prepare("SELECT bruto, contexto FROM itens_brutos WHERE fonte = 'instagram'").get();
    const b = JSON.parse(ig.bruto);
    assert.equal('legenda' in b, false);
    assert.equal('local' in b, false);
    assert.equal(ig.contexto, null);
    assert.equal(b.nome, 'Baile Um', 'o resto do post fica: é dado público do evento');
    assert.equal(b.codigo, 'Cxyz');
    assert.equal(conta(db, 'imagens'), 0);
    assert.equal(conta(db, 'imagens_item'), 0);
    assert.equal(conta(db, 'avaliacoes'), 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM valores WHERE fonte = 'avaliacoes'").get().n, 0);
    assert.deepEqual(arquivos(imagens), ['LEIA-ME.txt', 'tmp'], 'só os arquivos do motor saem; o resto da pasta fica');
    // O item de páginas, a festa e o vínculo ficam intactos (texto público).
    const pg = db.prepare("SELECT contexto FROM itens_brutos WHERE fonte = 'paginas'").get();
    assert.match(pg.contexto, /Texto da página pública/);
    assert.equal(conta(db, 'festas'), 2);
    assert.equal(listarRegistros(db).length, 2);
    // Rodar de novo não acha mais nada.
    assert.deepEqual(expurgar(db, { dirImagens: imagens }).apagados, { legendas: 0, imagens: 0, arquivos: 0, avaliacoes: 0, brutos: 0 });
  } finally {
    limpa();
  }
});

test('--tudo apaga também os brutos do Instagram, e só eles', async () => {
  const { db, imagens, limpa } = await cenario();
  try {
    const r = expurgar(db, { dirImagens: imagens, tudo: true });
    assert.equal(r.apagados.brutos, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM itens_brutos WHERE fonte = 'instagram'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM itens_brutos WHERE fonte = 'paginas'").get().n, 1);
    assert.equal(conta(db, 'festas'), 2, 'as festas e os vínculos não somem');
  } finally {
    limpa();
  }
});

test('sem diretório de imagens e com banco vazio: não quebra', () => {
  const db = novoBanco();
  const r = expurgar(db, { dirImagens: path.join(os.tmpdir(), 'finde-nao-existe-xyz') });
  assert.equal(r.feito, true);
  assert.deepEqual(r.apagados, { legendas: 0, imagens: 0, arquivos: 0, avaliacoes: 0, brutos: 0 });
  assert.deepEqual(expurgar(db, { dirImagens: null, simular: true }).apagados, r.apagados);
});

test('CLI: expurgar --simular não apaga; expurgar apaga; usa FINDE_IMAGENS', async () => {
  const { dir, imagens, db, limpa } = await cenario();
  try {
    // O cenário usa um banco em memória; para a CLI, copia para um arquivo.
    const arquivo = path.join(dir, 'finde.sqlite3');
    db.exec(`VACUUM INTO '${arquivo}'`);
    const env = { FINDE_BANCO: arquivo, FINDE_IMAGENS: imagens };
    const l = logQueGuarda();
    assert.equal(await main(['expurgar', '--simular'], { env, log: l }), 0);
    assert.match(l.linhas.join('\n'), /simulação \(nada foi apagado\): 1 post\(s\)[^\n]*2 imagem\(ns\)[^\n]*5 arquivo\(s\)[^\n]*5 avaliação/);
    assert.equal(arquivos(imagens).length, 7);
    l.linhas.length = 0;
    assert.equal(await main(['expurgar'], { env, log: l }), 0);
    assert.match(l.linhas.join('\n'), /expurgado:/);
    assert.match(l.linhas.join('\n'), /bucket/);
    assert.deepEqual(arquivos(imagens), ['LEIA-ME.txt', 'tmp']);
    const aberto = abrirBanco(arquivo);
    assert.equal(conta(aberto, 'avaliacoes'), 0);
    aberto.close();
  } finally {
    limpa();
  }
});

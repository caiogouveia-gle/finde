'use strict';
// O esquema 3 do banco (U3 do plano de 24/11/2026): as tabelas e colunas que
// as lanes usam, criadas de uma vez; a migração de um banco de 24/11 é
// idempotente, preenche a noite de cada festa e não mexe no que já existe; a
// abertura só para leitura não muda o arquivo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { abrirBanco, migrar, parEmOrdem, ESQUEMA, VERSAO_ESQUEMA } = require('../nucleo/banco');
const { novoBanco } = require('./ajuda');

const TABELAS = ['imagens', 'imagens_item', 'geocodificacoes', 'candidatos', 'vinculos_decisoes', 'festas_alias', 'curadoria', 'avaliacoes'];
const COLUNAS = { festas: ['data_noite'], vinculos: ['regra', 'escore', 'motivo', 'versao'], itens_brutos: ['contexto'], execucoes: ['atualizado_em'] };
const colunas = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const tabelas = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
const hash = (arq) => crypto.createHash('sha256').update(fs.readFileSync(arq)).digest('hex');
const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'finde-esquema-'));

function conferirEsquema(db) {
  for (const t of TABELAS) assert.ok(tabelas(db).includes(t), t);
  for (const [t, cs] of Object.entries(COLUNAS)) for (const c of cs) assert.ok(colunas(db, t).includes(c), `${t}.${c}`);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
}

test('banco novo nasce no esquema 3', () => {
  assert.equal(VERSAO_ESQUEMA, 3);
  conferirEsquema(novoBanco());
});

test('banco com o esquema de 24/11 migra, preenche a noite de cada festa e mantém o que tinha', () => {
  const dir = pasta();
  const arq = path.join(dir, 'antigo.sqlite3');
  const velho = new DatabaseSync(arq);
  velho.exec(ESQUEMA); // o esquema de antes, sem as colunas e tabelas novas
  const ins = velho.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
  velho.prepare("INSERT INTO festas (id, data, criada_em) VALUES ('noite', '2026-11-28', 't'), ('madrugada', '2026-11-28', 't'), ('sem-inicio', '2026-11-29', 't')").run();
  ins.run('noite', 'inicio', 'paginas', JSON.stringify('2026-11-28T23:00:00-03:00'), 't', 't');
  ins.run('madrugada', 'inicio', 'regras', JSON.stringify('2026-11-28T23:00:00-03:00'), '2026-11-20', 't');
  ins.run('madrugada', 'inicio', 'envio', JSON.stringify('2026-11-28T00:30:00-03:00'), '2026-11-10', 't'); // vale o envio (prioridade)
  velho.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em) VALUES ('paginas', 'p1', 'noite', NULL, 't')").run();
  velho.close();
  const db = abrirBanco(arq);
  conferirEsquema(db);
  const noite = Object.fromEntries(db.prepare('SELECT id, data_noite FROM festas').all().map((r) => [r.id, r.data_noite]));
  assert.deepEqual(noite, { noite: '2026-11-28', madrugada: '2026-11-27', 'sem-inicio': '2026-11-29' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM vinculos').get().n, 1);
  assert.equal(db.prepare('SELECT regra FROM vinculos').get().regra, null);
  // Rodar de novo não falha nem muda nada.
  migrar(db);
  migrar(db);
  conferirEsquema(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM festas').get().n, 3);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('imagens_item exige o item bruto e a imagem (FK)', () => {
  const db = novoBanco();
  db.prepare("INSERT INTO imagens (sha, arquivo, miniatura, criada_em) VALUES ('0123456789abcdef', 'imagens/0123456789abcdef-1080.webp', 'imagens/0123456789abcdef-480.webp', 't')").run();
  const ligar = (fonte, id) => db.prepare("INSERT INTO imagens_item (fonte, id_externo, sha, papel, conferido_em) VALUES (?, ?, '0123456789abcdef', 'flyer', 't')").run(fonte, id);
  assert.throws(() => ligar('instagram', 'nao-existe'), /FOREIGN KEY/);
  db.prepare("INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES ('instagram', 'ig:abc:1', 'h', '{}', 't')").run();
  ligar('instagram', 'ig:abc:1');
  assert.throws(() => db.prepare("INSERT INTO imagens_item (fonte, id_externo, sha, papel, conferido_em) VALUES ('instagram', 'ig:abc:1', 'ffffffffffffffff', 'flyer', 't')").run(), /FOREIGN KEY/);
});

test('decisão manual: o par fica em ordem, e (a, b) e (b, a) são a mesma linha', () => {
  const db = novoBanco();
  const [a, b] = parEmOrdem(['paginas', 'z:1'], ['instagram', 'ig:x:1']);
  assert.deepEqual([a, b], [['instagram', 'ig:x:1'], ['paginas', 'z:1']]);
  const ins = db.prepare("INSERT INTO vinculos_decisoes (a_fonte, a_id, b_fonte, b_id, decisao, quem, quando) VALUES (?, ?, ?, ?, 'separa', 'teste', 't')");
  ins.run(a[0], a[1], b[0], b[1]);
  assert.throws(() => ins.run(b[0], b[1], a[0], a[1]), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO vinculos_decisoes (a_fonte, a_id, b_fonte, b_id, decisao, quando) VALUES ('a', '1', 'b', '1', 'talvez', 't')").run(), /CHECK/);
});

test('readOnly não muda o arquivo nem migra', () => {
  const dir = pasta();
  const arq = path.join(dir, 'leitura.sqlite3');
  const velho = new DatabaseSync(arq);
  velho.exec(ESQUEMA);
  velho.prepare("INSERT INTO festas (id, data, criada_em) VALUES ('f', '2026-11-28', 't')").run();
  velho.close();
  const antes = hash(arq);
  const db = abrirBanco(arq, { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM festas').get().n, 1);
  assert.equal(colunas(db, 'festas').includes('data_noite'), false);
  assert.throws(() => db.exec("INSERT INTO festas (id, data, criada_em) VALUES ('g', null, 't')"), /readonly/i);
  db.close();
  assert.equal(hash(arq), antes);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('migrar: false abre sem criar tabela nenhuma', () => {
  const dir = pasta();
  const db = abrirBanco(path.join(dir, 'cru.sqlite3'), { migrar: false });
  assert.deepEqual(tabelas(db), []);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

'use strict';
// O banco do motor: SQLite do próprio Node 24 (node:sqlite), um arquivo só.
// No Fly ele mora no volume e o Litestream copia cada commit para o bucket
// (deploy/litestream.yml). Local, fica em motor/var/finde.sqlite3.
//
// Valores por fonte (KTD2): cada fonte guarda o que disse de cada campo, com a
// hora em que conferiu; o registro escolhe na leitura (contrato.js).

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS festas (
  id TEXT PRIMARY KEY,
  data TEXT,
  criada_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS festas_data ON festas(data);

-- Cada item de fonte aponta para uma festa; é o que mantém o id estável.
CREATE TABLE IF NOT EXISTS vinculos (
  fonte TEXT NOT NULL,
  id_externo TEXT NOT NULL,
  festa_id TEXT NOT NULL REFERENCES festas(id),
  url TEXT,
  visto_em TEXT NOT NULL,
  PRIMARY KEY (fonte, id_externo)
);
CREATE INDEX IF NOT EXISTS vinculos_festa ON vinculos(festa_id);

-- O que cada fonte disse de cada campo. conferido_em anda a cada coleta que
-- confirma o valor; mudou_em só quando o valor muda.
CREATE TABLE IF NOT EXISTS valores (
  festa_id TEXT NOT NULL REFERENCES festas(id),
  campo TEXT NOT NULL,
  fonte TEXT NOT NULL,
  valor TEXT NOT NULL,
  conferido_em TEXT NOT NULL,
  mudou_em TEXT NOT NULL,
  PRIMARY KEY (festa_id, campo, fonte)
);

-- O item como chegou, para reprocessar sem coletar de novo.
CREATE TABLE IF NOT EXISTS itens_brutos (
  fonte TEXT NOT NULL,
  id_externo TEXT NOT NULL,
  hash TEXT NOT NULL,
  bruto TEXT NOT NULL,
  coletado_em TEXT NOT NULL,
  PRIMARY KEY (fonte, id_externo)
);

-- Classificação por hash do texto de entrada: festa sem mudança não volta ao modelo.
CREATE TABLE IF NOT EXISTS classificacoes (
  hash TEXT PRIMARY KEY,
  por TEXT NOT NULL,
  modelo TEXT,
  resultado TEXT NOT NULL,
  criada_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inicio TEXT NOT NULL,
  fim TEXT,
  estado TEXT NOT NULL,          -- rodando | ok | erro
  gatilho TEXT NOT NULL,         -- agenda | comando | envio
  resumo TEXT
);

CREATE TABLE IF NOT EXISTS uso_llm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execucao_id INTEGER,
  quando TEXT NOT NULL,
  modelo TEXT NOT NULL,
  festa_id TEXT,
  tokens_entrada INTEGER NOT NULL,
  tokens_saida INTEGER NOT NULL,
  custo_usd REAL NOT NULL,
  resultado TEXT NOT NULL        -- ok | invalido | erro
);
CREATE INDEX IF NOT EXISTS uso_llm_quando ON uso_llm(quando);

-- Acessos à API. Sem IP: quem é sai do token (produtora) ou fica "publico".
CREATE TABLE IF NOT EXISTS uso_api (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  metodo TEXT NOT NULL,
  rota TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  cliente TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS uso_api_quando ON uso_api(quando);

-- Produtoras que mandam festas pelo endpoint. Guarda só o hash do token.
CREATE TABLE IF NOT EXISTS produtoras (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  criada_em TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1
);

-- Envios recebidos pelo endpoint, que a próxima coleta processa.
CREATE TABLE IF NOT EXISTS envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produtora_id TEXT NOT NULL REFERENCES produtoras(id),
  recebido_em TEXT NOT NULL,
  corpo TEXT NOT NULL
);
`;

function abrirBanco(caminho = ':memory:') {
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(ESQUEMA);
  return db;
}

// Transação simples: se fn lançar, desfaz.
function transacao(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { abrirBanco, transacao };

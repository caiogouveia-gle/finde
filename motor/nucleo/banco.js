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

-- A última rodada boa de cada fonte, para a fonte com intervalo (uma vez por
-- dia) não rodar de novo nas outras execuções do dia.
CREATE TABLE IF NOT EXISTS fontes_rodadas (
  fonte TEXT PRIMARY KEY,
  ultima_ok TEXT NOT NULL
);

-- Links de ingresso achados na bio e no Linktree dos perfis do Instagram. O
-- perfil vai ao Apify uma vez por semana; estes links voltam à fila todo dia.
CREATE TABLE IF NOT EXISTS links_bio (
  perfil TEXT NOT NULL,
  url TEXT NOT NULL,
  visto_em TEXT NOT NULL,
  PRIMARY KEY (perfil, url)
);

-- Rodadas dos coletores do Apify (prova de conceito): itens e custo estimado.
CREATE TABLE IF NOT EXISTS uso_apify (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execucao_id INTEGER,
  quando TEXT NOT NULL,
  ator TEXT NOT NULL,
  itens INTEGER NOT NULL,
  custo_usd REAL NOT NULL,
  resultado TEXT NOT NULL        -- ok | erro
);

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

// Esquema 3 (plano de 24/11/2026, U3): correlação com escore e apelidos,
// imagens por conteúdo ligadas ao item, geocodificação com cache, curadoria
// e avaliações. Tudo criado de uma vez, para as lanes trabalharem contra um
// esquema fixo; as colunas novas entram por ALTER conferido (migrar).
const ESQUEMA_3 = `
-- A imagem por conteúdo (KTD6): o sha16 dos bytes recodificados é o nome do arquivo.
CREATE TABLE IF NOT EXISTS imagens (
  sha TEXT PRIMARY KEY,
  arquivo TEXT NOT NULL,          -- imagens/<sha16>-1080.webp
  miniatura TEXT NOT NULL,        -- imagens/<sha16>-480.webp
  tipo TEXT,
  largura INTEGER,
  altura INTEGER,
  bytes INTEGER,
  phash TEXT,                     -- 64 bits em hexadecimal
  dhash TEXT,
  criada_em TEXT NOT NULL,
  oculta INTEGER NOT NULL DEFAULT 0,
  motivo_oculta TEXT
);

-- Que item trouxe qual imagem. A festa sai do JOIN com vinculos, então fusão,
-- separação e decisão manual levam a imagem junto.
CREATE TABLE IF NOT EXISTS imagens_item (
  fonte TEXT NOT NULL,
  id_externo TEXT NOT NULL,
  sha TEXT NOT NULL REFERENCES imagens(sha),
  papel TEXT NOT NULL,            -- cartaz-enviado | cartaz-indicado | flyer | pagina-ingresso | post
  url_origem TEXT,                -- de onde os bytes vieram (CDN); nunca vai ao público
  link_origem TEXT,               -- o post ou a página, que vai ao crédito
  credito TEXT,
  leitura TEXT,                   -- o que a leitura própria disse da peça: flyer | foto | outra
  conferido_em TEXT NOT NULL,
  PRIMARY KEY (fonte, id_externo, sha),
  FOREIGN KEY (fonte, id_externo) REFERENCES itens_brutos(fonte, id_externo)
);
CREATE INDEX IF NOT EXISTS imagens_item_sha ON imagens_item(sha);

-- Cache permanente do geocodificador (KTD10), inclusive do "não achou".
CREATE TABLE IF NOT EXISTS geocodificacoes (
  chave TEXT PRIMARY KEY,         -- a consulta normalizada
  consulta TEXT NOT NULL,         -- JSON da consulta estruturada
  achou INTEGER NOT NULL,
  resultado TEXT,                 -- JSON { lat, lng, precisao, ... } ou null
  provedor TEXT NOT NULL,
  consultado_em TEXT NOT NULL
);

-- Uniões possíveis que o escore deixou para olho humano (KTD5).
CREATE TABLE IF NOT EXISTS candidatos (
  fonte TEXT NOT NULL,
  id_externo TEXT NOT NULL,
  festa_id TEXT NOT NULL,
  escore REAL NOT NULL,
  motivo TEXT,                    -- JSON dos sinais
  visto_em TEXT NOT NULL,
  PRIMARY KEY (fonte, id_externo, festa_id)
);

-- Decisão manual sobre um par de itens: une ou separa. O par fica em ordem
-- (a < b, ver parEmOrdem), para (a, b) e (b, a) serem a mesma linha.
CREATE TABLE IF NOT EXISTS vinculos_decisoes (
  a_fonte TEXT NOT NULL,
  a_id TEXT NOT NULL,
  b_fonte TEXT NOT NULL,
  b_id TEXT NOT NULL,
  decisao TEXT NOT NULL CHECK (decisao IN ('une', 'separa')),
  quem TEXT,
  quando TEXT NOT NULL,
  PRIMARY KEY (a_fonte, a_id, b_fonte, b_id),
  CHECK (a_fonte || char(31) || a_id < b_fonte || char(31) || b_id)
);

-- Festa absorvida por outra: o id antigo continua resolvendo (resolverId).
CREATE TABLE IF NOT EXISTS festas_alias (
  antigo TEXT PRIMARY KEY,
  novo TEXT NOT NULL,
  quando TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS festas_alias_novo ON festas_alias(novo);

-- Correção humana (KTD12). A fonte "curadoria" regrava os campos ativos a cada execução.
CREATE TABLE IF NOT EXISTS curadoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  festa_id TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor TEXT,                     -- JSON
  motivo TEXT,
  criada_em TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS curadoria_festa ON curadoria(festa_id);

-- Avaliações pós-festa vindas do app (KTD13). Sem nome: a chave e o aparelho
-- já chegam como HMAC.
CREATE TABLE IF NOT EXISTS avaliacoes (
  chave TEXT PRIMARY KEY,
  festa_id TEXT NOT NULL,
  aparelho TEXT NOT NULL,
  plano TEXT,
  resposta TEXT NOT NULL CHECK (resposta IN ('mais-novo', 'na-medida', 'mais-velho')),
  idade INTEGER,
  recebida_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS avaliacoes_festa ON avaliacoes(festa_id);
`;

// Colunas novas em tabelas que já existiam: [tabela, coluna, tipo].
const COLUNAS_3 = [
  ['festas', 'data_noite', 'TEXT'],
  ['vinculos', 'regra', 'TEXT'],
  ['vinculos', 'escore', 'REAL'],
  ['vinculos', 'motivo', 'TEXT'],
  ['vinculos', 'versao', 'TEXT'],
  ['itens_brutos', 'contexto', 'TEXT'], // JSON de texto e categorias, fora do hash (KTD11)
  ['execucoes', 'atualizado_em', 'TEXT'], // batimento da execução (U8)
];

const VERSAO_ESQUEMA = 3;

// O par de itens em ordem, para vinculos_decisoes: [[fonte, id], [fonte, id]].
function parEmOrdem(a, b) {
  const chave = (x) => `${x[0]}\u001f${x[1]}`;
  return chave(a) < chave(b) ? [a, b] : [b, a];
}

// Leva o banco ao esquema 3. Idempotente: confere cada coluna antes do ALTER.
// Preenche festas.data_noite onde estiver vazia, pela data e pelo início que
// vale (prioridade da fonte, depois o mais recente).
function migrar(db) {
  db.exec(ESQUEMA);
  db.exec(ESQUEMA_3);
  for (const [tabela, coluna, tipo] of COLUNAS_3) {
    const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
    if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS festas_data_noite ON festas(data_noite)');
  const { dataDaNoite } = require('./contrato');
  const { PRIORIDADE } = require('./catalogo');
  const vazias = db.prepare('SELECT id, data FROM festas WHERE data_noite IS NULL').all();
  if (vazias.length) {
    const qInicio = db.prepare("SELECT fonte, valor, conferido_em FROM valores WHERE festa_id = ? AND campo = 'inicio'");
    const upd = db.prepare('UPDATE festas SET data_noite = ? WHERE id = ?');
    transacao(db, () => {
      for (const f of vazias) {
        const inicios = qInicio.all(f.id)
          .sort((a, b) => (PRIORIDADE[b.fonte] || 0) - (PRIORIDADE[a.fonte] || 0) || b.conferido_em.localeCompare(a.conferido_em));
        let inicio = null;
        try {
          inicio = inicios.length ? JSON.parse(inicios[0].valor) : null;
        } catch {
          inicio = null;
        }
        const dn = dataDaNoite(f.data, inicio);
        if (dn) upd.run(dn, f.id);
      }
    });
  }
  db.exec(`PRAGMA user_version = ${VERSAO_ESQUEMA}`);
  return db;
}

// abrirBanco(caminho, { readOnly, migrar }): `migrar` (padrão) leva ao esquema
// 3; `readOnly` abre sem escrever nada, nem a migração (a origem do
// reprocessar, KTD11).
function abrirBanco(caminho = ':memory:', { readOnly = false, migrar: comMigracao = true } = {}) {
  if (readOnly) {
    const db = new DatabaseSync(caminho, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 5000;');
    return db;
  }
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (comMigracao) migrar(db);
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

module.exports = { abrirBanco, transacao, migrar, parEmOrdem, ESQUEMA, ESQUEMA_3, COLUNAS_3, VERSAO_ESQUEMA };

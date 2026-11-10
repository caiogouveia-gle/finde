'use strict';
// Cadastro das produtoras que mandam festas pelo endpoint. O token aparece uma
// vez, na criação; o banco guarda só o hash.

const crypto = require('node:crypto');
const { slug } = require('./normalizar');

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function criarProdutora(db, nome, agora = new Date()) {
  const limpo = String(nome || '').trim();
  if (!limpo || limpo.length > 120) throw new Error('nome de produtora inválido');
  let id = slug(limpo).slice(0, 50) || 'produtora';
  if (db.prepare('SELECT 1 FROM produtoras WHERE id = ?').get(id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
  const token = `fnd_${crypto.randomBytes(24).toString('base64url')}`;
  db.prepare('INSERT INTO produtoras (id, nome, token_hash, criada_em) VALUES (?, ?, ?, ?)')
    .run(id, limpo, hashToken(token), agora.toISOString());
  return { id, nome: limpo, token };
}

function produtoraDoToken(db, token) {
  if (typeof token !== 'string' || token.length < 10) return null;
  return db.prepare('SELECT id, nome FROM produtoras WHERE token_hash = ? AND ativa = 1').get(hashToken(token)) || null;
}

module.exports = { criarProdutora, produtoraDoToken, hashToken };

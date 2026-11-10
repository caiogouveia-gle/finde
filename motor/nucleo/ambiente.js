'use strict';
// O que vem do ambiente, num lugar só. Nenhum segredo fica em arquivo: a chave
// da API e o token de admin vêm de variáveis (no Fly, `fly secrets`).

const path = require('node:path');
const { abrirBanco } = require('./banco');
const { criarClienteClaude } = require('./classificar');
const { lerConfig } = require('../fontes');

const RAIZ = path.join(__dirname, '..');

function ambiente(env = process.env) {
  return {
    banco: env.FINDE_BANCO || path.join(RAIZ, 'var', 'finde.sqlite3'),
    porta: Number(env.FINDE_MOTOR_PORTA || 8764),
    horarios: env.FINDE_HORARIOS || null, // sem valor, o servidor não agenda; "padrao" usa 07,12,17,21h
    adminToken: env.FINDE_ADMIN_TOKEN || null,
    cors: (env.FINDE_CORS || '').split(',').map((s) => s.trim()).filter(Boolean),
    comExemplos: env.FINDE_COM_EXEMPLOS === '1',
  };
}

function preparar(env = process.env, log = console) {
  const amb = ambiente(env);
  return { amb, db: abrirBanco(amb.banco), config: lerConfig(), claude: criarClienteClaude(log) };
}

module.exports = { ambiente, preparar, RAIZ };

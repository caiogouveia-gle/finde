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
    // Prova acadêmica (D1, KTD18): a agenda liga Instagram e páginas com FINDE_POC=1.
    // A CLI continua exigindo --poc.
    poc: env.FINDE_POC === '1',
    // Onde as imagens de divulgação moram (no Fly, o volume: /data/imagens).
    imagens: env.FINDE_IMAGENS || path.join(RAIZ, 'var', 'imagens'),
    // O token do app (POST /api/avaliacoes), comparado em tempo constante.
    appToken: env.FINDE_APP_TOKEN || null,
    // Lista privada de perfis do Instagram (quem a lê é fontes/instagram.js).
    perfis: env.FINDE_INSTAGRAM_PERFIS || null,
  };
}

function preparar(env = process.env, log = console) {
  const amb = ambiente(env);
  return { amb, db: abrirBanco(amb.banco), config: lerConfig(), claude: criarClienteClaude(log) };
}

module.exports = { ambiente, preparar, RAIZ };

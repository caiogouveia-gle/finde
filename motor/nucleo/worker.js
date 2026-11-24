'use strict';
// O ambiente dos workers de Python (o leitor de páginas e o de imagens). Eles
// tratam conteúdo de terceiros (o Chromium roda o JavaScript das páginas, o
// Pillow decodifica imagens de fora), então não herdam os segredos do motor:
// só o que o uv, o Python e o navegador precisam para rodar. Uma chave, token
// ou senha fica de fora mesmo com um prefixo permitido.

const os = require('node:os');
const path = require('node:path');

const NOMES = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LANGUAGE', 'TZ', 'VIRTUAL_ENV', 'SSL_CERT_FILE', 'SSL_CERT_DIR']);
const PREFIXOS = ['LC_', 'UV_', 'PLAYWRIGHT_', 'PYTHON', 'XDG_'];
const SEGREDO = /TOKEN|KEY|SECRET|SENHA|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION/i;

function envDoWorker(base = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined || SEGREDO.test(k)) continue;
    if (NOMES.has(k) || PREFIXOS.some((p) => k.startsWith(p))) env[k] = v;
  }
  env.PATH = `${path.join(os.homedir(), '.local', 'bin')}${path.delimiter}${base.PATH || ''}`;
  return env;
}

module.exports = { envDoWorker };

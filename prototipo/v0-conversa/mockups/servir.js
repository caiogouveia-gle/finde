'use strict';
// Serve a pasta mockups/ para comparar as abordagens de interface lado a lado.
// Uso: node mockups/servir.js [porta]   (padrão 8762)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = __dirname;
const PORTA = Number(process.argv[2] || process.env.FINDE_MOCKUPS_PORTA || 8762);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let caminho;
  try {
    caminho = decodeURIComponent(new URL(req.url, 'http://mockups').pathname);
  } catch {
    res.writeHead(400).end('pedido inválido');
    return;
  }
  if (caminho.endsWith('/')) caminho += 'index.html';
  const alvo = path.resolve(RAIZ, '.' + path.posix.normalize('/' + caminho));
  if (alvo !== RAIZ && !alvo.startsWith(RAIZ + path.sep)) {
    res.writeHead(404).end('não achei');
    return;
  }
  fs.readFile(alvo, (erro, dados) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('não achei');
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  });
}).listen(PORTA, '127.0.0.1', () => console.log(`mockups do Finde em http://localhost:${PORTA}/`));

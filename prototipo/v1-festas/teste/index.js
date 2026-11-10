'use strict';
// Ponto de entrada de `node --test teste/`: o Node 24 resolve a pasta para
// este arquivo, que carrega todos os *.test.js daqui.
const fs = require('node:fs');
const path = require('node:path');

for (const nome of fs.readdirSync(__dirname).sort()) {
  if (nome.endsWith('.test.js')) require(path.join(__dirname, nome));
}

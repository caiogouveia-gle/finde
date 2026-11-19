#!/usr/bin/env node
'use strict';
// Leva as festas reais do motor ao app: lê o export finde-r14/2
// (`node cli.js exportar`, na pasta motor/) e grava dados/reais.json, que o
// servidor lê. O arquivo fica fora do git (tem dado real) e dentro da imagem
// do Fly (o Dockerfile copia dados/).
//
//   node ferramentas/reais.js [export] [destino]
//
// Padrões: ../../motor/var/festas-r14.json e dados/reais.json. Grava só os
// registros que o app aceita (nucleo/reais.js, converterRegistro), do jeito
// que o motor mandou; diz o que ficou fora e por quê. A festa que já passou
// continua no arquivo: o servidor a tira da lista pelo relógio, e o convite e
// o link dela dizem que ela passou.

const fs = require('node:fs');
const path = require('node:path');
const R = require('../nucleo/reais');

const RAIZ = path.join(__dirname, '..');
const origem = path.resolve(process.argv[2] || path.join(RAIZ, '..', '..', 'motor', 'var', 'festas-r14.json'));
const destino = path.resolve(process.argv[3] || path.join(RAIZ, 'dados', 'reais.json'));

let bruto;
try {
  bruto = JSON.parse(fs.readFileSync(origem, 'utf8'));
} catch (e) {
  console.error(`Não consegui ler ${origem}: ${e.message}`);
  console.error('Rode antes, na pasta motor/: node cli.js exportar');
  process.exit(1);
}
if (!bruto || bruto.contrato !== R.CONTRATO || !Array.isArray(bruto.festas)) {
  console.error(`${origem} não é um export ${R.CONTRATO} (falta "contrato" ou "festas").`);
  process.exit(1);
}

const { festas, fora, avisos } = R.converterExport(bruto);
for (const a of avisos) console.warn(`aviso: ${a}`);
const aceitos = new Set(festas.map((f) => f.id));
const registros = bruto.festas.filter((r) => r && aceitos.has(r.id));
const saida = {
  contrato: R.CONTRATO,
  geradoEm: bruto.geradoEm || null,
  copiadoEm: new Date().toISOString(),
  total: registros.length,
  festas: registros,
};

fs.mkdirSync(path.dirname(destino), { recursive: true });
const tmp = `${destino}.${process.pid}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(saida, null, 2)}\n`);
fs.renameSync(tmp, destino);

const agora = Date.now();
const passadas = festas.filter((f) => R.passou(f, agora)).length;
console.log(`${registros.length} festas reais em ${path.relative(process.cwd(), destino) || destino}${passadas ? ` (${passadas} já passaram e não entram na lista)` : ''}.`);
for (const f of festas) console.log(`  entra  ${f.data}  ${f.nome}`);
for (const x of fora) console.log(`  fora   ${x.id}: ${x.motivo}`);

#!/usr/bin/env node
'use strict';
// O expurgo do lado do app (D15, 31/12/2026): apaga do volume as avaliações e
// o sal delas, o cache das imagens das festas reais e o cache da lista real.
// Com --reserva, apaga também a reserva que o servidor lê quando o motor está
// fora (dados/reais.json e dados/imagens/), que mora fora do git no Mac.
//
//   node ferramentas/expurgar.js [--var <dir>] [--reserva] [--simular]
//
// Padrões: --var é FINDE_VAR, ou var/ ao lado do servidor (no Fly, /data).
// Com --simular, só lista o que apagaria. Rode com o app parado (ou reinicie
// depois): o processo vivo guarda as avaliações em memória.
//
// A imagem Docker do app carrega dados/ (COPY dados ./dados): depois do
// expurgo, o deploy precisa sair com dados/reais.json e dados/imagens/ vazios
// (rode este comando com --reserva antes do `fly deploy`) e as releases
// antigas, que ainda os carregam, precisam sair do registry. O roteiro do
// deploy (docs/operacao) diz a ordem.

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
// O que mora no volume do app (FINDE_VAR) e sai no expurgo.
const DO_VOLUME = ['avaliacoes.json', 'avaliacoes-sal', 'imagens', 'reais-cache.json'];
// Restos de gravação (tmp e rename) dos mesmos arquivos.
const RESTO = /^(avaliacoes\.json|reais-cache\.json)\..+\.tmp$/;

// expurgar({ varDir, reserva, raiz, simular }) -> { apagados: [caminho], simulado }
function expurgar({ varDir, reserva = false, raiz = RAIZ, simular = false } = {}) {
  if (!varDir) throw new Error('expurgar: falta o diretório do volume');
  const alvos = DO_VOLUME.map((n) => path.join(varDir, n));
  try {
    for (const n of fs.readdirSync(varDir)) if (RESTO.test(n)) alvos.push(path.join(varDir, n));
  } catch { /* volume vazio ou ausente */ }
  if (reserva) alvos.push(path.join(raiz, 'dados', 'reais.json'), path.join(raiz, 'dados', 'imagens'));
  const apagados = alvos.filter((c) => fs.existsSync(c));
  if (!simular) for (const c of apagados) fs.rmSync(c, { recursive: true, force: true });
  return { apagados, simulado: simular };
}

function main(argv = process.argv.slice(2), { saida = console.log } = {}) {
  let varDir = process.env.FINDE_VAR || path.join(RAIZ, 'var');
  let reserva = false;
  let simular = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--var') varDir = argv[++i];
    else if (argv[i] === '--reserva') reserva = true;
    else if (argv[i] === '--simular') simular = true;
    else throw new Error(`expurgar: opção desconhecida ${argv[i]}`);
  }
  const r = expurgar({ varDir: path.resolve(varDir), reserva, simular });
  const verbo = simular ? 'apagaria' : 'apagou';
  saida(r.apagados.length ? `${verbo}:\n${r.apagados.map((c) => `  ${c}`).join('\n')}` : 'nada a apagar');
  return r;
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { expurgar, main, DO_VOLUME };

'use strict';
// O movimento do app (publico/app.js, comum.js, plano.js, app.css): o que a
// revisão filmada achou e não pode voltar. A prova de verdade é o filme; aqui
// fica a forma do código que a garante.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ler = (nome) => fs.readFileSync(path.join(__dirname, '..', 'publico', nome), 'utf8');
const APP = ler('app.js');
const PLANO = ler('plano.js');
const COMUM = ler('comum.js');
const CSS = ler('app.css');

test('lista → detalhe: a hora e o nome ganham nome de transição na página certa', () => {
  const vista = APP.slice(APP.indexOf('function comVista'), APP.indexOf('let vistaEmCurso'));
  assert.ok(vista, 'falta comVista');
  // nomear(naLista): antes da troca a página é a de origem (na ida, a
  // lista); dentro do callback, a de destino (na volta, a lista).
  const antes = vista.slice(0, vista.indexOf('startViewTransition('));
  assert.match(antes, /nomear\(ida\);/);
  const dentro = vista.slice(vista.indexOf('startViewTransition('));
  assert.match(dentro, /fazer\(\);\s*nomear\(volta\);/);
});

test('lista → detalhe: as duas páginas não ficam legíveis juntas, e viaja uma imagem só', () => {
  const sai = CSS.match(/::view-transition-old\(root\)\s*\{\s*animation:\s*mov-vt-sai\s+(\d+)ms/);
  const entra = CSS.match(/::view-transition-new\(root\)\s*\{\s*animation:\s*mov-vt-entra\s+\S+\s+\S+\s+(\d+)ms/);
  assert.ok(sai && entra, 'falta a troca do root');
  // A de chegada só começa quando a de saída já passou de dois terços.
  assert.ok(Number(entra[1]) >= Number(sai[1]) * 0.6, `entrada aos ${entra[1]} ms, saída de ${sai[1]} ms`);
  assert.match(CSS, /::view-transition-old\(festa-hora\), ::view-transition-old\(festa-nome\) \{ animation: none; opacity: 0; \}/);
});

test('questionário: a troca de pergunta não segura quem responde', () => {
  const avanco = Number(APP.match(/const AVANCO_MS = (\d+);/)[1]);
  assert.ok(avanco <= 220, `AVANCO_MS ${avanco}`);
  const entra = APP.slice(APP.indexOf('function entraPergunta'), APP.indexOf('function entraResultado'));
  // Entre perguntas: título no tempo de bloco e opções logo atrás dele.
  assert.match(entra, /M\.titulo\([^;]*troca \? \{ duracao: v\.bloco/);
  assert.match(entra, /troca \? \{ atraso: 40,/);
  // A nova pergunta não espera o último quadro da que sai.
  const recuar = APP.slice(APP.indexOf('function recuar'), APP.indexOf('function comVista'));
  assert.match(recuar, /setTimeout\(ir1, v\.toque - 50\)/);
});

test('convite: o botão que tem o foco nunca é recortado', () => {
  // Recortar o botão cortava junto o anel de foco de quem veio pelo teclado.
  assert.doesNotMatch(PLANO, /M\.revelar\(eu/);
  const encher = PLANO.slice(PLANO.indexOf('function encher'), PLANO.indexOf('// ------------------------------------------------------------ desenho'));
  assert.match(encher, /pseudoElement: '::after'/);
  assert.match(encher, /classList\.remove\('enche'\)/);
  assert.match(CSS, /\.botao\.enche::after \{/);
});

test('convite e painel: a ação chega junto com o conteúdo', () => {
  const painel = COMUM.slice(COMUM.indexOf('function painel'), COMUM.indexOf('function aoVer'));
  assert.doesNotMatch(painel, /k \* 2 \* v\.escala/);
  const quem = Number(PLANO.match(/querySelector\('\.quem'\), \{ atraso: (\d+)/)[1]);
  assert.ok(quem <= 400, `quem vai entra aos ${quem} ms`);
  const criar = Number(APP.match(/querySelectorAll\(':scope > \.bloco'\), \{ atraso: (\d+)/)[1]);
  assert.ok(criar <= 300, `Criar o convite entra aos ${criar} ms`);
});

'use strict';
// A conversa de ponta a ponta, pela API: os defeitos da revisão, um a um.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor, proximaPista } = require('../servidor');
const conversa = require('../nucleo/conversa');
const { prepararBase, lerLinhas } = require('../nucleo/base');

const mudo = { info() {}, warn() {}, error() {} };
const BASE = prepararBase(lerLinhas(require('../dados/festas.json'))).base;
let servidor;
let raiz;
let pasta;

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-conversa-'));
  servidor = criarServidor({ varDir: pasta, log: mudo });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  raiz = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

const post = (u, b) => fetch(raiz + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const ids = (d) => d.opcoes.map((o) => o.festa.id);

// Faz o formulário e depois as frases, uma a uma; devolve todas as respostas.
async function conversar(criterios, ...frases) {
  let d = await post('/api/festas', { criterios });
  const passos = [d];
  for (const texto of frases) {
    d = await post('/api/conversa', { criterios: d.criterios, texto, atuais: ids(d) });
    passos.push(d);
  }
  return passos;
}

const SAB = { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 };

test('"mais barato" desce a partir do mais caro da lista: de R$ 50 vai para R$ 30', async () => {
  const [, a] = await conversar({ ...SAB, teto: 50 }, 'mais barato');
  assert.equal(a.criterios.teto, 30);
  assert.match(a.resposta, /^(Teto em R\$ 30\.|Fixei o teto em R\$ 30)/);
  const [ini, b] = await conversar(SAB, 'mais barato');
  const caro = Math.max(...ini.opcoes.map((o) => o.festa.preco));
  assert.ok(b.criterios.teto < caro && b.criterios.teto < 80);
});

test('lista vazia com teto firme: diz o que travou, oferece, e "sim" aceita', async () => {
  const [, vazio, sim] = await conversar({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 50 }, 'de graça', 'sim');
  assert.deepEqual(vazio.opcoes, []);
  assert.equal(vazio.resposta, 'Fixei o teto em R$ 0 e nada cabe. Quer subir pra R$ 80?');
  assert.deepEqual(vazio.oferta, { frase: 'ate 80', rotulo: 'subir pra R$ 80' });
  assert.equal(sim.criterios.teto, 80);
  assert.ok(sim.opcoes.length > 0);
});

test('dois ajustes na mesma frase: "mais barato e mais perto" faz o primeiro e pergunta de onde', async () => {
  const [, r] = await conversar(SAB, 'mais barato e mais perto');
  assert.ok(r.criterios.teto < 80);
  assert.match(r.resposta, /Perto de onde\?$/);
});

test('"tem algo de MPB?" só diz "MPB, então" quando a lista tem MPB; senão, diz o que impede', async () => {
  const [, com] = await conversar(SAB, 'tem algo de MPB?');
  assert.ok(com.opcoes.some((o) => o.festa.estilos.includes('mpb-samba')));
  assert.match(com.resposta, /^MPB, então\./);
  const [, sem] = await conversar({ dia: 'dom', janela: 'noite', faixa: '30-35', teto: 80 }, 'tem algo de MPB?');
  assert.doesNotMatch(sem.resposta, /MPB, então/);
  assert.match(sem.resposta, /^Tem MPB, mas fora do seu horário\./);
});

test('"outro estilo" traz festas de outro som', async () => {
  const [ini, r] = await conversar({ ...SAB, estilos: ['house-disco'] }, 'outro estilo');
  const antes = new Set(ini.opcoes.map((o) => o.festa.estilos[0]));
  assert.ok(r.opcoes.some((o) => !antes.has(o.festa.estilos[0])));
  assert.match(r.resposta, /^Troquei a trilha\./);
});

test('"outras" até esgotar: avisa que já mostrou tudo e não troca a lista', async () => {
  const passos = await conversar({ ...SAB, teto: 50, estilos: ['mpb-samba'] }, 'outras', 'outras', 'outras');
  const ultimo = passos[passos.length - 1];
  const penultimo = passos[passos.length - 2];
  assert.equal(ultimo.resposta, 'Já mostrei tudo que cabe nesse pedido.');
  assert.deepEqual(ids(ultimo), ids(penultimo));
});

test('"sem pop" e depois "funk também": o funk com pop volta', async () => {
  const [, sem, com] = await conversar({ ...SAB, teto: 50, estilos: ['house-disco'] }, 'sem pop', 'funk também');
  assert.ok(!ids(sem).includes('funk-ao-entardecer'));
  assert.ok(ids(com).includes('funk-ao-entardecer'));
});

test('a abertura só afirma o que é verdade, e nada de "três" repetido nas falas', async () => {
  const passos = await conversar(SAB, 'mais perto de Pinheiros', 'mais barato', 'sem funk e indie', 'domingo', 'mais cedo');
  for (const p of passos) {
    assert.doesNotMatch(p.resposta, /Todas na sua idade/);
    assert.doesNotMatch(p.resposta, /\btrês\b/i);
    assert.doesNotMatch(p.resposta, / e indie e rock| e .* e .* e /);
  }
  assert.match(passos[3].resposta, /^Sem funk nem indie\./);
});

test('afrouxamento: no máximo uma frase por turno', async () => {
  const [ini] = await conversar({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 50 });
  assert.equal(ini.resposta, 'Só duas cabem, mesmo abrindo o horário, subindo o teto e incluindo a faixa vizinha.');
});

test('frases fora do alcance dizem o que o Finde entende', async () => {
  const [ini, r] = await conversar(SAB, 'algo mais tranquilo');
  assert.equal(r.entendeu, false);
  assert.match(r.resposta, /Entendo dia, horário, preço, idade, bairro e som\./);
  assert.deepEqual(ids(r), ids(ini));
});

test('"meia noite" é 24h; "até 2000" é preço sem limite, não pop', async () => {
  const [, meia] = await conversar(SAB, 'quero voltar até meia noite');
  assert.equal(meia.criterios.fimMax, 24);
  const [, caro] = await conversar(SAB, 'até 2000');
  assert.equal(caro.criterios.teto, 'sem-limite');
  assert.deepEqual(caro.criterios.estilos, []);
});

test('abertura em curadoria: aponta a que enche cedo e a mais barata', () => {
  const op = (id, esquenta, preco) => ({ festa: { id, esquenta, preco }, patrocinada: false });
  assert.equal(conversa.abertura({ opcoes: [op('a', 19, 50), op('b', 21, 30), op('c', 22, 60)] }), 'A primeira enche antes. A segunda custa menos.');
  assert.equal(conversa.abertura({ opcoes: [op('a', 19, 0), op('b', 21, 30)] }), 'A primeira enche antes e é de graça.');
  assert.equal(conversa.abertura({ opcoes: [op('a', 19, 50), op('b', 19, 50)] }), '');
  assert.equal(conversa.abertura({ opcoes: [], aviso: 'x' }), 'x');
});

test('a próxima pista que abre, pelo relógio', () => {
  const sabado17h = new Date(2026, 10, 14, 17, 30);
  const p = proximaPista(BASE, sabado17h);
  assert.match(p.linha, /^Sáb · 18h00 · /);
  const terca = proximaPista(BASE, new Date(2026, 10, 10, 9));
  assert.match(terca.linha, /^Sex · 17h00 · /);
  const domingoTarde = proximaPista(BASE, new Date(2026, 10, 15, 23));
  assert.match(domingoTarde.linha, /^Sex · /);
});

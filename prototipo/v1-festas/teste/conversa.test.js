'use strict';
// A conversa de ponta a ponta, pela API: os defeitos das revisões, um a um.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor, proximaPista, dataDaFesta } = require('../servidor');
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
const frases = (t) => t.split(/(?<=[.?!])\s+/).filter(Boolean).length;

// Faz o formulário e depois as frases, uma a uma; devolve todas as respostas.
async function conversar(criterios, ...falas) {
  let d = await post('/api/festas', { criterios });
  const passos = [d];
  for (const texto of falas) {
    d = await post('/api/conversa', { criterios: d.criterios, texto, atuais: ids(d) });
    passos.push(d);
  }
  return passos;
}

const SAB = { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 };

test('negação não inverte: "funk não" tira funk; "sexta não" não vai pra sexta; "Pinheiros não" tira Pinheiros', async () => {
  const [, funk] = await conversar({ ...SAB, estilos: ['house-disco'] }, 'funk não');
  assert.ok(funk.criterios.evitarEstilos.includes('funk'));
  assert.ok(funk.opcoes.every((o) => !o.festa.estilos.includes('funk')));
  assert.doesNotMatch(funk.resposta, /^Funk, então/);
  const [, sexta] = await conversar(SAB, 'sexta não');
  assert.equal(sexta.criterios.dia, 'sab');
  assert.match(sexta.resposta, /^Sexta já está fora\./);
  const [, naSexta] = await conversar({ ...SAB, dia: 'sex' }, 'sexta não');
  assert.equal(naSexta.criterios.dia, 'sab');
  const [, pin] = await conversar(SAB, 'Pinheiros não');
  assert.deepEqual(pin.criterios.evitarBairros, ['pinheiros']);
  assert.ok(pin.opcoes.every((o) => o.festa.bairro !== 'pinheiros'));
  const [, roof] = await conversar(SAB, 'nada de rooftop');
  assert.ok(roof.opcoes.every((o) => !/rooftop/.test(o.festa.casa)));
});

test('pedido composto: "house mas sem pagar mais de 50" é house com teto de R$ 50, não "só de graça"', async () => {
  const [, r] = await conversar(SAB, 'quero house mas sem pagar mais de 50 e perto da vila madalena');
  assert.equal(r.criterios.teto, 50);
  assert.deepEqual(r.criterios.estilos, ['house-disco']);
  assert.equal(r.criterios.perto, 'vila-madalena');
  assert.ok(r.opcoes.length > 0);
});

test('"domingo tem almoço" não troca o dia: pergunta, e "sim" aceita', async () => {
  const [, duvida, sim] = await conversar(SAB, 'domingo tem almoço', 'sim');
  assert.equal(duvida.criterios.dia, 'sab');
  assert.equal(duvida.resposta, 'Muda pro domingo?');
  assert.deepEqual(duvida.oferta, { frase: 'domingo', rotulo: 'Mudar pro domingo' });
  assert.equal(sim.criterios.dia, 'dom');
});

test('frases que o público diz: "tanto faz", "às 10 da noite", "depois das 22h", "da minha idade"', async () => {
  const [ini, tanto] = await conversar(SAB, 'tanto faz');
  assert.deepEqual(ids(tanto), ids(ini));
  assert.match(tanto.resposta, /^Então vai na primeira/);
  const [, dez] = await conversar(SAB, 'chegar às 10 da noite');
  assert.equal(dez.criterios.janela, 'noite');
  const [, depois] = await conversar(SAB, 'depois das 22h');
  assert.equal(depois.criterios.janela, 'noite');
  const [, idade] = await conversar(SAB, 'tem com gente da minha idade?');
  assert.match(idade.resposta, /^Sim: todas com média de 30 a 35\./);
});

test('quando não entende, diz o que dá pra pedir; quando não sabe, diz que ainda não sabe', async () => {
  const [ini, r] = await conversar(SAB, 'qual o sentido da vida');
  assert.equal(r.entendeu, false);
  assert.deepEqual(ids(r), ids(ini));
  assert.equal(r.resposta, 'Não peguei. Dá pra pedir mais cedo, mais barato, outro dia, um bairro ou um som.');
  const [, seg] = await conversar(SAB, 'isso é seguro?');
  assert.match(seg.resposta, /^Segurança eu ainda não sei dizer\./);
  const [, metro] = await conversar(SAB, 'tem perto do metrô?');
  assert.match(metro.resposta, /^Metrô e estacionamento eu ainda não sei\./);
  const [, contra] = await conversar(SAB, 'quero dançar até amanhecer mas voltar cedo');
  assert.equal(contra.resposta, 'Até amanhecer ou voltar cedo? Os dois eu não consigo.');
});

test('"mais barato" desce a partir do mais caro da lista e para no mais barato que ainda tem festa', async () => {
  const [, a] = await conversar({ ...SAB, teto: 50 }, 'mais barato');
  assert.ok(a.criterios.teto < 50);
  const passos = await conversar({ ...SAB, estilos: ['house-disco', 'pop-2000'] }, 'mais barato', 'mais barato');
  assert.equal(passos[2].criterios.teto, 35);
  assert.match(passos[2].resposta, /^R\$ 35 é o mais barato no sábado nesse pedido\./);
});

test('lista vazia com teto firme: diz o que travou, oferece, e "sim" aceita', async () => {
  const [, vazio, sim] = await conversar({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 50 }, 'de graça', 'sim');
  assert.deepEqual(vazio.opcoes, []);
  assert.equal(vazio.resposta, 'Até R$ 0, nada cabe. Até R$ 80, sim.');
  assert.deepEqual(vazio.oferta, { frase: 'ate 80', rotulo: 'Subir pra R$ 80' });
  assert.equal(sim.criterios.teto, 80);
  assert.ok(sim.opcoes.length > 0);
});

test('pedido difícil: o resultado diz que nada é do jeito pedido, e cada festa diz o que fura', async () => {
  const [r] = await conversar({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 50, estilos: ['funk'] });
  assert.equal(r.atendem, 0);
  assert.equal(r.resposta, 'Nada do jeito que você pediu. Funk no domingo, só às 17h, com média 24.');
  for (const o of r.opcoes) {
    assert.equal(o.atende, false);
    assert.ok(o.motivos.length >= 2);
  }
});

test('a fala tem no máximo duas frases (mais uma pergunta), e nada de "três"', async () => {
  const passos = await conversar(SAB, 'mais perto de Pinheiros', 'mais barato', 'sem funk e indie', 'domingo', 'mais cedo', 'mais barato e mais perto');
  for (const p of passos) {
    assert.ok(frases(p.resposta) <= 3, p.resposta);
    assert.doesNotMatch(p.resposta, /\btrês\b/i);
    assert.doesNotMatch(p.resposta, /Todas na sua idade/);
  }
  assert.match(passos[3].resposta, /^Sem funk nem indie\./);
  const [, duplo] = await conversar(SAB, 'mais barato e mais perto');
  assert.ok(duplo.criterios.teto < 80);
  assert.match(duplo.resposta, /Perto de onde\?$/);
});

test('"outras" até esgotar: avisa que já mostrou tudo e não troca a lista', async () => {
  const passos = await conversar({ ...SAB, teto: 50, estilos: ['mpb-samba'] }, 'outras', 'outras', 'outras');
  const ultimo = passos[passos.length - 1];
  assert.equal(ultimo.resposta, 'Já mostrei tudo que cabe nesse pedido.');
  assert.deepEqual(ids(ultimo), ids(passos[passos.length - 2]));
});

test('"tem algo de MPB?": só confirma quando a lista tem MPB; senão, diz o que impede', async () => {
  const [, com] = await conversar(SAB, 'tem algo de MPB?');
  assert.ok(com.opcoes.some((o) => o.festa.estilos.includes('mpb-samba')));
  assert.match(com.resposta, /^MPB, então\./);
  const [, sem] = await conversar({ dia: 'dom', janela: 'noite', faixa: '30-35', teto: 80 }, 'tem algo de MPB?');
  assert.doesNotMatch(sem.resposta, /MPB, então/);
  assert.match(sem.resposta, /MPB no domingo, só às 15h/);
});

test('"sem pop" e depois "funk também": o funk com pop volta', async () => {
  const [, sem, com] = await conversar({ ...SAB, teto: 50, estilos: ['house-disco'] }, 'sem pop', 'funk também');
  assert.ok(!ids(sem).includes('funk-ao-entardecer'));
  assert.ok(ids(com).includes('funk-ao-entardecer'));
});

test('abertura em curadoria: aponta a que enche antes e a que custa menos', () => {
  const op = (id, esquenta, preco) => ({ festa: { id, esquenta, preco }, patrocinada: false });
  assert.equal(conversa.abertura({ opcoes: [op('a', 19, 50), op('b', 21, 30), op('c', 22, 60)] }), 'A primeira enche antes. A segunda custa menos.');
  assert.equal(conversa.abertura({ opcoes: [op('a', 19, 0), op('b', 21, 30)] }), 'A primeira enche antes e é de graça.');
  assert.equal(conversa.abertura({ opcoes: [op('a', 19, 50), op('b', 19, 50)] }), '');
  assert.equal(conversa.abertura({ opcoes: [], aviso: 'x' }), 'x');
});

test('a próxima pista que abre, pelo relógio', () => {
  assert.match(proximaPista(BASE, new Date(2026, 10, 14, 17, 30)).linha, /^Sáb · 18h00 · /);
  assert.match(proximaPista(BASE, new Date(2026, 10, 10, 9)).linha, /^Sex · 17h00 · /);
  assert.match(proximaPista(BASE, new Date(2026, 10, 15, 23)).linha, /^Sex · /);
});

test('a data da festa no convite: o próximo dia da semana dela que ainda não acabou', () => {
  const groove = BASE.find((f) => f.id === 'sabado-groove');
  assert.equal(dataDaFesta(groove, new Date(2026, 10, 10, 12)).data, '2026-11-14');
  // No sábado às 23h ela ainda está rolando (acaba à 1h): é hoje.
  assert.equal(dataDaFesta(groove, new Date(2026, 10, 14, 23)).data, '2026-11-14');
  // No domingo às 2h já acabou: é o sábado seguinte.
  assert.equal(dataDaFesta(groove, new Date(2026, 10, 15, 2)).data, '2026-11-21');
});

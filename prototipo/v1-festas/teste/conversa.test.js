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
  // Só a base fictícia: dados/reais.json, quando existe, fica fora (reais: null).
  servidor = criarServidor({ varDir: pasta, log: mudo, reais: null, exemplos: true });
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
  assert.equal(r.resposta, 'Funk no domingo, só às 17h, com média 24.');
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

// ---------------------------------------------------------------- U28 (plano de 24/11/2026)
// A fala sobre listas de festas reais, direto em conversa.responder (sem o servidor).

const motor = require('../nucleo/motor');
const { entender } = require('../nucleo/entender');

function real(id, extra = {}) {
  return {
    id, nome: `Festa ${id}`, casa: `Casa ${id}`, bairro: 'pinheiros', regiao: 'oeste', dia: 'sab', data: '2026-11-28', dataDaNoite: '2026-11-28',
    inicio: 23, esquenta: null, fim: null, mediaIdade: null, faixas: [], preco: 40, estilos: ['house-disco'], selo: 'editorial',
    distanciaMin: null, idadeMinima: null, real: true, ...extra,
  };
}
const PEDIDO_REAL = motor.completar({ dia: 'sab', janela: 'noite', idade: { min: 28, max: 35 }, teto: 150, bairros: [], estilos: [] });
// A fala para um texto sobre uma lista de reais.
function falar(texto, festas, extra = {}) {
  const { mudar, pedidos, duvida } = entender(texto, { ...PEDIDO_REAL, agoraMs: Date.parse('2026-11-24T12:00:00-03:00'), comDistancia: false });
  const depois = motor.completar({ ...PEDIDO_REAL, ...motor.sanearCriterios(mudar) });
  const resultado = { ...motor.escolher(depois, festas), ...extra };
  return conversa.responder({ pedidos, antes: PEDIDO_REAL, depois, antesIds: festas.map((f) => f.id), resultado, nomeDe: (id) => id, duvida }).texto;
}

test('"tem com gente da minha idade?" com três reais sem média: nenhuma divulgou', () => {
  const tres = [real('a'), real('b', { inicio: 23.5 }), real('c', { inicio: 24 })];
  assert.match(falar('tem com gente da minha idade?', tres), /^Nenhuma delas divulgou a média de idade ainda\./);
  // Uma com média dentro e duas sem: separa os três grupos, sem dizer "não" a quem não divulgou.
  const mistas = [real('a', { mediaIdade: 31 }), real('b', { inicio: 23.5 }), real('c', { inicio: 24 })];
  assert.match(falar('tem com gente da minha idade?', mistas), /^Uma com média de 28 a 35; as outras duas não divulgaram a média\./);
  const tresGrupos = [real('a', { mediaIdade: 31 }), real('b', { inicio: 23.5, mediaIdade: 45 }), real('c', { inicio: 24 })];
  assert.match(falar('tem com gente da minha idade?', tresGrupos), /^Uma com média de 28 a 35, uma fora da sua faixa; a outra não divulgou a média\./);
});

test('a avaliação de quem foi diz o que a pergunta mede', () => {
  const av = real('av', { nome: 'Noite Exemplo', mediaIdade: 31, avaliacaoIdade: { avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 } });
  const fala = falar('da minha idade?', [av]);
  assert.match(fala, /Na Noite Exemplo, 4 de 5 que foram, de 29 a 34 anos, acharam o público da idade deles\./);
  assert.doesNotMatch(fala, /média de 31|média 31/);
});

test('"quanto custa?" lista os preços, e diz quem não divulgou', () => {
  const tres = [real('a', { preco: 40 }), real('b', { inicio: 23.5, preco: 60 }), real('c', { inicio: 24, preco: null })];
  assert.match(falar('quanto custa?', tres), /^A primeira custa R\$ 40; a segunda, R\$ 60; a terceira não divulgou o preço\./);
  assert.match(falar('quanto custa?', [real('a', { preco: 0 })]), /^É de graça\./);
});

test('"sem limite de idade" fala da idade mínima e não mexe no teto', () => {
  const festas = [real('a', { idadeMinima: 18 }), real('b', { inicio: 23.5 })];
  assert.match(falar('sem limite de idade?', festas), /^Festa a, só a partir de 18; a outra não diz\./);
  assert.match(falar('tem limite de idade?', [real('a')]), /^Ela não divulgou limite de idade\./);
});

test('bairro citado com reais filtra; "tem mais?" aponta para as outras do dia', () => {
  assert.match(falar('pinheiros', [real('a')]), /^Em Pinheiros, então\./);
  assert.match(falar('tem mais?', [real('a')], { maisDoDia: [{}, {}, {}, {}] }), /^Mais quatro no sábado, logo abaixo\./);
  assert.match(falar('tem mais?', [real('a')], { maisDoDia: [] }), /^Já mostrei todas que tenho no sábado\./);
});

test('o artigo de cada dia: "na quinta", "no sábado", "pra hoje"; a semana e a data', () => {
  assert.match(falar('quinta', [real('a', { dia: 'qui' })]), /^Quinta, então\./);
  assert.match(falar('sábado da semana que vem', [real('a')]), /^Sábado da semana que vem, então\./);
  assert.match(falar('dia 5', [real('a')]), /^Sábado da semana que vem, então\./);
  assert.match(falar('semana que vem', [real('a')]), /^No sábado da semana que vem, então\./);
  assert.match(falar('dia 1', [real('a')]), /^Eu só olho hoje e de quinta a domingo/);
  // A dúvida sobre o dia pergunta com o artigo dele.
  const r = conversa.responder({ pedidos: [], antes: PEDIDO_REAL, depois: PEDIDO_REAL, antesIds: [], resultado: { opcoes: [] }, nomeDe: (id) => id, duvida: { dia: 'qui' } });
  assert.equal(r.texto, 'Muda pra quinta?');
  const h = conversa.responder({ pedidos: [], antes: PEDIDO_REAL, depois: PEDIDO_REAL, antesIds: [], resultado: { opcoes: [] }, nomeDe: (id) => id, duvida: { dia: 'hoje' } });
  assert.equal(h.texto, 'Muda pra hoje?');
});

test('"perto de" sem supor três festas: duas na tela, as duas perto', () => {
  const duas = [
    real('a', { local: { lat: -23.5611, lng: -46.6825, precisao: 'rua' } }),
    real('b', { inicio: 23.5, local: { lat: -23.5669, lng: -46.6931, precisao: 'casa' } }),
  ];
  const depois = motor.completar({ ...PEDIDO_REAL, perto: 'pinheiros' });
  const resultado = motor.escolher(depois, duas);
  const r = conversa.responder({ pedidos: ['perto'], antes: PEDIDO_REAL, depois, antesIds: ['a', 'b'], resultado, nomeDe: (id) => id });
  assert.match(r.texto, /^As duas ficam a até 1,3 km de Pinheiros\./);
});

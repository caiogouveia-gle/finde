'use strict';
// A lista e o recorte (U26 do plano de 24/11/2026): "hoje" e quinta a
// domingo, "esta" semana ou a "proxima", até 3 reais recomendadas e as outras
// do dia em maisDoDia, fictícias só quando o dia não tem real, sem %.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../nucleo/lista');
const C = require('../nucleo/catalogo');
const { prepararBase, lerLinhas } = require('../nucleo/base');

const FICTICIAS = prepararBase(lerLinhas(require(path.join(__dirname, '..', 'dados', 'festas.json')))).base;
const RESPOSTA = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', 'resposta-festas-r14-3.json'), 'utf8'));

// Os relógios: terça 24/11, terça 01/12, sexta 27/11 e segunda 30/11, ao meio-dia.
const em = (data, hora = '12:00') => Date.parse(`${data}T${hora}:00-03:00`);
const TERCA = em('2026-11-24');
const TERCA_SEGUINTE = em('2026-12-01');
const SEXTA = em('2026-11-27');
const SEGUNDA = em('2026-11-30');

// Festa real no formato do conversor (nucleo/reais.js, /3), com dados fictícios.
function real(id, data, extra = {}) {
  return {
    id, nome: `Festa ${id}`, produtora: null, casa: `Casa ${id}`, bairro: 'pinheiros', regiao: 'oeste',
    dia: L.idDoDia(data), diaDaSemana: L.idDoDia(data), data, dataDaNoite: data,
    inicio: 23, horarioIncerto: false, esquenta: null, fim: 29, mediaIdade: null, origemIdade: null, origemIdadeCurta: null,
    faixas: [], preco: 40, esgotado: false, estilos: ['house-disco'], estilosInferidos: false, frase: null, selo: 'editorial',
    distanciaMin: null, endereco: null, local: null, lotes: null, entradaNaPorta: null, linkCompra: 'https://ingressos.example/x',
    real: true, exemplo: false, ...extra,
  };
}

const PEDIDO = { janela: 'noite', idade: { min: 28, max: 35 }, teto: 150 };
const pedido = (extra = {}) => ({ ...PEDIDO, ...extra });

// ---------------------------------------------------------------- as datas

test('datas: "esta" semana vai de quinta a domingo que vêm; "proxima", a seguinte', () => {
  // Terça 24/11: esta é 26–29/11; a próxima é 03–06/12.
  assert.deepEqual(['qui', 'sex', 'sab', 'dom'].map((d) => L.datasDoPedido(d, 'esta', TERCA)[0]), ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.deepEqual(['qui', 'sex', 'sab', 'dom'].map((d) => L.datasDoPedido(d, 'proxima', TERCA)[0]), ['2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
  // Com o relógio em 24/11, a próxima alcança a sexta 04/12 e o sábado 05/12
  // (a apresentação de 30/11 mostra a semana de 03–06/12).
  const f = real('sabado-dia-5', '2026-12-05');
  assert.deepEqual(L.reaisDoPedido([f], { dia: 'sab', semana: 'proxima' }, TERCA).festas.map((x) => x.id), ['sabado-dia-5']);
  assert.deepEqual(L.reaisDoPedido([f], { dia: 'sab', semana: 'esta' }, TERCA).festas, []);
  // Com o relógio em 01/12, a próxima alcança a quinta 10/12 e a sexta 11/12
  // (a apresentação de 07/12 mostra a semana de 10–13/12).
  assert.equal(L.datasDoPedido('qui', 'proxima', TERCA_SEGUINTE)[0], '2026-12-10');
  assert.equal(L.datasDoPedido('sex', 'proxima', TERCA_SEGUINTE)[0], '2026-12-11');
  // Na segunda, "esta" é a semana que começa nela.
  assert.equal(L.datasDoPedido('qui', 'esta', SEGUNDA)[0], '2026-12-03');
});

test('numa sexta, "esta" não oferece a quinta que passou, e o dia de hoje vira "Hoje, sexta" sem repetir', () => {
  assert.deepEqual(L.datasDoPedido('qui', 'esta', SEXTA), []);
  assert.deepEqual(L.datasDoPedido('sex', 'esta', SEXTA), ['2026-11-27']);
  assert.deepEqual(L.datasDoPedido('hoje', 'esta', SEXTA), ['2026-11-27']);
  const festas = [real('a', '2026-11-27'), real('b', '2026-11-27'), real('c', '2026-11-28')];
  const opcoes = L.opcoesDeDia(festas, SEXTA, 'esta');
  assert.deepEqual(opcoes.map((o) => o.id), ['sex', 'sab', 'dom']);
  assert.deepEqual(opcoes.map((o) => o.rotulo), ['Hoje, sexta', 'Sábado, 28 nov', 'Domingo, 29 nov']);
  assert.deepEqual(opcoes.map((o) => o.reais), [2, 1, 0]);
  assert.equal(opcoes.filter((o) => o.hoje).length, 1);
  // A próxima semana não tem "hoje".
  assert.deepEqual(L.opcoesDeDia(festas, SEXTA, 'proxima').map((o) => o.data), ['2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
});

test('"Hoje" de segunda a quarta: com real vem primeiro; com zero, vai para o fim', () => {
  const comReal = L.opcoesDeDia([real('segunda', '2026-11-30')], SEGUNDA, 'esta');
  assert.deepEqual(comReal.map((o) => o.id), ['hoje', 'qui', 'sex', 'sab', 'dom']);
  assert.equal(comReal[0].rotulo, 'Hoje');
  assert.equal(comReal[0].reais, 1);
  const semReal = L.opcoesDeDia([], SEGUNDA, 'esta');
  assert.deepEqual(semReal.map((o) => o.id), ['qui', 'sex', 'sab', 'dom', 'hoje']);
  assert.equal(semReal[1].rotulo, 'Sexta, 4 dez');
});

test('"hoje" numa segunda pega as festas da segunda, e só elas', () => {
  const festas = [real('segunda', '2026-11-30', { inicio: 21 }), real('sexta', '2026-12-04')];
  assert.deepEqual(L.reaisDoPedido(festas, { dia: 'hoje' }, SEGUNDA).festas.map((f) => f.id), ['segunda']);
  const r = L.resultadoDoPedido({ reais: festas, ficticias: FICTICIAS, criterios: pedido({ dia: 'hoje' }), agoraMs: SEGUNDA });
  assert.deepEqual(r.opcoes.map((o) => o.festa.id), ['segunda']);
  assert.equal(r.opcoes[0].festa.dia, 'seg');
  assert.deepEqual(r.exemplos, []);
  assert.equal(r.nota, 'Uma festa pra hoje.');
  // Sem real hoje (segunda), nenhuma fictícia de sexta a domingo entra no lugar.
  const vazio = L.resultadoDoPedido({ reais: [], ficticias: FICTICIAS, criterios: pedido({ dia: 'hoje' }), agoraMs: SEGUNDA });
  assert.deepEqual(vazio.exemplos, []);
  assert.equal(vazio.nota, 'Ainda não tenho festa hoje.');
});

test('festa três semanas à frente não aparece em "esta" nem em "proxima"', () => {
  const longe = real('longe', '2026-12-12');
  for (const semana of ['esta', 'proxima']) {
    assert.deepEqual(L.reaisDoPedido([longe], { dia: 'sab', semana }, TERCA).festas, [], semana);
    const r = L.resultadoDoPedido({ reais: [longe], ficticias: FICTICIAS, criterios: pedido({ dia: 'sab', semana }), agoraMs: TERCA });
    assert.equal(r.opcoes.length + r.maisDoDia.length, 0, semana);
  }
});

test('verif-app-4: "dia 27" à 0h30 de sábado 28/11 é a sexta 27, a noite que a primeira aba chama de Hoje', () => {
  const SAB_0030 = Date.parse('2026-11-28T00:30:00-03:00');
  assert.equal(L.dataDoDiaDoMes(27, SAB_0030), '2026-11-27');
  assert.equal(L.dataDoDiaDoMes(27, Date.parse('2026-11-28T05:59:00-03:00')), '2026-11-27');
  assert.equal(L.dataDoDiaDoMes(27, Date.parse('2026-11-28T06:00:00-03:00')), '2026-12-27');
  const E = require('../nucleo/entender');
  const r = E.entender('e no dia 27?', { agoraMs: SAB_0030 });
  assert.ok(!(r.pedidos || []).includes('data-fora'), JSON.stringify(r));
});

test('"dia 5" em 24/11 é o sábado 05/12, da semana que vem; dia de semana fora do recorte é null', () => {
  assert.equal(L.dataDoDiaDoMes(5, TERCA), '2026-12-05');
  assert.equal(L.dataDoDiaDoMes(28, TERCA), '2026-11-28');
  assert.equal(L.dataDoDiaDoMes(31, TERCA), '2026-12-31');
  assert.deepEqual(L.pedidoDaData('2026-12-05', TERCA), { dia: 'sab', semana: 'proxima' });
  assert.deepEqual(L.pedidoDaData('2026-11-26', TERCA), { dia: 'qui', semana: 'esta' });
  assert.deepEqual(L.pedidoDaData('2026-11-24', TERCA), { dia: 'hoje', semana: 'esta' });
  assert.equal(L.pedidoDaData('2026-12-01', TERCA), null); // uma terça
  assert.equal(L.pedidoDaData('2026-12-12', TERCA), null); // três semanas
});

// ---------------------------------------------------------------- a lista

test('AE6: sexta com 4 reais e pedido das 22h dá as 3 melhores em cima, 1 em "ver todas" e nenhuma fictícia', () => {
  const festas = ['a', 'b', 'c', 'd'].map((id, i) => real(`sexta-${id}`, '2026-11-27', { inicio: 22 + i * 0.5 }));
  const r = L.resultadoDoPedido({ reais: festas, ficticias: FICTICIAS, criterios: pedido({ dia: 'sex' }), agoraMs: TERCA });
  assert.equal(r.opcoes.length, 3);
  assert.equal(r.maisDoDia.length, 1);
  assert.deepEqual(r.exemplos, []);
  assert.equal(r.reais, 4);
  assert.ok([...r.opcoes, ...r.maisDoDia].every((o) => o.exemplo === false && o.festa.real === true));
  assert.ok(r.opcoes.every((o) => typeof o.pct === 'number'));
  // Nenhuma % em exemplo: não há exemplo nenhum na tela.
  assert.doesNotMatch(JSON.stringify(r.exemplos), /pct/);
  assert.equal(r.nota, 'Quatro festas pra sua sexta.');
  // O resto da semana: quinta (já com data), sábado e domingo.
  assert.deepEqual(r.outrosDias, [
    { dia: 'qui', data: '2026-11-26', reais: 0 },
    { dia: 'sab', data: '2026-11-28', reais: 0 },
    { dia: 'dom', data: '2026-11-29', reais: 0 },
  ]);
});

test('dia sem real: só exemplos, marcados, sem pct e sem cara, e a nota diz isso', () => {
  const sexta = real('so-na-sexta', '2026-11-27');
  const r = L.resultadoDoPedido({ reais: [sexta], ficticias: FICTICIAS, criterios: pedido({ dia: 'dom', teto: 'sem-limite' }), agoraMs: TERCA });
  assert.deepEqual(r.opcoes, []);
  assert.deepEqual(r.maisDoDia, []);
  assert.ok(r.exemplos.length > 0);
  for (const o of r.exemplos) {
    assert.equal(o.exemplo, true);
    assert.equal('pct' in o, false);
    assert.equal('cara' in o, false);
    assert.equal(o.festa.dia, 'dom');
    assert.equal(o.data, '2026-11-29');
  }
  assert.equal(r.nota, 'Ainda não tenho festa real no domingo. Seguem exemplos, festas fictícias.');
  assert.equal(r.semMedia, true);
  assert.deepEqual(r.outrosDias.find((d) => d.dia === 'sex'), { dia: 'sex', data: '2026-11-27', reais: 1 });
});

test('esgotada fica fora das 3 e vai, marcada, para o fim de "ver todas"', () => {
  const festas = [
    real('esgotada', '2026-11-28', { esgotado: true, inicio: 22 }),
    real('b', '2026-11-28', { inicio: 23 }),
    real('c', '2026-11-28', { inicio: 23.5 }),
    real('d', '2026-11-28', { inicio: 24 }),
    real('e', '2026-11-28', { inicio: 24 }),
  ];
  const r = L.resultadoDoPedido({ reais: festas, ficticias: FICTICIAS, criterios: pedido({ dia: 'sab' }), agoraMs: TERCA });
  assert.equal(r.opcoes.length, 3);
  assert.ok(r.opcoes.every((o) => o.festa.id !== 'esgotada' && !o.esgotada));
  assert.equal(r.maisDoDia[r.maisDoDia.length - 1].festa.id, 'esgotada');
  assert.equal(r.maisDoDia[r.maisDoDia.length - 1].esgotada, true);
  assert.equal(r.maisDoDia.length, 2);
  // Esgotada que o motor tenha devolvido também desce.
  const m = L.montarResultado({ real: { opcoes: [{ festa: festas[0], atende: true }, { festa: festas[1], atende: true }] }, criterios: { dia: 'sab' } });
  assert.deepEqual(m.opcoes.map((o) => o.festa.id), ['b']);
  assert.deepEqual(m.maisDoDia.map((o) => [o.festa.id, o.esgotada]), [['esgotada', true]]);
});

test('a recusa de propósito vale até em "ver todas"; a real que não cabe nunca some', () => {
  const festas = [
    real('cabe', '2026-11-28', { inicio: 23 }),
    real('funk', '2026-11-28', { inicio: 23, estilos: ['funk'] }),
    real('cedo', '2026-11-28', { inicio: 16, fim: 20 }),
    real('cara', '2026-11-28', { inicio: 23, preco: 400 }),
  ];
  const r = L.resultadoDoPedido({ reais: festas, ficticias: FICTICIAS, criterios: pedido({ dia: 'sab', teto: 80, evitarEstilos: ['funk'] }), agoraMs: TERCA });
  const ids = [...r.opcoes, ...r.maisDoDia].map((o) => o.festa.id);
  assert.ok(!ids.includes('funk'));
  assert.deepEqual([...ids].sort(), ['cabe', 'cara', 'cedo']);
  assert.equal(r.opcoes[0].festa.id, 'cabe');
  // A que não cabe diz o que fura.
  const cedo = [...r.opcoes, ...r.maisDoDia].find((o) => o.festa.id === 'cedo');
  assert.ok(cedo.aviso && /antes do seu horário/.test(cedo.aviso), cedo.aviso);
});

test('nada cabe, mas o dia tem real: a lista diz que elas estão logo abaixo, e nenhuma fictícia entra', () => {
  const festas = [real('tarde', '2026-11-28', { inicio: 14, fim: 18 }), real('tarde-2', '2026-11-28', { inicio: 15, fim: 19 })];
  const r = L.resultadoDoPedido({ reais: festas, ficticias: FICTICIAS, criterios: pedido({ dia: 'sab', firmes: ['horario'] }), agoraMs: TERCA });
  assert.deepEqual(r.opcoes, []);
  assert.equal(r.maisDoDia.length, 2);
  assert.deepEqual(r.exemplos, []);
  assert.equal(r.aviso, 'Nada cabe nesse pedido. Seguem as 2 festas no sábado, cada uma com o que falta.');
  const uma = L.resultadoDoPedido({ reais: festas.slice(0, 1), ficticias: FICTICIAS, criterios: pedido({ dia: 'sab', firmes: ['horario'] }), agoraMs: TERCA });
  assert.equal(uma.aviso, 'Nada cabe nesse pedido. Segue a festa no sábado, com o que falta.');
});

test('semMedia: nenhuma real da resposta com média; com avaliação de quem foi, já tem', () => {
  const sem = L.resultadoDoPedido({ reais: [real('a', '2026-11-28'), real('b', '2026-11-28')], criterios: pedido({ dia: 'sab' }), agoraMs: TERCA });
  assert.equal(sem.semMedia, true);
  assert.equal(sem.nota, 'Duas festas pro seu sábado.');
  const av = { avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 };
  const com = L.resultadoDoPedido({ reais: [real('a', '2026-11-28'), real('b', '2026-11-28', { mediaIdade: 31, avaliacaoIdade: av })], criterios: pedido({ dia: 'sab' }), agoraMs: TERCA });
  assert.equal(com.semMedia, false);
});

test('a saída tem a forma de resposta-festas-r14-3.json (comReais e semReais)', () => {
  const chaves = ['opcoes', 'maisDoDia', 'outrosDias', 'exemplos', 'aviso', 'nota', 'base', 'semMedia'];
  const base = RESPOSTA.comReais.base;
  const festas = ['a', 'b', 'c', 'd'].map((id) => real(`sab-${id}`, '2026-12-05', { local: { lat: -23.5667, lng: -46.6934, precisao: 'rua', origemGeo: 'pagina', lugar: null, atribuicaoOsm: false } }));
  const c = pedido({ dia: 'sab', semana: 'proxima', bairros: ['pinheiros'] });
  const r = L.resultadoDoPedido({ reais: festas, ficticias: FICTICIAS, criterios: c, agoraMs: TERCA, base });
  const m = L.montarResultado({ real: { opcoes: r.opcoes }, maisDoDia: r.maisDoDia, outrosDias: r.outrosDias, criterios: c, base });
  assert.deepEqual(Object.keys(m).sort(), [...chaves].sort());
  for (const k of chaves) assert.ok(k in r, k);
  assert.deepEqual(r.base, base);
  // Cada opção real tem as chaves da opção da fixture.
  const daFixture = Object.keys(RESPOSTA.comReais.opcoes[0]);
  for (const o of [...r.opcoes, ...r.maisDoDia]) {
    for (const k of daFixture) assert.ok(k in o, k);
    assert.deepEqual(Object.keys(o.porque).sort(), ['cabe', 'falta']);
    for (const x of [...o.porque.cabe, ...o.porque.falta]) assert.deepEqual(Object.keys(x).sort(), ['criterio', 'valor']);
    assert.equal(typeof o.distanciaKm, 'number');
    assert.ok(o.distanciaKm < 1, String(o.distanciaKm));
  }
  for (const o of r.outrosDias) assert.deepEqual(Object.keys(o).sort(), Object.keys(RESPOSTA.comReais.outrosDias[0]).sort());
  // Sem real: a fictícia tem as chaves da fixture, sem pct nem cara.
  const s = L.resultadoDoPedido({ reais: [], ficticias: FICTICIAS, criterios: pedido({ dia: 'sab' }), agoraMs: TERCA, base });
  const exemploDaFixture = Object.keys(RESPOSTA.semReais.exemplos[0]);
  for (const o of s.exemplos) {
    for (const k of exemploDaFixture) assert.ok(k in o, k);
    assert.equal('pct' in o, false);
  }
});

test('o título começa pelo que existe e tem o artigo do dia', () => {
  assert.equal(L.notaDoResultado({ reais: 2, cabem: 2, exemplos: 0, dia: 'sab' }), 'Duas festas pro seu sábado.');
  assert.equal(L.notaDoResultado({ reais: 1, cabem: 1, exemplos: 0, dia: 'qui' }), 'Uma festa pra sua quinta.');
  assert.equal(L.notaDoResultado({ reais: 12, cabem: 3, exemplos: 0, dia: 'sex' }), '12 festas pra sua sexta.');
  assert.equal(L.notaDoResultado({ reais: 3, cabem: 0, exemplos: 0, dia: 'dom' }), 'Três festas pro seu domingo. Nenhuma cabe inteira no pedido: cada uma diz o que falta.');
  assert.equal(L.notaDoResultado({ reais: 0, cabem: 0, exemplos: 2, dia: 'qui' }), 'Ainda não tenho festa real na quinta. Seguem exemplos, festas fictícias.');
  // A nota antiga da mistura também usa o artigo de cada dia.
  assert.equal(L.notaDaMistura({ reais: 0, exemplos: 2, dia: 'qui' }), 'Ainda não tenho festa real na quinta. Seguem exemplos, festas fictícias.');
  assert.equal(C.noDia('hoje'), 'hoje');
});

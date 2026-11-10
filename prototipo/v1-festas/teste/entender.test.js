'use strict';
// entender: frases reais de ajuste, do jeito que se escreve no celular,
// incluindo as da revisão de 10/11 (negação depois do termo, pedido composto,
// frase longa, indiferença, hora de 12 h).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entender } = require('../nucleo/entender');
const conversa = require('../nucleo/conversa');

const atuais = {
  dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80,
  estilos: ['house-disco'], evitarEstilos: [], perto: null, evitar: [],
  mostradas: ['sabado-groove', 'noite-pop-2000', 'noite-aurora'],
  estilosMostrados: ['house-disco', 'pop-2000', 'house-disco'],
  precosMostrados: [60, 70, 80],
};

const casos = [
  // ajustes simples
  ['tem alguma mais perto de Pinheiros?', { perto: 'pinheiros' }, ['perto']],
  ['mais barato', { teto: 50 }, ['mais-barato']],
  ['algo mais em conta?', { teto: 50 }, ['mais-barato']],
  ['mai barto', { teto: 50 }, ['mais-barato']],
  ['mais cedo', { janela: 'fim-de-tarde' }, ['mais-cedo']],
  ['de graça', { teto: 0 }, ['gratis']],
  ['até 60 reais', { teto: 60 }, ['teto']],
  ['até 2000', { teto: 'sem-limite' }, ['teto']],
  ['pode ser mais caro', { teto: 150 }, ['mais-caro']],
  ['tanto faz o preço', { teto: 'sem-limite' }, ['sem-limite']],
  ['tem de samba?', { estilos: ['mpb-samba'] }, ['estilo']],
  ['bora num pagodinho', { estilos: ['mpb-samba'] }, ['estilo']],
  ['funk também', { estilos: ['house-disco', 'funk'] }, ['estilo']],
  ['gente mais velha', { faixa: '36+' }, ['mais-velho']],
  ['público de 25 a 29', { faixa: '25-29' }, ['faixa']],
  ['na faixa dos 30', { faixa: '30-35' }, ['faixa']],
  ['perto da Paulista', { perto: 'paulista' }, ['perto']],
  ['outro estilo', { estilos: ['mpb-samba', 'funk', 'indie-rock', 'eletronica'], evitar: ['sabado-groove', 'noite-pop-2000', 'noite-aurora'] }, ['outro-estilo']],
  ['mostra outras', { evitar: ['sabado-groove', 'noite-pop-2000', 'noite-aurora'] }, ['outras']],
  // dia, só com intenção
  ['domingo', { dia: 'dom' }, ['dia']],
  ['e na sexta?', { dia: 'sex' }, ['dia']],
  ['pode ser domingo', { dia: 'dom' }, ['dia']],
  ['sábado, fim de tarde, até 50', { dia: 'sab', janela: 'fim-de-tarde', teto: 50 }, ['dia', 'janela', 'teto']],
  // negação, antes e depois do termo
  ['sem funk', { evitarEstilos: ['funk'], estilos: ['house-disco'] }, ['sem-estilo']],
  ['funk não', { evitarEstilos: ['funk'], estilos: ['house-disco'] }, ['sem-estilo']],
  ['menos funk', { evitarEstilos: ['funk'], estilos: ['house-disco'] }, ['sem-estilo']],
  ['nada de eletrônica nem funk', { evitarEstilos: ['eletronica', 'funk'], estilos: ['house-disco'] }, ['sem-estilo']],
  ['sábado não', { dia: 'sab' === atuais.dia ? 'dom' : undefined }, ['sem-dia']],
  ['sexta não', {}, ['sem-dia']],
  ['Pinheiros não', { evitarBairros: ['pinheiros'] }, ['sem-bairro']],
  ['longe da augusta', { evitarBairros: ['bela-vista'] }, ['sem-bairro']],
  ['nada em Pinheiros', { evitarBairros: ['pinheiros'] }, ['sem-bairro']],
  ['nada de rooftop', { evitarCasas: ['rooftop'] }, ['sem-casa']],
  ['sem terraço', { evitarCasas: ['terraco'] }, ['sem-casa']],
  // composto
  ['quero house mas sem pagar mais de 50 e perto da vila madalena', { teto: 50, estilos: ['house-disco'], perto: 'vila-madalena' }, ['teto', 'estilo', 'perto']],
  ['tem algo na Vila Madalena com house?', { estilos: ['house-disco'], perto: 'vila-madalena' }, ['estilo', 'perto']],
  // horário
  ['quero chegar às 22h', { janela: 'noite' }, ['janela']],
  ['chegar às 10 da noite', { janela: 'noite' }, ['janela']],
  ['começa às 9', { janela: 'comeco-da-noite' }, ['janela']],
  ['depois das 22h', { janela: 'noite' }, ['janela']],
  ['depois do jantar', { janela: 'noite' }, ['janela']],
  ['que acabe até as 23h', { voltaMax: 23 }, ['fim']],
  ['que acabe até meia noite', { voltaMax: 24 }, ['fim']],
  ['volto antes da 1h', { voltaMax: 25 }, ['fim']],
  ['quero voltar cedo, acordo às 8', { voltaMax: 24 }, ['fim']],
  ['dormir cedo', { voltaMax: 24 }, ['fim']],
  // perguntas e indiferença
  ['tem com gente da minha idade?', {}, ['minha-idade']],
  ['tanto faz', {}, ['surpresa']],
  ['qualquer coisa', {}, ['surpresa']],
  ['me surpreende', {}, ['surpresa']],
  ['algo mais tranquilo', {}, ['fora-do-alcance']],
  ['isso é seguro?', {}, ['fora-seguranca']],
  ['perto do metrô', {}, ['fora-transporte']],
  ['quero dançar até amanhecer mas voltar cedo', {}, ['contradicao-volta']],
  ['quero mais cedo e mais tarde', {}, ['contradicao-hora']],
  ['mais barato e mais perto', { teto: 50 }, ['mais-barato', 'perto-sem-lugar']],
  ['sim', {}, ['aceitar']],
];

for (const [frase, mudar, pedidos] of casos) {
  test(`entende "${frase}"`, () => {
    const r = entender(frase, atuais);
    const esperado = Object.fromEntries(Object.entries(mudar).filter(([, v]) => v !== undefined));
    assert.deepEqual(r.mudar, esperado);
    assert.deepEqual(r.pedidos, pedidos);
  });
}

test('negação nunca inverte: "funk não" não pede funk, "Pinheiros não" não vira perto, "sexta não" não vai pra sexta', () => {
  assert.ok(!(entender('funk não', atuais).mudar.estilos || []).includes('funk'));
  assert.notEqual(entender('Pinheiros não', atuais).mudar.perto, 'pinheiros');
  assert.notEqual(entender('sexta não', atuais).mudar.dia, 'sex');
  assert.notEqual(entender('nada de sexta', { ...atuais, dia: 'sex' }).mudar.dia, 'sex');
  assert.equal(entender('sexta não', { ...atuais, dia: 'sex' }).mudar.dia, 'sab');
});

test('frase longa não troca o dia por palavra solta, e lê chegada, volta, idade e som juntos', () => {
  const longa = 'então, a gente é um grupo de umas 6 pessoas, todo mundo na faixa dos 30, queremos chegar umas 20h, dançar um pouco de música brasileira e estar em casa antes da 1h porque domingo tem almoço de família';
  const r = entender(longa, atuais);
  assert.equal(r.mudar.dia, undefined);
  assert.deepEqual(r.duvida, { dia: 'dom' });
  assert.equal(r.mudar.janela, 'comeco-da-noite');
  assert.equal(r.mudar.voltaMax, 25);
  assert.deepEqual(r.mudar.estilos, ['mpb-samba']);
  const almoco = entender('domingo tem almoço', atuais);
  assert.deepEqual(almoco, { mudar: {}, pedidos: [], duvida: { dia: 'dom' } });
});

test('"mais perto" sem dizer de onde pede o bairro', () => {
  assert.deepEqual(entender('mais perto', atuais), { mudar: {}, pedidos: ['perto-sem-lugar'] });
});

test('o que não entende não muda nada', () => {
  assert.deepEqual(entender('blablabla', atuais), { mudar: {}, pedidos: [] });
  assert.deepEqual(entender('', atuais), { mudar: {}, pedidos: [] });
  assert.deepEqual(entender(null, atuais), { mudar: {}, pedidos: [] });
});

test('nos limites: "mais cedo" no fim de tarde e "mais barato" no grátis ficam onde estão', () => {
  assert.deepEqual(entender('mais cedo', { ...atuais, janela: 'fim-de-tarde' }).mudar, { janela: 'fim-de-tarde' });
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 0 }).mudar, { teto: 0 });
});

test('"mais barato" parte do mais caro da tela e nunca sobe o teto', () => {
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 50, precosMostrados: [50, 40, 35] }).mudar, { teto: 30 });
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 150, precosMostrados: [60, 70] }).mudar, { teto: 50 });
  for (const teto of [20, 30, 50, 80, 150]) {
    assert.ok(entender('mais barato', { ...atuais, teto, precosMostrados: [teto] }).mudar.teto < teto);
  }
});

test('"na faixa" sozinho não é grátis; "até as 23h" não é preço; "até 2000" não é pop', () => {
  assert.deepEqual(entender('tô na faixa', atuais), { mudar: {}, pedidos: [] });
  assert.equal(entender('até as 23h', atuais).mudar.teto, undefined);
  assert.equal(entender('até 2000', atuais).mudar.estilos, undefined);
});

test('pedido explícito na conversa vira dimensão firme, só quando muda algo', () => {
  const antes = { teto: 80, janela: 'fim-de-tarde', faixa: '30-35', voltaMax: null, firmes: [] };
  assert.deepEqual(conversa.firmesDe(antes, { ...antes, teto: 50 }), ['preco']);
  assert.deepEqual(conversa.firmesDe({ ...antes, firmes: ['preco'] }, { ...antes, voltaMax: 23 }), ['preco', 'horario']);
  assert.deepEqual(conversa.firmesDe(antes, { ...antes }), []);
});

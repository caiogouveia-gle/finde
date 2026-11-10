'use strict';
// entender: frases reais de ajuste, do jeito que se escreve no celular.
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
  ['tem alguma mais perto de Pinheiros?', { perto: 'pinheiros' }, ['perto']],
  ['mais barato', { teto: 50 }, ['mais-barato']],
  ['algo mais em conta?', { teto: 50 }, ['mais-barato']],
  ['na faixa dos 30', { faixa: '30-35' }, ['faixa']],
  ['até 2000', { teto: 'sem-limite' }, ['teto']],
  ['que acabe até meia noite', { fimMax: 24 }, ['fim']],
  ['volto antes da 1h', { fimMax: 25 }, ['fim']],
  ['mais barato e mais perto', { teto: 50 }, ['mais-barato', 'perto-sem-lugar']],
  ['funk também', { estilos: ['house-disco', 'funk'] }, ['estilo']],
  ['algo mais tranquilo', {}, ['fora-do-alcance']],
  ['nada de rooftop', {}, ['fora-do-alcance']],
  ['sim', {}, ['aceitar']],
  ['mais cedo', { janela: 'fim-de-tarde' }, ['mais-cedo']],
  ['quero voltar cedo, acordo às 8', { fimMax: 24 }, ['fim']],
  ['dormir cedo', { fimMax: 24 }, ['fim']],
  ['sem funk', { evitarEstilos: ['funk'], estilos: ['house-disco'] }, ['sem-estilo']],
  ['nada de eletrônica nem funk', { evitarEstilos: ['eletronica', 'funk'], estilos: ['house-disco'] }, ['sem-estilo']],
  ['outro estilo', { estilos: ['mpb-samba', 'funk', 'indie-rock', 'eletronica'], evitar: ['sabado-groove', 'noite-pop-2000', 'noite-aurora'] }, ['outro-estilo']],
  ['domingo', { dia: 'dom' }, ['dia']],
  ['e na sexta?', { dia: 'sex' }, ['dia']],
  ['até 60 reais', { teto: 60 }, ['teto']],
  ['de graça', { teto: 0 }, ['gratis']],
  ['tem de samba?', { estilos: ['mpb-samba'] }, ['estilo']],
  ['gente mais velha', { faixa: '36+' }, ['mais-velho']],
  ['público de 25 a 29', { faixa: '25-29' }, ['faixa']],
  ['perto da Paulista', { perto: 'paulista' }, ['perto']],
  ['algo no Alto de Pinheiros', { perto: 'alto-de-pinheiros' }, ['perto']],
  ['quero chegar às 22h', { janela: 'noite' }, ['janela']],
  ['que acabe até as 23h', { fimMax: 23 }, ['fim']],
  ['pode ser mais caro', { teto: 150 }, ['mais-caro']],
  ['tanto faz o preço', { teto: 'sem-limite' }, ['sem-limite']],
  ['tem algo na Vila Madalena com house?', { estilos: ['house-disco'], perto: 'vila-madalena' }, ['estilo', 'perto']],
  ['sábado, fim de tarde, até 50', { dia: 'sab', janela: 'fim-de-tarde', teto: 50 }, ['dia', 'janela', 'teto']],
  ['mostra outras', { evitar: ['sabado-groove', 'noite-pop-2000', 'noite-aurora'] }, ['outras']],
];

for (const [frase, mudar, pedidos] of casos) {
  test(`entende "${frase}"`, () => {
    const r = entender(frase, atuais);
    assert.deepEqual(r.mudar, mudar);
    assert.deepEqual(r.pedidos, pedidos);
  });
}

test('"mais perto" sem dizer de onde pede o bairro', () => {
  const r = entender('mais perto', atuais);
  assert.deepEqual(r, { mudar: {}, pedidos: ['perto-sem-lugar'] });
});

test('o que não entende não muda nada', () => {
  assert.deepEqual(entender('blablabla', atuais), { mudar: {}, pedidos: [] });
  assert.deepEqual(entender('', atuais), { mudar: {}, pedidos: [] });
  assert.deepEqual(entender(null, atuais), { mudar: {}, pedidos: [] });
});

test('nos limites: "mais cedo" no fim de tarde e "mais barato" no grátis ficam onde estão', () => {
  assert.deepEqual(entender('mais cedo', { ...atuais, janela: 'fim-de-tarde' }).mudar, { janela: 'fim-de-tarde' });
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 0 }).mudar, { teto: 0 });
  assert.deepEqual(entender('mais tarde', { ...atuais, janela: 'noite' }).mudar, { janela: 'noite' });
});

test('"até as 23h" é horário, não preço', () => {
  const r = entender('até as 23h', atuais);
  assert.equal(r.mudar.teto, undefined);
});

test('"mais barato" parte do mais caro da tela e nunca sobe o teto', () => {
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 50, precosMostrados: [50, 40, 35] }).mudar, { teto: 30 });
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 150, precosMostrados: [60, 70] }).mudar, { teto: 50 });
  assert.deepEqual(entender('mais barato', { ...atuais, teto: 'sem-limite', precosMostrados: [120] }).mudar, { teto: 80 });
  for (const teto of [20, 30, 50, 80, 150]) {
    const novo = entender('mais barato', { ...atuais, teto, precosMostrados: [teto] }).mudar.teto;
    assert.ok(novo < teto, `${teto} -> ${novo}`);
  }
});

test('"na faixa" sozinho não é grátis', () => {
  assert.deepEqual(entender('tô na faixa', atuais), { mudar: {}, pedidos: [] });
});

test('"até 2000" não vira pop 2000', () => {
  assert.equal(entender('até 2000', atuais).mudar.estilos, undefined);
});

test('pedido explícito na conversa vira dimensão firme, só quando muda algo', () => {
  const antes = { teto: 80, janela: 'fim-de-tarde', faixa: '30-35', fimMax: null, firmes: [] };
  assert.deepEqual(conversa.firmesDe(antes, { ...antes, teto: 50 }), ['preco']);
  assert.deepEqual(conversa.firmesDe({ ...antes, firmes: ['preco'] }, { ...antes, fimMax: 23 }), ['preco', 'horario']);
  // "mais cedo" no fim de tarde não muda nada: não fica firme.
  assert.deepEqual(conversa.firmesDe(antes, { ...antes }), []);
});

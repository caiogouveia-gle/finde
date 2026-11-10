'use strict';
// Os campos do registro finde-r14/1 (motor/nucleo/contrato.js) na base
// fictícia: validação campo a campo, o que segue para a API e o relógio da
// base fictícia.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { prepararBase, lerBase, deslocarDatas } = require('../nucleo/base');

const bruto = require(path.join(__dirname, '..', 'dados', 'festas.json'));
const { base, avisos } = prepararBase(lerBase(bruto).linhas);
const modelo = bruto.festas.find((f) => f.id === 'sexta-sem-pressa');
const copia = (extra) => ({ ...structuredClone(modelo), ...extra });
const avisoDe = (linha) => prepararBase([linha]).avisos.join('\n');

test('a base inteira traz os campos novos, sem aviso', () => {
  assert.deepEqual(avisos, []);
  for (const f of base) {
    assert.equal(typeof f.endereco.texto, 'string', f.id);
    assert.ok(Array.isArray(f.lotes), f.id);
    assert.equal(typeof f.regras, 'object', f.id);
    assert.ok(f.fontes.length >= 1, f.id);
    assert.equal(typeof f.campos, 'object', f.id);
    assert.match(f.coletadoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/, f.id);
    assert.equal(f.cartaz, `/cartazes/${f.id}.webp`);
  }
});

test('a variedade que o detalhe precisa mostrar existe na base', () => {
  assert.ok(base.some((f) => f.entradaNaPorta && f.lotes.length === 0), 'entrada só na porta');
  assert.ok(base.some((f) => f.preco === 0), 'grátis');
  assert.ok(base.some((f) => f.lotes.some((l) => l.disponivel === false)), '1º lote esgotado');
  assert.ok(base.some((f) => f.lineup === null), 'lineup não divulgado');
  assert.ok(base.some((f) => f.linkEvento === null), 'sem página do evento');
  assert.ok(base.some((f) => f.instagram === null), 'sem Instagram');
  assert.ok(base.some((f) => f.regras.vestimenta), 'com vestimenta');
});

test('preco é o menor lote disponível; a porta vale quando não há lote', () => {
  for (const f of base) {
    const abertos = f.lotes.filter((l) => l.disponivel !== false).map((l) => l.preco);
    const esperado = abertos.length ? Math.min(...abertos) : f.entradaNaPorta.preco;
    assert.equal(f.preco, esperado, f.id);
  }
  assert.match(avisoDe(copia({ id: 'preco-errado', preco: 50 })), /"preco-errado": preco/);
});

test('festa sem lote disponível e sem porta cai: o motor não filtra preço nulo', () => {
  const esgotada = copia({ id: 'esgotada', lotes: modelo.lotes.map((l) => ({ ...l, disponivel: false })) });
  assert.match(avisoDe(esgotada), /"esgotada": preco/);
});

test('grátis: um lote de R$ 0 e preco 0', () => {
  const r = prepararBase([copia({ id: 'gratis', preco: 0, lotes: [{ nome: 'Entrada', preco: 0, disponivel: true }], linkCompra: null })]);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.base[0].preco, 0);
});

test('na porta: sem lotes, preco igual ao da porta', () => {
  const r = prepararBase([copia({ id: 'porta', preco: 40, lotes: [], entradaNaPorta: { preco: 40 }, linkCompra: null })]);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.base[0].entradaNaPorta.preco, 40);
});

test('link que não é https cai com aviso que nomeia o campo', () => {
  assert.match(avisoDe(copia({ id: 'js', linkCompra: 'javascript:alert(1)' })), /"js": linkCompra/);
  assert.match(avisoDe(copia({ id: 'http', linkEvento: 'http://exemplo.com/x' })), /"http": linkEvento/);
  assert.match(avisoDe(copia({ id: 'ig', instagram: 'https://exemplo.com/ig' })), /"ig": instagram/);
  assert.match(avisoDe(copia({ id: 'cartaz-fora', cartaz: 'https://exemplo.com/c.jpg' })), /"cartaz-fora": cartaz/);
});

test('campos ausentes ficam null, nunca texto inventado', () => {
  const r = prepararBase([copia({ id: 'magra', lineup: null, linkEvento: null, instagram: null, idadeMinima: null, regras: {} })]);
  assert.deepEqual(r.avisos, []);
  const f = r.base[0];
  for (const k of ['lineup', 'linkEvento', 'instagram', 'idadeMinima']) assert.equal(f[k], null, k);
  assert.deepEqual({ ...f.regras }, {});
});

test('lineup, regras e endereço malformados caem com aviso', () => {
  assert.match(avisoDe(copia({ id: 'l', lineup: 'Duda Maré' })), /"l": lineup/);
  assert.match(avisoDe(copia({ id: 'r', regras: { documento: 3 } })), /"r": regras/);
  assert.match(avisoDe(copia({ id: 'e', endereco: { texto: '', bairro: 'pinheiros' } })), /"e": endereco/);
  assert.match(avisoDe(copia({ id: 'b', endereco: { ...modelo.endereco, bairro: 'centro' } })), /"b": endereco/);
});

test('o que segue adiante fica congelado até o fundo', () => {
  const f = base[0];
  assert.ok(Object.isFrozen(f.lotes) && Object.isFrozen(f.lotes[0]));
  assert.ok(Object.isFrozen(f.endereco) && Object.isFrozen(f.regras) && Object.isFrozen(f.campos));
  assert.ok(Object.isFrozen(f.fontes[0]));
  assert.equal(typeof f.origemIdade, 'string', 'a origem da média continua texto');
  assert.match(f.campos.mediaIdade.conferidoEm, /-03:00$/);
});

test('base fictícia: os carimbos andam com o relógio e mantêm as distâncias', () => {
  const lida = lerBase(bruto);
  assert.equal(lida.ficticia, true);
  const agora = Date.parse(lida.referencia) + 3 * 24 * 3600e3;
  const linhas = deslocarDatas(lida.linhas, agora - Date.parse(lida.referencia));
  const r = prepararBase(linhas);
  assert.deepEqual(r.avisos, []);
  const mais = Math.max(...r.base.map((f) => Date.parse(f.coletadoEm)));
  assert.ok(agora - mais >= 0 && agora - mais < 3600e3, 'o carimbo mais novo fica a menos de uma hora de agora');
  const a = bruto.festas[0];
  const b = r.base.find((f) => f.id === a.id);
  const d0 = Date.parse(a.campos.mediaIdade.conferidoEm) - Date.parse(a.coletadoEm);
  const d1 = Date.parse(b.campos.mediaIdade.conferidoEm) - Date.parse(b.coletadoEm);
  assert.equal(d1, d0);
  assert.match(b.coletadoEm, /-03:00$/);
  assert.equal(bruto.festas[0].coletadoEm, a.coletadoEm, 'o original não muda');
});

test('base sem a marca de fictícia: lerBase não pede deslocamento', () => {
  const lida = lerBase({ festas: bruto.festas });
  assert.equal(lida.ficticia, false);
  assert.equal(lida.referencia, null);
});

test('lote com taxa e com hora-limite: aceitos quando bem formados', () => {
  const lotes = [{ nome: 'Até as 21h', preco: 60, disponivel: true, ate: '21:00', taxa: 6 }, { nome: 'Depois', preco: 75, disponivel: true, taxa: 7.5 }];
  assert.deepEqual(prepararBase([copia({ id: 'ok', lotes })]).avisos, []);
  assert.match(avisoDe(copia({ id: 'taxa-torta', lotes: [{ ...lotes[0], taxa: -1 }] })), /"taxa-torta": lotes/);
  assert.match(avisoDe(copia({ id: 'hora-torta', lotes: [{ ...lotes[0], ate: '9h' }] })), /"hora-torta": lotes/);
  assert.ok(base.some((f) => f.lotes.some((l) => l.taxa)), 'a base tem taxa');
  assert.ok(base.some((f) => f.lotes.some((l) => l.ate)), 'a base tem preço por horário');
});

'use strict';
// A base fictícia: carrega inteira, cobre o que o produto promete e a
// validação descarta linha ruim com aviso, sem derrubar o resto.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { prepararBase, lerLinhas, validarFesta, MAX_PATROCINADAS } = require('../nucleo/base');
const C = require('../nucleo/catalogo');

const bruto = require(path.join(__dirname, '..', 'dados', 'festas.json'));
const { base, avisos } = prepararBase(lerLinhas(bruto));

test('a base inteira é válida: cerca de 36 festas, nenhum aviso', () => {
  assert.deepEqual(avisos, []);
  assert.ok(base.length >= 34 && base.length <= 40, `${base.length} festas`);
});

test('cobre os três dias, os sete bairros e as quatro faixas', () => {
  for (const d of C.ORDEM_DIAS) assert.ok(base.some((f) => f.dia === d), d);
  for (const b of Object.keys(C.BAIRROS)) assert.ok(base.some((f) => f.bairro === b), b);
  for (const fx of C.FAIXAS) assert.ok(base.some((f) => f.faixas.includes(fx.id)), fx.id);
  for (const e of C.ID_ESTILOS) assert.ok(base.some((f) => f.estilos.includes(e)), e);
});

test('a maioria tem média de idade entre 27 e 36; o peso do horário está no começo da noite', () => {
  const nafaixa = base.filter((f) => f.mediaIdade >= 27 && f.mediaIdade <= 36).length;
  assert.ok(nafaixa / base.length > 0.6, `${nafaixa} de ${base.length}`);
  const comeco = base.filter((f) => f.inicio >= 18 && f.inicio <= 21).length;
  const tarde = base.filter((f) => f.inicio < 18).length;
  const noite = base.filter((f) => f.inicio >= 22).length;
  assert.ok(comeco > tarde && comeco > noite, `fim de tarde ${tarde}, começo ${comeco}, noite ${noite}`);
  assert.ok(base.some((f) => f.preco === 0), 'tem festa grátis');
  assert.ok(base.some((f) => f.preco > 100), 'tem festa cara');
});

test('no máximo duas patrocinadas, todas identificadas pelo selo', () => {
  const pagas = base.filter((f) => f.selo === 'patrocinado');
  assert.ok(pagas.length <= MAX_PATROCINADAS);
  assert.ok(base.every((f) => f.selo === 'editorial' || f.selo === 'patrocinado'));
});

test('a regiao bate com o bairro e a média cai numa das faixas atendidas', () => {
  for (const f of base) {
    assert.equal(f.regiao, C.BAIRROS[f.bairro].regiao, f.id);
    const fx = C.FAIXAS.find((x) => f.mediaIdade >= x.min && f.mediaIdade <= x.max);
    assert.ok(f.faixas.includes(fx.id), f.id);
  }
});

test('linha inválida sai com aviso que diz o campo; o resto fica', () => {
  const boa = { ...bruto.festas[0] };
  const linhas = [
    boa,
    { ...boa, id: 'sem-nome', nome: '' },
    { ...boa, id: 'idade-fora', mediaIdade: 40, faixas: ['30-35'] },
    { ...boa, id: 'ao-contrario', inicio: 23, esquenta: 22, fim: 21 },
    { ...boa, id: 'bairro-inventado', bairro: 'atlantida' },
    { ...boa, id: 'preco-quebrado', preco: 49.9 },
    { ...boa, id: 'estilo-estranho', estilos: ['axe'] },
    { ...boa, id: 'faixas-longe', mediaIdade: 32, faixas: ['18-24', '30-35'] },
    { ...boa, id: 'faixas-demais', mediaIdade: 32, faixas: ['25-29', '30-35', '36+'] },
    { ...boa }, // id repetido
    'não é festa',
    null,
  ];
  const r = prepararBase(linhas);
  assert.equal(r.base.length, 1);
  assert.equal(r.avisos.length, linhas.length - 1);
  assert.match(r.avisos.join('\n'), /"sem-nome": nome/);
  assert.match(r.avisos.join('\n'), /"idade-fora": faixas/);
  assert.match(r.avisos.join('\n'), /"ao-contrario": esquenta, fim/);
  assert.match(r.avisos.join('\n'), /"bairro-inventado": bairro/);
  assert.match(r.avisos.join('\n'), /"preco-quebrado": preco/);
  assert.match(r.avisos.join('\n'), /"estilo-estranho": estilos/);
  assert.match(r.avisos.join('\n'), /"faixas-longe": faixas \(no máximo a da média e uma vizinha\)/);
  assert.match(r.avisos.join('\n'), /"faixas-demais": faixas \(no máximo/);
  assert.match(r.avisos.join('\n'), /id repetido/);
});

test('a terceira patrocinada é ignorada com aviso', () => {
  const p = { ...bruto.festas[0], selo: 'patrocinado' };
  const r = prepararBase([{ ...p, id: 'p1' }, { ...p, id: 'p2' }, { ...p, id: 'p3' }]);
  assert.equal(r.base.length, 2);
  assert.match(r.avisos[0], /"p3".*2 patrocinadas/);
});

test('origem da média: objeto na base, texto na saída; sem origem, a linha cai', () => {
  for (const f of base) assert.match(f.origemIdade, /^(informada pela produtora|estimada pelo público das edições anteriores|a partir de \d+ avaliações de quem foi)$/);
  const sem = { ...bruto.festas[0], id: 'sem-origem' };
  delete sem.origemIdade;
  const r = prepararBase([sem, { ...bruto.festas[0], id: 'origem-torta', origemIdade: { tipo: 'chute' } }]);
  assert.equal(r.base.length, 0);
  assert.match(r.avisos.join('\n'), /"sem-origem": origemIdade/);
});

test('validarFesta aceita a forma documentada e devolve os campos ruins', () => {
  assert.deepEqual(validarFesta(bruto.festas[0]), []);
  assert.deepEqual(validarFesta({}).slice(0, 3), ['id', 'nome', 'produtora']);
  assert.deepEqual(validarFesta([]), ['não é um objeto']);
});

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

// Os dias e os bairros da base fictícia são os de sempre: sexta a domingo e
// os sete das três zonas. O pedido pode abrir mais dias (quinta, "hoje") e os
// 14 bairros do motor (U26, U29); a base não precisa cobri-los.
const DIAS_DA_BASE = ['sex', 'sab', 'dom'];
const BAIRROS_DA_BASE = ['pinheiros', 'vila-madalena', 'barra-funda', 'centro', 'bela-vista', 'jardins', 'vila-mariana'];

test('cobre os três dias, os sete bairros e os estilos, sem média de idade', () => {
  for (const d of DIAS_DA_BASE) assert.ok(base.some((f) => f.dia === d), d);
  for (const b of BAIRROS_DA_BASE) assert.ok(base.some((f) => f.bairro === b), b);
  assert.ok(base.every((f) => BAIRROS_DA_BASE.includes(f.bairro) && DIAS_DA_BASE.includes(f.dia)));
  // A média, as faixas e a origem delas saíram da base em 26/11/2026.
  for (const f of base) for (const k of ['mediaIdade', 'faixas', 'origemIdade', 'origemIdadeCurta']) assert.equal(k in f, false, `${f.id} ${k}`);
  for (const f of bruto.festas) assert.equal(f.mediaIdade, undefined, f.id);
  for (const e of C.ID_ESTILOS) assert.ok(base.some((f) => f.estilos.includes(e)), e);
});

test('o peso do horário está no começo da noite', () => {
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

test('a regiao bate com o bairro', () => {
  for (const f of base) assert.equal(f.regiao, C.TODOS_OS_BAIRROS[f.bairro].regiao, f.id);
});

test('linha inválida sai com aviso que diz o campo; o resto fica', () => {
  const boa = { ...bruto.festas[0] };
  const linhas = [
    boa,
    { ...boa, id: 'sem-nome', nome: '' },
    { ...boa, id: 'ao-contrario', inicio: 23, esquenta: 22, fim: 21 },
    { ...boa, id: 'bairro-inventado', bairro: 'atlantida' },
    { ...boa, id: 'preco-quebrado', preco: 49.9 },
    { ...boa, id: 'estilo-estranho', estilos: ['axe'] },
    { ...boa }, // id repetido
    'não é festa',
    null,
  ];
  const r = prepararBase(linhas);
  assert.equal(r.base.length, 1);
  assert.equal(r.avisos.length, linhas.length - 1);
  assert.match(r.avisos.join('\n'), /"sem-nome": nome/);
  assert.match(r.avisos.join('\n'), /"ao-contrario": esquenta, fim/);
  assert.match(r.avisos.join('\n'), /"bairro-inventado": bairro/);
  assert.match(r.avisos.join('\n'), /"preco-quebrado": preco/);
  assert.match(r.avisos.join('\n'), /"estilo-estranho": estilos/);
  assert.match(r.avisos.join('\n'), /id repetido/);
});

test('a terceira patrocinada é ignorada com aviso', () => {
  const p = { ...bruto.festas[0], selo: 'patrocinado' };
  const r = prepararBase([{ ...p, id: 'p1' }, { ...p, id: 'p2' }, { ...p, id: 'p3' }]);
  assert.equal(r.base.length, 2);
  assert.match(r.avisos[0], /"p3".*2 patrocinadas/);
});

test('linha antiga com média, faixas e origem da idade entra e as perde (26/11/2026)', () => {
  // Antes, a média era obrigatória e a linha sem origem caía. Agora a linha
  // que ainda traga a idade (até torta) não falha, e nada dela passa.
  const velha = {
    ...bruto.festas[0], id: 'velha', mediaIdade: 40, faixas: ['18-24', '30-35', '36+'], origemIdade: { tipo: 'chute' },
    campos: { ...bruto.festas[0].campos, mediaIdade: { fonte: 'envio', conferidoEm: bruto.festas[0].coletadoEm } },
  };
  const r = prepararBase([velha]);
  assert.deepEqual(r.avisos, []);
  const [f] = r.base;
  for (const k of ['mediaIdade', 'faixas', 'origemIdade', 'origemIdadeCurta']) assert.equal(k in f, false, k);
  assert.equal(f.campos.mediaIdade, undefined);
  assert.ok(Object.isFrozen(f.campos));
});

test('validarFesta aceita a forma documentada e devolve os campos ruins', () => {
  assert.deepEqual(validarFesta(bruto.festas[0]), []);
  assert.deepEqual(validarFesta({}).slice(0, 3), ['id', 'nome', 'produtora']);
  assert.deepEqual(validarFesta([]), ['não é um objeto']);
});

test('os caminhos novos de imagem e o ponto: valem os de /imagens/ e dentro de São Paulo', () => {
  const boa = { ...bruto.festas[0] };
  const img = { id: '0123456789abcdef', arquivo: '/imagens/0123456789abcdef-1080.webp', miniatura: '/imagens/0123456789abcdef-480.webp', credito: 'Divulgação', origem: 'https://ingressos.example/x' };
  assert.deepEqual(validarFesta({ ...boa, imagens: [img], cartaz: img, local: { lat: -23.56, lng: -46.69, precisao: 'rua' } }), []);
  assert.deepEqual(validarFesta({ ...boa, imagens: [{ ...img, arquivo: '/imagens/../segredo.webp' }] }), ['imagens']);
  assert.deepEqual(validarFesta({ ...boa, imagens: [{ ...img, origem: 'http://inseguro.example' }] }), ['imagens']);
  assert.deepEqual(validarFesta({ ...boa, cartaz: { ...img, id: 'ZZ' } }), ['cartaz']);
  assert.deepEqual(validarFesta({ ...boa, local: { lat: -22.9, lng: -43.2 } }), ['local']);
  const { base: limpa } = prepararBase([{ ...boa, imagens: [img], local: { lat: -23.56, lng: -46.69, precisao: 'rua' } }]);
  assert.deepEqual(limpa[0].imagens, [img]);
  assert.ok(Object.isFrozen(limpa[0].imagens[0]) && Object.isFrozen(limpa[0].local));
  assert.deepEqual(base[0].imagens, []);
  assert.equal(base[0].local, null);
});

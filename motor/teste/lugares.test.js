'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../nucleo/lugares');
const { BAIRROS } = require('../nucleo/bairros');

const REAIS = L.carregarLugares();
const achar = (e) => (L.acharLugar(e, REAIS) || {}).id || null;

test('config/lugares.json: cada casa traz o que o cadastro promete', () => {
  assert.ok(REAIS.length >= 25, `só ${REAIS.length} casas`);
  const ids = new Set();
  for (const l of REAIS) {
    assert.match(l.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(l.id), `id repetido: ${l.id}`);
    ids.add(l.id);
    assert.ok(l.nome && l.cidade, l.id);
    assert.ok(Number.isFinite(l.lat) && Number.isFinite(l.lng), `${l.id}: sem coordenada`);
    // 'bairro' (costura, U35): a casa conhecida sem endereço exato confirma cidade e
    // bairro, mas nunca vira pino (KTD1).
    assert.ok(['casa', 'rua', 'bairro'].includes(l.precisao), `${l.id}: precisão ${l.precisao}`);
    assert.ok(['nominatim', 'pagina', 'manual'].includes(l.fonteGeo), l.id);
    assert.match(l.conferidoEm, /^\d{4}-\d{2}-\d{2}$/, l.id);
    if (l.bairro) assert.ok(BAIRROS[l.bairro], `${l.id}: bairro ${l.bairro} não é dos 14`);
    if (l.cidade === 'São Paulo') {
      assert.ok(l.lat > -24.1 && l.lat < -23.3 && l.lng > -46.83 && l.lng < -46.36, `${l.id}: fora da capital`);
      assert.ok(l.regiao || !l.bairro, l.id);
    }
    // nada de dado pessoal: nenhum e-mail ou telefone
    assert.doesNotMatch(JSON.stringify(l), /@|\(\d{2}\)|\d{4}-\d{4}/, l.id);
  }
});

test('as cinco casas da U11, com coordenada conferida, e a Francisca com os três espaços', () => {
  for (const id of ['matiz', 'casa-de-francisca', 'toca-da-capivara', 'autodromo-de-interlagos', 'mundo-pensante']) {
    const l = L.lugarPorId(id, REAIS);
    assert.ok(l, id);
    assert.equal(l.conferidoEm, '2026-11-24');
  }
  assert.deepEqual(L.lugarPorId('casa-de-francisca', REAIS).espacos, ['porao', 'sala-b', 'salao']);
  assert.equal(L.lugarPorId('nao-existe', REAIS), null);
});

test('as três grafias da Francisca dão o mesmo lugar, com espaços diferentes', () => {
  const a = L.casaCanonica('Casa de Francisca - Porão', REAIS);
  const b = L.casaCanonica('Francisca - Sala B', REAIS);
  const c = L.casaCanonica('Francisca (Salão)', REAIS);
  assert.deepEqual([a.id, b.id, c.id], ['casa-de-francisca', 'casa-de-francisca', 'casa-de-francisca']);
  assert.deepEqual([a.espaco, b.espaco, c.espaco], ['porao', 'sala-b', 'salao']);
  assert.equal(new Set([a.chave, b.chave, c.chave]).size <= 2, true);
});

test('"IBT (antiga Lions)" e "Cria // cr1a_011" casam, pelo nome sem o parêntese e sem o handle', () => {
  const lista = [
    { id: 'ibt', nome: 'IBT', apelidos: ['Lions'] },
    { id: 'cria', nome: 'Cria' },
  ];
  assert.equal(L.acharLugar({ casa: 'IBT (antiga Lions)' }, lista).id, 'ibt');
  assert.equal(L.acharLugar({ casa: 'Cria // cr1a_011' }, lista).id, 'cria');
  assert.equal(L.casaCanonica('Cria // cr1a_011', lista).id, 'cria');
  assert.equal(achar({ casa: 'Cria // cr1a_011' }), 'cria');
});

test('casa por nome: sem acento, caixa, pontuação e nome dentro de um texto maior', () => {
  assert.equal(achar({ casa: 'AUTODROMO DE INTERLAGOS' }), 'autodromo-de-interlagos');
  assert.equal(achar({ casa: 'Autódromo de Interlagos, São Paulo' }), 'autodromo-de-interlagos');
  assert.equal(achar({ casa: 'The Raven' }), 'the-raven');
  assert.equal(achar({ casa: 'Condomínio do Edifício Martinelli' }), 'edificio-martinelli');
  assert.equal(achar({ casa: 'Hotel Tivoli Mofarrej' }), 'tivoli-mofarrej');
  assert.equal(achar({ casa: 'Matiz' }), 'matiz');
  // nome de uma palavra só casa por igualdade: "Porta" dentro de outro nome não
  assert.equal(achar({ casa: 'Porta dos Fundos Festival' }), null);
  assert.equal(achar({ casa: 'Matizes do Brasil' }), null);
  assert.equal(achar({ casa: 'Casa Qualquer' }), null);
  assert.equal(achar({ casa: '' }), null);
  assert.equal(achar({}), null);
  assert.equal(L.acharLugar({ casa: 'Matiz' }, []), null);
});

test('rua e número casam sem nome de casa, com abreviações e título', () => {
  assert.equal(achar({ endereco: 'Rua Martins Fontes, 91' }), 'matiz');
  assert.equal(achar({ endereco: 'R. Martins Fontes 91 - República, São Paulo' }), 'matiz');
  assert.equal(achar({ endereco: 'R. Treze de Maio, 830 - Bela Vista' }), 'mundo-pensante');
  assert.equal(achar({ endereco: 'Av. Senador Teotônio Vilela, 261 - Interlagos (CEP 04801-010)' }), 'autodromo-de-interlagos');
  assert.equal(achar({ endereco: 'Rua Quintino Bocaiúva, 22 - Sé' }), 'casa-de-francisca');
  // o mesmo logradouro com outro número é outra casa
  assert.equal(achar({ endereco: 'Rua Martins Fontes, 200' }), null);
  // e o CEP da casa não vence um número diferente
  assert.equal(achar({ endereco: 'Rua Wisard, 200', cep: '05434-080' }), null);
  assert.equal(L.ruaENumero('Rua Dr. Teodoro Baima, 100 - República').chave, 'rua doutor teodoro baima 100');
  assert.equal(L.ruaENumero('Praça Charles Miller, s/n'), null);
  assert.equal(L.ruaENumero('Rua 25 de Março, 100').chave, L.ruaENumero('R. 25 de março 100').chave);
});

test('CEP sozinho casa quando é de uma casa só', () => {
  assert.equal(achar({ endereco: 'CEP 01004-010' }), 'casa-de-francisca');
  assert.equal(achar({ endereco: '01004010' }), 'casa-de-francisca');
  const duas = [{ id: 'a', nome: 'A Casa', cep: '01000-000' }, { id: 'b', nome: 'B Casa', cep: '01000-000' }];
  assert.equal(L.acharLugar({ endereco: '01000-000' }, duas), null);
});

test('o @ da casa só vale sem casa nem endereço; na legenda, só quando é um @ só', () => {
  assert.equal(achar({ instagram: '@matizbarsp' }), 'matiz');
  assert.equal(achar({ instagram: 'https://www.instagram.com/atocadacapivara/' }), 'toca-da-capivara');
  assert.equal(achar({ instagram: '@matizbarsp', casa: 'Casa Qualquer' }), null);
  assert.equal(achar({ instagram: '@matizbarsp', endereco: 'Rua Qualquer, 10' }), null);
  assert.equal(achar({ legenda: 'Hoje no @matizbarsp com muito som' }), 'matiz');
  assert.equal(achar({ legenda: '@matizbarsp e @atocadacapivara juntos' }), null);
  assert.equal(achar({ legenda: 'sem marcação' }), null);
});

test('casaCanonica: espaço fora do nome, id só quando a casa é conhecida', () => {
  assert.deepEqual(L.casaCanonica('Casa de Francisca - Porão', []), { id: null, espaco: 'porao', chave: 'casa de francisca' });
  assert.deepEqual(L.casaCanonica('Casa de Francisca (Sala B)', []), { id: null, espaco: 'sala-b', chave: 'casa de francisca' });
  assert.deepEqual(L.casaCanonica('IBT (antiga Lions)', []), { id: null, espaco: null, chave: 'ibt' });
  assert.equal(L.casaCanonica('Terraço Exemplo', []).espaco, 'terraco');
  assert.equal(L.casaCanonica('Casa Exemplo', []).espaco, null);
  assert.equal(L.casaCanonica('', []).chave, '');
  assert.equal(L.casaCanonica('Matiz', REAIS).id, 'matiz');
});

test('a casa de Cotia dá a cidade dela (a prova de que "cidade pela casa" não é só São Paulo)', () => {
  const l = L.lugarPorId('aerodromo-nascimento', REAIS);
  assert.equal(l.cidade, 'Cotia');
  assert.equal(achar({ casa: 'Aeródromo Nascimento' }), 'aerodromo-nascimento');
});

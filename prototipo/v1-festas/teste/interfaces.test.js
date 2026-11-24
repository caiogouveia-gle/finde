'use strict';
// As interfaces que a fundação fixou do lado do app (U4 do plano de
// 24/11/2026; KTD19): cada lane trabalha contra estes nomes exportados, sem
// editar o arquivo da outra. Confere nomes e tipos, não a aridade. Nome que
// sumiu quebra aqui antes de quebrar a ligação.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULOS = {
  '../nucleo/catalogo': {
    DIAS: 'object', TODOS_OS_DIAS: 'object', DIAS_DA_SEMANA: 'object', ORDEM_DIAS: 'object', BAIRROS: 'object', TODOS_OS_BAIRROS: 'object',
    REGIOES: 'object', TODAS_AS_REGIOES: 'object', REFERENCIAS: 'object', minutosEntre: 'function', linhaDaFesta: 'function',
  },
  '../nucleo/lista': {
    hojeEmSaoPaulo: 'function', diaDaSemana: 'function', somarDias: 'function', dataCurta: 'function',
    vigentes: 'function', passou: 'function', datasDoDia: 'function', reaisDoDia: 'function', quandoDaReal: 'function', misturar: 'function', notaDaMistura: 'function',
    datasDoPedido: 'function', reaisDoPedido: 'function', montarResultado: 'function',
  },
  '../nucleo/reais': {
    CONTRATO: 'string', CONTRATOS: 'object', converterRegistro: 'function', converterExport: 'function', horasDoApp: 'function',
    hojeEmSaoPaulo: 'function', vigentes: 'function', passou: 'function', datasDoDia: 'function', reaisDoDia: 'function', quandoDaReal: 'function',
    misturar: 'function', notaDaMistura: 'function', dataCurta: 'function',
  },
  '../nucleo/fonte-motor': { criarFonteMotor: 'function' },
  '../nucleo/geo': { haversineKm: 'function', pontoDoBairro: 'function', dentroDeSP: 'function' },
  '../nucleo/avaliacoes': { criarAvaliacoes: 'function', chave: 'function', RESPOSTAS: 'object' },
  '../nucleo/ics': { montarIcs: 'function', escaparTexto: 'function', dobrarLinha: 'function' },
  '../nucleo/rotas-app': { ligarRotasApp: 'function' },
  '../nucleo/motor': { sanearCriterios: 'function', completar: 'function', escolher: 'function', opcao: 'function' },
  '../nucleo/cara': { cara: 'function' },
  '../nucleo/conversa': { abertura: 'function', responder: 'function' },
  '../nucleo/planos': { criarPlanos: 'function' },
  '../publico/festa-texto': { partesDoPorque: 'function', preco: 'function', fontes: 'function', mensagem: 'function' },
  '../publico/local': { comoChegar: 'function', distanciaTexto: 'function' },
  '../publico/mapa': { montarLista: 'function', montarDetalhe: 'function', desmontar: 'function', pinsDe: 'function' },
  '../servidor': { criarServidor: 'function' },
};

for (const [mod, nomes] of Object.entries(MODULOS)) {
  test(`interface: ${mod.replace('../', '')}`, () => {
    const m = require(mod);
    for (const [nome, tipo] of Object.entries(nomes)) assert.equal(typeof m[nome], tipo, `${mod}.${nome}`);
  });
}

test('interface: reais.js reexporta o recorte de lista.js, sem cópia', () => {
  const R = require('../nucleo/reais');
  const L = require('../nucleo/lista');
  for (const k of ['hojeEmSaoPaulo', 'vigentes', 'passou', 'datasDoDia', 'reaisDoDia', 'quandoDaReal', 'misturar', 'notaDaMistura', 'dataCurta']) assert.equal(R[k], L[k], k);
});

test('catálogo: os sete dias e "hoje" com artigo; o pedido vai de quinta a domingo, mais hoje', () => {
  const C = require('../nucleo/catalogo');
  for (const id of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom', 'hoje']) {
    const d = C.DIAS[id];
    assert.ok(d && d.nome && d.curto && d.frase, id);
    assert.ok(id === 'hoje' ? d.artigo === null : ['na', 'no'].includes(d.artigo), id);
  }
  assert.equal(C.DIAS.sab.artigo, 'no');
  assert.equal(C.DIAS.qui.artigo, 'na');
  assert.deepEqual(Object.keys(C.DIAS), ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom', 'hoje']);
  assert.deepEqual(C.ORDEM_DIAS, ['hoje', 'qui', 'sex', 'sab', 'dom']);
  // Quem recusa quarta agora é o saneamento do pedido, pela ORDEM_DIAS (U26).
  assert.equal(Object.hasOwn(C.DIAS, 'qua'), true);
  assert.equal(C.ORDEM_DIAS.includes('qua'), false);
  assert.deepEqual(C.DIAS_DA_SEMANA, ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
});

test('catálogo: os 14 bairros do motor, com nome, preposições, região e ponto', () => {
  const C = require('../nucleo/catalogo');
  const motor = require('../../../motor/nucleo/bairros');
  assert.deepEqual(Object.keys(C.TODOS_OS_BAIRROS).sort(), Object.keys(motor.BAIRROS).sort());
  for (const [id, b] of Object.entries(C.TODOS_OS_BAIRROS)) {
    assert.equal(b.nome, motor.BAIRROS[id].nome, id);
    assert.equal(b.regiao, motor.BAIRROS[id].regiao, id);
    assert.ok(b.de && b.em, id);
    assert.ok(b.ponto && b.ponto.nome && b.ponto.lat < -23.3 && b.ponto.lat > -24.1 && b.ponto.lng < -46.3 && b.ponto.lng > -47, id);
    assert.equal(C.BAIRROS[id], b, id); // C.BAIRROS acha os 14
    assert.ok(C.TODAS_AS_REGIOES[b.regiao], id);
  }
  // O pedido, a base e o conversor seguem com os sete, até a lane dona abrir os 14.
  assert.equal(Object.keys(C.BAIRROS).length, 7);
  assert.equal(Object.hasOwn(C.BAIRROS, 'interlagos'), false);
  assert.deepEqual(Object.keys(C.REGIOES), ['oeste', 'centro', 'centro-sul']);
  assert.deepEqual(Object.keys(C.TODAS_AS_REGIOES).sort(), Object.keys(motor.REGIOES).sort());
});

test('esqueletos: geo funciona; fonte do motor sem URL é null; o resultado tem a forma da fixture', () => {
  const G = require('../nucleo/geo');
  const batata = G.pontoDoBairro('pinheiros');
  const calixto = G.pontoDoBairro('vila-madalena');
  const km = G.haversineKm(batata, calixto);
  assert.ok(km > 0.8 && km < 1.6, String(km));
  assert.equal(G.haversineKm(batata, null), null);
  assert.equal(G.pontoDoBairro('atlantida'), null);
  assert.equal(G.dentroDeSP(-23.55, -46.63), true);
  assert.equal(G.dentroDeSP(-22.9, -43.2), false); // Rio
  assert.equal(require('../nucleo/fonte-motor').criarFonteMotor({}), null);
  const fm = require('../nucleo/fonte-motor').criarFonteMotor({ url: 'http://motor.example:8080' });
  for (const k of ['festas', 'atualizar', 'pronta', 'estado']) assert.equal(typeof fm[k], 'function', k);
  const L = require('../nucleo/lista');
  const RESPOSTA = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', 'resposta-festas-r14-3.json'), 'utf8'));
  const chaves = ['opcoes', 'maisDoDia', 'outrosDias', 'exemplos', 'aviso', 'nota', 'base', 'semMedia'];
  const r = L.montarResultado({ real: { opcoes: RESPOSTA.comReais.opcoes } });
  assert.deepEqual(Object.keys(r).sort(), [...chaves].sort());
  for (const k of chaves) assert.ok(k in RESPOSTA.comReais && k in RESPOSTA.semReais, k);
  const s = L.montarResultado({ real: null, ficticio: { opcoes: RESPOSTA.semReais.exemplos.map((o) => ({ ...o, pct: 50 })) } });
  assert.ok(s.exemplos.every((o) => o.exemplo === true && !('pct' in o)));
  assert.equal(typeof require('../nucleo/rotas-app').ligarRotasApp({}), 'function');
  assert.equal(require('../nucleo/rotas-app').ligarRotasApp({})({}, {}, new URL('http://x/qualquer')), false);
  // partesDoPorque deixou de ser esqueleto (U29): confere a forma, não o conteúdo.
  const pq = require('../publico/festa-texto').partesDoPorque(RESPOSTA.comReais.opcoes[0]);
  assert.ok(Array.isArray(pq.cabe) && pq.cabe.length <= 2 && pq.cabe.every((t) => typeof t === 'string'));
  assert.equal(typeof pq.falta, 'string');
  assert.deepEqual(require('../publico/mapa').pinsDe([]), { pins: [], soNaLista: 0 });
});

test('uma festa de segunda não derruba o que lê C.DIAS[f.dia]', () => {
  const C = require('../nucleo/catalogo');
  const L = require('../nucleo/lista');
  const T = require('../publico/festa-texto');
  const seg = { id: 'festa-de-segunda', nome: 'Festa de Segunda', dia: 'seg', data: '2026-11-30', inicio: 21, esquenta: null, fim: null, bairro: null, mediaIdade: null };
  assert.equal(C.linhaDaFesta(seg), 'Seg · 21h00');
  assert.equal(C.fraseDoHorario(seg), 'Começa às 21h. A hora de acabar não foi divulgada.');
  assert.doesNotThrow(() => L.notaDaMistura({ reais: 0, exemplos: 2, dia: 'seg', data: null, distante: false }));
  assert.doesNotThrow(() => L.passou(seg, Date.parse('2026-11-30T12:00:00-03:00')));
  assert.doesNotThrow(() => T.dataDoCartao && T.dataDoCartao(seg));
});

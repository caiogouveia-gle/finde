'use strict';
// As festas reais (nucleo/reais.js): o conversor R14 -> base do app, o filtro
// do que já passou pelo relógio, a mistura com a base fictícia, a marca de
// exemplo, a "% a sua cara" sem dado e o servidor com e sem o arquivo.
// Os registros daqui são inventados no formato do motor: nenhum dado real.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../nucleo/reais');
const motor = require('../nucleo/motor');
const { cara } = require('../nucleo/cara');
const T = require('../publico/festa-texto');
const { criarServidor } = require('../servidor');
const { criarPlanos } = require('../nucleo/planos');

const mudo = { info() {}, warn() {}, error() {} };
const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
// Quinta, 19/11/2026, meio-dia em São Paulo.
const AGORA = Date.parse('2026-11-19T12:00:00-03:00');
const CONF = '2026-11-16T21:56:00-03:00';

// Um registro finde-r14/2 mínimo, como o motor exporta de uma indicação.
function r14(extra = {}) {
  return {
    contrato: 'finde-r14/2', id: 'teste-20261120-aaaa', nome: 'Festa Teste', produtora: null, casa: null,
    endereco: { texto: 'São Paulo', bairro: null, regiao: null, cidade: 'São Paulo' },
    data: '2026-11-20', inicio: '2026-11-20T20:00:00-03:00', pistaCheia: null, fim: null,
    lotes: [{ nome: '1º lote', preco: 80, disponivel: true, taxa: 8 }],
    precoAPartirDe: { valor: 80, lote: '1º lote', esgotadosAntes: 0 }, esgotado: false, entradaNaPorta: null,
    linkCompra: 'https://www.ingresse.com/teste', linkEvento: null, instagram: null, cartaz: null, lineup: null,
    estilos: [], idadeMinima: null, regras: {}, mediaIdade: null, ehFesta: true, exemplo: false,
    fontes: [{ id: 'indicacao', nome: 'Lido na página do ingresso', url: 'https://www.ingresse.com/teste', conferidoEm: CONF }],
    coletadoEm: CONF, campos: { nome: { fonte: 'indicacao', conferidoEm: CONF } },
    ...extra,
  };
}

const PEDIDO = { dia: 'sex', janela: 'comeco-da-noite', idade: { min: 28, max: 35 }, bairros: [], teto: 150, estilos: [] };
const completo = (c) => motor.completar(motor.sanearCriterios(c));

// ---------------------------------------------------------------- conversor

test('conversor: data vira dia da semana e fica a data; ISO vira as horas do app', () => {
  const { festa } = R.converterRegistro(r14({ pistaCheia: '2026-11-20T23:30:00-03:00', fim: '2026-11-21T04:00:00-03:00' }));
  assert.equal(festa.dia, 'sex');
  assert.equal(festa.data, '2026-11-20');
  assert.equal(festa.inicio, 20);
  assert.equal(festa.esquenta, 23.5);
  // Depois da meia-noite passa de 24: hora + 24 × dias depois da data.
  assert.equal(festa.fim, 28);
  assert.equal(R.horasDoApp('2026-11-21T01:00:00-03:00', '2026-11-20'), 25);
  assert.equal(R.horasDoApp('2026-11-20T23:00:00Z', '2026-11-20'), 20);
  assert.equal(R.horasDoApp('2026-11-20T20:15:00-03:00', '2026-11-20'), 20.25);
  assert.equal(R.horasDoApp(null, '2026-11-20'), null);
  assert.equal(R.converterRegistro(r14({ data: '2026-11-21', inicio: '2026-11-21T22:00:00-03:00' })).festa.dia, 'sab');
  assert.equal(R.converterRegistro(r14({ data: '2026-11-22', inicio: '2026-11-22T16:00:00-03:00' })).festa.dia, 'dom');
});

test('conversor: o que o motor não trouxe fica null ou vazio, nunca um padrão fictício', () => {
  const { festa: f } = R.converterRegistro(r14());
  for (const k of ['produtora', 'casa', 'bairro', 'regiao', 'esquenta', 'fim', 'mediaIdade', 'origemIdade', 'frase', 'cartaz', 'lineup', 'distanciaMin', 'endereco', 'linkEvento', 'instagram']) {
    assert.equal(f[k], null, k);
  }
  assert.deepEqual(f.estilos, []);
  assert.equal(f.exemplo, false);
  assert.equal(f.real, true);
  assert.equal(f.preco, 80);
  // Fontes e campos (R12, R17) passam como vieram.
  assert.deepEqual(f.fontes, [{ id: 'indicacao', nome: 'Lido na página do ingresso', url: 'https://www.ingresse.com/teste', conferidoEm: CONF }]);
  assert.deepEqual(f.campos, { nome: { fonte: 'indicacao', conferidoEm: CONF } });
  assert.ok(Object.isFrozen(f) && Object.isFrozen(f.fontes[0]));
});

test('conversor: os 14 bairros do motor com o nome real e a região; endereço só quando diz mais que a cidade', () => {
  const sul = R.converterRegistro(r14({ endereco: { texto: 'Autódromo, Interlagos', bairro: 'interlagos', regiao: 'sul', cidade: 'São Paulo' } })).festa;
  assert.equal(sul.bairro, 'interlagos');
  assert.equal(sul.bairroNome, 'Interlagos');
  assert.equal(sul.regiao, 'sul');
  assert.equal(sul.endereco.texto, 'Autódromo, Interlagos');
  // O nome que o motor leu fica (Vila Leopoldina aponta para lapa).
  const leo = R.converterRegistro(r14({ endereco: { texto: 'Rua Mergenthaler, 1177', bairro: 'lapa', bairroNome: 'Vila Leopoldina', cidade: 'São Paulo' } })).festa;
  assert.deepEqual([leo.bairro, leo.bairroNome, leo.regiao], ['lapa', 'Vila Leopoldina', 'oeste']);
  const dentro = R.converterRegistro(r14({ endereco: { texto: 'Rua X, 10', bairro: 'pinheiros', regiao: 'oeste', cidade: 'São Paulo' } })).festa;
  assert.equal(dentro.bairro, 'pinheiros');
  assert.equal(dentro.regiao, 'oeste');
  const inventado = R.converterRegistro(r14({ endereco: { texto: 'Rua X, 10', bairro: 'atlantida', cidade: 'São Paulo' } })).festa;
  assert.deepEqual([inventado.bairro, inventado.bairroNome, inventado.regiao], [null, null, null]);
  assert.equal(R.converterRegistro(r14({ endereco: { texto: 'sao paulo', bairro: null, regiao: null, cidade: 'São Paulo' } })).festa.endereco, null);
});

test('conversor: casa que é a cidade vira null; produtora igual à casa não se repete', () => {
  const f = R.converterRegistro(r14({ casa: 'São Paulo', produtora: 'Coletivo X' })).festa;
  assert.equal(f.casa, null);
  assert.equal(f.produtora, 'Coletivo X');
  const g = R.converterRegistro(r14({ casa: 'Casa Teste', produtora: { nome: 'casa teste' } })).festa;
  assert.equal(g.casa, 'Casa Teste');
  assert.equal(g.produtora, null);
});

test('conversor: média só com origem; o preço sai dos lotes (a conta do motor); o cartaz de fora não vira imagem', () => {
  assert.equal(R.converterRegistro(r14({ mediaIdade: { valor: 31 } })).festa.mediaIdade, null);
  assert.equal(R.converterRegistro(r14({ mediaIdade: { valor: 31, origem: 'chute' } })).festa.mediaIdade, null);
  const f = R.converterRegistro(r14({ mediaIdade: { valor: 31, origem: 'produtora', detalhe: 'no post de 12/11' } })).festa;
  assert.equal(f.mediaIdade, 31);
  assert.equal(f.origemIdade, 'informada pela produtora');
  assert.equal(f.origemDetalhe, 'no post de 12/11');
  assert.equal(T.media(f, AGORA).origem, 'informada pela produtora, no post de 12/11');
  assert.equal(R.converterRegistro(r14({ lotes: [{ nome: 'x', preco: 469.9, disponivel: true }] })).festa.preco, 469.9);
  // Sem lote nem porta, o do motor, se vier.
  assert.equal(R.converterRegistro(r14({ lotes: [], precoAPartirDe: { valor: 469.9, lote: 'x', esgotadosAntes: 0 } })).festa.preco, 469.9);
  assert.equal(R.converterRegistro(r14({ precoAPartirDe: null, lotes: [] })).festa.preco, null);
  const c = R.converterRegistro(r14({ cartaz: 'https://cdn.exemplo.com/c.jpg' })).festa;
  assert.equal(c.cartaz, null);
  assert.equal(c.cartazExterno, 'https://cdn.exemplo.com/c.jpg');
});

test('conversor: fica fora o que não é festa, o exemplo do motor, a oculta e a sem data', () => {
  const motivo = (extra) => R.converterRegistro(r14(extra)).motivo;
  assert.equal(motivo({ ehFesta: false }), 'não é festa');
  assert.equal(motivo({ exemplo: true }), 'exemplo do motor');
  assert.equal(motivo({ oculta: { motivo: 'não é festa' } }), 'oculta pela curadoria');
  assert.equal(motivo({ data: null }), 'sem data');
  const r = R.converterExport({ contrato: 'finde-r14/2', festas: [r14(), r14(), r14({ id: 'outra-1', ehFesta: false })] });
  assert.equal(r.festas.length, 1);
  assert.deepEqual(r.fora, [{ id: 'teste-20261120-aaaa', motivo: 'id repetido' }, { id: 'outra-1', motivo: 'não é festa' }]);
});

test('conversor (U23): sem início entra marcada, esgotada entra marcada, e qualquer dia entra pelo dia da noite', () => {
  const semInicio = R.converterRegistro(r14({ inicio: null, fim: '2026-11-21T04:00:00-03:00' })).festa;
  assert.equal(semInicio.inicio, null);
  assert.equal(semInicio.horarioIncerto, true);
  assert.equal(semInicio.fim, 28);
  assert.equal(semInicio.esquenta, null);
  assert.equal(R.converterRegistro(r14()).festa.horarioIncerto, false);
  const esgotada = R.converterRegistro(r14({ esgotado: true })).festa;
  assert.equal(esgotada.esgotado, true);
  assert.equal(R.converterRegistro(r14()).festa.esgotado, false);
  const quinta = R.converterRegistro(r14({ data: '2026-11-19', inicio: '2026-11-19T20:00:00-03:00' })).festa;
  assert.deepEqual([quinta.dia, quinta.diaDaSemana, quinta.data], ['qui', 'qui', '2026-11-19']);
  // Uma festa de segunda entra para o "hoje" e não derruba o que lê C.DIAS[f.dia].
  const segunda = R.converterRegistro(r14({ data: '2026-11-23', inicio: '2026-11-23T21:00:00-03:00' })).festa;
  assert.equal(segunda.dia, 'seg');
  assert.equal(require('../nucleo/catalogo').linhaDaFesta(segunda), 'Seg · 21h00');
  // No /2, a 0h30 também é da noite anterior (a conta do motor).
  const madrugada = R.converterRegistro(r14({ data: '2026-11-21', inicio: '2026-11-21T00:30:00-03:00' })).festa;
  assert.deepEqual([madrugada.dia, madrugada.data, madrugada.inicio], ['sex', '2026-11-20', 24.5]);
  // Início às 7h da manhã continua fora do dia da noite.
  assert.equal(R.converterRegistro(r14({ inicio: '2026-11-20T07:00:00-03:00' })).festa.inicio, 7);
  assert.equal(R.converterRegistro(r14({ inicio: '2026-11-21T07:00:00-03:00' })).motivo, 'início fora do dia');
});

// ---------------------------------------------------------------- relógio

test('relógio: a festa passa quando acaba (o fim, ou as 6h do dia seguinte), a conta em São Paulo', () => {
  const ontem = R.converterRegistro(r14({ id: 'ontem', data: '2026-11-15', inicio: '2026-11-15T20:00:00-03:00' })).festa;
  const sexta = R.converterRegistro(r14()).festa;
  assert.deepEqual(R.vigentes([ontem, sexta], AGORA).map((f) => f.id), [sexta.id]);
  // 20/11 às 23h59 em São Paulo já é 21/11 em UTC: a festa de 20/11 ainda vale.
  assert.equal(R.hojeEmSaoPaulo(Date.parse('2026-11-20T23:59:00-03:00')), '2026-11-20');
  assert.deepEqual(R.vigentes([sexta], Date.parse('2026-11-20T23:59:00-03:00')).length, 1);
  // Sem o fim, a festa de sexta segue até as 6h de sábado.
  assert.deepEqual(R.vigentes([sexta], Date.parse('2026-11-21T01:30:00-03:00')).length, 1);
  assert.equal(R.passou(sexta, Date.parse('2026-11-21T05:59:00-03:00')), false);
  assert.equal(R.passou(sexta, Date.parse('2026-11-21T06:01:00-03:00')), true);
  assert.deepEqual(R.vigentes([sexta], Date.parse('2026-11-21T06:01:00-03:00')).length, 0);
  // Com o fim informado (1h), passa à 1h, e não às 6h.
  const ate1h = R.converterRegistro(r14({ id: 'ate-1h', fim: '2026-11-21T01:00:00-03:00' })).festa;
  assert.equal(R.passou(ate1h, Date.parse('2026-11-21T00:59:00-03:00')), false);
  assert.equal(R.passou(ate1h, Date.parse('2026-11-21T01:01:00-03:00')), true);
});

test('o dia pedido: a próxima ocorrência; sem real nela, a seguinte, dizendo que é de outra semana', () => {
  assert.deepEqual(R.datasDoDia('sex', AGORA), ['2026-11-20', '2026-11-27']);
  assert.deepEqual(R.datasDoDia('sab', AGORA), ['2026-11-21', '2026-11-28']);
  // Na própria sexta, a sexta é hoje.
  assert.deepEqual(R.datasDoDia('sex', Date.parse('2026-11-20T10:00:00-03:00')), ['2026-11-20', '2026-11-27']);
  const daqui = R.converterRegistro(r14({ id: 'sab-28', data: '2026-11-28', inicio: '2026-11-28T22:00:00-03:00' })).festa;
  const longe = R.converterRegistro(r14({ id: 'sab-05', data: '2026-12-05', inicio: '2026-12-05T22:00:00-03:00' })).festa;
  const r = R.reaisDoDia([daqui, longe], 'sab', AGORA);
  assert.deepEqual(r.festas.map((f) => f.id), ['sab-28']);
  assert.equal(r.distante, true);
  assert.equal(r.data, '2026-11-28');
  // Duas semanas adiante não entra.
  assert.equal(R.reaisDoDia([longe], 'sab', AGORA).festas.length, 0);
});

// ---------------------------------------------------------------- mistura

const BASE = require('../nucleo/base').prepararBase(require('../dados/festas.json').festas).base;

test('mistura: reais primeiro, completa com fictícias até três, cada fictícia marcada como exemplo', () => {
  const real = R.converterRegistro(r14()).festa;
  const c = completo(PEDIDO);
  const m = R.misturar({ real: motor.escolher(c, [real]), ficticio: motor.escolher(c, BASE), dia: 'sex', data: real.data, noDia: 1 });
  assert.equal(m.opcoes.length, 3);
  assert.equal(m.opcoes[0].festa.id, real.id);
  assert.equal(m.opcoes[0].exemplo, false);
  assert.ok(m.opcoes.slice(1).every((o) => o.exemplo === true && o.festa.exemplo === true));
  assert.equal(m.misto, true);
  assert.equal(m.reais, 1);
  // A real cabe inteira: a nota diz que uma real cabe e que o resto é exemplo.
  assert.equal(m.nota, 'Uma festa real cabe nesse pedido; completei com exemplos.');
  assert.equal(m.aviso, undefined);
});

test('mistura: sem real no dia, só exemplos, e a nota diz isso', () => {
  const c = completo({ ...PEDIDO, dia: 'dom' });
  const m = R.misturar({ real: null, ficticio: motor.escolher(c, BASE), dia: 'dom', noDia: 0 });
  assert.ok(m.opcoes.length > 0 && m.opcoes.every((o) => o.exemplo === true));
  assert.equal(m.nota, 'Ainda não tenho festa real no domingo. Seguem exemplos, festas fictícias.');
  const longe = R.notaDaMistura({ reais: 2, cabem: 0, exemplos: 1, dia: 'sab', data: '2026-11-28', distante: true });
  assert.equal(longe, 'Neste sábado ainda não tenho festa real; as de cima são de 28 nov. Nenhuma real cabe inteira: cada uma diz o que falta. Completei com um exemplo.');
});

test('motor com festa real sem dados: nada do que falta conta contra nem a favor', () => {
  const f = R.converterRegistro(r14()).festa;
  // Sem bairro, sem som, sem preço: com o pedido perguntando, vai para "quase" e diz.
  const c = completo({ ...PEDIDO, bairros: ['pinheiros'], estilos: ['house-disco'] });
  const o = motor.escolher(c, [f]).opcoes[0];
  // Sem bairro, a festa fica abaixo das que cabem ("quase" ou, desde a U27, "Local a confirmar").
  assert.ok(['quase', 'local'].includes(o.bloco), o.bloco);
  assert.equal(o.atende, false);
  assert.deepEqual(o.fora, []);
  assert.deepEqual(o.incertos, ['bairro não informado', 'som não informado']);
  assert.equal(o.aviso, 'Bairro não informado; som não informado.');
  assert.equal(o.bairro, null);
  assert.equal(o.linha, 'Sex · 20h00');
  assert.equal(o.horario, 'Começa às 20h. A hora de acabar não foi divulgada.');
  // Sem pedir bairro nem som, cabe no pedido.
  const livre = motor.escolher(completo(PEDIDO), [f]).opcoes[0];
  assert.equal(livre.bloco, 'pedido');
  assert.equal(livre.atende, true);
  // Começa cedo demais para a noite: diz pelo começo, já que não há pista cheia.
  const noite = motor.escolher(completo({ ...PEDIDO, janela: 'noite', teto: 'sem-limite' }), [f]).opcoes[0];
  assert.deepEqual(noite.fora, ['começa às 20h, antes do seu horário']);
});

test('% a sua cara: critério sem dado conta pela metade e aparece como "não se sabe"', () => {
  const f = R.converterRegistro(r14({ precoAPartirDe: null, lotes: null })).festa;
  const c = completo({ ...PEDIDO, bairros: ['pinheiros'], estilos: ['funk'], teto: 80 });
  const k = cara(f, c);
  // Só o horário tem dado: ele cabe (30), e os outros quatro (70) contam
  // pela metade. Festa com dado faltando nunca chega a 100%.
  assert.equal(k.pct, 65);
  assert.deepEqual(k.semDado, ['idade', 'bairro', 'preco', 'som']);
  assert.deepEqual(k.partes.filter((x) => x.cabe === null).map((x) => x.texto),
    ['média de idade não informada', 'bairro não informado', 'preço não informado', 'som não informado']);
  assert.equal(T.semDadoDaCara(k), 'Sem dado, conta pela metade: a idade, o bairro, o preço e o som.');
  assert.equal(T.pesoDaCara(k), '');
  // Com o preço acima do teto: horário 30 + preço 15 × 0 + o resto (55) pela metade.
  const cara2 = cara(R.converterRegistro(r14({ lotes: [{ nome: 'x', preco: 130, disponivel: true }] })).festa, c);
  assert.equal(cara2.pct, Math.round(30 + 55 / 2));
  // Festa fictícia continua sem semDado.
  assert.equal(cara(BASE[0], c).semDado, undefined);
});

test('texto: preço com centavos, som não informado e a mensagem do grupo sem casa', () => {
  assert.equal(T.precoNaLista({ lotes: [{ nome: 'a', preco: 469.9, disponivel: true }] }), 'R$ 469,90');
  assert.equal(T.som({ estilos: [], lineup: null }).frase, 'Som não informado. Lineup ainda não divulgado.');
  const f = R.converterRegistro(r14()).festa;
  assert.equal(T.mensagem({ data: 'sex, 20 nov', hora: '20h00', bairro: null, festa: f, link: 'x' })[4], 'R$ 80');
  assert.equal(T.cartaoFalado({ festa: BASE[0], linha: 'Sex · 18h00', exemplo: true }).split(' · ')[0], 'exemplo, festa fictícia');
  assert.equal(T.dataDoCartao('2026-11-28', 'sab'), 'sáb, 28 nov');
});

// ---------------------------------------------------------------- servidor

let pasta;
const abertos = [];
before(() => { pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-reais-')); });
after(async () => {
  for (const s of abertos) await new Promise((r) => s.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function subir(opcoes) {
  const s = criarServidor({ dados: DADOS, varDir: path.join(pasta, `var-${abertos.length}`), log: mudo, ...opcoes });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  const chamar = async (metodo, caminho, corpo) => {
    const r = await fetch(raiz + caminho, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.text() };
  };
  return { raiz, chamar };
}

function gravarReais(nome, festas) {
  const arquivo = path.join(pasta, nome);
  fs.writeFileSync(arquivo, JSON.stringify({ contrato: 'finde-r14/2', festas }));
  return arquivo;
}

test('servidor sem o arquivo das reais: só fictícias, como antes, sem marca de exemplo', async () => {
  const { chamar } = await subir({ reais: path.join(pasta, 'nao-existe.json'), relogio: () => AGORA });
  const f = await chamar('GET', '/api/formulario');
  assert.equal(f.corpo.ficticia, true);
  assert.equal(f.corpo.misto, false);
  const r = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.opcoes.length > 0);
  assert.ok(r.corpo.opcoes.every((o) => o.exemplo === undefined));
  assert.equal(r.corpo.misto, undefined);
});

test('servidor com reais (D11, KTD15): reais em cima; fictícias só no dia sem real, à parte e sem %; a de ontem fora', async () => {
  const arquivo = gravarReais('reais.json', [
    r14(),
    r14({ id: 'passada-1', data: '2026-11-14', inicio: '2026-11-14T22:00:00-03:00' }),
    r14({ id: 'sab-28', nome: 'Sábado Teste', data: '2026-11-28', inicio: '2026-11-28T22:00:00-03:00' }),
  ]);
  let agora = AGORA;
  const { chamar } = await subir({ reais: arquivo, relogio: () => agora });
  const f = await chamar('GET', '/api/formulario');
  assert.equal(f.corpo.misto, true);
  assert.equal(f.corpo.reais, 2);
  const r = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  for (const k of ['opcoes', 'maisDoDia', 'outrosDias', 'exemplos', 'aviso', 'nota', 'base', 'semMedia']) assert.ok(k in r.corpo, k);
  assert.deepEqual(r.corpo.opcoes.map((o) => o.festa.id), ['teste-20261120-aaaa']);
  const [primeira] = r.corpo.opcoes;
  assert.equal(primeira.exemplo, false);
  assert.equal(primeira.data, '2026-11-20');
  // O dia tem real: nenhuma fictícia na tela.
  assert.deepEqual(r.corpo.exemplos, []);
  assert.ok(r.corpo.outrosDias.some((d) => d.dia === 'sab' && d.data === '2026-11-21' && d.reais === 0));
  assert.deepEqual(Object.keys(r.corpo.base).sort(), ['atualizadoEm', 'perfis', 'sites', 'total']);
  // Sábado desta semana não tem real: só exemplos, marcados e sem %.
  const s = await chamar('POST', '/api/festas', { criterios: { ...PEDIDO, dia: 'sab', janela: 'noite', teto: 'sem-limite' } });
  assert.deepEqual(s.corpo.opcoes, []);
  assert.ok(s.corpo.exemplos.length > 0);
  assert.ok(s.corpo.exemplos.every((o) => o.exemplo === true && !('pct' in o) && typeof o.data === 'string'));
  // O sábado da semana que vem tem a real.
  const p2 = await chamar('POST', '/api/festas', { criterios: { ...PEDIDO, dia: 'sab', janela: 'noite', teto: 'sem-limite' }, semana: 'proxima' });
  assert.deepEqual(p2.corpo.opcoes.map((o) => o.festa.id), ['sab-28']);
  assert.equal(p2.corpo.criterios.semana, 'proxima');
  assert.deepEqual(p2.corpo.exemplos, []);
  // A passada não abre por link: diz que passou.
  const p = await chamar('GET', '/api/festa/passada-1');
  assert.equal(p.status, 404);
  assert.equal(p.corpo.passou, true);
  assert.equal(p.corpo.erro, 'Essa festa já passou.');
  // A real aberta por link: data real, sem cara, sem marca de exemplo.
  const a = await chamar('GET', '/api/festa/teste-20261120-aaaa');
  assert.equal(a.corpo.opcao.data, '2026-11-20');
  assert.equal(a.corpo.opcao.exemplo, false);
  assert.equal((await chamar('GET', '/api/festa/sexta-sem-pressa')).corpo.opcao.exemplo, true);
  // A conversa continua funcionando com a lista nova, e a semana segue.
  const c2 = await chamar('POST', '/api/conversa', { criterios: p2.corpo.criterios, texto: 'mais barato', atuais: p2.corpo.opcoes.map((o) => o.festa.id) });
  assert.equal(c2.status, 200);
  assert.equal(c2.corpo.criterios.semana, 'proxima');
  const c = await chamar('POST', '/api/conversa', { criterios: r.corpo.criterios, texto: 'mais barato', atuais: r.corpo.opcoes.map((o) => o.festa.id) });
  assert.equal(c.status, 200);
  // Convite de real: grava a data dela; depois que ela passa, abre dizendo que passou.
  const novo = await chamar('POST', '/api/planos', { criterios: r.corpo.criterios, festa: 'teste-20261120-aaaa', autor: 'Ju' });
  assert.equal(novo.status, 201);
  assert.equal(novo.corpo.data, '2026-11-20');
  agora = Date.parse('2026-11-22T12:00:00-03:00');
  const lido = await chamar('GET', `/api/planos/${novo.corpo.id}`);
  assert.equal(lido.status, 200);
  assert.equal(lido.corpo.passou, true);
  const pagina = await chamar('GET', `/p/${novo.corpo.id}`);
  assert.equal(pagina.status, 200);
  assert.doesNotMatch(pagina.corpo, /null/);
  // Passada, a real sai da lista no pedido seguinte (o relógio é o do pedido).
  const depois = await chamar('POST', '/api/festas', { criterios: PEDIDO });
  assert.ok(depois.corpo.opcoes.every((o) => o.festa.id !== 'teste-20261120-aaaa'));
  assert.equal((await chamar('POST', '/api/planos', { criterios: r.corpo.criterios, festa: 'teste-20261120-aaaa' })).status, 400);
});

test('servidor: arquivo de reais quebrado não derruba o app; o export cru do motor também serve', async () => {
  const torto = path.join(pasta, 'torto.json');
  fs.writeFileSync(torto, '{ não é json');
  const { chamar } = await subir({ reais: torto, relogio: () => AGORA });
  assert.equal((await chamar('POST', '/api/festas', { criterios: PEDIDO })).status, 200);
  // Exemplo do motor e não-festa ficam fora mesmo vindo no arquivo.
  const cru = gravarReais('cru.json', [r14({ exemplo: true }), r14({ id: 'nao-1', ehFesta: false })]);
  const b = await subir({ reais: cru, relogio: () => AGORA });
  assert.equal((await b.chamar('GET', '/api/formulario')).corpo.misto, false);
});

test('convites antigos de festa fictícia continuam abrindo com reais ligadas', async () => {
  const varDir = path.join(pasta, 'var-antigo');
  const planos = criarPlanos(varDir, { log: mudo });
  const o = motor.opcao(BASE[0], completo(PEDIDO));
  const p = planos.criar({ festa: o, pedido: 'x', autor: null, quando: { data: '2026-11-20', ate: '2026-11-21T02:00:00.000Z' } });
  const arquivo = gravarReais('reais-antigo.json', [r14()]);
  const s = criarServidor({ dados: DADOS, varDir, log: mudo, reais: arquivo, relogio: () => AGORA });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  assert.equal((await fetch(`${raiz}/p/${p.id}`)).status, 200);
  const lido = await fetch(`${raiz}/api/planos/${p.id}`).then((r) => r.json());
  assert.equal(lido.festa.festa.id, BASE[0].id);
});

test('o arquivo das reais fica fora do git e dentro da imagem do Fly', () => {
  const raiz = path.join(__dirname, '..');
  const gitignore = fs.readFileSync(path.join(raiz, '..', '..', '.gitignore'), 'utf8');
  assert.match(gitignore, /^prototipo\/v1-festas\/dados\/reais\*$/m);
  const docker = fs.readFileSync(path.join(raiz, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(!docker.some((l) => /dados|reais/.test(l)), docker.join(','));
  assert.match(fs.readFileSync(path.join(raiz, 'Dockerfile'), 'utf8'), /^COPY dados \.\/dados$/m);
});

test('motor: a real que diz o fim depois da sua volta não sai; a fictícia, sim', () => {
  // Sábado, das 22h às 6h, como uma festa que vai até de manhã.
  const ate6h = R.converterRegistro(r14({ id: 'ate-6h', data: '2026-11-28', inicio: '2026-11-28T22:00:00-03:00', fim: '2026-11-29T06:00:00-03:00' })).festa;
  const semFim = R.converterRegistro(r14({ id: 'sem-fim', data: '2026-11-28', inicio: '2026-11-28T22:00:00-03:00' })).festa;
  const c = completo({ ...PEDIDO, dia: 'sab', janela: 'noite', teto: 'sem-limite' });
  const r = motor.escolher(c, [ate6h, semFim]);
  const porId = Object.fromEntries(r.opcoes.map((o) => [o.festa.id, o]));
  // As duas entram do mesmo jeito: o fim informado não pune.
  assert.deepEqual(Object.keys(porId).sort(), ['ate-6h', 'sem-fim']);
  assert.equal(porId['ate-6h'].atende, true);
  assert.equal(porId['ate-6h'].bloco, 'pedido');
  assert.deepEqual(porId['ate-6h'].fora, []);
  assert.ok(porId['ate-6h'].motivos.includes('vai até as 6h; dá pra sair antes'), porId['ate-6h'].motivos.join(' | '));
  assert.equal(cara(ate6h, c).pct, cara(semFim, c).pct);
  // A volta dita na conversa também não tira a real.
  assert.equal(motor.escolher({ ...c, voltaMax: 26 }, [ate6h]).opcoes.length, 1);
  // O fim cedo demais continua valendo para a real.
  const cedo = R.converterRegistro(r14({ id: 'cedo', data: '2026-11-28', inicio: '2026-11-28T18:00:00-03:00', fim: '2026-11-28T22:30:00-03:00' })).festa;
  assert.equal(motor.furaHorario(cedo, c), true);
  // A fictícia com o mesmo horário segue fora.
  const ficticia = { ...BASE.find((f) => f.dia === 'sab'), id: 'fic-6h', inicio: 22, esquenta: 23, fim: 30 };
  assert.equal(motor.furaHorario(ficticia, c), true);
});

test('texto: o "depois" é o mesmo ingresso no lote seguinte, nunca outra categoria', () => {
  const lotes = (l) => R.converterRegistro(r14({ lotes: l, precoAPartirDe: null })).festa;
  // Pista e backstage: o backstage não é o "depois" da pista.
  const flow = lotes([
    { nome: 'Pista, 5º lote, inteira', preco: 440, disponivel: true },
    { nome: 'Pista, 5º lote, meia', preco: 220, disponivel: true },
    { nome: 'Backstage, 6º lote, meia', preco: 600, disponivel: true },
  ]);
  assert.equal(T.preco(flow).depois, null);
  // Feminino e masculino no mesmo lote: o masculino não é o "depois".
  assert.equal(T.preco(lotes([{ nome: '1º lote, feminino', preco: 130, disponivel: true }, { nome: '1º lote, masculino', preco: 160, disponivel: true }])).depois, null);
  // O mesmo ingresso no lote seguinte, em qualquer ordem e escrita.
  assert.equal(T.preco(lotes([{ nome: 'Lote 03, unissex', preco: 200, disponivel: true }, { nome: 'Lote 02, camarote', preco: 180, disponivel: true },
    { nome: 'Lote 02, unissex', preco: 150, disponivel: true }])).depois, 'depois, R$ 200');
  // Só por gênero: os dois preços, sem "depois" de um só deles.
  assert.equal(T.preco(lotes([{ nome: 'Lote 03, feminino', preco: 200, disponivel: true }, { nome: 'Lote 02, masculino', preco: 180, disponivel: true },
    { nome: 'Lote 02, feminino', preco: 150, disponivel: true }])).depois, null);
  assert.equal(T.preco(lotes([{ nome: '1º lote, convite', preco: 120, disponivel: true }, { nome: '2º lote, convite', preco: 150, disponivel: true }])).depois, 'depois, R$ 150');
  // Sem número de lote, não se sabe o que vem depois.
  assert.equal(T.preco(lotes([{ nome: 'Meia', preco: 50, disponivel: true }, { nome: 'Inteira', preco: 100, disponivel: true }])).depois, null);
});

test('servidor: depois da meia-noite, a real que ainda rola segue na lista, no link e no convite', async () => {
  const arquivo = gravarReais('reais-madrugada.json', [
    r14({ id: 'ate-6h-20261128', nome: 'Até de Manhã', data: '2026-11-28', inicio: '2026-11-28T22:00:00-03:00', fim: '2026-11-29T06:00:00-03:00' }),
  ]);
  let agora = Date.parse('2026-11-28T21:00:00-03:00');
  const { chamar } = await subir({ reais: arquivo, relogio: () => agora });
  const criterios = { ...PEDIDO, dia: 'sab', janela: 'noite', teto: 'sem-limite' };
  const antes = await chamar('POST', '/api/planos', { criterios, festa: 'ate-6h-20261128' });
  assert.equal(antes.status, 201);
  agora = Date.parse('2026-11-29T01:30:00-03:00');
  assert.equal((await chamar('GET', '/api/festa/ate-6h-20261128')).status, 200);
  assert.equal((await chamar('GET', `/api/planos/${antes.corpo.id}`)).corpo.passou, false);
  assert.equal((await chamar('POST', '/api/planos', { criterios, festa: 'ate-6h-20261128' })).status, 201);
  assert.equal((await chamar('GET', '/api/formulario')).corpo.reais, 1);
  // Às 6h01 acabou: o link, o convite e o formulário concordam.
  agora = Date.parse('2026-11-29T06:01:00-03:00');
  const link = await chamar('GET', '/api/festa/ate-6h-20261128');
  assert.equal(link.status, 404);
  assert.equal(link.corpo.passou, true);
  assert.equal((await chamar('GET', `/api/planos/${antes.corpo.id}`)).corpo.passou, true);
  assert.equal((await chamar('POST', '/api/planos', { criterios, festa: 'ate-6h-20261128' })).status, 400);
  assert.equal((await chamar('GET', '/api/formulario')).corpo.reais, 0);
});

test('servidor: real com o id de uma fictícia fica fora, com aviso', async () => {
  const avisos = [];
  const arquivo = gravarReais('reais-colisao.json', [r14({ id: 'sabado-groove', nome: 'Real Colide', data: '2026-11-21', inicio: '2026-11-21T19:00:00-03:00' })]);
  const s = criarServidor({ dados: DADOS, varDir: path.join(pasta, 'var-colisao'), reais: arquivo, relogio: () => AGORA,
    log: { info() {}, warn: (m) => avisos.push(m), error() {} } });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  assert.ok(avisos.some((m) => /fora "sabado-groove" \(id da base fictícia\)/.test(m)), avisos.join(' | '));
  const festa = await fetch(`${raiz}/api/festa/sabado-groove`).then((r) => r.json());
  assert.equal(festa.opcao.festa.nome, 'Sábado Groove');
  const lista = await fetch(`${raiz}/api/festas`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criterios: { ...PEDIDO, dia: 'sab', janela: 'fim-de-tarde', teto: 'sem-limite' } }) }).then((r) => r.json());
  assert.ok(lista.opcoes.every((o) => o.festa.nome !== 'Real Colide'));
  // Um aviso só, por mais pedidos que venham.
  assert.equal(avisos.filter((m) => /sabado-groove/.test(m)).length, 1);
});

test('servidor: a prévia do convite de fictícia diz que é exemplo; a de real, não', async () => {
  const arquivo = gravarReais('reais-previa.json', [r14()]);
  const { chamar } = await subir({ reais: arquivo, relogio: () => AGORA });
  const ficticia = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'sexta-sem-pressa' });
  const pf = (await chamar('GET', `/p/${ficticia.corpo.id}`)).corpo;
  assert.match(pf, /<meta property="og:title" content="Exemplo · Bora na sexta\?/);
  assert.match(pf, /<meta property="og:description" content="Festa fictícia, exemplo do protótipo\. /);
  const real = await chamar('POST', '/api/planos', { criterios: PEDIDO, festa: 'teste-20261120-aaaa' });
  const pr = (await chamar('GET', `/p/${real.corpo.id}`)).corpo;
  assert.match(pr, /<meta property="og:title" content="Bora na sexta\? Festa Teste/);
  assert.doesNotMatch(pr.match(/<meta property="og:description" content="([^"]*)"/)[1], /fictícia|xemplo/);
  // A landing diz que as festas dela são fictícias e que o app já tem reais.
  const landing = (await chamar('GET', '/')).corpo;
  assert.match(landing, /Protótipo · as festas desta página são fictícias; o app já tem festas reais/);
  assert.doesNotMatch(landing, /__NOTA_PROTOTIPO__/);
});

// ---------------------------------------------------------------- ferramentas/reais.js

test('ferramentas/reais.js: aceita /2 e /3, recusa /1, grava só as aceitas e copia as imagens delas', () => {
  const { principal } = require('../ferramentas/reais');
  const MOTOR = path.join(__dirname, '..', '..', '..', 'motor');
  const fixture = JSON.parse(fs.readFileSync(path.join(MOTOR, 'teste', 'dados', 'registro-r14-3.json'), 'utf8'));
  const dir = fs.mkdtempSync(path.join(pasta, 'ferramenta-'));
  const imgMotor = path.join(dir, 'motor-imagens');
  fs.mkdirSync(imgMotor);
  for (const nome of ['0123456789abcdef-480.webp', '0123456789abcdef-1080.webp']) fs.writeFileSync(path.join(imgMotor, nome), 'RIFF....WEBP');
  const linhas = [];
  const log = { log: (t) => linhas.push(t), warn: (t) => linhas.push(t), error: (t) => linhas.push(t) };
  const exportar = (nome, conteudo) => {
    const c = path.join(dir, nome);
    fs.writeFileSync(c, JSON.stringify(conteudo));
    return c;
  };
  const destino = path.join(dir, 'app', 'reais.json');
  const varDir = path.join(dir, 'var');
  // /3 com uma não festa: entram as três da fixture.
  const tres = exportar('tres.json', { ...fixture, festas: [...fixture.festas, { ...fixture.festas[1], id: 'nao-festa-1', ehFesta: false }] });
  assert.equal(principal([tres, destino, '--imagens', imgMotor], { agora: Date.parse('2026-11-26T12:00:00-03:00'), log, varDir }), 0);
  const gravado = JSON.parse(fs.readFileSync(destino, 'utf8'));
  assert.equal(gravado.contrato, 'finde-r14/3');
  assert.deepEqual(gravado.festas.map((f) => f.id), fixture.festas.map((f) => f.id));
  assert.ok(linhas.some((l) => /funil: 4 no export, 3 entram; fora: 1 não é festa/.test(l)), linhas.join('\n'));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'app', 'imagens')).sort(), ['0123456789abcdef-1080.webp', '0123456789abcdef-480.webp']);
  // Sem a festa da imagem, a imagem sai de dados/imagens/.
  const semImagem = exportar('sem.json', { ...fixture, festas: fixture.festas.slice(1) });
  assert.equal(principal([semImagem, destino, '--imagens', imgMotor], { log, varDir }), 0);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'app', 'imagens')), []);
  // O /2 entra; o /1 não.
  const dois = exportar('dois.json', { contrato: 'finde-r14/2', festas: [r14()] });
  assert.equal(principal([dois, destino, '--imagens', imgMotor], { log, varDir }), 0);
  assert.equal(JSON.parse(fs.readFileSync(destino, 'utf8')).contrato, 'finde-r14/2');
  const um = exportar('um.json', { contrato: 'finde-r14/1', festas: [r14()] });
  assert.equal(principal([um, destino, '--imagens', imgMotor], { log, varDir }), 1);
});

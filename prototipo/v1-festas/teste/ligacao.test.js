'use strict';
// A ligação com o motor (19/11/2026), do lado do app: a cidade, o "a partir
// de" sem lote de condição, o teto pelo lote que vale na hora de chegar, o
// som inferido, as páginas lidas e o nome da fonte; e o endereço e o
// ingresso montados num DOM de mentira. Registros, casas, endereços e preços
// inventados no formato do motor: nenhum dado real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../nucleo/reais');
const motor = require('../nucleo/motor');
const { cara } = require('../nucleo/cara');
const T = require('../publico/festa-texto');
const { condicoesDoLote: doMotor, CONDICOES: CONDICOES_DO_MOTOR } = require('../../../motor/nucleo/normalizar');

const CONF = '2026-11-16T21:56:00-03:00';
const AGORA = Date.parse('2026-11-19T12:00:00-03:00');
function r14(extra = {}) {
  return {
    contrato: 'finde-r14/2', id: 'teste-20261120-bbbb', nome: 'Festa Teste', produtora: null, casa: null,
    endereco: { texto: 'São Paulo', bairro: null, regiao: null, cidade: 'São Paulo' },
    data: '2026-11-20', inicio: '2026-11-20T22:00:00-03:00', pistaCheia: null, fim: null,
    lotes: [{ nome: '1º lote', preco: 80, disponivel: true }],
    precoAPartirDe: { valor: 80, lote: '1º lote', esgotadosAntes: 0 }, esgotado: false, entradaNaPorta: null,
    linkCompra: 'https://ingressos.example/teste', linkEvento: null, instagram: null, cartaz: null, lineup: null,
    estilos: [], idadeMinima: null, regras: {}, mediaIdade: null, ehFesta: true, exemplo: false,
    fontes: [{ id: 'indicacao', nome: 'Indicado pelo grupo', url: 'https://ingressos.example/teste', conferidoEm: CONF }],
    paginas: [],
    coletadoEm: CONF, campos: { nome: { fonte: 'indicacao', conferidoEm: CONF } },
    ...extra,
  };
}
const festa = (extra) => R.converterRegistro(r14(extra)).festa;
const lotes = (ls) => festa({ lotes: ls });
const pedido = (p) => motor.completar(motor.sanearCriterios({ dia: 'sex', janela: 'noite', idade: { min: 28, max: 35 }, bairros: [], teto: 'sem-limite', estilos: [], ...p }));

// ---------------------------------------------------------------- cidade

test('cidade: só entra a festa cuja fonte diz São Paulo; outra cidade e cidade não dita ficam fora', () => {
  const motivo = (endereco) => R.converterRegistro(r14({ endereco })).motivo;
  assert.equal(motivo({ texto: 'Rua das Amoras, 12, Vila Serena/SP', bairro: null, regiao: null, cidade: 'Vila Serena' }), 'fora de São Paulo (Vila Serena)');
  assert.equal(motivo(null), 'cidade não confirmada na página');
  assert.equal(motivo({ texto: 'Rua X, 1 - Pinheiros', bairro: 'pinheiros', regiao: 'oeste', cidade: null }), 'cidade não confirmada na página');
  assert.equal(motivo({ texto: 'Galpão Exemplo, São Paulo', bairro: null, regiao: null, cidade: 'São Paulo' }), undefined);
  // O endereço que é só a cidade continua sem virar endereço.
  assert.equal(festa().endereco, null);
  const r = R.converterExport({ contrato: 'finde-r14/2', festas: [r14(), r14({ id: 'longe-1', endereco: { texto: 'Vila Serena/SP', cidade: 'Vila Serena' } })] });
  assert.deepEqual(r.fora, [{ id: 'longe-1', motivo: 'fora de São Paulo (Vila Serena)' }]);
});

test('cidade: o export /1, que gravava "São Paulo" fixo, não entra', () => {
  const r = R.converterExport({ contrato: 'finde-r14/1', festas: [r14({ contrato: 'finde-r14/1' })] });
  assert.deepEqual(r.festas, []);
  assert.deepEqual(r.fora, [{ id: 'teste-20261120-bbbb', motivo: 'export antigo' }]);
  assert.match(r.avisos.join(' '), /finde-r14\/1 recusado/);
  // O registro solto também, pelo campo contrato.
  assert.match(R.converterRegistro(r14({ contrato: 'finde-r14/1' })).motivo, /^export antigo/);
});

// ---------------------------------------------------------------- preço

const SETORES = [
  { nome: 'Pista, 5º lote, inteira', preco: 300, disponivel: true, taxa: 33 },
  { nome: 'Pista, meia social (+1 kg)', preco: 150, disponivel: true, taxa: 16.5, condicoes: ['meia-social'] },
  { nome: 'Camarote, 6º lote, inteira', preco: 900, disponivel: true },
  { nome: 'Camarote, 6º lote, meia social (+1 kg)', preco: 450, disponivel: true, condicoes: ['meia-social'] },
];

test('preço: sai pela inteira; a meia social fica numa linha à parte', () => {
  const f = lotes(SETORES);
  assert.equal(f.preco, 300); // o filtro de teto usa a inteira
  const p = T.preco(f);
  assert.equal(p.valor, 300);
  assert.equal(p.lote, 'Pista, 5º lote, inteira');
  assert.equal(p.taxa, '+ R$ 33 de taxa');
  assert.deepEqual(p.outros.map((o) => o.texto), ['Meia social: R$ 150, Pista (+1 kg).']);
  assert.equal(T.precoNaLista(f), 'a partir de R$ 300');
  assert.equal(cara(f, pedido({ teto: 200 })).partes.find((x) => x.criterio === 'preco').cabe, false);
});

test('preço: só por gênero, os dois de forma curta, e o teto pelo mais alto; grátis diz grátis', () => {
  const f = lotes([
    { nome: '1º lote, feminino', preco: 70, disponivel: true, taxa: 9.1 },
    { nome: '1º lote, masculino', preco: 90, disponivel: true, taxa: 11.7 },
  ]);
  assert.equal(f.preco, 90);
  const p = T.preco(f);
  assert.deepEqual(p.genero, { feminino: 70, masculino: 90 });
  assert.equal(p.texto, 'R$ 70 fem. · R$ 90 masc.');
  assert.equal(p.curto, 'R$ 70/90');
  assert.equal(p.lote, '1º lote');
  assert.equal(p.taxa, '+ R$ 9,10 e R$ 11,70 de taxa');
  const g = T.preco(lotes([{ nome: 'Ingresso Mulher até 0h', preco: 0, disponivel: true }, { nome: 'Ingresso Homem', preco: 60, disponivel: true }]));
  assert.equal(g.texto, 'grátis fem. · R$ 60 masc.');
  assert.equal(g.curto, 'grátis/R$ 60');
});

test('preço: "Homens e Mulheres" é lote de todo mundo; "Inteira (não é meia)" não é meia', () => {
  const f = lotes([{ nome: 'Lote Único - Homens e Mulheres', preco: 100, disponivel: true }, { nome: 'Camarote', preco: 300, disponivel: true }]);
  assert.equal(T.preco(f).valor, 100);
  assert.deepEqual(T.preco(f).outros, []);
  assert.equal(T.preco(lotes([{ nome: 'Lote Único - Homens e Mulheres', preco: 100, disponivel: true }])).texto, 'R$ 100');
  const g = lotes([{ nome: 'Inteira (não é meia)', preco: 100, disponivel: true }, { nome: '2º lote', preco: 150, disponivel: true }]);
  assert.equal(T.preco(g).valor, 100);
  assert.deepEqual(T.preco(g).outros, []);
});

test('preço: a condição sai do nome igual ao motor, nos casos de borda também', () => {
  for (const nome of ['Pista, meia social (+1 kg alimento)', 'Dia único, solidário', 'Meia-entrada estudante', 'Lote 03, feminino',
    '1º lote, masculino', 'Feminino (Código)', 'UNISSEX - COMISSÁRIOS', '2º lote, unissex', 'Pré venda, Entrada cedo (até 23:30)',
    'Lote Único - Homens e Mulheres', 'Feminino e Masculino', 'Ingresso Mulher até 0h', 'Inteira (não é meia)', 'Inteira, sem meia-entrada',
    'Pista (Cupom)']) {
    assert.deepEqual(T.condicoesDoLote({ nome }), doMotor(nome), nome);
  }
  assert.deepEqual(T.CONDICOES, CONDICOES_DO_MOTOR);
  const f = lotes([{ nome: 'Pista, meia', preco: 50, disponivel: true }, { nome: 'Pista, inteira', preco: 100, disponivel: true }]);
  assert.equal(T.preco(f).valor, 100);
  assert.deepEqual(T.preco(f).outros.map((o) => o.texto), ['Meia-entrada: R$ 50, Pista.']);
  const soMeia = lotes([{ nome: 'Meia social (+1 kg)', preco: 50, disponivel: true }]);
  assert.equal(T.precoNaLista(soMeia), 'R$ 50, meia social');
});

test('preço: lote com código não é o "a partir de"; ele vai numa linha à parte', () => {
  const f = lotes([
    { nome: 'Pré venda, Entrada cedo (até 23:30)', preco: 120, disponivel: true, ate: '23:30', condicoes: ['codigo'] },
    { nome: 'Segunda Chamada, Entrada cedo (até 23:30)', preco: 170, disponivel: true, ate: '23:30' },
    { nome: 'Segunda Chamada, Entrada livre', preco: 190, disponivel: true },
  ]);
  assert.equal(f.preco, 170);
  const p = T.preco(f);
  assert.equal(p.valor, 170);
  assert.equal(p.codigo, false);
  assert.equal(p.horario, 'até as 23h30; depois, R$ 190');
  assert.deepEqual(p.outros.map((o) => o.texto), ['Com código: R$ 120, Pré venda, Entrada cedo (até 23:30).']);
  // Só lote com código: sai por ele, dizendo.
  const so = lotes([{ nome: 'Pista (Código)', preco: 80, disponivel: true }]);
  assert.equal(T.preco(so).codigo, true);
  assert.equal(T.precoNaLista(so), 'R$ 80, com código');
  // O "depois" do lote seguinte ignora a meia.
  const g = T.preco(lotes([
    { nome: '1º lote, convite', preco: 120, disponivel: true },
    { nome: '2º lote, meia', preco: 70, disponivel: true },
    { nome: '2º lote, convite', preco: 150, disponivel: true },
  ]));
  assert.equal(g.valor, 120);
  assert.equal(g.depois, 'depois, R$ 150');
});

test('teto: o lote que vale só até uma hora não vale para quem chega depois dela', () => {
  const f = festa({
    inicio: '2026-11-20T19:00:00-03:00',
    lotes: [{ nome: 'Até as 20h', preco: 45, disponivel: true, ate: '20:00' }, { nome: 'Depois das 20h', preco: 60, disponivel: true }],
  });
  assert.equal(f.preco, 45);
  // Chegando às 22h, paga R$ 60: não cabe em R$ 50.
  const noite = pedido({ janela: 'noite', teto: 50 });
  assert.equal(motor.precoPara(f, noite), 60);
  assert.equal(cara(f, noite).partes.find((x) => x.criterio === 'preco').texto, 'R$ 60, R$ 10 acima do seu teto');
  const o = motor.opcao(f, noite);
  assert.equal(o.atende, false);
  assert.ok(o.fora.includes('R$ 10 acima do teto'), o.fora.join('; '));
  // Chegando às 19h, o lote de R$ 45 vale.
  const cedo = pedido({ janela: 'comeco-da-noite', teto: 50 });
  assert.equal(motor.precoPara(f, cedo), 45);
  assert.equal(cara(f, cedo).partes.find((x) => x.criterio === 'preco').cabe, true);
});

// ---------------------------------------------------------------- som

test('som: estilo das regras ou do Claude aparece como inferência; da página, como dado', () => {
  const regras = festa({ estilos: ['mpb-samba'], campos: { estilos: { fonte: 'regras', conferidoEm: CONF } } });
  assert.equal(regras.estilosInferidos, true);
  assert.equal(T.som(regras).frase, 'Parece MPB e samba, pela descrição da página. Lineup ainda não divulgado.');
  const claude = festa({ estilos: ['eletronica'], lineup: ['DJ A'], campos: { estilos: { fonte: 'claude', conferidoEm: CONF } } });
  assert.equal(T.som(claude).frase, 'Parece eletrônica, pela descrição da página, com DJ A.');
  const pagina = festa({ estilos: ['eletronica'], campos: { estilos: { fonte: 'indicacao', conferidoEm: CONF } } });
  assert.equal(pagina.estilosInferidos, false);
  assert.equal(T.som(pagina).frase, 'Eletrônica. Lineup ainda não divulgado.');
  assert.equal(T.som(festa()).frase, 'Som não informado. Lineup ainda não divulgado.');
  assert.equal(T.som(festa({ lineup: ['DJ Exemplo'] })).frase, 'Som não informado. Lineup: DJ Exemplo.');
  const c = pedido({ estilos: ['mpb-samba'] });
  assert.match(cara(regras, c).partes.find((x) => x.criterio === 'som').texto, /^parece MPB e samba/);
});

// ---------------------------------------------------------------- fonte e páginas

test('fonte: "indicacao" aparece como "Lido na página do ingresso", mesmo vinda de export antigo', () => {
  assert.deepEqual(T.fontes(festa(), AGORA).map((x) => x.nome), ['Lido na página do ingresso']);
});

const PAGINAS = [
  { tipo: 'materia', nome: 'Revista Exemplo', url: 'https://revista.example/precos', lidoEm: '2026-11-19T11:40:00-03:00', campos: ['nome', 'data', 'lotes', 'lineup'] },
  { tipo: 'ingresso', nome: 'Ingressos Exemplo', url: 'https://ingressos.example/teste', lidoEm: '2026-11-19T11:00:00-03:00', campos: ['inicio', 'fim', 'endereco', 'idadeMinima'] },
  { tipo: 'instagram', nome: 'Instagram', url: 'https://www.instagram.com/festa_exemplo/', lidoEm: '2026-11-16T21:38:00-03:00', campos: ['instagram'] },
];

test('páginas: cada uma pelo que é, com o que se leu e quando; o preço diz de onde veio', () => {
  const f = festa({ paginas: PAGINAS });
  assert.deepEqual(T.paginas(f, AGORA), [
    { tipo: 'materia', nome: 'Matéria (Revista Exemplo)', lido: 'data, preço e lineup', quando: 'lida há 20 min' },
    { tipo: 'ingresso', nome: 'Página do ingresso (Ingressos Exemplo)', lido: 'horário, lugar e regras de entrada', quando: 'lida há 1h' },
    { tipo: 'instagram', nome: 'Instagram', lido: null, quando: 'lido há 2 dias' },
  ]);
  assert.deepEqual(T.origemDoPreco(f, AGORA), {
    conferido: false, texto: 'Preço lido na matéria da Revista Exemplo, há 20 min; não conferido na página do ingresso.',
  });
  const noIngresso = festa({ paginas: [PAGINAS[1], { ...PAGINAS[1], lidoEm: '2026-11-19T11:15:00-03:00', campos: ['lotes'] }] });
  assert.deepEqual(T.origemDoPreco(noIngresso, AGORA), { conferido: true, texto: 'Preço conferido na página do ingresso, há 45 min.' });
  // Página sem link https, sem tipo conhecido ou sem hora não entra.
  const torta = festa({ paginas: [{ tipo: 'boato', lidoEm: CONF }, { tipo: 'ingresso', lidoEm: 'ontem' }, PAGINAS[2]] });
  assert.equal(torta.paginas.length, 1);
  assert.equal(T.origemDoPreco(festa(), AGORA), null);
});

// ---------------------------------------------------------------- no DOM

const PUBLICO = path.join(__dirname, '..', 'publico');
function comumComDom() {
  class No {
    constructor(tag) {
      this.tag = tag; this.filhos = []; this.atributos = {}; this.className = ''; this.proprio = '';
      this.classList = { add: (c) => { this.className = `${this.className} ${c}`.trim(); } };
    }
    set textContent(v) { this.proprio = String(v); this.filhos = []; }
    get textContent() { return this.proprio + this.filhos.map((f) => f.textContent).join(''); }
    setAttribute(k, v) { this.atributos[k] = v; }
    addEventListener() {}
    append(...n) { this.filhos.push(...n); }
    replaceChildren(...n) { this.filhos = n; this.proprio = ''; }
  }
  const document = {
    addEventListener() {},
    querySelector: () => null,
    createElement: (tag) => new No(tag),
    createElementNS: (_, tag) => new No(tag),
    createTextNode: (t) => { const n = new No('#text'); n.textContent = t; return n; },
  };
  const window = {
    location: new URL('https://finde-app.fly.dev/'),
    matchMedia: () => ({ matches: false }),
    document,
    FindeTexto: T,
    FindeTema: { atual: () => 'dia', pelaHora: () => 'dia' },
  };
  vm.runInContext(fs.readFileSync(path.join(PUBLICO, 'comum.js'), 'utf8'), vm.createContext({ window, document, URL, Node: No, setInterval() {} }));
  return window.Finde;
}
const textos = (no) => (no.tag === '#text' ? [] : [no.textContent, ...no.filhos.flatMap(textos)]);
const contar = (no, re) => (no.textContent.match(re) || []).length;

test('endereço: a cidade e o bairro uma vez só', () => {
  const F = comumComDom();
  const com = (texto) => festa({ endereco: { texto, bairro: 'pinheiros', regiao: 'oeste', cidade: 'São Paulo' } });
  // O endereço já diz o bairro e São Paulo: nada embaixo.
  const ja = F.blocoOnde(com('Rua do Teste, 10 - Pinheiros, São Paulo'), 'Pinheiros', false);
  assert.equal(contar(ja, /São Paulo/g), 1);
  assert.equal(contar(ja, /Pinheiros/g), 1);
  // Só a rua: o bairro e a cidade embaixo.
  const rua = F.blocoOnde(com('Rua do Teste, 10'), 'Pinheiros', false);
  assert.ok(textos(rua).includes('Pinheiros, São Paulo'));
  // Diz São Paulo, não diz o bairro: só o bairro embaixo.
  const sp = F.blocoOnde(com('Rua do Teste, 10, São Paulo'), 'Pinheiros', false);
  assert.ok(textos(sp).includes('Pinheiros'));
  assert.equal(contar(sp, /São Paulo/g), 1);
});

test('ingresso: o vazio e a origem do preço aparecem uma vez, e o preço por código não passa por preço de todo mundo', () => {
  const F = comumComDom();
  const f = festa({
    paginas: PAGINAS,
    lotes: [
      { nome: 'Pré venda (Código)', preco: 120, disponivel: true },
      { nome: 'Segunda Chamada', preco: 170, disponivel: true, taxa: 17 },
    ],
  });
  const b = F.blocoIngresso(f, false);
  assert.ok(textos(b).includes('R$ 170'));
  assert.ok(textos(b).includes('Com código: R$ 120, Pré venda.'));
  assert.equal(contar(b, /não conferido na página do ingresso/g), 1);
  // Sem preço: o vazio dito uma vez.
  const sem = F.blocoIngresso(festa({ lotes: [], precoAPartirDe: null, linkCompra: null }), false);
  assert.equal(contar(sem, /Preço ainda não informado/g), 1);
  // Sem endereço: dito uma vez, com onde procurar.
  const onde = F.blocoOnde(festa(), null, false);
  assert.equal(onde.textContent, 'Endereço não divulgado. Confira na página do ingresso.');
});

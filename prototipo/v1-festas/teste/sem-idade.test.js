'use strict';
// A idade saiu do fluxo do app em 25/11/2026 e do resto do produto em
// 26/11/2026, até a idade do público ser validada: não aparece, não é
// perguntada, não pontua e não é contada. Dado antigo que ainda traga a média
// (a base, o motor, um convite já criado) não quebra nada e não a mostra.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../nucleo/motor');
const T = require('../publico/festa-texto');
const { criarServidor } = require('../servidor');

const PUBLICO = path.join(__dirname, '..', 'publico');
// "média", "faixa", "anos", "idade" (sem pegar "cidade" nem "novidades") e o
// "gente de 30 a 35" do pedido antigo.
const FALA_DE_IDADE = /m[ée]dia|faixa|\banos\b|(?<![a-zà-ú])idade|gente de \d/i;

const inteira = { min: 18, max: 50 };
const pedido = (idade) => M.completar(M.sanearCriterios({ dia: 'sex', janela: 'comeco-da-noite', idade, teto: 'sem-limite' }));

test('com a faixa inteira, a frase e o resumo do pedido não falam de idade', () => {
  const c = pedido(inteira);
  const partes = M.pedidoEmPartes(c);
  assert.ok(partes.every((p) => p && p.chave !== 'idade' && p.chave !== 'faixa'), JSON.stringify(partes));
  assert.ok(partes.some((p) => p.chave === 'bairros'), 'a cidade inteira continua na frase');
  assert.doesNotMatch(M.resumoDoPedido(c), /\d+ a \d+/);
});

test('nem a faixa dita na conversa nem a de um link antigo aparece no pedido (26/11/2026)', () => {
  // Até 26/11/2026, "30 a 40" virava "gente de 30 a 40" na frase do pedido.
  for (const c of [pedido({ min: 30, max: 40 }), M.completar(M.sanearCriterios({ dia: 'sex', janela: 'noite', faixa: '30-35', teto: 80 }))]) {
    assert.equal(c.idade, undefined);
    assert.equal(c.faixa, undefined);
    assert.doesNotMatch(M.pedidoEmPartes(c).map((p) => p.texto).join(' · '), FALA_DE_IDADE);
    assert.doesNotMatch(M.resumoDoPedido(c), /\d+ a \d+|ou mais|\+/);
  }
});

test('o app não pergunta a idade nem mostra a idade do público no detalhe ou na lista', () => {
  const app = fs.readFileSync(path.join(PUBLICO, 'app.js'), 'utf8');
  const perguntas = app.slice(app.indexOf('const PERGUNTAS = ['), app.indexOf('];', app.indexOf('const PERGUNTAS = [')));
  assert.doesNotMatch(perguntas, /chave: 'idade'/);
  assert.doesNotMatch(app, /'Idade do público'|divulgou a média de idade|'Com média informada'/);
  // O controle de idade (o trilho de dois pontos) também saiu do código.
  assert.doesNotMatch(app, /perguntaIdade|idadeDe\(|faixa-ponto|Idade mínima'|Idade máxima'/);
});

test('a prévia de link do app, da landing e do convite não fala de idade nem de fase', () => {
  for (const nome of ['index.html', 'landing.html', 'plano.html']) {
    const html = fs.readFileSync(path.join(PUBLICO, nome), 'utf8');
    const metas = (html.match(/<meta (?:name|property)="(?:description|og:[a-z:]+|twitter:[a-z]+)"[^>]*>/g) || []).join('\n');
    assert.ok(metas.includes('og:description'), nome);
    assert.doesNotMatch(metas, /\bidade|da sua fase/i, nome);
    // A imagem leva versão no endereço: o WhatsApp guarda a prévia pelo link da imagem.
    if (nome !== 'plano.html') assert.match(metas, /compartilhar\.png\?v=\d{8}"/, nome);
  }
});

// ---------------------------------------------------------------- o convite com média (26/11/2026)

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-sem-idade-'));
const abertos = [];
after(async () => {
  for (const s of abertos) await new Promise((r) => s.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});
const mudo = { info() {}, warn() {}, error() {} };
const AGORA = Date.parse('2026-11-27T12:00:00-03:00');

// A base fictícia como era antes de 26/11/2026: a Sábado Groove com a média
// 31, as faixas e a origem dela.
function baseComMedia() {
  const bruto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados', 'festas.json'), 'utf8'));
  const groove = bruto.festas.find((f) => f.id === 'sabado-groove');
  Object.assign(groove, { mediaIdade: 31, faixas: ['30-35'], origemIdade: { tipo: 'produtora' } });
  groove.campos = { ...groove.campos, mediaIdade: { fonte: 'envio', conferidoEm: groove.coletadoEm } };
  const arquivo = path.join(pasta, 'festas-com-media.json');
  fs.writeFileSync(arquivo, JSON.stringify(bruto));
  return arquivo;
}

// Um convite criado antes de 26/11/2026, com o retrato da festa que tinha a
// média (é o que o volume do app ainda guarda).
const VELHO = 'velho123';
const RETRATO = {
  festa: {
    id: 'festa-velha-20261128-aaaa', nome: 'Festa Velha', real: true, exemplo: false, dia: 'sab', data: '2026-11-28',
    casa: 'Casa Velha', endereco: { texto: 'Rua Velha, 10', bairro: 'pinheiros', regiao: 'oeste', cidade: 'São Paulo' },
    inicio: 23, esquenta: null, fim: null, preco: 40, lotes: [{ nome: '1º lote', preco: 40, disponivel: true }], entradaNaPorta: null,
    lineup: ['DJ Velho'], estilos: ['house-disco'], produtora: null, regras: {}, idadeMinima: null, cartaz: null, imagens: [],
    mediaIdade: 31, origemIdade: 'informada pela produtora', origemIdadeCurta: 'pela produtora', faixas: ['30-35'],
    avaliacaoIdade: { avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 },
    campos: { mediaIdade: { fonte: 'avaliacoes', conferidoEm: '2026-11-26T09:00:00-03:00' } },
  },
  linha: 'Sáb · 23h00 · Pinheiros · média 31 anos',
  hora: '23h00',
  bairro: 'Pinheiros',
  horario: 'Começa às 23h. A hora de acabar não foi divulgada.',
  origem: { curta: 'pela produtora', longa: 'informada pela produtora' },
  fora: [], motivos: ['média 31 anos'], aviso: null,
};

async function subir() {
  const varDir = path.join(pasta, 'var');
  fs.mkdirSync(varDir, { recursive: true });
  fs.writeFileSync(path.join(varDir, 'planos.json'), JSON.stringify({
    [VELHO]: {
      id: VELHO, criadoEm: '2026-11-25T20:00:00.000Z', autor: 'Ju', festa: RETRATO, pedido: 'Sáb · 22h às 3h · 30 a 35 · até R$ 80',
      respostas: [{ nome: 'Ju', resposta: 'dentro', em: '2026-11-25T20:00:00.000Z' }], data: '2026-11-28', ate: '2026-11-29T09:00:00.000Z',
    },
  }));
  const s = criarServidor({ dados: baseComMedia(), varDir, log: mudo, relogio: () => AGORA });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  const raiz = `http://127.0.0.1:${s.address().port}`;
  return async (metodo, caminho, corpo) => {
    const r = await fetch(raiz + caminho, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* página */ }
    return { status: r.status, texto, json };
  };
}

// As metas da prévia do link (o que o WhatsApp mostra) e o <title>.
const previa = (html) => ({
  title: (html.match(/<title>([^<]*)<\/title>/) || [])[1],
  ogTitle: (html.match(/<meta property="og:title" content="([^"]*)">/) || [])[1],
  ogDescricao: (html.match(/<meta property="og:description" content="([^"]*)">/) || [])[1],
  descricao: (html.match(/<meta name="description" content="([^"]*)">/) || [])[1],
});

// O painel do convite (comum.js) num DOM mínimo, como o plano.js o monta.
function painelDoConvite(o) {
  class No {
    constructor(tag) { this.tag = tag; this.filhos = []; this.proprio = ''; this.className = ''; this.atributos = {}; }
    set textContent(v) { this.proprio = String(v); this.filhos = []; }
    get textContent() { return this.proprio + this.filhos.map((f) => f.textContent).join(' '); }
    setAttribute(k, v) { this.atributos[k] = v; }
    addEventListener() {}
    append(...n) { this.filhos.push(...n); }
    replaceChildren(...n) { this.filhos = n; this.proprio = ''; }
  }
  const document = {
    addEventListener() {}, querySelector: () => null,
    createElement: (tag) => new No(tag), createElementNS: (_, tag) => new No(tag),
    createTextNode: (t) => { const n = new No('#text'); n.textContent = t; return n; },
  };
  const window = { location: new URL('https://finde-app.fly.dev/p/x'), matchMedia: () => ({ matches: false }), document, FindeTexto: T, FindeTema: { atual: () => 'dia', pelaHora: () => 'dia' } };
  vm.runInContext(fs.readFileSync(path.join(PUBLICO, 'comum.js'), 'utf8'), vm.createContext({ window, document, URL, Node: No, setInterval() {} }));
  return window.Finde.painelConvite(o, { rotulo: 'Convite de Ju' });
}

test('convite de festa com média: sem idade no título, na descrição, na página e no texto pro grupo', async () => {
  const chamar = await subir();

  // 1. Convite novo de uma festa cuja linha da base ainda traz a média.
  const criado = await chamar('POST', '/api/planos', { criterios: { dia: 'sab', janela: 'comeco-da-noite', idade: { min: 30, max: 35 }, teto: 80 }, festa: 'sabado-groove', autor: 'Bruna' });
  assert.equal(criado.status, 201);
  // 2. O convite antigo, que guardou a festa com a média e a linha "· média 31 anos".
  for (const [id, nome, hora] of [[criado.json.id, 'Sábado Groove', '19h00'], [VELHO, 'Festa Velha', '23h00']]) {
    const pagina = await chamar('GET', `/p/${id}`);
    assert.equal(pagina.status, 200);
    const p = previa(pagina.texto);
    // O título diz o dia, a festa e a hora, e para aí. Antes: "· média 31 (pela produtora)".
    assert.match(p.ogTitle, new RegExp(`Bora no sábado\\? ${nome}, ${hora}$`), id);
    assert.equal(p.title, p.ogTitle, id);
    // A descrição continua com o lugar, o preço e o horário. Antes: "Média de 31 anos, …".
    assert.match(p.ogDescricao, / · (a partir de )?R\$ \d+\. Começa às \d+h/, id);
    for (const [k, v] of Object.entries(p)) assert.doesNotMatch(v || '', FALA_DE_IDADE, `${id} ${k}: ${v}`);
    assert.doesNotMatch(pagina.texto, /[Mm]édia \d|\d+ anos/, id);

    // O que a página recebe da API: nada da idade, nem a pergunta depois da festa.
    const lido = await chamar('GET', `/api/planos/${id}`);
    assert.equal(lido.status, 200);
    assert.doesNotMatch(JSON.stringify(lido.json), /m[ée]dia|faixa|avaliac|(?<![a-zà-ú])idade(?!Minima)/i, id);
    for (const k of ['podeAvaliar', 'avaliacoes', 'finalidadeAvaliacao']) assert.equal(k in lido.json, false, `${id} ${k}`);

    // A página: o painel do convite montado com o que a API mandou.
    const painel = painelDoConvite(lido.json.festa);
    assert.match(painel.textContent, new RegExp(nome));
    assert.doesNotMatch(painel.textContent, FALA_DE_IDADE, id);

    // O texto pro grupo (FT.mensagem, o mesmo do app).
    const msg = T.mensagem({ data: 'sáb, 28 nov', hora: lido.json.festa.hora, bairro: lido.json.festa.bairro, festa: lido.json.festa.festa, link: `https://finde-app.fly.dev/p/${id}` }).join('\n');
    assert.match(msg, new RegExp(nome));
    assert.doesNotMatch(msg, FALA_DE_IDADE, id);
  }

  // Mesmo sem passar pela limpeza do convite (planos.js), o painel não lê a
  // média nem a origem dela, e a mensagem pro grupo ignora a média. (A linha
  // guardada, que só a API limpa, é a única coisa que o painel lê como veio.)
  const cru = painelDoConvite({ ...RETRATO, linha: 'Sáb · 23h00 · Pinheiros' });
  assert.doesNotMatch(cru.textContent, /m[ée]dia|\banos\b|pela produtora/i);
  assert.doesNotMatch(T.mensagem({ data: 'sáb, 28 nov', hora: '23h00', bairro: 'Pinheiros', festa: RETRATO.festa, link: 'x' }).join('\n'), FALA_DE_IDADE);
});

test('a pergunta de idade do convite não aparece e não é aceita', async () => {
  const chamar = await subir();
  // A rota da avaliação pós-festa saiu: 404, e nada é guardado.
  const r = await chamar('POST', `/api/planos/${VELHO}/avaliacao`, { nome: 'Ju', aparelho: 'aparelho-0001', resposta: 'na-medida', idade: 31 });
  assert.equal(r.status, 404);
  assert.equal(fs.existsSync(path.join(pasta, 'var', 'avaliacoes.json')), false);
  // O convite não monta a pergunta nem o "como foi?" (que perguntava se o público era da nossa idade).
  const plano = fs.readFileSync(path.join(PUBLICO, 'plano.js'), 'utf8');
  assert.doesNotMatch(plano, /O público tinha|sua-idade|\/avaliacao|mensagemComoFoi|Da minha idade/);
  assert.doesNotMatch(fs.readFileSync(path.join(PUBLICO, 'app.css'), 'utf8'), /idade-campo|campo-idade|avaliar-lugar/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'nucleo', 'avaliacoes.js')), false);
});

test('nada conta a idade: o painel do motor e os números não têm a métrica "com média de idade"', () => {
  const { montarResumo } = require('../nucleo/painel');
  const resumo = montarResumo({ motor: { geradoEm: '2026-11-26T12:00:00.000Z', festas: [{ id: 'a', mediaIdade: 30 }, { id: 'b' }] } });
  assert.deepEqual(Object.keys(resumo.motor).sort(), ['atualizadoEm', 'festas', 'produtoras']);
  for (const arquivo of ['ferramentas/numeros.js', 'publico/admin.js', 'nucleo/painel.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), /comMediaDeIdade|[Mm]édia de idade/, arquivo);
  }
});

'use strict';
// A landing (/), o app em /app, o detalhe sem pedido (/api/festa/<id>) e a
// seleção da lista da semana. Relógio parado numa segunda, 16/11/2026.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor, selecaoDaLanding } = require('../servidor');
const { prepararBase, lerBase, deslocarDatas } = require('../nucleo/base');

const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'publico', 'landing.css'), 'utf8');
const mudo = { info() {}, warn() {}, error() {} };
const AGORA = Date.parse('2026-11-16T12:00:00-03:00');
const PEDIDO = { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 };
let servidor;
let vazio;
let raiz;
let raizVazia;
let pasta;

function base() {
  const lida = lerBase(JSON.parse(fs.readFileSync(DADOS, 'utf8')));
  return prepararBase(deslocarDatas(lida.linhas, AGORA - Date.parse(lida.referencia))).base;
}

async function subir(opcoes) {
  const s = criarServidor({ varDir: path.join(pasta, `var-${Math.random()}`), log: mudo, relogio: () => AGORA, ...opcoes });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return [s, `http://127.0.0.1:${s.address().port}`];
}

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-landing-'));
  [servidor, raiz] = await subir({ dados: DADOS });
  [vazio, raizVazia] = await subir({ dados: path.join(pasta, 'nao-existe.json') });
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  await new Promise((r) => vazio.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function pagina(caminho, origem = raiz) {
  const r = await fetch(origem + caminho);
  return { status: r.status, tipo: r.headers.get('content-type') || '', corpo: await r.text() };
}

async function api(metodo, caminho, corpo) {
  const r = await fetch(raiz + caminho, {
    method: metodo,
    headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json() };
}

const linhasDe = (html) => [...html.matchAll(/<li data-dia="(sex|sab|dom)"( hidden)?>\s*<a class="linha" href="([^"]+)"/g)]
  .map(([, dia, escondida, href]) => ({ dia, escondida: Boolean(escondida), href }));

test('GET / serve a landing: título, herói, os dois botões e a assinatura', async () => {
  const r = await pagina('/');
  assert.equal(r.status, 200);
  assert.match(r.tipo, /text\/html/);
  assert.match(r.corpo, /<title>finde\. still going out\. just differently\.<\/title>/);
  assert.match(r.corpo, /<meta property="og:title" content="finde\. still going out\. just differently\.">/);
  assert.match(r.corpo, /<h1[^>]*>Festas que começam no seu horário, com gente da sua idade<\/h1>/);
  // O botão do herói leva à lista da semana logo abaixo, como na prancha;
  // o pedido (/app) tem o seu link, com um rótulo que diz o que acontece.
  assert.match(r.corpo, /<a class="botao" href="#festas">Ver as festas da semana<\/a>/);
  assert.match(r.corpo, /<section id="festas"/);
  assert.match(r.corpo, /<a class="link-fio" href="#lista">ou receba a lista por e-mail/);
  assert.match(r.corpo, /<a class="topo-lista" href="#lista">Receber por e-mail<\/a>/);
  assert.match(r.corpo, /<a class="link-fio link-fio--noite" href="\/app">Montar a lista com a sua cara/);
  // A assinatura em inglês leva lang="en": o leitor de tela pronuncia certo.
  assert.match(r.corpo, /<p class="manifesto-assinatura" lang="en">still going out\.<br><span>just differently\.<\/span>/);
  assert.match(r.corpo, /Protótipo · festas fictícias/);
  assert.match(r.corpo, /href="\/favicon\.svg"/);
  // Nada que o grupo não aprovou, nada inventado, nenhum placeholder sobrando.
  assert.doesNotMatch(r.corpo, /a pista abre antes|dança cedo/i);
  assert.doesNotMatch(r.corpo, /turma diz|\[Fala|\[Primeiro nome/i);
  assert.doesNotMatch(r.corpo, /\d+\s*%/);
  assert.doesNotMatch(r.corpo, /__[A-Z]+__/);
  assert.equal((await pagina('/index.html')).corpo, r.corpo);
  assert.equal((await pagina('/landing.html')).status, 404);
});

test('o convite do herói sai do registro de Sexta Sem Pressa', async () => {
  const { corpo } = await pagina('/');
  const convite = corpo.slice(corpo.indexOf('<figure class="convite"'), corpo.indexOf('</figure>'));
  assert.match(convite, /Convite · sex, 20 nov/);
  assert.match(convite, /Bora na <i>sexta\?<\/i>/);
  assert.match(convite, /<span class="cv-hora">18h00<\/span><span class="cv-rotulo">Média 32 anos<\/span>/);
  assert.match(convite, /<span class="cv-origem">informada pela produtora<\/span>/);
  assert.match(convite, /<span class="cv-nome">Sexta Sem Pressa<\/span>/);
  // A frase é a do registro; no desenho, a hora anda com o verbo (espaço e
  // hífen que não quebram), e "casa · preço · produtora" só quebra antes do "·".
  const lido = convite.replace(/\u00a0/g, ' ').replace(/\u2011/g, '-');
  assert.match(lido, /Começa às 18h, a pista enche às 20h e acaba às 23h\./);
  assert.match(convite, /e\u00a0acaba\u00a0às\u00a023h\./);
  assert.match(convite, /<span class="cv-onde">terraço\u00a0em\u00a0Pinheiros ·\u00a0a\u00a0partir\u00a0de\u00a0R\$\u00a060 ·\u00a0Coletivo\u00a0Expediente<\/span>/);
  assert.match(convite, /Idade média do público, informada pela produtora/);
  assert.match(convite, /Tô dentro[\s\S]*Não rola/);
  // O cartão inteiro leva ao detalhe da festa: nada no convite fica parado
  // com cara de botão. O nome do link diz a média com a origem.
  const cartao = convite.match(/<a class="cv-cartao" href="([^"]+)" aria-label="([^"]+)">([\s\S]*?)<\/a>/);
  assert.ok(cartao, 'o cartão do convite é um link');
  assert.equal(cartao[1], '/app?festa=sexta-sem-pressa');
  assert.match(cartao[2], /Sexta Sem Pressa: sexta, 18h00, média de 32 anos, informada pela produtora/);
  assert.match(cartao[3], /class="cv-botao">Tô dentro</);
  assert.doesNotMatch(convite.slice(convite.indexOf('</a>')), /cv-botao/);
});

test('o formulário de e-mail é só visual: sem action, sem nome no campo, botão desligado sem JS', async () => {
  const { corpo } = await pagina('/');
  const form = corpo.match(/<form[^>]*>[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(form, /action=|method=/);
  assert.doesNotMatch(form, /<input[^>]*\bname=/);
  assert.match(form, /<button class="botao" type="submit" disabled>Quero receber<\/button>/);
  const js = fs.readFileSync(path.join(__dirname, '..', 'publico', 'landing.js'), 'utf8');
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|\.submit\(\)/);
  assert.match(js, /Isto é um protótipo: seu e-mail não foi enviado nem guardado\./);
  // O aviso honesto aparece antes do gesto, fixo na página, e o campo aponta para ele.
  assert.match(corpo, /<p id="email-nota" class="nota-prototipo">Protótipo: este formulário não envia nem guarda nada\.<\/p>/);
  assert.match(form, /aria-describedby="email-nota email-erro"/);
  assert.ok(corpo.indexOf('id="email-nota"') < corpo.indexOf('id="aviso-prototipo"'));
});

test('a lista da semana: "Todas" mostra todas, cada dia é parte dela, cada linha leva ao detalhe no app', async () => {
  const { corpo } = await pagina('/');
  const linhas = linhasDe(corpo);
  const sel = selecaoDaLanding(base());
  // "Todas" não esconde nada: o filtro de um dia nunca revela festa nova.
  assert.equal(linhas.length, 9);
  assert.ok(linhas.every((l) => !l.escondida));
  assert.equal(linhas.length, sel.porDia.sex.length + sel.porDia.sab.length + sel.porDia.dom.length);
  assert.deepEqual(linhas.map((l) => l.href), sel.todas.map((f) => `/app?festa=${f.id}`));
  for (const d of ['sex', 'sab', 'dom']) {
    assert.deepEqual(linhas.filter((l) => l.dia === d).map((l) => l.href), sel.porDia[d].map((f) => `/app?festa=${f.id}`));
  }
  // O preço não quebra e leva o "·" junto: nada de ponto solto no fim da linha.
  assert.equal((corpo.match(/class="linha-onde">[^<]+ <span class="sem-quebra">· [^<]+<\/span>/g) || []).length, linhas.length);
  const js = fs.readFileSync(path.join(__dirname, '..', 'publico', 'landing.js'), 'utf8');
  assert.doesNotMatch(js, /data-todas/);
  // Média sempre com a origem; filtros com aria-pressed; estado vazio escondido.
  assert.equal((corpo.match(/class="linha-media-rot">Média</g) || []).length, linhas.length);
  assert.equal((corpo.match(/class="linha-origem">[^<]+</g) || []).length, linhas.length);
  assert.match(corpo, /<button type="button" class="filtro" data-dia="todas" aria-pressed="true">Todas<\/button>/);
  assert.equal((corpo.match(/class="filtro" data-dia="(sex|sab|dom)" aria-pressed="false"/g) || []).length, 3);
  assert.match(corpo, /<p class="vazio" id="vazio" hidden>/);
});

test('seleção da landing: média de 28 a 35, começa até as 20h, sem patrocinada, em ordem de dia e hora', () => {
  const b = base();
  const { porDia, todas } = selecaoDaLanding(b);
  const ordem = ['sex', 'sab', 'dom'];
  const emOrdem = (lista) => lista.every((f, i) => i === 0
    || ordem.indexOf(lista[i - 1].dia) < ordem.indexOf(f.dia)
    || (lista[i - 1].dia === f.dia && lista[i - 1].inicio <= f.inicio));
  assert.equal(todas.length, 9);
  assert.ok(emOrdem(todas));
  assert.deepEqual([...new Set(todas.map((f) => f.dia))], ordem, 'os três dias aparecem em "Todas"');
  // "Todas" é exatamente a soma dos dias.
  assert.deepEqual(todas.map((f) => f.id), [...porDia.sex, ...porDia.sab, ...porDia.dom].map((f) => f.id));
  for (const d of ordem) {
    assert.ok(porDia[d].length > 0 && porDia[d].length <= 3);
    assert.ok(porDia[d].every((f) => f.dia === d));
    assert.ok(emOrdem(porDia[d]));
  }
  const todasAs = [...todas, ...porDia.sex, ...porDia.sab, ...porDia.dom];
  assert.ok(todasAs.every((f) => f.mediaIdade >= 28 && f.mediaIdade <= 35 && f.inicio <= 20 && f.selo !== 'patrocinado'));
  // Cada dia traz as três que abrem mais cedo entre as que cabem.
  const cabem = (d) => b.filter((f) => f.dia === d && f.mediaIdade >= 28 && f.mediaIdade <= 35 && f.inicio <= 20 && f.selo !== 'patrocinado');
  for (const d of ordem) {
    assert.equal(porDia[d].length, Math.min(3, cabem(d).length));
    const ultima = porDia[d][porDia[d].length - 1].inicio;
    assert.ok(cabem(d).every((f) => porDia[d].includes(f) || f.inicio >= ultima), d);
  }
  assert.ok(todas.some((f) => f.id === 'sexta-sem-pressa'));
  assert.deepEqual(selecaoDaLanding([]), { porDia: { sex: [], sab: [], dom: [] }, todas: [] });
});

test('landing com a base vazia: sem convite, sem linhas, estado vazio à vista', async () => {
  const r = await pagina('/', raizVazia);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.corpo, /<figure class="convite"/);
  assert.equal(linhasDe(r.corpo).length, 0);
  assert.match(r.corpo, /<p class="vazio" id="vazio">A lista desta semana ainda está vazia\./);
});

test('GET /app e /app/ servem o app com os dados da primeira tela', async () => {
  for (const caminho of ['/app', '/app/', '/app?festa=sexta-sem-pressa']) {
    const r = await pagina(caminho);
    assert.equal(r.status, 200, caminho);
    assert.match(r.corpo, /<script src="\/app\.js" defer><\/script>/);
    const m = r.corpo.match(/<script type="application\/json" id="dados-iniciais">([^<]*)<\/script>/);
    assert.ok(m, caminho);
    assert.equal(JSON.parse(m[1]).total, 37);
  }
});

test('GET /api/festa/<id>: a opção no formato de /api/festas, sem pedido e sem cara', async () => {
  const r = await api('GET', '/api/festa/sexta-sem-pressa');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.corpo), ['opcao']);
  const o = r.corpo.opcao;
  assert.equal(o.festa.id, 'sexta-sem-pressa');
  assert.equal(o.hora, '18h00');
  assert.equal(o.dia, 'Sex');
  assert.equal(o.horario, 'Começa às 18h, a pista enche às 20h e acaba às 23h.');
  assert.equal(o.origem.longa, 'informada pela produtora');
  assert.equal(o.data, '2026-11-20');
  assert.equal(o.atende, true);
  assert.deepEqual(o.fora, []);
  assert.equal(o.aviso, null);
  assert.equal(o.cara, undefined);
  const lista = await api('POST', '/api/festas', { criterios: PEDIDO });
  const chaves = (x) => Object.keys(x).filter((k) => k !== 'cara').sort();
  assert.deepEqual(chaves(o), chaves(lista.corpo.opcoes[0]));
  // Uma festa de madrugada também sai sem furo: o pedido neutro é o dela.
  const tarde = await api('GET', '/api/festa/galpao-aberto');
  assert.equal(tarde.status, 200);
  assert.deepEqual(tarde.corpo.opcao.fora, []);
});

test('GET /api/festa/<id>: 404 para festa que não existe ou id torto; 405 para outro método', async () => {
  for (const id of ['nao-existe', 'Sexta-Sem-Pressa', '..%2fdados', '%00', 'x'.repeat(61)]) {
    const r = await api('GET', `/api/festa/${id}`);
    assert.equal(r.status, 404, id);
    assert.ok(r.corpo.erro);
  }
  assert.equal((await api('POST', '/api/festa/sexta-sem-pressa', {})).status, 405);
  assert.equal((await api('GET', '/api/festa/')).status, 404);
});

test('landing.css segue o manual: sem raio, sem gradiente, sem sombra', () => {
  const raios = [...CSS.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(raios.every((v) => v === '0'), `raios: ${raios.join(', ')}`);
  assert.doesNotMatch(CSS, /gradient\(|box-shadow|text-shadow|filter:\s*drop-shadow/);
  assert.doesNotMatch(CSS, /@import|googleapis/);
});

// As regras de um seletor exato, em qualquer bloco (fora e dentro de @media).
function regras(seletor) {
  const fora = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...fora.matchAll(new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'gm'))].map((m) => m[1]);
}

test('landing.css: o botão D tem 52 px e 0 32px, e só baixa a 44 no mesmo corte do app', () => {
  const base = regras('.botao')[0];
  assert.match(base, /min-height:\s*52px/);
  assert.match(base, /padding:\s*0 32px/);
  assert.match(base, /font-size:\s*12px/);
  // Nenhuma outra regra mexe na altura ou no recuo do D, fora o corte pequeno.
  const pequeno = CSS.match(/@media \(max-width: 359px\), \(max-height: 640px\) \{([\s\S]*?)\n\}/);
  assert.ok(pequeno, 'falta o corte de tela pequena');
  assert.match(pequeno[1], /\.botao, \.cv-botao \{ min-height: 44px; \}/);
  const semCorte = CSS.replace(pequeno[0], '');
  const alturas = [...semCorte.matchAll(/(?<![\w-])\.botao\s*\{[^}]*?min-height:\s*(\d+)px/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(alturas)], ['52']);
  const recuos = [...semCorte.matchAll(/(?<![\w-])\.botao\s*\{[^}]*?padding:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(recuos)], ['0 32px']);
  // Os botões do convite do herói usam o corpo do convite real (12 px, 52 px).
  const cv = regras('.cv-botao')[0];
  assert.match(cv, /min-height:\s*52px/);
  assert.match(cv, /font-size:\s*12px/);
});

test('landing.css: o wordmark nunca fica abaixo de 36 px (cerca de 84 px de largura)', () => {
  const corpo = (bloco) => Number((bloco.match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(corpo(regras('.marca')[0]) >= 36);
  assert.ok(corpo(regras('.cv-marca')[0]) >= 36);
  for (const b of regras('.marca--rodape')) assert.ok(!/font-size/.test(b) || corpo(b) >= 36, b);
});

// landing.js num DOM de mentira: o filtro guardado na aba e a volta do
// detalhe de uma festa, que cai na lista e não no topo.
function rodarLandingJs({ guardado, referrer = '', hash = '', semArmazenamento = false } = {}) {
  const vm = require('node:vm');
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'publico', 'landing.js'), 'utf8');
  const elemento = (extra = {}) => {
    const attrs = {};
    const ouvintes = {};
    return {
      hidden: false, textContent: '', dataset: {}, ...extra,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k]; },
      addEventListener(tipo, f) { ouvintes[tipo] = f; },
      disparar(tipo) { ouvintes[tipo](); },
    };
  };
  const filtros = ['todas', 'sex', 'sab', 'dom'].map((dia) => elemento({ dataset: { dia } }));
  const itens = ['sex', 'sex', 'sab', 'sab', 'dom'].map((dia) => elemento({ dataset: { dia } }));
  const rolagens = [];
  const porId = {
    vazio: elemento({ hidden: true }),
    contagem: elemento(),
    festas: { scrollIntoView: (o) => rolagens.push(o) },
    'form-lista': null,
  };
  const guarda = new Map(guardado ? [['finde.landing.dia', guardado]] : []);
  const sessionStorage = {
    getItem(k) { if (semArmazenamento) throw new Error('bloqueado'); return guarda.has(k) ? guarda.get(k) : null; },
    setItem(k, v) { if (semArmazenamento) throw new Error('bloqueado'); guarda.set(k, String(v)); },
  };
  const document = {
    referrer,
    querySelectorAll: (s) => (s === '.filtro' ? filtros : s === '#linhas > li' ? itens : []),
    getElementById: (id) => (id in porId ? porId[id] : null),
  };
  const location = { origin: 'http://127.0.0.1:8821', hash };
  vm.runInNewContext(codigo, { document, location, sessionStorage, URL, Object });
  const visiveis = () => itens.filter((li) => !li.hidden).map((li) => li.dataset.dia);
  const apertado = () => filtros.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.dia;
  return { filtros, visiveis, apertado, guarda, rolagens, contagem: porId.contagem };
}

test('landing.js: o dia escolhido fica na aba e volta ao reabrir a landing', () => {
  const primeira = rodarLandingJs();
  assert.deepEqual(primeira.visiveis(), ['sex', 'sex', 'sab', 'sab', 'dom']);
  primeira.filtros[2].disparar('click');
  assert.deepEqual(primeira.visiveis(), ['sab', 'sab']);
  assert.equal(primeira.guarda.get('finde.landing.dia'), 'sab');
  assert.equal(primeira.contagem.textContent, '2 festas no sábado');

  const volta = rodarLandingJs({ guardado: 'sab' });
  assert.deepEqual(volta.visiveis(), ['sab', 'sab']);
  assert.equal(volta.apertado(), 'sab');
  assert.equal(volta.contagem.textContent, '', 'ao abrir, nada a anunciar');
  // Valor estranho na aba é ignorado; sem armazenamento, nada quebra.
  assert.deepEqual(rodarLandingJs({ guardado: 'constructor' }).visiveis().length, 5);
  const bloqueado = rodarLandingJs({ semArmazenamento: true });
  bloqueado.filtros[3].disparar('click');
  assert.deepEqual(bloqueado.visiveis(), ['dom']);
});

test('landing.js: quem volta do detalhe de uma festa cai na lista, não no topo', () => {
  // O objeto vem de outro contexto (vm): compara pelo JSON.
  const da = (referrer, hash) => JSON.parse(JSON.stringify(rodarLandingJs({ referrer, hash }).rolagens));
  assert.deepEqual(da('http://127.0.0.1:8821/app?festa=disco-ao-por-do-sol'), [{ block: 'start', behavior: 'instant' }]);
  assert.equal(da('http://127.0.0.1:8821/app/?festa=x').length, 1);
  // Do pedido, de fora, sem referrer ou com âncora no endereço: fica onde o navegador puser.
  assert.equal(da('http://127.0.0.1:8821/app').length, 0);
  assert.equal(da('https://outro.site/app?festa=x').length, 0);
  assert.equal(da('').length, 0);
  assert.equal(da('http://127.0.0.1:8821/app?festa=x', '#lista').length, 0);
});

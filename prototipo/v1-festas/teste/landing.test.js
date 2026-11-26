'use strict';
// A landing (/), o app em /app e o detalhe sem pedido (/api/festa/<id>).
// A landing do desenho de 23/11/2026: menu, herói com a foto de uso e o
// cartão da festa, demo em três toques, como funciona, manifesto com o
// Instagram e rodapé. O menu, o botão do herói, o fim da demo e o rodapé
// levam ao protótipo. Relógio parado numa segunda, 16/11/2026.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { criarServidor } = require('../servidor');

const PUBLICO = path.join(__dirname, '..', 'publico');
const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
const HTML = fs.readFileSync(path.join(PUBLICO, 'landing.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PUBLICO, 'landing.css'), 'utf8');
const JS = fs.readFileSync(path.join(PUBLICO, 'landing.js'), 'utf8');
const mudo = { info() {}, warn() {}, error() {} };
const AGORA = Date.parse('2026-11-16T12:00:00-03:00');
const PEDIDO = { dia: 'sab', janela: 'comeco-da-noite', teto: 80 };
const abertos = [];
let raiz;
let raizVazia;
let pasta;

async function subir(opcoes) {
  // Só a base fictícia: dados/reais.json, quando existe, fica fora (reais: null).
  const s = criarServidor({ varDir: path.join(pasta, `var-${abertos.length}`), log: mudo, relogio: () => AGORA, reais: null, ...opcoes });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  abertos.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-landing-'));
  raiz = await subir({ dados: DADOS });
  raizVazia = await subir({ dados: path.join(pasta, 'nao-existe.json') });
});

after(async () => {
  await Promise.all(abertos.map((s) => new Promise((r) => s.close(r))));
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function pagina(caminho, origem = raiz) {
  const r = await fetch(origem + caminho, { redirect: 'manual' });
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

const trecho = (html, abre, fecha) => {
  const ini = html.indexOf(abre);
  return ini < 0 ? '' : html.slice(ini, html.indexOf(fecha, ini) + fecha.length);
};
const destaqueDe = (html) => trecho(html, '<div class="destaque"', 'Exemplo · festa fictícia</span>');
const aparelhoDe = (html) => trecho(html, '<div class="aparelho"', '<section class="como');

test('GET / serve a landing do desenho de 23/11: menu, herói com foto, demo, como funciona, manifesto e Instagram', async () => {
  const r = await pagina('/');
  assert.equal(r.status, 200);
  assert.match(r.tipo, /text\/html/);
  assert.match(r.corpo, /<title>finde\. seu guia inteligente de festas em São Paulo<\/title>/);
  assert.match(r.corpo, /<meta property="og:title" content="finde\. seu guia inteligente de festas em São Paulo">/);
  const h1 = r.corpo.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  assert.equal(h1.replace(/<[^>]+>/g, ''), 'Seu guia inteligente e personalizado de festas em São Paulo');
  // A idade do público saiu da landing em 25/11/2026, até ser validada.
  assert.doesNotMatch(r.corpo, /\bidade|anos, em média|Média de \d+ anos/i);
  // A ordem das seções do desenho.
  const ordem = ['<header class="menu"', '<section class="hero', '<section class="demo', '<section class="como', '<section class="final', '<footer class="rodape"'];
  const pos = ordem.map((s) => r.corpo.indexOf(s));
  assert.ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), pos.join(' '));
  // O D do herói é a saída para o protótipo (decisão de 17/11) e o único
  // convite para agir ali (25/11: menos CTAs; o Instagram fica no fim).
  assert.match(r.corpo, /<a class="botao" href="\/app">Achar a minha festa <span class="avanco" aria-hidden="true">››<\/span><\/a>/);
  const hero = trecho(r.corpo, '<section class="hero', '</section>');
  assert.deepEqual(links(hero).map((l) => l[0]), ['botao']);
  // A foto de uso sai de publico/, com texto alternativo.
  assert.match(hero, /<img src="\/uso-sofa\.jpg" width="1440" height="1800" alt="[^"]+">/);
  // A assinatura em inglês leva lang="en": o leitor de tela pronuncia certo.
  assert.match(r.corpo, /<p class="manifesto-assinatura" lang="en">still going out\.<br><span>just differently\.<\/span>/);
  assert.match(r.corpo, /Protótipo · festas fictícias/);
  assert.match(r.corpo, /href="\/favicon\.svg"/);
  // Nada que o grupo não aprovou, nada inventado, nenhum marcador sobrando.
  assert.doesNotMatch(r.corpo, /a pista abre antes|dança cedo/i);
  assert.doesNotMatch(r.corpo, /turma diz|\[Fala|\[Primeiro nome/i);
  assert.doesNotMatch(r.corpo, /\d+\s*%|a sua cara<\/span>/);
  assert.doesNotMatch(r.corpo, /__[A-Z_]+__/);
  // Nada de estilo nem script em linha: a CSP só aceita 'self'.
  assert.doesNotMatch(r.corpo, /\sstyle="|<style|<script>|\son[a-z]+="/);
  assert.equal((await pagina('/index.html')).corpo, r.corpo);
  assert.equal((await pagina('/landing.html')).status, 404);
});

// Os links da página, na ordem do Tab: [classe, destino, texto].
const links = (html) => [...html.matchAll(/<a(?: class="([^"]+)")? href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => [m[1] || '', m[2], m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()]);

test('o protótipo tem duas portas, no menu fixo e no herói; nenhuma abre uma festa', async () => {
  const { corpo } = await pagina('/');
  const doApp = links(corpo).filter((l) => l[1] === '/app');
  assert.deepEqual(doApp, [
    ['botao botao--topo', '/app', 'Abrir o app ››'],
    ['botao', '/app', 'Achar a minha festa ››'],
  ]);
  assert.doesNotMatch(corpo, /\?festa=|\/p\//);
  // Menos CTAs (25/11): sem menu de seções, sem navegação repetida no rodapé.
  assert.doesNotMatch(corpo, /menu-item|menu-botao|menu-movel|rodape-nav|destaque-ir/);
  // Todos os links da página: a marca, as duas portas, o pular e o Instagram.
  assert.deepEqual(links(corpo).map((l) => l[0]), ['pular', 'marca', 'botao botao--topo', 'botao', 'insta-arroba']);
  // Instagram: só o arroba, em aba nova, abaixo da lista.
  const insta = links(corpo).filter((l) => /instagram\.com/.test(l[1]));
  assert.equal(insta.length, 1);
  assert.equal(insta[0][2], '@heyfinde');
  assert.ok(insta.every((l) => l[1] === 'https://www.instagram.com/heyfinde/'));
});

// 24/11/2026: o Caio pediu a lista de e-mails de volta ("quer ficar por
// dentro?"). Um campo só, com a finalidade escrita ao lado, a isca para robô
// e o D do modo noite. O e-mail vai a /api/lista e nada mais sai da página.
test('a lista de e-mails: um campo e um botão, sem texto de saída no formulário, e só /api/lista recebe', async () => {
  const { corpo } = await pagina('/');
  const form = trecho(corpo, '<form class="lista"', '</form>');
  assert.ok(form, 'falta o formulário da lista');
  assert.match(form, /action="\/api\/lista" method="post"/);
  assert.equal((form.match(/<input /g) || []).length, 3, 'o e-mail, a isca e o "sair"');
  assert.match(form, /<label class="vh" for="lista-email">Seu e-mail<\/label>/);
  assert.match(form, /type="email" name="email"/);
  assert.match(form, /class="isca"[^>]*tabindex="-1"[^>]*aria-hidden="true"/);
  // Saída da lista fora do formulário (25/11): o link de cada e-mail leva a /?lista=sair.
  assert.doesNotMatch(form, /lista-sair|lista-finalidade|[Cc]ancelar|[Ss]air da lista/);
  assert.match(JS, /volta === 'sair'/);
  assert.match(corpo, /<h2 id="instagram-titulo">Quer ficar por dentro\?<\/h2>/);
  assert.doesNotMatch(corpo, /<textarea/);
  const destinos = [...JS.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(destinos, ['/api/lista']);
  assert.doesNotMatch(JS, /XMLHttpRequest|sessionStorage|\.submit\(\)/);
});

test('o cartão do herói sai do registro de Sexta Sem Pressa: hora primeiro, o preço, marcado como exemplo', async () => {
  const d = destaqueDe((await pagina('/')).corpo);
  assert.ok(d, 'o cartão está na página');
  assert.match(d, /role="group" aria-label="Exemplo de festa no finde, fictícia"/);
  assert.match(d, /<span class="destaque-mini">sex, 20 nov · Pinheiros<\/span>/);
  assert.match(d, /<span class="destaque-hora">18h00<\/span>/);
  assert.match(d, /<span class="destaque-nome">Sexta Sem Pressa<\/span>/);
  assert.match(d, /<span class="destaque-preco">a partir de R\$ 60<\/span>/);
  assert.doesNotMatch(d, /anos/);
  // É ilustração: nenhum link no cartão (25/11, menos CTAs).
  assert.doesNotMatch(d, /<a\s/);
  assert.ok(d.indexOf('destaque-hora') < d.indexOf('destaque-nome'), 'a hora vem antes do nome');
});

test('a demo: três telas com as festas da base, cada uma com o preço, e a saída para o app', async () => {
  const a = aparelhoDe((await pagina('/')).corpo);
  assert.ok(a, 'a demo está na página');
  assert.equal((a.match(/<div class="tela-demo"/g) || []).length, 3);
  // A lista: quatro festas fictícias, de sexta a domingo; só a do cartão se toca.
  const nomes = [...a.matchAll(/<span class="t-nome">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['Roda de Sexta', 'Sexta Sem Pressa', 'Vinil e Vinho', 'Domingo no Terraço']);
  assert.equal((a.match(/class="t-linha alvo" data-passo="1"/g) || []).length, 1);
  const precos = [...a.matchAll(/<span class="t-num">([^<]*)<\/span><span class="t-mini">Entrada<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(precos, ['R$ 30', 'R$ 60', 'R$ 110', 'R$ 50']);
  // A festa: a hora que começa, enche e acaba; a média de idade saiu (25/11/2026).
  assert.match(a, /sex, 20 nov · Pinheiros · a partir de R\$ 60/);
  assert.deepEqual([...a.matchAll(/<span class="t-tempo-hora">([^<]+)<\/span><span class="t-mini">([^<]+)<\/span>/g)].map((m) => `${m[2]} ${m[1]}`), ['Começa 18h', 'Enche 20h', 'Acaba 23h']);
  assert.doesNotMatch(a, /anos, em média|t-media/);
  // O convite no grupo e a saída.
  assert.match(a, /Bora na <i>sexta\?<\/i>/);
  assert.match(a, /<span class="t-placar" id="placar">3 de 4 dentro<\/span>/);
  // Os passos à esquerda apontam para as três telas.
  const { corpo } = await pagina('/');
  assert.deepEqual([...corpo.matchAll(/<li><button type="button" data-passo="(\d)">/g)].map((m) => m[1]), ['0', '1', '2']);
});

test('landing com a base vazia: sem cartão nem demo, o resto da página no lugar', async () => {
  const r = await pagina('/', raizVazia);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.corpo, /class="destaque"|class="aparelho"/);
  assert.match(r.corpo, /<h1[^>]*>Seu guia inteligente/);
  assert.match(r.corpo, /<a class="botao" href="\/app">Achar a minha festa/);
  assert.match(r.corpo, /<section class="final" id="instagram"/);
  assert.doesNotMatch(r.corpo, /__[A-Z_]+__/);
});

test('no endereço só da landing, as portas levam ao endereço do app e a página carrega inteira', async () => {
  const site = await subir({ dados: DADOS, site: 'landing', urlApp: 'https://finde-app.fly.dev/?de=landing&x=1' });
  const r = await pagina('/', site);
  assert.equal(r.status, 200);
  // O endereço entra escapado para HTML, nas duas portas: o menu fixo e o herói.
  const app = 'https://finde-app.fly.dev/?de=landing&amp;x=1';
  assert.deepEqual(links(r.corpo).filter((l) => l[1] === app).map((l) => l[0]), ['botao botao--topo', 'botao']);
  assert.doesNotMatch(r.corpo, /__[A-Z_]+__/);
  assert.match(destaqueDe(r.corpo), /Sexta Sem Pressa/);
  // Tudo o que a página e o estilo pedem a este servidor sai daqui, fotos inclusive.
  const pedidos = new Set([
    ...[...r.corpo.matchAll(/\b(?:href|src)="(\/[^"#?]+)"/g)].map((m) => m[1]),
    ...[...CSS.matchAll(/url\(\s*['"]?(\/[^'")?#\s]+)/g)].map((m) => m[1]),
    new URL(r.corpo.match(/<meta property="og:image" content="([^"]+)"/)[1]).pathname,
  ]);
  assert.ok(pedidos.has('/uso-sofa.jpg') && pedidos.has('/lambes.jpg'), [...pedidos].join(' '));
  for (const caminho of pedidos) {
    const resp = await fetch(site + caminho);
    assert.equal(resp.status, 200, caminho);
    if (caminho.endsWith('.jpg')) assert.equal(resp.headers.get('content-type'), 'image/jpeg');
  }
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
  // A média de idade e a origem dela saíram em 26/11/2026.
  assert.equal(o.origem, undefined);
  assert.equal(o.festa.mediaIdade, undefined);
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

test('landing.css segue o manual: sem raio fora do celular desenhado, sem gradiente, sem sombra, sem vidro', () => {
  const fora = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const raios = [...fora.matchAll(/([^{}]+)\{[^}]*border-radius:\s*([^;]+);/g)].map((m) => [m[1].trim(), m[2].trim()]);
  // Só o aparelho da demo (moldura, tela e a câmera) e o toque redondo têm canto.
  const permitidos = /^(\.aparelho|\.aparelho-tela|\.aparelho-tela::before|\.toque)$/;
  for (const [sel, v] of raios) if (v !== '0') assert.match(sel.split('\n').pop().trim(), permitidos, `${sel}: ${v}`);
  assert.doesNotMatch(CSS, /gradient\(|box-shadow|text-shadow|filter:\s*drop-shadow|backdrop-filter/);
  assert.doesNotMatch(CSS, /@import|googleapis/);
});

// As regras de um seletor exato, em qualquer bloco (fora e dentro de @media).
function regras(seletor) {
  const fora = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...fora.matchAll(new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'gm'))].map((m) => m[1]);
}

test('landing.css: o botão D é retângulo em caixa alta, 52 px; só o do menu e o de tela pequena têm 44', () => {
  const base = regras('.botao')[0];
  assert.match(base, /min-height:\s*52px/);
  assert.match(base, /padding:\s*0 32px/);
  assert.match(base, /font-size:\s*12px/);
  assert.match(base, /text-transform:\s*uppercase/);
  assert.match(base, /letter-spacing:\s*\.16em/);
  assert.match(base, /border-radius:\s*0/);
  assert.match(regras('.botao--topo')[0], /min-height:\s*44px/);
  const pequeno = CSS.match(/@media \(max-width: 359px\), \(max-height: 640px\) \{([\s\S]*?)\n\}/);
  assert.ok(pequeno, 'falta o corte de tela pequena');
  assert.match(pequeno[1], /\.botao \{ min-height: 44px; \}/);
  // O D do modo noite inverte as cores sobre bordô.
  assert.match(regras('.botao--noite')[0], /background:\s*var\(--nude\);\s*color:\s*var\(--bordo\)/);
});

test('o título do herói quebra pela frase e acompanha a coluna', async () => {
  const { corpo } = await pagina('/');
  assert.match(corpo, /<h1 id="hero-titulo">Seu guia inteligente <span class="inteiro">e personalizado<\/span> de festas <span class="inteiro">em São Paulo<\/span><\/h1>/);
  assert.match(regras('.inteiro')[0], /white-space:\s*nowrap/);
  // A régua vem do título antigo: "com gente da sua idade" media 7,72 vezes
  // o corpo. Os pedaços que não quebram agora ("e personalizado", "em São
  // Paulo") são mais curtos, então a conta continua do lado seguro.
  const m = regras('.hero h1').map((b) => b.match(/font-size:\s*clamp\((\d+)px,\s*([\d.]+)cqi,\s*(\d+)px\)/)).find(Boolean);
  assert.ok(m, 'o título acompanha a coluna pelo cqi');
  assert.ok((Number(m[2]) / 100) * 7.72 <= 0.95, `${m[2]}cqi`);
  assert.ok(Number(m[1]) * 7.72 <= 248, `mínimo ${m[1]}`);
  assert.match(regras('.hero-texto')[0], /container-type:\s*inline-size/);
  assert.match(regras('.hero-lead')[0], /text-wrap:\s*pretty/);
});

test('landing.css: o wordmark nunca fica abaixo de 36 px (cerca de 84 px de largura)', () => {
  const corpo = (bloco) => Number((bloco.match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(corpo(regras('.marca')[0]) >= 36);
  assert.doesNotMatch(CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /\.marca[^{-]*\{[^}]*font-size:\s*([0-2]\d|3[0-5])px/);
});

test('landing.css: numa coluna, o cartão sai de cima do celular da foto', () => {
  const coluna = CSS.match(/@media \(max-width: 860px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(coluna, /\.destaque \{ position: relative;/);
  assert.match(coluna, /\.uso \{ height: auto; aspect-ratio: 4 \/ 5; \}/);
});

test('landing.js: sem a demo e sem o menu na página, nada quebra', () => {
  assert.doesNotThrow(() => vm.runInNewContext(JS, { document: { getElementById: () => null, readyState: 'complete', documentElement: null } }));
});

// ------------------------------------------------------------ movimento

// Os blocos de CSS de uma @media (todos com essa abertura), sem comentários.
function blocosMedia(abertura) {
  const fora = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const achados = [];
  let ini = fora.indexOf(`@media ${abertura} {`);
  while (ini >= 0) {
    let n = 0;
    for (let i = fora.indexOf('{', ini); i < fora.length; i++) {
      if (fora[i] === '{') n++;
      else if (fora[i] === '}' && --n === 0) { achados.push(fora.slice(ini, i + 1)); ini = i; break; }
    }
    ini = fora.indexOf(`@media ${abertura} {`, ini + 1);
  }
  return achados;
}
const blocoMedia = (abertura) => blocosMedia(abertura).join('\n') || null;

test('landing.js carrega no <head> sem defer: a classe do movimento entra antes da primeira pintura', () => {
  const cabeca = HTML.match(/<head>([\s\S]*?)<\/head>/)[1];
  assert.match(cabeca, /<script src="\/landing\.js"><\/script>/);
  assert.ok(cabeca.indexOf('landing.css') < cabeca.indexOf('landing.js'), 'o CSS vem antes do script');
});

test('landing.css: o vocabulário de movimento é o comum (--mov-*)', () => {
  const raiz = regras(':root')[0];
  assert.match(raiz, /--mov-saida:\s*cubic-bezier\(\.2, \.7, \.2, 1\)/);
  assert.match(raiz, /--mov-troca:\s*cubic-bezier\(\.6, 0, \.2, 1\)/);
  for (const [nome, ms] of [['toque', 160], ['estado', 320], ['bloco', 560], ['titulo', 900], ['passo', 60]]) {
    assert.match(raiz, new RegExp(`--mov-${nome}:\\s*${ms}ms`), nome);
  }
});

test('landing.css: sem JavaScript tudo aparece; só .mov esconde, e só com movimento liberado', () => {
  const fora = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const livre = blocoMedia('(prefers-reduced-motion: no-preference)');
  assert.ok(livre.trim(), 'falta o bloco de movimento liberado');
  // Fora dos blocos de movimento, nada nasce invisível nem fechado.
  let resto = fora;
  for (const ab of ['(prefers-reduced-motion: no-preference)', '(prefers-reduced-motion: reduce)']) {
    for (const b of blocosMedia(ab)) resto = resto.replace(b, '');
  }
  resto = resto.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  assert.doesNotMatch(resto, /opacity:\s*0[;\s}]/);
  assert.doesNotMatch(resto, /scaleX\(0\)/);
  assert.doesNotMatch(resto, /clip-path:\s*inset\(0 0 100%/);
  // Dentro, toda regra que esconde depende de .mov (posta pelo script).
  const movidos = [...livre.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /opacity:\s*0[;\s]|scaleX\(0\)/.test(m[2]))
    ;
  assert.ok(movidos.length > 5);
  for (const m of movidos) {
    for (const sel of m[1].split(/,(?![^(]*\))/)) assert.match(sel.trim(), /^\.mov\b/, sel.trim());
  }
});

test('landing.css: movimento só com transform, opacity e clip-path; sem laço infinito', () => {
  const quadros = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^}]*\})*)[^}]*\}/g)];
  assert.ok(quadros.length >= 4);
  for (const [, nome, corpo] of quadros) {
    const props = [...corpo.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
    assert.ok(props.every((p) => ['transform', 'opacity', 'clip-path'].includes(p)), `${nome}: ${props}`);
  }
  assert.doesNotMatch(CSS, /infinite/);
  const trans = [...CSS.matchAll(/transition(?:-property)?:\s*([^;]+);/g)].map((m) => m[1]);
  for (const t of trans) {
    for (const p of t.split(',').map((x) => x.trim().split(/\s+/)[0])) {
      assert.ok(['transform', 'opacity', 'color', 'background-color', 'outline-offset'].includes(p), `transição em ${p}`);
    }
  }
});

test('landing.css: com movimento reduzido nada se desloca', () => {
  const reduzido = blocoMedia('(prefers-reduced-motion: reduce)');
  assert.ok(reduzido, 'falta o bloco de movimento reduzido');
  assert.match(reduzido, /\*, \*::before, \*::after \{ animation: none !important;/);
  // Nada sobra: nem o toque que pulsa na demo.
  const sobra = [...reduzido.matchAll(/animation:\s*([\w-]+)/g)].filter((m) => m[1] !== 'none');
  assert.deepEqual(sobra, []);
  assert.match(CSS, /@keyframes mov-surge \{ from \{ opacity: 0; \} \}/);
  // O rolar suave do âncora também só com movimento liberado.
  assert.match(blocoMedia('(prefers-reduced-motion: no-preference)') || '', /scroll-behavior:\s*smooth/);
});

// landing.js com uma janela de mentira: decide o movimento no <head>.
function rodarMovimento({ reduzido = false, io = true } = {}) {
  const classes = new Set();
  const relogios = [];
  const ouvintes = {};
  const raiz = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } };
  const document = {
    documentElement: raiz,
    readyState: 'loading',
    getElementById: () => null,
    addEventListener: (tipo, f) => { ouvintes[tipo] = f; },
  };
  const window = {
    matchMedia: (q) => ({ matches: /no-preference/.test(q) ? !reduzido : false }),
    ...(io ? { IntersectionObserver: function IO() {} } : {}),
  };
  class Element {}
  Element.prototype.animate = () => {};
  vm.runInNewContext(JS, {
    window, document, Element,
    setTimeout: (f, ms) => { relogios.push({ f, ms }); return relogios.length; },
    clearTimeout: () => {},
  });
  return { classes, relogios, ouvintes };
}

test('landing.js: põe .mov já no <head>, e o socorro a tira se a chegada não começar', () => {
  const m = rodarMovimento();
  assert.ok(m.classes.has('mov'), 'a classe entra antes do DOM pronto');
  assert.ok(m.ouvintes.DOMContentLoaded, 'o resto espera o DOM');
  const socorro = m.relogios.find((r) => r.ms === 3000);
  assert.ok(socorro, 'há um socorro de 3 s');
  socorro.f();
  assert.equal(m.classes.has('mov'), false, 'sem chegada, a página aparece como está');
});

test('landing.js: com movimento reduzido ou sem IntersectionObserver, a página fica parada e visível', () => {
  assert.equal(rodarMovimento({ reduzido: true }).classes.has('mov'), false);
  assert.equal(rodarMovimento({ io: false }).classes.has('mov'), false);
});

test('landing.js: depois do socorro, o movimento não começa mais (nada é partido)', () => {
  const m = rodarMovimento();
  m.relogios.find((r) => r.ms === 3000).f();
  const antes = m.relogios.length;
  assert.doesNotThrow(() => m.ouvintes.DOMContentLoaded());
  assert.equal(m.relogios.length, antes, 'nenhuma espera nova: a chegada não é agendada');
  assert.equal(m.classes.has('mov'), false);
});

test('landing.js: um foco num bloco que ainda entra o põe pronto na hora', () => {
  assert.match(JS, /addEventListener\('focusin'/);
  assert.match(JS, /classList\.add\('ja', 'fim'\)/);
  assert.match(JS, /classList\.add\('chegou', 'chegou-fim'\)/);
});

test('landing.css: só títulos e fios se deslocam; o texto de apoio entra por opacidade', () => {
  const livre = blocoMedia('(prefers-reduced-motion: no-preference)');
  assert.doesNotMatch(livre, /animation:\s*mov-sobe\b/);
  // O que se desloca: linhas de título, fios, fotos que abrem e o toque da demo.
  const animados = [...livre.matchAll(/animation:\s*(mov-[\w-]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(animados)].sort(), ['mov-abre', 'mov-fio', 'mov-linha', 'mov-surge', 'mov-toque']);
  assert.doesNotMatch(CSS, /mov-desliza/);
  // O botão do app acende junto da segunda linha do título, antes de 400 ms.
  const acoes = livre.match(/\.hero-acoes > \* \{ animation: mov-surge var\(--mov-estado\) var\(--mov-saida\) (\d+)ms both; \}/);
  assert.ok(acoes, 'os botões do herói entram por opacidade, juntos');
  assert.ok(Number(acoes[1]) <= 400, `botões em ${acoes[1]} ms`);
});

test('landing.css: o vocabulário que a landing divide com o app', () => {
  const raiz = regras(':root')[0];
  assert.match(raiz, /--mov-sobe-px:\s*10px/);
  assert.match(raiz, /--mov-linha-passo:\s*60ms/);
  assert.match(raiz, /--mov-italico-atraso:\s*280ms/);
  assert.match(raiz, /--mov-toque-escala:\s*\.98/);
  assert.match(CSS, /\.botao:active:not\(:disabled\) \{ transform: scale\(var\(--mov-toque-escala\)\); \}/);
  assert.match(JS, /ler\('linha-passo', 'passo'\)/);
  assert.match(JS, /ler\('italico-atraso', 'tarde'\)/);
});

test('/?lista=sair vem do servidor no modo de remover: funciona sem JavaScript (LGPD)', async () => {
  const r = await pagina('/?lista=sair');
  assert.equal(r.status, 200);
  const form = trecho(r.corpo, '<form class="lista"', '</form>');
  assert.match(form, /<input type="hidden" name="sair" value="1">/);
  assert.match(form, /<span class="lista-acao">Remover e-mail<\/span>/);
  assert.match(r.corpo, /<h2 id="instagram-titulo">Sair da lista<\/h2>/);
  assert.match(r.corpo, /<p class="insta-texto" hidden>/);
  // A página normal segue de inscrição.
  const n = await pagina('/');
  assert.match(n.corpo, /<input type="hidden" name="sair" value="0">/);
  assert.match(n.corpo, /<h2 id="instagram-titulo">Quer ficar por dentro\?<\/h2>/);
  assert.doesNotMatch(n.corpo, /__LISTA_[A-Z]+__/);
});

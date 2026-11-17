'use strict';
// A landing (/), o app em /app e o detalhe sem pedido (/api/festa/<id>).
// A landing é a porta: o cabeçalho, o botão do herói, o link depois dos
// pilares e o rodapé levam ao protótipo, o convite é só ilustração e a lista
// da semana saiu. Relógio parado numa segunda, 16/11/2026.
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
const PEDIDO = { dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 };
const abertos = [];
let raiz;
let raizVazia;
let pasta;

async function subir(opcoes) {
  const s = criarServidor({ varDir: path.join(pasta, `var-${abertos.length}`), log: mudo, relogio: () => AGORA, ...opcoes });
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

const conviteDe = (html) => {
  const ini = html.indexOf('<figure class="convite"');
  return ini < 0 ? '' : html.slice(ini, html.indexOf('</figure>', ini) + '</figure>'.length);
};

test('GET / serve a landing: título, herói, o botão para o protótipo e a assinatura', async () => {
  const r = await pagina('/');
  assert.equal(r.status, 200);
  assert.match(r.tipo, /text\/html/);
  assert.match(r.corpo, /<title>finde\. still going out\. just differently\.<\/title>/);
  assert.match(r.corpo, /<meta property="og:title" content="finde\. still going out\. just differently\.">/);
  const h1 = r.corpo.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  assert.equal(h1.replace(/<[^>]+>/g, ''), 'Festas que começam no seu horário, com gente da sua idade');
  // O D do herói é a saída para o protótipo, com um rótulo que diz isso; sem
  // FINDE_SITE, o app está em /app. O C desce até o formulário.
  assert.match(r.corpo, /<a class="botao" href="\/app">Achar a minha festa<\/a>/);
  assert.match(r.corpo, /<a class="link-fio" href="#lista">ou receba a lista por e-mail/);
  // O link do cabeçalho também leva ao app; o e-mail fica com o C do herói.
  assert.match(r.corpo, /<a class="topo-app" href="\/app">Abrir o app<\/a>/);
  assert.match(r.corpo, /<section id="lista" class="inscricao/);
  // O D vem antes do C, e os dois ficam no herói, acima do convite.
  const hero = r.corpo.slice(r.corpo.indexOf('<section class="hero'), r.corpo.indexOf('<figure class="convite"'));
  assert.ok(hero.indexOf('class="botao"') >= 0 && hero.indexOf('class="botao"') < hero.indexOf('class="link-fio"'));
  // A assinatura em inglês leva lang="en": o leitor de tela pronuncia certo.
  assert.match(r.corpo, /<p class="manifesto-assinatura" lang="en">still going out\.<br><span>just differently\.<\/span>/);
  assert.match(r.corpo, /Protótipo · festas fictícias/);
  assert.match(r.corpo, /href="\/favicon\.svg"/);
  // Nada que o grupo não aprovou, nada inventado, nenhum marcador sobrando.
  assert.doesNotMatch(r.corpo, /a pista abre antes|dança cedo/i);
  assert.doesNotMatch(r.corpo, /turma diz|\[Fala|\[Primeiro nome/i);
  assert.doesNotMatch(r.corpo, /\d+\s*%/);
  assert.doesNotMatch(r.corpo, /__[A-Z_]+__/);
  assert.equal((await pagina('/index.html')).corpo, r.corpo);
  assert.equal((await pagina('/landing.html')).status, 404);
});

test('a lista da semana saiu da landing, com tudo o que era dela', async () => {
  const { corpo } = await pagina('/');
  assert.doesNotMatch(corpo, /A lista da semana|id="festas"|href="#festas"/);
  assert.doesNotMatch(corpo, /class="(painel|filtros?|linhas?|vazio)"|id="(linhas|vazio|contagem)"/);
  assert.doesNotMatch(corpo, /Montar a lista|Deixar com a sua cara/);
  // Nenhum link da landing abre uma festa: todo caminho para o app vai à
  // primeira pergunta (cabeçalho, D do herói, C depois dos pilares, rodapé).
  assert.doesNotMatch(corpo, /\?festa=/);
  assert.deepEqual([...corpo.matchAll(/href="(\/app[^"]*)"/g)].map((m) => m[1]), ['/app', '/app', '/app', '/app']);
  // O modelo, o script e o estilo não guardam sobras.
  assert.doesNotMatch(HTML, /__LISTA__|__VAZIO__/);
  assert.match(HTML, /__CONVITE__/);
  assert.match(HTML, /<a class="botao" href="__URL_APP__">/);
  assert.doesNotMatch(JS, /filtr|sessionStorage|scrollIntoView|referrer|#linhas|festas/);
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(semComentario, /\.(painel|filtros?|linhas?|vazio|festas|sem-quebra|link-fio--noite)\b/);
});

// Os links da página, na ordem do Tab: [classe, destino, texto].
const links = (html) => [...html.matchAll(/<a class="([^"]+)" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => [m[1], m[2], m[3].replace(/<[^>]+>/g, '').trim()]);

test('o protótipo tem porta no cabeçalho, no herói, depois dos pilares e no rodapé', async () => {
  const { corpo } = await pagina('/');
  const lista = links(corpo);
  assert.deepEqual(lista, [
    ['pular', '#conteudo', 'Pular para o conteúdo'],
    ['marca', '/', 'finde.'],
    ['topo-app', '/app', 'Abrir o app'],
    ['botao', '/app', 'Achar a minha festa'],
    ['link-fio', '#lista', 'ou receba a lista por e-mail'],
    ['link-fio', '/app', 'Achar a minha festa'],
    ['rodape-app', '/app', 'Abrir o app'],
  ]);
  // Quem rola até o fim sai pelo rodapé, depois do formulário e da marca.
  const rodape = corpo.slice(corpo.indexOf('<footer'), corpo.indexOf('</footer>'));
  assert.match(rodape, /<a class="rodape-app" href="\/app">Abrir o app<\/a>/);
  assert.ok(corpo.indexOf('</form>') < corpo.indexOf('class="rodape-app"'));
  // No cabeçalho e no rodapé, o link tem o fio rosé embaixo das letras: no
  // rodapé, é o que o separa dos rótulos ao lado.
  const nav = regras('.topo-app')[0];
  assert.ok(nav && nav === regras('.rodape-app')[0], 'os dois links têm a mesma regra');
  assert.match(nav, /text-decoration:\s*underline/);
  assert.match(nav, /text-decoration-color:\s*var\(--rose\)/);
  assert.match(nav, /min-height:\s*44px/);
  // A segunda entrada fecha a seção dos pilares, que descrevem o app, e vem
  // antes do formulário.
  const pilares = corpo.slice(corpo.indexOf('<section class="pilares'), corpo.indexOf('<section class="manifesto'));
  assert.match(pilares, /<p class="pilares-acao"><a class="link-fio" href="\/app">Achar a minha festa <svg class="seta"[^>]*aria-hidden="true"/);
  assert.ok(pilares.lastIndexOf('class="pilar"') < pilares.indexOf('pilares-acao'));
  assert.ok(corpo.indexOf('pilares-acao') < corpo.indexOf('<form'));
  // Ela ocupa a linha inteira da grade, embaixo dos três.
  assert.match(regras('.pilares-acao')[0], /grid-column:\s*1 \/ -1/);
});

test('os pilares descrevem o protótipo; "lista" fica só com o e-mail', async () => {
  const { corpo } = await pagina('/');
  const pilares = corpo.slice(corpo.indexOf('<section class="pilares'), corpo.indexOf('<section class="manifesto'));
  const titulos = [...pilares.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(titulos, ['Horário primeiro', 'Convite para o grupo', 'Com a sua cara']);
  // O primeiro fala da pergunta de horário do app ("A que horas chegar e voltar?").
  assert.match(pilares, /<p>Diga a que horas quer chegar e voltar, e o finde mostra as festas que cabem nesse horário\.<\/p>/);
  assert.doesNotMatch(pilares, /lista|semana/i);
  assert.doesNotMatch(corpo, /Lista pronta|chegam selecionadas/);
  // No texto da página, "lista" só aparece no caminho do e-mail.
  const texto = corpo
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<section id="lista"[\s\S]*?<\/section>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/ou receba a lista por e-mail/, '');
  assert.doesNotMatch(texto, /\blista\b/i);
});

test('o título do herói quebra pela frase, sem "com" nem "seu" no fim da linha', async () => {
  const { corpo } = await pagina('/');
  // "no seu horário," e "com gente" não se separam; o resto quebra normal.
  assert.match(corpo, /<h1 id="hero-titulo">Festas que começam <span class="inteiro">no seu horário,<\/span> <span class="inteiro">com gente<\/span> da sua idade<\/h1>/);
  assert.match(regras('.inteiro')[0], /white-space:\s*nowrap/);
  // Em três linhas, a mais longa é "com gente da sua idade": 7,72 vezes o
  // corpo em Instrument Serif (medido no Chrome). Com o corpo em 12% da
  // coluna, ela ocupa 93% e nunca quebra em "com gente da sua / idade".
  const LINHA_MAIS_LONGA = 7.72;
  const corpoH1 = regras('.hero h1').map((b) => b.match(/font-size:\s*clamp\((\d+)px,\s*([\d.]+)cqi,\s*(\d+)px\)/)).find(Boolean);
  assert.ok(corpoH1, 'o título acompanha a coluna pelo cqi');
  const [, minimo, cqi] = corpoH1.map(Number);
  assert.ok((Number(cqi) / 100) * LINHA_MAIS_LONGA <= 0.95, `${cqi}cqi`);
  // O mínimo só pega abaixo de 280 de tela (coluna de 248 px, com 16 de cada lado).
  assert.ok(minimo * LINHA_MAIS_LONGA <= 248, `mínimo ${minimo}`);
});

test('o título do herói é o maior da página fora a assinatura: pilares e e-mail em até 85% dele', () => {
  const num = (s) => Number(s);
  const h1 = regras('.hero h1').map((b) => b.match(/clamp\((\d+)px,\s*([\d.]+)cqi,\s*(\d+)px\)/)).find(Boolean).slice(1).map(num);
  const tamanhoH1 = (coluna) => Math.min(h1[2], Math.max(h1[0], (h1[1] / 100) * coluna));
  // No celular (até 560), a coluna é a tela menos o recuo dos dois lados.
  const lateral = (vw) => Math.min(48, Math.max(16, vw * 0.05));
  const celular = CSS.match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}/)[1];
  const m = celular.match(/\.pilar h2, \.inscricao h2 \{ font-size: min\((\d+)px, ([\d.]+)vw\); \}/);
  assert.ok(m, 'no celular, pilares e e-mail acompanham o título');
  for (let vw = 320; vw <= 560; vw += 10) {
    const titulo = tamanhoH1(vw - 2 * lateral(vw));
    const outro = Math.min(num(m[1]), (num(m[2]) / 100) * vw);
    assert.ok(outro <= 0.85 * titulo, `${vw}: ${outro.toFixed(1)} x ${titulo.toFixed(1)}`);
  }
  // No desktop, a coluna do título tem de 380 a 520 px.
  const inscricao = regras('.inscricao h2')[0].match(/clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/).slice(1).map(num);
  const pilar = regras('.pilar h2')[0].match(/clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/).slice(1).map(num);
  assert.ok(inscricao[2] <= 0.85 * tamanhoH1(520), `e-mail ${inscricao[2]} x ${tamanhoH1(520)}`);
  assert.ok(inscricao[2] >= pilar[2], 'o título do e-mail não fica menor que o dos pilares');
  // Lado a lado a partir de 1000: coluna de 380 (h1 45,6) e e-mail em 3,8vw de 1000.
  assert.ok((inscricao[1] / 100) * 1000 <= 0.85 * tamanhoH1(380));
});

test('landing.css: sem viúva no texto do herói nem na nota do formulário', () => {
  // Alinhado à esquerda, "pretty" segura a última palavra; centralizado, "balance".
  assert.match(regras('.hero-lead')[0], /text-wrap:\s*pretty/);
  assert.match(regras('.nota-prototipo')[0], /text-wrap:\s*balance/);
  assert.match(regras('.pilar p')[0], /text-wrap:\s*pretty/);
});

test('landing.css: a legenda do convite fica no alto das anotações e, numa coluna, depois delas', () => {
  // Na linha do topo do cartão, ela não muda a altura do convite: a coluna de
  // texto do herói continua com a altura do cartão.
  assert.match(regras('.cv-legenda')[0], /grid-column:\s*2;\s*grid-row:\s*1;\s*align-self:\s*start/);
  const umaColuna = CSS.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(umaColuna, /\.nota-3 \{ grid-row: 7;/);
  assert.match(umaColuna, /\.cv-legenda \{ grid-column: 1; grid-row: 8; margin-top: \d+px; \}/);
});

test('landing.css: pilares em uma coluna ou em três, nunca dois mais um', () => {
  const base = regras('.pilares')[0];
  assert.match(base, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(CSS, /auto-fit|auto-fill/);
  const tres = CSS.match(/@media \(min-width: (\d+)px\) \{\s*\.pilares \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.ok(tres, 'três colunas a partir de uma largura');
  assert.ok(Number(tres[1]) >= 900 && Number(tres[1]) <= 1000, tres[1]);
});

test('o convite do herói sai do registro de Sexta Sem Pressa', async () => {
  const convite = conviteDe((await pagina('/')).corpo);
  assert.match(convite, /Convite · sex, 20 nov/);
  assert.match(convite, /Bora na <i>sexta\?<\/i>/);
  assert.match(convite, /<span class="cv-hora">18h00<\/span><span class="cv-rotulo">Média 32 anos<\/span>/);
  assert.match(convite, /<span class="cv-origem">informada pela produtora<\/span>/);
  assert.match(convite, /<span class="cv-nome">Sexta Sem Pressa<\/span>/);
  // A frase é a do registro; no desenho, a hora anda com o verbo (espaço e
  // hífen que não quebram), e "casa · preço · produtora" só quebra antes do "·".
  const lido = convite.replace(/ /g, ' ').replace(/‑/g, '-');
  assert.match(lido, /Começa às 18h, a pista enche às 20h e acaba às 23h\./);
  assert.match(convite, /e acaba às 23h\./);
  assert.match(convite, /<span class="cv-onde">terraço em Pinheiros · a partir de R\$ 60 · Coletivo Expediente<\/span>/);
  assert.match(convite, /Idade média do público, informada pela produtora/);
  assert.match(convite, /A hora que começa, enche e acaba/);
  assert.match(convite, /Seu grupo responde no próprio convite/);
});

test('o convite do herói é ilustração: nada nele se clica nem recebe foco', async () => {
  const convite = conviteDe((await pagina('/')).corpo);
  assert.ok(convite, 'o convite está na página');
  assert.doesNotMatch(convite, /<(a|button|input|select|textarea|details|label)\b/i);
  assert.doesNotMatch(convite, /\s(href|tabindex|onclick|contenteditable|role="(button|link)")[=\s>]/i);
  // "Tô dentro" e "Não rola" têm cara de botão e não são: dois spans
  // escondidos do leitor de tela, num conjunto que tem nome próprio.
  const botoes = convite.match(/<div class="cv cv-botoes"([^>]*)>([\s\S]*?)<\/div>/);
  assert.ok(botoes, 'os botões desenhados estão no convite');
  assert.match(botoes[1], /role="img"/);
  assert.match(botoes[1], /aria-label="[^"]*Tô dentro[^"]*Não rola[^"]*"/);
  const spans = [...botoes[2].matchAll(/<span class="cv-botao[^"]*"([^>]*)>([^<]+)<\/span>/g)];
  assert.deepEqual(spans.map((m) => m[2]), ['Tô dentro', 'Não rola']);
  assert.ok(spans.every((m) => /aria-hidden="true"/.test(m[1])), 'cada um fora da árvore de acessibilidade');
  // A figura inteira também tem nome: aponta para a legenda, que diz o que é.
  const id = (convite.match(/^<figure class="convite" aria-labelledby="([^"]+)"/) || [])[1];
  assert.ok(id, 'a figura do convite tem rótulo');
  const legenda = convite.match(new RegExp(`<figcaption id="${id}"[^>]*>([^<]+)</figcaption>`));
  assert.ok(legenda, 'a legenda existe');
  assert.match(legenda[1], /Exemplo de convite do finde/);
});

test('o formulário de e-mail é só visual: sem action, sem nome no campo, botão desligado sem JS', async () => {
  const { corpo } = await pagina('/');
  const form = corpo.match(/<form[^>]*>[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(form, /action=|method=/);
  assert.doesNotMatch(form, /<input[^>]*\bname=/);
  assert.match(form, /<button class="botao" type="submit" disabled>Quero receber<\/button>/);
  assert.doesNotMatch(JS, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|\.submit\(\)/);
  assert.match(JS, /Isto é um protótipo: seu e-mail não foi enviado nem guardado\./);
  // O aviso honesto aparece antes do gesto, fixo na página, e o campo aponta para ele.
  assert.match(corpo, /<p id="email-nota" class="nota-prototipo">Protótipo: este formulário não envia nem guarda nada\.<\/p>/);
  assert.match(form, /aria-describedby="email-nota email-erro"/);
  assert.ok(corpo.indexOf('id="email-nota"') < corpo.indexOf('id="aviso-prototipo"'));
});

test('landing com a base vazia: sem convite, o resto da página no lugar', async () => {
  const r = await pagina('/', raizVazia);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.corpo, /<figure class="convite"/);
  assert.match(r.corpo, /<h1[^>]*>Festas que começam/);
  assert.match(r.corpo, /<a class="botao" href="\/app">Achar a minha festa<\/a>/);
  assert.match(r.corpo, /<section id="lista" class="inscricao/);
  assert.doesNotMatch(r.corpo, /__[A-Z_]+__/);
});

test('no endereço só da landing, o botão leva ao endereço do app e a página carrega inteira', async () => {
  const site = await subir({ dados: DADOS, site: 'landing', urlApp: 'https://finde-app.fly.dev/?de=landing&x=1' });
  const r = await pagina('/', site);
  assert.equal(r.status, 200);
  // O endereço entra escapado para HTML, nas quatro entradas para o app.
  assert.match(r.corpo, /<a class="botao" href="https:\/\/finde-app\.fly\.dev\/\?de=landing&amp;x=1">Achar a minha festa<\/a>/);
  assert.deepEqual(links(r.corpo).filter((l) => /^(Achar|Abrir)/.test(l[2])).map((l) => [l[0], l[1]]), [
    ['topo-app', 'https://finde-app.fly.dev/?de=landing&amp;x=1'],
    ['botao', 'https://finde-app.fly.dev/?de=landing&amp;x=1'],
    ['link-fio', 'https://finde-app.fly.dev/?de=landing&amp;x=1'],
    ['rodape-app', 'https://finde-app.fly.dev/?de=landing&amp;x=1'],
  ]);
  assert.doesNotMatch(r.corpo, /__[A-Z_]+__/);
  assert.match(conviteDe(r.corpo), /Sexta Sem Pressa/);
  // Tudo o que a página e o estilo pedem a este servidor sai daqui.
  const pedidos = new Set([
    ...[...r.corpo.matchAll(/\b(?:href|src)="(\/[^"#?]+)"/g)].map((m) => m[1]),
    ...[...CSS.matchAll(/url\(\s*['"]?(\/[^'")?#\s]+)/g)].map((m) => m[1]),
    new URL(r.corpo.match(/<meta property="og:image" content="([^"]+)"/)[1]).pathname,
  ]);
  assert.ok(pedidos.size >= 8, [...pedidos].join(' '));
  for (const caminho of pedidos) assert.equal((await fetch(site + caminho)).status, 200, caminho);
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
  assert.match(pequeno[1], /\.botao \{ min-height: 44px; \}/);
  assert.doesNotMatch(pequeno[1], /cv-botao/);
  const semCorte = CSS.replace(pequeno[0], '');
  const alturas = [...semCorte.matchAll(/(?<![\w-])\.botao\s*\{[^}]*?min-height:\s*(\d+)px/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(alturas)], ['52']);
  const recuos = [...semCorte.matchAll(/(?<![\w-])\.botao\s*\{[^}]*?padding:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(recuos)], ['0 32px']);
  // "Tô dentro" e "Não rola", no convite do herói, são miniaturas: mais
  // baixos e com corpo menor que o D, que é o único botão de tamanho cheio.
  const cv = regras('.cv-botao')[0];
  const num = (bloco, prop) => Number(bloco.match(new RegExp(`${prop}:\\s*(\\d+)px`))[1]);
  assert.ok(num(cv, 'min-height') <= 42, cv);
  assert.ok(num(cv, 'font-size') < num(base, 'font-size'), cv);
  assert.equal(CSS.match(/(?<![\w-])\.cv-botao[^{]*\{[^}]*min-height/g).length, 1, 'nenhum corte aumenta a miniatura');
});

test('landing.css: lado a lado desde 1000 de tela, o texto tem a altura do cartão e o D não se alinha com "Tô dentro"', () => {
  const lado = CSS.match(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/);
  assert.ok(lado, 'falta o corte de texto e convite lado a lado');
  // O corte é a tela em que texto, vão e convite cabem na faixa: o mesmo
  // ponto em que o flex deixa os dois na mesma linha. Ele pega o iPad
  // deitado e a janela de notebook de 1024.
  const px = (bloco, prop) => Number((bloco.match(new RegExp(`(?:^|[;\\s])${prop}:[^;]*?(\\d+)px`)) || [])[1]);
  const lateral = Number(CSS.match(/--lateral:\s*clamp\(\d+px,\s*[\d.]+vw,\s*(\d+)px\)/)[1]);
  const esperado = px(regras('.hero-texto')[0], 'flex') + px(regras('.hero')[0], 'column-gap') + px(regras('.convite')[0], 'flex') + 2 * lateral;
  assert.equal(Number(lado[1]), esperado);
  assert.ok(esperado <= 1024, `lado a lado só a partir de ${esperado}`);
  // A coluna de texto vai do topo ao pé do cartão: o rótulo na linha de cima
  // e o último botão do herói na de baixo. Nada a desce até a linha dos
  // botões desenhados no convite, que ficam acima do pé do cartão.
  assert.match(lado[2], /\.hero-texto \{[^}]*align-self: stretch;[^}]*justify-content: space-between/);
  assert.doesNotMatch(lado[2], /cv-pe/);
  assert.doesNotMatch(CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /\.hero-texto[^{]*\{[^}]*cv-pe/);
  assert.match(regras('.cv-botoes')[0], /padding-bottom:\s*var\(--cv-pe\)/);
  // Empilhado (um px antes do corte), o convite ocupa a faixa toda; lado a
  // lado, ele vai até 520.
  assert.match(regras('.convite')[0], /max-width:\s*520px/);
  assert.match(CSS, new RegExp(`@media \\(max-width: ${esperado - 1}px\\) \\{\\s*\\.convite \\{ max-width: none; \\}`));
  // O título acompanha a coluna.
  assert.ok(regras('.hero h1').some((b) => /font-size:\s*clamp\(32px,\s*12cqi,\s*80px\)/.test(b)));
  assert.match(regras('.hero-texto')[0], /container-type:\s*inline-size/);
});

test('landing.css: o wordmark nunca fica abaixo de 36 px (cerca de 84 px de largura)', () => {
  const corpo = (bloco) => Number((bloco.match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(corpo(regras('.marca')[0]) >= 36);
  assert.ok(corpo(regras('.cv-marca')[0]) >= 36);
  for (const b of regras('.marca--rodape')) assert.ok(!/font-size/.test(b) || corpo(b) >= 36, b);
});

// landing.js num DOM de mentira: só o formulário de e-mail.
function rodarLandingJs() {
  const elemento = (extra = {}) => {
    const attrs = {};
    const ouvintes = {};
    return {
      textContent: '', value: '', disabled: false, ...extra,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return k in attrs ? attrs[k] : null; },
      hasAttribute(k) { return k in attrs; },
      removeAttribute(k) { delete attrs[k]; },
      addEventListener(tipo, f) { ouvintes[tipo] = f; },
      disparar(tipo, e = {}) { ouvintes[tipo](e); },
      focus() { focado.push(this); },
    };
  };
  const focado = [];
  const botao = elemento({ disabled: true });
  const form = elemento({ querySelector: (s) => (s === 'button[type="submit"]' ? botao : null) });
  const porId = { 'form-lista': form, email: elemento(), 'email-erro': elemento(), 'aviso-prototipo': elemento() };
  const document = { getElementById: (id) => porId[id] || null };
  vm.runInNewContext(JS, { document });
  const enviar = (valor) => {
    let impedido = false;
    porId.email.value = valor;
    form.disparar('submit', { preventDefault() { impedido = true; } });
    return impedido;
  };
  return { botao, campo: porId.email, erro: porId['email-erro'], aviso: porId['aviso-prototipo'], enviar, focado };
}

test('landing.js: o formulário confere o e-mail, avisa que é protótipo e não manda nada', () => {
  const f = rodarLandingJs();
  assert.equal(f.botao.disabled, false, 'com JavaScript, o botão liga');
  assert.equal(f.enviar(''), true, 'o envio nunca sai da página');
  assert.equal(f.erro.textContent, 'Escreva o seu e-mail.');
  assert.equal(f.campo.getAttribute('aria-invalid'), 'true');
  assert.equal(f.focado.length, 1);
  assert.equal(f.enviar('voce@email'), true);
  assert.equal(f.erro.textContent, 'Esse e-mail parece incompleto.');
  assert.equal(f.aviso.textContent, '');
  // Digitar de novo limpa o erro.
  f.campo.disparar('input');
  assert.equal(f.campo.hasAttribute('aria-invalid'), false);
  assert.equal(f.erro.textContent, '');
  assert.equal(f.enviar('  voce@email.com '), true);
  assert.equal(f.erro.textContent, '');
  assert.equal(f.campo.value, '', 'o campo esvazia');
  assert.equal(f.aviso.textContent, 'Isto é um protótipo: seu e-mail não foi enviado nem guardado.');
});

test('landing.js sem o formulário na página não quebra', () => {
  assert.doesNotThrow(() => vm.runInNewContext(JS, { document: { getElementById: () => null } }));
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
  const livre = [blocoMedia('(prefers-reduced-motion: no-preference)'), blocoMedia('(prefers-reduced-motion: no-preference) and (max-width: 640px)')].join('\n');
  assert.ok(livre.trim(), 'falta o bloco de movimento liberado');
  // Fora dos blocos de movimento, nada nasce invisível nem fechado.
  let resto = fora;
  for (const ab of ['(prefers-reduced-motion: no-preference)', '(prefers-reduced-motion: no-preference) and (max-width: 640px)', '(prefers-reduced-motion: reduce)']) {
    for (const b of blocosMedia(ab)) resto = resto.replace(b, '');
  }
  resto = resto.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  assert.doesNotMatch(resto, /opacity:\s*0[;\s}]/);
  assert.doesNotMatch(resto, /scaleX\(0\)/);
  assert.doesNotMatch(resto, /clip-path:\s*inset\(0 0 100%/);
  // Dentro, toda regra que esconde depende de .mov (posta pelo script).
  const movidos = [...livre.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /opacity:\s*0[;\s]|scaleX\(0\)/.test(m[2]))
    // O fio do foco do campo nasce fechado: é estado de foco, não conteúdo.
    .filter((m) => m[1].trim() !== '.campo::after');
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
  // O que sobra é uma troca de opacidade de 160 ms, no aviso do formulário.
  const sobra = [...reduzido.matchAll(/animation:\s*([\w-]+)\s+([^;]+);/g)].filter((m) => m[1] !== 'none');
  for (const [, nome, resto] of sobra) {
    assert.equal(nome, 'mov-surge');
    assert.match(resto, /var\(--mov-toque\)/);
  }
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
  const sobe = [...livre.matchAll(/([^{}]+)\{[^{}]*animation:\s*mov-sobe\b[^{}]*\}/g)].map((m) => m[1].trim());
  assert.deepEqual(sobe, ['.erro:not(:empty), .aviso:not(:empty)'], 'mov-sobe só na resposta ao envio');
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

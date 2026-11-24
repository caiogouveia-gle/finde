'use strict';
// O movimento do app (publico/app.js, comum.js, plano.js, app.css): o que a
// revisão filmada achou e não pode voltar. A prova de verdade é o filme; aqui
// fica a forma do código que a garante.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ler = (nome) => fs.readFileSync(path.join(__dirname, '..', 'publico', nome), 'utf8');
const APP = ler('app.js');
const PLANO = ler('plano.js');
const COMUM = ler('comum.js');
const CSS = ler('app.css');

test('lista → detalhe: a hora e o nome ganham nome de transição na página certa', () => {
  const vista = APP.slice(APP.indexOf('function comVista'), APP.indexOf('let vistaEmCurso'));
  assert.ok(vista, 'falta comVista');
  // nomear(naLista): antes da troca a página é a de origem (na ida, a
  // lista); dentro do callback, a de destino (na volta, a lista).
  const antes = vista.slice(0, vista.indexOf('startViewTransition('));
  assert.match(antes, /nomear\(ida\);/);
  const dentro = vista.slice(vista.indexOf('startViewTransition('));
  assert.match(dentro, /fazer\(\);\s*nomear\(volta\);/);
});

test('lista → detalhe: as duas páginas não ficam legíveis juntas, e viaja uma imagem só', () => {
  const sai = CSS.match(/::view-transition-old\(root\)\s*\{\s*animation:\s*mov-vt-sai\s+(\d+)ms/);
  const entra = CSS.match(/::view-transition-new\(root\)\s*\{\s*animation:\s*mov-vt-entra\s+\S+\s+\S+\s+(\d+)ms/);
  assert.ok(sai && entra, 'falta a troca do root');
  // A de chegada só começa quando a de saída já passou de dois terços.
  assert.ok(Number(entra[1]) >= Number(sai[1]) * 0.6, `entrada aos ${entra[1]} ms, saída de ${sai[1]} ms`);
  assert.match(CSS, /::view-transition-old\(festa-hora\), ::view-transition-old\(festa-nome\) \{ animation: none; opacity: 0; \}/);
});

test('questionário: a troca de pergunta não segura quem responde', () => {
  const avanco = Number(APP.match(/const AVANCO_MS = (\d+);/)[1]);
  assert.ok(avanco <= 220, `AVANCO_MS ${avanco}`);
  const entra = APP.slice(APP.indexOf('function entraPergunta'), APP.indexOf('function entraResultado'));
  // Entre perguntas: título no tempo de bloco e opções logo atrás dele.
  assert.match(entra, /M\.titulo\([^;]*troca \? \{ duracao: v\.bloco/);
  assert.match(entra, /troca \? \{ atraso: 40,/);
  // A nova pergunta não espera o último quadro da que sai.
  const recuar = APP.slice(APP.indexOf('function recuar'), APP.indexOf('function comVista'));
  assert.match(recuar, /setTimeout\(ir1, v\.toque - 50\)/);
});

test('convite: o botão que tem o foco nunca é recortado', () => {
  // Recortar o botão cortava junto o anel de foco de quem veio pelo teclado.
  assert.doesNotMatch(PLANO, /M\.revelar\(eu/);
  const encher = PLANO.slice(PLANO.indexOf('function encher'), PLANO.indexOf('// ------------------------------------------------------------ desenho'));
  assert.match(encher, /pseudoElement: '::after'/);
  assert.match(encher, /classList\.remove\('enche'\)/);
  assert.match(CSS, /\.botao\.enche::after \{/);
});

test('convite e painel: a ação chega junto com o conteúdo', () => {
  const painel = COMUM.slice(COMUM.indexOf('function painel'), COMUM.indexOf('function aoVer'));
  assert.doesNotMatch(painel, /k \* 2 \* v\.escala/);
  const quem = Number(PLANO.match(/querySelector\('\.quem'\), \{ atraso: (\d+)/)[1]);
  assert.ok(quem <= 400, `quem vai entra aos ${quem} ms`);
  const criar = Number(APP.match(/querySelectorAll\(':scope > \.bloco'\), \{ atraso: (\d+)/)[1]);
  assert.ok(criar <= 300, `Criar o convite entra aos ${criar} ms`);
});

// ------------------------------------------------------------ Direção E (movimento.md da U39, 24/11/2026)

const MAPA = fs.existsSync(path.join(__dirname, '..', 'publico', 'mapa.js')) ? ler('mapa.js') : '';
// Os quadros de cada animate( de um arquivo, para conferir o que anima.
const animacoes = (fonte) => [...fonte.matchAll(/\.animate\(([\s\S]*?)\{\s*(?:duration|fill|pseudoElement)/g)].map((m) => m[1]);

test('lista → detalhe: festa-capa vai no recorte .capa-foto, nunca no <img>', () => {
  const vista = APP.slice(APP.indexOf('function comVista'), APP.indexOf('let vistaEmCurso'));
  assert.match(vista, /\['\.capa-foto', 'festa-capa'\]/);
  assert.match(vista, /\['\.capa--detalhe \.capa-foto', 'festa-capa'\]/);
  assert.doesNotMatch(vista, /img[^\]]*'festa-capa'/);
  assert.doesNotMatch(vista, /capa-fundo[^\]]*'festa-capa'/);
  // O cartaz viaja da miniatura de "ver todas" ao cartaz do detalhe; sem par, entra depois.
  assert.match(vista, /\['\.mini', 'festa-cartaz'\]/);
  assert.match(CSS, /::view-transition-new\(festa-cartaz\):only-child \{ animation: mov-vt-entra var\(--mov-estado\) var\(--mov-saida\) \d+ms both; \}/);
  // A capa muda de proporção sem esticar.
  assert.match(CSS, /::view-transition-old\(festa-capa\), ::view-transition-new\(festa-capa\) \{ height: 100%; width: 100%; object-fit: cover;/);
});

test('movimento reduzido: a regra própria para os pseudo-elementos da View Transition', () => {
  const reduzido = CSS.slice(CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduzido, /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/);
  // Com movimento reduzido, nada de startViewTransition: a troca é direta.
  assert.match(APP, /if \(entrar && M\.pode\(\) && de && velho && !document\.hidden\)/);
  assert.match(APP, /if \(M\.pode\(\) && typeof document\.startViewTransition === 'function' && mini && img\)/);
});

test('só transform e opacity: nenhum animate( novo com clip-path, filter ou backdrop-filter', () => {
  for (const [nome, fonte] of [['app.js', APP], ['mapa.js', MAPA]]) {
    for (const q of animacoes(fonte)) assert.doesNotMatch(q, /clipPath|filter|backdropFilter/, `${nome}: ${q.slice(0, 80)}`);
    assert.doesNotMatch(fonte, /M\.revelar\(|M\.mascara\(/, nome);
  }
  // No comum.js, o recorte só nas duas peças antigas (revelar e mascara).
  const novas = COMUM.slice(COMUM.indexOf('function reguaDaNoite'), COMUM.indexOf('const mov = {'));
  assert.ok(novas.length > 100, 'faltam as peças da Direção E no comum.js');
  assert.doesNotMatch(novas, /clipPath|filter|backdropFilter/);
  // O desfoque da capa é estático e o vidro não usa backdrop-filter.
  assert.doesNotMatch(CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /backdrop-filter/);
  assert.match(CSS, /\.capa-fundo \{[^}]*filter: blur\(22px\)/);
  assert.doesNotMatch(CSS, /\.capa-fundo \{[^}]*transition/);
});

test('a régua da noite se desenha linear, no tempo da régua; a capa assenta pelo recorte', () => {
  const regua = COMUM.slice(COMUM.indexOf('function reguaDaNoite'), COMUM.indexOf('function capa('));
  assert.match(regua, /duration: v\.regua, easing: 'linear'/);
  const capa = COMUM.slice(COMUM.indexOf('function capa('), COMUM.indexOf('function edicao'));
  assert.match(capa, /c\.querySelector\('\.capa-foto'\), \[\{ transform: 'scale\(1\.08\)' \}, \{ transform: 'scale\(1\)' \}\], \{ duration: v\.capa/);
  // O bloco aparece por opacidade junto com a foto: nunca um retângulo escuro vazio.
  assert.match(capa, /animar\(c, \[\{ opacity: 0 \}\]/);
  for (const t of ['--mov-capa: 640ms', '--mov-regua: 900ms', '--nude-claro: #F3EBE3', '--noite: #120B0D', '--veu:', '--vidro:', '--vidro-fio:']) assert.ok(CSS.includes(t), t);
});

test('abas: um fio só que desliza por transform; o dia que sai some em 140 ms e o novo entra', () => {
  assert.match(CSS, /\.aba-fio \{[^}]*transition: transform var\(--mov-estado\) var\(--mov-troca\)/);
  const pos = APP.slice(APP.indexOf('function posicionarAbas'), APP.indexOf('function edicaoDaSemana'));
  assert.match(pos, /fio\.style\.transform = `translateX\(\$\{sel\.offsetLeft\}px\) scaleX\(/);
  const troca = APP.slice(APP.indexOf('async function trocarDia'), APP.indexOf('async function ajustar'));
  // A folha sai para o lado da aba de antes (só translate e opacidade).
  assert.match(troca, /const saida = \[\.\.\.M\.sair\(folhas, dir \? \{ x: -dir \* 16, y: 0 \} : \{\}\), \.\.\.M\.sair\(cabeca \? \[\.\.\.cabeca\.children\] : \[\], \{ y: 0 \}\)\];/);
  assert.match(troca, /setTimeout\(\(\) => \{[\s\S]*?class: 'carregando'[\s\S]*?\}, 140\);/);
  // Nome acessível inteiro em cada aba ("Sexta, 8 festas").
  // A aba diz só o dia: a contagem de festas saiu em 24/11/2026.
  assert.match(APP, /'aria-label': nome,/);
  assert.doesNotMatch(APP, /el\('sup'/);
});

test('mapa: anima o .pino-in (nunca o ícone do Leaflet) e chama invalidateSize no fim da cortina', { skip: !/L\.map\(/.test(MAPA) && 'mapa.js ainda sem o Leaflet' }, () => {
  assert.match(MAPA, /\.pino-in/);
  for (const q of animacoes(MAPA)) assert.doesNotMatch(q, /leaflet-marker-icon/);
  const lista = MAPA.slice(MAPA.indexOf('async function montarLista'), MAPA.indexOf('async function montarDetalhe'));
  const cortina = lista.indexOf('abrirCortina(');
  assert.ok(cortina > 0 && lista.indexOf('invalidateSize', cortina) > cortina);
});

// ---------------------------------------------------------------- revisão de 24/11

test('revisão: trocar de dia folheia; o dia já buscado entra sem esperar a rede, e um ajuste limpa o guardado', () => {
  const troca = APP.slice(APP.indexOf('async function trocarDia'), APP.indexOf('async function ajustar'));
  assert.match(troca, /const dir = antes && aba \? Math\.sign\(/);
  assert.match(troca, /const guardado = guardadoDoDia\(id\);/);
  assert.match(troca, /trocarResultado\(\{ dia: true, dir \}\)/);
  const troc = APP.slice(APP.indexOf('function trocarResultado'), APP.indexOf('async function trocarDia'));
  assert.match(troc, /const dx = dir \* 24;/);
  assert.match(troc, /M\.animar\(lista, \[\{ translate: `0 \$\{dyl\}px` \}, \{ translate: '0 0' \}\]/);
  assert.match(troc, /M\.subir\(lista\.querySelectorAll\('\.chamada, \.mais, \.bloco-guia, \.linhas > li'\), \{ atraso: 120, x: dx \}\)/);
  // verif2 (mov-aba-corte): na troca de dia a linha das abas fica (o fio
  // termina o percurso), o título entra subindo 6 px e a linha faz FLIP.
  assert.match(troc, /if \(id === 'abas' && abasNoLugar\) continue;/);
  assert.match(troc, /posicionarAbas\(\$atual, abasNoLugar\);/);
  assert.match(troc, /M\.subir\(\[\.\.\.cabeca\.children\], \{ y: 6, duracao: v\.estado \}\)/);
  assert.match(troc, /M\.animar\(abasLinha, \[\{ translate: `0 \$\{dy\}px` \}, \{ translate: '0 0' \}\]/);
  // verif2 (mov-aba-retangulo-vazio): a capa e o texto dela chegam juntos.
  assert.match(troc, /M\.capa\(lista\.querySelector\('\.capa'\), \{ atraso: 0, conteudoJunto: true, x: dx \}\)/);
  // O fundo da capa velha não sai: só o de dentro dela.
  assert.match(troca, /capaVelha\.querySelectorAll\(':scope > \.capa-dentro, :scope > \.capa-foto'\)/);
  const capa = COMUM.slice(COMUM.indexOf('function capa('), COMUM.indexOf('function edicao'));
  const junto = capa.slice(capa.indexOf('if (conteudoJunto)'), capa.indexOf('return vivas([', capa.indexOf('if (conteudoJunto)') + 40));
  assert.doesNotMatch(junto, /animar\(c, /);
  assert.match(junto, /animar\(c\.querySelector\('\.capa-dentro'\), \[\{ opacity: 0, translate: `\$\{x\}px 6px` \}, \{ opacity: 1, translate: '0 0' \}\], \{ duration: 240/);
  assert.doesNotMatch(junto, /atraso \+ 120 \}\),?\s*$|subir\(c\.querySelectorAll\('\.capa-dentro > /);
  // Nada de altura, filtro ou recorte na folha.
  assert.doesNotMatch(troc + troca, /clipPath|filter:|height:/);
  assert.match(APP.slice(APP.indexOf('async function ajustar')), /^\s*diasGuardados\.clear\(\);/m);
  assert.match(COMUM, /function sair\(els, \{ y = -6, x = 0 \} = \{\}\)/);
  // A folha anda para o lado: a moldura nunca abre rolagem horizontal.
  assert.match(CSS, /\.moldura \{[^}]*overflow-x: clip;/);
});

test('verif2: sem foto, viaja a placa sem texto do cartão (não o cartão com o texto) e a volta acende o cartão de origem', () => {
  const vista = APP.slice(APP.indexOf('function comVista'), APP.indexOf('let vistaEmCurso'));
  assert.match(vista, /placa\.style\.viewTransitionName = 'festa-capa'/);
  assert.doesNotMatch(vista, /cartao\.style\.viewTransitionName/);
  // A hora incerta também viaja, dos dois lados.
  assert.match(vista, /\['\.hora, \.hora-incerta', 'festa-hora'\]/);
  assert.match(vista, /\['\.capa-quando \.hora, \.capa-quando \.hora-incerta', 'festa-hora'\]/);
  // A placa existe na chamada, na linha e nas capas sem foto, sem texto.
  assert.equal((APP.match(/el\('span', \{ class: 'capa-placa', 'aria-hidden': 'true' \}\)/g) || []).length, 4);
  assert.match(CSS, /\.capa-placa \{ position: absolute; z-index: -1; inset: 0;/);
  assert.match(CSS, /:root\.vt-cartao::view-transition-old\(festa-capa\) \{ animation: none; opacity: 0; \}/);
  // Com foto, o nome continua no recorte .capa-foto, nunca no <img>.
  assert.match(vista, /\['\.capa-foto', 'festa-capa'\]/);
  assert.doesNotMatch(vista, /img[^\n]*viewTransitionName/);
  assert.match(vista, /if \(volta && origem && document\.contains\(origem\) && M\.pode\(\)\)/);
  // O realce da volta só mexe em opacidade.
  assert.match(CSS, /@keyframes mov-voltou \{ from \{ opacity: 1; \} to \{ opacity: 0; \} \}/);
  // Movimento reduzido: a regra própria dos pseudo-elementos da transição continua.
  assert.match(CSS, /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/);
});

test('revisão: "a confirmar" sem hora não leva a classe .hora (a cascata de .linha .hora e .chamada .hora não o alcança)', () => {
  assert.match(APP, /el\('span', \{ class: 'hora-incerta', texto: 'a confirmar' \}\)/);
  assert.match(APP, /el\('span', \{ class: 'hora-incerta', texto: 'Horário a confirmar' \}\)/);
  assert.doesNotMatch(APP, /class: '[^']*hora hora-incerta|`\$\{classe\} hora-incerta`/);
  assert.match(CSS, /\.chamada \.hora-incerta, \.linha \.hora-incerta \{[^}]*font: italic 400 15px\/1\.15 var\(--serifa\);[^}]*text-transform: none;/);
});

test('revisão: o mapa de dia com as telhas padrão ganha um tom estático, como o da noite', () => {
  const MAPA = ler('mapa.js');
  const MAPA_CSS = ler('mapa.css');
  assert.match(MAPA, /if \(tilesDia\(\) === TILES_PADRAO\) el\.classList\.add\('mapa--filtro-dia'\);/);
  assert.match(MAPA_CSS, /:root:not\(\[data-tema="noite"\]\) \.mapa--filtro-dia \.leaflet-tile-pane \{\s*filter: grayscale\(1\)/);
  // Filtro nunca anima: nenhuma transição ou animação no painel das telhas.
  assert.doesNotMatch(MAPA_CSS, /leaflet-tile-pane[^}]*(transition|animation)/);
});

test('revisão: nenhum append/replaceChildren com nó opcional sem filtro (o DOM escreveria "null" na tela)', () => {
  const lista = APP.slice(APP.indexOf('function listaDoDia'), APP.indexOf('function abrirTodas'));
  assert.equal((lista.match(/raiz\.append\(\.\.\.\[/g) || []).length, 2);
  assert.equal((lista.match(/\]\.filter\(Boolean\)\);/g) || []).length, 2);
  const passou = PLANO.slice(PLANO.indexOf('if (plano.passou) {'), PLANO.indexOf('montarAvaliacao(dentro'));
  assert.match(passou, /dom\.form\.replaceChildren\(\.\.\.\[[\s\S]*\]\.filter\(Boolean\)\);/);
});

test('verif2: o convite que já passou vira registro: sem agenda, sem compra, sem lote, só o Instagram da produtora', () => {
  const det = PLANO.slice(PLANO.indexOf('function detalhes('), PLANO.indexOf('function minhaResposta'));
  const passou = det.slice(det.indexOf('if (passou) {'), det.indexOf('return el(', det.indexOf('if (passou) {') + 20) + 2000);
  assert.match(PLANO, /detalhes\(o, Boolean\(plano\.passou\)\),\s*acoesDoConvite\(o, Boolean\(plano\.passou\)\),/);
  const soPassou = passou.slice(0, passou.indexOf("return el('section', { class: 'convite-detalhes'", passou.indexOf('insta) : null);')));
  assert.doesNotMatch(soPassou, /blocoIngresso|comprar/);
  assert.match(soPassou, /blocoLinks\(f, ex, \{ soInstagram: true \}\)/);
  const acoes = PLANO.slice(PLANO.indexOf('function acoesDoConvite'), PLANO.indexOf('function acoesDoConvite') + 1600);
  assert.match(acoes, /passou \? null : acaoC\('a', \{ href: `\/p\/\$\{encodeURIComponent\(id\)\}\/agenda\.ics`/);
  assert.match(COMUM, /const links = soInstagram \? FT\(\)\.links\(f\)\.filter\(\(l\) => l\.papel === 'instagram' && l\.url\) : FT\(\)\.links\(f\);/);
});

test('verif2: a pré-busca só guarda o dia da tela quando o pedido é o mesmo e não há troca em curso', () => {
  const pre = APP.slice(APP.indexOf('function agendarPreBusca'), APP.indexOf('async function trocarDia'));
  assert.match(pre, /if \(!estado\.ocupado && estado\.criterios === c && estado\.resultado\) \{\s*diasGuardados\.set\(chaveDoDia\(c, abasDoResultado\(\)\.selecionada\)/);
  assert.doesNotMatch(pre, /sel\.dataset\.dia/);
});

test('verif2: a aba Hoje vazia sai da linha das abas; casa · bairro · preço vazio não deixa <p>', () => {
  const abas = APP.slice(APP.indexOf('function abasDoResultado'), APP.indexOf('function abas()'));
  assert.doesNotMatch(abas, /lista\.push\(\.\.\.lista\.splice/);
  assert.match(abas, /\.filter\(\(x\) => !\(x\.id === 'hoje' && x\.reais === 0 && c\.dia !== 'hoje'\)\)/);
  assert.doesNotMatch(APP, /el\('p', \{ class: '(capa|chamada)-onde' \}, ondeDe\(o\)\)/);
  assert.match(APP, /return partes\.length \? el\('p', \{ class: classe \}, partes\) : null;/);
  // "a confirmar" numa linha só, na coluna de 64 px de todas as linhas.
  assert.match(CSS, /\.linha \.hora-incerta \{ font-size: 13px; white-space: nowrap; \}/);
  assert.match(CSS, /\.linha \{ position: relative; display: grid; grid-template-columns: 64px /);
  assert.match(CSS, /\.linha--sem-miniatura \{ grid-template-columns: 64px /);
});

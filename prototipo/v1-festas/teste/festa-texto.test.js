'use strict';
// As frases do detalhe e do convite (publico/festa-texto.js): preço e lote,
// média e origem, som, regras, fontes e o destino de cada link.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../publico/festa-texto');
const C = require('../nucleo/catalogo');

const AGORA = Date.parse('2026-11-14T20:00:00-03:00');
const horasAntes = (h) => new Date(AGORA - h * 3600e3).toISOString();
// A festa traz a média de idade de propósito: um dado antigo que ainda a
// tenha não pode fazer a idade aparecer em frase nenhuma (26/11/2026).
const festa = (extra = {}) => ({
  id: 'x', nome: 'X', preco: 60, estilos: ['house-disco'], mediaIdade: 31, origemIdade: 'informada pela produtora',
  lotes: [{ nome: '1º lote', preco: 60, disponivel: true }], entradaNaPorta: null,
  linkCompra: 'https://www.sympla.com.br/evento/x/1', linkEvento: null, instagram: 'https://www.instagram.com/selomormaco/',
  lineup: ['Duda Maré'], idadeMinima: 18, regras: {}, fontes: [], campos: {}, exemplo: false, ...extra,
});

test('Covers AE1. Entrada na porta: o preço é dito no lugar do link, e não há compra', () => {
  const p = T.preco(festa({ preco: 40, lotes: [], entradaNaPorta: { preco: 40 }, linkCompra: null }));
  assert.equal(p.tipo, 'porta');
  assert.equal(p.texto, 'Entrada na porta, R$ 40');
  assert.equal(p.compra, false);
  assert.equal(T.precoNaLista(festa({ preco: 40, lotes: [], entradaNaPorta: { preco: 40 } })), 'R$ 40 na porta');
});

test('Covers AE3. 1º lote esgotado: vale o próximo disponível, com a nota', () => {
  const f = festa({
    lotes: [
      { nome: '1º lote', preco: 40, disponivel: false },
      { nome: '2º lote', preco: 60, disponivel: true },
      { nome: '3º lote', preco: 80, disponivel: true },
    ],
  });
  const p = T.preco(f);
  assert.equal(p.tipo, 'online');
  assert.equal(p.valor, 60);
  assert.equal(p.texto, 'R$ 60');
  assert.equal(p.lote, '2º lote');
  assert.equal(p.nota, '1º lote esgotado');
  assert.equal(p.compra, true);
  assert.equal(p.servico, 'Sympla');
  assert.equal(T.precoNaLista(f), 'a partir de R$ 60');
});

test('dois lotes esgotados antes do disponível: a nota diz os dois', () => {
  const p = T.preco(festa({
    lotes: [
      { nome: '1º lote', preco: 30, disponivel: false },
      { nome: '2º lote', preco: 45, disponivel: false },
      { nome: '3º lote', preco: 60, disponivel: true },
    ],
  }));
  assert.equal(p.nota, '1º e 2º lotes esgotados');
});

test('todos os lotes esgotados: "Esgotado", sem compra', () => {
  const p = T.preco(festa({ lotes: [{ nome: '1º lote', preco: 40, disponivel: false }] }));
  assert.equal(p.tipo, 'esgotado');
  assert.equal(p.texto, 'Esgotado');
  assert.equal(p.compra, false);
});

test('grátis: "Grátis", sem compra; lote de disponibilidade desconhecida conta como aberto', () => {
  const g = T.preco(festa({ preco: 0, lotes: [{ nome: 'Entrada', preco: 0, disponivel: true }], linkCompra: null }));
  assert.equal(g.tipo, 'gratis');
  assert.equal(g.texto, 'Grátis');
  assert.equal(g.compra, false);
  assert.equal(T.precoNaLista(festa({ preco: 0, lotes: [{ nome: 'Entrada', preco: 0, disponivel: null }] })), 'grátis');
});

test('venda online sem link de compra: mostra o preço e não oferece compra', () => {
  const p = T.preco(festa({ linkCompra: null }));
  assert.equal(p.texto, 'R$ 60');
  assert.equal(p.compra, false);
});

test('festa antiga, sem lotes: o preço da lista sustenta o texto', () => {
  const p = T.preco({ preco: 50 });
  assert.equal(p.texto, 'R$ 50');
  assert.equal(p.compra, false);
});

test('Covers AE4. Lineup não divulgado: o estilo e "lineup ainda não divulgado"', () => {
  const s = T.som(festa({ lineup: null }));
  assert.equal(s.estilos, 'House e disco');
  assert.equal(s.lineup, null);
  assert.equal(s.aviso, 'Lineup ainda não divulgado.');
  const d = T.som(festa({ estilos: ['mpb-samba', 'house-disco'], lineup: ['Nana Pandeiro', 'Trio Calçada'] }));
  assert.equal(d.estilos, 'MPB e samba, house e disco');
  assert.deepEqual(d.lineup, ['Nana Pandeiro', 'Trio Calçada']);
  assert.equal(d.aviso, null);
});

test('os rótulos de estilo são os do catálogo', () => {
  for (const e of C.ESTILOS) assert.equal(T.som(festa({ estilos: [e.id] })).estilos, e.rotulo);
});

test('Covers AE2, revisto em 26/11/2026: a média de idade não tem mais frase nenhuma', () => {
  for (const k of ['media', 'mediaFalada', 'linhaSemMedia', 'fraseDaAvaliacao', 'mensagemComoFoi']) assert.equal(T[k], undefined, k);
  assert.ok(!T.CARA_ORDEM.includes('idade'));
});

test('tempo relativo nas bordas', () => {
  const ha = (h) => T.ha(horasAntes(h), AGORA);
  assert.equal(ha(0.2), 'há poucos minutos');
  assert.equal(ha(40 / 60), 'há 40 min');
  assert.equal(ha(1), 'há 1h');
  assert.equal(ha(23), 'há 23h');
  assert.equal(ha(30), 'ontem');
  assert.equal(ha(50), 'há 2 dias');
  assert.equal(ha(24 * 9), 'em 05/11');
  assert.equal(ha(-3), 'há poucos minutos', 'relógio torto não vira futuro');
  assert.equal(T.ha('não é data', AGORA), null);
  assert.equal(T.ha(null, AGORA), null);
});

test('regras de entrada: só o que existe, na ordem; sem nada, lista vazia', () => {
  assert.deepEqual(T.regras(festa({ idadeMinima: null, regras: {} })), []);
  assert.deepEqual(T.regras(festa({ regras: { lista: 'Nome na lista até as 20h', documento: 'RG ou CNH' } })), [
    { rotulo: 'Idade mínima', valor: '18 anos' },
    { rotulo: 'Documento', valor: 'RG ou CNH' },
    { rotulo: 'Lista', valor: 'Nome na lista até as 20h' },
  ]);
});

test('fontes: nome e quando, a mais recente primeiro', () => {
  const f = festa({ fontes: [
    { id: 'envio', nome: 'Enviado pela produtora', url: null, conferidoEm: horasAntes(5) },
    { id: 'ical', nome: 'Agenda da produtora', url: 'https://x.com.br/a.ics', conferidoEm: horasAntes(1) },
  ] });
  assert.deepEqual(T.fontes(f, AGORA), [
    { nome: 'Agenda da produtora', quando: 'conferida há 1h' },
    { nome: 'Enviado pela produtora', quando: 'conferido há 5h' },
  ]);
  assert.deepEqual(T.fontes(festa({ fontes: undefined }), AGORA), []);
});

test('nome do serviço pelo endereço do link', () => {
  assert.equal(T.servico('https://www.sympla.com.br/evento/a/1'), 'Sympla');
  assert.equal(T.servico('https://shotgun.live/pt-br/events/a'), 'Shotgun');
  assert.equal(T.servico('https://www.ingresse.com/a'), 'Ingresse');
  assert.equal(T.servico('https://feverup.com/m/1'), 'Fever');
  assert.equal(T.servico('https://ra.co/events/1'), 'Resident Advisor');
  assert.equal(T.servico('https://www.instagram.com/selomormaco/'), 'Instagram');
  assert.equal(T.servico('https://selomormaco.com.br/agenda/x'), 'Site da produtora');
  assert.equal(T.servico('não é url'), null);
  assert.equal(T.usuario('https://www.instagram.com/selomormaco/'), '@selomormaco');
});

test('links: com festa de exemplo, passam pela página de saída; com festa real, vão direto', () => {
  const url = 'https://www.instagram.com/selomormaco/';
  const fict = T.destino(url, 'Instagram', true);
  assert.equal(fict, `/fora.html?servico=Instagram&para=${encodeURIComponent(url)}`);
  assert.equal(T.destino(url, 'Instagram', false), url);
  assert.equal(T.destino(null, 'Instagram', true), null);
  assert.equal(T.destino('javascript:alert(1)', 'X', false), null, 'só https sai');
});

test('links de origem: os três, rotulados, e o que falta aparece como ausente', () => {
  const ls = T.links(festa({ linkEvento: 'https://ra.co/events/1', instagram: null }));
  assert.deepEqual(ls.map((l) => [l.papel, l.servico, l.url ? 'link' : 'ausente']), [
    ['instagram', 'Instagram', 'ausente'],
    ['evento', 'Resident Advisor', 'link'],
  ]);
  assert.equal(ls[0].texto, 'Instagram não informado');
  assert.equal(ls[1].texto, 'Página do evento no Resident Advisor', 'o link do evento leva o nome do serviço');
  assert.equal(T.links(festa({ linkEvento: 'https://pistamadura.com.br/agenda/x' }))[1].texto, 'Página do evento no site da produtora');
  assert.equal(T.links(festa())[0].texto, '@selomormaco no Instagram');
});

test('mapa: busca pelo endereço, bairro e cidade', () => {
  const u = T.mapa({ texto: 'Rua das Tipuanas Floridas, 214', bairro: 'vila-madalena' }, 'Vila Madalena');
  assert.equal(u, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Rua das Tipuanas Floridas, 214, Vila Madalena, São Paulo')}`);
  assert.equal(T.mapa(null, 'Centro'), null);
});

test('taxa da plataforma ao lado do preço, quando a fonte dá', () => {
  const p = T.preco(festa({ lotes: [{ nome: '1º lote', preco: 60, disponivel: true, taxa: 6 }] }));
  assert.equal(p.taxa, '+ R$ 6 de taxa');
  const q = T.preco(festa({ lotes: [{ nome: '1º lote', preco: 75, disponivel: true, taxa: 7.5 }], preco: 75 }));
  assert.equal(q.taxa, '+ R$ 7,50 de taxa');
  assert.equal(T.preco(festa()).taxa, null, 'sem taxa na fonte, nada inventado');
});

test('preço por horário: "R$ 35 até as 21h, R$ 50 depois"', () => {
  const f = festa({
    preco: 35,
    lotes: [
      { nome: 'Até as 21h', preco: 35, disponivel: true, ate: '21:00' },
      { nome: 'Depois das 21h', preco: 50, disponivel: true },
    ],
  });
  const p = T.preco(f);
  assert.equal(p.valor, 35);
  assert.equal(p.horario, 'até as 21h; depois, R$ 50');
  assert.equal(p.nota, null);
  assert.equal(T.precoNaLista(f), 'R$ 35 até as 21h');
  const gratis = T.preco(festa({ preco: 0, lotes: [{ nome: 'Até a 0h', preco: 0, disponivel: true, ate: '00:00' }, { nome: 'Depois', preco: 20, disponivel: true }] }));
  assert.equal(gratis.tipo, 'gratis');
  assert.equal(gratis.texto, 'Grátis');
  assert.equal(gratis.horario, 'até a meia-noite; depois, R$ 20');
});

test('frases da página: som, regras e o lote seguinte', () => {
  assert.equal(T.som(festa({ lineup: ['Duda Maré', 'Tati Varanda'] })).frase, 'House e disco, com Duda Maré e Tati Varanda.');
  assert.equal(T.som(festa({ lineup: null })).frase, 'House e disco. Lineup ainda não divulgado.');
  assert.equal(T.regrasFrase(festa({ regras: { documento: 'RG ou CNH, original ou digital', lista: 'Nome na lista até as 19h' } })), 'Só maiores de 18. RG ou CNH, original ou digital. Nome na lista até as 19h.');
  assert.equal(T.regrasFrase(festa({ idadeMinima: null, regras: {} })), '');
  const p = T.preco(festa({ lotes: [{ nome: '1º lote', preco: 40, disponivel: false }, { nome: '2º lote', preco: 60, disponivel: true }, { nome: '3º lote', preco: 80, disponivel: true }] }));
  assert.equal(p.depois, 'depois, R$ 80');
});

// ------------------------------------------------------------ o app (/app)

const fs = require('node:fs');
const path = require('node:path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'publico', 'app.js'), 'utf8');
const { PESOS } = require('../nucleo/cara');

test('/app?festa=<id>: caixa e espaço de um link copiado não derrubam o id; link torto vira null', () => {
  assert.equal(T.idDeFesta('sexta-sem-pressa'), 'sexta-sem-pressa');
  assert.equal(T.idDeFesta('  SEXTA-sem-Pressa '), 'sexta-sem-pressa');
  assert.equal(T.idDeFesta('a'.repeat(60)), 'a'.repeat(60));
  for (const torto of ['a'.repeat(61), '<img src=x>', 'sexta sem pressa', '../etc', '', null, undefined, 42]) {
    assert.equal(T.idDeFesta(torto), null, String(torto));
  }
  // O app não cai calado na pergunta 1: link torto mostra "Essa festa não está no Finde.".
  assert.match(APP, /if \(pedida\.id\) abrirAvulsa\(pedida\.id\);\s*else semFesta\(true\);/);
});

test('mensagem pro grupo: sem caixa alta, a data e a hora na mesma linha, e nada de média de idade', () => {
  const f = festa({ nome: 'Disco ao Pôr do Sol', casa: 'terraço em Pinheiros', mediaIdade: 30, preco: 80, lotes: [{ nome: '1º lote', preco: 80, disponivel: true }, { nome: '2º lote', preco: 100, disponivel: true }] });
  const linhas = T.mensagem({ data: 'sáb, 21 nov', hora: '17h00', bairro: 'Pinheiros', festa: f, link: 'https://finde.example/p/abc' });
  assert.deepEqual(linhas, [
    'Achei essa, bora?',
    // Fictícia: no grupo ninguém vê o rodapé do protótipo, então a mensagem diz.
    '(Exemplo: festa fictícia do protótipo do Finde.)',
    '',
    'Sáb, 21 nov · 17h00',
    'Disco ao Pôr do Sol, com Duda Maré',
    'terraço em Pinheiros · a partir de R$ 80',
    '',
    'Diz aqui se você tá dentro:',
    'https://finde.example/p/abc',
  ]);
  // Nenhuma linha em maiúsculas, e a hora com "h" minúsculo.
  for (const l of linhas) assert.ok(!l || l !== l.toLocaleUpperCase('pt-BR') || !/[a-zà-ú]/i.test(l), l);
  assert.doesNotMatch(linhas.join('\n'), /\d+H\d*/);
  // A média de idade que a festa ainda traga não entra (26/11/2026).
  assert.doesNotMatch(linhas.join('\n'), /m[ée]dia|anos|idade/);
  // A casa que não diz o bairro ganha o bairro.
  const sem = T.mensagem({ data: 'sex, 20 nov', hora: '18h00', bairro: 'Barra Funda', festa: festa({ casa: 'galpão', origemIdade: null }), link: 'x' });
  assert.equal(sem[3], 'Sex, 20 nov · 18h00');
  assert.match(sem[5], /^galpão · Barra Funda · /);
  // Sem média, a mensagem não abre com "média não informada" (R35).
  const semMedia = T.mensagem({ data: 'dom, 22 nov', hora: '16h00', bairro: 'Centro', festa: festa({ mediaIdade: null }), link: 'x' });
  assert.equal(semMedia[3], 'Dom, 22 nov · 16h00');
  assert.doesNotMatch(semMedia.join('\n'), /não informad/);
  // A real sai sem a linha de exemplo.
  const real = T.mensagem({ data: 'sex, 20 nov', hora: '18h00', bairro: null, festa: festa({ real: true, exemplo: false }), link: 'x' });
  assert.equal(real[1], '');
  assert.doesNotMatch(real.join('\n'), /xemplo|fictícia/);
  // O app monta a mensagem por aqui, sem o toLocaleUpperCase de antes.
  assert.match(APP, /FT\.mensagem\(/);
  assert.doesNotMatch(APP.slice(APP.indexOf('function linhasDaMensagem')), /toLocaleUpperCase\('pt-BR'\),\s*\n\s*f\.nome/);
});

test('% a sua cara: as partes na ordem do peso de nucleo/cara.js, o horário primeiro', () => {
  const porPeso = Object.keys(PESOS).sort((a, b) => PESOS[b] - PESOS[a]);
  assert.deepEqual(T.CARA_ORDEM, porPeso);
  const partes = [
    { criterio: 'som', cabe: true, texto: 'house e disco' },
    { criterio: 'bairro', cabe: true, texto: 'em Pinheiros' },
    { criterio: 'horario', cabe: false, texto: 'começa às 17h, antes da sua janela' },
    { criterio: 'preco', cabe: 'quase', texto: 'R$ 90, pouco acima' },
    { criterio: 'bairro', cabe: true, texto: '  ' },
  ];
  assert.deepEqual(T.ordemDaCara(partes).map((x) => x.criterio), ['horario', 'bairro', 'preco', 'som']);
  assert.deepEqual(T.ordemDaCara(null), []);
});

test('% a sua cara: a linha do peso só quando algo não cabe inteiro', () => {
  const tudo = { pct: 100, partes: [{ criterio: 'bairro', cabe: true, texto: 'a' }, { criterio: 'horario', cabe: true, texto: 'b' }] };
  assert.equal(T.pesoDaCara(tudo), '');
  assert.equal(T.pesoDaCara({ pct: 0, partes: [{ criterio: 'horario', cabe: false, texto: 'b' }] }), '');
  const quatro = { pct: 70, partes: ['som', 'preco', 'bairro', 'horario'].map((c) => ({ criterio: c, cabe: c !== 'horario', texto: c })) };
  assert.equal(T.pesoDaCara(quatro), 'Conta mais o horário, depois o bairro, o preço e o som.');
  const dois = { pct: 55, partes: [{ criterio: 'bairro', cabe: 'quase', texto: 'a' }, { criterio: 'horario', cabe: true, texto: 'b' }] };
  assert.equal(T.pesoDaCara(dois), 'Conta mais o horário, depois o bairro.');
  // A parte de idade de um convite antigo não entra no nome do peso.
  const velha = { pct: 70, partes: [{ criterio: 'idade', cabe: 'quase', texto: 'a' }, { criterio: 'horario', cabe: true, texto: 'b' }, { criterio: 'som', cabe: true, texto: 'c' }] };
  assert.doesNotMatch(T.pesoDaCara(velha), /idade/);
});

test('% a sua cara nos cartões: só quando varia na lista', () => {
  const op = (...pcts) => pcts.map((pct) => ({ festa: { id: String(pct) }, cara: pct === null ? undefined : { pct, partes: [] } }));
  assert.equal(T.pctNosCartoes(op(100, 100, 100)), false, 'três 100% não ajudam a escolher');
  assert.equal(T.pctNosCartoes(op(100, 83, 100)), true);
  assert.equal(T.pctNosCartoes(op(70)), false);
  assert.equal(T.pctNosCartoes(op(null, null)), false);
  assert.equal(T.pctNosCartoes(op(null, 80, 80)), false);
  assert.equal(T.pctNosCartoes([{ cara: { pct: 101 } }, { cara: { pct: 50 } }]), false, 'fora de 0 a 100 não conta');
  assert.equal(T.pctNosCartoes(undefined), false);
});

test('cartão da lista para leitor de tela: a linha, o preço e a %, sem média de idade', () => {
  const f = festa({ id: 'sexta-sem-pressa', nome: 'Sexta Sem Pressa', mediaIdade: 32 });
  const o = { festa: f, linha: 'Sex · 18h00 · Pinheiros' };
  const lido = T.cartaoFalado(o, { pct: 83 });
  assert.equal(lido, 'Sex · 18h00 · Pinheiros · R$ 60 · 83% a sua cara');
  assert.equal(T.cartaoFalado({ ...o, patrocinada: true }, { nova: true }), 'Sex · 18h00 · Pinheiros · R$ 60 · patrocinado · nova na lista');
  // Até 26/11/2026, a festa sem média dizia "média de idade não informada".
  assert.equal(T.cartaoFalado({ festa: festa({ mediaIdade: null }), linha: 'Sáb · 22h00 · Centro' }), 'Sáb · 22h00 · Centro · R$ 60');
  // No guia, cada cartão é um link (?festa=) com o texto inteiro dentro.
  assert.match(APP, /const hrefDe = \(o\) => `\?festa=\$\{encodeURIComponent\(o\.festa\.id\)\}`;/);
});

test('casa com bairro: o bairro só entra quando a casa não o diz', () => {
  assert.equal(T.casaComBairro('terraço em Pinheiros', 'Pinheiros'), 'terraço em Pinheiros');
  assert.equal(T.casaComBairro('galpão', 'Barra Funda'), 'galpão · Barra Funda');
  assert.equal(T.casaComBairro('galpão', null), 'galpão');
});

// As travas do app vivem no DOM; o teste confere que elas estão ligadas.
test('Mandar pro grupo: o toque duplo em "Criar o convite" não abre o WhatsApp', () => {
  const criar = APP.slice(APP.indexOf('function blocoCriar'), APP.indexOf('function blocoConvite'));
  assert.match(criar, /const tocou = performance\.now\(\);/);
  assert.match(criar, /desenhar\(\{ focar: false, entrar: false, travar: true \}\);\s*travaAte = Math\.max\(travaAte, tocou \+ AVANCO_MS \+ trava\(\)\);/);
  // Quem voltou no meio não é puxado de volta para a tela do convite.
  assert.match(criar, /const saiu = minha !== geracao;/);
});

test('voltar e recomeçar: a pergunta 1 é o fundo do histórico, e a resposta velha não vale', () => {
  const recomecar = APP.slice(APP.indexOf('function recomecar'), APP.indexOf('function voltaParaLanding'));
  assert.match(recomecar, /cancelarEspera\(\);/);
  assert.match(recomecar, /history\.go\(-n\)/);
  assert.doesNotMatch(recomecar, /estado\.ocupado\) return/);
  // As entradas refeitas ao recarregar também levam a altura (n).
  const iniciar = APP.slice(APP.indexOf('async function iniciar'), APP.indexOf('function semFesta'));
  assert.doesNotMatch(iniciar, /history\.pushState/);
  assert.match(iniciar, /history\.replaceState\(\{ tela: 'pergunta', passo: 0, n: 0 \}, ''\)/);
  // A lista refeita depois de mudar um trecho volta à entrada da lista velha.
  assert.match(APP, /if \(daLista\) \{[\s\S]*?history\.back\(\);/);
  // Uma resposta de uma geração velha é descartada nas duas buscas.
  for (const nome of ['async function buscarFestas', 'async function ajustar']) {
    const corpo = APP.slice(APP.indexOf(nome), APP.indexOf('\n  }\n', APP.indexOf(nome)));
    assert.match(corpo, /const minha = geracao;[\s\S]*if \(minha !== geracao\) return;/, nome);
  }
});

test('tela de mandar: o campo do nome tem o rótulo visível ("Convite de") no nome acessível', () => {
  assert.match(APP, /'aria-labelledby': 'convite-de convite-de-mais', 'aria-describedby': 'dica-nome'/);
  assert.match(APP, /id: 'convite-de', texto: 'Convite de'/);
  assert.doesNotMatch(APP, /'aria-label': 'Seu nome, opcional'/);
  // O par lado a lado é o mesmo C, os dois com seta.
  assert.match(APP, /const copiar = acaoC\('button', \{ type: 'button' \}, 'Copiar o link'\);/);
});

test('a frase do horário no desenho: a hora nunca desce sozinha, e a frase lida é a mesma', () => {
  const NB = '\u00a0';
  const colada = T.horarioSemQuebra(C.fraseDoHorario({ inicio: 18, esquenta: 20, fim: 23 }));
  assert.equal(colada, `Começa${NB}às${NB}18h, a pista enche${NB}às${NB}20h e${NB}acaba${NB}às${NB}23h.`);
  // À meia-noite, nem o hífen quebra.
  assert.match(T.horarioSemQuebra(C.fraseDoHorario({ inicio: 18, esquenta: 20, fim: 24 })), /e\u00a0acaba\u00a0à\u00a0meia\u2011noite\.$/);
  assert.equal(T.horarioSemQuebra(null), '');
  // Para quem lê, nada muda: o desenho é que cola.
  const t = 'Começa às 16h30, a pista enche às 18h e acaba à meia-noite.';
  assert.equal(T.horarioSemQuebra(t).replace(/\u00a0/g, ' ').replace(/\u2011/g, '-'), t);
});

test('casa · preço · produtora: quebra só antes de um "·", cada trecho inteiro', () => {
  const NB = '\u00a0';
  assert.equal(T.ondeSemQuebra(['terraço em Pinheiros', 'a partir de R$ 60', 'Coletivo Meia-Luz']),
    `terraço${NB}em${NB}Pinheiros ·${NB}a${NB}partir${NB}de${NB}R$${NB}60 ·${NB}Coletivo${NB}Meia\u2011Luz`);
  // Trecho que falta não deixa "·" sobrando; o longo demais quebra por dentro.
  assert.equal(T.ondeSemQuebra(['quintal', null, '', 'Roda']), `quintal ·${NB}Roda`);
  const longo = 'um galpão enorme na Barra Funda perto do metrô';
  assert.equal(T.ondeSemQuebra([longo, 'R$ 30 na porta']), `${longo} ·${NB}R$${NB}30${NB}na${NB}porta`);
  assert.equal(T.ondeSemQuebra(null), '');
});

// ------------------------------------------------------------ o app em outro endereço

// Em produção a landing (finde.fly.dev) e o app (finde-app.fly.dev) moram em
// endereços diferentes; a meta finde-site diz ao app onde está a landing.
const vm = require('node:vm');
const PUBLICO = path.join(__dirname, '..', 'publico');
const COMUM = fs.readFileSync(path.join(PUBLICO, 'comum.js'), 'utf8');

// comum.js num navegador de mentira: só o que ele toca ao carregar.
function siteCom(conteudo, aqui) {
  const meta = conteudo === undefined ? null : { getAttribute: () => conteudo };
  const document = { addEventListener() {}, querySelector: (s) => (s === 'meta[name="finde-site"]' ? meta : null) };
  const window = { location: new URL(aqui), matchMedia: () => ({ matches: false }), document };
  vm.runInContext(COMUM, vm.createContext({ window, document, URL, setInterval() {} }));
  return window.Finde.site();
}

test('finde-site: a landing de outro endereço, um caminho daqui, e a raiz quando a meta falha', () => {
  const APP_AQUI = 'https://finde-app.fly.dev/?festa=sexta-sem-pressa';
  assert.equal(siteCom('https://finde.fly.dev/', APP_AQUI), 'https://finde.fly.dev/');
  assert.equal(siteCom('/', 'http://127.0.0.1:8904/app?ver=lista'), 'http://127.0.0.1:8904/');
  assert.equal(siteCom('  http://127.0.0.1:8905/ ', 'http://127.0.0.1:8906/'), 'http://127.0.0.1:8905/');
  // Marcador que o servidor não trocou, meta ausente, vazia ou de outro tipo: a raiz daqui.
  for (const torto of ['__URL_SITE__', undefined, '', 'javascript:alert(1)', '//finde.fly.dev/', 'finde.fly.dev', 'data:text/html,x']) {
    assert.equal(siteCom(torto, APP_AQUI), 'https://finde-app.fly.dev/', String(torto));
  }
});

test('finde-site: as três páginas do app trazem a meta, e o wordmark e o Voltar vão por ela', () => {
  for (const nome of ['index.html', 'plano.html', 'fora.html']) {
    const html = fs.readFileSync(path.join(PUBLICO, nome), 'utf8');
    assert.match(html, /<meta name="finde-site" content="__URL_SITE__">/, nome);
    // comum.js carrega antes do script da página, que lê a meta por ele.
    assert.ok(html.indexOf('/comum.js') < html.search(/\/(app|plano|fora)\.js/), nome);
  }
  const PLANO = fs.readFileSync(path.join(PUBLICO, 'plano.js'), 'utf8');
  const FORA = fs.readFileSync(path.join(PUBLICO, 'fora.js'), 'utf8');
  assert.match(APP, /const LANDING = site\(\);/);
  assert.match(PLANO, /const LANDING = site\(\);/);
  assert.match(FORA, /marca\.href = window\.Finde\.site\(\);/);
  assert.match(APP, /marca\(LANDING\)/);
  assert.match(APP, /window\.location\.assign\(LANDING\)/);
  // Nenhum caminho do app supõe estar em /app nem que a landing tem a lista.
  assert.doesNotMatch(APP, /replaceState\([^)]*'\/app'\)/);
  assert.doesNotMatch(APP, /#festas/);
  assert.doesNotMatch(APP, /pathname === '\/' \|\|/);
});

// O "Voltar" que sai do app (pergunta 1, detalhe aberto por link), tirado do
// app.js e rodado com uma história de mentira. Devolve o que ele fez:
// ['go', -k] ou ['assign', url].
function voltarCom({ landing, aqui, n = 0, referrer = '', comprimento, entradas }) {
  const ini = APP.indexOf('  const caminho = (p) =>');
  const fim = APP.indexOf('  function botaoVoltar()');
  assert.ok(ini > 0 && fim > ini, 'o trecho da volta está no app.js');
  const feito = [];
  const location = new URL(aqui);
  location.assign = (url) => feito.push(['assign', url]);
  const nav = entradas && {
    entries: () => entradas.map((url) => ({ url })),
    currentEntry: { index: entradas.length - 1 - (entradas.atras || 0) },
  };
  const ctx = vm.createContext({
    URL,
    LANDING: landing,
    nivel: () => n,
    document: { referrer },
    history: { length: comprimento, go: (d) => feito.push(['go', d]) },
    window: { location, navigation: nav },
  });
  vm.runInContext(`${APP.slice(ini, fim)}\nvoltarParaLanding();`, ctx);
  return feito[0];
}

test('Voltar na pergunta 1: volta pela história à landing de outro endereço, quando ela está lá', () => {
  const LANDING = 'https://finde.fly.dev/';
  const APP_ = 'https://finde-app.fly.dev/';
  // Veio do D da landing: a landing é a entrada antes da primeira do app.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 2, entradas: [APP_] }), ['go', -1]);
  // Duas perguntas adiante e de volta à primeira: a landing continua uma abaixo.
  const ida = Object.assign([APP_, APP_, APP_], { atras: 2 });
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 4, entradas: ida }), ['go', -1]);
  // Detalhe aberto por link, duas telas acima da entrada: k = 3.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: `${APP_}?festa=x`, n: 2, referrer: LANDING, comprimento: 4, entradas: [APP_, APP_, APP_] }), ['go', -3]);
  // Aba nova (o D aberto à parte): nada antes do app, vai pelo link.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 1, entradas: [APP_] }), ['assign', LANDING]);
  const abaNova = Object.assign([APP_, APP_], { atras: 1 });
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 2, entradas: abaNova }), ['assign', LANDING]);
  // Link colado, ou vindo de outro site: sem o referrer da landing, link.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: '', comprimento: 2, entradas: [APP_] }), ['assign', LANDING]);
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: 'https://example.com/', comprimento: 2, entradas: [APP_] }), ['assign', LANDING]);
  // Meta torta: a "landing" é a raiz daqui, e um referrer vazio não pode
  // passar por ela.
  assert.deepEqual(voltarCom({ landing: APP_, aqui: APP_, referrer: '', comprimento: 2, entradas: [APP_] }), ['assign', APP_]);
  assert.deepEqual(voltarCom({ landing: APP_, aqui: APP_, referrer: '', comprimento: 2 }), ['assign', APP_]);
  // Depois de recarregar, a entrada de baixo é do próprio app: link.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 3, entradas: [APP_, APP_] }), ['assign', LANDING]);
  // Sem a API de navegação, o referrer e o tamanho da história decidem.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 2 }), ['go', -1]);
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: '', comprimento: 2 }), ['assign', LANDING]);
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: APP_, referrer: LANDING, comprimento: 1 }), ['assign', LANDING]);
});

test('Voltar na pergunta 1: quem veio de um convite volta para ele, em qualquer jeito de rodar', () => {
  // Produção: o convite e o app em finde-app, a landing em outro endereço.
  const LANDING = 'https://finde.fly.dev/';
  const CONVITE = 'https://finde-app.fly.dev/p/ab12cd34';
  const LISTA = 'https://finde-app.fly.dev/app';
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: LISTA, referrer: CONVITE, comprimento: 2, entradas: [CONVITE, LISTA] }), ['go', -1]);
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: LISTA, referrer: CONVITE, comprimento: 2 }), ['go', -1]);
  // Tudo junto (desenvolvimento): o mesmo, e a landing daqui também volta pela história.
  const L = 'http://127.0.0.1:8763/';
  const P = 'http://127.0.0.1:8763/p/ab12cd34';
  const A = 'http://127.0.0.1:8763/app';
  assert.deepEqual(voltarCom({ landing: L, aqui: A, referrer: P, comprimento: 2, entradas: [P, A] }), ['go', -1]);
  assert.deepEqual(voltarCom({ landing: L, aqui: A, referrer: L, comprimento: 2, entradas: [L, A] }), ['go', -1]);
  // Outra página do app embaixo (a de saída, por exemplo) não é convite nem landing: link.
  assert.deepEqual(voltarCom({ landing: L, aqui: A, referrer: '', comprimento: 2, entradas: ['http://127.0.0.1:8763/fora.html', A] }), ['assign', L]);
  // Um /p/ de outro endereço não conta como convite daqui.
  assert.deepEqual(voltarCom({ landing: LANDING, aqui: LISTA, referrer: 'https://outro.example/p/ab12cd34', comprimento: 2 }), ['assign', LANDING]);
});

// ------------------------------------------------------------ o rodapé do protótipo

// comum.js num DOM de mentira que monta elementos de verdade (o bastante
// para o rodapé), com o tema e a hora pedidos.
function comumComDom({ tema = 'dia', pelaHora = 'dia' } = {}) {
  class No {
    constructor(tag) { this.tag = tag; this.filhos = []; this.atributos = {}; this.className = ''; this.proprio = ''; }
    set textContent(v) { this.proprio = String(v); this.filhos = []; }
    get textContent() { return this.proprio + this.filhos.map((f) => f.textContent).join(''); }
    setAttribute(k, v) { this.atributos[k] = v; }
    addEventListener() {}
    append(...n) { this.filhos.push(...n); }
  }
  const document = {
    addEventListener() {},
    querySelector: () => null,
    createElement: (tag) => new No(tag),
    createTextNode: (t) => { const n = new No('#text'); n.textContent = t; return n; },
  };
  const window = {
    location: new URL('https://finde-app.fly.dev/'),
    matchMedia: () => ({ matches: false }),
    document,
    FindeTema: { atual: () => tema, pelaHora: () => pelaHora },
  };
  vm.runInContext(COMUM, vm.createContext({ window, document, URL, Node: No, setInterval() {} }));
  return window.Finde;
}

test('rodapé: a nota do protótipo e um seletor de tema que diz que é tema', () => {
  const r = comumComDom().rodape();
  assert.equal(r.tag, 'footer');
  assert.match(r.textContent, /^Protótipo · festas fictícias/);
  // De dia, "noite às 18h" sozinho, no detalhe de uma festa que começa às 18h,
  // se lia como o horário dela.
  // No meio, o link da opinião sobre o protótipo (24/11/2026).
  assert.equal(r.textContent, 'Protótipo · festas fictícias' + 'dar opinião' + 'modo noite às 18h · ver agora');
  const rotulo = (tema, pelaHora) => comumComDom({ tema, pelaHora }).rodape().filhos[0].filhos[2].textContent;
  assert.equal(rotulo('dia', 'dia'), 'modo noite às 18h · ver agora');
  assert.equal(rotulo('noite', 'noite'), 'ver de dia');
  assert.equal(rotulo('noite', 'dia'), 'voltar pro dia');
  assert.equal(rotulo('dia', 'noite'), 'voltar pra noite');
});

test('rodapé: toda tela do app traz a nota do protótipo, a pergunta 1 inclusive', () => {
  // O corpo de cada função de tela, até a próxima função do mesmo nível.
  const corpo = (nome) => {
    const i = APP.search(new RegExp(`\\n  (async )?function ${nome}\\(`));
    assert.ok(i >= 0, nome);
    const resto = APP.slice(i + 1);
    const fim = resto.search(/\n {2}(async )?function /);
    return fim < 0 ? resto : resto.slice(0, fim);
  };
  for (const nome of ['telaCarregando', 'telaPergunta', 'telaResultado', 'telaFesta', 'telaMandar', 'semFesta', 'abrirAvulsa']) {
    assert.match(corpo(nome), /rodape\(\)/, nome);
  }
  // Na pergunta, o rodapé fica logo abaixo do botão, dentro do formulário.
  const pergunta = corpo('telaPergunta');
  assert.match(pergunta, /const fim = rodape\(\);\s*fim\.classList\.add\('rodape--junto'\);/);
  assert.match(pergunta, /el\('div', \{ class: 'pe' \}, continuar,[^\n]*\),\s*fim\);/);
  const CSS = fs.readFileSync(path.join(PUBLICO, 'app.css'), 'utf8');
  assert.match(CSS, /\.rodape--junto \{ margin-top: 0; padding-top: var\(--e5\); \}/);
});

// ------------------------------------------------------------ o guia e o detalhe (U29–U31, plano de 24/11/2026)

const COMUM_FONTE = fs.readFileSync(path.join(PUBLICO, 'comum.js'), 'utf8');
const PLANO_FONTE = fs.readFileSync(path.join(PUBLICO, 'plano.js'), 'utf8');
const CONVERTIDA = require('./dados/festa-r14-3-convertida.json').festa;
const RESPOSTA = require('./dados/resposta-festas-r14-3.json');
const NA_FIXTURE = Date.parse('2026-11-26T12:00:00-03:00');

test('porquê do cartão: até duas partes que cabem e uma linha honesta do que falta', () => {
  const o = RESPOSTA.comReais.opcoes[0];
  assert.deepEqual(T.partesDoPorque(o), { cabe: ['começa às 23h'], falta: 'Não diz o som.' });
  assert.deepEqual(T.porqueDoCartao(o), { cabe: 'Começa às 23h.', falta: 'Não diz o som.' });
  // Uma parte só, e o bairro com a preposição dele.
  const uma = { porque: { cabe: [{ criterio: 'bairro', valor: 'Vila Madalena' }], falta: [{ criterio: 'preco', valor: null }, { criterio: 'som', valor: null }] } };
  assert.deepEqual(T.porqueDoCartao(uma), { cabe: 'Fica na Vila Madalena.', falta: 'Não diz o preço nem o som.' });
  // Nenhuma: os dois vazios, e o cartão não mostra a linha.
  assert.deepEqual(T.partesDoPorque({ porque: { cabe: [], falta: [] } }), { cabe: [], falta: '' });
  assert.deepEqual(T.partesDoPorque({}), { cabe: [], falta: '' });
  assert.deepEqual(T.porqueDoCartao({ porque: { cabe: [], falta: [] } }), { cabe: '', falta: '' });
  // A idade de um convite antigo (no porquê guardado) não vira frase: nem no
  // que cabe nem no que falta (26/11/2026).
  const tres = { porque: { cabe: [{ criterio: 'idade', valor: 'média 31' }], falta: [{ criterio: 'idade', valor: null }, { criterio: 'som', valor: null }, { criterio: 'bairro', valor: null }] } };
  assert.deepEqual(T.partesDoPorque(tres), { cabe: [], falta: 'Não diz o bairro nem o som.' });
  // Mais de duas que cabem: ficam as duas primeiras; preço sem quebra.
  const muitas = { porque: { cabe: [{ criterio: 'preco', valor: 'R$ 40' }, { criterio: 'horario', valor: '0h' }, { criterio: 'som', valor: 'House e disco' }], falta: [] } };
  assert.deepEqual(T.partesDoPorque(muitas).cabe, ['custa R$ 40', 'começa à meia-noite']);
  assert.equal(T.porqueDoCartao(muitas).cabe, 'Custa R$ 40 e começa à meia-noite.');
  // A preposição de cada bairro é a do catálogo.
  for (const b of Object.values(C.TODOS_OS_BAIRROS)) assert.equal(`${T.EM_BAIRRO[b.nome]} ${b.nome}`, b.em, b.nome);
});

test('base viva: "Atualizado há 3h" e o que foi lido; sem a data, nada', () => {
  assert.deepEqual(T.baseViva({ atualizadoEm: '2026-11-26T09:05:00-03:00', total: 41, perfis: 50, sites: 3 }, NA_FIXTURE),
    { quando: 'Atualizado há 2h', conta: '41 festas lidas de 50 perfis e 3 sites de ingresso' });
  assert.deepEqual(T.baseViva({ atualizadoEm: '2026-11-26T09:05:00-03:00', total: 1, perfis: 1, sites: 1 }, NA_FIXTURE).conta, '1 festa lida de 1 perfil e 1 site de ingresso');
  assert.equal(T.baseViva(null), null);
  assert.equal(T.baseViva({ total: 3 }), null);
});

test('preço sem valor com link: "Ver ingressos", com a compra e o serviço; nunca "a venda não abriu"', () => {
  const p = T.preco(festa({ lotes: [], preco: null, linkCompra: 'https://shotgun.live/pt-br/events/x' }));
  assert.equal(p.tipo, 'sem-preco');
  assert.equal(p.compra, true);
  assert.equal(p.servico, 'Shotgun');
  assert.equal(p.valor, null);
  assert.equal(T.rotuloDaCompra(p), 'Ver ingressos');
  assert.equal(T.rotuloDaCompra(T.preco(festa())), 'Comprar');
  // Sem link, sem compra.
  assert.equal(T.preco(festa({ lotes: [], preco: null, linkCompra: null })).compra, false);
  // O /3 não diz se a venda abriu: a frase não existe mais em lugar nenhum.
  for (const fonte of [COMUM_FONTE, APP, PLANO_FONTE, fs.readFileSync(path.join(PUBLICO, 'festa-texto.js'), 'utf8')]) {
    assert.doesNotMatch(fonte, /venda ainda não abriu/i);
  }
});

test('preço conferido há mais de 72 h: marcado e fora da barra', () => {
  const agora = Date.parse('2026-11-30T12:00:00-03:00');
  assert.equal(T.precoVelho({ precoConferidoEm: '2026-11-27T11:00:00-03:00' }, agora), true);
  assert.equal(T.precoVelho({ precoConferidoEm: '2026-11-27T13:00:00-03:00' }, agora), false);
  assert.equal(T.precoVelho({}, agora), false);
  // A leitura da página que deu o preço manda sobre o carimbo do campo (costura):
  // uma indicação reprocessada hoje não confere o preço de novo.
  const lida = { tipo: 'ingresso', url: 'https://ingressos.example/e', campos: ['lotes'], lidoEm: '2026-11-25T10:00:00-03:00' };
  assert.equal(T.precoVelho({ precoConferidoEm: '2026-11-30T09:00:00-03:00', paginas: [lida] }, agora), true);
  assert.equal(T.precoVelho({ precoConferidoEm: '2026-11-20T09:00:00-03:00', paginas: [{ ...lida, lidoEm: '2026-11-30T08:00:00-03:00' }] }, agora), false);
  const barra = APP.slice(APP.indexOf('function barraDaFesta'), APP.indexOf('// ------------------------------------------------------------ mandar pro grupo'));
  assert.match(barra, /const velho = FT\.precoVelho\(f\);/);
  assert.match(barra, /p\.compra && !velho && p\.valor !== null/);
});

test('fontes que acharam a festa: sem claude, regras e curadoria', () => {
  assert.deepEqual(T.encontradaEm(CONVERTIDA), ['paginas', 'indicacao']);
  // A fonte `avaliacoes` (de idade) cai antes, no conversor (26/11/2026).
  const f = { fontes: ['claude', 'regras', 'instagram', 'curadoria', 'paginas', 'instagram'].map((id) => ({ id, nome: id })) };
  assert.deepEqual(T.encontradaEm(f), ['instagram', 'paginas']);
  assert.deepEqual(T.encontradaEm({ encontradaEm: ['claude', 'envio'], fontes: [] }), ['envio']);
  assert.deepEqual(T.encontradaEm({}), []);
});

test('lista das fontes: um link https por fonte (a página ou o post, nunca o perfil), o que se leu e quando', () => {
  const fs1 = T.fontesDaFesta(CONVERTIDA, NA_FIXTURE);
  assert.deepEqual(fs1.map((x) => x.id), ['paginas', 'indicacao']);
  assert.equal(fs1[0].url, 'https://ingressos.example/evento/noite-exemplo');
  assert.equal(fs1[0].leu, 'Nome, horário, preço, endereço, lineup e flyer · conferido ontem');
  const f = {
    encontradaEm: ['instagram', 'paginas', 'envio', 'ical'],
    fontes: [
      { id: 'instagram', nome: 'Instagram', url: 'https://www.instagram.com/p/ABC123/', conferidoEm: '2026-11-26T10:00:00-03:00' },
      { id: 'paginas', nome: 'Página', url: 'http://sympla.com.br/evento/x', conferidoEm: '2026-11-26T09:00:00-03:00' },
      { id: 'envio', nome: 'Enviado pela produtora', url: 'https://www.instagram.com/perfil_da_casa/', conferidoEm: '2026-11-25T09:00:00-03:00' },
      { id: 'ical', nome: 'Agenda', url: 'javascript:alert(1)', conferidoEm: '2026-11-24T09:00:00-03:00' },
    ],
  };
  const lista = T.fontesDaFesta(f, NA_FIXTURE);
  assert.equal(lista.length, 4);
  assert.deepEqual(lista.map((x) => x.url), ['https://www.instagram.com/p/ABC123/', null, null, null]);
  assert.equal(lista[0].rotuloLink, 'Ver o post');
  assert.equal(lista[0].nome, 'Post no Instagram');
  for (const x of lista) if (x.url) assert.match(x.url, /^https:\/\//);
});

test('a frase da junção: pelo link, pelo escore com imagem (a imagem por último) e à mão', () => {
  assert.deepEqual(T.fraseDaJuncao(CONVERTIDA), { frase: 'Juntamos pelo link de compra, pelo nome, pela casa e pelo mesmo flyer.', imagem: true });
  const so = (vinculo) => ({ fontes: [{ id: 'a', vinculo: { regra: 'nova', sinais: [] } }, { id: 'b', vinculo }] });
  assert.deepEqual(T.fraseDaJuncao(so({ regra: 'link', escore: null, sinais: [] })), { frase: 'Juntamos pelo link de compra.', imagem: false });
  assert.deepEqual(T.fraseDaJuncao(so({ regra: 'escore', escore: 6, sinais: [{ sinal: 'imagem', peso: 3 }, { sinal: 'nome', peso: 3 }, { sinal: 'lugar', peso: -2 }] })),
    { frase: 'Juntamos pelo nome e pelo mesmo flyer.', imagem: true });
  assert.deepEqual(T.fraseDaJuncao(so({ regra: 'manual', escore: null, sinais: [] })), { frase: 'Juntamos à mão, na curadoria do finde.', imagem: false });
  assert.equal(T.fraseDaJuncao(so({ regra: 'nova', sinais: [] })), null);
  assert.equal(T.fraseDaJuncao({}), null);
});

test('divergência: só quando os valores já normalizados diferem, dita numa frase', () => {
  assert.deepEqual(T.divergencias(CONVERTIDA), ['A página do ingresso diz R$ 40; a indicação diz R$ 45. Mostramos o que diz a página do ingresso.']);
  const d = (campo, a, b, extra = {}) => T.divergencias({ ...extra, divergencias: [{ campo, valores: [{ fonte: 'instagram', valor: a }, { fonte: 'paginas', valor: b }] }] });
  // Iguais depois de normalizar: nada.
  assert.deepEqual(d('precoAPartirDe', 40, 40.0), []);
  assert.deepEqual(d('casa', 'Casa de Francisca', 'casa de  francisca'), []);
  assert.deepEqual(d('casa', 'Pão de Açúcar', 'Pao de Acucar'), []);
  assert.deepEqual(d('inicio', 23, '2026-12-05T23:00:00-03:00'), []);
  assert.deepEqual(d('linkCompra', 'https://www.sympla.com.br/evento/x/', 'https://sympla.com.br/evento/x'), []);
  assert.deepEqual(d('data', '2026-12-05', '2026-12-05T00:00:00-03:00'), []);
  // Diferentes: a frase, e o que mostramos.
  assert.deepEqual(d('inicio', 19, 18, { inicio: 18 }), ['O post diz 19h; a página do ingresso diz 18h. Mostramos o que diz a página do ingresso.']);
  // Campo fora da lista dos cinco: nada.
  assert.deepEqual(d('lineup', ['A'], ['B']), []);
});

test('de onde vem: uma linha por campo, com a casa curada e a atribuição do OpenStreetMap', () => {
  const linhas = T.deOndeVem(CONVERTIDA, NA_FIXTURE);
  assert.deepEqual(linhas.map((x) => x.campo), ['Horário', 'Preço', 'Local', 'Som']);
  // A linha da idade saiu em 26/11/2026, mesmo com o carimbo de um dado antigo.
  assert.ok(!T.deOndeVem({ ...CONVERTIDA, mediaIdade: 31, campos: { ...CONVERTIDA.campos, mediaIdade: { fonte: 'avaliacoes', conferidoEm: '2026-11-26T09:00:00-03:00' } } }, NA_FIXTURE).some((x) => x.campo === 'Idade'));
  assert.equal(linhas.find((x) => x.campo === 'Som').texto, 'Leitura da descrição da página.');
  const curada = T.deOndeVem({ ...CONVERTIDA, endereco: { ...CONVERTIDA.endereco, cidadeOrigem: 'casa' }, local: { ...CONVERTIDA.local, origemGeo: 'curado', atribuicaoOsm: true } }, NA_FIXTURE);
  assert.equal(curada.find((x) => x.campo === 'Local').texto, 'Cadastro da casa no finde; cidade pelo cadastro da casa; mapa © OpenStreetMap.');
});

test('vazios numa linha só no pé; o fim não se repete em outra frase do horário', () => {
  const xamego = {
    real: true, nome: 'Xamêgo', inicio: 22, fim: null, esquenta: null, mediaIdade: null, endereco: null, lotes: [], preco: null, linkCompra: null,
    estilos: [], lineup: [], produtora: null, regras: {}, idadeMinima: null,
  };
  const v = T.vaziosDaFesta(xamego);
  assert.equal(v, 'Não divulgado: fim, endereço, preço, som, lineup, produtora, regras da porta.');
  assert.equal((v.match(/fim/g) || []).length, 1);
  assert.equal(T.vaziosDaFesta({ ...xamego, real: undefined }), '');
  assert.equal(T.vaziosDaFesta(CONVERTIDA), 'Não divulgado: regras da porta.');
  // O detalhe não tem mais a frase solta do fim: o vazio fica só no pé.
  assert.doesNotMatch(APP, /A hora de acabar não foi divulgada/);
  assert.match(APP, /const vazios = FT\.vaziosDaFesta\(f\);/);
});

test('a peça de divulgação: o objeto do /3 ou o caminho da fictícia; crédito e alt', () => {
  const c = T.cartazDe(CONVERTIDA);
  assert.equal(c.miniatura, '/imagens/0123456789abcdef-480.webp');
  assert.equal(c.arquivo, '/imagens/0123456789abcdef-1080.webp');
  assert.equal(c.paisagem, false);
  assert.equal(T.creditoDaPeca(c), 'Pôster · divulgação Ingressos Exemplo');
  assert.equal(T.altDaPeca(c, 'Noite Exemplo'), 'Pôster de Noite Exemplo, divulgação de Ingressos Exemplo');
  const flyer = T.cartazDe({ cartaz: { ...CONVERTIDA.cartaz, papel: 'flyer', credito: 'Divulgação · @casaexemplo', origem: 'https://www.instagram.com/p/X1/', largura: 1600, altura: 900 } });
  assert.equal(flyer.paisagem, true);
  assert.equal(T.creditoDaPeca(flyer), 'Flyer · divulgação @casaexemplo');
  assert.equal(flyer.origemRotulo, 'ver no Instagram');
  assert.equal(T.cartazDe({ cartaz: '/cartazes/sexta-sem-pressa.webp' }).miniatura, '/cartazes/sexta-sem-pressa.webp');
  // Caminho fora do padrão não vira imagem.
  for (const ruim of ['https://cdn.example/x.jpg', '/imagens/../x.webp', '/imagens/0123-480.webp', { arquivo: '//x/y.webp' }, null]) assert.equal(T.cartazDe({ cartaz: ruim }), null);
});

test('convite: sem média de idade, com casa, bairro, preço e lineup; sem a pergunta de idade depois da festa', () => {
  assert.doesNotMatch(COMUM_FONTE, /'média não informada'|mediaIdade|media-grande|painel-media/);
  assert.match(COMUM_FONTE, /texto: `com \$\{lineup\.length > 3/);
  const linhas = T.mensagem({ data: 'sex, 27 nov', hora: '23h00', bairro: 'Pinheiros', festa: festa({ real: true, mediaIdade: null, casa: 'Casa Exemplo', lineup: ['DJ Exemplo'] }), link: 'https://finde.example/p/abcd1234' });
  assert.equal(linhas[2], 'Sex, 27 nov · 23h00');
  assert.equal(linhas[3], 'X, com DJ Exemplo');
  assert.equal(linhas[4], 'Casa Exemplo · Pinheiros · R$ 60');
  // Sem preço: a linha fica com a casa e o bairro.
  const semPreco = T.mensagem({ data: 'sex, 27 nov', hora: '23h00', bairro: 'Pinheiros', festa: festa({ real: true, casa: 'Casa Exemplo', lotes: [], preco: null }), link: 'x' });
  assert.equal(semPreco[4], 'Casa Exemplo · Pinheiros');
  // A avaliação pós-festa ("O público tinha a sua idade?") e o "como foi?"
  // pro grupo saíram em 26/11/2026: o convite não pergunta nem manda nada.
  assert.doesNotMatch(PLANO_FONTE, /\/avaliacao|sua-idade|O público tinha|Como foi|mensagemComoFoi|idade/);
});

test('páginas do app: noindex, tiles pela meta, mapa e local com defer, sem preload da Fraunces', () => {
  const index = fs.readFileSync(path.join(PUBLICO, 'index.html'), 'utf8');
  const plano = fs.readFileSync(path.join(PUBLICO, 'plano.html'), 'utf8');
  for (const html of [index, plano]) {
    assert.match(html, /<meta name="robots" content="noindex, noimageindex">/);
    assert.doesNotMatch(html, /fraunces-italico-300\.woff2" as="font"/);
  }
  assert.match(index, /<meta name="finde-tiles" content="__TILES__">/);
  assert.match(index, /<script src="\/local\.js" defer><\/script>\s*<script src="\/mapa\.js" defer><\/script>\s*<script src="\/app\.js" defer><\/script>/);
  assert.match(plano, /<meta property="og:image" content="__IMAGEM_COMPARTILHAR__">/);
});

// ---------------------------------------------------------------- revisão de desenho de 24/11

test('revisão: semViuva prende o número à unidade e ao "há"; horaCurta tira os zeros da hora cheia', () => {
  const NB = ' ';
  assert.equal(T.semViuva('conferido há 2h'), `conferido há${NB}2h`);
  assert.equal(T.semViuva('Noite Exemplo 11 anos · DJ Exemplo'), `Noite Exemplo 11${NB}anos · DJ Exemplo`);
  assert.equal(T.semViuva('Rua Clarice Vasconcelos Prado, 1.658'), `Rua Clarice Vasconcelos Prado,${NB}1.658`);
  assert.equal(T.semViuva('a partir de R$ 70'), `a partir de${NB}R$${NB}70`);
  assert.equal(T.horaCurta('22h00'), '22h');
  assert.equal(T.horaCurta('22h30'), '22h30');
});

test('revisão cara-de-ia-02: dois links da Ingresse diferentes não viram "um link da Ingresse; um link da Ingresse"', () => {
  const f = {
    linkCompra: 'https://www.ingresse.com/primavera-sab',
    divergencias: [{ campo: 'linkCompra', valores: [{ fonte: 'paginas', valor: 'https://www.ingresse.com/primavera-sab' }, { fonte: 'indicacao', valor: 'https://www.ingresse.com/primavera' }] }],
  };
  const [frase] = T.divergencias(f);
  assert.equal(frase, 'As fontes levam a páginas diferentes da Ingresse; o botão abre a que veio da página do ingresso.');
  // Valores que se dizem diferente seguem na frase de sempre.
  const preco = T.divergencias({ precoAPartirDe: 40, divergencias: [{ campo: 'precoAPartirDe', valores: [{ fonte: 'paginas', valor: 40 }, { fonte: 'indicacao', valor: 45 }] }] });
  assert.match(preco[0], /^A página do ingresso diz .*; a indicação diz /);
});

test('revisão cara-de-ia-08: "de onde vem" com tudo da mesma fonte vira uma frase só', () => {
  const agora = Date.parse('2026-11-24T12:00:00-03:00');
  const c = { fonte: 'indicacao', conferidoEm: '2026-11-24T10:00:00-03:00' };
  const linhas = T.deOndeVem({ campos: { inicio: c, lotes: c, endereco: c } }, agora);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].junto, true);
  assert.equal(linhas[0].texto, 'Horário, preço e local vieram de uma indicação ao finde, há 2h.');
  // Fontes diferentes: uma linha por campo, como antes.
  const varias = T.deOndeVem({ campos: { inicio: c, lotes: { ...c, fonte: 'paginas' } } }, agora);
  assert.deepEqual(varias.map((x) => x.campo), ['Horário', 'Preço']);
});

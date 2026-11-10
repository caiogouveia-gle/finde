'use strict';
// As frases do detalhe e do convite (publico/festa-texto.js): preço e lote,
// média e origem, som, regras, fontes e o destino de cada link.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../publico/festa-texto');
const C = require('../nucleo/catalogo');

const AGORA = Date.parse('2026-11-14T20:00:00-03:00');
const horasAntes = (h) => new Date(AGORA - h * 3600e3).toISOString();
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

test('Covers AE2. Média ausente: "ainda não informada", sem origem nem data', () => {
  const m = T.media(festa({ mediaIdade: null, origemIdade: null }), AGORA);
  assert.equal(m.ausente, true);
  assert.equal(m.texto, 'Média de idade ainda não informada');
  assert.equal(m.origem, null);
  assert.equal(m.quando, null);
});

test('média informada: número, origem e quando foi conferida', () => {
  const m = T.media(festa({ campos: { mediaIdade: { fonte: 'envio', conferidoEm: horasAntes(26) } } }), AGORA);
  assert.equal(m.ausente, false);
  assert.equal(m.numero, 31);
  assert.equal(m.origem, 'informada pela produtora');
  assert.equal(m.quando, 'conferida ontem');
  assert.equal(T.media(festa(), AGORA).quando, null, 'sem carimbo, sem data inventada');
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

test('frases da página: média, som, regras e o lote seguinte', () => {
  assert.equal(T.media(festa(), AGORA).frase, 'Média de 31 anos, informada pela produtora.');
  assert.equal(T.media(festa({ mediaIdade: null }), AGORA).frase, 'Média de idade ainda não informada.');
  assert.equal(T.som(festa({ lineup: ['Duda Maré', 'Tati Varanda'] })).frase, 'House e disco, com Duda Maré e Tati Varanda.');
  assert.equal(T.som(festa({ lineup: null })).frase, 'House e disco. Lineup ainda não divulgado.');
  assert.equal(T.regrasFrase(festa({ regras: { documento: 'RG ou CNH, original ou digital', lista: 'Nome na lista até as 19h' } })), 'Só maiores de 18. RG ou CNH, original ou digital. Nome na lista até as 19h.');
  assert.equal(T.regrasFrase(festa({ idadeMinima: null, regras: {} })), '');
  const p = T.preco(festa({ lotes: [{ nome: '1º lote', preco: 40, disponivel: false }, { nome: '2º lote', preco: 60, disponivel: true }, { nome: '3º lote', preco: 80, disponivel: true }] }));
  assert.equal(p.depois, 'depois, R$ 80');
});

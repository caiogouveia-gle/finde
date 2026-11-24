'use strict';
// O mapa (U33, R32, D8, KTD16 do plano de 24/11/2026; desenho e movimento da
// U39). As partes puras rodam aqui; o resto, a forma do código que o desenho
// e as políticas pedem. A prova no navegador é a QA (U38).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('../publico/mapa');

const RESPOSTA = require('./dados/resposta-festas-r14-3.json');
const PUBLICO = path.join(__dirname, '..', 'publico');
const ler = (nome) => fs.readFileSync(path.join(PUBLICO, nome), 'utf8');
const JS = ler('mapa.js');
const CSS = ler('mapa.css');

let n = 0;
// Uma opção real fictícia, na forma da resposta do app.
function opcao({ id, nome, casa, inicio = 23, lat = -23.5667, lng = -46.6934, precisao = 'rua', lugar = null, exemplo = false, endereco = null } = {}) {
  n += 1;
  return {
    exemplo,
    pct: exemplo ? undefined : 80,
    festa: {
      id: id || `festa-${n}`,
      nome: nome || `Festa ${n}`,
      casa: casa || null,
      inicio,
      exemplo,
      real: !exemplo,
      endereco: endereco ? { texto: endereco } : null,
      local: lat === null ? null : { lat, lng, precisao, lugar, origemGeo: 'pagina', atribuicaoOsm: false },
    },
  };
}

test('pinsDe: tira exemplo, precisão de bairro e quem não tem coordenada', () => {
  const lista = [
    opcao({ id: 'a', lugar: 'casa-a', casa: 'Casa A', inicio: 18 }),
    opcao({ id: 'ex', exemplo: true, lugar: 'casa-x' }),
    opcao({ id: 'b', precisao: 'bairro', lat: -23.56, lng: -46.69 }),
    opcao({ id: 'c', lat: null }),
    opcao({ id: 'rio', lat: -22.9, lng: -43.2, precisao: 'casa' }),
    opcao({ id: 'd', lugar: 'casa-d', lat: -23.55, lng: -46.68, inicio: 22 }),
  ];
  const r = M.pinsDe(lista);
  assert.deepEqual(r.pins.map((p) => p.festas), [['a'], ['d']]);
  // b (bairro), c (sem ponto) e rio (fora de SP) ficam só na lista; o exemplo não conta.
  assert.equal(r.soNaLista, 3);
  assert.equal(r.pins[0].hora, '18h');
  assert.equal(r.pins[0].melhor, true);
  assert.equal(r.pins[1].melhor, false);
});

test('pinsDe: um pino por lugar, com a contagem, na ordem da lista', () => {
  const lista = [
    opcao({ id: 'sexta-sem-pressa', nome: 'Sexta Sem Pressa', casa: 'Casa Expediente', lugar: 'casa-expediente', inicio: 18 }),
    opcao({ id: 'brasileira', casa: 'Bar do Largo', lugar: 'bar-do-largo', lat: -23.561, lng: -46.682, inicio: 19 }),
    opcao({ id: 'madrugada', casa: 'Casa Expediente', lugar: 'casa-expediente', lat: -23.56671, lng: -46.69341, inicio: 22 }),
    // Sem lugar do cadastro, o mesmo ponto também junta.
    opcao({ id: 'p1', lat: -23.5501, lng: -46.6301, inicio: 21 }),
    opcao({ id: 'p2', lat: -23.55012, lng: -46.63013, inicio: 23.5 }),
  ];
  const { pins, soNaLista } = M.pinsDe(lista);
  assert.equal(soNaLista, 0);
  assert.equal(pins.length, 3);
  assert.deepEqual(pins[0].festas, ['sexta-sem-pressa', 'madrugada']);
  assert.equal(pins[0].contagem, 2);
  assert.equal(pins[0].hora, '18h'); // a hora da primeira festa da casa na lista
  assert.equal(pins[0].rotulo, '18h, Sexta Sem Pressa e mais 1, Casa Expediente');
  assert.equal(pins[1].contagem, 1);
  assert.deepEqual(pins[2].festas, ['p1', 'p2']);
  // A soma das contagens com as que ficam na lista é o total de reais.
  assert.equal(pins.reduce((s, p) => s + p.contagem, 0) + soNaLista, lista.length);
});

test('pinsDe: aceita as festas direto e a resposta do app', () => {
  const festas = [opcao({ id: 'x' }).festa, opcao({ id: 'y', lat: null }).festa];
  assert.deepEqual(M.pinsDe(festas).pins.map((p) => p.festas[0]), ['x']);
  assert.equal(M.pinsDe(festas).soNaLista, 1);
  const r = RESPOSTA.comReais;
  const todas = [...r.opcoes, ...r.maisDoDia];
  const { pins, soNaLista } = M.pinsDe(todas);
  assert.equal(pins.reduce((s, p) => s + p.contagem, 0) + soNaLista, todas.length);
  assert.equal(pins[0].festas[0], 'noite-exemplo-20261205-a1b2');
  // Os exemplos nunca viram pino.
  assert.deepEqual(M.pinsDe(RESPOSTA.semReais.opcoes), { pins: [], soNaLista: 0 });
  assert.deepEqual(M.pinsDe(null), { pins: [], soNaLista: 0 });
});

test('a contagem das que ficam só na lista bate com a legenda', () => {
  const lista = [
    opcao({ lugar: 'l1' }), opcao({ lugar: 'l2', lat: -23.55 }), opcao({ lugar: 'l3', lat: -23.54 }),
    opcao({ lat: null }), opcao({ lat: null }), opcao({ exemplo: true }),
  ];
  const l = M.legendas(lista);
  assert.equal(l.total, 5);
  assert.equal(l.noMapa, 3);
  assert.equal(l.soNaLista, M.pinsDe(lista).soNaLista);
  assert.equal(l.rotulo, '3 de 5 no mapa');
  assert.equal(l.fora, '2 festas sem endereço divulgado ficam só na lista.');
  // Com endereço escrito mas sem ponto, a frase não diz que não divulgou.
  const umaComTexto = M.legendas([opcao({ lugar: 'l1' }), opcao({ lat: null, endereco: 'Rua A, 1' })]);
  assert.equal(umaComTexto.fora, '1 festa sem endereço no mapa fica só na lista.');
  assert.equal(M.legendas([opcao({})]).fora, '');
  assert.equal(M.legendas([]).rotulo, '');
});

test('enquadramento: um pino só respeita o zoom máximo', () => {
  const um = M.enquadramento([{ lat: -23.56, lng: -46.69 }]);
  assert.deepEqual(um, { centro: [-23.56, -46.69], zoom: 15 });
  assert.equal(M.ZOOM_MAX, 15);
  // Vários no mesmo ponto: o mesmo.
  assert.deepEqual(M.enquadramento([{ lat: -23.56, lng: -46.69 }, { lat: -23.56, lng: -46.69 }]).zoom, 15);
  // Vários: a caixa, sem passar do zoom máximo.
  const dois = M.enquadramento([{ lat: -23.56, lng: -46.69 }, { lat: -23.54, lng: -46.64 }]);
  assert.deepEqual(dois.caixa, [[-23.56, -46.69], [-23.54, -46.64]]);
  assert.equal(dois.zoomMax, 15);
  assert.equal(M.enquadramento([]), null);
  assert.equal(M.enquadramento([{ lat: NaN, lng: 1 }]), null);
});

test('horaDe: a hora do pino', () => {
  assert.equal(M.horaDe(23), '23h');
  assert.equal(M.horaDe(18.5), '18h30');
  assert.equal(M.horaDe(24.5), '0h30');
  assert.equal(M.horaDe(29), '5h');
  assert.equal(M.horaDe(null), null);
  const { pins } = M.pinsDe([opcao({ inicio: null })]);
  assert.equal(pins[0].hora, null);
  assert.match(pins[0].rotulo, /^Horário a confirmar, /);
});

test('verif2: casas vizinhas na tela viram um pino só (+1), na ordem da lista; longe, ficam separadas', () => {
  const pin = (id, x, extra = {}) => ({ lugar: id, lat: 0, lng: 0, hora: extra.hora === undefined ? '23h' : extra.hora, festas: [id], nomes: [id.toUpperCase()], casa: `Casa ${id}`, contagem: 1, melhor: false, x, ...extra });
  const pins = [pin('a', 100, { melhor: true }), pin('b', 130, { hora: null }), pin('c', 300)];
  const g = M.agruparNaTela(pins, (p) => ({ x: p.x, y: 200 }));
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].festas, ['a', 'b']);
  assert.equal(g[0].contagem, 2);
  assert.equal(g[0].hora, '23h');
  assert.equal(g[0].melhor, true);
  assert.match(g[0].rotulo, /^23h, A e mais 1, Casa a$/);
  assert.deepEqual(g[1].festas, ['c']);
  // Os pins de entrada não mudam (o zoom reagrupa a partir deles).
  assert.deepEqual(pins[0].festas, ['a']);
  // A 44 px ou mais, separados.
  assert.equal(M.agruparNaTela([pin('a', 0), pin('b', 44)], (p) => ({ x: p.x, y: 0 })).length, 2);
});

test('tiles: só https com {z}/{x}/{y}; atribuição do OSM sempre, CARTO quando for ele', () => {
  assert.equal(M.tilesValidos('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(M.tilesValidos('http://tile.openstreetmap.org/{z}/{x}/{y}.png'), null);
  assert.equal(M.tilesValidos('__TILES__'), null);
  assert.equal(M.tilesValidos('https://x.example/"><script>/{z}/{x}/{y}'), null);
  assert.equal(M.TILES_PADRAO, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(M.atribuicaoDos(M.TILES_PADRAO), /openstreetmap\.org\/copyright/);
  assert.doesNotMatch(M.atribuicaoDos(M.TILES_PADRAO), /CARTO/);
  assert.match(M.atribuicaoDos('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'), /OpenStreetMap.*CARTO/);
});

test('forma: o pino anima por dentro (.pino-in), nunca o ícone do Leaflet', () => {
  assert.match(JS, /querySelector\('\.pino-in'\)/);
  assert.doesNotMatch(JS, /leaflet-marker-icon[^\n]*\.animate\(/);
  assert.doesNotMatch(JS, /getElement\(\)\.animate\(/);
  // Nenhuma animação nova com clip-path, filter ou backdrop-filter.
  assert.doesNotMatch(JS, /clipPath|backdropFilter|filter:\s*['"`]/);
  // Pinos por divIcon com className, sem style no HTML (CSP).
  assert.match(JS, /L\.divIcon\(\{\s*className:/);
  assert.doesNotMatch(JS, /style=/);
  // O CSS não anima o ícone do marcador nem usa raio ou sombra nos controles.
  assert.doesNotMatch(CSS, /\.leaflet-marker-icon[^{]*\{[^}]*transition/);
  assert.doesNotMatch(CSS, /border-radius:\s*[1-9]/);
  assert.doesNotMatch(CSS, /box-shadow:\s*(?!none)\S/);
});

test('forma: invalidateSize depois da cortina; pinos depois da primeira telha ou de 400 ms', () => {
  const lista = JS.slice(JS.indexOf('async function montarLista'), JS.indexOf('async function montarDetalhe'));
  const cortina = lista.indexOf('abrirCortina(el, estado.cortina).then(');
  assert.ok(cortina > 0);
  assert.ok(lista.indexOf('invalidateSize', cortina) > cortina, 'invalidateSize no fim da cortina');
  assert.match(lista, /once\('tileload load'/);
  assert.match(lista, /setTimeout\(ok, 400\)/);
  assert.match(lista, /440 -/);
  // A cortina dura o --mov-bloco (560 ms) e encolhe por scaleY.
  assert.match(JS, /tempo\('bloco', 560\)/);
  assert.match(JS, /scaleY\(1\)[^\n]*scaleY\(0\)/);
  // fitBounds sem animação e com o zoom máximo.
  assert.match(lista, /fitBounds\(q\.caixa, \{ maxZoom: q\.zoomMax[^}]*animate: false \}\)/);
});

test('forma: movimento reduzido, tela de toque, atribuição e políticas', () => {
  assert.match(JS, /zoomAnimation: !r/);
  assert.match(JS, /fadeAnimation: !r/);
  assert.match(JS, /prefers-reduced-motion: reduce/);
  assert.match(JS, /dragging: !toque\(\)/);
  // Atribuição com prefix próprio (o padrão do 1.9 traz um SVG em linha).
  assert.match(JS, /control\.attribution\(\{[^}]*prefix: '<a href="https:\/\/leafletjs\.com"/);
  assert.doesNotMatch(JS, /<svg/);
  assert.match(JS, /referrerPolicy: 'strict-origin-when-cross-origin'/);
  // Sem geolocalização (D16) e sem pré-carga dos tiles nem do Leaflet.
  assert.doesNotMatch(JS, /geolocation|getCurrentPosition|locate\(/);
  assert.doesNotMatch(ler('index.html'), /vendor\/leaflet/);
  // Pino focável na ordem da lista, com nome e estado.
  assert.match(JS, /setAttribute\('tabindex', '0'\)/);
  assert.match(JS, /setAttribute\('aria-label', pin\.rotulo\)/);
  assert.match(JS, /setAttribute\('aria-pressed'/);
  // Sem som.
  assert.doesNotMatch(JS, /AudioContext|new Audio|\.play\(|vibrate/);
  // Zoom de 44 px.
  assert.match(CSS, /width: 44px;\s*height: 44px;/);
});

test('Leaflet 1.9.4 vendorizado, com licença e os hashes da origem', () => {
  const dir = path.join(PUBLICO, 'vendor', 'leaflet');
  const js = fs.readFileSync(path.join(dir, 'leaflet.js'));
  assert.match(js.toString('utf8'), /version="1\.9\.4"/);
  assert.match(fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8'), /BSD 2-Clause License/);
  const origem = fs.readFileSync(path.join(dir, 'ORIGEM.txt'), 'utf8');
  for (const nome of ['leaflet.js', 'leaflet.css', 'LICENSE']) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, nome))).digest('hex');
    assert.ok(origem.includes(`${h}  ${nome}`), `${nome} mudou desde o tarball`);
  }
  assert.match(origem, /sha512-nxS1ynzJOmOlHp\+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL\+YR3XnWyZAxwQixURb\+FA74PA==/);
});

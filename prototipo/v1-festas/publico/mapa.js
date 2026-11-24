'use strict';
// O mapa (R32, D8, KTD16 do plano de 24/11/2026; desenho e movimento da U39,
// docs/desenho/2026-11-24-rascunhos/). Leaflet 1.9.4 vendorizado em
// publico/vendor/leaflet/ (do tarball do npm, integridade conferida contra o
// registro), injetado só no toque em "Ver no mapa", junto com /mapa.css.
// Tiles de FINDE_TILES (o <meta name="finde-tiles">; o servidor põe a origem
// dele no img-src da CSP), com a atribuição sempre visível e sem pré-carga.
// À noite: o <meta name="finde-tiles-noite">, quando houver; sem ele, um
// filtro no painel das telhas (mapa.css).
//
// Pinos quadrados com a hora, um por lugar com a contagem, só reais com
// precisão casa ou rua, nunca exemplo; o da melhor opção maior. Pinos por
// divIcon com className (nenhum style no HTML, CSP); o que anima é o
// .pino-in, nunca o ícone do marcador, em que o Leaflet escreve transform.
// O painel abre por uma cortina; invalidateSize() no fim dela. Mini-mapa do
// detalhe estático. Sem geolocalização (D16). Sem som.
//
// Roda no navegador (window.FindeMapa); as partes puras (pinsDe,
// enquadramento, legendas, horaDe) rodam no node --test.

(function (raiz, fabrica) {
  const M = fabrica(raiz);
  if (typeof module === 'object' && module.exports) module.exports = M;
  else raiz.FindeMapa = M;
})(typeof self !== 'undefined' ? self : this, (raiz) => {
  const ZOOM_MAX = 15; // a lista nunca chega mais perto que isso (KTD16)
  const ZOOM_DETALHE = 16;
  const TILES_PADRAO = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const LEAFLET = '1.9.4';

  // ------------------------------------------------------------ partes puras

  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const dentroDeSP = (lat, lng) => lat >= -24.1 && lat <= -23.3 && lng >= -47.0 && lng <= -46.3;
  const festaDe = (o) => (o && typeof o === 'object' && o.festa && typeof o.festa === 'object' ? o.festa : o);
  const ehExemplo = (o) => !!(o && (o.exemplo === true || (o.festa && (o.festa.exemplo === true || o.festa.real === false)) || o.real === false));

  // O ponto que vira pino: `local` com precisão de casa ou de rua, dentro de
  // São Paulo. Precisão de bairro nunca vira pino (M30).
  function pontoDe(f) {
    const l = f && f.local;
    if (!l || !num(l.lat) || !num(l.lng) || !dentroDeSP(l.lat, l.lng)) return null;
    if (l.precisao !== 'casa' && l.precisao !== 'rua') return null;
    return { lat: l.lat, lng: l.lng, lugar: typeof l.lugar === 'string' && l.lugar ? l.lugar : null };
  }

  // 23 -> "23h", 23.5 -> "23h30", 24.5 -> "0h30"; sem início, null.
  function horaDe(inicio) {
    if (!num(inicio)) return null;
    let h = Math.floor(inicio);
    let m = Math.round((inicio - h) * 60);
    if (m === 60) {
      h += 1;
      m = 0;
    }
    h = ((h % 24) + 24) % 24;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  // pinsDe(opcoes) -> { pins: [{ lugar, lat, lng, hora, festas: [id], contagem, ... }], soNaLista }
  // `opcoes` é a lista na ordem do resultado (as opções do POST /api/festas,
  // com `festa` dentro, ou as próprias festas). Tira exemplo, precisão de
  // bairro e quem não tem coordenada; junta por lugar (o `lugar` do cadastro
  // de casas, senão o mesmo ponto a uns 10 m), na ordem em que a primeira
  // festa de cada lugar aparece, que é a ordem de foco dos pinos.
  // `soNaLista` conta as reais que ficam fora do mapa.
  function pinsDe(opcoes) {
    const lista = Array.isArray(opcoes) ? opcoes : [];
    const porChave = new Map();
    const pins = [];
    let soNaLista = 0;
    let primeira = true;
    for (const o of lista) {
      const f = festaDe(o);
      if (!f || typeof f !== 'object' || ehExemplo(o)) continue;
      const ehMelhor = primeira;
      primeira = false;
      const p = pontoDe(f);
      if (!p) {
        soNaLista += 1;
        continue;
      }
      const chave = p.lugar ? `lugar:${p.lugar}` : `ponto:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      let pin = porChave.get(chave);
      if (!pin) {
        pin = { lugar: p.lugar, lat: p.lat, lng: p.lng, hora: horaDe(f.inicio), festas: [], nomes: [], casa: f.casa || null, contagem: 0, melhor: false };
        porChave.set(chave, pin);
        pins.push(pin);
      }
      pin.festas.push(f.id);
      pin.nomes.push(f.nome || '');
      pin.contagem += 1;
      if (ehMelhor) pin.melhor = true;
    }
    for (const pin of pins) pin.rotulo = rotuloDoPino(pin);
    return { pins, soNaLista };
  }

  // "18h, Sexta Sem Pressa e mais 1, Casa Expediente" (o aria-label do pino).
  function rotuloDoPino(pin) {
    const partes = [pin.hora || 'Horário a confirmar'];
    const mais = pin.contagem - 1;
    partes.push(`${pin.nomes[0] || 'Festa'}${mais > 0 ? ` e mais ${mais}` : ''}`);
    if (pin.casa) partes.push(pin.casa);
    return partes.join(', ');
  }

  // O texto de dentro do pino: a hora e, quando a casa tem mais de uma, "+1".
  // Sem hora, o mesmo termo da lista: "a confirmar".
  const textoDoPino = (pin) => ({ hora: pin.hora || 'a confirmar', mais: pin.contagem > 1 ? `+${pin.contagem - 1}` : '' });

  // agruparNaTela(pins, projetar, raio) -> pins: dois lugares a menos de
  // `raio` px um do outro na tela viram um pino só (a hora e a casa do
  // primeiro na ordem da lista, a contagem somada, "+N"), como a casa com
  // mais de uma festa. projetar(pin) -> { x, y } (o ponto do contêiner).
  // Guloso, na ordem da lista: o melhor nunca é engolido por outro.
  const RAIO_DO_PINO = 44;
  function agruparNaTela(pins, projetar, raio = RAIO_DO_PINO) {
    const grupos = [];
    for (const pin of Array.isArray(pins) ? pins : []) {
      const pt = projetar(pin);
      const g = pt && grupos.find((x) => Math.hypot(x.pt.x - pt.x, x.pt.y - pt.y) < raio);
      if (!g) {
        grupos.push({ pt, pin: { ...pin, festas: pin.festas.slice(), nomes: pin.nomes.slice() } });
        continue;
      }
      g.pin.festas.push(...pin.festas);
      g.pin.nomes.push(...pin.nomes);
      g.pin.contagem += pin.contagem;
      g.pin.melhor = g.pin.melhor || pin.melhor;
    }
    return grupos.map((g) => ({ ...g.pin, rotulo: rotuloDoPino(g.pin) }));
  }

  // As duas linhas do mapa: "6 de 8 no mapa" e a das que ficam só na lista.
  function legendas(opcoes) {
    const lista = (Array.isArray(opcoes) ? opcoes : []).filter((o) => festaDe(o) && !ehExemplo(o));
    const { soNaLista } = pinsDe(lista);
    const total = lista.length;
    const noMapa = total - soNaLista;
    let fora = '';
    if (soNaLista) {
      const semTexto = lista.filter((o) => !pontoDe(festaDe(o))).every((o) => {
        const e = festaDe(o).endereco;
        return !(e && typeof e.texto === 'string' && e.texto.trim());
      });
      const qual = semTexto ? 'sem endereço divulgado' : 'sem endereço no mapa';
      fora = soNaLista === 1 ? `1 festa ${qual} fica só na lista.` : `${soNaLista} festas ${qual} ficam só na lista.`;
    }
    return { rotulo: total ? `${noMapa} de ${total} no mapa` : '', fora, noMapa, total, soNaLista };
  }

  // Como enquadrar: um ponto só (ou todos no mesmo lugar) fica no zoom máximo;
  // mais de um, a caixa deles, sem passar do zoom máximo. Sem pino, null.
  function enquadramento(pins, opcoes = {}) {
    const zoomMax = num(opcoes.zoomMax) ? opcoes.zoomMax : ZOOM_MAX;
    const ps = (Array.isArray(pins) ? pins : []).filter((p) => p && num(p.lat) && num(p.lng));
    if (!ps.length) return null;
    const lats = ps.map((p) => p.lat);
    const lngs = ps.map((p) => p.lng);
    const s = Math.min(...lats);
    const n = Math.max(...lats);
    const w = Math.min(...lngs);
    const e = Math.max(...lngs);
    if (n - s < 1e-6 && e - w < 1e-6) return { centro: [ps[0].lat, ps[0].lng], zoom: zoomMax };
    return { caixa: [[s, w], [n, e]], zoomMax };
  }

  // Atribuição do provedor dos tiles: OSM sempre; CARTO quando for ele.
  function atribuicaoDos(tiles) {
    const osm = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    return /cartocdn\.com|carto\.com/i.test(tiles || '') ? `${osm} · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>` : osm;
  }

  // Só https e com {z}, {x} e {y}; o resto cai no padrão (a CSP do servidor
  // também só aceita https).
  function tilesValidos(url) {
    const u = typeof url === 'string' ? url.trim() : '';
    return /^https:\/\/[^\s"'<>]+$/.test(u) && u.includes('{z}') && u.includes('{x}') && u.includes('{y}') ? u : null;
  }

  // ------------------------------------------------------------ navegador

  const doc = () => raiz && raiz.document;
  const reduzido = () => !!(raiz && raiz.matchMedia && raiz.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const toque = () => !!(raiz && raiz.matchMedia && raiz.matchMedia('(pointer: coarse)').matches);
  const meta = (nome) => {
    const el = doc() && doc().querySelector(`meta[name="${nome}"]`);
    return el ? el.getAttribute('content') : null;
  };
  const tilesDia = () => tilesValidos(meta('finde-tiles')) || TILES_PADRAO;
  const tilesNoite = () => tilesValidos(meta('finde-tiles-noite'));
  const noite = () => !!(doc() && doc().documentElement.dataset.tema === 'noite');

  // Os tempos moram no CSS (--mov-*, lidos como no comum.js).
  function tempo(nome, reserva) {
    try {
      const v = raiz.getComputedStyle(doc().documentElement).getPropertyValue(`--mov-${nome}`).trim();
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return reserva;
      return /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : reserva;
    } catch {
      return reserva;
    }
  }
  function curva(nome, reserva) {
    try {
      return raiz.getComputedStyle(doc().documentElement).getPropertyValue(`--mov-${nome}`).trim() || reserva;
    } catch {
      return reserva;
    }
  }

  // Carrega o Leaflet e os estilos uma vez, só quando alguém pede o mapa.
  let carregando = null;
  function carregar() {
    const d = doc();
    if (raiz.L && raiz.L.version === LEAFLET) return Promise.resolve(raiz.L);
    if (carregando) return carregando;
    const estilo = (href) =>
      new Promise((ok, falha) => {
        const ja = d.querySelector(`link[rel="stylesheet"][href="${href}"]`);
        if (ja) return ok();
        const l = d.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.onload = () => ok();
        l.onerror = () => falha(new Error(`não carregou ${href}`));
        d.head.appendChild(l);
      });
    const roteiro = (src) =>
      new Promise((ok, falha) => {
        const s = d.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => ok();
        s.onerror = () => falha(new Error(`não carregou ${src}`));
        d.head.appendChild(s);
      });
    // A ordem dos <link> no head decide a cascata: o mapa.css vem depois.
    carregando = Promise.all([estilo('/vendor/leaflet/leaflet.css'), estilo('/mapa.css'), roteiro('/vendor/leaflet/leaflet.js')]).then(() => {
      if (!raiz.L || raiz.L.version !== LEAFLET) throw new Error('Leaflet ausente');
      return raiz.L;
    });
    carregando.catch(() => {
      carregando = null;
    });
    return carregando;
  }

  const estados = new WeakMap();

  // A cortina: um elemento na cor do fundo que encolhe por scaleY de cima
  // para baixo (o mapa aparece a partir do link). Só transform e opacity; a
  // página nasce pronta (fill: backwards), então se a animação falhar o mapa
  // já está lá. Devolve uma promessa que resolve no fim da cortina.
  function abrirCortina(el, cortina) {
    const bloco = tempo('bloco', 560);
    if (reduzido()) {
      const a = el.animate ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tempo('toque', 160), easing: 'linear', fill: 'backwards' }) : null;
      return a ? a.finished.catch(() => {}) : Promise.resolve();
    }
    if (!cortina.animate) return Promise.resolve();
    const a = cortina.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], {
      duration: bloco,
      easing: curva('troca', 'cubic-bezier(.6, 0, .2, 1)'),
      fill: 'backwards',
    });
    return a.finished.catch(() => {});
  }

  function animarPinos(estado) {
    if (reduzido()) return;
    const escala = tempo('escala', 60);
    const dur = tempo('estado', 320);
    const saida = curva('saida', 'cubic-bezier(.2, .7, .2, 1)');
    estado.marcadores.forEach((m, i) => {
      const dentro = m.getElement() && m.getElement().querySelector('.pino-in');
      if (!dentro || !dentro.animate) return;
      dentro.animate([{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], {
        duration: dur,
        delay: Math.min(i, 5) * escala,
        easing: saida,
        fill: 'backwards',
      });
    });
  }

  function marcarPino(estado, indice) {
    estado.marcado = indice;
    estado.marcadores.forEach((m, i) => {
      const el = m.getElement();
      if (el) el.setAttribute('aria-pressed', i === indice ? 'true' : 'false');
      m.setZIndexOffset(i === indice ? 2000 : estado.pins[i].melhor ? 1000 : 0);
    });
  }

  function camadaDeTiles(L, estado) {
    const url = noite() && tilesNoite() ? tilesNoite() : tilesDia();
    estado.urlTiles = url;
    return L.tileLayer(url, {
      minZoom: 10,
      maxZoom: 19,
      attribution: atribuicaoDos(url),
      referrerPolicy: 'strict-origin-when-cross-origin',
      updateWhenIdle: true,
      keepBuffer: 1,
    });
  }

  // O tema muda com o mapa aberto: com tiles próprios da noite, troca a
  // camada no instante do apagado; sem eles, o filtro do CSS cuida.
  function vigiarTema(estado) {
    if (!raiz.MutationObserver || !tilesNoite()) return;
    estado.observador = new raiz.MutationObserver(() => {
      const url = noite() ? tilesNoite() : tilesDia();
      if (url !== estado.urlTiles && estado.tiles) {
        estado.urlTiles = url;
        estado.tiles.setUrl(url);
      }
    });
    estado.observador.observe(doc().documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  }

  function montarBase(el, L, opcoesDoMapa, classe) {
    desmontar(el);
    const d = doc();
    const tinhaClasse = el.classList.contains(classe);
    el.classList.add(classe, 'mapa-vivo');
    if (!tilesNoite()) el.classList.add('mapa--filtro-noite');
    // As telhas padrão do OSM, coloridas, ganham o tom de papel de dia.
    if (tilesDia() === TILES_PADRAO) el.classList.add('mapa--filtro-dia');
    const caixa = d.createElement('div');
    caixa.className = 'mapa-leaflet';
    const cortina = d.createElement('div');
    cortina.className = 'mapa-cortina';
    cortina.setAttribute('aria-hidden', 'true');
    el.append(caixa, cortina);
    const r = reduzido();
    const mapa = L.map(caixa, {
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: !r,
      fadeAnimation: !r,
      markerZoomAnimation: !r,
      inertia: !r,
      scrollWheelZoom: false,
      ...opcoesDoMapa,
    });
    L.control.attribution({ position: 'bottomright', prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' }).addTo(mapa);
    const estado = { mapa, caixa, cortina, marcadores: [], pins: [], marcado: -1, tiles: null, urlTiles: null, observador: null, tempos: [], classe: tinhaClasse ? null : classe };
    estados.set(el, estado);
    return estado;
  }

  // A atribuição chega por opacidade aos 400 ms e não sai mais.
  function mostrarAtribuicao(estado) {
    const a = estado.mapa.attributionControl && estado.mapa.attributionControl.getContainer();
    if (a && a.animate && !reduzido()) a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tempo('estado', 320), delay: 400, easing: 'linear', fill: 'backwards' });
  }

  // montarLista(el, opcoes, ajustes) -> Promise<{ pins, soNaLista }>: o mapa do resultado, no elemento.
  // ajustes: { bairros: [{ lat, lng, nome }] (os pedidos, círculo fino sem
  //   rótulo), aoMarcar({ festas, lugar, indice }) (primeiro toque no pino:
  //   o app marca as linhas daquela casa), aoAbrir(festaId) (segundo toque:
  //   abre o detalhe), rotulo (aria-label do mapa) }.
  async function montarLista(el, opcoes, ajustes = {}) {
    const { pins, soNaLista } = pinsDe(opcoes);
    if (!el || !doc()) return { pins: pins.length, soNaLista };
    let L;
    try {
      L = await carregar();
    } catch {
      el.classList.add('mapa-falhou');
      el.textContent = 'O mapa não carregou. As festas continuam na lista.';
      return { pins: pins.length, soNaLista, erro: true };
    }
    const estado = montarBase(
      el,
      L,
      {
        // Em tela de toque, um dedo rola a página; dois dedos movem e
        // aproximam o mapa (o touchZoom do Leaflet anda junto com a pinça).
        dragging: !toque(),
        touchZoom: true,
        doubleClickZoom: true,
        keyboard: true,
        maxZoom: 19,
      },
      'mapa',
    );
    const { mapa } = estado;
    estado.pins = [];
    if (ajustes.rotulo) el.setAttribute('aria-label', ajustes.rotulo);
    L.control.zoom({ position: 'bottomleft', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);

    const q = enquadramento(pins);
    if (q && q.centro) mapa.setView(q.centro, q.zoom, { animate: false });
    else if (q) mapa.fitBounds(q.caixa, { maxZoom: q.zoomMax, paddingTopLeft: [36, 48], paddingBottomRight: [36, 20], animate: false });
    else mapa.setView([-23.5505, -46.6333], 12, { animate: false });

    estado.tiles = camadaDeTiles(L, estado).addTo(mapa);
    for (const b of Array.isArray(ajustes.bairros) ? ajustes.bairros : []) {
      if (b && num(b.lat) && num(b.lng)) L.circle([b.lat, b.lng], { radius: 700, className: 'mapa-bairro', interactive: false, fill: false, weight: 1 }).addTo(mapa);
    }
    vigiarTema(estado);

    // A cortina abre já; os pinos esperam a primeira telha ou 400 ms (o que
    // vier primeiro) e não entram antes dos 440 ms.
    const inicio = Date.now();
    const cortina = abrirCortina(el, estado.cortina).then(() => {
      if (estados.get(el) === estado) mapa.invalidateSize({ animate: false });
    });
    estado.tempos.push(setTimeout(() => estados.get(el) === estado && mapa.invalidateSize({ animate: false }), reduzido() ? 0 : tempo('bloco', 560) + 20));
    const primeiraTelha = new Promise((ok) => {
      estado.tiles.once('tileload load', ok);
      estado.tempos.push(setTimeout(ok, 400));
    });
    mostrarAtribuicao(estado);
    await primeiraTelha;
    const falta = reduzido() ? 0 : Math.max(0, 440 - (Date.now() - inicio));
    if (falta) await new Promise((ok) => estado.tempos.push(setTimeout(ok, falta)));
    if (estados.get(el) !== estado) return { pins: pins.length, soNaLista };
    estado.basePins = pins;
    desenharPinos(estado, L, ajustes);
    animarPinos(estado);
    // Depois de um zoom, as casas que se afastaram (ou se aproximaram) na
    // tela se separam (ou se juntam) de novo.
    mapa.on('zoomend', () => {
      if (estados.get(el) === estado) desenharPinos(estado, L, ajustes);
    });
    await cortina;
    return { pins: pins.length, soNaLista };
  }

  // Os pinos na tela: agrupa por proximidade e (re)cria os marcadores. O
  // pino marcado continua marcado se a festa dele ainda está num pino.
  function desenharPinos(estado, L, ajustes) {
    const { mapa } = estado;
    const marcada = estado.marcado >= 0 && estado.pins[estado.marcado] ? estado.pins[estado.marcado].festas[0] : null;
    const grupos = agruparNaTela(estado.basePins, (p) => mapa.latLngToContainerPoint([p.lat, p.lng]));
    const igual = grupos.length === estado.pins.length && grupos.every((g, i) => g.festas.join() === estado.pins[i].festas.join());
    if (igual && estado.marcadores.length) return;
    for (const m of estado.marcadores) m.remove();
    estado.marcadores = [];
    estado.pins = grupos;
    estado.marcado = -1;
    grupos.forEach((pin, i) => {
      const t = textoDoPino(pin);
      const icone = L.divIcon({
        className: `pino${pin.melhor ? ' pino--melhor' : ''}`,
        html: `<span class="pino-in">${escapar(t.hora)}${t.mais ? `<i>${escapar(t.mais)}</i>` : ''}</span>`,
        iconSize: null,
      });
      const m = L.marker([pin.lat, pin.lng], { icon: icone, keyboard: false, title: '', zIndexOffset: pin.melhor ? 1000 : 0, riseOnHover: false });
      m.addTo(mapa);
      const elPino = m.getElement();
      elPino.setAttribute('role', 'button');
      elPino.setAttribute('tabindex', '0');
      elPino.setAttribute('aria-label', pin.rotulo);
      elPino.setAttribute('aria-pressed', 'false');
      const tocar = () => {
        if (estado.marcado === i) {
          if (typeof ajustes.aoAbrir === 'function') ajustes.aoAbrir(pin.festas[0]);
          return;
        }
        marcarPino(estado, i);
        if (typeof ajustes.aoMarcar === 'function') ajustes.aoMarcar({ festas: pin.festas.slice(), lugar: pin.lugar, indice: i });
      };
      m.on('click', tocar);
      elPino.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          tocar();
        }
      });
      estado.marcadores.push(m);
    });
    if (marcada) {
      const i = grupos.findIndex((g) => g.festas.includes(marcada));
      if (i >= 0) marcarPino(estado, i);
    }
  }

  // montarDetalhe(el, festa, ajustes) -> Promise<boolean>: o mini-mapa estático do detalhe.
  // Sem ponto (precisão de bairro, sem coordenada, fora de SP), false e nada
  // é desenhado: o detalhe fica com "Como chegar" pelo texto.
  async function montarDetalhe(el, festa, ajustes = {}) {
    const f = festaDe(festa);
    const p = pontoDe(f);
    if (!el || !p || !doc()) return false;
    let L;
    try {
      L = await carregar();
    } catch {
      el.classList.add('mapa-falhou');
      el.textContent = 'O mapa não carregou.';
      return false;
    }
    const estado = montarBase(
      el,
      L,
      { dragging: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false },
      'mini-mapa',
    );
    const { mapa } = estado;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', ajustes.rotulo || `Mapa: ${f.casa || f.nome || 'a festa'}`);
    mapa.setView([p.lat, p.lng], ZOOM_DETALHE, { animate: false });
    estado.tiles = camadaDeTiles(L, estado).addTo(mapa);
    vigiarTema(estado);
    const hora = horaDe(f.inicio) || 'aqui';
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: 'pino pino--melhor', html: `<span class="pino-in">${escapar(hora)}</span>`, iconSize: null }),
      interactive: false,
      keyboard: false,
    }).addTo(mapa);
    mostrarAtribuicao(estado);
    await abrirCortina(el, estado.cortina);
    if (estados.get(el) === estado) mapa.invalidateSize({ animate: false });
    return true;
  }

  // marcar(el, festaId): marca o pino da festa (quando a linha da lista é
  // tocada com o mapa aberto). Devolve se achou.
  function marcar(el, festaId) {
    const estado = el && estados.get(el);
    if (!estado) return false;
    const i = estado.pins.findIndex((p) => p.festas.includes(festaId));
    if (i < 0) return false;
    marcarPino(estado, i);
    return true;
  }

  // desmontar(el): tira o mapa do elemento e solta os ouvintes.
  function desmontar(el) {
    const estado = el && estados.get(el);
    if (!estado) return;
    estados.delete(el);
    for (const t of estado.tempos) clearTimeout(t);
    if (estado.observador) estado.observador.disconnect();
    try {
      estado.mapa.remove();
    } catch {
      /* já saiu */
    }
    estado.caixa.remove();
    estado.cortina.remove();
    el.classList.remove('mapa-vivo', 'mapa--filtro-noite', 'mapa--filtro-dia', 'mapa-falhou');
    if (estado.classe) el.classList.remove(estado.classe);
  }

  function escapar(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return {
    montarLista, montarDetalhe, desmontar, pinsDe, marcar, agruparNaTela,
    enquadramento, legendas, horaDe, atribuicaoDos, tilesValidos,
    ZOOM_MAX, TILES_PADRAO,
  };
});

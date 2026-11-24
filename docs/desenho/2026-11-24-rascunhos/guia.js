// finde. Direção E · Guia — o movimento do rascunho (U39).
// Rascunho para aprovação, não é código do app. Mostra cada transição de
// movimento.md funcionando, com os mesmos tempos e curvas, para a lane
// app-telas portar para comum.js/app.js. Regras iguais às do app: tudo parte
// do estado final (a página nasce pronta), só transform e opacity animam,
// nada de estilo em linha fora do CSSOM, movimento reduzido vira no máximo
// uma troca de opacidade de 160 ms.
//
// Parâmetros da URL, para as capturas: tela (pergunta, resultado, vazio,
// detalhe, convite), tema (dia, noite), estado (lista, todas, mapa), media
// (sem, com), abre (peca, chegar, mini, fontes, enviado), parado (1: sem
// animação de entrada, para a captura estática).
(function () {
  'use strict';

  const q = new URLSearchParams(location.search);
  const raiz = document.documentElement;
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)');
  let parado = q.get('parado') === '1';
  const pode = () => !parado && !reduzir.matches && typeof Element.prototype.animate === 'function';

  // O vocabulário, lido do CSS como no app.
  const cs = getComputedStyle(raiz);
  const ms = (n) => parseFloat(cs.getPropertyValue(`--mov-${n}`)) || 0;
  const V = {
    saida: cs.getPropertyValue('--mov-saida').trim(), troca: cs.getPropertyValue('--mov-troca').trim(),
    toque: ms('toque'), estado: ms('estado'), bloco: ms('bloco'), capa: ms('capa'), titulo: ms('titulo'), regua: ms('regua'), escala: ms('escala'),
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function animar(el, quadros, opcoes) {
    if (!el) return null;
    const qs = quadros.length === 1 ? [{ ...quadros[0], offset: 0 }] : quadros;
    try { return el.animate(qs, { fill: 'backwards', ...opcoes }); } catch { return null; }
  }
  function soOpacidade(els) {
    if (parado) return;
    els.forEach((e) => animar(e, [{ opacity: 0 }], { duration: V.toque, easing: 'linear' }));
  }
  // Entrada de bloco: sobe 12 px e aparece, em escada de 60 ms, até seis.
  function subir(els, { atraso = 0, y = 12, duracao = V.bloco } = {}) {
    els = els.filter(Boolean);
    if (!pode()) return soOpacidade(els);
    els.forEach((e, i) => animar(e, [{ opacity: 0, translate: `0 ${y}px` }], { duration: duracao, easing: V.saida, delay: atraso + Math.min(i, 5) * V.escala }));
  }
  // Um fio que se desenha da esquerda.
  function fio(el, { atraso = 0, duracao = V.bloco, curva = V.saida } = {}) {
    if (!el || !pode()) return;
    animar(el, [{ transform: 'scaleX(0)', transformOrigin: '0 50%' }, { transform: 'scaleX(1)', transformOrigin: '0 50%' }], { duration: duracao, easing: curva, delay: atraso });
  }
  // Título por linha: cada linha sobe de dentro da sua máscara (a máscara é
  // fixa, só o translate anima). Rascunho: uma linha por elemento.
  function titulo(h, atraso = 0) {
    if (!h || !pode()) return soOpacidade([h]);
    animar(h, [{ opacity: 0, translate: '0 .35em' }], { duration: V.titulo, easing: V.saida, delay: atraso });
  }

  // A régua da noite: o traço da festa corre linear (é tempo), os rótulos
  // aparecem quando o traço passa por eles, o pico entra por último.
  function regua(r, atraso = 0) {
    if (!r) return;
    const festa = $('.regua-festa', r);
    if (!pode()) return soOpacidade([r]);
    animar(festa, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: V.regua, easing: 'linear', delay: atraso });
    $$('.regua-rot', r).forEach((rot) => {
      const pos = rot.classList.contains('regua-rot--fim') ? 1 : rot.classList.contains('em-40') ? 0.4 : 0;
      animar(rot, [{ opacity: 0, translate: '0 4px' }], { duration: V.estado, easing: V.saida, delay: atraso + pos * V.regua });
    });
    const pico = $('.regua-pico', r);
    animar(pico, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: V.toque, easing: V.saida, delay: atraso + 0.4 * V.regua });
  }

  // A capa assenta: a foto desfocada vem de 1,08 a 1,06 (a escala de
  // repouso, que esconde a borda do desfoque) e o véu já está lá.
  function capa(c, atraso = 0) {
    if (!c) return;
    const f = $('.capa-fundo', c);
    if (!pode()) return soOpacidade([c]);
    // O bloco inteiro aparece (nunca um retângulo escuro vazio antes da
    // foto) e a foto assenta por escala dentro do recorte.
    animar(c, [{ opacity: 0 }], { duration: V.estado, easing: 'linear', delay: atraso });
    animar($('.capa-foto', c), [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: V.capa, easing: V.saida, delay: atraso });
    subir([$('.etiquetas', c), $('.capa-quando', c), $('.capa-nome', c), $('.capa-onde', c), $('.porque', c)].filter(Boolean), { atraso: atraso + 120 });
    regua($('.regua', c), atraso + 240);
  }

  // ------------------------------------------------------------ entradas por tela

  const entradas = {
    pergunta(t) {
      titulo($('[data-mov="titulo"]', t));
      subir([$('.base-viva', t), $('.semanas', t), ...$$('.opcao', t), $('.pe', t)], { atraso: 180 });
    },
    resultado(t) {
      const ed = $('.edicao', t);
      if (pode()) {
        // Os dois fios da edição se desenham (scaleX nos pseudo-elementos);
        // o texto da edição sobe logo atrás deles.
        for (const [pe, at] of [['::before', 0], ['::after', 80]]) {
          animar(ed, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { pseudoElement: pe, duration: V.bloco, easing: V.saida, delay: at });
        }
        $$('span', ed).forEach((x, i) => animar(x, [{ opacity: 0, translate: '0 6px' }], { duration: V.estado, easing: V.saida, delay: 160 + i * V.escala }));
      }
      titulo($('[data-mov="titulo"]', t), 120);
      subir([$('.pedido', t), $('.sem-media', t), $('.abas-linha', t)], { atraso: 260 });
      if (!$('.lista', t).hidden) {
        capa($('.capa', t), 320);
        subir($$('.chamada', t), { atraso: 560 });
        subir($$('.mais', t), { atraso: 700 });
      }
      posicionarFio(t, false);
    },
    vazio(t) { titulo($('h1', t)); subir($$('.linhas li', t), { atraso: 240 }); posicionarFio(t, false); },
    detalhe(t) {
      capa($('.capa', t), 0);
      subir($$('.secao, .vazios', t), { atraso: 360 });
      if (pode()) animar($('.barra', t), [{ transform: 'translate(-50%, 100%)' }], { duration: V.bloco, easing: V.saida, delay: 300 });
    },
    convite(t) { subir([$('.registro', t), ...$$('.avaliar > *', t), $('.bloco', t)], { atraso: 0 }); },
  };

  // ------------------------------------------------------------ telas

  let atual = null;
  function mostrar(nome) {
    $$('[data-tela]').forEach((t) => { t.hidden = t.dataset.tela !== nome; });
    atual = nome;
    $('#folio-tela').textContent = { pergunta: 'Primeira pergunta', resultado: 'O guia da semana', vazio: 'Dia sem festa real', detalhe: 'Detalhe', convite: 'Convite com avaliação' }[nome];
    // No desktop: no detalhe, o lado esquerdo troca o relógio pelo flyer
    // inteiro, nítido; nas outras telas o relógio volta.
    const esq = $('#lado-esq');
    if (!relogioOriginal) relogioOriginal = [...esq.childNodes];
    if (nome === 'detalhe') {
      const fig = document.createElement('figure'); fig.className = 'lado-cartaz';
      const img = new Image(); img.src = '../../../prototipo/v1-festas/publico/cartazes/sexta-sem-pressa.webp'; img.alt = '';
      const cap = document.createElement('figcaption'); cap.textContent = 'Flyer · divulgação @coletivoexpediente';
      fig.append(img, cap);
      esq.replaceChildren(fig); esq.classList.add('com-cartaz', 'lado-cartaz');
    } else {
      esq.replaceChildren(...relogioOriginal); esq.classList.remove('com-cartaz', 'lado-cartaz');
    }
  }
  let relogioOriginal = null;
  function entrar(nome) { const t = $(`[data-tela="${nome}"]`); if (entradas[nome]) entradas[nome](t); }

  // Lista → detalhe com View Transitions: os nomes vão só nos elementos da
  // festa tocada, antes da troca na origem e dentro do callback no destino.
  function nomear(escopo) {
    const xs = $$('[data-vt]', escopo).filter((x) => x.offsetParent !== null || x.closest('.capa'));
    xs.forEach((x) => { x.style.viewTransitionName = x.dataset.vt; });
    return xs;
  }
  function limpar(xs) { xs.forEach((x) => { x.style.viewTransitionName = ''; }); }

  // O cartão que abriu o detalhe: na volta, é ele que recebe os nomes.
  let aberta = null;
  function ir(nome, origem) {
    if (nome === atual) return;
    const destino = $(`[data-tela="${nome}"]`);
    const volta = atual === 'detalhe' && nome === 'resultado';
    const escopoIda = volta ? $('[data-tela="detalhe"]') : origem;
    const escopoChegada = volta ? aberta : nome === 'detalhe' ? destino : null;
    if (nome === 'detalhe') aberta = origem;
    const vt = typeof document.startViewTransition === 'function' && pode() && escopoIda && escopoChegada;
    if (!vt) {
      mostrar(nome); scrollTo(0, 0);
      if (volta) soOpacidade([destino]); else entrar(nome);
      return;
    }
    const ida = nomear(escopoIda);
    let chegada = [];
    const t = document.startViewTransition(() => {
      limpar(ida);
      mostrar(nome); scrollTo(0, 0);
      chegada = nomear(escopoChegada);
    });
    // Durante a troca só a capa, o cartaz, a hora e o nome viajam; na ida,
    // o resto do detalhe entra em blocos assim que a troca começa a pintar.
    // Na volta, a lista já está pronta e não reencena a entrada.
    t.ready.then(() => {
      if (nome === 'detalhe') {
        subir($$('.secao, .vazios', destino), { atraso: 240 });
        regua($('.regua', destino), 200);
      }
    }).catch(() => {});
    t.finished.finally(() => limpar(chegada));
  }

  // ------------------------------------------------------------ abas

  function posicionarFio(t, anima) {
    const abas = $('.abas', t); if (!abas) return;
    const sel = $('.aba[aria-selected="true"]', abas); const fio = $('.aba-fio', abas);
    if (!sel || !fio) return;
    if (!anima) fio.style.transition = 'none';
    // O fio cobre só a palavra, não a contagem.
    const largura = sel.firstChild.nodeType === 3 ? medirTexto(sel) : sel.offsetWidth;
    fio.style.transform = `translateX(${sel.offsetLeft}px) scaleX(${largura})`;
    if (!anima) { fio.getBoundingClientRect(); fio.style.transition = ''; }
  }
  function medirTexto(sel) {
    const r = document.createRange(); r.selectNodeContents(sel.firstChild); return Math.round(r.getBoundingClientRect().width);
  }
  function trocarAba(aba) {
    const t = aba.closest('[data-tela]');
    $$('.aba', t).forEach((a) => a.setAttribute('aria-selected', String(a === aba)));
    posicionarFio(t, true);
    // O conteúdo troca: o velho sai em 140 ms, o novo sobe depois dele.
    const blocos = [$('.capa', t), ...$$('.chamada', t)].filter((x) => x && x.offsetParent);
    if (!pode()) return soOpacidade(blocos);
    const saidas = blocos.map((b) => animar(b, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -6px' }], { duration: 140, easing: V.troca, fill: 'forwards' }));
    setTimeout(() => {
      saidas.forEach((a) => a && a.cancel());
      capa($('.capa', t), 0); subir($$('.chamada', t), { atraso: 120 });
    }, 140);
  }

  // ------------------------------------------------------------ ver todas e mapa

  function abrirTodas(botao, anima = true) {
    const todas = $('#todas'); const aberta = !todas.hidden;
    todas.hidden = aberta; botao && botao.setAttribute('aria-expanded', String(!aberta));
    if (!aberta && anima) { subir([$('.todas-cabeca', todas), $('.filtros', todas)]); subir($$('.linha', todas), { atraso: 120 }); }
  }

  const largo = () => matchMedia('(min-width: 1024px)').matches;
  function alternarMapa(link, anima = true) {
    const t = $('[data-tela="resultado"]'); const mapa = $('#mapa');
    const abrir = mapa.hidden;
    const noMais = $('.mais [data-alternar]', t);
    if (largo()) {
      // Desktop: o mapa abre no lado direito; a lista continua onde está e
      // o mesmo link passa a fechar o mapa.
      const dir = $('#lado-dir');
      if (abrir) { dir.classList.add('com-mapa'); dir.append(mapa, $('.mapa-fora', t)); } else dir.classList.remove('com-mapa');
      noMais.firstChild.textContent = abrir ? 'Fechar o mapa ' : 'Ver no mapa ';
      mapa.hidden = !abrir; $('.mapa-fora').hidden = !abrir;
    } else {
      $$('[data-so="lista"]', t).forEach((x) => { x.hidden = abrir; });
      if (abrir && $('#todas').hidden) abrirTodas($('[data-todas]'), false);
      mapa.hidden = !abrir; $$('[data-so="mapa"]').forEach((x) => { x.hidden = !abrir; });
      if (abrir && anima) scrollTo(0, $('.abas-linha', t).offsetTop - 8);
    }
    noMais.setAttribute('aria-expanded', String(abrir));
    if (!abrir || !anima) return;
    if (!pode()) return soOpacidade([mapa]);
    // A cortina na cor do fundo encolhe para baixo: o mapa aparece a partir
    // do link, de cima. Transform só (scaleY), nunca clip-path.
    animar(mapa, [{ transform: 'scaleY(1)', transformOrigin: '50% 100%' }, { transform: 'scaleY(0)', transformOrigin: '50% 100%' }], { pseudoElement: '::after', duration: V.bloco, easing: V.troca, fill: 'none' });
    $$('.pino-in', mapa).forEach((p, i) => animar(p, [{ opacity: 0, translate: '0 -8px' }], { duration: V.estado, easing: V.saida, delay: V.bloco - 120 + i * V.escala }));
    animar($('.atribuicao', mapa), [{ opacity: 0 }], { duration: V.estado, easing: 'linear', delay: V.bloco - 160 });
    if (!largo()) subir($$('.linha', $('#todas')), { atraso: V.bloco - 160 });
  }

  // O pino tocado destaca a linha da lista; o segundo toque abre o detalhe.
  function tocarPino(p) {
    if (p.getAttribute('aria-pressed') === 'true') return ir('detalhe', null);
    $$('.pino').forEach((x) => x.setAttribute('aria-pressed', String(x === p)));
  }

  // ------------------------------------------------------------ detalhe

  function abrirDisclosure(botao, alvo, anima = true) {
    const abre = alvo.hidden; alvo.hidden = !abre; botao.setAttribute('aria-expanded', String(abre));
    if (abre && anima) subir([...alvo.children]);
  }
  function abrirPeca(anima = true) {
    const peca = $('#peca'); const mini = $('.cartaz', $('[data-tela="detalhe"]'));
    const fazer = () => { peca.hidden = false; };
    if (anima && pode() && document.startViewTransition) {
      mini.style.viewTransitionName = 'festa-cartaz';
      const t = document.startViewTransition(() => { mini.style.viewTransitionName = ''; fazer(); $('img', peca).style.viewTransitionName = 'festa-cartaz'; });
      t.finished.finally(() => { $('img', peca).style.viewTransitionName = ''; });
    } else { fazer(); if (anima) soOpacidade([peca]); }
  }
  function fecharPeca() {
    const peca = $('#peca'); const mini = $('.cartaz', $('[data-tela="detalhe"]'));
    if (pode() && document.startViewTransition) {
      $('img', peca).style.viewTransitionName = 'festa-cartaz';
      const t = document.startViewTransition(() => { $('img', peca).style.viewTransitionName = ''; peca.hidden = true; mini.style.viewTransitionName = 'festa-cartaz'; });
      t.finished.finally(() => { mini.style.viewTransitionName = ''; });
    } else peca.hidden = true;
  }

  // ------------------------------------------------------------ convite

  function enviar(e, anima = true) {
    if (e) e.preventDefault();
    const form = $('#avaliar'); const ok = $('#confirmacao');
    if (!anima || !pode()) { form.hidden = true; ok.hidden = false; return soOpacidade([ok]); }
    const b = $('.botao', form);
    // O botão se enche da esquerda (o mesmo gesto do "Tô dentro"), o
    // formulário sai, a confirmação sobe no lugar dele.
    animar(b, [{ opacity: 1 }, { opacity: .6 }], { duration: V.toque, fill: 'none' });
    setTimeout(() => {
      animar(form, [{ opacity: 1 }, { opacity: 0 }], { duration: V.toque, easing: V.troca, fill: 'none' }).finished.then(() => {
        form.hidden = true; ok.hidden = false; subir([...ok.children]);
      });
    }, V.toque);
  }

  // ------------------------------------------------------------ tema

  function trocarTema() {
    const noite = raiz.dataset.tema !== 'noite';
    const main = $(`[data-tela="${atual}"]`);
    const fazer = () => { raiz.dataset.tema = noite ? 'noite' : 'dia'; $$('[data-tema-trocar]').forEach((b) => { b.textContent = noite ? 'Modo dia' : 'Modo noite'; }); };
    if (!pode()) return fazer();
    // Como no app: o main some, as cores trocam de uma vez, ele volta.
    animar(main, [{ opacity: 1 }, { opacity: 0 }], { duration: V.toque, easing: 'linear', fill: 'forwards' }).finished.then(() => {
      fazer(); main.getAnimations().forEach((a) => a.cancel()); soOpacidade([main]);
    });
  }

  // ------------------------------------------------------------ ligações

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a, button'); if (!a) return;
    if (a.matches('[data-ir]')) { ev.preventDefault(); return ir(a.dataset.ir, a.closest('.capa, .chamada, .linha') || null); }
    if (a.matches('.aba') && a.getAttribute('aria-disabled') !== 'true') { ev.preventDefault(); return trocarAba(a); }
    if (a.matches('[data-alternar]')) { ev.preventDefault(); return alternarMapa(a); }
    if (a.matches('[data-todas]')) return abrirTodas(a);
    if (a.matches('.pino')) return tocarPino(a);
    if (a.matches('[data-chegar]')) return abrirDisclosure(a, $('#destinos'));
    if (a.matches('[data-mini]')) return abrirDisclosure(a, $('#mini-mapa'));
    if (a.matches('[data-fontes]')) return abrirDisclosure(a, $('#fontes'));
    if (a.matches('[data-peca]')) return abrirPeca();
    if (a.matches('[data-peca-fechar]')) return fecharPeca();
    if (a.matches('[data-tema-trocar]')) return trocarTema();
    if (a.matches('.chip')) return a.setAttribute('aria-pressed', String(a.getAttribute('aria-pressed') !== 'true'));
    if (a.matches('.semana')) return $$('.semana').forEach((s) => s.setAttribute('aria-pressed', String(s === a)));
    if (a.getAttribute('href') === '#') ev.preventDefault();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#peca').hidden) fecharPeca(); });
  $('#avaliar').addEventListener('submit', enviar);
  addEventListener('resize', () => $$('[data-tela]').forEach((t) => posicionarFio(t, false)));

  // ------------------------------------------------------------ estado inicial pela URL

  // As telhas ilustrativas: o símbolo copiado em cada mapa (o estilo da
  // página não chega dentro de um <use>, e o tema noite precisa dele).
  const simbolo = $('#telhas');
  $$('svg.mapa-telhas').forEach((svg) => {
    svg.setAttribute('viewBox', simbolo.getAttribute('viewBox'));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.replaceChildren(...[...simbolo.childNodes].map((n) => n.cloneNode(true)));
  });

  if (q.get('tema') === 'noite') { raiz.dataset.tema = 'noite'; $$('[data-tema-trocar]').forEach((b) => { b.textContent = 'Modo dia'; }); }
  const tela = q.get('tela') || 'pergunta';
  mostrar(tela);
  const estado = q.get('estado');
  if (estado === 'todas') abrirTodas($('[data-todas]'), false);
  if (estado === 'mapa') alternarMapa($('.mais [data-alternar]'), false);
  if (q.get('media') === 'com') {
    $$('[data-media="sem"]').forEach((x) => { x.hidden = true; });
    $$('[data-media="com"]').forEach((x) => { x.hidden = false; });
    const vaz = $('.vazios'); if (vaz) vaz.textContent = 'Não divulgado: lineup, regras da porta.';
  }
  const abre = (q.get('abre') || '').split(',');
  if (abre.includes('chegar')) abrirDisclosure($('[data-chegar]'), $('#destinos'), false);
  if (abre.includes('mini')) abrirDisclosure($('[data-mini]'), $('#mini-mapa'), false);
  if (abre.includes('fontes')) abrirDisclosure($('[data-fontes]'), $('#fontes'), false);
  if (abre.includes('peca')) abrirPeca(false);
  if (abre.includes('enviado')) enviar(null, false);
  // Para filmar os quadros de movimento (capturas): liga o movimento numa
  // página aberta parada e expõe os gestos.
  window.rascunho = { mover() { parado = false; }, entrar, trocarAba, alternarMapa, ir };
  const comecar = () => { posicionarFio($(`[data-tela="${tela}"]`), false); entrar(tela); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(comecar);
})();

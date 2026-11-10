'use strict';
// Peças comuns às duas páginas: criar elementos (tudo que vem de fora entra
// por textContent), chamar a API, a marca, o lockup, o rodapé com o seletor
// de tema e as laterais do desktop.

(() => {
  function el(tag, atributos = {}, ...filhos) {
    const no = document.createElement(tag);
    for (const [k, v] of Object.entries(atributos)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') no.className = v;
      else if (k === 'texto') no.textContent = v;
      else if (k.startsWith('on')) no.addEventListener(k.slice(2), v);
      else no.setAttribute(k, v === true ? '' : String(v));
    }
    for (const f of filhos.flat()) {
      if (f === null || f === undefined || f === false) continue;
      no.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return no;
  }

  // Título com uma palavra em itálico: titulo('h1', 'titulo', 'A pista abre ', 'antes.')
  function titulo(tag, classe, antes, italico, depois = '') {
    return el(tag, { class: classe, tabindex: '-1' }, antes, el('em', { texto: italico }), depois);
  }

  async function chamar(caminho, corpo) {
    const opcoes = corpo === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
    const r = await fetch(caminho, opcoes);
    const texto = await r.text();
    let dados = null;
    try {
      dados = JSON.parse(texto);
    } catch { /* corpo não é JSON */ }
    return { status: r.status, ok: r.ok, texto, dados };
  }

  // finde. com o ponto em rosé. Para leitor de tela, só "finde".
  function marca(href) {
    const filhos = ['finde', el('span', { class: 'ponto', 'aria-hidden': 'true', texto: '.' })];
    return href
      ? el('a', { class: 'marca', href, 'aria-label': 'finde, início' }, ...filhos)
      : el('p', { class: 'marca' }, ...filhos);
  }

  // Lockup oficial: wordmark e a assinatura centralizada embaixo.
  function lockup(classe = '') {
    return el('div', { class: `lockup ${classe}`.trim() },
      el('h1', { class: 'marca', tabindex: '-1' }, 'finde', el('span', { class: 'ponto', 'aria-hidden': 'true', texto: '.' })),
      el('p', { class: 'assinatura-lockup', lang: 'en', texto: 'Still going out. Just differently.' }));
  }

  const agora = () => {
    const d = new Date();
    return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // O rótulo do seletor mostra a hora: "17h42 · noite às 18h" de dia,
  // "noite desde as 18h" à noite. Tocar alterna.
  function rotuloDoTema() {
    const T = window.FindeTema;
    if (!T) return 'mudar o tema';
    const tema = T.atual();
    const pelaHora = T.pelaHora();
    if (tema === 'noite') return pelaHora === 'noite' ? 'noite desde as 18h' : 'noite antes da hora';
    return pelaHora === 'dia' ? `${agora()} · noite às 18h` : 'dia, por escolha';
  }

  function atualizarRotulos() {
    for (const b of document.querySelectorAll('.tema-botao')) b.textContent = rotuloDoTema();
    const relogio = document.getElementById('relogio');
    if (relogio) relogio.textContent = agora();
    const sub = document.getElementById('relogio-rotulo');
    if (sub && window.FindeTema) sub.textContent = window.FindeTema.pelaHora() === 'noite' ? 'noite desde as 18h' : 'a noite começa às 18h';
  }

  function botaoTema() {
    const b = el('button', { type: 'button', class: 'botao-texto tema-botao', 'aria-label': 'Alternar entre modo dia e modo noite' });
    b.textContent = rotuloDoTema();
    b.addEventListener('click', () => {
      if (window.FindeTema) window.FindeTema.alternar();
    });
    return b;
  }

  document.addEventListener('finde:tema', atualizarRotulos);
  document.addEventListener('DOMContentLoaded', () => {
    const end = document.getElementById('endereco-pagina');
    if (end) end.textContent = `${window.location.host}${window.location.pathname}`;
    atualizarRotulos();
  });
  setInterval(atualizarRotulos, 20 * 1000);

  // Rodapé das telas: a nota do protótipo e o seletor de tema. A assinatura
  // fica só no lockup.
  function rodape() {
    return el('footer', { class: 'rodape' },
      el('div', { class: 'rodape-linha' },
        el('p', { class: 'nota', texto: 'Protótipo · festas fictícias' }),
        botaoTema()));
  }

  // "18h00 · média 31" na mesma linha de base (mandar e convite).
  function quandoGrande(o) {
    return el('p', { class: 'quando-grande', 'aria-hidden': 'true' },
      el('span', { class: 'hora', texto: o.hora }),
      el('span', { class: 'media-grande', texto: `· média ${o.festa.mediaIdade}` }));
  }

  // "terraço em Pinheiros" -> "terraço"; o bairro já aparece ao lado.
  const casaCurta = (casa) => casa.replace(/\s+(em|na|no|nos|nas)\s+.+$/, '');

  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');

  window.Finde = { el, titulo, chamar, marca, lockup, rodape, quandoGrande, casaCurta, reduzir };
})();

'use strict';
// Modo dia e modo noite. Carregado no <head>, sem defer, para a página já
// nascer no tema certo. O app abre em modo dia e passa ao modo noite a partir
// das 18h (até as 6h), como pede o manual. Quem quiser alternar na mão, alterna;
// a escolha vale até fechar a aba.
//
// A troca é um corte limpo: o conteúdo some em 120 ms, as cores trocam de uma
// vez, sem transição, e o conteúdo volta em 120 ms. Fundo e texto nunca
// atravessam o mesmo tom. Às 18h a troca automática passa pelo mesmo caminho.

(() => {
  const CHAVE = 'finde.tema';
  const COR = { dia: '#EADCD2', noite: '#4E1222' };
  const raiz = document.documentElement;
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');

  function pelaHora(agora = new Date()) {
    const h = agora.getHours();
    return h >= 18 || h < 6 ? 'noite' : 'dia';
  }

  function escolhido() {
    try {
      const v = sessionStorage.getItem(CHAVE);
      return v === 'dia' || v === 'noite' ? v : null;
    } catch {
      return null;
    }
  }

  function aplicarJa(tema) {
    raiz.dataset.tema = tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR[tema]);
    // Quem desenha a tela (a boas-vindas muda de texto à noite) redesenha aqui,
    // dentro da mesma troca.
    document.dispatchEvent(new CustomEvent('finde:tema', { detail: tema }));
  }

  const FADE_MS = 120;
  let troca = null; // a troca em curso: { tema }

  function camadas() {
    return [...document.querySelectorAll('main, .lado')].filter((x) => typeof x.animate === 'function');
  }

  function aplicar(tema) {
    if (troca) { // um segundo toque no meio da troca só muda o destino
      troca.tema = tema;
      return;
    }
    if (raiz.dataset.tema === tema) return;
    const alvos = document.readyState === 'loading' || reduzir.matches || document.hidden ? [] : camadas();
    if (!alvos.length) {
      aplicarJa(tema);
      return;
    }
    troca = { tema };
    const sair = alvos.map((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' }));
    let feito = false;
    const trocar = () => {
      if (feito) return;
      feito = true;
      const destino = troca.tema;
      troca = null;
      if (raiz.dataset.tema !== destino) aplicarJa(destino);
      // A volta começa antes de soltar a saída: nenhum quadro com o conteúdo cheio no meio.
      alvos.forEach((x) => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' }));
      sair.forEach((x) => x.cancel());
    };
    Promise.all(sair.map((x) => x.finished)).then(trocar, trocar);
    // Aba que fica oculta no meio: a animação para, a troca não.
    setTimeout(trocar, FADE_MS + 200);
  }

  const atual = () => (raiz.dataset.tema === 'noite' ? 'noite' : 'dia');

  function alternar() {
    const novo = atual() === 'noite' ? 'dia' : 'noite';
    try {
      sessionStorage.setItem(CHAVE, novo);
    } catch { /* sem armazenamento, só nesta página */ }
    aplicar(novo);
    return novo;
  }

  raiz.dataset.tema = escolhido() || pelaHora();
  document.addEventListener('DOMContentLoaded', () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR[atual()]);
  });

  // Se ninguém escolheu na mão, acompanha o relógio (às 18h a página escurece).
  setInterval(() => {
    if (!escolhido() && pelaHora() !== atual()) aplicar(pelaHora());
  }, 60 * 1000);

  window.FindeTema = { atual, alternar, pelaHora, escolhido };
})();

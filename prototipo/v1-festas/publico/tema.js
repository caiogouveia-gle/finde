'use strict';
// Modo dia e modo noite. Carregado no <head>, sem defer, para a página já
// nascer no tema certo. O app abre em modo dia e passa ao modo noite a partir
// das 18h (até as 6h), como pede o manual. Quem quiser alternar na mão, alterna;
// a escolha vale até fechar a aba.

(() => {
  const CHAVE = 'finde.tema';
  const COR = { dia: '#EADCD2', noite: '#4E1222' };
  const raiz = document.documentElement;

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

  let trocando = null;
  function aplicar(tema) {
    // Na troca, os botões mudam de uma vez, sem atravessar a cor do fundo.
    if (raiz.dataset.tema && raiz.dataset.tema !== tema) {
      raiz.classList.add('trocando');
      clearTimeout(trocando);
      trocando = setTimeout(() => raiz.classList.remove('trocando'), 450);
    }
    raiz.dataset.tema = tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR[tema]);
    document.dispatchEvent(new CustomEvent('finde:tema', { detail: tema }));
  }

  function atual() {
    return raiz.dataset.tema === 'noite' ? 'noite' : 'dia';
  }

  function alternar() {
    const novo = atual() === 'noite' ? 'dia' : 'noite';
    try {
      sessionStorage.setItem(CHAVE, novo);
    } catch { /* sem armazenamento, só nesta página */ }
    aplicar(novo);
    return novo;
  }

  aplicar(escolhido() || pelaHora());
  document.addEventListener('DOMContentLoaded', () => aplicar(atual()));

  // Se ninguém escolheu na mão, acompanha o relógio (às 18h a página escurece).
  setInterval(() => {
    if (!escolhido() && pelaHora() !== atual()) aplicar(pelaHora());
  }, 60 * 1000);

  window.FindeTema = { atual, alternar, pelaHora, escolhido };
})();

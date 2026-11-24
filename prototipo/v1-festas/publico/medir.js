'use strict';
// A contagem anônima do protótipo (nucleo/validacao.js): a página aberta e
// os passos que dizem se o Finde ajudou (abrir uma festa, ir ao ingresso,
// mandar pro grupo). Vai só o nome do passo e um id aleatório do navegador;
// o servidor guarda um HMAC dele. Sem cookie, sem IP gravado, sem terceiros.
// A página diz quem é no próprio <script>: data-pagina="landing|app|convite|opiniao".

(() => {
  const CHAVE = 'finde.aparelho';
  const aleatorio = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  let deReserva = null;

  function aparelho() {
    try {
      let a = localStorage.getItem(CHAVE);
      if (!/^[a-f0-9]{32}$/.test(a || '')) {
        a = aleatorio();
        localStorage.setItem(CHAVE, a);
      }
      return a;
    } catch {
      deReserva ||= aleatorio();
      return deReserva;
    }
  }

  function contar(evento) {
    try {
      const corpo = JSON.stringify({ evento, aparelho: aparelho() });
      if (navigator.sendBeacon && navigator.sendBeacon('/api/uso', new Blob([corpo], { type: 'application/json' }))) return;
      fetch('/api/uso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {});
    } catch {
      // Contar nunca atrapalha a página.
    }
  }

  const script = document.currentScript;
  const pagina = script && script.dataset.pagina;

  // Os links que saem: o ingresso, o WhatsApp e o resto (Instagram, página do evento).
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a) return;
    let url;
    try {
      url = new URL(a.href, window.location.href);
    } catch {
      return;
    }
    if (pagina === 'landing') {
      if (url.origin !== window.location.origin || url.pathname === '/app') {
        if (/(^|\.)finde-app\.fly\.dev$/.test(url.hostname) || url.pathname === '/app') contar('landing-app');
      }
      return;
    }
    if (a.id === 'mandar-zap' || url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') return contar('whatsapp');
    if (url.origin === window.location.origin) return;
    if (a.classList.contains('barra-comprar') || a.closest('.bloco-ingresso') || /ingresso|comprar/i.test(a.textContent || '')) return contar('ingresso');
    contar('link-fora');
  }, { capture: true });

  window.FindeMedir = { contar, aparelho };
  if (pagina) contar(`abriu-${pagina}`);
  // O QR Code de divulgação aponta para ?de=qr: conta a chegada e tira a
  // marca do endereço, para ela não seguir num link copiado.
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get('de') === 'qr') {
      contar('chegou-qr');
      u.searchParams.delete('de');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  } catch { /* tudo bem */ }
})();

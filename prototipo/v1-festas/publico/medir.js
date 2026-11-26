'use strict';
// A contagem anônima do protótipo (nucleo/validacao.js): a página aberta e
// os passos que dizem se o Finde ajudou (abrir uma festa, ir ao ingresso,
// mandar pro grupo). Vai o nome do passo, um id aleatório do navegador e,
// às vezes, um detalhe curto (p): o id da festa ou do convite, a zona do
// filtro, a origem, o dia. Nunca e-mail, nome ou texto livre. O servidor
// guarda um HMAC do id do navegador. Sem cookie, sem IP gravado, sem terceiros.
// A página diz quem é no próprio <script>: data-pagina="landing|app|convite|opiniao".

(() => {
  const CHAVE = 'finde.aparelho';
  const EQUIPE = 'finde.equipe';
  // O mesmo formato que o servidor aceita: fora dele, o detalhe não vai.
  const DETALHE = /^[\p{L}\p{N}:._-]{1,80}$/u;
  // De onde a pessoa chegou ao app (?de=...): o QR Code, a landing, as redes,
  // o cartaz, o MBM e o "ver outras festas" de um convite.
  const ORIGENS = new Set(['qr', 'landing', 'insta', 'zap', 'mbm', 'cartaz', 'convite']);
  const aleatorio = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  let deReserva = null;

  // Robô não conta: a QA headless, o Lighthouse e a prévia de link do
  // WhatsApp abrem as páginas sem ser gente.
  const robo = (() => {
    try {
      return Boolean(navigator.webdriver) || /\bbot\b|bot\/|crawl|spider|headless|lighthouse|preview/i.test(navigator.userAgent || '');
    } catch {
      return false;
    }
  })();

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

  function contar(evento, p) {
    if (robo) return;
    try {
      const corpo = { evento, aparelho: aparelho() };
      if (typeof p === 'string' && DETALHE.test(p)) corpo.p = p;
      const json = JSON.stringify(corpo);
      if (navigator.sendBeacon && navigator.sendBeacon('/api/uso', new Blob([json], { type: 'application/json' }))) return;
      fetch('/api/uso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => {});
    } catch {
      // Contar nunca atrapalha a página.
    }
  }

  const ler = (chave) => {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  };
  const ehEquipe = () => ler(EQUIPE) === '1';

  // A festa da tela: o app marca o body com data-festa no detalhe de uma
  // festa real, e o convite, quando abre (abaixo). Festa de exemplo fica sem.
  // (As linhas da lista também têm data-festa, mas com qualquer festa: vale
  // só a do body.)
  const festaDaTela = () => (document.body && document.body.dataset.festa) || undefined;

  const script = document.currentScript;
  const pagina = script && script.dataset.pagina;
  const idDoConvite = () => {
    try {
      return decodeURIComponent(window.location.pathname.split('/')[2] || '');
    } catch {
      return '';
    }
  };

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
      if (ehLinkDoApp(url)) contar('landing-app');
      return;
    }
    // O botão do convite pronto é o "mandar no WhatsApp"; qualquer outro
    // wa.me (o compartilhar da festa, o "como foi?") é compartilhamento.
    if (a.id === 'mandar-zap') return contar('whatsapp');
    if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') return contar('compartilhou', 'zap');
    if (url.origin === window.location.origin) return;
    if (a.classList.contains('barra-comprar') || a.closest('.bloco-ingresso') || /ingresso|comprar/i.test(a.textContent || '')) {
      // No convite, o ingresso é de quem recebeu o convite: conta à parte.
      return contar(pagina === 'convite' ? 'convite-ingresso' : 'ingresso', festaDaTela());
    }
    contar('link-fora', festaDaTela());
  }, { capture: true });

  // O app, visto da landing: o caminho /app (tudo junto) ou o endereço do app.
  function ehLinkDoApp(url) {
    return /(^|\.)finde-app\.fly\.dev$/.test(url.hostname) || url.pathname === '/app' || url.pathname === '/app/';
  }

  window.FindeMedir = { contar, aparelho };

  // Tira marcas do endereço sem recarregar, para elas não seguirem num link copiado.
  function limpar(...nomes) {
    try {
      const u = new URL(window.location.href);
      let mudou = false;
      for (const n of nomes) {
        if (u.searchParams.has(n)) {
          u.searchParams.delete(n);
          mudou = true;
        }
      }
      if (mudou) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch { /* tudo bem */ }
  }

  let busca;
  try {
    busca = new URL(window.location.href).searchParams;
  } catch {
    busca = new URLSearchParams();
  }

  // ?equipe=1: o aparelho de quem faz o Finde fica marcado, e o servidor tira
  // dos números tudo o que ele fez, inclusive antes. O aviso vai uma vez.
  if (busca.get('equipe') === '1') {
    if (!ehEquipe()) {
      try {
        localStorage.setItem(EQUIPE, '1');
      } catch { /* sem armazenamento: o aviso vai a cada ?equipe=1 */ }
      contar('equipe');
    }
    limpar('equipe');
  }

  // O convite só conta como aberto quando existe (o plano.js avisa, com a
  // festa) e quando quem abre não é quem criou: o app guarda em finde.meus
  // o id de cada convite criado neste aparelho.
  if (pagina === 'convite') {
    let contou = false;
    document.addEventListener('finde:convite', (e) => {
      if (contou) return;
      contou = true;
      const d = (e && e.detail) || {};
      if (document.body && d.festa) document.body.dataset.festa = d.festa;
      const id = idDoConvite();
      let meus = {};
      try {
        meus = JSON.parse(ler('finde.meus') || '{}') || {};
      } catch { /* tudo bem */ }
      if (id && !Object.prototype.hasOwnProperty.call(meus, id)) contar('abriu-convite');
    });
  } else if (pagina) {
    contar(`abriu-${pagina}`);
  }

  // No app, ?de= diz de onde a pessoa chegou (o QR Code de divulgação aponta
  // para ?de=qr, a landing para ?de=landing). Conta e tira a marca.
  if (pagina === 'app') {
    const de = busca.get('de');
    if (de !== null) {
      if (ORIGENS.has(de)) {
        // O app.js lê a origem daqui: a marca sai do endereço antes dele rodar.
        window.FindeMedir.chegouDe = de;
        contar('chegou', de);
        if (de === 'qr') contar('chegou-qr');
      }
      limpar('de');
    }
  }

  // Na landing, os links do app levam ?de=landing (e ?equipe=1, se este
  // aparelho é da equipe: o app fica em outro endereço, com outra memória).
  // Feito aqui, e não no HTML, porque o endereço do app pode já ter ?.
  if (pagina === 'landing') {
    const marcar = () => {
      for (const a of document.querySelectorAll('a[href]')) {
        let url;
        try {
          url = new URL(a.getAttribute('href'), window.location.href);
        } catch {
          continue;
        }
        if (!ehLinkDoApp(url)) continue;
        if (!url.searchParams.has('de')) url.searchParams.set('de', 'landing');
        if (ehEquipe()) url.searchParams.set('equipe', '1');
        a.setAttribute('href', url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href);
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', marcar);
    else marcar();
  }
})();

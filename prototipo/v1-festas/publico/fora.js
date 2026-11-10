'use strict';
// A página de saída do protótipo: com festas inventadas, os links externos
// (Instagram, página do evento, compra, mapa) param aqui e dizem para onde a
// pessoa iria. Abre em aba nova; "Voltar pra festa" fecha a aba. O endereço
// aparece como texto, nunca como link, para não abrir o perfil de ninguém.

(() => {
  const q = new URLSearchParams(window.location.search);
  // Só serviços conhecidos viram título; o resto fica no texto genérico.
  const SERVICOS = ['Instagram', 'Google Maps', 'Sympla', 'Shotgun', 'Ingresse', 'Fever', 'Eventbrite', 'DICE', 'Resident Advisor', 'Site da produtora'];
  const pedido = (q.get('servico') || '').trim();
  const servico = SERVICOS.includes(pedido) ? pedido : '';
  let destino = '';
  try {
    const u = new URL(q.get('para') || '');
    // No mapa, o que importa é o endereço buscado.
    if (u.protocol === 'https:' && /(^|\.)google\.com$/.test(u.hostname) && u.pathname.startsWith('/maps') && u.searchParams.get('query')) destino = u.searchParams.get('query');
    else if (u.protocol === 'https:') destino = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`.replace(/\/$/, '');
  } catch { /* sem destino */ }

  const titulo = document.getElementById('fora-titulo');
  // Um itálico só por frase, no verbo: "Aqui você *iria* para o Instagram."
  if (servico) {
    const em = document.createElement('em');
    const nome = servico === 'Site da produtora' ? 'site da produtora' : servico;
    if (servico === 'Google Maps') {
      em.textContent = 'abriria';
      titulo.replaceChildren('Aqui ', em, ` o ${nome}.`);
    } else {
      em.textContent = 'iria';
      titulo.replaceChildren('Aqui você ', em, ` para o ${nome}.`);
    }
    document.title = `${servico} · finde.`;
  }
  const alvo = document.getElementById('fora-destino');
  if (destino) alvo.textContent = destino.length > 80 ? `${destino.slice(0, 79)}…` : destino;
  else alvo.remove();

  document.getElementById('fora-voltar').addEventListener('click', () => {
    window.close();
    // Se a aba não fecha (aberta à mão, por exemplo), volta pela história ou para o início.
    setTimeout(() => {
      if (history.length > 1) history.back();
      else window.location.href = '/';
    }, 150);
  });
  titulo.focus({ preventScroll: true });
})();

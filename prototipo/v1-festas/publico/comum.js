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

  // Título com uma palavra em itálico: titulo('h1', 'titulo', 'Sair quando ', 'quiser.')
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
  function lockup(classe = '', tag = 'p', assinatura = true) {
    return el('div', { class: `lockup ${classe}`.trim() },
      el(tag, { class: 'marca', tabindex: tag === 'h1' ? '-1' : null }, 'finde', el('span', { class: 'ponto', 'aria-hidden': 'true', texto: '.' })),
      assinatura ? el('p', { class: 'assinatura-lockup', lang: 'en', texto: 'Still going out. Just differently.' }) : null);
  }

  const agora = () => {
    const d = new Date();
    return { h: String(d.getHours()), m: String(d.getMinutes()).padStart(2, '0') };
  };

  // "19h00" com cada dígito no seu span: as fontes não têm números tabulares,
  // então o CSS dá a cada .d a mesma largura e a coluna se alinha.
  const digitos = (texto) => [...String(texto)].map((c) => (/\d/.test(c) ? el('span', { class: 'd', texto: c }) : c));
  function hora(texto, classe = 'hora') {
    const [hh, mm = ''] = String(texto).split('h');
    return el('span', { class: classe },
      el('span', { class: 'hh' }, digitos(hh)),
      el('span', { class: 'h', texto: 'h' }),
      mm ? el('span', { class: 'mm' }, digitos(mm)) : null);
  }

  // O seletor de tema é uma ação, e diz o que faz.
  function rotuloDoTema() {
    const T = window.FindeTema;
    if (!T) return 'mudar o tema';
    const tema = T.atual();
    const pelaHora = T.pelaHora();
    if (tema === 'noite') return pelaHora === 'noite' ? 'ver de dia' : 'voltar pro dia';
    return pelaHora === 'dia' ? 'noite às 18h · ver agora' : 'voltar pra noite';
  }

  function atualizarRotulos() {
    for (const b of document.querySelectorAll('.tema-botao')) b.textContent = rotuloDoTema();
    const relogio = document.getElementById('relogio');
    if (relogio) {
      const { h, m } = agora();
      relogio.replaceChildren(hora(`${h}h${m}`));
    }
    const sub = document.getElementById('relogio-rotulo');
    if (sub && window.FindeTema) sub.textContent = window.FindeTema.pelaHora() === 'noite' ? 'noite desde as 18h' : 'a noite começa às 18h';
  }

  function botaoTema() {
    const b = el('button', { type: 'button', class: 'link tema-botao', 'aria-label': 'Alternar entre modo dia e modo noite' });
    b.textContent = rotuloDoTema();
    b.addEventListener('click', () => {
      if (window.FindeTema) window.FindeTema.alternar();
    });
    return b;
  }

  // "Abra no celular" só faz sentido num endereço público, não em localhost.
  const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|\d+\.\d+\.\d+\.\d+|.*\.local|.*\.localhost)$/;

  document.addEventListener('finde:tema', atualizarRotulos);
  document.addEventListener('DOMContentLoaded', () => {
    const lado = document.getElementById('lado-dir');
    const end = document.getElementById('endereco-pagina');
    if (lado && end) {
      const local = LOCAL.test(window.location.hostname);
      lado.classList.toggle('oculto', local);
      lado.hidden = local;
      if (!local) end.textContent = `${window.location.host}${window.location.pathname}`;
    }
    atualizarRotulos();
  });
  setInterval(atualizarRotulos, 20 * 1000);

  // Rodapé das telas: a nota do protótipo e o seletor de tema.
  function rodape() {
    return el('footer', { class: 'rodape' },
      el('div', { class: 'rodape-linha' },
        el('p', { class: 'nota', texto: 'Protótipo · festas fictícias' }),
        botaoTema()));
  }

  // De onde vem a média ("informada pela produtora"). Se a API não mandar,
  // a média aparece sozinha, sem "undefined".
  const origemDaIdade = (f) => (f && typeof f.origemIdade === 'string' ? f.origemIdade.trim() : '');
  function idadeOrigem(f) {
    const t = origemDaIdade(f);
    return t ? el('span', { class: 'idade-origem', texto: t }) : null;
  }
  // "média 31, informada pela produtora", para leitor de tela e mensagem.
  function mediaFalada(f) {
    const t = origemDaIdade(f);
    if (!Number.isInteger(f.mediaIdade)) return 'média de idade não informada';
    return `média ${f.mediaIdade}${t ? `, ${t}` : ''}`;
  }

  // A festa do convite: "18h00" e "média 31 anos" na mesma linha de base, e a
  // origem da média junto dela.
  function quandoGrande(o) {
    return el('p', { class: 'quando-grande', 'aria-hidden': 'true' },
      hora(o.hora),
      el('span', { class: 'media-grande', texto: Number.isInteger(o.festa.mediaIdade) ? `média ${o.festa.mediaIdade} anos` : 'média não informada' }),
      idadeOrigem(o.festa));
  }

  // Com o teclado aberto, o visor visível encolhe (no iPhone, só ele): o campo
  // em foco, ou o que for pedido, sobe para dentro dele.
  function visorVisivel() {
    const v = window.visualViewport;
    return v ? { topo: v.offsetTop, altura: v.height } : { topo: 0, altura: window.innerHeight };
  }
  function manterVisivel(alvo, folga = 12) {
    if (!alvo || !alvo.getBoundingClientRect) return;
    const r = alvo.getBoundingClientRect();
    const { topo, altura } = visorVisivel();
    const base = topo + altura - folga;
    let dy = 0;
    if (r.bottom > base) dy = r.bottom - base;
    else if (r.top < topo + folga) dy = r.top - topo - folga;
    if (dy) window.scrollBy({ top: dy, behavior: 'auto' });
  }
  if (window.visualViewport) {
    let pendente = 0;
    window.visualViewport.addEventListener('resize', () => {
      cancelAnimationFrame(pendente);
      const ativo = document.activeElement;
      if (!ativo || !ativo.matches || !ativo.matches('input[type="text"], textarea')) return;
      // O formulário inteiro (campo e botão) fica à vista, não só o campo.
      pendente = requestAnimationFrame(() => manterVisivel(ativo.form || ativo));
      setTimeout(() => manterVisivel(ativo.form || ativo), 120);
    });
  }

  // Avisar o leitor de tela numa região viva que não é redesenhada.
  function anunciar(texto) {
    const a = document.getElementById('anuncio');
    if (!a) return;
    a.textContent = '';
    setTimeout(() => { a.textContent = texto; }, 60);
  }

  // "terraço em Pinheiros" -> "terraço"; o bairro já aparece ao lado.
  const casaCurta = (casa) => casa.replace(/\s+(em|na|no|nos|nas)\s+.+$/, '');


  // ------------------------------------------------------------ blocos da festa
  // O detalhe (app.js) e o convite (plano.js) montam a festa com as mesmas
  // peças. O texto vem de festa-texto.js; aqui só o desenho. Cada bloco é
  // isolado e tem a sua classe, para o desenho poder mudar sem mexer na ordem.

  const FT = () => window.FindeTexto;

  // Link que sai do finde: aba nova, e o leitor de tela ouve que sai.
  function linkFora(url, texto, servico, exemplo, classe = 'link') {
    const href = FT().destino(url, servico, exemplo);
    if (!href) return null;
    return el('a', { class: `${classe} fora`, href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': texto ? `${texto}, abre fora do finde` : null }, texto);
  }

  // O cartaz da produtora, em miniatura 4:5. Sem cartaz, nada.
  function cartaz(f, classe = 'cartaz') {
    if (typeof f.cartaz !== 'string' || !f.cartaz) return null;
    const img = el('img', {
      class: classe, src: f.cartaz, alt: `Cartaz de ${f.nome}`, width: '120', height: '150', loading: 'lazy', decoding: 'async',
    });
    // Cartaz que não carrega: fica o fundo com o nome, nunca o ícone quebrado.
    img.addEventListener('error', () => img.replaceWith(el('span', { class: `${classe} cartaz--ausente`, role: 'img', 'aria-label': `Cartaz de ${f.nome}`, texto: f.nome })), { once: true });
    return img;
  }

  // Campo que a fonte não trouxe: aparece como ausente (R12), sempre igual.
  const ausente = (texto) => el('p', { class: 'ausente', texto });

  // Onde (R6): endereço, bairro e o link do mapa.
  function blocoOnde(f, bairro, exemplo) {
    const e = f.endereco;
    if (!e || typeof e.texto !== 'string' || !e.texto.trim()) return el('div', { class: 'bloco-onde' }, ausente('Endereço não informado.'));
    return el('div', { class: 'bloco-onde' },
      el('p', { class: 'endereco' }, e.texto, el('span', { class: 'endereco-bairro', texto: bairro ? `${bairro}, São Paulo` : 'São Paulo' })),
      linkFora(FT().mapa(e, bairro), 'Abrir no mapa', 'Google Maps', exemplo));
  }

  // Ingresso (R7): o preço que se paga hoje, com a taxa quando a fonte dá; numa
  // linha, o lote (ou a regra do horário) e o que vem depois; onde se compra.
  // A compra em si fica na barra fixa do detalhe; o convite, que não tem
  // barra, pede o link aqui (comprar: true).
  function blocoIngresso(f, exemplo, { comprar = false } = {}) {
    const p = FT().preco(f);
    const linha = p.horario
      ? p.horario.replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))
      : p.tipo === 'online' && p.lote ? [p.lote, p.nota, p.depois].filter(Boolean).join(' · ') : null;
    let onde = null;
    if (p.compra) onde = `Vende no ${p.servico}.`;
    else if (p.tipo === 'esgotado') onde = 'Os lotes esgotaram.';
    else if (p.tipo === 'sem-preco') onde = 'A venda ainda não abriu.';
    return el('div', { class: `bloco-ingresso ingresso--${p.tipo}` },
      el('p', { class: 'ingresso-preco' },
        el('span', { class: 'ingresso-valor', texto: p.tipo === 'online' ? `R$ ${p.valor}` : p.texto }),
        p.taxa ? el('span', { class: 'ingresso-taxa', texto: p.taxa }) : null),
      linha ? el('p', { class: 'ingresso-lote', texto: linha }) : null,
      // No convite, o link de compra já diz onde: a frase "Vende no X" sai.
      onde && !(comprar && p.compra) ? el('p', { class: 'ingresso-onde', texto: onde }) : null,
      comprar && p.compra ? linkFora(p.url, `Comprar no ${p.servico}`, p.servico, exemplo) : null);
  }

  // Links de origem (R8): Instagram e página do evento, cada um com o nome do
  // serviço; o que falta aparece como ausente.
  function blocoLinks(f, exemplo) {
    return el('ul', { class: 'links-origem' }, FT().links(f).map((l) => el('li', { class: 'origem' },
      l.url ? linkFora(l.url, l.texto, l.servico, exemplo) : el('span', { class: 'ausente', texto: `${l.texto}.` }))));
  }

  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');

  window.Finde = {
    el, titulo, chamar, marca, lockup, rodape, quandoGrande, casaCurta, reduzir, hora, anunciar, idadeOrigem, mediaFalada, manterVisivel,
    linkFora, cartaz, ausente, blocoOnde, blocoIngresso, blocoLinks,
  };
})();

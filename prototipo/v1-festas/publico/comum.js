'use strict';
// Peças comuns às páginas do app (o app, o convite e a página de saída):
// criar elementos (tudo que vem de fora entra por textContent), chamar a API,
// o endereço da landing, a marca, o lockup, o rodapé com o seletor de tema e
// as laterais do desktop.

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

  // Onde mora a landing. Em produção ela tem endereço próprio (finde.fly.dev,
  // e o app fica em finde-app.fly.dev), e o servidor escreve qual na meta
  // finde-site. Sem a meta, com o marcador ainda cru ou com algo que não é
  // http(s) nem caminho, é a raiz daqui.
  function site() {
    const meta = document.querySelector('meta[name="finde-site"]');
    const valor = meta ? String(meta.getAttribute('content') || '').trim() : '';
    if (/^(https?:\/\/[^\s/]+(\/\S*)?|\/(?!\/)\S*)$/i.test(valor)) {
      try {
        return new URL(valor, window.location.href).href;
      } catch { /* cai na raiz */ }
    }
    return new URL('/', window.location.href).href;
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
      assinatura ? el('p', { class: 'assinatura-lockup', lang: 'en', texto: 'still going out. just differently.' }) : null);
  }

  // A seta do botão secundário (opção C do manual): 16 × 16, traço 1,2. A cor
  // vem do CSS (currentColor). volta: a mesma seta, apontando para trás.
  const SVG = 'http://www.w3.org/2000/svg';
  function seta(volta = false) {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of [['class', 'seta'], ['width', '16'], ['height', '16'], ['viewBox', '0 0 16 16'], ['fill', 'none'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(k, v);
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', volta ? 'M13 8H3M7 4L3 8l4 4' : 'M3 8h10M9 4l4 4-4 4');
    svg.append(p);
    return svg;
  }

  // O avanço do botão D ("Mandar pro grupo ››"), o mesmo da landing.
  const avanco = () => el('span', { class: 'avanco', 'aria-hidden': 'true', texto: '››' });

  // Ação secundária com fio e seta: <button> ou <a>, o texto e a seta.
  function acaoC(tag, atributos, texto, { volta = false } = {}) {
    const classe = `link link--seta${volta ? ' link--volta' : ''}${atributos.class ? ` ${atributos.class}` : ''}`;
    const filhos = volta ? [seta(true), el('span', { texto })] : [el('span', { texto }), seta()];
    return el(tag, { ...atributos, class: classe }, ...filhos);
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

  // O seletor de tema é uma ação, e diz o que faz. De dia, ele diz "modo
  // noite": no detalhe de uma festa que começa às 18h, "noite às 18h" sozinho
  // se lia como horário da festa.
  function rotuloDoTema() {
    const T = window.FindeTema;
    if (!T) return 'mudar o tema';
    const tema = T.atual();
    const pelaHora = T.pelaHora();
    if (tema === 'noite') return pelaHora === 'noite' ? 'ver de dia' : 'voltar pro dia';
    return pelaHora === 'dia' ? 'modo noite às 18h · ver agora' : 'voltar pra noite';
  }

  function atualizarRotulos() {
    for (const b of document.querySelectorAll('.tema-botao')) b.textContent = rotuloDoTema();
    const relogio = document.getElementById('relogio');
    if (relogio) {
      const { h, m } = agora();
      const antes = relogio.textContent;
      const novo = hora(`${h}h${m}`);
      if (novo.textContent !== antes) {
        relogio.replaceChildren(novo);
        // O minuto acontece: só o dígito que mudou sobe, e só com a aba à vista.
        if (antes && !document.hidden) {
          const ds = relogio.querySelectorAll('.d');
          const velhos = antes.replace(/\D/g, '');
          ds.forEach((d, i) => { if (d.textContent !== velhos[i]) mov.trocaNumero(d); });
        }
      }
    }
    const sub = document.getElementById('relogio-rotulo');
    if (sub && window.FindeTema) sub.textContent = window.FindeTema.pelaHora() === 'noite' ? 'noite desde as 18h' : 'a noite começa às 18h';
  }

  // Não é uma ação da festa: fica fora do C, em texto com sublinhado fino. O
  // nome dele é o que está escrito ("voltar pra noite"), que já diz o que faz.
  function botaoTema() {
    const b = el('button', { type: 'button', class: 'tema-botao' });
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

  // Rodapé das telas: a nota do protótipo e o seletor de tema. A nota diz a
  // verdade sobre as festas: só fictícias (o padrão), ou reais com exemplos
  // marcados (o app, quando o servidor tem festa real), ou a festa do convite.
  const NOTAS = {
    ficticias: 'Protótipo · festas fictícias',
    misto: 'Protótipo · festas reais; as marcadas como exemplo são fictícias',
    real: 'Protótipo · festa real',
  };
  let nota = NOTAS.ficticias;
  function definirNota(qual) {
    nota = NOTAS[qual] || NOTAS.ficticias;
  }
  function rodape() {
    return el('footer', { class: 'rodape' },
      el('div', { class: 'rodape-linha' },
        el('p', { class: nota.length > 32 ? 'nota nota--longa' : 'nota', texto: nota }),
        botaoTema()));
  }

  // A marca de exemplo (festa fictícia no meio das reais): na lista, no
  // detalhe e no convite. Texto, nunca só cor.
  const marcaExemplo = (classe = '', texto = 'Exemplo') => el('span', { class: `marca-exemplo${classe ? ` ${classe}` : ''}`, texto });

  // De onde vem a média ("informada pela produtora"). Se a API não mandar,
  // a média aparece sozinha, sem "undefined".
  const origemDaIdade = (f) => (f && typeof f.origemIdade === 'string' ? f.origemIdade.trim() : '');
  function idadeOrigem(f) {
    const t = origemDaIdade(f);
    return t ? el('span', { class: 'idade-origem', texto: t }) : null;
  }
  // "média 31 anos, informada pela produtora", para leitor de tela, e a
  // linha da festa sem a média: as frases moram em festa-texto.js.
  const mediaFalada = (f) => window.FindeTexto.mediaFalada(f);
  const linhaSemMedia = (linha) => window.FindeTexto.linhaSemMedia(linha);

  // A festa do convite: "18h00" e "média 31 anos" na mesma linha de base, e a
  // origem da média junto dela.
  function quandoGrande(o) {
    return el('p', { class: 'quando-grande', 'aria-hidden': 'true' },
      hora(FT().horaCurta(o.hora)),
      Number.isInteger(o.festa.mediaIdade) ? el('span', { class: 'media-grande', texto: `média ${o.festa.mediaIdade} anos` }) : null,
      idadeOrigem(o.festa));
  }

  // O convite como painel (Landing do manual v2): wordmark, "CONVITE · SÁB,
  // 21 NOV", o título com um itálico, a hora grande com a média, a origem da
  // média, o nome, "casa · preço · produtora" e a frase do horário. O que vem
  // depois (as respostas, no convite) entra em `resto`. Sem canto, sem sombra.
  const DIA_PAINEL = {
    seg: ['na ', 'segunda?'], ter: ['na ', 'terça?'], qua: ['na ', 'quarta?'], qui: ['na ', 'quinta?'],
    sex: ['na ', 'sexta?'], sab: ['no ', 'sábado?'], dom: ['no ', 'domingo?'],
  };
  // passou: a festa já foi e o convite vira registro (R34, rascunho do
  // convite): o rótulo diz "já passou", o título é o nome da festa e a
  // pergunta-convite ("Bora na sexta?") sai.
  function painelConvite(o, { rotulo = 'Convite', marcaHref = null, resto = [], passou = false } = {}) {
    const f = o.festa;
    const [na, dia] = DIA_PAINEL[f.dia] || ['', 'quando?'];
    const p = FT().preco(f);
    const lineup = Array.isArray(f.lineup) ? f.lineup.filter((x) => typeof x === 'string' && x.trim()) : [];
    const temMedia = Number.isInteger(f.mediaIdade);
    const origem = origemDaIdade(f);
    const h1 = passou
      ? el('h1', { class: 'painel-nome painel-nome--registro', tabindex: '-1', id: 'convite-titulo', texto: FT().semViuva(f.nome) })
      : el('h1', { class: 'painel-titulo', tabindex: '-1', id: 'convite-titulo' }, `Bora ${na}`, el('em', { texto: dia }));
    return el('article', { class: 'painel-convite', 'aria-labelledby': 'convite-titulo' },
      marca(marcaHref),
      el('p', { class: 'painel-rotulo', texto: passou ? `${rotulo} · já passou` : rotulo }),
      // Festa fictícia: o convite sai do app, e quem recebe não vê o rodapé.
      f.real !== true ? el('p', { class: 'painel-exemplo' }, marcaExemplo('', 'Exemplo · festa fictícia')) : null,
      h1,
      el('p', { class: 'vh', texto: `${linhaSemMedia(o.linha)}, ${mediaFalada(f)}.` }),
      // Sem média, o convite não abre com "média não informada" (R35): a
      // hora fica sozinha, e a casa, o bairro, o preço e o lineup vêm embaixo.
      el('div', { class: 'painel-quando', 'aria-hidden': 'true' },
        el('p', { class: 'painel-hora' },
          o.hora ? hora(FT().horaCurta(o.hora)) : el('span', { class: 'painel-media', texto: 'horário a confirmar' }),
          temMedia ? el('span', { class: 'painel-media', texto: `média ${f.mediaIdade} anos` }) : null),
        temMedia && origem ? el('p', { class: 'painel-origem', texto: origem }) : null),
      passou ? null : el('h2', { class: 'painel-nome', id: 'nome-festa', texto: FT().semViuva(f.nome) }),
      // Quebra só antes de um "·", e a hora nunca desce sozinha (FT).
      el('p', { class: 'painel-onde', texto: FT().ondeSemQuebra([FT().casaComBairro(f.casa, o.bairro) || o.bairro, p.tipo === 'sem-preco' ? null : FT().precoNaLista(f), f.produtora && f.produtora !== f.casa ? f.produtora : null]) }),
      lineup.length ? el('p', { class: 'painel-onde', texto: `com ${lineup.length > 3 ? `${lineup.slice(0, 3).join(', ')} e mais ${lineup.length - 3}` : lineup.join(' e ')}` }) : null,
      o.horario ? el('p', { class: 'painel-horario', texto: FT().horarioSemQuebra(o.horario) }) : null,
      ...resto);
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
  // O mesmo link no desenho do C inteiro: texto e seta.
  function linkForaC(url, texto, servico, exemplo) {
    const a = linkFora(url, texto, servico, exemplo);
    if (!a) return null;
    a.classList.add('link--seta');
    a.replaceChildren(el('span', { texto }), seta());
    return a;
  }

  // A peça de divulgação em miniatura 4:5 (o cartaz da fictícia ou o do /3,
  // servido por /imagens/). Retrato preenche; paisagem cabe inteira. Sem
  // cartaz, nada.
  function cartaz(f, classe = 'cartaz', { grande = false } = {}) {
    const c = FT().cartazDe(f);
    if (!c) return null;
    const img = el('img', {
      class: `${classe}${c.paisagem ? ' cartaz--paisagem' : ''}`, src: grande ? c.arquivo : c.miniatura, alt: FT().altDaPeca(c, f.nome),
      width: '120', height: '150', loading: 'lazy', decoding: 'async',
    });
    // Cartaz que não carrega: fica o fundo com o nome, nunca o ícone quebrado.
    img.addEventListener('error', () => img.replaceWith(el('span', { class: `${classe} cartaz--ausente`, role: 'img', 'aria-label': `Cartaz de ${f.nome}`, texto: f.nome })), { once: true });
    return img;
  }

  // Campo que a fonte não trouxe: aparece como ausente (R12), sempre igual.
  const ausente = (texto) => el('p', { class: 'ausente', texto });

  // Onde (R6): endereço, bairro e o link do mapa.
  // "Pinheiros, São Paulo" debaixo do endereço, sem repetir o que ele já diz.
  function linhaDoBairro(texto, bairro) {
    const sa = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const partes = [bairro && !sa(texto).includes(sa(bairro)) ? bairro : null, /s[aã]o paulo/i.test(texto) ? null : 'São Paulo'].filter(Boolean);
    return partes.length ? el('span', { class: 'endereco-bairro', texto: partes.join(', ') }) : null;
  }

  function blocoOnde(f, bairro, exemplo) {
    const e = f.endereco;
    if (!e || typeof e.texto !== 'string' || !e.texto.trim()) {
      // Festa real: a fonte não deu o endereço. Diz onde procurar, sem inventar.
      const texto = f.real ? (FT().preco(f).compra ? 'Endereço não divulgado. Confira na página do ingresso.' : 'Endereço não divulgado.') : 'Endereço não informado.';
      return el('div', { class: 'bloco-onde' }, ausente(texto));
    }
    const mapa = linkFora(FT().mapa(e, bairro), null, 'Google Maps', exemplo);
    if (mapa) {
      mapa.classList.add('link--seta');
      mapa.setAttribute('aria-label', 'Abrir no mapa, abre fora do finde');
      mapa.append(el('span', { texto: 'Abrir no mapa' }), seta());
    }
    return el('div', { class: 'bloco-onde' },
      // A cidade uma vez só: quando o endereço já diz São Paulo, ela sai da
      // linha de baixo, e o bairro que o endereço já diz também.
      el('p', { class: 'endereco' }, FT().semViuva(e.texto), linhaDoBairro(e.texto, bairro)),
      mapa);
  }

  // Ingresso (R7): o preço que se paga hoje, com a taxa quando a fonte dá; numa
  // linha, o lote (ou a regra do horário) e o que vem depois; onde se compra.
  // A compra em si fica na barra fixa do detalhe; o convite, que não tem
  // barra, pede o link aqui (comprar: true).
  const valorOuGratis = (v) => (v === 0 ? 'Grátis' : FT().centavos(v));
  function blocoIngresso(f, exemplo, { comprar = false } = {}) {
    const p = FT().preco(f);
    // A linha do lote: a hora do preço, ou o lote, os esgotados e o depois; e
    // o código, quando o lote só aparece pelo link de compra.
    const doLote = p.horario
      ? p.horario.replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))
      : p.tipo === 'online' && p.lote ? [p.lote, p.nota, p.depois].filter(Boolean).join(' · ') : null;
    const linha = [doLote, p.codigo ? 'só com código' : null].filter(Boolean).join(' · ') || null;
    // Festa real lida à mão: de onde veio o preço e quando ele foi conferido.
    const origem = f.real ? FT().origemDoPreco(f) : null;
    let onde = null;
    // O /3 não diz se a venda abriu: sem preço, nada de "não abriu" (R27).
    if (p.compra) onde = `Vende no ${p.servico}.`;
    else if (p.tipo === 'esgotado') onde = 'Os lotes esgotaram.';
    // Conferido quando (o /3): mais de 72 h, marcado (e fora da barra).
    const quandoPreco = !origem && p.valor !== null ? FT().ha(f.precoConferidoEm) : null;
    const velho = FT().precoVelho(f);
    // Por gênero: os dois preços, cada um com o rótulo.
    const valor = p.genero
      ? [el('span', { class: 'ingresso-valor', texto: valorOuGratis(p.genero.feminino) }), el('span', { class: 'ingresso-genero', texto: 'fem.' }),
        el('span', { class: 'ingresso-valor', texto: valorOuGratis(p.genero.masculino) }), el('span', { class: 'ingresso-genero', texto: 'masc.' })]
      : [el('span', { class: 'ingresso-valor', texto: p.texto })];
    return el('div', { class: `bloco-ingresso ingresso--${p.tipo}` },
      el('p', { class: 'ingresso-preco' }, ...valor,
        p.taxa ? el('span', { class: 'ingresso-taxa', texto: p.taxa }) : null),
      linha ? el('p', { class: 'ingresso-lote', texto: linha }) : null,
      // A meia, a meia social, o comissário: cada um numa linha, com a condição.
      ...p.outros.map((o) => el('p', { class: 'ingresso-condicao', texto: o.texto })),
      origem ? el('p', { class: velho ? 'ingresso-velho' : `ingresso-origem${origem.conferido ? '' : ' ingresso-origem--fora'}`, texto: velho ? origem.texto.replace(/\.$/, '; pode ter mudado.') : origem.texto }) : null,
      quandoPreco ? el('p', { class: velho ? 'ingresso-velho' : 'ingresso-origem', texto: `Preço conferido ${quandoPreco}${velho ? '; pode ter mudado' : ''}.` }) : null,
      // No convite, o link de compra já diz onde: a frase "Vende no X" sai.
      onde && !(comprar && p.compra) ? el('p', { class: 'ingresso-onde', texto: onde }) : null,
      comprar && p.compra ? linkForaC(p.url, `${FT().rotuloDaCompra(p) === 'Comprar' ? 'Comprar' : 'Ver ingressos'} no ${p.servico}`, p.servico, exemplo) : null);
  }

  // Links de origem (R8): Instagram e página do evento, cada um com o nome do
  // serviço; o que falta aparece como ausente.
  // soInstagram (o convite que já passou): só o perfil, quando há; sem ele, nada.
  function blocoLinks(f, exemplo, { soInstagram = false } = {}) {
    const links = soInstagram ? FT().links(f).filter((l) => l.papel === 'instagram' && l.url) : FT().links(f);
    if (!links.length) return null;
    return el('ul', { class: 'links-origem' }, links.map((l) => el('li', { class: 'origem' },
      l.url ? linkForaC(l.url, l.texto, l.servico, exemplo) : el('span', { class: 'ausente', texto: `${l.texto}.` }))));
  }

  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------ movimento
  // O vocabulário mora no CSS (--mov-*, o mesmo da landing) e é lido uma vez.
  // Tudo parte do estado final: a página nasce pronta, e a animação só existe
  // enquanto roda (Web Animations, sem estilo inline). Se ela falhar, o
  // conteúdo já está lá. Só translate, scale, opacity e clip-path. Com
  // movimento reduzido, no máximo uma troca de opacidade de 160 ms.

  const MOV_PADRAO = {
    saida: 'cubic-bezier(.2, .7, .2, 1)', troca: 'cubic-bezier(.6, 0, .2, 1)',
    toque: 160, estado: 320, bloco: 560, capa: 640, titulo: 900, regua: 900, escala: 60, maximo: 6,
  };
  let movLido = null;
  function mv() {
    if (movLido) return movLido;
    const v = { ...MOV_PADRAO };
    try {
      const cs = getComputedStyle(document.documentElement);
      const ler = (nome) => cs.getPropertyValue(`--mov-${nome}`).trim();
      for (const k of ['saida', 'troca']) if (ler(k)) v[k] = ler(k);
      for (const k of ['toque', 'estado', 'bloco', 'capa', 'titulo', 'regua', 'escala']) {
        const n = parseFloat(ler(k));
        if (Number.isFinite(n)) v[k] = n;
      }
    } catch { /* fica o padrão */ }
    movLido = v;
    return v;
  }

  const anima = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  // Pode mover: o navegador anima e a pessoa não pediu menos movimento.
  const pode = () => anima() && !reduzir.matches;
  const lista = (x) => (!x ? [] : typeof x.length === 'number' && !x.nodeType ? [...x] : [x]).filter(Boolean);

  function animar(alvo, quadros, opcoes) {
    if (!alvo || !anima()) return null;
    // Um quadro só é o de partida (offset 0): o de chegada é o valor que o
    // CSS já dá. Sem o offset, o navegador o tomaria como o de chegada.
    const qs = quadros.length === 1 && quadros[0].offset === undefined ? [{ ...quadros[0], offset: 0 }] : quadros;
    try {
      return alvo.animate(qs, { fill: 'backwards', ...opcoes });
    } catch {
      return null;
    }
  }
  const vivas = (xs) => xs.flat(Infinity).filter(Boolean);

  // Movimento reduzido: uma troca de opacidade, curta, sem escalonar.
  function soOpacidade(els) {
    return vivas(lista(els).map((e) => animar(e, [{ opacity: 0 }], { duration: mv().toque, easing: 'linear' })));
  }

  // Entrada de bloco: sobe de y px e aparece. Até seis em escada de 60 ms.
  // Um quadro só (o de partida): o fim é o valor que o CSS já dá, então um
  // elemento com opacidade própria (o Continuar oculto) continua como está.
  // x: a folha da troca de dia entra do lado da aba (só translate).
  function subir(els, { atraso = 0, y = 12, x = 0, duracao, curva, escada = true } = {}) {
    const v = mv();
    if (!pode()) return reduzir.matches ? soOpacidade(els) : [];
    return vivas(lista(els).map((e, i) => animar(e, [{ opacity: 0, translate: `${x ? `${x}px` : 0} ${y}px` }], {
      duration: duracao || v.bloco, easing: curva || v.saida,
      delay: atraso + (escada ? Math.min(i, v.maximo - 1) * v.escala : 0),
    })));
  }

  // Um fio que se desenha da esquerda (scaleX). linear é a curva do fio que
  // marca tempo, como a régua do horário.
  function fio(e, { atraso = 0, duracao, curva, de = 0 } = {}) {
    if (!e || !pode()) return [];
    const v = mv();
    return vivas([animar(e, [
      { scale: `${de} 1`, transformOrigin: '0 50%' },
      { scale: '1 1', transformOrigin: '0 50%' },
    ], { duration: duracao || v.bloco, easing: curva || v.saida, delay: atraso })]);
  }

  // Revela por recorte: da esquerda (um traço, uma linha de texto) ou de
  // cima (o painel do convite abrindo).
  function revelar(e, { atraso = 0, duracao, curva, de = 'esquerda' } = {}) {
    if (!e || !pode()) return [];
    const v = mv();
    const inicio = de === 'cima' ? 'inset(0 0 100% 0)' : 'inset(-20% 100% -20% 0)';
    const fim = de === 'cima' ? 'inset(0 0 0% 0)' : 'inset(-20% 0% -20% 0)';
    return vivas([animar(e, [{ clipPath: inicio }, { clipPath: fim }], { duration: duracao || v.bloco, easing: curva || v.saida, delay: atraso })]);
  }

  // O elemento sobe de dentro de uma máscara (o recorte é do pai, só enquanto
  // a animação roda). Para a hora grande do detalhe e os dígitos do relógio.
  function mascara(e, { atraso = 0, duracao, de = '100%', recorte = 'inset(-.4em -2em -.06em -2em)' } = {}) {
    if (!e || !e.parentElement || !pode()) return [];
    const v = mv();
    const d = duracao || v.titulo;
    return vivas([
      animar(e.parentElement, [{ clipPath: recorte }, { clipPath: recorte }], { duration: d, delay: atraso, fill: 'both' }),
      animar(e, [{ translate: `0 ${de}` }], { duration: d, easing: v.saida, delay: atraso }),
    ]).map((a, i, xs) => {
      // O recorte sai junto com o movimento, nunca antes nem depois.
      if (i === 0) Promise.all(xs.map((x) => x.finished)).then(() => a.cancel(), () => a.cancel());
      return a;
    });
  }

  // Título em Instrument Serif: cada linha sobe de dentro da sua máscara, em
  // escada, e a palavra em itálico chega um tempo depois. As linhas vêm da
  // própria quebra do título (mede palavra por palavra), e o título volta a
  // ser o que era quando a animação termina: o texto, o foco e a quebra são
  // os de sempre.
  // duracao e em: o questionário usa o tempo de bloco e o itálico quase
  // junto, para a troca de pergunta não segurar quem responde.
  function tituloPorLinha(h, { atraso = 0, duracao, em: emAtraso = 280 } = {}) {
    if (!h || !anima()) return [];
    if (!pode()) return soOpacidade(h);
    const v = mv();
    const original = [...h.childNodes];
    const pecas = [];
    for (const no of original) {
      if (no.nodeType === 3) {
        for (const parte of no.textContent.split(/(\s+)/)) {
          if (!parte) continue;
          pecas.push(/^\s+$/.test(parte) ? document.createTextNode(parte) : el('span', { texto: parte }));
        }
      } else {
        pecas.push(no.cloneNode(true));
      }
    }
    h.replaceChildren(...pecas);
    // Fonte ainda chegando: a quebra medida seria outra. Vai como uma linha só.
    const medir = !document.fonts || document.fonts.status === 'loaded';
    const linhas = [];
    let topoDaLinha = null;
    for (const p of pecas) {
      if (p.nodeType === 3) {
        if (!linhas.length) linhas.push([]);
        linhas[linhas.length - 1].push(p);
        continue;
      }
      const t = medir ? p.getBoundingClientRect().top : 0;
      if (topoDaLinha === null || Math.abs(t - topoDaLinha) > 4) {
        linhas.push([]);
        topoDaLinha = t;
      }
      linhas[linhas.length - 1].push(p);
    }
    const anims = [];
    const blocos = linhas.map((grupo, i) => {
      const dentro = el('span', { class: 'mov-linha-in' }, grupo);
      anims.push(animar(dentro, [{ translate: '0 108%' }], { duration: duracao || v.titulo, easing: v.saida, delay: atraso + i * v.escala }));
      return el('span', { class: 'mov-linha' }, dentro);
    });
    h.replaceChildren(...blocos);
    for (const em of h.querySelectorAll('em')) {
      const i = Math.max(0, blocos.findIndex((b) => b.contains(em)));
      em.classList.add('mov-em');
      anims.push(animar(em, [{ opacity: 0, translate: '0 .3em' }], { duration: v.bloco, easing: v.saida, delay: atraso + i * v.escala + emAtraso }));
    }
    const feitas = vivas(anims);
    let devolvido = false;
    const devolver = () => {
      if (devolvido) return;
      devolvido = true;
      h.replaceChildren(...original);
    };
    if (!feitas.length) devolver();
    else Promise.all(feitas.map((a) => a.finished)).then(devolver, devolver);
    return feitas;
  }

  // O convite se monta: o painel abre de cima para baixo e as faixas entram
  // em sequência (a marca e o título, a hora, o nome, as respostas). É tela
  // de ação: a montagem cabe em uns 560 ms, e as respostas entram junto com
  // o resto, tocáveis antes dos 500 ms.
  function painel(p, { atraso = 0 } = {}) {
    if (!p || !anima()) return [];
    if (!pode()) return soOpacidade(p);
    const v = mv();
    const anims = [revelar(p, { de: 'cima', atraso, duracao: v.estado })];
    const faixas = [[], [], [], []];
    for (const filho of p.children) {
      if (filho.classList.contains('vh')) continue;
      if (filho.matches('.marca, .painel-rotulo, .painel-titulo, .painel-nome--registro')) faixas[0].push(filho);
      else if (filho.matches('.painel-quando')) faixas[1].push(filho);
      else if (filho.matches('.painel-nome, .painel-onde, .painel-horario')) faixas[2].push(filho);
      else faixas[3].push(filho);
    }
    // Entre uma faixa e outra, um passo da escada; dentro dela, também.
    faixas.forEach((grupo, k) => grupo.forEach((x, j) => {
      const d = atraso + 40 + Math.min(k + j, v.maximo - 1) * v.escala;
      if (x.matches('.painel-titulo')) anims.push(tituloPorLinha(x, { atraso: d, duracao: v.bloco, em: 2 * v.escala }));
      else if (x.matches('.painel-quando')) {
        anims.push(subir(x, { atraso: d, y: 0, duracao: v.estado }));
        anims.push(mascara(x.querySelector('.painel-hora .hora'), { atraso: d, duracao: v.bloco }));
        anims.push(subir(x.querySelectorAll('.painel-media, .painel-origem'), { atraso: d + 160, y: 6, duracao: v.estado }));
      } else anims.push(subir(x, { atraso: d, y: 10, duracao: v.estado }));
    }));
    return vivas(anims);
  }

  // Entra quando chega perto da tela, uma vez só. fazer(el) cria as
  // animações; elas nascem pausadas no primeiro quadro (o elemento ainda
  // fora da vista não roda nada) e andam quando o elemento aparece, em escada
  // com os que aparecem junto. Sem IntersectionObserver, andam na hora.
  function aoVer(els, fazer, { atraso = 0, margem = '0px 0px 48px 0px' } = {}) {
    if (!pode()) return;
    const v = mv();
    const alvos = lista(els);
    if (!alvos.length) return;
    const espera = new Map();
    for (const e of alvos) {
      const anims = vivas([fazer(e)]);
      for (const a of anims) a.pause();
      espera.set(e, anims);
    }
    const soltar = (e, extra) => {
      for (const a of espera.get(e) || []) {
        try {
          a.effect.updateTiming({ delay: (a.effect.getTiming().delay || 0) + extra });
          a.play();
        } catch { a.cancel(); }
      }
      espera.delete(e);
    };
    if (typeof IntersectionObserver !== 'function') {
      alvos.forEach((e, k) => soltar(e, atraso + Math.min(k, v.maximo - 1) * v.escala));
      return;
    }
    let primeiro = true;
    const io = new IntersectionObserver((entradas) => {
      const vistos = entradas.filter((x) => x.isIntersecting).map((x) => x.target)
        .sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
      vistos.forEach((e, k) => {
        io.unobserve(e);
        soltar(e, (primeiro ? atraso : 0) + Math.min(k, v.maximo - 1) * v.escala);
      });
      primeiro = false;
      if (!espera.size) io.disconnect();
    }, { rootMargin: margem });
    for (const e of alvos) io.observe(e);
  }

  // Um número que muda (quem está dentro, um minuto do relógio): o novo sobe
  // de dentro da sua caixa. Não conta passando pelos do meio.
  function trocaNumero(e) {
    return mascara(e, { duracao: mv().estado, de: '70%', recorte: 'inset(0 -.2em)' });
  }

  // ------------------------------------------------------------ Direção E (movimento.md da U39)
  // Só transform e opacity; o desfoque da capa nunca anima (a escala vai no
  // recorte, que leva a camada já desfocada inteira).

  // A régua da noite se desenha: o traço da festa corre linear (é tempo), cada
  // rótulo aparece quando o traço passa por ele, o pico quando o traço chega.
  function reguaDaNoite(r, { atraso = 0 } = {}) {
    if (!r || !anima()) return [];
    if (!pode()) return soOpacidade(r);
    const v = mv();
    const pos = (x) => {
      if (!x) return 0;
      if (x.classList.contains('regua-rot--fim')) return 1;
      const p = parseFloat(x.dataset.l);
      return Number.isFinite(p) ? p / 100 : 0;
    };
    const festa = r.querySelector('.regua-festa');
    const pico = r.querySelector('.regua-pico');
    return vivas([
      animar(festa, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: v.regua, easing: 'linear', delay: atraso }),
      ...[...r.querySelectorAll('.regua-rot')].map((x) => animar(x, [{ opacity: 0, translate: '0 4px' }], {
        duration: v.estado, easing: v.saida, delay: atraso + pos(x) * v.regua,
      })),
      pico ? animar(pico, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: v.toque, easing: v.saida, delay: atraso + pos(pico) * v.regua }) : null,
    ]);
  }

  // A capa assenta: o bloco inteiro aparece por opacidade (nunca um retângulo
  // escuro vazio antes da foto) e a foto (o recorte) vem de 1,08 a 1; o que
  // está dentro sobe em escada e a régua se desenha.
  // conteudoJunto (a troca de dia): o fundo da capa fica opaco desde o
  // primeiro quadro e só o que está dentro aparece, todo junto, em 240 ms e
  // sem degrau, subindo 6 px. O bloco a meia opacidade sobre o nude virava
  // um retângulo malva (movimento.md, 2).
  function capa(c, { atraso = 0, regua = true, conteudoJunto = false, x = 0 } = {}) {
    if (!c || !anima()) return [];
    if (!pode()) return soOpacidade(c);
    const v = mv();
    if (conteudoJunto) {
      return vivas([
        animar(c.querySelector('.capa-foto'), [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: v.capa, easing: v.saida, delay: atraso }),
        animar(c.querySelector('.capa-dentro'), [{ opacity: 0, translate: `${x}px 6px` }, { opacity: 1, translate: '0 0' }], { duration: 240, easing: v.saida, delay: atraso }),
        regua ? reguaDaNoite(c.querySelector('.regua'), { atraso: atraso + 120 }) : null,
      ]);
    }
    return vivas([
      animar(c, [{ opacity: 0 }], { duration: v.estado, easing: 'linear', delay: atraso }),
      animar(c.querySelector('.capa-foto'), [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: v.capa, easing: v.saida, delay: atraso }),
      subir(c.querySelectorAll('.capa-dentro > :not(.regua)'), { atraso: atraso + 120 }),
      regua ? reguaDaNoite(c.querySelector('.regua'), { atraso: atraso + 240 }) : null,
    ]);
  }

  // Os dois fios da edição se desenham da esquerda (scaleX nos
  // pseudo-elementos); o texto sobe logo atrás deles.
  const pseudo = typeof KeyframeEffect === 'function' && 'pseudoElement' in KeyframeEffect.prototype;
  function edicao(e, { atraso = 0 } = {}) {
    if (!e || !pode()) return [];
    const v = mv();
    const fios = pseudo ? [['::before', 0], ['::after', 80]].map(([pe, at]) => animar(e, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      pseudoElement: pe, duration: v.bloco, easing: v.saida, delay: atraso + at,
    })) : [];
    return vivas([...fios, subir(e.querySelectorAll('span'), { atraso: atraso + 160, y: 6, duracao: v.estado })]);
  }

  // Sai rápido (140 ms, troca) e fica apagado até quem chamou soltar: a troca
  // de aba cancela no instante em que o novo entra (sem quadro do velho de volta).
  // x: a folha da troca de dia sai para o lado (só translate e opacidade).
  function sair(els, { y = -6, x = 0 } = {}) {
    if (!pode()) return [];
    return vivas(lista(els).map((e) => animar(e, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${x}px ${y}px` }], {
      duration: 140, easing: mv().troca, fill: 'forwards',
    })));
  }

  // FLIP: quem ficou desliza do lugar velho até o novo (só translate).
  function flip(els, antes) {
    if (!pode()) return [];
    const v = mv();
    return vivas(lista(els).map((e) => {
      const a = antes.get(e);
      if (a === undefined) return null;
      const dy = a - e.getBoundingClientRect().top;
      return Math.abs(dy) < 1 ? null : animar(e, [{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: v.estado, easing: v.troca });
    }));
  }

  const mov = {
    v: mv, pode, anima, animar, subir, fio, revelar, mascara, titulo: tituloPorLinha, painel, aoVer, soOpacidade, trocaNumero,
    reguaDaNoite, capa, edicao, sair, flip,
  };

  window.Finde = {
    el, titulo, chamar, site, marca, lockup, rodape, definirNota, marcaExemplo, quandoGrande, casaCurta, reduzir, hora, anunciar, idadeOrigem, mediaFalada, linhaSemMedia, manterVisivel,
    linkFora, cartaz, ausente, blocoOnde, blocoIngresso, blocoLinks, seta, avanco, acaoC, painelConvite, mov,
  };
})();

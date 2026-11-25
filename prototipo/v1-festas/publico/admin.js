'use strict';
// O painel ao vivo dos números (/admin). O token de admin fica só nesta aba
// (sessionStorage) ou, com "Lembrar", neste aparelho (localStorage). Os
// números vêm de GET /api/painel a cada 15 s enquanto a aba está à vista.
// Quem abre o painel continua contando nos números (25/11: o uso da equipe
// vale como validação; para sair da conta, ?equipe=1 de propósito).
// "Copiar imagem" e "Baixar JPG" desenham um cartão com os números num
// canvas, para mandar no grupo. Todo texto entra por textContent: os
// comentários da opinião são de quem usou.

(() => {
  const CHAVE = 'finde.admin';
  const A_CADA = 15000;

  const $ = (id) => document.getElementById(id);
  const form = $('entrada');
  const painel = $('painel');
  const vivo = $('vivo');
  const vivoTexto = $('vivo-texto');
  const acoes = $('acoes');
  let token = null;
  let relogio = null;
  let anterior = {};
  let ultimaVez = null;
  let ultimos = null; // o último resumo desenhado: a imagem sai dele

  const guardar = {
    ler() {
      try { return sessionStorage.getItem(CHAVE) || localStorage.getItem(CHAVE); } catch { return null; }
    },
    gravar(t, lembrar) {
      try {
        sessionStorage.setItem(CHAVE, t);
        if (lembrar) localStorage.setItem(CHAVE, t);
      } catch { /* sem armazenamento: vale só enquanto a página estiver aberta */ }
    },
    apagar() {
      try { sessionStorage.removeItem(CHAVE); localStorage.removeItem(CHAVE); } catch { /* nada */ }
    },
  };

  // ------------------------------------------------------------ montar a tela
  function el(tag, attrs = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'p') e.style.setProperty('--p', v); // pelo CSSOM: a CSP barra style=""
      else e.setAttribute(k, v);
    }
    for (const f of filhos.flat(Infinity)) if (f !== null && f !== undefined && f !== false) e.append(f instanceof Node ? f : String(f));
    return e;
  }
  const pct = (x, n) => (n ? Math.round((x / n) * 100) : 0);
  const virgula = (x) => String(x).replace('.', ',');
  const plural = (x, um, varios) => `${x} ${x === 1 ? um : varios}`;
  const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const hora = (d) => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : '—');
  const diaPorExtenso = (d) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' });

  const ROTULOS = {
    qr: 'QR Code', landing: 'Landing', insta: 'Instagram', zap: 'WhatsApp', mbm: 'MBM', cartaz: 'Cartaz', convite: 'Convite',
    app: 'no app', opiniao: 'na página de opinião',
  };
  const PASSOS = {
    'abriu-app': 'Abriram o app',
    lista: 'Viram a lista',
    detalhe: 'Abriram uma festa',
    'mandar-ou-convite': 'Chamaram o grupo',
    whatsapp: 'Mandaram no WhatsApp',
  };
  const ETAPAS = {
    'sem-uso': 'sem uso registrado', entrou: 'só entrou', lista: 'viu a lista',
    detalhe: 'abriu uma festa', ingresso: 'foi ao ingresso', mandou: 'mandou pro grupo',
  };

  // Os números de cima, os mesmos no painel e na imagem.
  function principais(r) {
    const app = r.app && !r.app.erro ? r.app : null;
    const landing = r.landing && !r.landing.erro ? r.landing : null;
    const evs = app?.eventos || {};
    const n = (ev) => evs[ev]?.pessoas || 0;
    const funil = (app?.funil || []).map((f) => ({ rot: PASSOS[f.passo] || f.passo, n: f.pessoas }));
    const abriram = funil[0]?.n ?? n('abriu-app');
    const hoje = hojeEmSP();
    const unicos = r.listaUnicos;
    return {
      app, landing, n, funil, abriram,
      // O funil já mostra quem abriu e quem chamou o grupo: os cartões
      // ficam com o que ele não mostra. Sem dado, a legenda é de leitor e o
      // erro técnico vai só para o title (nunca para a imagem).
      kpis: [
        { k: 'landing', rot: 'Abriram a landing', v: landing ? landing.pessoas : null, pe: landing ? `${landing.eventos?.['landing-app']?.pessoas || 0} foram ao app · hoje ${landing.porDia?.[hoje] || 0}` : 'fora do ar agora', erro: r.landing?.erro },
        { k: 'ingresso', rot: 'Foram ao ingresso', v: app ? n('ingresso') : null, pe: app ? (n('convite-ingresso') ? `mais ${n('convite-ingresso')} pelo convite` : 'pela página da festa') : 'fora do ar agora', erro: r.app?.erro },
        { k: 'nps', rot: 'NPS', v: r.nps ? r.nps.nps : null, pe: r.nps ? `${plural(r.nps.respostas, 'nota', 'notas')} · média ${virgula(r.nps.media)}` : 'nenhuma nota ainda' },
        { k: 'lista', rot: 'E-mails na lista', v: unicos ?? r.lista ?? 0, pe: unicos === null || unicos === undefined ? 'conta incompleta agora' : 'de quem quer novidades' },
      ],
      hojeApp: app ? app.porDia?.[hoje] || 0 : null,
    };
  }

  function kpi({ k, rot, v, pe, erro }) {
    const num = el('span', { class: 'kpi-num' }, v === null || v === undefined ? '—' : String(v));
    if (typeof v === 'number' && typeof anterior[k] === 'number' && v > anterior[k]) {
      num.classList.add('subiu');
      setTimeout(() => num.classList.remove('subiu'), 2500);
    }
    if (typeof v === 'number') anterior[k] = v;
    return el('div', { class: 'kpi', title: erro || null }, el('span', { class: 'kpi-rot' }, rot), num, pe ? el('span', { class: 'kpi-pe' }, pe) : null);
  }

  function barras(itens, base) {
    return el('ul', { class: 'barras' }, itens.map(([rot, x]) => el('li', { class: 'barra' },
      el('div', { class: 'barra-linha' }, el('span', {}, rot), el('span', { class: 'barra-valor' }, base ? `${x} · ${pct(x, base)}%` : String(x))),
      el('div', { class: 'barra-trilho', 'aria-hidden': 'true' }, el('div', { class: 'barra-cheio', p: `${base ? Math.min(100, pct(x, base)) : 0}%` })))));
  }
  const secao = (titulo, larga, ...corpo) => el('section', { class: larga ? 'secao secao--larga' : 'secao' }, el('h2', {}, titulo), ...corpo);
  const vazio = (t) => el('p', { class: 'vazio' }, t);
  const pares = (linhas) => el('dl', { class: 'pares' }, linhas.filter(Boolean).map(([a, b]) => [el('dt', {}, a), el('dd', {}, b)]));
  const categoria = (m) => Object.entries(m || {}).sort((x, y) => y[1].pessoas - x[1].pessoas).map(([k, v]) => [ROTULOS[k] || k, v.pessoas]);

  function desenhar(r) {
    const P = principais(r);
    const { app, landing, n, abriram } = P;
    const agora = new Date();

    const cabeca = el('div', { class: 'cabeca' },
      el('h1', {}, 'Como o finde ', el('i', {}, 'está indo.')),
      el('p', {}, `${diaPorExtenso(agora)} · ${hora(agora)}`));

    const kpis = el('div', { class: 'kpis' }, P.kpis.map(kpi));

    // O funil em escada: cada degrau mostra o número e quanto ficou do passo anterior.
    const funil = P.funil.length ? el('section', { class: 'funil' },
      el('div', { class: 'funil-cabeca' }, el('h2', {}, 'Funil do app'), el('p', {}, `Desde ${data(app?.desde)} · hoje ${P.hojeApp ?? 0} ${P.hojeApp === 1 ? 'pessoa' : 'pessoas'} · cada passo conta só quem fez o anterior`)),
      el('ol', { class: 'escada' }, P.funil.map((f, i) => el('li', { class: 'degrau' },
        el('span', { class: 'degrau-num' }, String(f.n), i ? el('small', { title: 'do passo anterior' }, `${pct(f.n, P.funil[i - 1].n)}%`) : null),
        el('div', { class: 'degrau-trilho', 'aria-hidden': 'true' }, el('div', { class: 'degrau-cheio', p: `${pct(f.n, abriram)}%` })),
        el('span', { class: 'degrau-rot' }, f.rot))))) : null;

    const secoes = [];

    // Festas: a seção larga, é o argumento das casas.
    const top = (app?.topFestas || []).slice(0, 8);
    secoes.push(secao('Festas mais abertas', true,
      top.length ? el('table', { class: 'tabela' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Festa'), el('th', { class: 'n' }, 'Abriram'), el('th', { class: 'n' }, 'Ingresso'), el('th', { class: 'n' }, 'Grupo'))),
        el('tbody', {}, top.map((f) => el('tr', {},
          el('td', {}, f.nome || f.id, f.produtora ? el('small', {}, f.produtora) : null),
          el('td', { class: 'n' }, String(f.detalhe?.pessoas || 0)),
          el('td', { class: 'n' }, String(f.ingresso?.pessoas || 0)),
          el('td', { class: 'n' }, String(f.mandar?.pessoas || 0)))))) : vazio('Nenhuma festa aberta ainda.')));

    // Opinião: a nota grande e as falas.
    const comentarios = [...(landing?.opiniao?.comentarios || []), ...(app?.opiniao?.comentarios || [])]
      .sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, 6);
    const etapas = Object.entries(app?.npsPorEtapa || {});
    secoes.push(secao('Opinião', false,
      r.nps ? [
        el('div', { class: 'nps-linha' }, el('span', { class: 'nps-num' }, String(r.nps.nps)), el('span', { class: 'nps-pe' }, `NPS · ${plural(r.nps.promotores, 'promotor', 'promotores')}, ${plural(r.nps.neutros, 'neutro', 'neutros')}, ${plural(r.nps.detratores, 'detrator', 'detratores')}`)),
        etapas.length ? pares(etapas.map(([k, o]) => [`Quem ${ETAPAS[k] || k}`, `${o.nps} · ${o.respostas} ${o.respostas === 1 ? 'nota' : 'notas'}`])) : null,
      ] : vazio('Nenhuma nota ainda.'),
      comentarios.length ? el('ul', { class: 'comentarios' }, comentarios.map((c) => el('li', {},
        el('span', { class: 'c-nota' }, String(c.nota)),
        el('span', {}, el('q', {}, c.texto), el('small', {}, data(c.em)))))) : null));

    if (app?.retencao) {
      const t = app.retencao;
      const u = app.uso || {};
      secoes.push(secao('Volta e uso', false, pares([
        ['Voltaram no dia seguinte', t.d1.base ? `${t.d1.voltaram} de ${t.d1.base}` : 'a partir de amanhã'],
        ['Voltaram na semana seguinte', t.d7.base ? `${t.d7.voltaram} de ${t.d7.base}` : 'a partir de 01/12'],
        ['Voltaram em outro dia', `${t.outroDia} de ${app.pessoas}`],
        u.pessoas ? ['Sessões por pessoa', virgula(u.sessoesPorPessoa)] : null,
        u.pessoas ? ['Usaram mais de uma vez', String(u.comMaisDeUmaSessao)] : null,
      ])));
    }

    if (app?.convite) {
      const c = app.convite;
      secoes.push(secao('Convite pro grupo', false, pares([
        ['Convites criados', String(c.criados)],
        ['Abertos por quem recebeu', `${c.pessoasQueAbriram} ${c.pessoasQueAbriram === 1 ? 'pessoa' : 'pessoas'}`],
        ['Responderam', `${c.pessoasQueResponderam} ${c.pessoasQueResponderam === 1 ? 'pessoa' : 'pessoas'}`],
        ['Chegaram pelo convite', String(c.novos)],
        ['Dessas, abriram o app', `${c.novosQueAbriramOApp} de ${c.novos}`],
      ])));
    }

    const chegada = categoria(app?.porCategoria?.chegou);
    const marcados = chegada.reduce((s, [, x]) => s + x, 0);
    secoes.push(secao('De onde chegaram', false,
      barras([...chegada, ...(abriram > marcados ? [['Link direto', abriram - marcados]] : [])], abriram),
      landing ? el('p', { class: 'nota' }, `Da landing para o app: ${landing.eventos?.['landing-app']?.pessoas || 0} de ${landing.pessoas}.`) : null));

    const baseLista = n('lista') || app?.pessoas || 0;
    const explora = [['Viram todas', 'todas'], ['Usaram filtro', 'filtro'], ['Abriram o mapa', 'mapa'], ['Trocaram o dia', 'dia'], ['Pediram ajuste', 'ajuste'], ['Puseram na agenda', 'agenda'], ['Compartilharam', 'compartilhou']]
      .map(([rot, ev]) => [rot, n(ev)]).filter(([, x]) => x);
    secoes.push(secao('Na lista de festas', false,
      explora.length ? barras(explora, baseLista) : vazio('Filtro, mapa e troca de dia contam a partir de 25/11.')));

    const m = r.motor && !r.motor.erro ? r.motor : null;
    secoes.push(secao('Motor', false, m ? pares([
      ['Festas reais', String(m.festas)],
      ['Produtoras', String(m.produtoras)],
      ['Com média de idade', String(m.comMediaDeIdade)],
    ]) : vazio(r.motor?.erro || 'Sem resposta do motor.')));

    const rodape = el('p', { class: 'rodape-painel' }, 'Cada número conta pessoas distintas: um aparelho, uma pessoa.',
      r.equipeFora ? ` Fora da conta, marcados com ?equipe=1: ${r.equipeFora}.` : '');

    painel.replaceChildren(cabeca, kpis, funil, el('div', { class: 'secoes' }, secoes), rodape);
  }

  // ------------------------------------------------------------ a imagem
  // Um cartão 1080 × 1350 (retrato, cabe no WhatsApp e no story) com os seis
  // números e o funil, desenhado à mão no canvas: sem biblioteca e sem foto
  // da página (a CSP não deixa e a página é comprida demais).
  const COR = { bordo: '#4E1222', rose: '#C98F8A', nude: '#EADCD2', nudeClaro: '#F3EBE3', rotulo: '#8A4A4F', corrido: '#6B3A3F', sobre: '#D9C2BA' };

  async function cartao() {
    const r = ultimos;
    if (!r) throw new Error('sem números');
    await Promise.all(['italic 300 80px Fraunces', '400 100px "Instrument Serif"', '500 20px "DM Sans"'].map((f) => document.fonts.load(f).catch(() => null)));
    const P = principais(r);
    const W = 1080;
    const H = 1350;
    const M = 72;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const espaco = (px) => { if ('letterSpacing' in x) x.letterSpacing = `${px}px`; };
    const texto = (t, px, py, fonte, cor, { alinhar = 'left', caixa = false, letras = 0 } = {}) => {
      x.font = fonte;
      x.fillStyle = cor;
      x.textAlign = alinhar;
      espaco(letras);
      x.fillText(caixa ? t.toLocaleUpperCase('pt-BR') : t, px, py);
      espaco(0);
    };
    const corte = (t, fonte, max) => {
      x.font = fonte;
      if (x.measureText(t).width <= max) return t;
      let s = t;
      while (s.length > 1 && x.measureText(`${s}…`).width > max) s = s.slice(0, -1);
      return `${s}…`;
    };

    // Quebra em até `max` linhas; a última leva reticências se não couber.
    const linhas = (t, fonte, largura, max) => {
      x.font = fonte;
      const saida = [];
      let atual = '';
      for (const p of t.split(' ')) {
        const tenta = atual ? `${atual} ${p}` : p;
        if (x.measureText(tenta).width <= largura || !atual) atual = tenta;
        else { saida.push(atual); atual = p; }
      }
      if (atual) saida.push(atual);
      if (saida.length > max) saida.splice(max - 1, saida.length, corte(saida.slice(max - 1).join(' '), fonte, largura));
      return saida;
    };

    x.fillStyle = COR.nude;
    x.fillRect(0, 0, W, H);

    // cabeça
    texto('finde', M, 128, 'italic 300 84px Fraunces', COR.bordo);
    x.font = 'italic 300 84px Fraunces';
    texto('.', M + x.measureText('finde').width + 2, 128, 'italic 300 84px Fraunces', COR.rose);
    const agora = new Date();
    texto('Números do protótipo', W - M, 92, '500 20px "DM Sans"', COR.rotulo, { alinhar: 'right', caixa: true, letras: 3 });
    texto(`${diaPorExtenso(agora)} · ${hora(agora)}`, W - M, 128, '400 24px "DM Sans"', COR.corrido, { alinhar: 'right' });
    x.fillStyle = COR.bordo;
    x.fillRect(M, 168, W - 2 * M, 2);

    // os quatro números numa linha
    const colW = (W - 2 * M) / 4;
    P.kpis.forEach((k, i) => {
      const cx = M + i * colW + (i ? 24 : 0);
      const cy = 214;
      if (i) { x.fillStyle = COR.rose; x.fillRect(M + i * colW, cy - 16, 1, 196); }
      linhas(k.rot.toLocaleUpperCase('pt-BR'), '500 17px "DM Sans"', colW - 36, 2).forEach((l, j) => texto(l, cx, cy + 10 + j * 22, '500 17px "DM Sans"', COR.rotulo, { letras: 2 }));
      texto(k.v === null || k.v === undefined ? '—' : String(k.v), cx, cy + 136, '400 100px "Instrument Serif"', COR.bordo);
      linhas(k.v === null || k.v === undefined ? 'sem dado agora' : (k.pe || ''), '400 19px "DM Sans"', colW - 36, 2).forEach((l, j) => texto(l, cx, cy + 172 + j * 25, '400 19px "DM Sans"', COR.corrido));
    });
    x.fillStyle = COR.rose;
    x.fillRect(M, 452, W - 2 * M, 1);

    // o funil, na faixa bordô: o primeiro passo é o número principal
    const fy = 500;
    const fh = 720;
    x.fillStyle = COR.bordo;
    x.fillRect(M, fy, W - 2 * M, fh);
    texto('Funil do app', M + 40, fy + 60, '500 18px "DM Sans"', COR.sobre, { caixa: true, letras: 3 });
    const passos = P.funil;
    if (passos.length) {
      texto(`desde ${data(P.app?.desde)} · hoje ${P.hojeApp ?? 0}`, W - M - 40, fy + 60, '400 20px "DM Sans"', COR.sobre, { alinhar: 'right' });
      const base = passos[0].n || 1;
      const pw = (W - 2 * M - 80) / passos.length;
      const altura = 300;
      const chao = fy + 560;
      passos.forEach((p, i) => {
        const px = M + 40 + i * pw;
        const h = Math.max(2, Math.round((p.n / base) * altura));
        x.fillStyle = COR.rose;
        x.fillRect(px, chao - h, pw - 18, h);
        texto(String(p.n), px, chao - h - 20, i ? '400 68px "Instrument Serif"' : '400 110px "Instrument Serif"', COR.nudeClaro);
        linhas(p.rot, '400 20px "DM Sans"', pw - 22, 2).forEach((l, j) => texto(l, px, chao + 42 + j * 26, '400 20px "DM Sans"', COR.sobre));
        if (i) texto(`${pct(p.n, passos[i - 1].n)}% do anterior`, px, chao + 112, '500 18px "DM Sans"', COR.rose);
      });
      x.fillStyle = COR.rose;
      x.fillRect(M + 40, chao, W - 2 * M - 80, 1);
    } else {
      texto('Sem dados do app agora.', M + 40, fy + 140, '400 28px "DM Sans"', COR.sobre);
    }

    // o pé: volta e convite numa linha
    const app = P.app;
    const pe = [];
    if (app?.retencao?.d1.base) pe.push(`Voltaram no dia seguinte: ${app.retencao.d1.voltaram} de ${app.retencao.d1.base}`);
    if (app?.convite?.pessoasQueAbriram) pe.push(`Convites abertos por ${plural(app.convite.pessoasQueAbriram, 'pessoa', 'pessoas')}`);
    texto(corte(pe.join(' · '), '400 22px "DM Sans"', W - 2 * M), M, 1290, '400 22px "DM Sans"', COR.corrido);
    texto('finde', W - M, 1290, 'italic 300 28px Fraunces', COR.bordo, { alinhar: 'right' });
    return c;
  }

  const blobDe = (canvas, tipo, q) => new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('sem imagem'))), tipo, q));
  const nomeDoArquivo = () => `finde-numeros-${hojeEmSP()}-${hora(new Date()).replace(':', 'h')}.jpg`;

  function avisar(t) {
    const a = $('aviso');
    a.textContent = t;
    a.classList.add('visivel');
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => a.classList.remove('visivel'), 2600);
  }

  async function baixar() {
    const blob = await blobDe(await cartao(), 'image/jpeg', 0.92);
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nomeDoArquivo() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // A área de transferência só aceita PNG; sem permissão, cai no download do JPG.
  async function copiar() {
    try {
      if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') throw new Error('sem clipboard');
      const png = cartao().then((c) => blobDe(c, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      avisar('Imagem copiada. É só colar no grupo.');
    } catch {
      await baixar();
      avisar('Este navegador não deixou copiar; baixei o JPG.');
    }
  }

  function comBotao(id, fazer) {
    const b = $(id);
    b.addEventListener('click', async () => {
      if (!ultimos) return avisar('Os números ainda estão chegando.');
      b.disabled = true;
      try { await fazer(); } catch { avisar('Não consegui gerar a imagem. Tente de novo.'); } finally { b.disabled = false; }
    });
  }
  comBotao('copiar', copiar);
  comBotao('baixar', async () => { await baixar(); avisar('JPG baixado.'); });

  // ------------------------------------------------------------ buscar
  function estado(t, classe) {
    vivo.hidden = false;
    vivo.className = `vivo${classe ? ` ${classe}` : ''}`;
    vivoTexto.textContent = t;
  }

  // A sessão em curso: um pedido que volta depois do Sair (ou de outra
  // entrada) não desenha nada.
  let sessao = 0;
  function mostrar(dados) {
    ultimos = dados;
    desenhar(dados);
    ultimaVez = new Date();
    estado('ao vivo');
  }
  async function buscar() {
    if (!token) return;
    const minha = sessao;
    try {
      const r = await fetch('/api/painel', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (minha !== sessao) return;
      if (r.status === 401) return expulsar('Token não confere.');
      if (r.status === 429) return estado('muitas tentativas; espere um minuto', 'falhou');
      if (!r.ok) return estado('sem resposta; tento de novo', 'falhou');
      const dados = await r.json();
      if (minha !== sessao) return;
      mostrar(dados);
    } catch {
      if (minha !== sessao) return;
      estado('sem conexão', 'falhou');
    }
  }

  function ligar() {
    clearInterval(relogio);
    relogio = null;
    if (!token || document.hidden) {
      if (token) estado('pausado', 'parado');
      return;
    }
    // Volta à aba com números de menos de 15 s: espera a próxima rodada.
    if (!ultimaVez || Date.now() - ultimaVez.getTime() >= A_CADA) buscar();
    else estado('ao vivo');
    relogio = setInterval(buscar, A_CADA);
  }

  function entrar(t, dados) {
    sessao++;
    token = t;
    form.hidden = true;
    painel.hidden = false;
    acoes.hidden = false;
    if (dados) mostrar(dados);
    else painel.replaceChildren(el('p', { class: 'vazio' }, 'Carregando os números…'));
    ligar();
  }

  function expulsar(motivo) {
    sessao++;
    token = null;
    ultimaVez = null;
    ultimos = null;
    guardar.apagar();
    clearInterval(relogio);
    relogio = null;
    anterior = {};
    painel.hidden = true;
    painel.replaceChildren();
    acoes.hidden = true;
    vivo.hidden = true;
    form.hidden = false;
    $('erro').textContent = motivo || '';
    $('token').value = '';
    $('token').focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = $('token').value.trim();
    if (!t) return;
    $('erro').textContent = '';
    let dados;
    try {
      const r = await fetch('/api/painel', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      if (r.status === 401) { $('erro').textContent = 'Token não confere.'; return; }
      if (r.status === 429) { $('erro').textContent = 'Muitas tentativas daqui. Espere um minuto.'; return; }
      if (!r.ok) { $('erro').textContent = `O servidor respondeu ${r.status}. Tente de novo.`; return; }
      dados = await r.json();
    } catch {
      $('erro').textContent = 'Sem conexão. Tente de novo.';
      return;
    }
    guardar.gravar(t, $('lembrar').checked);
    entrar(t, dados);
  });
  $('sair').addEventListener('click', () => expulsar(''));
  document.addEventListener('visibilitychange', ligar);

  const salvo = guardar.ler();
  if (salvo) entrar(salvo);
  else $('token').focus();
})();

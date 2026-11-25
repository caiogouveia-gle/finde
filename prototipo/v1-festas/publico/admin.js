'use strict';
// O painel ao vivo dos números (/admin). O token de admin fica só nesta aba
// (sessionStorage) ou, com "Lembrar", neste aparelho (localStorage). Os
// números vêm de GET /api/painel a cada 15 s enquanto a aba está à vista.
// Todo texto entra por textContent: os comentários da opinião são de quem usou.

(() => {
  const CHAVE = 'finde.admin';
  const APARELHO = 'finde.aparelho';
  const EQUIPE = 'finde.equipe';
  const A_CADA = 15000;

  const $ = (id) => document.getElementById(id);
  const form = $('entrada');
  const painel = $('painel');
  const vivo = $('vivo');
  const vivoTexto = $('vivo-texto');
  const sair = $('sair');
  let token = null;
  let relogio = null;
  let anterior = {};
  let ultimaVez = null;

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

  // Quem abre o painel é da equipe: o aparelho sai dos números do app, como
  // com ?equipe=1 (publico/medir.js usa as mesmas chaves).
  function marcarEquipe() {
    try {
      if (localStorage.getItem(EQUIPE) === '1') return;
      let a = localStorage.getItem(APARELHO);
      if (!/^[a-f0-9]{32}$/.test(a || '')) {
        a = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(APARELHO, a);
      }
      localStorage.setItem(EQUIPE, '1');
      fetch('/api/uso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evento: 'equipe', aparelho: a }), keepalive: true }).catch(() => {});
    } catch { /* sem armazenamento, sem marca */ }
  }

  // ------------------------------------------------------------ montar a tela
  function el(tag, attrs = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'largura') e.style.width = v; // pelo CSSOM: a CSP barra style=""
      else e.setAttribute(k, v);
    }
    for (const f of filhos.flat(Infinity)) if (f !== null && f !== undefined && f !== false) e.append(f instanceof Node ? f : String(f));
    return e;
  }
  const pct = (x, n) => (n ? Math.round((x / n) * 100) : 0);
  const virgula = (x) => String(x).replace('.', ',');
  const pequena = (n) => (n < 10 ? el('span', { class: 'pequena', title: 'Menos de 10 pessoas: leia como sinal, não como taxa.' }, 'amostra pequena') : null);
  const nN = (n) => el('span', { class: 'nota-n' }, ` n=${n}`);
  const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const hora = (d) => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : '—');

  const ROTULOS = {
    qr: 'QR Code', landing: 'Landing', insta: 'Instagram', zap: 'WhatsApp', mbm: 'MBM', cartaz: 'Cartaz', convite: 'Convite',
    som: 'som', bairro: 'bairro', preco: 'preço', idade: 'idade',
    qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo', hoje: 'hoje',
    nativo: 'compartilhar do celular', copiou: 'copiou o link', zapfesta: 'WhatsApp',
    app: 'no app', opiniao: 'na página de opinião',
  };
  const PASSOS = {
    'abriu-app': 'Abriram o app',
    lista: 'Viram a lista',
    detalhe: 'Abriram uma festa',
    'mandar-ou-convite': 'Mandaram ou criaram convite',
    whatsapp: 'Mandaram no WhatsApp',
  };
  const ETAPAS = {
    'sem-uso': 'sem uso registrado', entrou: 'só entrou', lista: 'viu a lista',
    detalhe: 'abriu uma festa', ingresso: 'foi ao ingresso', mandou: 'mandou pro grupo',
  };

  function kpi(chave, rotulo, valor, pe) {
    const num = el('span', { class: 'kpi-num', 'data-chave': chave }, valor === null || valor === undefined ? '—' : String(valor));
    if (typeof valor === 'number' && typeof anterior[chave] === 'number' && valor > anterior[chave]) {
      num.classList.add('subiu');
      setTimeout(() => num.classList.remove('subiu'), 2500);
    }
    if (typeof valor === 'number') anterior[chave] = valor;
    return el('div', { class: 'kpi' }, el('span', { class: 'kpi-rot' }, rotulo), num, pe ? el('span', { class: 'kpi-pe' }, pe) : null);
  }

  function barras(itens, base) {
    return el('ul', { class: 'barras' }, itens.map(([rot, x]) => el('li', { class: 'barra' },
      el('div', { class: 'barra-linha' }, el('span', {}, rot), el('span', { class: 'barra-valor' }, base ? `${x} · ${pct(x, base)}%` : String(x))),
      el('div', { class: 'barra-trilho', 'aria-hidden': 'true' }, el('div', { class: 'barra-cheio', largura: `${base ? Math.min(100, pct(x, base)) : 0}%` })))));
  }

  function secao(titulo, ...corpo) {
    return el('section', { class: 'secao' }, el('h2', {}, titulo), ...corpo);
  }
  const vazio = (t) => el('p', { class: 'vazio' }, t);

  function categoria(m) {
    return Object.entries(m || {}).sort((x, y) => y[1].pessoas - x[1].pessoas).map(([k, v]) => [ROTULOS[k] || k, v.pessoas]);
  }

  function desenhar(r) {
    const app = r.app && !r.app.erro ? r.app : null;
    const landing = r.landing && !r.landing.erro ? r.landing : null;
    const hoje = hojeEmSP();
    const evs = app?.eventos || {};
    const n = (ev) => evs[ev]?.pessoas || 0;

    // Os cartões do alto contam o mesmo que o funil: a base é quem abriu o
    // app (quem só abriu um convite ou a opinião não entra nela).
    const funil = Object.fromEntries((app?.funil || []).map((f) => [f.passo, f.pessoas]));
    const abriram = funil['abriu-app'] ?? n('abriu-app');
    const chamaram = funil['mandar-ou-convite'] ?? 0;
    const npsN = r.nps ? r.nps.respostas : 0;
    const kpis = el('div', { class: 'kpis' },
      kpi('app', 'Abriram o app', app ? abriram : null, app ? `hoje ${app.porDia?.[hoje] || 0} · desde ${data(app.desde)}` : (r.app?.erro || 'sem resposta')),
      kpi('landing', 'Landing', landing ? landing.pessoas : null, landing ? `hoje ${landing.porDia?.[hoje] || 0}` : (r.landing?.erro || 'sem resposta')),
      kpi('grupo', 'Grupo', app ? chamaram : null, app ? `chamaram · ${pct(chamaram, abriram)}% de quem abriu` : null),
      kpi('ingresso', 'Ingresso', app ? n('ingresso') : null, app ? `+ ${n('convite-ingresso')} pelo convite` : null),
      kpi('nps', 'NPS', r.nps ? r.nps.nps : null, r.nps ? [`n=${npsN} · média ${virgula(r.nps.media)}`, pequena(npsN)] : 'sem respostas'),
      kpi('lista', 'E-mails', r.listaUnicos ?? r.lista ?? 0, r.listaUnicos === null || r.listaUnicos === undefined ? 'soma das listas, pode repetir' : 'únicos, landing e app'),
    );

    const secoes = [];

    // Funil
    if (app && Array.isArray(app.funil) && app.funil.length) {
      const base = app.funil[0].pessoas;
      secoes.push(secao('Funil do app',
        el('p', { class: 'nota-n' }, 'Cada passo só conta quem fez o anterior.', nN(base), pequena(base)),
        barras(app.funil.map((f) => [PASSOS[f.passo] || f.passo, f.pessoas]), base)));
    }

    // Volta e uso
    if (app?.retencao) {
      const t = app.retencao;
      const u = app.uso || {};
      secoes.push(secao('Volta e uso',
        el('dl', { class: 'pares' },
          el('dt', {}, 'Voltou no dia seguinte (D1)'), el('dd', {}, `${t.d1.voltaram} de ${t.d1.base}`),
          el('dt', {}, 'Voltou do 7º ao 9º dia (D7)'), el('dd', {}, t.d7.base ? `${t.d7.voltaram} de ${t.d7.base}` : 'ainda sem base'),
          el('dt', {}, 'Voltou em outro dia'), el('dd', {}, `${t.outroDia} de ${app.pessoas}`),
          u.pessoas ? [
            el('dt', {}, 'Sessões por pessoa'), el('dd', {}, `${virgula(u.sessoesPorPessoa)} (mediana ${virgula(u.sessoesMediana)})`),
            el('dt', {}, 'Com mais de uma sessão'), el('dd', {}, String(u.comMaisDeUmaSessao)),
            el('dt', {}, 'Dias ativos, média'), el('dd', {}, virgula(u.diasAtivosMedia)),
          ] : null)));
    }

    // Chegada
    const chegada = categoria(app?.porCategoria?.chegou);
    secoes.push(secao('De onde chegaram ao app',
      chegada.length ? barras(chegada, abriram) : vazio('Ninguém chegou com a origem marcada ainda.'),
      app ? el('p', { class: 'nota-n' }, `Sem origem marcada (link direto): ${Math.max(0, abriram - (app.porCategoria?.chegou ? Object.values(app.porCategoria.chegou).reduce((s, v) => s + v.pessoas, 0) : 0))} de ${abriram}`) : null,
      landing ? el('p', { class: 'nota-n' }, `Da landing para o app: ${landing.eventos?.['landing-app']?.pessoas || 0} de ${landing.pessoas}`) : null));

    // Festas
    const top = (app?.topFestas || []).slice(0, 10);
    secoes.push(secao('Festas mais abertas',
      top.length ? el('table', { class: 'tabela' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Festa'), el('th', { class: 'n' }, 'abriram'), el('th', { class: 'n' }, 'ingresso'), el('th', { class: 'n' }, 'grupo'))),
        el('tbody', {}, top.map((f) => el('tr', {},
          el('td', {}, f.nome || f.id, f.produtora ? el('small', {}, f.produtora) : null),
          el('td', { class: 'n' }, String(f.detalhe?.pessoas || 0)),
          el('td', { class: 'n' }, String(f.ingresso?.pessoas || 0)),
          el('td', { class: 'n' }, String(f.mandar?.pessoas || 0)))))) : vazio('Ainda sem festa aberta com a contagem nova.')));

    // Convite
    if (app?.convite) {
      const c = app.convite;
      secoes.push(secao('Convite pro grupo',
        el('dl', { class: 'pares' },
          el('dt', {}, 'Convites criados'), el('dd', {}, String(c.criados)),
          el('dt', {}, 'Abertos por quem recebeu'), el('dd', {}, `${c.pessoasQueAbriram} pessoas · ${c.aberturas} vezes`),
          el('dt', {}, 'Respostas'), el('dd', {}, `${c.respostas} · de ${c.pessoasQueResponderam} pessoas`),
          el('dt', {}, 'Gente nova pelo convite'), el('dd', {}, String(c.novos)),
          el('dt', {}, 'Dessas, abriram o app'), el('dd', {}, `${c.novosQueAbriramOApp} de ${c.novos}`))));
    }

    // Na lista
    const baseLista = n('lista') || app?.pessoas || 0;
    const explora = [['Viram todas', 'todas'], ['Usaram filtro', 'filtro'], ['Abriram o mapa', 'mapa'], ['Trocaram o dia', 'dia'], ['Pediram ajuste', 'ajuste'], ['Puseram na agenda', 'agenda'], ['Compartilharam a festa', 'compartilhou']]
      .map(([rot, ev]) => [rot, n(ev)]);
    secoes.push(secao('O que fazem na lista',
      el('p', { class: 'nota-n' }, 'Entre quem viu a lista.', nN(baseLista), pequena(baseLista)),
      explora.some(([, x]) => x) ? barras(explora, baseLista) : vazio('Ainda sem uso de filtro, mapa ou dia com a contagem nova.')));

    // Opinião
    const linhasTaxa = Object.entries(app?.taxaDeResposta || {}).filter(([, t]) => t.viram || t.respostas);
    const etapas = Object.entries(app?.npsPorEtapa || {});
    const comentarios = [...(landing?.opiniao?.comentarios || []), ...(app?.opiniao?.comentarios || [])]
      .sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, 8);
    secoes.push(secao('Opinião',
      r.nps ? el('dl', { class: 'pares' },
        el('dt', {}, 'Promotores, neutros e detratores (landing e app)'), el('dd', {}, `${r.nps.promotores} · ${r.nps.neutros} · ${r.nps.detratores}`),
        linhasTaxa.map(([de, t]) => [el('dt', {}, `Responderam ${ROTULOS[de] || de}`), el('dd', {}, t.viram ? `${t.responderam} de ${t.viram} que viram` : `${t.respostas} respostas`)]),
        etapas.map(([k, o]) => [el('dt', {}, `NPS de quem ${ETAPAS[k] || k}`), el('dd', {}, `${o.nps} · n=${o.respostas}`)])) : vazio('Nenhuma nota ainda.'),
      comentarios.length ? el('ul', { class: 'comentarios' }, comentarios.map((c) => el('li', {},
        el('span', { class: 'c-nota' }, String(c.nota)),
        el('span', {}, c.texto, el('small', {}, data(c.em)))))) : null));

    // Motor
    const m = r.motor && !r.motor.erro ? r.motor : null;
    secoes.push(secao('Motor',
      m ? el('dl', { class: 'pares' },
        el('dt', {}, 'Festas reais'), el('dd', {}, String(m.festas)),
        el('dt', {}, 'Produtoras'), el('dd', {}, String(m.produtoras)),
        el('dt', {}, 'Com média de idade'), el('dd', {}, String(m.comMediaDeIdade))) : vazio(r.motor?.erro || 'Sem resposta do motor.')));

    const rodape = el('p', { class: 'rodape-painel' },
      `Equipe e testes fora da conta: ${r.equipeFora || 0} aparelho${r.equipeFora === 1 ? '' : 's'}. Os números contam pessoas distintas (um aparelho = uma pessoa).`);

    painel.replaceChildren(kpis, el('div', { class: 'secoes' }, secoes), rodape);
  }

  // ------------------------------------------------------------ buscar
  function estado(texto, classe) {
    vivo.hidden = false;
    vivo.className = `vivo${classe ? ` ${classe}` : ''}`;
    vivoTexto.textContent = texto;
  }

  // A sessão em curso: um pedido que volta depois do Sair (ou de outra
  // entrada) não desenha nada.
  let sessao = 0;
  function mostrar(dados) {
    desenhar(dados);
    ultimaVez = new Date();
    estado(`ao vivo · ${hora(ultimaVez)}`);
  }
  async function buscar() {
    if (!token) return;
    const minha = sessao;
    try {
      const r = await fetch('/api/painel', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (minha !== sessao) return;
      if (r.status === 401) return expulsar('Token não confere.');
      if (r.status === 429) return estado('muitas tentativas; espere um minuto', 'falhou');
      if (!r.ok) return estado(`falhou (${r.status}); tento de novo`, 'falhou');
      const dados = await r.json();
      if (minha !== sessao) return;
      mostrar(dados);
    } catch {
      if (minha !== sessao) return;
      estado(ultimaVez ? `sem conexão · último às ${hora(ultimaVez)}` : 'sem conexão', 'falhou');
    }
  }

  function ligar() {
    clearInterval(relogio);
    relogio = null;
    if (!token || document.hidden) {
      if (token) estado(ultimaVez ? `pausado · último às ${hora(ultimaVez)}` : 'pausado', 'parado');
      return;
    }
    // Volta à aba com números de menos de 15 s: espera a próxima rodada.
    if (!ultimaVez || Date.now() - ultimaVez.getTime() >= A_CADA) buscar();
    relogio = setInterval(buscar, A_CADA);
  }

  function entrar(t, dados) {
    sessao++;
    token = t;
    form.hidden = true;
    painel.hidden = false;
    sair.hidden = false;
    if (dados) mostrar(dados);
    else painel.replaceChildren(el('p', { class: 'vazio' }, 'Carregando os números…'));
    ligar();
  }

  function expulsar(motivo) {
    sessao++;
    token = null;
    ultimaVez = null;
    guardar.apagar();
    clearInterval(relogio);
    relogio = null;
    anterior = {};
    painel.hidden = true;
    painel.replaceChildren();
    sair.hidden = true;
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
    marcarEquipe();
    entrar(t, dados);
  });
  sair.addEventListener('click', () => expulsar(''));
  document.addEventListener('visibilitychange', ligar);

  const salvo = guardar.ler();
  if (salvo) entrar(salvo);
  else $('token').focus();
})();

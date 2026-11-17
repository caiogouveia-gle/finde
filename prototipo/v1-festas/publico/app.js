'use strict';
// O app do Finde: formulário de seis perguntas (uma por tela, sem
// boas-vindas: quem chega veio da landing), resultado que vira conversa, o
// detalhe da festa e o convite pro grupo. ?festa=<id> abre direto o detalhe
// de uma festa, sem pedido. Em desenvolvimento ele mora em /app, ao lado da
// landing; em produção, na raiz do próprio endereço, e a landing em outro.
// Nada aqui depende do caminho: os links internos vão a /app?..., que o
// servidor serve nos dois casos.

(() => {
  const {
    el, titulo, chamar, site, marca, rodape, reduzir, hora, anunciar, manterVisivel,
    linkFora, cartaz, ausente, blocoOnde, blocoIngresso, blocoLinks, seta, acaoC, painelConvite, mov: M,
  } = window.Finde;
  const FT = window.FindeTexto;
  const $tela = document.getElementById('tela');

  const PERGUNTAS = [
    { chave: 'dia', tipo: 'um', titulo: ['Sair ', 'quando?'], lista: 'dias' },
    { chave: 'janela', tipo: 'um', titulo: ['A que horas chegar e ', 'voltar?'], lista: 'janelas' },
    { chave: 'bairros', tipo: 'bairros', titulo: ['Pra que lado da ', 'cidade?'], dica: 'Um ou vários.' },
    { chave: 'idade', tipo: 'idade', titulo: ['Gente de que ', 'idade?'], dica: 'A faixa em que você se sente bem. Festa com média fora dela também aparece, depois, com aviso.' },
    { chave: 'teto', tipo: 'um', titulo: ['Até quanto você quer ', 'gastar?'], lista: 'tetos' },
    { chave: 'estilos', tipo: 'varios', titulo: ['E o ', 'som?'], lista: 'estilos', dica: 'Pode marcar mais de um. Ou nenhum.' },
  ];
  const DIA = {
    sex: { nome: 'sexta', seu: 'pra sua ', no: 'na', curto: 'sex' },
    sab: { nome: 'sábado', seu: 'pro seu ', no: 'no', curto: 'sáb' },
    dom: { nome: 'domingo', seu: 'pro seu ', no: 'no', curto: 'dom' },
  };
  const JANELA = { 'fim-de-tarde': [17, 23], 'comeco-da-noite': [19, 25], noite: [22, 27] };
  // A régua do detalhe: das 15h às 3h. Seis festas começam às 15h ou 16h.
  const EIXO = { de: 15, ate: 27 };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const NUMERAL = ['Nada', 'Uma', 'Duas', 'Três'];
  // A escolha aparece em 160 ms (o marcador e o fio); o resto da pausa é
  // para a pessoa ver o que escolheu antes de a pergunta sair.
  const AVANCO_MS = 200;
  // Depois de trocar de tela, um toque não vale por este tempo. Com movimento
  // reduzido o avanço é imediato, então a trava soma o atraso que ele não teve:
  // nos dois modos, um segundo toque até uns 650 ms depois do primeiro é engolido.
  const TRAVA_MS = 450;
  const trava = () => TRAVA_MS + (reduzir.matches ? AVANCO_MS : 0);
  const SESSAO = 'finde.sessao';
  // A landing: para onde vão o wordmark e o "Voltar" da pergunta 1 e do
  // detalhe aberto por link. O endereço vem da meta finde-site.
  const LANDING = site();

  const estado = {
    form: null,
    respostas: { dia: null, janela: null, bairros: [], idade: null, teto: null, estilos: [] },
    tela: 'pergunta',
    passo: 0,
    // Aberto por /app?festa=<id>: o detalhe sem pedido, sem "sua janela".
    avulsa: false,
    editando: null,
    criterios: null,
    resultado: null,
    fala: null,
    novas: [],
    mandar: null,
    // O detalhe aberto e a rolagem da lista ao sair dela (voltar devolve ali).
    festa: null,
    rolagemLista: 0,
    convites: {},
    ocupado: false,
    avancoPendente: null,
  };

  // ------------------------------------------------------------ sessão

  // Recarregar a página não perde o pedido nem a conversa.
  function salvar() {
    try {
      const { form, ocupado, avancoPendente, ...resto } = estado;
      sessionStorage.setItem(SESSAO, JSON.stringify(resto));
    } catch { /* sem armazenamento: só não sobrevive ao recarregar */ }
  }

  function restaurar() {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(SESSAO) || 'null');
      if (salvo && typeof salvo === 'object') Object.assign(estado, salvo, { ocupado: false, avancoPendente: null });
    } catch { /* começa do zero */ }
  }

  // ------------------------------------------------------------ toque

  // Um segundo toque logo depois da troca de tela não cai na tela nova. Vale
  // para todo botão, com ou sem movimento reduzido.
  let travaAte = 0;
  document.addEventListener('click', (e) => {
    if (e.detail > 0 && performance.now() < travaAte) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ------------------------------------------------------------ navegação

  const primeiraSemResposta = () => PERGUNTAS.findIndex((p) => p.tipo === 'um' && (estado.respostas[p.chave] === null || estado.respostas[p.chave] === undefined));

  // Cada entrada do histórico guarda a sua altura (n): a pergunta 1 é 0. É
  // por ela que Recomeçar volta até a pergunta 1 em vez de empilhar outra.
  const nivel = () => (history.state && Number.isInteger(history.state.n) ? history.state.n : 0);
  function empilhar(s) {
    history.pushState({ ...s, n: nivel() + 1 }, '');
  }

  // Um pedido à rede vale enquanto a pessoa não sai dali: Voltar (do app ou
  // do navegador) e Recomeçar abrem uma geração nova, e a resposta de uma
  // geração velha é descartada, sem jogar ninguém de volta para a lista.
  let geracao = 0;
  function cancelarEspera() {
    geracao += 1;
    estado.ocupado = false;
  }

  function ir(tela, { passo = 0, substituir = false, deLista = false } = {}) {
    clearTimeout(estado.avancoPendente);
    if (estado.tela === 'resultado' && tela !== 'resultado') estado.rolagemLista = window.scrollY;
    estado.tela = tela;
    estado.passo = passo;
    const s = { tela, passo, editando: estado.editando, deLista: deLista || undefined };
    if (substituir) history.replaceState({ ...s, n: nivel() }, '');
    else empilhar(s);
    desenhar();
  }

  window.addEventListener('popstate', (e) => {
    // "Voltar" logo depois de um toque não é desfeito pelo avanço agendado, e
    // a resposta que ainda estava a caminho não vale mais.
    clearTimeout(estado.avancoPendente);
    cancelarEspera();
    const s = e.state || { tela: 'pergunta', passo: 0 };
    let { tela } = s;
    let passo = s.passo || 0;
    const veioDoDetalhe = estado.tela === 'festa' || estado.tela === 'mandar';
    if (tela === 'inicio') tela = 'pergunta';
    if (tela === 'festa' && !estado.festa) tela = 'resultado';
    if ((tela === 'resultado' && !estado.resultado) || (tela === 'mandar' && !estado.mandar)) {
      tela = 'pergunta';
      passo = 0;
    }
    if (tela === 'pergunta' && !s.editando) {
      const falta = primeiraSemResposta();
      if (falta >= 0 && falta < passo) passo = falta;
    }
    estado.tela = tela;
    estado.passo = passo;
    estado.editando = tela === 'pergunta' ? s.editando || null : null;
    // Voltar do detalhe devolve a lista onde ela estava, com o foco na festa aberta.
    if (tela === 'resultado' && veioDoDetalhe && estado.festa) {
      const id = estado.festa.festa.id;
      // A troca pode esperar a transição: o foco vai depois dela.
      desenhar({
        focar: false, rolagem: estado.rolagemLista, volta: true,
        depois: () => {
          const b = $tela.querySelector(`[data-festa="${CSS.escape(id)}"] .festa-abrir`);
          if (b) b.focus({ preventScroll: true });
        },
      });
      return;
    }
    desenhar({ volta: true });
  });

  // entrar: a tela chega com o seu movimento (coreografia). Depois de um
  // ajuste, nada pisca: só as festas novas aparecem. Duas trocas esperam um
  // instante antes do desenho: de uma pergunta para outra, a que sai recua
  // (160 ms); entre a lista e o detalhe, a hora e o nome do cartão viajam
  // (View Transitions). Por isso o que depende da tela nova vai em depois.
  let trocaPendente = null;
  let ultima = null; // a tela desenhada por último: { tela, passo }
  function desenhar(opcoes = {}) {
    if (trocaPendente) trocaPendente.cancelar();
    const entrar = opcoes.entrar !== false;
    const de = ultima;
    const velho = $tela.firstElementChild;
    if (entrar && M.pode() && de && velho && !document.hidden) {
      if (de.tela === 'pergunta' && estado.tela === 'pergunta' && velho.matches('form.tela-pergunta')) {
        recuar(velho, opcoes.volta, () => desenharJa(opcoes, de));
        return;
      }
      if (comVista(de.tela, () => desenharJa(opcoes, de))) return;
    }
    desenharJa(opcoes, de);
  }

  function desenharJa({ focar = true, entrar = true, travar = entrar, rolagem = 0, volta = false, depois = null } = {}, de = null) {
    const telas = { pergunta: telaPergunta, resultado: telaResultado, festa: telaFesta, mandar: telaMandar };
    // Sem o formulário ainda (página salva, rede lenta), a pergunta espera.
    const tela = estado.tela === 'pergunta' && !estado.form ? telaCarregando : telas[estado.tela] || telaPergunta;
    const conteudo = tela();
    if (entrar) conteudo.classList.add('entra');
    $tela.replaceChildren(conteudo);
    document.body.dataset.tela = estado.tela;
    if (entrar) window.scrollTo(0, rolagem);
    if (focar) {
      const alvo = $tela.querySelector('[data-foco]') || $tela.querySelector('h1');
      if (alvo) alvo.focus({ preventScroll: true });
    }
    posicionar($tela);
    medirBarra();
    // A trava conta a partir do quadro pintado: com CPU lenta, o desenho leva
    // tempo, e o segundo toque de um toque duplo ainda cai na tela nova.
    if (travar) {
      travaAte = performance.now() + trava();
      requestAnimationFrame(() => { travaAte = Math.max(travaAte, performance.now() + trava()); });
    }
    const agora = { tela: estado.tela, passo: estado.passo };
    if (entrar) coreografia(conteudo, de, { volta });
    ultima = agora;
    salvar();
    if (depois) depois();
  }

  // ------------------------------------------------------------ movimento

  // A pergunta que sai recua: some subindo (descendo, se a pessoa voltou),
  // em 160 ms, e só então a nova é desenhada. Um desenho no meio cancela a
  // espera e desenha já. Com a aba oculta a animação para; a troca não.
  function recuar(velho, volta, seguir) {
    const v = M.v();
    velho.classList.add('saindo');
    const alvos = velho.querySelectorAll('.cabeca-pergunta, .opcoes, .onde-chips, .faixa, .pe');
    const anims = [...alvos].map((x) => M.animar(x, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `0 ${volta ? 10 : -10}px` }], {
      duration: v.toque, easing: v.troca, fill: 'forwards',
    })).filter(Boolean);
    let feito = false;
    const fim = () => {
      feito = true;
      trocaPendente = null;
      document.removeEventListener('visibilitychange', ir1);
    };
    const ir1 = () => {
      if (feito) return;
      fim();
      seguir();
    };
    trocaPendente = { cancelar: fim };
    document.addEventListener('visibilitychange', ir1);
    if (!anims.length) ir1();
    else {
      Promise.all(anims.map((a) => a.finished)).then(ir1, ir1);
      // A nova não espera o último quadro da saída: com a curva de troca, aos
      // 110 ms a velha já quase sumiu, e assim não sobra quadro vazio.
      setTimeout(ir1, v.toque - 50);
    }
  }

  // Do cartão ao detalhe e de volta: a hora e o nome da festa aberta viajam
  // entre as duas posições. Devolve false quando não há transição a fazer
  // (o desenho segue direto).
  function comVista(de, fazer) {
    if (typeof document.startViewTransition !== 'function') return false;
    const ida = de === 'resultado' && estado.tela === 'festa';
    const volta = de === 'festa' && estado.tela === 'resultado';
    const id = estado.festa && estado.festa.festa && estado.festa.festa.id;
    if ((!ida && !volta) || !id || estado.avulsa) return false;
    const nomes = [];
    const nomear = (naLista) => {
      const raiz = naLista ? $tela.querySelector(`[data-festa="${CSS.escape(id)}"]`) : $tela.querySelector('.tela-festa');
      if (!raiz) return;
      const hora1 = raiz.querySelector(naLista ? '.festa-quando .hora' : '.detalhe-hora .hora');
      const nome1 = raiz.querySelector(naLista ? '.nome' : '#festa-nome');
      for (const [x, n] of [[hora1, 'festa-hora'], [nome1, 'festa-nome']]) {
        if (!x) continue;
        x.style.viewTransitionName = n;
        nomes.push(x);
      }
    };
    // Antes da troca a página ainda é a de origem (na ida, a lista); dentro
    // dela, já é a de destino (na volta, a lista de novo).
    nomear(ida);
    let t;
    try {
      t = document.startViewTransition(() => {
        for (const x of nomes.splice(0)) x.style.viewTransitionName = '';
        fazer();
        nomear(volta);
      });
    } catch {
      for (const x of nomes.splice(0)) x.style.viewTransitionName = '';
      return false;
    }
    // O detalhe sabe que a hora e o nome chegaram pela transição.
    vistaEmCurso = true;
    const limpar = () => {
      vistaEmCurso = false;
      for (const x of nomes.splice(0)) x.style.viewTransitionName = '';
    };
    t.finished.then(limpar, limpar);
    return true;
  }
  let vistaEmCurso = false;

  // O que cada tela faz ao chegar. Tudo parte do estado final.
  function coreografia(raiz, de, { volta }) {
    if (!M.anima()) return;
    if (!M.pode()) {
      M.soOpacidade(raiz);
      return;
    }
    const t = estado.tela;
    if (raiz.classList.contains('tela-carregando')) return;
    if (t === 'pergunta') entraPergunta(raiz, de, volta);
    else if (t === 'resultado') {
      // Voltando do detalhe, a lista já estava ali: só o cartão viaja.
      if (volta && de && de.tela !== 'pergunta') {
        if (!vistaEmCurso) M.subir(raiz, { y: 0, duracao: M.v().estado });
        return;
      }
      entraResultado(raiz);
    } else if (t === 'festa') entraFesta(raiz, { volta, vista: vistaEmCurso });
    else if (t === 'mandar') entraMandar(raiz, volta);
  }

  function entraPergunta(raiz, de, volta) {
    const v = M.v();
    // O segmento da pergunta nova se desenha; voltando, o de antes se recolhe.
    const segs = raiz.querySelectorAll('.progresso > span');
    if (volta && segs[estado.passo + 1]) {
      M.animar(segs[estado.passo + 1].firstElementChild, [{ scale: '1 1', transformOrigin: '100% 50%' }, { scale: '0 1', transformOrigin: '100% 50%' }], { duration: v.bloco, easing: v.troca });
    } else if (!volta && segs[estado.passo]) {
      M.fio(segs[estado.passo].firstElementChild, { atraso: 60, duracao: v.bloco });
    }
    // A primeira pergunta tem o tempo de título (900 ms); entre uma pergunta
    // e outra, o de bloco, com o itálico quase junto e as opções logo atrás
    // do título: legíveis e tocáveis uns 500 ms depois do toque.
    const troca = de && de.tela === 'pergunta';
    M.subir(raiz.querySelector('.cabeca-pergunta > .rotulo'), { y: 6, duracao: v.estado });
    M.titulo(raiz.querySelector('.cabeca-pergunta h1'), troca ? { duracao: v.bloco, em: 2 * v.escala } : { atraso: 40 });
    M.subir(raiz.querySelector('.dica'), { atraso: troca ? 60 : 320, y: 6, duracao: troca ? v.estado : v.bloco });
    M.subir(raiz.querySelectorAll('.opcoes > .opcao, .onde-chips > *, .faixa > *'), troca ? { atraso: 40, y: 10, duracao: v.estado } : { atraso: 260, y: 14 });
    M.subir(raiz.querySelector('.pe'), { atraso: troca ? 120 : 520, y: 0, duracao: v.estado });
  }

  function entraResultado(raiz) {
    const v = M.v();
    M.subir(raiz.querySelector('.pedido'), { y: 6, duracao: v.estado });
    M.titulo(raiz.querySelector('#cabeca-resultado h1'), { atraso: 60 });
    M.subir(raiz.querySelector('#conversa'), { atraso: 380, y: 8 });
    // A programação: os fios ficam, e cada festa chega na sua linha, em
    // escada; a "% a sua cara" se desenha depois. As de baixo, quando a
    // rolagem chega perto delas.
    M.aoVer(raiz.querySelectorAll('.festa'), (li) => [
      M.subir([...li.children], { y: 12, escada: false }),
      M.revelar(li.querySelector('.cara-pct'), { atraso: 280, duracao: v.bloco }),
    ], { atraso: 420 });
    // O ajuste fecha a tela: entra depois das festas que estão à vista.
    M.aoVer(raiz.querySelectorAll('.bloco-rotulo, .ajuste > *'), (x) => M.subir(x, { y: 10 }), { atraso: 760 });
  }

  // A régua do horário se desenha do começo ao fim da festa, no ritmo do
  // relógio (linear); o ponto de "enche" chega quando o traço passa por ele,
  // e cada rótulo aparece quando o traço o alcança. A janela pedida (o
  // colchete rosé) se abre por baixo, um pouco antes.
  function animarRegua(rg, atraso, dur) {
    if (!rg) return [];
    const v = M.v();
    const d = dur || v.titulo;
    const festa = rg.querySelector('.rg-festa');
    const janela = rg.querySelector('.rg-janela');
    const pos = (x) => parseFloat(x && x.dataset.l) || 0;
    const ini = pos(festa);
    const larg = parseFloat(festa && festa.dataset.w) || 0;
    const quando = (x) => (larg ? Math.max(0, Math.min(1, (x - ini) / larg)) : 1);
    const traco = atraso + 120;
    const anims = [
      M.revelar(janela, { atraso, duracao: v.bloco }),
      M.fio(festa, { atraso: traco, duracao: d, curva: 'linear' }),
    ];
    const pico = rg.querySelector('.rg-pico, .rg-media');
    if (pico && pico.classList.contains('rg-pico')) {
      anims.push(M.subir(pico, { atraso: traco + d * quando(pos(pico)) + 40, y: -6, duracao: v.estado }));
    }
    for (const r of rg.querySelectorAll('.rg-cima .rg-rotulo')) {
      // O rótulo do fim está preso à direita do ponto: ele chega com o fim.
      anims.push(M.subir(r, { atraso: traco + d * quando(pos(r)) - 60, y: 4, duracao: v.estado }));
    }
    anims.push(M.subir(rg.querySelectorAll('.rg-baixo .rg-rotulo'), { atraso: atraso + 200, y: 0, duracao: v.estado, escada: false }));
    return anims.flat();
  }

  // A régua da idade: a faixa pedida se abre e a média chega nela.
  function animarReguaIdade(rg) {
    const v = M.v();
    return [
      M.revelar(rg.querySelector('.rg-janela'), { duracao: v.bloco }),
      M.subir(rg.querySelector('.rg-media'), { atraso: 360, y: -6, duracao: v.estado }),
      M.subir(rg.querySelectorAll('.rg-baixo .rg-rotulo'), { atraso: 120, y: 0, duracao: v.estado, escada: false }),
    ].flat();
  }

  function entraFesta(raiz, { volta, vista }) {
    const v = M.v();
    const barra = raiz.querySelector('.barra');
    const corpo = [...raiz.children].filter((x) => !x.matches('.topo, .barra'));
    if (volta) {
      // Voltando do envio: o detalhe só reaparece.
      M.subir(corpo, { y: 0, duracao: v.estado, escada: false });
      return;
    }
    // A ficha não espera a régua: os blocos de texto entram em escada logo
    // depois da hora (até uns 400 ms), e a régua se desenha por cima deles,
    // no ritmo do relógio.
    const q = raiz.querySelector('.detalhe-quando');
    if (q) {
      M.subir(q.querySelector(':scope > .rotulo'), { y: 6, duracao: v.estado });
      // Sem a viagem do cartão, a hora sobe de dentro da sua linha.
      if (!vista) M.mascara(q.querySelector('.detalhe-hora .hora'), { atraso: 40 });
      M.subir(q.querySelector('.detalhe-media-curta'), { atraso: 120, y: 6, duracao: v.estado });
      animarRegua(q.querySelector('.regua:not(.regua-idade)'), 80, v.bloco + 2 * v.escala);
      M.subir(q.querySelector('.detalhe-encaixe'), { atraso: 200, y: 8 });
      // A idade logo depois do horário, de cima para baixo.
      const ri = q.querySelector('.regua-idade');
      if (ri) M.aoVer(ri, animarReguaIdade, { atraso: 180 });
      M.aoVer(q.querySelectorAll('.media-origem, .idade-encaixe'), (x) => M.subir(x, { y: 8 }), { atraso: 240 });
      const cara = q.querySelector('.cara');
      if (cara) {
        M.aoVer(cara, (c) => [
          M.subir(c.querySelector('.cara-pct'), { y: 10 }),
          M.subir(c.querySelector('.cara-peso'), { atraso: 60, y: 8 }),
          M.subir(c.querySelectorAll('.cara-linha'), { atraso: 120, y: 8 }),
        ].flat(), { atraso: 300 });
      }
    }
    // O resto da ficha, por ordem, quando chega perto da tela.
    const quem = raiz.querySelector('.detalhe-quem');
    if (quem && vista) {
      // O nome chegou viajando: o resto do bloco dele chega junto.
      M.subir([...quem.querySelectorAll('.cartaz, .ficha-produtora, .ficha-casa, .ficha-frase, .bloco-onde')], { atraso: 220, y: 10 });
    }
    M.aoVer(corpo.filter((x) => x !== q && !(vista && x === quem)), (x) => M.subir(x, { y: 14 }), { atraso: 300 });
    // A barra sobe por baixo.
    if (barra) M.animar(barra, [{ translate: '0 100%' }], { duration: v.bloco, easing: v.saida, delay: 240 });
  }

  function entraMandar(raiz, volta) {
    const v = M.v();
    if (volta) {
      M.subir(raiz, { y: 0, duracao: v.estado });
      return;
    }
    M.subir(raiz.querySelector('.cabeca'), { y: 8, duracao: v.estado });
    M.painel(raiz.querySelector('.painel-convite'), { atraso: 40 });
    // O botão de criar chega com o painel, não depois dele.
    M.subir(raiz.querySelectorAll(':scope > .bloco'), { atraso: 200, y: 10, duracao: v.estado });
  }

  // A barra fixa do detalhe muda de altura com a fonte, a largura e o celular
  // deitado: o vão que o conteúdo deixa para ela (--barra) é a altura medida,
  // e a última linha nunca fica por baixo nem colada nela.
  const raiz = document.documentElement;
  const observador = typeof ResizeObserver === 'function'
    ? new ResizeObserver((itens) => {
      const alto = itens[0] && itens[0].target.getBoundingClientRect().height;
      if (alto) raiz.style.setProperty('--barra', `${Math.ceil(alto)}px`);
    })
    : null;
  function medirBarra() {
    if (!observador) return;
    observador.disconnect();
    const barra = $tela.querySelector('.barra');
    if (barra) observador.observe(barra);
    else raiz.style.removeProperty('--barra');
  }

  // O wordmark leva à landing.
  function topo(direita) {
    return el('header', { class: 'topo' }, marca(LANDING), direita || null);
  }

  // Recomeçar: zera o pedido, a conversa, a lista e a festa aberta, e volta à
  // pergunta 1. Os convites já criados ficam (o mesmo link reabre).
  function botaoRecomecar() {
    const b = acaoC('button', { type: 'button', 'aria-label': 'Recomeçar o pedido do zero' }, 'Recomeçar');
    b.addEventListener('click', recomecar);
    return b;
  }

  // Tocado no meio de uma espera, Recomeçar não é engolido: a espera é que
  // cai. O histórico volta até a pergunta 1 (as perguntas e listas velhas
  // ficam à frente, fora do caminho do voltar), e o voltar dela leva à landing.
  function recomecar() {
    clearTimeout(estado.avancoPendente);
    cancelarEspera();
    Object.assign(estado, {
      respostas: { dia: null, janela: null, bairros: [], idade: null, teto: null, estilos: [] },
      editando: null, criterios: null, resultado: null, fala: null, novas: [], mandar: null, festa: null, rolagemLista: 0,
      tela: 'pergunta', passo: 0,
    });
    const n = nivel();
    if (n > 0) {
      salvar();
      history.go(-n);
      return;
    }
    ir('pergunta', { passo: 0, substituir: true });
  }

  // Na pergunta 1 e no detalhe aberto por link, "Voltar" sai do app: para a
  // landing ou para o convite de onde a pessoa veio. No resto, volta uma tela.
  function voltaParaLanding() {
    return (estado.tela === 'pergunta' && estado.passo === 0 && !estado.editando) || (estado.tela === 'festa' && estado.avulsa);
  }

  // A landing é deste mesmo endereço (em desenvolvimento: ela em /, o app em
  // /app), ou de outro (em produção)? Nos dois casos dá para voltar a ela
  // pela história, mas o jeito de saber que ela está lá muda.
  const caminho = (p) => (p === '/index.html' ? '/' : p);
  const ehLanding = (url) => {
    try {
      const u = new URL(url, window.location.href);
      const l = new URL(LANDING);
      return u.origin === l.origin && caminho(u.pathname) === caminho(l.pathname);
    } catch {
      return false;
    }
  };
  const landingAqui = (() => {
    const l = new URL(LANDING);
    return l.origin === window.location.origin && caminho(l.pathname) !== caminho(window.location.pathname);
  })();
  // Um convite deste endereço (/p/<id>): quem veio dele por "Ver outras
  // festas" volta para ele, não para uma landing que nunca viu.
  const ehConvite = (url) => {
    try {
      const u = new URL(url, window.location.href);
      return u.origin === window.location.origin && /^\/p\/[^/]+\/?$/.test(u.pathname);
    } catch {
      return false;
    }
  };
  // Quem chegou da landing ou de um convite volta pela história: a página
  // reaparece na rolagem em que estava, e o voltar do navegador não cai de
  // novo no app. Ela está k entradas abaixo (a altura n desta tela, mais
  // uma). Sem ela ali (link colado, aba nova), vai pelo link à landing.
  // navigation.entries() só lista as entradas deste endereço: a landing de
  // outro endereço é a entrada logo antes delas, e quem diz que é ela é o
  // referrer (só a página da landing manda a própria origem).
  function voltarParaLanding() {
    const k = nivel() + 1;
    const nav = window.navigation;
    // Referrer vazio resolveria para esta página, que com a meta falhando é a "landing".
    const veioDaLanding = Boolean(document.referrer) && ehLanding(document.referrer);
    let pela = false;
    if (nav && nav.currentEntry && typeof nav.entries === 'function') {
      const entradas = nav.entries();
      const i = nav.currentEntry.index - k;
      if (i >= 0) pela = ehConvite(entradas[i].url) || (landingAqui && ehLanding(entradas[i].url));
      else pela = !landingAqui && i === -1 && veioDaLanding && history.length > entradas.length;
    } else {
      pela = (veioDaLanding || ehConvite(document.referrer)) && history.length > k;
    }
    if (pela) history.go(-k);
    else window.location.assign(LANDING);
  }

  function botaoVoltar() {
    const b = acaoC('button', { type: 'button' }, 'Voltar', { volta: true });
    b.addEventListener('click', () => {
      if (!voltaParaLanding()) history.back();
      else voltarParaLanding();
    });
    return b;
  }

  // Botão esperando a rede: no mesmo quadro do toque ganha .carregando e
  // aria-busy (e, se pedido, o texto muda), sem ícone girando. Não usa
  // disabled, para o foco não cair no body; a trava é estado.ocupado.
  function esperar(botao, texto) {
    if (!botao) return () => {};
    const antes = botao.textContent;
    if (texto) botao.textContent = texto;
    botao.classList.add('carregando');
    botao.setAttribute('aria-busy', 'true');
    botao.setAttribute('aria-disabled', 'true');
    return () => {
      if (texto) botao.textContent = antes;
      botao.classList.remove('carregando');
      botao.removeAttribute('aria-busy');
      botao.removeAttribute('aria-disabled');
    };
  }

  // ------------------------------------------------------------ esperando

  // O formulário ainda não chegou: uma linha de rótulo, e o resto espera.
  function telaCarregando() {
    return el('div', { class: 'tela-pergunta tela-carregando' },
      topo(null),
      el('p', { class: 'carregando', id: 'proxima', role: 'status', texto: 'Abrindo a pista…' }),
      rodape());
  }

  // ------------------------------------------------------------ formulário

  const valorDe = (chave) => estado.respostas[chave];

  function respondida(p) {
    const v = valorDe(p.chave);
    return p.tipo !== 'um' ? true : v !== null && v !== undefined;
  }

  function avancar(botao) {
    const p = PERGUNTAS[estado.passo];
    if (!respondida(p)) return;
    if (estado.editando) {
      reabrirResultado(p.chave, botao);
      return;
    }
    if (estado.passo < PERGUNTAS.length - 1) ir('pergunta', { passo: estado.passo + 1 });
    else buscarFestas(criteriosDoFormulario(), { botao });
  }

  function telaPergunta() {
    const i = estado.passo;
    const p = PERGUNTAS[i];
    const opcoes = estado.form[p.lista];
    const idTitulo = `pergunta-${p.chave}`;
    const editando = estado.editando === p.chave;

    const h1 = titulo('h1', 'titulo titulo--pergunta', p.titulo[0], p.titulo[1]);
    h1.id = idTitulo;

    // Nas de escolha única, o toque já avança: o botão só aparece quando a
    // pergunta já tinha resposta (ao voltar) ou pelo teclado. No toque, não pisca.
    const continuar = el('button', { type: 'submit', class: 'botao botao--largo continuar' });
    if (p.tipo === 'um' && !respondida(p)) continuar.setAttribute('data-oculto', '');

    function atualizarBotao() {
      if (p.tipo === 'varios') {
        continuar.textContent = valorDe('estilos').length ? 'Ver festas' : 'Ver festas de qualquer som';
      } else {
        continuar.textContent = editando ? 'Ver festas' : 'Continuar';
        continuar.disabled = !respondida(p);
      }
    }

    let porToque = false;
    const lista = p.tipo === 'bairros' ? perguntaBairros(idTitulo, p)
      : p.tipo === 'idade' ? perguntaIdade(idTitulo, p)
        : el('div', {
      class: 'opcoes',
      role: p.tipo === 'um' ? 'radiogroup' : 'group',
      'aria-labelledby': idTitulo,
      'aria-describedby': p.dica ? `${idTitulo}-dica` : null,
    }, opcoes.map((o) => {
      const marcado = p.tipo === 'um' ? String(valorDe(p.chave)) === String(o.id) : valorDe(p.chave).includes(o.id);
      const input = el('input', { type: p.tipo === 'um' ? 'radio' : 'checkbox', name: p.chave, value: String(o.id), checked: marcado });
      // O clique chega antes do change: é ele que diz se foi toque ou teclado.
      input.addEventListener('click', (e) => {
        porToque = e.detail !== 0;
        if (p.tipo !== 'um' || !porToque) return;
        clearTimeout(estado.avancoPendente);
        const de = estado.passo;
        estado.avancoPendente = setTimeout(() => {
          if (estado.tela === 'pergunta' && estado.passo === de) avancar();
        }, reduzir.matches ? 0 : AVANCO_MS);
      });
      input.addEventListener('change', () => {
        if (p.tipo === 'um') {
          estado.respostas[p.chave] = o.id;
          if (!porToque) continuar.removeAttribute('data-oculto');
        } else {
          const atual = new Set(valorDe('estilos'));
          if (input.checked) atual.add(o.id);
          else atual.delete(o.id);
          estado.respostas.estilos = opcoes.map((x) => x.id).filter((id) => atual.has(id));
        }
        porToque = false;
        atualizarBotao();
        salvar();
      });
      const [principal, detalhe] = String(o.rotulo).split(' · ');
      return el('label', { class: `opcao opcao--${p.tipo}` },
        input,
        el('span', { class: 'marcador', 'aria-hidden': 'true' }),
        el('span', { class: 'opcao-nome', texto: principal }),
        detalhe ? el('span', { class: 'opcao-detalhe' }, el('span', { class: 'vh', texto: ', ' }), detalhe) : el('span'));
    }));

    // O rodapé de todas as telas (a nota do protótipo e o tema) logo abaixo
    // do botão: a pergunta 1 é a primeira tela de quem abre o app direto.
    const fim = rodape();
    fim.classList.add('rodape--junto');

    const form = el('form', { class: 'tela-pergunta', novalidate: true },
      topo(botaoVoltar()),
      editando ? null : el('div', { class: 'progresso', 'aria-hidden': 'true' },
        PERGUNTAS.map((_, j) => el('span', { class: j < i ? 'feito' : j === i ? 'atual' : null }, el('span', { class: 'progresso-fio' })))),
      el('div', { class: 'espaco' }),
      el('div', { class: 'cabeca-pergunta' },
        el('p', { class: 'rotulo', texto: editando ? 'Ajustar o pedido' : `${i + 1} de ${PERGUNTAS.length}` }),
        h1,
        p.dica ? el('p', { class: 'dica', id: `${idTitulo}-dica`, texto: p.dica }) : null),
      lista,
      el('div', { class: 'pe' }, continuar, el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' })),
      fim);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(estado.avancoPendente);
      avancar(continuar);
    });
    atualizarBotao();
    return form;
  }

  // A faixa que vale: a respondida, ou o padrão do formulário (28 a 35).
  function idadeDe(r) {
    if (r.idade && Number.isInteger(r.idade.min) && Number.isInteger(r.idade.max)) return r.idade;
    const padrao = estado.form && estado.form.idade ? estado.form.idade.padrao : { min: 28, max: 35 };
    return { ...padrao };
  }

  // Onde (R19): bairros em chips por zona, que se somam; "São Paulo inteira"
  // começa marcado e é exclusivo: marcá-lo limpa os outros, e marcar um
  // bairro o desmarca. Botões com aria-pressed, alvo de 44 px.
  function perguntaBairros(idTitulo, p) {
    const marcados = new Set(estado.respostas.bairros || []);
    const chip = (texto, valor) => el('button', { type: 'button', class: 'chip', 'data-bairro': valor, 'aria-pressed': 'false', texto });
    const todos = chip('São Paulo inteira', '');
    const zonas = (estado.form.zonas || []).map((z) => el('div', { class: 'zona', role: 'group', 'aria-label': z.nome },
      el('p', { class: 'rotulo zona-nome', 'aria-hidden': 'true', texto: z.nome }),
      el('div', { class: 'chips' }, z.bairros.map((b) => chip(b.rotulo, b.id)))));
    const raiz = el('div', { class: 'onde-chips', role: 'group', 'aria-labelledby': idTitulo, 'aria-describedby': p.dica ? `${idTitulo}-dica` : null },
      el('div', { class: 'chips chips--todos' }, todos), zonas);
    const pintar = () => {
      for (const b of raiz.querySelectorAll('.chip')) {
        const v = b.dataset.bairro;
        b.setAttribute('aria-pressed', String(v ? marcados.has(v) : marcados.size === 0));
      }
    };
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const v = b.dataset.bairro;
      if (!v) marcados.clear();
      else if (marcados.has(v)) marcados.delete(v);
      else marcados.add(v);
      const ordem = (estado.form.zonas || []).flatMap((z) => z.bairros.map((x) => x.id));
      estado.respostas.bairros = ordem.filter((id) => marcados.has(id));
      pintar();
      salvar();
    });
    pintar();
    return raiz;
  }

  // A faixa de idade (R20, R22): dois pontos num trilho de 18 a 50, no padrão
  // de vários pontos do W3C. Cada ponto é um slider próprio, com o valor dito
  // em anos; setas, Page Up/Down, Home e End; arrasto por toque ou mouse; e
  // botões de passo para quem não arrasta.
  function perguntaIdade(idTitulo, p) {
    const LIM = estado.form.idade || { min: 18, max: 50 };
    const v = { ...idadeDe(estado.respostas) };
    const anos = (n) => (n >= LIM.max ? `${n} anos ou mais` : `${n} anos`);
    const valor = el('p', { class: 'faixa-valor', 'aria-hidden': 'true' });
    const sel = el('span', { class: 'faixa-sel' });
    const ponto = (qual) => el('div', {
      class: `faixa-ponto faixa-ponto--${qual}`, role: 'slider', tabindex: '0',
      'aria-label': qual === 'min' ? 'Idade mínima' : 'Idade máxima', 'aria-orientation': 'horizontal',
      'data-qual': qual,
    }, el('span', { class: 'faixa-ponto-marca' }));
    const pMin = ponto('min');
    const pMax = ponto('max');
    const trilho = el('div', { class: 'faixa-trilho' }, el('span', { class: 'faixa-base' }), sel, pMin, pMax);
    const passo = (qual, delta, rotulo) => {
      const b = el('button', { type: 'button', class: 'faixa-passo', 'aria-label': rotulo, texto: delta < 0 ? '−' : '+' });
      b.dataset.qual = qual;
      b.dataset.delta = String(delta);
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') === 'true') return;
        mudar(qual, v[qual] + delta);
        // Quem usa só os botões ouve o valor novo.
        anunciar(`${qual === 'min' ? 'mínimo' : 'máximo'}, ${anos(v[qual])}`);
      });
      return b;
    };
    const numMin = el('span', { class: 'faixa-num', 'aria-hidden': 'true' });
    const numMax = el('span', { class: 'faixa-num', 'aria-hidden': 'true' });
    const passos = el('div', { class: 'faixa-passos' },
      el('div', { class: 'faixa-passo-grupo' }, el('span', { class: 'rotulo', 'aria-hidden': 'true', texto: 'Mínimo' }),
        el('div', { class: 'faixa-passo-linha' }, passo('min', -1, 'Diminuir a idade mínima'), numMin, passo('min', +1, 'Aumentar a idade mínima'))),
      el('div', { class: 'faixa-passo-grupo' }, el('span', { class: 'rotulo', 'aria-hidden': 'true', texto: 'Máximo' }),
        el('div', { class: 'faixa-passo-linha' }, passo('max', -1, 'Diminuir a idade máxima'), numMax, passo('max', +1, 'Aumentar a idade máxima'))));
    const pos = (n) => `${((n - LIM.min) / (LIM.max - LIM.min)) * 100}%`;
    const p100 = (n) => String(((n - LIM.min) / (LIM.max - LIM.min)) * 100);
    // Os pontos andam por translate em % do trilho (cqw, no CSS): mexer em
    // left refaria o layout a cada passo do dedo. Sem cqw, left.
    const cq = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('width', '1cqw');
    function pintar() {
      valor.textContent = `${v.min} a ${anos(v.max)}`;
      pMin.style.setProperty('--p', p100(v.min));
      pMax.style.setProperty('--p', p100(v.max));
      sel.style.setProperty('--a', p100(v.min));
      sel.style.setProperty('--b', p100(v.max));
      if (!cq) {
        pMin.style.left = pos(v.min);
        pMax.style.left = pos(v.max);
        sel.style.left = pos(v.min);
        sel.style.width = `calc(${pos(v.max)} - ${pos(v.min)})`;
      }
      for (const [el2, qual, de, ate] of [[pMin, 'min', LIM.min, v.max - 1], [pMax, 'max', v.min + 1, LIM.max]]) {
        el2.setAttribute('aria-valuemin', String(de));
      (qual === 'min' ? numMin : numMax).textContent = qual === 'max' && v.max >= LIM.max ? `${LIM.max}+` : String(v[qual]);
        el2.setAttribute('aria-valuemax', String(ate));
        el2.setAttribute('aria-valuenow', String(v[qual]));
        el2.setAttribute('aria-valuetext', `${qual === 'min' ? 'mínimo' : 'máximo'}, ${anos(v[qual])}`);
      }
      // Botão de passo no limite fica desligado, e diz isso.
      for (const b of passos.querySelectorAll('.faixa-passo')) {
        const q = b.dataset.qual;
        const d = Number(b.dataset.delta);
        const limite = q === 'min' ? (d < 0 ? v.min <= LIM.min : v.min >= v.max - 1) : (d < 0 ? v.max <= v.min + 1 : v.max >= LIM.max);
        b.setAttribute('aria-disabled', String(limite));
      }
    }
    function mudar(qual, n) {
      const novo = qual === 'min' ? Math.max(LIM.min, Math.min(v.max - 1, n)) : Math.min(LIM.max, Math.max(v.min + 1, n));
      if (novo === v[qual]) return;
      v[qual] = novo;
      estado.respostas.idade = { ...v };
      pintar();
      salvar();
    }
    for (const pt of [pMin, pMax]) {
      pt.addEventListener('keydown', (e) => {
        const qual = pt.dataset.qual;
        const passos2 = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
        if (e.key in passos2) mudar(qual, v[qual] + passos2[e.key]);
        else if (e.key === 'Home') mudar(qual, qual === 'min' ? LIM.min : v.min + 1);
        else if (e.key === 'End') mudar(qual, qual === 'min' ? v.max - 1 : LIM.max);
        else return;
        e.preventDefault();
      });
    }
    // Arrasto: só depois que o dedo anda na horizontal; gesto vertical rola a
    // página. Toque sem arrasto leva o ponto mais perto até ali. Pontos
    // encostados (49–50) decidem pelo lado para onde o dedo vai. Botão direito
    // e segundo dedo não contam.
    let gesto = null;
    const idadeNo = (x) => {
      const r = trilho.getBoundingClientRect();
      return Math.round(LIM.min + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (LIM.max - LIM.min));
    };
    const maisPerto = (n, dx = 0) => {
      if (v.max - v.min <= 2 && dx) return dx < 0 ? 'min' : 'max';
      const dMin = Math.abs(n - v.min);
      const dMax = Math.abs(n - v.max);
      if (dMin === dMax) return n < v.min ? 'min' : 'max';
      return dMin < dMax ? 'min' : 'max';
    };
    trilho.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || gesto) return;
      const alvo = e.target.closest('.faixa-ponto');
      gesto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, alvo: alvo ? alvo.dataset.qual : null, qual: null };
      if (e.pointerType === 'mouse') e.preventDefault();
    });
    trilho.addEventListener('pointermove', (e) => {
      if (!gesto || e.pointerId !== gesto.id) return;
      const dx = e.clientX - gesto.x0;
      const dy = e.clientY - gesto.y0;
      if (!gesto.qual) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          gesto = null;
          return;
        }
        gesto.qual = gesto.alvo && v.max - v.min > 2 ? gesto.alvo : maisPerto(idadeNo(gesto.x0), dx);
        try { trilho.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
        (gesto.qual === 'min' ? pMin : pMax).focus({ preventScroll: true });
        trilho.classList.add('arrastando');
      }
      mudar(gesto.qual, idadeNo(e.clientX));
    });
    trilho.addEventListener('pointerup', (e) => {
      if (!gesto || e.pointerId !== gesto.id) return;
      if (!gesto.qual) {
        const n = idadeNo(e.clientX);
        const qual = maisPerto(n);
        (qual === 'min' ? pMin : pMax).focus({ preventScroll: true });
        mudar(qual, n);
      }
      gesto = null;
      trilho.classList.remove('arrastando');
    });
    trilho.addEventListener('pointercancel', () => {
      gesto = null;
      trilho.classList.remove('arrastando');
    });
    estado.respostas.idade = { ...v };
    pintar();
    return el('div', { class: 'faixa', role: 'group', 'aria-labelledby': idTitulo, 'aria-describedby': p.dica ? `${idTitulo}-dica` : null },
      valor, trilho,
      el('div', { class: 'faixa-escala', 'aria-hidden': 'true' }, el('span', { texto: String(LIM.min) }), el('span', { texto: `${LIM.max}+` })),
      passos);
  }

  // ------------------------------------------------------------ resultado

  function criteriosDoFormulario() {
    const r = estado.respostas;
    return { dia: r.dia, janela: r.janela, idade: { ...idadeDe(r) }, bairros: [...(r.bairros || [])], teto: r.teto, estilos: r.estilos };
  }

  // Um trecho do pedido reabre só aquela pergunta.
  function abrirParaEditar(chave) {
    const c = estado.criterios;
    estado.respostas = {
      dia: c.dia, janela: c.janela, teto: c.teto, estilos: [...c.estilos],
      bairros: [...(c.bairros || [])], idade: c.idade ? { ...c.idade } : null,
    };
    // Convite e sessões antigos falam em "faixa": reabre a pergunta da idade.
    if (chave === 'faixa') chave = 'idade';
    estado.editando = chave;
    ir('pergunta', { passo: PERGUNTAS.findIndex((p) => p.chave === chave), deLista: true });
  }

  // Depois de mudar uma pergunta: o resto do que foi conversado continua valendo.
  function reabrirResultado(chave, botao) {
    const dim = { janela: 'horario', teto: 'preco', idade: 'idade' }[chave];
    const c = { ...estado.criterios, ...criteriosDoFormulario(), evitar: [] };
    // A faixa da conversa sai do intervalo novo.
    delete c.faixa;
    c.firmes = (c.firmes || []).filter((d) => d !== dim);
    delete c.oferta;
    estado.editando = null;
    buscarFestas(c, { substituir: true, botao });
  }

  function mostrarErro(texto) {
    const $erro = document.getElementById('erro');
    if ($erro) $erro.textContent = texto;
  }

  async function buscarFestas(criterios, { substituir = false, botao } = {}) {
    if (estado.ocupado) return;
    // Faltou alguma resposta (voltou depois de recarregar, por exemplo): volta pra ela.
    const falta = primeiraSemResposta();
    const vazio = (k) => criterios[k] === null || criterios[k] === undefined;
    if (!estado.editando && falta >= 0 && (['dia', 'janela', 'teto'].some(vazio) || (vazio('faixa') && vazio('idade')))) {
      ir('pergunta', { passo: falta });
      return;
    }
    estado.ocupado = true;
    const minha = geracao;
    // A pergunta reaberta a partir da lista volta para a entrada da lista,
    // em vez de empilhar uma lista igual por cima da velha.
    const daLista = substituir && history.state && history.state.deLista;
    mostrarErro('');
    const soltar = esperar(botao, 'Buscando…');
    let r;
    try {
      r = await chamar('/api/festas', { criterios });
    } catch {
      r = null;
    }
    // A pessoa voltou ou recomeçou enquanto esperava: a resposta não vale.
    if (minha !== geracao) return;
    estado.ocupado = false;
    if (!r || !r.ok || !r.dados) {
      soltar();
      if (r && r.dados && r.dados.faltam) {
        ir('pergunta', { passo: Math.max(0, primeiraSemResposta()) });
        return;
      }
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toque de novo.');
      return;
    }
    estado.criterios = r.dados.criterios;
    estado.resultado = r.dados;
    estado.fala = { voce: null, finde: r.dados.resposta };
    estado.novas = [];
    if (daLista) {
      estado.tela = 'resultado';
      estado.rolagemLista = 0;
      salvar();
      history.back();
      return;
    }
    ir('resultado', { substituir });
  }

  function tituloResultado() {
    const r = estado.resultado;
    const d = DIA[estado.criterios.dia];
    if (!r.opcoes.length) return titulo('h1', 'titulo titulo--resultado', `Nada ${d.seu}`, `${d.nome}`, ', ainda.');
    // Conta só as que cabem no pedido: vizinhas e fora da faixa vêm rotuladas.
    const n = typeof r.noPedido === 'number' ? r.noPedido : typeof r.atendem === 'number' ? r.atendem : r.opcoes.length;
    if (!n) return titulo('h1', 'titulo titulo--resultado', 'Nada do jeito que você ', 'pediu.');
    return titulo('h1', 'titulo titulo--resultado', `${NUMERAL[n]} ${d.seu}`, `${d.nome}.`);
  }

  function frasePedido(partes) {
    const p = el('p', { class: 'pedido' });
    // A vírgula fica presa ao trecho, para nunca abrir uma linha.
    partes.forEach((parte, i) => {
      if (i) p.append(' ');
      const fim = i === partes.length - 1 ? '.' : ',';
      if (parte.chave) {
        const b = el('button', { type: 'button', class: 'link', texto: parte.texto });
        b.setAttribute('aria-label', `Mudar: ${parte.texto}`);
        b.addEventListener('click', () => abrirParaEditar(parte.chave));
        p.append(el('span', { class: 'parte' }, b, fim));
      } else {
        p.append(el('span', { class: 'parte' }, parte.texto, fim));
      }
    });
    return p;
  }

  // Posição no eixo comum das 17h às 3h (17 a 27), em porcentagem.
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  const noEixo = (h) => ((Math.max(EIXO.de, Math.min(EIXO.ate, h)) - EIXO.de) / (EIXO.ate - EIXO.de)) * 100;
  const pct = (x) => `${Math.round(x * 100) / 100}%`;
  const rotuloHora = (h) => {
    const total = Math.round(h * 60) % (24 * 60);
    const m = total % 60;
    return `${Math.floor(total / 60)}h${m ? String(m).padStart(2, '0') : ''}`;
  };

  // A janela pedida: da API (inicioMin, fimMax); sem ela, da tabela das janelas.
  function janelaPedida() {
    if (estado.avulsa) return null;
    const c = estado.criterios || {};
    if (num(c.inicioMin) && num(c.fimMax)) return [c.inicioMin, c.fimMax];
    return JANELA[c.janela] || null;
  }

  // A régua do detalhe (R4): o eixo das 15h às 3h, a festa num traço firme,
  // a pista cheia num quadrado e a janela pedida num colchete rosé por baixo.
  // Os rótulos ficam presos ao que marcam: o começo e o fim em cima, a pista
  // cheia embaixo. Festa que passa das 3h vai até a borda e diz a hora real.
  // É desenho: a frase do horário vai junto para o leitor de tela.
  function regua(f) {
    if (!num(f.inicio) || !num(f.fim)) return null;
    const faixa = (classe, de, ate) => el('span', { class: classe, 'data-l': pct(noEixo(de)), 'data-w': pct(Math.max(0, noEixo(ate) - noEixo(de))) });
    const rotulo = (classe, h, texto, lado) => el('span', { class: `${classe} rg-${lado}`, 'data-l': pct(noEixo(h)), texto });
    const j = janelaPedida();
    const xFim = noEixo(Math.min(f.fim, EIXO.ate));
    const xPico = num(f.esquenta) ? noEixo(f.esquenta) : null;
    // Em cima, a festa: quando enche e até quando vai. Perto demais um do
    // outro (menos de uns 56 px), viram um rótulo só, no fim.
    const juntos = xPico === null || xFim - xPico < 32;
    const cima = juntos
      ? [rotulo('rg-rotulo', Math.min(f.fim, EIXO.ate), `${xPico === null ? '' : `enche ${rotuloHora(f.esquenta)} · `}até ${rotuloHora(f.fim)}`, 'dir')]
      : [rotulo('rg-rotulo', f.esquenta, `enche ${rotuloHora(f.esquenta)}`, xPico < 12 ? 'esq' : 'meio'),
        rotulo('rg-rotulo', Math.min(f.fim, EIXO.ate), `até ${rotuloHora(f.fim)}`, 'dir')];
    // Embaixo, você: a janela pedida, com as pontas.
    const baixo = j ? [rotulo('rg-rotulo rg-rotulo--voce', j[0], rotuloHora(j[0]), noEixo(j[0]) > 90 ? 'dir' : 'esq'),
      rotulo('rg-rotulo rg-rotulo--voce', Math.min(j[1], EIXO.ate), rotuloHora(j[1]), 'dir')] : [];
    return el('figure', { class: 'regua', 'aria-hidden': 'true' },
      el('div', { class: 'rg-cima' }, cima),
      el('div', { class: 'rg-trilho' },
        j ? faixa('rg-janela', j[0], j[1]) : null,
        faixa('rg-festa', f.inicio, Math.min(f.fim, EIXO.ate)),
        num(f.esquenta) ? el('span', { class: 'rg-pico', 'data-l': pct(noEixo(f.esquenta)) }) : null),
      j ? el('div', { class: 'rg-baixo' }, baixo) : null);
  }

  // Posição pelo CSSOM (a CSP não deixa atributo style).
  function posicionar(raiz) {
    for (const s of raiz.querySelectorAll('[data-l]')) {
      s.style.left = s.dataset.l;
      if (s.dataset.w) s.style.width = s.dataset.w;
    }
  }

  // "% a sua cara" (contrato da frente CARA): opcao.cara = { pct, partes }.
  // Sem cara (detalhe aberto por link, ou API antiga), não aparece nada.
  function caraDe(o) {
    const c = o && o.cara;
    return c && Number.isInteger(c.pct) && c.pct >= 0 && c.pct <= 100 ? c : null;
  }

  // Uma entrada da programação, como a lista da landing no celular: a hora em
  // serifa à esquerda (e quando enche); ao lado o nome, a casa com o preço, a
  // média com a origem na mesma linha, "% a sua cara" (quando ela varia na
  // lista) e o aviso quando fura o pedido. A coluna do app nunca passa de
  // 432 px de texto, e uma terceira coluna só para a média espremia o cartão.
  // O item inteiro abre o detalhe: o nome é o botão, e a área de toque dele
  // cobre o item. Não há envio daqui (R3).
  function entrada(o, i, primeiroBloco, comPct) {
    const f = o.festa;
    const primeiro = i === 0 && primeiroBloco;
    const nova = estado.novas.includes(f.id);
    const cara = caraDe(o);
    const pctVisivel = Boolean(comPct && cara);
    const abrir = el('button', { type: 'button', class: 'festa-abrir', texto: f.nome, 'aria-describedby': `linha-${f.id}` });
    abrir.addEventListener('click', () => abrirFesta(o));
    const aviso = typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso.trim() : '';
    // Sem a % (API antiga), o porquê continua dizendo o que distingue a festa.
    const dito = aviso.toLocaleLowerCase('pt-BR');
    const motivos = cara ? [] : (o.motivos || []).filter((m) => !dito || !dito.includes(String(m).toLocaleLowerCase('pt-BR')));
    const temMedia = Number.isInteger(f.mediaIdade);
    const origem = f.origemIdadeCurta || (o.origem && o.origem.curta) || '';
    // A média uma vez só, com a origem: a linha da API já trazia "média N anos".
    const lido = FT.cartaoFalado(o, { pct: pctVisivel ? cara.pct : null, nova });
    return el('li', { class: `festa${nova ? ' nova' : ''}`, 'data-festa': f.id },
      el('div', { class: 'festa-quando', 'aria-hidden': 'true' },
        hora(o.hora),
        num(f.esquenta) ? el('span', { class: 'enche', texto: `enche ${rotuloHora(f.esquenta)}` }) : null,
        o.patrocinada ? el('span', { class: 'marca-lateral', texto: 'Patrocinado' })
          : nova ? el('span', { class: 'marca-lateral nova-marca', texto: 'Nova' }) : null),
      el('div', { class: 'festa-o-que' },
        el('p', { class: 'vh', id: `linha-${f.id}`, texto: lido }),
        el('h2', { class: 'nome' }, abrir),
        // Casa e preço com um "·" entre eles que some quando o preço desce de
        // linha: nem ponto pendurado no fim, nem ponto abrindo a linha de baixo.
        el('p', { class: 'onde', 'aria-hidden': 'true' },
          el('span', { class: 'onde-linha' },
            el('span', { class: 'onde-casa', texto: FT.casaComBairro(f.casa, o.bairro) }),
            el('span', { class: 'onde-preco', texto: FT.precoNaLista(f).replace(/R\$ /g, 'R$ ') }))),
        // "31 MÉDIA pela produtora": o número nunca sem a origem.
        el('p', { class: 'festa-media', 'aria-hidden': 'true' },
          el('span', { class: 'media-num', texto: temMedia ? String(f.mediaIdade) : '—' }),
          el('span', { class: 'media-rotulo', texto: temMedia ? 'média' : 'sem média' }),
          temMedia && origem ? el('span', { class: 'idade-origem', texto: origem }) : null),
        pctVisivel ? el('p', { class: 'cara-pct', 'aria-hidden': 'true', texto: `${cara.pct}% a sua cara` }) : null,
        motivos.length ? el('p', { class: 'porque' },
          el('span', { class: 'vh', texto: 'Por que esta: ' }),
          // O "·" vai preso ao motivo seguinte, nunca pendurado no fim da linha.
          motivos.flatMap((m, k) => [k ? ' ' : null, el('span', { class: 'item', texto: `${k ? '· ' : ''}${semQuebraNoPreco(m)}` })])) : null),
      aviso ? el('p', { class: 'festa-aviso', texto: semQuebraNoPreco(aviso) }) : null,
      // O sinal visível de que o item abre: só no primeiro da lista.
      primeiro ? el('span', { class: 'ver', 'aria-hidden': 'true' }, el('span', { texto: 'Ver a festa' }), seta()) : null);
  }

  // Os blocos da lista (R19, R21): primeiro o que cabe; depois, cada um com o
  // seu rótulo, os bairros vizinhos e as festas com a média fora da faixa.
  function blocosDaLista(opcoes) {
    const NOME_BLOCO = { perto: 'Perto das suas regiões', faixa: 'Fora da sua faixa', ...((estado.resultado && estado.resultado.blocos) || {}) };
    const grupos = [];
    for (const o of opcoes) {
      const b = o.bloco || 'pedido';
      if (!grupos.length || grupos[grupos.length - 1].bloco !== b) grupos.push({ bloco: b, itens: [] });
      grupos[grupos.length - 1].itens.push(o);
    }
    // A % entra nos cartões só quando varia na lista (FT.pctNosCartoes).
    const comPct = FT.pctNosCartoes(opcoes);
    return grupos.map((g, gi) => {
      const id = `bloco-${g.bloco}`;
      const nome = NOME_BLOCO[g.bloco];
      return el('section', { class: `bloco-lista bloco-lista--${g.bloco}`, 'aria-labelledby': nome ? id : null },
        nome ? el('h2', { class: 'rotulo bloco-rotulo', id, texto: nome }) : null,
        el('ol', { class: 'festas', 'aria-label': nome ? null : 'Festas, em ordem de horário. Toque numa para ver o detalhe.' }, g.itens.map((o, i) => entrada(o, i, gi === 0, comPct))));
    });
  }

  // "às 19h", "à 1h", "à meia-noite".
  const asHoras = (h) => {
    const t = Math.round(h * 60) % (24 * 60);
    if (t === 0) return 'à meia-noite';
    return `${t < 120 ? 'à' : 'às'} ${rotuloHora(h)}`;
  };

  // "R$ 150" nunca quebra entre o símbolo e o número.
  const semQuebraNoPreco = (t) => String(t).replace(/R\$ (?=\d)/g, 'R$\u00a0');

  function abrirFesta(o) {
    estado.festa = o;
    ir('festa');
  }

  function atalhos() {
    const c = estado.criterios;
    const r = estado.resultado;
    const lista = [];
    const ruim = !r.opcoes.length || r.atendem === 0;
    const outroDia = c.dia === 'sab' ? ['domingo', 'e no domingo?'] : ['sábado', 'e no sábado?'];
    if (ruim) {
      lista.push(outroDia);
      lista.push(c.janela === 'noite' ? ['mais cedo', 'mais cedo'] : ['mais tarde', 'mais tarde']);
      if (c.teto !== 'sem-limite') lista.push(['sem teto de preço', 'sem limite']);
      if (c.estilos.length) lista.push(['qualquer som', 'qualquer som']);
    } else {
      if (c.teto !== 0) lista.push(['mais barato', 'mais barato']);
      lista.push(c.janela === 'fim-de-tarde' ? ['mais tarde', 'mais tarde'] : ['mais cedo', 'mais cedo']);
      // "sem funk" não é oferecido a quem pediu funk.
      if (!c.estilos.includes('funk') && !c.evitarEstilos.includes('funk')) lista.push(['sem funk', 'sem funk']);
      lista.push(['outro estilo', 'outro estilo']);
      lista.push(outroDia);
      // Quem já marcou bairros não precisa do "mais perto de".
      if (!c.bairros || !c.bairros.length) lista.push(c.perto !== 'pinheiros' ? ['mais perto de Pinheiros', 'tem alguma mais perto de Pinheiros?'] : ['mais perto do Centro', 'tem alguma mais perto do Centro?']);
    }
    // Os atalhos são respostas prontas, não ações secundárias: têm o desenho
    // dos bairros da pergunta 3 (texto com sublinhado fino), não o C.
    return lista.map(([rotulo, frase]) => {
      const b = el('button', { type: 'button', class: 'atalho', texto: rotulo });
      b.addEventListener('click', () => ajustar(frase, { exibido: rotulo, origem: b }));
      return b;
    });
  }

  function telaResultado() {
    const r = estado.resultado;
    const oferta = r.oferta ? el('button', { type: 'button', class: 'botao botao--vazado oferta', texto: r.oferta.rotulo }) : null;
    if (oferta) oferta.addEventListener('click', () => ajustar(r.oferta.frase, { exibido: r.oferta.rotulo, origem: oferta }));

    const conversa = el('div', { class: 'conversa', id: 'conversa' },
      estado.fala.voce ? el('p', { class: 'fala-voce' }, el('span', { class: 'vh', texto: 'Você: ' }), estado.fala.voce) : null,
      estado.fala.finde ? el('p', { class: 'fala-finde' }, el('span', { class: 'vh', texto: 'Finde: ' }), semQuebraNoPreco(estado.fala.finde)) : null,
      oferta);

    const lista = el('div', { class: 'lista', id: 'lista-festas' }, r.opcoes.length
      ? blocosDaLista(r.opcoes)
      : null);

    const campo = el('input', {
      id: 'campo', class: 'campo', type: 'text', name: 'texto', maxlength: '300', autocomplete: 'off',
      enterkeyhint: 'send', placeholder: 'perto da Paulista, até 23h', autocapitalize: 'sentences',
    });
    const enviar = el('button', { type: 'submit', class: 'botao', texto: 'Ajustar' });
    const local = el('p', { class: 'resposta-local', id: 'resposta-local', role: 'status' });
    const form = el('form', { class: 'ajuste-form', id: 'ajuste-form' },
      el('label', { class: 'vh', for: 'campo', texto: 'Ajuste em uma frase' }), campo, enviar);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = campo.value.trim();
      if (!texto) {
        local.textContent = 'Escreva o que quer mudar. Por exemplo: mais cedo.';
        campo.focus();
        return;
      }
      ajustar(texto, { origem: enviar, digitado: true });
    });

    const h2 = titulo('h2', 'titulo titulo--secao', 'Ajuste em uma ', 'frase.');
    h2.id = 'ajuste-titulo';
    h2.removeAttribute('tabindex');

    return el('div', { class: 'tela-resultado', id: 'tela-resultado' },
      topo(botaoRecomecar()),
      el('section', { class: 'cabeca', id: 'cabeca-resultado' },
        frasePedido(r.pedidoPartes || []),
        tituloResultado(),
        conversa),
      lista,
      el('section', { class: 'ajuste', 'aria-labelledby': 'ajuste-titulo' },
        h2,
        el('div', { class: 'atalhos', id: 'atalhos', role: 'group', 'aria-label': 'Atalhos de ajuste' }, atalhos()),
        local,
        form,
        el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' })),
      rodape());
  }

  // Depois de um ajuste, só muda o que mudou: o pedido, o título e a conversa,
  // a lista e os atalhos. O campo, a resposta local e o aviso de erro (as
  // regiões vivas) ficam os mesmos nós, e o foco não cai no body.
  function trocarResultado() {
    const $atual = document.getElementById('tela-resultado');
    if (!$atual) {
      desenhar({ focar: false, entrar: false });
      return;
    }
    // Depois de um ajuste, nada pisca: só as festas novas entram.
    $atual.classList.remove('entra');
    const ativo = document.activeElement;
    const rotuloAtivo = ativo && ativo.closest && ativo.closest('#atalhos, #conversa') ? ativo.textContent : null;
    const novo = telaResultado();
    for (const id of ['cabeca-resultado', 'lista-festas', 'atalhos']) {
      const velho = $atual.querySelector(`#${id}`);
      const peca = novo.querySelector(`#${id}`);
      if (velho && peca) velho.replaceWith(peca);
    }
    posicionar($atual);
    salvar();
    if (ativo && ativo !== document.body && document.contains(ativo)) return;
    // O botão tocado foi refeito: o foco vai para o mesmo atalho, se ele
    // continua, ou para o título do resultado.
    const igual = rotuloAtivo && [...$atual.querySelectorAll('#atalhos button, #conversa button')].find((x) => x.textContent === rotuloAtivo);
    const alvo = igual || $atual.querySelector('#cabeca-resultado h1');
    if (alvo) alvo.focus({ preventScroll: true });
  }

  async function ajustar(texto, { exibido, origem, digitado = false } = {}) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    // Retorno no mesmo quadro: o botão tocado fica .carregando, a fala da
    // pessoa aparece, a do Finde diz que está procurando, e a lista esmaece.
    const soltar = esperar(origem);
    const $tela = document.getElementById('tela-resultado');
    const $conversa = document.getElementById('conversa');
    const $local = document.getElementById('resposta-local');
    if ($tela) $tela.setAttribute('aria-busy', 'true');
    if ($conversa) {
      $conversa.setAttribute('aria-busy', 'true');
      const oferta = $conversa.querySelector('.oferta');
      // A oferta tocada fica no lugar, carregando, até a resposta.
      const filhos = [
        el('p', { class: 'fala-voce' }, el('span', { class: 'vh', texto: 'Você: ' }), exibido || texto),
        el('p', { class: 'fala-finde', texto: 'Procurando…' }),
      ];
      if (oferta && oferta === origem) filhos.push(oferta);
      $conversa.replaceChildren(...filhos);
    }
    if ($local) $local.textContent = '';
    mostrarErro('');
    const atuais = estado.resultado.opcoes.map((o) => o.festa.id);
    const minha = geracao;
    let r;
    try {
      r = await chamar('/api/conversa', { criterios: estado.criterios, texto, atuais });
    } catch {
      r = null;
    }
    // Recomeçou ou saiu da lista no meio: a resposta não vale.
    if (minha !== geracao) return;
    estado.ocupado = false;
    soltar();
    if ($tela) $tela.removeAttribute('aria-busy');
    if (!r || !r.ok || !r.dados) {
      trocarResultado();
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toque de novo.');
      return;
    }
    const d = r.dados;
    estado.criterios = d.criterios;
    estado.resultado = d;
    estado.fala = { voce: exibido || texto, finde: d.resposta };
    estado.novas = d.entraram || [];
    trocarResultado();
    anunciar(d.resposta);
    const campo = document.getElementById('campo');
    const form = document.getElementById('ajuste-form');
    if (!d.entendeu) {
      // Não entendeu: a resposta aparece junto do campo, e o campo fica à
      // vista, mesmo com o teclado aberto.
      const local = document.getElementById('resposta-local');
      if (local) local.textContent = d.resposta;
      if (campo) campo.value = texto;
      if (campo && digitado) campo.focus({ preventScroll: true });
      if (form) manterVisivel(form);
      return;
    }
    if (campo && digitado) campo.value = '';
    const alvo = document.getElementById('conversa');
    if (alvo) alvo.scrollIntoView({ block: 'start', behavior: reduzir.matches ? 'auto' : 'smooth' });
    if (campo && digitado) campo.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ detalhe da festa

  // "sáb, 14 nov · Pinheiros"
  function dataLonga(o) {
    return `${dataCurta(o.data, o.festa.dia)} · ${o.bairro}`;
  }

  function secao(classe, rotulo, ...filhos) {
    return el('section', { class: `secao ${classe}`, 'aria-label': rotulo },
      el('h2', { class: 'rotulo secao-rotulo', texto: rotulo }), ...filhos);
  }

  // O detalhe, na ordem do plano: quando e régua (R4), média com origem (R5),
  // cartaz, nome, produtora, casa, endereço e mapa (R6), ingresso (R7), links
  // de origem (R8), regras de entrada (R10), som (R11) e fontes (R12). A barra
  // fixa (R9) leva a compra e o envio ao grupo.
  function telaFesta() {
    const o = estado.festa;
    const f = o.festa;
    // Base fictícia por padrão: só sai direto quem diz que não é exemplo.
    const ex = f.exemplo !== false;
    const m = FT.media(f);
    const som = FT.som(f);
    const regras = FT.regrasFrase(f);
    const fontes = FT.fontes(f);
    const j = janelaPedida();
    // O encaixe no pedido, menos a idade, que tem a régua dela: o que a festa
    // fura (horário, preço, som), ou que ela cabe na janela.
    const furos = estado.avulsa ? [] : (o.fora || []).filter((x) => !/da sua faixa$/.test(x));
    const aviso = furos.length ? `${furos.join('; ').replace(/^./, (x) => x.toUpperCase())}.` : '';
    const ate = j ? (j[1] % 24 === 0 ? 'à meia-noite' : `${j[1] % 24 < 2 ? 'à' : 'às'} ${rotuloHora(j[1])}`) : '';
    // O encaixe diz o que a régua mostra: a festa que começa antes do horário
    // pedido (o motor aceita pela pista cheia) não "cabe", começa antes. As
    // palavras são as da pergunta e da cara: "seu horário".
    const seuHorario = j ? `seu horário, das ${rotuloHora(j[0])} ${ate}` : '';
    // Com "% a sua cara", as partes dela já dizem o encaixe de cada critério
    // (horário e idade primeiro, o que fura incluído), logo abaixo da média:
    // as frases de encaixe saem, para nada ser dito duas vezes.
    const comCara = Boolean(!estado.avulsa && caraDe(o));
    let encaixe = comCara ? '' : aviso;
    if (!encaixe && j && !comCara) {
      if (f.inicio < j[0]) encaixe = `Começa ${asHoras(f.inicio)}, antes do ${seuHorario}; a pista enche ${asHoras(f.esquenta)}.`;
      else encaixe = `Cabe no ${seuHorario}.`;
    }

    const nome = el('h1', { class: 'festa-nome', id: 'festa-nome', tabindex: '-1', 'data-foco': '', texto: f.nome });

    // Horário primeiro e a média junto (regra 3 da voz), depois a régua.
    const quando = el('section', { class: 'detalhe-quando', 'aria-label': 'Quando e para quem' },
      el('p', { class: 'rotulo', texto: dataLonga(o) }),
      el('p', { class: 'detalhe-hora', 'aria-hidden': 'true' },
        hora(o.hora),
        el('span', { class: 'detalhe-media-curta', texto: m.ausente ? 'média não informada' : `média ${m.numero} anos` })),
      el('p', { class: 'vh', texto: `${o.horario} ${m.ausente ? m.frase : `Média de ${m.numero} anos.`}` }),
      regua(f),
      encaixe ? el('p', { class: `detalhe-encaixe${encaixe === aviso ? ' detalhe-encaixe--fura' : ''}`, texto: encaixe }) : null,
      // A média contra a faixa pedida, de onde ela vem e quando foi conferida (R5).
      // A régua da média, logo abaixo de onde ela vem, e o encaixe na faixa.
      el('div', { class: 'detalhe-media' },
        reguaIdade(f),
        el('p', { class: 'media-origem' },
          m.ausente ? m.frase : `${m.origem ? m.origem.replace(/^./, (x) => x.toLocaleUpperCase('pt-BR')) : 'Origem não informada'}${m.quando ? `, ${m.quando}` : ''}.`),
        m.ausente || estado.avulsa || comCara ? null : el('p', { class: 'idade-encaixe', texto: encaixeIdade(f) }),
        blocoCara(o)));

    const quem = el('section', { class: 'detalhe-quem', 'aria-labelledby': 'festa-nome' },
      el('div', { class: 'ficha' },
        cartaz(f),
        el('div', { class: 'ficha-texto' },
          nome,
          el('p', { class: 'ficha-produtora', texto: f.produtora }),
          el('p', { class: 'ficha-casa', texto: f.casa }))),
      f.frase ? el('p', { class: 'ficha-frase', texto: f.frase }) : null,
      blocoOnde(f, o.bairro, ex));

    return el('div', { class: 'tela-festa' },
      topo(botaoVoltar()),
      quando,
      quem,
      secao('detalhe-ingresso', 'Ingresso', blocoIngresso(f, ex)),
      secao('detalhe-links', 'Da produtora', blocoLinks(f, ex)),
      regras ? secao('detalhe-entrada', 'Para entrar', el('p', { class: 'secao-texto', texto: regras })) : null,
      secao('detalhe-som', 'Som', el('p', { class: 'secao-texto', texto: som.frase })),
      el('footer', { class: 'detalhe-fontes', 'aria-label': 'De onde vêm estes dados' },
        fontes.length
          ? el('p', { class: 'fontes' }, el('span', { class: 'rotulo', texto: 'Demais dados' }), ' ',
            fontes.map((x, i) => [i ? '; ' : '', x.nome, x.quando ? `, ${x.quando}` : '']).flat(), '.')
          : ausente('Fonte não informada.')),
      rodape(),
      barraDaFesta(o, ex));
  }

  // A média contra a faixa pedida: o mesmo desenho da régua do horário, num
  // eixo de 18 a 50 anos. A faixa é o colchete rosé; a média, um ponto.
  function reguaIdade(f) {
    const fx = !estado.avulsa && estado.criterios && estado.criterios.idade;
    if (!fx || !Number.isInteger(f.mediaIdade)) return null;
    const LIM = { min: 18, max: 50 };
    const x = (n) => ((Math.max(LIM.min, Math.min(LIM.max, n)) - LIM.min) / (LIM.max - LIM.min)) * 100;
    const lado = (v) => (v < 10 ? 'esq' : v > 90 ? 'dir' : 'meio');
    return el('figure', { class: 'regua regua-idade', 'aria-hidden': 'true' },
      el('div', { class: 'rg-trilho' },
        el('span', { class: 'rg-janela', 'data-l': pct(x(fx.min)), 'data-w': pct(x(fx.max) - x(fx.min)) }),
        el('span', { class: 'rg-media', 'data-l': pct(x(f.mediaIdade)) })),
      // Faixa estreita (menos de uns 50 px): as duas pontas num rótulo só.
      el('div', { class: 'rg-baixo' }, x(fx.max) - x(fx.min) < 15
        ? el('span', { class: `rg-rotulo rg-rotulo--voce rg-${lado((x(fx.min) + x(fx.max)) / 2)}`, 'data-l': pct((x(fx.min) + x(fx.max)) / 2), texto: `${fx.min}–${fx.max >= LIM.max ? `${LIM.max}+` : fx.max}` })
        : [el('span', { class: 'rg-rotulo rg-rotulo--voce rg-esq', 'data-l': pct(x(fx.min)), texto: String(fx.min) }),
          el('span', { class: 'rg-rotulo rg-rotulo--voce rg-dir', 'data-l': pct(x(fx.max)), texto: fx.max >= LIM.max ? `${LIM.max}+` : String(fx.max) })]));
  }

  // "Dentro da sua faixa, de 28 a 35." / "2 anos acima da sua faixa, de 28 a 35."
  function encaixeIdade(f) {
    const fx = !estado.avulsa && estado.criterios && estado.criterios.idade;
    if (!fx) return '';
    // Os números da faixa ficam nas pontas do colchete, logo acima.
    const fora = f.mediaIdade < fx.min ? fx.min - f.mediaIdade : f.mediaIdade > fx.max && fx.max < 50 ? f.mediaIdade - fx.max : 0;
    const faixa = `de ${fx.min} a ${fx.max}${fx.max >= 50 ? ' ou mais' : ''}`;
    if (!fora) return `Dentro da sua faixa, ${faixa}.`;
    return `${fora} ${fora === 1 ? 'ano' : 'anos'} ${f.mediaIdade < fx.min ? 'abaixo' : 'acima'} da sua faixa, ${faixa}.`;
  }

  // "% a sua cara" no detalhe, logo abaixo da média: o número e, critério
  // por critério, na ordem do peso (o horário primeiro), se cabe, quase cabe
  // ou não cabe. Quando algo não cabe inteiro, uma linha diz o que pesa mais,
  // para a conta se deixar conferir.
  const CABE = { true: 'Cabe', quase: 'Quase', false: 'Não cabe' };
  function blocoCara(o) {
    const cara = estado.avulsa ? null : caraDe(o);
    if (!cara) return null;
    const partes = FT.ordemDaCara(cara.partes).filter((x) => String(x.cabe) in CABE);
    const peso = FT.pesoDaCara(cara);
    return el('div', { class: 'cara' },
      el('p', { class: 'cara-pct cara-pct--detalhe' }, el('span', { class: 'cara-num', texto: `${cara.pct}%` }), el('span', { texto: 'a sua cara' })),
      peso ? el('p', { class: 'cara-peso', texto: peso }) : null,
      partes.length ? el('ul', { class: 'cara-partes', 'aria-label': 'O que conta na porcentagem' },
        partes.map((x) => el('li', { class: `cara-linha cara-linha--${x.cabe === true ? 'cabe' : x.cabe === false ? 'nao' : 'quase'}` },
          el('span', { class: 'cara-rotulo', texto: CABE[String(x.cabe)] }),
          el('span', { class: 'cara-texto', texto: semQuebraNoPreco(x.texto.trim()) })))) : null);
  }

  // A barra fixa (R9): à esquerda, a compra com o menor preço, ou o preço
  // quando a entrada é na porta ou grátis; à direita, "Mandar pro grupo".
  function barraDaFesta(o, ex) {
    const f = o.festa;
    const p = FT.preco(f);
    const mandar = el('button', { type: 'button', class: 'botao barra-mandar', texto: 'Mandar pro grupo' });
    mandar.addEventListener('click', () => {
      estado.mandar = o;
      ir('mandar');
    });
    // À esquerda, sempre o preço; com venda online, o rótulo embaixo dele é a
    // compra. A única caixa da barra é "Mandar pro grupo".
    let esquerda;
    if (p.compra) {
      esquerda = linkFora(p.url, null, p.servico, ex, 'barra-preco barra-comprar');
      esquerda.replaceChildren(
        el('span', { class: 'barra-preco-valor', texto: `R$ ${p.valor}` }),
        el('span', { class: 'barra-comprar-rotulo' }, el('span', { texto: 'Comprar' }), seta()));
      esquerda.setAttribute('aria-label', `Comprar ingresso no ${p.servico}, R$ ${p.valor}, abre fora do finde`);
    } else {
      const curto = { porta: ['na porta', `R$ ${p.valor}`], gratis: ['entrada', 'Grátis'], esgotado: ['ingresso', 'Esgotado'] }[p.tipo] || ['ingresso', 'A confirmar'];
      esquerda = el('p', { class: 'barra-preco' },
        el('span', { class: 'barra-preco-valor', texto: curto[1] }),
        el('span', { class: 'barra-preco-rotulo', texto: curto[0] }));
    }
    return el('div', { class: 'barra', role: 'region', 'aria-label': 'Ações da festa' }, esquerda, mandar);
  }

  // ------------------------------------------------------------ mandar pro grupo

  function dataCurta(iso, dia) {
    if (!iso) return DIA[dia].curto;
    const [, m, d] = iso.split('-').map(Number);
    return `${DIA[dia].curto}, ${d} ${MESES[m - 1]}`;
  }

  // A mensagem do grupo em texto corrido, sem caixa alta: a hora e a média
  // (com a origem) abrem a linha da festa (FT.mensagem).
  function linhasDaMensagem(o, link, data) {
    return FT.mensagem({ data: dataCurta(data, o.festa.dia), hora: o.hora, bairro: o.bairro, festa: o.festa, link });
  }

  function lerNome() {
    try {
      return localStorage.getItem('finde.nome') || '';
    } catch {
      return '';
    }
  }

  function guardar(nome, id) {
    try {
      if (nome) localStorage.setItem('finde.nome', nome);
      const meus = JSON.parse(localStorage.getItem('finde.meus') || '{}');
      if (nome && id) meus[id] = nome;
      localStorage.setItem('finde.meus', JSON.stringify(meus));
    } catch { /* tudo bem */ }
  }

  // A tela de mandar já é a prévia do convite: "Convite de [nome]" e o painel
  // do convite como quem recebe vai ver. O convite criado fica lembrado por
  // festa: voltar e mandar de novo reabre o mesmo link.
  function telaMandar() {
    const o = estado.mandar;
    const f = o.festa;
    const convite = estado.convites[f.id];
    const nome = convite
      ? el('span', { class: 'nome-fixo', texto: convite.autor || 'você' })
      : el('input', {
        id: 'seu-nome', class: 'campo-nome', type: 'text', maxlength: '24', autocomplete: 'given-name',
        // O nome do campo começa pelo rótulo visível ("Convite de"); a dica
        // vem como descrição.
        placeholder: 'seu nome', value: lerNome(), enterkeyhint: 'done', 'data-foco': '',
        'aria-labelledby': 'convite-de convite-de-mais', 'aria-describedby': 'dica-nome',
      });
    const data = dataCurta((convite && convite.data) || o.data, f.dia);

    return el('div', { class: 'tela-mandar' },
      topo(botaoVoltar()),
      el('section', { class: 'cabeca' },
        el('p', { class: 'de-quem' },
          el('span', { class: 'rotulo', id: 'convite-de', texto: 'Convite de' }),
          convite ? null : el('span', { class: 'vh', id: 'convite-de-mais', texto: 'seu nome, opcional' }),
          nome),
        convite ? null : el('p', { class: 'dica-nome', id: 'dica-nome', texto: 'Com seu nome, você já conta como Tô dentro.' })),
      painelConvite(o, { rotulo: `Convite · ${data}` }),
      convite ? blocoConvite(o, convite) : blocoCriar(o, nome),
      rodape());
  }

  // O convite precisa de um pedido. Aberto por link, não houve pedido: vai um
  // neutro, tirado da própria festa (o dia dela, qualquer bairro, preço e som,
  // e a faixa de idade inteira), para nada no convite dizer que ela fura.
  function pedidoNeutro(f) {
    const janela = f.inicio < 19 ? 'fim-de-tarde' : f.inicio < 22 ? 'comeco-da-noite' : 'noite';
    return { dia: f.dia, janela, idade: { min: 18, max: 50 }, bairros: [], teto: 'sem-limite', estilos: [] };
  }

  function blocoCriar(o, campoNome) {
    const criar = el('button', { type: 'button', class: 'botao botao--largo', texto: 'Criar o convite' });
    const erro = el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' });
    criar.addEventListener('click', async () => {
      if (estado.ocupado) return;
      estado.ocupado = true;
      const tocou = performance.now();
      const minha = geracao;
      const soltar = esperar(criar, 'Criando…');
      const autor = campoNome.value.trim();
      let r;
      try {
        const criterios = estado.avulsa || !estado.criterios ? pedidoNeutro(o.festa) : estado.criterios;
        r = await chamar('/api/planos', { criterios, festa: o.festa.id, autor: autor || undefined });
      } catch {
        r = null;
      }
      const saiu = minha !== geracao;
      if (!saiu) estado.ocupado = false;
      if (!r || r.status !== 201 || !r.dados) {
        if (saiu) return;
        soltar();
        erro.textContent = r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toque de novo.';
        return;
      }
      guardar(autor, r.dados.id);
      estado.convites[o.festa.id] = { id: r.dados.id, url: new URL(r.dados.url, window.location.origin).href, autor, data: r.dados.data };
      // Voltou no meio: o convite fica guardado (o mesmo link reabre), mas a
      // tela em que a pessoa está não muda.
      if (saiu) {
        salvar();
        return;
      }
      // "Mandar no WhatsApp" nasce quase onde estava "Criar o convite": o
      // segundo toque de um toque duplo não pode cair nele. A trava vale a
      // partir do quadro pintado e, como nas perguntas (avanço + trava), a
      // partir do primeiro toque, mesmo com a rede rápida.
      desenhar({ focar: false, entrar: false, travar: true });
      travaAte = Math.max(travaAte, tocou + AVANCO_MS + trava());
      const p = document.getElementById('convite-pronto');
      if (p) p.focus({ preventScroll: true });
      // O que nasceu no lugar de "Criar o convite" chega em escada.
      if (p && p.parentElement) M.subir([...p.parentElement.children], { y: 8, duracao: M.v().estado });
      const zap = document.getElementById('mandar-zap');
      if (zap) zap.scrollIntoView({ block: 'nearest', behavior: reduzir.matches ? 'auto' : 'smooth' });
    });
    return el('div', { class: 'bloco' }, criar, erro);
  }

  // Pronto: o WhatsApp vem primeiro (fica à vista sem rolar), a prévia depois.
  function blocoConvite(o, convite) {
    const { url } = convite;
    const curto = `…${new URL(url).pathname}`;
    const zap = el('a', {
      id: 'mandar-zap',
      class: 'botao botao--largo',
      href: `https://wa.me/?text=${encodeURIComponent(linhasDaMensagem(o, url, convite.data).join('\n'))}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      texto: 'Mandar no WhatsApp',
    });
    const status = el('p', { class: 'status', role: 'status' });
    // O par lado a lado é o mesmo C: 16 px, fio e seta nos dois.
    const copiar = acaoC('button', { type: 'button' }, 'Copiar o link');
    const abrirConvite = acaoC('a', { href: new URL(url).pathname }, 'Abrir o convite');
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Link copiado.';
      } catch {
        status.textContent = `Não consegui copiar daqui. O link é ${url}`;
      }
    });
    return el('div', { class: 'bloco' },
      el('p', { class: 'rotulo', id: 'convite-pronto', tabindex: '-1', texto: 'O convite está pronto' }),
      zap,
      el('div', { class: 'links' }, copiar, abrirConvite),
      status,
      el('p', { class: 'previa', texto: linhasDaMensagem(o, curto, convite.data).join('\n') }));
  }

  // ------------------------------------------------------------ início

  function lerDadosIniciais() {
    try {
      const no = document.getElementById('dados-iniciais');
      const dados = no ? JSON.parse(no.textContent) : null;
      return dados && dados.dias ? dados : null;
    } catch {
      return null;
    }
  }

  // ?festa=<id>: se o endereço pediu uma festa, e o id dela já
  // normalizado (FT.idDeFesta), ou null quando não tem forma de id.
  function festaDoEndereco() {
    const bruto = new URLSearchParams(window.location.search).get('festa');
    return { pedida: bruto !== null, id: FT.idDeFesta(bruto) };
  }

  // Recarregar e o voltar/avançar do navegador devolvem a tela salva; um link
  // novo para o app começa na pergunta 1 (a landing é a boas-vindas).
  function chegouPorLink() {
    try {
      const n = performance.getEntriesByType('navigation')[0];
      return !n || (n.type !== 'reload' && n.type !== 'back_forward');
    } catch {
      return true;
    }
  }

  async function iniciar() {
    estado.form = lerDadosIniciais();
    restaurar();
    const pedida = festaDoEndereco();
    if (pedida.pedida) {
      // Link torto (caractere estranho, longo demais) diz o mesmo que o id
      // que não existe, em vez de cair calado na pergunta 1.
      if (pedida.id) abrirAvulsa(pedida.id);
      else semFesta(true);
      if (!estado.form) buscarFormulario();
      return;
    }
    // O detalhe avulso da sessão não volta no app sem ?festa: começa o pedido.
    if (estado.avulsa) Object.assign(estado, { avulsa: false, tela: 'pergunta', passo: 0, festa: null, mandar: null, editando: null });
    // Por link, só a lista volta, e só quando o link pede (/app?ver=lista,
    // o "ver outras festas" do convite); as respostas de antes ficam marcadas.
    const verLista = new URLSearchParams(window.location.search).get('ver') === 'lista';
    if (chegouPorLink()) {
      const lista = verLista && estado.resultado && estado.criterios;
      Object.assign(estado, { tela: lista ? 'resultado' : 'pergunta', passo: 0, editando: null, festa: null, mandar: null, rolagemLista: 0 });
    }
    // O ?ver=lista sai do endereço, que fica no caminho em que o app está.
    if (verLista) history.replaceState(history.state, '', window.location.pathname);
    // Recarregar devolve a pessoa onde ela estava: o histórico ganha a
    // pergunta 1 embaixo, e a tela salva em cima.
    const voltavel = (estado.tela === 'resultado' && estado.resultado)
      || (estado.tela === 'festa' && estado.festa && estado.resultado)
      || (estado.tela === 'mandar' && estado.mandar && estado.resultado)
      || (estado.tela === 'pergunta' && estado.form);
    // Cada entrada leva a sua altura (n), como as de ir(): é por ela que
    // Recomeçar volta até a pergunta 1 depois de recarregar.
    history.replaceState({ tela: 'pergunta', passo: 0, n: 0 }, '');
    if (voltavel && !(estado.tela === 'pergunta' && estado.passo === 0 && !estado.editando)) {
      if (estado.tela === 'pergunta') {
        const falta = primeiraSemResposta();
        if (!estado.editando && falta >= 0 && falta < estado.passo) estado.passo = falta;
      }
      // Pergunta: as anteriores ficam embaixo, para o "Voltar" andar uma a uma.
      if (estado.tela === 'pergunta' && !estado.editando) for (let k = 1; k < estado.passo; k++) empilhar({ tela: 'pergunta', passo: k });
      // Detalhe e envio: a lista fica embaixo, para o voltar levar a ela.
      if (estado.tela === 'festa' || estado.tela === 'mandar') empilhar({ tela: 'resultado', passo: 0 });
      if (estado.tela === 'mandar' && estado.festa && estado.festa.festa.id === estado.mandar.festa.id) empilhar({ tela: 'festa', passo: 0 });
      if (!(estado.tela === 'pergunta' && estado.passo === 0 && !estado.editando)) empilhar({ tela: estado.tela, passo: estado.passo, editando: estado.editando });
    } else {
      Object.assign(estado, { tela: 'pergunta', passo: 0, editando: null });
    }
    desenhar({ focar: false, travar: false });
    if (!estado.form) buscarFormulario();
  }

  // A festa do link não existe (ou o link veio torto): "Essa festa saiu." Sem
  // rede: "Não consegui abrir a festa."
  function semFesta(naoTem) {
    estado.tela = 'carregando-festa';
    const ver = el('a', { class: 'botao botao--largo', href: '/app?ver=lista', texto: 'Ver festas do fim de semana' });
    const h1 = titulo('h1', 'titulo titulo--pergunta', naoTem ? 'Essa festa ' : 'Não consegui abrir a ', naoTem ? 'saiu.' : 'festa.');
    $tela.replaceChildren(el('div', { class: 'tela-pergunta entra' },
      topo(null),
      el('section', { class: 'cabeca' },
        h1,
        el('hr', { class: 'fio' }),
        el('p', { class: 'texto', texto: naoTem ? 'Ela não está mais na lista do fim de semana. Dê uma olhada nas outras.' : 'A conexão falhou no meio. Recarregue a página para tentar de novo.' })),
      el('div', { class: 'pe' }, ver),
      rodape()));
    h1.focus({ preventScroll: true });
  }

  // O detalhe de uma festa, sem pedido (contrato: GET /api/festa/<id>).
  // "Voltar" leva à landing; "Mandar pro grupo" continua valendo.
  async function abrirAvulsa(id) {
    estado.tela = 'carregando-festa';
    $tela.replaceChildren(el('div', { class: 'tela-pergunta tela-carregando' },
      topo(null), el('p', { class: 'carregando', role: 'status', texto: 'Abrindo a festa…' }), rodape()));
    let r;
    try {
      r = await chamar(`/api/festa/${encodeURIComponent(id)}`);
    } catch {
      r = null;
    }
    const o = r && r.ok && r.dados && r.dados.opcao;
    if (!o || !o.festa) {
      semFesta(Boolean(r && r.status === 404));
      return;
    }
    Object.assign(estado, { avulsa: true, festa: o, mandar: null, editando: null });
    // A altura (n) da entrada fica: voltando do convite para a entrada do
    // envio, o "Voltar" ainda sabe quantas telas há até a landing.
    history.replaceState({ tela: 'festa', passo: 0, n: nivel() }, '');
    estado.tela = 'festa';
    desenhar({ travar: false });
  }

  // Sem os dados embutidos no HTML (página salva, por exemplo), busca. Sem
  // rede, tenta de novo sozinho, e na hora em que a conexão volta.
  let tentativas = 0;
  let proximaTentativa = null;
  async function buscarFormulario() {
    clearTimeout(proximaTentativa);
    let r;
    try {
      r = await chamar('/api/formulario');
    } catch {
      r = null;
    }
    if (estado.form) return;
    if (!r || !r.ok || !r.dados) {
      const $proxima = document.getElementById('proxima');
      if ($proxima) $proxima.firstChild.textContent = 'Sem conexão agora. Tento de novo em instantes.';
      tentativas += 1;
      proximaTentativa = setTimeout(buscarFormulario, Math.min(15000, 2000 * tentativas));
      return;
    }
    estado.form = r.dados;
    if (estado.tela === 'pergunta') desenhar({ focar: false, entrar: false });
  }
  window.addEventListener('online', () => {
    if (!estado.form) buscarFormulario();
  });

  iniciar();
})();

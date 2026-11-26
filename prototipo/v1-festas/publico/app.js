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
    el, titulo, chamar, site, marca, rodape, definirNota, marcaExemplo, reduzir, hora, anunciar, manterVisivel,
    linkFora, cartaz, ausente, blocoOnde, blocoIngresso, blocoLinks, seta, avanco, acaoC, painelConvite, mov: M,
  } = window.Finde;
  // A contagem (medir.js). p: o detalhe curto do passo (o id da festa, a
  // zona do filtro, o dia); nunca texto que a pessoa escreveu.
  const contar = (evento, p) => { if (window.FindeMedir) window.FindeMedir.contar(evento, p); };
  // O id só de festa real: a de exemplo não entra nos números por festa.
  const idReal = (f) => (f && (f.real === true || f.exemplo === false) && f.id ? String(f.id) : undefined);
  const FT = window.FindeTexto;
  const $tela = document.getElementById('tela');

  const PERGUNTAS = [
    { chave: 'dia', tipo: 'um', titulo: ['Sair ', 'quando?'], lista: 'dias' },
    { chave: 'janela', tipo: 'um', titulo: ['A que horas chegar e ', 'voltar?'], lista: 'janelas' },
    { chave: 'bairros', tipo: 'bairros', titulo: ['Pra que lado da ', 'cidade?'], dica: 'Um ou vários.' },
    // A pergunta da idade saiu do fluxo em 25/11/2026 e a idade saiu do
    // pedido em 26/11/2026, até a idade do público ser validada.
    { chave: 'teto', tipo: 'um', titulo: ['Até quanto você quer ', 'gastar?'], lista: 'tetos' },
    { chave: 'estilos', tipo: 'varios', titulo: ['E o ', 'som?'], lista: 'estilos', dica: 'Pode marcar mais de um. Ou nenhum.' },
  ];
  // Os dias do pedido (D2: quinta a domingo, mais "hoje") e os da semana
  // inteira, para a festa de "hoje" numa segunda. aba: o rótulo da aba;
  // longo: o nome inteiro; no: o artigo ("na quinta", "no sábado").
  const DIA = {
    hoje: { nome: 'hoje', seu: 'pra ', no: '', curto: 'hoje', aba: 'Hoje', longo: 'Hoje' },
    seg: { nome: 'segunda', seu: 'pra sua ', no: 'na', curto: 'seg', aba: 'Seg', longo: 'Segunda' },
    ter: { nome: 'terça', seu: 'pra sua ', no: 'na', curto: 'ter', aba: 'Ter', longo: 'Terça' },
    qua: { nome: 'quarta', seu: 'pra sua ', no: 'na', curto: 'qua', aba: 'Qua', longo: 'Quarta' },
    qui: { nome: 'quinta', seu: 'pra sua ', no: 'na', curto: 'qui', aba: 'Qui', longo: 'Quinta' },
    sex: { nome: 'sexta', seu: 'pra sua ', no: 'na', curto: 'sex', aba: 'Sex', longo: 'Sexta' },
    sab: { nome: 'sábado', seu: 'pro seu ', no: 'no', curto: 'sáb', aba: 'Sáb', longo: 'Sábado' },
    dom: { nome: 'domingo', seu: 'pro seu ', no: 'no', curto: 'dom', aba: 'Dom', longo: 'Domingo' },
  };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const NUMERAL = ['Nada', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Onze', 'Doze'];
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
    respostas: { dia: null, semana: 'esta', janela: null, bairros: [], teto: null, estilos: [] },
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
    // De onde o detalhe foi aberto (capa, chamada ou linha): na volta, é ali
    // que a hora e o nome pousam.
    abertaDe: null,
    rolagemLista: 0,
    // "Ver todas" aberta e o mapa da lista (o mapa não sobrevive a recarregar).
    todasAbertas: false,
    mapaAberto: false,
    convites: {},
    ocupado: false,
    avancoPendente: null,
  };

  // ------------------------------------------------------------ sessão

  // Recarregar a página não perde o pedido nem a conversa.
  function salvar() {
    try {
      const { form, ocupado, avancoPendente, mapaAberto, ...resto } = estado;
      sessionStorage.setItem(SESSAO, JSON.stringify(resto));
    } catch { /* sem armazenamento: só não sobrevive ao recarregar */ }
  }

  function restaurar() {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(SESSAO) || 'null');
      if (salvo && typeof salvo === 'object') Object.assign(estado, salvo, { ocupado: false, avancoPendente: null, mapaAberto: false });
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
    // A peça inteira aberta: o voltar do navegador só a fecha.
    if (pecaAberta) {
      pecaAberta = false;
      trocarPeca(false);
      return;
    }
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
          const b = $tela.querySelector(`a[data-festa="${CSS.escape(id)}"][data-de="${estado.abertaDe || 'linha'}"]`) || $tela.querySelector(`a[data-festa="${CSS.escape(id)}"]`);
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
    fecharMapa({ redesenho: true });
    pecaAberta = false;
    document.documentElement.classList.remove('com-peca');
    const conteudo = tela();
    if (entrar) conteudo.classList.add('entra');
    $tela.replaceChildren(conteudo);
    ladoComCartaz(estado.tela === 'festa' && estado.festa ? estado.festa.festa : null);
    document.body.dataset.tela = estado.tela;
    // A festa da tela, para o medir.js contar o ingresso e os links por festa.
    const festaReal = estado.tela === 'festa' && estado.festa ? idReal(estado.festa.festa) : undefined;
    if (festaReal) document.body.dataset.festa = festaReal;
    else delete document.body.dataset.festa;
    if (entrar) window.scrollTo(0, rolagem);
    if (focar) {
      const alvo = $tela.querySelector('[data-foco]') || $tela.querySelector('h1');
      if (alvo) alvo.focus({ preventScroll: true });
    }
    posicionar($tela);
    posicionarAbas($tela);
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
    const alvos = velho.querySelectorAll('.cabeca-pergunta, .opcoes, .onde-chips, .pe');
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

  // Do cartão ao detalhe e de volta (movimento.md, 5): a capa (o recorte
  // .capa-foto com a foto e o véu, nunca o <img>), a hora, o nome e o cartaz
  // da festa aberta viajam entre as duas posições. Os nomes vão só nos
  // elementos da festa tocada. Devolve false quando não há transição a fazer
  // (o desenho segue direto).
  function comVista(de, fazer) {
    if (typeof document.startViewTransition !== 'function') return false;
    const ida = de === 'resultado' && estado.tela === 'festa';
    const volta = de === 'festa' && estado.tela === 'resultado';
    const id = estado.festa && estado.festa.festa && estado.festa.festa.id;
    if ((!ida && !volta) || !id || estado.avulsa) return false;
    const nomes = [];
    const nomear = (naLista) => {
      const raiz = naLista
        ? $tela.querySelector(`a[data-festa="${CSS.escape(id)}"][data-de="${estado.abertaDe || 'linha'}"]`) || $tela.querySelector(`a[data-festa="${CSS.escape(id)}"]`)
        : $tela.querySelector('.tela-festa');
      if (!raiz) return;
      const pares = naLista
        ? [['.capa-foto', 'festa-capa'], ['.hora, .hora-incerta', 'festa-hora'], ['.capa-nome, .chamada-nome, .linha-nome', 'festa-nome'], ['.mini', 'festa-cartaz']]
        : [['.capa--detalhe .capa-foto', 'festa-capa'], ['.capa-quando .hora, .capa-quando .hora-incerta', 'festa-hora'], ['#festa-nome', 'festa-nome'], ['.cartaz-botao .cartaz', 'festa-cartaz']];
      for (const [sel, n] of pares) {
        const x = raiz.querySelector(sel);
        // Fora da tela (a linha escondida pelo filtro), nada viaja.
        if (!x || !x.getClientRects().length) continue;
        x.style.viewTransitionName = n;
        nomes.push(x);
      }
      // Sem foto (a chamada, a linha, a capa chapada), viaja a placa do
      // cartão: um retângulo sem texto (transparente na lista, bordô no
      // detalhe) que cresce até a capa e, na volta, encolhe até ele. O texto
      // do cartão fica com a página, nunca esticado dentro da placa; a hora
      // e o nome, com nome próprio, viajam por cima.
      if (!nomes.some((x) => x.style.viewTransitionName === 'festa-capa')) {
        const placa = naLista ? raiz.querySelector(':scope > .capa-placa') : raiz.querySelector('.capa--detalhe > .capa-placa');
        if (placa && placa.getClientRects().length) {
          placa.style.viewTransitionName = 'festa-capa';
          nomes.push(placa);
          document.documentElement.classList.add('vt-cartao');
          if (volta) document.documentElement.classList.add('vt-volta');
        }
      }
      if (naLista) origem = raiz;
    };
    let origem = null;
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
      document.documentElement.classList.remove('vt-cartao', 'vt-volta');
      return false;
    }
    // O detalhe sabe que a hora e o nome chegaram pela transição.
    vistaEmCurso = true;
    const limpar = () => {
      vistaEmCurso = false;
      document.documentElement.classList.remove('vt-cartao', 'vt-volta');
      for (const x of nomes.splice(0)) x.style.viewTransitionName = '';
      // Na volta, o cartão de onde a festa saiu acende e apaga (só opacidade),
      // para o olho achar o lugar na lista.
      if (volta && origem && document.contains(origem) && M.pode()) {
        origem.classList.add('cartao--voltou');
        setTimeout(() => origem.classList.remove('cartao--voltou'), 1000);
      }
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
    // A base viva e "Esta semana / A próxima" (só na primeira pergunta).
    M.subir(raiz.querySelectorAll('.cabeca-pergunta .base-viva, .semanas'), { atraso: troca ? 40 : 180, y: 12, duracao: troca ? v.estado : v.bloco });
    M.subir(raiz.querySelectorAll('.opcoes > .opcao, .onde-chips > *'), troca ? { atraso: 40, y: 10, duracao: v.estado } : { atraso: 260, y: 14 });
    M.subir(raiz.querySelector('.pe'), { atraso: troca ? 120 : 520, y: 0, duracao: v.estado });
  }

  // O guia abre (movimento.md, 2): os fios da edição se desenham, o título
  // sobe por linha, o pedido e as abas em escada, a capa assenta (bloco por
  // opacidade e a foto por escala), a régua se desenha, as chamadas e os
  // links chegam por último. Nada passa de 1,4 s do toque ao último quadro.
  function entraResultado(raiz) {
    const v = M.v();
    M.edicao(raiz.querySelector('.edicao'));
    M.subir(raiz.querySelectorAll('.guia-cabeca .base-viva'), { atraso: 160, y: 6, duracao: v.estado });
    M.titulo(raiz.querySelector('#cabeca-resultado h1'), { atraso: 120 });
    M.subir(raiz.querySelectorAll('#cabeca-resultado > :not(h1), .abas-linha'), { atraso: 260 });
    const lista = raiz.querySelector('#lista-festas');
    if (!lista) return;
    M.capa(lista.querySelector('.capa'), { atraso: 320 });
    M.subir(lista.querySelectorAll('.chamada'), { atraso: 560 });
    M.subir(lista.querySelectorAll(':scope > .mais, :scope > .bloco-guia'), { atraso: 700 });
    M.subir(lista.querySelectorAll(':scope > .linhas > li'), { atraso: 640, y: 12 });
    // O ajuste fecha a tela: entra quando a rolagem chega nele.
    M.aoVer(raiz.querySelectorAll('.ajuste > *'), (x) => M.subir(x, { y: 10 }), { atraso: 760 });
  }

  function entraFesta(raiz, { volta, vista }) {
    const v = M.v();
    const barra = raiz.querySelector('.barra');
    const corpo = [...raiz.children].filter((x) => !x.matches('.topo, .barra, .peca'));
    if (volta) {
      // Voltando do envio: o detalhe só reaparece.
      M.subir(corpo, { y: 0, duracao: v.estado, escada: false });
      return;
    }
    const capa = raiz.querySelector('.capa--detalhe');
    const secoes = [...raiz.querySelectorAll(':scope > .secao, :scope > .vazios')];
    if (vista) {
      // A capa, a hora, o nome e o cartaz chegaram pela transição: o resto do
      // detalhe entra em blocos assim que a troca começa a pintar.
      M.subir(capa ? capa.querySelectorAll('.capa-dia, .ficha-casa, .ficha-credito') : [], { atraso: 160, y: 8, duracao: v.estado });
      M.reguaDaNoite(capa && capa.querySelector('.regua'), { atraso: 200 });
      M.subir(secoes.slice(0, 3), { atraso: 240 });
    } else {
      M.capa(capa, { atraso: 0 });
      M.subir(secoes.slice(0, 3), { atraso: 360 });
    }
    // As de baixo, quando a rolagem chega nelas.
    M.aoVer(secoes.slice(3), (x) => M.subir(x, { y: 12 }), { atraso: vista ? 300 : 420 });
    // A barra sobe por baixo.
    if (barra) M.animar(barra, [{ translate: '0 100%' }], { duration: v.bloco, easing: v.saida, delay: 300 });
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
      respostas: { dia: null, semana: 'esta', janela: null, bairros: [], teto: null, estilos: [] },
      editando: null, criterios: null, resultado: null, fala: null, novas: [], mandar: null, festa: null, rolagemLista: 0, todasAbertas: false, pedidoNeutro: false,
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
    // O detalhe aberto por link (QR, post, festa mandada no WhatsApp) volta
    // para a lista do dia dela, não para fora do app (24/11/2026).
    else if (typeof estado !== 'undefined' && estado.tela === 'festa' && estado.avulsa && estado.festa && abrirListaNeutra(estado.festa.festa)) return;
    else window.location.assign(LANDING);
  }

  // A lista de um dia sem as perguntas (24/11/2026): para quem chega por um
  // convite, um link direto ou um QR Code. Pedido neutro (São Paulo inteira,
  // sem teto, qualquer som, começo da noite); a frase do pedido continua
  // editável e as perguntas ficam a um toque. ref: { dia, data } da festa, ou
  // nada (o primeiro dia da semana com festa). Devolve false sem dia possível.
  function diaParaLista(ref = {}) {
    const s = (estado.form && estado.form.semanas) || {};
    const esta = Array.isArray(s.esta) ? s.esta : [];
    const proxima = Array.isArray(s.proxima) ? s.proxima : [];
    const porData = ref.data && ([...esta.map((d) => ['esta', d]), ...proxima.map((d) => ['proxima', d])].find(([, d]) => d.data === ref.data));
    if (porData) return { semana: porData[0], dia: porData[1].id };
    const doDia = ref.dia && esta.find((d) => d.id === ref.dia);
    if (doDia) return { semana: 'esta', dia: doDia.id };
    const comFesta = esta.find((d) => d.reais > 0) || proxima.find((d) => d.reais > 0);
    if (comFesta) return { semana: esta.includes(comFesta) ? 'esta' : 'proxima', dia: comFesta.id };
    return null;
  }
  function abrirListaNeutra(ref) {
    const alvo = diaParaLista(ref || {});
    if (!alvo) return false;
    estado.respostas = { dia: alvo.dia, semana: alvo.semana, janela: 'comeco-da-noite', bairros: [], teto: 'sem-limite', estilos: [] };
    Object.assign(estado, { avulsa: false, festa: null, mandar: null, editando: null, tela: 'pergunta', passo: 0, pedidoNeutro: true });
    history.replaceState({ tela: 'pergunta', passo: 0, n: 0 }, '', window.location.pathname);
    buscarFestas(criteriosDoFormulario(), { substituir: true });
    return true;
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
    else {
      estado.pedidoNeutro = false;
      buscarFestas(criteriosDoFormulario(), { botao });
    }
  }

  // "Sair quando?" (R24): os dias da semana escolhida, cada um com a data e
  // o número de festas reais ("Quinta, 26 nov · 8"); "Hoje" com 0 vai para
  // o fim. Sem os dias novos no formulário, os de antes.
  function diasDaPergunta() {
    const porSemana = diasDoForm();
    const semana = estado.respostas.semana === 'proxima' && porSemana.proxima.length ? 'proxima' : 'esta';
    const dias = porSemana[semana].length ? porSemana[semana] : estado.form.dias || [];
    // Sem a contagem (24/11/2026), o dia sem festa sai da pergunta: escolher
    // um dia vazio levava a mais cinco perguntas até a lista vazia. Só quando
    // algum dia tem festa (senão a pergunta ficaria sem opção).
    const comFesta = dias.filter((d) => !Number.isInteger(d.reais) || d.reais > 0);
    return comFesta.length ? comFesta : dias;
  }

  function telaPergunta() {
    const i = estado.passo;
    const p = PERGUNTAS[i];
    const ehDia = p.chave === 'dia';
    const opcoes = ehDia ? diasDaPergunta() : estado.form[p.lista];
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
        continuar.replaceChildren(valorDe('estilos').length ? 'Ver festas' : 'Ver festas de qualquer som', avanco());
      } else {
        continuar.replaceChildren(editando ? 'Ver festas' : 'Continuar', avanco());
        continuar.disabled = !respondida(p);
      }
    }

    let porToque = false;
    const criarOpcoes = (opcoes) => el('div', {
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
          if (ehDia) estado.respostas.semana = o.id === 'hoje' ? 'esta' : o.semana === 'proxima' ? 'proxima' : estado.respostas.semana || 'esta';
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
      if (ehDia) {
        // "Hoje terça" (o dia em tom de rótulo) e a contagem real em serifa.
        const [primeiro, ...resto] = String(o.rotulo || DIA[o.id].longo).split(/,\s*/);
        const nome = (o.id === 'hoje' || /^hoje$/i.test(primeiro)) && resto.length
          ? el('span', { class: 'opcao-nome' }, `${primeiro} `, el('em', { texto: resto.join(', ') }))
          : el('span', { class: 'opcao-nome', texto: String(o.rotulo || DIA[o.id].longo) });
        // Sem a contagem de festas do dia (24/11/2026): o dia e a data bastam.
        return el('label', { class: 'opcao opcao--um' },
          input,
          el('span', { class: 'marcador', 'aria-hidden': 'true' }),
          nome,
          el('span'));
      }
      const [principal, detalhe] = String(o.rotulo).split(' · ');
      return el('label', { class: `opcao opcao--${p.tipo}` },
        input,
        el('span', { class: 'marcador', 'aria-hidden': 'true' }),
        el('span', { class: 'opcao-nome', texto: principal }),
        detalhe ? el('span', { class: 'opcao-detalhe' }, el('span', { class: 'vh', texto: ', ' }), detalhe) : el('span'));
    }));
    const lista = p.tipo === 'bairros' ? perguntaBairros(idTitulo, p)
      : criarOpcoes(opcoes);

    // Esta semana / a próxima, acima das opções: as opções saem em 140 ms e
    // as da outra semana sobem como na entrada. São dois botões, não abas.
    const porSemana = ehDia ? diasDoForm() : null;
    const semanas = ehDia && porSemana.proxima.length && porSemana.esta.length ? el('div', { class: 'semanas', role: 'group', 'aria-label': 'Semana' },
      [['esta', 'Esta semana'], ['proxima', 'A próxima']].map(([id, texto]) => {
        const b = el('button', { type: 'button', class: 'semana', 'aria-pressed': String((estado.respostas.semana || 'esta') === id), texto });
        b.addEventListener('click', () => {
          if ((estado.respostas.semana || 'esta') === id) return;
          estado.respostas.semana = id;
          // "Hoje" não existe na próxima: a escolha cai.
          if (estado.respostas.dia === 'hoje' && id === 'proxima') estado.respostas.dia = null;
          for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b));
          const velha = form.querySelector('.opcoes');
          const nova = criarOpcoes(diasDaPergunta());
          const trocar = () => {
            if (!velha.isConnected) return;
            velha.replaceWith(nova);
            M.subir(nova.querySelectorAll('.opcao'), { y: 10, duracao: M.v().estado });
            atualizarBotao();
          };
          const saida = M.pode() ? M.animar(velha, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: M.v().troca, fill: 'forwards' }) : null;
          if (saida) saida.finished.then(trocar, trocar);
          else trocar();
          salvar();
        });
        return b;
      })) : null;

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
      semanas,
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

  // ------------------------------------------------------------ resultado

  function criteriosDoFormulario() {
    const r = estado.respostas;
    // "Hoje" é sempre desta semana; os outros dias, da semana escolhida.
    const semana = r.dia === 'hoje' ? 'esta' : r.semana === 'proxima' ? 'proxima' : 'esta';
    return { dia: r.dia, semana, janela: r.janela, bairros: [...(r.bairros || [])], teto: r.teto, estilos: r.estilos };
  }

  // Um trecho do pedido reabre só aquela pergunta.
  function abrirParaEditar(chave) {
    const c = estado.criterios;
    estado.pedidoNeutro = false;
    estado.respostas = {
      dia: c.dia, semana: c.semana === 'proxima' ? 'proxima' : 'esta', janela: c.janela, teto: c.teto, estilos: [...(c.estilos || [])],
      bairros: [...(c.bairros || [])],
    };
    // Convite e sessões antigos falam em "faixa" ou "idade": saíram do
    // pedido, então não há o que reabrir.
    if (!PERGUNTAS.some((p) => p.chave === chave)) return;
    estado.editando = chave;
    ir('pergunta', { passo: PERGUNTAS.findIndex((p) => p.chave === chave), deLista: true });
  }

  // Depois de mudar uma pergunta: o resto do que foi conversado continua valendo.
  function reabrirResultado(chave, botao) {
    const dim = { janela: 'horario', teto: 'preco' }[chave];
    const c = { ...estado.criterios, ...criteriosDoFormulario(), evitar: [] };
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
    if (!estado.editando && falta >= 0 && ['dia', 'janela', 'teto'].some(vazio)) {
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
    contar('lista');
    ir('resultado', { substituir });
  }

  // ------------------------------------------------------------ o guia da semana (Direção E)

  // O resultado (U29, desenho da U39): o cabeçalho de revista com a edição e
  // a base viva, o título e o pedido, as abas dos dias, a capa (a festa de
  // maior "% a sua cara"), as chamadas 2 e 3, "Ver todas as N" e "Ver no
  // mapa"; sem real no dia, os exemplos abaixo, marcados, sem % (D11).

  // Festa real: o /3 marca exemplo: false; a base fictícia não marca.
  const ehReal = (o) => Boolean(o) && (o.exemplo === false || Boolean(o.festa && o.festa.exemplo === false));
  const unicas = (os) => os.filter((o, i) => os.findIndex((x) => x.festa.id === o.festa.id) === i);

  // As três recomendadas, todas as reais do dia e os exemplos. Entende a
  // resposta nova (opcoes, maisDoDia, exemplos) e a de antes (a mistura).
  function partesDoResultado(r) {
    const doMotor = r && Array.isArray(r.opcoes) ? r.opcoes.filter((o) => o && o.festa) : [];
    const reais = doMotor.filter(ehReal);
    const todas = unicas([...reais, ...(r && Array.isArray(r.maisDoDia) ? r.maisDoDia.filter((o) => o && o.festa && ehReal(o)) : [])]);
    const fict = r && Array.isArray(r.exemplos) && r.exemplos.length ? r.exemplos : doMotor.filter((o) => !ehReal(o));
    // Fictícia só quando o dia não tem real (D11).
    // As três de cima na ordem da "% a sua cara": a capa é a de maior %
    // (sort estável: empate fica na ordem do motor).
    const pct = (o) => (o && o.cara && Number.isInteger(o.cara.pct) ? o.cara.pct : -1);
    const tres = reais.slice(0, 3).sort((a, b) => pct(b) - pct(a));
    return { opcoes: tres, todas, exemplos: todas.length ? [] : fict.map((o) => ({ ...o, exemplo: true })) };
  }

  const dataDe = (o) => (o && (o.data || (o.festa && (o.festa.dataDaNoite || o.festa.data)))) || null;
  // "27 nov"
  const diaDoMes = (iso) => {
    const m = typeof iso === 'string' && iso.match(/^\d{4}-(\d{2})-(\d{2})/);
    return m ? `${Number(m[2])} ${MESES[Number(m[1]) - 1]}` : '';
  };
  // "Sex · 27 nov"
  function diaComData(o) {
    const d = DIA[o.festa.dia];
    const data = diaDoMes(dataDe(o));
    return [d ? d.aba : '', data].filter(Boolean).join(' · ');
  }

  // Os dias do formulário (U24): [{ id, semana, data, rotulo, reais }]. A
  // resposta de antes só traz { id, rotulo }: os dois servem.
  function diasDoForm() {
    const f = estado.form || {};
    const dias = Array.isArray(f.dias) ? f.dias.filter((d) => d && typeof d.id === 'string' && DIA[d.id]) : [];
    const porSemana = { esta: [], proxima: [] };
    if (f.semanas && typeof f.semanas === 'object') {
      for (const s of ['esta', 'proxima']) porSemana[s] = (Array.isArray(f.semanas[s]) ? f.semanas[s] : []).filter((d) => d && DIA[d.id]).map((d) => ({ ...d, semana: s }));
    } else {
      for (const d of dias) porSemana[d.semana === 'proxima' ? 'proxima' : 'esta'].push(d);
    }
    // "Hoje" com 0 reais vai para o fim (R24).
    for (const s of ['esta', 'proxima']) {
      const i = porSemana[s].findIndex((d) => d.id === 'hoje' && d.reais === 0);
      if (i >= 0) porSemana[s].push(...porSemana[s].splice(i, 1));
    }
    return porSemana;
  }

  // As abas do resultado: hoje (quando não é de quinta a domingo; num desses
  // dias a aba do dia vira "Hoje"), quinta, sexta, sábado e domingo, com a
  // contagem real de cada um, quando se sabe.
  const ABA_ORDEM = ['hoje', 'qui', 'sex', 'sab', 'dom'];
  function abasDoResultado() {
    const c = estado.criterios;
    const r = estado.resultado;
    const semana = c.semana === 'proxima' ? 'proxima' : 'esta';
    const dias = new Map();
    const juntar1 = (id, x) => dias.set(id, { ...(dias.get(id) || { id, data: null, reais: null }), ...x });
    for (const d of diasDoForm()[semana]) juntar1(d.id, { data: d.data || null, reais: Number.isInteger(d.reais) ? d.reais : null, hoje: d.hoje === true && d.id !== 'hoje' });
    for (const d of Array.isArray(r.outrosDias) ? r.outrosDias : []) {
      if (d && DIA[d.dia]) juntar1(d.dia, { data: d.data || (dias.get(d.dia) || {}).data || null, reais: Number.isInteger(d.reais) ? d.reais : null });
    }
    const { todas } = partesDoResultado(r);
    juntar1(c.dia, { data: r.dataReal || dataDe(todas[0]) || (dias.get(c.dia) || {}).data || null, reais: todas.length });
    const hoje = dias.get('hoje');
    let hojeEm = null;
    if (hoje && hoje.data) hojeEm = ['qui', 'sex', 'sab', 'dom'].find((id) => dias.has(id) && dias.get(id).data === hoje.data) || null;
    if (hojeEm) {
      const x = dias.get(hojeEm);
      juntar1(hojeEm, { hoje: true, reais: c.dia === 'hoje' ? hoje.reais : x.reais === null ? hoje.reais : x.reais });
      dias.delete('hoje');
    }
    // Na linha das abas, a ordem é a do tempo: "Hoje" vem primeiro. Vazio
    // (0 reais) e fora do pedido, ele sai: depois de domingo confundia, e o
    // dia segue na primeira pergunta. A regra "Hoje com 0 vai para o fim" é
    // só da primeira pergunta.
    const lista = ABA_ORDEM.filter((id) => dias.has(id)).map((id) => dias.get(id))
      .filter((x) => !(x.id === 'hoje' && x.reais === 0 && c.dia !== 'hoje'));
    return { lista, selecionada: c.dia === 'hoje' && hojeEm ? hojeEm : c.dia };
  }

  function abas() {
    const { lista, selecionada } = abasDoResultado();
    if (lista.length < 2) return null;
    const grupo = el('div', { class: 'abas', role: 'group', 'aria-label': 'Dia' },
      lista.map((x) => {
        const d = DIA[x.id];
        const n = x.reais;
        const nome = x.hoje && x.id !== 'hoje' ? `Hoje, ${d.nome}` : d.longo;
        // A aba diz só o dia; a contagem de festas saiu em 24/11/2026.
        const b = el('button', {
          type: 'button', class: n === 0 ? 'aba aba--vazia' : 'aba', 'data-dia': x.id, 'aria-pressed': String(x.id === selecionada),
          'aria-label': nome,
        }, el('span', { class: 'aba-nome', texto: x.hoje ? 'Hoje' : d.aba }));
        b.addEventListener('click', () => trocarDia(x.id, b));
        return b;
      }),
      el('span', { class: 'aba-fio', 'aria-hidden': 'true' }));
    return el('div', { class: 'abas-linha', id: 'abas' }, grupo);
  }

  // A troca de dia atualiza a linha das abas no próprio nó (aria-pressed, a
  // contagem, a aba vazia), para o fio não ser trocado no meio do percurso.
  // Devolve false quando as abas mudaram de conjunto: aí a linha é refeita.
  function atualizarAbas(velho, novo) {
    if (!velho || !novo || velho.hidden || novo.hidden) return false;
    const vs = [...velho.querySelectorAll('.aba')];
    const ns = [...novo.querySelectorAll('.aba')];
    if (!vs.length || vs.length !== ns.length || vs.some((b, i) => b.dataset.dia !== ns[i].dataset.dia)) return false;
    vs.forEach((b, i) => {
      const n = ns[i];
      for (const at of ['class', 'aria-pressed', 'aria-label']) b.setAttribute(at, n.getAttribute(at));
      b.replaceChildren(...n.childNodes);
    });
    return true;
  }

  // O fio da aba escolhida: um elemento só, movido por translateX e scaleX
  // (cobre a palavra, não a contagem).
  function posicionarAbas(raiz, anima = false) {
    const grupo = raiz && raiz.querySelector('.abas');
    if (!grupo) return;
    const sel = grupo.querySelector('.aba[aria-pressed="true"]');
    const fio = grupo.querySelector('.aba-fio');
    if (!sel || !fio) return;
    const nome = sel.querySelector('.aba-nome');
    const largura = nome ? nome.getBoundingClientRect().width : sel.offsetWidth;
    if (!anima || !M.pode()) fio.style.transition = 'none';
    fio.style.transform = `translateX(${sel.offsetLeft}px) scaleX(${Math.max(1, Math.round(largura))})`;
    if (!anima || !M.pode()) {
      fio.getBoundingClientRect();
      fio.style.transition = '';
    }
  }
  window.addEventListener('resize', () => posicionarAbas($tela));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => posicionarAbas($tela));

  // "Guia da semana · 26 a 29 nov · São Paulo": as datas de quinta a domingo
  // da semana pedida, quando se sabe.
  function edicaoDaSemana() {
    const datas = abasDoResultado().lista.filter((x) => x.id !== 'hoje' && x.data).map((x) => x.data).sort();
    let quando = '';
    if (datas.length) {
      const [a, b] = [datas[0], datas[datas.length - 1]];
      const [da, db] = [diaDoMes(a), diaDoMes(b)];
      quando = a === b ? da : a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8, 10))} a ${db}` : `${da} a ${db}`;
    }
    return el('p', { class: 'edicao' },
      el('span', { texto: estado.criterios.semana === 'proxima' ? 'Guia da próxima semana' : 'Guia da semana' }),
      quando ? el('span', { texto: quando }) : null,
      el('span', { texto: 'São Paulo' }));
  }

  function tituloResultado() {
    const r = estado.resultado;
    const d = DIA[estado.criterios.dia] || DIA.sex;
    const { opcoes, todas } = partesDoResultado(r);
    if (!todas.length) return titulo('h1', 'titulo titulo--resultado', `Nada ${d.seu}`, d.nome, ', ainda.');
    if (!opcoes.length) return titulo('h1', 'titulo titulo--resultado', `Nada cabe inteiro ${d.seu}`, `${d.nome}.`);
    // O título conta todas as reais do dia, como a aba e o "Ver todas as N"
    // (e a nota do servidor): as três de cima são a recomendação, não o total.
    const n = todas.filter((o) => !o.exemplo).length || opcoes.length;
    return titulo('h1', 'titulo titulo--resultado', `${NUMERAL[n] || n} ${n === 1 ? 'festa' : 'festas'} ${d.seu}`, `${d.nome}.`);
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

  // Posição pelo CSSOM (a CSP não deixa atributo style).
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  const pct = (x) => `${Math.round(x * 100) / 100}%`;
  const rotuloHora = (h) => {
    const total = Math.round(h * 60) % (24 * 60);
    const m = total % 60;
    return `${Math.floor(total / 60)}h${m ? String(m).padStart(2, '0') : ''}`;
  };
  // "às 19h", "à 1h", "à meia-noite".
  const asHoras = (h) => {
    const t = Math.round(h * 60) % (24 * 60);
    if (t === 0) return 'à meia-noite';
    return `${t < 120 ? 'à' : 'às'} ${rotuloHora(h)}`;
  };
  // "R$ 150" nunca quebra entre o símbolo e o número.
  const semQuebraNoPreco = (t) => String(t).replace(/R\$ (?=\d)/g, 'R$ ');

  function posicionar(raiz) {
    for (const s of raiz.querySelectorAll('[data-l]')) {
      s.style.left = s.dataset.l;
      if (s.dataset.w) s.style.width = s.dataset.w;
    }
  }

  // A régua da noite (R4, R28): o traço do começo ao fim real da festa, a
  // pista cheia num quadrado no ponto dela, os rótulos presos ao que marcam.
  // Sem o início ou sem o fim, não há régua: o vazio fica no pé, uma vez.
  function reguaDaNoite(f, { longa = false } = {}) {
    if (!num(f.inicio) || !num(f.fim) || f.fim <= f.inicio || f.horarioIncerto === true) return null;
    const dur = f.fim - f.inicio;
    const x = (h) => Math.max(0, Math.min(100, ((h - f.inicio) / dur) * 100));
    const pico = num(f.esquenta) && f.esquenta > f.inicio && f.esquenta < f.fim ? x(f.esquenta) : null;
    const frase = `Começa ${asHoras(f.inicio)}${pico !== null ? `, enche ${asHoras(f.esquenta)}` : ''} e acaba ${asHoras(f.fim)}.`;
    const rot = (texto, classe, l) => el('span', { class: `regua-rot${classe ? ` ${classe}` : ''}`, 'data-l': l === null ? null : pct(l), texto });
    return el('div', { class: 'regua', role: 'img', 'aria-label': frase },
      el('span', { class: 'regua-trilho' }),
      el('span', { class: 'regua-festa' }),
      pico !== null ? el('span', { class: 'regua-pico', 'data-l': pct(pico) }) : null,
      rot(`${rotuloHora(f.inicio)}${longa ? ' começa' : ''}`, '', 0),
      // O rótulo do meio só cabe longe das pontas.
      pico !== null && pico > 24 && pico < 68 ? rot(`${rotuloHora(f.esquenta)} enche`, 'regua-rot--meio', pico) : null,
      rot(`${rotuloHora(f.fim)}${longa ? ' acaba' : ''}`, 'regua-rot--fim', null));
  }

  // "% a sua cara" (contrato da frente CARA): opcao.cara = { pct, partes }.
  // Sem cara (detalhe aberto por link, exemplo, API antiga), não aparece nada.
  function caraDe(o) {
    // A lista aberta sem perguntas (link, convite, QR) não tem pedido de
    // verdade: "100% a sua cara" só porque o horário cabe enganaria.
    if (estado.pedidoNeutro) return null;
    const c = o && o.exemplo !== true && o.cara;
    return c && Number.isInteger(c.pct) && c.pct >= 0 && c.pct <= 100 ? c : null;
  }

  // O porquê do cartão: o que cabe na tinta, o que falta na cor do rótulo.
  function porqueDe(o) {
    if (o.exemplo === true) return null;
    // Só o que cabe (24/11/2026): o que a fonte não diz fica no detalhe, não
    // em cada cartão da lista.
    const { cabe } = FT.porqueDoCartao(o);
    if (!cabe) return null;
    return el('p', { class: 'porque' }, el('b', { texto: cabe }));
  }

  // Casa · bairro · preço, com o preço inteiro (nunca quebra no "R$").
  function ondeDe(o, { comBairro = true } = {}) {
    const f = o.festa;
    const p = FT.preco(f);
    const bairro = comBairro ? o.bairro || f.bairroNome || null : null;
    const casa = f.casa || '';
    // Sem casa nem bairro, o endereço da fonte (quando há) diz onde é.
    const rua = !casa && !bairro && f.endereco && typeof f.endereco.texto === 'string' ? f.endereco.texto.trim() : '';
    const partes = [casa ? el('b', { texto: casa }) : rua ? FT.semViuva(rua) : null, bairro && !(casa || '').includes(bairro) ? bairro : null,
      p.tipo === 'sem-preco' ? null : el('b', { texto: semQuebraNoPreco(FT.precoNaLista(f)) })].filter(Boolean);
    return partes.flatMap((x, i) => (i ? [' · ', x] : [x]));
  }

  // A linha "casa · bairro · preço" só existe quando tem o que dizer (sem
  // nada, um <p> vazio deixava a margem dele na capa).
  function ondeOuNada(classe, o) {
    const partes = ondeDe(o);
    return partes.length ? el('p', { class: classe }, partes) : null;
  }

  // Abre o detalhe pelo cartão tocado: o link funciona sozinho (?festa=), e
  // o toque normal fica no app, com a transição.
  function ligarAbrir(a, o, de) {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
      e.preventDefault();
      if (estado.mapaAberto && de === 'linha' && window.FindeMapa) window.FindeMapa.marcar(document.getElementById('mapa-lista'), o.festa.id);
      abrirFesta(o, de);
    });
    return a;
  }
  const hrefDe = (o) => `?festa=${encodeURIComponent(o.festa.id)}`;
  // "18h00" vira "18h" (a hora cheia sem os zeros, como no rascunho e no
  // convite: a mesma função mora em festa-texto.js).
  const horaCurta = (t) => FT.horaCurta(t);
  // Sem hora, o span não leva a classe .hora: as regras de corpo da coluna
  // das horas não o alcançam (revisão de desenho, P1).
  const horaOuIncerta = (o, classe = 'hora') => (o.hora ? hora(horaCurta(o.hora), classe) : el('span', { class: 'hora-incerta', texto: 'a confirmar' }));

  // A capa: a festa de maior "% a sua cara", com o cartaz (miniatura de 480)
  // desfocado ao fundo, sob o véu; sem cartaz, bordô chapado.
  function capaDaLista(o) {
    const f = o.festa;
    const c = FT.cartazDe(f);
    const cara = caraDe(o);
    const estilo = Array.isArray(f.estilos) && f.estilos.length ? FT.ESTILOS[f.estilos[0]] : null;
    const a = el('a', { class: `capa${estado.novas.includes(f.id) ? ' nova' : ''}`, href: hrefDe(o), 'data-festa': f.id, 'data-de': 'capa' },
      c ? el('span', { class: 'capa-foto' }, el('img', { class: 'capa-fundo', src: c.miniatura, alt: '', decoding: 'async' })) : el('span', { class: 'capa-placa', 'aria-hidden': 'true' }),
      el('div', { class: 'capa-dentro' },
        el('div', { class: 'etiquetas', 'aria-hidden': 'true' },
          estilo ? el('span', { class: 'etiqueta', texto: estilo }) : null,
          o.esgotada ? el('span', { class: 'etiqueta', texto: 'Esgotou' }) : null,
          cara ? el('span', { class: 'etiqueta etiqueta--cara', texto: `${cara.pct}% a sua cara` }) : null),
        el('p', { class: 'capa-quando' }, horaOuIncerta(o), el('span', { class: 'capa-dia', texto: diaComData(o) })),
        el('p', { class: 'capa-nome', texto: FT.semViuva(f.nome) }),
        reguaDaNoite(f),
        ondeOuNada('capa-onde', o),
        porqueDe(o)));
    return ligarAbrir(a, o, 'capa');
  }

  // As chamadas 2 e 3: tipográficas, como a programação.
  function chamada(o, comPct) {
    const f = o.festa;
    const cara = caraDe(o);
    const a = el('a', { class: `chamada${estado.novas.includes(f.id) ? ' nova' : ''}`, href: hrefDe(o), 'data-festa': f.id, 'data-de': 'chamada' },
      el('span', { class: 'capa-placa', 'aria-hidden': 'true' }),
      el('div', {}, horaOuIncerta(o)),
      el('div', {},
        el('p', { class: 'chamada-nome', texto: FT.semViuva(f.nome) }),
        ondeOuNada('chamada-onde', o),
        porqueDe(o),
        comPct && cara ? el('span', { class: 'pct', texto: `${cara.pct}% a sua cara` }) : null));
    return ligarAbrir(a, o, 'chamada');
  }

  // Uma linha de "ver todas" (e dos exemplos): hora, nome, casa e preço, a
  // miniatura à direita (retrato preenche, paisagem cabe inteira).
  function linha(o) {
    const f = o.festa;
    const exemplo = o.exemplo === true;
    // A miniatura é só das reais; o exemplo fica tipográfico (rascunho da U39).
    const c = exemplo ? null : FT.cartazDe(f);
    const onde = [exemplo ? 'Exemplo' : null, f.casa || o.bairro || (exemplo ? null : 'Local a confirmar'), FT.preco(f).tipo === 'sem-preco' ? null : semQuebraNoPreco(FT.precoNaLista(f))].filter(Boolean).join(' · ');
    const aviso = !exemplo && typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso.trim() : '';
    const a = el('a', { class: `linha${c ? '' : ' linha--sem-miniatura'}${estado.novas.includes(f.id) ? ' nova' : ''}`, href: hrefDe(o), 'data-festa': f.id, 'data-de': 'linha' },
      el('span', { class: 'capa-placa', 'aria-hidden': 'true' }),
      horaOuIncerta(o),
      el('div', {},
        el('p', { class: 'linha-nome', texto: FT.semViuva(f.nome) }),
        el('p', { class: 'linha-onde' }, onde, o.esgotada || f.esgotado === true ? [' · ', el('span', { class: 'linha-esgotou', texto: 'esgotou' })] : null),
        aviso ? el('p', { class: 'linha-aviso', texto: semQuebraNoPreco(aviso) }) : null),
      c ? el('img', { class: `mini${c.paisagem ? ' mini--paisagem' : ''}`, src: c.miniatura, alt: FT.altDaPeca(c, f.nome), loading: 'lazy', decoding: 'async', width: '40', height: '50' }) : null);
    return el('li', { 'data-festa': f.id }, ligarAbrir(a, o, 'linha'));
  }

  // Ordem de "ver todas": a hora (sem início por último), esgotadas no fim.
  const porHora = (a, b) => (a.festa.esgotado === true) - (b.festa.esgotado === true) || (num(a.festa.inicio) ? a.festa.inicio : 99) - (num(b.festa.inicio) ? b.festa.inicio : 99);
  const localAConfirmar = (o) => o.bloco === 'local' || (!o.bairro && !o.festa.bairroNome && !(o.festa.endereco && o.festa.endereco.texto));

  // Os filtros de "ver todas" (R25): por zona, com o .chip; dentro da zona
  // vale qualquer um, entre zonas, todos. Quantas não informam cada dado.
  function filtrosDe(todas) {
    const zonas = [];
    const conta = (n, sing, plur) => `${n} sem ${n === 1 ? sing : plur}`;
    const estilos = [...new Set(todas.flatMap((o) => (Array.isArray(o.festa.estilos) ? o.festa.estilos : [])))].filter((id) => FT.ESTILOS[id]);
    const semSom = todas.filter((o) => !(Array.isArray(o.festa.estilos) && o.festa.estilos.length)).length;
    if (estilos.length) zonas.push({ nome: 'Som', chips: estilos.map((id) => ({ id: `som:${id}`, rotulo: FT.ESTILOS[id], cabe: (o) => (o.festa.estilos || []).includes(id) })), sem: semSom ? `${conta(semSom, 'som informado', 'som informado')}` : null });
    const bairros = [...new Set(todas.map((o) => o.bairro || o.festa.bairroNome).filter(Boolean))];
    const semBairro = todas.filter((o) => !(o.bairro || o.festa.bairroNome)).length;
    if (bairros.length > 1 || (bairros.length && semBairro)) zonas.push({ nome: 'Bairro', chips: bairros.map((b) => ({ id: `bairro:${b}`, rotulo: b, cabe: (o) => (o.bairro || o.festa.bairroNome) === b })), sem: semBairro ? conta(semBairro, 'bairro', 'bairro') : null });
    const teto = estado.criterios && typeof estado.criterios.teto === 'number' ? estado.criterios.teto : 50;
    const precos = [];
    if (todas.some((o) => num(FT.preco(o.festa).valor) && FT.preco(o.festa).valor <= teto)) precos.push({ id: 'preco:teto', rotulo: `Até R$ ${teto}`, cabe: (o) => num(FT.preco(o.festa).valor) && FT.preco(o.festa).valor <= teto });
    if (todas.some((o) => FT.preco(o.festa).compra)) precos.push({ id: 'preco:online', rotulo: 'Com ingresso online', cabe: (o) => FT.preco(o.festa).compra });
    const semPreco = todas.filter((o) => FT.preco(o.festa).tipo === 'sem-preco').length;
    if (precos.length) zonas.push({ nome: 'Preço', chips: precos, sem: semPreco ? conta(semPreco, 'preço', 'preço') : null });
    return zonas;
  }

  // "Ver todas as 8 de sexta", com os filtros e "Local a confirmar" num bloco depois.
  function secaoTodas(todas) {
    const d = DIA[estado.criterios.dia] || DIA.sex;
    const ordem = todas.slice().sort(porHora);
    const certas = ordem.filter((o) => !localAConfirmar(o));
    const incertas = ordem.filter(localAConfirmar);
    const zonas = todas.length > 2 ? filtrosDe(todas) : [];
    const marcados = new Set();
    const lista1 = el('ol', { class: 'linhas' }, certas.map(linha));
    const lista2 = el('ol', { class: 'linhas' }, incertas.map(linha));
    const porId = new Map(todas.map((o) => [o.festa.id, o]));
    // Os chips em facetas: a cada clique, cada um mostra quantas festas
    // ficariam com ele, e o que zeraria a lista some (FT.facetas).
    const chipsEl = new Map();
    const zonasEl = new Map();
    const atualizarChips = (anima = true) => {
      const f = FT.facetas(zonas, todas, marcados);
      const botoes = [...chipsEl.values()];
      const antes = new Set(botoes.filter((b) => !b.hidden));
      for (const z of f) {
        for (const c of z.chips) {
          const b = chipsEl.get(c.id);
          if (!b) continue;
          b.hidden = !c.visivel;
          const n = b.querySelector('.chip-n');
          if (n) n.textContent = String(c.n);
          b.setAttribute('aria-label', `${b.dataset.rotulo}, ${c.n} ${c.n === 1 ? 'festa' : 'festas'}`);
        }
        const zEl = zonasEl.get(z.nome);
        if (zEl) zEl.hidden = !z.visivel;
      }
      // Os chips quebram em linha: deslizar só no y chamaria mais atenção que
      // o sumiço. Só o que volta sobe.
      if (anima) M.subir(botoes.filter((b) => !b.hidden && !antes.has(b)), { y: 6 });
    };
    const aplicar = () => {
      const li = [...lista1.children, ...lista2.children];
      const antes = new Map(li.filter((x) => !x.hidden).map((x) => [x, x.getBoundingClientRect().top]));
      for (const x of li) x.hidden = !FT.passaNosFiltros(zonas, marcados, porId.get(x.dataset.festa));
      bloco2.hidden = !lista2.querySelector('li:not([hidden])');
      // Os chips mudam antes de medir: os filtros ficam acima da lista.
      atualizarChips();
      const ficaram = li.filter((x) => !x.hidden && antes.has(x));
      const entraram = li.filter((x) => !x.hidden && !antes.has(x));
      M.flip(ficaram, antes);
      M.subir(entraram, { y: 12 });
      return li.filter((x) => !x.hidden).length;
    };
    const filtros = zonas.length ? el('div', { class: 'filtros', 'data-so': 'lista' }, zonas.map((z) => {
      const zEl = el('div', { class: 'zona', role: 'group', 'aria-label': z.nome },
        el('p', { class: 'rotulo', 'aria-hidden': 'true', texto: z.nome }),
        el('div', { class: 'chips' }, z.chips.map((c) => {
          const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-rotulo': c.rotulo },
            el('span', { texto: c.rotulo }), el('span', { class: 'chip-n', 'aria-hidden': 'true' }));
          b.addEventListener('click', () => {
            if (marcados.has(c.id)) marcados.delete(c.id);
            else {
              marcados.add(c.id);
              // Só a zona (som, bairro, preço), sem o valor escolhido.
              contar('filtro', String(c.id).split(':')[0]);
            }
            b.setAttribute('aria-pressed', String(marcados.has(c.id)));
            // Se a lista zeraria, sai o filtro marcado que ficou sem festa
            // (FT.podarFiltros), e o anúncio diz qual.
            const sairam = FT.podarFiltros(zonas, todas, marcados, z.nome);
            for (const id of sairam) {
              const outro = chipsEl.get(id);
              if (outro) outro.setAttribute('aria-pressed', 'false');
            }
            const ficam = aplicar();
            const rotulos = sairam.map((id) => chipsEl.get(id)).filter(Boolean).map((x) => x.dataset.rotulo);
            anunciar(`${ficam} ${ficam === 1 ? 'festa' : 'festas'}${rotulos.length === 1 ? `. Saiu o filtro ${rotulos[0]}` : rotulos.length ? `. Saíram os filtros ${rotulos.join(', ')}` : ''}.`);
            // O chip clicado pode sumir (desmarcado, sem festa): o foco vai
            // para o próximo chip à vista, para o teclado não voltar ao topo.
            if (b.hidden) {
              const todosChips = [...chipsEl.values()];
              const depois = todosChips.slice(todosChips.indexOf(b) + 1).concat(todosChips.slice(0, todosChips.indexOf(b)));
              const alvo = depois.find((x) => !x.hidden);
              if (alvo) alvo.focus();
            }
          });
          chipsEl.set(c.id, b);
          return b;
        }), z.sem ? el('span', { class: 'sem-dado', texto: z.sem }) : null));
      zonasEl.set(z.nome, zEl);
      return zEl;
    })) : null;
    if (filtros) atualizarChips(false);
    const bloco2 = el('div', { hidden: !incertas.length }, el('p', { class: 'bloco-guia' }, el('span', { class: 'rotulo', texto: 'Local a confirmar' })), lista2);
    return el('section', { class: 'todas', id: 'todas', hidden: !estado.todasAbertas, 'aria-label': `Todas as festas ${d.no ? `${d.no} ${d.nome}` : d.nome}` },
      el('div', { class: 'todas-cabeca' }, el('p', { class: 'rotulo', texto: `Todas as ${todas.length} de ${d.nome}` })),
      filtros, lista1, bloco2);
  }

  // O próximo dia com festa real: "No sábado tem mais 5" (ou "Na quinta tem 8").
  function proximoDia(comReal) {
    const { lista, selecionada } = abasDoResultado();
    const i = lista.findIndex((x) => x.id === selecionada);
    const depois = [...lista.slice(i + 1), ...lista.slice(0, Math.max(0, i))].filter((x) => x.id !== 'hoje' && x.reais > 0);
    const x = depois[0];
    if (!x) return null;
    const d = DIA[x.id];
    const b = acaoC('button', { type: 'button', class: 'link--seta' }, `${d.no === 'no' ? 'No' : 'Na'} ${d.nome} tem ${comReal ? 'mais ' : ''}${x.reais}`);
    b.addEventListener('click', () => {
      const aba = document.querySelector(`.aba[data-dia="${x.id}"]`);
      if (aba) aba.click();
      else trocarDia(x.id, null);
    });
    return b;
  }

  // A lista do dia: a capa, as chamadas, ver todas e o mapa; sem real, os exemplos.
  function listaDoDia() {
    const r = estado.resultado;
    const { opcoes, todas, exemplos } = partesDoResultado(r);
    const d = DIA[estado.criterios.dia] || DIA.sex;
    const raiz = el('div', { class: 'lista-guia', id: 'lista-festas' });
    if (!todas.length) {
      const prox = proximoDia(false);
      // append() escreveria "null" na tela: só os nós que existem.
      raiz.append(...[
        prox ? el('div', { class: 'mais' }, prox) : null,
        exemplos.length ? el('p', { class: 'bloco-guia' }, el('span', { class: 'exemplo', texto: 'Exemplos · festas fictícias' })) : null,
        exemplos.length ? el('ol', { class: 'linhas', 'aria-label': 'Exemplos, festas fictícias' }, exemplos.map(linha)) : null,
      ].filter(Boolean));
      return raiz;
    }
    const comPct = FT.pctNosCartoes(opcoes);
    const resto = opcoes.slice(1);
    const pinos = window.FindeMapa && typeof window.FindeMapa.pinsDe === 'function' ? window.FindeMapa.pinsDe(todas) : { pins: [], soNaLista: 0 };
    const verTodas = todas.length > opcoes.length || todas.length > 1
      ? acaoC('button', { type: 'button', 'aria-expanded': String(Boolean(estado.todasAbertas)), 'aria-controls': 'todas' }, `Ver todas as ${todas.length} de ${d.nome}`) : null;
    if (verTodas) {
      verTodas.querySelector('.seta').classList.add('seta--abre');
      verTodas.addEventListener('click', () => abrirTodas(verTodas));
    }
    // "Ver no mapa" só com 2 pinos ou mais (R32).
    const verMapa = pinos.pins.length >= 2 ? acaoC('button', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'mapa-lista', 'data-mapa': '' }, 'Ver no mapa') : null;
    if (verMapa) verMapa.addEventListener('click', () => (estado.mapaAberto ? fecharMapa() : abrirMapa(verMapa)));
    const prox = proximoDia(true);
    // append() escreveria "null" na tela (dia sem o "fora do mapa" ou sem
    // chamadas): só os nós que existem.
    raiz.append(...[
      el('div', { class: 'mapa-linha', 'data-so': 'mapa', hidden: true },
        el('p', { class: 'rotulo', texto: `${pinos.pins.length ? todas.length - pinos.soNaLista : 0} de ${todas.length} com endereço` })),
      el('section', { class: 'mapa-lugar', id: 'mapa-lista', hidden: true, 'aria-label': `Mapa das festas ${d.no ? `de ${d.nome}` : 'de hoje'}` }),
      pinos.soNaLista ? el('p', { class: 'apoio mapa-fora', 'data-so': 'mapa', hidden: true, texto: `${pinos.soNaLista} ${pinos.soNaLista === 1 ? 'festa sem endereço divulgado fica' : 'festas sem endereço divulgado ficam'} só na lista.` }) : null,
      capaDaLista(opcoes[0] || todas[0]),
      resto.length ? el('div', { class: 'chamadas', 'data-so': 'lista' }, resto.map((o) => chamada(o, comPct))) : null,
      verTodas || verMapa ? el('div', { class: 'mais mais--lista' }, verTodas, verMapa) : null,
      secaoTodas(todas),
      prox ? el('div', { class: 'mais mais--pe', 'data-so': 'lista' }, prox) : null,
    ].filter(Boolean));
    if (!opcoes.length) raiz.querySelector('.capa').remove();
    return raiz;
  }

  function abrirTodas(botao, anima = true) {
    const todas = document.getElementById('todas');
    if (!todas) return;
    const abrir = todas.hidden;
    todas.hidden = !abrir;
    estado.todasAbertas = abrir;
    if (botao) botao.setAttribute('aria-expanded', String(abrir));
    // Só o toque conta: o restaurar abre sem animar.
    if (abrir && anima) contar('todas');
    salvar();
    if (!abrir || !anima) return;
    M.subir([todas.querySelector('.todas-cabeca'), todas.querySelector('.filtros')], { y: 12 });
    M.subir(todas.querySelectorAll('.linhas > li'), { atraso: 120, y: 12 });
  }

  // ------------------------------------------------------------ o mapa da lista

  // No celular, "Ver no mapa" troca a capa e as chamadas pelo mapa, e a
  // lista do dia fica embaixo; no desktop, o mapa abre no lado direito da
  // coluna e a lista fica onde está. O desenho é do mapa.js (U33).
  const largo = () => window.matchMedia('(min-width: 1024px)').matches;
  let ladoAntes = null;
  function abrirMapa(botao) {
    const M2 = window.FindeMapa;
    const lugar = document.getElementById('mapa-lista');
    const $t = document.getElementById('tela-resultado');
    if (!M2 || !lugar || !$t) return;
    const { todas } = partesDoResultado(estado.resultado);
    estado.mapaAberto = true;
    contar('mapa');
    const lado = document.getElementById('lado-dir');
    if (largo() && lado) {
      ladoAntes = { hidden: lado.hidden, oculto: lado.classList.contains('oculto') };
      lado.hidden = false;
      lado.classList.remove('oculto');
      lado.classList.add('com-mapa');
      lado.removeAttribute('aria-hidden');
      lado.append(lugar);
      botao.replaceChildren(el('span', { texto: 'Fechar o mapa' }), seta());
    } else {
      for (const x of $t.querySelectorAll('[data-so="lista"], #lista-festas > .capa, #lista-festas .chamadas')) x.hidden = true;
      if (document.getElementById('todas').hidden) abrirTodas($t.querySelector('[aria-controls="todas"]'), false);
      for (const x of $t.querySelectorAll('[data-so="mapa"]')) x.hidden = false;
      const linhaMapa = $t.querySelector('.mapa-linha');
      if (linhaMapa && !linhaMapa.querySelector('.link')) {
        const voltar = acaoC('button', { type: 'button' }, 'Ver em lista');
        voltar.addEventListener('click', fecharMapa);
        linhaMapa.append(voltar);
      }
      const abasEl = document.getElementById('abas');
      if (abasEl) window.scrollTo({ top: Math.max(0, abasEl.getBoundingClientRect().top + window.scrollY - 8), behavior: 'auto' });
      // "Ver em lista" mora na linha de cima do mapa; os links de baixo saem.
      const mais = botao.closest('.mais');
      if (mais) mais.hidden = true;
      M.subir(document.querySelectorAll('#todas .linhas > li'), { atraso: 400, y: 12 });
    }
    lugar.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    const d = DIA[estado.criterios.dia] || DIA.sex;
    const porId = new Map(todas.map((o) => [o.festa.id, o]));
    const bairros = (estado.criterios.bairros || []).map((id) => {
      const b = (estado.form && estado.form.zonas || []).flatMap((z) => z.bairros || []).find((x) => x.id === id);
      return b && b.ponto ? { lat: b.ponto.lat, lng: b.ponto.lng, nome: b.rotulo } : null;
    }).filter(Boolean);
    M2.montarLista(lugar, todas, {
      bairros,
      rotulo: `Mapa das festas ${d.no ? `${d.no} ${d.nome}` : 'de hoje'}`,
      aoMarcar: ({ festas }) => {
        let primeira = null;
        for (const x of document.querySelectorAll('#todas .linha')) {
          const marcada = festas.includes(x.dataset.festa);
          x.classList.toggle('linha--marcada', marcada);
          if (marcada && !primeira) primeira = x;
        }
        if (primeira && !largo()) primeira.scrollIntoView({ block: 'nearest', behavior: reduzir.matches ? 'auto' : 'smooth' });
      },
      aoAbrir: (id) => { if (porId.has(id)) abrirFesta(porId.get(id), 'linha'); },
    }).catch(() => {});
  }

  function fecharMapa({ redesenho = false } = {}) {
    const lugar = document.getElementById('mapa-lista');
    if (!estado.mapaAberto) return;
    estado.mapaAberto = false;
    if (lugar && window.FindeMapa) window.FindeMapa.desmontar(lugar);
    const lado = document.getElementById('lado-dir');
    if (lado && lado.classList.contains('com-mapa')) {
      lado.classList.remove('com-mapa');
      if (ladoAntes) {
        lado.hidden = ladoAntes.hidden;
        lado.classList.toggle('oculto', ladoAntes.oculto);
      }
      if (lugar && lado.contains(lugar)) lugar.remove();
    }
    if (redesenho) return;
    const $t = document.getElementById('tela-resultado');
    if (!$t) return;
    // Volta a lista como estava: a capa e as chamadas voltam como na entrada.
    trocarResultado();
    const lista = document.getElementById('lista-festas');
    if (lista && M.pode()) {
      M.capa(lista.querySelector('.capa'), { regua: false });
      M.subir(lista.querySelectorAll('.chamada, .mais'), { atraso: 120 });
    } else if (lista) M.soOpacidade(lista);
  }

  // ------------------------------------------------------------ a tela

  function telaResultado() {
    const r = estado.resultado;
    // As outras abas vêm por trás, depois que o guia assentar.
    setTimeout(agendarPreBusca, 0);
    const { todas } = partesDoResultado(r);
    const oferta = r.oferta ? el('button', { type: 'button', class: 'botao botao--vazado oferta', texto: r.oferta.rotulo }) : null;
    if (oferta) oferta.addEventListener('click', () => ajustar(r.oferta.frase, { exibido: r.oferta.rotulo, origem: oferta }));

    // A conversa aparece depois de um ajuste; na chegada, o título e o
    // aviso já dizem o que há.
    const conversa = el('div', { class: 'conversa', id: 'conversa' },
      estado.fala.voce ? el('p', { class: 'fala-voce' }, el('span', { class: 'vh', texto: 'Você: ' }), estado.fala.voce) : null,
      estado.fala.voce && estado.fala.finde ? el('p', { class: 'fala-finde' }, el('span', { class: 'vh', texto: 'Finde: ' }), semQuebraNoPreco(estado.fala.finde)) : null,
      oferta);

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

    // "Ajustar", no topo, leva ao campo da frase.
    const irAjuste = el('button', { type: 'button', class: 'link link--volta', texto: 'Ajustar' });
    irAjuste.addEventListener('click', () => {
      campo.scrollIntoView({ block: 'center', behavior: reduzir.matches ? 'auto' : 'smooth' });
      campo.focus({ preventScroll: true });
    });
    const avisoCru = typeof r.aviso === 'string' && r.aviso.trim() && todas.length ? r.aviso.trim() : '';
    // O aviso do motor fala das recomendadas; com o título contando todas
    // ("Sete festas"), ele diz que são as de cima.
    const deCima = partesDoResultado(r).opcoes.length;
    const aviso = avisoCru && todas.length > deCima && deCima > 1 && /^(Uma cabe|Duas cabem) no pedido;/.test(avisoCru)
      ? `Das ${NUMERAL[deCima].toLocaleLowerCase('pt-BR')} de cima, ${avisoCru[0].toLocaleLowerCase('pt-BR')}${avisoCru.slice(1)}` : avisoCru;

    // A pergunta de opinião no fim; com ela à vista, o rodapé não repete a porta.
    const oferta2 = ofertaDeOpiniao();
    const fim = rodape();
    if (oferta2) {
      const porta = fim.querySelector('.rodape-opiniao');
      if (porta) porta.remove();
    }
    return el('div', { class: 'tela-resultado tela-guia', id: 'tela-resultado' },
      el('header', { class: 'guia-cabeca', id: 'guia-cabeca' },
        topo(irAjuste),
        edicaoDaSemana()),
      el('section', { class: 'guia-titulo', id: 'cabeca-resultado' },
        tituloResultado(),
        frasePedido(r.pedidoPartes || []),
        aviso ? el('p', { class: 'aviso-lista', texto: semQuebraNoPreco(aviso) }) : null,
        conversa),
      abas() || el('div', { id: 'abas', hidden: true }),
      listaDoDia(),
      el('section', { class: 'ajuste', 'aria-labelledby': 'ajuste-titulo' },
        h2,
        el('div', { class: 'atalhos', id: 'atalhos', role: 'group', 'aria-label': 'Atalhos de ajuste' }, atalhos()),
        local,
        form,
        el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' }),
        el('div', { class: 'acoes' }, botaoRecomecar())),
      oferta2,
      fim);
  }

  // Depois de abrir ao menos uma festa, uma pergunta no fim da lista: a nota
  // de 0 a 10 (opiniao.js). Some depois de respondida ou de "Agora não".
  function ofertaDeOpiniao() {
    const O = window.FindeOpiniao;
    let explorou = false;
    try {
      explorou = localStorage.getItem('finde.explorou') === '1';
    } catch { /* tudo bem */ }
    if (!O || !explorou || !O.deveOferecer()) return null;
    return el('section', { class: 'opiniao-oferta' }, O.formulario({ de: 'app', compacto: true }));
  }

  function atalhos() {
    const c = estado.criterios;
    const r = estado.resultado;
    const lista = [];
    const { todas } = partesDoResultado(r);
    const ruim = !todas.length;
    const outroDia = c.dia === 'sab' ? ['domingo', 'e no domingo?'] : ['sábado', 'e no sábado?'];
    const evitarEstilos = c.evitarEstilos || [];
    if (ruim) {
      lista.push(outroDia);
      lista.push(c.janela === 'noite' ? ['mais cedo', 'mais cedo'] : ['mais tarde', 'mais tarde']);
      if (c.teto !== 'sem-limite') lista.push(['sem teto de preço', 'sem limite']);
      if ((c.estilos || []).length) lista.push(['qualquer som', 'qualquer som']);
    } else {
      if (c.teto !== 0) lista.push(['mais barato', 'mais barato']);
      lista.push(c.janela === 'fim-de-tarde' ? ['mais tarde', 'mais tarde'] : ['mais cedo', 'mais cedo']);
      // "sem funk" não é oferecido a quem pediu funk.
      if (!(c.estilos || []).includes('funk') && !evitarEstilos.includes('funk')) lista.push(['sem funk', 'sem funk']);
      lista.push(['outro estilo', 'outro estilo']);
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

  // Depois de um ajuste ou de outra aba, só muda o que mudou: o cabeçalho,
  // o título e a conversa, as abas, a lista e os atalhos. O campo, a
  // resposta local e o aviso de erro (as regiões vivas) ficam os mesmos nós,
  // e o foco não cai no body.
  function trocarResultado({ dia = false, dir = 0 } = {}) {
    const $atual = document.getElementById('tela-resultado');
    if (!$atual) {
      desenhar({ focar: false, entrar: false });
      return;
    }
    fecharMapa({ redesenho: true });
    // Depois de um ajuste, nada pisca: só as festas novas entram.
    $atual.classList.remove('entra');
    const ativo = document.activeElement;
    const rotuloAtivo = ativo && ativo.closest && ativo.closest('#atalhos, #conversa') ? ativo.textContent : null;
    const novo = telaResultado();
    // Na troca de dia, a linha das abas não é refeita: o fio que marcar() já
    // pôs a deslizar termina o percurso, e as contagens mudam no próprio nó.
    const abasVelhas = $atual.querySelector('#abas');
    const topoAbas = abasVelhas ? abasVelhas.getBoundingClientRect().top : null;
    const abasNoLugar = dia && atualizarAbas(abasVelhas, novo.querySelector('#abas'));
    for (const id of ['guia-cabeca', 'cabeca-resultado', 'abas', 'lista-festas', 'atalhos']) {
      if (id === 'abas' && abasNoLugar) continue;
      const velho = $atual.querySelector(`#${id}`);
      const peca = novo.querySelector(`#${id}`);
      if (velho && peca) velho.replaceWith(peca);
    }
    posicionar($atual);
    // Com o fio no lugar, ele segue para a aba nova (anima); refeito, nasce lá.
    posicionarAbas($atual, abasNoLugar);
    salvar();
    if (dia) {
      const lista = document.getElementById('lista-festas');
      const abasLinha = document.getElementById('abas');
      if (M.pode()) {
        const v = M.v();
        // O título, o pedido e as notas do dia novo sobem 6 px (os velhos
        // saíram por opacidade em trocarDia).
        const cabeca = document.getElementById('cabeca-resultado');
        if (cabeca) M.subir([...cabeca.children], { y: 6, duracao: v.estado });
        // As notas mudam de altura: a linha das abas desliza do lugar velho
        // até o novo (FLIP), em vez de pular, e a folha vem junto.
        const dy = topoAbas !== null && abasLinha && !abasLinha.hidden ? topoAbas - abasLinha.getBoundingClientRect().top : 0;
        if (Math.abs(dy) >= 1) M.animar(abasLinha, [{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: v.estado, easing: v.troca });
        // O dia novo chega do lado da aba tocada (24 px, 320 ms); a capa e o
        // texto dela aparecem juntos (sem o bloco vazio antes) e as chamadas
        // sobem a partir de 120 ms.
        // O fundo da capa não sai nem entra (fica bordô de um dia ao outro):
        // o que anda para o lado é o texto dela e o resto da folha.
        if (lista) {
          const dx = dir * 24;
          const dyl = Math.abs(dy) >= 1 ? dy : 0;
          if (dyl) M.animar(lista, [{ translate: `0 ${dyl}px` }, { translate: '0 0' }], { duration: v.estado, easing: v.troca });
          M.capa(lista.querySelector('.capa'), { atraso: 0, conteudoJunto: true, x: dx });
          M.subir(lista.querySelectorAll('.chamada, .mais, .bloco-guia, .linhas > li'), { atraso: 120, x: dx });
        }
      } else if (lista) M.soOpacidade(lista);
      return;
    }
    if (ativo && ativo !== document.body && document.contains(ativo)) return;
    // O botão tocado foi refeito: o foco vai para o mesmo atalho, se ele
    // continua, ou para o título do resultado.
    const igual = rotuloAtivo && [...$atual.querySelectorAll('#atalhos button, #conversa button')].find((x) => x.textContent === rotuloAtivo);
    const alvo = igual || $atual.querySelector('#cabeca-resultado h1');
    if (alvo) alvo.focus({ preventScroll: true });
  }

  // As listas dos outros dias, buscadas por trás quando o guia assenta: a
  // troca de aba para um dia já buscado folheia sem esperar a rede. A chave
  // é o pedido sem a oferta e sem os recusados (a troca de dia manda
  // evitar: []); vale cinco minutos, e um ajuste limpa tudo.
  const diasGuardados = new Map();
  const VALIDADE_DO_DIA = 5 * 60e3;
  const chaveDoDia = (c, dia) => {
    const { oferta, evitar, ...resto } = c || {};
    void oferta;
    void evitar;
    return JSON.stringify({ ...resto, dia });
  };
  function guardadoDoDia(dia) {
    const x = diasGuardados.get(chaveDoDia(estado.criterios, dia));
    return x && Date.now() - x.em < VALIDADE_DO_DIA ? x.dados : null;
  }
  let preBuscando = false;
  function agendarPreBusca() {
    if (preBuscando || !estado.criterios || estado.tela !== 'resultado') return;
    preBuscando = true;
    const c = estado.criterios;
    const ocioso = typeof window.requestIdleCallback === 'function'
      ? (f) => window.requestIdleCallback(f, { timeout: 2500 }) : (f) => setTimeout(f, 0);
    // Depois que a abertura do guia terminou (1,2 s), numa folga do quadro.
    setTimeout(() => ocioso(async () => {
      try {
        // O dia que está na tela, só se ele ainda é o deste pedido: no meio de
        // uma troca de aba, a aba nova já está marcada e o resultado ainda é
        // o do dia velho; depois de Recomeçar, o pedido é outro. A chave sai
        // do pedido ("hoje" vira a aba do dia da semana), não do DOM.
        if (!estado.ocupado && estado.criterios === c && estado.resultado) {
          diasGuardados.set(chaveDoDia(c, abasDoResultado().selecionada), { dados: estado.resultado, em: Date.now() });
        }
        const ids = [...document.querySelectorAll('#tela-resultado .aba[aria-pressed="false"]')].map((b) => b.dataset.dia);
        for (const d of ids) {
          if (estado.tela !== 'resultado' || estado.criterios !== c) break;
          if (guardadoDoDia(d)) continue;
          const { oferta, ...resto } = c;
          void oferta;
          let r;
          try {
            r = await chamar('/api/festas', { criterios: { ...resto, dia: d, evitar: [] } });
          } catch {
            r = null;
          }
          if (r && r.ok && r.dados) diasGuardados.set(chaveDoDia(c, d), { dados: r.dados, em: Date.now() });
        }
      } finally {
        preBuscando = false;
      }
    }), 1200);
  }

  // Outra aba (dia): o fio desliza já, o dia que sai some em 140 ms para o
  // lado de onde a aba veio, e o novo entra do outro lado (folhear). Dia já
  // buscado entra assim que o velho sai; sem ele, quando a lista chega. Se
  // ela demora, o lugar fica com a linha de rótulo e o fio que corre, nunca
  // com o dia velho esmaecido.
  async function trocarDia(id, aba) {
    if (estado.ocupado || !estado.criterios) return;
    if (aba && aba.getAttribute('aria-pressed') === 'true') return;
    const $t = document.getElementById('tela-resultado');
    if (!$t) return;
    estado.ocupado = true;
    const minha = geracao;
    const todasAbas = [...$t.querySelectorAll('.aba')];
    const antes = todasAbas.find((b) => b.getAttribute('aria-pressed') === 'true') || null;
    // A direção da folha: a aba nova à direita da velha, o dia vem da direita.
    const dir = antes && aba ? Math.sign(todasAbas.indexOf(aba) - todasAbas.indexOf(antes)) : 0;
    const marcar = (alvo) => {
      for (const b of $t.querySelectorAll('.aba')) b.setAttribute('aria-pressed', String(b === alvo));
      posicionarAbas($t, true);
    };
    if (aba) marcar(aba);
    fecharMapa({ redesenho: true });
    const lista = document.getElementById('lista-festas');
    const blocos = lista ? [...lista.children].filter((x) => !x.hidden) : [];
    // Da capa sai só o de dentro: o fundo bordô fica até o dia novo chegar,
    // sem piscar nude entre um e outro.
    const capaVelha = blocos.find((x) => x.classList.contains('capa'));
    const folhas = [...blocos.filter((x) => x !== capaVelha), ...(capaVelha ? capaVelha.querySelectorAll(':scope > .capa-dentro, :scope > .capa-foto') : [])];
    // O título, o pedido e as notas do dia velho saem só por opacidade.
    const cabeca = $t.querySelector('#cabeca-resultado');
    const saida = [...M.sair(folhas, dir ? { x: -dir * 16, y: 0 } : {}), ...M.sair(cabeca ? [...cabeca.children] : [], { y: 0 })];
    const d = DIA[id] || DIA.sex;
    const guardado = guardadoDoDia(id);
    let r;
    if (guardado) {
      // Já buscado: só espera o velho sair (140 ms) e folheia.
      await Promise.race([Promise.all(saida.map((a) => a.finished)).catch(() => {}), new Promise((ok) => setTimeout(ok, 160))]);
      r = { ok: true, dados: guardado };
    } else {
      const espera = setTimeout(() => {
        if (minha === geracao && lista && document.contains(lista)) lista.replaceChildren(el('p', { class: 'carregando', role: 'status', texto: `Abrindo ${d.no ? `${d.no === 'no' ? 'o' : 'a'} ${d.nome}` : 'hoje'}…` }));
      }, 140);
      try {
        const { oferta, ...resto } = estado.criterios;
        void oferta;
        r = await chamar('/api/festas', { criterios: { ...resto, dia: id, evitar: [] } });
      } catch {
        r = null;
      }
      clearTimeout(espera);
      if (r && r.ok && r.dados) diasGuardados.set(chaveDoDia(estado.criterios, id), { dados: r.dados, em: Date.now() });
    }
    if (minha !== geracao) return;
    estado.ocupado = false;
    if (!r || !r.ok || !r.dados) {
      for (const a of saida) a.cancel();
      if (antes) marcar(antes);
      if (lista && !lista.querySelector('.capa, .linhas, .mais')) trocarResultado();
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toque de novo.');
      return;
    }
    Object.assign(estado, { criterios: r.dados.criterios, resultado: r.dados, fala: { voce: null, finde: r.dados.resposta }, novas: [], todasAbertas: false });
    if (DIA[id]) contar('dia', id);
    trocarResultado({ dia: true, dir });
    anunciar(`${(DIA[estado.criterios.dia] || d).longo}: ${partesDoResultado(estado.resultado).todas.length} festas.`);
  }

  async function ajustar(texto, { exibido, origem, digitado = false } = {}) {
    // Quem ajusta a frase passou a ter pedido: a % volta.
    estado.pedidoNeutro = false;
    if (estado.ocupado) return;
    estado.ocupado = true;
    diasGuardados.clear();
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
    const { opcoes, todas, exemplos } = partesDoResultado(estado.resultado);
    // As três de cima são as "na tela" da conversa (o servidor lê até três).
    const atuais = [...opcoes, ...todas, ...exemplos].map((o) => o.festa.id).filter((id, i, xs) => xs.indexOf(id) === i).slice(0, 3);
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
    contar('ajuste', d.entendeu ? 'entendido' : 'nao-entendido');
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

  function abrirFesta(o, de = 'linha') {
    contar('detalhe', idReal(o.festa));
    try {
      localStorage.setItem('finde.explorou', '1');
    } catch { /* tudo bem */ }
    estado.festa = o;
    estado.abertaDe = de;
    ir('festa');
  }

  // ------------------------------------------------------------ detalhe da festa

  // "Sexta, 27 nov · Pinheiros"
  function dataLonga(o) {
    const d = DIA[o.festa.dia];
    const data = diaDoMes(dataDe(o));
    const quando = [d ? d.longo : '', data].filter(Boolean).join(', ');
    return [quando, o.bairro || o.festa.bairroNome].filter(Boolean).join(' · ');
  }

  function secao(classe, rotulo, ...filhos) {
    const corpo = filhos.flat().filter(Boolean);
    if (!corpo.length) return null;
    return el('section', { class: `secao ${classe}`, 'aria-label': rotulo || null },
      rotulo ? el('h2', { class: 'rotulo secao-rotulo', texto: rotulo }) : null, ...corpo);
  }

  // Um botão C que abre e fecha um trecho (a seta gira 90°); o trecho sobe
  // em escada quando abre.
  function disclosure(texto, alvo, aoAbrir) {
    const b = acaoC('button', { type: 'button', 'aria-expanded': 'false' }, texto);
    b.querySelector('.seta').classList.add('seta--abre');
    const id = alvo.id;
    if (id) b.setAttribute('aria-controls', id);
    alvo.hidden = true;
    b.addEventListener('click', () => {
      const abre = alvo.hidden;
      alvo.hidden = !abre;
      b.setAttribute('aria-expanded', String(abre));
      if (abre) {
        M.subir([...alvo.children], { y: 12 });
        if (aoAbrir) aoAbrir();
      } else M.soOpacidade(alvo);
    });
    return b;
  }

  // A capa do detalhe: o mesmo cartaz desfocado ao fundo; dentro, o dia, a
  // hora grande, a régua da noite e o cartaz nítido de 96 × 120 ao lado do
  // nome, com o crédito. Tocar no cartaz abre a peça inteira.
  function capaDoDetalhe(o, ex) {
    const f = o.festa;
    const c = FT.cartazDe(f);
    const nome = el('h1', { class: 'ficha-nome', id: 'festa-nome', tabindex: '-1', 'data-foco': '', texto: FT.semViuva(f.nome) });
    const casa = [f.casa, f.produtora && f.produtora !== f.casa ? f.produtora : null].filter(Boolean).join(' · ');
    let botao = null;
    if (c) {
      botao = el('button', { type: 'button', class: 'cartaz-botao', 'aria-label': `Ver ${c.papel.toLocaleLowerCase('pt-BR')} inteiro`, 'aria-haspopup': 'dialog' }, cartaz(f));
      botao.addEventListener('click', () => abrirPeca());
    }
    return el('section', { class: 'capa capa--detalhe', 'aria-labelledby': 'festa-nome' },
      c ? el('span', { class: 'capa-foto' }, el('img', { class: 'capa-fundo', src: c.miniatura, alt: '', decoding: 'async' })) : el('span', { class: 'capa-placa', 'aria-hidden': 'true' }),
      el('div', { class: 'capa-dentro' },
        // Fictícia no meio das reais: diz que é exemplo antes de tudo.
        ex && o.exemplo === true ? el('p', { class: 'marca-exemplo-linha' }, marcaExemplo('', 'Exemplo · festa fictícia')) : null,
        el('p', { class: 'capa-dia', texto: dataLonga(o) }),
        el('p', { class: 'capa-quando' }, o.hora ? hora(horaCurta(o.hora)) : el('span', { class: 'hora-incerta', texto: 'Horário a confirmar' })),
        reguaDaNoite(f, { longa: true }),
        el('div', { class: 'ficha' }, botao, el('div', { class: 'ficha-texto' }, nome, casa ? el('p', { class: 'ficha-casa', texto: casa }) : null)),
        c && c.divulgacao ? el('p', { class: 'ficha-credito', texto: FT.creditoDaPeca(c) }) : null));
  }

  // "% a sua cara" no detalhe: o número e, critério por critério, na ordem do
  // peso, se cabe, quase cabe ou não cabe; o sem dado conta pela metade.
  const CABE = { true: 'Cabe', quase: 'Quase', false: 'Não cabe', null: 'Sem dado' };
  const ROTULO_CRITERIO = { horario: 'Horário', bairro: 'Bairro', preco: 'Preço', som: 'Som' };
  function blocoCara(o) {
    const cara = estado.avulsa ? null : caraDe(o);
    if (!cara) return null;
    const partes = FT.ordemDaCara(cara.partes).filter((x) => String(x.cabe) in CABE);
    const peso = FT.pesoDaCara(cara);
    const classe = (x) => (x.cabe === true ? 'cabe' : x.cabe === false ? 'nao' : x.cabe === null ? 'sem-dado' : 'quase');
    return [
      el('p', { class: 'cara-pct' }, el('span', { class: 'cara-num', texto: `${cara.pct}%` }), el('span', { class: 'rotulo', texto: 'a sua cara' })),
      peso ? el('p', { class: 'cara-peso', texto: peso }) : null,
      partes.length ? el('ul', { class: 'cara-partes', 'aria-label': 'O que conta na porcentagem' },
        partes.map((x) => el('li', { class: `cara-linha cara-linha--${classe(x)}` },
          el('span', { class: 'cara-rotulo', texto: ROTULO_CRITERIO[x.criterio] || CABE[String(x.cabe)] }),
          el('span', { class: 'cara-texto', texto: `${semQuebraNoPreco(x.texto.trim()).replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))}${x.cabe === null ? '; conta pela metade' : ''}.`.replace(/\.\.$/, '.') })))) : null,
    ];
  }

  // Onde (R28, R29, R32): a casa, o endereço e o bairro, a distância do
  // bairro pedido em linha reta, "Como chegar" (Google, Apple, Uber) e o
  // mini-mapa atrás de um toque.
  function blocoOndeDaFesta(o, ex) {
    const f = o.festa;
    const e = f.endereco && typeof f.endereco === 'object' ? f.endereco : {};
    const texto = typeof e.texto === 'string' && e.texto.trim() ? e.texto.trim() : '';
    const bairro = o.bairro || f.bairroNome || '';
    const linha2 = [texto, bairro && !texto.includes(bairro) ? bairro : null].filter(Boolean).join(' · ');
    const casa = f.casa && f.casa !== bairro ? f.casa : '';
    if (!casa && !linha2) return [];
    const L = window.FindeLocal;
    const local = { ...(f.local || {}), texto };
    const destinos = L ? L.comoChegar(local, f.casa) : [];
    const lista = el('div', { class: 'destinos', id: 'destinos' }, destinos.map((x) => {
      const href = FT.destino(x.url, x.rotulo, ex);
      return href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${x.rotulo}, abre fora do finde`, texto: x.rotulo }) : null;
    }));
    const pedidos = estado.avulsa || !estado.criterios ? [] : estado.criterios.bairros || [];
    const nomeDoPedido = pedidos.length === 1 ? ((estado.form && estado.form.zonas || []).flatMap((z) => z.bairros || []).find((b) => b.id === pedidos[0]) || {}).rotulo : null;
    const distancia = L && nomeDoPedido && num(o.distanciaKm) ? L.distanciaTexto(o.distanciaKm, nomeDoPedido) : '';
    const comMapa = window.FindeMapa && window.FindeMapa.pinsDe([f]).pins.length > 0;
    const mini = comMapa ? el('div', { class: 'mini-mapa-lugar', id: 'mini-mapa' }) : null;
    const acoes = [
      destinos.length ? disclosure('Como chegar', lista) : null,
      mini ? disclosure('Mostrar mapa', mini, () => window.FindeMapa.montarDetalhe(mini, f, { rotulo: `Mapa: ${f.casa || f.nome}` }).catch(() => {})) : null,
    ].filter(Boolean);
    return [
      el('p', { class: 'endereco' }, FT.semViuva(casa || linha2), casa && linha2 ? el('small', { texto: FT.semViuva(linha2) }) : null),
      !texto && f.real ? el('p', { class: 'apoio', texto: FT.preco(f).compra ? 'Endereço não divulgado. Confira na página do ingresso.' : 'Endereço não divulgado.' }) : null,
      distancia ? el('p', { class: 'apoio', texto: distancia }) : null,
      acoes.length ? el('div', { class: 'acoes' }, acoes) : null,
      destinos.length ? lista : null,
      mini,
    ];
  }

  // Pôr na agenda (.ics) e compartilhar (navigator.share, com WhatsApp e
  // copiar de reserva), numa linha de links C.
  function acoesDaFesta(o, ex) {
    const f = o.festa;
    const url = new URL(`/app?festa=${encodeURIComponent(f.id)}`, window.location.origin).href;
    const agenda = acaoC('a', { href: `/api/festa/${encodeURIComponent(f.id)}/agenda.ics`, download: `${f.id}.ics` }, 'Pôr na agenda');
    // O .ics é do próprio site, que o medir.js não conta: conta aqui.
    agenda.addEventListener('click', () => contar('agenda', idReal(f)));
    const status = el('p', { class: 'status-curto', role: 'status' });
    const texto = `${f.nome}${o.hora ? `, ${o.hora}` : ''}${f.casa ? `, ${f.casa}` : ''}${ex ? ' (exemplo: festa fictícia do protótipo do Finde)' : ''}`;
    const reserva = el('div', { class: 'destinos', id: 'compartilhar-reserva', hidden: true },
      el('a', { href: `https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`, target: '_blank', rel: 'noopener noreferrer', texto: 'WhatsApp' }),
      (() => {
        const b = el('button', { type: 'button', texto: 'Copiar o link' });
        b.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Link copiado.';
            contar('compartilhou', 'copiou');
          } catch {
            status.textContent = `Não consegui copiar daqui. O link é ${url}`;
          }
        });
        return b;
      })());
    const compartilhar = acaoC('button', { type: 'button' }, 'Compartilhar');
    compartilhar.addEventListener('click', async () => {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: f.nome, text: texto, url });
          contar('compartilhou', 'nativo');
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      reserva.hidden = !reserva.hidden;
      if (!reserva.hidden) M.subir([...reserva.children], { y: 8 });
    });
    return [el('div', { class: 'acoes' }, agenda, compartilhar), reserva, status];
  }

  // "Encontrada em 3 fontes" (R31): a lista com link, o que se leu em cada
  // uma e quando, e a frase da junção, com as duas peças lado a lado quando
  // a imagem pesou.
  function blocoFontes(f) {
    if (f.real !== true && f.exemplo !== false) return [];
    const fontes = FT.fontesDaFesta(f);
    if (!fontes.length) return [];
    const juncao = fontes.length > 1 ? FT.fraseDaJuncao(f) : null;
    const c = FT.cartazDe(f);
    const imagens = (Array.isArray(f.imagens) ? f.imagens : []).map((x) => FT.cartazDe({ cartaz: x })).filter(Boolean);
    const origens = c && f.cartaz && Array.isArray(f.cartaz.origens) ? f.cartaz.origens : [];
    const pecas = imagens.length > 1 ? imagens.slice(0, 2).map((x, i) => [x, (f.imagens[i] && f.imagens[i].fonte) || '']) : c && origens.length > 1 ? origens.slice(0, 2).map((x) => [c, x.fonte]) : [];
    const legenda = (fonte) => ({ instagram: 'post', paginas: 'página', indicacao: 'indicação', envio: 'produtora' }[fonte] || 'outra');
    const alvo = el('div', { id: 'fontes' },
      el('ul', { class: 'fontes-lista' }, fontes.map((x) => el('li', { class: 'fonte' },
        el('div', {}, el('p', { class: 'fonte-nome', texto: x.nome }), x.leu ? el('p', { class: 'fonte-leu', texto: FT.semViuva(x.leu) }) : null),
        x.url ? el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${x.rotuloLink}: ${x.nome}, abre fora do finde`, texto: x.rotuloLink }) : null))),
      juncao ? el('div', { class: 'juncao' },
        el('p', { class: 'juncao-frase', texto: juncao.frase }),
        juncao.imagem && pecas.length === 2 ? el('div', { class: 'par-imagens' }, pecas.map(([x, fonte]) => el('figure', {},
          el('img', { class: `mini${x.paisagem ? ' mini--paisagem' : ''}`, src: x.miniatura, alt: `${x.papel} ${legenda(fonte) === 'post' ? 'do post' : `da ${legenda(fonte)}`}`, loading: 'lazy', decoding: 'async', width: '40', height: '50' }),
          el('figcaption', { texto: legenda(fonte) })))) : null) : null);
    return [disclosure(`Encontrada em ${fontes.length} ${fontes.length === 1 ? 'fonte' : 'fontes'}`, alvo), alvo];
  }

  // De onde vem (pé): uma linha por campo; a divergência numa frase.
  function blocoDeOnde(f) {
    const linhas = FT.deOndeVem(f);
    const divergencias = FT.divergencias(f);
    if (!linhas.length && !divergencias.length) return [];
    return [
      linhas.length === 1 && linhas[0].junto ? el('p', { class: 'de-onde-junto', texto: FT.semViuva(linhas[0].texto) })
        : linhas.length ? el('dl', { class: 'de-onde' }, linhas.flatMap((x) => [el('dt', { texto: x.campo }), el('dd', { texto: FT.semViuva(x.texto) })])) : null,
      ...divergencias.map((t) => el('p', { class: 'divergencia', texto: semQuebraNoPreco(t) })),
    ];
  }

  // O som, o lineup e as regras da porta, quando há o que dizer.
  function blocoSom(f) {
    const s = FT.som(f);
    const regras = FT.regrasFrase(f);
    const temSom = Boolean(s.estilos || s.lineup);
    return [
      f.frase ? el('p', { class: 'secao-texto', texto: f.frase }) : null,
      temSom ? el('p', { class: 'secao-texto', texto: f.real ? s.frase.replace(/\s*Lineup ainda não divulgado\.$/, '').replace(/^Som não informado\.\s*/, '') : s.frase }) : null,
      regras ? el('p', { class: 'secao-texto', texto: regras }) : null,
    ];
  }

  // O detalhe, na ordem do celular (R28 e o rascunho da U39): a capa (quando,
  // régua, nome com o cartaz ao lado), "% a sua cara", onde e como
  // chegar, o ingresso, o som, as fontes, de onde vem e os vazios numa linha
  // só no pé. A barra fixa leva o preço, a compra e o envio ao grupo; a peça
  // inteira abre por cima, num diálogo.
  function telaFesta() {
    const o = estado.festa;
    const f = o.festa;
    // Base fictícia por padrão: só sai direto quem diz que não é exemplo.
    const ex = f.exemplo !== false;
    const vazios = FT.vaziosDaFesta(f);
    return el('div', { class: 'tela-festa' },
      el('header', { class: 'topo topo--detalhe' }, botaoVoltar(), marca(LANDING)),
      capaDoDetalhe(o, ex),
      secao('secao--cara', '', blocoCara(o)),
      secao('secao--onde', 'Onde', blocoOndeDaFesta(o, ex)),
      secao('secao--ingresso', 'Ingresso', blocoIngresso(f, ex, { comprar: FT.precoVelho(f) }), acoesDaFesta(o, ex)),
      secao('secao--som', 'Som', blocoSom(f)),
      secao('secao--fontes', '', blocoFontes(f)),
      secao('secao--de-onde', 'De onde vem', blocoDeOnde(f)),
      vazios ? el('p', { class: 'vazios', texto: vazios }) : null,
      rodape(),
      barraDaFesta(o, ex),
      pecaInteira(f, ex));
  }

  // A peça inteira (R30): fundo noite chapado, a imagem contida, o crédito e
  // o link da origem. Abre do cartaz (o cartaz viaja até ela), fecha pelo
  // botão, pelo Esc ou pelo voltar do navegador; o foco volta ao cartaz.
  function pecaInteira(f, ex) {
    const c = FT.cartazDe(f);
    if (!c) return null;
    const fechar = el('button', { type: 'button', class: 'peca-fechar', texto: 'Fechar' });
    fechar.addEventListener('click', () => history.back());
    const fora = c.origem && c.origemRotulo ? linkFora(c.origem, c.origemRotulo, null, ex, 'peca-link') : null;
    if (fora) fora.textContent = c.origemRotulo;
    return el('div', { class: 'peca', id: 'peca', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': FT.altDaPeca(c, f.nome) },
      el('img', { src: c.arquivo, alt: FT.altDaPeca(c, f.nome), loading: 'lazy', decoding: 'async' }),
      el('div', { class: 'peca-pe' }, el('p', {}, FT.creditoDaPeca(c), fora ? [' · ', fora] : null), fechar));
  }

  let pecaAberta = false;
  function trocarPeca(abrir) {
    const peca = document.getElementById('peca');
    const mini = $tela.querySelector('.cartaz-botao .cartaz');
    if (!peca) return;
    const img = peca.querySelector('img');
    const fazer = () => {
      peca.hidden = !abrir;
      document.documentElement.classList.toggle('com-peca', abrir);
    };
    if (M.pode() && typeof document.startViewTransition === 'function' && mini && img) {
      const [de, para] = abrir ? [mini, img] : [img, mini];
      de.style.viewTransitionName = 'festa-cartaz';
      try {
        const t = document.startViewTransition(() => {
          de.style.viewTransitionName = '';
          fazer();
          para.style.viewTransitionName = 'festa-cartaz';
        });
        t.finished.finally(() => { para.style.viewTransitionName = ''; });
      } catch {
        de.style.viewTransitionName = '';
        fazer();
      }
    } else {
      fazer();
      if (abrir && M.anima() && M.pode()) M.animar(peca, [{ opacity: 0, scale: '.96' }], { duration: M.v().estado, easing: M.v().saida });
      else if (abrir) M.soOpacidade(peca);
    }
    if (abrir) peca.querySelector('.peca-fechar').focus({ preventScroll: true });
    else if (mini) mini.closest('button').focus({ preventScroll: true });
  }
  function abrirPeca() {
    if (pecaAberta) return;
    pecaAberta = true;
    history.pushState({ ...(history.state || {}), peca: true, n: nivel() + 1 }, '');
    trocarPeca(true);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pecaAberta) history.back();
  });

  // No desktop o lado esquerdo troca o relógio pelo flyer inteiro, nítido.
  function ladoComCartaz(f) {
    const lado = document.querySelector('.lado-esq');
    if (!lado) return;
    const velho = lado.querySelector('.lado-cartaz');
    const c = f ? FT.cartazDe(f) : null;
    if (!c) {
      lado.classList.remove('com-cartaz');
      if (velho) velho.remove();
      return;
    }
    const novo = el('figure', { class: 'lado-cartaz' },
      el('img', { src: c.arquivo, alt: '', loading: 'lazy', decoding: 'async' }),
      c.divulgacao ? el('figcaption', { texto: FT.creditoDaPeca(c) }) : null);
    if (velho) velho.replaceWith(novo);
    else lado.prepend(novo);
    lado.classList.add('com-cartaz');
  }

  // A barra fixa (R9, R27): à esquerda o preço e, com venda online, "Comprar"
  // (sem preço, "Ver ingressos"); preço lido sem link aparece sozinho; preço
  // conferido há mais de 72 h sai da barra. À direita, "Mandar pro grupo".
  function barraDaFesta(o, ex) {
    const f = o.festa;
    const p = FT.preco(f);
    const velho = FT.precoVelho(f);
    const mandar = el('button', { type: 'button', class: 'botao barra-mandar' }, 'Mandar pro grupo', avanco());
    mandar.addEventListener('click', () => {
      contar('mandar', idReal(f));
      estado.mandar = o;
      ir('mandar');
    });
    let esquerda = null;
    if (p.compra && !velho && p.valor !== null) {
      esquerda = linkFora(p.url, null, p.servico, ex, 'barra-preco barra-comprar');
      esquerda.replaceChildren(
        el('span', { class: 'barra-preco-valor', texto: p.curto || p.texto }),
        el('span', { class: 'barra-comprar-rotulo' }, el('span', { texto: 'Comprar' }), seta()));
      esquerda.setAttribute('aria-label', `Comprar ingresso no ${p.servico}, ${p.texto}, abre fora do finde`);
    } else if (p.compra && velho) {
      // Preço velho fora da barra: a compra continua no bloco do ingresso.
      esquerda = null;
    } else if (p.compra) {
      esquerda = linkFora(p.url, null, p.servico, ex, 'barra-preco barra-comprar');
      esquerda.replaceChildren(el('span', { class: 'barra-comprar-rotulo barra-comprar-rotulo--so' }, el('span', { texto: 'Ver ingressos' }), seta()));
      esquerda.setAttribute('aria-label', `Ver ingressos no ${p.servico}, abre fora do finde`);
    } else if (!velho && p.tipo !== 'sem-preco') {
      const curto = { porta: ['na porta', p.curto], gratis: ['entrada', 'Grátis'], esgotado: ['ingresso', 'Esgotado'], online: ['ingresso', p.curto || p.texto] }[p.tipo] || ['ingresso', p.texto];
      esquerda = el('p', { class: 'barra-preco' },
        el('span', { class: 'barra-preco-valor', texto: curto[1] }),
        el('span', { class: 'barra-preco-rotulo', texto: curto[0] }));
    }
    return el('div', { class: esquerda ? 'barra' : 'barra barra--so', role: 'region', 'aria-label': 'Ações da festa' }, esquerda, mandar);
  }

  // ------------------------------------------------------------ mandar pro grupo

  function dataCurta(iso, dia) {
    const d0 = DIA[dia] || { curto: '' };
    if (!iso) return d0.curto;
    const [, m, d] = iso.split('-').map(Number);
    return `${d0.curto ? `${d0.curto}, ` : ''}${d} ${MESES[m - 1]}`;
  }

  // A mensagem do grupo em texto corrido, sem caixa alta: a hora abre a
  // linha da festa (FT.mensagem).
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
      // O id do convite criado fica sempre, com nome ou sem: é por ele que o
      // medir.js sabe que quem abre o convite é quem o criou.
      if (id) meus[id] = nome || meus[id] || '';
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
  // neutro, tirado da própria festa (o dia dela, qualquer bairro, preço e
  // som), para nada no convite dizer que ela fura.
  function pedidoNeutro(f) {
    const janela = f.inicio < 19 ? 'fim-de-tarde' : f.inicio < 22 ? 'comeco-da-noite' : 'noite';
    return { dia: f.dia, janela, bairros: [], teto: 'sem-limite', estilos: [] };
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
      contar('convite');
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

  // O rodapé diz a verdade sobre as festas: com festa real no servidor, as
  // fictícias são exemplos marcados.
  const notaDoForm = (form) => definirNota(form && form.exemplos === false ? 'reais' : form && form.misto ? 'misto' : 'ficticias');

  async function iniciar() {
    estado.form = lerDadosIniciais();
    notaDoForm(estado.form);
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
    const busca = new URLSearchParams(window.location.search);
    // O QR Code de divulgação começa sempre pelas perguntas (26/11/2026),
    // mesmo o impresso com ?ver=lista. O medir.js já tirou o ?de= do
    // endereço e guarda a origem em FindeMedir.chegouDe.
    const deQr = busca.get('de') === 'qr' || Boolean(window.FindeMedir && window.FindeMedir.chegouDe === 'qr');
    const verLista = busca.get('ver') === 'lista' && !deQr;
    // Quem chega pela lista sem nada respondido nesta aba (o amigo do
    // convite) vê a lista do dia, sem as perguntas.
    if (verLista && chegouPorLink() && !(estado.resultado && estado.criterios)) {
      if (abrirListaNeutra({ dia: busca.get('dia'), data: busca.get('data') })) {
        if (!estado.form) buscarFormulario();
        return;
      }
    }
    if (chegouPorLink()) {
      const lista = verLista && estado.resultado && estado.criterios;
      Object.assign(estado, { tela: lista ? 'resultado' : 'pergunta', passo: 0, editando: null, festa: null, mandar: null, rolagemLista: 0 });
    }
    // O ?ver=lista sai do endereço, que fica no caminho em que o app está.
    if (busca.get('ver') === 'lista') history.replaceState(history.state, '', window.location.pathname);
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

  // A festa do link não está no Finde (saiu, nunca entrou por ser de outra
  // cidade, ou o link veio torto): "Essa festa não está no Finde." Sem rede:
  // "Não consegui abrir a festa."
  // Festa real que já foi (passou: true): "Essa festa já passou."
  function semFesta(naoTem, passou = false) {
    estado.tela = 'carregando-festa';
    const ver = el('a', { class: 'botao botao--largo', href: '/app?ver=lista', texto: 'Ver festas do fim de semana' });
    const h1 = passou ? titulo('h1', 'titulo titulo--pergunta', 'Essa festa já ', 'passou.')
      : titulo('h1', 'titulo titulo--pergunta', naoTem ? 'Essa festa não está ' : 'Não consegui abrir a ', naoTem ? 'no Finde.' : 'festa.');
    $tela.replaceChildren(el('div', { class: 'tela-pergunta entra' },
      topo(null),
      el('section', { class: 'cabeca' },
        h1,
        el('hr', { class: 'fio' }),
        el('p', { class: 'texto', texto: passou ? 'Ela já aconteceu. Dê uma olhada nas deste fim de semana.' : naoTem ? 'Ela não está na lista do fim de semana. Dê uma olhada nas outras.' : 'A conexão falhou no meio. Recarregue a página para tentar de novo.' })),
      el('div', { class: 'pe' }, ver),
      rodape()));
    h1.focus({ preventScroll: true });
  }

  // O detalhe de uma festa, sem pedido (contrato: GET /api/festa/<id>).
  // "Voltar" leva à landing; "Mandar pro grupo" continua valendo.
  async function abrirAvulsa(id) {
    try {
      localStorage.setItem('finde.explorou', '1');
    } catch { /* tudo bem */ }
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
      semFesta(Boolean(r && r.status === 404), Boolean(r && r.dados && r.dados.passou));
      return;
    }
    // Link direto (a demo da landing, um link copiado) também é detalhe
    // aberto; conta quando a festa chega, para levar o id dela.
    contar('detalhe', idReal(o.festa));
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
    notaDoForm(estado.form);
    if (estado.tela === 'pergunta') desenhar({ focar: false, entrar: false });
  }
  window.addEventListener('online', () => {
    if (!estado.form) buscarFormulario();
  });

  iniciar();
})();

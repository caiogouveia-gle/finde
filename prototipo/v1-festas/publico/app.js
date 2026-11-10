'use strict';
// O app do Finde: boas-vindas, formulário de cinco perguntas (uma por tela),
// resultado que vira conversa e o convite pro grupo.

(() => {
  const {
    el, titulo, chamar, marca, lockup, rodape, quandoGrande, reduzir, hora, anunciar, idadeOrigem, mediaFalada, manterVisivel,
    linkFora, cartaz, ausente, blocoOnde, blocoIngresso, blocoLinks,
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
  const AVANCO_MS = 220;
  // Depois de trocar de tela, um toque não vale por este tempo. Com movimento
  // reduzido o avanço é imediato, então a trava soma o atraso que ele não teve:
  // nos dois modos, um segundo toque até uns 650 ms depois do primeiro é engolido.
  const TRAVA_MS = 450;
  const trava = () => TRAVA_MS + (reduzir.matches ? AVANCO_MS : 0);
  const SESSAO = 'finde.sessao';

  const estado = {
    form: null,
    respostas: { dia: null, janela: null, bairros: [], idade: null, teto: null, estilos: [] },
    tela: 'inicio',
    passo: 0,
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

  function ir(tela, { passo = 0, substituir = false } = {}) {
    clearTimeout(estado.avancoPendente);
    if (estado.tela === 'resultado' && tela !== 'resultado') estado.rolagemLista = window.scrollY;
    estado.tela = tela;
    estado.passo = passo;
    const s = { tela, passo, editando: estado.editando };
    if (substituir) history.replaceState(s, '');
    else history.pushState(s, '');
    desenhar();
  }

  window.addEventListener('popstate', (e) => {
    // "Voltar" logo depois de um toque não é desfeito pelo avanço agendado.
    clearTimeout(estado.avancoPendente);
    const s = e.state || { tela: 'inicio', passo: 0 };
    let { tela } = s;
    let passo = s.passo || 0;
    const veioDoDetalhe = estado.tela === 'festa' || estado.tela === 'mandar';
    if (tela === 'festa' && !estado.festa) tela = 'resultado';
    if ((tela === 'resultado' && !estado.resultado) || (tela === 'mandar' && !estado.mandar)) tela = 'inicio';
    if (tela === 'pergunta' && !estado.form) tela = 'inicio';
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
      desenhar({ focar: false, rolagem: estado.rolagemLista });
      const b = $tela.querySelector(`[data-festa="${CSS.escape(id)}"] .festa-abrir`);
      if (b) b.focus({ preventScroll: true });
      return;
    }
    desenhar();
  });

  // entrar: a tela chega com um fade curto, só no que muda. Depois de um
  // ajuste, nada pisca: só as festas novas aparecem.
  function desenhar({ focar = true, entrar = true, travar = entrar, rolagem = 0 } = {}) {
    const telas = { inicio: telaInicio, pergunta: telaPergunta, resultado: telaResultado, festa: telaFesta, mandar: telaMandar };
    const conteudo = (telas[estado.tela] || telaInicio)();
    if (entrar) conteudo.classList.add('entra');
    $tela.replaceChildren(conteudo);
    document.body.dataset.tela = estado.tela;
    if (entrar) window.scrollTo(0, rolagem);
    if (focar) {
      const alvo = $tela.querySelector('[data-foco]') || $tela.querySelector('h1');
      if (alvo) alvo.focus({ preventScroll: true });
    }
    posicionar($tela);
    // A trava conta a partir do quadro pintado: com CPU lenta, o desenho leva
    // tempo, e o segundo toque de um toque duplo ainda cai na tela nova.
    if (travar) {
      travaAte = performance.now() + trava();
      requestAnimationFrame(() => { travaAte = Math.max(travaAte, performance.now() + trava()); });
    }
    salvar();
  }

  document.addEventListener('finde:tema', () => {
    if (estado.tela === 'inicio' && $tela.firstChild) desenhar({ focar: false, entrar: false });
  });

  function topo(direita) {
    return el('header', { class: 'topo' }, marca(), direita || null);
  }

  // Recomeçar: zera o pedido, a conversa, a lista e a festa aberta, e volta à
  // pergunta 1. Os convites já criados ficam (o mesmo link reabre).
  function botaoRecomecar() {
    const b = el('button', { type: 'button', class: 'botao-texto', texto: 'Recomeçar', 'aria-label': 'Recomeçar o pedido do zero' });
    b.addEventListener('click', recomecar);
    return b;
  }

  function recomecar() {
    if (estado.ocupado) return;
    clearTimeout(estado.avancoPendente);
    Object.assign(estado, {
      respostas: { dia: null, janela: null, bairros: [], idade: null, teto: null, estilos: [] },
      editando: null, criterios: null, resultado: null, fala: null, novas: [], mandar: null, festa: null, rolagemLista: 0,
    });
    // O histórico também recomeça: voltar da pergunta 1 leva ao início, nunca à lista velha.
    history.replaceState({ tela: 'inicio', passo: 0 }, '');
    ir('pergunta', { passo: 0 });
  }

  function botaoVoltar() {
    const b = el('button', { type: 'button', class: 'botao-texto', texto: 'Voltar' });
    b.addEventListener('click', () => history.back());
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

  // ------------------------------------------------------------ boas-vindas

  function proximaPista() {
    const p = estado.form && estado.form.proxima;
    return el('div', { class: 'proxima', id: 'proxima' },
      el('p', { class: 'rotulo', texto: p ? p.linha : 'Abrindo a pista…' }),
      el('p', { class: 'proxima-nome', texto: p ? p.nome : ' ' }),
      el('p', { class: 'proxima-origem', texto: p && p.origem ? `Média ${p.origem}.` : ' ' }));
  }

  function telaInicio() {
    const noite = document.documentElement.dataset.tema === 'noite' && window.FindeTema && window.FindeTema.pelaHora() === 'noite';
    const ver = el('button', { type: 'button', id: 'ver-festas', class: 'botao botao--largo', texto: 'Ver festas do fim de semana' });
    ver.addEventListener('click', () => {
      if (!estado.form) return;
      estado.editando = null;
      ir('pergunta', { passo: 0 });
    });
    if (!estado.form) ver.disabled = true;
    return el('div', { class: 'tela-inicio' },
      lockup('', 'p', false),
      el('section', { class: 'abre' },
        el('p', { class: 'rotulo', texto: noite ? 'Hoje à noite' : 'Sex a dom · a partir das 17h00' }),
        (() => { const h = titulo('h1', 'titulo titulo--abre', 'still going out. ', 'just differently.'); h.lang = 'en'; return h; })(),
        el('hr', { class: 'fio' }),
        el('p', {
          class: 'texto',
          texto: noite ? 'Ainda dá tempo: festas com gente da sua fase e hora boa pra voltar.' : 'Festas que começam no fim da tarde, com gente da sua fase.',
        })),
      proximaPista(), ver,
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

    const form = el('form', { class: 'tela-pergunta', novalidate: true },
      topo(botaoVoltar()),
      editando ? null : el('div', { class: 'progresso', 'aria-hidden': 'true' },
        PERGUNTAS.map((_, j) => el('span', { class: j < i ? 'feito' : j === i ? 'atual' : null }))),
      el('div', { class: 'espaco' }),
      el('div', { class: 'cabeca-pergunta' },
        el('p', { class: 'rotulo', texto: editando ? 'Ajustar o pedido' : `${i + 1} de ${PERGUNTAS.length}` }),
        h1,
        p.dica ? el('p', { class: 'dica', id: `${idTitulo}-dica`, texto: p.dica }) : null),
      lista,
      el('div', { class: 'pe' }, continuar, el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' })));
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
    function pintar() {
      valor.textContent = `${v.min} a ${anos(v.max)}`;
      pMin.style.left = pos(v.min);
      pMax.style.left = pos(v.max);
      sel.style.left = pos(v.min);
      sel.style.width = `calc(${pos(v.max)} - ${pos(v.min)})`;
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
    ir('pergunta', { passo: PERGUNTAS.findIndex((p) => p.chave === chave) });
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
    mostrarErro('');
    const soltar = esperar(botao, 'Buscando…');
    let r;
    try {
      r = await chamar('/api/festas', { criterios });
    } catch {
      r = null;
    }
    estado.ocupado = false;
    if (!r || !r.ok || !r.dados) {
      soltar();
      if (r && r.dados && r.dados.faltam) {
        ir('pergunta', { passo: Math.max(0, primeiraSemResposta()) });
        return;
      }
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toca de novo.');
      return;
    }
    estado.criterios = r.dados.criterios;
    estado.resultado = r.dados;
    estado.fala = { voce: null, finde: r.dados.resposta };
    estado.novas = [];
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

  // Uma entrada da programação: hora, média e origem à esquerda; à direita o
  // nome, o aviso quando fura o pedido, o bairro com o preço e o porquê. Só o
  // que serve para escolher (R2). O item inteiro abre o detalhe: o nome é o
  // botão, e a área de toque dele cobre o item. Não há envio daqui (R3).
  function entrada(o, i, primeiroBloco) {
    const f = o.festa;
    const primeiro = i === 0 && primeiroBloco;
    const nova = estado.novas.includes(f.id);
    const abrir = el('button', { type: 'button', class: 'festa-abrir', texto: f.nome, 'aria-describedby': `linha-${f.id}` });
    abrir.addEventListener('click', () => abrirFesta(o));
    const aviso = typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso.trim() : '';
    // O que o aviso já disse não se repete no porquê.
    const dito = aviso.toLocaleLowerCase('pt-BR');
    const motivos = (o.motivos || []).filter((m) => !dito || !dito.includes(String(m).toLocaleLowerCase('pt-BR')));
    const lido = [o.linha, mediaFalada(f), FT.precoNaLista(f), o.patrocinada ? 'patrocinado' : null, nova ? 'nova na lista' : null].filter(Boolean).join(' · ');
    return el('li', { class: `festa${nova ? ' nova' : ''}`, 'data-festa': f.id },
      el('div', { class: 'festa-quando', 'aria-hidden': 'true' },
        hora(o.hora),
        num(f.esquenta) ? el('span', { class: 'enche', texto: `enche ${rotuloHora(f.esquenta)}` }) : null,
        el('span', { class: 'media', texto: Number.isInteger(f.mediaIdade) ? `média ${f.mediaIdade}` : 'média não informada' }),
        f.origemIdadeCurta ? el('span', { class: 'idade-origem', texto: f.origemIdadeCurta }) : idadeOrigem(f),
        o.patrocinada ? el('span', { class: 'marca-lateral', texto: 'Patrocinado' })
          : nova ? el('span', { class: 'marca-lateral nova-marca', texto: 'Nova' }) : null),
      el('div', { class: 'festa-o-que' },
        el('p', { class: 'vh', id: `linha-${f.id}`, texto: lido }),
        el('h2', { class: 'nome' }, abrir),
        aviso ? el('p', { class: 'festa-aviso', texto: semQuebraNoPreco(aviso) }) : null,
        // O "·" vai preso ao preço, para nunca ficar pendurado no fim da linha.
        el('p', { class: 'onde', 'aria-hidden': 'true' }, `${o.bairro} `, el('span', { class: 'onde-preco', texto: `· ${FT.precoNaLista(f)}`.replace(/R\$ /g, 'R$\u00a0') })),
        motivos.length ? el('p', { class: 'porque' },
          el('span', { class: 'vh', texto: 'Por que esta: ' }),
          // O "·" vai preso ao motivo seguinte, nunca pendurado no fim da linha.
          motivos.flatMap((m, i) => [i ? ' ' : null, el('span', { class: 'item', texto: `${i ? '· ' : ''}${semQuebraNoPreco(m)}` })])) : null,
        // O sinal visível de que o item abre: só no primeiro da lista.
        primeiro ? el('span', { class: 'ver', 'aria-hidden': 'true', texto: 'Ver a festa' }) : null));
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
    return grupos.map((g, gi) => {
      const id = `bloco-${g.bloco}`;
      const nome = NOME_BLOCO[g.bloco];
      return el('section', { class: `bloco-lista bloco-lista--${g.bloco}`, 'aria-labelledby': nome ? id : null },
        nome ? el('h2', { class: 'rotulo bloco-rotulo', id, texto: nome }) : null,
        el('ol', { class: 'festas', 'aria-label': nome ? null : 'Festas, em ordem de horário. Toque numa para ver o detalhe.' }, g.itens.map((o, i) => entrada(o, i, gi === 0))));
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
    return lista.map(([rotulo, frase]) => {
      const b = el('button', { type: 'button', class: 'link', texto: rotulo });
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
        local.textContent = 'Escreve o que quer mudar. Tipo: mais cedo.';
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
    let r;
    try {
      r = await chamar('/api/conversa', { criterios: estado.criterios, texto, atuais });
    } catch {
      r = null;
    }
    estado.ocupado = false;
    soltar();
    if ($tela) $tela.removeAttribute('aria-busy');
    if (!r || !r.ok || !r.dados) {
      trocarResultado();
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toca de novo.');
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
    const furos = (o.fora || []).filter((x) => !/da sua faixa$/.test(x));
    const aviso = furos.length ? `${furos.join('; ').replace(/^./, (x) => x.toUpperCase())}.` : '';
    const ate = j ? (j[1] % 24 === 0 ? 'à meia-noite' : `${j[1] % 24 < 2 ? 'à' : 'às'} ${rotuloHora(j[1])}`) : '';
    // O encaixe diz o que a régua mostra: a festa que começa antes da janela
    // (o motor aceita pela pista cheia) não "cabe", começa antes.
    const suaJanela = j ? `sua janela, das ${rotuloHora(j[0])} ${ate}` : '';
    let encaixe = aviso;
    if (!encaixe && j) {
      if (f.inicio < j[0]) encaixe = `Começa ${asHoras(f.inicio)}, antes da ${suaJanela}; a pista enche ${asHoras(f.esquenta)}.`;
      else encaixe = `Cabe na ${suaJanela}.`;
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
      encaixe ? el('p', { class: `detalhe-encaixe${aviso ? ' detalhe-encaixe--fura' : ''}`, texto: encaixe }) : null,
      // A média contra a faixa pedida, de onde ela vem e quando foi conferida (R5).
      // A régua da média, logo abaixo de onde ela vem, e o encaixe na faixa.
      el('div', { class: 'detalhe-media' },
        reguaIdade(f),
        el('p', { class: 'media-origem' },
          m.ausente ? m.frase : `${m.origem ? m.origem.replace(/^./, (x) => x.toLocaleUpperCase('pt-BR')) : 'Origem não informada'}${m.quando ? `, ${m.quando}` : ''}.`),
        m.ausente ? null : el('p', { class: 'idade-encaixe', texto: encaixeIdade(f) })));

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
    const fx = estado.criterios && estado.criterios.idade;
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
    const fx = estado.criterios && estado.criterios.idade;
    if (!fx) return '';
    // Os números da faixa ficam nas pontas do colchete, logo acima.
    const fora = f.mediaIdade < fx.min ? fx.min - f.mediaIdade : f.mediaIdade > fx.max && fx.max < 50 ? f.mediaIdade - fx.max : 0;
    const faixa = `de ${fx.min} a ${fx.max}${fx.max >= 50 ? ' ou mais' : ''}`;
    if (!fora) return `Dentro da sua faixa, ${faixa}.`;
    return `${fora} ${fora === 1 ? 'ano' : 'anos'} ${f.mediaIdade < fx.min ? 'abaixo' : 'acima'} da sua faixa, ${faixa}.`;
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
        el('span', { class: 'barra-preco-rotulo barra-comprar-rotulo', texto: 'Comprar' }));
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

  function linhasDaMensagem(o, link, data) {
    const f = o.festa;
    return [
      'Achei essa, bora?',
      '',
      `${dataCurta(data, f.dia)} · ${o.hora} · ${o.bairro}`.toLocaleUpperCase('pt-BR'),
      f.nome,
      `${f.casa} · ${FT.precoNaLista(f)}`,
      Number.isInteger(f.mediaIdade) ? `Média de ${f.mediaIdade} anos${typeof f.origemIdade === 'string' && f.origemIdade ? `, ${f.origemIdade}` : ''}.` : 'Média de idade ainda não informada.',
      '',
      'Diz aqui se você tá dentro:',
      link,
    ];
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

  // A tela de mandar já é a prévia do convite: "Convite de [nome]", o título e
  // a festa. O convite criado fica lembrado por festa: voltar e mandar de novo
  // reabre o mesmo link.
  function telaMandar() {
    const o = estado.mandar;
    const f = o.festa;
    const d = DIA[f.dia];
    const convite = estado.convites[f.id];
    const nome = convite
      ? el('span', { class: 'nome-fixo', texto: convite.autor || 'você' })
      : el('input', {
        id: 'seu-nome', class: 'campo-nome', type: 'text', maxlength: '24', autocomplete: 'given-name',
        placeholder: 'seu nome', value: lerNome(), enterkeyhint: 'done', 'aria-label': 'Seu nome, opcional', 'data-foco': '',
      });

    return el('div', { class: 'tela-mandar' },
      topo(botaoVoltar()),
      el('section', { class: 'cabeca' },
        el('p', { class: 'de-quem' }, el('span', { class: 'rotulo', texto: 'Convite de' }), nome),
        convite ? null : el('p', { class: 'dica-nome', texto: 'Com seu nome, você já entra na lista.' }),
        titulo('h1', 'titulo titulo--pergunta', `Bora ${d.no} `, `${d.nome}?`),
        el('hr', { class: 'fio' })),
      el('article', { class: 'festa-convite', 'aria-labelledby': 'nome-festa' },
        el('p', { class: 'vh', texto: `${o.linha.replace(/ · média \d+ anos$/, '')}, ${mediaFalada(f)}` }),
        quandoGrande(o),
        el('h2', { class: 'nome', id: 'nome-festa', texto: f.nome }),
        el('p', { class: 'onde', texto: `${f.casa} · ${FT.precoNaLista(f)} · ${f.produtora}` }),
        el('p', { class: 'sobre', texto: [o.horario, f.frase].filter(Boolean).join(' ') })),
      convite ? blocoConvite(o, convite) : blocoCriar(o, nome),
      rodape());
  }

  function blocoCriar(o, campoNome) {
    const criar = el('button', { type: 'button', class: 'botao botao--largo', texto: 'Criar o convite' });
    const erro = el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' });
    criar.addEventListener('click', async () => {
      if (estado.ocupado) return;
      estado.ocupado = true;
      const soltar = esperar(criar, 'Criando…');
      const autor = campoNome.value.trim();
      let r;
      try {
        r = await chamar('/api/planos', { criterios: estado.criterios, festa: o.festa.id, autor: autor || undefined });
      } catch {
        r = null;
      }
      estado.ocupado = false;
      if (!r || r.status !== 201 || !r.dados) {
        soltar();
        erro.textContent = r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toca de novo.';
        return;
      }
      guardar(autor, r.dados.id);
      estado.convites[o.festa.id] = { id: r.dados.id, url: new URL(r.dados.url, window.location.origin).href, autor, data: r.dados.data };
      desenhar({ focar: false, entrar: false });
      const p = document.getElementById('convite-pronto');
      if (p) p.focus({ preventScroll: true });
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
    const copiar = el('button', { type: 'button', class: 'link', texto: 'Copiar o link' });
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
      el('div', { class: 'links' },
        copiar,
        el('a', { class: 'link', href: new URL(url).pathname, texto: 'Abrir o convite' })),
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

  async function iniciar() {
    estado.form = lerDadosIniciais();
    restaurar();
    // Recarregar devolve a pessoa onde ela estava: o histórico ganha o início
    // embaixo, e a tela salva em cima.
    const voltavel = (estado.tela === 'resultado' && estado.resultado)
      || (estado.tela === 'festa' && estado.festa && estado.resultado)
      || (estado.tela === 'mandar' && estado.mandar && estado.resultado)
      || (estado.tela === 'pergunta' && estado.form);
    history.replaceState({ tela: 'inicio', passo: 0 }, '');
    if (voltavel && estado.tela !== 'inicio') {
      if (estado.tela === 'pergunta') {
        const falta = primeiraSemResposta();
        if (!estado.editando && falta >= 0 && falta < estado.passo) estado.passo = falta;
      }
      // Pergunta: as anteriores ficam embaixo, para o "Voltar" andar uma a uma.
      if (estado.tela === 'pergunta' && !estado.editando) for (let k = 0; k < estado.passo; k++) history.pushState({ tela: 'pergunta', passo: k }, '');
      // Detalhe e envio: a lista fica embaixo, para o voltar levar a ela.
      if (estado.tela === 'festa' || estado.tela === 'mandar') history.pushState({ tela: 'resultado', passo: 0 }, '');
      if (estado.tela === 'mandar' && estado.festa && estado.festa.festa.id === estado.mandar.festa.id) history.pushState({ tela: 'festa', passo: 0 }, '');
      history.pushState({ tela: estado.tela, passo: estado.passo, editando: estado.editando }, '');
      desenhar({ focar: false, travar: false });
    } else {
      estado.tela = 'inicio';
      desenhar({ focar: false, travar: false });
    }
    if (!estado.form) buscarFormulario();
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
    if (estado.tela === 'inicio') desenhar({ focar: false, entrar: false });
  }
  window.addEventListener('online', () => {
    if (!estado.form) buscarFormulario();
  });

  iniciar();
})();

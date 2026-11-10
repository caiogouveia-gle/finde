'use strict';
// O app do Finde: boas-vindas, formulário de cinco perguntas (uma por tela),
// resultado que vira conversa e o convite pro grupo.

(() => {
  const { el, titulo, chamar, marca, lockup, rodape, quandoGrande, casaCurta, reduzir, hora, anunciar, idadeOrigem, mediaFalada, manterVisivel } = window.Finde;
  const $tela = document.getElementById('tela');

  const PERGUNTAS = [
    { chave: 'dia', tipo: 'um', titulo: ['Sair ', 'quando?'], lista: 'dias' },
    { chave: 'janela', tipo: 'um', titulo: ['A que horas chegar e ', 'voltar?'], lista: 'janelas' },
    { chave: 'faixa', tipo: 'um', titulo: ['Gente de que ', 'idade?'], lista: 'faixas' },
    { chave: 'teto', tipo: 'um', titulo: ['Até quanto você quer ', 'gastar?'], lista: 'tetos' },
    { chave: 'estilos', tipo: 'varios', titulo: ['E o ', 'som?'], lista: 'estilos', dica: 'Pode marcar mais de um. Ou nenhum.' },
  ];
  const DIA = {
    sex: { nome: 'sexta', seu: 'pra sua ', no: 'na', curto: 'sex' },
    sab: { nome: 'sábado', seu: 'pro seu ', no: 'no', curto: 'sáb' },
    dom: { nome: 'domingo', seu: 'pro seu ', no: 'no', curto: 'dom' },
  };
  const JANELA = { 'fim-de-tarde': [17, 23], 'comeco-da-noite': [19, 25], noite: [22, 27] };
  const EIXO = { de: 17, ate: 27 };
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
    respostas: { dia: null, janela: null, faixa: null, teto: null, estilos: [] },
    tela: 'inicio',
    passo: 0,
    editando: null,
    criterios: null,
    resultado: null,
    fala: null,
    novas: [],
    mandar: null,
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
    if ((tela === 'resultado' && !estado.resultado) || (tela === 'mandar' && !estado.mandar)) tela = 'inicio';
    if (tela === 'pergunta' && !estado.form) tela = 'inicio';
    if (tela === 'pergunta' && !s.editando) {
      const falta = primeiraSemResposta();
      if (falta >= 0 && falta < passo) passo = falta;
    }
    estado.tela = tela;
    estado.passo = passo;
    estado.editando = tela === 'pergunta' ? s.editando || null : null;
    desenhar();
  });

  // entrar: a tela chega com um fade curto, só no que muda. Depois de um
  // ajuste, nada pisca: só as festas novas aparecem.
  function desenhar({ focar = true, entrar = true, travar = entrar } = {}) {
    const telas = { inicio: telaInicio, pergunta: telaPergunta, resultado: telaResultado, mandar: telaMandar };
    const conteudo = (telas[estado.tela] || telaInicio)();
    if (entrar) conteudo.classList.add('entra');
    if (travar) travaAte = performance.now() + trava();
    $tela.replaceChildren(conteudo);
    document.body.dataset.tela = estado.tela;
    if (entrar) window.scrollTo(0, 0);
    if (focar) {
      const alvo = $tela.querySelector('[data-foco]') || $tela.querySelector('h1');
      if (alvo) alvo.focus({ preventScroll: true });
    }
    posicionar($tela);
    salvar();
  }

  document.addEventListener('finde:tema', () => {
    if (estado.tela === 'inicio' && $tela.firstChild) desenhar({ focar: false, entrar: false });
  });

  function topo(direita) {
    return el('header', { class: 'topo' }, marca(), direita || null);
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
    return p.tipo === 'varios' ? true : v !== null && v !== undefined;
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
    const lista = el('div', {
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

  // ------------------------------------------------------------ resultado

  function criteriosDoFormulario() {
    const r = estado.respostas;
    return { dia: r.dia, janela: r.janela, faixa: r.faixa, teto: r.teto, estilos: r.estilos };
  }

  // Um trecho do pedido reabre só aquela pergunta.
  function abrirParaEditar(chave) {
    const c = estado.criterios;
    estado.respostas = { dia: c.dia, janela: c.janela, faixa: c.faixa, teto: c.teto, estilos: [...c.estilos] };
    estado.editando = chave;
    ir('pergunta', { passo: PERGUNTAS.findIndex((p) => p.chave === chave) });
  }

  // Depois de mudar uma pergunta: o resto do que foi conversado continua valendo.
  function reabrirResultado(chave, botao) {
    const dim = { janela: 'horario', teto: 'preco', faixa: 'idade' }[chave];
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
    if (!estado.editando && falta >= 0 && ['dia', 'janela', 'faixa', 'teto'].some((k) => criterios[k] === null || criterios[k] === undefined)) {
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
    const n = typeof r.atendem === 'number' ? r.atendem : r.opcoes.length;
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

  // A linha do tempo de uma festa, no eixo comum: a janela pedida, a festa
  // inteira, a pista cheia e as horas de começo e fim.
  function linhaDoTempo(f) {
    if (!num(f.inicio) || !num(f.fim)) return null;
    const faixa = (classe, de, ate) => el('span', { class: classe, 'data-l': pct(noEixo(de)), 'data-w': pct(Math.max(0, noEixo(ate) - noEixo(de))) });
    const ponto = (classe, h, texto) => el('span', { class: classe, 'data-l': pct(noEixo(h)), texto });
    const j = janelaPedida();
    return el('div', { class: 'linha-tempo', 'aria-hidden': 'true' },
      j ? faixa('lt-janela', j[0], j[1]) : null,
      faixa('lt-festa', f.inicio, f.fim),
      num(f.esquenta) ? ponto('lt-pico', f.esquenta) : null,
      ponto('lt-rotulo lt-rotulo--inicio', f.inicio, rotuloHora(f.inicio)),
      ponto('lt-rotulo lt-rotulo--fim', f.fim, rotuloHora(f.fim)));
  }

  // Posição pelo CSSOM (a CSP não deixa atributo style).
  function posicionar(raiz) {
    for (const s of raiz.querySelectorAll('[data-l]')) {
      s.style.left = s.dataset.l;
      if (s.dataset.w) s.style.width = s.dataset.w;
    }
  }

  // Uma entrada da programação: hora, média e origem à esquerda; à direita o
  // nome, o aviso quando fura o pedido, onde, a frase do curador, a linha do
  // tempo, o porquê e o envio.
  function entrada(o) {
    const f = o.festa;
    const nova = estado.novas.includes(f.id);
    const mandar = el('button', { type: 'button', class: 'link', texto: 'Mandar pro grupo' });
    mandar.setAttribute('aria-label', `Mandar ${f.nome} pro grupo`);
    mandar.addEventListener('click', () => {
      estado.mandar = o;
      ir('mandar');
    });
    const aviso = typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso.trim() : '';
    // O que o aviso já disse não se repete no porquê.
    const dito = aviso.toLocaleLowerCase('pt-BR');
    const motivos = (o.motivos || []).filter((m) => !dito || !dito.includes(String(m).toLocaleLowerCase('pt-BR')));
    const lido = [o.linha, mediaFalada(f), o.patrocinada ? 'patrocinado' : null, nova ? 'nova na lista' : null].filter(Boolean).join(' · ');
    return el('li', { class: `festa${nova ? ' nova' : ''}` },
      el('div', { class: 'festa-quando', 'aria-hidden': 'true' },
        hora(o.hora),
        el('span', { class: 'media', texto: `média ${f.mediaIdade}` }),
        idadeOrigem(f),
        o.patrocinada ? el('span', { class: 'marca-lateral', texto: 'Patrocinado' })
          : nova ? el('span', { class: 'marca-lateral nova-marca', texto: 'Nova' }) : null),
      el('article', { class: 'festa-o-que', 'aria-labelledby': `festa-${f.id}`, 'aria-describedby': `linha-${f.id}` },
        el('p', { class: 'vh', id: `linha-${f.id}`, texto: lido }),
        el('h2', { class: 'nome', id: `festa-${f.id}`, texto: f.nome }),
        aviso ? el('p', { class: 'festa-aviso', texto: aviso }) : null,
        el('p', { class: 'onde', texto: `${casaCurta(f.casa)} · ${o.bairro} · ${o.preco}` }),
        el('p', { class: 'frase', texto: f.frase }),
        linhaDoTempo(f),
        motivos.length ? el('p', { class: 'porque' },
          el('span', { class: 'vh', texto: 'Por que esta: ' }),
          motivos.flatMap((m, i) => [i ? ' · ' : null, el('span', { class: 'item', texto: m })])) : null,
        mandar));
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
      lista.push(c.perto !== 'pinheiros' ? ['mais perto de Pinheiros', 'tem alguma mais perto de Pinheiros?'] : ['mais perto do Centro', 'tem alguma mais perto do Centro?']);
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
      estado.fala.finde ? el('p', { class: 'fala-finde' }, el('span', { class: 'vh', texto: 'Finde: ' }), estado.fala.finde) : null,
      oferta);

    const lista = el('div', { class: 'lista', id: 'lista-festas' }, r.opcoes.length
      ? [
        el('p', { class: 'legenda', 'aria-hidden': 'true' },
          el('span', { class: 'amostra-janela' }), 'sua janela', ' · ', el('span', { class: 'amostra-pista' }), 'pista cheia'),
        el('ol', { class: 'festas', 'aria-label': 'Festas, em ordem de horário' }, r.opcoes.map(entrada)),
      ]
      : null);

    const campo = el('input', {
      id: 'campo', class: 'campo', type: 'text', name: 'texto', maxlength: '300', autocomplete: 'off',
      enterkeyhint: 'send', placeholder: 'algo perto da Paulista, até 23h', autocapitalize: 'sentences',
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
      topo(),
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
      `${f.casa} · ${o.preco}`,
      `Média de ${f.mediaIdade} anos${typeof f.origemIdade === 'string' && f.origemIdade ? `, ${f.origemIdade}` : ''}.`,
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
        el('p', { class: 'vh', texto: `${o.linha}, ${mediaFalada(f)}` }),
        quandoGrande(o),
        el('h2', { class: 'nome', id: 'nome-festa', texto: f.nome }),
        el('p', { class: 'onde', texto: `${f.casa} · ${o.preco} · ${f.produtora}` }),
        el('p', { class: 'sobre', texto: `${o.horario} ${f.frase}` })),
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
      || (estado.tela === 'mandar' && estado.mandar && estado.resultado)
      || (estado.tela === 'pergunta' && estado.form);
    history.replaceState({ tela: 'inicio', passo: 0 }, '');
    if (voltavel && estado.tela !== 'inicio') {
      if (estado.tela === 'pergunta') {
        const falta = primeiraSemResposta();
        if (!estado.editando && falta >= 0 && falta < estado.passo) estado.passo = falta;
      }
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

'use strict';
// O app do Finde: boas-vindas, formulário de cinco perguntas (uma por tela),
// resultado que vira conversa e o convite pro grupo.

(() => {
  const { el, titulo, chamar, marca, lockup, rodape, quandoGrande, casaCurta, reduzir } = window.Finde;
  const $tela = document.getElementById('tela');

  const PERGUNTAS = [
    { chave: 'dia', tipo: 'um', titulo: ['Sair ', 'quando?'], lista: 'dias' },
    { chave: 'janela', tipo: 'um', titulo: ['A que horas chegar e ', 'voltar?'], lista: 'janelas' },
    { chave: 'faixa', tipo: 'um', titulo: ['Gente de que ', 'idade?'], lista: 'faixas' },
    { chave: 'teto', tipo: 'um', titulo: ['Até quanto você quer ', 'gastar?'], lista: 'tetos' },
    { chave: 'estilos', tipo: 'varios', titulo: ['E o ', 'som?'], lista: 'estilos', dica: 'Pode marcar mais de um. Ou nenhum.' },
  ];
  const DIA = {
    sex: { nome: 'sexta', seu: 'pra sua ', no: 'na' },
    sab: { nome: 'sábado', seu: 'pro seu ', no: 'no' },
    dom: { nome: 'domingo', seu: 'pro seu ', no: 'no' },
  };
  const NUMERAL = ['Nada', 'Uma', 'Duas', 'Três'];
  const AVANCO_MS = 220;
  const REGUA = { de: 17, ate: 27, marcas: [17, 19, 21, 23, 25, 27] };

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
    convite: null,
    ocupado: false,
  };

  // ------------------------------------------------------------ navegação

  function ir(tela, { passo = 0, substituir = false } = {}) {
    estado.tela = tela;
    estado.passo = passo;
    const s = { tela, passo, editando: estado.editando };
    if (substituir) history.replaceState(s, '');
    else history.pushState(s, '');
    desenhar();
  }

  window.addEventListener('popstate', (e) => {
    const s = e.state || { tela: 'inicio', passo: 0 };
    let { tela } = s;
    if ((tela === 'resultado' && !estado.resultado) || (tela === 'mandar' && !estado.mandar)) tela = 'inicio';
    if (tela === 'pergunta' && !estado.form) tela = 'inicio';
    estado.tela = tela;
    estado.passo = s.passo || 0;
    estado.editando = tela === 'pergunta' ? s.editando || null : null;
    desenhar();
  });

  // entrar: a tela chega com um fade curto. Depois de um ajuste, nada pisca:
  // só as festas novas aparecem.
  function desenhar({ focar = true, entrar = true } = {}) {
    const telas = { inicio: telaInicio, pergunta: telaPergunta, resultado: telaResultado, mandar: telaMandar };
    const conteudo = (telas[estado.tela] || telaInicio)();
    if (entrar) conteudo.classList.add('entra');
    $tela.replaceChildren(conteudo);
    document.body.dataset.tela = estado.tela;
    if (entrar) window.scrollTo(0, 0);
    if (focar) {
      const h = $tela.querySelector('h1');
      if (h) h.focus({ preventScroll: true });
    }
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

  // ------------------------------------------------------------ boas-vindas

  function telaInicio() {
    const noite = document.documentElement.dataset.tema === 'noite';
    const ver = el('button', { type: 'button', id: 'ver-festas', class: 'botao botao--largo', texto: 'Ver festas do fim de semana' });
    ver.addEventListener('click', () => {
      if (!estado.form) return;
      estado.editando = null;
      ir('pergunta', { passo: 0 });
    });
    if (!estado.form) ver.disabled = true;

    const p = estado.form && estado.form.proxima;
    const proxima = el('div', { class: 'proxima', id: 'proxima' },
      el('p', { class: 'rotulo', texto: p ? p.linha : 'Abrindo a pista…' }),
      p ? el('p', { class: 'proxima-nome', texto: p.nome }) : null);

    if (noite) {
      // Splash negativo do manual: o lockup no centro.
      return el('div', { class: 'tela-inicio tela-inicio--noite' },
        lockup(),
        proxima, ver,
        rodape());
    }
    const marcaTopo = lockup();
    const h = marcaTopo.querySelector('h1');
    h.replaceWith(el('p', { class: 'marca' }, 'finde', el('span', { class: 'ponto', 'aria-hidden': 'true', texto: '.' })));
    return el('div', { class: 'tela-inicio' },
      marcaTopo,
      el('section', { class: 'abre' },
        el('p', { class: 'rotulo', texto: 'Sex a dom · a partir das 17h' }),
        titulo('h1', 'titulo titulo--abre', 'A pista abre ', 'antes.'),
        el('hr', { class: 'fio' }),
        el('p', { class: 'texto', texto: 'Festas que começam no fim da tarde, com gente da sua fase.' })),
      proxima, ver,
      rodape());
  }

  // ------------------------------------------------------------ formulário

  const valorDe = (chave) => estado.respostas[chave];

  function respondida(p) {
    const v = valorDe(p.chave);
    return p.tipo === 'varios' ? true : v !== null && v !== undefined;
  }

  function avancar() {
    const p = PERGUNTAS[estado.passo];
    if (!respondida(p)) return;
    if (estado.editando) {
      reabrirResultado(p.chave);
      return;
    }
    if (estado.passo < PERGUNTAS.length - 1) ir('pergunta', { passo: estado.passo + 1 });
    else buscarFestas(criteriosDoFormulario());
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
    // pergunta já tinha resposta (ao voltar) ou com foco de teclado.
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

    let avancoPendente = null;
    const lista = el('div', {
      class: 'opcoes',
      role: p.tipo === 'um' ? 'radiogroup' : 'group',
      'aria-labelledby': idTitulo,
      'aria-describedby': p.dica ? `${idTitulo}-dica` : null,
    }, opcoes.map((o) => {
      const marcado = p.tipo === 'um' ? String(valorDe(p.chave)) === String(o.id) : valorDe(p.chave).includes(o.id);
      const input = el('input', { type: p.tipo === 'um' ? 'radio' : 'checkbox', name: p.chave, value: String(o.id), checked: marcado });
      input.addEventListener('change', () => {
        if (p.tipo === 'um') {
          estado.respostas[p.chave] = o.id;
          continuar.removeAttribute('data-oculto');
        } else {
          const atual = new Set(valorDe('estilos'));
          if (input.checked) atual.add(o.id);
          else atual.delete(o.id);
          estado.respostas.estilos = opcoes.map((x) => x.id).filter((id) => atual.has(id));
        }
        atualizarBotao();
      });
      // Toque ou clique numa resposta única avança sozinho. Teclado (setas,
      // espaço) não avança: a pessoa confirma com Enter ou com o botão.
      input.addEventListener('click', (e) => {
        if (p.tipo !== 'um' || e.detail === 0) return;
        clearTimeout(avancoPendente);
        avancoPendente = setTimeout(avancar, reduzir.matches ? 0 : AVANCO_MS);
      });
      const [principal, detalhe] = String(o.rotulo).split(' · ');
      return el('label', { class: `opcao opcao--${p.tipo}` },
        input,
        el('span', { class: 'marcador', 'aria-hidden': 'true' }),
        el('span', { class: 'opcao-nome', texto: principal }),
        detalhe ? el('span', { class: 'opcao-detalhe', texto: detalhe }) : el('span'));
    }));

    const form = el('form', { class: 'tela-pergunta', novalidate: true },
      topo(botaoVoltar()),
      editando ? null : el('div', { class: 'progresso', 'aria-hidden': 'true' },
        PERGUNTAS.map((_, j) => el('span', { class: j <= i ? 'feito' : null }))),
      el('div', { class: 'espaco' }),
      el('div', { class: 'cabeca-pergunta' },
        el('p', { class: 'rotulo', texto: editando ? 'Ajustar o pedido' : `${i + 1} de ${PERGUNTAS.length}` }),
        h1,
        p.dica ? el('p', { class: 'dica', id: `${idTitulo}-dica`, texto: p.dica }) : null),
      lista,
      el('div', { class: 'pe' }, continuar, el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' })));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(avancoPendente);
      avancar();
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
  function reabrirResultado(chave) {
    const dim = { janela: 'horario', teto: 'preco', faixa: 'idade' }[chave];
    const c = { ...estado.criterios, ...criteriosDoFormulario(), evitar: [] };
    c.firmes = (c.firmes || []).filter((d) => d !== dim);
    delete c.oferta;
    estado.editando = null;
    buscarFestas(c, { substituir: true });
  }

  function mostrarErro(texto) {
    const $erro = document.getElementById('erro');
    if ($erro) $erro.textContent = texto;
  }

  async function buscarFestas(criterios, { substituir = false } = {}) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    mostrarErro('');
    let r;
    try {
      r = await chamar('/api/festas', { criterios });
    } catch {
      r = null;
    }
    estado.ocupado = false;
    if (!r || !r.ok || !r.dados) {
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'Não consegui buscar as festas agora. Tente de novo.');
      return;
    }
    estado.criterios = r.dados.criterios;
    estado.resultado = r.dados;
    estado.fala = { voce: null, finde: r.dados.resposta };
    estado.novas = [];
    ir('resultado', { substituir });
  }

  function tituloResultado() {
    const n = estado.resultado.opcoes.length;
    const d = DIA[estado.criterios.dia];
    if (!n) return titulo('h1', 'titulo titulo--resultado', `Nada ${d.seu}`, `${d.nome}`, ', ainda.');
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

  // A régua da noite, das 17h às 3h: um traço por festa e uma marca no esquenta.
  function regua(opcoes) {
    const pos = (h) => `${((Math.max(REGUA.de, Math.min(REGUA.ate, h)) - REGUA.de) / (REGUA.ate - REGUA.de)) * 100}%`;
    const largura = (a, b) => `${((Math.min(REGUA.ate, b) - Math.max(REGUA.de, a)) / (REGUA.ate - REGUA.de)) * 100}%`;
    return el('div', { class: 'regua', 'aria-hidden': 'true' },
      el('div', { class: 'regua-trilhos' }, opcoes.map((o) => {
        const f = o.festa;
        return el('div', { class: 'trilho' },
          el('span', { class: 'trilho-festa', 'data-l': pos(f.inicio), 'data-w': largura(f.inicio, f.fim) }),
          el('span', { class: 'trilho-esquenta', 'data-l': pos(f.esquenta) }));
      })),
      el('p', { class: 'regua-horas' }, REGUA.marcas.map((h) => el('span', { texto: `${h % 24}h` }))));
  }

  // Posição pelo CSSOM (a CSP não deixa atributo style).
  function posicionarRegua(raiz) {
    for (const s of raiz.querySelectorAll('[data-l]')) {
      s.style.left = s.dataset.l;
      if (s.dataset.w) s.style.width = s.dataset.w;
    }
  }

  // Uma entrada da programação: hora e média à esquerda; à direita o nome, onde,
  // a frase do curador, o porquê e o envio. O leitor de tela ouve a linha
  // inteira na ordem da marca: horário primeiro, idade junto.
  function entrada(o) {
    const f = o.festa;
    const nova = estado.novas.includes(f.id);
    const mandar = el('button', { type: 'button', class: 'link', texto: 'Mandar pro grupo' });
    mandar.setAttribute('aria-label', `Mandar ${f.nome} pro grupo`);
    mandar.addEventListener('click', () => {
      estado.mandar = o;
      estado.convite = null;
      ir('mandar');
    });
    const lido = [o.linha, o.patrocinada ? 'patrocinado' : null, nova ? 'nova na lista' : null].filter(Boolean).join(' · ');
    const marcaLado = o.patrocinada
      ? el('span', { class: 'marca-lateral', texto: 'Patrocinado' })
      : nova ? el('span', { class: 'marca-lateral nova-marca', texto: '● Nova' }) : null;
    return el('li', { class: `festa${nova ? ' nova' : ''}` },
      el('div', { class: 'festa-quando', 'aria-hidden': 'true' },
        el('span', { class: 'hora', texto: o.hora }),
        el('span', { class: 'media', texto: `média ${f.mediaIdade}` }),
        marcaLado),
      el('article', { class: 'festa-o-que', 'aria-labelledby': `festa-${f.id}`, 'aria-describedby': `linha-${f.id}` },
        el('p', { class: 'vh', id: `linha-${f.id}`, texto: lido }),
        el('h2', { class: 'nome', id: `festa-${f.id}`, texto: f.nome }),
        el('p', { class: 'onde', texto: `${casaCurta(f.casa)} · ${o.bairro} · ${o.preco}` }),
        el('p', { class: 'frase', texto: f.frase }),
        o.motivos.length ? el('p', { class: 'porque' }, el('span', { class: 'vh', texto: 'Por que esta: ' }), o.motivos.join(' · ')) : null,
        o.patrocinada ? el('p', { class: 'nota-pago', texto: 'Só aparece quando cabe no pedido.' }) : null,
        mandar));
  }

  function atalhos() {
    const c = estado.criterios;
    const lista = [];
    lista.push(c.perto !== 'pinheiros' ? ['mais perto de Pinheiros', 'tem alguma mais perto de Pinheiros?'] : ['mais perto do Centro', 'tem alguma mais perto do Centro?']);
    if (c.teto !== 0) lista.push(['mais barato', 'mais barato']);
    lista.push(c.janela === 'fim-de-tarde' ? ['mais tarde', 'mais tarde'] : ['mais cedo', 'mais cedo']);
    if (!c.evitarEstilos.includes('funk')) lista.push(['sem funk', 'sem funk']);
    lista.push(['outro estilo', 'outro estilo']);
    lista.push(c.dia === 'dom' ? ['sábado', 'e no sábado?'] : ['domingo', 'e no domingo?']);
    return lista.map(([rotulo, frase]) => {
      const b = el('button', { type: 'button', class: 'link', texto: rotulo });
      b.addEventListener('click', () => ajustar(frase, rotulo));
      return b;
    });
  }

  function telaResultado() {
    const r = estado.resultado;
    const oferta = r.oferta ? el('button', { type: 'button', class: 'link oferta', texto: r.oferta.rotulo }) : null;
    if (oferta) oferta.addEventListener('click', () => ajustar(r.oferta.frase, r.oferta.rotulo));

    const conversa = el('div', { class: 'conversa', id: 'conversa', 'aria-live': 'polite' },
      estado.fala.voce ? el('p', { class: 'fala-voce' }, el('span', { class: 'vh', texto: 'Você: ' }), estado.fala.voce) : null,
      estado.fala.finde ? el('p', { class: 'fala-finde' }, el('span', { class: 'vh', texto: 'Finde: ' }), estado.fala.finde) : null,
      oferta);

    const lista = r.opcoes.length
      ? [regua(r.opcoes), el('ol', { class: 'festas', 'aria-label': 'Festas, em ordem de horário' }, r.opcoes.map(entrada))]
      : [];

    const campo = el('input', {
      id: 'campo', class: 'campo', type: 'text', name: 'texto', maxlength: '300', autocomplete: 'off',
      enterkeyhint: 'send', placeholder: 'tipo: mais perto de Pinheiros', autocapitalize: 'sentences',
    });
    const form = el('form', { class: 'ajuste-form', id: 'ajuste-form' },
      el('label', { class: 'vh', for: 'campo', texto: 'Ajuste em uma frase' }), campo,
      el('button', { type: 'submit', class: 'botao', texto: 'Ajustar' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = campo.value.trim();
      if (texto) ajustar(texto);
    });

    const h2 = titulo('h2', 'titulo titulo--secao', 'Ajuste em uma ', 'frase.');
    h2.id = 'ajuste-titulo';
    h2.removeAttribute('tabindex');

    const tela = el('div', { class: 'tela-resultado' },
      topo(),
      el('section', { class: 'cabeca' },
        frasePedido(r.pedidoPartes || []),
        tituloResultado(),
        conversa),
      ...lista,
      el('section', { class: 'ajuste', 'aria-labelledby': 'ajuste-titulo' },
        h2,
        el('div', { class: 'atalhos', role: 'group', 'aria-label': 'Atalhos de ajuste' }, atalhos()),
        form,
        el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' })),
      rodape());
    posicionarRegua(tela);
    return tela;
  }

  async function ajustar(texto, exibido) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    const $conversa = document.getElementById('conversa');
    if ($conversa) $conversa.setAttribute('aria-busy', 'true');
    const atuais = estado.resultado.opcoes.map((o) => o.festa.id);
    let r;
    try {
      r = await chamar('/api/conversa', { criterios: estado.criterios, texto, atuais });
    } catch {
      r = null;
    }
    estado.ocupado = false;
    if ($conversa) $conversa.removeAttribute('aria-busy');
    if (!r || !r.ok || !r.dados) {
      mostrarErro(r && r.dados && r.dados.erro ? r.dados.erro : 'Não consegui falar com o servidor. Tente de novo.');
      return;
    }
    const d = r.dados;
    estado.criterios = d.criterios;
    estado.resultado = d;
    estado.fala = { voce: exibido || texto, finde: d.resposta };
    estado.novas = d.entraram || [];
    desenhar({ focar: false, entrar: false });
    const alvo = document.getElementById('conversa');
    if (alvo) alvo.scrollIntoView({ block: 'start', behavior: reduzir.matches ? 'auto' : 'smooth' });
    if (!d.entendeu) {
      const campo = document.getElementById('campo');
      if (campo) {
        campo.value = texto;
        campo.focus({ preventScroll: true });
      }
    }
  }

  // ------------------------------------------------------------ mandar pro grupo

  function linhasDaMensagem(o, link) {
    const f = o.festa;
    return [
      'Achei essa, bora?',
      '',
      o.linha.toLocaleUpperCase('pt-BR'),
      f.nome,
      `${f.casa} · ${o.preco}`,
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

  // A tela de mandar já é a prévia do convite: "Convite de [nome]", o título e a festa.
  function telaMandar() {
    const o = estado.mandar;
    const f = o.festa;
    const d = DIA[f.dia];
    const pronto = Boolean(estado.convite);
    const nome = pronto
      ? el('span', { class: 'rotulo', texto: estado.convite.autor || 'você' })
      : el('input', {
        id: 'seu-nome', class: 'campo-nome', type: 'text', maxlength: '24', autocomplete: 'given-name',
        placeholder: 'seu nome', value: lerNome(), enterkeyhint: 'done', 'aria-label': 'Seu nome, opcional',
      });

    return el('div', { class: 'tela-mandar' },
      topo(botaoVoltar()),
      el('section', { class: 'cabeca' },
        el('p', { class: 'de-quem' }, el('span', { class: 'rotulo', texto: 'Convite de' }), nome),
        titulo('h1', 'titulo titulo--pergunta', `Bora ${d.no} `, `${d.nome}?`),
        el('hr', { class: 'fio' })),
      el('article', { class: 'festa-convite', 'aria-labelledby': 'nome-festa' },
        el('p', { class: 'vh', texto: o.linha }),
        quandoGrande(o),
        el('h2', { class: 'nome', id: 'nome-festa', texto: f.nome }),
        el('p', { class: 'onde', texto: `${f.casa} · ${o.preco} · ${f.produtora}` }),
        el('p', { class: 'sobre', texto: `${o.horario} ${f.frase}` })),
      pronto ? blocoConvite(o) : blocoCriar(o, nome),
      rodape());
  }

  function blocoCriar(o, campoNome) {
    const criar = el('button', { type: 'button', class: 'botao botao--largo', texto: 'Criar o convite' });
    const erro = el('p', { class: 'aviso-erro', id: 'erro', role: 'alert' });
    criar.addEventListener('click', async () => {
      if (estado.ocupado) return;
      estado.ocupado = true;
      criar.disabled = true;
      const autor = campoNome.value.trim();
      let r;
      try {
        r = await chamar('/api/planos', { criterios: estado.criterios, festa: o.festa.id, autor: autor || undefined });
      } catch {
        r = null;
      }
      estado.ocupado = false;
      criar.disabled = false;
      if (!r || r.status !== 201 || !r.dados) {
        erro.textContent = r && r.dados && r.dados.erro ? r.dados.erro : 'Não consegui criar o convite. Tente de novo.';
        return;
      }
      guardar(autor, r.dados.id);
      estado.convite = { id: r.dados.id, url: new URL(r.dados.url, window.location.origin).href, autor };
      history.replaceState({ tela: 'mandar', passo: 0 }, '');
      desenhar({ focar: false, entrar: false });
      const p = document.getElementById('convite-pronto');
      if (p) p.focus({ preventScroll: false });
    });
    return el('div', { class: 'bloco' },
      el('p', { class: 'dica', texto: 'Com seu nome, você já entra como “tô dentro”.' }),
      criar, erro);
  }

  function blocoConvite(o) {
    const { url } = estado.convite;
    const curto = `…${new URL(url).pathname}`;
    const zap = el('a', {
      class: 'botao botao--largo',
      href: `https://wa.me/?text=${encodeURIComponent(linhasDaMensagem(o, url).join('\n'))}`,
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
      el('p', { class: 'previa', texto: linhasDaMensagem(o, curto).join('\n') }),
      zap,
      el('div', { class: 'links' },
        copiar,
        el('a', { class: 'link', href: new URL(url).pathname, texto: 'Abrir o convite' })),
      status);
  }

  // ------------------------------------------------------------ início

  async function iniciar() {
    history.replaceState({ tela: 'inicio', passo: 0 }, '');
    desenhar({ focar: false });
    let r;
    try {
      r = await chamar('/api/formulario');
    } catch {
      r = null;
    }
    const $proxima = document.getElementById('proxima');
    if (!r || !r.ok || !r.dados) {
      if ($proxima) $proxima.replaceChildren(el('p', { class: 'rotulo', texto: 'Não consegui abrir a pista. Recarregue a página.' }));
      return;
    }
    estado.form = r.dados;
    // Completa a tela que já está à vista, sem redesenhar.
    const p = estado.form.proxima;
    if ($proxima && p) {
      $proxima.replaceChildren(
        el('p', { class: 'rotulo', texto: p.linha }),
        el('p', { class: 'proxima-nome', texto: p.nome }),
      );
    }
    const ver = document.getElementById('ver-festas');
    if (ver) ver.disabled = false;
  }

  iniciar();
})();

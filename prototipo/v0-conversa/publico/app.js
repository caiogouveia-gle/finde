'use strict';
// A conversa do Finde: perguntas, três opções, ajustes e o link para o grupo.
// Todo texto que vem de fora entra na página por textContent.

(() => {
  const $conversa = document.getElementById('conversa');
  const $form = document.getElementById('campo-form');
  const $campo = document.getElementById('campo');
  const $enviar = $form.querySelector('button[type="submit"]');
  const $recomecar = document.getElementById('recomecar');
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');

  const CHAVE_CRITERIOS = 'finde.criterios';
  const CHAVE_NOME = 'finde.nome';
  const ORDEM = ['quando', 'quem', 'regiao', 'preco', 'clima', 'comida'];

  const PERGUNTAS = {
    quando: {
      texto: 'Quando vai ser?',
      opcoes: [['sex-noite', 'sexta à noite'], ['sab-dia', 'sábado de dia'], ['sab-noite', 'sábado à noite'], ['dom', 'domingo']],
    },
    quem: {
      texto: 'Quem vai?',
      opcoes: [['so', 'só eu'], ['casal', 'a dois'], ['amigos', 'amigos, de 3 a 5'], ['turma', 'turma, 6 ou mais']],
    },
    regiao: {
      texto: 'Para que lado da cidade?',
      opcoes: [['pinheiros-vila-madalena', 'Pinheiros e Vila Madalena'], ['centro', 'Centro'], ['paulista-ibirapuera', 'Paulista e Ibirapuera'], ['qualquer', 'tanto faz']],
    },
    preco: {
      texto: 'Quanto cada um quer gastar?',
      opcoes: [[0, 'de graça'], [1, 'até R$ 50'], [2, 'até R$ 120'], [3, 'tanto faz']],
    },
    clima: {
      texto: 'E o clima?',
      opcoes: [['conversar', 'pôr o papo em dia'], ['agitar', 'agitar'], ['descobrir', 'conhecer algo novo'], ['relaxar', 'ficar de boa'], ['comemorar', 'comemorar']],
    },
    comida: {
      texto: 'Comer faz parte do programa?',
      opcoes: [['centro', 'comer é o programa'], ['pode', 'se tiver, ótimo'], ['hoje-nao', 'hoje não']],
    },
  };

  const RESUMO = {
    quando: { 'sex-noite': 'sexta à noite', 'sab-dia': 'sábado de dia', 'sab-noite': 'sábado à noite', dom: 'domingo' },
    quem: { so: 'só você', casal: 'vocês dois', amigos: 'um grupo de amigos', turma: 'uma turma de 6 ou mais' },
    regiao: {
      'pinheiros-vila-madalena': 'Pinheiros e Vila Madalena', centro: 'Centro',
      'paulista-ibirapuera': 'Paulista e Ibirapuera', qualquer: 'qualquer região',
    },
    preco: ['de graça', 'até R$ 50 por pessoa', 'até R$ 120 por pessoa', 'sem teto de preço'],
    clima: {
      conversar: 'para pôr o papo em dia', agitar: 'para agitar', descobrir: 'para conhecer algo novo',
      relaxar: 'para ficar de boa', comemorar: 'para comemorar',
    },
    comida: { centro: 'comer é o programa', pode: 'comida se tiver', 'hoje-nao': 'sem comida' },
  };

  const QUANDO_FRASE = {
    'sex-noite': 'de sexta à noite', 'sab-dia': 'de sábado durante o dia', 'sab-noite': 'de sábado à noite', dom: 'de domingo',
  };
  const TIPO = {
    cultura: 'cultura', 'ar-livre': 'ar livre', comida: 'comida', bar: 'bar',
    musica: 'música', feira: 'feira', jogo: 'jogo', passeio: 'passeio',
  };
  const FAIXA = ['grátis', 'até R$ 50 por pessoa', 'R$ 50 a 120 por pessoa', 'acima de R$ 120 por pessoa'];
  const ROTULO = { 'sob-medida': 'sob medida para vocês', 'da-casa': 'escolha da casa', patrocinado: 'patrocinado' };

  const estado = {
    criterios: lerCriterios(),
    fase: 'inicio',
    pergunta: null,
    mesa: [],
    $mesa: null,
    $papeis: null,
    jaMostrou: false,
    ocupado: false,
  };

  // ------------------------------------------------------------ armazenamento

  function lerCriterios() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CHAVE_CRITERIOS) || '{}');
      return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    } catch {
      return {};
    }
  }
  function salvarCriterios() {
    try {
      sessionStorage.setItem(CHAVE_CRITERIOS, JSON.stringify(estado.criterios));
    } catch { /* sem armazenamento, a conversa só não sobrevive ao recarregar */ }
  }
  function lerNome() {
    try {
      return localStorage.getItem(CHAVE_NOME) || '';
    } catch {
      return '';
    }
  }
  function guardarNome(nome) {
    try {
      localStorage.setItem(CHAVE_NOME, nome);
    } catch { /* tudo bem */ }
  }

  // ------------------------------------------------------------ DOM

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

  function rolar(no, bloco = 'end') {
    setTimeout(() => no.scrollIntoView({ block: bloco, behavior: reduzir.matches ? 'auto' : 'smooth' }), 30);
  }

  function adicionar(li) {
    $conversa.append(li);
    rolar(li);
    return li;
  }

  function finde(texto, ...extra) {
    return adicionar(el('li', { class: 'fala fala-finde' }, el('p', { texto }), ...extra));
  }

  function pessoa(texto) {
    return adicionar(el('li', { class: 'fala fala-pessoa' }, el('p', { texto })));
  }

  function tirarPapeis() {
    if (estado.$papeis) estado.$papeis.remove();
    estado.$papeis = null;
  }

  function papeis(lista, aoEscolher, rotuloGrupo) {
    tirarPapeis();
    const li = el('li', { class: 'papeis', role: 'group', 'aria-label': rotuloGrupo },
      lista.map(([valor, rotulo]) => el('button', {
        type: 'button',
        class: 'papel',
        texto: rotulo,
        onclick: () => {
          if (!estado.ocupado) aoEscolher(valor, rotulo);
        },
      })));
    estado.$papeis = li;
    return adicionar(li);
  }

  function juntar(partes) {
    if (partes.length <= 1) return partes.join('');
    return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  }

  // ------------------------------------------------------------ servidor

  async function api(caminho, corpo) {
    let r;
    try {
      r = await fetch(caminho, corpo === undefined
        ? { cache: 'no-store' }
        : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    } catch {
      const e = new Error('rede');
      e.rede = true;
      throw e;
    }
    let dados = null;
    try {
      dados = await r.json();
    } catch { /* corpo vazio */ }
    if (!r.ok) {
      const e = new Error((dados && dados.erro) || 'Algo deu errado aqui do meu lado.');
      e.status = r.status;
      throw e;
    }
    return dados;
  }

  function pensando() {
    let li = null;
    const t = setTimeout(() => {
      li = el('li', { class: 'fala fala-finde pensando', 'aria-hidden': 'true' }, el('span'), el('span'), el('span'));
      $conversa.append(li);
      rolar(li);
    }, 300);
    return () => {
      clearTimeout(t);
      if (li) li.remove();
    };
  }

  async function executar(fn) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    document.body.classList.add('ocupado');
    const parar = pensando();
    try {
      await fn();
    } catch (e) {
      parar();
      falhou(e, fn);
    } finally {
      parar();
      estado.ocupado = false;
      document.body.classList.remove('ocupado');
    }
  }

  function falhou(e, fn) {
    const repetir = e.rede || !e.status || e.status >= 500;
    const msg = e.rede
      ? 'Perdi a conexão com o servidor. Confira a internet e tente de novo.'
      : e.message;
    if (!repetir) {
      finde(msg);
      return;
    }
    const botao = el('button', { type: 'button', class: 'papel', texto: 'tentar de novo' });
    const li = finde(msg, el('div', { class: 'linha-botoes' }, botao));
    botao.addEventListener('click', () => {
      li.remove();
      executar(fn);
    });
  }

  // ------------------------------------------------------------ conversa

  function resumo(chaves, c) {
    return juntar(ORDEM.filter((k) => chaves.includes(k)).map((k) => RESUMO[k][c[k]]));
  }

  function perguntar(chave, { naoEntendi = false } = {}) {
    estado.fase = 'perguntando';
    estado.pergunta = chave;
    const p = PERGUNTAS[chave];
    const primeira = Object.keys(estado.criterios).length === 0 && !naoEntendi;
    const dica = primeira
      ? el('p', { class: 'dica', texto: 'Toque numa resposta ou escreva tudo de uma vez, tipo “sábado à noite, somos 4, Pinheiros, até 80”.' })
      : null;
    finde(naoEntendi ? `Não peguei essa. ${p.texto}` : p.texto, dica);
    papeis(p.opcoes, (valor, rotulo) => {
      tirarPapeis();
      pessoa(rotulo);
      executar(() => passo({ set: { [chave]: valor } }));
    }, 'Respostas rápidas');
    $campo.placeholder = 'ou escreva do seu jeito';
  }

  async function passo({ set, texto } = {}) {
    if (set) Object.assign(estado.criterios, set);
    const corpo = { criterios: estado.criterios };
    if (texto) {
      corpo.texto = texto;
      if (estado.pergunta) corpo.pergunta = estado.pergunta;
    }
    const r = await api('/api/conversa', corpo);
    estado.criterios = r.criterios;
    salvarCriterios();

    if (texto) {
      if (!r.entendido.length) {
        if (estado.fase === 'opcoes') {
          finde('Não peguei esse ajuste. Dá para pedir “mais barato”, “outra região”, “sem comida”, ou mudar o dia e o clima.');
          papeisAjuste();
        } else {
          perguntar(r.falta ? r.falta[0] : ORDEM[0], { naoEntendi: true });
        }
        return;
      }
      finde(`Anotei: ${resumo(r.entendido, r.criterios)}.`);
    }

    if (r.falta) perguntar(r.falta[0]);
    else mostrarOpcoes(r);
  }

  function mostrarOpcoes(r) {
    estado.fase = 'opcoes';
    estado.pergunta = null;
    tirarPapeis();
    if (estado.$mesa) estado.$mesa.remove();
    estado.$mesa = null;
    $recomecar.hidden = false;
    $campo.placeholder = 'ajuste: mais barato, outra região…';

    if (r.aviso) finde(r.aviso);
    if (!r.opcoes.length) {
      estado.mesa = [];
      papeisAjuste();
      return;
    }

    const n = r.opcoes.length;
    const abertura = estado.jaMostrou
      ? 'Refiz com isso. A primeira é a que eu levaria vocês.'
      : n === 3 ? 'Achei três. A primeira é a que eu levaria vocês.'
        : n === 2 ? 'Achei duas. A primeira é a que eu levaria vocês.'
          : 'Achei uma. É a que eu levaria vocês.';
    estado.jaMostrou = true;
    const $abertura = finde(abertura);

    estado.mesa = r.opcoes.slice();
    const lista = el('ol', { class: 'cartoes', 'aria-label': 'As opções' },
      r.opcoes.map((o, i) => el('li', {}, cartao(o, i))));
    const li = el('li', { class: 'mesa' },
      lista,
      legenda(),
      el('button', { type: 'button', class: 'acao', texto: 'mandar pro grupo', onclick: pedirNome }));
    estado.$mesa = li;
    adicionar(li);
    papeisAjuste();
    rolar($abertura, 'start');
  }

  function papeisAjuste() {
    const c = estado.criterios;
    const lista = [];
    if (c.preco > 0) lista.push(['mais barato', 'mais barato']);
    if (c.regiao && c.regiao !== 'qualquer') lista.push(['outra região', 'outra região']);
    if (c.comida !== 'hoje-nao') lista.push(['sem comida', 'sem comida']);
    lista.push(['@recomecar', 'começar de novo']);
    papeis(lista, (valor, rotulo) => {
      if (valor === '@recomecar') return recomecar();
      tirarPapeis();
      pessoa(rotulo);
      executar(() => passo({ texto: valor }));
    }, 'Ajustes rápidos');
  }

  function legenda() {
    return el('div', { class: 'legenda' },
      el('p', {}, el('strong', { texto: 'Sob medida' }), ' bateu com o pedido. ',
        el('strong', { texto: 'Escolha da casa' }), ' vale mesmo fora dele. ',
        el('strong', { texto: 'Patrocinado' }), ' é pago e só entra se couber.'),
      el('p', { texto: 'Preço em faixa, por pessoa. Confira o horário antes de sair.' }));
  }

  function etiqueta(rotulo) {
    return el('span', { class: `etiqueta etiqueta-${rotulo}`, texto: ROTULO[rotulo] || rotulo });
  }

  function ondeDepois(e, d) {
    if (d.bairro === e.bairro) return 'ali do lado';
    return d.bairro;
  }

  function cartao(o, i, nota) {
    const e = o.experiencia;
    const idNome = `nome-${e.id}`;
    return el('article', { class: 'cartao', 'data-id': e.id, 'aria-labelledby': idNome },
      nota ? el('p', { class: 'cartao-nota', texto: nota }) : null,
      el('div', { class: 'cartao-topo' },
        el('span', { class: 'ordem', texto: String(i + 1), 'aria-label': `opção ${i + 1}` }),
        etiqueta(o.rotulo)),
      el('h3', { class: 'cartao-nome', id: idNome, tabindex: '-1', texto: e.nome }),
      el('p', { class: 'cartao-meta', texto: [e.bairro, TIPO[e.tipo] || e.tipo, FAIXA[e.preco]].join(' · ') }),
      el('p', { class: 'cartao-resumo', texto: e.resumo }),
      el('ul', { class: 'motivos', 'aria-label': 'Por que entrou' }, o.motivos.map((m) => el('li', { texto: m }))),
      el('p', { class: 'porque' }, el('span', { class: 'porque-quem', texto: 'da curadoria' }), el('span', { texto: `“${o.porque}”` })),
      o.depois
        ? el('p', { class: 'depois' }, el('span', { class: 'depois-rotulo', texto: 'depois: ' }),
          el('strong', { texto: o.depois.nome }), `, ${ondeDepois(e, o.depois)}`)
        : null,
      el('div', { class: 'cartao-pe' },
        el('button', { type: 'button', class: 'trocar', texto: 'trocar esta', onclick: () => executar(() => trocarOpcao(e.id)) })));
  }

  async function trocarOpcao(id) {
    const atuais = estado.mesa.map((o) => o.experiencia.id);
    const i = atuais.indexOf(id);
    if (i < 0) return;
    const r = await api('/api/trocar', { criterios: estado.criterios, id, atuais });
    estado.criterios = r.criterios;
    salvarCriterios();
    if (!r.opcao) {
      finde(r.aviso);
      return;
    }
    estado.mesa[i] = r.opcao;
    const velho = estado.$mesa && estado.$mesa.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!velho) return;
    const novo = cartao(r.opcao, i, r.aviso);
    velho.replaceWith(novo);
    novo.querySelector('.cartao-nome').focus({ preventScroll: true });
    novo.scrollIntoView({ block: 'nearest', behavior: reduzir.matches ? 'auto' : 'smooth' });
  }

  // ------------------------------------------------------------ mandar

  let $pedidoNome = null;

  function pedirNome() {
    if (estado.ocupado || !estado.mesa.length) return;
    tirarPapeis();
    if ($pedidoNome) $pedidoNome.remove();
    const input = el('input', {
      type: 'text', id: 'nome-autor', maxlength: '24', autocomplete: 'given-name',
      placeholder: 'seu nome', value: lerNome(), enterkeyhint: 'done',
    });
    const form = el('form', { class: 'mini-form' },
      el('label', { for: 'nome-autor', class: 'vh', texto: 'Seu nome' }),
      input,
      el('button', { type: 'submit', class: 'acao acao-pequena', texto: 'criar o link' }));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const nome = input.value.trim();
      if (!nome) {
        input.focus();
        return;
      }
      guardarNome(nome);
      executar(() => criarPlano(nome));
    });
    $pedidoNome = finde('Como eu te apresento para o grupo?', form);
    input.focus({ preventScroll: true });
  }

  async function criarPlano(nome) {
    const ids = estado.mesa.map((o) => o.experiencia.id);
    const r = await api('/api/planos', { criterios: estado.criterios, opcoes: ids, autor: nome });
    if ($pedidoNome) {
      $pedidoNome.remove();
      $pedidoNome = null;
    }
    const url = new URL(r.url, window.location.origin).href;
    const quantas = ids.length === 3 ? 'três opções' : ids.length === 2 ? 'duas opções' : 'uma opção';
    const mensagem = `${nome} quer fechar o programa ${QUANDO_FRASE[estado.criterios.quando]} com vocês. São ${quantas}, vota aqui: ${url}`;

    const campoLink = el('input', { type: 'text', readonly: true, value: url, id: 'link-plano', class: 'envio-link' });
    const copiar = el('button', { type: 'button', class: 'secundario', texto: 'copiar o link' });
    copiar.addEventListener('click', () => copiarLink(url, campoLink, copiar));

    finde('Pronto. Manda no grupo: quem abrir o link vota sem instalar nada.');
    adicionar(el('li', { class: 'envio' },
      el('p', { class: 'envio-rotulo', texto: 'a mensagem' }),
      el('p', { class: 'envio-msg', texto: mensagem }),
      el('label', { for: 'link-plano', class: 'envio-rotulo', texto: 'o link' }),
      campoLink,
      el('div', { class: 'envio-botoes' },
        el('a', {
          class: 'acao', href: `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
          target: '_blank', rel: 'noopener noreferrer', texto: 'mandar no WhatsApp',
        }),
        copiar),
      el('a', { class: 'link', href: r.url, target: '_blank', rel: 'noopener', texto: 'abrir a página do plano' })));
    papeisAjuste();
  }

  async function copiarLink(url, campoLink, botao) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      campoLink.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    botao.textContent = ok ? 'copiado' : 'selecionei, é só copiar';
    setTimeout(() => {
      botao.textContent = 'copiar o link';
    }, 2200);
  }

  // ------------------------------------------------------------ início

  async function abrir() {
    const base = await api('/api/base');
    if (!base.total) {
      finde('Minha lista de lugares está vazia agora: a curadoria ainda está montando. Volte daqui a pouco.');
      $campo.disabled = true;
      $enviar.disabled = true;
      return;
    }
    $campo.disabled = false;
    $enviar.disabled = false;
    if (Object.keys(estado.criterios).length) {
      finde('Voltei de onde a gente parou.');
    } else {
      finde(`Oi. Eu escolho, entre ${base.total} experiências curadas em São Paulo, três programas para o seu grupo votar.`);
    }
    await passo();
  }

  function recomecar() {
    if (estado.ocupado) return;
    try {
      sessionStorage.removeItem(CHAVE_CRITERIOS);
    } catch { /* tudo bem */ }
    Object.assign(estado, {
      criterios: {}, fase: 'inicio', pergunta: null, mesa: [], $mesa: null, $papeis: null, jaMostrou: false,
    });
    $pedidoNome = null;
    $conversa.replaceChildren();
    $recomecar.hidden = true;
    $campo.value = '';
    executar(abrir);
    window.scrollTo({ top: 0 });
  }

  $form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const texto = $campo.value.trim();
    if (!texto || estado.ocupado) return;
    $campo.value = '';
    tirarPapeis();
    pessoa(texto);
    executar(() => passo({ texto }));
  });
  $recomecar.addEventListener('click', recomecar);

  executar(abrir);
})();

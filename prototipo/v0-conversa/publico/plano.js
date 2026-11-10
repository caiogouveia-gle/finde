'use strict';
// A página do plano: quem recebe o link vê as opções, deixa o nome e vota.
// Atualiza a cada 4 s com a aba visível. Fechado, vira bilhete.

(() => {
  const $plano = document.getElementById('plano');
  const $status = document.getElementById('status');
  const id = decodeURIComponent(window.location.pathname.split('/')[2] || '');

  const CHAVE_NOME = 'finde.nome';
  const INTERVALO = 4000;

  const QUANDO_FRASE = {
    'sex-noite': 'de sexta à noite', 'sab-dia': 'de sábado durante o dia', 'sab-noite': 'de sábado à noite', dom: 'de domingo',
  };
  const QUANDO = { 'sex-noite': 'sexta à noite', 'sab-dia': 'sábado, durante o dia', 'sab-noite': 'sábado à noite', dom: 'domingo' };
  const REGIAO = {
    'pinheiros-vila-madalena': 'Pinheiros e Vila Madalena', centro: 'Centro', 'paulista-ibirapuera': 'Paulista e Ibirapuera',
  };
  const TIPO = {
    cultura: 'cultura', 'ar-livre': 'ar livre', comida: 'comida', bar: 'bar',
    musica: 'música', feira: 'feira', jogo: 'jogo', passeio: 'passeio',
  };
  const FAIXA = ['grátis', 'até R$ 50 por pessoa', 'R$ 50 a 120 por pessoa', 'acima de R$ 120 por pessoa'];
  const ROTULO = { 'sob-medida': 'sob medida para vocês', 'da-casa': 'escolha da casa', patrocinado: 'patrocinado' };

  let plano = null;
  let assinatura = '';
  let timer = null;
  let ocupado = false;
  let confirmando = false;
  const dom = {};

  // ------------------------------------------------------------ utilidades

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

  function juntar(partes) {
    if (partes.length <= 1) return partes.join('');
    return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
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

  const mesmoNome = (a, b) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

  function meuVoto() {
    const nome = (dom.nome ? dom.nome.value : lerNome()).trim();
    if (!nome || !plano) return null;
    const o = plano.opcoes.find((x) => x.votos.some((v) => mesmoNome(v, nome)));
    return o ? o.experiencia.id : null;
  }

  // Mais votada; empate fica com a de cima (a mesma regra do servidor).
  function vencedora() {
    let melhor = 0;
    plano.opcoes.forEach((o, i) => {
      if (o.votos.length > plano.opcoes[melhor].votos.length) melhor = i;
    });
    const empate = plano.opcoes.filter((o) => o.votos.length === plano.opcoes[melhor].votos.length).length > 1;
    return { opcao: plano.opcoes[melhor], empate };
  }

  async function chamar(caminho, corpo) {
    const r = await fetch(caminho, corpo === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const texto = await r.text();
    let dados = null;
    try {
      dados = JSON.parse(texto);
    } catch { /* corpo não é JSON */ }
    return { status: r.status, ok: r.ok, texto, dados };
  }

  // ------------------------------------------------------------ busca e polling

  async function buscar() {
    let r;
    try {
      r = await chamar(`/api/planos/${encodeURIComponent(id)}`);
    } catch {
      if (!plano) estadoSemRede();
      else $status.textContent = 'Sem conexão agora. Tento de novo em instantes.';
      return;
    }
    if (r.status === 404) {
      estadoNaoExiste();
      return;
    }
    if (!r.ok || !r.dados) {
      if (!plano) estadoSemRede();
      else $status.textContent = 'O servidor não respondeu direito. Tento de novo em instantes.';
      return;
    }
    const situacao = plano && !plano.fechado ? 'A página se atualiza sozinha.' : '';
    if ($status.textContent !== situacao) $status.textContent = situacao;
    if (r.texto === assinatura) return;
    aplicar(r.dados, r.texto);
  }

  function aplicar(dados, texto) {
    assinatura = texto || JSON.stringify(dados);
    plano = dados;
    desenhar();
  }

  function agendar() {
    clearTimeout(timer);
    if (document.hidden || !plano || plano.fechado) return;
    timer = setTimeout(async () => {
      if (!ocupado) await buscar();
      agendar();
    }, INTERVALO);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      return;
    }
    if (plano && !plano.fechado) buscar().then(agendar);
  });

  // ------------------------------------------------------------ estados

  function estadoNaoExiste() {
    clearTimeout(timer);
    plano = null;
    document.title = 'Plano não encontrado · Finde';
    $plano.setAttribute('aria-busy', 'false');
    $status.textContent = '';
    $plano.replaceChildren(el('section', { class: 'estado' },
      el('h1', { class: 'titulo-plano', texto: 'Esse plano não existe.' }),
      el('p', { texto: 'Pode ser que o link tenha vindo cortado. Peça para quem mandou conferir, ou monte um programa novo agora.' }),
      el('a', { class: 'acao', href: '/', texto: 'montar um programa' })));
  }

  function estadoSemRede() {
    $plano.setAttribute('aria-busy', 'false');
    const botao = el('button', { type: 'button', class: 'acao', texto: 'tentar de novo' });
    botao.addEventListener('click', () => {
      $plano.replaceChildren(el('p', { class: 'carregando', texto: 'Abrindo o plano…' }));
      buscar().then(agendar);
    });
    $plano.replaceChildren(el('section', { class: 'estado' },
      el('h1', { class: 'titulo-plano', texto: 'Não consegui abrir o plano.' }),
      el('p', { texto: 'Parece que a conexão caiu. Confira a internet e tente de novo.' }),
      botao));
  }

  // ------------------------------------------------------------ desenho

  function desenhar() {
    $plano.setAttribute('aria-busy', 'false');
    document.title = `${plano.autor} quer fechar o programa · Finde`;
    if (plano.fechado) {
      bilhete();
      return;
    }
    if (!dom.lista) montar();
    const focado = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.opcao;
    dom.lista.replaceChildren(...plano.opcoes.map((o, i) => el('li', {}, cartao(o, i))));
    if (focado) {
      const b = dom.lista.querySelector(`[data-opcao="${CSS.escape(focado)}"]`);
      if (b) b.focus({ preventScroll: true });
    }
    desenharFechar();
  }

  function montar() {
    dom.nome = el('input', {
      type: 'text', id: 'seu-nome', maxlength: '24', autocomplete: 'given-name',
      placeholder: 'como o grupo te chama', value: lerNome(), enterkeyhint: 'done',
    });
    dom.nome.addEventListener('input', () => {
      dom.avisoNome.textContent = '';
      desenhar();
    });
    dom.avisoNome = el('p', { class: 'nome-aviso', role: 'alert' });
    dom.lista = el('ol', { class: 'cartoes', 'aria-label': 'As opções' });
    dom.fechar = el('div', { class: 'fechar-bloco' });

    const n = plano.opcoes.length;
    $plano.replaceChildren(
      el('section', { class: 'abertura-plano' },
        el('h1', { class: 'titulo-plano', texto: `${plano.autor} quer fechar o programa ${QUANDO_FRASE[plano.criterios.quando]} com vocês.` }),
        el('p', { class: 'sub-plano', texto: n === 1 ? 'O Finde achou uma opção. Deixe seu nome e diga se topa.' : `O Finde separou ${n === 3 ? 'três' : 'duas'} opções. Deixe seu nome e vote na que você topa; os votos aparecem para todo mundo.` }),
        el('div', { class: 'nome-bloco' },
          el('label', { for: 'seu-nome', texto: 'Seu nome' }),
          dom.nome,
          dom.avisoNome)),
      dom.lista,
      dom.fechar,
      legenda(),
      el('p', { class: 'rodape' }, 'Quer montar o seu? ', el('a', { href: '/', texto: 'Converse com o Finde' }), '.'));
  }

  function legenda() {
    return el('div', { class: 'legenda' },
      el('p', {}, el('strong', { texto: 'Sob medida' }), ' bateu com o pedido. ',
        el('strong', { texto: 'Escolha da casa' }), ' vale mesmo fora dele. ',
        el('strong', { texto: 'Patrocinado' }), ' é pago e só entra se couber.'),
      el('p', { texto: 'Preço em faixa, por pessoa. Confira o horário antes de sair.' }));
  }

  function cartao(o, i) {
    const e = o.experiencia;
    const meu = meuVoto() === e.id;
    const idNome = `nome-${e.id}`;
    const nomeAtual = dom.nome ? dom.nome.value.trim() : '';
    const nomes = o.votos.map((v) => (nomeAtual && mesmoNome(v, nomeAtual) ? `${v} (você)` : v));
    const n = o.votos.length;
    return el('article', { class: `cartao${meu ? ' cartao-meu' : ''}`, 'aria-labelledby': idNome },
      el('div', { class: 'cartao-topo' },
        el('span', { class: 'ordem', texto: String(i + 1), 'aria-label': `opção ${i + 1}` }),
        el('span', { class: `etiqueta etiqueta-${o.rotulo}`, texto: ROTULO[o.rotulo] || o.rotulo })),
      el('h2', { class: 'cartao-nome', id: idNome, texto: e.nome }),
      el('p', { class: 'cartao-meta', texto: [e.bairro, TIPO[e.tipo] || e.tipo, FAIXA[e.preco]].join(' · ') }),
      el('p', { class: 'cartao-resumo', texto: e.resumo }),
      el('ul', { class: 'motivos', 'aria-label': 'Por que entrou' }, o.motivos.map((m) => el('li', { texto: m }))),
      el('p', { class: 'porque' }, el('span', { class: 'porque-quem', texto: 'da curadoria' }), el('span', { texto: `“${o.porque}”` })),
      o.depois
        ? el('p', { class: 'depois' }, el('span', { class: 'depois-rotulo', texto: 'depois: ' }),
          el('strong', { texto: o.depois.nome }), `, ${o.depois.bairro === e.bairro ? 'ali do lado' : o.depois.bairro}`)
        : null,
      el('div', { class: 'votacao' },
        el('button', {
          type: 'button',
          class: meu ? 'votar votar-meu' : 'acao votar',
          'data-opcao': e.id,
          'aria-pressed': meu ? 'true' : 'false',
          texto: meu ? 'seu voto' : 'voto nesta',
          onclick: () => votar(e.id),
        }),
        el('p', { class: 'votantes' },
          n === 0 ? 'ninguém votou ainda' : el('span', {}, el('strong', { texto: `${n} ${n === 1 ? 'voto' : 'votos'}` }), `: ${juntar(nomes)}`))));
  }

  function desenharFechar() {
    const total = plano.totalVotos;
    if (total < 2) {
      confirmando = false;
      dom.fechar.replaceChildren(el('p', {
        class: 'fechar-dica',
        texto: total === 0 ? 'Com dois votos dá para fechar o programa.' : 'Falta mais um voto para dar para fechar o programa.',
      }));
      return;
    }
    if (!confirmando) {
      dom.fechar.replaceChildren(
        el('p', { class: 'fechar-dica', texto: `${total} votos até agora. Quando o grupo tiver decidido, alguém fecha.` }),
        el('button', {
          type: 'button',
          class: 'secundario',
          texto: 'fechar o programa',
          onclick: () => {
            confirmando = true;
            desenharFechar();
            const sim = dom.fechar.querySelector('.secundario-cheio');
            if (sim) sim.focus({ preventScroll: true });
          },
        }));
      return;
    }
    const { opcao, empate } = vencedora();
    const sim = el('button', { type: 'button', class: 'secundario secundario-cheio', texto: 'sim, fechar', onclick: fechar });
    dom.fechar.replaceChildren(
      el('p', { class: 'fechar-dica' },
        'Fecha com ', el('strong', { texto: opcao.experiencia.nome }),
        empate ? ', que está mais acima entre as empatadas. ' : ', a mais votada. ',
        'Depois disso ninguém vota mais.'),
      el('div', { class: 'linha-botoes' },
        sim,
        el('button', { type: 'button', class: 'link', texto: 'ainda não', onclick: () => { confirmando = false; desenharFechar(); } })));
  }

  function exigirNome() {
    const nome = dom.nome.value.trim();
    if (!nome) {
      dom.avisoNome.textContent = 'Escreva seu nome antes, para o grupo saber quem votou.';
      dom.nome.focus();
      dom.nome.scrollIntoView({ block: 'center' });
      return null;
    }
    guardarNome(nome);
    return nome;
  }

  async function enviar(caminho, corpo) {
    if (ocupado) return;
    ocupado = true;
    document.body.classList.add('ocupado');
    try {
      const r = await chamar(caminho, corpo);
      if (r.ok && r.dados) {
        $status.textContent = '';
        aplicar(r.dados);
        agendar();
      } else if (r.status === 404) {
        estadoNaoExiste();
      } else {
        $status.textContent = (r.dados && r.dados.erro) || 'Não deu certo. Tente de novo.';
        await buscar();
      }
    } catch {
      $status.textContent = 'Sem conexão: o voto não foi. Tente de novo.';
    } finally {
      ocupado = false;
      document.body.classList.remove('ocupado');
    }
  }

  function votar(opcao) {
    const nome = exigirNome();
    if (!nome) return;
    if (meuVoto() === opcao) return;
    enviar(`/api/planos/${encodeURIComponent(id)}/votos`, { nome, opcao });
  }

  function fechar() {
    const nome = exigirNome();
    if (!nome) return;
    confirmando = false;
    enviar(`/api/planos/${encodeURIComponent(id)}/fechar`, { nome });
  }

  function bilhete() {
    clearTimeout(timer);
    $status.textContent = '';
    const o = plano.opcoes.find((x) => x.experiencia.id === plano.fechado.opcao) || plano.opcoes[0];
    const e = o.experiencia;
    const todos = plano.opcoes.flatMap((x) => x.votos);
    const outras = plano.opcoes.filter((x) => x !== o).map((x) => x.experiencia.nome);
    const linha = (rotulo, valor) => [el('dt', { texto: rotulo }), el('dd', { texto: valor })];
    document.title = `Fechado: ${e.nome} · Finde`;
    $plano.replaceChildren(
      el('section', { class: 'abertura-plano' },
        el('h1', { class: 'titulo-plano', texto: 'Fechado. Vocês vão de:' })),
      el('article', { class: 'bilhete', 'aria-label': 'Bilhete do programa' },
        el('div', { class: 'bilhete-corpo' },
          el('p', { class: 'carimbo', texto: 'programa fechado' }),
          el('h2', { class: 'bilhete-nome', texto: e.nome }),
          el('p', { class: 'bilhete-resumo', texto: e.resumo }),
          el('dl', { class: 'bilhete-dados' },
            linha('quando', QUANDO[plano.criterios.quando]),
            linha('onde', `${e.bairro}, ${REGIAO[e.regiao]}`),
            linha('quanto', FAIXA[e.preco]),
            o.depois ? linha('depois', `${o.depois.nome}, ${o.depois.bairro === e.bairro ? 'ali do lado' : o.depois.bairro}`) : null)),
        el('div', { class: 'bilhete-canhoto' },
          el('dl', { class: 'bilhete-dados' }, linha('quem vai', todos.length ? juntar(todos) : plano.autor)),
          el('p', { class: 'bilhete-por', texto: `fechado por ${plano.fechado.por}` }))),
      el('p', { class: 'nota', texto: 'Horário e preço podem mudar: confira antes de sair.' }),
      outras.length ? el('p', { class: 'nota', texto: `Ficaram de fora: ${juntar(outras)}.` }) : null,
      el('a', { class: 'secundario', href: '/', texto: 'montar outro programa' }));
  }

  // ------------------------------------------------------------ início

  if (!/^[a-z0-9]{8}$/.test(id)) estadoNaoExiste();
  else buscar().then(agendar);
})();

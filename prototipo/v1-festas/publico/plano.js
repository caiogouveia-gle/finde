'use strict';
// A página do convite: quem recebe vê a festa e responde "tô dentro" ou
// "não rola" com o nome. Atualiza a cada 4 s com a aba visível; pausa com ela
// oculta. Nome repetido pergunta "É você?" antes de trocar a resposta.

(() => {
  const { el, titulo, chamar, marca, rodape, quandoGrande } = window.Finde;
  const $tela = document.getElementById('tela');
  const id = decodeURIComponent(window.location.pathname.split('/')[2] || '');

  const INTERVALO = 4000;
  const DIA = { sex: 'sexta', sab: 'sábado', dom: 'domingo' };
  const NA = { sex: 'na', sab: 'no', dom: 'no' };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  let plano = null;
  let assinatura = '';
  let timer = null;
  let ocupado = false;
  const dom = {};

  function lerNome() {
    try {
      return localStorage.getItem('finde.nome') || '';
    } catch {
      return '';
    }
  }

  // Os nomes que este aparelho já usou neste convite: esses não precisam do "É você?".
  function meuNomeAqui() {
    try {
      return JSON.parse(localStorage.getItem('finde.meus') || '{}')[id] || '';
    } catch {
      return '';
    }
  }

  function guardar(nome) {
    try {
      localStorage.setItem('finde.nome', nome);
      const meus = JSON.parse(localStorage.getItem('finde.meus') || '{}');
      meus[id] = nome;
      localStorage.setItem('finde.meus', JSON.stringify(meus));
    } catch { /* tudo bem */ }
  }

  const mesmo = (a, b) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

  function juntar(nomes) {
    if (nomes.length <= 1) return nomes.join('');
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  }

  function data(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MESES[d.getMonth()]}`;
  }

  // ------------------------------------------------------------ busca e polling

  async function buscar() {
    let r;
    try {
      r = await chamar(`/api/planos/${encodeURIComponent(id)}`);
    } catch {
      if (!plano) estado('Não consegui abrir o convite.', 'Parece que a conexão caiu. Confira a internet e tente de novo.', true);
      else if (dom.status) dom.status.textContent = 'Sem conexão agora. Tento de novo em instantes.';
      return;
    }
    if (r.status === 404) {
      clearTimeout(timer);
      plano = null;
      estado('Esse convite não existe.', 'Pode ser que o link tenha vindo cortado. Peça pra quem mandou conferir.', false);
      return;
    }
    if (!r.ok || !r.dados) {
      if (!plano) estado('Não consegui abrir o convite.', 'O servidor não respondeu direito. Tente de novo.', true);
      return;
    }
    if (r.texto === assinatura) return;
    assinatura = r.texto;
    plano = r.dados;
    desenhar();
  }

  function agendar() {
    clearTimeout(timer);
    if (document.hidden || !plano) return;
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
    if (plano) buscar().then(agendar);
  });

  // ------------------------------------------------------------ estados

  function estado(tituloTexto, texto, tentar) {
    $tela.setAttribute('aria-busy', 'false');
    document.title = `${tituloTexto} · finde.`;
    const acoes = [];
    if (tentar) {
      const b = el('button', { type: 'button', class: 'botao botao--largo', texto: 'Tentar de novo' });
      b.addEventListener('click', () => buscar().then(agendar));
      acoes.push(b);
    }
    acoes.push(el('a', { class: tentar ? 'link' : 'botao botao--largo', href: '/', texto: 'Ver festas do fim de semana' }));
    $tela.replaceChildren(el('div', { class: 'tela-plano entra' },
      el('header', { class: 'topo' }, marca('/')),
      el('section', { class: 'cabeca' },
        el('h1', { class: 'titulo titulo--pergunta', tabindex: '-1', texto: tituloTexto }),
        el('hr', { class: 'fio' }),
        el('p', { class: 'texto', texto })),
      el('div', { class: 'pe' }, acoes),
      rodape()));
  }

  // ------------------------------------------------------------ desenho

  function montar() {
    const o = plano.festa;
    const f = o.festa;
    const nome = el('input', {
      id: 'seu-nome', class: 'campo', type: 'text', maxlength: '24', autocomplete: 'given-name',
      placeholder: 'como o grupo te chama', value: meuNomeAqui() || lerNome(), enterkeyhint: 'done',
    });
    const dentro = el('button', { type: 'submit', class: 'botao', value: 'dentro' });
    const fora = el('button', { type: 'submit', class: 'botao', value: 'fora' });
    // Trocar o nome no campo muda qual resposta aparece marcada.
    nome.addEventListener('input', () => {
      dom.confirmar.replaceChildren();
      dom.erro.textContent = '';
      desenhar();
    });
    dom.nome = nome;
    dom.dentro = dentro;
    dom.fora = fora;
    dom.status = el('p', { class: 'status', role: 'status' });
    dom.erro = el('p', { class: 'aviso-erro', role: 'alert' });
    dom.confirmar = el('div', { class: 'confirmar' });
    dom.nomesDentro = el('p', { class: 'quem-nomes' });
    dom.nomesFora = el('p', { class: 'quem-nomes' });
    dom.rotuloDentro = el('p', { class: 'rotulo' });
    dom.rotuloFora = el('p', { class: 'rotulo' });

    const form = el('form', { class: 'bloco form-resposta' },
      el('label', { class: 'rotulo', for: 'seu-nome', texto: 'Seu nome' }),
      nome,
      el('div', { class: 'par' }, dentro, fora),
      dom.erro,
      dom.confirmar);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const escolha = e.submitter && e.submitter.value === 'fora' ? 'fora' : 'dentro';
      responder(escolha, false);
    });

    const quando = data(plano.criadoEm);
    const de = plano.autor ? `Convite de ${plano.autor}` : 'Convite';
    document.title = `${f.nome} · finde.`;

    $tela.setAttribute('aria-busy', 'false');
    $tela.replaceChildren(el('div', { class: 'tela-plano entra' },
      el('header', { class: 'topo' }, marca('/')),
      el('section', { class: 'cabeca' },
        el('p', { class: 'rotulo', texto: quando ? `${de} · ${quando}` : de }),
        titulo('h1', 'titulo titulo--pergunta', `Bora ${NA[f.dia]} `, `${DIA[f.dia]}?`),
        el('hr', { class: 'fio' })),
      el('article', { class: 'festa-convite', 'aria-labelledby': 'nome-festa' },
        el('p', { class: 'vh', texto: o.linha }),
        quandoGrande(o),
        el('h2', { class: 'nome', id: 'nome-festa', texto: f.nome }),
        el('p', { class: 'onde', texto: `${f.casa} · ${o.preco} · ${f.produtora}` }),
        el('p', { class: 'sobre', texto: `${o.horario} ${f.frase}` })),
      el('section', { class: 'quem', 'aria-label': 'Quem vai' },
        el('div', { class: 'quem-bloco' }, dom.rotuloDentro, dom.nomesDentro),
        el('div', { class: 'quem-bloco' }, dom.rotuloFora, dom.nomesFora)),
      form,
      dom.status,
      el('a', { class: 'link', href: '/', texto: 'Ver outras festas do fim de semana' }),
      rodape()));
    dom.montado = true;
  }

  function minhaResposta() {
    const nome = dom.nome.value.trim();
    if (!nome) return null;
    if (plano.dentro.some((n) => mesmo(n, nome))) return 'dentro';
    if (plano.fora.some((n) => mesmo(n, nome))) return 'fora';
    return null;
  }

  function desenhar() {
    if (!dom.montado) montar();
    dom.rotuloDentro.textContent = `Tô dentro · ${plano.dentro.length}`;
    dom.nomesDentro.textContent = plano.dentro.length ? juntar(plano.dentro) : 'Ninguém ainda. Seja o primeiro.';
    dom.nomesDentro.classList.toggle('vazio-quem', !plano.dentro.length);
    dom.rotuloFora.textContent = `Não rola · ${plano.fora.length}`;
    dom.nomesFora.textContent = plano.fora.length ? juntar(plano.fora) : 'Ninguém.';
    dom.nomesFora.classList.toggle('vazio-quem', !plano.fora.length);

    // A resposta marcada fica cheia e muda de texto; a outra, vazada.
    const minha = meuNomeAqui() && mesmo(meuNomeAqui(), dom.nome.value.trim()) ? minhaResposta() : null;
    dom.dentro.textContent = minha === 'dentro' ? 'Você tá dentro' : 'Tô dentro';
    dom.fora.textContent = minha === 'fora' ? 'Anotado' : 'Não rola';
    dom.dentro.classList.toggle('botao--vazado', minha === 'fora');
    dom.fora.classList.toggle('botao--vazado', minha !== 'fora');
    dom.dentro.setAttribute('aria-pressed', String(minha === 'dentro'));
    dom.fora.setAttribute('aria-pressed', String(minha === 'fora'));
    const situacao = minha ? 'Dá pra mudar quando quiser.' : 'A lista se atualiza sozinha.';
    if (dom.status.textContent !== situacao) dom.status.textContent = situacao;
  }

  async function responder(resposta, confirmar) {
    const nome = dom.nome.value.trim();
    dom.erro.textContent = '';
    dom.confirmar.replaceChildren();
    if (!nome) {
      dom.erro.textContent = 'Diga seu nome pra turma saber quem é.';
      dom.nome.focus();
      return;
    }
    if (ocupado) return;
    ocupado = true;
    dom.dentro.disabled = true;
    dom.fora.disabled = true;
    const jaEra = meuNomeAqui() && mesmo(meuNomeAqui(), nome);
    let r;
    try {
      r = await chamar(`/api/planos/${encodeURIComponent(id)}/respostas`, { nome, resposta, confirmar: confirmar || Boolean(jaEra) });
    } catch {
      r = null;
    }
    ocupado = false;
    dom.dentro.disabled = false;
    dom.fora.disabled = false;
    if (r && r.status === 409 && r.dados && r.dados.duplicado) {
      // "Já tem Ju na lista. É você?"
      dom.erro.textContent = r.dados.erro;
      const sou = el('button', { type: 'button', class: 'link', texto: 'Sou eu' });
      sou.addEventListener('click', () => responder(resposta, true));
      const outro = el('button', { type: 'button', class: 'link', texto: 'Não, vou pôr o sobrenome' });
      outro.addEventListener('click', () => {
        dom.erro.textContent = '';
        dom.confirmar.replaceChildren();
        dom.nome.focus();
      });
      dom.confirmar.replaceChildren(sou, outro);
      return;
    }
    if (!r || !r.ok || !r.dados) {
      dom.erro.textContent = r && r.dados && r.dados.erro ? r.dados.erro : 'Não consegui anotar. Tente de novo.';
      return;
    }
    guardar(nome);
    assinatura = r.texto;
    plano = r.dados;
    desenhar();
    agendar();
  }

  if (!/^[a-z0-9]{8}$/.test(id)) {
    estado('Esse convite não existe.', 'Pode ser que o link tenha vindo cortado. Peça pra quem mandou conferir.', false);
  } else {
    buscar().then(() => {
      const h1 = $tela.querySelector('h1');
      if (h1) h1.focus({ preventScroll: true });
      agendar();
    });
  }
})();

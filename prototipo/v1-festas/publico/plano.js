'use strict';
// A página do convite: quem recebe vê a festa e responde "tô dentro" ou
// "não rola" com o nome. A resposta fica logo abaixo da festa, à vista sem
// rolar; quem vai vem depois. Atualiza a cada 4 s com a aba visível e pausa
// com ela oculta; uma leitura velha nunca desfaz a resposta da própria pessoa.

(() => {
  const { el, titulo, chamar, marca, rodape, quandoGrande, anunciar, mediaFalada, cartaz, blocoOnde, blocoIngresso, blocoLinks } = window.Finde;
  const $tela = document.getElementById('tela');
  const id = decodeURIComponent(window.location.pathname.split('/')[2] || '');

  const INTERVALO = 4000;
  const DIA = { sex: 'sexta', sab: 'sábado', dom: 'domingo' };
  const CURTO = { sex: 'sex', sab: 'sáb', dom: 'dom' };
  const NA = { sex: 'na', sab: 'no', dom: 'no' };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const SEM_REDE = 'Sem conexão agora. Tento de novo em instantes.';

  let plano = null;
  let assinatura = '';
  let timer = null;
  let ocupado = false;
  // Cada resposta enviada aumenta a geração; leitura de polling de uma geração
  // anterior chega velha e é descartada.
  let geracao = 0;
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

  // "sáb, 14 nov": a data da festa, gravada quando o convite foi criado.
  function dataDaFesta(p) {
    if (!p.data) return '';
    const [, m, d] = p.data.split('-').map(Number);
    return `${CURTO[p.festa.festa.dia]}, ${d} ${MESES[m - 1]}`;
  }

  // ------------------------------------------------------------ busca e polling

  // Uma leitura só vale se nenhuma resposta foi escrita desde que ela saiu:
  // uma leitura que sai antes (ou durante) a escrita chega velha e é descartada.
  async function buscar() {
    if (ocupado) return;
    const g = geracao;
    let r;
    try {
      r = await chamar(`/api/planos/${encodeURIComponent(id)}`);
    } catch {
      if (g !== geracao) return;
      if (!plano) estado('Não consegui abrir o convite.', 'Parece que a conexão caiu. Confira a internet e tente de novo.', true);
      else if (dom.status) dom.status.textContent = SEM_REDE;
      return;
    }
    if (g !== geracao || ocupado) return;
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
    // A rede voltou: some o aviso de conexão, mesmo sem nada novo.
    if (dom.status && dom.status.textContent === SEM_REDE) dom.status.textContent = '';
    if (r.texto === assinatura) {
      if (dom.montado) desenhar();
      return;
    }
    assinatura = r.texto;
    plano = r.dados;
    desenhar();
  }

  function agendar() {
    clearTimeout(timer);
    if (document.hidden || !plano || plano.passou) return;
    timer = setTimeout(async () => {
      if (!ocupado) await buscar();
      agendar();
    }, INTERVALO);
  }

  // A rede voltou: lê na hora, e o aviso some. Caiu: avisa na hora.
  window.addEventListener('online', () => {
    if (document.hidden) return;
    buscar().then(agendar);
  });
  window.addEventListener('offline', () => {
    if (plano && dom.status) dom.status.textContent = SEM_REDE;
  });

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
    dom.dentro = el('button', { type: 'submit', class: 'botao botao--vazado', value: 'dentro' });
    dom.fora = el('button', { type: 'submit', class: 'botao botao--vazado', value: 'fora' });
    nome.addEventListener('input', () => {
      dom.confirmar.replaceChildren();
      dom.erro.textContent = '';
      desenhar();
    });
    dom.nome = nome;
    dom.status = el('p', { class: 'status', role: 'status' });
    dom.erro = el('p', { class: 'aviso-erro', role: 'alert' });
    dom.confirmar = el('div', { class: 'confirmar' });
    dom.nomesDentro = el('p', { class: 'quem-nomes' });
    dom.nomesFora = el('p', { class: 'quem-nomes' });
    dom.rotuloDentro = el('p', { class: 'rotulo' });
    dom.rotuloFora = el('p', { class: 'rotulo' });
    dom.par = el('div', { class: 'par' }, dom.dentro, dom.fora);

    const form = el('form', { class: 'bloco form-resposta' },
      el('label', { class: 'rotulo', for: 'seu-nome', texto: 'Seu nome' }),
      nome,
      dom.par,
      dom.erro,
      dom.confirmar);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const escolha = e.submitter && e.submitter.value === 'fora' ? 'fora' : 'dentro';
      responder(escolha, false);
    });
    dom.form = form;

    const quando = dataDaFesta(plano);
    const de = plano.autor ? `Convite de ${plano.autor}` : 'Convite';
    document.title = `${f.nome} · finde.`;

    $tela.setAttribute('aria-busy', 'false');
    dom.tela = el('div', { class: 'tela-plano convite convite--sem-resposta entra' },
      el('header', { class: 'topo' }, marca('/')),
      el('section', { class: 'cabeca' },
        el('p', { class: 'rotulo', texto: quando ? `${de} · ${quando}` : de }),
        titulo('h1', 'titulo titulo--pergunta', `Bora ${NA[f.dia]} `, `${DIA[f.dia]}?`),
        el('hr', { class: 'fio' })),
      el('article', { class: 'festa-convite', 'aria-labelledby': 'nome-festa' },
        el('p', { class: 'vh', texto: `${o.linha.replace(/ · média \d+ anos$/, '')}, ${mediaFalada(f)}` }),
        quandoGrande(o),
        el('h2', { class: 'nome', id: 'nome-festa', texto: f.nome }),
        el('p', { class: 'onde', texto: `${f.casa} · ${window.FindeTexto.precoNaLista(f)} · ${f.produtora}` }),
        el('p', { class: 'sobre', texto: [o.horario, f.frase].filter(Boolean).join(' ') })),
      form,
      dom.status,
      el('section', { class: 'quem', 'aria-label': 'Quem vai' },
        el('div', { class: 'quem-bloco' }, dom.rotuloDentro, dom.nomesDentro),
        el('div', { class: 'quem-bloco' }, dom.rotuloFora, dom.nomesFora)),
      detalhes(o),
      el('a', { class: 'link', href: '/', texto: 'Ver outras festas do fim de semana' }),
      rodape());
    $tela.replaceChildren(dom.tela);
    dom.montado = true;
  }

  // O essencial do detalhe da festa (R13), abaixo da resposta: a resposta
  // continua à vista sem rolar. Convite antigo, sem esses campos, mostra o
  // que tem. Os links seguem a marca de exemplo gravada com a festa.
  function detalhes(o) {
    const f = o.festa;
    if (!f.endereco && !Array.isArray(f.lotes) && !f.instagram && !f.linkEvento && !f.cartaz) return null;
    // Base fictícia por padrão: só sai direto quem diz que não é exemplo.
    const ex = f.exemplo !== false;
    return el('section', { class: 'convite-detalhes', 'aria-label': 'Detalhes da festa' },
      el('div', { class: 'convite-onde' },
        el('p', { class: 'rotulo', texto: 'Onde' }),
        cartaz(f, 'cartaz cartaz--convite'),
        el('div', { class: 'convite-onde-texto' }, blocoOnde(f, o.bairro, ex))),
      el('div', { class: 'convite-bloco' },
        el('p', { class: 'rotulo', texto: 'Ingresso' }),
        blocoIngresso(f, ex, { comprar: true })),
      el('div', { class: 'convite-bloco' },
        el('p', { class: 'rotulo', texto: 'Da produtora' }),
        blocoLinks(f, ex)));
  }

  function minhaResposta() {
    const nome = dom.nome.value.trim();
    if (!nome || !meuNomeAqui() || !mesmo(meuNomeAqui(), nome)) return null;
    if (plano.dentro.some((n) => mesmo(n, nome))) return 'dentro';
    if (plano.fora.some((n) => mesmo(n, nome))) return 'fora';
    return null;
  }

  function desenhar() {
    if (!dom.montado) montar();
    dom.rotuloDentro.textContent = `Tô dentro · ${plano.dentro.length}`;
    dom.nomesDentro.textContent = plano.dentro.length ? juntar(plano.dentro) : 'Ninguém ainda. Abre a lista.';
    dom.nomesDentro.classList.toggle('vazio-quem', !plano.dentro.length);
    dom.rotuloFora.textContent = `Não rola · ${plano.fora.length}`;
    dom.nomesFora.textContent = plano.fora.length ? juntar(plano.fora) : 'Ninguém.';
    dom.nomesFora.classList.toggle('vazio-quem', !plano.fora.length);

    if (plano.passou) {
      // A festa já foi: o convite vira lembrança, sem resposta, sem campo e sem botões.
      marcar(null, true);
      if (!dom.form.classList.contains('passou')) {
        dom.form.classList.add('passou');
        dom.form.replaceChildren(el('p', { class: 'texto', texto: 'Essa já foi. O convite não aceita mais resposta.' }));
        if (dom.status.textContent) dom.status.textContent = '';
      }
      clearTimeout(timer);
      return;
    }

    // Sem resposta, os dois iguais e vazados. Com resposta, a escolhida fica
    // cheia e muda de texto; a outra vira um link pra mudar.
    const minha = minhaResposta();
    marcar(minha, false);
    const { dentro, fora } = dom;
    if (!minha) {
      for (const [b, texto] of [[dentro, 'Tô dentro'], [fora, 'Não rola']]) {
        b.className = 'botao botao--vazado';
        b.textContent = texto;
        b.setAttribute('aria-pressed', 'false');
      }
    } else {
      const [eu, outro] = minha === 'dentro' ? [dentro, fora] : [fora, dentro];
      eu.className = 'botao';
      eu.textContent = minha === 'dentro' ? 'Você tá dentro' : 'Anotado: não rola';
      eu.setAttribute('aria-pressed', 'true');
      outro.className = 'link';
      outro.textContent = minha === 'dentro' ? 'Mudar pra não rola' : 'Mudar pra tô dentro';
      outro.setAttribute('aria-pressed', 'false');
    }
    const situacao = minha ? 'Dá pra mudar quando quiser.' : '';
    if (dom.status.textContent !== situacao && dom.status.textContent !== SEM_REDE) dom.status.textContent = situacao;
  }

  // O estado do convite, para o desenho: sem resposta, respondido, passou.
  function marcar(minha, passou) {
    const t = dom.tela;
    if (!t) return;
    t.classList.toggle('convite--sem-resposta', !passou && !minha);
    t.classList.toggle('convite--respondido', !passou && Boolean(minha));
    t.classList.toggle('convite--passou', passou);
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
    geracao += 1;
    clearTimeout(timer);
    const botao = resposta === 'dentro' ? dom.dentro : dom.fora;
    const antes = botao.textContent;
    // Retorno no mesmo quadro do toque; sem disabled, o foco fica no botão.
    botao.textContent = 'Anotando…';
    botao.classList.add('carregando');
    botao.setAttribute('aria-busy', 'true');
    for (const b of [dom.dentro, dom.fora]) b.setAttribute('aria-disabled', 'true');
    const jaEra = meuNomeAqui() && mesmo(meuNomeAqui(), nome);
    let r;
    try {
      r = await chamar(`/api/planos/${encodeURIComponent(id)}/respostas`, { nome, resposta, confirmar: confirmar || Boolean(jaEra) });
    } catch {
      r = null;
    }
    // Leituras que saíram durante a escrita também são velhas.
    geracao += 1;
    ocupado = false;
    botao.classList.remove('carregando');
    botao.removeAttribute('aria-busy');
    botao.textContent = antes;
    for (const b of [dom.dentro, dom.fora]) b.removeAttribute('aria-disabled');
    if (r && r.status === 410) {
      // A festa passou enquanto a pessoa olhava: o convite vira lembrança.
      plano = { ...plano, passou: true };
      desenhar();
      anunciar('Essa já foi. O convite não aceita mais resposta.');
      return;
    }
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
      agendar();
      return;
    }
    if (!r || !r.ok || !r.dados) {
      // A resposta pode ter se perdido na volta com a escrita feita: o nome
      // fica lembrado, e o próximo toque confirma sem perguntar "É você?".
      if (!r) guardar(nome);
      dom.erro.textContent = r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toca de novo.';
      agendar();
      return;
    }
    guardar(nome);
    assinatura = r.texto;
    plano = r.dados;
    desenhar();
    anunciar(resposta === 'dentro' ? 'Você está dentro.' : 'Anotado: não rola.');
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

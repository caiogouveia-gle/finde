'use strict';
// A página do convite: quem recebe vê a festa num painel bordô (o convite da
// landing do manual v2) e responde "tô dentro" ou "não rola" com o nome, no
// próprio painel, à vista sem rolar; quem vai vem depois. Atualiza a cada 4 s com a aba visível e pausa
// com ela oculta; uma leitura velha nunca desfaz a resposta da própria pessoa.

(() => {
  const { el, chamar, site, marca, rodape, definirNota, anunciar, cartaz, blocoOnde, blocoIngresso, blocoLinks, acaoC, painelConvite, mov: M } = window.Finde;
  const FT = window.FindeTexto;
  const $tela = document.getElementById('tela');
  const id = decodeURIComponent(window.location.pathname.split('/')[2] || '');

  const INTERVALO = 4000;
  const CURTO = { sex: 'sex', sab: 'sáb', dom: 'dom' };
  // O wordmark leva à landing (o endereço vem da meta finde-site); "ver
  // festas" leva ao app, que reabre a lista de quem já montou uma nesta aba
  // (sem lista, começa o pedido). /app serve o app nos dois jeitos de rodar.
  const LANDING = site();
  // O ?de=convite diz ao medir.js do app de onde a pessoa chegou.
  const APP = '/app?ver=lista&de=convite';
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
    avisarAberto();
    desenhar();
  }

  // O convite existe: o medir.js conta a abertura (se quem abre não é quem
  // criou) e passa a saber a festa, para o ingresso clicado aqui. Uma vez só.
  let avisou = false;
  function avisarAberto() {
    if (avisou) return;
    avisou = true;
    const f = plano && plano.festa && plano.festa.festa;
    const real = f && (f.real === true || f.exemplo === false) && f.id ? String(f.id) : '';
    document.dispatchEvent(new CustomEvent('finde:convite', { detail: { festa: real } }));
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
    acoes.push(tentar
      ? acaoC('a', { href: APP }, 'Ver festas do fim de semana')
      : el('a', { class: 'botao botao--largo', href: APP, texto: 'Ver festas do fim de semana' }));
    $tela.replaceChildren(el('div', { class: 'tela-plano entra' },
      el('header', { class: 'topo' }, marca(LANDING)),
      el('section', { class: 'cabeca' },
        el('h1', { class: 'titulo titulo--pergunta', tabindex: '-1', texto: tituloTexto }),
        el('hr', { class: 'fio' }),
        el('p', { class: 'texto', texto })),
      el('div', { class: 'pe' }, acoes),
      rodape()));
    const t = $tela.firstElementChild;
    M.titulo(t.querySelector('h1'), { atraso: 40 });
    M.subir(t.querySelectorAll('.cabeca > :not(h1), .pe'), { atraso: 320, y: 10 });
  }

  // Vazado que vira cheio: o bordô corre da esquerda por baixo do texto. Quem
  // corre é um fundo (::after), nunca o botão: ele, a borda e o anel de foco
  // ficam inteiros o tempo todo, e quem chegou pelo teclado não se perde.
  const pseudoAnima = typeof KeyframeEffect === 'function' && 'pseudoElement' in KeyframeEffect.prototype;
  function encher(b) {
    if (!M.pode() || !pseudoAnima) return;
    b.classList.add('enche');
    const a = M.animar(b, [{ scale: '0 1' }, { scale: '1 1' }], {
      duration: M.v().estado, easing: M.v().troca, pseudoElement: '::after',
    });
    const fim = () => b.classList.remove('enche');
    if (!a) fim();
    else a.finished.then(fim, fim);
  }

  // ------------------------------------------------------------ desenho

  function montar() {
    // O rodapé diz se a festa do convite é real ou fictícia.
    definirNota(plano && plano.festa && plano.festa.festa && plano.festa.festa.exemplo === false ? 'real' : 'ficticias');
    const o = plano.festa;
    const f = o.festa;
    const nome = el('input', {
      id: 'seu-nome', class: 'campo', type: 'text', maxlength: '24', autocomplete: 'given-name',
      placeholder: 'como o grupo te chama', value: meuNomeAqui() || lerNome(), enterkeyhint: 'done',
    });
    dom.dentro = el('button', { type: 'submit', class: 'botao', value: 'dentro' });
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
    // A contagem num span próprio: quando muda, o número novo sobe.
    dom.contaDentro = el('span', { class: 'conta' });
    dom.contaFora = el('span', { class: 'conta' });
    dom.rotuloDentro = el('p', { class: 'rotulo' }, 'Tô dentro · ', dom.contaDentro);
    dom.rotuloFora = el('p', { class: 'rotulo' }, 'Não rola · ', dom.contaFora);
    dom.par = el('div', { class: 'par' }, dom.dentro, dom.fora);

    const form = el('form', { class: 'form-resposta' },
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
      painelConvite(o, { rotulo: quando ? `${de} · ${quando}` : de, marcaHref: LANDING, resto: [form], passou: Boolean(plano.passou) }),
      dom.status,
      el('section', { class: 'quem', 'aria-label': 'Quem vai' },
        el('div', { class: 'quem-bloco' }, dom.rotuloDentro, dom.nomesDentro),
        el('div', { class: 'quem-bloco' }, dom.rotuloFora, dom.nomesFora)),
      detalhes(o, Boolean(plano.passou)),
      acoesDoConvite(o, Boolean(plano.passou)),
      // A lista do dia da festa, sem as perguntas (24/11/2026).
      acaoC('a', { href: `${APP}&dia=${encodeURIComponent(plano.festa.festa.dia || '')}${plano.data ? `&data=${encodeURIComponent(plano.data)}` : ''}`, class: 'convite-mais' }, 'Ver outras festas do fim de semana'),
      rodape());
    $tela.replaceChildren(dom.tela);
    dom.montado = true;
    // O convite se monta como na landing: o painel abre e as faixas entram
    // em sequência; quem vai e o resto chegam quando a rolagem chega neles.
    M.painel(dom.tela.querySelector('.painel-convite'));
    M.subir(dom.tela.querySelector('.quem'), { atraso: 300, y: 10 });
    M.aoVer([...dom.tela.querySelectorAll('.convite-detalhes > *, .convite-mais')], (x) => M.subir(x, { y: 12 }), { atraso: 400 });
  }

  // Um texto que mudou entra subindo um pouco (a contagem sobe por dentro
  // da sua caixa). Na primeira leitura, nada se mexe: o painel já se monta.
  function trocar(no, texto, numero = false) {
    if (no.textContent === texto) return;
    const antes = no.textContent;
    no.textContent = texto;
    if (!antes) return;
    if (numero) M.trocaNumero(no);
    else M.subir(no, { y: 6, duracao: M.v().estado });
  }

  // O essencial do detalhe da festa (R13), abaixo da resposta: a resposta
  // continua à vista sem rolar. Convite antigo, sem esses campos, mostra o
  // que tem. Os links seguem a marca de exemplo gravada com a festa.
  // Depois da festa (passou), o convite vira registro: fica onde foi, quanto
  // custou numa linha e o Instagram; nada de lote, compra nem página do evento.
  function custou(f) {
    const p = FT.preco(f);
    if (p.valor === 0) return 'Era grátis.';
    if (typeof p.valor !== 'number' || !Number.isFinite(p.valor) || p.genero) return null;
    return `Custava ${FT.centavos(p.valor)}.`;
  }
  function detalhes(o, passou = false) {
    const f = o.festa;
    if (!f.endereco && !Array.isArray(f.lotes) && !f.instagram && !f.linkEvento && !f.cartaz) return null;
    // Base fictícia por padrão: só sai direto quem diz que não é exemplo.
    const ex = f.exemplo !== false;
    if (passou) {
      const preco = custou(f);
      const insta = blocoLinks(f, ex, { soInstagram: true });
      return el('section', { class: 'convite-detalhes', 'aria-label': 'Detalhes da festa' },
        el('div', { class: 'convite-onde' },
          el('p', { class: 'rotulo', texto: 'Onde' }),
          cartaz(f, 'cartaz cartaz--convite'),
          el('div', { class: 'convite-onde-texto' }, blocoOnde(f, o.bairro, ex))),
        preco ? el('div', { class: 'convite-bloco' },
          el('p', { class: 'rotulo', texto: 'Ingresso' }),
          el('p', { class: 'ingresso-preco' }, el('span', { class: 'ingresso-valor', texto: preco }))) : null,
        insta ? el('div', { class: 'convite-bloco' },
          el('p', { class: 'rotulo', texto: 'Da produtora' }),
          insta) : null);
    }
    return el('section', { class: 'convite-detalhes', 'aria-label': 'Detalhes da festa' },
      el('div', { class: 'convite-onde' },
        el('p', { class: 'rotulo', texto: 'Onde' }),
        cartaz(f, 'cartaz cartaz--convite'),
        el('div', { class: 'convite-onde-texto' }, blocoOnde(f, o.bairro, ex))),
      el('div', { class: 'convite-bloco' },
        el('p', { class: 'rotulo', texto: 'Ingresso' }),
        blocoIngresso(f, ex, { comprar: true })),
      // Festa real sem Instagram nem página do evento: o bloco some.
      f.instagram || f.linkEvento || ex ? el('div', { class: 'convite-bloco' },
        el('p', { class: 'rotulo', texto: 'Da produtora' }),
        blocoLinks(f, ex)) : null);
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
    trocar(dom.contaDentro, String(plano.dentro.length), true);
    // "Lista" fica para a lista da porta e a lista da semana; aqui é o "tô dentro".
    trocar(dom.nomesDentro, plano.dentro.length ? juntar(plano.dentro) : 'Ninguém ainda. Pode ser você.');
    dom.nomesDentro.classList.toggle('vazio-quem', !plano.dentro.length);
    trocar(dom.contaFora, String(plano.fora.length), true);
    trocar(dom.nomesFora, plano.fora.length ? juntar(plano.fora) : 'Ninguém.');
    dom.nomesFora.classList.toggle('vazio-quem', !plano.fora.length);

    if (plano.passou) {
      // A festa já foi: o convite vira registro, sem resposta, sem campo e
      // sem botões.
      marcar(null, true);
      if (!dom.form.classList.contains('passou')) {
        dom.form.classList.add('passou');
        const eu = meuNomeAqui();
        const dentro = eu && plano.dentro.some((n) => mesmo(n, eu));
        const outros = dentro ? plano.dentro.filter((n) => !mesmo(n, eu)) : [];
        // O rótulo do painel já diz "já passou" (quando o convite abriu
        // depois da festa); a frase fica para quem viu a festa passar aqui.
        const rotuloDiz = Boolean(dom.tela && dom.tela.querySelector('.painel-nome--registro'));
        dom.form.replaceChildren(...[
          rotuloDiz && dentro ? null : el('p', { class: 'texto', texto: 'Essa já foi. O convite não aceita mais resposta.' }),
          dentro ? el('p', { class: 'texto', texto: `Você disse tô dentro${outros.length ? `, com ${juntar(outros)}` : ''}.` }) : null,
        ].filter(Boolean));
        if (dom.status.textContent) dom.status.textContent = '';
      }
      clearTimeout(timer);
      return;
    }

    // Sem resposta: "Tô dentro" cheio e "Não rola" vazado (o par D do manual).
    // Com resposta, a escolhida fica cheia e muda de texto; a outra vira um
    // link pra mudar.
    const minha = minhaResposta();
    marcar(minha, false);
    const { dentro, fora } = dom;
    if (!minha) {
      for (const [b, texto, classe] of [[dentro, 'Tô dentro', 'botao'], [fora, 'Não rola', 'botao botao--vazado']]) {
        b.className = classe;
        b.textContent = texto;
        b.setAttribute('aria-pressed', 'false');
      }
    } else {
      const [eu, outro] = minha === 'dentro' ? [dentro, fora] : [fora, dentro];
      // A resposta acabou de mudar: a escolhida se preenche da esquerda e a
      // outra recua para link. Numa leitura sem mudança, nada se mexe.
      const mudou = eu.getAttribute('aria-pressed') !== 'true';
      const vazado = eu.classList.contains('botao--vazado');
      if (mudou) {
        // Já cheio: só o texto novo acende. (O vazado se enche logo abaixo.)
        if (!vazado) M.animar(eu, [{ opacity: 0.55 }], { duration: M.v().estado, easing: M.v().saida });
        M.subir(outro, { atraso: 120, y: 4, duracao: M.v().estado });
      }
      eu.className = 'botao';
      if (mudou && vazado) encher(eu);
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
      if (r && r.ok && window.FindeMedir) window.FindeMedir.contar('convite-resposta');
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
      // "Já tem Ju neste convite. É você?"
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
      dom.erro.textContent = r && r.dados && r.dados.erro ? r.dados.erro : 'A internet sumiu no meio. Toque de novo.';
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

  // Pôr na agenda (.ics, com o link do convite) e compartilhar o convite.
  function acoesDoConvite(o, passou = false) {
    const url = window.location.href.split('#')[0];
    const status = el('p', { class: 'status-curto', role: 'status' });
    const compartilhar = acaoC('button', { type: 'button' }, 'Compartilhar');
    compartilhar.addEventListener('click', async () => {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: o.festa.nome, url });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Link do convite copiado.';
      } catch {
        status.textContent = `Não consegui copiar daqui. O link é ${url}`;
      }
    });
    return el('div', { class: 'convite-bloco convite-acoes' },
      // A festa que passou não vai mais para a agenda.
      el('div', { class: 'acoes' }, passou ? null : acaoC('a', { href: `/p/${encodeURIComponent(id)}/agenda.ics`, download: 'convite.ics' }, 'Pôr na agenda'), compartilhar),
      status);
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

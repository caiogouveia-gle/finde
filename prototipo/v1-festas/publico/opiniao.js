'use strict';
// A opinião sobre o protótipo (nucleo/validacao.js): a nota de 0 a 10 para
// indicar o finde, o que faltou ou ajudou, e o e-mail para receber as
// novidades. A nota e o e-mail são coisas separadas: dá para deixar só um
// deles. Mora em /opiniao (o link que se manda depois do teste) e, compacta,
// no fim da lista do app: lá a nota grava sozinha quando a pessoa para de
// mexer, e o comentário e o e-mail vêm depois, se ela quiser.
//
// window.FindeOpiniao.formulario({ de, compacto, pagina }) -> elemento
// window.FindeOpiniao.emailLimpo(texto) -> e-mail normalizado ou null

(() => {
  const { el } = window.Finde;
  const FEITA = 'finde.opiniao';
  const DISPENSADA = 'finde.opiniao-depois';
  const FINALIDADE_OPINIAO = 'A nota e o comentário vão sem nome, junto da contagem anônima do que você fez no app, e ficam guardados até 31/12/2026. Servem pra gente saber se o protótipo ajudou.';
  const FINALIDADE_LISTA = 'Só para mandar as novidades do finde. Fica guardado até 31/12/2026, e você sai quando quiser.';
  // A mesma regra do servidor (nucleo/validacao.js, EMAIL): o que passa aqui
  // passa lá. teste/opiniao-email.test.js confere que as duas são iguais.
  const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  // A nota compacta espera a pessoa parar (toque corrigido, setas do teclado)
  // e grava uma vez só.
  const ESPERA_NOTA = 700;
  const SEM_INTERNET = 'A internet sumiu no meio. Toque de novo.';
  let serie = 0;
  let viuApp = false;
  // A nota que ainda espera o tempo de gravar; sai junto se a página fechar.
  let notaPendente = null;

  const ler = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const anotar = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch { /* tudo bem */ }
  };
  const aparelho = () => (window.FindeMedir ? window.FindeMedir.aparelho() : '');
  const contar = (evento, p) => {
    try {
      if (window.FindeMedir && window.FindeMedir.contar) window.FindeMedir.contar(evento, p);
    } catch { /* contar nunca atrapalha */ }
  };

  // Sem espaço nas pontas, em minúsculas e sem o ponto que escapa no fim
  // ("ana@exemplo.com."). Devolve null se não passar na regra do servidor.
  function emailLimpo(v) {
    if (typeof v !== 'string') return null;
    const e = v.trim().toLowerCase().replace(/\.+$/, '');
    return e.length <= 254 && EMAIL.test(e) ? e : null;
  }

  async function postar(caminho, corpo, { manter = false } = {}) {
    try {
      const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), keepalive: manter });
      let dados = null;
      try {
        dados = await r.json();
      } catch { /* sem corpo */ }
      return { ok: r.ok, status: r.status, dados };
    } catch {
      return { ok: false, status: 0, dados: null };
    }
  }

  // Por que o e-mail não entrou, dito como tal: a tela nunca diz que deu certo sem o ok.
  function motivoDaLista(r) {
    if (r.status === 429) return 'O e-mail não entrou: muitos pedidos daqui. Tente daqui a pouco.';
    if (r.status === 0) return 'O e-mail não entrou: a internet sumiu no meio. Tente de novo.';
    return (r.dados && r.dados.erro) || 'O e-mail não entrou. Confere e tente de novo.';
  }

  // Já respondeu neste aparelho, ou disse "agora não" há menos de 3 dias.
  function deveOferecer() {
    if (ler(FEITA)) return false;
    const depois = Number(ler(DISPENSADA) || 0);
    return !(depois && Date.now() - depois < 3 * 24 * 3600 * 1000);
  }

  const valeu = (texto) => el('div', { class: 'confirmacao', tabindex: '-1' },
    el('p', { class: 'titulo titulo--secao' }, 'Anotado. ', el('em', { texto: 'Valeu.' })),
    texto ? el('p', { class: 'texto', texto }) : null);

  // O erro mora logo abaixo do campo e entra na descrição dele.
  function ligarErro(campo, erro, outros = '') {
    campo.setAttribute('aria-describedby', `${outros} ${erro.id}`.trim());
  }
  function marcarErro(campo, erro, texto) {
    erro.textContent = texto;
    if (texto) campo.setAttribute('aria-invalid', 'true');
    else campo.removeAttribute('aria-invalid');
  }

  // O campo de e-mail com a finalidade e o erro ao lado. A isca fica
  // escondida de quem vê e de quem lê a tela; robô preenche.
  function campoDeEmail(id, rotulo) {
    const finalidadeId = id('lista-finalidade');
    const email = el('input', { class: 'campo', id: id('opiniao-email'), type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'seu@email.com' });
    const erro = el('p', { class: 'aviso-erro', id: id('email-erro'), role: 'alert' });
    const isca = el('input', { class: 'isca', type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    ligarErro(email, erro, finalidadeId);
    const bloco = el('div', { class: 'opiniao-campo' },
      el('label', { class: 'rotulo', for: email.id, texto: rotulo }),
      email, erro,
      el('p', { class: 'finalidade', id: finalidadeId, texto: FINALIDADE_LISTA }),
      isca);
    return { bloco, email, erro, isca };
  }

  function formulario({ de = 'opiniao', compacto = false, pagina = false } = {}) {
    serie += 1;
    const id = (nome) => `${nome}-${serie}`;
    const tituloId = id('opiniao-titulo');
    const pontasId = id('opiniao-pontas');
    const escala = el('div', { class: 'escala', role: 'radiogroup', 'aria-labelledby': tituloId },
      Array.from({ length: 11 }, (_, n) => el('label', { class: 'escala-nota' },
        el('input', { type: 'radio', name: id('nota'), value: String(n) }),
        el('span', { texto: String(n) }))));
    const pontas = el('div', { class: 'escala-pontas', id: pontasId },
      el('span', { texto: '0 é nada provável' }), el('span', { texto: '10, muito provável' }));
    const erroNota = el('p', { class: 'aviso-erro', id: id('nota-erro'), role: 'alert' });
    ligarErro(escala, erroNota, pontasId);
    const pergunta = el(pagina ? 'h1' : 'h2', { class: `titulo ${pagina ? 'titulo--resultado' : 'titulo--secao'}`, id: tituloId },
      'De 0 a 10, qual a chance de você indicar o finde a um ', el('em', { texto: 'amigo?' }));

    const texto = el('textarea', { class: 'campo campo-texto', id: id('opiniao-texto'), name: 'texto', rows: '2', maxlength: '600', placeholder: 'faltou festa no domingo' });
    const erroTexto = el('p', { class: 'aviso-erro', id: id('texto-erro'), role: 'alert' });
    ligarErro(texto, erroTexto);
    const campoTexto = el('div', { class: 'opiniao-campo' },
      el('label', { class: 'rotulo', for: texto.id, texto: 'O que faltou, ou o que mais ajudou' }),
      texto, erroTexto);
    const notaMarcada = () => {
      const m = escala.querySelector('input:checked');
      return m ? Number(m.value) : null;
    };

    if (compacto) return compacta({ id, de, escala, pontas, pergunta, tituloId, texto, erroTexto, campoTexto, notaMarcada });

    // Inteira, em /opiniao: a nota, o comentário e o e-mail, num envio só.
    // A nota ou o e-mail: basta um dos dois.
    const { bloco: blocoEmail, email, erro: erroEmail, isca } = campoDeEmail(id, 'Quer receber as novidades? Dá para deixar só o e-mail.');
    const erro = el('p', { class: 'aviso-erro', role: 'alert' });
    const enviar = el('button', { type: 'submit', class: 'botao botao--largo' }, 'Mandar', window.Finde.avanco ? window.Finde.avanco() : null);
    const form = el('form', { class: 'avaliar opiniao', novalidate: true, 'aria-labelledby': tituloId },
      el('p', { class: 'rotulo', texto: 'Sua opinião' }),
      pergunta,
      el('div', { class: 'escala-bloco' }, escala, pontas, erroNota),
      el('div', { class: 'opiniao-resto' },
        campoTexto,
        blocoEmail,
        el('p', { class: 'finalidade', texto: FINALIDADE_OPINIAO }),
        enviar, erro));

    escala.addEventListener('change', () => marcarErro(escala, erroNota, ''));
    // O que já entrou neste envio: corrigir o e-mail não regrava a nota.
    let gravada = null;
    let ocupado = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ocupado) return;
      erro.textContent = '';
      marcarErro(escala, erroNota, '');
      marcarErro(email, erroEmail, '');
      const nota = notaMarcada();
      const bruto = email.value.trim();
      const mail = bruto ? emailLimpo(bruto) : null;
      if (nota === null && !bruto) {
        marcarErro(escala, erroNota, 'Escolha uma nota de 0 a 10, ou deixe só o e-mail.');
        escala.querySelector('input').focus();
        return;
      }
      // Comentário sem nota não iria a lugar nenhum: pede a nota antes.
      if (nota === null && texto.value.trim()) {
        marcarErro(escala, erroNota, 'Para o comentário ir, escolha uma nota de 0 a 10.');
        escala.querySelector('input').focus();
        return;
      }
      if (bruto && !mail) {
        marcarErro(email, erroEmail, 'Esse e-mail não parece certo. Confere?');
        email.focus();
        return;
      }
      if (mail) email.value = mail;
      ocupado = true;
      enviar.classList.add('carregando');
      enviar.setAttribute('aria-busy', 'true');
      const comentario = texto.value.trim();
      const chave = `${nota}|${comentario}`;
      let notaOk = gravada === chave;
      if (nota !== null && !notaOk) {
        const r = await postar('/api/opiniao', { nota, texto: comentario || undefined, aparelho: aparelho(), de });
        if (!r.ok) {
          ocupado = false;
          enviar.classList.remove('carregando');
          enviar.removeAttribute('aria-busy');
          erro.textContent = (r.dados && r.dados.erro) || SEM_INTERNET;
          return;
        }
        gravada = chave;
        notaOk = true;
        anotar(FEITA, String(Date.now()));
      }
      // O e-mail vai separado e sem o aparelho: a lista não se liga à nota.
      let rl = null;
      if (mail) rl = await postar('/api/lista', { email: mail, de, site: isca.value });
      ocupado = false;
      enviar.classList.remove('carregando');
      enviar.removeAttribute('aria-busy');
      if (rl && !rl.ok) {
        // A nota fica; o e-mail espera a correção, com o campo aberto.
        if (notaOk) erro.textContent = 'A nota entrou.';
        marcarErro(email, erroEmail, motivoDaLista(rl));
        email.focus();
        return;
      }
      const ja = rl && rl.dados && rl.dados.ja;
      const daLista = ja ? 'esse e-mail já estava na lista das novidades' : 'o seu e-mail está na lista das novidades';
      let frase;
      if (notaOk && rl) frase = `A nota chegou, e ${daLista}.`;
      else if (rl) frase = `${daLista[0].toUpperCase()}${daLista.slice(1)}.`;
      else if (comentario) frase = 'A nota e o comentário chegaram. Isso ajuda a gente a decidir o que vem depois.';
      else frase = 'Isso ajuda a gente a decidir o que vem depois.';
      const feito = valeu(frase);
      form.replaceWith(feito);
      feito.focus({ preventScroll: true });
    });
    return form;
  }

  // Compacta, no fim da lista: a nota grava sozinha quando a pessoa para;
  // depois aparecem o "Dizer o que faltou" e o e-mail, cada um com o seu envio.
  function compacta({ id, de, escala, pontas, pergunta, tituloId, texto, erroTexto, campoTexto, notaMarcada }) {
    const depois = el('button', { type: 'button', class: 'botao-texto opiniao-depois', texto: 'Agora não' });
    const dizer = el('button', { type: 'button', class: 'link link--seta opiniao-dizer', hidden: true }, 'Dizer o que faltou', window.Finde.seta ? window.Finde.seta() : null);
    const mandar = el('button', { type: 'submit', class: 'botao botao--largo' }, 'Mandar', window.Finde.avanco ? window.Finde.avanco() : null);
    const erro = el('p', { class: 'aviso-erro', role: 'alert' });
    const aberto = el('form', { class: 'opiniao-resto', novalidate: true, hidden: true, 'aria-label': 'O que faltou' }, campoTexto, mandar, erro);
    const anotado = el('p', { class: 'status-curto', role: 'status' });
    const { bloco: blocoEmail, email, erro: erroEmail, isca } = campoDeEmail(id, 'Quer receber as novidades?');
    const entrar = el('button', { type: 'submit', class: 'link link--seta opiniao-entrar' }, 'Quero receber', window.Finde.seta ? window.Finde.seta() : null);
    const lista = el('form', { class: 'opiniao-lista', novalidate: true, hidden: true, 'aria-label': 'Lista das novidades' }, blocoEmail, entrar);
    const raiz = el('div', { class: 'avaliar opiniao', role: 'group', 'aria-labelledby': tituloId },
      el('p', { class: 'rotulo', texto: 'Uma pergunta' }),
      pergunta,
      el('div', { class: 'escala-bloco' }, escala, pontas),
      anotado, dizer, aberto, lista, depois);

    // Quantas vezes a pergunta apareceu de fato na tela: uma por carga.
    if (!viuApp && typeof window.IntersectionObserver === 'function') {
      const olho = new window.IntersectionObserver((es) => {
        if (viuApp || !es.some((e) => e.isIntersecting)) return;
        viuApp = true;
        olho.disconnect();
        contar('opiniao-viu', 'app');
      });
      olho.observe(raiz);
    }

    // A nota: espera a pessoa parar, grava uma vez, e só então diz "Anotado".
    let espera = null;
    let rodada = 0;
    // O comentário já mandado vai junto se a nota mudar: o servidor guarda
    // uma resposta por aparelho, e a nota sozinha o apagaria.
    let comentado = '';
    async function gravarNota({ manter = false } = {}) {
      clearTimeout(espera);
      espera = null;
      notaPendente = null;
      const nota = notaMarcada();
      if (nota === null) return;
      rodada += 1;
      const minha = rodada;
      const r = await postar('/api/opiniao', { nota, texto: comentado || undefined, aparelho: aparelho(), de }, { manter });
      // Outra nota já foi marcada depois desta: quem fala é a última.
      if (minha !== rodada || notaMarcada() !== nota) return;
      if (!r.ok) {
        anotado.textContent = (r.dados && r.dados.erro) || SEM_INTERNET;
        return;
      }
      anotar(FEITA, String(Date.now()));
      anotado.textContent = `Anotado: ${nota}. Valeu.`;
      if (aberto.hidden && !comentado) dizer.hidden = false;
      lista.hidden = false;
    }
    escala.addEventListener('change', () => {
      depois.hidden = true;
      anotado.textContent = '';
      clearTimeout(espera);
      espera = setTimeout(gravarNota, ESPERA_NOTA);
      notaPendente = () => gravarNota({ manter: true });
    });

    dizer.addEventListener('click', () => {
      dizer.hidden = true;
      aberto.hidden = false;
      texto.focus();
    });

    depois.addEventListener('click', () => {
      anotar(DISPENSADA, String(Date.now()));
      contar('opiniao-agora-nao');
      // O "dar opinião" do rodapé sai quando a pergunta aparece; por isso a
      // porta de volta mora na própria frase, e o foco fica nela.
      const fechada = el('p', { class: 'status-curto opiniao-fechada', role: 'status', tabindex: '-1' },
        'Tudo bem. Se mudar de ideia: ',
        el('a', { class: 'rodape-opiniao', href: '/opiniao', texto: 'dar opinião' }),
        '.');
      raiz.replaceWith(fechada);
      fechada.focus({ preventScroll: true });
    });

    // O comentário: não vai vazio, e um toque duplo não manda duas vezes.
    let comentando = false;
    texto.addEventListener('input', () => { if (texto.value.trim()) marcarErro(texto, erroTexto, ''); });
    aberto.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (comentando) return;
      erro.textContent = '';
      const nota = notaMarcada();
      const t = texto.value.trim();
      if (!t) {
        marcarErro(texto, erroTexto, 'Escreva o que faltou, ou deixe só a nota.');
        texto.focus();
        return;
      }
      if (nota === null) {
        erro.textContent = 'Escolha uma nota de 0 a 10 antes.';
        return;
      }
      marcarErro(texto, erroTexto, '');
      comentando = true;
      mandar.classList.add('carregando');
      mandar.setAttribute('aria-busy', 'true');
      const r = await postar('/api/opiniao', { nota, texto: t, aparelho: aparelho(), de });
      comentando = false;
      mandar.classList.remove('carregando');
      mandar.removeAttribute('aria-busy');
      if (!r.ok) {
        erro.textContent = (r.dados && r.dados.erro) || SEM_INTERNET;
        return;
      }
      comentado = t;
      anotar(FEITA, String(Date.now()));
      const feito = el('p', { class: 'status-curto opiniao-comentou', role: 'status', tabindex: '-1', texto: `O comentário chegou junto com a nota ${nota}. Valeu.` });
      aberto.replaceWith(feito);
      feito.focus({ preventScroll: true });
    });

    // O e-mail: a mesma regra do servidor; recusado, o campo fica aberto.
    let entrando = false;
    lista.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (entrando) return;
      const mail = emailLimpo(email.value);
      if (!mail) {
        marcarErro(email, erroEmail, email.value.trim() ? 'Esse e-mail não parece certo. Confere?' : 'Escreva o seu e-mail.');
        email.focus();
        return;
      }
      email.value = mail;
      marcarErro(email, erroEmail, '');
      entrando = true;
      entrar.classList.add('carregando');
      entrar.setAttribute('aria-busy', 'true');
      const r = await postar('/api/lista', { email: mail, de, site: isca.value });
      entrando = false;
      entrar.classList.remove('carregando');
      entrar.removeAttribute('aria-busy');
      if (!r.ok) {
        marcarErro(email, erroEmail, motivoDaLista(r));
        email.focus();
        return;
      }
      const ok = el('p', { class: 'status-curto opiniao-na-lista', role: 'status', tabindex: '-1',
        texto: r.dados && r.dados.ja ? 'Esse e-mail já estava na lista das novidades.' : 'Pronto: o seu e-mail está na lista das novidades.' });
      lista.replaceWith(ok);
      ok.focus({ preventScroll: true });
    });

    return raiz;
  }

  window.FindeOpiniao = { formulario, deveOferecer, emailLimpo };

  // Quem marca a nota e fecha a página antes da espera: a nota vai assim mesmo.
  window.addEventListener('pagehide', () => {
    if (notaPendente) notaPendente();
  });

  // Em /opiniao, a página inteira: uma tarefa só, a pergunta como título.
  document.addEventListener('DOMContentLoaded', () => {
    const tela = document.getElementById('tela');
    if (!tela || document.body.dataset.tela !== 'opiniao') return;
    const ja = ler(FEITA)
      ? el('p', { class: 'status-curto opiniao-ja', texto: 'Você já respondeu por aqui. Se mudou de ideia, mande de novo: vale a última.' })
      : null;
    tela.replaceChildren(el('div', { class: 'tela-opiniao' },
      el('header', { class: 'topo' }, window.Finde.marca('/')),
      ja,
      formulario({ de: 'opiniao', pagina: true }),
      el('a', { class: 'link link--seta opiniao-voltar', href: '/' }, 'Abrir o app', window.Finde.seta ? window.Finde.seta() : null),
      window.Finde.rodape()));
    tela.removeAttribute('aria-busy');
    contar('opiniao-viu', 'opiniao');
  });
})();

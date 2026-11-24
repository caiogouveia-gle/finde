'use strict';
// A opinião sobre o protótipo (nucleo/validacao.js): a nota de 0 a 10 para
// indicar o finde, o que faltou ou ajudou, e o e-mail para receber as
// novidades. Os dois últimos são opcionais. Mora em /opiniao (o link que se
// manda depois do teste) e, compacta, no fim da lista do app: lá a nota já
// grava no toque, e o comentário vem depois, se a pessoa quiser.
//
// window.FindeOpiniao.formulario({ de, compacto, pagina }) -> elemento

(() => {
  const { el } = window.Finde;
  const FEITA = 'finde.opiniao';
  const DISPENSADA = 'finde.opiniao-depois';
  const FINALIDADE_OPINIAO = 'A nota e o comentário vão sem nome e ficam guardados até 31/12/2026. Servem pra gente saber se o protótipo ajudou.';
  const FINALIDADE_LISTA = 'Só para mandar as novidades do finde. Fica guardado até 31/12/2026, e você sai quando quiser.';
  let serie = 0;

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

  async function postar(caminho, corpo) {
    try {
      const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      let dados = null;
      try {
        dados = await r.json();
      } catch { /* sem corpo */ }
      return { ok: r.ok, status: r.status, dados };
    } catch {
      return { ok: false, status: 0, dados: null };
    }
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

  function formulario({ de = 'opiniao', compacto = false, pagina = false } = {}) {
    serie += 1;
    const id = (nome) => `${nome}-${serie}`;
    const tituloId = id('opiniao-titulo');
    const pontasId = id('opiniao-pontas');
    const escala = el('div', { class: 'escala', role: 'radiogroup', 'aria-labelledby': tituloId, 'aria-describedby': pontasId },
      Array.from({ length: 11 }, (_, n) => el('label', { class: 'escala-nota' },
        el('input', { type: 'radio', name: id('nota'), value: String(n) }),
        el('span', { texto: String(n) }))));
    const pontas = el('div', { class: 'escala-pontas', id: pontasId },
      el('span', { texto: '0 é nada provável' }), el('span', { texto: '10, muito provável' }));
    const pergunta = el(pagina ? 'h1' : 'h2', { class: `titulo ${pagina ? 'titulo--resultado' : 'titulo--secao'}`, id: tituloId },
      'De 0 a 10, qual a chance de você indicar o finde a um ', el('em', { texto: 'amigo?' }));

    const texto = el('textarea', { class: 'campo campo-texto', id: id('opiniao-texto'), name: 'texto', rows: '2', maxlength: '600', placeholder: 'faltou festa no domingo' });
    const campoTexto = el('div', { class: 'opiniao-campo' },
      el('label', { class: 'rotulo', for: texto.id, texto: 'O que faltou, ou o que mais ajudou' }),
      texto);
    const erro = el('p', { class: 'aviso-erro', role: 'alert' });
    const enviar = el('button', { type: 'submit', class: 'botao botao--largo' }, 'Mandar', window.Finde.avanco ? window.Finde.avanco() : null);
    const notaMarcada = () => {
      const m = escala.querySelector('input:checked');
      return m ? Number(m.value) : null;
    };

    // Compacta, no fim da lista: o toque na nota já grava; o comentário é um
    // C que abre o campo, e "Mandar" regrava a nota com o texto.
    if (compacto) {
      const depois = el('button', { type: 'button', class: 'botao-texto opiniao-depois', texto: 'Agora não' });
      const dizer = el('button', { type: 'button', class: 'link link--seta opiniao-dizer', hidden: true }, 'Dizer o que faltou', window.Finde.seta ? window.Finde.seta() : null);
      const aberto = el('div', { class: 'opiniao-resto', hidden: true }, campoTexto, enviar, erro);
      const anotado = el('p', { class: 'status-curto', role: 'status' });
      const form = el('form', { class: 'avaliar opiniao', novalidate: true, 'aria-labelledby': tituloId },
        el('p', { class: 'rotulo', texto: 'Uma pergunta' }),
        pergunta,
        el('div', { class: 'escala-bloco' }, escala, pontas),
        anotado, dizer, aberto, depois);
      escala.addEventListener('change', async () => {
        const nota = notaMarcada();
        depois.hidden = true;
        const r = await postar('/api/opiniao', { nota, aparelho: aparelho(), de });
        if (!r.ok) {
          anotado.textContent = (r.dados && r.dados.erro) || 'A internet sumiu no meio. Toque de novo.';
          return;
        }
        anotar(FEITA, String(Date.now()));
        anotado.textContent = `Anotado: ${nota}. Valeu.`;
        if (aberto.hidden) dizer.hidden = false;
      });
      dizer.addEventListener('click', () => {
        dizer.hidden = true;
        aberto.hidden = false;
        texto.focus();
      });
      depois.addEventListener('click', () => {
        anotar(DISPENSADA, String(Date.now()));
        form.replaceWith(el('p', { class: 'status-curto opiniao-fechada', role: 'status', texto: 'Tudo bem. A pergunta fica no rodapé, em "dar opinião".' }));
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nota = notaMarcada();
        if (nota === null) return;
        enviar.classList.add('carregando');
        const r = await postar('/api/opiniao', { nota, texto: texto.value.trim() || undefined, aparelho: aparelho(), de });
        enviar.classList.remove('carregando');
        if (!r.ok) {
          erro.textContent = (r.dados && r.dados.erro) || 'A internet sumiu no meio. Toque de novo.';
          return;
        }
        const feito = valeu('O comentário chegou junto com a nota.');
        form.replaceWith(feito);
        feito.focus({ preventScroll: true });
      });
      return form;
    }

    // Inteira, em /opiniao: a nota, o comentário e o e-mail, num envio só.
    const email = el('input', { class: 'campo', id: id('opiniao-email'), type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'seu@email.com' });
    // A isca: escondida de quem vê e de quem lê a tela; robô preenche.
    const isca = el('input', { class: 'isca', type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const form = el('form', { class: 'avaliar opiniao', novalidate: true, 'aria-labelledby': tituloId },
      el('p', { class: 'rotulo', texto: 'Sua opinião' }),
      pergunta,
      el('div', { class: 'escala-bloco' }, escala, pontas),
      el('div', { class: 'opiniao-resto' },
        campoTexto,
        el('div', { class: 'opiniao-campo' },
          el('label', { class: 'rotulo', for: email.id, texto: 'Quer receber as novidades?' }),
          email,
          el('p', { class: 'finalidade', texto: `Opcional. ${FINALIDADE_LISTA}` })),
        isca,
        el('p', { class: 'finalidade', texto: FINALIDADE_OPINIAO }),
        enviar, erro));

    escala.addEventListener('change', () => { erro.textContent = ''; });
    let ocupado = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ocupado) return;
      erro.textContent = '';
      const nota = notaMarcada();
      if (nota === null) {
        erro.textContent = 'Escolha uma nota de 0 a 10.';
        escala.querySelector('input').focus();
        return;
      }
      const mail = email.value.trim();
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        erro.textContent = 'Esse e-mail não parece certo. Confere?';
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        return;
      }
      email.removeAttribute('aria-invalid');
      ocupado = true;
      enviar.classList.add('carregando');
      enviar.setAttribute('aria-busy', 'true');
      const r = await postar('/api/opiniao', { nota, texto: texto.value.trim() || undefined, aparelho: aparelho(), de });
      // O e-mail vai separado e sem o aparelho: a lista não se liga à nota.
      let naLista = false;
      if (r.ok && mail) naLista = (await postar('/api/lista', { email: mail, de, site: isca.value })).ok;
      ocupado = false;
      enviar.classList.remove('carregando');
      enviar.removeAttribute('aria-busy');
      if (!r.ok) {
        erro.textContent = (r.dados && r.dados.erro) || 'A internet sumiu no meio. Toque de novo.';
        return;
      }
      anotar(FEITA, String(Date.now()));
      const feito = valeu(naLista ? 'E o seu e-mail está na lista das novidades.' : 'Isso ajuda a gente a decidir o que vem depois.');
      form.replaceWith(feito);
      feito.focus({ preventScroll: true });
    });
    return form;
  }

  window.FindeOpiniao = { formulario, deveOferecer };

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
  });
})();

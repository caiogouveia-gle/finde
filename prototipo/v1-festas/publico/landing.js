'use strict';
// A landing: o formulário de e-mail, que é visual, e o movimento da página.
// O formulário confere o formato e avisa que é protótipo: não envia nem guarda
// nada. O resto da página é HTML pronto; o botão do herói leva ao protótipo
// por um link comum.
//
// O script carrega no <head>, sem defer: ele põe a classe .mov na raiz antes
// da primeira pintura, e só com ela o CSS esconde o que vai entrar. Sem
// JavaScript, com movimento reduzido ou sem IntersectionObserver, a classe
// não entra e a página aparece pronta. Se algo falhar no meio, a classe sai.

(() => {
  function iniciarFormulario() {
    const form = document.getElementById('form-lista');
    if (!form) return;
    const campo = document.getElementById('email');
    const erro = document.getElementById('email-erro');
    const aviso = document.getElementById('aviso-prototipo');
    const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    // Sem JavaScript o botão fica desligado: nada sai da página.
    form.querySelector('button[type="submit"]').disabled = false;

    function limparErro() {
      campo.removeAttribute('aria-invalid');
      erro.textContent = '';
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const valor = campo.value.trim();
      if (!FORMATO.test(valor)) {
        campo.setAttribute('aria-invalid', 'true');
        erro.textContent = valor ? 'Esse e-mail parece incompleto.' : 'Escreva o seu e-mail.';
        aviso.textContent = '';
        campo.focus();
        return;
      }
      limparErro();
      campo.value = '';
      aviso.textContent = 'Isto é um protótipo: seu e-mail não foi enviado nem guardado.';
    });
    campo.addEventListener('input', () => {
      if (campo.hasAttribute('aria-invalid')) limparErro();
    });
  }

  // ---------------------------------------------------------------- movimento

  // Decide já, no <head>, se a página vai se mover. A coreografia mora no
  // landing.css; aqui só se diz quando cada bloco entra.
  function prepararMovimento() {
    if (typeof window === 'undefined' || !document.documentElement) return null;
    const raiz = document.documentElement;
    const pode = typeof window.IntersectionObserver === 'function'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: no-preference)').matches
      && typeof Element !== 'undefined' && 'animate' in Element.prototype;
    if (!pode) return null;
    raiz.classList.add('mov');
    const m = { raiz, desistiu: false, socorro: 0, desistir };
    // Socorro: se a chegada não começar em 3 s, a página aparece como está, e
    // nada do movimento roda depois (nem parte título nenhum).
    m.socorro = setTimeout(desistir, 3000);
    function desistir() {
      clearTimeout(m.socorro);
      m.desistiu = true;
      raiz.classList.remove('mov');
      [...partidos.values()].forEach((voltar) => voltar());
    }
    return m;
  }

  // Os tempos vêm das --mov-* do CSS (os mesmos do app); estes são o padrão.
  const T = { titulo: 900, bloco: 560, estado: 320, passo: 60, tarde: 280 };
  function lerTempos() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const ler = (nome, chave) => {
        const n = parseFloat(cs.getPropertyValue(`--mov-${nome}`));
        if (Number.isFinite(n)) T[chave] = n;
      };
      ler('titulo', 'titulo'); ler('bloco', 'bloco'); ler('estado', 'estado');
      ler('linha-passo', 'passo'); ler('italico-atraso', 'tarde');
    } catch (e) { /* fica o padrão */ }
  }

  const movendo = () => document.documentElement.classList.contains('mov');

  // A fonte do título já chegou? Medir as linhas com a fonte de reserva daria
  // outra quebra; sem ela, o título entra inteiro, só por opacidade.
  function fonteNoLugar(el) {
    if (!document.fonts || typeof document.fonts.check !== 'function') return true;
    try {
      const cs = getComputedStyle(el);
      // Só a primeira família: as de reserva (local) não "carregam" nunca.
      return document.fonts.check(`${cs.fontStyle} 1em ${cs.fontFamily.split(',')[0]}`);
    } catch (e) { return true; }
  }

  // Parte um título nas linhas que o navegador já quebrou: cada linha vira uma
  // máscara (.mov-linha) com o texto dentro (.mov-linha-in), que sobe dela.
  // As palavras em itálico (ou na cor de acento) chegam um tempo depois, pela
  // mesma máscara. Não muda a quebra nem a altura: as linhas têm a altura da
  // linha de antes. No fim, o título volta ao HTML de origem.
  function partir(el, inicio, opcoes = {}) {
    if (!el || el.classList.contains('partido') || !movendo() || !fonteNoLugar(el)) return 0;
    const dur = opcoes.dur || T.titulo;
    const passo = opcoes.passo ?? T.passo;
    const tardeSel = opcoes.tarde || 'i';
    const copia = el.cloneNode(true);
    const nome = el.textContent.replace(/\s+/g, ' ').trim();
    const pecas = [];
    (function andar(no) {
      for (const filho of [...no.childNodes]) {
        if (filho.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const p of filho.data.split(/(\s+)/)) {
            if (!p) continue;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); continue; }
            const s = document.createElement('span');
            s.className = 'mov-pal';
            s.textContent = p;
            frag.appendChild(s);
            pecas.push(s);
          }
          no.replaceChild(frag, filho);
        } else if (filho.nodeType === 1 && filho.tagName !== 'BR') {
          if (filho.classList.contains('inteiro')) pecas.push(filho);
          else andar(filho);
        }
      }
    })(el);
    if (!pecas.length) { el.replaceChildren(...copia.childNodes); return 0; }

    // Linhas pela posição de cada peça.
    const linhas = [];
    let topo = -Infinity;
    for (const p of pecas) {
      const t = p.getBoundingClientRect().top;
      if (t > topo + 2) { linhas.push([]); topo = t; }
      linhas[linhas.length - 1].push(p);
    }

    const ehTarde = (p) => !!(p.parentNode && p.parentNode !== el && p.parentNode.closest(tardeSel));
    const frag = document.createDocumentFragment();
    let ultimo = 0;
    let atraso = inicio;
    linhas.forEach((ps) => {
      const fora = document.createElement('span');
      fora.className = 'mov-linha';
      const dentro = document.createElement('span');
      dentro.className = 'mov-linha-in';
      fora.appendChild(dentro);
      const todaTarde = ps.every(ehTarde);
      const daLinha = atraso + (todaTarde ? T.tarde : 0);
      dentro.style.setProperty('--dl', `${daLinha}ms`);
      dentro.style.setProperty('--dur', `${dur}ms`);
      ultimo = Math.max(ultimo, daLinha + dur);
      // Recria, dentro da linha, os elementos que envolviam cada peça.
      const pilha = [];
      ps.forEach((p, j) => {
        const cadeia = [];
        for (let a = p.parentNode; a && a !== el; a = a.parentNode) cadeia.unshift(a);
        let k = 0;
        while (k < pilha.length && k < cadeia.length && pilha[k].orig === cadeia[k]) k++;
        pilha.length = k;
        if (j) (k ? pilha[k - 1].clone : dentro).appendChild(document.createTextNode(' '));
        for (; k < cadeia.length; k++) {
          const c = cadeia[k].cloneNode(false);
          if (!todaTarde && cadeia[k].matches(tardeSel)) {
            c.classList.add('mov-tarde');
            c.style.setProperty('--dl', `${daLinha + T.tarde}ms`);
            c.style.setProperty('--dur', `${dur}ms`);
            ultimo = Math.max(ultimo, daLinha + T.tarde + dur);
          }
          (k ? pilha[k - 1].clone : dentro).appendChild(c);
          pilha.push({ orig: cadeia[k], clone: c });
        }
        (pilha.length ? pilha[pilha.length - 1].clone : dentro).appendChild(p);
      });
      frag.appendChild(fora);
      atraso += passo;
    });
    el.replaceChildren(frag);
    el.classList.add('partido');
    if (nome) el.setAttribute('aria-label', nome);

    // Volta ao HTML de origem quando a última linha parar. A classe .partido
    // fica: ela diz ao CSS que o título já entrou pelas linhas.
    let voltou = false;
    const voltar = () => {
      if (voltou) return;
      voltou = true;
      el.replaceChildren(...copia.childNodes);
      el.removeAttribute('aria-label');
      partidos.delete(el);
    };
    partidos.set(el, voltar);
    let restam = el.querySelectorAll('.mov-linha-in, .mov-tarde').length;
    el.addEventListener('animationend', function fim(e) {
      if (!e.target.classList.contains('mov-linha-in') && !e.target.classList.contains('mov-tarde')) return;
      if (--restam > 0) return;
      el.removeEventListener('animationend', fim);
      voltar();
    });
    return ultimo;
  }
  // Título partido -> a função que o devolve ao HTML de origem.
  const partidos = new Map();
  const voltarDentro = (bloco) => {
    for (const [el, voltar] of [...partidos]) if (bloco && bloco.contains(el)) voltar();
  };

  // Entra uma vez, um pouco antes de chegar à tela. Um bloco que já acabou
  // (o foco chegou nele antes) não entra de novo.
  function observar(alvos, aoEntrar) {
    const io = new IntersectionObserver((entradas) => {
      const vistas = entradas.filter((e) => e.isIntersecting).map((e) => e.target);
      vistas.forEach((alvo, i) => {
        io.unobserve(alvo);
        if (!alvo.classList.contains('fim')) aoEntrar(alvo, i);
      });
    }, { rootMargin: '0px 0px 6% 0px' });
    alvos.forEach((a) => a && io.observe(a));
  }

  // Marca o bloco como visto e, quando tudo nele parou, tira as animações
  // (o estado final é o próprio CSS da página).
  function entrar(bloco, duracao, classe = 'ja', fim = 'fim') {
    bloco.classList.add(classe);
    setTimeout(() => bloco.classList.add(fim), duracao + 120);
  }

  function iniciarMovimento(m) {
    lerTempos();
    const largo = window.matchMedia('(min-width: 641px)');
    const ms = (n) => `${Math.round(n)}ms`;
    const $ = (s, d = document) => d.querySelector(s);
    const $$ = (s, d = document) => [...d.querySelectorAll(s)];
    const agora = () => performance.now();
    // Até quando a chegada ocupa a tela. Um bloco que aparece antes disso
    // espera a vez, para nunca correr junto dela.
    let chegadaAte = 0;
    let t0 = 0;
    const convite = $('.convite');
    // Quando o convite começa a abrir na chegada: lado a lado, logo depois do
    // botão do app; numa coluna só, ele fica embaixo do botão e espera o herói.
    const CONVITE_LARGO = 400;
    const CONVITE_ESTREITO = 900;
    const espera = () => Math.max(0, chegadaAte - agora());

    // Chegada: a marca e o rótulo acendem, o título sobe por linha, e o texto
    // e os botões acendem com a segunda linha. O botão está pleno em 680 ms.
    const chegada = () => {
      t0 = agora();
      const fim = Math.max(680, partir($('.hero h1'), 120) || 120 + T.bloco);
      entrar(document.body, fim, 'chegou', 'chegou-fim');
      clearTimeout(m.socorro);
      chegadaAte = t0 + fim;
      // O convite na tela desde já faz parte da chegada: reserva o tempo dele
      // (e o das anotações, lado a lado) antes de qualquer outro bloco pedir a vez.
      const cartao = convite && $('.cv-cartao', convite);
      if (cartao && cartao.getBoundingClientRect().top < window.innerHeight * 1.06) {
        const cv = (largo.matches ? CONVITE_LARGO : CONVITE_ESTREITO) + 420 + T.bloco;
        chegadaAte = Math.max(chegadaAte, t0 + cv + (largo.matches ? 2 * 60 + T.estado : 0));
      }
    };

    // O convite em quatro tempos: o painel (que já traz a marca e o rótulo),
    // "Bora na sexta?", a hora e a idade, os botões. As anotações esperam o
    // cartão assentar.
    let conviteAte = 0;
    const montarConvite = (base) => {
      if (!convite || convite.classList.contains('ja')) return;
      convite.style.setProperty('--base', ms(base));
      let fim = base + 600 + T.estado;
      fim = Math.max(fim, partir($('.cv-titulo', convite), base + 160, { dur: T.bloco }));
      fim = Math.max(fim, partir($('.cv-hora', convite), base + 360, { dur: T.bloco }));
      fim = Math.max(fim, partir($('.cv-hora-linha .cv-rotulo', convite), base + 420, { dur: T.bloco }));
      conviteAte = agora() + fim;
      entrar(convite, fim);
      if (largo.matches) {
        const notas = fim;
        convite.style.setProperty('--notas', ms(notas));
        entrar(convite, notas + 200 + 2 * 60 + T.estado, 'ja-notas', 'fim-notas');
        // Os pilares podem entrar quando os fios das anotações acabarem.
        chegadaAte = Math.max(chegadaAte, agora() + notas + 2 * 60 + T.estado);
      } else {
        chegadaAte = Math.max(chegadaAte, conviteAte);
      }
    };

    const iniciar = () => {
      chegada();
      if (convite) {
        observar([$('.cv-cartao', convite)], () => montarConvite(Math.max(0, t0 + (largo.matches ? CONVITE_LARGO : CONVITE_ESTREITO) - agora())));
        // Numa coluna só, as anotações ficam embaixo do cartão e entram quando chegam.
        if (!largo.matches) {
          observar([$('.nota-1', convite)], () => {
            if (!convite.classList.contains('ja')) montarConvite(0);
            const notas = Math.max(0, conviteAte - agora());
            convite.style.setProperty('--notas', ms(notas));
            entrar(convite, notas + 2 * 60 + T.estado + 200, 'ja-notas', 'fim-notas');
          });
        }
      }

      // Rolagem: cada bloco entra uma vez. Se aparecer durante a chegada,
      // espera ela acabar; se entrar junto de outro, vem um passo depois.
      observar($$('.pilar'), (pilar, i) => {
        const base = espera() + i * T.passo;
        pilar.style.setProperty('--base', ms(base));
        const fim = Math.max(base + T.titulo, partir($('h2', pilar), base + 160, { dur: T.titulo }));
        entrar(pilar, fim);
      });
      observar([$('.pilares-acao')], (el) => {
        const base = espera() + 200;
        el.style.setProperty('--base', ms(base));
        entrar(el, base + T.estado);
      });
      observar([$('.manifesto')], (el) => {
        const base = espera();
        el.style.setProperty('--base', ms(base));
        const fim = Math.max(base + 600 + T.estado, partir($('.manifesto-assinatura', el), base, { tarde: '.manifesto-assinatura span', passo: 0 }));
        entrar(el, fim);
      });
      observar([$('.inscricao')], (el) => {
        const base = espera();
        el.style.setProperty('--base', ms(base));
        const fim = Math.max(base + 360 + T.estado, partir($('h2', el), base));
        entrar(el, fim);
      });
      observar([$('.rodape')], (el) => {
        const base = espera();
        el.style.setProperty('--base', ms(base));
        entrar(el, base + T.titulo);
      });

      // Quem chega pelo teclado não espera a animação: um foco num bloco que
      // ainda está entrando o põe pronto na hora (anel de foco sempre visível).
      document.addEventListener('focusin', (e) => {
        const alvo = e.target;
        if (!alvo || typeof alvo.closest !== 'function') return;
        if (!document.body.classList.contains('chegou-fim') && alvo.closest('.topo, .hero-texto')) {
          document.body.classList.add('chegou', 'chegou-fim');
          voltarDentro($('.hero h1'));
        }
        const bloco = alvo.closest('.pilar, .pilares-acao, .manifesto, .inscricao, .rodape');
        if (bloco && !bloco.classList.contains('fim')) {
          bloco.classList.add('ja', 'fim');
          voltarDentro(bloco);
        }
      });

      // Mudou a largura com um título partido: ele volta já ao HTML de origem,
      // para quebrar de novo pela largura nova.
      let largura = window.innerWidth;
      window.addEventListener('resize', () => {
        if (window.innerWidth === largura) return;
        largura = window.innerWidth;
        [...partidos.values()].forEach((voltar) => voltar());
      });
    };

    // Começa assim que a fonte do título estiver pronta, sem esperar o resto
    // da página: no máximo 300 ms. Se ela não chegar, o título entra inteiro.
    let foi = false;
    const vai = () => {
      if (foi || m.desistiu || !movendo()) return;
      foi = true;
      try { iniciar(); } catch (e) { m.desistir(); }
    };
    if (document.fonts && typeof document.fonts.load === 'function') {
      document.fonts.load('1em "Instrument Serif"').then(() => requestAnimationFrame(vai), vai);
      setTimeout(vai, 300);
    } else {
      vai();
    }
  }

  const movimento = prepararMovimento();
  const quandoPronto = () => {
    iniciarFormulario();
    if (movimento && !movimento.desistiu) {
      try { iniciarMovimento(movimento); } catch (e) { movimento.desistir(); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', quandoPronto, { once: true });
  else quandoPronto();
})();

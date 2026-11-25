'use strict';
// A landing: a demo em três toques, o menu e o movimento da página. O resto é
// HTML pronto; os botões do app são links comuns.
//
// O script carrega no <head>, sem defer: ele põe .js e .mov na raiz antes da
// primeira pintura. Com .js, a demo troca de tela pelos passos (sem ele, as
// telas correm de lado com o dedo) e o menu do celular abre. Só com .mov o
// CSS esconde o que vai entrar. Sem JavaScript, com movimento reduzido ou sem
// IntersectionObserver, .mov não entra e a página aparece pronta. Se algo
// falhar no meio, a classe sai.

(() => {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.classList.add('js');

  const semMovimento = () => typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

  // ---------------------------------------------------------------- lista

  // "Quer ficar por dentro?": o e-mail vai para /api/lista (nucleo/validacao.js).
  // Sem JavaScript, o formulário posta direto e o servidor volta para cá.
  // A regra do e-mail é a mesma do servidor (EMAIL); teste/opiniao-email.test.js
  // confere que as duas são iguais.
  const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  // Sem espaço nas pontas, em minúsculas e sem o ponto que escapa no fim.
  const emailLimpo = (v) => {
    const e = String(v || '').trim().toLowerCase().replace(/\.+$/, '');
    return e.length <= 254 && EMAIL.test(e) ? e : null;
  };

  function ligarLista() {
    const form = document.getElementById('lista');
    if (!form || form.dataset.ligado) return;
    form.dataset.ligado = '1';
    const status = document.getElementById('lista-status');
    const campo = form.querySelector('input[name="email"]');
    const isca = form.querySelector('input[name="site"]');
    const sair = form.querySelector('input[name="sair"]');
    const botao = form.querySelector('button[type="submit"]');
    const acao = form.querySelector('.lista-acao');
    const trocaSair = form.querySelector('.lista-sair');
    const outro = form.querySelector('.lista-outro');
    const FRASES = {
      ok: 'Pronto. Você recebe as novidades antes de todo mundo.',
      ja: 'Esse e-mail já estava na lista.',
      saiu: 'Pronto, esse e-mail saiu da lista.',
      erro: 'Esse e-mail não parece certo. Confere?',
      espera: 'Muitos pedidos daqui. O e-mail não entrou; tente daqui a pouco.',
    };
    const dizer = (texto, { errado = false } = {}) => {
      status.textContent = texto;
      status.setAttribute('role', errado ? 'alert' : 'status');
      if (errado) campo.setAttribute('aria-invalid', 'true');
      else campo.removeAttribute('aria-invalid');
    };
    const modo = (saindo) => {
      sair.value = saindo ? '1' : '0';
      acao.textContent = saindo ? 'Tirar meu e-mail' : 'Quero receber';
      if (trocaSair) trocaSair.textContent = saindo ? 'Cancelar' : 'Sair da lista';
    };
    // Feito: o foco vai para a frase (o botão some), e o "Usar outro e-mail" fica ao lado.
    const feita = () => {
      form.classList.add('feita');
      status.setAttribute('tabindex', '-1');
      status.focus({ preventScroll: true });
    };
    if (trocaSair) {
      trocaSair.addEventListener('click', () => {
        modo(sair.value !== '1');
        dizer(sair.value === '1' ? 'Escreva o e-mail que vai sair da lista.' : '');
        campo.focus();
      });
    }
    if (outro) {
      outro.addEventListener('click', () => {
        form.classList.remove('feita');
        status.removeAttribute('tabindex');
        modo(false);
        dizer('');
        campo.value = '';
        campo.focus();
      });
    }
    let ocupado = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ocupado) return;
      const email = emailLimpo(campo.value);
      if (!email) {
        dizer(FRASES.erro, { errado: true });
        campo.focus();
        return;
      }
      campo.value = email;
      ocupado = true;
      botao.disabled = true;
      dizer('');
      let r = null;
      try {
        const resp = await fetch('/api/lista', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, de: 'landing', site: isca ? isca.value : '', sair: sair.value === '1' }) });
        r = { ok: resp.ok, status: resp.status, dados: await resp.json().catch(() => null) };
      } catch {
        r = null;
      }
      ocupado = false;
      botao.disabled = false;
      if (!r || !r.ok) {
        dizer(r && r.status === 429 ? FRASES.espera : (r && r.dados && r.dados.erro) || 'A internet sumiu no meio. O e-mail não entrou; tente de novo.', { errado: true });
        campo.focus();
        return;
      }
      dizer(r.dados && r.dados.saiu ? FRASES.saiu : r.dados && r.dados.ja ? FRASES.ja : FRASES.ok);
      feita();
    });
    // Sem JavaScript, o servidor volta para cá com o resultado no endereço.
    // Lido, ele sai do endereço: recarregar ou copiar o link não repete a frase.
    const volta = new URLSearchParams(window.location.search).get('lista');
    if (volta && FRASES[volta]) {
      if (volta === 'ok' || volta === 'saiu') form.classList.add('feita');
      dizer(FRASES[volta], { errado: volta === 'erro' || volta === 'espera' });
    }
    if (volta !== null) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('lista');
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      } catch { /* tudo bem */ }
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligarLista);
    else ligarLista();
  }

  // ---------------------------------------------------------------- demo

  // Três telas num trilho: a lista, a festa e o convite no grupo. Os passos à
  // esquerda, os toques dentro do celular e o "Tô dentro" do cartão do herói
  // levam à tela de cada um. Na terceira, as respostas chegam uma a uma.
  function iniciarDemo() {
    const telas = document.getElementById('telas');
    const demo = document.getElementById('demo');
    if (!telas || !demo) return;
    const quadros = [...telas.children];
    const passos = [...document.querySelectorAll('#passos [data-passo]')];
    const respostas = [...document.querySelectorAll('#respostas li')];
    const placar = document.getElementById('placar');
    const status = document.getElementById('demo-status');
    let atual = 0;
    let visto = false;
    let relogios = [];

    function irPara(n, { anunciar = true } = {}) {
      const vinhaDeDentro = telas.contains(document.activeElement);
      atual = n;
      telas.style.transform = `translateX(${-100 * n}%)`;
      quadros.forEach((t, i) => {
        const aqui = i === n;
        t.toggleAttribute('inert', !aqui);
        t.setAttribute('aria-hidden', String(!aqui));
        t.classList.toggle('ativa', aqui && visto);
      });
      passos.forEach((b, i) => {
        b.classList.toggle('ativo', i === n);
        b.classList.toggle('feito', i < n);
        if (i === n) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
      relogios.forEach(clearTimeout);
      relogios = [];
      respostas.forEach((li) => li.classList.remove('chegou'));
      if (placar) placar.classList.remove('chegou');
      if (n === 2) {
        const passo = semMovimento() ? 0 : 550;
        respostas.forEach((li, i) => relogios.push(setTimeout(() => li.classList.add('chegou'), passo && 350 + i * passo)));
        if (placar) relogios.push(setTimeout(() => placar.classList.add('chegou'), passo && 350 + respostas.length * passo));
      }
      if (anunciar && status) status.textContent = quadros[n] ? quadros[n].getAttribute('aria-label') || '' : '';
      // Quem tocou dentro do celular continua lá: o foco vai à tela nova.
      if (vinhaDeDentro && quadros[n]) {
        const alvo = quadros[n].querySelector('button, a');
        if (alvo) alvo.focus({ preventScroll: true });
      }
    }

    demo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-passo]');
      if (b) irPara(Number(b.dataset.passo));
    });
    const reinicia = document.getElementById('demo-reinicia');
    if (reinicia) reinicia.addEventListener('click', () => irPara(0));
    // Do cartão do herói, vai direto ao celular (numa coluna só, ele fica
    // embaixo dos passos).
    const aparelho = demo.querySelector('.aparelho');
    document.querySelectorAll('[data-ir-passo]').forEach((a) => a.addEventListener('click', (e) => {
      irPara(Number(a.dataset.irPasso));
      if (!aparelho) return;
      e.preventDefault();
      aparelho.scrollIntoView({ block: 'center', behavior: semMovimento() ? 'auto' : 'smooth' });
    }));
    irPara(0, { anunciar: false });

    // O toque que pede o dedo só pulsa quando a demo chega à tela.
    const acender = () => {
      if (visto) return;
      visto = true;
      quadros[atual].classList.add('ativa');
    };
    if (typeof window.IntersectionObserver === 'function') {
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { io.disconnect(); acender(); }
      }, { rootMargin: '0px 0px -20% 0px' });
      io.observe(telas);
    } else acender();
  }

  // ---------------------------------------------------------------- menu

  // No celular, as seções ficam atrás de um botão. Em toda largura, o item da
  // seção que está na tela fica marcado.
  function iniciarMenu() {
    const botao = document.getElementById('menu-botao');
    const movel = document.getElementById('menu-movel');
    if (!botao || !movel) return;
    const fechar = () => { movel.hidden = true; botao.setAttribute('aria-expanded', 'false'); botao.setAttribute('aria-label', 'Abrir o menu'); };
    botao.addEventListener('click', () => {
      const abrir = movel.hidden;
      movel.hidden = !abrir;
      botao.setAttribute('aria-expanded', String(abrir));
      botao.setAttribute('aria-label', abrir ? 'Fechar o menu' : 'Abrir o menu');
    });
    movel.addEventListener('click', (e) => { if (e.target.closest('a')) fechar(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !movel.hidden) { fechar(); botao.focus(); }
    });

    if (typeof window.IntersectionObserver !== 'function') return;
    const itens = [...document.querySelectorAll('.menu-item')];
    const secoes = itens.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        itens.forEach((a) => {
          const aqui = a.getAttribute('href') === `#${e.target.id}`;
          a.classList.toggle('ativo', aqui);
          if (aqui) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    secoes.forEach((s) => io.observe(s));
  }

  // ---------------------------------------------------------------- movimento

  // Decide já, no <head>, se a página vai se mover. A coreografia mora no
  // landing.css; aqui só se diz quando cada bloco entra.
  function prepararMovimento() {
    if (typeof window === 'undefined' || !document.documentElement) return null;
    const raiz = document.documentElement;
    const pode = typeof window.IntersectionObserver === 'function'
      && !semMovimento()
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
    const ms = (n) => `${Math.round(n)}ms`;
    const $ = (s, d = document) => d.querySelector(s);
    const $$ = (s, d = document) => [...d.querySelectorAll(s)];
    const agora = () => performance.now();
    // Até quando a chegada ocupa a tela. Um bloco que aparece antes disso
    // espera a vez, para nunca correr junto dela.
    let chegadaAte = 0;
    let t0 = 0;
    const espera = () => Math.max(0, chegadaAte - agora());
    // A foto do herói abre logo depois do botão do app, quando está ao lado
    // do texto; numa coluna só, ela fica embaixo e espera o herói.
    const FOTO_LARGO = 400;
    const FOTO_ESTREITO = 900;
    const largo = window.matchMedia('(min-width: 861px)');

    // Chegada: a marca e o rótulo acendem, o título sobe por linha, e o texto
    // e os botões acendem com a segunda linha. O botão está pleno em 680 ms.
    const chegada = () => {
      t0 = agora();
      const fim = Math.max(680, partir($('.hero h1'), 120) || 120 + T.bloco);
      entrar(document.body, fim, 'chegou', 'chegou-fim');
      clearTimeout(m.socorro);
      chegadaAte = t0 + fim;
    };

    // A foto abre e o cartão chega depois, com a hora subindo da máscara.
    const abrirFoto = (foto, base) => {
      foto.style.setProperty('--base', ms(base));
      const fim = Math.max(base + T.titulo, partir($('.destaque-hora', foto), base + 560, { dur: T.bloco }));
      entrar(foto, fim);
      chegadaAte = Math.max(chegadaAte, agora() + Math.min(fim, base + 600));
    };

    const iniciar = () => {
      chegada();
      const foto = $('.foto');
      if (foto) {
        const naTela = foto.getBoundingClientRect().top < window.innerHeight * 1.06;
        if (naTela) chegadaAte = Math.max(chegadaAte, t0 + (largo.matches ? FOTO_LARGO : FOTO_ESTREITO) + 600);
        observar([foto], (el) => abrirFoto(el, Math.max(0, t0 + (largo.matches ? FOTO_LARGO : FOTO_ESTREITO) - agora())));
      }

      // Rolagem: cada bloco entra uma vez. Se aparecer durante a chegada,
      // espera ela acabar; se entrar junto de outro, vem um passo depois.
      observar([$('.demo')], (el) => {
        const base = espera();
        el.style.setProperty('--base', ms(base));
        const fim = Math.max(base + 600 + T.estado, partir($('h2', el), base + 160, { dur: T.titulo }));
        entrar(el, Math.max(fim, base + T.titulo));
      });
      observar([$('.como')], (el) => {
        const base = espera();
        el.style.setProperty('--base', ms(base));
        const fim = Math.max(base + 900 + T.estado, partir($('.como-texto h2', el), base + 240, { dur: T.titulo }));
        entrar(el, fim);
      });
      observar($$('.pilar'), (pilar, i) => {
        const base = espera() + i * T.passo;
        pilar.style.setProperty('--base', ms(base));
        const fim = Math.max(base + T.titulo, partir($('h3', pilar), base + 160, { dur: T.titulo }));
        entrar(pilar, fim);
      });
      observar([$('.final')], (el) => {
        const base = espera();
        el.style.setProperty('--base', ms(base));
        const fim = Math.max(base + 720 + 4 * T.passo + T.estado, partir($('.manifesto-assinatura', el), base, { tarde: '.manifesto-assinatura span', passo: 0 }));
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
        if (!document.body.classList.contains('chegou-fim') && alvo.closest('.menu, .hero-texto')) {
          document.body.classList.add('chegou', 'chegou-fim');
          voltarDentro($('.hero h1'));
        }
        const bloco = alvo.closest('.foto, .demo, .como, .pilar, .final, .rodape');
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
    try { iniciarDemo(); } catch (e) { /* a demo fica na primeira tela */ }
    try { iniciarMenu(); } catch (e) { /* o menu do celular fica fechado */ }
    if (movimento && !movimento.desistiu) {
      try { iniciarMovimento(movimento); } catch (e) { movimento.desistir(); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', quandoPronto, { once: true });
  else quandoPronto();
})();

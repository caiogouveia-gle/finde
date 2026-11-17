'use strict';
// A landing: o filtro da lista por dia e o formulário de e-mail, que é só
// visual. A lista já vem montada do servidor; aqui ela só mostra e esconde.
// O formulário confere o formato e avisa que é protótipo: não envia nada.
// O dia escolhido fica na aba (sessionStorage): quem abre uma festa e volta
// encontra a lista no mesmo filtro.

(() => {
  const filtros = Array.from(document.querySelectorAll('.filtro'));
  const itens = Array.from(document.querySelectorAll('#linhas > li'));
  const vazio = document.getElementById('vazio');
  const contagem = document.getElementById('contagem');
  const ONDE = { todas: 'na lista da semana', sex: 'na sexta', sab: 'no sábado', dom: 'no domingo' };
  const VAZIO = {
    todas: 'A lista desta semana ainda está vazia. Ela fecha na quarta.',
    dia: 'Ainda não tem festa nesse dia. A lista fecha na quarta.',
  };

  const GUARDA = 'finde.landing.dia';

  function filtrar(dia) {
    let n = 0;
    for (const li of itens) {
      const ve = dia === 'todas' || li.dataset.dia === dia;
      li.hidden = !ve;
      if (ve) n += 1;
    }
    for (const b of filtros) b.setAttribute('aria-pressed', String(b.dataset.dia === dia));
    vazio.textContent = dia === 'todas' ? VAZIO.todas : VAZIO.dia;
    vazio.hidden = n > 0;
    contagem.textContent = n ? `${n} ${n === 1 ? 'festa' : 'festas'} ${ONDE[dia]}` : vazio.textContent;
  }
  for (const b of filtros) {
    b.addEventListener('click', () => {
      filtrar(b.dataset.dia);
      try {
        sessionStorage.setItem(GUARDA, b.dataset.dia);
      } catch { /* sem armazenamento: o filtro só não volta */ }
    });
  }
  let guardado = null;
  try {
    guardado = sessionStorage.getItem(GUARDA);
  } catch { /* idem */ }
  if (guardado && guardado !== 'todas' && Object.hasOwn(ONDE, guardado)) {
    filtrar(guardado);
    contagem.textContent = ''; // ao abrir, nada a anunciar
  }

  // Quem volta do detalhe de uma festa da lista (/app?festa=…, mesma origem)
  // cai na lista, não no topo: comparar festas não pede rolar duas telas.
  let veioDaFesta = false;
  try {
    const de = new URL(document.referrer);
    veioDaFesta = de.origin === location.origin && /^\/app\/?$/.test(de.pathname) && de.searchParams.has('festa');
  } catch { /* sem referrer: abre no topo */ }
  const festas = document.getElementById('festas');
  if (veioDaFesta && !location.hash && festas) {
    try {
      festas.scrollIntoView({ block: 'start', behavior: 'instant' });
    } catch {
      festas.scrollIntoView(true); // navegador sem "instant": rola do jeito dele
    }
  }

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
})();

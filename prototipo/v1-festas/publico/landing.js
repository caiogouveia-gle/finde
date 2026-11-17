'use strict';
// A landing: só o formulário de e-mail, que é visual. Ele confere o formato e
// avisa que é protótipo: não envia nem guarda nada. O resto da página é HTML
// pronto; o botão do herói leva ao protótipo por um link comum.

(() => {
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

'use strict';
// O e-mail da lista no cliente: a mesma regra do servidor (nucleo/validacao.js,
// EMAIL) em /opiniao, no bloco do app e na landing, e a mesma limpeza (sem
// espaço, minúsculas, sem o ponto que escapa no fim). Antes de 24/11/2026 o
// cliente aceitava "x@y.com." e "a@b_c.com", o servidor recusava e a tela
// dizia que tinha dado certo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { emailValido } = require('../nucleo/validacao');

const PUBLICO = path.join(__dirname, '..', 'publico');
const ler = (nome) => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const regraDe = (fonte) => (fonte.match(/const EMAIL = (\/\^.+\$\/);/) || [])[1];

test('a regra do e-mail é a mesma no servidor, em opiniao.js e em landing.js', () => {
  const doServidor = regraDe(ler('nucleo/validacao.js'));
  assert.ok(doServidor, 'falta a EMAIL no servidor');
  assert.equal(regraDe(ler('publico/opiniao.js')), doServidor);
  assert.equal(regraDe(ler('publico/landing.js')), doServidor);
});

// opiniao.js num contexto mínimo: só o que a limpeza do e-mail precisa.
function emailLimpo() {
  const window = { Finde: { el() {} }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLICO, 'opiniao.js'), 'utf8'), { window, document: { addEventListener() {} } });
  return window.FindeOpiniao.emailLimpo;
}

test('emailLimpo: limpa como o servidor e recusa o que ele recusa', () => {
  const limpo = emailLimpo();
  assert.equal(limpo('  Ana.Teste@Exemplo.COM. '), 'ana.teste@exemplo.com');
  assert.equal(limpo('teste@exemplo.com..'), 'teste@exemplo.com');
  for (const ruim of ['', '   ', 'teste', 'teste@exemplo', 'a@b_c.com', 'a b@exemplo.com', 'a@-exemplo.com', '<a>@exemplo.com', null, 7]) {
    assert.equal(limpo(ruim), null, `deveria recusar ${JSON.stringify(ruim)}`);
  }
  // O que o cliente manda, o servidor aceita igual.
  for (const bom of ['ana@exemplo.com', ' Bia+festas@Sub.Exemplo.com.br. ', 'c_d@exemplo-1.org']) {
    const e = limpo(bom);
    assert.ok(e, bom);
    assert.equal(emailValido(e), e);
  }
});

test('landing.js: a limpeza é a mesma, e o ?lista= sai do endereço', () => {
  const JS = ler('publico/landing.js');
  assert.match(JS, /\.trim\(\)\.toLowerCase\(\)\.replace\(\/\\\.\+\$\/, ''\)/);
  assert.doesNotMatch(JS, /\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//, 'a regra frouxa saiu');
  assert.match(JS, /searchParams\.delete\('lista'\)/);
  assert.match(JS, /history\.replaceState/);
});

test('landing.html: "Sair da lista" fora da descrição do campo, e o "Usar outro e-mail" no formulário', () => {
  const HTML = ler('publico/landing.html');
  const form = HTML.slice(HTML.indexOf('<form class="lista"'), HTML.indexOf('</form>', HTML.indexOf('<form class="lista"')));
  const descrito = (form.match(/id="lista-email"[^>]*aria-describedby="([^"]+)"/) || [])[1];
  assert.ok(descrito, 'o campo tem descrição');
  for (const id of descrito.split(/\s+/)) {
    const alvo = form.match(new RegExp(`<(\\w+)[^>]*id="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
    assert.ok(alvo, `falta #${id}`);
    assert.doesNotMatch(alvo[2], /<button/, `#${id} não pode conter botão`);
  }
  assert.match(descrito, /lista-status/, 'o erro, perto do campo, entra na descrição');
  assert.match(form, /<button class="lista-outro" type="button">Usar outro e-mail<\/button>/);
});

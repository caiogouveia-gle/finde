'use strict';
// A opinião (publico/opiniao.js) num DOM de mentira, com relógio e fetch na
// mão: a nota compacta grava uma vez depois que a pessoa para, o comentário
// não vai vazio nem duas vezes, o e-mail recusado não vira "deu certo", o
// "Agora não" deixa a porta de volta e a pergunta vista conta uma vez.
// Nenhum dado real: os e-mails são de exemplo.com.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = fs.readFileSync(path.join(__dirname, '..', 'publico', 'opiniao.js'), 'utf8');

// ---------------------------------------------------------------- o DOM de mentira

class No {
  constructor(tag) {
    this.tag = tag; this.filhos = []; this.pai = null; this.atributos = {}; this.proprio = '';
    this.ouvintes = {}; this.value = ''; this.checked = false; this.className = '';
    const classes = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...c) => { this.className = [...new Set([...classes(), ...c])].join(' '); },
      remove: (...c) => { this.className = [...classes()].filter((x) => !c.includes(x)).join(' '); },
      contains: (c) => classes().has(c),
    };
  }
  get id() { return this.atributos.id || ''; }
  get hidden() { return 'hidden' in this.atributos; }
  set hidden(v) { if (v) this.atributos.hidden = ''; else delete this.atributos.hidden; }
  set textContent(v) { this.proprio = String(v); this.filhos = []; }
  get textContent() { return this.proprio + this.filhos.map((f) => f.textContent).join(''); }
  setAttribute(k, v) { this.atributos[k] = String(v); if (k === 'value') this.value = String(v); }
  getAttribute(k) { return k in this.atributos ? this.atributos[k] : null; }
  removeAttribute(k) { delete this.atributos[k]; }
  append(...n) { for (const f of n) { f.pai = this; this.filhos.push(f); } }
  replaceChildren(...n) { this.filhos = []; this.proprio = ''; this.append(...n); }
  replaceWith(n) { const i = this.pai.filhos.indexOf(this); this.pai.filhos[i] = n; n.pai = this.pai; this.pai = null; }
  addEventListener(tipo, f) { (this.ouvintes[tipo] ||= []).push(f); }
  disparar(tipo, extra = {}) {
    const e = { type: tipo, target: this, preventDefault() {}, ...extra };
    let n = this;
    while (n) { for (const f of n.ouvintes[tipo] || []) f(e); n = n.pai; }
    return e;
  }
  focus() { documento.activeElement = this; }
  todos() { return this.filhos.flatMap((f) => [f, ...f.todos()]); }
  // Só os seletores que opiniao.js usa: tag, tag:checked, .classe.
  querySelector(sel) {
    return this.todos().find((n) => {
      if (sel.startsWith('.')) return n.classList.contains(sel.slice(1));
      const [tag, estado] = sel.split(':');
      return n.tag === tag && (estado !== 'checked' || n.checked);
    }) || null;
  }
  get conectado() { let n = this; while (n.pai) n = n.pai; return n === documento.raiz; }
}
const documento = { activeElement: null, raiz: null };

function el(tag, atributos = {}, ...filhos) {
  const no = new No(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') no.className = v;
    else if (k === 'texto') no.textContent = v;
    else no.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    no.append(f instanceof No ? f : Object.assign(new No('#text'), { proprio: String(f) }));
  }
  return no;
}

// opiniao.js com o relógio, o fetch, o IntersectionObserver e o FindeMedir na mão.
function montar({ respostas = {}, io = true } = {}) {
  const pedidos = [];
  const contados = [];
  const relogios = new Map();
  let proximo = 0;
  const olhos = [];
  const guardado = {};
  documento.raiz = el('body');
  documento.activeElement = null;
  const window = {
    Finde: { el, seta: () => null, avanco: () => null, marca: () => el('a'), rodape: () => el('footer') },
    FindeMedir: { aparelho: () => 'aparelho-de-teste-123', contar: (ev, p) => contados.push(p === undefined ? [ev] : [ev, p]) },
    addEventListener() {},
  };
  if (io) {
    window.IntersectionObserver = class {
      constructor(f) { this.f = f; this.alvos = []; this.ligado = true; olhos.push(this); }
      observe(n) { this.alvos.push(n); }
      disconnect() { this.ligado = false; }
      ver() { if (this.ligado) this.f(this.alvos.map((target) => ({ target, isIntersecting: true })), this); }
    };
  }
  const fetch = async (caminho, opcoes) => {
    const corpo = JSON.parse(opcoes.body);
    pedidos.push({ caminho, corpo });
    const r = await (typeof respostas[caminho] === 'function' ? respostas[caminho](corpo) : (respostas[caminho] || { status: 200, dados: { ok: true } }));
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.dados };
  };
  vm.runInNewContext(JS, {
    window, fetch, Date,
    document: { addEventListener() {} },
    localStorage: { getItem: (k) => guardado[k] ?? null, setItem: (k, v) => { guardado[k] = String(v); } },
    setTimeout: (f, ms) => { proximo += 1; relogios.set(proximo, { f, ms }); return proximo; },
    clearTimeout: (n) => { relogios.delete(n); },
  });
  const passarTempo = async () => {
    const lista = [...relogios.values()];
    relogios.clear();
    for (const r of lista) await r.f();
    await espera();
  };
  return { O: window.FindeOpiniao, pedidos, contados, relogios, olhos, guardado, passarTempo };
}
const espera = () => new Promise((r) => setImmediate(r));
const pendurar = (no) => { documento.raiz.append(no); return no; };
function marcar(forma, n) {
  const radios = forma.todos().filter((x) => x.tag === 'input' && x.getAttribute('type') === 'radio');
  for (const r of radios) r.checked = r.value === String(n);
  radios[n].disparar('change');
}
const achar = (raiz, classe) => raiz.querySelector(`.${classe}`);
const statusDe = (raiz) => raiz.todos().find((n) => n.tag === 'p' && n.getAttribute('role') === 'status' && n.classList.contains('status-curto'));
const enviar = async (form) => { form.disparar('submit'); await espera(); };

// ---------------------------------------------------------------- a nota compacta

test('compacta: setas e toques corrigidos viram um pedido só, com a última nota, depois que a pessoa para', async () => {
  const m = montar();
  const bloco = pendurar(m.O.formulario({ de: 'app', compacto: true }));
  marcar(bloco, 5);
  marcar(bloco, 6);
  marcar(bloco, 7);
  assert.equal(m.pedidos.length, 0, 'nada grava a cada seta');
  assert.equal(m.relogios.size, 1, 'uma espera só, refeita a cada mudança');
  assert.ok([...m.relogios.values()][0].ms >= 600, 'espera a pessoa parar');
  assert.equal(statusDe(bloco).textContent, '', 'sem "Anotado" antes do ok');
  await m.passarTempo();
  assert.deepEqual(m.pedidos.map((p) => [p.caminho, p.corpo.nota, p.corpo.de]), [['/api/opiniao', 7, 'app']]);
  assert.equal(statusDe(bloco).textContent, 'Anotado: 7. Valeu.');
  assert.ok(m.guardado['finde.opiniao'], 'respondeu neste aparelho');
  assert.equal(achar(bloco, 'opiniao-dizer').hidden, false, 'o "Dizer o que faltou" aparece depois do ok');
  assert.equal(achar(bloco, 'opiniao-lista').hidden, false, 'o e-mail aparece depois do ok');
});

test('compacta: recusada pelo servidor, não diz "Anotado" e não marca como respondida', async () => {
  const m = montar({ respostas: { '/api/opiniao': { status: 429, dados: { erro: 'Muitas respostas daqui. Tente daqui a pouco.' } } } });
  const bloco = pendurar(m.O.formulario({ de: 'app', compacto: true }));
  marcar(bloco, 9);
  await m.passarTempo();
  assert.equal(statusDe(bloco).textContent, 'Muitas respostas daqui. Tente daqui a pouco.');
  assert.equal(m.guardado['finde.opiniao'], undefined);
  assert.equal(achar(bloco, 'opiniao-lista').hidden, true);
});

test('compacta: o comentário não vai vazio, não vai duas vezes, e a frase diz o que foi', async () => {
  // O pedido com comentário fica no ar até o portão abrir.
  let portao = null;
  const m = montar({ respostas: { '/api/opiniao': async () => { if (portao) await portao; return { status: 200, dados: { ok: true } }; } } });
  const bloco = pendurar(m.O.formulario({ de: 'app', compacto: true }));
  marcar(bloco, 8);
  await m.passarTempo();
  achar(bloco, 'opiniao-dizer').disparar('click');
  const form = achar(bloco, 'opiniao-resto');
  const texto = form.querySelector('textarea');
  assert.equal(documento.activeElement, texto);
  await enviar(form);
  assert.equal(m.pedidos.length, 1, 'vazio não manda');
  assert.equal(texto.getAttribute('aria-invalid'), 'true');
  const erroTexto = form.todos().find((n) => n.id === texto.getAttribute('aria-describedby'));
  assert.match(erroTexto.textContent, /Escreva o que faltou/);
  // Toque duplo: o segundo envio chega com o primeiro ainda no ar.
  texto.value = '  faltou festa no domingo ';
  let soltar;
  portao = new Promise((r) => { soltar = r; });
  const antes = m.pedidos.length;
  form.disparar('submit');
  form.disparar('submit');
  await espera();
  assert.equal(m.pedidos.length - antes, 1, 'um pedido só');
  soltar();
  portao = null;
  await espera();
  await espera();
  assert.deepEqual(m.pedidos.at(-1).corpo, { nota: 8, texto: 'faltou festa no domingo', aparelho: 'aparelho-de-teste-123', de: 'app' });
  const ok = achar(bloco, 'opiniao-comentou');
  assert.equal(ok.textContent, 'O comentário chegou junto com a nota 8. Valeu.');
  assert.equal(documento.activeElement, ok);
  // Mudou a nota depois: o comentário vai junto, para não se apagar.
  marcar(bloco, 9);
  await m.passarTempo();
  assert.equal(m.pedidos.at(-1).corpo.texto, 'faltou festa no domingo');
});

test('compacta: o e-mail recusado diz que não entrou e deixa o campo aberto; o aceito diz que entrou', async () => {
  let resposta = { status: 400, dados: { erro: 'Esse e-mail não parece certo. Confere?' } };
  const m = montar({ respostas: { '/api/lista': () => resposta } });
  const bloco = pendurar(m.O.formulario({ de: 'app', compacto: true }));
  marcar(bloco, 10);
  await m.passarTempo();
  const lista = achar(bloco, 'opiniao-lista');
  const campo = lista.querySelector('input');
  const erro = lista.todos().find((n) => n.id && n.id.startsWith('email-erro'));
  assert.ok(campo.getAttribute('aria-describedby').split(' ').includes(erro.id), 'o erro descreve o campo');
  // Vazio e malformado nem saem daqui.
  await enviar(lista);
  assert.match(erro.textContent, /Escreva o seu e-mail/);
  campo.value = 'teste@exemplo';
  await enviar(lista);
  assert.match(erro.textContent, /não parece certo/);
  assert.equal(m.pedidos.filter((p) => p.caminho === '/api/lista').length, 0);
  // O servidor recusa: a frase diz, o campo fica.
  campo.value = ' Teste@Exemplo.com. ';
  await enviar(lista);
  assert.deepEqual(m.pedidos.at(-1), { caminho: '/api/lista', corpo: { email: 'teste@exemplo.com', de: 'app', site: '' } });
  assert.equal(erro.textContent, 'Esse e-mail não parece certo. Confere?');
  assert.ok(lista.conectado, 'o campo continua lá');
  assert.equal(documento.activeElement, campo);
  resposta = { status: 429, dados: { erro: 'Muitos pedidos daqui.' } };
  await enviar(lista);
  assert.match(erro.textContent, /^O e-mail não entrou/);
  assert.ok(lista.conectado);
  resposta = { status: 200, dados: { ok: true, ja: false } };
  await enviar(lista);
  assert.equal(lista.conectado, false);
  assert.equal(achar(bloco, 'opiniao-na-lista').textContent, 'Pronto: o seu e-mail está na lista das novidades.');
});

test('compacta: "Agora não" conta, deixa a porta "dar opinião" na frase e põe o foco nela', () => {
  const m = montar();
  const bloco = pendurar(m.O.formulario({ de: 'app', compacto: true }));
  achar(bloco, 'opiniao-depois').disparar('click');
  const frase = achar(documento.raiz, 'opiniao-fechada');
  assert.ok(frase, 'a frase entrou no lugar');
  assert.equal(frase.querySelector('a').getAttribute('href'), '/opiniao');
  assert.equal(frase.querySelector('a').textContent, 'dar opinião');
  assert.equal(documento.activeElement, frase);
  assert.equal(frase.getAttribute('tabindex'), '-1');
  assert.ok(m.guardado['finde.opiniao-depois']);
  assert.deepEqual(m.contados, [['opiniao-agora-nao']]);
});

test('compacta: a pergunta vista conta uma vez por carga (p = app), mesmo refeita', () => {
  const m = montar();
  m.O.formulario({ de: 'app', compacto: true });
  m.olhos[0].ver();
  m.O.formulario({ de: 'app', compacto: true });
  for (const o of m.olhos) o.ver();
  assert.deepEqual(m.contados, [['opiniao-viu', 'app']]);
  // Sem IntersectionObserver, não conta nada (e não quebra).
  const s = montar({ io: false });
  assert.doesNotThrow(() => s.O.formulario({ de: 'app', compacto: true }));
  assert.deepEqual(s.contados, []);
});

// ---------------------------------------------------------------- /opiniao inteira

test('/opiniao: dá para deixar só o e-mail, sem nota', async () => {
  const m = montar();
  const form = pendurar(m.O.formulario({ de: 'opiniao', pagina: true }));
  const email = form.todos().find((n) => n.getAttribute('type') === 'email');
  email.value = 'so-email@exemplo.com';
  await enviar(form);
  assert.deepEqual(m.pedidos.map((p) => p.caminho), ['/api/lista']);
  assert.equal(m.guardado['finde.opiniao'], undefined, 'sem nota, não conta como respondida');
  const ok = achar(documento.raiz, 'confirmacao');
  assert.match(ok.textContent, /O seu e-mail está na lista das novidades\./);
});

test('/opiniao: sem nota e sem e-mail, o erro fica junto da escala e a descreve', async () => {
  const m = montar();
  const form = pendurar(m.O.formulario({ de: 'opiniao', pagina: true }));
  await enviar(form);
  assert.equal(m.pedidos.length, 0);
  const escala = achar(form, 'escala');
  const ids = escala.getAttribute('aria-describedby').split(' ');
  const erro = form.todos().find((n) => n.id === ids[1]);
  assert.equal(erro.textContent, 'Escolha uma nota de 0 a 10, ou deixe só o e-mail.');
  assert.equal(erro.pai, achar(form, 'escala-bloco'), 'o erro mora junto da escala');
});

test('/opiniao: a nota entra e o e-mail recusado não; corrigir não regrava a nota', async () => {
  let lista = { status: 429, dados: { erro: 'Muitos pedidos daqui. Tente daqui a pouco.' } };
  const m = montar({ respostas: { '/api/lista': () => lista } });
  const form = pendurar(m.O.formulario({ de: 'opiniao', pagina: true }));
  marcar(form, 9);
  const email = form.todos().find((n) => n.getAttribute('type') === 'email');
  email.value = 'teste@exemplo.com';
  await enviar(form);
  assert.deepEqual(m.pedidos.map((p) => p.caminho), ['/api/opiniao', '/api/lista']);
  assert.ok(form.conectado, 'nada de "deu certo" sem o ok da lista');
  assert.equal(email.getAttribute('aria-invalid'), 'true');
  const erroEmail = form.todos().find((n) => n.id && n.id.startsWith('email-erro'));
  assert.match(erroEmail.textContent, /^O e-mail não entrou/);
  assert.equal(documento.activeElement, email);
  lista = { status: 200, dados: { ok: true, ja: true } };
  await enviar(form);
  assert.deepEqual(m.pedidos.map((p) => p.caminho), ['/api/opiniao', '/api/lista', '/api/lista']);
  assert.match(achar(documento.raiz, 'confirmacao').textContent, /A nota chegou, e esse e-mail já estava na lista das novidades\./);
});

test('/opiniao: e-mail que o servidor recusaria nem sai daqui', async () => {
  const m = montar();
  const form = pendurar(m.O.formulario({ de: 'opiniao', pagina: true }));
  marcar(form, 3);
  const email = form.todos().find((n) => n.getAttribute('type') === 'email');
  email.value = 'teste@exemplo_teste.com';
  await enviar(form);
  assert.equal(m.pedidos.length, 0);
  assert.equal(documento.activeElement, email);
});

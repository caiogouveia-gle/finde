'use strict';
// O painel da validação (ferramentas/numeros.js): do resumo dos dois sites ao
// texto, com o n antes de cada número, o aviso de amostra pequena, a equipe
// fora, as festas pelo nome do motor e os e-mails únicos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../nucleo/validacao');
const P = require('../ferramentas/numeros');

const T = (d = 0, min = 0) => new Date(Date.parse('2026-11-20T22:00:00.000Z') + d * 864e5 + min * 60e3).toISOString();
const ev = (a, nome, d, min, p) => ({ em: T(d, min), ev: nome, a, ...(p ? { p } : {}) });

// O resumo de um site como o /api/numeros devolve, montado com agregar().
function site(evs, opinioes = [], inscritos = 0) {
  const { opinioes: ops, ...r } = V.agregar(evs, opinioes, T(1));
  return { ...r, opiniao: { ...V.nps(ops.map((o) => o.nota)), comentarios: [] }, lista: { inscritos, porOrigem: {} } };
}

test('e-mails únicos: a mesma pessoa nas duas listas conta uma vez; lista que falhou não vira número', () => {
  const landing = 'email,inscrito_em,de\n"um@exemplo.com","x","landing"\n"dois@exemplo.com","x","landing"\n';
  const app = 'email,inscrito_em,de\n"um@exemplo.com","x","app"\n';
  assert.equal(P.emailsUnicos([landing, app]), 2);
  assert.equal(P.emailsUnicos([landing, { erro: '401' }]), null);
  assert.equal(P.emailsUnicos(['email,inscrito_em,de\n', 'email,inscrito_em,de\n']), 0);
});

test('painel: seções do app com o n, amostra pequena, equipe fora, festas pelo nome e e-mails únicos', () => {
  const evsApp = [
    ev('ana', 'abriu-app', 0, 0), ev('ana', 'chegou', 0, 0, 'qr'), ev('ana', 'lista', 0, 1), ev('ana', 'filtro', 0, 2, 'som'),
    ev('ana', 'detalhe', 0, 3, 'festa-um'), ev('ana', 'mandar', 0, 4, 'festa-um'), ev('ana', 'convite', 0, 5, 'h1'), ev('ana', 'whatsapp', 0, 6),
    ev('ana', 'compartilhou', 0, 7, 'zap'), ev('ana', 'opiniao-viu', 0, 8, 'app'),
    ev('bia', 'abriu-convite', 0, 10, 'h1'), ev('bia', 'convite-resposta', 0, 11, 'h1'),
    ev('eq1', 'abriu-app', 0, 0), ev('eq1', 'equipe', 0, 1),
  ];
  const app = site(evsApp, [{ a: 'ana', nota: 10, de: 'app' }, { a: 'eq1', nota: 0, de: 'app' }], 1);
  const landing = site([ev('lu', 'abriu-landing', 0, 0), ev('eq2', 'equipe', 0, 0)], [], 2);
  const csvs = ['email,inscrito_em,de\n"um@exemplo.com"\n"dois@exemplo.com"\n', 'email,inscrito_em,de\n"um@exemplo.com"\n'];
  const resumo = P.montarResumo({ landing, app, motor: { festas: [{ id: 'festa-um', nome: 'Festa Fictícia', produtora: { nome: 'Produtora Teste' } }] }, csvs });
  assert.equal(resumo.equipeFora, 2);
  assert.equal(resumo.listaUnicos, 2);
  const texto = P.textoDoPainel(resumo, { festas: [{ id: 'festa-um', nome: 'Festa Fictícia', produtora: 'Produtora Teste' }], agora: new Date(T(1)) });
  assert.match(texto, /^Equipe e testes fora da conta: 2 aparelhos$/m);
  assert.match(texto, /Funil \(cada passo só conta quem fez o anterior\):/);
  assert.match(texto, /abriram o app: n=1: 1 \(100%\) \(amostra pequena\)/);
  assert.match(texto, /mandaram no WhatsApp: n=1: 1 \(100%\) \(amostra pequena\)/);
  assert.match(texto, /D1, voltou no dia seguinte: n=2: 0 \(0%\) \(amostra pequena\)/);
  assert.match(texto, /Uso, n=2 \(amostra pequena\): 1 sessão por pessoa/);
  assert.match(texto, /Chegada, por origem \(pessoas\): QR Code 1 \(amostra pequena\)/);
  assert.match(texto, /Festa Fictícia \(Produtora Teste\): abriram 1 · grupo 1/);
  assert.match(texto, /Convite: n=1 criados \(amostra pequena\)/);
  assert.match(texto, /abertos por quem recebeu: \d+ vezes, por \d+ pessoas/);
  assert.match(texto, /chegaram ao finde pelo convite: 1 pessoas novas/);
  assert.match(texto, /filtro por zona: som 1/);
  assert.match(texto, /Compartilhou, por tipo \(pessoas\): WhatsApp 1/);
  assert.match(texto, /no app: n=1: 1 \(100%\) \(amostra pequena\) · 1 respostas ao todo/);
  assert.match(texto, /mandou pro grupo: n=1: NPS 100/);
  assert.match(texto, /^Opinião: n=1: NPS 100 .* \(amostra pequena\)$/m);
  assert.match(texto, /^Lista de e-mails: 2 únicos \(landing 2, app 1\)$/m);
  // A nota da equipe não entra.
  assert.doesNotMatch(texto, /detratores?.*1 detrator/);
  assert.equal(resumo.app.opiniao.respostas, 1);
});

test('painel: sem as listas, diz que a soma pode repetir; site com erro mostra o erro', () => {
  const texto = P.textoDoPainel(P.montarResumo({ landing: { erro: '401 em x' }, app: site([]), motor: { erro: 'fora do ar' }, csvs: [{ erro: '401' }, 'email\n'] }), { agora: new Date(T(1)) });
  assert.match(texto, /Landing: 401 em x/);
  assert.match(texto, /Motor: fora do ar/);
  assert.match(texto, /Lista de e-mails: 0 somando as duas, com possível repetição/);
  assert.match(texto, /^Equipe e testes fora da conta: 0 aparelhos$/m);
  assert.match(texto, /Convite: nenhum criado nem aberto ainda/);
});

'use strict';
// "Pôr na agenda" (U25, R33): o .ics do detalhe e do convite. RFC 5545:
// CRLF, linhas dobradas em 75 octetos, texto escapado, horas em UTC.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { montarIcs, escaparTexto, dobrarLinha, horarioDaFesta } = require('../nucleo/ics');
const { criarServidor } = require('../servidor');

const FESTA = {
  id: 'noite-teste-20261128-aaaa', nome: 'Noite Teste; com vírgula, e barra \\', casa: 'Casa Teste',
  endereco: { texto: 'Rua Exemplo, 100 - Pinheiros' }, inicio: 23, fim: 29, data: '2026-11-28', linkCompra: 'https://ingressos.example/x',
};
const AGORA = Date.parse('2026-11-26T12:00:00-03:00');

// As linhas lógicas do .ics (desdobradas).
const linhas = (t) => t.replace(/\r\n /g, '').split('\r\n');
const campo = (t, nome) => linhas(t).find((l) => l.startsWith(`${nome}:`) || l.startsWith(`${nome};`));

test('escapar: barra, ponto e vírgula, vírgula e quebra', () => {
  assert.equal(escaparTexto('a, b; c\nd\\e'), 'a\\, b\\; c\\nd\\\\e');
  assert.equal(escaparTexto(null), '');
});

test('dobrar: nenhuma linha passa de 75 octetos, nem com acento, e desdobrar devolve o original', () => {
  const longa = `DESCRIPTION:${'ação '.repeat(40)}`;
  const dobrada = dobrarLinha(longa);
  for (const l of dobrada.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, l);
  assert.ok(dobrada.split('\r\n').slice(1).every((l) => l.startsWith(' ')));
  assert.equal(dobrada.replace(/\r\n /g, ''), longa);
  assert.equal(dobrarLinha('curta'), 'curta');
});

test('festa de 23h às 5h: o fim cai no dia seguinte, em UTC; CRLF em todas as linhas', () => {
  const t = montarIcs({ festa: FESTA, data: FESTA.data, urlFesta: 'https://finde-app.fly.dev/app?festa=x', agora: AGORA });
  assert.ok(t.endsWith('\r\n'));
  assert.doesNotMatch(t.replace(/\r\n/g, ''), /\n/);
  assert.equal(campo(t, 'BEGIN'), 'BEGIN:VCALENDAR');
  assert.equal(campo(t, 'DTSTART'), 'DTSTART:20261129T020000Z');
  assert.equal(campo(t, 'DTEND'), 'DTEND:20261129T080000Z');
  assert.equal(campo(t, 'DTSTAMP'), 'DTSTAMP:20261126T150000Z');
  assert.equal(campo(t, 'UID'), 'UID:noite-teste-20261128-aaaa@finde');
  assert.equal(campo(t, 'SUMMARY'), 'SUMMARY:Noite Teste\\; com vírgula\\, e barra \\\\');
  assert.equal(campo(t, 'LOCATION'), 'LOCATION:Casa Teste\\, Rua Exemplo\\, 100 - Pinheiros');
  assert.equal(campo(t, 'URL'), 'URL:https://finde-app.fly.dev/app?festa=x');
  for (const l of t.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, l);
  assert.deepEqual(linhas(t).filter((l) => /^(BEGIN|END):/.test(l)), ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'END:VEVENT', 'END:VCALENDAR']);
});

test('festa sem fim acaba às 6h da manhã; sem início, vira o dia inteiro', () => {
  const semFim = montarIcs({ festa: { ...FESTA, fim: null }, data: FESTA.data, agora: AGORA });
  assert.equal(campo(semFim, 'DTEND'), 'DTEND:20261129T090000Z');
  assert.deepEqual(horarioDaFesta({ inicio: 23, fim: null }, '2026-11-28'), { inicio: Date.parse('2026-11-28T23:00:00-03:00'), fim: Date.parse('2026-11-29T06:00:00-03:00') });
  const semInicio = montarIcs({ festa: { ...FESTA, inicio: null, fim: null }, data: FESTA.data, agora: AGORA });
  assert.equal(campo(semInicio, 'DTSTART'), 'DTSTART;VALUE=DATE:20261128');
  assert.equal(campo(semInicio, 'DTEND'), 'DTEND;VALUE=DATE:20261129');
  assert.match(campo(semInicio, 'DESCRIPTION'), /não foi divulgado/);
});

test('festa real (real: true) segue com endereço e ingresso; exemplo não', () => {
  const real = montarIcs({ festa: { ...FESTA, real: true }, data: FESTA.data, agora: AGORA });
  assert.equal(campo(real, 'SUMMARY'), 'SUMMARY:Noite Teste\\; com vírgula\\, e barra \\\\');
  assert.ok(campo(real, 'LOCATION'));
  const ex = montarIcs({ festa: { ...FESTA, exemplo: true }, data: FESTA.data, agora: AGORA });
  assert.match(campo(ex, 'SUMMARY'), /^SUMMARY:Exemplo · Noite Teste/);
  assert.equal(campo(ex, 'LOCATION'), undefined);
  assert.doesNotMatch(ex.replace(/\r\n /g, ''), /ingressos\.example/);
});

test('o .ics de um convite leva o link dele, no URL e na descrição', () => {
  const t = montarIcs({ festa: FESTA, data: FESTA.data, uid: 'abcd1234-x@finde', urlConvite: 'https://finde-app.fly.dev/p/abcd1234', agora: AGORA });
  assert.equal(campo(t, 'URL'), 'URL:https://finde-app.fly.dev/p/abcd1234');
  assert.match(campo(t, 'DESCRIPTION'), /^DESCRIPTION:Convite do grupo: https:\/\/finde-app\.fly\.dev\/p\/abcd1234\\nIngressos: https:\/\/ingressos\.example\/x$/);
});

// ---------------------------------------------------------------- rotas

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-ics-'));
let servidor;
after(async () => {
  if (servidor) await new Promise((r) => servidor.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('rotas: GET /api/festa/:id/agenda.ics e GET /p/:id/agenda.ics, como anexo text/calendar', async () => {
  const mudo = { info() {}, warn() {}, error() {} };
  servidor = criarServidor({ dados: path.join(__dirname, '..', 'dados', 'festas.json'), varDir: path.join(pasta, 'var'), log: mudo, relogio: () => AGORA });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const raiz = `http://127.0.0.1:${servidor.address().port}`;
  const r = await fetch(`${raiz}/api/festa/sexta-sem-pressa/agenda.ics`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.match(r.headers.get('content-disposition'), /^attachment; filename="sexta-sem-pressa\.ics"$/);
  const t = await r.text();
  assert.match(t, /^BEGIN:VCALENDAR\r\n/);
  // Fictícia: o .ics diz que é exemplo, sem endereço e sem link de compra (revisão, app-4).
  assert.match(t, /SUMMARY:Exemplo · Sexta Sem Pressa/);
  assert.doesNotMatch(t, /^LOCATION:/m);
  assert.doesNotMatch(t.replace(/\r\n /g, ''), /Ingressos:|ingresse\.com/);
  assert.match(t.replace(/\r\n /g, ''), /DESCRIPTION:Festa fictícia do protótipo do Finde/);
  assert.match(t, /DTSTART:20261127T210000Z/); // a sexta seguinte, 27/11 às 18h, em UTC
  assert.equal((await fetch(`${raiz}/api/festa/nao-existe/agenda.ics`)).status, 404);
  // O convite: o link dele no .ics.
  const PEDIDO = { dia: 'sex', janela: 'comeco-da-noite', faixa: '30-35', teto: 80 };
  const p = await (await fetch(`${raiz}/api/planos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criterios: PEDIDO, festa: 'sexta-sem-pressa' }) })).json();
  const c = await fetch(`${raiz}/p/${p.id}/agenda.ics`, { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.equal(c.status, 200);
  const tc = await c.text();
  assert.match(tc.replace(/\r\n /g, ''), new RegExp(`URL:https://127\\.0\\.0\\.1:\\d+/p/${p.id}`));
  assert.match(tc, /UID:/);
  assert.equal((await fetch(`${raiz}/p/zzzzzzzz/agenda.ics`)).status, 404);
});

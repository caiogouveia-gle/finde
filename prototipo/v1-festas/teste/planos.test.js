'use strict';
// Planos: criar, responder, nomes limpos, escrita atômica e releitura do disco.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarPlanos, limparNome, LIMITE_RESPOSTAS } = require('../nucleo/planos');

const mudo = { warn() {}, info() {}, error() {} };
const festa = { festa: { id: 'sabado-groove', nome: 'Sábado Groove' }, linha: 'Sáb · 19h00' };
let pasta;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-planos-'));
});
afterEach(() => {
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('criar com autor já põe o autor em "tô dentro"', () => {
  const p = criarPlanos(pasta, { log: mudo }).criar({ festa, pedido: 'Sáb', autor: 'Bruna' });
  assert.match(p.id, /^[a-z0-9]{8}$/);
  assert.deepEqual(p.dentro, ['Bruna']);
  assert.deepEqual(p.fora, []);
  assert.equal(p.autor, 'Bruna');
});

test('criar sem autor vale; autor em branco vira null; autor inválido é recusado', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  assert.equal(planos.criar({ festa }).autor, null);
  assert.equal(planos.criar({ festa, autor: '   ' }).autor, null);
  assert.throws(() => planos.criar({ festa, autor: 42 }), (e) => e.status === 400);
  assert.throws(() => planos.criar({ festa, autor: '\u0000\u0001' }), (e) => e.status === 400);
});

test('responder: nome repetido pergunta "É você?" antes de trocar', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa, autor: 'Bruna' });
  planos.responder(id, 'Ju', 'dentro');
  planos.responder(id, 'Léo', 'fora');
  assert.throws(() => planos.responder(id, 'léo', 'dentro'), (e) => e.status === 409
    && e.message === 'Já tem Léo neste convite. É você?' && e.dados.duplicado === 'Léo');
  const p = planos.responder(id, 'léo', 'dentro', { confirmar: true });
  assert.deepEqual(p.dentro, ['Bruna', 'Ju', 'léo']);
  assert.deepEqual(p.fora, []);
});

test('nome é texto: "<" fica, controle sai, corta em 24', () => {
  assert.equal(limparNome('<img src=x>Ju'), '<img src=x>Ju');
  assert.equal(limparNome('a<b'), 'a<b');
  assert.equal(limparNome('Ju\u0000\u200b'), 'Ju');
  assert.equal(limparNome('  Maria   Clara  '), 'Maria Clara');
  assert.equal(limparNome('x'.repeat(40)).length, 24);
  assert.equal(limparNome(42), null);
});

test('erros: plano que não existe, nome vazio, resposta estranha', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa });
  assert.throws(() => planos.ler('naoexiste'), (e) => e.status === 404);
  assert.throws(() => planos.ler('../../etc'), (e) => e.status === 404);
  assert.throws(() => planos.ler('__proto__'), (e) => e.status === 404);
  assert.throws(() => planos.responder(id, '   ', 'dentro'), (e) => e.status === 400);
  assert.throws(() => planos.responder(id, 'Ju', 'talvez'), (e) => e.status === 400);
});

test('limite de respostas por convite', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa });
  for (let i = 0; i < LIMITE_RESPOSTAS; i += 1) planos.responder(id, `p${i}`, 'dentro');
  assert.throws(() => planos.responder(id, 'mais um', 'dentro'), (e) => e.status === 409);
  assert.doesNotThrow(() => planos.responder(id, 'p0', 'fora', { confirmar: true }));
});

test('escrita atômica: sem temporário sobrando, arquivo íntegro, relido por outra instância', () => {
  const planos = criarPlanos(pasta, { log: mudo });
  const { id } = planos.criar({ festa, autor: 'Bruna' });
  planos.responder(id, 'Ju', 'fora');
  const arquivos = fs.readdirSync(pasta);
  assert.deepEqual(arquivos, ['planos.json']);
  const outra = criarPlanos(pasta, { log: mudo });
  assert.deepEqual(outra.ler(id).fora, ['Ju']);
});

test('arquivo corrompido: começa vazio, com aviso, sem cair', () => {
  fs.writeFileSync(path.join(pasta, 'planos.json'), '{quebrado');
  const avisos = [];
  const planos = criarPlanos(pasta, { log: { warn: (m) => avisos.push(m) } });
  assert.equal(avisos.length, 1);
  assert.ok(planos.criar({ festa }).id);
});

// ---------------------------------------------------------------- sem idade (26/11/2026)

test('a avaliação pós-festa de idade saiu: nem avaliar, nem podeAvaliar, nem finalidade', () => {
  let agora = '2026-11-27T12:00:00.000Z';
  const planos = criarPlanos(pasta, { log: mudo, agora: () => agora });
  const real = { festa: { id: 'festa-real-1', nome: 'Real', real: true }, linha: 'Sáb · 22h00' };
  const { id } = planos.criar({ festa: real, autor: 'Ju', quando: { data: '2026-11-28', ate: '2026-11-29T09:00:00.000Z' } });
  agora = '2026-11-29T12:00:00.000Z';
  const v = planos.ler(id);
  assert.equal(v.passou, true);
  assert.equal(planos.avaliar, undefined);
  for (const k of ['podeAvaliar', 'avaliacoes', 'finalidadeAvaliacao']) assert.equal(k in v, false, k);
});

test('convite criado antes de 26/11/2026 sai sem a idade que guardou', () => {
  const planos = criarPlanos(pasta, { log: mudo, agora: () => '2026-11-27T12:00:00.000Z' });
  const retrato = {
    festa: {
      id: 'velha', nome: 'Velha', mediaIdade: 31, origemIdade: 'informada pela produtora', origemIdadeCurta: 'pela produtora',
      avaliacaoIdade: { avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 }, faixas: ['30-35'],
      campos: { inicio: { fonte: 'envio', conferidoEm: '2026-11-20T10:00:00-03:00' }, mediaIdade: { fonte: 'avaliacoes', conferidoEm: '2026-11-20T10:00:00-03:00' } },
      fontes: [{ id: 'envio', nome: 'A produtora' }, { id: 'avaliacoes', nome: 'Avaliações de quem foi' }], encontradaEm: ['envio', 'avaliacoes'],
    },
    linha: 'Sáb · 19h00 · Pinheiros · média 31 anos',
    origem: { curta: 'pela produtora', longa: 'informada pela produtora' },
    fora: ['média 34, um pouco acima da sua faixa', 'R$ 10 acima do teto'],
    motivos: ['média 34, um pouco acima da sua faixa', 'R$ 10 acima do teto', 'house'],
    aviso: 'Média 34, um pouco acima da sua faixa; R$ 10 acima do teto.',
    cara: { pct: 80, partes: [{ criterio: 'horario', cabe: true, texto: 'a' }, { criterio: 'idade', cabe: 'quase', texto: 'média 2 anos acima da sua faixa' }], semDado: ['idade'] },
    porque: { cabe: [{ criterio: 'horario', valor: '19h' }, { criterio: 'idade', valor: 'média 31' }], falta: [{ criterio: 'idade', valor: null }] },
  };
  const { id } = planos.criar({ festa: retrato, pedido: 'Sáb · 19h à 1h · 30 a 35 · até R$ 80' });
  const v = planos.ler(id);
  assert.equal(v.festa.linha, 'Sáb · 19h00 · Pinheiros');
  assert.equal(v.pedido, 'Sáb · 19h à 1h · até R$ 80');
  assert.equal(v.festa.aviso, 'R$ 10 acima do teto.');
  assert.deepEqual(v.festa.fora, ['R$ 10 acima do teto']);
  assert.deepEqual(v.festa.cara.partes.map((p) => p.criterio), ['horario']);
  assert.deepEqual(v.festa.porque, { cabe: [{ criterio: 'horario', valor: '19h' }], falta: [] });
  assert.deepEqual(v.festa.festa.fontes.map((x) => x.id), ['envio']);
  assert.doesNotMatch(JSON.stringify(v), /m[ée]dia|faixa|avaliac|(?<![a-zà-ú])idade/i);
  // O arquivo guarda o que veio; só o que sai é limpo.
  assert.equal(v.festa.festa.mediaIdade, undefined);
});

test('imagensVigentes: os flyers citados por convite de festa que não passou', () => {
  let agora = '2026-11-27T12:00:00.000Z';
  const planos = criarPlanos(pasta, { log: mudo, agora: () => agora });
  const img = (id) => ({ id, arquivo: `/imagens/${id}-1080.webp`, miniatura: `/imagens/${id}-480.webp` });
  const comFlyer = (id, sha) => ({ festa: { id, nome: id, real: true, imagens: [img(sha)], cartaz: img(sha) }, linha: 'x' });
  planos.criar({ festa: comFlyer('a', '0123456789abcdef'), quando: { data: '2026-11-28', ate: '2026-11-29T09:00:00.000Z' } });
  planos.criar({ festa: comFlyer('b', 'fedcba9876543210'), quando: { data: '2026-11-21', ate: '2026-11-22T09:00:00.000Z' } });
  planos.criar({ festa });
  assert.deepEqual([...planos.imagensVigentes()], ['0123456789abcdef']);
  agora = '2026-11-30T12:00:00.000Z';
  assert.deepEqual([...planos.imagensVigentes()], []);
});

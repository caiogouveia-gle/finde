'use strict';
// As contas do resumo da validação (nucleo/validacao.js, agregar()), com
// aparelhos e festas fictícios: funil encadeado, volta D1/D7, sessões,
// origem, festas, convite, categorias, taxa de resposta e NPS por etapa, e a
// equipe fora de tudo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const V = require('../nucleo/validacao');

const mudo = { info() {}, warn() {}, error() {} };
// 20/11/2026, 19h em São Paulo (22h UTC), mais `min` minutos e `d` dias.
const T = (d = 0, min = 0) => new Date(Date.parse('2026-11-20T22:00:00.000Z') + d * 864e5 + min * 60e3).toISOString();
const ev = (a, nome, d, min, p) => ({ em: T(d, min), ev: nome, a, ...(p ? { p } : {}) });

test('funil: cada passo só conta quem fez o anterior, na ordem do tempo', () => {
  const evs = [
    // ana: o caminho inteiro
    ev('ana', 'abriu-app', 0, 0), ev('ana', 'lista', 0, 1), ev('ana', 'detalhe', 0, 2, 'festa-um'), ev('ana', 'mandar', 0, 3, 'festa-um'), ev('ana', 'whatsapp', 0, 4),
    // bia: abriu a festa por link direto, sem lista; não passa do 1º passo
    ev('bia', 'abriu-app', 0, 0), ev('bia', 'detalhe', 0, 1, 'festa-um'), ev('bia', 'mandar', 0, 2, 'festa-um'),
    // cid: convite em vez de mandar conta no 4º passo
    ev('cid', 'abriu-app', 0, 0), ev('cid', 'lista', 0, 1), ev('cid', 'detalhe', 0, 2, 'festa-dois'), ev('cid', 'convite', 0, 3, 'h1'),
    // dan: viu a festa antes da lista (outra sessão) e não voltou a ela
    ev('dan', 'detalhe', 0, 0, 'festa-um'), ev('dan', 'abriu-app', 0, 5), ev('dan', 'lista', 0, 6),
  ];
  const r = V.agregar(evs, [], T(1));
  assert.deepEqual(r.funil.map((f) => [f.passo, f.pessoas]), [
    ['abriu-app', 4], ['lista', 3], ['detalhe', 2], ['mandar-ou-convite', 2], ['whatsapp', 1],
  ]);
});

test('volta: D1 e D7 com a base de quem já podia ter voltado, por dia em São Paulo', () => {
  const evs = [
    // ana entra no dia 0, volta no 1 e no 8
    ev('ana', 'abriu-app', 0, 0), ev('ana', 'abriu-app', 1, 0), ev('ana', 'abriu-app', 8, 0),
    // bia entra no dia 0 e volta só no 3
    ev('bia', 'abriu-app', 0, 0), ev('bia', 'abriu-app', 3, 0),
    // cid entra no dia 7: entra na base do D1, não na do D7
    ev('cid', 'abriu-app', 7, 0),
    // dan entra no dia 9 (hoje): fora das duas bases
    ev('dan', 'abriu-app', 9, 0),
  ];
  const r = V.agregar(evs, [], T(9, 60));
  assert.deepEqual(r.retencao.d1, { base: 3, voltaram: 1 });
  assert.deepEqual(r.retencao.d7, { base: 2, voltaram: 1 });
  assert.equal(r.retencao.outroDia, 2);
  // 23h50 em São Paulo ainda é o mesmo dia (02h50 UTC do seguinte).
  const tarde = [{ em: '2026-11-21T02:50:00.000Z', ev: 'abriu-app', a: 'eva' }, { em: '2026-11-21T03:10:00.000Z', ev: 'abriu-app', a: 'eva' }];
  assert.equal(V.agregar(tarde, [], '2026-11-22T12:00:00.000Z').retencao.outroDia, 1);
  assert.equal(V.agregar(tarde.slice(0, 1), [], '2026-11-22T12:00:00.000Z').retencao.outroDia, 0);
});

test('uso: sessões cortadas em 30 minutos sem evento, e dias ativos', () => {
  const evs = [
    ev('ana', 'abriu-app', 0, 0), ev('ana', 'lista', 0, 29), ev('ana', 'detalhe', 0, 58), // uma sessão
    ev('ana', 'abriu-app', 0, 120), // segunda
    ev('ana', 'abriu-app', 1, 0), // terceira, outro dia
    ev('bia', 'abriu-app', 0, 0),
  ];
  const r = V.agregar(evs, [], T(2));
  assert.deepEqual(r.uso, { pessoas: 2, sessoes: 4, sessoesPorPessoa: 2, sessoesMediana: 2, comMaisDeUmaSessao: 1, diasAtivosMedia: 1.5 });
});

test('categorias: origem, filtro, dia, ajuste e compartilhar contados por valor', () => {
  const evs = [
    ev('ana', 'chegou', 0, 0, 'qr'), ev('ana', 'chegou-qr', 0, 0), ev('bia', 'chegou', 0, 0, 'landing'), ev('cid', 'chegou', 0, 0, 'qr'),
    ev('ana', 'filtro', 0, 1, 'som'), ev('ana', 'filtro', 0, 2, 'som'), ev('bia', 'filtro', 0, 1, 'bairro'),
    ev('ana', 'dia', 0, 3, 'sab'), ev('ana', 'ajuste', 0, 4, 'nao-entendido'), ev('bia', 'ajuste', 0, 4, 'entendido'),
    ev('ana', 'compartilhou', 0, 5, 'zap'), ev('bia', 'compartilhou', 0, 5, 'copiou'),
    ev('ana', 'mapa', 0, 6), ev('bia', 'todas', 0, 6),
  ];
  const r = V.agregar(evs, [], T(1));
  assert.deepEqual(r.porCategoria.chegou, { landing: { vezes: 1, pessoas: 1 }, qr: { vezes: 2, pessoas: 2 } });
  assert.deepEqual(r.porCategoria.filtro, { bairro: { vezes: 1, pessoas: 1 }, som: { vezes: 2, pessoas: 1 } });
  assert.deepEqual(r.porCategoria.dia, { sab: { vezes: 1, pessoas: 1 } });
  assert.deepEqual(Object.keys(r.porCategoria.ajuste), ['entendido', 'nao-entendido']);
  assert.deepEqual(Object.keys(r.porCategoria.compartilhou), ['copiou', 'zap']);
  assert.deepEqual(r.eventos.mapa, { vezes: 1, pessoas: 1 });
  assert.deepEqual(r.eventos['chegou-qr'], { vezes: 1, pessoas: 1 });
});

test('festas: as mais abertas, com ingresso e grupo por pessoa', () => {
  const evs = [
    ev('ana', 'detalhe', 0, 0, 'festa-um'), ev('ana', 'detalhe', 0, 1, 'festa-um'), ev('bia', 'detalhe', 0, 0, 'festa-um'),
    ev('ana', 'ingresso', 0, 2, 'festa-um'), ev('bia', 'mandar', 0, 2, 'festa-um'),
    ev('cid', 'detalhe', 0, 0, 'festa-dois'), ev('cid', 'convite-ingresso', 0, 1, 'festa-dois'),
    ev('cid', 'detalhe', 0, 0), // sem id: não entra no ranking
  ];
  const r = V.agregar(evs, [], T(1));
  assert.deepEqual(r.topFestas.map((f) => f.id), ['festa-um', 'festa-dois']);
  assert.deepEqual(r.topFestas[0], { id: 'festa-um', detalhe: { vezes: 3, pessoas: 2 }, ingresso: { vezes: 1, pessoas: 1 }, mandar: { vezes: 1, pessoas: 1 } });
  assert.deepEqual(r.topFestas[1]['convite-ingresso'], { vezes: 1, pessoas: 1 });
});

test('convite: criados, aberturas, respostas e quem chegou pelo convite (sem o id do convite)', () => {
  const evs = [
    ev('ana', 'abriu-app', 0, 0), ev('ana', 'convite', 0, 1), ev('ana', 'convite', 0, 2),
    // bia chega pelo convite, responde e depois abre o app
    ev('bia', 'abriu-convite', 0, 10), ev('bia', 'convite-resposta', 0, 11), ev('bia', 'abriu-app', 0, 20),
    // cid chega pelo convite e não abre o app
    ev('cid', 'abriu-convite', 0, 10), ev('cid', 'convite-resposta', 0, 11),
    // dan já usava o app e abre um convite: não é pessoa nova
    ev('dan', 'abriu-app', 0, 0), ev('dan', 'abriu-convite', 0, 30),
    // eva chega com ?de=convite
    ev('eva', 'chegou', 0, 40, 'convite'),
  ];
  const r = V.agregar(evs, [], T(1));
  assert.deepEqual(r.convite, {
    criados: 2,
    aberturas: 3,
    pessoasQueAbriram: 3,
    respostas: 2,
    pessoasQueResponderam: 2,
    novos: 3,
    novosQueAbriramOApp: 1,
  });
});

test('opinião: taxa de resposta entre quem viu, por origem, e NPS pela etapa mais funda', () => {
  const evs = [
    ev('ana', 'abriu-app', 0, 0), ev('ana', 'lista', 0, 1), ev('ana', 'detalhe', 0, 2, 'festa-um'), ev('ana', 'mandar', 0, 3, 'festa-um'), ev('ana', 'opiniao-viu', 0, 4, 'app'),
    ev('bia', 'abriu-app', 0, 0), ev('bia', 'lista', 0, 1), ev('bia', 'opiniao-viu', 0, 2, 'app'),
    ev('cid', 'abriu-app', 0, 0), ev('cid', 'opiniao-viu', 0, 2, 'app'),
    ev('dan', 'abriu-opiniao', 0, 0), ev('dan', 'opiniao-viu', 0, 1, 'opiniao'),
  ];
  const opinioes = [
    { a: 'ana', nota: 10, de: 'app' }, { a: 'bia', nota: 6, de: 'app' },
    { a: 'dan', nota: 9, de: 'opiniao' },
    // respondeu sem evento algum (a contagem bloqueada): sem uso
    { a: 'zed', nota: 3, de: 'opiniao' },
  ];
  const r = V.agregar(evs, opinioes, T(1));
  assert.deepEqual(r.taxaDeResposta, {
    app: { viram: 3, responderam: 2, respostas: 2 },
    opiniao: { viram: 1, responderam: 1, respostas: 2 },
  });
  assert.deepEqual(Object.keys(r.npsPorEtapa), ['sem-uso', 'entrou', 'lista', 'mandou']);
  assert.equal(r.npsPorEtapa.mandou.nps, 100);
  assert.equal(r.npsPorEtapa.lista.nps, -100);
  assert.equal(r.npsPorEtapa['sem-uso'].respostas, 1);
});

test('equipe: o aparelho marcado sai de todos os eventos e opiniões, inclusive os anteriores à marca', () => {
  const evs = [
    ev('eq1', 'abriu-app', 0, 0), ev('eq1', 'lista', 0, 1), ev('eq1', 'detalhe', 0, 2, 'festa-um'),
    ev('eq1', 'equipe', 1, 0),
    ev('ana', 'abriu-app', 0, 0),
  ];
  const r = V.agregar(evs, [{ a: 'eq1', nota: 10, de: 'app' }, { a: 'ana', nota: 5, de: 'app' }], T(2));
  assert.equal(r.equipeFora, 1);
  assert.equal(r.pessoas, 1);
  assert.deepEqual(Object.keys(r.eventos), ['abriu-app']);
  assert.deepEqual(r.topFestas, []);
  assert.deepEqual(r.opinioes.map((o) => o.a), ['ana']);
  assert.equal(r.desde, T(0, 0));
});

test('evento: grava o p da regra; o id do convite nunca é gravado; p fora da regra conta sem ele; a equipe some do resumo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-metricas-'));
  let agora = T(0);
  const v = V.criarValidacao({ dir, log: mudo, agora: () => agora });
  const A = 'a'.repeat(32);
  const B = 'b'.repeat(32);
  assert.equal(v.evento({ evento: 'detalhe', aparelho: A, p: 'festa-um' }), true);
  assert.equal(v.evento({ evento: 'chegou', aparelho: A, p: 'qr' }), true);
  assert.equal(v.evento({ evento: 'convite', aparelho: A, p: 'k3j9x2ab' }), true);
  assert.equal(v.evento({ evento: 'abriu-convite', aparelho: B, p: 'k3j9x2ab' }), true);
  // Texto livre, e-mail, longo demais ou com espaço: o evento conta, o p não.
  for (const ruim of ['fulana@exemplo.com', 'tem espaço', 'x'.repeat(81), '<script>', 42]) {
    assert.equal(v.evento({ evento: 'filtro', aparelho: B, p: ruim }), true, String(ruim));
  }
  for (const novo of ['todas', 'mapa', 'agenda', 'opiniao-agora-nao']) assert.equal(v.evento({ evento: novo, aparelho: B }), true, novo);
  const linhas = fs.readFileSync(path.join(dir, 'validacao-uso.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(linhas[0].p, 'festa-um');
  assert.equal(linhas[1].p, 'qr');
  assert.ok(!('p' in linhas[2]) && !('p' in linhas[3]), 'convite e abriu-convite sem id');
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'validacao-uso.jsonl'), 'utf8'), /k3j9x2ab|exemplo\.com|espaço/);
  assert.ok(linhas.filter((l) => l.ev === 'filtro').every((l) => !('p' in l)));
  let r = v.numeros();
  assert.equal(r.convite.aberturas, 1);
  assert.equal(r.pessoas, 2);
  // B se marca como equipe: sai de tudo, para trás também.
  agora = T(1);
  assert.equal(v.evento({ evento: 'equipe', aparelho: B, p: 'qualquer' }), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'validacao-uso.jsonl'), 'utf8').trim().split('\n').at(-1)).p, undefined);
  r = v.numeros();
  assert.equal(r.equipeFora, 1);
  assert.equal(r.pessoas, 1);
  assert.equal(r.convite.aberturas, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

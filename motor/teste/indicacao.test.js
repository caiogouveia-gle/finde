'use strict';
// A fonte "indicacao" (no app, "Lido na página do ingresso"): leitura manual, data de conferência por campo,
// média de idade só declarada pela produtora, e o comando `indicar`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const indicacao = require('../fontes/indicacao');
const { indicar, tipoProvavel } = require('../nucleo/indicar');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const { normalizarItem } = require('../nucleo/normalizar');
const { novoBanco, relogio, logMudo } = require('./ajuda');

const EXEMPLOS = path.join(__dirname, '..', 'exemplos', 'indicacoes');

test('a indicação de exemplo vira registro com fonte "indicacao" e conferidoEm de cada leitura', async () => {
  const db = novoBanco();
  const r = await executar({ db, fontes: [indicacao], agora: relogio(), log: logMudo, config: { indicacao: { pastas: [EXEMPLOS] } } });
  assert.equal(r.festasNovas, 1);
  const [f] = listarRegistros(db);
  assert.equal(f.nome, 'Baile Exemplo');
  assert.equal(f.exemplo, true);
  assert.equal(f.data, '2026-11-14'); // "proximo-sabado" a partir de 10/11
  // O link da fonte é a página do ingresso lida, não o perfil indicado; cada
  // página lida vai em `paginas`, com o que ela é.
  assert.deepEqual(f.fontes.map((x) => [x.id, x.nome, x.url]), [['indicacao', 'Lido na página do ingresso', 'https://ingressos.example/baile-exemplo']]);
  assert.deepEqual(f.paginas.map((x) => [x.tipo, x.nome, x.lidoEm]), [
    ['ingresso', 'Ingressos Exemplo', '2026-11-16T22:05:00-03:00'],
    ['instagram', 'Instagram', '2026-11-16T21:50:00-03:00'],
  ]);
  assert.deepEqual(f.paginas[0].campos, ['data', 'inicio', 'fim', 'casa', 'endereco', 'lotes', 'linkCompra', 'idadeMinima']);
  assert.equal(f.campos.nome.conferidoEm, '2026-11-16T21:50:00-03:00');
  assert.equal(f.campos.lotes.conferidoEm, '2026-11-16T22:05:00-03:00');
  assert.equal(f.campos.lotes.fonte, 'indicacao');
  assert.deepEqual(f.lotes[1], { nome: '2º lote', preco: 55, disponivel: true, taxa: 5.5, ate: '23:59' });
  assert.deepEqual(f.precoAPartirDe, { valor: 55, lote: '2º lote', esgotadosAntes: 1 });
  assert.equal(f.mediaIdade, null);
});

test('R16 na indicação: só a média que a produtora publicou, com o detalhe de onde', () => {
  const base = { nome: 'X', data: '2026-11-14' };
  const sem = normalizarItem({ ...base, mediaIdade: { valor: 31, origem: 'avaliacoes', avaliacoes: 40 } }, 'indicacao');
  assert.equal(sem.campos.mediaIdade, undefined);
  assert.match(sem.avisos.join(), /declarada pela produtora/);
  const semDetalhe = normalizarItem({ ...base, mediaIdade: { valor: 31, origem: 'produtora' } }, 'indicacao');
  assert.equal(semDetalhe.campos.mediaIdade, undefined);
  const ok = normalizarItem({ ...base, mediaIdade: { valor: 31, origem: 'produtora', detalhe: 'bio do perfil da produtora, lida em 16/11' } }, 'indicacao');
  assert.deepEqual(ok.campos.mediaIdade, { valor: 31, origem: 'produtora', detalhe: 'bio do perfil da produtora, lida em 16/11' });
});

test('taxa e hora-limite do lote: os nomes do protótipo; valor ruim sai com aviso', () => {
  const { campos, avisos } = normalizarItem({
    nome: 'X', data: '2026-11-14',
    lotes: [{ nome: 'A', preco: 50, taxa: 'R$ 5,00', ate: '22:00' }, { nome: 'B', preco: 60, taxa: 999, ate: '25:00' }],
  }, 'indicacao');
  assert.deepEqual(campos.lotes, [{ nome: 'A', preco: 50, disponivel: null, taxa: 5, ate: '22:00' }, { nome: 'B', preco: 60, disponivel: null }]);
  assert.match(avisos.join(), /taxa de lote inválida/);
  assert.match(avisos.join(), /hora-limite de lote inválida/);
});

test('indicação sem o link de origem não entra', () => {
  const r = indicacao.itensDaIndicacao({ festas: [{ nome: 'X', data: '2026-11-14' }] }, { origem: 't.json', mtime: 't' });
  assert.equal(r.itens.length, 0);
  assert.match(r.avisos[0], /sem "origem"/);
});

test('indicar: perfil vai para a lista de contatos, festa vira esqueleto, repetido não duplica', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-indicar-'));
  const agora = new Date('2026-11-17T00:30:00Z'); // 21h30 do dia 16 em SP
  assert.equal(tipoProvavel('https://www.instagram.com/coletivo.x/'), 'perfil');
  assert.equal(tipoProvavel('https://www.instagram.com/p/AbC123/'), 'festa');

  const p = indicar(raiz, 'https://www.instagram.com/coletivo.x/', { agora });
  assert.equal(p.tipo, 'perfil');
  assert.ok(p.arquivo.endsWith(path.join('entrada', 'grupo', 'contatos.json')));
  assert.equal(indicar(raiz, 'https://www.instagram.com/coletivo.x/', { agora }).novo, false);
  const contatos = JSON.parse(fs.readFileSync(p.arquivo, 'utf8'));
  assert.deepEqual(contatos, [{ url: 'https://www.instagram.com/coletivo.x/', nome: null, tipo: 'a classificar', indicadoEm: '2026-11-16', situacao: 'a contatar', notas: '' }]);

  const f = indicar(raiz, 'https://ingressos.example/baile-x', { agora, nome: 'Baile X' });
  assert.equal(f.tipo, 'festa');
  assert.ok(f.arquivo.endsWith(path.join('entrada', 'indicacoes', '2026-11-16-baile-x.json')));
  const esqueleto = JSON.parse(fs.readFileSync(f.arquivo, 'utf8'));
  assert.equal(esqueleto.recebidaEm, '2026-11-16T21:30:00-03:00');
  assert.equal(esqueleto.festas[0].origem, 'https://ingressos.example/baile-x');
  // Um esqueleto sem data não vira festa: a coleta avisa e segue.
  const r = indicacao.itensDaIndicacao(esqueleto, { origem: 'x', mtime: 't' });
  assert.equal(normalizarItem(r.itens[0].bruto, 'indicacao').campos.data, undefined);

  // Páginas de ingresso com o mesmo formato de caminho não colidem.
  const c1 = indicar(raiz, 'https://cart.example/aaaaaaaa-1111-2222-3333-444444444444/tickets?cod=X', { agora });
  const c2 = indicar(raiz, 'https://cart.example/bbbbbbbb-1111-2222-3333-444444444444/tickets?cod=X', { agora });
  assert.ok(c1.novo && c2.novo);
  assert.notEqual(c1.arquivo, c2.arquivo);
  assert.match(path.basename(c1.arquivo), /^2026-11-16-cart-example-[0-9a-f]{4}\.json$/);

  const a = indicar(raiz, 'https://agenda.example/', { agora, tipo: 'agenda' });
  assert.ok(a.arquivo.endsWith(path.join('entrada', 'grupo', 'a-avaliar.json')));
  assert.throws(() => indicar(raiz, 'javascript:alert(1)'), /http/);
  assert.throws(() => indicar(raiz, 'https://a.example/', { tipo: 'outro' }), /não existe/);
  fs.rmSync(raiz, { recursive: true, force: true });
});

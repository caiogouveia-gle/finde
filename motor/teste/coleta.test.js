'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { executar, travar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const mapas = require('../fontes/mapas-culturais');
const ical = require('../fontes/ical');
const envio = require('../fontes/envio');
const { novoBanco, relogio, logMudo, fetchFalso, claudeFalso, AGORA } = require('./ajuda');

const dados = (n) => fs.readFileSync(path.join(__dirname, 'dados', n), 'utf8');
const EXEMPLOS = path.join(__dirname, '..', 'exemplos', 'envios');

// Uma fonte de mentira que devolve itens prontos.
const fonteFixa = (id, itens) => ({ id, nome: id, coletar: async () => ({ itens, avisos: [] }) });

test('AE1: o envio vira registro com a fonte e a hora de cada campo', async () => {
  const db = novoBanco();
  const r = await executar({ db, fontes: [envio], agora: relogio(), log: logMudo, config: { envio: { pastas: [EXEMPLOS] } } });
  assert.equal(r.festasNovas, 4);
  const [sexta] = listarRegistros(db, { ids: [listarRegistros(db).find((f) => f.nome === 'Sexta Sem Pressa').id] });
  assert.deepEqual(sexta.fontes.map((f) => f.id), ['envio']);
  for (const campo of ['nome', 'inicio', 'lotes', 'mediaIdade', 'lineup']) {
    assert.equal(sexta.campos[campo].fonte, 'envio', campo);
    assert.match(sexta.campos[campo].conferidoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/, campo); // o formato da base do protótipo
  }
  assert.deepEqual(sexta.mediaIdade, { valor: 32, origem: 'produtora' });
  assert.deepEqual(sexta.precoAPartirDe, { valor: 60, lote: '2º lote', esgotadosAntes: 1 });
  assert.equal(sexta.exemplo, true);
});

test('AE2: média de idade que chega por fonte aberta não entra, e a execução registra o aviso', async () => {
  const db = novoBanco();
  const f = fetchFalso([[/findOccurrences/, dados('mapas-ocorrencias.json')], [/space\/find/, dados('mapas-espacos.json')]]);
  const r = await executar({
    db, fontes: [mapas], fetch: f, agora: relogio(), log: logMudo,
    config: { 'mapas-culturais': { instancias: [{ id: 'mapa-da-cultura', base: 'https://mapa.example' }] } },
  });
  assert.ok(r.avisos.some((a) => /Baile|501/.test(a) && /R16/.test(a)), r.avisos.join('\n'));
  const todas = listarRegistros(db, { todas: true });
  assert.equal(todas.length, 2);
  assert.ok(todas.every((x) => x.mediaIdade === null));
  // A exposição sai da lista padrão porque a classificação diz que não é festa.
  const padrao = listarRegistros(db);
  assert.deepEqual(padrao.map((x) => x.nome), ['Baile da Praça']);
  assert.equal(padrao[0].classificacao.por, 'regras');
  const exec = db.prepare('SELECT estado, resumo FROM execucoes').get();
  assert.equal(exec.estado, 'ok');
  assert.match(exec.resumo, /R16/);
});

test('AE3: a mesma festa pelo envio e pela agenda iCal vira um registro só; o preço do envio prevalece', async () => {
  const db = novoBanco();
  const ics = fetchFalso([[/agenda\.ics/, dados('agenda.ics')]]);
  const config = {
    envio: { pastas: [EXEMPLOS] },
    ical: { dias: 30, feeds: [{ url: 'https://coletivo.example/agenda.ics', produtora: 'Coletivo Expediente' }] },
  };
  await executar({ db, fontes: [ical, envio], fetch: ics, agora: relogio(), log: logMudo, config });
  const sextas = listarRegistros(db, { todas: true }).filter((f) => f.nome === 'Sexta Sem Pressa');
  assert.equal(sextas.length, 1);
  const s = sextas[0];
  assert.deepEqual(s.fontes.map((f) => f.id), ['envio', 'ical']);
  assert.equal(s.campos.lotes.fonte, 'envio');
  assert.equal(s.precoAPartirDe.valor, 60);
});

test('reexecutar não duplica festas e mantém os ids', async () => {
  const db = novoBanco();
  const agora = relogio();
  const config = { envio: { pastas: [EXEMPLOS] } };
  await executar({ db, fontes: [envio], agora, log: logMudo, config });
  const ids1 = listarRegistros(db).map((f) => f.id).sort();
  agora.andar(5 * 3600e3);
  const r2 = await executar({ db, fontes: [envio], agora, log: logMudo, config });
  assert.equal(r2.festasNovas, 0);
  assert.deepEqual(listarRegistros(db).map((f) => f.id).sort(), ids1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM festas').get().n, 4);
});

test('classificação pelo Claude entra como fonte própria e não passa por cima da produtora', async () => {
  const db = novoBanco();
  const item = {
    idExterno: 'x1', texto: 'Pôr do sol com disco. A pista enche às 19:30. Traje livre.',
    bruto: { nome: 'Disco Exemplo', data: '2026-11-14', inicio: '17:00', fim: '23:00', estilos: ['pop-2000'], ehFesta: true },
  };
  const claude = claudeFalso([{
    ehFesta: true, estilos: ['house-disco'], idadeMinima: null, lineup: ['DJ Exemplo'], documento: null,
    vestimenta: 'Traje livre', lista: null, pistaCheia: '19:30', confianca: 'alta',
  }]);
  const r = await executar({ db, fontes: [fonteFixa('envio', [item])], claude, agora: relogio(), log: logMudo });
  assert.equal(r.classificacao.claude, 1);
  const [f] = listarRegistros(db);
  assert.deepEqual(f.estilos, ['pop-2000']); // a produtora disse; vale ela
  assert.equal(f.campos.estilos.fonte, 'envio');
  assert.deepEqual(f.lineup, ['DJ Exemplo']);
  assert.equal(f.campos.lineup.fonte, 'claude');
  assert.equal(f.pistaCheia, '2026-11-14T19:30:00-03:00');
  assert.deepEqual(f.regras, { vestimenta: 'Traje livre' });
  assert.equal(f.mediaIdade, null);
});

test('AE5: sem chave a execução termina e os registros dizem que foi por regras', async () => {
  const db = novoBanco();
  const item = { idExterno: 'y', texto: 'Baile funk na laje.', bruto: { nome: 'Baile Exemplo', data: '2026-11-14', inicio: '22:00' } };
  const r = await executar({ db, fontes: [fonteFixa('mapas-culturais', [item])], claude: null, agora: relogio(), log: logMudo });
  assert.equal(r.classificacao.parado, 'sem ANTHROPIC_API_KEY');
  const [f] = listarRegistros(db);
  assert.equal(f.classificacao.por, 'regras');
  assert.deepEqual(f.estilos, ['funk']);
});

test('AE4 na execução: com teto baixo, a primeira vai pelo Claude e as outras por regras', async () => {
  const db = novoBanco();
  const itens = [1, 2, 3].map((n) => ({ idExterno: `i${n}`, texto: `Festa ${n} com house.`, bruto: { nome: `Festa ${n}`, data: '2026-11-14', inicio: '22:00' } }));
  const claude = claudeFalso([{
    ehFesta: true, estilos: ['house-disco'], idadeMinima: null, lineup: [], documento: null, vestimenta: null, lista: null, pistaCheia: null, confianca: 'media',
  }], { entrada: 400, saida: 400 });
  const r = await executar({
    db, fontes: [fonteFixa('mapas-culturais', itens)], claude, agora: relogio(), log: logMudo,
    classificadorOpcoes: { modelo: 'claude-opus-5-5', tetoExecucao: 0.03, tetoDia: 5 },
  });
  assert.equal(r.classificacao.claude, 1);
  assert.equal(r.classificacao.regras, 2);
  assert.match(r.classificacao.parado, /teto da execução/);
});

test('item sem nome ou data é descartado com aviso', async () => {
  const db = novoBanco();
  const r = await executar({ db, fontes: [fonteFixa('mapas-culturais', [{ idExterno: 'z', bruto: { nome: 'Sem data' } }])], agora: relogio(), log: logMudo });
  assert.equal(r.fontes['mapas-culturais'].descartados, 1);
  assert.match(r.avisos.join(), /sem nome ou data/);
});

test('fonte que lança vira aviso; as outras seguem', async () => {
  const db = novoBanco();
  const quebrada = { id: 'ical', nome: 'ical', coletar: async () => { throw new Error('caiu'); } };
  const r = await executar({ db, fontes: [quebrada, envio], agora: relogio(), log: logMudo, config: { envio: { pastas: [EXEMPLOS] } } });
  assert.equal(r.fontes.ical.erro, 'caiu');
  assert.equal(r.fontes.envio.gravados, 4);
});

test('M10: duas execuções não rodam ao mesmo tempo; trava velha é liberada', async () => {
  const db = novoBanco();
  const id = travar(db, 'comando', AGORA);
  assert.ok(id);
  const r = await executar({ db, fontes: [], agora: relogio(), log: logMudo });
  assert.equal(r.recusada, true);
  const depois = relogio(new Date(AGORA.getTime() + 31 * 60e3));
  const r2 = await executar({ db, fontes: [], agora: depois, log: logMudo });
  assert.ok(r2.execucaoId);
  assert.equal(db.prepare('SELECT estado FROM execucoes WHERE id = ?').get(id).estado, 'erro');
});

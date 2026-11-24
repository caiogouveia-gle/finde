'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarClassificador, porRegras, validarResposta, ESQUEMA } = require('../nucleo/classificar');
const { novoBanco, relogio, logMudo, claudeFalso } = require('./ajuda');

const BOA = {
  ehFesta: true, estilos: ['house-disco'], idadeMinima: 18, lineup: ['DJ A'], documento: null,
  vestimenta: 'traje livre', lista: null, pistaCheia: '19:30', confianca: 'alta',
};
const entrada = (n) => ({ festaId: `f${n}`, nome: `Festa ${n}`, texto: `Texto da festa ${n}, house a noite toda.` });

test('o modelo padrão é o Claude Haiku 5.5, e FINDE_MODELO troca', async () => {
  const { modeloAtual, MODELO_PADRAO } = require('../nucleo/classificar');
  assert.equal(MODELO_PADRAO, 'claude-haiku-5-5');
  assert.equal(modeloAtual({}), 'claude-haiku-5-5');
  assert.equal(modeloAtual({ FINDE_MODELO: 'claude-sonnet-5-5' }), 'claude-sonnet-5-5');
  const db = novoBanco();
  const c = claudeFalso([BOA]);
  await criarClassificador({ db, claude: c, agora: relogio(), log: logMudo }).classificar(entrada(1));
  assert.equal(c.pedidos[0].model, process.env.FINDE_MODELO || 'claude-haiku-5-5');
});

test('o esquema não tem média de idade (R16) e só aceita estilos do catálogo', () => {
  assert.ok(!('mediaIdade' in ESQUEMA.properties));
  assert.equal(validarResposta({ ...BOA, estilos: ['axe'] }), undefined);
  assert.equal(validarResposta({ ...BOA, mediaIdade: 30 }).mediaIdade, undefined);
});

test('pelo Claude: pede saída estruturada, grava uso e custo', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-haiku-5-5', agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.por, 'claude');
  assert.deepEqual(r.resultado.estilos, ['house-disco']);
  const p = c.pedidos[0];
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.match(p.messages[0].content, /<evento>[\s\S]*<\/evento>/);
  const uso = db.prepare('SELECT * FROM uso_llm').all();
  assert.equal(uso.length, 1);
  assert.equal(uso[0].resultado, 'ok');
  assert.ok(Math.abs(uso[0].custo_usd - (900 * 0.1 + 300 * 0.5) / 1e6) < 1e-12);
});

test('mesma entrada não volta ao modelo (cache por hash)', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude: c, agora: relogio(), log: logMudo });
  await cl.classificar(entrada(1));
  const r = await cl.classificar(entrada(1));
  assert.equal(c.pedidos.length, 1);
  assert.equal(r.cache, true);
});

test('resposta fora do esquema cai para regras e conta como inválida', async () => {
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: claudeFalso(['{"ehFesta":"sim"}']), agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.por, 'regras');
  assert.equal(cl.resumo().invalidas, 1);
  assert.equal(db.prepare('SELECT resultado FROM uso_llm').get().resultado, 'invalido');
});

test('erro da API cai para regras nesta festa e segue', async () => {
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: claudeFalso([Object.assign(new Error('boom'), { status: 529 }), BOA]), agora: relogio(), log: logMudo });
  assert.equal((await cl.classificar(entrada(1))).por, 'regras');
  assert.equal((await cl.classificar(entrada(2))).por, 'claude');
  assert.equal(cl.resumo().erros, 1);
});

test('AE4: teto da execução para o modelo; o resto vai por regras', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA], { entrada: 2000, saida: 600 });
  // Modelo caro de propósito, para o teto bater com poucas chamadas. Opus 5.5: estimativa ~ US$ 0,024 por chamada; o custo real de 2000/600 tokens é US$ 0,02.
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-opus-5-5', tetoExecucao: 0.03, tetoDia: 10, agora: relogio(), log: logMudo });
  const r1 = await cl.classificar(entrada(1));
  const r2 = await cl.classificar(entrada(2));
  const r3 = await cl.classificar(entrada(3));
  assert.deepEqual([r1.por, r2.por, r3.por], ['claude', 'regras', 'regras']);
  assert.equal(c.pedidos.length, 1);
  assert.match(cl.resumo().parado, /teto da execução/);
});

test('teto do dia conta o que outras execuções já gastaram hoje', async () => {
  const db = novoBanco();
  db.prepare("INSERT INTO uso_llm (quando, modelo, tokens_entrada, tokens_saida, custo_usd, resultado) VALUES ('2026-11-10T13:00:00.000Z', 'x', 0, 0, 1.99, 'ok')").run();
  const c = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-opus-5-5', tetoExecucao: 1, tetoDia: 2, agora: relogio(), log: logMudo });
  assert.equal((await cl.classificar(entrada(1))).por, 'regras');
  assert.match(cl.resumo().parado, /teto do dia/);
  assert.equal(c.pedidos.length, 0);
});

test('AE5: sem chave, tudo por regras', async () => {
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: null, agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.por, 'regras');
  assert.equal(cl.resumo().parado, 'sem ANTHROPIC_API_KEY');
});

test('regras: festa, estilo e idade mínima por palavras', () => {
  const r = porRegras({ nome: 'Baile do Fim', texto: 'Funk e pop dos anos 2000 a noite toda. Proibida a entrada de menores de 18 anos.' });
  assert.equal(r.ehFesta, true);
  assert.deepEqual(r.estilos.sort(), ['funk', 'pop-2000']);
  assert.equal(r.idadeMinima, 18);
  const expo = porRegras({ nome: 'Exposição Florescer', texto: 'Mostra de artes visuais.' });
  assert.equal(expo.ehFesta, false);
});

// ---- extrair/3: o modelo diz se é festa (M24, U12) ---------------------------

const { criarExtrator, validarExtracao, SISTEMA, ESQUEMA: ESQUEMA_EXTRACAO, VERSAO: VERSAO_EXTRACAO } = require('../nucleo/extrair');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const paginas = require('../fontes/paginas');
const lida = (nome, data, extra = {}) => ({
  nome, ehFesta: true, tipo: 'festa', confianca: 'alta', cidade: 'São Paulo', uf: 'SP', imagem: 'outra', data, inicio: '23:00', fim: null,
  casa: 'Casa Exemplo', endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null, ...extra,
});

test('extrair/3: o esquema pede ehFesta, tipo, confiança, cidade, uf e o que a imagem é; o sistema repete os critérios do classificador', () => {
  assert.equal(VERSAO_EXTRACAO, 'extrair/3');
  const festa = ESQUEMA_EXTRACAO.properties.festas.items;
  for (const k of ['ehFesta', 'tipo', 'confianca', 'cidade', 'uf', 'imagem']) assert.ok(festa.required.includes(k), k);
  assert.deepEqual(festa.properties.tipo.enum, ['festa', 'show', 'leitura', 'sessao-de-escuta', 'feira', 'outro']);
  assert.deepEqual(festa.properties.imagem.enum, ['flyer', 'foto', 'outra']);
  assert.match(SISTEMA, /concerto|sentado/);
  assert.match(SISTEMA, /sessão de escuta/);
  assert.match(SISTEMA, /uma festa por dia/);
  assert.match(SISTEMA, /Não descreva pessoas/);
  assert.ok(!JSON.stringify(ESQUEMA_EXTRACAO).includes('mediaIdade'));
  // O classificador (que lê as páginas de JSON-LD) usa os mesmos critérios.
  const { SISTEMA: SISTEMA_CLASSIFICADOR } = require('../nucleo/classificar');
  assert.match(SISTEMA_CLASSIFICADOR, /concerto sentado, leitura .* e sessão de escuta/);
});

test('extrair/3: valida ehFesta, tipo, cidade, uf, imagem e nome de lote até 80 caracteres', () => {
  const longo = 'L'.repeat(100);
  const r = validarExtracao({ festas: [lida('A', '2026-11-28', { tipo: 'banana', uf: 'sp', imagem: 'quadro', lotes: [{ nome: longo, preco: 30, disponivel: null }] }), lida('B', '2026-11-28', { ehFesta: false, tipo: 'leitura' })], confianca: 'alta' });
  assert.equal(r.festas[0].tipo, 'festa', 'tipo fora do catálogo cai em festa quando ehFesta é true');
  assert.equal(r.festas[0].uf, 'SP');
  assert.equal(r.festas[0].imagem, 'outra');
  assert.equal(r.festas[0].lotes[0].nome.length, 80);
  assert.equal(r.festas[1].ehFesta, false);
  assert.equal(r.festas[1].tipo, 'leitura');
  const sem = validarExtracao({ festas: [{ ...lida('C', '2026-11-28'), ehFesta: 'sim' }], confianca: 'alta' });
  assert.equal(sem.festas.length, 0, 'sem ehFesta booleano a festa não conta como lida');
});

test('extrair/3: leitura vazia de confiança baixa não fica no cache; vazia de confiança alta fica', async () => {
  const db = novoBanco();
  const claude = claudeFalso([{ festas: [], confianca: 'baixa' }]);
  const cl = criarClassificador({ db, claude, agora: relogio(), log: logMudo });
  const ex = criarExtrator({ db, classificador: cl, agora: relogio(), log: logMudo });
  const a = await ex.lerPagina({ url: 'https://casa.example/agenda', titulo: 'Agenda', texto: 'Agenda em branco' });
  assert.deepEqual(a.festas, []);
  await ex.lerPagina({ url: 'https://casa.example/agenda', titulo: 'Agenda', texto: 'Agenda em branco' });
  assert.equal(claude.pedidos.length, 2, 'a segunda leitura volta ao modelo: nada ficou no cache');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classificacoes').get().n, 0);
  assert.equal(ex.resumo().vazios, 2);

  const claude2 = claudeFalso([{ festas: [], confianca: 'alta' }]);
  const cl2 = criarClassificador({ db, claude: claude2, agora: relogio(), log: logMudo });
  const ex2 = criarExtrator({ db, classificador: cl2, agora: relogio(), log: logMudo });
  await ex2.lerPagina({ url: 'https://casa.example/outra', titulo: 'x', texto: 'Post de bastidor, sem data' });
  await ex2.lerPagina({ url: 'https://casa.example/outra', titulo: 'x', texto: 'Post de bastidor, sem data' });
  assert.equal(claude2.pedidos.length, 1, 'sem festa e com confiança alta é um "não há festa" confiável');
});

test('extrair/3: a casca da Ingresse não chama o modelo nem entra no cache', async () => {
  const db = novoBanco();
  const claude = claudeFalso([{ festas: [lida('X', '2026-11-28')], confianca: 'alta' }]);
  const cl = criarClassificador({ db, claude, agora: relogio(), log: logMudo });
  const ex = criarExtrator({ db, classificador: cl, agora: relogio(), log: logMudo });
  assert.equal(await ex.lerPagina({ url: 'https://www.ingresse.com/algo/', titulo: 'Ingresse', texto: 'Please wait\nWhere live begins.' }), null);
  assert.equal(await ex.lerPagina({ url: 'https://www.ingresse.com/algo/', titulo: 'Ingresse', texto: '' }), null);
  assert.equal(claude.pedidos.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classificacoes').get().n, 0);
  assert.equal(ex.resumo().cascas, 2);
  // O mesmo texto curto em outro site não é casca.
  assert.ok(await ex.lerPagina({ url: 'https://casa.example/agenda', titulo: 'Agenda', texto: 'Please wait' }));
  assert.equal(claude.pedidos.length, 1);
});

test('extrair/3: o texto da página vai ao modelo até 6.000 caracteres', async () => {
  const db = novoBanco();
  const claude = claudeFalso([{ festas: [], confianca: 'alta' }]);
  const cl = criarClassificador({ db, claude, agora: relogio(), log: logMudo });
  const ex = criarExtrator({ db, classificador: cl, agora: relogio(), log: logMudo });
  await ex.lerPagina({ url: 'https://casa.example/longa', titulo: 'x', texto: `${'a'.repeat(5980)}FIM-VISIVEL${'b'.repeat(9000)}` });
  const texto = claude.pedidos[0].messages[0].content[0].text;
  assert.match(texto, /FIM-VISIVEL/);
  assert.doesNotMatch(texto, /b{20}/, 'o que passa de 6.000 caracteres fica de fora');
});

test('extrair/3: festival de dois dias vira duas festas, cada uma com o preço do dia (Gop Tun)', async () => {
  const dias = {
    festas: [
      lida('Gop Tun Festival · sábado', '2026-12-05', { lotes: [{ nome: '1º lote', preco: 180, disponivel: true }] }),
      lida('Gop Tun Festival · domingo', '2026-12-06', { lotes: [{ nome: '1º lote', preco: 150, disponivel: true }] }),
    ],
    confianca: 'alta',
  };
  const db = novoBanco();
  const cl = criarClassificador({ db, claude: claudeFalso([dias]), agora: relogio(), log: logMudo });
  const extrator = criarExtrator({ db, classificador: cl, agora: relogio(), log: logMudo });
  const url = 'https://festival.example/ingressos';
  const r = await paginas.coletar({
    config: { agendas: [url], janelas: null }, agora: relogio(), log: logMudo, extrator,
    dormir: async () => {}, lerPaginas: async (us) => us.map((u) => ({ url: u, final: u, status: 200, titulo: 'Gop Tun', texto: 'Sábado 5/12 e domingo 6/12', jsonld: [] })),
  });
  assert.equal(r.itens.length, 2);
  assert.notEqual(r.itens[0].idExterno, r.itens[1].idExterno);
  assert.deepEqual(r.itens.map((i) => [i.bruto.data, i.bruto.lotes[0].preco]), [['2026-12-05', 180], ['2026-12-06', 150]]);
});

test('extrair/3: Casa de Francisca, jazz de segunda na Matiz e a escuta da Hifi, com ehFesta false, saem do export; a festa fica', async () => {
  const db = novoBanco();
  const lido = {
    festas: [
      lida('Cartas e Segredos', '2026-11-12', { ehFesta: false, tipo: 'leitura', casa: 'Casa de Francisca' }),
      lida('Jazz de segunda', '2026-11-16', { ehFesta: false, tipo: 'show', casa: 'Matiz' }),
      lida('Sessão de escuta', '2026-11-13', { ehFesta: false, tipo: 'sessao-de-escuta', casa: 'Hifi Community' }),
      lida('Baile da Sexta', '2026-11-13', { casa: 'Casa Exemplo' }),
    ],
    confianca: 'alta',
  };
  const url = 'https://casa.example/agenda';
  const fonte = {
    ...paginas, id: 'paginas',
    coletar: (ctx) => paginas.coletar({
      ...ctx, config: { agendas: [url], janelas: null }, dormir: async () => {},
      lerPaginas: async (us) => us.map((u) => ({ url: u, final: u, status: 200, titulo: 'Agenda', texto: 'agenda', jsonld: [] })),
    }),
  };
  await executar({ db, fontes: [fonte], claude: claudeFalso([lido]), agora: relogio(), log: logMudo, config: {} });
  assert.deepEqual(listarRegistros(db).map((f) => f.nome), ['Baile da Sexta']);
  const todas = listarRegistros(db, { todas: true });
  assert.equal(todas.length, 4);
  const leitura = todas.find((f) => f.nome === 'Cartas e Segredos');
  assert.equal(leitura.ehFesta, false);
  assert.equal(leitura.campos.ehFesta.fonte, 'paginas');
});

test('extrair/3: o classificador desligado (classificar: false) não vai ao modelo nem às regras', async () => {
  const db = novoBanco();
  const claude = claudeFalso([BOA]);
  const cl = criarClassificador({ db, claude, classificar: false, agora: relogio(), log: logMudo });
  const r = await cl.classificar(entrada(1));
  assert.equal(r.desligado, true);
  assert.equal(r.resultado, null);
  assert.equal(claude.pedidos.length, 0);
  assert.equal(cl.resumo().regras, 0);
});

test('classificar/4: o modelo vê o dia e o horário da festa (Quando), com a virada de dia', async () => {
  const { linhaQuando: quando, SISTEMA, VERSAO_PROMPT } = require('../nucleo/classificar');
  assert.equal(VERSAO_PROMPT, 'classificar/4');
  assert.equal(quando({ data: '2026-12-05', inicio: '2026-12-05T20:00:00-03:00', fim: '2026-12-06T05:00:00-03:00' }), 'Quando: sábado, 05/12, das 20:00 às 05:00 (do dia seguinte)');
  assert.equal(quando({ data: '2026-11-26', inicio: '2026-11-26T22:00:00-03:00' }), 'Quando: quinta, 26/11, a partir das 22:00');
  assert.equal(quando({ inicio: '2026-11-27T21:00:00-03:00', fim: '2026-11-27T23:59:00-03:00' }), 'Quando: sexta, 27/11, das 21:00 às 23:59');
  assert.equal(quando({}), '');
  assert.equal(quando({ data: '2026-12-06', inicio: '2026-12-06T00:30:00-03:00' }), 'Quando: domingo, 06/12, a partir das 00:30 (madrugada)');
  assert.match(SISTEMA, /começa entre 22:00 e 05:00/);
  // A regra de horário não passa por cima dos casos false (revisão de 24/11).
  assert.match(SISTEMA, /Não vale para os casos false acima \(concerto ou show sentado, sessão de escuta/);
  assert.match(SISTEMA, /Roda de samba, pagode, forró/);
});

test('classificar/4: a linha Quando vai dentro de <evento> e muda o hash do cache', async () => {
  const db = novoBanco();
  const c = claudeFalso([BOA, BOA]);
  const cl = criarClassificador({ db, claude: c, modelo: 'claude-haiku-5-5', agora: relogio(), log: logMudo });
  await cl.classificar({ ...entrada(1), data: '2026-12-12', inicio: '2026-12-12T22:00:00-03:00', fim: '2026-12-13T04:30:00-03:00' });
  assert.match(c.pedidos[0].messages[0].content, /<evento>[\s\S]*Quando: sábado, 12\/12, das 22:00 às 04:30 \(do dia seguinte\)[\s\S]*<\/evento>/);
  await cl.classificar({ ...entrada(1), data: '2026-12-12', inicio: '2026-12-12T20:00:00-03:00' });
  assert.equal(c.pedidos.length, 2, 'outro horário é outra entrada: não sai do cache');
});

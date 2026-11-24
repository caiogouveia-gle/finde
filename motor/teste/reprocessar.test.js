'use strict';
// Reprocessar e revincular (U8 do plano de 24/11/2026, KTD11, AE1): as
// correções da correlação valem para um banco já coletado, sem rede, sem
// chamada paga e sem perder o que o modelo já leu.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ESQUEMA, abrirBanco, parEmOrdem } = require('../nucleo/banco');
const { novoId } = require('../nucleo/normalizar');
const { reprocessar, revincular } = require('../nucleo/reprocessar');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const correlacao = require('../nucleo/correlacao');
const { novoBanco, relogio, logMudo, fonteFixa, ligarImagem } = require('./ajuda');

const URL_A = 'https://shotgun.live/pt-br/events/26-11-abacateira-no-mundo-pensante';
const URL_E = 'https://shotgun.live/pt-br/events/26-11-embalo-com-dj-castanha-no-mundo-pensante';
const ID_A = `pagina:${URL_A}`;
const ID_E = `pagina:${URL_E}`;
const MUNDO = { produtora: { nome: 'Mundo Pensante' }, casa: 'Mundo Pensante', endereco: 'R. Treze de Maio, 830 - Bela Vista, São Paulo - SP, 01327-000, Brasil', cidade: 'São Paulo', data: '2026-11-26' };
const BRUTO_A = { ...MUNDO, nome: '26/11 - Abacateira No Mundo Pensante', inicio: '21:00', fim: '23:59', lotes: [{ nome: 'antecipados', preco: 20, disponivel: true }], linkCompra: URL_A, linkEvento: URL_A };
const BRUTO_E = { ...MUNDO, nome: '26/11 - Embalo Com Dj Castanha No Mundo Pensante', inicio: '23:59', fim: '04:00', lotes: [{ nome: 'antecipados', preco: 20, disponivel: true }], linkCompra: URL_E, linkEvento: URL_E };
const FESTA_A = novoId(BRUTO_A.nome, '2026-11-26', `paginas:${ID_A}`);
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// O banco na forma do de 24/11 (nomes fictícios), no esquema de antes do 3: Abacateira e Embalo
// juntas numa festa só (a do item da Abacateira), com os valores da Embalo por
// cima, a leitura do Claude, uma rodada de fonte, uma execução, uso pago, uma
// curadoria e uma imagem do item da Embalo. Mais duas festas que uma decisão
// manual `une` manda juntar.
function bancoErrado(arquivo) {
  const db = new DatabaseSync(arquivo);
  db.exec(ESQUEMA);
  const t0 = '2026-11-24T03:57:11.666Z';
  const t1 = '2026-11-24T03:57:11.673Z';
  db.prepare('INSERT INTO festas (id, data, criada_em) VALUES (?, ?, ?)').run(FESTA_A, '2026-11-26', t0);
  const insB = db.prepare('INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES (?, ?, ?, ?, ?)');
  insB.run('paginas', ID_A, 'h1', JSON.stringify(BRUTO_A), t0);
  insB.run('paginas', ID_E, 'h2', JSON.stringify(BRUTO_E), t1);
  const insV = db.prepare('INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em) VALUES (?, ?, ?, ?, ?)');
  insV.run('paginas', ID_A, FESTA_A, URL_A, t0);
  insV.run('paginas', ID_E, FESTA_A, URL_E, t1);
  const insVal = db.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [campo, valor] of [['nome', BRUTO_E.nome], ['casa', 'Mundo Pensante'], ['data', '2026-11-26'], ['inicio', '2026-11-26T23:59:00-03:00'], ['linkCompra', URL_E]]) {
    insVal.run(FESTA_A, campo, 'paginas', JSON.stringify(valor), t1, t1);
  }
  for (const [campo, valor] of [['ehFesta', true], ['lineup', ['DJ Castanha']], ['estilos', ['mpb-samba']]]) insVal.run(FESTA_A, campo, 'claude', JSON.stringify(valor), t1, t1);
  db.prepare("INSERT INTO fontes_rodadas (fonte, ultima_ok) VALUES ('paginas', ?)").run('2026-11-10T14:00:00.000Z');
  db.prepare("INSERT INTO execucoes (inicio, fim, estado, gatilho, resumo) VALUES (?, ?, 'ok', 'comando', '{}')").run(t0, t1);
  db.prepare("INSERT INTO uso_llm (quando, modelo, tokens_entrada, tokens_saida, custo_usd, resultado) VALUES (?, 'claude-haiku', 900, 300, 0.002, 'ok')").run(t1);
  db.prepare("INSERT INTO uso_apify (quando, ator, itens, custo_usd, resultado) VALUES (?, 'ator', 3, 0.01, 'ok')").run(t1);
  db.prepare("INSERT INTO classificacoes (hash, por, modelo, resultado, criada_em) VALUES ('hx', 'claude', 'm', '{}', ?)").run(t1);
  // Duas festas de nomes diferentes, sem nada em comum, que uma pessoa disse serem a mesma.
  for (const [fonte, id, nome] of [['indicacao', 'grupo:um', 'Nome Um'], ['instagram', 'ig:P2:1', 'Outro Título']]) {
    const festa = novoId(nome, '2026-11-28', `${fonte}:${id}`);
    db.prepare('INSERT INTO festas (id, data, criada_em) VALUES (?, ?, ?)').run(festa, '2026-11-28', t0);
    insB.run(fonte, id, `h-${id}`, JSON.stringify({ nome, data: '2026-11-28' }), t0);
    insV.run(fonte, id, festa, null, t0);
    insVal.run(festa, 'nome', fonte, JSON.stringify(nome), t0, t0);
    insVal.run(festa, 'data', fonte, JSON.stringify('2026-11-28'), t0, t0);
  }
  db.close();
}

// As tabelas novas (decisão, curadoria, imagem) num banco de origem no esquema
// 3: a origem real terá essas linhas depois da fundação.
function bancoErradoComTabelasNovas(arquivo) {
  bancoErrado(arquivo);
  const db = abrirBanco(arquivo);
  const [a, b] = parEmOrdem(['indicacao', 'grupo:um'], ['instagram', 'ig:P2:1']);
  db.prepare("INSERT INTO vinculos_decisoes (a_fonte, a_id, b_fonte, b_id, decisao, quem, quando) VALUES (?, ?, ?, ?, 'une', 'teste', 't')").run(...a, ...b);
  db.prepare("INSERT INTO curadoria (festa_id, campo, valor, motivo, criada_em) VALUES (?, 'casa', ?, 'grafia da casa', 't')").run(FESTA_A, JSON.stringify('Mundo Pensante (Bela Vista)'));
  ligarImagem(db, { fonte: 'paginas', idExterno: ID_E, sha: '00112233445566aa', phash: 'ffff0000ffff0000', papel: 'pagina-ingresso' });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
}

// A fonte de festa `curadoria` como a U19 a descreve (KTD12): regrava os
// campos ativos de cada festa, pelo id resolvido nos apelidos.
const curadoriaDeTeste = {
  id: 'curadoria',
  async aplicar({ db, agora }) {
    const { gravarValores } = require('../nucleo/agregar');
    const porFesta = new Map();
    for (const c of db.prepare('SELECT festa_id, campo, valor FROM curadoria WHERE ativa = 1').all()) {
      const id = correlacao.resolverId(db, c.festa_id);
      if (!porFesta.has(id)) porFesta.set(id, {});
      porFesta.get(id)[c.campo] = JSON.parse(c.valor);
    }
    for (const [id, campos] of porFesta) if (db.prepare('SELECT 1 FROM festas WHERE id = ?').get(id)) gravarValores(db, id, 'curadoria', campos, agora().toISOString());
    return { gravados: porFesta.size, avisos: [] };
  },
};

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'finde-reprocessar-'));

test('AE1: simular propõe separar Abacateira e Embalo, com o veto de dois links próprios da mesma fonte, sem escrever nada', async () => {
  const dir = pasta();
  const origem = path.join(dir, 'origem.sqlite3');
  bancoErradoComTabelasNovas(origem);
  const antes = sha256(origem);
  const r = await reprocessar({ origem, simular: true, agora: relogio(), log: logMudo, config: {}, fontesDeFesta: [] });
  assert.equal(r.simulado, true);
  assert.equal(r.feito, false);
  assert.equal(r.separa.length, 1);
  assert.equal(r.separa[0].festa, FESTA_A);
  assert.match(r.separa[0].motivo, /dois links próprios diferentes da mesma fonte/);
  assert.ok(r.linhas.some((l) => l.startsWith(`separa ${FESTA_A} em `)));
  assert.ok(r.linhas.some((l) => l.startsWith('une ') && /decisão manual/.test(l)));
  assert.equal(sha256(origem), antes);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => !f.startsWith('origem')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AE1: reprocessar separa, mantém o id da Abacateira, leva a leitura do Claude às duas partes e não gasta nada', async () => {
  const dir = pasta();
  const origem = path.join(dir, 'origem.sqlite3');
  const destino = path.join(dir, 'destino.sqlite3');
  bancoErradoComTabelasNovas(origem);
  const antes = sha256(origem);
  const r = await reprocessar({ origem, destino, agora: relogio(), log: logMudo, config: {}, fontesDeFesta: [curadoriaDeTeste] });
  assert.equal(r.feito, true);
  assert.equal(r.integridade, 'ok');
  assert.equal(sha256(origem), antes); // a origem não mudou
  assert.equal(fs.existsSync(`${destino}.parcial`), false);
  await assert.rejects(reprocessar({ origem, destino, log: logMudo, config: {}, fontesDeFesta: [] }), /já existe/);

  const db = abrirBanco(destino);
  const fs2 = listarRegistros(db, { todas: true, lugares: [] });
  const a = fs2.find((f) => /Abacateira/.test(f.nome));
  const e = fs2.find((f) => /Embalo/.test(f.nome));
  assert.ok(a && e);
  assert.equal(a.id, FESTA_A); // a Abacateira mantém o id
  assert.notEqual(e.id, FESTA_A); // a Embalo ganha id novo
  assert.equal(a.inicio, '2026-11-26T21:00:00-03:00');
  // O que o Claude leu da festa antiga vai às duas partes, marcadas para revisão.
  for (const f of [a, e]) {
    assert.equal(f.ehFesta, true, f.nome);
    assert.deepEqual(f.lineup, ['DJ Castanha'], f.nome);
    assert.deepEqual(f.estilos, ['mpb-samba'], f.nome);
    assert.ok(f.revisar.some((x) => x.motivo === 'separada'), f.nome);
  }
  // A url de cada vínculo veio da origem.
  assert.equal(db.prepare('SELECT url FROM vinculos WHERE id_externo = ?').get(ID_E).url, URL_E);
  // A curadoria da festa antiga vale na festa de mesmo id.
  assert.equal(a.casa, 'Mundo Pensante (Bela Vista)');
  assert.equal(a.campos.casa.fonte, 'curadoria');
  // A decisão manual `une` juntou as duas outras festas, e o id que saiu virou apelido.
  const unida = fs2.find((f) => f.fontes.length === 2);
  assert.ok(unida);
  assert.equal(unida.fontes.find((x) => x.vinculo.regra === 'manual') !== undefined, true);
  assert.equal(unida.idsAntigos.length, 1);
  assert.equal(correlacao.resolverId(db, unida.idsAntigos[0]), unida.id);
  // A imagem segue o item da Embalo para a festa nova.
  assert.equal(db.prepare("SELECT v.festa_id FROM imagens_item ii JOIN vinculos v ON v.fonte = ii.fonte AND v.id_externo = ii.id_externo WHERE ii.sha = '00112233445566aa'").get().festa_id, e.id);
  // Zero chamada: o uso pago é o da origem, sem linha nova.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM uso_llm').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM uso_apify').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classificacoes').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM execucoes').get().n, 1);
  // A rodada da fonte foi copiada: a próxima coleta não roda de novo a fonte do dia.
  let chamadas = 0;
  const paginas = { id: 'paginas', nome: 'paginas', coletar: async () => { chamadas += 1; return { itens: [], avisos: [] }; } };
  const r2 = await executar({ db, fontes: [paginas], agora: relogio(), log: logMudo, apify: null, fontesDeFesta: [], config: { paginas: { intervaloHoras: 20 } } });
  assert.equal(chamadas, 0);
  assert.equal(r2.fontes.paginas.pulada, true);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reprocessar: origem no esquema de antes do 3 (sem as tabelas novas) também separa', async () => {
  const dir = pasta();
  const origem = path.join(dir, 'origem.sqlite3');
  const destino = path.join(dir, 'destino.sqlite3');
  bancoErrado(origem);
  const antes = sha256(origem);
  const r = await reprocessar({ origem, destino, agora: relogio(), log: logMudo, config: {}, fontesDeFesta: [] });
  assert.equal(r.separa.length, 1);
  assert.equal(r.origem.festas, 3);
  assert.equal(r.destino.festas, 4);
  assert.equal(sha256(origem), antes);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reprocessar: origem que não existe e destino que falta são recusados', async () => {
  await assert.rejects(reprocessar({ origem: '/caminho/que/nao/existe.sqlite3', destino: '/tmp/x', log: logMudo }), /não existe/);
  const dir = pasta();
  const origem = path.join(dir, 'origem.sqlite3');
  bancoErrado(origem);
  await assert.rejects(reprocessar({ origem, log: logMudo }), /falta o destino/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('revincular: simular mostra o que une e o que separa; aplicar troca numa transação, com os ids preservados', async () => {
  const db = novoBanco();
  const agora = relogio();
  await executar({ db, fontes: [fonteFixa('paginas', [{ idExterno: ID_A, url: URL_A, bruto: BRUTO_A }])], agora, log: logMudo, apify: null, fontesDeFesta: [] });
  // A união errada, como o vínculo antigo fazia: o item da Embalo na festa da Abacateira.
  const festa = db.prepare('SELECT id FROM festas').get().id;
  db.prepare("INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES ('paginas', ?, 'h', ?, ?)").run(ID_E, JSON.stringify(BRUTO_E), agora().toISOString());
  db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em) VALUES ('paginas', ?, ?, ?, ?)").run(ID_E, festa, URL_E, agora().toISOString());
  db.prepare("INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, 'lineup', 'claude', ?, 't', 't')").run(festa, JSON.stringify(['DJ Castanha']));

  const sim = revincular(db, { simular: true, agora, log: logMudo, config: {} });
  assert.equal(sim.aplicado, false);
  assert.equal(sim.separa.length, 1);
  assert.match(sim.linhas.join('\n'), new RegExp(`^separa ${festa} em .*dois links próprios`, 'm'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM festas').get().n, 1);

  const r = revincular(db, { agora, log: logMudo, config: {} });
  assert.equal(r.aplicado, true);
  const fs2 = listarRegistros(db, { todas: true, lugares: [] });
  assert.equal(fs2.length, 2);
  assert.ok(fs2.some((f) => f.id === festa && /Abacateira/.test(f.nome)));
  for (const f of fs2) assert.deepEqual(f.lineup, ['DJ Castanha']);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  // De novo, nada muda.
  assert.deepEqual(revincular(db, { simular: true, agora, log: logMudo, config: {} }).linhas, []);
});

test('revincular une o que a correlação nova junta (Constelar com o mesmo flyer) e o id antigo vira apelido', async () => {
  const db = novoBanco();
  const ig = { idExterno: 'ig:CONSTELAR:1', bruto: { nome: 'CONSTELAR', data: '2026-12-05', casa: 'Hangar Campo de Marte', produtora: { nome: 'Constelar', instagram: '@coletivo_exemplo' } } };
  const pag = { idExterno: 'pagina:constelar', url: 'https://www.ingresse.com/constelar/', bruto: { nome: 'Constelar', casa: 'São Paulo', data: '2026-12-05', inicio: '22:00', linkEvento: 'https://www.ingresse.com/constelar/' } };
  await executar({ db, fontes: [fonteFixa('instagram', [ig]), fonteFixa('paginas', [pag])], agora: relogio(), log: logMudo, apify: null, fontesDeFesta: [] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM festas').get().n, 2);
  const ids = db.prepare('SELECT id FROM festas ORDER BY rowid').all().map((x) => x.id);
  ligarImagem(db, { fonte: 'instagram', idExterno: ig.idExterno, sha: 'a1', phash: 'f0f0f0f0f0f0f0f0' });
  ligarImagem(db, { fonte: 'paginas', idExterno: pag.idExterno, sha: 'b1', phash: 'f0f0f0f0f0f0f0f1' });
  const r = revincular(db, { agora: relogio(), log: logMudo, config: {} });
  assert.equal(r.une.length, 1);
  assert.match(r.linhas[0], /^une .* \+ .*\(.*pHash.*\)$/);
  assert.deepEqual(db.prepare('SELECT id FROM festas').all().map((x) => x.id), [ids[0]]);
  assert.equal(correlacao.resolverId(db, ids[1]), ids[0]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidatos').get().n, 0);
});

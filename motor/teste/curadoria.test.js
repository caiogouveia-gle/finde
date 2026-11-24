'use strict';
// Curadoria (U19, M34, D7, KTD12): corrigir, ocultar, decidir, revisar, o lote
// de entrada/curadoria.json e a fonte de festa `curadoria` no tempo 4.
// Festas, casas e links inventados.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const { gravarValores } = require('../nucleo/agregar');
const { abrirBanco } = require('../nucleo/banco');
const curadoria = require('../nucleo/curadoria');
const fonteCuradoria = require('../fontes/curadoria');
const { main } = require('../cli');
const { novoBanco, relogio, logMudo, logQueGuarda } = require('./ajuda');
const { fonteFixa, semear, festaDe } = require('./ajuda-operacao');

const LINK = 'https://www.sympla.com.br/evento/baile-exemplo/123';
const CONFIG = { curadoria: { arquivo: '/nao/existe/curadoria.json' } };

// Uma festa vista por duas fontes (o mesmo link de evento): as páginas dizem
// uma casa; a outra fonte não diz.
async function duasFontes(db, agora) {
  await semear(db, [
    { fonte: 'paginas', idExterno: 'p1', bruto: { nome: 'Baile Exemplo', data: '2026-11-14', inicio: '22:00', casa: 'Casa Das Paginas', linkEvento: LINK } },
    { fonte: 'indicacao', idExterno: 'i1', bruto: { nome: 'Baile Exemplo', data: '2026-11-14', inicio: '22:00', linkEvento: LINK } },
  ], agora);
  const id = festaDe(db, 'paginas', 'p1');
  assert.equal(festaDe(db, 'indicacao', 'i1'), id, 'o mesmo link junta as duas fontes numa festa');
  return id;
}

test('ocultar tira a festa da lista; `todas` ainda a mostra; desfazer a devolve', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  assert.equal(listarRegistros(db).length, 1);
  const r = curadoria.ocultar(db, { festaId: id, motivo: 'não é festa', agora });
  assert.ok(r.id > 0);
  assert.equal(listarRegistros(db).length, 0);
  assert.equal(listarRegistros(db, { todas: true }).length, 1);
  assert.equal(db.prepare("SELECT fonte FROM valores WHERE festa_id = ? AND campo = 'oculta'").get(id).fonte, 'curadoria');
  assert.equal(curadoria.desfazer(db, { festaId: id, campo: 'oculta', agora }).desfeitas, 1);
  assert.equal(listarRegistros(db).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM valores WHERE festa_id = ? AND fonte = 'curadoria'").get(id).n, 0);
});

test('corrigir a casa vence a das páginas, e a curadoria diz que foi ela', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  assert.equal(listarRegistros(db)[0].casa, 'Casa Das Paginas');
  curadoria.corrigir(db, { festaId: id, campo: 'casa', valor: 'Casa Certa', motivo: 'o nome na fachada', agora });
  const [f] = listarRegistros(db);
  assert.equal(f.casa, 'Casa Certa');
  assert.equal(f.campos.casa.fonte, 'curadoria');
  // Corrigir de novo o mesmo campo troca a correção: só a mais nova fica ativa.
  curadoria.corrigir(db, { festaId: id, campo: 'casa', valor: 'Outra Casa', agora });
  assert.equal(listarRegistros(db)[0].casa, 'Outra Casa');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM curadoria WHERE ativa = 1').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM curadoria').get().n, 2, 'a anterior fica no histórico');
});

test('corrigir recusa campo desconhecido, valor ausente e festa que não existe', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  assert.throws(() => curadoria.corrigir(db, { festaId: id, campo: 'inventado', valor: 1, agora }), /campo desconhecido/);
  assert.throws(() => curadoria.corrigir(db, { festaId: id, campo: 'casa', agora }), /valor/);
  assert.throws(() => curadoria.corrigir(db, { festaId: 'nao-existe', campo: 'casa', valor: 'X', agora }), /não encontrada/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM curadoria').get().n, 0);
});

test('duas correções na mesma festa sobrevivem juntas a uma nova coleta', async () => {
  const db = novoBanco();
  const agora = relogio();
  const item = { idExterno: 'p1', bruto: { nome: 'Baile Exemplo', data: '2026-11-14', inicio: '22:00', casa: 'Casa Das Paginas', linkEvento: LINK } };
  await executar({ db, fontes: [fonteFixa('paginas', [item])], claude: null, apify: null, classificar: false, agora, log: logMudo, config: CONFIG });
  const id = festaDe(db, 'paginas', 'p1');
  curadoria.corrigir(db, { festaId: id, campo: 'casa', valor: 'Casa Certa', agora });
  curadoria.corrigir(db, { festaId: id, campo: 'estilos', valor: ['funk'], agora });
  // Nova coleta (a página mudou a casa e o início), com as fontes de festa de verdade.
  agora.andar(6 * 3600e3);
  item.bruto = { ...item.bruto, casa: 'Casa Que Mudou', inicio: '23:00' };
  const r = await executar({ db, fontes: [fonteFixa('paginas', [item])], claude: null, apify: null, classificar: false, agora, log: logMudo, config: CONFIG });
  assert.equal(r.fontesDeFesta.curadoria.gravados, 2);
  const [f] = listarRegistros(db);
  assert.equal(f.casa, 'Casa Certa');
  assert.deepEqual(f.estilos, ['funk']);
  assert.equal(f.campos.casa.fonte, 'curadoria');
  assert.equal(f.campos.estilos.fonte, 'curadoria');
  assert.match(f.inicio, /T23:00:00-03:00$/, 'o que a curadoria não corrigiu segue a fonte');
});

test('a curadoria de uma festa depois unida vale na festa nova', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [
    { fonte: 'paginas', idExterno: 'a', bruto: { nome: 'Festa Antiga', data: '2026-11-14', inicio: '22:00', casa: 'Casa A' } },
    { fonte: 'instagram', idExterno: 'b', bruto: { nome: 'Festa Nova Do Insta', data: '2026-11-14', inicio: '22:00', casa: 'Casa B' } },
  ], agora);
  const antiga = festaDe(db, 'instagram', 'b');
  const nova = festaDe(db, 'paginas', 'a');
  assert.notEqual(antiga, nova);
  curadoria.corrigir(db, { festaId: antiga, campo: 'casa', valor: 'Casa Certa', agora });
  // A correlação absorve `antiga` em `nova`: vínculos e apelido, festa antiga some.
  db.exec('BEGIN');
  db.prepare('UPDATE vinculos SET festa_id = ? WHERE festa_id = ?').run(nova, antiga);
  db.prepare('DELETE FROM valores WHERE festa_id = ?').run(antiga);
  db.prepare('DELETE FROM festas WHERE id = ?').run(antiga);
  db.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?)').run(antiga, nova, agora().toISOString());
  db.exec('COMMIT');
  const aviso = await fonteCuradoria.aplicar({ db, agora, config: CONFIG.curadoria, log: logMudo });
  assert.deepEqual(aviso.avisos, []);
  assert.equal(aviso.gravados, 1);
  const f = listarRegistros(db).find((x) => x.id === nova);
  assert.equal(f.casa, 'Casa Certa');
  // Corrigir pelo id antigo, depois da união, cai na festa nova.
  assert.equal(curadoria.corrigir(db, { festaId: antiga, campo: 'lineup', valor: ['DJ X'], agora }).festaId, nova);
  assert.deepEqual(listarRegistros(db).find((x) => x.id === nova).lineup, ['DJ X']);
});

test('entrada/curadoria.json: o lote entra uma vez, linha ruim vira aviso, a tabela manda depois', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-curadoria-'));
  const arquivo = path.join(dir, 'curadoria.json');
  fs.writeFileSync(arquivo, JSON.stringify([
    { festa: id, campo: 'casa', valor: 'Casa Do Lote', motivo: 'conferido na fachada' },
    { festa: id, campo: 'idadeMinima', valor: 18 },
    { festa: 'nao-existe', campo: 'casa', valor: 'X' },
    { campo: 'casa' },
  ]));
  try {
    const r1 = await fonteCuradoria.aplicar({ db, agora, config: { arquivo }, log: logMudo });
    assert.equal(r1.gravados, 2);
    assert.equal(r1.avisos.length, 2, r1.avisos.join(' | '));
    assert.equal(listarRegistros(db)[0].casa, 'Casa Do Lote');
    assert.equal(listarRegistros(db)[0].idadeMinima, 18);
    const antes = db.prepare('SELECT COUNT(*) AS n FROM curadoria').get().n;
    await fonteCuradoria.aplicar({ db, agora, config: { arquivo }, log: logMudo });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM curadoria').get().n, antes, 'rodar de novo não repete o lote');
    // Arquivo que não é lista vira aviso, sem derrubar.
    fs.writeFileSync(arquivo, '{"nao":"lista"}');
    const r3 = await fonteCuradoria.aplicar({ db, agora, config: { arquivo }, log: logMudo });
    assert.match(r3.avisos.join(), /lista/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no Fly o lote vem de FINDE_CURADORIA_LOTE (o volume), com o arquivo do config como reserva', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-curadoria-'));
  const noVolume = path.join(dir, 'volume.json');
  fs.writeFileSync(noVolume, JSON.stringify([{ festa: id, campo: 'casa', valor: 'Casa Do Volume' }]));
  try {
    // O config aponta entrada/curadoria.json dentro do motor (que no Fly não existe); a variável ganha.
    const env = { FINDE_CURADORIA_LOTE: noVolume };
    assert.equal(fonteCuradoria.arquivoDoLote({ arquivo: 'entrada/nao-existe.json' }, env), noVolume);
    const r = await fonteCuradoria.aplicar({ db, agora, config: { arquivo: 'entrada/nao-existe.json' }, log: logMudo, env });
    assert.equal(r.gravados, 1);
    assert.equal(listarRegistros(db)[0].casa, 'Casa Do Volume');
    // A variável apontando um arquivo que não existe: vale o do config.
    const doConfig = path.join(dir, 'config.json');
    fs.writeFileSync(doConfig, '[]');
    assert.equal(fonteCuradoria.arquivoDoLote({ arquivo: doConfig }, { FINDE_CURADORIA_LOTE: path.join(dir, 'sumiu.json') }), doConfig);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corrigir a data ou o início anda com a data da noite', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  assert.equal(db.prepare('SELECT data_noite FROM festas WHERE id = ?').get(id).data_noite, '2026-11-14');
  curadoria.corrigir(db, { festaId: id, campo: 'inicio', valor: '2026-11-15T00:30:00-03:00', agora });
  assert.equal(db.prepare('SELECT data_noite FROM festas WHERE id = ?').get(id).data_noite, '2026-11-14', '00h30 de domingo é a noite de sábado');
  curadoria.corrigir(db, { festaId: id, campo: 'data', valor: '2026-11-21', agora });
  curadoria.corrigir(db, { festaId: id, campo: 'inicio', valor: '2026-11-21T22:00:00-03:00', agora });
  assert.equal(db.prepare('SELECT data_noite FROM festas WHERE id = ?').get(id).data_noite, '2026-11-21');
});

// ---------------------------------------------------------------- decidir

test('decidir grava o par em ordem; o mesmo par pelo outro lado é a mesma linha e troca a decisão', async () => {
  const db = novoBanco();
  const agora = relogio();
  await duasFontes(db, agora);
  const r = curadoria.decidir(db, { a: ['paginas', 'p1'], b: ['indicacao', 'i1'], decisao: 'separa', quem: 'caio', agora });
  assert.deepEqual([r.a, r.b], [['indicacao', 'i1'], ['paginas', 'p1']]);
  curadoria.decidir(db, { a: 'paginas:p1', b: 'indicacao:i1', decisao: 'une', agora });
  const linhas = db.prepare('SELECT * FROM vinculos_decisoes').all();
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].decisao, 'une');
  assert.equal(linhas[0].a_fonte, 'indicacao');
});

test('decidir recusa decisão inválida, item igual e item que não existe', async () => {
  const db = novoBanco();
  const agora = relogio();
  await duasFontes(db, agora);
  assert.throws(() => curadoria.decidir(db, { a: ['paginas', 'p1'], b: ['indicacao', 'i1'], decisao: 'talvez', agora }), /une.*separa/);
  assert.throws(() => curadoria.decidir(db, { a: ['paginas', 'p1'], b: ['paginas', 'p1'], decisao: 'une', agora }), /mesmo/);
  assert.throws(() => curadoria.decidir(db, { a: ['paginas', 'p1'], b: ['instagram', 'nada'], decisao: 'une', agora }), /não encontrado/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vinculos_decisoes').get().n, 0);
});

// ---------------------------------------------------------------- revisar

test('listarRevisao: plataforma contra modelo, casa que é cidade, sem cidade e candidato a fusão', async () => {
  const db = novoBanco();
  const agora = relogio();
  await semear(db, [
    { fonte: 'sympla-apify', idExterno: 'a', bruto: { nome: 'Sessão de Escuta', data: '2026-11-14', inicio: '20:00', casa: 'Casa Exemplo', endereco: 'Rua A, 1 - São Paulo/SP' } },
    { fonte: 'paginas', idExterno: 'b', bruto: { nome: 'Baile Sem Cidade', data: '2026-11-15', inicio: '22:00' } },
    { fonte: 'paginas', idExterno: 'c', bruto: { nome: 'Festa Tudo Certo', data: '2026-11-16', inicio: '22:00', casa: 'Casa Boa', endereco: 'Rua B, 2 - São Paulo/SP' } },
  ], agora);
  const a = festaDe(db, 'sympla-apify', 'a');
  const b = festaDe(db, 'paginas', 'b');
  const c = festaDe(db, 'paginas', 'c');
  gravarValores(db, a, 'sympla-apify', { ehFesta: true }, agora().toISOString());
  gravarValores(db, a, 'claude', { ehFesta: false }, agora().toISOString());
  // A normalização já limpa casa que é cidade; o dado antigo do banco ainda a traz.
  gravarValores(db, b, 'indicacao', { casa: 'Alameda Exemplo, 376' }, agora().toISOString());
  db.prepare('INSERT INTO candidatos (fonte, id_externo, festa_id, escore, motivo, visto_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run('paginas', 'b', c, 3.5, JSON.stringify([{ sinal: 'nome', peso: 3, detalhe: 'parecido' }]), agora().toISOString());
  const itens = curadoria.listarRevisao(db);
  const motivos = (id) => itens.filter((x) => x.festaId === id).map((x) => x.motivo);
  assert.deepEqual(motivos(a), ['ehFesta diverge']);
  assert.ok(motivos(b).includes('sem cidade'), motivos(b).join());
  assert.ok(motivos(b).includes('casa parece cidade ou endereço'), motivos(b).join());
  assert.deepEqual(motivos(c), ['candidato a fusão']);
  assert.equal(itens.find((x) => x.festaId === c).detalhe.item, 'paginas:b');
  // Filtra por festa; a festa ocultada pela curadoria sai da revisão.
  assert.deepEqual(curadoria.listarRevisao(db, { festaId: a }).map((x) => x.motivo), ['ehFesta diverge']);
  curadoria.ocultar(db, { festaId: b, motivo: 'teste', agora });
  assert.equal(curadoria.listarRevisao(db).filter((x) => x.festaId === b).length, 0);
});

test('corrigir confere o valor de cada campo e entrega a forma que o registro espera', async () => {
  const db = novoBanco();
  const agora = relogio();
  const id = await duasFontes(db, agora);
  const tenta = (campo, valor) => curadoria.corrigir(db, { festaId: id, campo, valor, agora });
  assert.throws(() => tenta('casa', 42), /valor inválido para casa/);
  assert.throws(() => tenta('data', '14/11'), /AAAA-MM-DD/);
  assert.throws(() => tenta('inicio', '22:00'), /ISO com fuso/);
  assert.throws(() => tenta('estilos', 'funk'), /lista de textos/);
  assert.throws(() => tenta('idadeMinima', '18'), /número inteiro/);
  assert.throws(() => tenta('ehFesta', 'sim'), /true ou false/);
  assert.throws(() => tenta('tipo', 'balada'), /festa, show/);
  assert.throws(() => tenta('linkCompra', 'sympla'), /URL/);
  assert.throws(() => tenta('mediaIdade', { valor: 30, origem: 'chute' }), /origem/);
  assert.throws(() => tenta('geo', { lat: 'x' }), /lat/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM curadoria').get().n, 0, 'valor recusado não grava nada');
  tenta('produtora', 'Coletivo Solto');
  tenta('geo', { lat: -23.56, lng: -46.65 });
  tenta('tipo', 'show');
  const [f] = listarRegistros(db);
  assert.deepEqual(f.produtora, { nome: 'Coletivo Solto', instagram: null });
  assert.equal(f.endereco.lat, -23.56);
  assert.equal(f.endereco.origemGeo, 'curadoria');
  assert.equal(f.endereco.precisao, 'casa');
  assert.equal(f.classificacao.tipo, 'show');
});

// ---------------------------------------------------------------- CLI

async function comArquivo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-cli-'));
  const banco = path.join(dir, 'finde.sqlite3');
  try {
    return await fn({ dir, banco, env: { FINDE_BANCO: banco, FINDE_IMAGENS: path.join(dir, 'imagens') } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI: corrigir, ocultar, revisar e decidir pelo main([...])', async () => {
  await comArquivo(async ({ banco, env }) => {
    const db = abrirBanco(banco);
    const agora = relogio();
    const id = await duasFontes(db, agora);
    db.close();
    const l = logQueGuarda();
    const saida = () => l.linhas.splice(0).join('\n');
    assert.equal(await main(['corrigir', id, 'casa', '"Casa Pela CLI"', '--motivo', 'teste'], { env, log: l }), 0, saida());
    assert.equal(await main(['corrigir', id, 'estilos', '["funk"]', '--motivo', 'teste'], { env, log: l }), 0);
    assert.equal(await main(['corrigir', id, 'produtora', 'Coletivo Solto'], { env, log: l }), 0, 'texto fora de JSON vale como texto');
    assert.equal(await main(['corrigir', id, 'inventado', '1'], { env, log: l }), 1);
    assert.match(saida(), /campo desconhecido/);
    assert.equal(await main(['corrigir', 'nao-existe', 'casa', 'X'], { env, log: l }), 1);
    assert.equal(await main(['corrigir', id], { env, log: l }), 1);
    saida();
    assert.equal(await main(['decidir', 'separa', 'paginas:p1', 'indicacao:i1'], { env, log: l }), 0);
    assert.equal(await main(['decidir', 'une', 'paginas:p1'], { env, log: l }), 1);
    assert.equal(await main(['decidir', 'une', 'paginas:p1', 'instagram:nada'], { env, log: l }), 1);
    assert.match(saida(), /não encontrado/);
    assert.equal(await main(['revisar'], { env, log: l }), 0);
    assert.match(saida(), /item\(ns\) para olho humano/);
    assert.equal(await main(['vinculos', '--revisar'], { env, log: l }), 0);
    assert.match(saida(), /1 decisão\(ões\) manual\(is\)/);
    assert.equal(await main(['ocultar', id, '--motivo', 'não é festa'], { env, log: l }), 0);
    const aberto = abrirBanco(banco);
    assert.equal(listarRegistros(aberto).length, 0);
    const f = listarRegistros(aberto, { todas: true })[0];
    assert.equal(f.casa, 'Casa Pela CLI');
    assert.deepEqual(f.estilos, ['funk']);
    assert.equal(f.produtora && f.produtora.nome, 'Coletivo Solto');
    aberto.close();
    assert.equal(await main(['ocultar', id, '--desfazer'], { env, log: l }), 0);
    assert.equal(await main(['corrigir', id, 'casa', '--desfazer'], { env, log: l }), 0);
    const de_novo = abrirBanco(banco);
    assert.equal(listarRegistros(de_novo)[0].casa, 'Casa Das Paginas');
    de_novo.close();
  });
});

test('CLI: ajuda lista os comandos desta lane; comando solto devolve 1', async () => {
  const l = logQueGuarda();
  assert.equal(await main(['ajuda'], { log: l }), 0);
  const texto = l.linhas.join('\n');
  for (const c of ['reprocessar --origem', 'revincular', 'vinculos --revisar', 'decidir une|separa', 'corrigir <festa>', 'ocultar <festa>', 'revisar', 'imagem ocultar', 'imagem listar', 'relatorio', 'expurgar', '--recuperar-instagram', '--dias <n>', '--todas']) {
    assert.ok(texto.includes(c), c);
  }
  assert.equal(await main(['nao-existe'], { env: { FINDE_BANCO: ':memory:' }, log: l }), 1);
});

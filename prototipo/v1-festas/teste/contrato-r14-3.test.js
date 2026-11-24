'use strict';
// O contrato finde-r14/3 do lado do app (U2 do plano de 24/11/2026): o app
// aceita /2 e /3, recusa /1, converte os três registros da fixture do motor e
// passa adiante, validados, os campos novos (a noite da festa, o ponto, as
// imagens, o vínculo de cada fonte, as divergências e os ids antigos). A
// conversão completa (U23) é igual a festa-r14-3-convertida.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../nucleo/reais');

const MOTOR = path.join(__dirname, '..', '..', '..', 'motor');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(MOTOR, 'teste', 'dados', 'registro-r14-3.json'), 'utf8'));
const CONVERTIDA = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', 'festa-r14-3-convertida.json'), 'utf8'));
const RESPOSTA = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', 'resposta-festas-r14-3.json'), 'utf8'));
const [COMPLETO, MINIMO, MADRUGADA] = FIXTURE.festas;
const copia = (r, extra = {}) => ({ ...structuredClone(r), ...extra });

test('/3: os três registros da fixture do motor entram, e o export /3 não gera aviso', () => {
  const r = R.converterExport(FIXTURE);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.fora, []);
  assert.deepEqual(r.festas.map((f) => f.id), FIXTURE.festas.map((f) => f.id));
  assert.equal(R.CONTRATO, 'finde-r14/3');
  assert.deepEqual(R.CONTRATOS, ['finde-r14/2', 'finde-r14/3']);
});

test('/3: a festa de 00h30 de sábado é da noite de sexta, às 24h30', () => {
  const f = R.converterRegistro(MADRUGADA).festa;
  assert.equal(MADRUGADA.data, '2026-11-28');
  assert.equal(f.data, '2026-11-27');
  assert.equal(f.dataDaNoite, '2026-11-27');
  assert.equal(f.dia, 'sex');
  assert.equal(f.diaDaSemana, 'sex');
  assert.equal(f.inicio, 24.5);
  // Uma noite que não é a data nem a véspera não vale: a conta volta a ser a
  // do motor (início antes das 6h é da noite anterior).
  const torta = R.converterRegistro(copia(MADRUGADA, { dataDaNoite: '2026-11-20' })).festa;
  assert.deepEqual([torta.data, torta.dia, torta.inicio], ['2026-11-27', 'sex', 24.5]);
});

test('/3: os campos novos passam validados', () => {
  const f = R.converterRegistro(COMPLETO).festa;
  assert.deepEqual(f.local, { lat: -23.56671, lng: -46.69341, precisao: 'rua', origemGeo: 'pagina', lugar: 'casa-exemplo', atribuicaoOsm: false });
  assert.deepEqual(f.imagens.map((i) => [i.arquivo, i.miniatura]), [['/imagens/0123456789abcdef-1080.webp', '/imagens/0123456789abcdef-480.webp']]);
  assert.deepEqual(f.imagens, CONVERTIDA.festa.imagens);
  assert.deepEqual(f.divergencias, CONVERTIDA.festa.divergencias);
  assert.deepEqual(f.idsAntigos, ['noite-exemplo-20261205-c3d4']);
  assert.deepEqual(f.fontes, CONVERTIDA.festa.fontes);
  assert.equal(f.fontes[0].vinculo.regra, 'escore');
  assert.equal(f.fontes[1].vinculo.regra, 'nova');
  assert.deepEqual([f.endereco.cidadeOrigem, f.endereco.cep, f.endereco.lugar], ['fonte', '05400-000', 'casa-exemplo']);
  // O cartaz é a imagem principal, servida pelo app em /imagens/ (U23, U24).
  assert.deepEqual(f.cartaz, CONVERTIDA.festa.cartaz);
  assert.ok(Object.isFrozen(f.imagens[0]) && Object.isFrozen(f.local));
});

test('/3 (U23): o registro completo sai igual a festa-r14-3-convertida.json', () => {
  const r = R.converterExport(FIXTURE);
  const f = r.festas.find((x) => x.id === CONVERTIDA.registro);
  assert.deepEqual(JSON.parse(JSON.stringify(f)), CONVERTIDA.festa);
  // Sem o envelope, a festa não sabe de quando é a lista.
  assert.equal(R.converterRegistro(COMPLETO).festa.atualizadoEm, null);
  // O resumo do export para "Atualizado há… · N festas lidas de…".
  assert.deepEqual(R.resumoDoExport(FIXTURE), { atualizadoEm: '2026-11-26T09:05:00-03:00', total: 3, perfis: 0, sites: 1 });
  assert.deepEqual(R.resumoDoExport({ ...FIXTURE, perfis: 50, sites: 3 }).perfis, 50);
});

test('/3 (U23): Primavera com a cidade pelo cadastro da casa entra; a mínima entra sem ponto nem imagem', () => {
  const casa = copia(COMPLETO, { endereco: { ...COMPLETO.endereco, cidadeOrigem: 'casa' } });
  assert.equal(R.converterRegistro(casa).festa.endereco.cidadeOrigem, 'casa');
  const m = R.converterRegistro(MINIMO).festa;
  assert.deepEqual([m.local, m.cartaz, m.imagens, m.bairroNome, m.avaliacaoIdade], [null, null, [], null, null]);
  assert.deepEqual(m.encontradaEm, ['indicacao']);
  // encontradaEm deixa de fora quem só leu ou corrigiu.
  const lido = copia(MINIMO, { fontes: [...MINIMO.fontes, { id: 'claude', nome: 'Leitura', url: null, conferidoEm: MINIMO.coletadoEm }, { id: 'curadoria', nome: 'Curadoria', url: null, conferidoEm: MINIMO.coletadoEm }] });
  assert.deepEqual(R.converterRegistro(lido).festa.encontradaEm, ['indicacao']);
});

test('/3: imagem fora do padrão, ponto fora de São Paulo e vínculo sem regra conhecida caem', () => {
  const ruim = copia(COMPLETO, {
    imagens: [
      { ...COMPLETO.imagens[0], arquivo: '../segredo.webp' },
      { ...COMPLETO.imagens[0], id: 'ZZZZ', arquivo: 'imagens/ZZZZ-1080.webp' },
      { ...COMPLETO.imagens[0], origem: 'http://inseguro.example/x' },
    ],
    endereco: { ...COMPLETO.endereco, lat: -22.9, lng: -43.2 },
    fontes: [{ ...COMPLETO.fontes[0], vinculo: { regra: 'qualquer', sinais: [] } }],
  });
  const f = R.converterRegistro(ruim).festa;
  assert.equal(f.imagens.length, 1);
  assert.equal(f.imagens[0].origem, null);
  assert.equal(f.local, null);
  assert.equal('vinculo' in f.fontes[0], false);
});

test('/2 continua entrando sem os campos novos; /1 é recusado', () => {
  const dois = copia(MINIMO, { contrato: 'finde-r14/2' });
  for (const k of ['dataDaNoite', 'imagens', 'cartaz', 'divergencias', 'idsAntigos', 'revisar']) delete dois[k];
  for (const fo of dois.fontes) delete fo.vinculo;
  const f = R.converterRegistro(dois).festa;
  assert.equal(f.id, MINIMO.id);
  // A mesma forma do /3, sem ponto nem imagem.
  assert.equal(f.local, null);
  assert.deepEqual(f.imagens, []);
  assert.equal('vinculo' in f.fontes[0], false);
  assert.deepEqual(R.converterExport({ contrato: 'finde-r14/2', festas: [dois] }).avisos, []);
  assert.match(R.converterRegistro(copia(MINIMO, { contrato: 'finde-r14/1' })).motivo, /^export antigo/);
  const um = R.converterExport({ contrato: 'finde-r14/1', festas: [copia(MINIMO, { contrato: 'finde-r14/1' })] });
  assert.deepEqual(um.festas, []);
  assert.match(um.avisos.join(' '), /finde-r14\/1 recusado/);
  assert.match(R.converterExport({ contrato: 'finde-r14/9', festas: [] }).avisos.join(' '), /esperava "finde-r14\/2" ou "finde-r14\/3"/);
});

test('fixtures do app: a festa convertida e a resposta têm a forma combinada', () => {
  const f = CONVERTIDA.festa;
  for (const k of ['local', 'imagens', 'cartaz', 'encontradaEm', 'horarioIncerto', 'esgotado', 'precoConferidoEm', 'bairroNome', 'regiao',
    'diaDaSemana', 'divergencias', 'idsAntigos', 'dataDaNoite', 'avaliacaoIdade', 'atualizadoEm']) assert.ok(k in f, k);
  assert.deepEqual(f.cartaz, f.imagens[0]);
  assert.ok(!f.encontradaEm.some((x) => ['claude', 'regras', 'curadoria', 'avaliacoes'].includes(x)));
  for (const caso of [RESPOSTA.comReais, RESPOSTA.semReais]) {
    for (const k of ['opcoes', 'maisDoDia', 'outrosDias', 'exemplos', 'aviso', 'nota', 'base', 'semMedia']) assert.ok(k in caso, k);
    for (const o of [...caso.opcoes, ...caso.maisDoDia]) {
      assert.equal(o.exemplo, false);
      assert.equal(typeof o.pct, 'number');
      assert.ok('distanciaKm' in o && Array.isArray(o.porque.cabe) && Array.isArray(o.porque.falta));
    }
    for (const o of caso.exemplos) {
      assert.equal(o.exemplo, true);
      assert.equal('pct' in o, false);
    }
  }
  assert.deepEqual(RESPOSTA.comReais.exemplos, []);
  assert.deepEqual(RESPOSTA.semReais.opcoes, []);
});

// O export real reexportado em /3 (do retrato do banco de 24/11, fora do git):
// toda festa que o /2 aceitava e que o /3 ainda traz continua aceita, e o /3
// aceita mais (sem início, esgotada e qualquer dia entram marcadas). O funil
// por motivo vai para o log do teste. Sem o retrato na máquina, pula.
const RETRATO = path.join(MOTOR, 'var', 'finde-antes-r3.sqlite3');
const EXPORT_2 = path.join(MOTOR, 'var', 'festas-r14.json');
test('/3: o export atual reexportado em /3 aceita o que o /2 aceitava, e mais', { skip: !(fs.existsSync(RETRATO) && fs.existsSync(EXPORT_2)) && 'sem o retrato do banco real nesta máquina' }, (t) => {
  const { abrirBanco } = require(path.join(MOTOR, 'nucleo', 'banco'));
  const { listarRegistros, VERSAO_CONTRATO } = require(path.join(MOTOR, 'nucleo', 'contrato'));
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-r3-'));
  const copiaDb = path.join(pasta, 'copia.sqlite3');
  const origem = abrirBanco(RETRATO, { readOnly: true });
  origem.exec(`VACUUM INTO '${copiaDb.replace(/'/g, "''")}'`);
  origem.close();
  const db = abrirBanco(copiaDb);
  try {
    const antigo = JSON.parse(fs.readFileSync(EXPORT_2, 'utf8'));
    const de = antigo.festas.map((f) => f.data).filter(Boolean).sort()[0];
    const novo = { contrato: VERSAO_CONTRATO, festas: listarRegistros(db, { de }) };
    const noTres = new Set(novo.festas.map((f) => f.id));
    const a = R.converterExport(antigo).festas.map((f) => f.id).filter((id) => noTres.has(id));
    const conv = R.converterExport(novo);
    const b = new Set(conv.festas.map((f) => f.id));
    assert.ok(a.length > 0);
    for (const id of a) assert.ok(b.has(id), id);
    const funil = {};
    for (const x of conv.fora) funil[x.motivo] = (funil[x.motivo] || 0) + 1;
    t.diagnostic(`/3: ${conv.festas.length} de ${novo.festas.length} aceitas; fora: ${JSON.stringify(funil)}`);
  } finally {
    db.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('/3: título de plataforma com mais de 80 caracteres entra encurtado, sem perder a festa', () => {
  const comSeparador = R.converterRegistro(copia(COMPLETO, { nome: 'Noite Exemplo APRESENTA: DJ Fictício @ Casa Exemplo | Domingo 13.12 (ATRAÇÃO Internacional' }));
  assert.ok(comSeparador.festa, comSeparador.motivo);
  assert.equal(comSeparador.festa.nome, 'Noite Exemplo APRESENTA: DJ Fictício @ Casa Exemplo');
  const semSeparador = R.converterRegistro(copia(COMPLETO, { nome: 'Fulano e convidados numa festa de domingo à tarde com vivências de conexão e paz interior no jardim' }));
  assert.ok(semSeparador.festa, semSeparador.motivo);
  assert.ok(semSeparador.festa.nome.length <= 80);
  assert.ok(semSeparador.festa.nome.endsWith('…'));
  assert.ok(!/\s…$/.test(semSeparador.festa.nome));
  assert.equal(R.converterRegistro(copia(COMPLETO, { nome: '   ' })).motivo, 'sem nome');
});

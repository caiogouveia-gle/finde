'use strict';
// As interfaces que a fundação fixou (U4 do plano de 24/11/2026; KTD19): cada
// lane trabalha contra estes nomes exportados, sem editar o arquivo da outra.
// Confere nomes e tipos, não a aridade (que falha com parâmetro padrão ou
// desestruturado). Nome que sumiu quebra aqui antes de quebrar a ligação.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { novoBanco, relogio, logMudo, fetchQueLanca } = require('./ajuda');

const MODULOS = {
  '../nucleo/banco': { abrirBanco: 'function', transacao: 'function', migrar: 'function', parEmOrdem: 'function', VERSAO_ESQUEMA: 'number' },
  '../nucleo/catalogo': { PRIORIDADE: 'object', PRIORIDADE_CAMPO: 'object', prioridade: 'function', NOME_FONTE: 'object', CAMPOS: 'object', ORIGENS_IDADE: 'object', TIPOS_EVENTO: 'object' },
  '../nucleo/contrato': { montarRegistro: 'function', listarRegistros: 'function', escolher: 'function', precoAPartirDe: 'function', paraSP: 'function', dataDaNoite: 'function', VERSAO_CONTRATO: 'string' },
  '../nucleo/coleta': { executar: 'function', travar: 'function', precisaClassificar: 'function' },
  '../nucleo/agregar': { vincular: 'function', gravarValores: 'function', jaccard: 'function', linkComparavel: 'function' },
  '../nucleo/normalizar': { normalizarItem: 'function', novoId: 'function', slug: 'function' },
  '../nucleo/classificar': { criarClassificador: 'function', criarClienteClaude: 'function', porRegras: 'function' },
  '../nucleo/correlacao': { escore: 'function', passada: 'function', resolverId: 'function', VERSAO: 'string' },
  '../nucleo/lugares': { carregarLugares: 'function', acharLugar: 'function', casaCanonica: 'function', lugarPorId: 'function' },
  '../nucleo/geocodificar': { criarGeocodificador: 'function' },
  '../nucleo/imagens': {
    baixar: 'function', prepararPeloWorker: 'function', registrarDoItem: 'function', processarPendentes: 'function', imagensDaFesta: 'function',
    imagensDoItem: 'function', escolherPrincipal: 'function', distancia: 'function', ocultar: 'function', limparImagens: 'function',
    caminhoSeguro: 'function', guardarTemporario: 'function',
  },
  '../nucleo/reprocessar': { reprocessar: 'function', revincular: 'function' },
  '../nucleo/curadoria': { corrigir: 'function', ocultar: 'function', decidir: 'function', listarRevisao: 'function' },
  '../nucleo/relatorio': { relatorio: 'function', formatar: 'function' },
  '../nucleo/expurgar': { expurgar: 'function' },
  '../fontes/curadoria': { id: 'string', aplicar: 'function' },
  '../fontes/avaliacoes': { id: 'string', aplicar: 'function' },
  '../fontes': { CONECTORES: 'object', FONTES_DE_FESTA: 'object', fontesLigadas: 'function', fontesDeFesta: 'function', descreverFontes: 'function', lerConfig: 'function' },
  './ajuda': { novoBanco: 'function', fetchQueLanca: 'function', fetchFalso: 'function', claudeFalso: 'function', relogio: 'function' },
};

for (const [mod, nomes] of Object.entries(MODULOS)) {
  test(`interface: ${mod.replace('../', '')}`, () => {
    const m = require(mod);
    for (const [nome, tipo] of Object.entries(nomes)) assert.equal(typeof m[nome], tipo, `${mod}.${nome}`);
  });
}

test('interface: valores fixos (versões, campos novos, prioridades)', () => {
  assert.equal(require('../nucleo/correlacao').VERSAO, 'vinculo/2');
  assert.equal(require('../nucleo/contrato').VERSAO_CONTRATO, 'finde-r14/3');
  assert.equal(require('../nucleo/banco').VERSAO_ESQUEMA, 3);
  const C = require('../nucleo/catalogo');
  for (const c of ['tipo', 'geo', 'bairroDaCasa', 'idPlataforma', 'oculta']) assert.ok(C.CAMPOS.includes(c), c);
  assert.equal(C.CAMPOS.includes('cartaz'), false);
  assert.equal(C.PRIORIDADE.curadoria, 110);
  assert.equal(C.PRIORIDADE.avaliacoes, 90);
  assert.equal(C.prioridade('ehFesta', 'instagram'), 80);
  assert.equal(C.prioridade('ehFesta', 'shotgun-apify'), 20);
  assert.equal(C.prioridade('geo', 'nominatim'), 30);
  assert.equal(C.prioridade('nome', 'instagram'), C.PRIORIDADE.instagram);
  assert.equal(C.NOME_FONTE.nominatim, 'OpenStreetMap');
  assert.deepEqual(Object.keys(require('../fontes').FONTES_DE_FESTA).sort(), ['avaliacoes', 'curadoria']);
  assert.deepEqual(require('../fontes').fontesDeFesta({ avaliacoes: { ligada: false } }).map((f) => f.id), ['curadoria']);
});

test('esqueletos: o que já funciona funciona', () => {
  const L = require('../nucleo/lugares');
  assert.deepEqual(L.casaCanonica('Casa de Francisca - Porão', []), { id: null, espaco: 'porao', chave: 'casa de francisca' });
  assert.deepEqual(L.casaCanonica('Casa de Francisca (Sala B)', []), { id: null, espaco: 'sala-b', chave: 'casa de francisca' });
  assert.equal(L.casaCanonica('Terraço Exemplo', []).espaco, 'terraco');
  assert.equal(L.casaCanonica('Casa Exemplo', []).espaco, null);
  assert.equal(L.acharLugar({ casa: 'Casa Exemplo' }, []), null);
  const I = require('../nucleo/imagens');
  assert.equal(I.distancia('ffffffffffffffff', '0000000000000000'), 64);
  assert.equal(I.distancia('0f', '0e'), 1);
  assert.equal(I.distancia('0f', null), null);
  assert.equal(I.caminhoSeguro('0123456789abcdef-480.webp'), '0123456789abcdef-480.webp');
  for (const ruim of ['../x', '0123456789abcdef-720.webp', '0123456789ABCDEF-480.webp', '0123456789abcdef-480.webp/..']) assert.equal(I.caminhoSeguro(ruim), null, ruim);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-img-'));
  const c = I.guardarTemporario(dir, Buffer.from('bytes de teste'));
  assert.equal(path.dirname(c), path.join(dir, 'tmp'));
  assert.equal(fs.readFileSync(c, 'utf8'), 'bytes de teste');
  assert.equal(I.guardarTemporario(dir, Buffer.from('bytes de teste')), c);
  fs.rmSync(dir, { recursive: true, force: true });
  const db = novoBanco();
  const K = require('../nucleo/correlacao');
  db.prepare("INSERT INTO festas_alias (antigo, novo, quando) VALUES ('a', 'b', 't'), ('b', 'c', 't'), ('x', 'y', 't'), ('y', 'x', 't')").run();
  assert.equal(K.resolverId(db, 'a'), 'c');
  assert.equal(K.resolverId(db, 'c'), 'c');
  assert.equal(K.resolverId(db, 'nunca-vista'), 'nunca-vista');
  assert.ok(['x', 'y'].includes(K.resolverId(db, 'x'))); // ciclo não trava
  assert.equal(K.escore({}, {}).decisao, 'separa');
});

test('classificar: false desliga o classificador inteiro (nem Claude, nem cache, nem regras)', async () => {
  const { criarClassificador } = require('../nucleo/classificar');
  const c = criarClassificador({ db: novoBanco(), classificar: false, log: logMudo });
  const r = await c.classificar({ nome: 'Festa', texto: 'house e disco a noite toda' });
  assert.equal(r.resultado, null);
  assert.equal(c.podeGastar(0.01), 'classificador desligado');
  assert.equal(c.resumo().regras, 0);
});

test('executar passa pelos quatro tempos sem rede e sem efeito novo', async () => {
  const { executar } = require('../nucleo/coleta');
  const imagens = require('../nucleo/imagens');
  const correlacao = require('../nucleo/correlacao');
  const geocodificar = require('../nucleo/geocodificar');
  const db = novoBanco();
  const f = fetchQueLanca();
  const chamados = [];
  const orig = { pp: imagens.processarPendentes, pa: correlacao.passada, cg: geocodificar.criarGeocodificador };
  imagens.processarPendentes = async (d, pendentes, ctx) => {
    chamados.push(['tempo2-imagens', pendentes.length, typeof ctx.batimento]);
    return orig.pp(d, pendentes, ctx);
  };
  geocodificar.criarGeocodificador = (o) => {
    const g = orig.cg(o);
    return { ...g, localizar: async (e) => { chamados.push(['tempo2-geo', e.texto]); return g.localizar(e); } };
  };
  correlacao.passada = (d, o) => {
    chamados.push(['tempo3', o.festasTocadas.length]);
    return orig.pa(d, o);
  };
  const deFesta = ['curadoria', 'avaliacoes'].map((id) => ({ id, aplicar: async (o) => { chamados.push(['tempo4', id, o.festasTocadas.length]); return { gravados: 0, avisos: [] }; } }));
  const fonte = {
    id: 'indicacao',
    async coletar() {
      return { itens: [{
        idExterno: 'teste:1',
        bruto: { nome: 'Festa de Teste', data: '2026-11-28', inicio: '23:00', casa: 'Casa Exemplo', endereco: 'Rua Exemplo, 10 - Pinheiros, São Paulo - SP' },
        imagens: [{ caminho: '/caminho/que/nao/existe', papel: 'cartaz-indicado', origem: 'https://ingressos.example/e', credito: 'Exemplo' }],
        texto: 'house e disco', categorias: ['festa'],
      }] };
    },
  };
  try {
    const r = await executar({
      db, fontes: [fonte], fetch: f, agora: relogio(), log: logMudo, claude: null, apify: null, classificar: false, fontesDeFesta: deFesta,
      config: { imagens: { ligada: true }, geocodificacao: { ligada: true } },
    });
    assert.equal(r.erro, undefined);
    assert.deepEqual(chamados, [
      ['tempo2-imagens', 1, 'function'],
      ['tempo2-geo', 'Rua Exemplo, 10 - Pinheiros, São Paulo - SP'],
      ['tempo3', 1],
      ['tempo4', 'curadoria', 1],
      ['tempo4', 'avaliacoes', 1],
    ]);
    // O único pedido tentado é a consulta do Nominatim do tempo 2, ao fetch que lança: nada sai da
    // máquina e nada é guardado (o "não achou" só é guardado com resposta de verdade).
    assert.ok(f.chamadas.every((u) => String(u).startsWith('https://nominatim.openstreetmap.org/search?')), JSON.stringify(f.chamadas));
    // Sem efeito novo: nada de imagem, geo, nominatim, candidato, apelido ou classificação.
    for (const t of ['imagens', 'imagens_item', 'geocodificacoes', 'candidatos', 'festas_alias', 'classificacoes', 'uso_llm', 'uso_apify']) {
      assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM valores WHERE fonte IN ('nominatim', 'claude', 'regras')").get().n, 0);
    // O contexto do item fica fora do hash, e o batimento andou.
    assert.deepEqual(JSON.parse(db.prepare('SELECT contexto FROM itens_brutos').get().contexto), { texto: 'house e disco', categorias: ['festa'] });
    assert.ok(db.prepare('SELECT atualizado_em FROM execucoes').get().atualizado_em);
    assert.deepEqual(Object.keys(r.fontesDeFesta), ['curadoria', 'avaliacoes']);
  } finally {
    imagens.processarPendentes = orig.pp;
    correlacao.passada = orig.pa;
    geocodificar.criarGeocodificador = orig.cg;
  }
});

test('executar com o config padrão ({}) deixa o tempo 2 desligado', async () => {
  const { executar } = require('../nucleo/coleta');
  const imagens = require('../nucleo/imagens');
  const orig = imagens.processarPendentes;
  let chamou = false;
  imagens.processarPendentes = async () => { chamou = true; return { avisos: [] }; };
  try {
    const fonte = { id: 'indicacao', coletar: async () => ({ itens: [{ idExterno: 't:1', bruto: { nome: 'X', data: '2026-11-28' }, imagens: [{ caminho: '/x' }] }] }) };
    const r = await executar({ db: novoBanco(), fontes: [fonte], fetch: fetchQueLanca(), agora: relogio(), log: logMudo, apify: null });
    assert.equal(chamou, false);
    assert.equal(r.imagensPendentes, 1);
  } finally {
    imagens.processarPendentes = orig;
  }
});

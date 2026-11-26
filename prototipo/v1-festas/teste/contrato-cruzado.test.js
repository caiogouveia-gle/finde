'use strict';
// A ligação motor → app com registro de verdade (U37, R38): o banco do motor
// em memória, uma execução com fontes de teste (sem rede, sem modelo), o
// listarRegistros do motor e o converterRegistro do app sobre cada registro.
// Todo campo do motor (CAMPOS) e toda chave do registro têm uma decisão aqui:
// ou chegam à festa do app, ou estão em IGNORADOS com o porquê. Campo novo no
// motor sem decisão faz este teste falhar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOTOR = path.join(__dirname, '..', '..', '..', 'motor');
const { executar } = require(path.join(MOTOR, 'nucleo', 'coleta'));
const { listarRegistros } = require(path.join(MOTOR, 'nucleo', 'contrato'));
const { CAMPOS } = require(path.join(MOTOR, 'nucleo', 'catalogo'));
const { novoBanco, relogio, logMudo, fetchQueLanca, fonteFixa } = require(path.join(MOTOR, 'teste', 'ajuda'));
const R = require('../nucleo/reais');

// Campo do motor (CAMPOS) -> chave da festa do app que o carrega.
const CHEGA = {
  nome: 'nome',
  produtora: 'produtora',
  casa: 'casa',
  endereco: 'endereco', // e também `local`, `bairro`, `bairroNome`, `regiao`
  data: 'data',
  inicio: 'inicio',
  pistaCheia: 'esquenta',
  fim: 'fim',
  lotes: 'lotes', // e o `preco`
  entradaNaPorta: 'entradaNaPorta',
  linkCompra: 'linkCompra',
  linkEvento: 'linkEvento',
  instagram: 'instagram',
  lineup: 'lineup',
  estilos: 'estilos',
  idadeMinima: 'idadeMinima',
  regras: 'regras',
  geo: 'local', // a coordenada vem dentro de `endereco` no registro e vira `local` no app
  exemplo: 'exemplo',
};

// Campo do motor que o app não carrega, com o porquê.
const IGNORADOS = {
  ehFesta: 'é corte: festa com ehFesta false não entra (converterRegistro)',
  oculta: 'é corte: a festa oculta pela curadoria não entra',
  tipo: 'só vai ao registro em classificacao.tipo; o app não mostra',
  bairroDaCasa: 'o motor o põe em endereco.bairro quando nenhuma fonte deu bairro',
  idPlataforma: 'só a correlação usa (KTD3)',
  mediaIdade: 'a média de idade saiu do app em 26/11/2026, até a idade do público ser validada; o conversor a descarta',
};

// Chave do registro /3 que o app não carrega, com o porquê.
const REGISTRO_IGNORADO = {
  pistaCheia: 'vira `esquenta` (em horas do app)',
  mediaIdade: 'a média de idade saiu do app em 26/11/2026; o conversor a descarta',
  ehFesta: 'é corte: só entra o registro com ehFesta diferente de false',
  contrato: 'o envelope e o conversor conferem o contrato',
  dataDaNoite: 'vira `data` e `dataDaNoite` (o dia é o da noite)',
  precoAPartirDe: 'o app refaz a conta com os lotes (vira `preco`)',
  classificacao: 'o app lê só `estilosInferidos` a partir dela e de campos',
  revisar: 'é para olho humano no motor; o app ignora (KTD1)',
};

const ITEM = {
  idExterno: 'teste:cruzado-1',
  bruto: {
    nome: 'Noite Cruzada', data: '2026-12-05', inicio: '23:00', fim: '05:00', pistaCheia: '01:00',
    casa: 'Casa Cruzada', endereco: 'Rua Exemplo, 100 - Pinheiros, São Paulo - SP', cep: '05400-000', cidade: 'São Paulo', uf: 'SP',
    geo: { lat: -23.5665, lng: -46.6912, precisao: 'casa' },
    lotes: [{ nome: '1º lote', preco: 40, disponivel: true }], entradaNaPorta: { preco: 60 },
    linkCompra: 'https://ingressos.example/evento/noite-cruzada', linkEvento: 'https://ingressos.example/evento/noite-cruzada',
    instagram: '@coletivo.cruzado', produtora: { nome: 'Coletivo Cruzado', instagram: '@coletivo.cruzado' },
    lineup: ['DJ Um', 'DJ Dois'], estilos: ['house-disco'], idadeMinima: 18, regras: { lista: true },
    ehFesta: true, tipo: 'festa', idPlataforma: 'sympla:999999',
    paginas: [{ tipo: 'ingresso', nome: 'Ingressos', url: 'https://ingressos.example/evento/noite-cruzada', lidoEm: '2026-11-10T14:00:00.000Z', campos: ['nome', 'data', 'lotes'] }],
  },
  texto: 'house e disco a noite toda', categorias: ['festa'],
};
// A mesma festa vista por outra fonte, pelo mesmo link: vira uma festa com duas fontes.
const DA_PAGINA = {
  idExterno: 'pagina:noite-cruzada',
  bruto: {
    nome: 'Noite Cruzada', data: '2026-12-05', inicio: '23:00', casa: 'Casa Cruzada', cidade: 'São Paulo',
    lotes: [{ nome: '1º lote', preco: 45, disponivel: true }],
    linkCompra: 'https://ingressos.example/evento/noite-cruzada', linkEvento: 'https://ingressos.example/evento/noite-cruzada', ehFesta: true,
    paginas: [{ tipo: 'ingresso', nome: 'Ingressos', url: 'https://ingressos.example/evento/noite-cruzada', lidoEm: '2026-11-10T14:30:00.000Z', campos: ['nome', 'lotes'] }],
  },
};

async function registros() {
  const db = novoBanco();
  const r = await executar({
    db, fontes: [fonteFixa('indicacao', [ITEM]), fonteFixa('paginas', [DA_PAGINA])], fetch: fetchQueLanca(), agora: relogio(),
    log: logMudo, claude: null, apify: null, classificar: false, config: {},
  });
  assert.equal(r.erro, undefined);
  return listarRegistros(db);
}

test('todo campo do motor tem decisão no app: chega à festa ou está em IGNORADOS com o porquê', () => {
  const semDecisao = CAMPOS.filter((c) => !(c in CHEGA) && !(c in IGNORADOS));
  assert.deepEqual(semDecisao, [], `campo novo no motor sem decisão no app: ${semDecisao.join(', ')}`);
  const sobrando = [...Object.keys(CHEGA), ...Object.keys(IGNORADOS)].filter((c) => !CAMPOS.includes(c));
  assert.deepEqual(sobrando, [], `decisão sobre campo que o motor já não tem: ${sobrando.join(', ')}`);
  for (const [c, porque] of Object.entries(IGNORADOS)) assert.ok(porque.length > 10, c);
});

test('o registro montado pelo motor passa pelo conversor do app, e cada chave dele chega ou é ignorada', async () => {
  const regs = await registros();
  assert.equal(regs.length, 1, 'as duas fontes viram uma festa');
  const reg = regs[0];
  assert.equal(reg.contrato, R.CONTRATO);
  assert.deepEqual(reg.fontes.map((f) => f.id).sort(), ['indicacao', 'paginas']);
  const { festa, motivo } = R.converterRegistro(reg, { geradoEm: '2026-11-10T15:00:00.000Z' });
  assert.equal(motivo, undefined);
  assert.ok(festa && festa.real === true);
  for (const k of Object.keys(reg)) {
    assert.ok(k in festa || k in REGISTRO_IGNORADO, `chave do registro sem decisão no app: ${k}`);
  }
  for (const [c, chave] of Object.entries(CHEGA)) assert.ok(chave in festa, `${c} -> ${chave}`);
});

test('os valores atravessam: dia da noite, horas, preço, local com ponto, bairro, fontes e o motivo da junção', async () => {
  const [reg] = await registros();
  const { festa } = R.converterRegistro(reg, { geradoEm: '2026-11-10T15:00:00.000Z' });
  assert.equal(festa.data, '2026-12-05');
  assert.equal(festa.dia, 'sab');
  assert.equal(festa.inicio, 23);
  assert.equal(festa.fim, 29);
  assert.equal(festa.esquenta, 25);
  assert.equal(festa.preco, 45); // os lotes da página (72) vencem os da indicação (70), PRIORIDADE do motor
  assert.equal(festa.bairro, 'pinheiros');
  assert.equal(festa.endereco.cidade, 'São Paulo');
  assert.equal(festa.local.precisao, 'casa');
  assert.ok(Math.abs(festa.local.lat - -23.5665) < 1e-4 && Math.abs(festa.local.lng - -46.6912) < 1e-4);
  assert.deepEqual(festa.lineup, ['DJ Um', 'DJ Dois']);
  assert.deepEqual(festa.estilos, ['house-disco']);
  assert.equal(festa.produtora, 'Coletivo Cruzado');
  assert.equal(festa.linkCompra, 'https://ingressos.example/evento/noite-cruzada');
  assert.deepEqual([...festa.encontradaEm].sort(), ['indicacao', 'paginas']);
  const daPagina = festa.fontes.find((f) => f.id === 'paginas');
  assert.ok(daPagina.vinculo && ['link', 'escore'].includes(daPagina.vinculo.regra), JSON.stringify(daPagina.vinculo));
  // Indicação R$ 40 e página R$ 45: a divergência de preço chega ao app.
  assert.ok(festa.divergencias.some((d) => d.campo === 'precoAPartirDe'), JSON.stringify(festa.divergencias));
  assert.equal(festa.atualizadoEm, '2026-11-10T12:00:00-03:00');
});

test('as festas que o motor corta não chegam: oculta e fora de São Paulo', async () => {
  const db = novoBanco();
  const fora = { idExterno: 'teste:rio', bruto: { ...ITEM.bruto, nome: 'Noite do Rio', linkCompra: 'https://ingressos.example/evento/rio', linkEvento: null, idPlataforma: null, endereco: 'Rua Exemplo, 1 - Botafogo, Rio de Janeiro - RJ', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '22250-040', geo: null, casa: 'Casa Carioca', paginas: [] } };
  await executar({ db, fontes: [fonteFixa('indicacao', [ITEM, fora])], fetch: fetchQueLanca(), agora: relogio(), log: logMudo, claude: null, apify: null, classificar: false, config: {} });
  assert.deepEqual(listarRegistros(db).map((r) => r.nome), ['Noite Cruzada']);
  const todas = listarRegistros(db, { todas: true });
  const rio = todas.find((r) => r.nome === 'Noite do Rio');
  assert.ok(rio);
  assert.match(R.converterRegistro(rio).motivo, /fora de São Paulo/);
  require(path.join(MOTOR, 'nucleo', 'curadoria')).ocultar(db, { festaId: listarRegistros(db)[0].id, motivo: 'teste' });
  assert.equal(listarRegistros(db).length, 0);
  const oculta = listarRegistros(db, { todas: true }).find((r) => r.nome === 'Noite Cruzada');
  assert.equal(R.converterRegistro(oculta).motivo, 'oculta pela curadoria');
});

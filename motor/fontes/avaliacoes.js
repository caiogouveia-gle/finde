'use strict';
// A fonte de festa `avaliacoes` (D3, KTD4 tempo 4, KTD13 do plano de 24/11/2026):
// grava `mediaIdade` com `origem: 'avaliacoes'`, `avaliacoes`, `naMedida`,
// `faixa` e `convites` quando a festa tem pelo menos 5 respostas com idade de
// pelo menos 2 convites (config: minimo, minimoConvites). Grava direto em
// valores pelo id da festa (resolvido por festas_alias).
//
// As respostas chegam do app por POST /api/avaliacoes (servidor.js) e ficam em
// `avaliacoes`, sem nome: a chave e o aparelho já vêm como HMAC. Resposta sem
// idade (18 a 60) não conta. `valor` é a média das idades de quem respondeu e
// nunca é mostrado sozinho como "média do público": o que a pergunta mede é
// `naMedida` (a proporção de "da minha idade") dentro da `faixa` de idades.

const { transacao } = require('../nucleo/banco');
const { gravarValores } = require('../nucleo/agregar');
const { resolverId } = require('../nucleo/correlacao');

const id = 'avaliacoes';
const nome = 'Avaliações de quem foi';

const IDADE_MIN = 18;
const IDADE_MAX = 60;
const MINIMO = 5;
const MINIMO_CONVITES = 2;

const idadeValida = (n) => Number.isInteger(n) && n >= IDADE_MIN && n <= IDADE_MAX;
const arredondar = (x, casas) => Math.round(x * 10 ** casas) / 10 ** casas;

// calcular(linhas, { minimo, minimoConvites }) -> mediaIdade | null
// linhas: [{ chave, plano, resposta, idade }] de uma festa. Só conta resposta
// com idade válida; a mesma chave duas vezes conta uma.
function calcular(linhas, { minimo = MINIMO, minimoConvites = MINIMO_CONVITES } = {}) {
  const porChave = new Map();
  for (const l of linhas || []) {
    if (!l || !idadeValida(l.idade) || !['mais-novo', 'na-medida', 'mais-velho'].includes(l.resposta)) continue;
    if (!porChave.has(l.chave)) porChave.set(l.chave, l);
  }
  const validas = [...porChave.values()];
  if (validas.length < minimo) return null;
  const convites = new Set(validas.map((l) => l.plano || 'sem-convite')).size;
  if (convites < minimoConvites) return null;
  const idades = validas.map((l) => l.idade);
  const naMedida = validas.filter((l) => l.resposta === 'na-medida').length / validas.length;
  return {
    valor: arredondar(idades.reduce((a, b) => a + b, 0) / idades.length, 1),
    origem: 'avaliacoes',
    avaliacoes: validas.length,
    naMedida: arredondar(naMedida, 2),
    faixa: [Math.min(...idades), Math.max(...idades)],
    convites,
  };
}

// aplicar({ db, agora, festasTocadas, config, log }) -> { gravados, avisos }
// As avaliações chegam fora da execução, então vale para todas as festas que
// têm alguma, não só as tocadas. Festa que deixou de bater o mínimo perde o
// valor (o expurgo apaga as respostas, por exemplo).
async function aplicar({ db, agora = () => new Date(), festasTocadas = [], config = {}, log = console } = {}) {
  void festasTocadas;
  void log;
  const minimo = Number.isInteger(config.minimo) ? config.minimo : MINIMO;
  const minimoConvites = Number.isInteger(config.minimoConvites) ? config.minimoConvites : MINIMO_CONVITES;
  const avisos = [];
  const quando = agora().toISOString();
  const porFesta = new Map();
  for (const l of db.prepare('SELECT chave, festa_id, plano, resposta, idade FROM avaliacoes').all()) {
    const festa = resolverId(db, l.festa_id);
    if (!porFesta.has(festa)) porFesta.set(festa, []);
    porFesta.get(festa).push(l);
  }
  const existe = db.prepare('SELECT 1 FROM festas WHERE id = ?');
  const medias = new Map();
  for (const [festa, linhas] of porFesta) {
    if (!existe.get(festa)) {
      avisos.push(`avaliações da festa ${festa}, que não existe mais, ignoradas`);
      continue;
    }
    const m = calcular(linhas, { minimo, minimoConvites });
    if (m) medias.set(festa, m);
  }
  const anteriores = db.prepare("SELECT DISTINCT festa_id FROM valores WHERE fonte = 'avaliacoes' AND campo = 'mediaIdade'").all().map((r) => r.festa_id);
  let gravados = 0;
  transacao(db, () => {
    for (const [festa, m] of medias) {
      gravarValores(db, festa, 'avaliacoes', { mediaIdade: m }, quando);
      gravados += 1;
    }
    for (const festa of anteriores) if (!medias.has(festa) && existe.get(festa)) gravarValores(db, festa, 'avaliacoes', {}, quando);
  });
  return { gravados, avisos };
}

module.exports = { id, nome, deFesta: true, aplicar, calcular, IDADE_MIN, IDADE_MAX };

'use strict';
// A fonte de festa `curadoria` (D7, KTD4 tempo 4, KTD12 do plano de 24/11/2026):
// a cada execução e no reprocessar, regrava numa chamada só todos os campos
// ativos de cada festa corrigida (gravarValores apaga o que a fonte não
// trouxer), e lê entrada/curadoria.json (fora do git; no Fly, o arquivo que
// FINDE_CURADORIA_LOTE aponta no volume) para correções em lote.
// Grava direto em valores pelo id da festa (resolvido por festas_alias), sem
// passar por normalizarItem nem vincular.
//
// entrada/curadoria.json: uma lista de { festa, campo, valor, motivo? }. Cada
// linha entra uma vez na tabela curadoria (a mesma festa, campo e valor já
// ativos não se repetem); depois, quem manda é a tabela.

const fs = require('node:fs');
const path = require('node:path');
const { regravar, corrigir } = require('../nucleo/curadoria');
const { resolverId } = require('../nucleo/correlacao');

const id = 'curadoria';
const nome = 'Curadoria do Finde';

const RAIZ = path.join(__dirname, '..');

// Lê o arquivo de lote; ausente não é erro. Devolve { linhas, avisos }.
function lerLote(arquivo, avisos) {
  if (!arquivo || !fs.existsSync(arquivo)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const linhas = Array.isArray(j) ? j : j && Array.isArray(j.correcoes) ? j.correcoes : null;
    if (!linhas) throw new Error('esperava uma lista de { festa, campo, valor }');
    return linhas;
  } catch (e) {
    avisos.push(`${path.basename(arquivo)}: ${e.message}`);
    return [];
  }
}

// importarLote(db, linhas, { agora, avisos }) -> quantas entraram
function importarLote(db, linhas, { agora = () => new Date(), avisos = [] } = {}) {
  let novas = 0;
  for (const [i, l] of linhas.entries()) {
    if (!l || typeof l !== 'object' || !l.festa || !l.campo || !('valor' in l)) {
      avisos.push(`correção ${i + 1} do lote sem festa, campo ou valor; ignorada`);
      continue;
    }
    try {
      const atual = resolverId(db, String(l.festa));
      const igual = db.prepare('SELECT id, festa_id FROM curadoria WHERE campo = ? AND valor = ? AND ativa = 1').all(l.campo, JSON.stringify(l.valor))
        .some((x) => resolverId(db, x.festa_id) === atual);
      if (igual) continue;
      corrigir(db, { festaId: l.festa, campo: l.campo, valor: l.valor, motivo: l.motivo || 'lote entrada/curadoria.json', agora });
      novas += 1;
    } catch (e) {
      avisos.push(`correção ${i + 1} do lote (${l.festa}.${l.campo}): ${e.message}`);
    }
  }
  return novas;
}

// aplicar({ db, agora, festasTocadas, config, log }) -> { gravados, avisos }
// Vale para todas as festas com correção ativa, não só as tocadas: a correção
// é sobre a partição final e precisa sobreviver a qualquer coleta.
// O arquivo do lote: FINDE_CURADORIA_LOTE primeiro (no Fly, o volume:
// /data/entrada/curadoria.json, porque entrada/ fica fora da imagem), depois o
// `arquivo` do config, relativo ao motor. O primeiro que existe vale.
function arquivoDoLote(config = {}, env = process.env) {
  const doConfig = config.arquivo ? (path.isAbsolute(config.arquivo) ? config.arquivo : path.join(RAIZ, config.arquivo)) : path.join(RAIZ, 'entrada', 'curadoria.json');
  const candidatos = [env.FINDE_CURADORIA_LOTE, doConfig].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c)) || candidatos[0];
}

async function aplicar({ db, agora = () => new Date(), festasTocadas = [], config = {}, log = console, env = process.env } = {}) {
  void festasTocadas;
  const avisos = [];
  const arquivo = arquivoDoLote(config, env);
  const novas = importarLote(db, lerLote(arquivo, avisos), { agora, avisos });
  if (novas) log.info(`[motor] curadoria: ${novas} correção(ões) do lote entraram`);
  const r = regravar(db, { agora });
  avisos.push(...r.avisos);
  return { gravados: r.campos, avisos };
}

module.exports = { id, nome, deFesta: true, aplicar, importarLote, arquivoDoLote };

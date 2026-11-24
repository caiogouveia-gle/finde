'use strict';
// O que o export (`cli.js exportar`) e a API (`GET /api/festas`) entregam por
// padrão (M36 do plano de 24/11/2026), num lugar só: só São Paulo e sem as
// ocultas pela curadoria; o envelope com `geradoEm` (o fim da última execução
// ok) e `execucaoId`; e o ETag da lista.

const crypto = require('node:crypto');
const { listarRegistros, VERSAO_CONTRATO } = require('./contrato');
const { semAcento } = require('./bairros');

const FUSO_MS = 3 * 3600e3; // São Paulo, sem horário de verão desde 2019
const DIAS_PARA_TRAS = 7;

// "Hoje" em America/Sao_Paulo, AAAA-MM-DD.
const hojeSP = (agora = new Date()) => new Date(agora.getTime() - FUSO_MS).toISOString().slice(0, 10);

const dataOk = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

function somarDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// `de` pedido, limitado a 7 dias antes de hoje (sem recusa: o app pede hoje − 7).
function limitarDe(de, agora = new Date()) {
  const minimo = somarDias(hojeSP(agora), -DIAS_PARA_TRAS);
  if (!de) return hojeSP(agora);
  return de < minimo ? minimo : de;
}

// A cidade confirmada e diferente de São Paulo. Cidade vazia não é "fora": o
// app decide o que fazer com a que não foi confirmada.
function foraDeSaoPaulo(r) {
  const cidade = r && r.endereco && typeof r.endereco.cidade === 'string' ? r.endereco.cidade.trim() : '';
  return Boolean(cidade) && semAcento(cidade) !== 'sao paulo';
}

// Os registros que o export e a API entregam: `todas` inclui o que não é São
// Paulo, o que a classificação diz que não é festa e o que a curadoria ocultou.
function registrosParaEntregar(db, { de = null, ate = null, todas = false, semExemplos = false, ids = null } = {}) {
  let festas = listarRegistros(db, { de, ate, todas, ids });
  if (!todas) festas = festas.filter((f) => !foraDeSaoPaulo(f));
  if (semExemplos) festas = festas.filter((f) => !f.exemplo);
  return festas;
}

// A última execução que terminou bem: de onde vêm `geradoEm` e `execucaoId`.
function ultimaExecucaoOk(db) {
  return db.prepare("SELECT id, fim FROM execucoes WHERE estado = 'ok' ORDER BY id DESC LIMIT 1").get() || null;
}

function envelope(db, festas, agora = () => new Date()) {
  const ult = ultimaExecucaoOk(db);
  return {
    contrato: VERSAO_CONTRATO,
    geradoEm: ult && ult.fim ? ult.fim : agora().toISOString(),
    execucaoId: ult ? ult.id : null,
    total: festas.length,
    festas,
  };
}

// O ETag de uma lista (M36): a execução, os filtros e uma impressão do que muda
// sem execução nova (correção da curadoria, avaliação aplicada, imagem
// ocultada). Dois pedidos sem coleta nem correção no meio dão o mesmo ETag.
function etagDaLista(db, filtros = {}) {
  const ult = ultimaExecucaoOk(db);
  const v = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(mudou_em), \'\') AS m, COALESCE(MAX(conferido_em), \'\') AS c FROM valores').get();
  const cur = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(ativa), 0) AS a FROM curadoria').get();
  const img = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(oculta), 0) AS o FROM imagens').get();
  const f = db.prepare('SELECT COUNT(*) AS n FROM festas').get();
  const base = JSON.stringify([ult ? ult.id : null, filtros, v.n, v.m, cur.n, cur.a, img.n, img.o, f.n]);
  return `"${crypto.createHash('sha256').update(base).digest('hex').slice(0, 24)}"`;
}

// O If-None-Match bate com o ETag? Aceita lista e o prefixo W/.
function etagConfere(cabecalho, etag) {
  if (!cabecalho) return false;
  return String(cabecalho).split(',').map((s) => s.trim().replace(/^W\//, '')).some((s) => s === etag || s === '*');
}

module.exports = { hojeSP, dataOk, somarDias, limitarDe, foraDeSaoPaulo, registrosParaEntregar, ultimaExecucaoOk, envelope, etagDaLista, etagConfere, DIAS_PARA_TRAS };

'use strict';
// Cliente mínimo do Apify (prova de conceito acadêmica, KTD12). Na decisão do
// Caio de 24/11/2026, o Apify fica só com o Instagram, no plano grátis.
//
// Rota assíncrona, para ter o custo real e apagar o que o coletor guardou:
//   POST   /v2/acts/<usuario~ator>/runs?waitForFinish=60   dispara, com maxItems e maxTotalChargeUsd
//   GET    /v2/actor-runs/<id>?waitForFinish=60             espera terminar (usageTotalUsd = custo real)
//   GET    /v2/datasets/<id>/items?fields=...               lê só os campos que o motor usa
//   DELETE /v2/datasets/<id>                                apaga o dataset da conta (comentários,
//                                                           marcações e seguidores não ficam lá)
// O token vai no cabeçalho, nunca na URL. Além do teto de cada chamada, há teto
// por execução e por dia (horário de São Paulo), somados em `uso_apify`.

const BASE = 'https://api.apify.com/v2';
const TERMINADOS = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

function inicioDoDiaSP(agora) {
  return `${new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10)}T03:00:00.000Z`;
}

function criarApify({
  token = process.env.APIFY_TOKEN || null,
  fetch = globalThis.fetch,
  db = null,
  execucaoId = null,
  agora = () => new Date(),
  log = console,
  tetoExecucao = Number(process.env.FINDE_TETO_APIFY_EXECUCAO_USD || 0.25),
  tetoDia = Number(process.env.FINDE_TETO_APIFY_DIA_USD || 0.25),
  esperaS = 60,
} = {}) {
  if (!token) return null;
  const gUso = db
    ? db.prepare('INSERT INTO uso_apify (execucao_id, quando, ator, itens, custo_usd, resultado) VALUES (?, ?, ?, ?, ?, ?)')
    : null;
  const qDia = db ? db.prepare('SELECT COALESCE(SUM(custo_usd), 0) AS total FROM uso_apify WHERE quando >= ?') : null;
  const cab = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let gasto = 0;

  async function pedir(caminho, op = {}) {
    const r = await fetch(`${BASE}${caminho}`, { ...op, headers: cab, signal: AbortSignal.timeout((esperaS + 30) * 1000) });
    if (!r.ok) throw new Error(`Apify respondeu ${r.status} em ${caminho.split('?')[0]}`);
    return op.method === 'DELETE' ? null : r.json();
  }

  // ator: "usuario~nome"; campos: os campos do item que o motor usa.
  async function rodar(ator, entrada, { maxItens = 100, tetoUsd = 0.1, precoPorMil = 3, timeoutS = 240, campos = null } = {}) {
    if (!/^[\w.-]+~[\w.-]+$/.test(ator)) throw new Error(`ator do Apify inválido: ${ator}`);
    const doDia = qDia ? qDia.get(inicioDoDiaSP(agora())).total : 0;
    const sobra = Math.min(tetoExecucao - gasto, tetoDia - doDia);
    if (sobra < 0.005) throw new Error(`teto do Apify atingido (execução US$ ${tetoExecucao}, dia US$ ${tetoDia})`);
    const teto = Math.min(tetoUsd, sobra);
    const q = new URLSearchParams({ timeout: String(timeoutS), maxItems: String(maxItens), maxTotalChargeUsd: teto.toFixed(4), waitForFinish: String(esperaS) });
    const quando = agora().toISOString();
    let run = null;
    let itens = [];
    let erro = null;
    try {
      run = (await pedir(`/acts/${encodeURIComponent(ator)}/runs?${q}`, { method: 'POST', body: JSON.stringify(entrada) })).data;
      const limite = Date.now() + timeoutS * 1000;
      while (run && !TERMINADOS.has(run.status) && Date.now() < limite) {
        run = (await pedir(`/actor-runs/${run.id}?waitForFinish=${esperaS}`)).data;
      }
      if (!run || run.status !== 'SUCCEEDED') throw new Error(`a rodada de ${ator} terminou como ${run ? run.status : 'desconhecida'}`);
      const qi = new URLSearchParams({ clean: 'true', format: 'json', limit: String(maxItens) });
      if (campos && campos.length) qi.set('fields', campos.join(','));
      itens = await pedir(`/datasets/${run.defaultDatasetId}/items?${qi}`);
      if (!Array.isArray(itens)) throw new Error(`Apify não devolveu uma lista para ${ator}`);
    } catch (e) {
      erro = e;
    }
    // Rodada que não terminou é cancelada na conta (não segue gastando), e o
    // custo dela conta pelo teto da chamada.
    const terminou = run && TERMINADOS.has(run.status);
    if (run && !terminou) {
      try {
        run = (await pedir(`/actor-runs/${run.id}/abort`, { method: 'POST' })).data || run;
      } catch (e) {
        log.warn(`[motor] apify: rodada de ${ator} não foi cancelada (${e.message})`);
      }
    }
    // Apaga o dataset da conta, deu certo ou não: o que o coletor trouxe além
    // dos campos usados não fica guardado lá.
    if (run && run.defaultDatasetId) {
      try {
        await pedir(`/datasets/${run.defaultDatasetId}`, { method: 'DELETE' });
      } catch (e) {
        log.warn(`[motor] apify: dataset de ${ator} não foi apagado (${e.message})`);
      }
    }
    // Custo: o real da rodada quando o Apify informa; senão a estimativa, e na
    // falha o teto da chamada (pior caso), para o teto do dia não ficar frouxo.
    const real = terminou && typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null;
    const custo = real !== null ? real : erro ? teto : (itens.length * precoPorMil) / 1000;
    gasto += custo;
    if (gUso) gUso.run(execucaoId, quando, ator, itens.length, custo, erro ? 'erro' : 'ok');
    if (erro) throw erro;
    log.info(`[motor] apify ${ator}: ${itens.length} itens (US$ ${custo.toFixed(4)}${real === null ? ', estimado' : ''})`);
    return itens;
  }

  return { rodar, gastoUsd: () => Math.round(gasto * 1e6) / 1e6 };
}

module.exports = { criarApify };

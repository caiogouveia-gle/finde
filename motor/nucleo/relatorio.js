'use strict';
// Relatório para o trabalho acadêmico (M35 do plano de 24/11/2026): festas por
// fonte, festas que só o Instagram mostrou, festas com mais de uma fonte,
// candidatos, custo por festa que chega ao app, antecedência (mediana entre
// publicadoEm e a data da festa) e o funil de corte pelo conversor do app.
//
// Só lê o banco. Não chama nada pago nem a rede.

const { registrosParaEntregar } = require('./exportar');
const { VERSAO_CONTRATO } = require('./contrato');

const arredondar = (x, casas = 2) => (x === null || x === undefined ? null : Math.round(x * 10 ** casas) / 10 ** casas);

function mediana(xs) {
  if (!xs.length) return null;
  const o = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

const DIA_MS = 86400e3;
const dataValida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(`${s.slice(0, 10)}T12:00:00Z`));

// Os motivos de corte do conversor trazem o detalhe entre parênteses ("fora de
// São Paulo (Cotia)"): o funil agrupa pelo texto antes dele.
const motivoBase = (m) => String(m || 'sem motivo').replace(/\s*\(.*$/, '').trim();

// O módulo ou a função do conversor do app: aceita converterExport solto, o
// módulo nucleo/reais.js ou `{ converterExport }`.
function funcaoDoConversor(conversor) {
  if (typeof conversor === 'function') return conversor;
  if (conversor && typeof conversor.converterExport === 'function') return conversor.converterExport.bind(conversor);
  return null;
}

// relatorio(db, { desde, conversor, agora }) ->
//   { desde, festas, porFonte, soInstagram, multiFonte, candidatos, custo, antecedencia, funil }
// desde (AAAA-MM-DD) limita às festas da noite em diante e ao gasto desde então.
function relatorio(db, { desde = null, conversor = null } = {}) {
  const onde = desde ? 'WHERE COALESCE(f.data_noite, f.data) >= ?' : '';
  const args = desde ? [desde] : [];
  const festas = db.prepare(`SELECT COUNT(*) AS n FROM festas f ${onde}`).get(...args).n;

  // Fontes por festa, pelos vínculos: a fonte que trouxe o item.
  const vinculos = db.prepare(`SELECT v.festa_id AS festa, v.fonte AS fonte FROM vinculos v JOIN festas f ON f.id = v.festa_id ${onde}`).all(...args);
  const fontesDe = new Map();
  for (const v of vinculos) {
    if (!fontesDe.has(v.festa)) fontesDe.set(v.festa, new Set());
    fontesDe.get(v.festa).add(v.fonte);
  }
  const porFonte = {};
  let soInstagram = 0;
  let multiFonte = 0;
  for (const fs of fontesDe.values()) {
    for (const f of fs) porFonte[f] = (porFonte[f] || 0) + 1;
    if (fs.size === 1 && fs.has('instagram')) soInstagram += 1;
    if (fs.size > 1) multiFonte += 1;
  }

  const candidatos = db.prepare(`SELECT COUNT(*) AS n FROM candidatos c JOIN festas f ON f.id = c.festa_id ${onde}`).get(...args).n;

  // Antecedência: dias entre o post e a festa, nos itens do Instagram.
  const dias = [];
  const itens = db.prepare(`SELECT b.bruto AS bruto FROM itens_brutos b JOIN vinculos v ON v.fonte = b.fonte AND v.id_externo = b.id_externo
    JOIN festas f ON f.id = v.festa_id ${onde ? `${onde} AND` : 'WHERE'} b.fonte = 'instagram'`).all(...args);
  for (const it of itens) {
    let b;
    try {
      b = JSON.parse(it.bruto);
    } catch {
      continue;
    }
    if (!b || !dataValida(b.publicadoEm) || !dataValida(b.data)) continue;
    const post = Date.parse(`${b.publicadoEm.slice(0, 10)}T12:00:00Z`);
    const festa = Date.parse(`${b.data.slice(0, 10)}T12:00:00Z`);
    dias.push(Math.round((festa - post) / DIA_MS));
  }
  const antecedencia = dias.length ? { medianaDias: mediana(dias), amostra: dias.length, minimo: Math.min(...dias), maximo: Math.max(...dias) } : null;

  // Funil: o export padrão (só São Paulo, sem ocultas) e, com o conversor do
  // app, quantas entram e o motivo de cada corte.
  const registros = registrosParaEntregar(db, { de: desde || null });
  let funil = { exportadas: registros.length, aceitas: null, fora: null, avisos: [] };
  const converter = funcaoDoConversor(conversor);
  if (converter) {
    const r = converter({ contrato: VERSAO_CONTRATO, festas: registros });
    const fora = {};
    for (const x of r.fora || []) fora[motivoBase(x.motivo)] = (fora[motivoBase(x.motivo)] || 0) + 1;
    funil = {
      exportadas: registros.length,
      aceitas: (r.festas || []).length,
      fora: Object.fromEntries(Object.entries(fora).sort((a, b) => b[1] - a[1])),
      avisos: r.avisos || [],
    };
  }

  // Custo: o que o Claude e o Apify gastaram, por festa que chega ao app.
  const dQuando = desde ? 'WHERE quando >= ?' : '';
  const claude = db.prepare(`SELECT COALESCE(SUM(custo_usd), 0) AS usd, COUNT(*) AS chamadas FROM uso_llm ${dQuando}`).get(...args);
  const apify = db.prepare(`SELECT COALESCE(SUM(custo_usd), 0) AS usd, COALESCE(SUM(itens), 0) AS itens FROM uso_apify ${dQuando}`).get(...args);
  const total = claude.usd + apify.usd;
  const chegam = funil.aceitas !== null ? funil.aceitas : registros.length;
  const custo = {
    claudeUsd: arredondar(claude.usd, 4),
    claudeChamadas: claude.chamadas,
    apifyUsd: arredondar(apify.usd, 4),
    apifyItens: apify.itens,
    totalUsd: arredondar(total, 4),
    festasQueChegam: chegam,
    porFestaUsd: chegam ? arredondar(total / chegam, 4) : null,
    base: funil.aceitas !== null ? 'festas aceitas pelo app' : 'festas do export (sem o conversor do app)',
  };

  const execs = db.prepare(`SELECT COUNT(*) AS n, SUM(estado = 'ok') AS ok, SUM(estado = 'erro') AS erro FROM execucoes ${desde ? 'WHERE inicio >= ?' : ''}`).get(...args);

  return { desde, festas, porFonte, soInstagram, multiFonte, candidatos, custo, antecedencia, funil, execucoes: { total: execs.n, ok: execs.ok || 0, erro: execs.erro || 0 } };
}

const usd = (x) => (x === null || x === undefined ? 'n/d' : `US$ ${x.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`);

// formatar(r) -> texto para o terminal
function formatar(r) {
  const l = [];
  l.push(`Relatório${r.desde ? ` desde ${r.desde}` : ''}: ${r.festas} festas no banco, ${r.execucoes ? `${r.execucoes.ok} execuções ok de ${r.execucoes.total}` : ''}`.trim());
  l.push('');
  l.push('Festas por fonte (uma festa conta em cada fonte que a trouxe):');
  const fontes = Object.entries(r.porFonte || {}).sort((a, b) => b[1] - a[1]);
  if (!fontes.length) l.push('  nenhuma');
  for (const [f, n] of fontes) l.push(`  ${f.padEnd(16)} ${n}`);
  l.push('');
  l.push(`Só o Instagram mostrou: ${r.soInstagram}`);
  l.push(`Com mais de uma fonte: ${r.multiFonte}`);
  l.push(`Candidatos a fusão: ${r.candidatos}`);
  l.push('');
  const c = r.custo;
  if (c) {
    l.push(`Custo: ${usd(c.totalUsd)} (Claude ${usd(c.claudeUsd)} em ${c.claudeChamadas} chamadas, Apify ${usd(c.apifyUsd)} em ${c.apifyItens} itens)`);
    l.push(`Por festa que chega ao app: ${usd(c.porFestaUsd)} (${c.festasQueChegam} festas; base: ${c.base})`);
  }
  const a = r.antecedencia;
  l.push(a ? `Antecedência: mediana de ${a.medianaDias} dias entre o post e a festa (${a.amostra} posts, de ${a.minimo} a ${a.maximo} dias)` : 'Antecedência: sem posts com data de publicação');
  l.push('');
  const f = r.funil;
  if (f) {
    l.push(`Funil: ${f.exportadas} festas no export${f.aceitas !== null ? `, ${f.aceitas} entram no app` : ' (rode com --app <conversor> para o corte do app)'}`);
    for (const [m, n] of Object.entries(f.fora || {})) l.push(`  fora: ${n} · ${m}`);
    for (const av of f.avisos || []) l.push(`  aviso: ${av}`);
  }
  return l.join('\n');
}

module.exports = { relatorio, formatar, mediana, motivoBase };

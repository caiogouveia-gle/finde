#!/usr/bin/env node
'use strict';
// O funil da meta (U37, R38): lê um export do motor (finde-r14/3 ou /2),
// aplica os cortes do conversor do app (nucleo/reais.js) e o "não passou"
// pelo relógio, e diz quantas festas reais sobram em cada dia de quinta a
// domingo das semanas das apresentações, mais "hoje". A meta é de 5 por dia,
// sem pedido padrão aplicado (plano de 24/11, "Meta mensurável").
//
//   node ferramentas/funil.js [export] [--agora <ISO>] [--semana AAAA-MM-DD]... [--json]
//
// Padrões: ../../motor/var/festas-r14.json; agora = o relógio; semanas =
// 03–06/12 e 10–13/12 (a quinta de cada uma). A festa de domingo à tarde conta
// para o domingo: o dia é o da noite (dataDaNoite), como no app.

const fs = require('node:fs');
const path = require('node:path');
const R = require('../nucleo/reais');
const L = require('../nucleo/lista');

const META = 5;
const SEMANAS_DAS_APRESENTACOES = ['2026-12-03', '2026-12-10'];
const NOMES = { qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };

// O funil de um export já lido -> { total, aceitas, vigentes, fora: { motivo: n }, semanas, hoje, meta }.
function funil(bruto, { agoraMs = Date.now(), semanas = SEMANAS_DAS_APRESENTACOES, meta = META } = {}) {
  const { festas, fora, avisos } = R.converterExport(bruto);
  const porMotivo = {};
  for (const x of fora) porMotivo[x.motivo] = (porMotivo[x.motivo] || 0) + 1;
  const vivas = L.vigentes(festas, agoraMs);
  const passaram = festas.length - vivas.length;
  if (passaram) porMotivo['já passou'] = passaram;
  const naData = (data) => vivas.filter((f) => f.data === data);
  const dia = (data, id) => {
    const lista = naData(data);
    return { id, data, nome: NOMES[id] || id, reais: lista.length, festas: lista.map((f) => f.nome), naMeta: lista.length >= meta };
  };
  const semanasOut = semanas.map((quinta) => {
    const dias = ['qui', 'sex', 'sab', 'dom'].map((id, i) => dia(L.somarDias(quinta, i), id));
    return { quinta, dias, abaixo: dias.filter((d) => !d.naMeta).map((d) => d.id) };
  });
  const hoje = L.hojeEmSaoPaulo(agoraMs);
  const linhas = Array.isArray(bruto) ? bruto : bruto && Array.isArray(bruto.festas) ? bruto.festas : [];
  return {
    contrato: bruto && bruto.contrato ? bruto.contrato : null,
    geradoEm: bruto && bruto.geradoEm ? bruto.geradoEm : null,
    total: linhas.length,
    aceitas: festas.length,
    vigentes: vivas.length,
    fora: Object.fromEntries(Object.entries(porMotivo).sort((a, b) => b[1] - a[1])),
    semanas: semanasOut,
    hoje: { data: hoje, reais: naData(hoje).length },
    meta,
    avisos,
  };
}

const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function formatar(f) {
  const l = [];
  l.push(`Funil do export ${f.contrato || '(sem contrato)'}${f.geradoEm ? `, gerado em ${f.geradoEm}` : ''}`);
  l.push(`  ${f.total} no export → ${f.aceitas} aceitas pelo conversor → ${f.vigentes} que ainda não passaram`);
  const motivos = Object.entries(f.fora);
  if (motivos.length) {
    l.push('  Cortes, por motivo:');
    for (const [m, n] of motivos) l.push(`    ${String(n).padStart(3)}  ${m}`);
  }
  for (const s of f.semanas) {
    l.push(`  Semana de ${dataCurta(s.quinta)} (meta: ${f.meta} por dia):`);
    for (const d of s.dias) {
      l.push(`    ${d.nome.padEnd(8)} ${dataCurta(d.data)}  ${String(d.reais).padStart(2)}${d.naMeta ? '' : '  abaixo da meta'}${d.festas.length ? `  · ${d.festas.join('; ')}` : ''}`);
    }
  }
  l.push(`  Hoje (${dataCurta(f.hoje.data)}): ${f.hoje.reais}`);
  for (const a of f.avisos || []) l.push(`  aviso: ${a}`);
  return l.join('\n');
}

function lerArgumentos(argv) {
  const semanas = [];
  let agora = null;
  let json = false;
  const soltos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--agora') agora = argv[++i];
    else if (argv[i] === '--semana') semanas.push(argv[++i]);
    else if (argv[i] === '--json') json = true;
    else soltos.push(argv[i]);
  }
  const agoraMs = agora ? Date.parse(agora) : Date.now();
  if (Number.isNaN(agoraMs)) throw new Error(`--agora inválido: ${agora}`);
  if (semanas.some((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s))) throw new Error('--semana é a data da quinta, AAAA-MM-DD');
  return {
    origem: path.resolve(soltos[0] || path.join(__dirname, '..', '..', '..', 'motor', 'var', 'festas-r14.json')),
    agoraMs,
    semanas: semanas.length ? semanas : SEMANAS_DAS_APRESENTACOES,
    json,
  };
}

if (require.main === module) {
  try {
    const a = lerArgumentos(process.argv.slice(2));
    const f = funil(JSON.parse(fs.readFileSync(a.origem, 'utf8')), a);
    process.stdout.write(`${a.json ? JSON.stringify(f, null, 2) : formatar(f)}\n`);
  } catch (e) {
    process.stderr.write(`funil: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { funil, formatar, lerArgumentos, META, SEMANAS_DAS_APRESENTACOES };

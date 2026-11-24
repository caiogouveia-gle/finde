#!/usr/bin/env node
'use strict';
// Leva as festas reais do motor ao app sem rede: lê o export finde-r14/3 (ou
// o /2, na transição) de `node cli.js exportar`, na pasta motor/, e grava
// dados/reais.json, que o servidor lê quando não há motor no ar (e que vira a
// reserva da base viva, KTD14). O arquivo fica fora do git (tem dado real) e
// dentro da imagem do Fly (o Dockerfile copia dados/).
//
//   node ferramentas/reais.js [export] [destino] [--imagens <pasta do motor>]
//
// Padrões: ../../motor/var/festas-r14.json, dados/reais.json e
// ../../motor/var/imagens (FINDE_IMAGENS do motor). Grava só os registros que
// o app aceita (nucleo/reais.js, converterRegistro), do jeito que o motor
// mandou; diz o que ficou fora e por quê, com o funil por motivo. A festa que
// já passou continua no arquivo: o servidor a tira da lista pelo relógio, e o
// convite e o link dela dizem que ela passou.
//
// As imagens das festas aceitas vão para dados/imagens/ (fora do git), e as
// que saíram são apagadas, menos as citadas por convite de festa que não
// passou (var/planos.json, ou FINDE_VAR). Só arquivos <sha16>-(480|1080).webp.

const fs = require('node:fs');
const path = require('node:path');
const R = require('../nucleo/reais');

const RAIZ = path.join(__dirname, '..');
const NOME_IMAGEM = /^([a-f0-9]{16})-(480|1080)\.webp$/;

// argv -> { origem, destino, imagens }
function lerArgumentos(argv) {
  const soltos = [];
  let imagens = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--imagens') imagens = argv[++i];
    else soltos.push(argv[i]);
  }
  return {
    origem: path.resolve(soltos[0] || path.join(RAIZ, '..', '..', 'motor', 'var', 'festas-r14.json')),
    destino: path.resolve(soltos[1] || path.join(RAIZ, 'dados', 'reais.json')),
    imagens: path.resolve(imagens || path.join(RAIZ, '..', '..', 'motor', 'var', 'imagens')),
  };
}

// As imagens citadas por convite de festa que não passou (os convites deste app).
function imagensDosConvites(varDir) {
  if (!fs.existsSync(path.join(varDir, 'planos.json'))) return new Set();
  const { criarPlanos } = require('../nucleo/planos');
  return criarPlanos(varDir, { log: { warn() {}, info() {}, error() {} } }).imagensVigentes();
}

// Copia as imagens das festas aceitas de `de` para `para` e apaga de `para`
// as que saíram (menos as de `manter`). Devolve { copiadas, faltando, apagadas }.
function sincronizarImagens({ festas, de, para, manter = new Set() }) {
  const querer = new Set();
  for (const f of festas) for (const img of [...(f.imagens || []), f.cartaz]) if (img && img.id) querer.add(img.id);
  const r = { copiadas: 0, faltando: 0, apagadas: 0 };
  if (!querer.size && !fs.existsSync(para)) return r;
  fs.mkdirSync(para, { recursive: true });
  for (const sha of querer) {
    for (const tam of ['480', '1080']) {
      const nome = `${sha}-${tam}.webp`;
      const alvo = path.join(para, nome);
      if (fs.existsSync(alvo)) continue;
      const fonte = path.join(de, nome);
      if (!fs.existsSync(fonte)) {
        r.faltando += 1;
        continue;
      }
      const tmp = `${alvo}.${process.pid}.tmp`;
      fs.copyFileSync(fonte, tmp);
      fs.renameSync(tmp, alvo);
      r.copiadas += 1;
    }
  }
  for (const nome of fs.readdirSync(para)) {
    const m = nome.match(NOME_IMAGEM);
    if (!m || querer.has(m[1]) || manter.has(m[1])) continue;
    fs.rmSync(path.join(para, nome), { force: true });
    r.apagadas += 1;
  }
  return r;
}

function principal(argv = process.argv.slice(2), { agora = Date.now(), log = console, varDir = process.env.FINDE_VAR || path.join(RAIZ, 'var') } = {}) {
  const { origem, destino, imagens } = lerArgumentos(argv);
  let bruto;
  try {
    bruto = JSON.parse(fs.readFileSync(origem, 'utf8'));
  } catch (e) {
    log.error(`Não consegui ler ${origem}: ${e.message}`);
    log.error('Rode antes, na pasta motor/: node cli.js exportar');
    return 1;
  }
  if (!bruto || !R.CONTRATOS.includes(bruto.contrato) || !Array.isArray(bruto.festas)) {
    log.error(`${origem} não é um export ${R.CONTRATOS.join(' ou ')} (falta "contrato" ou "festas").`);
    return 1;
  }

  const { festas, fora, avisos } = R.converterExport(bruto);
  for (const a of avisos) log.warn(`aviso: ${a}`);
  const aceitos = new Set(festas.map((f) => f.id));
  const registros = bruto.festas.filter((r) => r && aceitos.has(r.id));
  const saida = {
    contrato: bruto.contrato,
    geradoEm: bruto.geradoEm || null,
    execucaoId: bruto.execucaoId ?? null,
    copiadoEm: new Date(agora).toISOString(),
    total: bruto.festas.length,
    festas: registros,
  };

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(saida, null, 2)}\n`);
  fs.renameSync(tmp, destino);

  const passadas = festas.filter((f) => R.passou(f, agora)).length;
  log.log(`${registros.length} festas reais em ${path.relative(process.cwd(), destino) || destino}${passadas ? ` (${passadas} já passaram e não entram na lista)` : ''}.`);
  for (const f of festas) log.log(`  entra  ${f.data}  ${f.diaDaSemana}  ${f.nome}${f.horarioIncerto ? '  (sem início)' : ''}${f.esgotado ? '  (esgotada)' : ''}`);
  for (const x of fora) log.log(`  fora   ${x.id}: ${x.motivo}`);
  // O funil: quantas ficaram fora por cada motivo.
  const funil = {};
  for (const x of fora) funil[x.motivo] = (funil[x.motivo] || 0) + 1;
  log.log(`funil: ${bruto.festas.length} no export, ${festas.length} entram${Object.keys(funil).length ? `; fora: ${Object.entries(funil).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${n} ${m}`).join(', ')}` : ''}.`);

  const img = sincronizarImagens({ festas, de: imagens, para: path.join(path.dirname(destino), 'imagens'), manter: imagensDosConvites(varDir) });
  if (img.copiadas || img.faltando || img.apagadas) {
    log.log(`imagens: ${img.copiadas} copiadas, ${img.apagadas} apagadas${img.faltando ? `, ${img.faltando} não estavam em ${imagens}` : ''}.`);
  }
  return 0;
}

if (require.main === module) process.exitCode = principal();

module.exports = { principal, sincronizarImagens, lerArgumentos };

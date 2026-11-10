#!/usr/bin/env node
'use strict';
// Comandos do motor. `node cli.js ajuda` lista todos.

const fs = require('node:fs');
const path = require('node:path');
const { preparar } = require('./nucleo/ambiente');
const { executar } = require('./nucleo/coleta');
const { listarRegistros, VERSAO_CONTRATO } = require('./nucleo/contrato');
const { criarProdutora } = require('./nucleo/produtoras');
const { resumoDeUso } = require('./nucleo/uso');
const { modeloAtual } = require('./nucleo/classificar');
const { fontesLigadas, descreverFontes } = require('./fontes');

const AJUDA = `Uso: node cli.js <comando>

  coletar [--fonte <id>] [--com-exemplos]   roda uma coleta agora
  exportar [arquivo] [--todas] [--sem-exemplos]
                                            grava os registros R14 em JSON (padrão: var/festas-r14.json)
  produtora criar "<nome>"                  cadastra uma produtora e mostra o token UMA vez
  produtora listar | produtora desativar <id>
  fontes                                    lista as fontes, ligadas e desligadas, com o motivo
  execucoes                                 as últimas execuções
  uso                                       gasto com o modelo e acessos à API

Ambiente: FINDE_BANCO, ANTHROPIC_API_KEY, FINDE_MODELO, FINDE_TETO_EXECUCAO_USD,
FINDE_TETO_DIA_USD, FINDE_FONTES (ver README).`;

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

async function main(args) {
  const [cmd, ...resto] = args;
  const flag = (f) => resto.includes(f);
  const valor = (f) => {
    const i = resto.indexOf(f);
    return i >= 0 ? resto[i + 1] : null;
  };
  if (!cmd || cmd === 'ajuda' || cmd === '--help') {
    console.log(AJUDA);
    return 0;
  }
  const { amb, db, config, claude } = preparar();

  if (cmd === 'coletar') {
    const { fontes, config: cfg } = fontesLigadas(config, { so: valor('--fonte'), exemplos: flag('--com-exemplos') || amb.comExemplos });
    if (!fontes.length) {
      console.error('nenhuma fonte ligada para rodar');
      return 1;
    }
    console.info(`[motor] coleta: ${fontes.map((f) => f.id).join(', ')} · classificação ${claude ? `pelo Claude (${modeloAtual()})` : 'por regras (sem ANTHROPIC_API_KEY)'}`);
    const r = await executar({ db, fontes, claude, config: cfg, gatilho: 'comando' });
    if (r.recusada) return 2;
    for (const [id, f] of Object.entries(r.fontes)) {
      console.info(`  ${id}: ${f.itens} itens, ${f.gravados} gravados, ${f.novas} festas novas, ${f.descartados} descartados${f.erro ? `, erro: ${f.erro}` : ''}`);
    }
    const c = r.classificacao;
    console.info(`  classificação: ${c.claude} pelo Claude, ${c.cache} do cache, ${c.regras} por regras, ${c.invalidas} respostas inválidas, ${c.erros} erros · US$ ${c.gastoUsd}${c.parado ? ` · modelo parado: ${c.parado}` : ''}`);
    if (r.avisos.length) {
      console.info(`  avisos (${r.avisos.length}):`);
      for (const a of r.avisos.slice(0, 30)) console.info(`   - ${a}`);
    }
    console.info(`  execução ${r.execucaoId}: ${r.festasTocadas} festas tocadas, ${r.festasNovas} novas`);
    return 0;
  }

  if (cmd === 'exportar') {
    const destino = resto.find((a) => !a.startsWith('--')) || path.join(path.dirname(amb.banco), 'festas-r14.json');
    let festas = listarRegistros(db, { de: hojeSP(), todas: flag('--todas') });
    if (flag('--sem-exemplos')) festas = festas.filter((f) => !f.exemplo);
    const corpo = { contrato: VERSAO_CONTRATO, geradoEm: new Date().toISOString(), total: festas.length, festas };
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(`${destino}.tmp`, `${JSON.stringify(corpo, null, 2)}\n`);
    fs.renameSync(`${destino}.tmp`, destino);
    console.info(`${festas.length} festas em ${destino}`);
    return 0;
  }

  if (cmd === 'produtora') {
    const [sub, arg] = resto;
    if (sub === 'criar') {
      const p = criarProdutora(db, arg);
      console.info(`produtora "${p.nome}" (${p.id}) criada.`);
      console.info(`token, mostrado só agora; guarde num gerenciador de senhas e entregue à produtora por canal seguro:\n${p.token}`);
      return 0;
    }
    if (sub === 'listar') {
      for (const p of db.prepare('SELECT id, nome, criada_em, ativa FROM produtoras ORDER BY criada_em').all()) {
        console.info(`${p.ativa ? '●' : '○'} ${p.id}  ${p.nome}  (desde ${p.criada_em.slice(0, 10)})`);
      }
      return 0;
    }
    if (sub === 'desativar' && arg) {
      const r = db.prepare('UPDATE produtoras SET ativa = 0 WHERE id = ?').run(arg);
      console.info(r.changes ? `${arg} desativada` : `${arg} não existe`);
      return r.changes ? 0 : 1;
    }
    console.error(AJUDA);
    return 1;
  }

  if (cmd === 'fontes') {
    for (const f of descreverFontes(config)) console.info(`${f.ligada ? '● ligada   ' : '○ desligada'} ${f.id}: ${f.motivo || ''}`);
    return 0;
  }

  if (cmd === 'execucoes') {
    for (const e of db.prepare('SELECT id, inicio, fim, estado, gatilho, resumo FROM execucoes ORDER BY id DESC LIMIT 10').all()) {
      const r = e.resumo ? JSON.parse(e.resumo) : {};
      console.info(`#${e.id} ${e.inicio} ${e.estado} (${e.gatilho}) · ${r.festasTocadas ?? '-'} festas · US$ ${r.classificacao ? r.classificacao.gastoUsd : 0}`);
    }
    return 0;
  }

  if (cmd === 'uso') {
    console.log(JSON.stringify(resumoDeUso(db), null, 2));
    return 0;
  }

  console.error(AJUDA);
  return 1;
}

main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => {
  console.error(`[motor] ${e.message}`);
  process.exitCode = 1;
});

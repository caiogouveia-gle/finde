'use strict';
// Tarefas várias vezes ao dia (M12), no horário de São Paulo (−03:00, KTD7).
// FINDE_HORARIOS="07:00,12:00,17:00,21:00" é o padrão. A trava de execuções
// (coleta.js) impede duas ao mesmo tempo, então um disparo atrasado não dobra.

const HORARIOS_PADRAO = '07:00,12:00,17:00,21:00';

const { executar, SEM_BATIMENTO_MIN } = require('./coleta');
const { fontesLigadas } = require('../fontes');
const { limparImagens } = require('./imagens');
const { podarUso } = require('./uso');

function lerHorarios(texto = HORARIOS_PADRAO) {
  const hs = String(texto).split(',').map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`horário inválido em FINDE_HORARIOS: "${t}"`);
    return +m[1] * 60 + +m[2];
  });
  if (!hs.length) throw new Error('FINDE_HORARIOS vazio');
  return [...new Set(hs)].sort((a, b) => a - b);
}

// O próximo disparo depois de `agora`, como Date (UTC).
function proximoDisparo(minutos, agora) {
  const sp = new Date(agora.getTime() - 3 * 3600e3); // relógio de parede de SP, guardado em UTC
  const agoraMin = sp.getUTCHours() * 60 + sp.getUTCMinutes();
  const hoje = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate());
  const prox = minutos.find((m) => m > agoraMin);
  const alvoSp = prox !== undefined ? hoje + prox * 60e3 : hoje + 86400e3 + minutos[0] * 60e3;
  return new Date(alvoSp + 3 * 3600e3);
}

// Liga a agenda. `tarefa` é async; erro dela vai para o log e a agenda segue.
function iniciarAgenda({ horarios = HORARIOS_PADRAO, tarefa, agora = () => new Date(), log = console }) {
  const minutos = lerHorarios(horarios);
  let timer = null;
  let parada = false;
  function armar() {
    if (parada) return;
    const alvo = proximoDisparo(minutos, agora());
    const espera = Math.max(1000, alvo.getTime() - agora().getTime());
    log.info(`[motor] próxima coleta: ${alvo.toISOString()} (${Math.round(espera / 60000)} min)`);
    timer = setTimeout(async () => {
      try {
        await tarefa();
      } catch (e) {
        log.error(`[motor] a coleta agendada falhou: ${e.message}`);
      }
      armar();
    }, espera);
  }
  armar();
  return { parar: () => { parada = true; clearTimeout(timer); } };
}

// Uma execução com batimento recente (a trava a consideraria viva).
function outraRodando(db, agora) {
  const limite = new Date(agora.getTime() - SEM_BATIMENTO_MIN * 60e3).toISOString();
  return Boolean(db.prepare("SELECT 1 FROM execucoes WHERE estado = 'rodando' AND COALESCE(atualizado_em, inicio) >= ? LIMIT 1").get(limite));
}

// A tarefa que a agenda roda (M37, KTD18): liga o Instagram e as páginas quando
// o ambiente diz `poc` (FINDE_POC=1, no Fly até 07/12/2026), executa, e no fim
// limpa as imagens das festas passadas e poda o uso da API com mais de 30 dias.
// `rodar` e `limpar` trocam a execução e a limpeza nos testes.
function criarTarefaDeColeta({ db, amb, config, claude = null, agora = () => new Date(), log = console, rodar = executar, limpar = limparImagens }) {
  return async function tarefaDeColeta() {
    const { fontes, config: cfg } = fontesLigadas(config, { exemplos: amb.comExemplos, poc: Boolean(amb.poc) });
    let recusada = false;
    try {
      const r = await rodar({ db, fontes, gatilho: 'agenda', claude, config: cfg, agora, log, dirImagens: amb.imagens });
      recusada = Boolean(r && r.recusada);
      if (r && !r.recusada) {
        log.info(`[motor] coleta ${r.execucaoId}: ${r.festasTocadas} festas, ${r.festasNovas} novas, US$ ${r.classificacao ? r.classificacao.gastoUsd : 0}`);
      }
      return r;
    } finally {
      // A limpeza vale mesmo quando a coleta falhou. Não quando outra execução
      // está rodando (a recusada pela trava, ou uma que começou depois): no
      // tempo 2 dela o worker já gravou os WebP e as linhas de imagens só
      // entram no fim do lote, e a limpeza os apagaria como órfãos.
      try {
        if (recusada || outraRodando(db, agora())) {
          log.info('[motor] outra execução está rodando: a limpeza de imagens fica para a próxima');
        } else {
          const imgs = cfg.imagens || {};
          const l = limpar(db, amb.imagens, { agora, folgaDias: imgs.folgaDias, maxMb: imgs.maxMb, log });
          if (l && (l.apagadas || l.orfaos || l.temporarios)) log.info(`[motor] imagens limpas: ${l.apagadas} apagadas, ${l.orfaos} órfãos, ${l.temporarios} temporários`);
        }
      } catch (e) {
        log.warn(`[motor] a limpeza de imagens falhou: ${e.message}`);
      }
      try {
        podarUso(db, { agora: agora(), dias: 30 });
      } catch (e) {
        log.warn(`[motor] a poda do uso falhou: ${e.message}`);
      }
    }
  };
}

module.exports = { lerHorarios, proximoDisparo, iniciarAgenda, criarTarefaDeColeta, HORARIOS_PADRAO };

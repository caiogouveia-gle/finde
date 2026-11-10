'use strict';
// Tarefas várias vezes ao dia (M12), no horário de São Paulo (−03:00, KTD7).
// FINDE_HORARIOS="07:00,12:00,17:00,21:00" é o padrão. A trava de execuções
// (coleta.js) impede duas ao mesmo tempo, então um disparo atrasado não dobra.

const HORARIOS_PADRAO = '07:00,12:00,17:00,21:00';

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

module.exports = { lerHorarios, proximoDisparo, iniciarAgenda, HORARIOS_PADRAO };

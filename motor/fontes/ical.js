'use strict';
// Agenda iCal (.ics) publicada pela própria produtora (M4). Entra só o endereço
// que a produtora informou ao Finde, em config/fontes.json; vem desligada e sem
// endereços. Muita produtora mantém uma agenda do Google com link público em
// .ics: é feita para ser assinada por outros programas, e é ela que autoriza.

const AGENTE = 'FindeMotor/0.1 (+https://github.com/caiogouveia-gle/finde)';

// Desdobra linhas (RFC 5545 §3.1) e separa os VEVENT.
function eventos(ics) {
  const linhas = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const saida = [];
  let atual = null;
  for (const l of linhas) {
    if (l === 'BEGIN:VEVENT') atual = {};
    else if (l === 'END:VEVENT') {
      if (atual) saida.push(atual);
      atual = null;
    } else if (atual) {
      const i = l.indexOf(':');
      if (i < 0) continue;
      const [nome, ...params] = l.slice(0, i).split(';');
      atual[nome.toUpperCase()] = { valor: l.slice(i + 1), params: params.join(';') };
    }
  }
  return saida;
}

const desescapar = (t) => String(t || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

// DTSTART -> { data, hora } em horário de São Paulo (−03:00).
function quando(campo) {
  if (!campo) return null;
  const m = campo.valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, a, me, d, h, mi, , z] = m;
  if (h === undefined) return { data: `${a}-${me}-${d}`, hora: null };
  if (z || /TZID=(?!America\/Sao_Paulo)/.test(campo.params)) {
    // UTC (ou outro fuso, tratado como UTC na falta de tabela): converte para −03:00.
    const t = new Date(Date.UTC(+a, +me - 1, +d, +h, +mi) - 3 * 3600e3);
    return { data: t.toISOString().slice(0, 10), hora: t.toISOString().slice(11, 16) };
  }
  return { data: `${a}-${me}-${d}`, hora: `${h}:${mi}` };
}

function itensDoIcs(ics, feed, { agora, dias = 30 }) {
  const hoje = new Date(agora().getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const limite = new Date(agora().getTime() + dias * 86400e3).toISOString().slice(0, 10);
  const itens = [];
  for (const e of eventos(ics)) {
    const ini = quando(e.DTSTART);
    if (!ini || !e.UID || ini.data < hoje || ini.data > limite) continue;
    const fim = quando(e.DTEND);
    const descricao = desescapar(e.DESCRIPTION && e.DESCRIPTION.valor);
    const local = desescapar(e.LOCATION && e.LOCATION.valor);
    const [casa, ...resto] = local.split(/\s*[,\n]\s*/);
    itens.push({
      idExterno: `${feed.url}#${e.UID.valor}`.slice(0, 300),
      url: e.URL ? e.URL.valor : null,
      texto: descricao.slice(0, 6000),
      bruto: {
        nome: desescapar(e.SUMMARY && e.SUMMARY.valor),
        produtora: feed.produtora ? { nome: feed.produtora, instagram: feed.instagram } : undefined,
        casa: casa || undefined,
        endereco: resto.join(', ') || local || undefined,
        data: ini.data,
        inicio: ini.hora,
        fim: fim && fim.hora ? fim.hora : undefined,
        linkEvento: e.URL ? e.URL.valor : undefined,
        instagram: feed.instagram,
      },
    });
  }
  return itens;
}

module.exports = {
  id: 'ical',
  nome: 'Agenda iCal da produtora',
  itensDoIcs,
  eventos,
  async coletar({ fetch, agora, config }) {
    const itens = [];
    const avisos = [];
    for (const feed of config.feeds || []) {
      try {
        const r = await fetch(feed.url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(config.timeoutMs || 20000) });
        if (!r.ok) throw new Error(`respondeu ${r.status}`);
        itens.push(...itensDoIcs(await r.text(), feed, { agora, dias: config.dias }));
      } catch (e) {
        avisos.push(`${feed.url}: ${e.message}`);
      }
    }
    return { itens, avisos };
  },
};

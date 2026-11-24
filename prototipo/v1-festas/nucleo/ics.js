'use strict';
// "Pôr na agenda" (R33 do plano de 24/11/2026): um VCALENDAR com UID,
// DTSTAMP, DTSTART e DTEND em UTC, SUMMARY, LOCATION, URL e DESCRIPTION com o
// link do convite quando houver; vírgula, ponto e vírgula, barra invertida e
// quebra escapados (RFC 5545, 3.3.11), linhas com CRLF e dobradas em 75
// octetos (3.1). Festa sem fim acaba às 6h da manhã seguinte; festa sem
// início divulgado vira um compromisso do dia inteiro. Puro.

const PRODID = '-//Finde//Prova de conceito//PT';
const FIM_PADRAO = 30; // 6h da manhã seguinte, nas horas do app
const numero = (v) => typeof v === 'number' && Number.isFinite(v);

// escaparTexto("a, b; c\nd") -> "a\\, b\\; c\\nd".
function escaparTexto(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// dobrarLinha(linha) -> a linha em pedaços de até 75 octetos, unidos por
// CRLF e um espaço (que conta nos 75 da linha seguinte). Nunca corta um
// caractere de vários bytes ao meio.
function dobrarLinha(linha) {
  const s = String(linha);
  const partes = [];
  let atual = '';
  let bytes = 0;
  let limite = 75;
  for (const ch of s) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (bytes + n > limite) {
      partes.push(atual);
      atual = '';
      bytes = 0;
      limite = 74; // o espaço do começo da continuação ocupa um octeto
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

// 2026-11-28T02:00:00.000Z -> 20261128T020000Z
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const soData = (data) => data.replace(/-/g, '');

// horarioDaFesta(festa, data) -> { inicio, fim } em ms (UTC), ou { dia } sem
// início. As horas do app contam da meia-noite da data em São Paulo (1h da
// manhã seguinte = 25).
function horarioDaFesta(festa, data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const meiaNoite = Date.parse(`${data}T00:00:00-03:00`);
  if (!numero(festa.inicio)) return { dia: data };
  const fimH = numero(festa.fim) && festa.fim > festa.inicio ? festa.fim : Math.max(FIM_PADRAO, festa.inicio + 1);
  return { inicio: meiaNoite + festa.inicio * 3600e3, fim: meiaNoite + fimH * 3600e3 };
}

function diaSeguinte(data) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// montarIcs({ festa, data, quando, uid, urlConvite, urlFesta, agora }) -> texto do .ics
//   festa       a festa do app (nome, casa, endereco, inicio, fim, linkCompra)
//   data        'AAAA-MM-DD' da noite da festa (ou `quando: { inicio, fim }`,
//               em ms ou ISO, quando quem chama já fez a conta)
//   urlConvite  o link do convite, quando o .ics sai de um convite
//   urlFesta    o link da festa no app
//   agora       ms ou ISO, para o DTSTAMP
function montarIcs({ festa, data, quando: dado = null, uid, urlConvite = null, urlFesta = null, agora = Date.now() } = {}) {
  if (!festa || typeof festa !== 'object') throw new Error('montarIcs: falta a festa');
  const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));
  const quando = dado && Number.isFinite(ms(dado.inicio)) && Number.isFinite(ms(dado.fim))
    ? { inicio: ms(dado.inicio), fim: ms(dado.fim) } : horarioDaFesta(festa, data || festa.data);
  if (!quando) throw new Error('montarIcs: falta a data da festa');
  // Festa fictícia da base de exemplo: o .ics diz que é exemplo e não leva
  // endereço nem link de compra (na agenda, ela não pode virar compromisso).
  const exemplo = festa.exemplo === true || festa.real === false;
  const onde = exemplo ? '' : [festa.casa, festa.endereco && festa.endereco.texto].filter(Boolean).join(', ');
  const descricao = [
    exemplo ? 'Festa fictícia do protótipo do Finde: não acontece de verdade.' : null,
    urlConvite ? `Convite do grupo: ${urlConvite}` : null,
    urlFesta && urlFesta !== urlConvite ? `No Finde: ${urlFesta}` : null,
    festa.linkCompra && !exemplo ? `Ingressos: ${festa.linkCompra}` : null,
    quando.dia ? 'O horário de começo não foi divulgado.' : null,
  ].filter(Boolean).join('\n');
  const carimbo = utc(typeof agora === 'number' ? agora : Date.parse(agora));
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escaparTexto(uid || `${festa.id}@finde`)}`,
    `DTSTAMP:${carimbo}`,
    ...(quando.dia
      ? [`DTSTART;VALUE=DATE:${soData(quando.dia)}`, `DTEND;VALUE=DATE:${soData(diaSeguinte(quando.dia))}`]
      : [`DTSTART:${utc(quando.inicio)}`, `DTEND:${utc(quando.fim)}`]),
    `SUMMARY:${escaparTexto(exemplo ? `Exemplo · ${festa.nome}` : festa.nome)}`,
    onde ? `LOCATION:${escaparTexto(onde)}` : null,
    urlConvite || urlFesta ? `URL:${urlConvite || urlFesta}` : null,
    descricao ? `DESCRIPTION:${escaparTexto(descricao)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return `${linhas.map(dobrarLinha).join('\r\n')}\r\n`;
}

module.exports = { montarIcs, escaparTexto, dobrarLinha, horarioDaFesta, FIM_PADRAO };

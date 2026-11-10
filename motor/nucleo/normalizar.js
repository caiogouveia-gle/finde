'use strict';
// De um item de fonte para os campos do registro R14. Cada conector entrega um
// "bruto" com nomes simples (data, inicio "22:00", preco "R$ 40" ...); daqui sai
// um objeto só com os campos que a fonte de fato trouxe, já limpos, mais os avisos
// do que foi descartado. Puro: sem banco, sem relógio, sem rede.
//
// Horários: São Paulo não tem horário de verão desde 2019, então todo horário sai
// em ISO com -03:00 (KTD7). Fim ou pista cheia antes do início é no dia seguinte.

const crypto = require('node:crypto');
const { ESTILOS, ORIGENS_IDADE } = require('./catalogo');
const { acharBairro, semAcento } = require('./bairros');

const FUSO = '-03:00';

function texto(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Só http(s); o resto (javascript:, data:, ftp:) é recusado.
function url(v) {
  if (typeof v !== 'string' || v.length > 500) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// "@coletivo", "coletivo", "instagram.com/coletivo" -> https://www.instagram.com/coletivo/
function instagram(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const u = url(t);
  if (u) {
    const p = new URL(u);
    if (!/(^|\.)instagram\.com$/.test(p.hostname)) return null;
    const nome = p.pathname.split('/').filter(Boolean)[0];
    return nome && /^[A-Za-z0-9._]{1,30}$/.test(nome) ? `https://www.instagram.com/${nome}/` : null;
  }
  const nome = t.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(nome) ? `https://www.instagram.com/${nome}/` : null;
}

// "Gratuito" -> 0; "R$ 25,00" -> 25; "R$20 a R$40" -> 20; 40 -> 40; o resto -> null.
function preco(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= 5000 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== 'string') return null;
  const t = semAcento(v);
  if (/\b(gratuit[oa]|gratis|free|entrada franca|livre)\b/.test(t)) return 0;
  const m = t.match(/(\d{1,4}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].includes(',') ? m[1].replace(/\./g, '').replace(',', '.') : m[1]);
  return preco(n);
}

const dataValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T12:00:00${FUSO}`)) && new Date(`${v}T12:00:00${FUSO}`).toISOString().slice(0, 10) === v;

function minutos(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.trim().match(/^(\d{1,2})(?::|h)?(\d{2})?(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2] || 0);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

function somarDias(data, dias) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// data + "22:00" -> "2026-11-14T22:00:00-03:00"; com base em minutos, rola para o dia seguinte.
function horario(data, hhmm, depoisDe = null) {
  const m = minutos(hhmm);
  if (m === null) return null;
  const dia = depoisDe !== null && m <= depoisDe ? somarDias(data, 1) : data;
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${dia}T${h}:${mm}:00${FUSO}`;
}

function lotes(lista, avisos) {
  if (!Array.isArray(lista)) return null;
  const saida = [];
  for (const l of lista.slice(0, 12)) {
    const p = preco(l && l.preco);
    if (p === null) {
      avisos.push('lote sem preço válido ignorado');
      continue;
    }
    saida.push({
      nome: texto(l.nome, 40) || `${saida.length + 1}º lote`,
      preco: p,
      disponivel: typeof l.disponivel === 'boolean' ? l.disponivel : null,
    });
  }
  return saida.length ? saida : null;
}

function idadeMinima(v) {
  if (Number.isInteger(v)) return v >= 0 && v <= 21 ? (v || null) : null;
  if (typeof v !== 'string') return null;
  const m = v.match(/(\d{1,2})/);
  if (!m) return null; // "Livre" e afins: sem idade mínima
  return idadeMinima(Number(m[1]));
}

// R16: a média só entra pelo envio da produtora e com origem válida.
function mediaIdade(v, fonte, avisos) {
  if (v === undefined || v === null) return null;
  if (fonte !== 'envio') {
    avisos.push(`média de idade descartada: veio de "${fonte}", e só a produtora declara (R16)`);
    return null;
  }
  const o = typeof v === 'object' ? v : {};
  const valor = o.valor;
  if (!Number.isInteger(valor) || valor < 18 || valor > 60) {
    avisos.push('média de idade descartada: valor fora de 18 a 60');
    return null;
  }
  if (!ORIGENS_IDADE.includes(o.origem)) {
    avisos.push('média de idade descartada: sem origem declarada (R16)');
    return null;
  }
  const saida = { valor, origem: o.origem };
  if (o.origem === 'avaliacoes') {
    if (!Number.isInteger(o.avaliacoes) || o.avaliacoes < 5) {
      avisos.push('média de idade descartada: "avaliacoes" pede ao menos 5 avaliações');
      return null;
    }
    saida.avaliacoes = o.avaliacoes;
  }
  const detalhe = texto(o.detalhe, 160);
  if (o.origem === 'edicoes' && !detalhe) {
    avisos.push('média de idade descartada: "edicoes" pede o detalhe (quais edições)');
    return null;
  }
  if (detalhe) saida.detalhe = detalhe;
  return saida;
}

// O bruto de qualquer fonte -> { campos, avisos }. Campo ausente não entra.
function normalizarItem(b, fonte) {
  const avisos = [];
  const c = {};
  const por = (k, v) => {
    if (v !== null && v !== undefined) c[k] = v;
  };

  por('nome', texto(b.nome, 120));
  if (b.produtora) {
    const p = typeof b.produtora === 'string' ? { nome: b.produtora } : b.produtora;
    const nome = texto(p.nome, 120);
    if (nome) por('produtora', { nome, instagram: instagram(p.instagram) });
  }
  por('casa', texto(b.casa, 120));
  const endTexto = texto(b.endereco, 200);
  const achado = acharBairro(b.bairro, b.endereco, b.casa);
  if (endTexto || achado) {
    por('endereco', {
      texto: endTexto,
      bairro: achado ? achado.bairro : null,
      regiao: achado ? achado.regiao : null,
      cidade: 'São Paulo',
    });
  }

  if (b.data !== undefined && !dataValida(b.data)) avisos.push('data inválida');
  if (dataValida(b.data)) {
    por('data', b.data);
    const ini = minutos(b.inicio);
    por('inicio', horario(b.data, b.inicio));
    if (ini !== null) {
      por('pistaCheia', horario(b.data, b.pistaCheia, ini - 1));
      por('fim', horario(b.data, b.fim, ini));
    }
  }

  const ls = lotes(b.lotes, avisos);
  if (ls) por('lotes', ls);
  else if (b.preco !== undefined && preco(b.preco) !== null) por('lotes', [{ nome: 'Entrada', preco: preco(b.preco), disponivel: null }]);
  if (b.naPorta !== undefined && b.naPorta !== null) {
    const p = typeof b.naPorta === 'object' ? preco(b.naPorta.preco) : preco(b.naPorta);
    if (p !== null) por('entradaNaPorta', { preco: p });
  }

  por('linkCompra', url(b.linkCompra));
  por('linkEvento', url(b.linkEvento));
  por('instagram', instagram(b.instagram));
  por('cartaz', url(b.cartaz));
  if (Array.isArray(b.lineup)) {
    const nomes = b.lineup.map((n) => texto(n, 80)).filter(Boolean).slice(0, 30);
    if (nomes.length) por('lineup', nomes);
  }
  if (Array.isArray(b.estilos)) {
    const es = [...new Set(b.estilos.filter((e) => ESTILOS.includes(e)))];
    if (es.length) por('estilos', es);
    if (es.length < b.estilos.length) avisos.push('estilo fora do catálogo ignorado');
  }
  por('idadeMinima', idadeMinima(b.idadeMinima));
  const regras = {};
  for (const k of ['documento', 'vestimenta', 'lista']) {
    const v = texto(b[k] !== undefined ? b[k] : b.regras && b.regras[k], 160);
    if (v) regras[k] = v;
  }
  if (Object.keys(regras).length) por('regras', regras);
  por('mediaIdade', mediaIdade(b.mediaIdade, fonte, avisos));
  if (typeof b.ehFesta === 'boolean') por('ehFesta', b.ehFesta);
  if (b.exemplo === true) por('exemplo', true);

  return { campos: c, avisos };
}

// "Sexta Sem Pressa" + 2026-11-14 + semente -> "sexta-sem-pressa-20261114-a1b2"
function slug(t) {
  return semAcento(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function novoId(nome, data, semente) {
  const h = crypto.createHash('sha256').update(String(semente)).digest('hex').slice(0, 4);
  const dia = (data || '00000000').replace(/-/g, '');
  const base = slug(nome || 'festa').slice(0, 60 - dia.length - h.length - 2).replace(/-+$/, '') || 'festa';
  return `${base}-${dia}-${h}`;
}

module.exports = { normalizarItem, novoId, slug, preco, instagram, url, horario, idadeMinima, texto };

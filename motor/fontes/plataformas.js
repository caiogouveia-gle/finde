'use strict';
// RESERVA, desligada: decisão do Caio de 24/11/2026, o Apify fica só com o
// Instagram; Sympla, Shotgun e Resident Advisor são lidos por fontes/paginas.js
// (Scrapling). Estes conectores ficam para o caso de o leitor ser bloqueado.
//
// Plataformas de ingresso pelo Apify (prova de conceito acadêmica, KTD11):
// Sympla, Shotgun e Resident Advisor. Quem coleta é um ator pronto do Apify,
// rodado pelo cliente de nucleo/apify.js; aqui só se monta a entrada de cada
// ator e se traduz a saída para o bruto que o normalizador entende. As
// entradas ficam marcadas `pocAcademica` no config e desligadas: decisão do
// Caio de 24/11/2026, prova sem fins lucrativos. Não vão para o produto
// comercial sem acordo com as plataformas.
//
// Os formatos de saída foram lidos nas páginas dos atores em 24/11/2026; onde o
// ator não documenta os subcampos (endereço e preços da Sympla), os mapeadores
// aceitam mais de um nome. Nada pessoal é guardado: sem e-mail nem telefone de
// organizador, só o nome público dele.

const { NOME_FONTE } = require('../nucleo/catalogo');
const { semCodigo } = require('../nucleo/normalizar');

const SEM_ACENTO = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const texto = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const lista = (v) => (Array.isArray(v) ? v : []);
const link = (v) => { const t = texto(v, 500); return t ? semCodigo(t) : null; };

// Data e hora de São Paulo (−03:00, sem horário de verão desde 2019) de um
// instante ISO. Sem fuso no texto, vale como já estando em São Paulo; só data
// devolve só a data.
function emSP(v) {
  if (typeof v !== 'string') return { data: null, hora: null };
  const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return { data: null, hora: null };
  if (!m[2]) return { data: m[1], hora: null };
  if (!m[4]) return { data: m[1], hora: `${m[2]}:${m[3]}` };
  const t = Date.parse(v.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(t)) return { data: null, hora: null };
  const sp = new Date(t - 3 * 3600e3).toISOString();
  return { data: sp.slice(0, 10), hora: sp.slice(11, 16) };
}

function ehSP(cidade, uf) {
  if (uf && !/^sp$/i.test(String(uf).trim()) && !/^s[aã]o paulo$/i.test(String(uf).trim())) return false;
  if (!cidade) return true; // o ator já buscou por cidade; sem cidade no item, fica
  return /^sao paulo(\b|$)/.test(SEM_ACENTO(cidade).replace(/-/g, ' ').trim());
}

function dataSP(d) {
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}
const janela = (agora, dias) => {
  const hoje = agora();
  return { dateFrom: dataSP(hoje), dateTo: dataSP(new Date(hoje.getTime() + dias * 86400e3)) };
};

const doHost = (re) => (fila) => [...(fila || [])].filter((u) => {
  try { return re.test(new URL(u).hostname.toLowerCase()); } catch { return false; }
});

const nomesDe = (v) => lista(v)
  .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? x.name || x.nome : null))
  .map((x) => texto(x, 80)).filter(Boolean);

function precoDe(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) return v;
  return null;
}

function pagina(nome, url, agora, campos) {
  return { tipo: 'ingresso', nome, url, lidoEm: agora().toISOString(), campos };
}

// ---- Sympla ----------------------------------------------------------------

const enderecoSympla = (loc) => {
  if (typeof loc === 'string') return texto(loc);
  if (!loc || typeof loc !== 'object') return null;
  return texto(loc.formattedAddress || loc.address || loc.street || loc.fullAddress);
};

function brutoSympla(x, agora) {
  if (!x || typeof x !== 'object') return null;
  const nome = texto(x.name, 120);
  const url = link(x.url);
  const { data, hora } = emSP(x.startDate);
  if (!nome || !data) return null;
  if (/^(online|ondemand|on_demand)$/i.test(String(x.type || ''))) return null;
  const v = x.venue && typeof x.venue === 'object' ? x.venue : {};
  if (!ehSP(v.city, v.state)) return null;
  const fim = emSP(x.endDate);
  const resumo = x.ticketSummary && typeof x.ticketSummary === 'object' ? x.ticketSummary : {};
  const minimo = precoDe([resumo.minPrice, resumo.lowestPrice, resumo.min].find((p) => precoDe(p) !== null));
  const esgotado = [resumo.soldOut, resumo.isSoldOut].find((b) => typeof b === 'boolean');
  const lotes = minimo !== null ? [{ nome: 'A partir de', preco: minimo, disponivel: typeof esgotado === 'boolean' ? !esgotado : null }] : [];
  const campos = ['nome', 'data'];
  if (hora) campos.push('inicio');
  if (v.name) campos.push('casa');
  if (lotes.length) campos.push('lotes');
  const endereco = enderecoSympla(x.location);
  if (endereco) campos.push('endereco');
  return {
    nome,
    produtora: x.organizer && texto(x.organizer.name, 120) ? { nome: texto(x.organizer.name, 120) } : undefined,
    casa: texto(v.name, 120),
    endereco,
    cidade: texto(v.city, 80),
    data,
    inicio: hora,
    fim: fim.data ? fim.hora : null,
    lotes,
    linkCompra: url,
    ...(url ? { paginas: [pagina('Sympla', url, agora, campos)] } : {}),
  };
}

// ---- Shotgun ---------------------------------------------------------------

function disponivelDe(a) {
  if (typeof a === 'boolean') return a;
  if (typeof a !== 'string') return null;
  const t = SEM_ACENTO(a);
  if (/sold.?out|esgotad|indispon|unavailable|closed|encerrad/.test(t)) return false;
  if (/avail|dispon|on.?sale|open|aberto|vend/.test(t)) return true;
  return null;
}

function brutoShotgun(x, agora) {
  if (!x || typeof x !== 'object') return null;
  if (x.recordType && x.recordType !== 'event') return null;
  const nome = texto(x.title, 120);
  const { data, hora } = emSP(x.startDate);
  if (!nome || !data) return null;
  if (!ehSP(x.city)) return null;
  const url = link(x.url);
  const fim = emSP(x.endDate);
  const porta = emSP(x.doorTime);
  const inicio = hora || (porta.data === data ? porta.hora : null);
  let lotes = lista(x.tickets)
    .filter((t) => t && typeof t === 'object' && texto(t.name, 80))
    .map((t) => ({ nome: texto(t.name, 80), preco: precoDe(t.price), disponivel: disponivelDe(t.availability) }))
    .filter((t) => t.preco !== null);
  if (!lotes.length) {
    const p = precoDe(x.priceAmount) !== null ? precoDe(x.priceAmount) : precoDe(x.priceDisplay);
    if (p !== null) lotes = [{ nome: 'A partir de', preco: p, disponivel: typeof x.isSoldOut === 'boolean' ? !x.isSoldOut : null }];
  }
  const artistas = nomesDe(x.lineup).length ? nomesDe(x.lineup) : nomesDe(x.artistNames);
  const campos = ['nome', 'data'];
  if (inicio) campos.push('inicio');
  if (x.venueName) campos.push('casa');
  if (lotes.length) campos.push('lotes');
  if (artistas.length) campos.push('lineup');
  return {
    nome,
    produtora: texto(x.organizerName, 120) ? { nome: texto(x.organizerName, 120) } : undefined,
    casa: texto(x.venueName, 120),
    endereco: texto(x.venueAddress),
    cidade: texto(x.city, 80),
    data,
    inicio,
    fim: fim.data ? fim.hora : null,
    lotes,
    lineup: artistas,
    linkCompra: url,
    ehFesta: true,
    ...(url ? { paginas: [pagina('Shotgun', url, agora, campos)] } : {}),
    _generos: nomesDe(x.genreNames),
  };
}

// ---- Resident Advisor ------------------------------------------------------

// "HH:MM" local da cidade (o ator do RA entrega assim) ou, por garantia, um instante ISO.
function horaLocal(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);
  return m ? `${m[1]}:${m[2]}` : emSP(v).hora;
}

function brutoRA(x, agora) {
  if (!x || typeof x !== 'object') return null;
  const nome = texto(x.title, 120);
  // `date` é "AAAA-MM-DD" e `startTime`/`endTime` são "HH:MM" já na hora de lá.
  const data = emSP(x.date).data || emSP(x.startTime).data;
  if (!nome || !data) return null;
  if (!ehSP(x.city)) return null;
  const url = link(x.eventUrl);
  const inicio = horaLocal(x.startTime) || emSP(x.date).hora;
  const fim = horaLocal(x.endTime);
  const artistas = nomesDe(x.allArtists);
  const custo = precoDe(x.cost);
  const ingresso = link(x.ticketUrl);
  const campos = ['nome', 'data'];
  if (inicio) campos.push('inicio');
  if (fim) campos.push('fim');
  if (x.venue) campos.push('casa');
  if (artistas.length) campos.push('lineup');
  if (custo !== null) campos.push('lotes');
  const prods = nomesDe(x.promoters);
  return {
    nome,
    produtora: prods[0] ? { nome: prods[0] } : undefined,
    casa: texto(typeof x.venue === 'object' && x.venue ? x.venue.name : x.venue, 120),
    cidade: texto(x.city, 80),
    data,
    inicio,
    fim,
    preco: custo,
    lineup: artistas,
    linkCompra: x.isTicketed === false ? null : ingresso,
    linkEvento: url,
    ehFesta: true,
    ...(url ? { paginas: [pagina('Resident Advisor', url, agora, campos)] } : {}),
    _generos: nomesDe(x.genres),
  };
}

// ---- Montagem dos conectores ----------------------------------------------

const limpar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)));

// `chamadas({ fila, agora, dias, maxItens, config })` devolve a lista de rodadas do ator:
// a principal e, à parte, a dos links da fila, cada uma com teto próprio.
function criarConector({ id, ator, prefixo, chamadas, campos, mapear, texto: montarTexto, idItem: idDe, categorias }) {
  return {
    id,
    nome: NOME_FONTE[id],
    async coletar(ctx = {}) {
      const { apify, fila, config = {}, agora = () => new Date(), log } = ctx;
      if (!apify) return { itens: [], avisos: [`sem APIFY_TOKEN: ${id} não roda`] };
      const dias = config.dias || 21;
      const maxItens = config.maxItens || 100;
      const itens = [];
      const avisos = [];
      const vistos = new Set();
      let fora = 0;
      for (const ch of chamadas({ fila, agora, dias, maxItens, config })) {
        let brutos;
        try {
          brutos = await apify.rodar(config.ator || ator, ch.entrada, {
            maxItens: ch.maxItens, tetoUsd: ch.tetoUsd, precoPorMil: config.precoPorMil || 3, campos,
          });
        } catch (e) {
          avisos.push(`${id}: ${e.message}`);
          continue;
        }
        for (const x of brutos) {
          const b = mapear(x, agora);
          const chave = x && idDe(x);
          if (!b || !chave) { fora += 1; continue; }
          const idExterno = `${prefixo}:${chave}`.slice(0, 160);
          if (vistos.has(idExterno)) continue;
          vistos.add(idExterno);
          const { _generos, ...bruto } = b;
          itens.push({
            idExterno,
            url: bruto.linkEvento || bruto.linkCompra || null,
            texto: montarTexto(x, bruto),
            categorias: categorias(x, _generos),
            bruto: limpar(bruto),
          });
        }
      }
      if (log && fora) log.info(`[motor] ${id}: ${fora} registro(s) fora (online, outra cidade ou sem data)`);
      return { itens, avisos };
    },
  };
}

const soTexto = (...p) => p.filter(Boolean).join('. ').slice(0, 1500);
const cats = (...v) => [...new Set(v.flat().filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()))].slice(0, 20);

const principal = (config, maxItens, tetoPadrao = 1) => ({ maxItens, tetoUsd: config.tetoUsd || tetoPadrao });
// Os links da fila vão numa chamada à parte, com teto próprio (config.maxFila, config.tetoFilaUsd).
const daFila = (config, entrada) => ({ entrada, maxItens: config.maxFila || 20, tetoUsd: config.tetoFilaUsd || 0.1 });

const sympla = criarConector({
  id: 'sympla-apify',
  ator: 'hypebridge~sympla-events-scraper',
  prefixo: 'sympla',
  campos: ['id', 'name', 'url', 'startDate', 'endDate', 'type', 'category', 'tags', 'venue', 'location', 'organizer', 'ticketSummary'],
  chamadas: ({ fila, maxItens, config }) => {
    const links = doHost(/(^|\.)sympla\.com\.br$/)(fila);
    return [
      { entrada: { startUrls: [{ url: 'https://www.sympla.com.br/eventos/sao-paulo-sp' }], maxItems: maxItens, getEventDetails: true }, ...principal(config, maxItens) },
      ...(links.length ? [daFila(config, { startUrls: [...new Set(links)].map((url) => ({ url })), maxItems: config.maxFila || 20, getEventDetails: true })] : []),
    ];
  },
  mapear: brutoSympla,
  idItem: (x) => (x.id !== undefined && x.id !== null && String(x.id).trim()) || texto(x.url, 200),
  texto: (x, b) => soTexto(b.nome, b.casa && `Em ${b.casa}`, texto(x.category, 60)),
  categorias: (x) => cats(x.category, lista(x.tags).filter((t) => typeof t === 'string')),
});

const shotgun = criarConector({
  id: 'shotgun-apify',
  ator: 'crawloop~shotgun-scraper',
  prefixo: 'shotgun',
  campos: ['recordType', 'id', 'eventSlug', 'title', 'url', 'startDate', 'endDate', 'doorTime', 'venueName', 'venueAddress', 'city', 'genreNames', 'priceAmount', 'priceDisplay', 'isSoldOut', 'artistNames', 'lineup', 'tickets', 'organizerName'],
  chamadas: ({ fila, agora, dias, maxItens, config }) => {
    const links = doHost(/(^|\.)shotgun\.live$/)(fila);
    return [
      { entrada: { mode: 'events', cities: ['sao-paulo'], ...janela(agora, dias), scrapeDetails: true, maxItems: maxItens }, ...principal(config, maxItens) },
      ...(links.length ? [daFila(config, { mode: 'events', scrapeDetails: true, maxItems: config.maxFila || 20, startUrls: links.map((url) => ({ url })) })] : []),
    ];
  },
  mapear: brutoShotgun,
  idItem: (x) => texto(String(x.id ?? ''), 80) || texto(x.eventSlug, 120),
  texto: (x, b) => soTexto(b.nome, b.casa && `Em ${b.casa}`, b.lineup && b.lineup.length && `Line-up: ${b.lineup.slice(0, 8).join(', ')}`),
  categorias: (x, g) => cats(g),
});

const ra = criarConector({
  id: 'ra-apify',
  ator: 'parsebird~resident-advisor-scraper',
  prefixo: 'ra',
  campos: ['eventId', 'title', 'eventUrl', 'date', 'startTime', 'endTime', 'venue', 'city', 'allArtists', 'lineupText', 'genres', 'promoters', 'isTicketed', 'ticketUrl', 'cost'],
  chamadas: ({ agora, dias, maxItens, config }) => [
    { entrada: { mode: 'eventsByCity', countryCode: 'br', city: 'sao-paulo', ...janela(agora, dias), maxItems: maxItens }, ...principal(config, maxItens) },
  ],
  mapear: brutoRA,
  idItem: (x) => texto(String(x.eventId ?? ''), 80),
  texto: (x, b) => soTexto(b.nome, b.casa && `Em ${b.casa}`, texto(x.lineupText, 600)),
  categorias: (x, g) => cats(g),
});

module.exports = { sympla, shotgun, ra, emSP, ehSP, brutoSympla, brutoShotgun, brutoRA };

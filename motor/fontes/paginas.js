'use strict';
// Leitor de páginas (M20, KTD15): abre num navegador as agendas dos sites das
// casas e as páginas da fila (links de plataformas como a Ingresse, que só
// aparecem com JavaScript). Quem abre é o worker Python em coletores/paginas
// (Scrapling), um processo à parte; aqui só se escolhe as URLs, se lê o resultado
// e se monta o item. Se a página traz um Event em JSON-LD (schema.org), o
// mapeamento é direto e não gasta modelo; senão o texto vai ao extrator (U10).
//
// Listagens (decisão do Caio de 24/11/2026: o Apify fica só com o Instagram):
// Shotgun e Sympla são lidos por aqui, uma rodada por dia, só São Paulo e só as
// semanas das apresentações (`janelas`; sem elas, os próximos `dias` dias), com
// pausa entre os pedidos. Onde o site entrega JSON (JSON-LD, __NEXT_DATA__, os
// cartões que o servidor da Sympla embute no HTML) usa-se o JSON, sem navegador.
//
// Bloqueio é recusa (D14 do plano de 24/11/2026): 403, 429 e 503 encerram a
// leitura daquela página, sem trocar de modo, sem proxy e sem repetir. O
// Resident Advisor não tem listagem. A fonte só conta como rodada quando ao menos
// uma página voltou 2xx.
//
// Prova acadêmica (KTD11): fica marcado `pocAcademica`. Sem login, sem cookies.
// Da imagem da página (JSON-LD, Sympla, og:image) só o endereço sai daqui, em
// `item.imagens` com papel `pagina-ingresso`: quem baixa, recodifica e credita é
// o tempo 2 da execução (nucleo/imagens.js). Nenhum `cartaz` sai no bruto.

const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { semCodigo } = require('../nucleo/normalizar');
const { envDoWorker } = require('../nucleo/worker');
const { idPlataforma, ehCascaIngresse } = require('../nucleo/extrair');
const { porRegras } = require('../nucleo/classificar');
const { ehSP } = require('./plataformas');

const PASTA_WORKER = path.join(__dirname, '..', 'coletores', 'paginas');
const HOSTS_PADRAO = ['ingresse.com'];
const CAMPOS = ['nome', 'casa', 'endereco', 'data', 'inicio', 'fim', 'lotes', 'linkCompra', 'lineup', 'estilos', 'idadeMinima'];
// O texto que vai ao modelo e o que se guarda no contexto do item (M31).
const MAX_TEXTO = 6000;
// Status de recusa: a leitura daquela página acaba (D14).
const RECUSA = new Set([403, 429, 503]);
const ESPERA_INGRESSE = 'script[type="application/ld+json"]';
const IMAGEM_NA_FILA = /\.(?:jpe?g|png|webp|gif|svg)(?:[?#].*)?$/i;

function hostDe(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

const doHost = (host, lista) => lista.some((h) => host === h || host.endsWith(`.${h}`));

// URL de imagem não é página de evento: nem entra na fila (M31). Hosts de
// imagem das plataformas (images.*, kraken.*, assets.*) e arquivos de imagem.
function ehUrlDeImagem(u) {
  let url;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  return IMAGEM_NA_FILA.test(url.pathname) || /^(images|kraken|assets|img|cdn)\./i.test(url.hostname);
}

// Como cada página da fila é lida: Sympla e Shotgun entregam JSON no HTML do
// servidor (modo simples, sem navegador); a Ingresse monta o evento no navegador
// (modo dinâmico sem imagem nem estilo, esperando o JSON-LD do evento aparecer);
// Bileto e Guichê no navegador. `agenda` é a página de um produtor da Sympla,
// que lista vários eventos (os cartões do HTML valem como itens).
function planoDaUrl(u, config = {}) {
  const host = hostDe(u) || '';
  let caminho = '';
  try {
    caminho = new URL(u).pathname;
  } catch { /* sem caminho */ }
  if (doHost(host, ['sympla.com.br']) && !host.startsWith('bileto.')) {
    return { modo: 'simples', semRecursos: false, esperar: null, agenda: /^\/produtor\//.test(caminho) };
  }
  if (doHost(host, ['shotgun.live'])) return { modo: 'simples', semRecursos: false, esperar: null, agenda: false };
  if (doHost(host, ['ingresse.com'])) {
    const evento = host === 'ingresse.com';
    return { modo: 'dinamico', semRecursos: true, esperar: evento ? ESPERA_INGRESSE : null, agenda: false };
  }
  return { modo: config.modo || 'dinamico', semRecursos: true, esperar: null, agenda: false };
}

// ---- worker --------------------------------------------------------------

// Chama `uv run python ler.py`, manda o pedido no stdin e lê uma linha JSON por
// URL. Se estourar o tempo, devolve o que já veio e marca o resto como falha.
// O worker abre o Chromium como neto do `uv`: por isso o filho nasce num grupo
// próprio (detached) e o tempo-limite mata o grupo inteiro, sem esperar o
// `close` (que só chegaria quando o último neto saísse).
function lerPaginasPeloWorker(urls, { modo = 'dinamico', timeoutMs = 30000, pausaMs = 0, semRecursos = false, esperar = null, uv = process.env.UV || 'uv', limiteMs = null, aoLer = null } = {}) {
  return new Promise((resolve) => {
    const limite = limiteMs || (timeoutMs + pausaMs) * urls.length + 60000;
    const env = envDoWorker();
    const filho = spawn(uv, ['run', '--project', PASTA_WORKER, 'python', path.join(PASTA_WORKER, 'ler.py')], { env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const linhas = [];
    let resto = '';
    let falha = null;
    let pronto = false;
    const terminar = (codigo) => {
      if (pronto) return;
      pronto = true;
      clearTimeout(timer);
      guardar(resto);
      if (!falha && codigo !== 0 && linhas.length < urls.length) falha = `o leitor saiu com código ${codigo}`;
      const vistas = new Set(linhas.map((l) => l.url));
      for (const u of urls) {
        if (!vistas.has(u)) linhas.push({ url: u, final: u, status: 0, titulo: '', texto: '', jsonld: [], links: [], dados: null, meta: null, erro: falha || 'sem resposta do leitor' });
      }
      resolve(linhas);
    };
    const timer = setTimeout(() => {
      falha = 'o leitor não terminou a tempo';
      try { process.kill(-filho.pid, 'SIGKILL'); } catch { try { filho.kill('SIGKILL'); } catch { /* já saiu */ } }
      filho.stdout.destroy();
      filho.stderr.destroy();
      terminar(null);
    }, limite);
    function guardar(l) {
      if (!l.trim()) return;
      try {
        linhas.push(JSON.parse(l));
      } catch { return; /* log solto do Scrapling */ }
      // Uma página lida: a execução bate (a trava não a abandona num lote longo).
      if (typeof aoLer === 'function') {
        try { aoLer(); } catch { /* o batimento não derruba a leitura */ }
      }
    }
    filho.stdout.on('data', (d) => {
      resto += d;
      const partes = resto.split('\n');
      resto = partes.pop();
      partes.forEach(guardar);
    });
    filho.stderr.on('data', () => {});
    filho.on('error', (e) => {
      falha = `não consegui iniciar o leitor (${e.code || e.message})`;
      terminar(null);
    });
    filho.on('close', (codigo) => terminar(codigo));
    filho.stdin.on('error', () => {});
    filho.stdin.end(JSON.stringify({ urls, modo, timeoutMs, pausaMs, semRecursos, esperar }));
  });
}

// ---- JSON-LD -------------------------------------------------------------

const lista = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const ehEvento = (o) => lista(o && o['@type']).some((t) => typeof t === 'string' && /Event$/.test(t));

// Todos os objetos Event do JSON-LD, inclusive dentro de @graph, listas e ItemList.
function eventosDoJsonld(objetos) {
  const saida = [];
  const visitar = (o, fundo) => {
    if (!o || typeof o !== 'object' || fundo > 6) return;
    if (Array.isArray(o)) return o.forEach((x) => visitar(x, fundo + 1));
    if (ehEvento(o)) saida.push(o);
    for (const k of ['@graph', 'itemListElement', 'item', 'event', 'subEvent']) if (o[k]) visitar(o[k], fundo + 1);
  };
  visitar(objetos, 0);
  return saida;
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#038;': '&', '&nbsp;': ' ' };
function limpo(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#0?39|#038);/g, (m) => ENTIDADES[m]).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return t || null;
}

// "2026-11-28T00:00:00+00:00" -> { data: "2026-11-27", hora: "21:00" } em São Paulo;
// só a data -> { data, hora: null }; sem fuso na hora -> já é horário de São Paulo.
function quando(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { data: t, hora: null };
  const m = t.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  if (!m[3]) return { data: m[1], hora: m[2] };
  const d = new Date(Date.parse(t));
  if (Number.isNaN(d.getTime())) return null;
  const sp = new Date(d.getTime() - 3 * 3600e3).toISOString();
  return { data: sp.slice(0, 10), hora: sp.slice(11, 16) };
}

function enderecoDe(loc) {
  if (!loc) return null;
  const a = loc.address;
  if (typeof a === 'string') return limpo(a);
  if (a && typeof a === 'object') {
    const rua = a.streetAddress;
    const loc_ = a.addressLocality;
    return limpo(rua && loc_ && String(rua).includes(loc_) ? rua : [rua, loc_].filter(Boolean).join(', '));
  }
  return null;
}

function ofertas(ev) {
  const saida = [];
  for (const o of lista(ev.offers)) {
    if (!o || typeof o !== 'object') continue;
    for (const x of o['@type'] === 'AggregateOffer' && o.offers ? lista(o.offers) : [o]) {
      const preco = x.price !== undefined && x.price !== '' ? x.price : x.lowPrice;
      if (preco === undefined || preco === '') continue;
      const disp = typeof x.availability === 'string' ? x.availability : '';
      saida.push({
        nome: limpo(x.name) || 'Ingresso',
        preco: typeof preco === 'string' ? preco.replace(',', '.') : preco,
        disponivel: /InStock|LimitedAvailability|PreOrder/.test(disp) ? true : /SoldOut|OutOfStock|Discontinued/.test(disp) ? false : null,
        url: typeof x.url === 'string' ? x.url : null,
      });
    }
  }
  return saida;
}

// "Rua X, 95 - Pinheiros, São Paulo - SP, 05432-000, Brasil" -> { cidade: "São Paulo", uf: "SP" }.
// Sem esse padrão, nada se afirma: a listagem já é de uma cidade.
function cidadeDoEndereco(texto) {
  if (typeof texto !== 'string') return {};
  const todas = [...texto.matchAll(/,\s*([^,]+?)\s+-\s+([A-Z]{2})\b/g)];
  const m = todas[todas.length - 1];
  return m ? { cidade: m[1].trim(), uf: m[2] } : {};
}

const textoDe = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const limpar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const SEM_ACENTO = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Casa que é o nome da cidade ou o texto "São Paulo, SP" não é casa: a Ingresse
// às vezes põe a cidade no lugar do local.
function casaDeVerdade(casa, cidade) {
  if (!casa) return null;
  const c = SEM_ACENTO(casa).replace(/[,\-/]\s*sp$/, '').trim();
  if (c === 'sao paulo' || c === 'sp' || (cidade && c === SEM_ACENTO(cidade))) return null;
  return casa;
}

const numero = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
// Coordenada só com os dois lados e dentro do mundo; a caixa de São Paulo quem
// confere é a normalização (U9).
const geoDe = (lat, lng) => {
  const a = numero(lat);
  const b = numero(lng);
  return a !== null && b !== null && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: a, lng: b } : null;
};
const cepDe = (v) => {
  const m = String(v || '').match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
};

// As imagens que o schema.org anuncia (string, lista ou ImageObject), só https.
function urlsDeImagem(v) {
  const saida = [];
  for (const x of lista(v)) {
    const u = typeof x === 'string' ? x : x && typeof x === 'object' ? x.url || x.contentUrl : null;
    if (typeof u === 'string' && /^https:\/\//i.test(u.trim())) saida.push(u.trim());
  }
  return saida;
}

// Um Event do schema.org -> o bruto de normalizarItem. Sem nome ou sem data, null.
// A imagem não entra no bruto: vai à parte (`imagens`), para o tempo 2 baixar.
function brutoDeEvento(ev) {
  const nome = limpo(ev.name);
  const ini = quando(ev.startDate);
  if (!nome || !ini) return null;
  const fimQ = quando(ev.endDate);
  const loc = lista(ev.location)[0];
  const os_ = ofertas(ev);
  const compra = os_.find((o) => o.url);
  const endereco = enderecoDe(loc);
  const rua = loc && loc.address && typeof loc.address === 'object' ? loc.address.streetAddress : endereco;
  const { cidade, uf } = cidadeDoEndereco(rua);
  const org = lista(ev.organizer)[0];
  const prod = org && typeof org === 'object' ? limpo(org.name) : limpo(org);
  const linkCompra = compra ? semCodigo(compra.url) : null;
  const geo = loc && loc.geo ? geoDe(loc.geo.latitude, loc.geo.longitude) : null;
  const cep = cepDe(loc && loc.address && typeof loc.address === 'object' ? loc.address.postalCode : null) || cepDe(rua);
  const id = [ev['@id'], ev.url].find((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  const bruto = limpar({
    nome,
    produtora: prod ? { nome: prod } : null,
    casa: casaDeVerdade(loc && typeof loc === 'object' ? limpo(loc.name) : null, cidade),
    endereco,
    cidade: cidade || null,
    cep,
    geo,
    data: ini.data,
    inicio: ini.hora,
    fim: fimQ && fimQ.hora && fimQ.data >= ini.data ? fimQ.hora : null,
    lotes: os_.map(({ nome: n, preco, disponivel }) => ({ nome: n, preco, disponivel })),
    linkCompra,
    lineup: lista(ev.performer).map((p) => limpo(typeof p === 'string' ? p : p && p.name)).filter(Boolean),
  });
  const categorias = [...lista(ev.genre), ...String(ev.keywords || '').split(',')].map((g) => limpo(typeof g === 'string' ? g : null)).filter(Boolean).slice(0, 8);
  return { bruto, uf: uf || null, idProprio: id ? semCodigo(id) : null, descricao: limpo(ev.description), imagens: urlsDeImagem(ev.image), categorias };
}

// ---- Sympla ---------------------------------------------------------------

const nomeSympla = (n) => limpo(n);

function enderecoSympla(a) {
  if (!a) return null;
  const rua = [a.address, a.addressNum && a.addressNum !== '0' ? a.addressNum : null].filter(Boolean).join(', ');
  return limpo([rua, a.neighborhood].filter(Boolean).join(' - '));
}

// O __NEXT_DATA__ da página de evento da Sympla: props.pageProps.hydrationData.eventHydration.event.
// Datas em São Paulo (startDateMultiFormat.ISO8601, com -03:00). Os lotes e os
// preços a página carrega no navegador e não vêm no HTML do servidor (conferido
// em 24/11/2026): sem preço aqui. CEP, latitude e longitude vêm do endereço, e a
// imagem do banner (logoLarge, senão logoUrl).
// Cancelado, não publicado, privado ou online: null.
function brutoDeNextDataSympla(dados) {
  const ev = dados && dados.props && dados.props.pageProps && dados.props.pageProps.hydrationData
    && dados.props.pageProps.hydrationData.eventHydration && dados.props.pageProps.hydrationData.eventHydration.event;
  if (!ev || typeof ev !== 'object') return null;
  if (ev.cancelled === true || ev.published === false || ev.privateEvent === true || ev.onlineInfo) return null;
  const iso = (m, d) => (m && m.ISO8601) || (typeof d === 'string' ? d.replace(' ', 'T') : null);
  const ini = quando(iso(ev.startDateMultiFormat, ev.startDate));
  const nome = nomeSympla(ev.name);
  if (!nome || !ini) return null;
  const fim = quando(iso(ev.endDateMultiFormat, ev.endDate));
  const a = ev.eventsAddress || {};
  const url = textoDe(ev.newUrl);
  const geoSympla = a.geolocation && typeof a.geolocation === 'object' ? geoDe(a.geolocation.latitude, a.geolocation.longitude) : null;
  const cidade = limpo(a.city);
  const bruto = limpar({
    nome,
    produtora: ev.eventsHost && limpo(ev.eventsHost.name) ? { nome: limpo(ev.eventsHost.name) } : null,
    casa: casaDeVerdade(limpo(a.name), cidade),
    endereco: enderecoSympla(a),
    cidade,
    cep: cepDe(a.zipCode),
    geo: geoSympla,
    data: ini.data,
    inicio: ini.hora,
    fim: fim && fim.hora && fim.data >= ini.data ? fim.hora : null,
    linkCompra: url ? semCodigo(url) : null,
  });
  const img = ev.images && typeof ev.images === 'object' ? ev.images : {};
  const imagens = urlsDeImagem([img.logoLarge, img.logoUrl, ev.logoUrl]).slice(0, 1);
  return { bruto, uf: textoDe(a.state), idProprio: url ? semCodigo(url) : null, descricao: limpo(ev.strippedDetail), imagens, categorias: [] };
}

// Um cartão da listagem da Sympla (response.data do HTML do servidor): datas em UTC.
function brutoDeCartaoSympla(c) {
  if (!c || typeof c !== 'object' || c.company !== 'sympla') return null;
  const url = textoDe(c.url) && textoDe(c.url).replace(/[?#].*$/, ''); // sem algoliaID nem mp_*
  if (!url || !/^https:\/\/www\.sympla\.com\.br\/evento\//.test(url)) return null;
  const ini = quando(c.start_date);
  const nome = nomeSympla(c.name);
  if (!nome || !ini) return null;
  const fim = quando(c.end_date);
  const l = c.location || {};
  const cidade = limpo(l.city);
  const bruto = limpar({
    nome,
    produtora: c.organizer && limpo(c.organizer.name) ? { nome: limpo(c.organizer.name) } : null,
    casa: casaDeVerdade(limpo(l.name), cidade),
    endereco: enderecoSympla({ address: l.address, addressNum: l.address_num, neighborhood: l.neighborhood }),
    cidade,
    cep: cepDe(l.zip_code),
    geo: geoDe(l.lat, l.lon),
    data: ini.data,
    inicio: ini.hora,
    fim: fim && fim.hora && fim.data >= ini.data ? fim.hora : null,
    linkCompra: semCodigo(url),
  });
  const im = c.images && typeof c.images === 'object' ? c.images : {};
  return { bruto, uf: textoDe(l.state), idProprio: semCodigo(url), descricao: null, url: semCodigo(url), imagens: urlsDeImagem([im.lg, im.original]).slice(0, 1), categorias: [] };
}

// Os cartões que o worker tira do HTML (dados.rsc[].data), sem repetir.
function cartoesSympla(dados) {
  const vistos = new Map();
  for (const r of lista(dados && dados.rsc)) {
    for (const c of lista(r && r.data)) {
      const m = brutoDeCartaoSympla(c);
      if (m && !vistos.has(m.url)) vistos.set(m.url, m);
    }
  }
  return [...vistos.values()];
}

// ---- filtros e itens ------------------------------------------------------

const dataSP = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const somarDias = (d, n) => new Date(d.getTime() + n * 86400e3);

// Dentro de hoje..hoje+dias (datas de São Paulo)? `ate` null = sem teto (só
// descarta o que passou). Com `janelas` ([[de, ate], ...]), vale quem cai em
// alguma delas e ainda não passou.
function naJanela(data, de, ate, janelas = null) {
  if (!data) return true; // sem data o normalizador decide
  if (data < de) return false;
  if (janelas && janelas.length) return janelas.some(([a, b]) => data >= a && data <= b);
  return !ate || data <= ate;
}

function campos(bruto) {
  return CAMPOS.filter((c) => {
    const v = bruto[c];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
  });
}

const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hashDe = (bruto) => crypto.createHash('sha1').update(`${slug(bruto.nome)}|${bruto.data || ''}`).digest('hex').slice(0, 10);

const TIPO_PLATAFORMA = [[/(^|\.)ingresse\.com$/, 'Ingresse'], [/(^|\.)shotgun\.live$/, 'Shotgun'], [/(^|\.)sympla\.com\.br$/, 'Sympla'], [/(^|\.)guicheweb\.com\.br$/, 'Guichê Web']];
// Plataformas que só vendem festa e show: o modelo (ou o classificador) decide
// qual é qual, com esta linha de contexto (M24).
const LINHA_DA_PLATAFORMA = { Shotgun: 'Plataforma: Shotgun (vende festas e shows)' };

function nomeDaPagina(host) {
  const t = TIPO_PLATAFORMA.find(([re]) => re.test(host));
  return t ? { tipo: 'ingresso', nome: t[1] } : { tipo: 'oficial', nome: host };
}

// idExterno: a URL do evento (ou o @id) quando a página é de um evento só; uma
// página com várias festas (agenda de casa) usa um hash de slug(nome)+data, que
// não depende da posição: se a primeira some, a segunda mantém o vínculo.
function idDe({ pagina, bruto, idProprio, unico }) {
  const base = semCodigo(pagina.url);
  if (unico) return `pagina:${base}`;
  if (idProprio && idProprio !== base) return `pagina:${idProprio}`;
  return `pagina:${base}#${hashDe(bruto)}`;
}

// As imagens do item: só da página de um evento só (a de uma agenda não diz de
// qual festa é a arte). O endereço do CDN não vai a lugar nenhum fora do
// download; o app mostra o link da página.
function imagensDoItem({ urls, link, credito, nome }) {
  const vistas = new Set();
  const saida = [];
  for (const u of urls) {
    if (!u || vistas.has(u)) continue;
    vistas.add(u);
    saida.push({ url: u, papel: 'pagina-ingresso', origem: link, credito: `Divulgação · ${credito || nome}`, leitura: null });
    break; // uma só: a principal; as outras são a mesma arte em outro tamanho
  }
  return saida;
}

function itemDe({ pagina, bruto, texto, agora, idProprio = null, unico = false, lidoPorModelo = false, imagens = [], categorias = [] }) {
  const link = semCodigo(pagina.final || pagina.url) || semCodigo(pagina.url);
  const host = hostDe(link) || '';
  const { tipo, nome } = nomeDaPagina(host);
  const limpoBruto = { ...bruto };
  delete limpoBruto.cartaz;
  if (limpoBruto.linkCompra) limpoBruto.linkCompra = semCodigo(limpoBruto.linkCompra);
  // A página só vira linkEvento quando é de um evento só: a URL de uma agenda
  // com várias festas juntaria todas no vínculo por link (revisão de 24/11).
  const linkEvento = semCodigo(limpoBruto.linkEvento) || (unico ? link : null);
  // O id da festa na plataforma: do link de compra, senão da própria página.
  const idPlat = limpoBruto.idPlataforma || (limpoBruto.linkCompra && idPlataforma(limpoBruto.linkCompra)) || (unico && tipo === 'ingresso' ? idPlataforma(link) : null);
  const linhaPlat = LINHA_DA_PLATAFORMA[nome];
  const item = {
    idExterno: idDe({ pagina, bruto: limpoBruto, idProprio, unico }),
    url: link,
    texto: [linhaPlat, texto].filter(Boolean).join('\n').slice(0, MAX_TEXTO),
    bruto: {
      ...limpoBruto,
      ...(idPlat ? { idPlataforma: idPlat } : {}),
      linkEvento,
      paginas: [{ tipo, nome, url: link, lidoEm: agora().toISOString(), campos: campos(limpoBruto) }],
    },
  };
  if (categorias.length) item.categorias = categorias;
  if (lidoPorModelo) item.lidoPorModelo = true;
  if (unico && imagens.length) {
    const prod = limpoBruto.produtora && limpoBruto.produtora.nome;
    const com = imagensDoItem({ urls: imagens, link, credito: prod, nome });
    if (com.length) item.imagens = com;
  }
  return item;
}

// O que o modelo leu de uma festa -> o bruto. `ehFesta` e `tipo` são a leitura
// dele e valem 80 na prioridade do campo (KTD2).
function festaParaBruto(f) {
  return limpar({
    nome: f.nome,
    ehFesta: f.ehFesta,
    tipo: f.tipo,
    data: f.data,
    inicio: f.inicio,
    fim: f.fim,
    casa: casaDeVerdade(f.casa, f.cidade),
    endereco: f.endereco,
    cidade: f.cidade,
    uf: f.uf,
    lotes: f.lotes,
    linkCompra: f.linkCompra,
    idPlataforma: f.idPlataforma,
    lineup: f.lineup,
    estilos: f.estilos,
    idadeMinima: f.idadeMinima,
  });
}

function urlsDaConfig(config, fila) {
  const hosts = (config.hosts && config.hosts.length ? config.hosts : HOSTS_PADRAO).map((h) => h.toLowerCase().replace(/^www\./, ''));
  const alvos = new Set();
  for (const a of config.agendas || []) {
    const u = typeof a === 'string' ? a : a && a.url;
    if (u && hostDe(u)) alvos.add(u);
  }
  for (const u of fila || []) {
    const h = hostDe(u);
    if (h && doHost(h, hosts) && !ehUrlDeImagem(u)) alvos.add(u);
  }
  return [...alvos];
}

// Padrões de link de evento de cada plataforma (texto de regex; `padraoLink` da listagem manda).
const PADRAO_LINK = {
  shotgun: '^https://shotgun\\.live/(?:[a-z]{2}(?:-[a-z]{2})?/)?events/[^/?#]+/?(?:[?#].*)?$',
  sympla: '^https://www\\.sympla\\.com\\.br/evento/[^/?#]+/\\d+',
};

function linksDeEvento(pagina, padrao) {
  let re;
  try { re = new RegExp(padrao); } catch { return []; }
  const vistos = new Map();
  for (const l of pagina.links || []) {
    if (!re.test(l)) continue;
    const u = semCodigo(l);
    if (!u) continue;
    const limpa = u.replace(/\?.*$/, '').replace(/#.*$/, '');
    if (!vistos.has(limpa)) vistos.set(limpa, limpa);
  }
  return [...vistos.values()];
}

const doisXX = (p) => p && !p.erro && p.status >= 200 && p.status < 300;

// Por que uma página não vira item, em uma frase. Bloqueio é recusa (D14).
function motivoDaFalha(p) {
  if (p && RECUSA.has(p.status)) return `recusou o acesso (${p.status}); leitura encerrada, sem nova tentativa nem outro modo`;
  return (p && p.erro) || `respondeu ${p && p.status}`;
}

module.exports = {
  id: 'paginas',
  nome: 'Páginas lidas no navegador (Scrapling)',
  pocAcademica: true,
  eventosDoJsonld,
  brutoDeEvento,
  brutoDeNextDataSympla,
  cartoesSympla,
  lerPaginasPeloWorker,
  planoDaUrl,
  ehUrlDeImagem,
  naJanela,
  async coletar(ctx) {
    const config = ctx.config || {};
    const itens = [];
    const avisos = [];
    const ler = ctx.lerPaginas || lerPaginasPeloWorker;
    const dormir = ctx.dormir || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const pausaMs = config.pausaMs === undefined ? 2000 : config.pausaMs;
    const timeoutMs = config.timeoutMs || 30000;
    const hoje = dataSP(ctx.agora());
    const limite = dataSP(somarDias(ctx.agora(), config.dias || 14));
    const janelas = Array.isArray(config.janelas) && config.janelas.length ? config.janelas : null;
    const vistos = new Set();
    let pedidos = 0;
    let paginasLidas = 0;
    let paginasOk = 0;
    // O batimento da execução (U8): antes e depois de cada lote, a cada página
    // que o leitor devolve e a cada página mapeada. Sem ele, um lote de mais de
    // 10 min perdia a trava e uma segunda execução rodava junto.
    const bater = () => {
      if (typeof ctx.batimento === 'function') ctx.batimento();
    };

    // Um pedido ao leitor, com pausa antes de todo pedido depois do primeiro.
    async function lerLote(urls, { modo, semRecursos = false, esperar = null }) {
      if (pedidos && pausaMs) await dormir(pausaMs);
      bater();
      pedidos += 1;
      paginasLidas += urls.length;
      const opcoes = { modo, timeoutMs, pausaMs, aoLer: bater };
      if (semRecursos) opcoes.semRecursos = true;
      if (esperar) opcoes.esperar = esperar;
      const lidas = await ler(urls, opcoes);
      bater();
      paginasOk += (lidas || []).filter(doisXX).length;
      return lidas;
    }

    function aceitar(item, { uf, cidade, janela }) {
      const b = item.bruto;
      if (!ehSP(cidade || b.cidade, uf || b.uf)) return false;
      if (!naJanela(b.data, hoje, janela ? limite : null, janela ? janelas : null)) return false;
      if (vistos.has(item.idExterno)) return false;
      vistos.add(item.idExterno);
      return true;
    }

    // As imagens do item: o JSON da página primeiro, o og:image por último.
    const comOg = (m, p) => {
      const og = p.meta && (p.meta.ogImage || p.meta.twitterImage);
      return og && /^https:\/\//i.test(og) ? [...m.imagens, og] : m.imagens;
    };

    // Lê as páginas devolvidas e monta os itens. `cartoes` (Sympla) serve de reserva.
    async function mapear(paginas, { janela, unico, agenda = false, cartoes = new Map() }) {
      for (const p of paginas || []) {
        bater();
        if (!doisXX(p)) {
          avisos.push(`${p.url}: ${motivoDaFalha(p)}`);
          continue;
        }
        const ld = eventosDoJsonld(p.jsonld || []).map((e) => brutoDeEvento(e)).filter(Boolean);
        const nd = brutoDeNextDataSympla(p.dados);
        const cartao = cartoes.get(semCodigo(p.url)) || null;
        // Página de produtor da Sympla: os cartões do HTML são os itens.
        const dosCartoes = agenda ? cartoesSympla(p.dados) : [];
        const diretos = dosCartoes.length ? dosCartoes : ld.length ? ld : nd ? [nd] : cartao ? [cartao] : [];
        if (diretos.length) {
          const um = unico && diretos.length === 1;
          for (const d of diretos) {
            const imagens = d.imagens && d.imagens.length ? (um ? comOg({ imagens: d.imagens }, p) : d.imagens) : (um ? comOg({ imagens: [] }, p) : []);
            const item = itemDe({
              pagina: dosCartoes.length ? { ...p, url: d.url, final: d.url } : p,
              bruto: d.bruto,
              texto: d.descricao || [d.bruto.nome, d.bruto.casa].filter(Boolean).join('. '),
              agora: ctx.agora,
              idProprio: d.idProprio,
              unico: dosCartoes.length ? true : um,
              imagens,
              categorias: d.categorias || [],
            });
            aceitar(item, { uf: d.uf, janela }) && itens.push(item);
          }
          continue;
        }
        // A casca da Ingresse (o evento ainda não carregou): nem ao modelo nem
        // ao cache; a próxima execução tenta de novo.
        if (ehCascaIngresse({ url: p.final || p.url, titulo: p.titulo, texto: p.texto })) {
          avisos.push(`${p.url}: a Ingresse devolveu só a casca (o evento não carregou); tento de novo na próxima execução`);
          continue;
        }
        if (!ctx.extrator) {
          avisos.push(`${p.url}: sem JSON-LD e sem extrator`);
          continue;
        }
        let lido = null;
        try {
          lido = await ctx.extrator.lerPagina({ url: p.final || p.url, titulo: p.titulo, texto: p.texto });
        } catch (e) {
          avisos.push(`${p.url}: leitura falhou (${e.message})`);
          continue;
        }
        if (!lido) {
          avisos.push(`${p.url}: sem leitura`);
          continue;
        }
        const festas = lido.festas || [];
        for (const f of festas) {
          const bruto = festaParaBruto(f);
          const um = unico && festas.length === 1;
          const item = itemDe({
            pagina: p, bruto, texto: p.titulo, agora: ctx.agora, unico: um, lidoPorModelo: true,
            imagens: um ? comOg({ imagens: [] }, p) : [],
          });
          aceitar(item, { uf: f.uf, cidade: f.cidade, janela }) && itens.push(item);
        }
      }
    }

    // 1. Agendas de casas e a fila de links: páginas avulsas, cada uma no modo
    // que o site pede (planoDaUrl). A fila só leva os hosts de config.hosts.
    const urls = urlsDaConfig(config, ctx.fila);
    if (urls.length) {
      const agendas = new Set((config.agendas || []).map((a) => (typeof a === 'string' ? a : a && a.url)));
      const grupos = new Map(); // chave do plano -> { plano, urls }
      for (const u of urls) {
        const ehAgenda = agendas.has(u);
        const plano = ehAgenda ? { modo: config.modo || 'dinamico', semRecursos: false, esperar: null, agenda: false } : planoDaUrl(u, config);
        const chave = JSON.stringify([ehAgenda, plano.modo, plano.semRecursos, plano.esperar, plano.agenda]);
        if (!grupos.has(chave)) grupos.set(chave, { plano, ehAgenda, urls: [] });
        grupos.get(chave).urls.push(u);
      }
      for (const { plano, ehAgenda, urls: grupo } of grupos.values()) {
        let paginas;
        try {
          paginas = await lerLote(grupo, plano);
        } catch (e) {
          avisos.push(`leitor de páginas falhou: ${e.message}`);
          continue;
        }
        await mapear(paginas, { janela: false, unico: !ehAgenda && !plano.agenda, agenda: plano.agenda });
      }
    }

    // 2. Listagens de plataformas (Shotgun, Sympla): a página da cidade, depois cada evento.
    for (const lg of config.listagens || []) {
      if (!lg || !lg.url || !hostDe(lg.url)) continue;
      const modo = lg.modo || 'simples';
      const maxEventos = lg.maxEventos || 40;
      const padrao = lg.padraoLink || PADRAO_LINK[lg.id] || PADRAO_LINK.shotgun;
      // A listagem pagina por `?page=N` (conferido em 24/11/2026 na Sympla e no
      // Shotgun): lê até `paginas` páginas, para na primeira que não traz evento
      // novo ou que não volta 2xx (bloqueio encerra, sem repetir).
      const maxPaginas = Math.max(1, Math.min(lg.paginas || 1, 10));
      const cartoes = new Map();
      const achados = new Set();
      let falhou = false;
      for (let n = 1; n <= maxPaginas; n += 1) {
        const urlPagina = n === 1 ? lg.url : `${lg.url}${lg.url.includes('?') ? '&' : '?'}page=${n}`;
        let pl;
        try {
          pl = (await lerLote([urlPagina], { modo }))[0];
        } catch (e) {
          avisos.push(`${lg.id || lg.url}: leitor falhou (${e.message})`);
          falhou = n === 1;
          break;
        }
        if (!doisXX(pl)) {
          avisos.push(`${lg.id || lg.url}${n > 1 ? ` (página ${n})` : ''}: ${motivoDaFalha(pl)}`);
          falhou = n === 1;
          break;
        }
        const antes = achados.size;
        for (const c of cartoesSympla(pl.dados)) {
          cartoes.set(c.url, c);
          achados.add(c.url);
        }
        for (const u of linksDeEvento(pl, padrao)) achados.add(u);
        if (achados.size === antes) break;
      }
      if (falhou) continue;
      let alvos = [...achados].filter((u) => new RegExp(padrao).test(u));
      // Os cartões já trazem data e cidade: o que está fora da janela nem é lido.
      alvos = alvos.filter((u) => {
        const c = cartoes.get(u);
        return !c || (ehSP(c.bruto.cidade, c.uf) && naJanela(c.bruto.data, hoje, limite, janelas));
      }).slice(0, maxEventos);
      if (!alvos.length) {
        avisos.push(`${lg.id || lg.url}: nenhum evento na listagem`);
        continue;
      }
      let paginas;
      try {
        paginas = await lerLote(alvos, { modo });
      } catch (e) {
        avisos.push(`${lg.id || lg.url}: leitor falhou (${e.message})`);
        continue;
      }
      await mapear(paginas, { janela: true, unico: true, cartoes });
    }

    // 3. Preço da Sympla: o HTML do servidor não traz os lotes (a página os monta
    // no navegador e o JSON-LD vem com `offers` vazio), então as festas da Sympla
    // sem preço que as regras leem como festa passam pelo navegador, e o extrator
    // tira os lotes do texto. Só os lotes: o resto continua o que o JSON disse.
    // Sem extrator (sem chave ou teto), ou com `precoSympla: false`, fica sem preço.
    if (ctx.extrator && config.precoSympla !== false) {
      const sympla = itens.filter((i) => /^pagina:https:\/\/www\.sympla\.com\.br\/evento\//.test(i.idExterno)
        && !(i.bruto.lotes || []).length
        && porRegras({ nome: i.bruto.nome, casa: i.bruto.casa, lineup: i.bruto.lineup, texto: i.texto }).ehFesta)
        .slice(0, config.maxPrecosSympla || 40);
      if (sympla.length) {
        let navegadas = [];
        try {
          navegadas = await lerLote(sympla.map((i) => i.url), { modo: 'dinamico', semRecursos: true });
        } catch (e) {
          avisos.push(`sympla: o preço não veio (${e.message})`);
        }
        const porUrl = new Map(sympla.map((i) => [i.url, i]));
        for (const p of navegadas) {
          bater();
          const item = porUrl.get(semCodigo(p.url)) || porUrl.get(p.url);
          if (!item) continue;
          if (!doisXX(p)) {
            avisos.push(`${p.url}: ${motivoDaFalha(p)}`);
            continue;
          }
          let lido = null;
          try {
            lido = await ctx.extrator.lerPagina({ url: p.final || p.url, titulo: p.titulo, texto: p.texto });
          } catch (e) {
            avisos.push(`${p.url}: leitura do preço falhou (${e.message})`);
            continue;
          }
          const festas = (lido && lido.festas) || [];
          const f = festas.find((x) => x.data === item.bruto.data) || (festas.length === 1 ? festas[0] : null);
          if (f && f.lotes && f.lotes.length) {
            item.bruto.lotes = f.lotes;
            const pg = item.bruto.paginas[0];
            if (pg && !pg.campos.includes('lotes')) pg.campos.push('lotes');
          }
        }
      }
    }

    if (ctx.log) ctx.log.info(`[motor] paginas: ${paginasLidas} páginas (${paginasOk} com 2xx), ${itens.length} festas`);
    // Sem nenhuma página 2xx (uv ausente, leitor caindo, tudo bloqueado), a
    // fonte não conta como rodada e tenta de novo na próxima execução.
    if (paginasLidas > 0 && paginasOk === 0) avisos.push('paginas: nenhuma página voltou 2xx; a rodada não conta');
    return { itens, avisos, rodou: paginasOk > 0 };
  },
};

'use strict';
// Leitor de páginas (M20, KTD15): abre num navegador as agendas dos sites das
// casas e as páginas da fila (links de plataformas como a Ingresse, que só
// aparecem com JavaScript). Quem abre é o worker Python em coletores/paginas
// (Scrapling), um processo à parte; aqui só se escolhe as URLs, se lê o resultado
// e se monta o item. Se a página traz um Event em JSON-LD (schema.org), o
// mapeamento é direto e não gasta modelo; senão o texto vai ao extrator (U10).
//
// Listagens (decisão do Caio de 24/11/2026: o Apify fica só com o Instagram):
// Shotgun, Sympla e Resident Advisor são lidos por aqui, uma rodada por dia,
// só São Paulo e só os próximos `dias` dias, com pausa entre os pedidos. Onde o
// site entrega JSON (JSON-LD, __NEXT_DATA__, os cartões que o servidor da
// Sympla embute no HTML) usa-se o JSON, sem navegador. Proxy só na listagem
// marcada `proxy: true`, com a URL em FINDE_PROXY_URL (nunca vai a log nem a aviso).
//
// Prova acadêmica (KTD11): fica marcado `pocAcademica`. Sem login, sem cookies.
// Não se guarda nem se republica imagem: nenhum `cartaz` sai daqui.

const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { semCodigo } = require('../nucleo/normalizar');
const { ehSP } = require('./plataformas');

const PASTA_WORKER = path.join(__dirname, '..', 'coletores', 'paginas');
const HOSTS_PADRAO = ['ingresse.com'];
const CAMPOS = ['nome', 'casa', 'endereco', 'data', 'inicio', 'fim', 'lotes', 'linkCompra', 'lineup', 'estilos', 'idadeMinima'];

function hostDe(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

const doHost = (host, lista) => lista.some((h) => host === h || host.endsWith(`.${h}`));

// ---- worker --------------------------------------------------------------

// Chama `uv run python ler.py`, manda o pedido no stdin e lê uma linha JSON por
// URL. Se estourar o tempo, devolve o que já veio e marca o resto como falha.
// O worker abre o Chromium como neto do `uv`: por isso o filho nasce num grupo
// próprio (detached) e o tempo-limite mata o grupo inteiro, sem esperar o
// `close` (que só chegaria quando o último neto saísse).
function lerPaginasPeloWorker(urls, { modo = 'dinamico', timeoutMs = 30000, pausaMs = 0, proxy = null, uv = process.env.UV || 'uv', limiteMs = null } = {}) {
  return new Promise((resolve) => {
    const limite = limiteMs || (timeoutMs + pausaMs) * urls.length + 60000;
    const env = { ...process.env, PATH: `${path.join(os.homedir(), '.local', 'bin')}${path.delimiter}${process.env.PATH || ''}` };
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
        if (!vistas.has(u)) linhas.push({ url: u, final: u, status: 0, titulo: '', texto: '', jsonld: [], links: [], dados: null, erro: falha || 'sem resposta do leitor' });
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
      } catch { /* log solto do Scrapling */ }
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
    filho.stdin.end(JSON.stringify({ urls, modo, timeoutMs, pausaMs, proxy }));
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

// Um Event do schema.org -> o bruto de normalizarItem. Sem nome ou sem data, null.
// Imagem não entra (a prova não guarda nem republica cartaz).
function brutoDeEvento(ev) {
  const nome = limpo(ev.name);
  const ini = quando(ev.startDate);
  if (!nome || !ini) return null;
  const fimQ = quando(ev.endDate);
  const loc = lista(ev.location)[0];
  const os_ = ofertas(ev);
  const compra = os_.find((o) => o.url);
  const endereco = enderecoDe(loc);
  const { cidade, uf } = cidadeDoEndereco(loc && loc.address && typeof loc.address === 'object' ? loc.address.streetAddress : endereco);
  const org = lista(ev.organizer)[0];
  const prod = org && typeof org === 'object' ? limpo(org.name) : limpo(org);
  const bruto = limpar({
    nome,
    produtora: prod ? { nome: prod } : null,
    casa: loc && typeof loc === 'object' ? limpo(loc.name) : null,
    endereco,
    cidade: cidade || null,
    data: ini.data,
    inicio: ini.hora,
    fim: fimQ && fimQ.hora && fimQ.data >= ini.data ? fimQ.hora : null,
    lotes: os_.map(({ nome: n, preco, disponivel }) => ({ nome: n, preco, disponivel })),
    linkCompra: compra ? semCodigo(compra.url) : null,
    lineup: lista(ev.performer).map((p) => limpo(typeof p === 'string' ? p : p && p.name)).filter(Boolean),
  });
  const id = [ev['@id'], ev.url].find((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  return { bruto, uf: uf || null, idProprio: id ? semCodigo(id) : null, descricao: limpo(ev.description) };
}

// ---- Sympla ---------------------------------------------------------------

const nomeSympla = (n) => limpo(n);

function enderecoSympla(a) {
  if (!a) return null;
  const rua = [a.address, a.addressNum && a.addressNum !== '0' ? a.addressNum : null].filter(Boolean).join(', ');
  return limpo([rua, a.neighborhood].filter(Boolean).join(' - '));
}

// O __NEXT_DATA__ da página de evento da Sympla: props.pageProps.hydrationData.eventHydration.event.
// Datas em São Paulo (startDateMultiFormat.ISO8601, com -03:00); sem lotes (a página os carrega no navegador).
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
  const bruto = limpar({
    nome,
    produtora: ev.eventsHost && limpo(ev.eventsHost.name) ? { nome: limpo(ev.eventsHost.name) } : null,
    casa: limpo(a.name),
    endereco: enderecoSympla(a),
    cidade: limpo(a.city),
    data: ini.data,
    inicio: ini.hora,
    fim: fim && fim.hora && fim.data >= ini.data ? fim.hora : null,
    linkCompra: url ? semCodigo(url) : null,
  });
  return { bruto, uf: textoDe(a.state), idProprio: url ? semCodigo(url) : null, descricao: limpo(ev.strippedDetail) };
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
  const bruto = limpar({
    nome,
    produtora: c.organizer && limpo(c.organizer.name) ? { nome: limpo(c.organizer.name) } : null,
    casa: limpo(l.name),
    endereco: enderecoSympla({ address: l.address, addressNum: l.address_num, neighborhood: l.neighborhood }),
    cidade: limpo(l.city),
    data: ini.data,
    inicio: ini.hora,
    fim: fim && fim.hora && fim.data >= ini.data ? fim.hora : null,
    linkCompra: semCodigo(url),
  });
  return { bruto, uf: textoDe(l.state), idProprio: semCodigo(url), descricao: null, url: semCodigo(url) };
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

// Dentro de hoje..hoje+dias (datas de São Paulo)? `ate` null = sem teto (só descarta o que passou).
function naJanela(data, de, ate) {
  if (!data) return true; // sem data o normalizador decide
  return data >= de && (!ate || data <= ate);
}

function campos(bruto) {
  return CAMPOS.filter((c) => {
    const v = bruto[c];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
  });
}

const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hashDe = (bruto) => crypto.createHash('sha1').update(`${slug(bruto.nome)}|${bruto.data || ''}`).digest('hex').slice(0, 10);

const TIPO_PLATAFORMA = [[/(^|\.)ingresse\.com$/, 'Ingresse'], [/(^|\.)shotgun\.live$/, 'Shotgun'], [/(^|\.)sympla\.com\.br$/, 'Sympla'], [/(^|\.)ra\.co$/, 'Resident Advisor']];

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

function itemDe({ pagina, bruto, texto, agora, idProprio = null, unico = false, lidoPorModelo = false }) {
  const link = semCodigo(pagina.final || pagina.url) || semCodigo(pagina.url);
  const host = hostDe(link) || '';
  const { tipo, nome } = nomeDaPagina(host);
  const limpoBruto = { ...bruto };
  delete limpoBruto.cartaz;
  if (limpoBruto.linkCompra) limpoBruto.linkCompra = semCodigo(limpoBruto.linkCompra);
  // A página só vira linkEvento quando é de um evento só: a URL de uma agenda
  // com várias festas juntaria todas no vínculo por link (revisão de 24/11).
  const linkEvento = semCodigo(limpoBruto.linkEvento) || (unico ? link : null);
  const item = {
    idExterno: idDe({ pagina, bruto: limpoBruto, idProprio, unico }),
    url: link,
    texto: (texto || '').slice(0, 2000),
    bruto: {
      ...limpoBruto,
      linkEvento,
      paginas: [{ tipo, nome, url: link, lidoEm: agora().toISOString(), campos: campos(limpoBruto) }],
    },
  };
  if (lidoPorModelo) item.lidoPorModelo = true;
  return item;
}

function festaParaBruto(f) {
  return {
    nome: f.nome,
    data: f.data,
    inicio: f.inicio,
    fim: f.fim,
    casa: f.casa,
    endereco: f.endereco,
    lotes: f.lotes,
    linkCompra: f.linkCompra,
    lineup: f.lineup,
    estilos: f.estilos,
    idadeMinima: f.idadeMinima,
  };
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
    if (h && doHost(h, hosts)) alvos.add(u);
  }
  return [...alvos];
}

// Padrões de link de evento de cada plataforma (texto de regex; `padraoLink` da listagem manda).
const PADRAO_LINK = {
  shotgun: '^https://shotgun\\.live/(?:[a-z]{2}(?:-[a-z]{2})?/)?events/[^/?#]+/?(?:[?#].*)?$',
  sympla: '^https://www\\.sympla\\.com\\.br/evento/[^/?#]+/\\d+',
  ra: '^https://(?:www\\.)?ra\\.co/events/\\d+',
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

// Um aviso nunca leva a URL do proxy.
const sem = (segredo) => (t) => (segredo ? String(t).split(segredo).join('[proxy]') : String(t));

module.exports = {
  id: 'paginas',
  nome: 'Páginas lidas no navegador (Scrapling)',
  pocAcademica: true,
  eventosDoJsonld,
  brutoDeEvento,
  brutoDeNextDataSympla,
  cartoesSympla,
  lerPaginasPeloWorker,
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
    const vistos = new Set();
    let pedidos = 0;
    let paginasLidas = 0;

    // Um pedido ao leitor, com pausa antes de todo pedido depois do primeiro.
    async function lerLote(urls, { modo, proxy = null }) {
      if (pedidos && pausaMs) await dormir(pausaMs);
      pedidos += 1;
      paginasLidas += urls.length;
      return ler(urls, { modo, timeoutMs, pausaMs, proxy });
    }

    function aceitar(item, { uf, cidade, janela }) {
      const b = item.bruto;
      if (!ehSP(cidade || b.cidade, uf)) return false;
      if (!naJanela(b.data, hoje, janela ? limite : null)) return false;
      if (vistos.has(item.idExterno)) return false;
      vistos.add(item.idExterno);
      return true;
    }

    // Lê as páginas devolvidas e monta os itens. `cartoes` (Sympla) serve de reserva.
    async function mapear(paginas, { janela, unico, cartoes = new Map() }) {
      for (const p of paginas || []) {
        if (p.erro || !p.status || p.status >= 400) {
          avisos.push(`${p.url}: ${p.erro || `respondeu ${p.status}`}`);
          continue;
        }
        const ld = eventosDoJsonld(p.jsonld || []).map((e) => brutoDeEvento(e)).filter(Boolean);
        const nd = brutoDeNextDataSympla(p.dados);
        const cartao = cartoes.get(semCodigo(p.url)) || null;
        const diretos = ld.length ? ld : nd ? [nd] : cartao ? [cartao] : [];
        if (diretos.length) {
          const um = unico && diretos.length === 1;
          for (const d of diretos) {
            const item = itemDe({ pagina: p, bruto: d.bruto, texto: d.descricao || [d.bruto.nome, d.bruto.casa].filter(Boolean).join('. '), agora: ctx.agora, idProprio: d.idProprio, unico: um });
            aceitar(item, { uf: d.uf, janela }) && itens.push(item);
          }
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
          const item = itemDe({ pagina: p, bruto, texto: p.titulo, agora: ctx.agora, unico: unico && festas.length === 1, lidoPorModelo: true });
          aceitar(item, { janela }) && itens.push(item);
        }
      }
    }

    // 1. Agendas de casas e a fila de links (ingresse.com): páginas avulsas.
    const urls = urlsDaConfig(config, ctx.fila);
    if (urls.length) {
      const agendas = new Set((config.agendas || []).map((a) => (typeof a === 'string' ? a : a && a.url)));
      const deAgenda = urls.filter((u) => agendas.has(u));
      const deFila = urls.filter((u) => !agendas.has(u));
      for (const [grupo, unico] of [[deAgenda, false], [deFila, true]]) {
        if (!grupo.length) continue;
        let paginas;
        try {
          paginas = await lerLote(grupo, { modo: config.modo || 'dinamico' });
        } catch (e) {
          avisos.push(`leitor de páginas falhou: ${e.message}`);
          continue;
        }
        await mapear(paginas, { janela: false, unico });
      }
    }

    // 2. Listagens de plataformas: a página da cidade, depois cada evento.
    for (const lg of config.listagens || []) {
      if (!lg || !lg.url || !hostDe(lg.url)) continue;
      const segredo = lg.proxy ? process.env.FINDE_PROXY_URL || null : null;
      const nada = sem(segredo);
      if (lg.proxy && !segredo) {
        avisos.push(`${lg.id || lg.url}: a listagem pede proxy e FINDE_PROXY_URL não está definida`);
        continue;
      }
      const modo = lg.modo || 'simples';
      const maxEventos = lg.maxEventos || 40;
      let pl;
      try {
        pl = (await lerLote([lg.url], { modo, proxy: segredo }))[0];
      } catch (e) {
        avisos.push(`${lg.id || lg.url}: leitor falhou (${nada(e.message)})`);
        continue;
      }
      if (!pl || pl.erro || !pl.status || pl.status >= 400) {
        avisos.push(`${lg.id || lg.url}: ${nada((pl && pl.erro) || `respondeu ${pl && pl.status}`)}`);
        continue;
      }
      const cartoes = new Map(cartoesSympla(pl.dados).map((c) => [c.url, c]));
      const padrao = lg.padraoLink || PADRAO_LINK[lg.id] || PADRAO_LINK.shotgun;
      let alvos = linksDeEvento(pl, padrao);
      for (const u of cartoes.keys()) if (!alvos.includes(u) && new RegExp(padrao).test(u)) alvos.push(u);
      // Os cartões já trazem data e cidade: o que está fora da janela nem é lido.
      alvos = alvos.filter((u) => {
        const c = cartoes.get(u);
        return !c || (ehSP(c.bruto.cidade, c.uf) && naJanela(c.bruto.data, hoje, limite));
      }).slice(0, maxEventos);
      if (!alvos.length) {
        avisos.push(`${lg.id || lg.url}: nenhum evento na listagem`);
        continue;
      }
      let paginas;
      try {
        paginas = await lerLote(alvos, { modo, proxy: segredo });
      } catch (e) {
        avisos.push(`${lg.id || lg.url}: leitor falhou (${nada(e.message)})`);
        continue;
      }
      const antes = avisos.length;
      const itensAntes = itens.length;
      await mapear(paginas, { janela: true, unico: true, cartoes });
      for (let i = antes; i < avisos.length; i++) avisos[i] = nada(avisos[i]);
      // Plataforma que só vende festa e show (Shotgun, RA): o evento é festa
      // pela fonte, sem depender das palavras do nome. A Sympla tem de tudo e
      // fica com a classificação.
      if (lg.soFesta || ['shotgun', 'ra'].includes(lg.id)) {
        for (let i = itensAntes; i < itens.length; i++) if (itens[i].bruto.ehFesta === undefined) itens[i].bruto.ehFesta = true;
      }
    }

    if (ctx.log) ctx.log.info(`[motor] paginas: ${paginasLidas} páginas, ${itens.length} festas`);
    // Sem nenhuma página lida (uv ausente, leitor caindo, tudo bloqueado), a
    // fonte não conta como rodada e tenta de novo na próxima execução.
    return { itens, avisos, rodou: paginasLidas > 0 };
  },
};

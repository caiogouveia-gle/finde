'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const paginas = require('../fontes/paginas');
const { normalizarItem } = require('../nucleo/normalizar');
const { relogio, logMudo } = require('./ajuda');

const dados = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', n), 'utf8'));

const EVENTO_INGRESSE = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Crema Club - 27.11',
  startDate: '2026-11-28T00:00:00+00:00',
  location: { '@type': 'Place', name: 'Crema Club', address: { '@type': 'PostalAddress', streetAddress: 'Rua Cristóvão Gonçalves, 84', addressLocality: 'São Paulo' } },
  offers: [{ '@type': 'Offer', name: '1º lote', price: '40,00', availability: 'https://schema.org/InStock', url: 'https://www.ingresse.com/crema-club-27-11/' }],
  performer: [{ '@type': 'Person', name: 'XAV' }, 'Jack Rosset'],
};
const pagina = (url, extra = {}) => ({ url, final: url, status: 200, titulo: 'T', texto: 'texto', jsonld: [], ...extra });

function contexto({ paginasLidas, extrator, config = {}, fila }) {
  const pedidos = [];
  const pausas = [];
  return {
    pedidos,
    pausas,
    ctx: {
      config: { hosts: ['ingresse.com'], pausaMs: 2000, ...config },
      fila,
      agora: relogio(),
      log: logMudo,
      extrator,
      dormir: async (ms) => { pausas.push(ms); },
      lerPaginas: async (urls, opcoes) => {
        pedidos.push({ urls, opcoes });
        return paginasLidas(urls);
      },
    },
  };
}
const extratorQueFalha = { lerPagina: async () => { throw new Error('não devia chamar'); } };

test('páginas: JSON-LD Event vira item sem chamar o extrator, com data em São Paulo', async () => {
  const url = 'https://www.ingresse.com/crema-club-27-11/';
  const { ctx } = contexto({ fila: new Set([url]), extrator: extratorQueFalha, paginasLidas: () => [pagina(url, { jsonld: [{ '@graph': [{ '@type': 'WebPage' }, EVENTO_INGRESSE] }] })] });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.itens.length, 1);
  const it = r.itens[0];
  assert.equal(it.idExterno, `pagina:${url}`); // página de um evento só: a URL
  assert.equal(it.lidoPorModelo, undefined);
  assert.equal(it.bruto.cartaz, undefined);
  assert.equal(it.bruto.data, '2026-11-27');
  assert.equal(it.bruto.inicio, '21:00');
  assert.deepEqual(it.bruto.lineup, ['XAV', 'Jack Rosset']);
  const { campos, avisos } = normalizarItem(it.bruto, 'paginas');
  assert.deepEqual(avisos, []);
  assert.equal(campos.inicio, '2026-11-27T21:00:00-03:00');
  assert.equal(campos.lotes[0].preco, 40);
  assert.equal(campos.lotes[0].disponivel, true);
  assert.equal(campos.paginas[0].tipo, 'ingresso');
  assert.equal(campos.paginas[0].nome, 'Ingresse');
});

test('páginas: sem JSON-LD, o texto vai ao extrator e cada festa vira um item', async () => {
  const url = 'https://casa.example/agenda';
  const chamadas = [];
  const extrator = {
    lerPagina: async (p) => {
      chamadas.push(p);
      return {
        confianca: 'alta',
        festas: [
          { nome: 'Baile A', data: '2026-12-05', inicio: '23:00', fim: '05:00', casa: 'Casa', endereco: 'Rua X, 1', lotes: [{ nome: 'Entrada', preco: 30, disponivel: null }], linkCompra: null, lineup: [], estilos: ['funk'], idadeMinima: 18 },
          { nome: 'Baile B', data: '2026-12-06', inicio: null, fim: null, casa: 'Casa', endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null },
        ],
      };
    },
  };
  const { ctx } = contexto({ config: { agendas: [url] }, extrator, paginasLidas: (us) => us.map((u) => pagina(u, { titulo: 'Agenda', texto: 'Baile A 05/12 ...' })) });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(r.avisos, []);
  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0], { url, titulo: 'Agenda', texto: 'Baile A 05/12 ...' });
  assert.match(r.itens[0].idExterno, new RegExp(`^pagina:${url}#[0-9a-f]{10}$`));
  assert.notEqual(r.itens[0].idExterno, r.itens[1].idExterno);
  assert.ok(r.itens.every((i) => i.lidoPorModelo === true));
  const { campos } = normalizarItem(r.itens[0].bruto, 'paginas');
  assert.equal(campos.fim, '2026-12-06T05:00:00-03:00');
  assert.equal(campos.paginas[0].tipo, 'oficial');
  assert.ok(campos.paginas[0].campos.includes('lotes'));
});

test('páginas: link da fila fora de config.hosts é ignorado', async () => {
  const dentro = 'https://www.ingresse.com/outra-festa/';
  const fora = 'https://sympla.com.br/evento/x/1';
  const { ctx, pedidos } = contexto({ fila: new Set([dentro, fora]), extrator: extratorQueFalha, paginasLidas: () => [] });
  await paginas.coletar(ctx);
  assert.deepEqual(pedidos[0].urls, [dentro]);
  assert.deepEqual(pedidos[0].opcoes, { modo: 'dinamico', timeoutMs: 30000, pausaMs: 2000, proxy: null });
});

test('páginas: sem URLs, o leitor nem é chamado', async () => {
  const { ctx, pedidos } = contexto({ fila: new Set(['https://sympla.com.br/x']), extrator: extratorQueFalha, paginasLidas: () => [] });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(r, { itens: [], avisos: [], rodou: false });
  assert.equal(pedidos.length, 0);
});

test('páginas: falha do leitor, status ruim e extrator sem leitura viram aviso', async () => {
  const ok = 'https://casa.example/a';
  const ruim = 'https://casa.example/b';
  const sem = 'https://casa.example/c';
  const { ctx } = contexto({
    config: { agendas: [ok, ruim, sem] },
    extrator: { lerPagina: async () => null },
    paginasLidas: () => [pagina(ok, { status: 0, erro: 'DNSError' }), pagina(ruim, { status: 404 }), pagina(sem)],
  });
  const r = await paginas.coletar(ctx);
  assert.equal(r.itens.length, 0);
  assert.equal(r.avisos.length, 3);
  assert.match(r.avisos[0], /DNSError/);
  assert.match(r.avisos[1], /404/);
  assert.match(r.avisos[2], /sem leitura/);
});

test('páginas: se o próprio leitor lança, o conector devolve aviso e não quebra', async () => {
  const ctx = { config: { agendas: ['https://casa.example/a'] }, agora: relogio(), log: logMudo, lerPaginas: async () => { throw new Error('uv sumiu'); } };
  const r = await paginas.coletar(ctx);
  assert.deepEqual(r.itens, []);
  assert.match(r.avisos[0], /uv sumiu/);
});

// ---- extrator: id estável e festas passadas -------------------------------

const festa = (nome, data) => ({ nome, data, inicio: '22:00', fim: null, casa: 'Casa', endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null });

test('páginas: idExterno não depende da ordem (a primeira festa some e a segunda mantém o vínculo)', async () => {
  const url = 'https://casa.example/agenda';
  const rodar = async (festas) => {
    const { ctx } = contexto({ config: { agendas: [url] }, extrator: { lerPagina: async () => ({ confianca: 'alta', festas }) }, paginasLidas: (us) => us.map((u) => pagina(u)) });
    return (await paginas.coletar(ctx)).itens;
  };
  const A = festa('Baile A', '2026-12-05');
  const B = festa('Baile B', '2026-12-06');
  const [primeira, segunda] = await rodar([A, B]);
  const depois = await rodar([B]);
  assert.equal(depois.length, 1);
  assert.equal(depois[0].idExterno, segunda.idExterno);
  assert.notEqual(depois[0].idExterno, primeira.idExterno);
  assert.ok(!depois[0].idExterno.endsWith('#0'));
});

test('páginas: festa que já passou não vira item', async () => {
  const url = 'https://casa.example/agenda';
  const festas = [festa('Já foi', '2026-11-01'), festa('Hoje', '2026-11-10'), festa('Sem data', null)];
  const { ctx } = contexto({ config: { agendas: [url] }, extrator: { lerPagina: async () => ({ confianca: 'alta', festas }) }, paginasLidas: (us) => us.map((u) => pagina(u)) });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(r.itens.map((i) => i.bruto.nome), ['Hoje', 'Sem data']);
});

test('páginas: link de compra e de evento saem sem código de afiliado', async () => {
  const url = 'https://www.ingresse.com/crema-club-27-11/?passkey=segredo&utm_source=x';
  const ev = { ...EVENTO_INGRESSE, offers: [{ ...EVENTO_INGRESSE.offers[0], url: 'https://www.ingresse.com/crema-club-27-11/?passkey=segredo&lote=2' }] };
  const { ctx } = contexto({ fila: new Set([url]), extrator: extratorQueFalha, paginasLidas: () => [pagina(url, { jsonld: [ev] })] });
  const r = await paginas.coletar(ctx);
  const b = r.itens[0].bruto;
  assert.equal(b.linkCompra, 'https://www.ingresse.com/crema-club-27-11/?lote=2');
  assert.equal(b.linkEvento, 'https://www.ingresse.com/crema-club-27-11/');
  assert.equal(r.itens[0].idExterno, 'pagina:https://www.ingresse.com/crema-club-27-11/');
  assert.doesNotMatch(JSON.stringify(r), /segredo/);
});

// ---- listagens (Shotgun, Sympla, RA) ---------------------------------------

const LISTAGEM_SHOTGUN = { id: 'shotgun', url: 'https://shotgun.live/pt-br/cities/sao-paulo', modo: 'simples' };
const LISTAGEM_SYMPLA = { id: 'sympla', url: 'https://www.sympla.com.br/eventos/sao-paulo-sp', modo: 'simples' };

// Um "site" falso: URL -> página gravada. Eventos do Shotgun repetem o JSON-LD gravado com outro nome.
function site() {
  const sg = dados('shotgun-evento.json');
  const sgLista = dados('shotgun-listagem.json');
  const nd = dados('sympla-nextdata.json');
  return (urls) => urls.map((u) => {
    if (u === sgLista.url) return sgLista;
    if (u === 'https://shotgun.live/pt-br/events/inky') return sg;
    if (/shotgun\.live\/pt-br\/events\//.test(u)) {
      const ev = JSON.parse(JSON.stringify(sg.jsonld[0]));
      ev.name = `Festa ${u.split('/').pop()}`;
      ev.url = u;
      ev.offers[0].url = `${u}?passkey=x`;
      ev.startDate = u.endsWith('raven-vinyl-club-5') ? '2026-12-20T01:00:00.000Z' : '2026-11-16T02:00:00.000Z'; // a segunda fica fora dos 14 dias
      ev.location.address.streetAddress = u.endsWith('yallah-moga-begins-cortina-bar-sp') ? 'Rua da Praia, 10 - Centro, Santos - SP, 11000-000, Brasil' : ev.location.address.streetAddress;
      return { ...sg, url: u, final: u, jsonld: [ev] };
    }
    if (u === 'https://www.sympla.com.br/eventos/sao-paulo-sp') return dados('sympla-listagem.json');
    if (u === 'https://www.sympla.com.br/evento/baile-do-mirante/3400001') return { url: u, final: u, status: 200, titulo: 'Baile', texto: '', jsonld: [], links: [], dados: nd };
    return { url: u, final: u, status: 404, titulo: '', texto: '', jsonld: [], links: [] };
  });
}

test('listagem Shotgun: lê a cidade, depois cada evento; JSON-LD, sem modelo, cidade e janela filtradas', async () => {
  const { ctx, pedidos, pausas } = contexto({ config: { hosts: [], listagens: [LISTAGEM_SHOTGUN] }, extrator: extratorQueFalha, paginasLidas: site() });
  const r = await paginas.coletar(ctx);
  assert.equal(pedidos.length, 2);
  assert.deepEqual(pedidos[0].urls, ['https://shotgun.live/pt-br/cities/sao-paulo']);
  assert.equal(pedidos[1].urls.length, 4); // só links de evento (venues e outras cidades ficam fora)
  assert.ok(pedidos[1].urls.every((u) => /\/events\//.test(u)));
  assert.deepEqual(pausas, [2000]); // pausa entre a listagem e os eventos
  assert.deepEqual(pedidos[1].opcoes, { modo: 'simples', timeoutMs: 30000, pausaMs: 2000, proxy: null });
  const nomes = r.itens.map((i) => i.bruto.nome).sort();
  assert.equal(nomes.length, 2); // Inky e a festa do dia 16; Santos e dezembro ficaram fora
  assert.ok(nomes.includes('Inky'));
  assert.ok(r.itens.every((i) => i.lidoPorModelo === undefined && i.bruto.cartaz === undefined));
  const inky = r.itens.find((i) => i.bruto.nome === 'Inky');
  assert.equal(inky.idExterno, 'pagina:https://shotgun.live/pt-br/events/inky');
  assert.equal(inky.bruto.data, '2026-11-14');
  assert.equal(inky.bruto.inicio, '18:30');
  assert.equal(inky.bruto.casa, 'PORTA');
  assert.equal(inky.bruto.produtora.nome, 'P O R T A');
  assert.equal(inky.bruto.paginas[0].nome, 'Shotgun');
  assert.equal(inky.bruto.paginas[0].tipo, 'ingresso');
  assert.doesNotMatch(JSON.stringify(r.itens), /passkey/);
  const { campos, avisos } = normalizarItem(inky.bruto, 'paginas');
  assert.deepEqual(avisos, []);
  assert.equal(campos.lotes[0].preco, 40);
});

test('listagem Sympla: cartões do HTML filtram antes de ler; __NEXT_DATA__ monta o item', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [LISTAGEM_SYMPLA] }, extrator: extratorQueFalha, paginasLidas: site() });
  const r = await paginas.coletar(ctx);
  // Dos seis cartões ficam o Baile e o Pagode (SP, na janela); Campinas, dezembro, série antiga e bilheteria alheia saem.
  assert.deepEqual(pedidos[1].urls, ['https://www.sympla.com.br/evento/baile-do-mirante/3400001', 'https://www.sympla.com.br/evento/pagode-do-bairro/3400006']);
  assert.equal(r.itens.length, 1); // o Pagode responde 404 no site falso
  assert.match(r.avisos[0], /pagode-do-bairro.*404/);
  const b = r.itens[0].bruto;
  assert.equal(r.itens[0].idExterno, 'pagina:https://www.sympla.com.br/evento/baile-do-mirante/3400001');
  assert.equal(b.nome, 'Baile do Mirante');
  assert.equal(b.data, '2026-11-13');
  assert.equal(b.inicio, '22:00');
  assert.equal(b.fim, '04:00');
  assert.equal(b.cidade, 'São Paulo');
  assert.equal(b.paginas[0].nome, 'Sympla');
  assert.match(r.itens[0].texto, /Festa de lançamento/);
  assert.equal(normalizarItem(b, 'paginas').avisos.length, 0);
});

test('listagem Sympla: sem a página do evento, o cartão serve de reserva (datas UTC viram São Paulo)', async () => {
  const lista = site();
  const leitor = (urls) => lista(urls).map((p) => (/pagode/.test(p.url) ? { ...p, status: 200, dados: null, jsonld: [] } : p));
  const { ctx } = contexto({ config: { hosts: [], listagens: [LISTAGEM_SYMPLA] }, extrator: extratorQueFalha, paginasLidas: leitor });
  const r = await paginas.coletar(ctx);
  const pagode = r.itens.find((i) => i.bruto.nome === 'Pagode do Bairro');
  assert.equal(pagode.idExterno, 'pagina:https://www.sympla.com.br/evento/pagode-do-bairro/3400006');
  assert.equal(pagode.bruto.data, '2026-11-16');
  assert.equal(pagode.bruto.inicio, '19:00');
  assert.equal(pagode.bruto.endereco, 'Rua Exemplo, 10 - Pinheiros');
});

test('listagem: idExterno é a URL do evento, então não troca de dono quando a ordem muda', async () => {
  const rodar = async (tira) => {
    const { ctx } = contexto({ config: { hosts: [], listagens: [LISTAGEM_SHOTGUN] }, extrator: extratorQueFalha, paginasLidas: (us) => site()(us).filter((p) => !tira || !p.url.endsWith(tira)) });
    return (await paginas.coletar(ctx)).itens;
  };
  const antes = await rodar(null);
  const depois = await rodar('/events/inky');
  const idDe = (lista, nome) => (lista.find((i) => i.bruto.nome === nome) || {}).idExterno;
  const outra = antes.find((i) => i.bruto.nome !== 'Inky');
  assert.equal(idDe(depois, outra.bruto.nome), outra.idExterno);
  assert.equal(depois.some((i) => i.bruto.nome === 'Inky'), false);
});

test('listagem: maxEventos limita as páginas de evento lidas', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, maxEventos: 2 }] }, extrator: extratorQueFalha, paginasLidas: site() });
  await paginas.coletar(ctx);
  assert.equal(pedidos[1].urls.length, 2);
});

test('listagem: padraoLink próprio (texto de regex) escolhe os links', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, padraoLink: 'inky$' }] }, extrator: extratorQueFalha, paginasLidas: site() });
  await paginas.coletar(ctx);
  assert.deepEqual(pedidos[1].urls, ['https://shotgun.live/pt-br/events/inky']);
});

test('listagem: sem JSON-LD nem NEXT_DATA o texto vai ao extrator e o item leva lidoPorModelo', async () => {
  const ev = 'https://ra.co/events/1234567';
  const leitor = (urls) => urls.map((u) => (u.includes('/events/br/') ? pagina(u, { links: [ev] }) : pagina(u, { titulo: 'Noite', texto: 'Noite no Clube, 14/11 às 23h' })));
  const extrator = { lerPagina: async () => ({ confianca: 'alta', festas: [festa('Noite no Clube', '2026-11-14')] }) };
  const { ctx } = contexto({ config: { hosts: [], listagens: [{ id: 'ra', url: 'https://ra.co/events/br/saopaulo', modo: 'dinamico' }] }, extrator, paginasLidas: leitor });
  const r = await paginas.coletar(ctx);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].lidoPorModelo, true);
  assert.equal(r.itens[0].idExterno, `pagina:${ev}`);
  assert.equal(r.itens[0].bruto.paginas[0].nome, 'Resident Advisor');
});

test('listagem: bloqueio da listagem (403) vira aviso e nada mais é pedido', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ id: 'ra', url: 'https://ra.co/events/br/saopaulo', modo: 'dinamico' }] }, extrator: extratorQueFalha, paginasLidas: (us) => us.map((u) => pagina(u, { status: 403 })) });
  const r = await paginas.coletar(ctx);
  assert.equal(pedidos.length, 1);
  assert.match(r.avisos[0], /ra: respondeu 403/);
});

// ---- proxy ----------------------------------------------------------------

test('proxy: só vai na listagem marcada, com a URL de FINDE_PROXY_URL, e nunca aparece em aviso', async () => {
  const URL_PROXY = 'http://usuario:senha-secreta@proxy.example:8080';
  const antes = process.env.FINDE_PROXY_URL;
  process.env.FINDE_PROXY_URL = URL_PROXY;
  try {
    const leitor = (urls, opcoes) => {
      const lidas = site()(urls);
      return lidas.map((p) => (opcoes.proxy && /^https:\/\/www\.sympla/.test(p.url) && p.status === 404 ? { ...p, status: 0, erro: `ProxyError: falhou em ${URL_PROXY}` } : p));
    };
    const { ctx, pedidos } = contexto({
      config: { hosts: [], listagens: [LISTAGEM_SHOTGUN, { ...LISTAGEM_SYMPLA, proxy: true }] },
      extrator: extratorQueFalha,
      paginasLidas: leitor,
    });
    const r = await paginas.coletar(ctx);
    const doShotgun = pedidos.filter((p) => p.urls.some((u) => /shotgun/.test(u)));
    const doSympla = pedidos.filter((p) => p.urls.some((u) => /sympla/.test(u)));
    assert.ok(doShotgun.length && doShotgun.every((p) => p.opcoes.proxy === null));
    assert.ok(doSympla.length && doSympla.every((p) => p.opcoes.proxy === URL_PROXY));
    assert.ok(r.avisos.length > 0);
    assert.doesNotMatch(JSON.stringify(r), /senha-secreta|proxy\.example/);
  } finally {
    if (antes === undefined) delete process.env.FINDE_PROXY_URL; else process.env.FINDE_PROXY_URL = antes;
  }
});

test('proxy: listagem com proxy:true e sem FINDE_PROXY_URL não roda e avisa', async () => {
  const antes = process.env.FINDE_PROXY_URL;
  delete process.env.FINDE_PROXY_URL;
  try {
    const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SYMPLA, proxy: true }] }, extrator: extratorQueFalha, paginasLidas: site() });
    const r = await paginas.coletar(ctx);
    assert.equal(pedidos.length, 0);
    assert.match(r.avisos[0], /FINDE_PROXY_URL/);
  } finally {
    if (antes !== undefined) process.env.FINDE_PROXY_URL = antes;
  }
});

// ---- tempo-limite do worker -----------------------------------------------

test('worker: o tempo-limite mata o grupo inteiro (o neto do uv também) e resolve na hora', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-uv-'));
  const pidfile = path.join(pasta, 'neto.pid');
  const uv = path.join(pasta, 'uv-falso.sh');
  // O "uv" deixa um sleep em segundo plano (o Chromium neto) e espera por ele.
  fs.writeFileSync(uv, `#!/bin/sh\nsleep 60 &\necho $! > "${pidfile}"\nwait\n`, { mode: 0o755 });
  const t0 = Date.now();
  const linhas = await paginas.lerPaginasPeloWorker(['https://a.example/x', 'https://a.example/y'], { uv, limiteMs: 500 });
  assert.ok(Date.now() - t0 < 5000, 'resolveu no próprio timer');
  assert.deepEqual(linhas.map((l) => l.url), ['https://a.example/x', 'https://a.example/y']);
  assert.ok(linhas.every((l) => l.status === 0 && /a tempo/.test(l.erro)));
  const neto = Number(fs.readFileSync(pidfile, 'utf8').trim());
  await new Promise((r) => setTimeout(r, 300));
  assert.throws(() => process.kill(neto, 0), /ESRCH/, 'o sleep neto morreu junto');
  fs.rmSync(pasta, { recursive: true, force: true });
});

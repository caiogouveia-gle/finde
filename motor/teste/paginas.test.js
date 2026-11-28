'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const paginas = require('../fontes/paginas');
const { normalizarItem } = require('../nucleo/normalizar');
const { relogio, logMudo, novoBanco, fetchQueLanca } = require('./ajuda');
const { executar } = require('../nucleo/coleta');

const dados = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', n), 'utf8'));

const EVENTO_INGRESSE = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Clube Exemplo - 27.11',
  startDate: '2026-11-28T00:00:00+00:00',
  location: { '@type': 'Place', name: 'Clube Exemplo', address: { '@type': 'PostalAddress', streetAddress: 'Rua Exemplo, 84', addressLocality: 'São Paulo' } },
  offers: [{ '@type': 'Offer', name: '1º lote', price: '40,00', availability: 'https://schema.org/InStock', url: 'https://www.ingresse.com/clube-exemplo-27-11/' }],
  performer: [{ '@type': 'Person', name: 'DJ Exemplo' }, 'Artista Exemplo'],
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
        const { aoLer: _bater, travas: _travas, ...semBatimento } = opcoes; // o batimento e as travas têm teste próprio
        pedidos.push({ urls, opcoes: semBatimento });
        return paginasLidas(urls, opcoes);
      },
    },
  };
}
const extratorQueFalha = { lerPagina: async () => { throw new Error('não devia chamar'); } };

test('páginas: JSON-LD Event vira item sem chamar o extrator, com data em São Paulo', async () => {
  const url = 'https://www.ingresse.com/clube-exemplo-27-11/';
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
  assert.deepEqual(it.bruto.lineup, ['DJ Exemplo', 'Artista Exemplo']);
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
  assert.deepEqual(pedidos[0].opcoes, { modo: 'dinamico', timeoutMs: 30000, pausaMs: 2000, semRecursos: true, esperar: 'script[type="application/ld+json"]' });
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

const festa = (nome, data) => ({ nome, ehFesta: true, tipo: 'festa', confianca: 'alta', cidade: null, uf: null, imagem: 'outra', data, inicio: '22:00', fim: null, casa: 'Casa', endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null });

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
  const url = 'https://www.ingresse.com/clube-exemplo-27-11/?passkey=segredo&utm_source=x';
  const ev = { ...EVENTO_INGRESSE, offers: [{ ...EVENTO_INGRESSE.offers[0], url: 'https://www.ingresse.com/clube-exemplo-27-11/?passkey=segredo&lote=2' }] };
  const { ctx } = contexto({ fila: new Set([url]), extrator: extratorQueFalha, paginasLidas: () => [pagina(url, { jsonld: [ev] })] });
  const r = await paginas.coletar(ctx);
  const b = r.itens[0].bruto;
  assert.equal(b.linkCompra, 'https://www.ingresse.com/clube-exemplo-27-11/?lote=2');
  assert.equal(b.linkEvento, 'https://www.ingresse.com/clube-exemplo-27-11/');
  assert.equal(r.itens[0].idExterno, 'pagina:https://www.ingresse.com/clube-exemplo-27-11/');
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
    if (u === sg.url) return sg;
    if (/shotgun\.live\/pt-br\/events\//.test(u)) {
      const ev = JSON.parse(JSON.stringify(sg.jsonld[0]));
      ev.name = `Festa ${u.split('/').pop()}`;
      ev.url = u;
      ev.offers[0].url = `${u}?passkey=x`;
      ev.startDate = u.endsWith('festa-exemplo-b-5') ? '2026-12-20T01:00:00.000Z' : '2026-11-16T02:00:00.000Z'; // a segunda fica fora dos 14 dias
      ev.location.address.streetAddress = u.endsWith('festa-exemplo-c-santos') ? 'Rua da Praia, 10 - Centro, Santos - SP, 11000-000, Brasil' : ev.location.address.streetAddress;
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
  assert.deepEqual(pedidos[1].opcoes, { modo: 'simples', timeoutMs: 30000, pausaMs: 2000 });
  const nomes = r.itens.map((i) => i.bruto.nome).sort();
  assert.equal(nomes.length, 2); // Festa Exemplo e a festa do dia 16; Santos e dezembro ficaram fora
  assert.ok(nomes.includes('Festa Exemplo'));
  assert.ok(r.itens.every((i) => i.lidoPorModelo === undefined && i.bruto.cartaz === undefined));
  const inky = r.itens.find((i) => i.bruto.nome === 'Festa Exemplo');
  assert.equal(inky.idExterno, 'pagina:https://shotgun.live/pt-br/events/festa-exemplo');
  assert.equal(inky.bruto.data, '2026-11-14');
  assert.equal(inky.bruto.inicio, '18:30');
  assert.equal(inky.bruto.casa, 'Casa Exemplo');
  assert.equal(inky.bruto.produtora.nome, 'Produtora Exemplo');
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
  const depois = await rodar('/events/festa-exemplo');
  const idDe = (lista, nome) => (lista.find((i) => i.bruto.nome === nome) || {}).idExterno;
  const outra = antes.find((i) => i.bruto.nome !== 'Festa Exemplo');
  assert.equal(idDe(depois, outra.bruto.nome), outra.idExterno);
  assert.equal(depois.some((i) => i.bruto.nome === 'Festa Exemplo'), false);
});

test('listagem: maxEventos limita as páginas de evento lidas', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, maxEventos: 2 }] }, extrator: extratorQueFalha, paginasLidas: site() });
  await paginas.coletar(ctx);
  assert.equal(pedidos[1].urls.length, 2);
});

test('listagem: padraoLink próprio (texto de regex) escolhe os links', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, padraoLink: 'festa-exemplo$' }] }, extrator: extratorQueFalha, paginasLidas: site() });
  await paginas.coletar(ctx);
  assert.deepEqual(pedidos[1].urls, ['https://shotgun.live/pt-br/events/festa-exemplo']);
});

test('listagem: sem JSON-LD nem NEXT_DATA o texto vai ao extrator e o item leva lidoPorModelo, com ehFesta do modelo', async () => {
  const ev = 'https://shotgun.live/pt-br/events/noite-no-clube';
  const leitor = (urls) => urls.map((u) => (u.includes('/cities/') ? pagina(u, { links: [ev] }) : pagina(u, { titulo: 'Noite', texto: 'Noite no Clube, 14/11 às 23h' })));
  const extrator = { lerPagina: async () => ({ confianca: 'alta', festas: [festa('Noite no Clube', '2026-11-14')] }) };
  const { ctx } = contexto({ config: { hosts: [], listagens: [LISTAGEM_SHOTGUN] }, extrator, paginasLidas: leitor });
  const r = await paginas.coletar(ctx);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].lidoPorModelo, true);
  assert.equal(r.itens[0].idExterno, `pagina:${ev}`);
  assert.equal(r.itens[0].bruto.paginas[0].nome, 'Shotgun');
  assert.equal(r.itens[0].bruto.ehFesta, true);
  assert.equal(r.itens[0].bruto.tipo, 'festa');
});

test('listagem: bloqueio da listagem (403) encerra a leitura e nada mais é pedido', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [LISTAGEM_SHOTGUN] }, extrator: extratorQueFalha, paginasLidas: (us) => us.map((u) => pagina(u, { status: 403 })) });
  const r = await paginas.coletar(ctx);
  assert.equal(pedidos.length, 1);
  assert.match(r.avisos[0], /shotgun: recusou o acesso \(403\)/);
  assert.match(r.avisos[0], /sem nova tentativa nem outro modo/);
});

// ---- D14: bloqueio é recusa -------------------------------------------------

test('D14: tudo 403, 429 e 503 não grava a rodada, não repete e não troca de modo', async () => {
  const urls = ['https://www.ingresse.com/a/', 'https://www.ingresse.com/b/', 'https://www.ingresse.com/c/'];
  const status = { [urls[0]]: 403, [urls[1]]: 429, [urls[2]]: 503 };
  const { ctx, pedidos } = contexto({ fila: new Set(urls), extrator: extratorQueFalha, paginasLidas: (us) => us.map((u) => pagina(u, { status: status[u] })) });
  const r = await paginas.coletar(ctx);
  assert.equal(r.rodou, false, 'nenhuma página 2xx: a fonte não conta como rodada');
  assert.equal(r.itens.length, 0);
  assert.equal(pedidos.length, 1, 'um pedido só, sem nova tentativa');
  assert.equal(pedidos[0].opcoes.modo, 'dinamico', 'e sem trocar de modo');
  assert.equal(r.avisos.filter((a) => /recusou o acesso/.test(a)).length, 3);
  assert.match(r.avisos.at(-1), /nenhuma página voltou 2xx/);
  // No banco: a execução não grava fontes_rodadas quando a fonte diz rodou: false.
  const db = novoBanco();
  const exec = await executar({
    db, fontes: [paginas], fetch: fetchQueLanca(), claude: null, agora: relogio(), log: logMudo, apifyToken: null,
    config: { paginas: { hosts: ['ingresse.com'], intervaloHoras: 20 } },
    classificar: false,
  }).catch((e) => e);
  assert.ok(!(exec instanceof Error));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM fontes_rodadas WHERE fonte = 'paginas'").get().n, 0);
});

test('D14: rodada com ao menos uma página 2xx conta', async () => {
  const urls = ['https://www.ingresse.com/boa/', 'https://www.ingresse.com/ruim/'];
  const { ctx } = contexto({
    fila: new Set(urls),
    extrator: { lerPagina: async () => ({ confianca: 'alta', festas: [festa('Baile Bom', '2026-11-14')] }) },
    paginasLidas: (us) => us.map((u) => pagina(u, { status: /ruim/.test(u) ? 429 : 200 })),
  });
  const r = await paginas.coletar(ctx);
  assert.equal(r.rodou, true);
  assert.equal(r.itens.length, 1);
});

test('D14: o leitor recusa o modo furtivo e não há proxy nem solução de Cloudflare', () => {
  const { spawnSync } = require('node:child_process');
  const ler = path.join(__dirname, '..', 'coletores', 'paginas', 'ler.py');
  const py = spawnSync('python3.14', ['-I', ler], { input: JSON.stringify({ urls: ['https://x.example/a'], modo: 'furtivo' }), encoding: 'utf8' });
  if (py.error) return; // sem python3.14 neste ambiente
  const linha = JSON.parse(py.stdout.trim());
  assert.equal(linha.status, 0);
  assert.match(linha.erro, /furtivo.*recusado/);
  const fonte = fs.readFileSync(ler, 'utf8');
  assert.doesNotMatch(fonte, /solve_cloudflare|block_webrtc|hide_canvas/);
  // Sem navegador furtivo nem imitação: nada de StealthyFetcher (o Chromium do
  // patchright) e o Fetcher sem os cabeçalhos "reais", sem impersonate e sem o
  // Referer do Google que o stealthy_headers põe.
  const codigo = fonte.replace(/"""[\s\S]*?"""/g, '').replace(/#.*$/gm, '');
  assert.doesNotMatch(codigo, /StealthyFetcher|StealthySession|patchright|google_search|google\.com/);
  const chamada = codigo.match(/Fetcher\.get\(([\s\S]*?)\)\n/);
  assert.ok(chamada, 'o modo simples chama Fetcher.get');
  assert.match(chamada[1], /stealthy_headers=False/);
  assert.match(chamada[1], /impersonate=None/);
  assert.match(chamada[1], /"User-Agent": AGENTE/);
  assert.doesNotMatch(fonte, /proxy\s*=|"proxy"|extra\s*=/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'fontes', 'paginas.js'), 'utf8'), /FINDE_PROXY_URL/);
});

test('D14 de ponta a ponta: os dois modos se identificam e não mandam Referer nem cabeçalho inventado (servidor local)', async (t) => {
  const { spawnSync, spawn } = require('node:child_process');
  const http = require('node:http');
  const pasta = path.join(__dirname, '..', 'coletores', 'paginas');
  const envUv = { ...process.env, PATH: `${path.join(os.homedir(), '.local', 'bin')}${path.delimiter}${process.env.PATH || ''}` };
  const pronto = spawnSync('uv', ['run', '--offline', '--project', pasta, 'python', '-c', 'import playwright, scrapling'], { env: envUv });
  if (pronto.status !== 0) {
    t.skip('uv run --offline com o Scrapling e o Playwright não funcionou nesta máquina');
    return;
  }
  const vistos = [];
  const srv = http.createServer((req, res) => {
    vistos.push({ caminho: req.url, ua: req.headers['user-agent'], referer: req.headers.referer || null });
    if (req.url === '/recusado') {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><head><title>Just a moment...</title></head><body>bloqueado</body></html>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.url === '/evento') {
      // O JSON-LD só aparece depois, como na Ingresse.
      res.end('<html><head><title>Festa Local</title></head><body><h1>Festa</h1><script>setTimeout(function(){var s=document.createElement("script");s.type="application/ld+json";s.textContent=JSON.stringify({"@type":"Event",name:"Festa Local"});document.head.appendChild(s)},200)</script></body></html>');
    } else res.end('<html><head><title>Simples</title><script type="application/ld+json">{"@type":"Event","name":"S"}</script></head><body>ok</body></html>');
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ler = (pedido) => new Promise((ok) => {
    const f = spawn('uv', ['run', '--offline', '--project', pasta, 'python', path.join(pasta, 'ler.py')], { env: envUv });
    let saida = '';
    f.stdout.on('data', (d) => { saida += d; });
    f.stderr.on('data', () => {});
    f.on('close', () => ok(saida.trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))));
    f.stdin.end(JSON.stringify(pedido));
  });
  try {
    const [s1] = await ler({ urls: [`${base}/s`], modo: 'simples', timeoutMs: 10000 });
    assert.equal(s1.status, 200, s1.erro);
    assert.equal(s1.jsonld[0].name, 'S');
    const [d1] = await ler({ urls: [`${base}/evento`], modo: 'dinamico', semRecursos: true, esperar: 'script[type="application/ld+json"]', timeoutMs: 15000 });
    if (d1.status === 0 && /Executable|executable|browser/i.test(d1.erro || '')) {
      t.skip(`sem o Chromium nesta máquina (${d1.erro})`);
      return;
    }
    assert.equal(d1.status, 200, d1.erro);
    assert.equal(d1.jsonld[0].name, 'Festa Local', 'esperou o JSON-LD montado depois');
    for (const v of vistos) {
      assert.match(v.ua, /^FindeMotor\//, `${v.caminho}: User-Agent do projeto`);
      assert.equal(v.referer, null, `${v.caminho}: sem Referer inventado`);
    }
    assert.deepEqual(vistos.map((v) => v.caminho), ['/s', '/evento']);
    // Recusa no dinâmico com `esperar` volta como recusa, não como TimeoutError do seletor.
    const [r1] = await ler({ urls: [`${base}/recusado`], modo: 'dinamico', semRecursos: true, esperar: 'script[type="application/ld+json"]', timeoutMs: 15000 });
    assert.equal(r1.status, 403, r1.erro);
    assert.equal(r1.erro ?? null, null);
  } finally {
    await new Promise((ok) => srv.close(ok));
  }
});

// ---- fila: o que entra, como é lido ---------------------------------------

test('fila: URL de imagem (kraken, images, .jpg) não vira página; hosts novos entram', async () => {
  const fila = new Set([
    'https://kraken.ingresse.com/event/posters/1/large/1.jpg',
    'https://images.sympla.com.br/6a8fadcbda307.jpg',
    'https://www.ingresse.com/festa/banner.png?x=1',
    'https://www.ingresse.com/festa-boa/',
    'https://www.sympla.com.br/evento/festa/123',
    'https://bileto.sympla.com.br/event/777/festa',
    'https://shotgun.live/pt-br/events/festa',
    'https://www.guicheweb.com.br/festa_1/2',
  ]);
  const { ctx, pedidos } = contexto({
    config: { hosts: ['ingresse.com', 'sympla.com.br', 'bileto.sympla.com.br', 'shotgun.live', 'guicheweb.com.br'] },
    fila, extrator: extratorQueFalha, paginasLidas: () => [],
  });
  await paginas.coletar(ctx);
  const lidas = pedidos.flatMap((p) => p.urls).sort();
  assert.deepEqual(lidas, [
    'https://bileto.sympla.com.br/event/777/festa',
    'https://shotgun.live/pt-br/events/festa',
    'https://www.guicheweb.com.br/festa_1/2',
    'https://www.ingresse.com/festa-boa/',
    'https://www.sympla.com.br/evento/festa/123',
  ]);
  assert.ok(lidas.every((u) => !/\.(jpg|png)|kraken|images\./.test(u)));
  // Cada site no modo que ele pede: Sympla e Shotgun sem navegador; Ingresse esperando o evento.
  const modoDe = (host) => pedidos.find((p) => p.urls.some((u) => u.includes(host))).opcoes;
  assert.equal(modoDe('www.sympla.com.br').modo, 'simples');
  assert.equal(modoDe('shotgun.live').modo, 'simples');
  assert.equal(modoDe('www.ingresse.com').modo, 'dinamico');
  assert.equal(modoDe('www.ingresse.com').semRecursos, true);
  assert.match(modoDe('www.ingresse.com').esperar, /ld\+json/);
});

test('páginas: JSON-LD com geo e image sai com os dois; a imagem vai em item.imagens, não no bruto', async () => {
  const sg = dados('shotgun-evento.json');
  const { ctx } = contexto({ fila: new Set([sg.url]), config: { hosts: ['shotgun.live'], janelas: null, dias: 30 }, extrator: extratorQueFalha, paginasLidas: () => [sg] });
  const r = await paginas.coletar(ctx);
  assert.equal(r.itens.length, 1);
  const it = r.itens[0];
  assert.deepEqual(it.bruto.geo, { lat: -23.55123, lng: -46.63311 });
  assert.equal(it.bruto.cep, '01000-000');
  assert.equal(it.bruto.idPlataforma, 'shotgun:festa-exemplo');
  assert.equal(it.bruto.cartaz, undefined);
  assert.doesNotMatch(JSON.stringify(it.bruto), /assets\.shotgun\.example/, 'o endereço do CDN não fica no bruto');
  assert.deepEqual(it.imagens, [{
    url: 'https://assets.shotgun.example/image/upload/c_limit,w_1200,h_630,f_jpg,q_auto:good/production/artworks/capa-exemplo.png',
    papel: 'pagina-ingresso', origem: sg.url, credito: 'Divulgação · Produtora Exemplo', leitura: null,
  }]);
  // O Shotgun vende festa e show: o item diz isso ao classificador e não grava ehFesta.
  assert.match(it.texto, /^Plataforma: Shotgun \(vende festas e shows\)/);
  assert.equal(it.bruto.ehFesta, undefined);
  assert.equal(it.lidoPorModelo, undefined);
});

test('páginas: página de agenda não usa og:image e não manda imagem', async () => {
  const url = 'https://casa.example/agenda';
  const extrator = { lerPagina: async () => ({ confianca: 'alta', festas: [festa('Baile A', '2026-12-05'), festa('Baile B', '2026-12-06')] }) };
  const meta = { ogImage: 'https://casa.example/og.jpg', ogImageWidth: 1200, ogImageHeight: 630, twitterImage: null };
  const { ctx } = contexto({ config: { agendas: [url] }, extrator, paginasLidas: (us) => us.map((u) => pagina(u, { meta })) });
  const r = await paginas.coletar(ctx);
  assert.equal(r.itens.length, 2);
  assert.ok(r.itens.every((i) => i.imagens === undefined));
  // Já a página de um evento só, lida pelo modelo, usa o og:image (por último).
  const um = 'https://www.ingresse.com/evento-unico/';
  const { ctx: c2 } = contexto({ fila: new Set([um]), extrator: { lerPagina: async () => ({ confianca: 'alta', festas: [festa('Evento Único', '2026-11-14')] }) }, paginasLidas: (us) => us.map((u) => pagina(u, { meta })) });
  const r2 = await paginas.coletar(c2);
  assert.equal(r2.itens[0].imagens[0].url, 'https://casa.example/og.jpg');
  assert.equal(r2.itens[0].imagens[0].papel, 'pagina-ingresso');
});

test('Sympla: __NEXT_DATA__ traz CEP, geo e o banner; preço sai do texto do navegador pelo extrator', async () => {
  const f = dados('sympla-evento.json');
  const url = f.simples.url;
  const lidos = [];
  const extrator = {
    lerPagina: async (p) => {
      lidos.push(p.url);
      return { confianca: 'alta', festas: [{ ...festa('Baile Exemplo 29.11', '2026-11-29'), lotes: [{ nome: 'Pista', preco: 20, disponivel: true }, { nome: 'Camarote', preco: 40, disponivel: null }] }] };
    },
  };
  const pedidosPorModo = [];
  const { ctx } = contexto({
    fila: new Set([url]), config: { hosts: ['sympla.com.br'], dias: 30, janelas: null }, extrator,
    paginasLidas: (us, op) => { pedidosPorModo.push(op.modo); return us.map(() => (op.modo === 'simples' ? f.simples : f.dinamico)); },
  });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(pedidosPorModo, ['simples', 'dinamico'], 'primeiro o JSON do servidor, depois o navegador só para o preço');
  assert.equal(r.itens.length, 1);
  const b = r.itens[0].bruto;
  assert.equal(b.cep, '01000-000');
  assert.deepEqual(b.geo, { lat: -23.55123, lng: -46.63311 });
  assert.equal(b.idPlataforma, 'sympla:3999001');
  assert.deepEqual(b.lotes.map((l) => [l.nome, l.preco]), [['Pista', 20], ['Camarote', 40]]);
  assert.ok(b.paginas[0].campos.includes('lotes'));
  assert.equal(r.itens[0].imagens[0].url, 'https://images.sympla.example/abc123exemplo-lg.jpg');
  assert.equal(r.itens[0].lidoPorModelo, undefined, 'o extrator só deu os lotes; o resto é do JSON');
  assert.equal(lidos.length, 1);
  // Sem extrator (sem chave), a festa fica sem preço e a rodada segue.
  const { ctx: c2 } = contexto({ fila: new Set([url]), config: { hosts: ['sympla.com.br'], dias: 30, janelas: null }, extrator: null, paginasLidas: (us, op) => us.map(() => f.simples) });
  const r2 = await paginas.coletar(c2);
  assert.equal(r2.itens[0].bruto.lotes, undefined);
});

test('páginas: casca da Ingresse não chama o extrator e a leitura boa da mesma página chama', async () => {
  const f = dados('ingresse-evento.json');
  const { ctx } = contexto({ fila: new Set([f.casca.url]), extrator: extratorQueFalha, paginasLidas: () => [f.casca] });
  const r = await paginas.coletar(ctx);
  assert.equal(r.itens.length, 0);
  assert.match(r.avisos[0], /só a casca/);
  assert.equal(r.rodou, true, 'a página voltou 2xx, mesmo vazia');
  // O evento carregado: JSON-LD da Ingresse, sem modelo, com a imagem grande e sem casa quando ela é a cidade.
  const ev = JSON.parse(JSON.stringify(f.evento));
  ev.jsonld[0].location.name = 'São Paulo';
  ev.jsonld[0].startDate = '2026-11-14T22:00:00+00:00';
  const { ctx: c2 } = contexto({ fila: new Set([ev.url]), extrator: extratorQueFalha, paginasLidas: () => [ev] });
  const r2 = await paginas.coletar(c2);
  assert.equal(r2.itens.length, 1);
  const b = r2.itens[0].bruto;
  assert.equal(b.casa, undefined, 'casa igual à cidade não sai da Ingresse');
  assert.equal(b.cep, '01000-000');
  assert.equal(b.idPlataforma, 'ingresse:festa-exemplo-05-12');
  assert.equal(r2.itens[0].imagens[0].url, 'https://kraken.ingresse.example/event/posters/999001/large/1.jpg');
});

test('páginas: festa fora de São Paulo (Cotia) é recusada na leitura, pelo JSON-LD e pelo modelo', async () => {
  const url = 'https://www.ingresse.com/dna-cotia/';
  const ev = { ...EVENTO_INGRESSE, name: 'DNA em Cotia', location: { '@type': 'Place', name: 'DNA', address: { '@type': 'PostalAddress', streetAddress: 'Rua X, 1 - Granja, Cotia - SP, 06700-000, Brasil', addressLocality: 'Granja' } }, startDate: '2026-11-14T22:00:00+00:00' };
  const { ctx } = contexto({ fila: new Set([url]), extrator: extratorQueFalha, paginasLidas: () => [pagina(url, { jsonld: [ev] })] });
  assert.equal((await paginas.coletar(ctx)).itens.length, 0);
  const url2 = 'https://casa.example/agenda';
  const lerFesta = { ...festa('Baile em Cotia', '2026-11-14'), cidade: 'Cotia', uf: 'SP' };
  const { ctx: c2 } = contexto({ config: { agendas: [url2] }, extrator: { lerPagina: async () => ({ confianca: 'alta', festas: [lerFesta, festa('Baile Daqui', '2026-11-15')] }) }, paginasLidas: (us) => us.map((u) => pagina(u)) });
  assert.deepEqual((await paginas.coletar(c2)).itens.map((i) => i.bruto.nome), ['Baile Daqui']);
});

test('páginas: janelas recortam as listagens às semanas das apresentações e a fila fica de fora delas', async () => {
  const sg = dados('shotgun-evento.json');
  const lista = dados('shotgun-listagem.json');
  const leitor = (us) => us.map((u) => (u === lista.url ? lista : { ...sg, url: u, final: u, jsonld: [{ ...sg.jsonld[0], url: u }] }));
  const base = { hosts: [], listagens: [LISTAGEM_SHOTGUN] };
  const dentro = contexto({ config: { ...base, janelas: [['2026-11-14', '2026-11-14']] }, extrator: extratorQueFalha, paginasLidas: leitor });
  assert.ok((await paginas.coletar(dentro.ctx)).itens.length > 0);
  const fora = contexto({ config: { ...base, janelas: [['2026-12-03', '2026-12-06']] }, extrator: extratorQueFalha, paginasLidas: leitor });
  assert.equal((await paginas.coletar(fora.ctx)).itens.length, 0);
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

test('worker: cada linha que o leitor devolve bate o batimento da execução (U8)', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-uv-'));
  const uv = path.join(pasta, 'uv-falso.sh');
  const linha = (u) => JSON.stringify({ url: u, final: u, status: 200, titulo: 'T', texto: 't', jsonld: [], links: [] });
  fs.writeFileSync(uv, `#!/bin/sh\ncat > /dev/null\necho 'log solto'\necho '${linha('https://a.example/x')}'\necho '${linha('https://a.example/y')}'\n`, { mode: 0o755 });
  let batidas = 0;
  const linhas = await paginas.lerPaginasPeloWorker(['https://a.example/x', 'https://a.example/y'], { uv, limiteMs: 5000, aoLer: () => { batidas += 1; } });
  assert.deepEqual(linhas.map((l) => l.status), [200, 200]);
  assert.equal(batidas, 2, 'uma por página, nenhuma pelo log solto');
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('workers: o leitor de páginas e o de imagens não herdam os segredos do motor', async () => {
  const { envDoWorker } = require('../nucleo/worker');
  const { prepararPeloWorker } = require('../nucleo/imagens');
  const base = { PATH: '/usr/bin', HOME: '/home/x', UV_PROJECT_ENVIRONMENT: '/opt/v', PLAYWRIGHT_BROWSERS_PATH: '/opt/pw', LANG: 'C.UTF-8',
    ANTHROPIC_API_KEY: 'a', APIFY_TOKEN: 'b', FINDE_ADMIN_TOKEN: 'c', FINDE_APP_TOKEN: 'd', AWS_SECRET_ACCESS_KEY: 'e', AWS_ACCESS_KEY_ID: 'f', BUCKET_NAME: 'g', UV_INDEX_TOKEN: 'h', FINDE_BANCO: '/data/x' };
  const env = envDoWorker(base);
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'UV_PROJECT_ENVIRONMENT']);
  assert.match(env.PATH, /\.local\/bin.*\/usr\/bin$/);
  // De ponta a ponta: um "uv" falso conta o que recebeu.
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-uv-'));
  const uv = path.join(pasta, 'uv-falso.sh');
  fs.writeFileSync(uv, '#!/bin/sh\ncat > /dev/null\nprintf \'{"url":"https://a.example/x","caminho":"/x","status":200,"titulo":"%s|%s|%s","erro":"%s|%s|%s"}\\n\' "${ANTHROPIC_API_KEY:-vazio}" "${FINDE_ADMIN_TOKEN:-vazio}" "${AWS_SECRET_ACCESS_KEY:-vazio}" "${ANTHROPIC_API_KEY:-vazio}" "${FINDE_ADMIN_TOKEN:-vazio}" "${AWS_SECRET_ACCESS_KEY:-vazio}"\n', { mode: 0o755 });
  const guardados = {};
  for (const k of ['ANTHROPIC_API_KEY', 'FINDE_ADMIN_TOKEN', 'AWS_SECRET_ACCESS_KEY']) {
    guardados[k] = process.env[k];
    process.env[k] = `segredo-de-teste-${k}`;
  }
  try {
    const [p] = await paginas.lerPaginasPeloWorker(['https://a.example/x'], { uv, limiteMs: 5000 });
    assert.equal(p.titulo, 'vazio|vazio|vazio');
    const [im] = await prepararPeloWorker(['/x'], { uv, dirSaida: pasta, limiteMs: 5000 });
    assert.equal(im.erro, 'vazio|vazio|vazio');
  } finally {
    for (const [k, v] of Object.entries(guardados)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('páginas: a coleta bate a cada lote e a cada página, e passa o batimento ao leitor', async () => {
  const urls = ['https://www.ingresse.com/clube-exemplo-27-11/', 'https://www.ingresse.com/outra-exemplo-28-11/'];
  let batidas = 0;
  let noLeitor = 0;
  const { ctx } = contexto({ fila: new Set(urls), extrator: extratorQueFalha, paginasLidas: (us, opcoes) => {
    assert.equal(typeof opcoes.aoLer, 'function', 'o leitor recebe o batimento');
    const antes = batidas;
    for (const _ of us) opcoes.aoLer();
    noLeitor += batidas - antes;
    return us.map((u) => pagina(u, { jsonld: [EVENTO_INGRESSE] }));
  } });
  ctx.batimento = () => { batidas += 1; };
  await paginas.coletar(ctx);
  assert.equal(noLeitor, urls.length);
  assert.ok(batidas >= urls.length + 2 + urls.length, `só ${batidas} batidas`);
});

// ---- listagem paginada e página de produtor da Sympla ---------------------------

test('listagem: lê as páginas ?page=N até uma não trazer evento novo, e some os cartões e links de todas', async () => {
  const sg = dados('shotgun-evento.json');
  const evento = (slug) => ({ ...sg, url: `https://shotgun.live/pt-br/events/${slug}`, final: `https://shotgun.live/pt-br/events/${slug}`, jsonld: [{ ...sg.jsonld[0], url: `https://shotgun.live/pt-br/events/${slug}`, name: slug }] });
  const paginasDaLista = {
    'https://shotgun.live/pt-br/cities/sao-paulo': ['a', 'b'],
    'https://shotgun.live/pt-br/cities/sao-paulo?page=2': ['c', 'b'],
    'https://shotgun.live/pt-br/cities/sao-paulo?page=3': ['c'],
  };
  const lidas = [];
  const leitor = (us) => us.map((u) => {
    lidas.push(u);
    if (paginasDaLista[u]) return pagina(u, { links: paginasDaLista[u].map((s) => `https://shotgun.live/pt-br/events/${s}`) });
    return evento(u.split('/').pop());
  });
  const { ctx } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, paginas: 5 }] }, extrator: extratorQueFalha, paginasLidas: leitor });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(lidas.filter((u) => /cities/.test(u)), Object.keys(paginasDaLista), 'a página 3 não trouxe nada novo: a 4 nem é pedida');
  assert.deepEqual(r.itens.map((i) => i.bruto.nome).sort(), ['a', 'b', 'c']);
});

test('listagem: página 2 recusada (429) encerra a paginação e trava o host: nenhum evento dele é pedido depois', async () => {
  const sg = dados('shotgun-evento.json');
  const leitor = (us) => us.map((u) => {
    if (u.endsWith('sao-paulo')) return pagina(u, { links: ['https://shotgun.live/pt-br/events/a'] });
    if (u.includes('page=2')) return pagina(u, { status: 429 });
    return { ...sg, url: u, final: u, jsonld: [{ ...sg.jsonld[0], url: u, name: 'A' }] };
  });
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, paginas: 5 }] }, extrator: extratorQueFalha, paginasLidas: leitor });
  const r = await paginas.coletar(ctx);
  assert.equal(pedidos.filter((p) => /cities/.test(p.urls[0])).length, 2, 'a página 3 não é tentada');
  assert.equal(pedidos.length, 2, 'o evento achado na página 1 não é pedido: o host recusou');
  assert.equal(r.itens.length, 0);
  assert.ok(r.avisos.some((a) => /\(página 2\): recusou o acesso \(429\)/.test(a)));
  assert.ok(r.avisos.some((a) => /^shotgun\.live: recusou o acesso; 1 página\(s\) deixaram de ser pedidas/.test(a)));
});

test('trava por host: depois de um 429, o mesmo host não recebe pedido nem em outro lote; os outros seguem', async () => {
  const url1 = 'https://www.ingresse.com/festa-a';
  const url2 = 'https://bileto.sympla.com.br/event/1';
  const casa = 'https://casa.example/agenda';
  const leitor = (us) => us.map((u) => {
    if (u === casa) return pagina(u, { links: ['https://www.ingresse.com/festa-b', 'https://www.ingresse.com/festa-c'] });
    if (u === url1) return pagina(u, { status: 429 });
    return pagina(u, { titulo: 'Outra' });
  });
  const { ctx, pedidos } = contexto({
    fila: new Set([url1, url2]),
    config: { hosts: ['ingresse.com', 'bileto.sympla.com.br'], agendas: [{ url: casa, modo: 'simples', seguir: true }] },
    extrator: extratorQueFalha, paginasLidas: leitor,
  });
  const r = await paginas.coletar(ctx);
  const pedidas = pedidos.flatMap((p) => p.urls);
  assert.ok(pedidas.includes(url1) && pedidas.includes(url2) && pedidas.includes(casa));
  assert.ok(!pedidas.includes('https://www.ingresse.com/festa-b'), 'o host que recusou não recebe os links da agenda');
  assert.ok(r.avisos.some((a) => /^ingresse\.com: recusou o acesso; 2 página\(s\)/.test(a)));
});

test('agenda com seguir: só links de evento dos hosts da config (sem imagem, busca, raiz nem o próprio site), lidos no modo de cada host', async () => {
  const casa = 'https://www.casa.example/';
  const links = [
    'https://www.ingresse.com/moving-26-11',
    'https://www.ingresse.com/moving-26-11?utm_source=site',
    'https://www.ingresse.com/busca/casa',
    'https://www.ingresse.com/',
    'https://festival-x.ingresse.com/',
    'https://kraken.ingresse.com/event/posters/1/medium/a.jpg',
    'https://www.casa.example/sobre',
    'https://outro.example/evento',
  ];
  const lidas = [];
  const leitor = (us) => us.map((u) => {
    lidas.push(u);
    return u === casa ? pagina(u, { links, titulo: 'Casa', texto: 'Programação' }) : pagina(u, { titulo: 'Evento' });
  });
  const extrator = { lerPagina: async ({ url }) => { if (url === casa) throw new Error('a página da casa não vai ao extrator'); return { confianca: 'alta', festas: [] }; } };
  const { ctx, pedidos } = contexto({ config: { hosts: ['ingresse.com'], agendas: [{ url: casa, modo: 'simples', seguir: true }] }, extrator, paginasLidas: leitor });
  const r = await paginas.coletar(ctx);
  assert.deepEqual(lidas.filter((u) => u !== casa).sort(), ['https://festival-x.ingresse.com/', 'https://www.ingresse.com/moving-26-11']);
  assert.equal(pedidos[0].opcoes.modo, 'simples');
  const doEvento = pedidos.find((p) => p.urls.includes('https://www.ingresse.com/moving-26-11'));
  assert.equal(doEvento.opcoes.modo, 'dinamico');
  assert.ok(!r.avisos.some((a) => /a página da casa não vai ao extrator/.test(a)));
});

test('Sympla: a página de um produtor, vinda da fila, é agenda: os cartões do HTML viram os itens', async () => {
  const lista = dados('sympla-listagem.json');
  const url = 'https://www.sympla.com.br/produtor/casa-exemplo';
  const { ctx, pedidos } = contexto({
    fila: new Set([url]), config: { hosts: ['sympla.com.br'], dias: 30, janelas: null, precoSympla: false }, extrator: extratorQueFalha,
    paginasLidas: (us) => us.map((u) => ({ ...lista, url: u, final: u })),
  });
  const r = await paginas.coletar(ctx);
  assert.equal(pedidos[0].opcoes.modo, 'simples');
  assert.ok(r.itens.length >= 1);
  const baile = r.itens.find((i) => i.bruto.nome === 'Baile do Mirante');
  assert.equal(baile.idExterno, 'pagina:https://www.sympla.com.br/evento/baile-do-mirante/3400001');
  assert.equal(baile.bruto.paginas[0].url, 'https://www.sympla.com.br/evento/baile-do-mirante/3400001');
  assert.equal(baile.bruto.idPlataforma, 'sympla:3400001');
});

test('agenda: link com data DDMMAA que já passou nem é aberto; id numérico longo não é data', () => {
  assert.equal(paginas.dataDoLink('https://www.ingresse.com/noite-exemplo261126/'), '2026-11-26');
  assert.equal(paginas.dataDoLink('https://www.sympla.com.br/evento/festa-exemplo/3620056'), null);
  assert.equal(paginas.dataDoLink('https://www.ingresse.com/noite-exemplo/'), null);
  const p = { url: 'https://casa.example/', links: ['https://www.ingresse.com/noite-exemplo121126/', 'https://www.ingresse.com/noite-exemplo261126/', 'https://www.ingresse.com/noite-exemplo/'] };
  assert.deepEqual(paginas.linksDaAgenda(p, { hosts: ['ingresse.com'] }, {}, '2026-11-24'), ['https://www.ingresse.com/noite-exemplo261126/', 'https://www.ingresse.com/noite-exemplo/']);
});

test('listagem com ligada:false não é pedida', async () => {
  const { ctx, pedidos } = contexto({ config: { hosts: [], listagens: [{ ...LISTAGEM_SHOTGUN, ligada: false }] }, extrator: extratorQueFalha, paginasLidas: (us) => us.map((u) => pagina(u)) });
  await paginas.coletar(ctx);
  assert.equal(pedidos.length, 0);
});

test('trava: 403 numa página avulsa encerra só ela; a listagem do mesmo site segue', async () => {
  const lista = dados('sympla-listagem.json');
  const avulsa = 'https://www.sympla.com.br/evento/festa-privada-exemplo/3999001';
  const { ctx, pedidos } = contexto({
    fila: new Set([avulsa]),
    config: { hosts: ['sympla.com.br'], dias: 30, janelas: null, precoSympla: false, listagens: [{ id: 'sympla', url: 'https://www.sympla.com.br/eventos/sao-paulo-sp', modo: 'simples', paginas: 1 }] },
    extrator: extratorQueFalha,
    paginasLidas: (us) => us.map((u) => (u === avulsa ? pagina(u, { status: 403 }) : { ...lista, url: u, final: u })),
  });
  await paginas.coletar(ctx);
  assert.ok(pedidos.some((p) => p.urls[0] === 'https://www.sympla.com.br/eventos/sao-paulo-sp'), 'a listagem foi pedida');
});

test('trava pela plataforma: depois de um 429 em www.ingresse.com, o subdomínio também não é pedido; o leitor recebe as travas', async () => {
  const casa = 'https://casa.example/';
  const { ctx, pedidos } = contexto({
    fila: new Set(['https://www.ingresse.com/noite-a']),
    config: { hosts: ['ingresse.com'], agendas: [{ url: casa, modo: 'simples', seguir: true }] },
    extrator: extratorQueFalha,
    paginasLidas: (us) => us.map((u) => (u === casa ? pagina(u, { links: ['https://festival-exemplo.ingresse.com/'] }) : pagina(u, { status: 429 }))),
  });
  await paginas.coletar(ctx);
  assert.ok(!pedidos.flatMap((p) => p.urls).includes('https://festival-exemplo.ingresse.com/'));
});

test('preço da Sympla: o lote que o banco já tem volta ao item e ele não vai de novo ao navegador', async () => {
  const { novoBanco } = require('./ajuda');
  const db = novoBanco();
  const id = 'pagina:https://www.sympla.com.br/evento/noite-exemplo/3999002';
  db.prepare("INSERT INTO festas (id, data, criada_em) VALUES ('f1', '2026-12-05', '2026-11-24T10:00:00Z')").run();
  db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em) VALUES ('paginas', ?, 'f1', 'u', '2026-11-24T10:00:00Z')").run(id);
  db.prepare("INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES ('f1', 'lotes', 'paginas', ?, 'x', 'x')").run(JSON.stringify([{ nome: '1º lote', preco: 50, disponivel: true }]));
  const evento = { url: 'https://www.sympla.com.br/evento/noite-exemplo/3999002', final: 'https://www.sympla.com.br/evento/noite-exemplo/3999002', status: 200, titulo: 'Noite Exemplo', texto: 'festa com DJ', links: [], meta: null, dados: null,
    jsonld: [{ '@type': 'Event', name: 'Noite Exemplo', startDate: '2026-12-05T23:00:00-03:00', location: { '@type': 'Place', name: 'Casa Exemplo', address: { addressLocality: 'São Paulo', addressRegion: 'SP' } } }] };
  const navegadas = [];
  const { ctx } = contexto({
    fila: new Set([evento.url]), config: { hosts: ['sympla.com.br'], dias: 30, janelas: null },
    extrator: { lerPagina: async () => ({ confianca: 'alta', festas: [] }) },
    paginasLidas: (us, o) => { if (o.modo === 'dinamico') navegadas.push(...us); return us.map(() => evento); },
  });
  ctx.db = db;
  const r = await paginas.coletar(ctx);
  const item = r.itens.find((i) => i.idExterno === id);
  assert.ok(item, JSON.stringify(r.itens.map((i) => i.idExterno)));
  assert.equal(item.bruto.lotes[0].preco, 50);
  assert.deepEqual(navegadas, []);
});

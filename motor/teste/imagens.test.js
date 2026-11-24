'use strict';
// Imagens no motor (U16, U17): o worker de Pillow, o download seguro, o
// registro por conteúdo, a escolha da principal, ocultar e a limpeza.
// Nenhum teste toca a rede nem escreve fora de uma pasta temporária; os que
// dependem do worker (uv + Pillow) pulam com aviso se o `uv run --offline` falhar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const I = require('../nucleo/imagens');
const { novoBanco, relogio, logMudo } = require('./ajuda');

const FIX = path.join(__dirname, 'dados', 'imagens');
const PASTA_WORKER = path.join(__dirname, '..', 'coletores', 'paginas');
const UV = path.join(os.homedir(), '.local', 'bin');
const ENV = { ...process.env, PATH: `${UV}${path.delimiter}${process.env.PATH || ''}` };

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'finde-imagens-'));
const fix = (n) => path.join(FIX, n);

// ---- o worker --------------------------------------------------------------

const pronto = spawnSync('uv', ['run', '--offline', '--project', PASTA_WORKER, 'python', '-c', 'import PIL'], { env: ENV });
const semWorker = pronto.status !== 0 ? 'uv run --offline com Pillow não funcionou nesta máquina' : false;
if (semWorker) console.warn(`# AVISO: testes do worker de imagem pulados: ${semWorker}`);
const tw = (nome, fn) => test(nome, { skip: semWorker }, fn);

const worker = (caminhos, dirSaida) => I.prepararPeloWorker(caminhos, { dirSaida, offline: true });

// Roda um trecho de Python do Pillow (para gerar as imagens grandes dos testes).
function py(codigo) {
  const r = spawnSync('uv', ['run', '--offline', '--project', PASTA_WORKER, 'python', '-c', codigo], { env: ENV, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

tw('worker: o mesmo JPEG recomprimido em q30 e na metade do tamanho dá pHash a no máximo 8 bits', async () => {
  const dir = pasta();
  const [a, q30] = await worker([fix('cartaz-a.jpg'), fix('cartaz-a-q30.jpg')], dir);
  assert.equal(a.erro, undefined);
  assert.equal(q30.erro, undefined);
  assert.match(a.phash, /^[0-9a-f]{16}$/);
  assert.match(a.dhash, /^[0-9a-f]{16}$/);
  assert.ok(I.distancia(a.phash, q30.phash) <= 8, `distância ${I.distancia(a.phash, q30.phash)}`);
  assert.notEqual(a.sha, q30.sha);
});

tw('worker: dois cartazes diferentes ficam a 16 bits ou mais', async () => {
  const [a, b] = await worker([fix('cartaz-a.jpg'), fix('cartaz-b.jpg')], pasta());
  assert.ok(I.distancia(a.phash, b.phash) >= 16, `distância ${I.distancia(a.phash, b.phash)}`);
});

tw('worker: o recorte 16:9 do mesmo cartaz não casa (e isso não separa a festa)', async () => {
  // O banner 16:9 de uma página de ingresso é um recorte do cartaz: o pHash
  // enxerga outra imagem (distância acima de 8). Por isso a correlação nunca
  // depende só da imagem: nome, data e casa decidem, a imagem só soma (KTD5).
  const [a, recorte] = await worker([fix('cartaz-a.jpg'), fix('cartaz-a-16x9.jpg')], pasta());
  assert.ok(I.distancia(a.phash, recorte.phash) > 8, `distância ${I.distancia(a.phash, recorte.phash)}`);
});

tw('worker: grava WebP 1080 e 480 pelo sha16, sem EXIF, e aplica a orientação', async () => {
  const dir = pasta();
  const jpg = path.join(pasta(), 'com-exif.jpg');
  py(`
from PIL import Image
im = Image.new('RGB', (600, 300), (200, 30, 30))
ex = Image.Exif()
ex[0x010F] = 'Marca Exemplo'
ex[0x0112] = 6
ex[0x8825] = {1: 'S', 2: (23.0, 33.0, 0.0)}
im.save(${JSON.stringify(jpg)}, exif=ex)
`);
  assert.ok(fs.readFileSync(jpg).includes(Buffer.from('Exif')), 'a entrada tem EXIF');
  const [r] = await worker([jpg], dir);
  assert.equal(r.erro, undefined);
  assert.match(r.arquivo, /^imagens\/[0-9a-f]{16}-1080\.webp$/);
  assert.equal(r.arquivo, `imagens/${r.sha.slice(0, 16)}-1080.webp`);
  assert.equal(r.miniatura, `imagens/${r.sha.slice(0, 16)}-480.webp`);
  assert.equal(r.tipo, 'jpeg');
  assert.deepEqual([r.largura, r.altura], [300, 600]); // orientação 6 girou 90 graus
  for (const nome of [path.basename(r.arquivo), path.basename(r.miniatura)]) {
    const bytes = fs.readFileSync(path.join(dir, nome));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
    assert.equal(bytes.includes(Buffer.from('EXIF')), false, `${nome} sem EXIF`);
    assert.equal(bytes.includes(Buffer.from('Marca Exemplo')), false);
    assert.equal(I.caminhoSeguro(nome), nome);
  }
  assert.equal(r.bytes, fs.statSync(path.join(dir, path.basename(r.arquivo))).size);
});

tw('worker: nunca amplia, e a imagem larga cabe em 1080 de largura', async () => {
  const dir = pasta();
  const png = path.join(pasta(), 'larga.png');
  py(`
from PIL import Image
Image.new('RGB', (3000, 1500), (10, 80, 160)).save(${JSON.stringify(png)})
`);
  const [r] = await worker([png], dir);
  assert.deepEqual([r.largura, r.altura], [1080, 540]);
  const [pequena] = await worker([fix('transparente.png')], dir);
  assert.deepEqual([pequena.largura, pequena.altura], [64, 64]);
});

tw('worker: arquivo de 9 MB, SVG e HTML são recusados', async () => {
  const dir = pasta();
  const grande = path.join(pasta(), 'grande.jpg');
  fs.writeFileSync(grande, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(9 * 1024 * 1024)]));
  const [g, svg, html] = await worker([grande, fix('desenho.svg'), fix('pagina.html')], dir);
  assert.match(g.erro, /acima do limite de 8 MB/);
  assert.match(svg.erro, /formato não aceito/);
  assert.match(html.erro, /formato não aceito/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

tw('worker: PNG acima de 16 megapixels é recusado', async () => {
  const dir = pasta();
  const base = pasta();
  const acima = path.join(base, 'acima.png');
  py(`
from PIL import Image
Image.new('RGB', (5000, 4000), (30, 30, 30)).save(${JSON.stringify(acima)}, optimize=False, compress_level=9)
`);
  assert.ok(fs.statSync(acima).size < 8 * 1024 * 1024, 'o arquivo de teste passa do filtro de bytes');
  const [r] = await worker([acima], dir);
  assert.match(r.erro, /acima de 16 megapixels/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

tw('worker: um JPEG de 6000x6000 sai com pico abaixo de 120 MB e um PNG de 4000x4000 abaixo de 200 MB', async () => {
  const base = pasta();
  const jpg = path.join(base, 'enorme.jpg');
  const png = path.join(base, 'quadrado.png');
  py(`
from PIL import Image, ImageDraw
im = Image.new('RGB', (6000, 6000), (240, 240, 240))
d = ImageDraw.Draw(im)
for i in range(0, 6000, 500):
    d.rectangle([i, i, i + 400, i + 400], fill=(20 + i % 200, 90, 160))
im.save(${JSON.stringify(jpg)}, quality=85)
im2 = Image.new('RGB', (4000, 4000), (250, 250, 250))
d2 = ImageDraw.Draw(im2)
for i in range(0, 4000, 400):
    d2.ellipse([i, 100, i + 300, 2500], fill=(200, i % 250, 40))
im2.save(${JSON.stringify(png)})
`);
  assert.ok(fs.statSync(jpg).size < 8 * 1024 * 1024 && fs.statSync(png).size < 8 * 1024 * 1024);
  // Um processo por imagem: o pico é do processo inteiro.
  const [j] = await worker([jpg], pasta());
  assert.equal(j.erro, undefined);
  assert.ok(j.picoMb < 120, `JPEG 6000x6000: pico ${j.picoMb} MB`);
  assert.ok(j.largura <= 1080);
  const [p] = await worker([png], pasta());
  assert.equal(p.erro, undefined);
  assert.ok(p.picoMb < 200, `PNG 4000x4000: pico ${p.picoMb} MB`);
  console.log(`# pico medido: JPEG 6000x6000 ${j.picoMb} MB, PNG 4000x4000 ${p.picoMb} MB`);
});

test('worker: sem uv, cada caminho volta com erro e nada é guardado', async () => {
  const dir = pasta();
  const r = await I.prepararPeloWorker([fix('cartaz-a.jpg')], { dirSaida: dir, uv: '/nao/existe/uv' });
  assert.match(r[0].erro, /não consegui iniciar o worker de imagem/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

// ---- endereços recusados e download seguro ---------------------------------

test('ipRecusado: loopback, privados, link-local, CGNAT, reservados e IPv4 embutido em IPv6', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.1', '0.0.0.1', '::1', 'fdaa::1', '::ffff:10.0.0.1',
    '100.100.1.1', '100.64.0.1', '169.254.169.254', '169.254.1.1', 'fe80::1', '::', '::ffff:7f00:1', '64:ff9b::a00:1', '224.0.0.1', 'ff02::1', 'não-é-ip']) {
    assert.ok(I.ipRecusado(ip), `${ip} devia ser recusado`);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '1.1.1.1']) {
    assert.equal(I.ipRecusado(ip), null, `${ip} devia passar`);
  }
});

test('hostPermitido: exato e com curinga de subdomínio', () => {
  const hosts = ['images.sympla.com.br', '*.fbcdn.net'];
  assert.equal(I.hostPermitido('images.sympla.com.br', hosts), true);
  assert.equal(I.hostPermitido('scontent-gru1-1.xx.fbcdn.net', hosts), true);
  assert.equal(I.hostPermitido('fbcdn.net', hosts), false);
  assert.equal(I.hostPermitido('evilfbcdn.net', hosts), false);
  assert.equal(I.hostPermitido('images.sympla.com.br.evil.com', hosts), false);
  assert.equal(I.hostPermitido('outro.com', hosts), false);
});

const JPEG = fs.readFileSync(fix('cartaz-a.jpg'));
const PUBLICO = [{ address: '93.184.216.34', family: 4 }];
const HOSTS = ['images.sympla.com.br', '*.cdninstagram.com'];

function ambiente(rotas, { resolucao = () => PUBLICO } = {}) {
  const dir = pasta();
  const pedidos = [];
  const consultas = [];
  const fetch = async (url, o) => {
    pedidos.push({ url: String(url), endereco: o.endereco, redirect: o.redirect });
    const r = rotas(String(url));
    return r instanceof Response ? r : new Response(r, { status: 200 });
  };
  const resolver = async (host) => { consultas.push(host); return resolucao(host); };
  return { dir, pedidos, consultas, fetch, resolver };
}

test('baixar: só https, host da lista, endereço conferido e usado na conexão', async () => {
  const e = ambiente(() => JPEG);
  const r = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, dir: e.dir });
  assert.equal(r.ok.tipo, 'jpeg');
  assert.equal(r.ok.bytes, JPEG.length);
  assert.ok(r.ok.caminho.startsWith(path.join(e.dir, 'tmp')));
  assert.deepEqual(fs.readFileSync(r.ok.caminho), JPEG);
  // Resolveu uma vez e o fetch recebeu esse mesmo endereço, sem seguir redirecionamento sozinho.
  assert.deepEqual(e.consultas, ['images.sympla.com.br']);
  assert.deepEqual(e.pedidos[0].endereco, PUBLICO[0]);
  assert.equal(e.pedidos[0].redirect, 'manual');
  assert.equal(await I.baixar('http://images.sympla.com.br/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, dir: e.dir }), null);
  const http = await I.baixarOuMotivo('http://images.sympla.com.br/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, dir: e.dir });
  assert.match(http.motivo, /só https/);
});

test('baixar: recusa host fora da lista, mas aceita em `livre` com as mesmas conferências de endereço', async () => {
  const e = ambiente(() => JPEG);
  const fora = await I.baixarOuMotivo('https://outro.example/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, dir: e.dir });
  assert.match(fora.motivo, /host fora da lista/);
  assert.equal(e.pedidos.length, 0);
  const livre = await I.baixarOuMotivo('https://outro.example/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, livre: true, dir: e.dir });
  assert.ok(livre.ok);
  // Livre não dispensa a conferência: o nome que resolve para a rede interna é recusado.
  const interno = ambiente(() => JPEG, { resolucao: () => [{ address: '10.0.0.5', family: 4 }] });
  const r = await I.baixarOuMotivo('https://outro.example/a.jpg', { fetch: interno.fetch, resolver: interno.resolver, livre: true, dir: interno.dir });
  assert.match(r.motivo, /endereço recusado \(10\.0\.0\.5/);
  assert.equal(interno.pedidos.length, 0);
});

test('baixar: endereços privados recusados antes de qualquer conexão (literal e por nome)', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1', '0.0.0.1', '100.100.1.1', '169.254.169.254']) {
    const e = ambiente(() => JPEG);
    const literal = await I.baixarOuMotivo(`https://${ip}/a.jpg`, { fetch: e.fetch, resolver: e.resolver, livre: true, dir: e.dir });
    assert.match(literal.motivo, /endereço recusado/, ip);
    assert.equal(e.pedidos.length, 0, ip);
  }
  for (const ip of ['::1', 'fdaa::1', '::ffff:10.0.0.1']) {
    const e = ambiente(() => JPEG);
    const literal = await I.baixarOuMotivo(`https://[${ip}]/a.jpg`, { fetch: e.fetch, resolver: e.resolver, livre: true, dir: e.dir });
    assert.match(literal.motivo, /endereço recusado/, ip);
    assert.equal(e.pedidos.length, 0, ip);
    const porNome = ambiente(() => JPEG, { resolucao: () => [{ address: ip, family: 6 }] });
    const r = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: porNome.fetch, resolver: porNome.resolver, hosts: HOSTS, dir: porNome.dir });
    assert.match(r.motivo, /endereço recusado/, ip);
    assert.equal(porNome.pedidos.length, 0, ip);
  }
  // Nome com dois endereços, um deles interno: recusado.
  const misto = ambiente(() => JPEG, { resolucao: () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] });
  const m = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: misto.fetch, resolver: misto.resolver, hosts: HOSTS, dir: misto.dir });
  assert.match(m.motivo, /endereço recusado/);
});

test('baixar: redirecionamento é seguido à mão e conferido a cada salto', async () => {
  // Salto para endereço privado, por nome que resolve para a rede interna.
  const e = ambiente((url) => (url.includes('images.sympla')
    ? new Response(null, { status: 302, headers: { location: 'https://scontent.cdninstagram.com/b.jpg' } })
    : JPEG), { resolucao: (h) => (h.startsWith('scontent') ? [{ address: '192.168.1.10', family: 4 }] : PUBLICO) });
  const r = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, dir: e.dir });
  assert.match(r.motivo, /endereço recusado \(192\.168\.1\.10/);
  assert.equal(e.pedidos.length, 1);
  // Salto para IP literal privado.
  const lit = ambiente(() => new Response(null, { status: 301, headers: { location: 'https://10.0.0.1/segredo' } }));
  const r2 = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: lit.fetch, resolver: lit.resolver, hosts: HOSTS, dir: lit.dir });
  assert.match(r2.motivo, /endereço recusado \(10\.0\.0\.1|host fora da lista/);
  assert.equal(lit.pedidos.length, 1);
  // Salto para http.
  const http = ambiente(() => new Response(null, { status: 301, headers: { location: 'http://images.sympla.com.br/x' } }));
  assert.match((await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: http.fetch, resolver: http.resolver, hosts: HOSTS, dir: http.dir })).motivo, /só https/);
  // Salto legítimo, relativo, e depois o limite de três saltos.
  const bom = ambiente((url) => (url.endsWith('/a.jpg') ? new Response(null, { status: 302, headers: { location: '/b.jpg' } }) : JPEG));
  const ok = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: bom.fetch, resolver: bom.resolver, hosts: HOSTS, dir: bom.dir });
  assert.equal(ok.ok.urlFinal, 'https://images.sympla.com.br/b.jpg');
  assert.deepEqual(bom.consultas, ['images.sympla.com.br', 'images.sympla.com.br']);
  const laco = ambiente(() => new Response(null, { status: 302, headers: { location: '/a.jpg' } }));
  const l = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: laco.fetch, resolver: laco.resolver, hosts: HOSTS, dir: laco.dir });
  assert.match(l.motivo, /mais de 3 redirecionamentos/);
  assert.equal(laco.pedidos.length, 4);
});

test('baixar: resposta de 9 MB é cortada; o que não é imagem e o erro de rede são recusados', async () => {
  const e = ambiente(() => Buffer.concat([JPEG.subarray(0, 3), Buffer.alloc(9 * 1024 * 1024)]));
  const r = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: e.fetch, resolver: e.resolver, hosts: HOSTS, dir: e.dir });
  assert.match(r.motivo, /acima de 8 MB/);
  assert.equal(fs.existsSync(path.join(e.dir, 'tmp')), false);
  // Sem content-length, a leitura em stream é que corta.
  let lidos = 0;
  const stream = new ReadableStream({
    pull(c) { lidos += 1; c.enqueue(new Uint8Array(1024 * 1024)); if (lidos > 100) c.close(); },
  });
  const e2 = ambiente(() => new Response(stream, { status: 200 }));
  const r2 = await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: e2.fetch, resolver: e2.resolver, hosts: HOSTS, dir: e2.dir });
  assert.match(r2.motivo, /acima de 8 MB/);
  assert.ok(lidos < 20, `leu ${lidos} MB antes de cortar`);
  const html = ambiente(() => '<html>ola</html>');
  assert.match((await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: html.fetch, resolver: html.resolver, hosts: HOSTS, dir: html.dir })).motivo, /não é JPEG/);
  const f404 = ambiente(() => new Response('x', { status: 404 }));
  assert.match((await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { fetch: f404.fetch, resolver: f404.resolver, hosts: HOSTS, dir: f404.dir })).motivo, /status 404/);
  const lanca = { dir: pasta(), resolver: async () => PUBLICO, fetch: async () => { throw Object.assign(new Error('x'), { code: 'ECONNRESET' }); } };
  assert.match((await I.baixarOuMotivo('https://images.sympla.com.br/a.jpg', { ...lanca, hosts: HOSTS })).motivo, /ECONNRESET/);
});

// ---- escolher a principal --------------------------------------------------

const img = (o) => ({ sha: o.sha || o.id, largura: 1080, altura: 1350, phash: null, papel: 'post', fonte: 'x', credito: 'c', origem: 'https://o.example', conferidoEm: '2026-11-20T10:00:00Z', ...o });

test('escolherPrincipal: ordem de papel', () => {
  const lista = [
    img({ id: 'a', papel: 'post' }), img({ id: 'b', papel: 'pagina-ingresso' }), img({ id: 'c', papel: 'flyer' }),
    img({ id: 'd', papel: 'cartaz-indicado' }), img({ id: 'e', papel: 'cartaz-enviado' }),
  ];
  const ordem = ['cartaz-enviado', 'cartaz-indicado', 'flyer', 'pagina-ingresso', 'post'];
  let resto = lista;
  for (const papel of ordem) {
    assert.equal(I.escolherPrincipal(resto).papel, papel);
    resto = resto.filter((x) => x.papel !== papel);
  }
  assert.equal(I.escolherPrincipal(resto), null);
  assert.deepEqual(I.agruparImagens(lista).map((g) => g.papel), ordem);
  assert.deepEqual(I.agruparImagens(lista).map((g) => g.principal), [true, false, false, false, false]);
});

test('escolherPrincipal: desempate por proporção, lado mínimo e conferidoEm', () => {
  // proporção entre 0,6 e 1,0 antes de tudo
  assert.equal(I.escolherPrincipal([
    img({ id: 'larga', largura: 1080, altura: 608 }), img({ id: 'retrato', largura: 800, altura: 1000 }),
  ]).id, 'retrato');
  assert.equal(I.escolherPrincipal([
    img({ id: 'alta', largura: 500, altura: 1200 }), img({ id: 'quadrada', largura: 700, altura: 700 }),
  ]).id, 'quadrada');
  // na mesma proporção boa, menor lado >= 600
  assert.equal(I.escolherPrincipal([
    img({ id: 'pequena', largura: 400, altura: 500 }), img({ id: 'media', largura: 640, altura: 800 }),
  ]).id, 'media');
  // por fim, o conferidoEm mais novo
  assert.equal(I.escolherPrincipal([
    img({ id: 'velha', conferidoEm: '2026-11-01T10:00:00Z' }), img({ id: 'nova', conferidoEm: '2026-11-22T10:00:00Z' }),
  ]).id, 'nova');
  // o papel pesa mais que a proporção
  assert.equal(I.escolherPrincipal([
    img({ id: 'cartaz', papel: 'cartaz-enviado', largura: 1080, altura: 608 }), img({ id: 'post', papel: 'post' }),
  ]).id, 'cartaz');
});

test('escolherPrincipal: ocultas saem e cópias de pHash até 8 viram uma, com as origens de todas', () => {
  const ph = '0123456789abcdef';
  const perto = '0123456789abcdee'; // 1 bit de diferença
  const longe = 'fedcba9876543210';
  const lista = [
    img({ id: 'baixa', phash: perto, largura: 540, altura: 675, fonte: 'instagram', credito: 'Divulgação · @casa', origem: 'https://ig.example/p/1' }),
    img({ id: 'alta', phash: ph, largura: 1080, altura: 1350, papel: 'pagina-ingresso', fonte: 'paginas', credito: 'Divulgação · Ingressos', origem: 'https://ing.example/e' }),
    img({ id: 'outra', phash: longe, papel: 'post', fonte: 'instagram', credito: 'Divulgação · @outro', origem: 'https://ig.example/p/2' }),
    img({ id: 'oculta', phash: ph, oculta: 1, papel: 'cartaz-enviado' }),
  ];
  const g = I.agruparImagens(lista);
  assert.equal(g.length, 2);
  assert.equal(g[0].id, 'alta'); // a de maior resolução do grupo
  assert.deepEqual(g[0].origens.map((o) => o.credito), ['Divulgação · Ingressos', 'Divulgação · @casa']);
  assert.equal(g[0].principal, true);
  assert.equal(g[1].id, 'outra');
  // no limite: 8 bits juntam, 9 não
  const oito = '00000000000000ff';
  assert.equal(I.agruparImagens([img({ id: 'a', phash: '0000000000000000' }), img({ id: 'b', phash: oito })]).length, 1);
  assert.equal(I.agruparImagens([img({ id: 'a', phash: '0000000000000000' }), img({ id: 'b', phash: '00000000000001ff' })]).length, 2);
});

// ---- registro, festa e limpeza --------------------------------------------

function festa(db, id, dataNoite, itens = []) {
  db.prepare('INSERT INTO festas (id, data, criada_em, data_noite) VALUES (?, ?, ?, ?)').run(id, dataNoite, '2026-11-01T00:00:00Z', dataNoite);
  for (const [fonte, idExterno] of itens) {
    db.prepare("INSERT OR IGNORE INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES (?, ?, 'h', '{}', '2026-11-01T00:00:00Z')").run(fonte, idExterno);
    db.prepare("INSERT INTO vinculos (fonte, id_externo, festa_id, visto_em) VALUES (?, ?, ?, '2026-11-01T00:00:00Z')").run(fonte, idExterno, id);
  }
}

const prep = (n, o = {}) => ({
  sha: `${n}`.repeat(64).slice(0, 64), arquivo: `imagens/${`${n}`.repeat(16)}-1080.webp`, miniatura: `imagens/${`${n}`.repeat(16)}-480.webp`,
  largura: 1080, altura: 1350, bytes: 1000, tipo: 'jpeg', phash: '0123456789abcdef', dhash: 'fedcba9876543210', papel: 'post',
  urlOrigem: `https://cdn.example/${n}.jpg`, linkOrigem: `https://ig.example/p/${n}`, credito: `Divulgação · @${n}`, leitura: 'flyer', ...o,
});

test('registrarDoItem e imagensDaFesta: a festa sai do JOIN com vinculos e entrega o formato do contrato', () => {
  const db = novoBanco();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1'], ['paginas', 'p:1']]);
  const agora = relogio();
  assert.deepEqual(I.registrarDoItem(db, { fonte: 'instagram', idExterno: 'ig:1', imagens: [prep('a', { papel: 'flyer', fonte: 'instagram' })], agora }), { registradas: 1 });
  I.registrarDoItem(db, { fonte: 'paginas', idExterno: 'p:1', imagens: [prep('b', { papel: 'pagina-ingresso', phash: 'ffffffffffffffff', linkOrigem: 'https://ing.example/e', credito: 'Divulgação · Ingressos' })], agora });
  const lista = I.imagensDaFesta(db, 'f1');
  assert.equal(lista.length, 2);
  assert.deepEqual(Object.keys(lista[0]).sort(), ['altura', 'arquivo', 'conferidoEm', 'credito', 'fonte', 'id', 'largura', 'miniatura', 'origem', 'origens', 'papel', 'principal'].sort());
  assert.equal(lista[0].id, 'aaaaaaaaaaaaaaaa');
  assert.equal(lista[0].principal, true);
  assert.equal(lista[0].papel, 'flyer');
  assert.equal(lista[0].origem, 'https://ig.example/p/a'); // o post, nunca a URL do CDN
  assert.equal(lista[0].conferidoEm, '2026-11-10T12:00:00-03:00');
  assert.equal(lista[1].principal, false);
  assert.deepEqual(I.imagensDaFesta(db, 'inexistente'), []);
  const doItem = I.imagensDoItem(db, 'instagram', 'ig:1');
  assert.equal(doItem.length, 1);
  assert.equal(doItem[0].phash, '0123456789abcdef');
  // Fusão leva a imagem junto: o vínculo muda de festa e a imagem vai com ele.
  festa(db, 'f2', '2026-11-29');
  db.prepare("UPDATE vinculos SET festa_id = 'f2' WHERE fonte = 'paginas'").run();
  assert.deepEqual(I.imagensDaFesta(db, 'f1').map((i) => i.id), ['aaaaaaaaaaaaaaaa']);
  assert.deepEqual(I.imagensDaFesta(db, 'f2').map((i) => i.id), ['bbbbbbbbbbbbbbbb']);
  // Registrar de novo a mesma peça só anda o vínculo (uma linha em imagens).
  I.registrarDoItem(db, { fonte: 'instagram', idExterno: 'ig:1', imagens: [prep('a', { papel: 'flyer' })], agora });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens_item').get().n, 2);
});

test('duas cópias recomprimidas viram uma na festa, com as origens das duas', () => {
  const db = novoBanco();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1'], ['paginas', 'p:1']]);
  I.registrarDoItem(db, { fonte: 'instagram', idExterno: 'ig:1', imagens: [prep('a', { largura: 540, altura: 675, phash: '0123456789abcdef', credito: 'Divulgação · @casa', linkOrigem: 'https://ig.example/p/1' })] });
  I.registrarDoItem(db, { fonte: 'paginas', idExterno: 'p:1', imagens: [prep('b', { largura: 1080, altura: 1350, phash: '0123456789abcdee', papel: 'pagina-ingresso', credito: 'Divulgação · Ingressos', linkOrigem: 'https://ing.example/e' })] });
  const lista = I.imagensDaFesta(db, 'f1');
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'bbbbbbbbbbbbbbbb'); // a de maior resolução
  assert.deepEqual(lista[0].origens, [
    { fonte: 'paginas', origem: 'https://ing.example/e', credito: 'Divulgação · Ingressos' },
    { fonte: 'instagram', origem: 'https://ig.example/p/1', credito: 'Divulgação · @casa' },
  ]);
});

test('ocultar: some do registro e da rota, o prefixo do sha serve, e a linha fica', () => {
  const db = novoBanco();
  const dir = pasta();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1']]);
  I.registrarDoItem(db, { fonte: 'instagram', idExterno: 'ig:1', imagens: [prep('a'), prep('b', { phash: 'ffffffffffffffff' })] });
  for (const n of ['a', 'b']) {
    fs.writeFileSync(path.join(dir, `${n.repeat(16)}-1080.webp`), 'x');
    fs.writeFileSync(path.join(dir, `${n.repeat(16)}-480.webp`), 'x');
  }
  assert.equal(I.arquivoParaServir(db, dir, 'aaaaaaaaaaaaaaaa-1080.webp'), path.join(dir, 'aaaaaaaaaaaaaaaa-1080.webp'));
  assert.equal(I.arquivoParaServir(db, dir, '../aaaaaaaaaaaaaaaa-1080.webp'), null);
  assert.equal(I.arquivoParaServir(db, dir, 'cccccccccccccccc-1080.webp'), null);
  assert.deepEqual(I.ocultar(db, 'zz', 'x'), { ocultada: false, sha: null });
  assert.equal(I.ocultar(db, 'aaaaaaaa', 'foto de público', { dir }).ocultada, true);
  assert.equal(I.imagensDaFesta(db, 'f1').length, 1);
  assert.equal(I.imagensDaFesta(db, 'f1')[0].id, 'bbbbbbbbbbbbbbbb');
  assert.equal(I.imagensDoItem(db, 'instagram', 'ig:1').length, 1);
  assert.equal(I.arquivoParaServir(db, dir, 'aaaaaaaaaaaaaaaa-1080.webp'), null);
  assert.equal(fs.existsSync(path.join(dir, 'aaaaaaaaaaaaaaaa-1080.webp')), false);
  const linha = db.prepare("SELECT oculta, motivo_oculta FROM imagens WHERE sha LIKE 'aaaa%'").get();
  assert.deepEqual({ ...linha }, { oculta: 1, motivo_oculta: 'foto de público' });
  assert.equal(I.ocultar(db, 'dddddddd', 'x').ocultada, false);
});

const itemPendente = (fonte, idExterno, festaId, imagens) => ({ fonte, idExterno, festaId, imagens });

tw('processarPendentes: bytes de fixture viram WebP 480 e 1080 no diretório, o temporário some e a rodada seguinte só anda o conferido_em', async () => {
  const db = novoBanco();
  const dir = pasta();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1'], ['indicacao', 'ind:1']]);
  const agora = relogio();
  const e = ambiente(() => JPEG);
  const tmp = I.guardarTemporario(dir, fs.readFileSync(fix('cartaz-b.jpg')));
  const batidas = [];
  const pend = [
    itemPendente('instagram', 'ig:1', 'f1', [{ caminho: tmp, papel: 'flyer', origem: 'https://ig.example/p/1', credito: 'Divulgação · @casa', leitura: 'flyer' }]),
    itemPendente('indicacao', 'ind:1', 'f1', [{ url: 'https://images.sympla.com.br/a.jpg', papel: 'cartaz-indicado', origem: 'https://ing.example/e', credito: 'Cartaz indicado' }]),
  ];
  const ctx = { fetch: e.fetch, resolver: e.resolver, agora, log: logMudo, config: { hosts: HOSTS }, dir, offline: true, batimento: () => batidas.push(1) };
  const r = await I.processarPendentes(db, pend, ctx);
  assert.deepEqual([r.processadas, r.guardadas, r.recusadas], [2, 2, 0], JSON.stringify(r.avisos));
  assert.ok(batidas.length >= 2);
  const arquivos = fs.readdirSync(dir).filter((n) => n.endsWith('.webp')).sort();
  assert.equal(arquivos.length, 4);
  assert.equal(arquivos.filter((n) => n.endsWith('-480.webp')).length, 2);
  assert.equal(arquivos.filter((n) => n.endsWith('-1080.webp')).length, 2);
  assert.ok(arquivos.every((n) => I.caminhoSeguro(n)));
  // o temporário (da fonte e o baixado) foi apagado
  assert.deepEqual(fs.readdirSync(path.join(dir, 'tmp')), []);
  const lista = I.imagensDaFesta(db, 'f1');
  assert.equal(lista.length, 2);
  assert.equal(lista[0].papel, 'cartaz-indicado');
  assert.ok(fs.existsSync(path.join(dir, path.basename(lista[0].arquivo))));
  assert.equal(db.prepare('SELECT url_origem FROM imagens_item WHERE fonte = ?').get('indicacao').url_origem, 'https://images.sympla.com.br/a.jpg');
  // segunda rodada: a url já é conhecida, não baixa de novo e só anda o conferido_em
  agora.andar(3600e3);
  const pedidosAntes = e.pedidos.length;
  const r2 = await I.processarPendentes(db, [pend[1]], ctx);
  assert.equal(e.pedidos.length, pedidosAntes);
  assert.deepEqual([r2.conhecidas, r2.guardadas], [1, 0]);
  assert.equal(db.prepare('SELECT conferido_em FROM imagens_item WHERE fonte = ?').get('indicacao').conferido_em, '2026-11-10T16:00:00.000Z');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens').get().n, 2);
  // Terceira: a linha ficou e as peças sumiram (volume perdido, semente sem as
  // peças): a url conhecida não basta, baixa de novo e o arquivo volta.
  const sha = db.prepare('SELECT sha FROM imagens_item WHERE fonte = ?').get('indicacao').sha;
  for (const t of ['1080', '480']) fs.unlinkSync(path.join(dir, `${sha.slice(0, 16)}-${t}.webp`));
  assert.equal(I.arquivoParaServir(db, dir, `${sha.slice(0, 16)}-1080.webp`), null);
  const r3 = await I.processarPendentes(db, [pend[1]], ctx);
  assert.deepEqual([r3.conhecidas, r3.guardadas], [0, 1], JSON.stringify(r3.avisos));
  assert.equal(e.pedidos.length, pedidosAntes + 1);
  assert.ok(I.arquivoParaServir(db, dir, `${sha.slice(0, 16)}-1080.webp`));
  assert.ok(fs.existsSync(path.join(dir, `${sha.slice(0, 16)}-480.webp`)));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens_item WHERE fonte = ?').get('indicacao').n, 1);
  // Ocultada, a peça não tem arquivo de propósito: não baixa de novo.
  I.ocultar(db, sha, 'teste', { dir });
  const r4 = await I.processarPendentes(db, [pend[1]], ctx);
  assert.deepEqual([r4.conhecidas, r4.guardadas], [1, 0]);
  assert.equal(fs.existsSync(path.join(dir, `${sha.slice(0, 16)}-1080.webp`)), false);
});

tw('Maré Alta: sábado e domingo com o mesmo pôster dividem uma linha em imagens e duas em imagens_item', async () => {
  const db = novoBanco();
  const dir = pasta();
  festa(db, 'sab', '2026-11-28', [['paginas', 'prim:sab']]);
  festa(db, 'dom', '2026-11-29', [['paginas', 'prim:dom']]);
  const bytes = fs.readFileSync(fix('cartaz-a.jpg'));
  const tmp = I.guardarTemporario(dir, bytes);
  const pend = ['sab', 'dom'].map((d) => itemPendente('paginas', `prim:${d}`, d, [{ caminho: tmp, papel: 'pagina-ingresso', origem: `https://ing.example/mare-alta-${d}`, credito: 'Divulgação · Maré Alta' }]));
  const r = await I.processarPendentes(db, pend, { agora: relogio(), config: {}, dir, offline: true });
  assert.equal(r.guardadas, 2, JSON.stringify(r.avisos));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens_item').get().n, 2);
  assert.equal(I.imagensDaFesta(db, 'sab').length, 1);
  assert.equal(I.imagensDaFesta(db, 'dom').length, 1);
  assert.equal(I.imagensDaFesta(db, 'sab')[0].id, I.imagensDaFesta(db, 'dom')[0].id);
  assert.notEqual(I.imagensDaFesta(db, 'sab')[0].origem, I.imagensDaFesta(db, 'dom')[0].origem);
  assert.equal(fs.readdirSync(dir).filter((n) => n.endsWith('.webp')).length, 2);
});

tw('processarPendentes: imagem ruim vira aviso e não derruba as outras; festa passada nem é lida', async () => {
  const db = novoBanco();
  const dir = pasta();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1']]);
  festa(db, 'velha', '2026-10-01', [['instagram', 'ig:velha']]);
  const e = ambiente((url) => (url.includes('ruim') ? '<html>' : JPEG));
  const pend = [
    itemPendente('instagram', 'ig:1', 'f1', [
      { url: 'https://images.sympla.com.br/ruim.jpg', papel: 'post', origem: 'https://ig.example/p/1' },
      { caminho: path.join(dir, 'tmp', 'nao-existe'), papel: 'post' },
      { url: 'https://images.sympla.com.br/boa.jpg', papel: 'post', origem: 'https://ig.example/p/1', credito: 'c' },
      { papel: 'post' },
    ]),
    itemPendente('instagram', 'ig:velha', 'velha', [{ url: 'https://images.sympla.com.br/boa2.jpg', papel: 'post' }]),
  ];
  const r = await I.processarPendentes(db, pend, { fetch: e.fetch, resolver: e.resolver, agora: relogio(), config: { hosts: HOSTS }, dir, offline: true });
  assert.deepEqual([r.guardadas, r.recusadas, r.passadas], [1, 3, 1], JSON.stringify(r.avisos));
  assert.equal(r.avisos.length, 3);
  assert.ok(!e.pedidos.some((p) => p.url.includes('boa2')));
});

tw('processarPendentes: sem o worker nada é guardado e o aviso diz por quê', async () => {
  const db = novoBanco();
  const dir = pasta();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1']]);
  const tmp = I.guardarTemporario(dir, JPEG);
  const r = await I.processarPendentes(db, [itemPendente('instagram', 'ig:1', 'f1', [{ caminho: tmp, papel: 'post' }])], { agora: relogio(), config: {}, dir, uv: '/nao/existe/uv' });
  assert.equal(r.guardadas, 0);
  assert.match(r.avisos[0], /não consegui iniciar o worker de imagem/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM imagens').get().n, 0);
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.webp')), []);
});

function guardarFalsa(db, dir, n, festaId, idExterno, { bytes = 100, phash } = {}) {
  I.registrarDoItem(db, { fonte: 'instagram', idExterno, imagens: [prep(n, { bytes, phash: phash || `${n}`.repeat(16) })] });
  fs.writeFileSync(path.join(dir, `${n.repeat(16)}-1080.webp`), Buffer.alloc(bytes));
  fs.writeFileSync(path.join(dir, `${n.repeat(16)}-480.webp`), Buffer.alloc(bytes));
}

test('limparImagens: respeita a folga de 7 dias, apaga imagem sem vínculo, arquivo órfão e temporário velho', () => {
  const db = novoBanco();
  const dir = pasta();
  const agora = relogio(); // 10/11 12h em São Paulo
  festa(db, 'passou7', '2026-11-03', [['instagram', 'ig:a']]); // 7 dias: ainda dentro da folga
  festa(db, 'passou8', '2026-11-02', [['instagram', 'ig:b']]); // 8 dias: fora
  festa(db, 'futura', '2026-11-20', [['instagram', 'ig:c']]);
  festa(db, 'semdata', null, [['instagram', 'ig:d']]);
  guardarFalsa(db, dir, 'a', 'passou7', 'ig:a');
  guardarFalsa(db, dir, 'b', 'passou8', 'ig:b');
  guardarFalsa(db, dir, 'c', 'futura', 'ig:c');
  guardarFalsa(db, dir, 'd', 'semdata', 'ig:d');
  fs.writeFileSync(path.join(dir, 'eeeeeeeeeeeeeeee-1080.webp'), 'orfao');
  fs.writeFileSync(path.join(dir, 'nota.txt'), 'não é nosso');
  fs.mkdirSync(path.join(dir, 'tmp'));
  const velho = path.join(dir, 'tmp', 'velho');
  const novo = path.join(dir, 'tmp', 'novo');
  fs.writeFileSync(velho, 'x');
  fs.writeFileSync(novo, 'x');
  const antigo = new Date(agora().getTime() - 30 * 3600e3);
  fs.utimesSync(velho, antigo, antigo);
  fs.utimesSync(novo, agora(), agora());
  const r = I.limparImagens(db, dir, { agora, folgaDias: 7, log: logMudo });
  assert.equal(r.vinculos, 1);
  assert.equal(r.apagadas, 1);
  assert.equal(r.orfaos, 1);
  assert.equal(r.temporarios, 1);
  const restam = db.prepare('SELECT substr(sha, 1, 1) s FROM imagens ORDER BY sha').all().map((x) => x.s);
  assert.deepEqual(restam, ['a', 'c', 'd']);
  assert.equal(fs.existsSync(path.join(dir, 'bbbbbbbbbbbbbbbb-1080.webp')), false);
  assert.equal(fs.existsSync(path.join(dir, 'bbbbbbbbbbbbbbbb-480.webp')), false);
  assert.equal(fs.existsSync(path.join(dir, 'eeeeeeeeeeeeeeee-1080.webp')), false);
  assert.equal(fs.existsSync(path.join(dir, 'nota.txt')), true);
  assert.equal(fs.existsSync(velho), false);
  assert.equal(fs.existsSync(novo), true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM imagens_item WHERE id_externo = 'ig:b'").get().n, 0);
  // Os itens brutos e os vínculos da festa passada ficam: só a imagem sai.
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vinculos WHERE festa_id = 'passou8'").get().n, 1);
});

test('limparImagens: a peça ocultada de uma festa que passou não volta visível quando a festa seguinte a reposta', () => {
  const db = novoBanco();
  const dir = pasta();
  const agora = relogio(); // 10/11
  festa(db, 'semana1', '2026-11-01', [['instagram', 'ig:s1']]);
  festa(db, 'semana3', '2026-11-21', [['instagram', 'ig:s3']]);
  guardarFalsa(db, dir, 'f', 'semana1', 'ig:s1');
  assert.equal(I.ocultar(db, 'ffffffff', 'rosto de pessoa', { dir }).ocultada, true);
  const r = I.limparImagens(db, dir, { agora, folgaDias: 7, log: logMudo });
  assert.equal(r.vinculos, 1);
  assert.equal(r.apagadas, 0, 'a linha da ocultada fica');
  assert.equal(db.prepare("SELECT oculta FROM imagens WHERE sha LIKE 'ffff%'").get().oculta, 1);
  // A mesma peça (os mesmos bytes, o mesmo sha) volta na festa seguinte.
  I.registrarDoItem(db, { fonte: 'instagram', idExterno: 'ig:s3', imagens: [prep('f', { phash: 'f'.repeat(16) })] });
  assert.deepEqual(I.imagensDaFesta(db, 'semana3'), []);
});

test('limparImagens: acima do teto apaga as das festas mais distantes primeiro', () => {
  const db = novoBanco();
  const dir = pasta();
  const agora = relogio();
  festa(db, 'perto', '2026-11-12', [['instagram', 'ig:1']]);
  festa(db, 'meio', '2026-11-20', [['instagram', 'ig:2']]);
  festa(db, 'longe', '2026-12-20', [['instagram', 'ig:3']]);
  const mb = 1024 * 1024;
  guardarFalsa(db, dir, '1', 'perto', 'ig:1', { bytes: mb });
  guardarFalsa(db, dir, '2', 'meio', 'ig:2', { bytes: mb });
  guardarFalsa(db, dir, '3', 'longe', 'ig:3', { bytes: mb });
  // Cada imagem pesa 2 MB (1080 + 480); o teto de 4 MB deixa duas.
  const r = I.limparImagens(db, dir, { agora, folgaDias: 7, maxMb: 4, log: logMudo });
  assert.equal(r.porTeto, 1);
  assert.deepEqual(db.prepare('SELECT substr(sha, 1, 1) s FROM imagens ORDER BY sha').all().map((x) => x.s), ['1', '2']);
  assert.equal(fs.existsSync(path.join(dir, '3333333333333333-1080.webp')), false);
  // Abaixo do teto, nada sai.
  assert.equal(I.limparImagens(db, dir, { agora, folgaDias: 7, maxMb: 4, log: logMudo }).porTeto, 0);
  // Teto menor ainda: a mais distante das que restam vai primeiro.
  const r2 = I.limparImagens(db, dir, { agora, folgaDias: 7, maxMb: 2, log: logMudo });
  assert.equal(r2.porTeto, 1);
  assert.deepEqual(db.prepare('SELECT substr(sha, 1, 1) s FROM imagens').all().map((x) => x.s), ['1']);
});

test('uma imagem ocultada que a coleta traz de novo continua oculta e sem arquivo', async () => {
  const db = novoBanco();
  const dir = pasta();
  festa(db, 'f1', '2026-11-28', [['instagram', 'ig:1']]);
  guardarFalsa(db, dir, 'a', 'f1', 'ig:1');
  I.ocultar(db, 'a'.repeat(16), 'foto de público', { dir });
  // O registro da mesma peça (outro item, mesma imagem) não a desoculta.
  festa(db, 'f2', '2026-11-29', [['instagram', 'ig:2']]);
  I.registrarDoItem(db, { fonte: 'instagram', idExterno: 'ig:2', imagens: [prep('a')] });
  assert.equal(db.prepare("SELECT oculta FROM imagens WHERE sha LIKE 'aaaa%'").get().oculta, 1);
  assert.deepEqual(I.imagensDaFesta(db, 'f2'), []);
});

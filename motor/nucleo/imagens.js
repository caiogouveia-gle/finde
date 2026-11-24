'use strict';
// As peças de divulgação no motor (M33, D4, KTD6 a KTD9 do plano de 24/11/2026):
// download seguro contra SSRF (só https, endereço conferido e usado na
// conexão, redirecionamento conferido a cada salto, hosts permitidos), o
// worker uv com Pillow (coletores/paginas/imagens.py) que recodifica em WebP
// 1080 e 480 sem EXIF e calcula pHash e dHash, o registro por conteúdo
// (imagens) ligado ao item (imagens_item), a escolha da principal, ocultar e
// a limpeza com folga e teto de disco.
//
// Onde moram os arquivos: <dir>/<sha16>-1080.webp e <dir>/<sha16>-480.webp,
// direto na raiz de `dir` (FINDE_IMAGENS), e os temporários em <dir>/tmp. Nas
// colunas e no contrato o caminho é o lógico, `imagens/<sha16>-1080.webp`; a
// rota serve `GET /imagens/<nome>` com `arquivoParaServir(db, dir, nome)`.

const crypto = require('node:crypto');
const dns = require('node:dns');
const fs = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { transacao } = require('./banco');
const { envDoWorker } = require('./worker');

// O nome que o app e a rota /imagens/ aceitam (KTD14, U17).
const NOME_SEGURO = /^[a-f0-9]{16}-(480|1080)\.webp$/;
const PASTA_WORKER = path.join(__dirname, '..', 'coletores', 'paginas');
const LIMITE_BYTES = 8 * 1024 * 1024;
const MAX_SALTOS = 3;
const HORAS_TMP = 24;

// ---------------------------------------------------------------------------
// Endereços recusados (KTD8)
// ---------------------------------------------------------------------------

function v4(ip) {
  const p = ip.split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x))) return null;
  const n = p.map(Number);
  return n.every((x) => x <= 255) ? n : null;
}

function motivoV4(n) {
  const [a, b, c] = n;
  if (a === 0) return 'rede 0.0.0.0/8';
  if (a === 10) return 'rede privada 10/8';
  if (a === 100 && b >= 64 && b <= 127) return 'CGNAT 100.64/10 (Tailscale)';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'link-local 169.254/16';
  if (a === 172 && b >= 16 && b <= 31) return 'rede privada 172.16/12';
  if (a === 192 && b === 0 && c === 0) return 'reservado 192.0.0/24';
  if (a === 192 && b === 0 && c === 2) return 'documentação 192.0.2/24';
  if (a === 192 && b === 168) return 'rede privada 192.168/16';
  if (a === 198 && (b === 18 || b === 19)) return 'teste de rede 198.18/15';
  if (a === 198 && b === 51 && c === 100) return 'documentação 198.51.100/24';
  if (a === 203 && b === 0 && c === 113) return 'documentação 203.0.113/24';
  if (a >= 224) return 'multicast ou reservado';
  return null;
}

// Os 8 grupos de 16 bits de um IPv6, ou null.
function expandirV6(texto) {
  let ip = String(texto).split('%')[0];
  if (ip.includes('.')) {
    const i = ip.lastIndexOf(':');
    const emb = v4(ip.slice(i + 1));
    if (!emb) return null;
    ip = `${ip.slice(0, i + 1)}${((emb[0] << 8) | emb[1]).toString(16)}:${((emb[2] << 8) | emb[3]).toString(16)}`;
  }
  const partes = ip.split('::');
  if (partes.length > 2) return null;
  const grupos = (s) => (s === '' ? [] : s.split(':'));
  const ini = grupos(partes[0]);
  const fim = partes.length === 2 ? grupos(partes[1]) : [];
  let todos;
  if (partes.length === 2) {
    const falta = 8 - ini.length - fim.length;
    if (falta < 1) return null;
    todos = [...ini, ...Array(falta).fill('0'), ...fim];
  } else {
    todos = ini;
  }
  if (todos.length !== 8 || todos.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return todos.map((g) => parseInt(g, 16));
}

// Devolve o motivo da recusa, ou null se o endereço é público.
function ipRecusado(ip) {
  const texto = String(ip || '').replace(/^\[|\]$/g, '');
  const familia = net.isIP(texto);
  if (familia === 4) return motivoV4(v4(texto));
  if (familia !== 6) return 'endereço inválido';
  const g = expandirV6(texto);
  if (!g) return 'endereço inválido';
  const embutido = (a, b) => [a >> 8, a & 255, b >> 8, b & 255];
  if (g.every((x) => x === 0)) return 'endereço não especificado';
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'loopback';
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return motivoV4(embutido(g[6], g[7])) ? `IPv4 embutido: ${motivoV4(embutido(g[6], g[7]))}` : null;
  if (g.slice(0, 6).every((x) => x === 0)) return 'IPv4 compatível, descontinuado';
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return motivoV4(embutido(g[6], g[7])) ? `NAT64 com IPv4 embutido: ${motivoV4(embutido(g[6], g[7]))}` : null;
  if (g[0] === 0x2002) return motivoV4(embutido(g[1], g[2])) ? `6to4 com IPv4 embutido: ${motivoV4(embutido(g[1], g[2]))}` : null;
  if (g[0] === 0x2001 && g[1] === 0) return 'Teredo';
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'documentação 2001:db8::/32';
  if ((g[0] & 0xfe00) === 0xfc00) return 'rede privada fc00::/7';
  if ((g[0] & 0xffc0) === 0xfe80) return 'link-local fe80::/10';
  if ((g[0] & 0xff00) === 0xff00) return 'multicast';
  return null;
}

// hosts: 'images.sympla.com.br' (exato) ou '*.fbcdn.net' (qualquer subdomínio).
function hostPermitido(host, hosts = []) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return hosts.some((p) => {
    const padrao = String(p).toLowerCase();
    if (padrao.startsWith('*.')) return h.endsWith(padrao.slice(1)) && h.length > padrao.length - 1;
    return h === padrao;
  });
}

async function resolverPadrao(host) {
  const r = await dns.promises.lookup(host, { all: true });
  return r.map((x) => ({ address: x.address, family: x.family }));
}

// fetch que conecta no endereço já conferido (o `lookup` do agente devolve
// sempre ele), então o sistema não resolve o nome de novo entre a conferência
// e a conexão. Devolve uma Response sem seguir redirecionamento.
function fetchFixandoEndereco(url, { endereco, headers = {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^\[|\]$/g, '');
    const req = https.request({
      protocol: 'https:',
      hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers,
      servername: net.isIP(hostname) ? undefined : hostname,
      signal,
      lookup: (_h, opcoes, cb) => (opcoes && opcoes.all ? cb(null, [{ address: endereco.address, family: endereco.family }]) : cb(null, endereco.address, endereco.family)),
    }, (res) => {
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) for (const x of [].concat(v)) h.append(k, x);
      const semCorpo = [101, 204, 205, 304].includes(res.statusCode);
      if (semCorpo) res.resume();
      resolve(new Response(semCorpo ? null : Readable.toWeb(res), { status: res.statusCode, headers: h }));
    });
    req.on('error', reject);
    req.end();
  });
}

function tipoPelosBytes(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))) return 'gif';
  return null;
}

// Como `baixar`, mas diz por que recusou: { ok: { caminho, tipo, bytes, urlFinal } } ou { motivo }.
async function baixarOuMotivo(url, opcoes = {}) {
  const {
    fetch: fetchPedido = null, hosts = [], livre = false, dir, limiteBytes = LIMITE_BYTES,
    resolver = resolverPadrao, timeoutMs = 15000, maxSaltos = MAX_SALTOS,
    userAgent = 'FindeMotor/0.3 (prova academica)',
  } = opcoes;
  if (!dir) return { motivo: 'sem diretório de imagens' };
  // O fetch global resolveria o nome de novo; sem um fetch de teste, vale o que fixa o endereço.
  const f = fetchPedido && fetchPedido !== globalThis.fetch ? fetchPedido : fetchFixandoEndereco;
  let atual = String(url);
  for (let salto = 0; salto <= maxSaltos; salto += 1) {
    let u;
    try { u = new URL(atual); } catch { return { motivo: 'endereço inválido' }; }
    if (u.protocol !== 'https:') return { motivo: 'só https' };
    if (u.username || u.password) return { motivo: 'endereço com credenciais' };
    if (u.port && u.port !== '443') return { motivo: 'porta fora da 443' };
    if (!livre && !hostPermitido(u.hostname, hosts)) return { motivo: `host fora da lista (${u.hostname})` };
    const host = u.hostname.replace(/^\[|\]$/g, '');
    let enderecos;
    try {
      enderecos = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await resolver(host);
    } catch (e) {
      return { motivo: `não resolveu ${host} (${e.code || e.message})` };
    }
    if (!enderecos || !enderecos.length) return { motivo: `não resolveu ${host}` };
    for (const e of enderecos) {
      const r = ipRecusado(e.address);
      if (r) return { motivo: `endereço recusado (${e.address}: ${r})` };
    }
    const endereco = enderecos[0];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await f(atual, { redirect: 'manual', headers: { 'user-agent': userAgent, accept: 'image/*' }, signal: ctrl.signal, endereco });
      if (resp.status >= 300 && resp.status < 400) {
        const destino = resp.headers.get('location');
        try { await resp.body?.cancel(); } catch { /* já fechou */ }
        if (!destino) return { motivo: `redirecionamento sem destino (${resp.status})` };
        try { atual = new URL(destino, atual).href; } catch { return { motivo: 'redirecionamento para endereço inválido' }; }
        continue;
      }
      if (resp.status !== 200) {
        try { await resp.body?.cancel(); } catch { /* já fechou */ }
        return { motivo: `status ${resp.status}` };
      }
      const declarado = Number(resp.headers.get('content-length'));
      if (declarado > limiteBytes) {
        try { await resp.body?.cancel(); } catch { /* já fechou */ }
        return { motivo: `imagem de ${Math.round(declarado / 1024)} KB acima do limite` };
      }
      const partes = [];
      let total = 0;
      if (resp.body) {
        const leitor = resp.body.getReader();
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          total += value.length;
          if (total > limiteBytes) {
            try { await leitor.cancel(); } catch { /* já fechou */ }
            return { motivo: `resposta acima de ${Math.round(limiteBytes / 1024 / 1024)} MB, cortada` };
          }
          partes.push(Buffer.from(value));
        }
      }
      const bytes = Buffer.concat(partes);
      const tipo = tipoPelosBytes(bytes);
      if (!tipo) return { motivo: 'não é JPEG, PNG, WebP nem GIF' };
      const caminho = guardarTemporario(dir, bytes);
      return { ok: { caminho, tipo, bytes: bytes.length, urlFinal: atual } };
    } catch (e) {
      return { motivo: ctrl.signal.aborted ? 'tempo esgotado' : `falha de rede (${e.code || e.message})` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { motivo: `mais de ${maxSaltos} redirecionamentos` };
}

// baixar(url, { fetch, hosts, livre, dir, limiteBytes }) -> Promise<{ caminho, tipo, bytes, urlFinal } | null>
// `livre` dispensa a lista de hosts (cartaz de envio e de indicação); as
// conferências de endereço valem do mesmo jeito.
async function baixar(url, opcoes = {}) {
  const r = await baixarOuMotivo(url, opcoes);
  return r.ok || null;
}

// ---------------------------------------------------------------------------
// Worker de imagem (KTD7)
// ---------------------------------------------------------------------------

// prepararPeloWorker(caminhos, { uv, dirSaida, limiteMs, offline }) -> Promise<[{ caminho, sha, arquivo, miniatura, largura, altura, bytes, tipo, phash, dhash, picoMb } | { caminho, erro }]>
// Um processo, uma imagem por vez, na ordem dos caminhos. Sem uv ou sem Pillow,
// cada caminho volta com `erro` e nada é guardado.
function prepararPeloWorker(caminhos, opcoes = {}) {
  const { uv = process.env.UV || 'uv', dirSaida, limiteMs = null, offline = false, pasta = PASTA_WORKER } = opcoes;
  const lista = [...new Set(caminhos || [])];
  if (!lista.length) return Promise.resolve([]);
  if (!dirSaida) return Promise.resolve(lista.map((caminho) => ({ caminho, erro: 'sem diretório de saída' })));
  return new Promise((resolve) => {
    const limite = limiteMs || 30000 * lista.length + 30000;
    const env = envDoWorker();
    const args = ['run', ...(offline ? ['--offline'] : []), '--project', pasta, 'python', path.join(pasta, 'imagens.py')];
    const filho = spawn(uv, args, { env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const linhas = new Map();
    let resto = '';
    let ultimoErro = '';
    let falha = null;
    let pronto = false;
    const guardar = (l) => {
      if (!l.trim()) return;
      try {
        const o = JSON.parse(l);
        if (o && o.caminho) linhas.set(o.caminho, o);
      } catch { /* aviso solto do Python */ }
    };
    const terminar = (codigo) => {
      if (pronto) return;
      pronto = true;
      clearTimeout(timer);
      guardar(resto);
      const motivo = falha || (codigo !== 0 ? `o worker de imagem saiu com código ${codigo}${ultimoErro ? ` (${ultimoErro})` : ''}` : 'sem resposta do worker de imagem');
      resolve(lista.map((caminho) => linhas.get(caminho) || { caminho, erro: motivo }));
    };
    const timer = setTimeout(() => {
      falha = 'o worker de imagem não terminou a tempo';
      try { process.kill(-filho.pid, 'SIGKILL'); } catch { try { filho.kill('SIGKILL'); } catch { /* já saiu */ } }
      filho.stdout.destroy();
      filho.stderr.destroy();
      terminar(null);
    }, limite);
    filho.stdout.on('data', (d) => {
      resto += d;
      const partes = resto.split('\n');
      resto = partes.pop();
      partes.forEach(guardar);
    });
    filho.stderr.on('data', (d) => {
      const t = String(d).trim().split('\n').pop();
      if (t) ultimoErro = t.slice(0, 200);
    });
    filho.on('error', (e) => {
      falha = `não consegui iniciar o worker de imagem (${e.code || e.message})`;
      terminar(null);
    });
    filho.on('close', (codigo) => terminar(codigo));
    filho.stdin.on('error', () => {});
    filho.stdin.end(JSON.stringify({ caminhos: lista, dirSaida }));
  });
}

// ---------------------------------------------------------------------------
// Registro por conteúdo, ligado ao item (KTD6)
// ---------------------------------------------------------------------------

const sha16 = (sha) => String(sha).slice(0, 16);
const noTransacao = (db, fn) => (db.isTransaction ? fn() : transacao(db, fn));

function gravarItem(db, { fonte, idExterno, sha, papel, urlOrigem, linkOrigem, credito, leitura, quando }) {
  db.prepare(`INSERT INTO imagens_item (fonte, id_externo, sha, papel, url_origem, link_origem, credito, leitura, conferido_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fonte, id_externo, sha) DO UPDATE SET
      papel = excluded.papel,
      url_origem = COALESCE(excluded.url_origem, url_origem),
      link_origem = COALESCE(excluded.link_origem, link_origem),
      credito = COALESCE(excluded.credito, credito),
      leitura = COALESCE(excluded.leitura, leitura),
      conferido_em = excluded.conferido_em`)
    .run(fonte, idExterno, sha, papel || 'post', urlOrigem || null, linkOrigem || null, credito || null, leitura || null, quando);
}

// registrarDoItem(db, { fonte, idExterno, imagens, agora }) -> { registradas }
// imagens: [{ sha, arquivo, miniatura, largura, altura, bytes, tipo, phash, dhash, papel, urlOrigem, linkOrigem, credito, leitura }]
// A imagem é uma linha por conteúdo; o item que a trouxe é outra. A que já
// existe (e a ocultada) não é recriada: só o vínculo com o item anda.
function registrarDoItem(db, { fonte, idExterno, imagens = [], agora = () => new Date() } = {}) {
  const quando = agora().toISOString();
  let registradas = 0;
  noTransacao(db, () => {
    for (const im of imagens) {
      if (!im || !im.sha || !im.arquivo || !im.miniatura) continue;
      db.prepare(`INSERT INTO imagens (sha, arquivo, miniatura, tipo, largura, altura, bytes, phash, dhash, criada_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sha) DO NOTHING`)
        .run(im.sha, im.arquivo, im.miniatura, im.tipo || null, im.largura ?? null, im.altura ?? null, im.bytes ?? null, im.phash || null, im.dhash || null, quando);
      gravarItem(db, { fonte, idExterno, sha: im.sha, papel: im.papel, urlOrigem: im.urlOrigem, linkOrigem: im.linkOrigem, credito: im.credito, leitura: im.leitura, quando });
      registradas += 1;
    }
  });
  return { registradas };
}

const LIVRES = new Set(['cartaz-enviado', 'cartaz-indicado']);

function festaPassada(db, festaId, agora, folgaDias) {
  if (!festaId) return false;
  const f = db.prepare('SELECT data_noite FROM festas WHERE id = ?').get(festaId);
  return !!(f && f.data_noite && f.data_noite < corteDaFolga(agora, folgaDias));
}

// A data (em São Paulo) a partir da qual a festa ainda guarda imagem.
function corteDaFolga(agora, folgaDias) {
  return new Date(agora().getTime() - folgaDias * 86400e3 - 3 * 3600e3).toISOString().slice(0, 10);
}

function dentroDe(pasta, arquivo) {
  const rel = path.relative(pasta, arquivo);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// processarPendentes(db, pendentes, ctx) -> Promise<{ processadas, guardadas, recusadas, avisos }>
// pendentes: [{ fonte, idExterno, festaId, imagens: item.imagens }] juntados no tempo 1.
// ctx: { fetch, agora, log, config (config.imagens), dir (FINDE_IMAGENS), batimento() }.
// Cada imagem do item é { caminho?, url?, papel, origem, credito, leitura }: o
// caminho é de um temporário que a fonte já deixou em <dir>/tmp; sem ele, baixa
// da `url`. Uma imagem ruim vira aviso e não derruba as outras.
function hostDaImagem(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function processarPendentes(db, pendentes, ctx = {}) {
  const { fetch: fetchCtx, agora = () => new Date(), log, config = {}, dir, batimento, resolver, uv, offline } = ctx;
  const r = { processadas: 0, guardadas: 0, conhecidas: 0, recusadas: 0, passadas: 0, pendentes: (pendentes || []).length, avisos: [] };
  const bater = () => { if (typeof batimento === 'function') batimento(); };
  const avisar = (m) => {
    if (!r.avisos.includes(m)) r.avisos.push(m);
    if (log && log.warn) log.warn(`imagens: ${m}`);
  };
  if (!dir) {
    r.avisos.push('sem diretório de imagens (FINDE_IMAGENS)');
    return r;
  }
  const folgaDias = Number.isFinite(config.folgaDias) ? config.folgaDias : 7;
  const hosts = config.hosts || [];
  const quando = agora().toISOString();
  const fila = [];
  const pastaTmp = path.join(dir, 'tmp');
  const hostsRecusados = new Map(); // host -> imagens que deixaram de ser pedidas

  for (const pend of pendentes || []) {
    const { fonte, idExterno, festaId } = pend;
    for (const im of pend.imagens || []) {
      r.processadas += 1;
      bater();
      if (festaPassada(db, festaId, agora, folgaDias)) { r.passadas += 1; continue; }
      const urlOrigem = im.url || im.urlOrigem || null;
      const dados = { fonte, idExterno, papel: im.papel, urlOrigem, linkOrigem: im.origem || im.linkOrigem, credito: im.credito, leitura: im.leitura, quando };
      // Já conhecida pela url de origem: só anda o conferido_em (e liga ao item,
      // se é outro). Mas só se a peça está no disco (ou foi ocultada, e aí não
      // deve estar): o volume perdido, a semente sem as peças ou uma limpeza
      // fora de hora deixam a linha sem arquivo, e então se baixa de novo.
      if (urlOrigem) {
        const ja = db.prepare('SELECT sha FROM imagens_item WHERE url_origem = ? ORDER BY (fonte = ? AND id_externo = ?) DESC LIMIT 1').get(urlOrigem, fonte, idExterno);
        if (ja) {
          const linha = db.prepare('SELECT oculta FROM imagens WHERE sha = ?').get(ja.sha);
          if (linha && (linha.oculta || temArquivos(dir, ja.sha))) {
            gravarItem(db, { ...dados, sha: ja.sha });
            r.conhecidas += 1;
            continue;
          }
          dados.semArquivo = ja.sha;
        }
      }
      let caminho = im.caminho || null;
      if (!caminho && urlOrigem) {
        // Host de imagem que respondeu 429 ou 503 nesta execução não recebe
        // outro pedido até a próxima (D14). 403 não trava: no CDN do Instagram
        // é a URL assinada que venceu, não recusa do host.
        const hostImg = hostDaImagem(urlOrigem);
        if (hostImg && hostsRecusados.has(hostImg)) {
          hostsRecusados.set(hostImg, hostsRecusados.get(hostImg) + 1);
          r.recusadas += 1;
          continue;
        }
        const b = await baixarOuMotivo(urlOrigem, { fetch: fetchCtx, hosts, livre: LIVRES.has(im.papel), dir, resolver, limiteBytes: config.limiteBytes });
        bater();
        if (!b.ok) {
          r.recusadas += 1;
          avisar(`${urlOrigem}: ${b.motivo}`);
          if (hostImg && /^status (429|503)$/.test(b.motivo) && !hostsRecusados.has(hostImg)) hostsRecusados.set(hostImg, 0);
          continue;
        }
        caminho = b.ok.caminho;
      }
      if (!caminho) {
        r.recusadas += 1;
        avisar(`${fonte}:${idExterno}: imagem sem caminho nem endereço`);
        continue;
      }
      if (!fs.existsSync(caminho)) {
        r.recusadas += 1;
        avisar(`${path.basename(caminho)}: o arquivo temporário não existe`);
        continue;
      }
      fila.push({ dados, caminho });
    }
  }
  for (const [h, n] of hostsRecusados) {
    if (n) avisar(`${h}: recusou o acesso; ${n} imagem(ns) deixaram de ser pedidas nesta execução (D14)`);
  }

  if (fila.length) {
    const saidas = await prepararPeloWorker(fila.map((f) => f.caminho), { uv, dirSaida: dir, offline });
    bater();
    const porCaminho = new Map(saidas.map((s) => [s.caminho, s]));
    for (const { dados, caminho } of fila) {
      const s = porCaminho.get(caminho);
      if (!s || s.erro) {
        r.recusadas += 1;
        avisar(`${path.basename(caminho)}: ${s ? s.erro : 'sem resposta do worker'}`);
        continue;
      }
      registrarDoItem(db, { fonte: dados.fonte, idExterno: dados.idExterno, agora, imagens: [{ ...s, ...dados, linkOrigem: dados.linkOrigem }] });
      // A peça baixada de novo veio com outros bytes: o vínculo com a linha sem
      // arquivo sai (a limpeza leva a linha, se ninguém mais a reclama).
      if (dados.semArquivo && dados.semArquivo !== s.sha) {
        db.prepare('DELETE FROM imagens_item WHERE fonte = ? AND id_externo = ? AND sha = ?').run(dados.fonte, dados.idExterno, dados.semArquivo);
      }
      // Uma imagem já ocultada não volta aos arquivos.
      const linha = db.prepare('SELECT oculta FROM imagens WHERE sha = ?').get(s.sha);
      if (linha && linha.oculta) apagarArquivos(dir, s.sha);
      r.guardadas += 1;
    }
  }

  // Os temporários que já foram lidos: todos que ficaram em <dir>/tmp.
  for (const p of new Set([...fila.map((f) => f.caminho)])) {
    if (dentroDe(pastaTmp, p)) { try { fs.unlinkSync(p); } catch { /* já saiu */ } }
  }
  for (const pend of pendentes || []) {
    for (const im of pend.imagens || []) {
      if (im.caminho && dentroDe(pastaTmp, im.caminho)) { try { fs.unlinkSync(im.caminho); } catch { /* já saiu */ } }
    }
  }

  // A limpeza varre o diretório inteiro e apaga o que o banco não reclama:
  // só roda aqui se o config pedir (`limpar: true`); o padrão é quem coordena
  // a coleta chamar limparImagens com o banco e o diretório certos.
  if (config.limpar === true) {
    try {
      r.limpeza = limparImagens(db, dir, { agora, folgaDias, maxMb: config.maxMb, log });
    } catch (e) {
      avisar(`a limpeza falhou (${e.message})`);
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Leitura: o que a festa mostra
// ---------------------------------------------------------------------------

function paraSP(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${new Date(t - 3 * 3600e3).toISOString().slice(0, 19)}-03:00`;
}

const ORDEM_PAPEL = ['cartaz-enviado', 'cartaz-indicado', 'flyer', 'pagina-ingresso', 'post'];
const rankPapel = (p) => { const i = ORDEM_PAPEL.indexOf(p); return i < 0 ? ORDEM_PAPEL.length : i; };
const tempo = (iso) => { const t = Date.parse(iso || ''); return Number.isNaN(t) ? 0 : t; };
const area = (i) => (Number(i.largura) || 0) * (Number(i.altura) || 0);

function proporcaoBoa(i) {
  if (!i.largura || !i.altura) return false;
  const p = i.largura / i.altura;
  return p >= 0.6 && p <= 1.0;
}

function ladoBom(i) {
  return Math.min(i.largura || 0, i.altura || 0) >= 600;
}

function mesmaPeca(a, b) {
  if (a.sha && b.sha && a.sha === b.sha) return true;
  const d = distancia(a.phash, b.phash);
  return d !== null && d <= 8;
}

// agruparImagens(imagens) -> [imagem com origens e principal], a principal primeiro (KTD9). Pura.
// Tira as ocultas; junta as de pHash <= 8 (ou o mesmo sha): fica a de maior
// resolução e os créditos de todas vão para `origens`. Os grupos se ordenam
// pelo melhor papel de quem entrou neles (cartaz enviado, cartaz indicado,
// flyer oficial, página do ingresso, post de outro perfil); desempate por
// proporção entre 0,6 e 1,0, depois menor lado >= 600 px, depois o
// `conferidoEm` mais novo.
function agruparImagens(imagens) {
  const vivas = (imagens || []).filter((i) => i && !i.oculta);
  const porArea = [...vivas].sort((a, b) => area(b) - area(a) || tempo(b.conferidoEm) - tempo(a.conferidoEm));
  const grupos = [];
  for (const im of porArea) {
    const g = grupos.find((x) => mesmaPeca(x.rep, im));
    if (g) g.membros.push(im);
    else grupos.push({ rep: im, membros: [im] });
  }
  const saida = grupos.map(({ rep, membros }) => {
    const origens = [];
    for (const m of membros) {
      const o = { fonte: m.fonte ?? null, origem: m.origem ?? null, credito: m.credito ?? null };
      if (!origens.some((x) => x.fonte === o.fonte && x.origem === o.origem && x.credito === o.credito)) origens.push(o);
    }
    const melhor = Math.min(...membros.map((m) => rankPapel(m.papel)));
    const novo = Math.max(...membros.map((m) => tempo(m.conferidoEm)));
    return { rep, origens, melhor, novo };
  });
  saida.sort((a, b) =>
    a.melhor - b.melhor
    || Number(proporcaoBoa(b.rep)) - Number(proporcaoBoa(a.rep))
    || Number(ladoBom(b.rep)) - Number(ladoBom(a.rep))
    || b.novo - a.novo
    || area(b.rep) - area(a.rep));
  return saida.map(({ rep, origens, novo }, i) => ({
    ...rep,
    conferidoEm: novo ? new Date(novo).toISOString() : rep.conferidoEm,
    origens,
    principal: i === 0,
  }));
}

// escolherPrincipal(imagens) -> imagem | null (KTD9). Pura.
function escolherPrincipal(imagens) {
  const g = agruparImagens(imagens);
  return g.length ? g[0] : null;
}

function linhasDaFesta(db, festaId) {
  return db.prepare(`SELECT i.sha, i.arquivo, i.miniatura, i.largura, i.altura, i.phash,
      ii.fonte, ii.papel, ii.link_origem, ii.credito, ii.conferido_em
    FROM vinculos v
    JOIN imagens_item ii ON ii.fonte = v.fonte AND ii.id_externo = v.id_externo
    JOIN imagens i ON i.sha = ii.sha
    WHERE v.festa_id = ? AND i.oculta = 0`).all(festaId);
}

// imagensDaFesta(db, festaId) -> [imagem no formato do contrato /3, sem as ocultas]
// A festa de cada imagem sai do JOIN com vinculos: fusão, separação e decisão
// manual levam a imagem junto. A principal vem primeiro, com `principal: true`.
function imagensDaFesta(db, festaId) {
  const brutas = linhasDaFesta(db, festaId).map((l) => ({
    sha: l.sha, arquivo: l.arquivo, miniatura: l.miniatura, largura: l.largura, altura: l.altura, phash: l.phash,
    papel: l.papel, fonte: l.fonte, credito: l.credito, origem: l.link_origem, conferidoEm: l.conferido_em,
  }));
  return agruparImagens(brutas).map((g) => ({
    id: sha16(g.sha),
    arquivo: g.arquivo,
    miniatura: g.miniatura,
    largura: g.largura,
    altura: g.altura,
    papel: g.papel,
    fonte: g.fonte,
    credito: g.credito,
    origem: g.origem,
    conferidoEm: paraSP(g.conferidoEm),
    principal: g.principal,
    origens: g.origens,
  }));
}

// imagensDoItem(db, fonte, idExterno) -> [{ sha, phash, dhash, papel, ... }] (a correlação lê o pHash daqui)
function imagensDoItem(db, fonte, idExterno) {
  return db.prepare(`SELECT i.sha, i.phash, i.dhash, i.largura, i.altura, ii.papel, ii.url_origem AS urlOrigem,
      ii.link_origem AS linkOrigem, ii.credito, ii.leitura, ii.conferido_em AS conferidoEm
    FROM imagens_item ii JOIN imagens i ON i.sha = ii.sha
    WHERE ii.fonte = ? AND ii.id_externo = ? AND i.oculta = 0
    ORDER BY ii.conferido_em DESC, i.sha`).all(fonte, idExterno);
}

// Distância de Hamming entre dois hashes perceptuais em hexadecimal (64 bits).
// null quando um deles falta ou os tamanhos diferem.
function distancia(phashA, phashB) {
  const ok = (h) => typeof h === 'string' && /^[0-9a-f]+$/i.test(h);
  if (!ok(phashA) || !ok(phashB) || phashA.length !== phashB.length) return null;
  let d = 0;
  for (let i = 0; i < phashA.length; i += 1) {
    let x = parseInt(phashA[i], 16) ^ parseInt(phashB[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Ocultar, servir, limpar
// ---------------------------------------------------------------------------

function apagarArquivos(dir, sha) {
  let n = 0;
  for (const nome of [`${sha16(sha)}-1080.webp`, `${sha16(sha)}-480.webp`]) {
    try { fs.unlinkSync(path.join(dir, nome)); n += 1; } catch { /* já saiu */ }
  }
  return n;
}

// ocultar(db, sha, motivo, { dir }) -> { ocultada, sha }
// O sha pode vir inteiro ou com os 16 primeiros (o `id` do contrato), no
// mínimo 8. A linha fica (com o motivo), para uma nova coleta da mesma peça
// não a trazer de volta; com `dir`, os arquivos saem do disco na hora.
function ocultar(db, sha, motivo, { dir = null } = {}) {
  const s = String(sha || '').toLowerCase();
  if (!/^[a-f0-9]{8,64}$/.test(s)) return { ocultada: false, sha: null };
  const linhas = db.prepare('SELECT sha FROM imagens WHERE sha LIKE ?').all(`${s}%`);
  if (linhas.length !== 1) return { ocultada: false, sha: null, motivo: linhas.length ? 'o início do sha é ambíguo' : 'imagem não encontrada' };
  db.prepare('UPDATE imagens SET oculta = 1, motivo_oculta = ? WHERE sha = ?').run(motivo || null, linhas[0].sha);
  if (dir) apagarArquivos(dir, linhas[0].sha);
  return { ocultada: true, sha: linhas[0].sha };
}

// O caminho no disco do que a rota /imagens/<nome> pode servir, ou null: nome
// fora do formato, imagem desconhecida ou ocultada, arquivo que sumiu.
function arquivoParaServir(db, dir, nome) {
  const seguro = caminhoSeguro(nome);
  if (!seguro || !dir) return null;
  const linha = db.prepare('SELECT oculta FROM imagens WHERE substr(sha, 1, 16) = ?').get(seguro.slice(0, 16));
  if (!linha || linha.oculta) return null;
  const arquivo = path.join(dir, seguro);
  return fs.existsSync(arquivo) ? arquivo : null;
}

function apagarImagem(db, dir, sha) {
  db.prepare('DELETE FROM imagens_item WHERE sha = ?').run(sha);
  db.prepare('DELETE FROM imagens WHERE sha = ?').run(sha);
  apagarArquivos(dir, sha);
}

// As duas peças (1080 e 480) de uma imagem estão no disco.
function temArquivos(dir, sha) {
  return [`${sha16(sha)}-1080.webp`, `${sha16(sha)}-480.webp`].every((nome) => fs.existsSync(path.join(dir, nome)));
}

function bytesDeUmaImagem(dir, sha) {
  let n = 0;
  for (const nome of [`${sha16(sha)}-1080.webp`, `${sha16(sha)}-480.webp`]) {
    try { n += fs.statSync(path.join(dir, nome)).size; } catch { /* sem o arquivo */ }
  }
  return n;
}

// limparImagens(db, dir, { agora, folgaDias, maxMb, log }) -> { apagadas, orfaos, temporarios, vinculos, porTeto }
// 1. tira os vínculos de festas com data_noite mais de `folgaDias` dias atrás;
// 2. apaga as imagens sem vínculo, com os arquivos (a linha da ocultada fica);
// 3. apaga os arquivos que nenhuma linha reclama e os temporários velhos (24 h);
// 4. acima do teto (`maxMb`), apaga as das festas mais distantes, as ocultas
//    não contam (já não têm arquivo).
function limparImagens(db, dir, opcoes = {}) {
  const { agora = () => new Date(), folgaDias = 7, maxMb = null, log } = opcoes;
  const r = { apagadas: 0, orfaos: 0, temporarios: 0, vinculos: 0, porTeto: 0 };
  if (!dir) return r;
  const corte = corteDaFolga(agora, folgaDias);

  r.vinculos = db.prepare(`DELETE FROM imagens_item WHERE rowid IN (
      SELECT ii.rowid FROM imagens_item ii
      JOIN vinculos v ON v.fonte = ii.fonte AND v.id_externo = ii.id_externo
      JOIN festas f ON f.id = v.festa_id
      WHERE f.data_noite IS NOT NULL AND f.data_noite < ?)`).run(corte).changes;

  // A ocultada fica (só a linha, sem arquivo): é ela que impede a mesma peça,
  // reposta numa edição seguinte da festa, de voltar visível.
  for (const { sha } of db.prepare('SELECT sha FROM imagens WHERE oculta = 0 AND sha NOT IN (SELECT sha FROM imagens_item)').all()) {
    apagarImagem(db, dir, sha);
    r.apagadas += 1;
  }

  if (fs.existsSync(dir)) {
    const conhecidos = new Set(db.prepare('SELECT substr(sha, 1, 16) AS s FROM imagens').all().map((x) => x.s));
    for (const nome of fs.readdirSync(dir)) {
      if (!NOME_SEGURO.test(nome) || conhecidos.has(nome.slice(0, 16))) continue;
      try { fs.unlinkSync(path.join(dir, nome)); r.orfaos += 1; } catch { /* já saiu */ }
    }
    for (const nome of fs.readdirSync(dir)) {
      if (!nome.endsWith('.parcial')) continue;
      const p = path.join(dir, nome);
      try {
        if (agora().getTime() - fs.statSync(p).mtimeMs > HORAS_TMP * 3600e3) { fs.unlinkSync(p); r.temporarios += 1; }
      } catch { /* já saiu */ }
    }
  }
  const tmp = path.join(dir, 'tmp');
  if (fs.existsSync(tmp)) {
    for (const nome of fs.readdirSync(tmp)) {
      const p = path.join(tmp, nome);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && agora().getTime() - st.mtimeMs > HORAS_TMP * 3600e3) { fs.unlinkSync(p); r.temporarios += 1; }
      } catch { /* já saiu */ }
    }
  }

  if (Number.isFinite(maxMb) && maxMb > 0) {
    const teto = maxMb * 1024 * 1024;
    const imagens = db.prepare(`SELECT i.sha, COALESCE(MIN(f.data_noite), '9999-12-31') AS perto
      FROM imagens i
      LEFT JOIN imagens_item ii ON ii.sha = i.sha
      LEFT JOIN vinculos v ON v.fonte = ii.fonte AND v.id_externo = ii.id_externo
      LEFT JOIN festas f ON f.id = v.festa_id
      WHERE i.oculta = 0 GROUP BY i.sha ORDER BY perto DESC, i.criada_em`).all();
    const tamanhos = new Map(imagens.map((i) => [i.sha, bytesDeUmaImagem(dir, i.sha)]));
    let total = [...tamanhos.values()].reduce((a, b) => a + b, 0);
    for (const i of imagens) {
      if (total <= teto) break;
      total -= tamanhos.get(i.sha);
      apagarImagem(db, dir, i.sha);
      r.apagadas += 1;
      r.porTeto += 1;
    }
    if (r.porTeto && log && log.warn) log.warn(`imagens: acima do teto de ${maxMb} MB, apaguei ${r.porTeto} das festas mais distantes`);
  }
  return r;
}

// O nome pedido na rota, se for um dos que o motor grava; senão null.
function caminhoSeguro(nome) {
  return typeof nome === 'string' && NOME_SEGURO.test(nome) ? nome : null;
}

// Os bytes que a fonte já tem (o Instagram, pela leitura do Haiku) vão para
// <dir>/tmp/<sha256> assim que chegam (KTD8): nenhum byte fica na memória até
// o tempo 2. `dir` é a raiz das imagens (FINDE_IMAGENS). Devolve o caminho.
function guardarTemporario(dir, bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const pasta = path.join(dir, 'tmp');
  fs.mkdirSync(pasta, { recursive: true });
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const caminho = path.join(pasta, sha);
  if (!fs.existsSync(caminho)) {
    const tmp = `${caminho}.${process.pid}.parcial`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, caminho);
  }
  return caminho;
}

module.exports = {
  baixar, baixarOuMotivo, prepararPeloWorker, registrarDoItem, processarPendentes, imagensDaFesta, imagensDoItem,
  escolherPrincipal, agruparImagens, distancia, ocultar, arquivoParaServir, limparImagens, caminhoSeguro, guardarTemporario,
  ipRecusado, hostPermitido, fetchFixandoEndereco, NOME_SEGURO,
};

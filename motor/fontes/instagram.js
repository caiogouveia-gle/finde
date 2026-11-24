'use strict';
// Instagram (prova de conceito acadêmica, KTD11): posts recentes de uma lista
// de perfis públicos, coletados sem login pelo Apify, e o flyer lido pelo
// Claude Haiku (nucleo/extrair.js). O Instagram é fonte de descoberta: diz que
// a festa existe e quem divulga; preço e horário valem mais quando vêm da
// página do ingresso, que o seguidor de links põe na fila (KTD14).
//
// O que não entra: comentários, curtidas, seguidores, fotos de pessoas. Do post
// fica o link e o que o flyer anuncia; a imagem é lida e descartada, nunca
// guardada nem republicada. Média de idade não sai daqui (R16).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { semCodigo, slug } = require('../nucleo/normalizar');

// Perfis de um arquivo privado (a lista de contatos em entrada/, fora do git):
// só os do Instagram, e sem as curadoras, que são parceria, não fonte.
function perfisDoArquivo(arquivo) {
  const caminho = path.isAbsolute(arquivo) ? arquivo : path.join(__dirname, '..', arquivo);
  let lista;
  try {
    lista = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`${arquivo} não abriu (${e.message})`);
  }
  return (Array.isArray(lista) ? lista : [])
    .filter((x) => x && typeof x.url === 'string' && /instagram\.com\//.test(x.url) && x.tipo !== 'curadoria')
    .map((x) => x.url);
}

const HOSTS_INGRESSO = /(^|\.)(sympla\.com\.br|shotgun\.live|ingresse\.com|ticket360\.com\.br|eventim\.com\.br|bileto\.sympla\.com\.br|guicheweb\.com\.br|clubedoingresso\.com|ra\.co)$/i;
// A API do Claude aceita até 5 MB por imagem já em base64 (4/3 do tamanho cru).
const LIMITE_BASE64 = 5 * 1024 * 1024;

const ehIngresso = (u) => {
  try {
    return HOSTS_INGRESSO.test(new URL(u).hostname);
  } catch {
    return false;
  }
};
// Só estes campos saem do Apify; comentários, curtidas e marcações nem chegam.
const CAMPOS_POST = ['shortCode', 'id', 'url', 'caption', 'timestamp', 'ownerUsername', 'ownerFullName', 'displayUrl', 'images', 'type'];
const CAMPOS_PERFIL = ['username', 'externalUrl', 'externalUrls'];

const urlsDoTexto = (t) => (String(t || '').match(/https?:\/\/[^\s"'<>)]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
const usuarioDe = (p) => String(p).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase();

// Linktree: a página pública lista os links; ficam só os de ingresso.
async function linksDoLinktree(fetch, u, timeoutMs) {
  const r = await fetch(u, { headers: { 'User-Agent': 'FindeMotor/0.1 (+https://github.com/caiogouveia-gle/finde)' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${new URL(u).hostname} respondeu ${r.status}`);
  const html = await r.text();
  return [...new Set(urlsDoTexto(html.replace(/\\u002F/g, '/').replace(/\\\//g, '/')).filter(ehIngresso))];
}

async function baixarImagem(fetch, u, timeoutMs) {
  const r = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`imagem respondeu ${r.status}`);
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) throw new Error(`imagem com tipo ${tipo || 'desconhecido'}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (Math.ceil(buf.length / 3) * 4 > LIMITE_BASE64) throw new Error('imagem grande demais');
  return { base64: buf.toString('base64'), tipo };
}

// Um post do coletor -> os campos que o motor usa. Só isso sai daqui.
function postEnxuto(p) {
  return {
    codigo: p.shortCode || p.id,
    url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
    legenda: typeof p.caption === 'string' ? p.caption : '',
    publicadoEm: p.timestamp || null,
    perfil: p.ownerUsername || null,
    nomePerfil: p.ownerFullName || null,
    imagem: p.displayUrl || (Array.isArray(p.images) && p.images[0]) || null,
  };
}

module.exports = {
  id: 'instagram',
  nome: 'Post no Instagram',
  postEnxuto,
  perfisDoArquivo,
  linksDoLinktree,
  async coletar({ db, fetch, agora, log, config, apify, extrator, fila }) {
    const itens = [];
    const avisos = [];
    let doArquivo = [];
    // No Fly a lista mora no volume: FINDE_INSTAGRAM_PERFIS aponta o arquivo.
    const arquivoPerfis = process.env.FINDE_INSTAGRAM_PERFIS || config.perfisArquivo;
    if (arquivoPerfis) {
      try {
        doArquivo = perfisDoArquivo(arquivoPerfis);
      } catch (e) {
        avisos.push(`instagram: ${e.message}`);
      }
    }
    const perfis = [...new Set([...(config.perfis || []), ...doArquivo].map(usuarioDe).filter(Boolean))];
    if (!apify) return { itens, avisos: ['sem APIFY_TOKEN: instagram não roda'], rodou: false };
    if (!perfis.length) return { itens, avisos: ['instagram: nenhum perfil em config.perfis'], rodou: false };
    // Só link com cara de link (semCodigo devolve null para o resto) entra na fila.
    const enfileirar = (u) => {
      const l = semCodigo(u);
      if (l && fila) fila.add(l);
      return l;
    };
    let postsVieram = true;
    const timeoutMs = config.timeoutMs || 20000;
    const opcoes = () => ({ maxItens: config.maxItens || 300, tetoUsd: config.tetoUsd || 1, precoPorMil: config.precoPorMil || 2.7 });

    // 1. Posts recentes.
    let posts = [];
    try {
      posts = await apify.rodar(config.atorPosts || 'apify~instagram-scraper', {
        directUrls: perfis.map((u) => `https://www.instagram.com/${u}/`),
        resultsType: 'posts',
        resultsLimit: config.postsPorPerfil || 6,
        onlyPostsNewerThan: `${config.dias || 3} days`,
        addParentData: false,
      }, { ...opcoes(), campos: CAMPOS_POST });
    } catch (e) {
      postsVieram = false;
      avisos.push(`instagram: posts não vieram (${e.message})`);
    }

    // 2. Link da bio e Linktree -> fila de páginas de ingresso.
    // O link da bio muda pouco: os perfis vão ao Apify uma vez a cada
    // `diasEntrePerfis` (padrão 7), o que cabe no plano grátis.
    const atorPerfis = config.atorPerfis || 'apify~instagram-profile-scraper';
    const ultimaPerfis = db ? db.prepare("SELECT MAX(quando) AS q FROM uso_apify WHERE ator = ? AND resultado = 'ok'").get(atorPerfis).q : null;
    const perfisEmDia = ultimaPerfis && (agora().getTime() - Date.parse(ultimaPerfis)) / 86400e3 < (config.diasEntrePerfis || 7);
    if (config.seguirBio !== false && fila && !perfisEmDia) {
      try {
        const contas = await apify.rodar(atorPerfis, { usernames: perfis }, { ...opcoes(), precoPorMil: config.precoPorMilPerfis || 2.6, maxItens: perfis.length, campos: CAMPOS_PERFIL });
        for (const c of contas) {
          const links = [c.externalUrl, ...(Array.isArray(c.externalUrls) ? c.externalUrls.map((x) => x && x.url) : [])].filter(Boolean);
          const guardar = (u) => {
            const l = enfileirar(u);
            if (l && db) db.prepare('INSERT INTO links_bio (perfil, url, visto_em) VALUES (?, ?, ?) ON CONFLICT (perfil, url) DO UPDATE SET visto_em = excluded.visto_em').run(String(c.username || ''), l, agora().toISOString());
          };
          for (const l of links) {
            if (ehIngresso(l)) guardar(l);
            else if (/(^|\.)linktr\.ee$/i.test((() => { try { return new URL(l).hostname; } catch { return ''; } })())) {
              try {
                for (const x of await linksDoLinktree(fetch, l, timeoutMs)) guardar(x);
              } catch (e) {
                avisos.push(`instagram: linktree de @${c.username} não abriu (${e.message})`);
              }
            }
          }
        }
      } catch (e) {
        avisos.push(`instagram: perfis não vieram (${e.message})`);
      }
    }
    // Os links da bio vistos nas últimas semanas voltam à fila todo dia.
    if (db && fila) {
      const desde = new Date(agora().getTime() - (config.diasLinksBio || 21) * 86400e3).toISOString();
      for (const r of db.prepare('SELECT url FROM links_bio WHERE visto_em >= ?').all(desde)) fila.add(r.url);
    }

    // 3. Flyer + legenda -> festas.
    const hoje = new Date(agora().getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    let semLeitura = 0;
    for (const bruto of posts) {
      const p = postEnxuto(bruto);
      if (!p.codigo || !p.url) continue;
      for (const u of urlsDoTexto(p.legenda)) if (ehIngresso(u)) enfileirar(u);
      let imagem = null;
      if (p.imagem) {
        try {
          imagem = await baixarImagem(fetch, p.imagem, timeoutMs);
        } catch (e) {
          avisos.push(`instagram: imagem de ${p.url} não veio (${e.message}); sigo só com a legenda`);
        }
      }
      const lido = extrator ? await extrator.lerFlyer({ chave: p.codigo, imagem, legenda: p.legenda, publicadoEm: p.publicadoEm, perfil: p.perfil }) : null;
      if (!lido) {
        semLeitura += 1;
        continue;
      }
      const lidoEm = agora().toISOString();
      lido.festas.filter((f) => f.data >= hoje).forEach((f) => {
        if (f.linkCompra && ehIngresso(f.linkCompra)) enfileirar(f.linkCompra);
        const campos = ['nome', 'data', 'inicio', 'fim', 'casa', 'endereco', 'lotes', 'lineup', 'estilos', 'idadeMinima', 'linkCompra']
          .filter((k) => f[k] !== null && !(Array.isArray(f[k]) && !f[k].length));
        itens.push({
          // Pela própria festa, não pela posição: se uma festa do post sai, a
          // outra não assume o vínculo dela (revisão de 24/11).
          idExterno: `ig:${p.codigo}:${crypto.createHash('sha256').update(`${slug(f.nome)}|${f.data}`).digest('hex').slice(0, 10)}`,
          url: p.url,
          texto: p.legenda.slice(0, 6000),
          lidoPorModelo: true,
          bruto: {
            ...f,
            linkCompra: f.linkCompra ? semCodigo(f.linkCompra) : null,
            produtora: p.perfil ? { nome: p.nomePerfil || `@${p.perfil}`, instagram: `@${p.perfil}` } : undefined,
            instagram: p.perfil ? `@${p.perfil}` : undefined,
            ehFesta: true,
            paginas: [{ tipo: 'instagram', nome: 'Instagram', url: p.url, lidoEm, campos }],
          },
        });
      });
    }
    if (semLeitura) avisos.push(`instagram: ${semLeitura} post(s) sem leitura do flyer (sem chave, teto ou erro)`);
    if (log && posts.length) log.info(`[motor] instagram: ${posts.length} posts, ${itens.length} festas, fila com ${fila ? fila.size : 0} links`);
    return { itens, avisos, rodou: postsVieram };
  },
};

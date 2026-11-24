// Instagram (prova de conceito acadêmica, KTD11): posts recentes de uma lista
// de perfis públicos, coletados sem login pelo Apify, e o flyer lido pelo
// Claude Haiku (nucleo/extrair.js). O Instagram é fonte de descoberta: diz que
// a festa existe e quem divulga; preço e horário valem mais quando vêm da
// página do ingresso, que o seguidor de links põe na fila (KTD14).
//
// O que entra no bruto (M32): legenda (até 6.000 caracteres), data do post,
// código do post e local marcado, para reprocessar e medir sem pagar de novo.
// O que não entra: comentários, curtidas, seguidores, foto de gente. Da imagem
// só se guarda a peça de divulgação (M33): quando a leitura própria do modelo
// diz que ela é um flyer, os bytes vão para <FINDE_IMAGENS>/tmp assim que
// chegam, e o item leva só o caminho (o tempo 2 da execução recodifica, com
// crédito e link do post). Foto, capa de vídeo e slide sem leitura não ficam.
// Média de idade não sai daqui (R16).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { semCodigo, slug } = require('../nucleo/normalizar');
const { custoUsd } = require('../nucleo/custo');
const { MODELO_PADRAO } = require('../nucleo/classificar');
const { SISTEMA, MAX_TOKENS, TOKENS_IMAGEM, MAX_TEXTO } = require('../nucleo/extrair');
const { guardarTemporario } = require('../nucleo/imagens');

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

// Sites de venda de ingresso cujos links vão para a fila de páginas. O RA fica
// de fora: bloqueio é recusa (D14), e o leitor não abre a página dele.
const HOSTS_INGRESSO = /(^|\.)(sympla\.com\.br|shotgun\.live|ingresse\.com|ticket360\.com\.br|eventim\.com\.br|bileto\.sympla\.com\.br|guicheweb\.com\.br|clubedoingresso\.com)$/i;
// A API do Claude aceita até 5 MB por imagem já em base64 (4/3 do tamanho cru).
const LIMITE_BASE64 = 5 * 1024 * 1024;
// O leitor se apresenta sem nome nem e-mail de pessoa (M32).
const USER_AGENT = 'FindeMotor/0.3 (prova academica; +https://finde-app.fly.dev)';

const ehIngresso = (u) => {
  try {
    return HOSTS_INGRESSO.test(new URL(u).hostname);
  } catch {
    return false;
  }
};
// Só estes campos saem do Apify; comentários, curtidas e marcações nem chegam.
const CAMPOS_POST = ['shortCode', 'id', 'url', 'caption', 'timestamp', 'ownerUsername', 'ownerFullName', 'displayUrl', 'images', 'type', 'locationName', 'locationId'];
const CAMPOS_PERFIL = ['username', 'externalUrl', 'externalUrls'];

const urlsDoTexto = (t) => (String(t || '').match(/https?:\/\/[^\s"'<>)]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
const usuarioDe = (p) => String(p).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase();

// Linktree: a página pública lista os links; ficam só os de ingresso.
async function linksDoLinktree(fetch, u, timeoutMs) {
  const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${new URL(u).hostname} respondeu ${r.status}`);
  const html = await r.text();
  return [...new Set(urlsDoTexto(html.replace(/\\u002F/g, '/').replace(/\\\//g, '/')).filter(ehIngresso))];
}

// Os hosts de imagem do Instagram (o mesmo recorte de config.imagens.hosts).
const HOSTS_IMAGEM = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

// Baixa a imagem do post para a leitura do modelo. Só https e só o CDN do
// Instagram (o endereço vem do Apify, que é terceiro); devolve os bytes (para
// guardar, se for flyer) e o base64 (para o pedido).
async function baixarImagem(fetch, u, timeoutMs) {
  let host = '';
  try {
    const url = new URL(u);
    host = url.protocol === 'https:' ? url.hostname : '';
  } catch { /* host vazio */ }
  if (!HOSTS_IMAGEM.test(host)) throw new Error('imagem fora do CDN do Instagram');
  const r = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`imagem respondeu ${r.status}`);
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) throw new Error(`imagem com tipo ${tipo || 'desconhecido'}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (Math.ceil(buf.length / 3) * 4 > LIMITE_BASE64) throw new Error('imagem grande demais');
  return { buf, base64: buf.toString('base64'), tipo };
}

// Um post do coletor -> os campos que o motor usa. Só isso sai daqui.
function postEnxuto(p) {
  const local = typeof p.locationName === 'string' && p.locationName.trim()
    ? { nome: p.locationName.trim().slice(0, 120), id: p.locationId ? String(p.locationId).slice(0, 40) : null }
    : null;
  return {
    codigo: p.shortCode || p.id,
    url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
    legenda: typeof p.caption === 'string' ? p.caption : '',
    publicadoEm: p.timestamp || null,
    perfil: p.ownerUsername || null,
    nomePerfil: p.ownerFullName || null,
    imagem: p.displayUrl || (Array.isArray(p.images) && p.images[0]) || null,
    // Capa de vídeo nunca é guardada como peça de divulgação.
    ehVideo: /video|reel/i.test(String(p.type || '')),
    local,
  };
}

// Quanto uma rodada custa, no pior caso, para escolher `postsPorPerfil`,
// `perfisPorRodada` e `maxItens` que cabem nos tetos (D1): o Apify da rodada de
// posts (US$ 0,10 por chamada no config), o do dia (US$ 0,25, com a leitura de
// perfis da semana no mesmo dia) e o Claude da execução (US$ 0,50). O Claude é
// contado pelo pior caso do próprio extrator: entrada cheia (sistema, legenda
// de 6.000 caracteres e uma imagem) e saída até o limite de tokens.
function custoEsperado({ perfis, postsPorPerfil = 6, perfisPorRodada = null, dias = 3, maxItens = 300 }, opcoes = {}) {
  const {
    precoPorMil = 2.7, precoPorMilPerfis = 2.6, modelo = MODELO_PADRAO,
    tetoRodadaUsd = 0.1, tetoPerfisUsd = null, tetoExecucaoApifyUsd = 0.25, tetoDiaApifyUsd = 0.25, tetoClaudeExecucaoUsd = 0.5,
  } = opcoes;
  const lidos = Math.min(perfis, perfisPorRodada || perfis);
  const posts = Math.min(maxItens, lidos * postsPorPerfil);
  const apifyPostsUsd = Math.min((posts * precoPorMil) / 1000, tetoRodadaUsd);
  const apifyPerfisUsd = Math.min((perfis * precoPorMilPerfis) / 1000, tetoPerfisUsd === null ? tetoRodadaUsd : tetoPerfisUsd);
  const entrada = Math.ceil((SISTEMA.length + MAX_TEXTO + 400) / 3) + TOKENS_IMAGEM;
  const claudeUsd = posts * custoUsd(modelo, entrada, MAX_TOKENS);
  const apifyDiaUsd = apifyPostsUsd + apifyPerfisUsd; // o dia em que os perfis também vão
  const postsDoCap = Math.floor((tetoRodadaUsd * 1000) / precoPorMil);
  return {
    perfis, dias, posts, postsDoCap,
    apifyPostsUsd, apifyPerfisUsd, apifyDiaUsd, claudeUsd,
    cabe: {
      postsNoCap: (lidos * postsPorPerfil) <= postsDoCap,
      apifyRodada: apifyPostsUsd <= tetoRodadaUsd && apifyPerfisUsd <= (tetoPerfisUsd === null ? tetoRodadaUsd : tetoPerfisUsd),
      apifyDia: apifyDiaUsd <= tetoDiaApifyUsd && apifyDiaUsd <= tetoExecucaoApifyUsd,
      claudeExecucao: claudeUsd <= tetoClaudeExecucaoUsd,
    },
  };
}

// Os perfis de uma rodada: com `perfisPorRodada`, uma fatia que gira pelo dia
// (cada perfil é lido de tempos em tempos, sem ninguém passar fome quando o teto
// de gasto corta a lista). Sem ele, todos.
function perfisDaRodada(perfis, { perfisPorRodada, agora }) {
  if (!perfisPorRodada || perfis.length <= perfisPorRodada) return perfis;
  const dia = Math.floor((agora().getTime() - 3 * 3600e3) / 86400e3);
  const inicio = (dia * perfisPorRodada) % perfis.length;
  return Array.from({ length: perfisPorRodada }, (_, i) => perfis[(inicio + i) % perfis.length]);
}

// Os códigos de post das festas que ainda vão acontecer, para a recuperação
// (M32, D12): mais recentes primeiro, sem repetir.
function codigosParaRecuperar(db, hoje, limite) {
  const vistos = new Set();
  const linhas = db.prepare("SELECT id_externo, bruto FROM itens_brutos WHERE fonte = 'instagram' ORDER BY coletado_em DESC").all();
  for (const l of linhas) {
    const m = String(l.id_externo).match(/^ig:([^:]+):/);
    if (!m) continue;
    let b;
    try {
      b = JSON.parse(l.bruto);
    } catch {
      continue;
    }
    if (b.substituido === true || (b.data && b.data < hoje)) continue;
    vistos.add(m[1]);
    if (vistos.size >= limite) break;
  }
  return [...vistos];
}

// Releitura de um post (M32): os itens `ig:<codigo>:*` que a leitura nova não
// devolveu perdem o vínculo e os valores do Instagram, para a festa velha não
// ficar com `ehFesta: true` nem duplicar. Ficam no bruto, marcados `substituido`.
//
// O id do item leva o nome e a data lidos, então uma releitura que só muda o
// nome ("Baile Tal" e depois "Baile Tal · sábado") dá outro item. Para a festa
// não sumir com o id que o convite e as avaliações já usam, o vínculo velho
// passa ao item novo que é a mesma festa do post: o da mesma data, quando há um
// só de cada lado; ou o único, quando o post tinha uma festa e continua com uma.
// `emitidas` (Map id -> data) são as festas novas que a coleta vai gravar; sem
// ele, só o caso de uma festa de cada lado é ligado. A festa que fica sem
// vínculo e sem par sai, como antes.
//
// Com `hoje`, os itens de festa que já passou ficam como estão: a coleta não
// reemite festa passada, então o item velho não teria herdeiro e a festa da
// véspera sumiria justo quando as avaliações dela chegam (revisão de 24/11).
function substituirItensAntigos(db, codigo, idsNovos, emitidas = null, hoje = null) {
  const dataDoBruto = (bruto) => {
    try {
      const b = JSON.parse(bruto);
      return typeof b.data === 'string' ? b.data : null;
    } catch {
      return null;
    }
  };
  const antigos = db.prepare("SELECT id_externo, bruto FROM itens_brutos WHERE fonte = 'instagram' AND id_externo LIKE ? ESCAPE '\\'").all(`ig:${String(codigo).replace(/[\\%_]/g, '\\$&')}:%`)
    .filter((l) => !idsNovos.has(l.id_externo))
    .filter((l) => {
      if (!hoje) return true;
      const d = dataDoBruto(l.bruto);
      return !(d && d < hoje);
    });
  const novos = emitidas instanceof Map ? emitidas : new Map([...idsNovos].map((id) => [id, null]));
  const vinculoDe = db.prepare("SELECT festa_id FROM vinculos WHERE fonte = 'instagram' AND id_externo = ?");
  // Os novos que ainda não têm festa (os que já têm seguem a deles).
  const livres = [...novos].filter(([id]) => !vinculoDe.get(id));
  const comVinculo = antigos.map((l) => {
    let data = null;
    try {
      const b = JSON.parse(l.bruto);
      if (b.substituido !== true && typeof b.data === 'string') data = b.data;
    } catch { /* bruto torto: sem data */ }
    return { id: l.id_externo, data, v: vinculoDe.get(l.id_externo) };
  });
  const herdeiro = new Map();
  const vivos = comVinculo.filter((x) => x.v);
  if (vivos.length === 1 && livres.length === 1 && novos.size === 1) herdeiro.set(vivos[0].id, livres[0][0]);
  else {
    for (const x of vivos) {
      if (!x.data) continue;
      const mesmaData = livres.filter(([, d]) => d === x.data);
      if (mesmaData.length === 1 && vivos.filter((y) => y.data === x.data).length === 1) herdeiro.set(x.id, mesmaData[0][0]);
    }
  }
  const saiu = [];
  for (const { id, v } of comVinculo) {
    db.prepare("UPDATE itens_brutos SET bruto = json_set(bruto, '$.substituido', json('true')) WHERE fonte = 'instagram' AND id_externo = ?").run(id);
    if (!v) continue;
    const para = herdeiro.get(id);
    if (para) {
      // A mesma festa, lida de novo: o item novo herda o vínculo (e a festa, o id).
      db.prepare("UPDATE vinculos SET id_externo = ? WHERE fonte = 'instagram' AND id_externo = ?").run(para, id);
      saiu.push(id);
      continue;
    }
    db.prepare("DELETE FROM vinculos WHERE fonte = 'instagram' AND id_externo = ?").run(id);
    const resta = db.prepare("SELECT 1 FROM vinculos WHERE fonte = 'instagram' AND festa_id = ? LIMIT 1").get(v.festa_id);
    if (!resta) db.prepare("DELETE FROM valores WHERE festa_id = ? AND fonte = 'instagram'").run(v.festa_id);
    if (!db.prepare('SELECT 1 FROM vinculos WHERE festa_id = ? LIMIT 1').get(v.festa_id)
      && !db.prepare("SELECT 1 FROM valores WHERE festa_id = ? AND fonte = 'curadoria' LIMIT 1").get(v.festa_id)
      && !db.prepare('SELECT 1 FROM festas_alias WHERE novo = ? OR antigo = ? LIMIT 1').get(v.festa_id, v.festa_id)
      // Festa que já tem avaliação não sai: o app e fontes/avaliacoes.js a procuram pelo id.
      && !db.prepare('SELECT 1 FROM avaliacoes WHERE festa_id = ? LIMIT 1').get(v.festa_id)) {
      db.prepare('DELETE FROM valores WHERE festa_id = ?').run(v.festa_id);
      db.prepare('DELETE FROM festas WHERE id = ?').run(v.festa_id);
    }
    saiu.push(id);
  }
  return saiu;
}

module.exports = {
  id: 'instagram',
  nome: 'Post no Instagram',
  postEnxuto,
  perfisDoArquivo,
  linksDoLinktree,
  custoEsperado,
  perfisDaRodada,
  codigosParaRecuperar,
  substituirItensAntigos,
  async coletar({ db, fetch, agora, log, config, apify, extrator, fila, dirImagens, batimento }) {
    const itens = [];
    const avisos = [];
    // O batimento da execução (U8): a cada chamada ao Apify e a cada post, para
    // a trava não abandonar uma rodada longa (Apify mais um flyer por post).
    const bater = () => {
      if (typeof batimento === 'function') batimento();
    };
    // No Fly a lista mora no volume: FINDE_INSTAGRAM_PERFIS aponta o arquivo; o
    // `perfisArquivo` do config é a reserva quando o primeiro não existe.
    let doArquivo = [];
    for (const arquivo of [process.env.FINDE_INSTAGRAM_PERFIS, config.perfisArquivo].filter(Boolean)) {
      try {
        doArquivo = perfisDoArquivo(arquivo);
      } catch (e) {
        avisos.push(`instagram: ${e.message}`);
      }
      if (doArquivo.length) break;
    }
    const todosPerfis = [...new Set([...(config.perfis || []), ...doArquivo].map(usuarioDe).filter(Boolean))];
    const recuperar = config.recuperar === true;
    if (!apify) return { itens, avisos: ['sem APIFY_TOKEN: instagram não roda'], rodou: false };
    if (!recuperar && !todosPerfis.length) {
      return { itens, avisos: ['instagram: nenhum perfil (FINDE_INSTAGRAM_PERFIS, perfisArquivo ou config.perfis); a fonte não roda'], rodou: false };
    }
    // Só link com cara de link (semCodigo devolve null para o resto) entra na fila.
    const enfileirar = (u) => {
      const l = semCodigo(u);
      if (l && fila) fila.add(l);
      return l;
    };
    let postsVieram = true;
    const timeoutMs = config.timeoutMs || 20000;
    const maxItens = config.maxItens || 300;
    const opcoes = () => ({ maxItens, tetoUsd: config.tetoUsd || 1, precoPorMil: config.precoPorMil || 2.7 });
    const hoje = new Date(agora().getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    const dir = dirImagens || process.env.FINDE_IMAGENS || path.join(__dirname, '..', 'var', 'imagens');
    // diasExtra (só por comando): uma busca com janela maior.
    const dias = config.diasExtra || config.dias || 3;
    const perfis = config.diasExtra ? todosPerfis : perfisDaRodada(todosPerfis, { perfisPorRodada: config.perfisPorRodada, agora });

    // 1. Posts recentes (ou, na recuperação, os posts já conhecidos pelo link).
    let posts = [];
    try {
      let entrada;
      let limite = maxItens;
      if (recuperar) {
        const codigos = db ? codigosParaRecuperar(db, hoje, maxItens) : [];
        if (!codigos.length) return { itens, avisos: ['instagram: recuperar: nenhum post de festa futura no banco'], rodou: false };
        limite = codigos.length;
        entrada = { directUrls: codigos.map((c) => `https://www.instagram.com/p/${c}/`), resultsType: 'posts', resultsLimit: 1, addParentData: false };
      } else {
        entrada = {
          directUrls: perfis.map((u) => `https://www.instagram.com/${u}/`),
          resultsType: 'posts',
          resultsLimit: config.postsPorPerfil || 6,
          onlyPostsNewerThan: `${dias} days`,
          addParentData: false,
        };
      }
      bater();
      posts = await apify.rodar(config.atorPosts || 'apify~instagram-scraper', entrada, { ...opcoes(), maxItens: limite, campos: CAMPOS_POST });
      bater();
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
    if (config.seguirBio !== false && fila && !perfisEmDia && !recuperar && !config.diasExtra) {
      try {
        const contas = await apify.rodar(atorPerfis, { usernames: todosPerfis }, {
          ...opcoes(), tetoUsd: config.tetoUsdPerfis || config.tetoUsd || 1, precoPorMil: config.precoPorMilPerfis || 2.6, maxItens: todosPerfis.length, campos: CAMPOS_PERFIL,
        });
        bater();
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
    let semLeitura = 0;
    let imagensGuardadas = 0;
    bater();
    for (const bruto of posts) {
      bater();
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
      const lido = extrator ? await extrator.lerFlyer({ chave: p.codigo, imagem: imagem && { base64: imagem.base64, tipo: imagem.tipo }, legenda: p.legenda, publicadoEm: p.publicadoEm, perfil: p.perfil }) : null;
      if (!lido) {
        semLeitura += 1;
        continue;
      }
      const lidoEm = agora().toISOString();
      const idDe = (f) => `ig:${p.codigo}:${crypto.createHash('sha256').update(`${slug(f.nome)}|${f.data}`).digest('hex').slice(0, 10)}`;
      // Releitura: o que o post já tinha e a leitura nova não devolveu sai.
      if (db) {
        try {
          const emitidas = new Map(lido.festas.filter((f) => f.data >= hoje).map((f) => [idDe(f), f.data]));
          const saiu = substituirItensAntigos(db, p.codigo, new Set(lido.festas.map(idDe)), emitidas, hoje);
          if (saiu.length) avisos.push(`instagram: ${p.url} releu e ${saiu.length} item(ns) antigo(s) saíram`);
        } catch (e) {
          avisos.push(`instagram: a releitura de ${p.url} não substituiu os itens antigos (${e.message})`);
        }
      }
      // O flyer só fica se a leitura própria disse `flyer`; a peça é uma só e
      // vai a todas as festas do post (agenda: pesa a metade na correlação).
      let caminho = null;
      const comFlyer = lido.festas.some((f) => f.imagem === 'flyer');
      if (imagem && comFlyer && !p.ehVideo) {
        try {
          caminho = guardarTemporario(dir, imagem.buf);
          imagensGuardadas += 1;
        } catch (e) {
          avisos.push(`instagram: o flyer de ${p.url} não foi guardado (${e.message})`);
        }
      }
      const agenda = lido.festas.filter((f) => f.data >= hoje).length > 1;
      lido.festas.filter((f) => f.data >= hoje).forEach((f) => {
        if (f.linkCompra && ehIngresso(f.linkCompra)) enfileirar(f.linkCompra);
        const campos = ['nome', 'data', 'inicio', 'fim', 'casa', 'endereco', 'lotes', 'lineup', 'estilos', 'idadeMinima', 'linkCompra']
          .filter((k) => f[k] !== null && !(Array.isArray(f[k]) && !f[k].length));
        const { confianca: _c, imagem: _i, ...daFesta } = f;
        const item = {
          // Pela própria festa, não pela posição: se uma festa do post sai, a
          // outra não assume o vínculo dela (revisão de 24/11).
          idExterno: idDe(f),
          url: p.url,
          texto: p.legenda.slice(0, 6000),
          lidoPorModelo: true,
          bruto: {
            ...daFesta,
            linkCompra: f.linkCompra ? semCodigo(f.linkCompra) : null,
            produtora: p.perfil ? { nome: p.nomePerfil || `@${p.perfil}`, instagram: `@${p.perfil}` } : undefined,
            instagram: p.perfil ? `@${p.perfil}` : undefined,
            legenda: p.legenda.slice(0, 6000),
            publicadoEm: p.publicadoEm,
            codigo: p.codigo,
            ...(p.local ? { local: p.local } : {}),
            paginas: [{ tipo: 'instagram', nome: 'Instagram', url: p.url, lidoEm, campos }],
          },
        };
        if (caminho && f.imagem === 'flyer') {
          item.imagens = [{
            caminho, tipo: imagem.tipo, papel: 'post', origem: p.url, credito: p.perfil ? `Divulgação · @${p.perfil}` : 'Divulgação', perfil: p.perfil, leitura: 'flyer', ...(agenda ? { agenda: true } : {}),
          }];
        }
        itens.push(item);
      });
    }
    if (semLeitura) avisos.push(`instagram: ${semLeitura} post(s) sem leitura do flyer (sem chave, teto ou erro)`);
    if (log && posts.length) log.info(`[motor] instagram: ${posts.length} posts, ${itens.length} festas, ${imagensGuardadas} flyers, fila com ${fila ? fila.size : 0} links`);
    return { itens, avisos, rodou: postsVieram };
  },
};

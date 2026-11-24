'use strict';
// Junta itens de fontes diferentes numa festa só (KTD3) e grava o que cada
// fonte disse de cada campo (KTD2).
//
// O vínculo conservador (U5 do plano de 24/11/2026) é o primeiro tempo da
// correlação: na hora da coleta, só junta o que é claramente a mesma festa,
// sempre dentro da mesma noite (festas.data_noite):
//   - o mesmo link de evento ou de compra (ou o mesmo id na plataforma), sem
//     nome de outra festa;
//   - a mesma casa (lugar e espaço, por casaCanonica) e nome parecido (Jaccard
//     ≥ 0,5 sem datas, sem as palavras da casa e da cidade e sem palavras de
//     festa);
//   - casa vazia de um lado: nome parecido e a mesma produtora ou o mesmo
//     perfil do Instagram (inclusive pelo link da bio, links_bio).
// E nunca junta quando há um veto (KTD5): inícios conhecidos a 90 min ou mais,
// dois links próprios de evento diferentes da mesma fonte (post do Instagram
// não conta como link próprio, e itens do mesmo post não se vetam), dois
// links de evento diferentes da mesma plataforma, decisão manual `separa`,
// cidades diferentes. O que sobra incerto fica para a passada de escore
// (correlacao.js), que roda no fim da execução.

const { novoId, slug } = require('./normalizar');
const { PRIORIDADE } = require('./catalogo');

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------- links

// Caminhos da Ingresse que não são um evento.
const RESERVADAS_INGRESSE = new Set(['', 'eventos', 'evento', 'busca', 'search', 'login', 'cadastro', 'carrinho', 'checkout', 'ajuda', 'termos', 'sobre',
  'categoria', 'categorias', 'produtor', 'produtores', 'organizador', 'minha-conta', 'pt', 'en', 'es']);

// Hosts que não dão link de evento: o post, o perfil e a bio.
const HOSTS_SEM_EVENTO = /(^|\.)(instagram\.com|facebook\.com|fb\.com|linktr\.ee|tiktok\.com|wa\.me|whatsapp\.com)$/;

// O evento por trás de um link: { chave, forma, forte }. `chave` é o que se
// compara (dois links de um evento dão a mesma chave); `forma` é a plataforma e
// o tipo de id (dois ids da mesma forma que diferem são eventos diferentes);
// `forte` diz que o link é de um evento só (a página de um produtor, de uma
// agenda ou de um festival com vários dias não é).
//   shotgun.live/[idioma/]events/<slug>         -> shotgun:<slug>
//   sympla.com.br/evento/<slug>/<id>             -> sympla:<id>
//   bileto.sympla.com.br/event/<id>              -> bileto:<id>
//   www.ingresse.com/<slug>                      -> ingresse:<slug>
//   embedstore.ingresse.com/.../event/<id>       -> ingresse-id:<id>
//   cart.ingresse.com/<uuid>                     -> ingresse-cart:<uuid>
//   <evento>.ingresse.com                        -> ingresse-sub:<evento> (fraco: serve a vários dias)
//   o resto                                      -> host + caminho (fraco)
function idDeEvento(u) {
  let p;
  try {
    p = new URL(String(u));
  } catch {
    return null;
  }
  if (p.protocol !== 'https:' && p.protocol !== 'http:') return null;
  const host = p.hostname.toLowerCase().replace(/^www\./, '');
  if (HOSTS_SEM_EVENTO.test(host)) return null;
  const partes = p.pathname.split('/').filter(Boolean).map((x) => {
    try {
      return decodeURIComponent(x).toLowerCase();
    } catch {
      return x.toLowerCase();
    }
  });
  if (host === 'shotgun.live' || host.endsWith('.shotgun.live')) {
    const i = partes.indexOf('events');
    if (i >= 0 && partes[i + 1]) return { chave: `shotgun:${partes[i + 1]}`, forma: 'shotgun', forte: true };
  }
  if (host === 'bileto.sympla.com.br') {
    const i = partes.indexOf('event');
    if (i >= 0 && partes[i + 1]) return { chave: `bileto:${partes[i + 1]}`, forma: 'bileto', forte: true };
  }
  if (host === 'sympla.com.br' || host.endsWith('.sympla.com.br')) {
    const i = partes.indexOf('evento');
    const id = i >= 0 ? partes.slice(i + 1).find((x) => /^\d{4,}$/.test(x)) : null;
    if (id) return { chave: `sympla:${id}`, forma: 'sympla', forte: true };
  }
  if (host === 'ingresse.com' || host.endsWith('.ingresse.com')) {
    if (host === 'cart.ingresse.com') {
      if (partes[0]) return { chave: `ingresse-cart:${partes[0]}`, forma: 'ingresse-cart', forte: true };
    } else if (host.startsWith('embedstore.')) {
      const i = partes.indexOf('event');
      if (i >= 0 && partes[i + 1]) return { chave: `ingresse-id:${partes[i + 1]}`, forma: 'ingresse-id', forte: true };
    } else if (host === 'ingresse.com') {
      if (partes.length === 1 && !RESERVADAS_INGRESSE.has(partes[0])) return { chave: `ingresse:${partes[0]}`, forma: 'ingresse', forte: true };
    } else if (!/^(api|cdn|static|images?|kraken|blog|ajuda|help)\./.test(host)) {
      const sub = host.slice(0, -'.ingresse.com'.length);
      return { chave: `ingresse-sub:${sub}`, forma: 'ingresse-sub', forte: false };
    }
  }
  // O resto: host e caminho, sem idioma do Shotgun e sem barra final.
  const caminho = p.pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/events\/)/i, '').replace(/\/+$/, '');
  return { chave: `${host}${caminho}`.toLowerCase(), forma: host, forte: false };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// O id do evento que a própria fonte trouxe (idPlataforma, U12/U14):
// "ingresse:123", { plataforma: 'ingresse', id: 123 }. Sem a plataforma, nada.
function idDePlataforma(v) {
  let plataforma = null;
  let id = null;
  if (typeof v === 'string') {
    const m = v.trim().match(/^([a-z][a-z0-9-]*)[:/](.+)$/i);
    if (m) [, plataforma, id] = m;
  } else if (v && typeof v === 'object') {
    plataforma = v.plataforma;
    id = v.id;
  }
  if (!plataforma || id === null || id === undefined || id === '') return null;
  const p = semAcento(plataforma).replace(/[^a-z0-9-]/g, '');
  const i = String(id).trim().toLowerCase();
  if (!p || !i) return null;
  // A Ingresse pela forma do id, com as mesmas formas de idDeEvento: o número
  // é o id do embedstore, o uuid é o carrinho, o subdomínio é fraco (serve a
  // vários dias) e o resto é o slug da página. O "ingresse:<x>" antigo, que
  // misturava as quatro, cai aqui também.
  if (p === 'ingresse' || p.startsWith('ingresse-')) {
    let forma;
    if (p === 'ingresse-sub') return { chave: `ingresse-sub:${i}`, forma: 'ingresse-sub', forte: false };
    if (p === 'ingresse-id' || p === 'ingresse-cart') forma = p;
    else if (p !== 'ingresse') return null;
    else if (/^\d+$/.test(i)) forma = 'ingresse-id';
    else if (UUID.test(i)) forma = 'ingresse-cart';
    else if (RESERVADAS_INGRESSE.has(i)) return null; // "ingresse:eventos" não é um evento
    else forma = 'ingresse';
    return { chave: `${forma}:${i}`, forma, forte: true };
  }
  return { chave: `${p}:${i}`, forma: p, forte: true };
}

// Link de evento normalizado para comparar (a chave de idDeEvento).
function linkComparavel(u) {
  const e = idDeEvento(u);
  return e ? e.chave : null;
}

// As chaves de evento de um conjunto de campos: linkCompra, linkEvento, a url
// do item e o idPlataforma. Sem repetir.
function chavesDeEvento({ linkCompra, linkEvento, url, idPlataforma } = {}) {
  const saida = [];
  const vistos = new Set();
  const por = (e) => {
    if (e && !vistos.has(e.chave)) {
      vistos.add(e.chave);
      saida.push(e);
    }
  };
  for (const u of [linkCompra, linkEvento, url]) if (typeof u === 'string' && u) por(idDeEvento(u));
  if (idPlataforma) por(idDePlataforma(idPlataforma));
  return saida;
}

// ---------------------------------------------------------------- nomes

// Palavras que não distinguem uma festa da outra.
const PALAVRAS_DE_FESTA = new Set([
  'festa', 'festas', 'apresenta', 'apresentam', 'apresentacao', 'recebe', 'recebem', 'convida', 'convidam', 'vivo', 'edicao', 'especial', 'open', 'bar',
  'com', 'dos', 'das', 'para', 'pra', 'pela', 'pelo', 'the', 'and', 'feat', 'part', 'mais', 'uma', 'um',
]);
const DIAS_E_MESES = new Set([
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'feira',
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]);
const PALAVRAS_DE_CIDADE = new Set(['sao', 'paulo', 'sampa', 'rio', 'janeiro', 'capital', 'brasil', 'cidade']);

// "26/11 - Abacaxepa no Mundo Pensante" -> ['abacaxepa'] (com a casa "Mundo Pensante").
function palavrasDoNome(nome, remover = new Set()) {
  const t = semAcento(nome)
    .replace(/\b\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?\b/g, ' ') // 28/11, 28.11, 28-11, 28/11/2026
    .replace(/\b(?:19|20)\d{2}\b/g, ' ') // anos
    .replace(/['’`´]\s?\d{2}\b/g, ' ') // '26
    .replace(/\b\d{1,2}h(?:\d{2})?\b/g, ' '); // 23h, 23h30
  const saida = new Set();
  for (const p of slug(t).split('-')) {
    if (p.length < 3 || /^\d+$/.test(p)) continue;
    if (PALAVRAS_DE_FESTA.has(p) || DIAS_E_MESES.has(p) || PALAVRAS_DE_CIDADE.has(p) || remover.has(p)) continue;
    saida.add(p);
  }
  return saida;
}

// As palavras de uma casa ou cidade, para tirar do nome.
function palavrasDe(...textos) {
  const s = new Set();
  for (const t of textos.flat()) for (const p of slug(semAcento(t || '')).split('-')) if (p.length >= 3) s.add(p);
  return s;
}

// Semelhança entre dois nomes já limpos: { j, comum, contido }. j null quando
// um lado não tem palavra nenhuma que distinga.
function semelhancaPalavras(A, B) {
  if (!A.size || !B.size) return { j: null, comum: 0, contido: false };
  let comum = 0;
  for (const p of A) if (B.has(p)) comum += 1;
  return { j: comum / (A.size + B.size - comum), comum, contido: comum === Math.min(A.size, B.size) };
}

// Jaccard entre dois nomes, sem datas, sem palavras de festa e sem as palavras
// de `remover` (as da casa e da cidade). 0 quando um lado fica vazio.
function jaccard(a, b, remover = new Set()) {
  const r = semelhancaPalavras(palavrasDoNome(a, remover), palavrasDoNome(b, remover));
  return r.j === null ? 0 : r.j;
}

// ---------------------------------------------------------------- casas

const UFS = new Set(['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to']);
const NAO_E_CASA = /^(sao paulo|sao paulo sp|sp|sampa|rio de janeiro|rio de janeiro rj|rj|belo horizonte|curitiba|campinas|santos|online|on line|a definir|local a definir|a confirmar|local a confirmar|local secreto|secreto|brasil)$/;
const LOGRADOURO = /^(rua|r|av|avenida|alameda|al|praca|pca|estrada|rodovia|rod|travessa|tv|largo|viaduto)\b/;

// Casa que não é casa: vazia, nome de cidade ou UF, "a definir", ou um endereço.
function casaVazia(casa) {
  if (typeof casa !== 'string') return true;
  const t = semAcento(casa).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!t) return true;
  if (NAO_E_CASA.test(t) || UFS.has(t)) return true;
  return LOGRADOURO.test(t) && /\d/.test(t);
}

// Casa que é nome de cidade ou UF ("São Paulo", "Rio de Janeiro", "SP"): vai
// para `revisar` (KTD1).
function casaQueECidade(casa) {
  if (typeof casa !== 'string') return false;
  const t = semAcento(casa).replace(/[^a-z0-9]+/g, ' ').trim();
  return Boolean(t) && !/^(online|on line|a definir|local a definir|a confirmar|local a confirmar|local secreto|secreto)$/.test(t) && (NAO_E_CASA.test(t) || UFS.has(t));
}

// ---------------------------------------------------------------- datas

// A data e a noite da festa (festas.data e festas.data_noite), pela fonte que
// vale (prioridade, depois a mais recente): festa que mudou de data na página
// do ingresso muda aqui também.
function atualizarDatas(db, festaId) {
  const { dataDaNoite } = require('./contrato');
  const ordenar = (ls) => ls.sort((a, b) => (PRIORIDADE[b.fonte] || 0) - (PRIORIDADE[a.fonte] || 0) || b.conferido_em.localeCompare(a.conferido_em));
  const ler = (campo) => {
    const ls = ordenar(db.prepare('SELECT fonte, valor, conferido_em FROM valores WHERE festa_id = ? AND campo = ?').all(festaId, campo));
    for (const l of ls) {
      try {
        const v = JSON.parse(l.valor);
        if (typeof v === 'string' && v) return v;
      } catch {
        // valor quebrado: tenta o próximo
      }
    }
    return null;
  };
  const data = ler('data');
  if (!data) return;
  const noite = dataDaNoite(data, ler('inicio')) || data;
  db.prepare('UPDATE festas SET data = ?, data_noite = ? WHERE id = ?').run(data, noite, festaId);
}

// ---------------------------------------------------------------- vínculo

// Acha a festa do item ou cria uma. Devolve { festaId, nova, regra }.
// `lugares` (opcional) é o cadastro das casas, injetado nos testes.
function vincular(db, { fonte, idExterno, url, campos, agora, lugares }) {
  const v = db.prepare('SELECT festa_id FROM vinculos WHERE fonte = ? AND id_externo = ?').get(fonte, idExterno);
  if (v) {
    db.prepare('UPDATE vinculos SET visto_em = ?, url = COALESCE(?, url) WHERE fonte = ? AND id_externo = ?')
      .run(agora, url || null, fonte, idExterno);
    return { festaId: v.festa_id, nova: false, regra: null };
  }

  const { dataDaNoite } = require('./contrato');
  const K = require('./correlacao');
  const noite = dataDaNoite(campos.data, campos.inicio);
  let achada = null;
  if (noite) {
    const item = K.ladoDoItem(db, { fonte, idExterno, url, campos, lugares });
    const ids = db.prepare('SELECT id FROM festas WHERE data_noite = ? ORDER BY criada_em, rowid').all(noite).map((r) => r.id);
    for (const id of ids) {
      const r = K.conservador(item, K.ladoDaFesta(db, id, { lugares }));
      if (!r.une) continue;
      // O link vem antes do nome; no empate, o maior escore; depois a mais antiga.
      const peso = (r.regra === 'link' ? 1000 : 0) + r.escore.valor;
      if (!achada || peso > achada.peso) achada = { id, peso, ...r };
    }
  }
  const nova = !achada;
  let festaId;
  let regra = 'nova';
  let escore = null;
  let motivo = null;
  if (nova) {
    festaId = novoId(campos.nome, campos.data, `${fonte}:${idExterno}`);
    for (let n = 2; db.prepare('SELECT 1 FROM festas WHERE id = ?').get(festaId); n += 1) festaId = novoId(campos.nome, campos.data, `${fonte}:${idExterno}:${n}`);
    db.prepare('INSERT INTO festas (id, data, data_noite, criada_em) VALUES (?, ?, ?, ?)').run(festaId, campos.data || null, noite || campos.data || null, agora);
  } else {
    festaId = achada.id;
    regra = achada.regra;
    escore = achada.escore.valor;
    motivo = JSON.stringify(achada.escore.sinais);
  }
  db.prepare('INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em, regra, escore, motivo, versao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(fonte, idExterno, festaId, url || null, agora, regra, escore, motivo, K.VERSAO);
  return { festaId, nova, regra };
}

// `conferidoEm` é um instante só ou { padrao, <campo>: instante } quando cada
// campo foi conferido numa hora (a indicação manual lê páginas diferentes).
// Grava os campos de uma fonte. O que a fonte trouxe antes e não traz mais sai
// (a produtora apagou o lineup, por exemplo). conferido_em anda sempre;
// mudou_em só quando o valor muda.
function gravarValores(db, festaId, fonte, campos, conferidoEm) {
  const atuais = new Map(
    db.prepare('SELECT campo, valor FROM valores WHERE festa_id = ? AND fonte = ?').all(festaId, fonte).map((r) => [r.campo, r.valor]),
  );
  const ins = db.prepare(`INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (festa_id, campo, fonte) DO UPDATE SET
      mudou_em = CASE WHEN valores.valor = excluded.valor THEN valores.mudou_em ELSE excluded.mudou_em END,
      valor = excluded.valor,
      conferido_em = CASE WHEN excluded.conferido_em > valores.conferido_em THEN excluded.conferido_em ELSE valores.conferido_em END`);
  for (const [campo, valor] of Object.entries(campos)) {
    const quando = typeof conferidoEm === 'string' ? conferidoEm : (conferidoEm[campo] || conferidoEm.padrao);
    ins.run(festaId, campo, fonte, JSON.stringify(valor), quando, quando);
    atuais.delete(campo);
  }
  const del = db.prepare('DELETE FROM valores WHERE festa_id = ? AND campo = ? AND fonte = ?');
  for (const campo of atuais.keys()) del.run(festaId, campo, fonte);
  atualizarDatas(db, festaId);
}

module.exports = {
  vincular, gravarValores, atualizarDatas, jaccard, linkComparavel, idDeEvento, idDePlataforma, chavesDeEvento,
  palavrasDoNome, palavrasDe, semelhancaPalavras, casaVazia, casaQueECidade, semAcento, PALAVRAS_DE_FESTA,
};

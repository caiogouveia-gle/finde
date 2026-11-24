'use strict';
// Correlação com escore (KTD5 do plano de 24/11/2026, versão `vinculo/2`):
// a mesma festa vinda de vários sites vira uma só, com o motivo de cada
// junção; o incerto vai para `candidatos`; a imagem soma evidência e nunca une
// sozinha (D10). A festa absorvida deixa um apelido em `festas_alias`.
//
// Dois tempos (M25): o vínculo conservador na hora da coleta (agregar.js
// chama `conservador`) e a passada de escore no fim da execução (`passada`),
// que olha as festas tocadas e as da mesma noite (festas.data_noite).
//
// O escore entre dois "lados" (uma festa, ou o item que chega):
//   link de evento ou de compra igual, ou o mesmo idPlataforma      +4
//   pHash ≤ 8 +3; de 9 a 12 +1,5 (a peça de uma agenda pesa a metade)
//   mesmo lugar do cadastro +2; lugares conhecidos diferentes −2;
//     mesmo lugar e espaços diferentes (Porão, Sala B, Salão) −3
//   nome limpo: Jaccard ≥ 0,8 ou um contido no outro +3; ≥ 0,5 +1,5;
//     nenhuma palavra em comum −3
//   mesmo perfil do Instagram ou a mesma produtora (inclusive pela bio) +2
//   lineup com ≥ 2 nomes de cada lado: Jaccard ≥ 0,5 +2; nenhum em comum −1
// Vetos: inícios a 90 min ou mais; dois links próprios de evento diferentes
// da mesma fonte; dois links de evento diferentes da mesma plataforma;
// decisão manual `separa`; cidades diferentes. Une com ≥ 5 e um sinal que não
// seja imagem; 3 a 4,5 é `talvez`; abaixo, separa.

const { transacao } = require('./banco');
const { escolher } = require('./contrato');
const { normalizarItem, novoId } = require('./normalizar');
const agregar = require('./agregar');
const lugaresMod = require('./lugares');
const imagensMod = require('./imagens');

const VERSAO = 'vinculo/2';
const UNE = 5;
const TALVEZ = 3;
const SEP = '\u001f';

const chaveItem = (fonte, idExterno) => `${fonte}${SEP}${idExterno}`;
const postDe = (fonte, idExterno) => {
  if (fonte !== 'instagram') return null;
  const m = String(idExterno).match(/^ig:([^:]+):/);
  return m ? m[1] : null;
};
const ler = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// O @ de um perfil: "https://www.instagram.com/casa/" e "@Casa" -> "casa".
function perfilDe(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const m = t.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i) || t.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? m[1].toLowerCase() : null;
}

const nomeProdutora = (p) => {
  const n = p && typeof p === 'object' ? p.nome : p;
  const s = agregar.semAcento(n || '').replace(/[^a-z0-9]+/g, '');
  return s.length >= 3 ? s : null;
};

// A casa de um lado: { texto, chave, lugar, espaco }, ou null quando a casa é
// vazia, cidade ou endereço.
function casaDo(texto, lugarId, lugares) {
  if (agregar.casaVazia(texto)) return null;
  const c = lugaresMod.casaCanonica(texto, lugares);
  if (!c.chave) return null;
  return { texto, chave: c.chave, lugar: lugarId || c.id || null, espaco: c.espaco || null };
}

// As imagens de um item (pHash para o escore). Pela interface da lane de
// imagens e, se ela não der nada, direto das tabelas (KTD6).
function imagensDoItem(db, fonte, idExterno) {
  let lista = [];
  try {
    lista = imagensMod.imagensDoItem(db, fonte, idExterno) || [];
  } catch {
    lista = [];
  }
  if (!lista.length) {
    lista = db.prepare(`SELECT i.sha, i.phash, ii.papel FROM imagens_item ii JOIN imagens i ON i.sha = ii.sha
      WHERE ii.fonte = ? AND ii.id_externo = ? AND i.oculta = 0`).all(fonte, idExterno);
  }
  return lista.filter((x) => x && typeof x.phash === 'string' && x.phash);
}

// A mesma peça em mais de um item do mesmo post: é agenda (pesa a metade).
function ehAgenda(db, fonte, idExterno, sha) {
  const post = postDe(fonte, idExterno);
  if (!post) return false;
  const n = db.prepare("SELECT COUNT(*) AS n FROM imagens_item WHERE fonte = 'instagram' AND sha = ? AND id_externo LIKE ?").get(sha, `ig:${post}:%`).n;
  return n > 1;
}

// As decisões manuais de um conjunto de itens: { separaCom, uneCom } (chaves de item).
function decisoesDe(db, itens) {
  const separaCom = new Set();
  const uneCom = new Set();
  const q = db.prepare(`SELECT a_fonte, a_id, b_fonte, b_id, decisao FROM vinculos_decisoes
    WHERE (a_fonte = ? AND a_id = ?) OR (b_fonte = ? AND b_id = ?)`);
  for (const it of itens) {
    for (const d of q.all(it.fonte, it.idExterno, it.fonte, it.idExterno)) {
      const a = chaveItem(d.a_fonte, d.a_id);
      const outro = a === it.chave ? chaveItem(d.b_fonte, d.b_id) : a;
      (d.decisao === 'separa' ? separaCom : uneCom).add(outro);
    }
  }
  return { separaCom, uneCom };
}

// Os perfis que a bio liga a um conjunto de chaves de evento (links_bio).
function perfisDaBio(db, chaves) {
  const s = new Set();
  if (!chaves.length) return s;
  const alvo = new Set(chaves.map((c) => c.chave));
  for (const r of db.prepare('SELECT perfil, url FROM links_bio').all()) {
    const k = agregar.linkComparavel(r.url);
    const p = perfilDe(r.perfil);
    if (k && p && alvo.has(k)) s.add(p);
  }
  return s;
}

function itemDoBruto(fonte, idExterno, url, bruto) {
  const b = bruto || {};
  const proprias = agregar.chavesDeEvento({ linkCompra: b.linkCompra, linkEvento: b.linkEvento, url, idPlataforma: b.idPlataforma }).filter((c) => c.forte);
  return { chave: chaveItem(fonte, idExterno), fonte, idExterno, post: postDe(fonte, idExterno), proprias };
}

const vazio = () => ({
  id: null, ordem: '', nomes: [], casas: [], lugares: new Set(), inicio: null, cidade: null, chaves: [], perfis: new Set(), produtoras: new Set(),
  lineup: new Set(), itens: [], imagens: [], separaCom: new Set(), uneCom: new Set(),
});

// O item que chega, antes de ter festa (o tempo 1).
function ladoDoItem(db, { fonte, idExterno, url, campos, lugares }) {
  const c = campos || {};
  const l = vazio();
  l.ordem = chaveItem(fonte, idExterno);
  if (c.nome) l.nomes.push(c.nome);
  const end = c.endereco || {};
  const casa = casaDo(c.casa, end.lugar, lugares);
  if (casa) l.casas.push(casa);
  if (end.lugar) l.lugares.add(end.lugar);
  if (casa && casa.lugar) l.lugares.add(casa.lugar);
  l.inicio = c.inicio || null;
  l.cidade = typeof end.cidade === 'string' ? end.cidade : null;
  l.chaves = agregar.chavesDeEvento({ linkCompra: c.linkCompra, linkEvento: c.linkEvento, url, idPlataforma: c.idPlataforma });
  for (const p of [perfilDe(c.instagram), perfilDe(c.produtora && c.produtora.instagram)]) if (p) l.perfis.add(p);
  for (const p of perfisDaBio(db, l.chaves)) l.perfis.add(p);
  const prod = nomeProdutora(c.produtora);
  if (prod) l.produtoras.add(prod);
  for (const n of c.lineup || []) l.lineup.add(agregar.semAcento(n).replace(/[^a-z0-9]+/g, ' ').trim());
  const bruto = db.prepare('SELECT bruto FROM itens_brutos WHERE fonte = ? AND id_externo = ?').get(fonte, idExterno);
  const it = itemDoBruto(fonte, idExterno, url, bruto ? ler(bruto.bruto) : c);
  // O item ainda não gravado (ou gravado sem o link limpo): vale o que os campos dizem.
  if (!it.proprias.length) it.proprias = agregar.chavesDeEvento({ linkCompra: c.linkCompra, linkEvento: c.linkEvento, url, idPlataforma: c.idPlataforma }).filter((k) => k.forte);
  l.itens.push(it);
  const d = decisoesDe(db, l.itens);
  l.separaCom = d.separaCom;
  l.uneCom = d.uneCom;
  for (const im of imagensDoItem(db, fonte, idExterno)) l.imagens.push({ sha: im.sha, phash: im.phash, agenda: ehAgenda(db, fonte, idExterno, im.sha), item: it.chave });
  return l;
}

// Uma festa do banco, com o que todas as fontes disseram e os itens dela.
function ladoDaFesta(db, festaId, { lugares } = {}) {
  const l = vazio();
  l.id = festaId;
  const linhas = db.prepare('SELECT campo, fonte, valor, conferido_em FROM valores WHERE festa_id = ?').all(festaId);
  const escolhidos = escolher(linhas.filter((x) => x.campo === 'inicio'));
  const ini = escolhidos.get('inicio');
  l.inicio = ini ? ler(ini.valor) : null;
  const cidades = [];
  const vistas = new Set();
  for (const x of linhas) {
    const v = ler(x.valor);
    if (v === null || v === undefined) continue;
    if (x.campo === 'nome' && typeof v === 'string') l.nomes.push(v);
    else if (x.campo === 'endereco' && typeof v === 'object') {
      if (typeof v.cidade === 'string' && v.cidade) cidades.push({ fonte: x.fonte, cidade: v.cidade, conferido_em: x.conferido_em });
      if (typeof v.lugar === 'string' && v.lugar) l.lugares.add(v.lugar);
    } else if (x.campo === 'linkCompra' || x.campo === 'linkEvento') {
      for (const k of agregar.chavesDeEvento({ url: v })) if (!vistas.has(k.chave)) {
        vistas.add(k.chave);
        l.chaves.push(k);
      }
    } else if (x.campo === 'idPlataforma') {
      const k = agregar.idDePlataforma(v);
      if (k && !vistas.has(k.chave)) {
        vistas.add(k.chave);
        l.chaves.push(k);
      }
    } else if (x.campo === 'instagram') {
      const p = perfilDe(v);
      if (p) l.perfis.add(p);
    } else if (x.campo === 'produtora') {
      const p = perfilDe(v.instagram);
      if (p) l.perfis.add(p);
      const n = nomeProdutora(v);
      if (n) l.produtoras.add(n);
    } else if (x.campo === 'lineup' && Array.isArray(v)) {
      for (const n of v) l.lineup.add(agregar.semAcento(n).replace(/[^a-z0-9]+/g, ' ').trim());
    }
  }
  const lugarUnico = l.lugares.size === 1 ? [...l.lugares][0] : null;
  for (const x of linhas) {
    if (x.campo !== 'casa') continue;
    const c = casaDo(ler(x.valor), lugarUnico, lugares);
    if (c && !l.casas.some((y) => y.chave === c.chave && y.espaco === c.espaco)) l.casas.push(c);
    if (c && c.lugar) l.lugares.add(c.lugar);
  }
  if (cidades.length) {
    const { PRIORIDADE } = require('./catalogo');
    cidades.sort((a, b) => (PRIORIDADE[b.fonte] || 0) - (PRIORIDADE[a.fonte] || 0) || b.conferido_em.localeCompare(a.conferido_em));
    l.cidade = cidades[0].cidade;
  }
  const qBruto = db.prepare('SELECT bruto FROM itens_brutos WHERE fonte = ? AND id_externo = ?');
  const vinculos = db.prepare('SELECT fonte, id_externo, url FROM vinculos WHERE festa_id = ? ORDER BY rowid').all(festaId);
  for (const v of vinculos) {
    const b = qBruto.get(v.fonte, v.id_externo);
    const it = itemDoBruto(v.fonte, v.id_externo, v.url, b ? ler(b.bruto) : null);
    l.itens.push(it);
    for (const k of agregar.chavesDeEvento({ url: v.url })) if (!vistas.has(k.chave)) {
      vistas.add(k.chave);
      l.chaves.push(k);
    }
    for (const im of imagensDoItem(db, v.fonte, v.id_externo)) {
      if (!l.imagens.some((y) => y.sha === im.sha)) l.imagens.push({ sha: im.sha, phash: im.phash, agenda: ehAgenda(db, v.fonte, v.id_externo, im.sha), item: it.chave });
    }
  }
  l.ordem = l.itens.map((i) => i.chave).sort()[0] || festaId;
  for (const p of perfisDaBio(db, l.chaves)) l.perfis.add(p);
  const d = decisoesDe(db, l.itens);
  l.separaCom = d.separaCom;
  l.uneCom = d.uneCom;
  return l;
}

// ---------------------------------------------------------------- escore

const diaMin = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t / 60e3;
};

const cidadeChave = (c) => agregar.semAcento(c).replace(/[^a-z]+/g, ' ').replace(/\b(sp|rj|mg)\b/g, '').trim();

// O primeiro veto que vale entre dois lados, ou null.
function vetoEntre(a, b) {
  const ia = new Set(a.itens.map((i) => i.chave));
  const ib = new Set(b.itens.map((i) => i.chave));
  for (const k of a.separaCom) if (ib.has(k)) return 'decisão manual: separa';
  for (const k of b.separaCom) if (ia.has(k)) return 'decisão manual: separa';
  for (const x of a.itens) {
    for (const y of b.itens) {
      if (x.fonte !== y.fonte || !x.proprias.length || !y.proprias.length) continue;
      if (x.post && x.post === y.post) continue; // itens do mesmo post nunca se vetam
      const kx = new Set(x.proprias.map((k) => k.chave));
      if (!y.proprias.some((k) => kx.has(k.chave))) {
        return `dois links próprios diferentes da mesma fonte (${x.fonte}: ${x.proprias[0].chave} e ${y.proprias[0].chave})`;
      }
    }
  }
  const fortesA = a.chaves.filter((k) => k.forte);
  const fortesB = b.chaves.filter((k) => k.forte);
  for (const forma of new Set(fortesA.map((k) => k.forma))) {
    const ka = new Set(fortesA.filter((k) => k.forma === forma).map((k) => k.chave));
    const kb = fortesB.filter((k) => k.forma === forma);
    if (kb.length && !kb.some((k) => ka.has(k.chave))) return `dois links de evento diferentes na mesma plataforma (${[...ka][0]} e ${kb[0].chave})`;
  }
  const ma = a.inicio ? diaMin(a.inicio) : null;
  const mb = b.inicio ? diaMin(b.inicio) : null;
  if (ma !== null && mb !== null && Math.abs(ma - mb) >= 90) return `inícios a ${Math.round(Math.abs(ma - mb))} min`;
  if (a.cidade && b.cidade && cidadeChave(a.cidade) !== cidadeChave(b.cidade)) return `cidades diferentes (${a.cidade} e ${b.cidade})`;
  return null;
}

function sinalDeNome(a, b) {
  if (!a.nomes.length || !b.nomes.length) return null;
  const remover = agregar.palavrasDe(...a.casas.map((c) => c.texto), ...b.casas.map((c) => c.texto), a.cidade, b.cidade);
  let melhor = null;
  for (const na of a.nomes) {
    for (const nb of b.nomes) {
      const r = agregar.semelhancaPalavras(agregar.palavrasDoNome(na, remover), agregar.palavrasDoNome(nb, remover));
      if (r.j === null) continue;
      const nota = r.contido ? 1 : r.j;
      if (!melhor || nota > melhor.nota) melhor = { ...r, nota, na, nb };
    }
  }
  if (!melhor) return null;
  if (melhor.j >= 0.8 || melhor.contido) return { sinal: 'nome', peso: 3, detalhe: melhor.j === 1 ? 'mesmo nome sem datas' : 'nome parecido sem datas' };
  if (melhor.j >= 0.5) return { sinal: 'nome', peso: 1.5, detalhe: 'nome em parte igual' };
  if (melhor.comum === 0) return { sinal: 'nome', peso: -3, detalhe: 'nenhuma palavra do nome em comum' };
  return null;
}

function sinalDeLugar(a, b) {
  const espacosDiferentes = (ca, cb) => {
    const ea = new Set(ca.map((c) => c.espaco).filter(Boolean));
    const eb = new Set(cb.map((c) => c.espaco).filter(Boolean));
    return ea.size && eb.size && ![...ea].some((e) => eb.has(e));
  };
  if (a.lugares.size && b.lugares.size) {
    const comum = [...a.lugares].find((x) => b.lugares.has(x));
    if (!comum) return { sinal: 'lugar', peso: -2, detalhe: `lugares diferentes do cadastro (${[...a.lugares][0]} e ${[...b.lugares][0]})` };
    if (espacosDiferentes(a.casas, b.casas)) return { sinal: 'lugar', peso: -3, detalhe: `mesmo lugar (${comum}), espaços diferentes` };
    return { sinal: 'lugar', peso: 2, detalhe: `mesmo lugar do cadastro (${comum})` };
  }
  if (a.casas.length && b.casas.length) {
    const comum = a.casas.find((x) => b.casas.some((y) => y.chave === x.chave));
    if (!comum) return null;
    const ca = a.casas.filter((x) => x.chave === comum.chave);
    const cb = b.casas.filter((y) => y.chave === comum.chave);
    if (espacosDiferentes(ca, cb)) return { sinal: 'lugar', peso: -3, detalhe: `mesma casa (${comum.texto}), espaços diferentes` };
    return { sinal: 'lugar', peso: 2, detalhe: `mesma casa (${comum.texto})` };
  }
  return null;
}

function jaccardSets(A, B) {
  let comum = 0;
  for (const x of A) if (B.has(x)) comum += 1;
  return { comum, j: A.size + B.size - comum ? comum / (A.size + B.size - comum) : 0 };
}

// escore(a, b, opcoes) -> { valor, decisao: 'une'|'talvez'|'separa', sinais: [{ sinal, peso, detalhe }], veto }
// a, b: lados (ladoDaFesta, ladoDoItem); campos ausentes valem vazio.
// opcoes: { une = 5, talvez = 3 } (limiares de config/fontes.json, correlacao).
function escore(a, b, opcoes = {}) {
  const A = { ...vazio(), ...(a || {}) };
  const B = { ...vazio(), ...(b || {}) };
  const une = Number.isFinite(Number(opcoes.une)) ? Number(opcoes.une) : UNE;
  const talvez = Number.isFinite(Number(opcoes.talvez)) ? Number(opcoes.talvez) : TALVEZ;
  const sinais = [];
  const ka = new Set(A.chaves.map((k) => k.chave));
  const link = B.chaves.find((k) => ka.has(k.chave));
  if (link) sinais.push({ sinal: 'link', peso: 4, detalhe: /^[a-z-]+:/.test(link.chave) ? `mesmo evento na plataforma (${link.chave})` : 'mesmo link de compra' });
  let melhorImagem = null;
  for (const x of A.imagens) {
    for (const y of B.imagens) {
      const d = imagensMod.distancia(x.phash, y.phash);
      if (d === null || d > 12) continue;
      const peso = (d <= 8 ? 3 : 1.5) / (x.agenda || y.agenda ? 2 : 1);
      if (!melhorImagem || peso > melhorImagem.peso) melhorImagem = { sinal: 'imagem', peso, detalhe: `pHash a ${d}${x.agenda || y.agenda ? ' (peça de agenda)' : ''}` };
    }
  }
  if (melhorImagem) sinais.push(melhorImagem);
  const lugar = sinalDeLugar(A, B);
  if (lugar) sinais.push(lugar);
  const nome = sinalDeNome(A, B);
  if (nome) sinais.push(nome);
  const perfil = [...A.perfis].find((p) => B.perfis.has(p));
  const produtora = [...A.produtoras].find((p) => B.produtoras.has(p));
  if (perfil || produtora) sinais.push({ sinal: 'perfil', peso: 2, detalhe: perfil ? `mesmo perfil (@${perfil})` : 'mesma produtora' });
  if (A.lineup.size >= 2 && B.lineup.size >= 2) {
    const r = jaccardSets(A.lineup, B.lineup);
    if (r.j >= 0.5) sinais.push({ sinal: 'lineup', peso: 2, detalhe: `lineup em comum (${r.comum})` });
    else if (r.comum === 0) sinais.push({ sinal: 'lineup', peso: -1, detalhe: 'nenhum nome do lineup em comum' });
  }
  const valor = Math.round(sinais.reduce((s, x) => s + x.peso, 0) * 10) / 10;
  const veto = vetoEntre(A, B);
  let decisao = 'separa';
  if (!veto) {
    const temOutro = sinais.some((s) => s.sinal !== 'imagem' && s.peso > 0);
    if (valor >= une && temOutro) decisao = 'une';
    else if (valor >= talvez) decisao = 'talvez';
  }
  return { valor, decisao, sinais, veto };
}

// O vínculo conservador do tempo 1 (U5): o item une a uma festa só quando é
// claramente a mesma. -> { une, regra: 'link'|'escore', escore }
function conservador(item, festa) {
  const e = escore(item, festa);
  if (e.veto) return { une: false, regra: null, escore: e };
  const nome = e.sinais.find((s) => s.sinal === 'nome');
  const semNomeDeOutra = !nome || nome.peso > 0;
  if (e.sinais.some((s) => s.sinal === 'link') && semNomeDeOutra) return { une: true, regra: 'link', escore: e };
  const parecido = nome && nome.peso >= 1.5;
  if (!parecido) return { une: false, regra: null, escore: e };
  if (item.casas.length && festa.casas.length) {
    const lugar = e.sinais.find((s) => s.sinal === 'lugar');
    return { une: Boolean(lugar && lugar.peso > 0), regra: 'escore', escore: e };
  }
  // Casa vazia de um lado: nome parecido e a mesma produtora ou o mesmo perfil.
  const perfil = e.sinais.some((s) => s.sinal === 'perfil');
  return { une: perfil, regra: 'escore', escore: e };
}

// ---------------------------------------------------------------- mexer no banco

// O id atual de uma festa, seguindo a cadeia de apelidos (festas_alias).
// Id que não é apelido volta como veio.
function resolverId(db, id) {
  if (typeof id !== 'string' || !id) return id;
  const q = db.prepare('SELECT novo FROM festas_alias WHERE antigo = ?');
  const vistos = new Set([id]);
  let atual = id;
  for (;;) {
    const r = q.get(atual);
    if (!r || vistos.has(r.novo)) return atual;
    vistos.add(r.novo);
    atual = r.novo;
  }
}

// Das duas, a mais antiga (criada antes; no empate, a inserida antes).
function maisAntiga(db, a, b) {
  const q = db.prepare('SELECT criada_em, rowid AS r FROM festas WHERE id = ?');
  const fa = q.get(a);
  const fb = q.get(b);
  if (!fa) return [b, a];
  if (!fb) return [a, b];
  const aAntes = fa.criada_em < fb.criada_em || (fa.criada_em === fb.criada_em && fa.r <= fb.r);
  return aAntes ? [a, b] : [b, a];
}

// Junta as páginas lidas de duas fontes, sem repetir a URL.
function juntarPaginas(x, y) {
  const saida = [...(Array.isArray(x) ? x : [])];
  for (const p of Array.isArray(y) ? y : []) if (!saida.some((q) => q && p && q.url === p.url && q.tipo === p.tipo)) saida.push(p);
  return saida;
}

// Leva os valores de `de` para `para`: o que `para` não tem entra; o que os
// dois têm fica com o conferido por último (as páginas se somam).
function levarValores(db, de, para, { fontes = null } = {}) {
  const linhas = db.prepare('SELECT campo, fonte, valor, conferido_em, mudou_em FROM valores WHERE festa_id = ?').all(de)
    .filter((l) => !fontes || fontes.has(l.fonte));
  const qAtual = db.prepare('SELECT valor, conferido_em FROM valores WHERE festa_id = ? AND campo = ? AND fonte = ?');
  const ins = db.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
  const upd = db.prepare('UPDATE valores SET valor = ?, conferido_em = ?, mudou_em = ? WHERE festa_id = ? AND campo = ? AND fonte = ?');
  for (const l of linhas) {
    const atual = qAtual.get(para, l.campo, l.fonte);
    if (!atual) ins.run(para, l.campo, l.fonte, l.valor, l.conferido_em, l.mudou_em);
    else if (l.campo === 'paginas') {
      const junto = JSON.stringify(juntarPaginas(ler(atual.valor), ler(l.valor)));
      upd.run(junto, l.conferido_em > atual.conferido_em ? l.conferido_em : atual.conferido_em, l.mudou_em, para, l.campo, l.fonte);
    } else if (l.conferido_em > atual.conferido_em) upd.run(l.valor, l.conferido_em, l.mudou_em, para, l.campo, l.fonte);
  }
}

// Une duas festas: a mais antiga fica, a outra vira apelido dela. Os vínculos
// movidos gravam regra, escore e motivo. Devolve { para, de }.
function unir(db, a, b, { agora = () => new Date(), escore: e = null, regra = 'escore' } = {}) {
  const [para, de] = maisAntiga(db, a, b);
  const quando = agora().toISOString();
  db.prepare('UPDATE vinculos SET festa_id = ?, regra = ?, escore = ?, motivo = ?, versao = ? WHERE festa_id = ?')
    .run(para, regra, e ? e.valor : null, JSON.stringify(e ? e.sinais : []), VERSAO, de);
  levarValores(db, de, para);
  db.prepare('DELETE FROM valores WHERE festa_id = ?').run(de);
  db.prepare('UPDATE festas_alias SET novo = ? WHERE novo = ?').run(para, de);
  db.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?) ON CONFLICT (antigo) DO UPDATE SET novo = excluded.novo, quando = excluded.quando')
    .run(de, para, quando);
  db.prepare('DELETE FROM festas_alias WHERE antigo = novo').run();
  db.prepare('DELETE FROM candidatos WHERE festa_id = ?').run(de);
  db.prepare('DELETE FROM candidatos WHERE festa_id = ? AND (fonte, id_externo) IN (SELECT fonte, id_externo FROM vinculos WHERE festa_id = ?)').run(para, para);
  db.prepare('DELETE FROM festas WHERE id = ?').run(de);
  agregar.atualizarDatas(db, para);
  return { para, de };
}

// Refaz os valores de uma fonte numa festa a partir dos itens dela (o bruto),
// somados em ordem de coleta, como numa execução.
function recomporFonte(db, festaId, fonte) {
  const itens = db.prepare(`SELECT i.bruto, i.coletado_em FROM vinculos v JOIN itens_brutos i ON i.fonte = v.fonte AND i.id_externo = v.id_externo
    WHERE v.festa_id = ? AND v.fonte = ? ORDER BY i.coletado_em, i.id_externo`).all(festaId, fonte);
  if (!itens.length) {
    db.prepare('DELETE FROM valores WHERE festa_id = ? AND fonte = ?').run(festaId, fonte);
    return;
  }
  let juntos = {};
  const quando = {};
  for (const it of itens) {
    const { campos } = normalizarItem(ler(it.bruto) || {}, fonte);
    const paginas = juntos.paginas && campos.paginas ? juntarPaginas(campos.paginas, juntos.paginas) : null;
    juntos = { ...juntos, ...campos };
    if (paginas) juntos.paginas = paginas;
    for (const k of Object.keys(campos)) quando[k] = it.coletado_em;
  }
  agregar.gravarValores(db, festaId, fonte, juntos, { padrao: itens[itens.length - 1].coletado_em, ...quando });
}

// Marca uma festa para olho humano (o contrato põe em `revisar`).
function marcarRevisar(db, festaId, motivo, detalhe, quando) {
  const atual = db.prepare("SELECT valor FROM valores WHERE festa_id = ? AND campo = 'revisar' AND fonte = 'reprocessar'").get(festaId);
  const lista = (atual && ler(atual.valor)) || [];
  if (!lista.some((x) => x.motivo === motivo && x.detalhe === detalhe)) lista.push({ motivo, detalhe });
  db.prepare(`INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, 'revisar', 'reprocessar', ?, ?, ?)
    ON CONFLICT (festa_id, campo, fonte) DO UPDATE SET valor = excluded.valor, conferido_em = excluded.conferido_em`)
    .run(festaId, JSON.stringify(lista), quando, quando);
}

// As fontes que a festa tem sem item (claude, regras, nominatim, curadoria...).
function fontesDerivadas(db, festaId) {
  const comItem = new Set(db.prepare('SELECT DISTINCT fonte FROM vinculos WHERE festa_id = ?').all(festaId).map((r) => r.fonte));
  return new Set(db.prepare('SELECT DISTINCT fonte FROM valores WHERE festa_id = ?').all(festaId).map((r) => r.fonte).filter((f) => !comItem.has(f)));
}

// Tira um item da festa e o põe numa festa nova (decisão `separa`). O que o
// modelo e as regras leram vai para as duas partes, marcadas para revisão.
function separarItem(db, festaId, fonte, idExterno, { agora = () => new Date(), motivo = 'decisão manual: separa', regra = 'manual' } = {}) {
  const quando = agora().toISOString();
  const derivadas = fontesDerivadas(db, festaId);
  const b = db.prepare('SELECT bruto FROM itens_brutos WHERE fonte = ? AND id_externo = ?').get(fonte, idExterno);
  const { campos } = normalizarItem((b && ler(b.bruto)) || {}, fonte);
  let novo = novoId(campos.nome, campos.data, `${fonte}:${idExterno}`);
  for (let n = 2; db.prepare('SELECT 1 FROM festas WHERE id = ? UNION SELECT 1 FROM festas_alias WHERE antigo = ?').get(novo, novo); n += 1) {
    novo = novoId(campos.nome, campos.data, `${fonte}:${idExterno}:${n}`);
  }
  db.prepare('INSERT INTO festas (id, data, data_noite, criada_em) VALUES (?, ?, ?, ?)').run(novo, campos.data || null, campos.data || null, quando);
  db.prepare('UPDATE vinculos SET festa_id = ?, regra = ?, escore = NULL, motivo = ?, versao = ? WHERE fonte = ? AND id_externo = ?')
    .run(novo, regra, JSON.stringify([{ sinal: 'separa', peso: 0, detalhe: motivo }]), VERSAO, fonte, idExterno);
  recomporFonte(db, festaId, fonte);
  recomporFonte(db, novo, fonte);
  if (derivadas.size) levarValores(db, festaId, novo, { fontes: derivadas });
  if (derivadas.size) {
    marcarRevisar(db, festaId, 'separada', `${fonte}:${idExterno} saiu desta festa (${motivo}); a leitura do modelo ficou nas duas`, quando);
    marcarRevisar(db, novo, 'separada', `veio de ${festaId} (${motivo}); a leitura do modelo ficou nas duas`, quando);
  }
  db.prepare('DELETE FROM candidatos WHERE fonte = ? AND id_externo = ?').run(fonte, idExterno);
  agregar.atualizarDatas(db, festaId);
  agregar.atualizarDatas(db, novo);
  return novo;
}

// Festa com dois itens que uma decisão manual separa: o item mais novo sai.
function separarPorDecisao(db, festaId, { agora } = {}) {
  const novas = [];
  for (;;) {
    const itens = db.prepare('SELECT fonte, id_externo FROM vinculos WHERE festa_id = ? ORDER BY rowid').all(festaId);
    const chaves = new Map(itens.map((i) => [chaveItem(i.fonte, i.id_externo), i]));
    let sai = null;
    for (const d of db.prepare("SELECT a_fonte, a_id, b_fonte, b_id FROM vinculos_decisoes WHERE decisao = 'separa'").all()) {
      const a = chaves.get(chaveItem(d.a_fonte, d.a_id));
      const b = chaves.get(chaveItem(d.b_fonte, d.b_id));
      if (a && b) {
        sai = itens.indexOf(a) > itens.indexOf(b) ? a : b;
        break;
      }
    }
    if (!sai) return novas;
    novas.push(separarItem(db, festaId, sai.fonte, sai.id_externo, { agora }));
  }
}

// ---------------------------------------------------------------- a passada

// passada(db, { festasTocadas, agora, log, config }) -> { unidas, candidatos, separadas, unioes }
// O tempo 3 da execução (KTD4): recalcula a partição das festas tocadas e das
// do mesmo data_noite. Une por escore (ou por decisão `une`), grava regra,
// escore, motivo e versao em vinculos e põe os talvez em `candidatos`.
// config: o bloco `correlacao` de config/fontes.json ({ une, talvez }) e,
// nos testes, `lugares` (o cadastro das casas).
function passada(db, { festasTocadas = [], agora = () => new Date(), log = console, config = {} } = {}) {
  void log;
  const opcoes = { une: config.une ?? UNE, talvez: config.talvez ?? TALVEZ };
  const lugares = Array.isArray(config.lugares) ? config.lugares : undefined;
  const quando = agora().toISOString();
  const r = { unidas: 0, candidatos: 0, separadas: 0, unioes: [] };
  const existe = db.prepare('SELECT data_noite FROM festas WHERE id = ?');
  const tocadas = new Set(festasTocadas.map((id) => resolverId(db, id)).filter((id) => existe.get(id)));
  if (!tocadas.size) return r;

  transacao(db, () => {
    for (const id of [...tocadas]) {
      for (const novo of separarPorDecisao(db, id, { agora })) {
        tocadas.add(novo);
        r.separadas += 1;
      }
    }
    const noites = new Set([...tocadas].map((id) => (existe.get(id) || {}).data_noite).filter(Boolean));
    for (const noite of [...noites].sort()) {
      let ids = db.prepare('SELECT id FROM festas WHERE data_noite = ? ORDER BY criada_em, rowid').all(noite).map((x) => x.id);
      const cache = new Map();
      const lado = (id) => {
        if (!cache.has(id)) cache.set(id, ladoDaFesta(db, id, { lugares }));
        return cache.get(id);
      };
      const pares = () => {
        const saida = [];
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            if (!tocadas.has(ids[i]) && !tocadas.has(ids[j])) continue;
            const a = lado(ids[i]);
            const b = lado(ids[j]);
            let e = escore(a, b, opcoes);
            let regra = 'escore';
            const manual = [...a.uneCom].some((k) => b.itens.some((it) => it.chave === k)) || [...b.uneCom].some((k) => a.itens.some((it) => it.chave === k));
            if (manual && !(e.veto || '').startsWith('decisão manual')) {
              e = { ...e, decisao: 'une', veto: null, sinais: [...e.sinais, { sinal: 'manual', peso: 0, detalhe: 'decisão manual: une' }] };
              regra = 'manual';
            }
            const ordem = [a.ordem, b.ordem].sort().join('|');
            saida.push({ a: ids[i], b: ids[j], e, regra, ordem });
          }
        }
        return saida;
      };
      for (;;) {
        const unir1 = pares().filter((p) => p.e.decisao === 'une')
          .sort((x, y) => (y.regra === 'manual') - (x.regra === 'manual') || y.e.valor - x.e.valor || x.ordem.localeCompare(y.ordem))[0];
        if (!unir1) break;
        const { para, de } = unir(db, unir1.a, unir1.b, { agora, escore: unir1.e, regra: unir1.regra });
        cache.delete(para);
        cache.delete(de);
        ids = ids.filter((x) => x !== de);
        tocadas.delete(de);
        tocadas.add(para);
        r.unidas += 1;
        r.unioes.push({ para, de, escore: unir1.e.valor, sinais: unir1.e.sinais, regra: unir1.regra });
      }
      // Os talvez desta noite vão para candidatos, recalculados do zero.
      const lista = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM candidatos WHERE festa_id IN (${lista})
        OR (fonte, id_externo) IN (SELECT fonte, id_externo FROM vinculos WHERE festa_id IN (${lista}))`).run(...ids, ...ids);
      const ins = db.prepare(`INSERT INTO candidatos (fonte, id_externo, festa_id, escore, motivo, visto_em) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (fonte, id_externo, festa_id) DO UPDATE SET escore = excluded.escore, motivo = excluded.motivo, visto_em = excluded.visto_em`);
      for (const p of pares()) {
        if (p.e.decisao !== 'talvez') continue;
        const [velha, nova] = maisAntiga(db, p.a, p.b);
        for (const it of lado(nova).itens) ins.run(it.fonte, it.idExterno, velha, p.e.valor, JSON.stringify(p.e.sinais), quando);
        r.candidatos += 1;
      }
    }
  });
  return r;
}

module.exports = {
  escore, passada, resolverId, VERSAO,
  conservador, ladoDaFesta, ladoDoItem, vetoEntre, unir, separarItem, recomporFonte, marcarRevisar, fontesDerivadas, levarValores, maisAntiga,
};

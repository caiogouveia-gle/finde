'use strict';
// Junta itens de fontes diferentes numa festa só (KTD3) e grava o que cada
// fonte disse de cada campo (KTD2).

const { novoId, slug } = require('./normalizar');
const { semAcento } = require('./bairros');

const { PRIORIDADE } = require('./catalogo');

// Link de evento normalizado para comparar: sem www, sem query nem fragmento,
// sem barra final e sem o prefixo de idioma do Shotgun (/pt-br/).
function linkComparavel(u) {
  try {
    const p = new URL(u);
    const host = p.hostname.replace(/^www\./, '');
    const caminho = p.pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/events\/)/i, '').replace(/\/+$/, '');
    return `${host}${caminho}`.toLowerCase();
  } catch {
    return null;
  }
}

const palavras = (t) => new Set(slug(t).split('-').filter((p) => p.length > 1));
function jaccard(a, b) {
  const A = palavras(a);
  const B = palavras(b);
  if (!A.size || !B.size) return 0;
  let comum = 0;
  for (const p of A) if (B.has(p)) comum += 1;
  return comum / (A.size + B.size - comum);
}
const mesmaCasa = (a, b) => semAcento(a).replace(/[^a-z0-9]/g, '') === semAcento(b).replace(/[^a-z0-9]/g, '');

// Acha a festa do item ou cria uma. Devolve { festaId, nova }.
function vincular(db, { fonte, idExterno, url, campos, agora }) {
  const v = db.prepare('SELECT festa_id FROM vinculos WHERE fonte = ? AND id_externo = ?').get(fonte, idExterno);
  if (v) {
    db.prepare('UPDATE vinculos SET visto_em = ?, url = COALESCE(?, url) WHERE fonte = ? AND id_externo = ?')
      .run(agora, url || null, fonte, idExterno);
    return { festaId: v.festa_id, nova: false };
  }

  let festaId = null;
  // O mesmo link de compra ou de evento no mesmo dia é a mesma festa, mesmo com
  // nome e casa escritos de outro jeito (o flyer e a página do ingresso).
  // Só link de um evento (não a página da agenda: ver paginas.js) e só se a
  // festa achada não tiver outro item desta mesma fonte (duas festas da mesma
  // agenda não viram uma), e se o nome não for de outra festa.
  const links = [campos.linkCompra, campos.linkEvento].filter(Boolean).map(linkComparavel).filter(Boolean);
  if (campos.data && links.length) {
    const comLink = db.prepare(`SELECT DISTINCT v.festa_id AS id, v.valor FROM valores v JOIN festas f ON f.id = v.festa_id
      WHERE f.data = ? AND v.campo IN ('linkCompra', 'linkEvento')`).all(campos.data);
    const qOutro = db.prepare('SELECT 1 FROM vinculos WHERE festa_id = ? AND fonte = ? AND id_externo <> ? LIMIT 1');
    const qNome = db.prepare("SELECT valor FROM valores WHERE festa_id = ? AND campo = 'nome' LIMIT 1");
    const achada = comLink.find((r) => {
      if (!links.includes(linkComparavel(String(JSON.parse(r.valor))))) return false;
      if (qOutro.get(r.id, fonte, idExterno)) return false;
      const nome = qNome.get(r.id);
      return !nome || !campos.nome || jaccard(JSON.parse(nome.valor), campos.nome) > 0;
    });
    if (achada) festaId = achada.id;
  }
  if (!festaId && campos.data && campos.nome) {
    const candidatas = db.prepare('SELECT id FROM festas WHERE data = ?').all(campos.data);
    const qCampo = db.prepare('SELECT valor FROM valores WHERE festa_id = ? AND campo = ? LIMIT 1');
    for (const c of candidatas) {
      const nome = qCampo.get(c.id, 'nome');
      if (!nome) continue;
      const casa = qCampo.get(c.id, 'casa');
      const j = jaccard(JSON.parse(nome.valor), campos.nome);
      const ok = casa && campos.casa ? j >= 0.5 && mesmaCasa(JSON.parse(casa.valor), campos.casa) : j >= 0.8;
      if (ok) {
        festaId = c.id;
        break;
      }
    }
  }
  const nova = !festaId;
  if (nova) {
    festaId = novoId(campos.nome, campos.data, `${fonte}:${idExterno}`);
    db.prepare('INSERT INTO festas (id, data, criada_em) VALUES (?, ?, ?)').run(festaId, campos.data || null, agora);
  }
  db.prepare('INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em) VALUES (?, ?, ?, ?, ?)')
    .run(fonte, idExterno, festaId, url || null, agora);
  return { festaId, nova };
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
  // A data da festa é a da fonte que vale (prioridade, depois a mais recente):
  // festa que mudou de data na página do ingresso muda aqui também.
  const datas = db.prepare("SELECT fonte, valor, conferido_em FROM valores WHERE festa_id = ? AND campo = 'data'").all(festaId);
  if (datas.length) {
    datas.sort((a, b) => (PRIORIDADE[b.fonte] || 0) - (PRIORIDADE[a.fonte] || 0) || b.conferido_em.localeCompare(a.conferido_em));
    db.prepare('UPDATE festas SET data = ? WHERE id = ?').run(JSON.parse(datas[0].valor), festaId);
  }
}

module.exports = { vincular, gravarValores, jaccard, linkComparavel };

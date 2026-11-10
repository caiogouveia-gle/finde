'use strict';
// Uma execução do motor, de ponta a ponta: trava, coleta de cada fonte ligada,
// normaliza, junta, classifica e grava, e fecha com um resumo (M10).

const crypto = require('node:crypto');
const { transacao } = require('./banco');
const { normalizarItem, horario } = require('./normalizar');
const { vincular, gravarValores } = require('./agregar');
const { criarClassificador } = require('./classificar');

const TRAVA_MIN = 30;

function travar(db, gatilho, agora) {
  return transacao(db, () => {
    const limite = new Date(agora.getTime() - TRAVA_MIN * 60e3).toISOString();
    db.prepare("UPDATE execucoes SET estado = 'erro', fim = ?, resumo = ? WHERE estado = 'rodando' AND inicio < ?")
      .run(agora.toISOString(), JSON.stringify({ erro: `abandonada (mais de ${TRAVA_MIN} min rodando)` }), limite);
    const rodando = db.prepare("SELECT id FROM execucoes WHERE estado = 'rodando'").get();
    if (rodando) return null;
    return Number(db.prepare("INSERT INTO execucoes (inicio, estado, gatilho) VALUES (?, 'rodando', ?)")
      .run(agora.toISOString(), gatilho).lastInsertRowid);
  });
}

// Precisa do modelo? Só se o texto existe e falta algo que ele sabe dizer.
function precisaClassificar(item, campos) {
  if (!item.texto && !(item.categorias || []).length) return false; // só o nome não paga a chamada
  return !(campos.estilos && typeof campos.ehFesta === 'boolean' && campos.lineup && campos.idadeMinima !== undefined);
}

function camposDaClassificacao(r, campos) {
  const c = { ehFesta: r.ehFesta };
  if (r.estilos.length) c.estilos = r.estilos;
  if (r.idadeMinima) c.idadeMinima = r.idadeMinima;
  if (r.lineup.length) c.lineup = r.lineup;
  const regras = {};
  for (const k of ['documento', 'vestimenta', 'lista']) if (r[k]) regras[k] = r[k];
  if (Object.keys(regras).length) c.regras = regras;
  if (r.pistaCheia && campos.data && campos.inicio) {
    const [h, m] = campos.inicio.slice(11, 16).split(':').map(Number);
    const pc = horario(campos.data, r.pistaCheia, h * 60 + m - 1);
    if (pc) c.pistaCheia = pc;
  }
  return c;
}

async function executar({
  db,
  fontes,
  gatilho = 'comando',
  claude = null,
  classificadorOpcoes = {},
  fetch = globalThis.fetch,
  agora = () => new Date(),
  log = console,
  config = {},
}) {
  const inicio = agora();
  const execucaoId = travar(db, gatilho, inicio);
  if (!execucaoId) {
    log.warn('[motor] outra execução está rodando; esta não começa');
    return { recusada: true };
  }

  const classificador = criarClassificador({ db, claude, execucaoId, agora, log, ...classificadorOpcoes });
  const resumo = { fontes: {}, festasNovas: 0, festasTocadas: 0, avisos: [] };
  const tocadas = new Set();
  const avisar = (a) => {
    if (resumo.avisos.length < 200) resumo.avisos.push(a);
  };

  try {
    for (const fonte of fontes) {
      const r = { itens: 0, gravados: 0, novas: 0, descartados: 0, erro: null };
      resumo.fontes[fonte.id] = r;
      let coletado;
      try {
        coletado = await fonte.coletar({ db, fetch, agora, log, config: config[fonte.id] || {} });
      } catch (e) {
        r.erro = e.message;
        avisar(`${fonte.id}: a coleta falhou (${e.message})`);
        continue;
      }
      for (const a of coletado.avisos || []) avisar(`${fonte.id}: ${a}`);
      const pendentes = [];
      for (const item of coletado.itens || []) {
        r.itens += 1;
        const rotulo = `${fonte.id}:${item.idExterno}`;
        const { campos, avisos } = normalizarItem(item.bruto, fonte.id);
        for (const a of avisos) avisar(`${rotulo}: ${a}`);
        if (!campos.nome || !campos.data) {
          r.descartados += 1;
          avisar(`${rotulo}: sem nome ou data; não entra`);
          continue;
        }
        const conferidoEm = item.conferidoEm || agora().toISOString();
        const hash = crypto.createHash('sha256').update(JSON.stringify(item.bruto)).digest('hex');
        const festaId = transacao(db, () => {
          db.prepare(`INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (fonte, id_externo) DO UPDATE SET hash = excluded.hash, bruto = excluded.bruto, coletado_em = excluded.coletado_em`)
            .run(fonte.id, item.idExterno, hash, JSON.stringify(item.bruto), agora().toISOString());
          const v = vincular(db, { fonte: fonte.id, idExterno: item.idExterno, url: item.url, campos, agora: conferidoEm });
          if (v.nova) {
            r.novas += 1;
            resumo.festasNovas += 1;
          }
          gravarValores(db, v.festaId, fonte.id, campos, conferidoEm);
          return v.festaId;
        });
        r.gravados += 1;
        tocadas.add(festaId);
        if (precisaClassificar(item, campos)) pendentes.push({ item, campos, festaId });
      }

      for (const { item, campos, festaId } of pendentes) {
        const c = await classificador.classificar({
          festaId,
          nome: campos.nome,
          casa: campos.casa,
          lineup: campos.lineup,
          categorias: item.categorias,
          texto: item.texto,
        });
        gravarValores(db, festaId, c.por, camposDaClassificacao(c.resultado, campos), agora().toISOString());
      }
    }
    resumo.festasTocadas = tocadas.size;
    resumo.classificacao = classificador.resumo();
    db.prepare("UPDATE execucoes SET estado = 'ok', fim = ?, resumo = ? WHERE id = ?")
      .run(agora().toISOString(), JSON.stringify(resumo), execucaoId);
    return { execucaoId, ...resumo };
  } catch (e) {
    resumo.erro = e.message;
    db.prepare("UPDATE execucoes SET estado = 'erro', fim = ?, resumo = ? WHERE id = ?")
      .run(agora().toISOString(), JSON.stringify(resumo), execucaoId);
    throw e;
  }
}

module.exports = { executar, travar, precisaClassificar };

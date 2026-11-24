'use strict';
// Reprocessar sem custo e sem perda (M26, KTD11 do plano de 24/11/2026):
// refaz festas, vínculos e valores a partir de itens_brutos num banco novo,
// sem rede e sem chamada paga, levando os valores `claude` e `regras` pela
// festa de cada item, mantendo o id mais antigo de cada festa e reaplicando
// curadoria e decisões. A origem abre só para leitura e nunca é escrita.
//
// O caminho é o mesmo da coleta (KTD4): cada item passa pelo tempo 1
// (coleta.gravarItem: o bruto, o vínculo conservador e os valores da fonte,
// somados por rodada) em ordem de coleta, depois vem a passada de escore
// (tempo 3) e, no reprocessar, as fontes de festa (tempo 4). Nada vai ao
// modelo nem à rede: o que o modelo e as regras já leram vem da festa antiga.
//
// Os ids: cada festa nova fica com o id da festa antiga que o item mais antigo
// dela criou; a festa antiga que foi absorvida vira apelido (festas_alias); a
// parte que sai de uma separação ganha id novo.

const fs = require('node:fs');
const crypto = require('node:crypto');
const { abrirBanco, transacao } = require('./banco');
const { normalizarItem, novoId } = require('./normalizar');
const correlacao = require('./correlacao');

// O que se copia da origem, nesta ordem (itens_brutos antes de imagens_item, pela FK).
const TABELAS = ['itens_brutos', 'execucoes', 'fontes_rodadas', 'classificacoes', 'links_bio', 'imagens', 'imagens_item', 'geocodificacoes',
  'curadoria', 'vinculos_decisoes', 'avaliacoes', 'festas_alias', 'produtoras', 'envios', 'uso_llm', 'uso_apify', 'uso_api'];

const SEP = '\u001f';
const chaveItem = (fonte, id) => `${fonte}${SEP}${id}`;
const ler = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const colunas = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

// Copia uma tabela, só as colunas que os dois lados têm (a origem pode estar no
// esquema de antes do 3). Linha que a FK recusa fica de fora e é contada.
function copiarTabela(de, para, tabela) {
  const cDe = colunas(de, tabela);
  if (!cDe.length) return { copiadas: 0, recusadas: 0 };
  const cPara = new Set(colunas(para, tabela));
  const cols = cDe.filter((c) => cPara.has(c));
  const lista = cols.map((c) => `"${c}"`).join(', ');
  const ins = para.prepare(`INSERT OR IGNORE INTO ${tabela} (${lista}) VALUES (${cols.map(() => '?').join(', ')})`);
  let copiadas = 0;
  let recusadas = 0;
  for (const l of de.prepare(`SELECT ${lista} FROM ${tabela}`).all()) {
    try {
      copiadas += Number(ins.run(...cols.map((c) => l[c])).changes);
    } catch {
      recusadas += 1;
    }
  }
  return { copiadas, recusadas };
}

// Qual item criou cada festa da origem: o id termina com 4 hexa do sha256 de
// "fonte:id" do item que a criou (normalizar.novoId); sem isso, o vínculo
// mais antigo (menor rowid).
function criadores(origem) {
  const porFesta = new Map();
  for (const v of origem.prepare('SELECT rowid AS r, fonte, id_externo, festa_id FROM vinculos ORDER BY rowid').all()) {
    if (!porFesta.has(v.festa_id)) porFesta.set(v.festa_id, []);
    porFesta.get(v.festa_id).push(v);
  }
  const criadorDe = new Map(); // chave do item -> festa da origem que ele criou
  for (const [festa, vs] of porFesta) {
    const fim = String(festa).split('-').pop();
    const pelaSemente = vs.find((v) => crypto.createHash('sha256').update(`${v.fonte}:${v.id_externo}`).digest('hex').slice(0, 4) === fim);
    const c = pelaSemente || vs[0];
    criadorDe.set(chaveItem(c.fonte, c.id_externo), festa);
  }
  return criadorDe;
}

// O tempo 1 de todos os itens da origem, em ordem de coleta. Itens seguidos da
// mesma fonte são uma rodada: somam-se como numa execução.
function refazerItens(origem, destino, { agora, lugares, vinculosOrigem }) {
  const { gravarItem } = require('./coleta');
  const temContexto = colunas(origem, 'itens_brutos').includes('contexto');
  const itens = origem.prepare(`SELECT fonte, id_externo, bruto, coletado_em${temContexto ? ', contexto' : ''} FROM itens_brutos ORDER BY coletado_em, fonte, id_externo`).all();
  const r = { itens: 0, gravados: 0, descartados: 0, substituidos: 0 };
  let fonteAtual = null;
  let somados = new Map();
  for (const l of itens) {
    r.itens += 1;
    const bruto = ler(l.bruto);
    if (!bruto || bruto.substituido === true) {
      r.substituidos += 1;
      continue;
    }
    const { campos } = normalizarItem(bruto, l.fonte);
    if (!campos.nome || !campos.data) {
      r.descartados += 1;
      continue;
    }
    if (l.fonte !== fonteAtual) {
      fonteAtual = l.fonte;
      somados = new Map();
    }
    const ctx = (l.contexto && ler(l.contexto)) || {};
    const v = vinculosOrigem.get(chaveItem(l.fonte, l.id_externo));
    const item = { idExterno: l.id_externo, bruto, url: v ? v.url : null, texto: ctx.texto || undefined, categorias: ctx.categorias || undefined };
    gravarItem(destino, { fonte: l.fonte, item, campos, conferidoEm: l.coletado_em, agora, somados, coletadoEm: l.coletado_em, lugares });
    r.gravados += 1;
  }
  return r;
}

// Troca ids de festa no banco inteiro (festas, vínculos, valores, candidatos, apelidos).
function renomear(db, mapa) {
  const trocas = [...mapa].filter(([de, para]) => de !== para);
  if (!trocas.length) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    transacao(db, () => {
      const passo = (de, para) => {
        db.prepare('UPDATE festas SET id = ? WHERE id = ?').run(para, de);
        for (const [t, c] of [['vinculos', 'festa_id'], ['valores', 'festa_id'], ['candidatos', 'festa_id'], ['festas_alias', 'novo'], ['festas_alias', 'antigo']]) {
          db.prepare(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`).run(para, de);
        }
      };
      trocas.forEach(([de], i) => passo(de, `\u0000tmp:${i}`));
      trocas.forEach(([, para], i) => passo(`\u0000tmp:${i}`, para));
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

const textoDosSinais = (sinais) => (Array.isArray(sinais) && sinais.length ? sinais.map((s) => s.detalhe || s.sinal).join(', ') : 'sem sinal gravado');

// Reconstrói no destino a partição e os valores a partir dos itens da origem.
// Só lê a origem. -> { une, separa, linhas, mapa: { festaFinalDe, gruposDe }, itens }
function reconstruir(origem, destino, { agora = () => new Date(), log = console, config = {}, lugares } = {}) {
  void log;
  const quando = agora().toISOString();
  const copias = {};
  for (const t of TABELAS) copias[t] = copiarTabela(origem, destino, t);
  // A origem pode estar no esquema de antes do 3, sem apelidos.
  const aliasesOrigem = colunas(origem, 'festas_alias').length ? origem.prepare('SELECT antigo, novo, quando FROM festas_alias').all() : [];

  const vinculosOrigem = new Map();
  for (const v of origem.prepare('SELECT fonte, id_externo, festa_id, url, visto_em FROM vinculos').all()) vinculosOrigem.set(chaveItem(v.fonte, v.id_externo), v);
  const festasOrigem = new Map(origem.prepare('SELECT rowid AS r, id, criada_em FROM festas').all().map((f) => [f.id, f]));
  const criadorDe = criadores(origem);

  const itens = refazerItens(origem, destino, { agora, lugares, vinculosOrigem });
  const todas = destino.prepare('SELECT id FROM festas').all().map((x) => x.id);
  const passada = correlacao.passada(destino, { festasTocadas: todas, agora, config: { ...(config.correlacao || {}), ...(lugares ? { lugares } : {}) } });

  // A url e o visto_em de cada vínculo voltam como eram na origem.
  const updV = destino.prepare('UPDATE vinculos SET url = COALESCE(?, url), visto_em = ? WHERE fonte = ? AND id_externo = ?');
  for (const v of vinculosOrigem.values()) updV.run(v.url, v.visto_em, v.fonte, v.id_externo);

  // Os grupos de itens de cada festa nova e o id que cada uma fica.
  const grupos = new Map();
  for (const v of destino.prepare('SELECT festa_id, fonte, id_externo FROM vinculos ORDER BY rowid').all()) {
    if (!grupos.has(v.festa_id)) grupos.set(v.festa_id, []);
    grupos.get(v.festa_id).push(chaveItem(v.fonte, v.id_externo));
  }
  const ordemOrigem = (a, b) => {
    const fa = festasOrigem.get(a);
    const fb = festasOrigem.get(b);
    return String(fa.criada_em).localeCompare(String(fb.criada_em)) || fa.r - fb.r;
  };
  const mapa = new Map();
  const usados = new Set();
  for (const [d, chaves] of grupos) {
    const criadas = [...new Set(chaves.map((k) => criadorDe.get(k)).filter((id) => id && festasOrigem.has(id)))].sort(ordemOrigem);
    if (criadas.length) {
      mapa.set(d, criadas[0]);
      usados.add(criadas[0]);
    }
  }
  const ocupado = (id) => usados.has(id) || festasOrigem.has(id) || aliasesOrigem.some((a) => a.antigo === id);
  for (const [d, chaves] of grupos) {
    if (mapa.has(d)) continue;
    let id = d;
    if (ocupado(id)) {
      const [fonte, idExterno] = chaves[0].split(SEP);
      const b = destino.prepare('SELECT bruto FROM itens_brutos WHERE fonte = ? AND id_externo = ?').get(fonte, idExterno);
      const { campos } = normalizarItem((b && ler(b.bruto)) || {}, fonte);
      for (let n = 2; ocupado(id) || (id !== d && grupos.has(id)); n += 1) id = novoId(campos.nome, campos.data, `${fonte}:${idExterno}:${n}`);
    }
    mapa.set(d, id);
    usados.add(id);
  }
  renomear(destino, mapa);

  // O grupo final de cada item e as festas da origem de cada festa nova.
  const festaFinalDe = new Map(); // chave do item -> festa nova
  for (const [d, chaves] of grupos) for (const k of chaves) festaFinalDe.set(k, mapa.get(d));
  const gruposDe = new Map(); // festa da origem -> [festas novas com itens dela]
  const origensDe = new Map(); // festa nova -> [festas da origem]
  for (const [k, final] of festaFinalDe) {
    const v = vinculosOrigem.get(k);
    if (!v) continue;
    if (!gruposDe.has(v.festa_id)) gruposDe.set(v.festa_id, []);
    if (!gruposDe.get(v.festa_id).includes(final)) gruposDe.get(v.festa_id).push(final);
    if (!origensDe.has(final)) origensDe.set(final, []);
    if (!origensDe.get(final).includes(v.festa_id)) origensDe.get(final).push(v.festa_id);
  }

  // Os apelidos: os da origem, mais cada festa da origem que não ficou viva,
  // apontando para a festa nova do item que a criou.
  const vivas = new Set(destino.prepare('SELECT id FROM festas').all().map((x) => x.id));
  transacao(destino, () => {
    destino.prepare('DELETE FROM festas_alias').run();
    const ins = destino.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?) ON CONFLICT (antigo) DO UPDATE SET novo = excluded.novo, quando = excluded.quando');
    for (const a of aliasesOrigem) ins.run(a.antigo, a.novo, a.quando);
    for (const o of festasOrigem.keys()) {
      if (vivas.has(o)) continue;
      const criador = [...criadorDe].find(([, f]) => f === o);
      const alvo = (criador && festaFinalDe.get(criador[0])) || (gruposDe.get(o) || [])[0];
      if (alvo && alvo !== o) ins.run(o, alvo, quando);
    }
    for (const id of vivas) destino.prepare('DELETE FROM festas_alias WHERE antigo = ?').run(id);
    destino.prepare('DELETE FROM festas_alias WHERE antigo = novo').run();
  });

  // O que o modelo, as regras e as outras fontes sem item (nominatim,
  // curadoria, avaliações) já disseram vai para a festa nova de cada item;
  // numa separação, para as duas partes, marcadas para revisão.
  const { LEITURA_DO_MODELO } = require('./coleta');
  const qFontesItem = origem.prepare('SELECT DISTINCT fonte FROM vinculos WHERE festa_id = ?');
  const qValores = origem.prepare('SELECT campo, fonte, valor, conferido_em, mudou_em FROM valores WHERE festa_id = ?');
  const qAtual = destino.prepare('SELECT conferido_em FROM valores WHERE festa_id = ? AND campo = ? AND fonte = ?');
  const insV = destino.prepare(`INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (festa_id, campo, fonte) DO UPDATE SET valor = excluded.valor, conferido_em = excluded.conferido_em, mudou_em = excluded.mudou_em`);
  const modeloDisse = destino.prepare(`SELECT 1 FROM valores WHERE festa_id = ? AND campo = 'ehFesta' AND fonte IN (${[...LEITURA_DO_MODELO].map(() => '?').join(',')}) LIMIT 1`);
  const separa = [];
  transacao(destino, () => {
    for (const [o, finais] of gruposDe) {
      const comItem = new Set(qFontesItem.all(o).map((x) => x.fonte));
      const derivados = qValores.all(o).filter((l) => !comItem.has(l.fonte));
      for (const f of finais) {
        const semRegras = Boolean(modeloDisse.get(f, ...LEITURA_DO_MODELO));
        for (const l of derivados) {
          if (l.fonte === 'regras' && semRegras) continue;
          const atual = qAtual.get(f, l.campo, l.fonte);
          if (!atual || l.conferido_em > atual.conferido_em) insV.run(f, l.campo, l.fonte, l.valor, l.conferido_em, l.mudou_em);
        }
      }
      if (finais.length > 1) {
        for (const f of finais) correlacao.marcarRevisar(destino, f, 'separada', `parte de ${o}, separada no reprocessar; o que o modelo leu ficou em ${finais.join(' e ')}`, quando);
        let motivo = 'sem veto: o escore ficou abaixo do limiar';
        try {
          const [a, b] = finais.map((f) => correlacao.ladoDaFesta(destino, f, { lugares }));
          const e = correlacao.escore(a, b, config.correlacao || {});
          motivo = e.veto || `escore ${e.valor} (${textoDosSinais(e.sinais)})`;
        } catch {
          // fica o motivo genérico
        }
        separa.push({ festa: o, partes: finais.slice(), motivo });
      }
    }
  });

  const une = [];
  for (const [final, origens] of origensDe) {
    if (origens.length < 2) continue;
    const outras = origens.filter((o) => o !== final);
    const qMot = destino.prepare('SELECT motivo, regra FROM vinculos WHERE festa_id = ? AND regra IN (\'escore\', \'link\', \'manual\') ORDER BY rowid');
    const sinais = qMot.all(final).flatMap((m) => ler(m.motivo) || []);
    une.push({ para: final, de: outras, motivo: textoDosSinais(sinais.filter((s, i) => sinais.findIndex((x) => x.sinal === s.sinal) === i)) });
  }

  const linhas = [
    ...une.map((u) => `une ${[u.para, ...u.de].join(' + ')} (${u.motivo})`),
    ...separa.map((s) => `separa ${s.festa} em ${s.partes.join(' e ')} (${s.motivo})`),
  ];
  return { une, separa, linhas, festaFinalDe, gruposDe, origensDe, itens, passada, copias };
}

const contar = (db) => ({
  festas: db.prepare('SELECT COUNT(*) AS n FROM festas').get().n,
  vinculos: db.prepare('SELECT COUNT(*) AS n FROM vinculos').get().n,
  itens: db.prepare('SELECT COUNT(*) AS n FROM itens_brutos').get().n,
});

const configPadrao = () => {
  try {
    return require('../fontes').lerConfig();
  } catch {
    return {};
  }
};

// reprocessar({ origem, destino, simular, agora, log }) -> { feito, simulado, une, separa, linhas, origem, destino, ... }
// origem: o arquivo do banco (aberto só para leitura, sem migrar). destino: um
// arquivo novo (recusa se existir), montado em <destino>.parcial e renomeado
// no fim. simular: monta em memória e só diz o que une e o que separa.
// Também aceita, para os testes: config, fontesDeFesta, lugares.
async function reprocessar({
  origem, destino, simular = false, agora = () => new Date(), log = console, config = null, fontesDeFesta = null, lugares,
} = {}) {
  if (!origem) throw new Error('reprocessar: falta a origem');
  if (!fs.existsSync(origem)) throw new Error(`reprocessar: a origem ${origem} não existe`);
  if (!simular && !destino) throw new Error('reprocessar: falta o destino');
  if (!simular && fs.existsSync(destino)) throw new Error(`reprocessar: o destino ${destino} já existe; escolha um arquivo novo`);
  const cfg = config || configPadrao();
  const o = abrirBanco(origem, { readOnly: true, migrar: false });
  const parcial = simular ? ':memory:' : `${destino}.parcial`;
  if (!simular) for (const x of ['', '-wal', '-shm']) fs.rmSync(`${parcial}${x}`, { force: true });
  const d = abrirBanco(parcial);
  let r;
  let contagens;
  try {
    r = reconstruir(o, d, { agora, log, config: cfg, lugares });
    // Tempo 4: a curadoria e as avaliações gravam sobre a partição final.
    const deFesta = fontesDeFesta || require('../fontes').fontesDeFesta(cfg);
    const ids = d.prepare('SELECT id FROM festas').all().map((x) => x.id);
    const avisos = [];
    for (const f of deFesta) {
      try {
        const rf = await f.aplicar({ db: d, agora, festasTocadas: ids, config: cfg[f.id] || {}, log });
        for (const a of (rf && rf.avisos) || []) avisos.push(`${f.id}: ${a}`);
      } catch (e) {
        avisos.push(`${f.id}: falhou (${e.message})`);
      }
    }
    r.avisos = avisos;
    contagens = { origem: contar(o), destino: contar(d), integridade: d.prepare('PRAGMA integrity_check').get().integrity_check };
  } finally {
    o.close();
    d.close();
  }
  if (!simular) {
    fs.renameSync(parcial, destino);
    for (const x of ['-wal', '-shm']) fs.rmSync(`${parcial}${x}`, { force: true });
  }
  for (const l of r.linhas) log.info(`[reprocessar] ${l}`);
  return {
    feito: !simular, simulado: Boolean(simular), destino: simular ? null : destino,
    une: r.une, separa: r.separa, linhas: r.linhas, itens: r.itens, correlacao: { unidas: r.passada.unidas, candidatos: r.passada.candidatos },
    avisos: r.avisos, ...contagens,
  };
}

// revincular(db, { simular, agora, log }) -> { une, separa, linhas, aplicado, simulado }
// Refaz a partição do próprio banco (em memória, com o mesmo caminho do
// reprocessar) e diz o que une e o que separa; sem `simular`, troca numa
// transação só as festas que mudaram. Síncrono. Também aceita config e lugares.
function revincular(db, { simular = false, agora = () => new Date(), log = console, config = null, lugares } = {}) {
  const cfg = config || configPadrao();
  const mem = abrirBanco(':memory:');
  let r;
  try {
    r = reconstruir(db, mem, { agora, log, config: cfg, lugares });
    const saida = { une: r.une, separa: r.separa, linhas: r.linhas, aplicado: false, simulado: Boolean(simular) };
    if (simular) return saida;
    // Vínculo de antes do /3 (sem regra) na mesma festa: ganha a regra, o
    // escore e o motivo que a reconstrução achou, para o app dizer o porquê.
    const preencher = db.prepare('UPDATE vinculos SET regra = ?, escore = ?, motivo = ?, versao = ? WHERE fonte = ? AND id_externo = ? AND festa_id = ? AND regra IS NULL');
    const preenchidos = transacao(db, () => mem.prepare('SELECT * FROM vinculos').all()
      .reduce((n, v) => n + Number(preencher.run(v.regra, v.escore, v.motivo, v.versao, v.fonte, v.id_externo, v.festa_id).changes), 0));
    saida.preenchidos = preenchidos;
    if (!r.linhas.length) return saida;
    const velhas = new Set([...r.une.flatMap((u) => [u.para, ...u.de]), ...r.separa.map((s) => s.festa)].filter((id) => db.prepare('SELECT 1 FROM festas WHERE id = ?').get(id)));
    const novas = new Set([...r.une.map((u) => u.para), ...r.separa.flatMap((s) => s.partes)]);
    for (const o of velhas) for (const f of r.gruposDe.get(o) || []) novas.add(f);
    const lista = (s) => [...s].map(() => '?').join(',');
    transacao(db, () => {
      // Itens das festas que mudam, inclusive os que a reconstrução levou para elas.
      const itens = mem.prepare(`SELECT * FROM vinculos WHERE festa_id IN (${lista(novas)})`).all(...novas);
      const delV = db.prepare('DELETE FROM vinculos WHERE fonte = ? AND id_externo = ?');
      for (const v of itens) delV.run(v.fonte, v.id_externo);
      for (const o of velhas) {
        if (db.prepare('SELECT 1 FROM vinculos WHERE festa_id = ? LIMIT 1').get(o)) continue;
        db.prepare('DELETE FROM valores WHERE festa_id = ?').run(o);
        db.prepare('DELETE FROM candidatos WHERE festa_id = ?').run(o);
        db.prepare('DELETE FROM festas WHERE id = ?').run(o);
      }
      for (const f of novas) {
        db.prepare('DELETE FROM valores WHERE festa_id = ?').run(f);
        db.prepare('DELETE FROM candidatos WHERE festa_id = ?').run(f);
        db.prepare('DELETE FROM festas WHERE id = ?').run(f);
        const festa = mem.prepare('SELECT id, data, data_noite, criada_em FROM festas WHERE id = ?').get(f);
        if (!festa) continue;
        db.prepare('INSERT INTO festas (id, data, data_noite, criada_em) VALUES (?, ?, ?, ?)').run(festa.id, festa.data, festa.data_noite, festa.criada_em);
        const insVal = db.prepare('INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, ?, ?, ?, ?, ?)');
        for (const l of mem.prepare('SELECT * FROM valores WHERE festa_id = ?').all(f)) insVal.run(l.festa_id, l.campo, l.fonte, l.valor, l.conferido_em, l.mudou_em);
        const insC = db.prepare('INSERT OR REPLACE INTO candidatos (fonte, id_externo, festa_id, escore, motivo, visto_em) VALUES (?, ?, ?, ?, ?, ?)');
        for (const c of mem.prepare('SELECT * FROM candidatos WHERE festa_id = ?').all(f)) insC.run(c.fonte, c.id_externo, c.festa_id, c.escore, c.motivo, c.visto_em);
      }
      const insVin = db.prepare('INSERT INTO vinculos (fonte, id_externo, festa_id, url, visto_em, regra, escore, motivo, versao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const v of itens) insVin.run(v.fonte, v.id_externo, v.festa_id, v.url, v.visto_em, v.regra, v.escore, v.motivo, v.versao);
      const insA = db.prepare('INSERT INTO festas_alias (antigo, novo, quando) VALUES (?, ?, ?) ON CONFLICT (antigo) DO UPDATE SET novo = excluded.novo, quando = excluded.quando');
      for (const a of mem.prepare('SELECT * FROM festas_alias').all()) if (velhas.has(a.antigo) || novas.has(a.novo)) insA.run(a.antigo, a.novo, a.quando);
      for (const f of novas) db.prepare('DELETE FROM festas_alias WHERE antigo = ?').run(f);
    });
    saida.aplicado = true;
    for (const l of r.linhas) log.info(`[revincular] ${l}`);
    return saida;
  } finally {
    mem.close();
  }
}

module.exports = { reprocessar, revincular, reconstruir, TABELAS };

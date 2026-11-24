'use strict';
// Curadoria (M34, D7, KTD12 do plano de 24/11/2026): `corrigir` e `ocultar`
// gravam na tabela curadoria e em valores com a fonte `curadoria` (prioridade
// acima de todas); `decidir` grava une ou separa em vinculos_decisoes;
// `listarRevisao` junta as divergências para olho humano. O festa_id passa
// por festas_alias antes de gravar.
//
// A tabela curadoria é a verdade: uma linha por correção, `ativa` até alguém
// desfazer ou corrigir o mesmo campo de novo. Os valores da fonte `curadoria`
// são sempre regravados a partir dela numa chamada só por festa (gravarValores
// apaga o que a fonte não trouxer), por `regravar`: o que a fonte de festa
// `curadoria` faz a cada execução e no reprocessar.

const { transacao, parEmOrdem } = require('./banco');
const { gravarValores } = require('./agregar');
const { resolverId } = require('./correlacao');
const { CAMPOS, ORIGENS_IDADE, TIPOS_EVENTO } = require('./catalogo');
const { escolher, dataDaNoite, listarRegistros } = require('./contrato');
const { semAcento } = require('./bairros');

const iso = (agora) => (typeof agora === 'function' ? agora() : agora).toISOString();

function festaExiste(db, id) {
  return Boolean(db.prepare('SELECT 1 FROM festas WHERE id = ?').get(id));
}

// O id atual da festa, depois dos apelidos; lança se ela não existe.
function festaAtual(db, festaId) {
  const id = resolverId(db, String(festaId || ''));
  if (!id || !festaExiste(db, id)) throw new Error(`festa não encontrada: ${festaId}`);
  return id;
}

// A data da noite (festas.data_noite) acompanha o que a curadoria mudou em
// `data` e `inicio`: é a chave de dia do app e do bloco da correlação.
function recalcularDataNoite(db, festaId) {
  const linhas = db.prepare("SELECT campo, fonte, valor, conferido_em FROM valores WHERE festa_id = ? AND campo IN ('data', 'inicio')").all(festaId);
  const esc = escolher(linhas);
  const lido = (campo) => {
    const l = esc.get(campo);
    if (!l) return null;
    try {
      return JSON.parse(l.valor);
    } catch {
      return null;
    }
  };
  const data = db.prepare('SELECT data FROM festas WHERE id = ?').get(festaId);
  const dn = dataDaNoite((data && data.data) || lido('data'), lido('inicio'));
  if (dn) db.prepare('UPDATE festas SET data_noite = ? WHERE id = ?').run(dn, festaId);
}

// O valor de cada campo na forma que o registro espera. A CLI manda JSON ou
// texto solto, e um valor torto chegaria ao contrato e ao app: aqui vira a
// forma certa ou erro com a explicação. Campo sem regra passa como veio.
const eTexto = (v) => typeof v === 'string' && v.trim() !== '';
const eObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const eIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));
const eHttp = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v);
const falha = (campo, esperado) => {
  throw new Error(`valor inválido para ${campo}: ${esperado}`);
};

function validarValor(campo, valor) {
  switch (campo) {
    case 'nome': case 'casa':
      if (!eTexto(valor)) falha(campo, 'texto');
      return valor.trim();
    case 'produtora':
      if (eTexto(valor)) return { nome: valor.trim(), instagram: null };
      if (eObjeto(valor) && eTexto(valor.nome)) return { nome: valor.nome.trim(), instagram: eTexto(valor.instagram) ? valor.instagram : null };
      return falha(campo, 'texto ou { "nome": "...", "instagram": "..." }');
    case 'linkCompra': case 'linkEvento': case 'instagram':
      if (valor !== null && !eHttp(valor)) falha(campo, 'URL http(s) ou null');
      return valor;
    case 'data':
      if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(`${valor}T12:00:00Z`))) falha(campo, 'AAAA-MM-DD');
      return valor;
    case 'inicio': case 'fim': case 'pistaCheia':
      if (!eIso(valor)) falha(campo, 'ISO com fuso, ex.: 2026-11-14T22:00:00-03:00');
      return valor;
    case 'estilos': case 'lineup':
      if (!Array.isArray(valor) || !valor.every(eTexto)) falha(campo, 'lista de textos');
      return valor;
    case 'idadeMinima':
      if (!Number.isInteger(valor) || valor < 0 || valor > 99) falha(campo, 'número inteiro');
      return valor;
    case 'ehFesta': case 'exemplo':
      if (typeof valor !== 'boolean') falha(campo, 'true ou false');
      return valor;
    case 'tipo':
      if (!TIPOS_EVENTO.includes(valor)) falha(campo, TIPOS_EVENTO.join(', '));
      return valor;
    case 'mediaIdade':
      if (!eObjeto(valor) || !Number.isFinite(valor.valor) || !ORIGENS_IDADE.includes(valor.origem)) falha(campo, `{ "valor": 30, "origem": ${ORIGENS_IDADE.map((o) => `"${o}"`).join(' | ')} }`);
      return valor;
    case 'endereco': case 'regras':
      if (!eObjeto(valor)) falha(campo, 'objeto');
      return valor;
    case 'lotes':
      if (!Array.isArray(valor)) falha(campo, 'lista de lotes');
      return valor;
    case 'geo':
      if (!eObjeto(valor) || !Number.isFinite(valor.lat) || !Number.isFinite(valor.lng)) falha(campo, '{ "lat": -23.56, "lng": -46.65 }');
      return { precisao: 'casa', ...valor, origemGeo: 'curadoria' };
    case 'oculta':
      if (!eObjeto(valor)) falha(campo, 'objeto { "motivo": "..." }');
      return valor;
    default:
      return valor;
  }
}

// Regrava os valores da fonte `curadoria` a partir das linhas ativas. `so` (id
// atual de uma festa) restringe a uma festa; sem ele, vale para todas. Linhas
// de uma festa depois unida a outra valem na festa nova (pelo apelido); duas
// correções do mesmo campo ficam com a mais nova. Devolve { festas, campos, avisos }.
function regravar(db, { agora = () => new Date(), so = null } = {}) {
  const quando = iso(agora);
  const avisos = [];
  const ativas = db.prepare('SELECT id, festa_id, campo, valor FROM curadoria WHERE ativa = 1 ORDER BY id').all();
  const porFesta = new Map();
  const orfas = new Set();
  for (const l of ativas) {
    const id = resolverId(db, l.festa_id);
    if (!festaExiste(db, id)) {
      if (!orfas.has(l.festa_id)) avisos.push(`curadoria: a festa ${l.festa_id} não existe mais; correção ignorada`);
      orfas.add(l.festa_id);
      continue;
    }
    if (so && id !== so) continue;
    if (!porFesta.has(id)) porFesta.set(id, {});
    let valor = null;
    try {
      valor = l.valor === null || l.valor === undefined ? null : JSON.parse(l.valor);
    } catch {
      avisos.push(`curadoria: valor ilegível em ${l.festa_id}.${l.campo}`);
      continue;
    }
    porFesta.get(id)[l.campo] = valor;
  }
  // Festas que tinham valores da curadoria e já não têm linha ativa: limpa.
  const comValores = db.prepare("SELECT DISTINCT festa_id FROM valores WHERE fonte = 'curadoria'").all().map((r) => r.festa_id);
  for (const id of comValores) if (!porFesta.has(id) && (!so || id === so)) porFesta.set(id, {});
  let campos = 0;
  transacao(db, () => {
    for (const [id, c] of porFesta) {
      gravarValores(db, id, 'curadoria', c, quando);
      recalcularDataNoite(db, id);
      campos += Object.keys(c).length;
    }
  });
  return { festas: porFesta.size, campos, avisos };
}

// corrigir(db, { festaId, campo, valor, motivo, agora }) -> { id, festaId }
// O valor é qualquer JSON do campo (a casa é texto, o endereço é objeto...).
// A correção nova do mesmo campo desativa a anterior.
function corrigir(db, { festaId, campo, valor, motivo = null, agora = () => new Date() } = {}) {
  if (!CAMPOS.includes(campo)) throw new Error(`campo desconhecido: ${campo}. Campos: ${CAMPOS.join(', ')}`);
  if (valor === undefined) throw new Error('falta o valor da correção');
  valor = validarValor(campo, valor);
  const id = festaAtual(db, festaId);
  const quando = iso(agora);
  const novo = transacao(db, () => {
    // O mesmo campo em qualquer id que hoje aponta para esta festa.
    for (const l of db.prepare('SELECT id, festa_id FROM curadoria WHERE campo = ? AND ativa = 1').all(campo)) {
      if (resolverId(db, l.festa_id) === id) db.prepare('UPDATE curadoria SET ativa = 0 WHERE id = ?').run(l.id);
    }
    return Number(db.prepare('INSERT INTO curadoria (festa_id, campo, valor, motivo, criada_em, ativa) VALUES (?, ?, ?, ?, ?, 1)')
      .run(id, campo, JSON.stringify(valor), motivo || null, quando).lastInsertRowid);
  });
  regravar(db, { agora, so: id });
  return { id: novo, festaId: id };
}

// ocultar(db, { festaId, motivo, agora }) -> { id, festaId }
// A festa sai de /api/festas e do export (listarRegistros), salvo `todas`.
function ocultar(db, { festaId, motivo = null, agora = () => new Date() } = {}) {
  return corrigir(db, { festaId, campo: 'oculta', valor: { motivo: motivo || 'ocultada pela curadoria' }, motivo, agora });
}

// desfazer(db, { festaId, campo, agora }) -> { desfeitas }
// Tira a correção ativa do campo (a festa ocultada volta com campo 'oculta').
function desfazer(db, { festaId, campo, agora = () => new Date() } = {}) {
  const id = festaAtual(db, festaId);
  let desfeitas = 0;
  transacao(db, () => {
    for (const l of db.prepare('SELECT id, festa_id FROM curadoria WHERE campo = ? AND ativa = 1').all(campo)) {
      if (resolverId(db, l.festa_id) === id) desfeitas += Number(db.prepare('UPDATE curadoria SET ativa = 0 WHERE id = ?').run(l.id).changes);
    }
  });
  regravar(db, { agora, so: id });
  return { desfeitas, festaId: id };
}

// Lê um "fonte:idExterno" (o idExterno pode ter dois-pontos).
function parseItem(x) {
  if (Array.isArray(x)) return [String(x[0]), String(x[1])];
  const s = String(x || '');
  const i = s.indexOf(':');
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''];
}

// decidir(db, { a: [fonte, idExterno], b: [fonte, idExterno], decisao: 'une'|'separa', quem, agora }) -> { decisao, a, b }
// Grava a decisão manual com o par em ordem (parEmOrdem); vale sempre na
// correlação (une e separa sobrepõem o escore). Decidir de novo o mesmo par troca a decisão.
function decidir(db, { a, b, decisao, quem = null, agora = () => new Date() } = {}) {
  if (!['une', 'separa'].includes(decisao)) throw new Error('a decisão é "une" ou "separa"');
  const A = parseItem(a);
  const B = parseItem(b);
  if (!A[1] || !B[1]) throw new Error('os itens vão como fonte:idExterno');
  if (A[0] === B[0] && A[1] === B[1]) throw new Error('os dois itens são o mesmo');
  const existe = db.prepare('SELECT 1 FROM vinculos WHERE fonte = ? AND id_externo = ?');
  for (const x of [A, B]) if (!existe.get(x[0], x[1])) throw new Error(`item não encontrado: ${x[0]}:${x[1]}`);
  const [p, q] = parEmOrdem(A, B);
  db.prepare(`INSERT INTO vinculos_decisoes (a_fonte, a_id, b_fonte, b_id, decisao, quem, quando) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (a_fonte, a_id, b_fonte, b_id) DO UPDATE SET decisao = excluded.decisao, quem = excluded.quem, quando = excluded.quando`)
    .run(p[0], p[1], q[0], q[1], decisao, quem, iso(agora));
  return { decisao, a: p, b: q };
}

// ---------------------------------------------------------------- revisão

const CIDADES_CONHECIDAS = new Set(['sao paulo', 'guarulhos', 'osasco', 'santo andre', 'sao bernardo do campo', 'sao caetano do sul', 'barueri', 'cotia', 'campinas', 'santos', 'jundiai']);
const pareceEndereco = (t) => /^(r\.|rua|av\.?|avenida|alameda|al\.|travessa|praca|largo|estrada|rodovia)\b/.test(t) || /\d{5}-?\d{3}/.test(t);

// A casa que é nome de cidade, UF ou endereço (M28): o campo veio errado.
function casaSuspeita(casa, cidade) {
  if (typeof casa !== 'string' || !casa.trim()) return false;
  const t = semAcento(casa).trim();
  if (CIDADES_CONHECIDAS.has(t) || /^[a-z]{2}$/.test(t)) return true;
  if (cidade && t === semAcento(cidade).trim()) return true;
  return pareceEndereco(t);
}

const motivoDeCategoria = (m) => semAcento(String(m || ''));

// listarRevisao(db, { festaId?, limite? }) -> [{ festaId, nome, motivo, detalhe }]
// Plataforma contra modelo no ehFesta, casa que é cidade, sem cidade e
// candidatos a fusão. O que o contrato monta em `revisar` entra também, sem
// repetir os quatro motivos acima.
function listarRevisao(db, opcoes = {}) {
  const { festaId = null, limite = 500 } = opcoes;
  const saida = [];
  const vistos = new Set();
  const add = (id, nome, motivo, detalhe) => {
    const chave = `${id}|${motivo}|${JSON.stringify(detalhe)}`;
    if (vistos.has(chave) || saida.length >= limite) return;
    vistos.add(chave);
    saida.push({ festaId: id, nome: nome || null, motivo, detalhe });
  };
  const ids = festaId ? [resolverId(db, festaId)] : null;
  // todas: a festa que o modelo desclassificou contra a plataforma só aparece assim.
  const registros = listarRegistros(db, { todas: true, ...(ids ? { ids } : {}) });
  const qEh = db.prepare("SELECT fonte, valor FROM valores WHERE festa_id = ? AND campo = 'ehFesta'");
  const DO_MODELO = ['claude', 'instagram', 'paginas', 'indicacao', 'envio', 'curadoria'];
  const nomes = new Map();
  for (const r of registros) {
    if (r.campos && r.campos.oculta) continue; // já resolvida pela curadoria
    nomes.set(r.id, r.nome);
    const cidade = r.endereco ? r.endereco.cidade : null;
    // Plataforma e modelo discordando sobre ser festa (M24).
    const linhas = qEh.all(r.id).map((l) => ({ fonte: l.fonte, valor: JSON.parse(l.valor) }));
    const modelo = linhas.filter((l) => DO_MODELO.includes(l.fonte) && typeof l.valor === 'boolean');
    const plataforma = linhas.filter((l) => /-apify$/.test(l.fonte) && typeof l.valor === 'boolean');
    for (const m of modelo) {
      for (const p of plataforma) {
        if (m.valor !== p.valor) add(r.id, r.nome, 'ehFesta diverge', { modelo: { fonte: m.fonte, ehFesta: m.valor }, plataforma: { fonte: p.fonte, ehFesta: p.valor } });
      }
    }
    if (r.ehFesta === false) continue; // fora do export: só a divergência interessa
    if (casaSuspeita(r.casa, cidade)) add(r.id, r.nome, 'casa parece cidade ou endereço', { casa: r.casa });
    if (!cidade) add(r.id, r.nome, 'sem cidade', { endereco: r.endereco ? r.endereco.texto : null });
    for (const x of Array.isArray(r.revisar) ? r.revisar : []) {
      const m = motivoDeCategoria(x && x.motivo);
      if (/festa|cidade|candidat/.test(m)) continue;
      add(r.id, r.nome, x.motivo, x.detalhe === undefined ? null : x.detalhe);
    }
  }
  const qCand = festaId
    ? db.prepare('SELECT fonte, id_externo, festa_id, escore, motivo FROM candidatos WHERE festa_id = ? ORDER BY escore DESC').all(resolverId(db, festaId))
    : db.prepare('SELECT fonte, id_externo, festa_id, escore, motivo FROM candidatos ORDER BY escore DESC').all();
  for (const c of qCand) {
    const alvo = resolverId(db, c.festa_id);
    const dono = db.prepare('SELECT festa_id FROM vinculos WHERE fonte = ? AND id_externo = ?').get(c.fonte, c.id_externo);
    let sinais = null;
    try {
      sinais = c.motivo ? JSON.parse(c.motivo) : null;
    } catch {
      sinais = null;
    }
    add(alvo, nomes.get(alvo) || null, 'candidato a fusão', { item: `${c.fonte}:${c.id_externo}`, daFesta: dono ? resolverId(db, dono.festa_id) : null, escore: c.escore, sinais });
  }
  return saida;
}

module.exports = { corrigir, ocultar, desfazer, decidir, listarRevisao, regravar, parseItem, casaSuspeita, validarValor };

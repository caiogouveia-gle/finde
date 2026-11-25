'use strict';
// Os dados de validação do protótipo (24/11/2026): quantas pessoas usaram,
// o que acharam e quem quer receber as novidades. Cada site (a landing e o
// app) guarda os seus no próprio volume, e ferramentas/numeros.js junta.
//
//   POST /api/uso            { evento, aparelho, p? }             contagem sem nome
//   POST /api/opiniao        { nota 0..10, texto?, aparelho, de } a nota de indicação
//   POST /api/lista          { email, de, site?, sair? }           a lista de e-mails
//   GET  /api/numeros        (token de admin)                      o resumo
//   GET  /api/numeros/lista.csv (token de admin)                   os e-mails
//
// Uso e opinião não guardam nome, e-mail nem IP: o aparelho entra como
// HMAC-SHA256 de um id aleatório do navegador, com sal próprio (0600),
// truncado em 16. É dado pseudonimizado: some no expurgo (D15, 31/12/2026),
// com o sal. A lista guarda o e-mail, porque é para avisar, e nada que a
// ligue à nota ou ao uso; fica em 0600 no volume, fora do git, até o mesmo
// prazo. `site` é o campo-isca: gente não vê, robô preenche, e a inscrição
// some calada. `sair: true` tira o e-mail da lista.
//
// O `p` do evento é um texto curto e fechado (id de festa, zona de filtro,
// origem, dia), nunca e-mail, nome ou texto livre. O id do convite é a chave
// do /p/<id> (quem tem o id lê e responde o plano), então entra como HMAC.
// O aparelho que abriu alguma página com ?equipe=1 manda 'equipe', e o
// resumo tira dele tudo, inclusive o que veio antes da marca.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EVENTOS = new Set([
  // páginas abertas
  'abriu-landing', 'abriu-app', 'abriu-convite', 'abriu-opiniao',
  // o caminho no app
  'lista', 'detalhe', 'ingresso', 'link-fora', 'mandar', 'convite', 'whatsapp', 'convite-resposta',
  // da landing para o app; quem chegou pelo QR Code de divulgação
  'landing-app', 'chegou-qr',
  // a marca da equipe; de onde a pessoa chegou (p = origem)
  'equipe', 'chegou',
  // a exploração da lista: ver todas, filtro (p = zona), mapa, troca de dia
  // (p = dia), a conversa de ajuste (p = entendido|nao-entendido)
  'todas', 'filtro', 'mapa', 'dia', 'ajuste',
  // a festa: pôr na agenda, compartilhar (p = zap|nativo|copiou), o ingresso
  // tocado no convite recebido
  'agenda', 'compartilhou', 'convite-ingresso',
  // a pergunta da opinião vista (p = app|opiniao) e o 'agora não'
  'opiniao-viu', 'opiniao-agora-nao',
]);
const PROP = /^[\p{L}\p{N}:._-]{1,80}$/u;
// Eventos do convite: o `p` (id do convite) nunca é gravado. O planos.json
// guarda nomes e respostas, e o id ligaria o convite ao uso anônimo do aparelho.
const P_DE_CONVITE = new Set(['convite', 'abriu-convite', 'convite-resposta']);
const DE_ONDE = new Set(['landing', 'app', 'opiniao', 'convite']);
const APARELHO = /^[A-Za-z0-9_-]{8,64}$/;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const TEXTO_MAX = 600;
const MAX_EVENTOS = 200000;
// Por aparelho e por dia: mais que isso é robô ou laço, e para de contar.
const MAX_POR_APARELHO_DIA = 300;
// A frase que vai junto do campo de e-mail, e que fica gravada com ele.
const FINALIDADE_LISTA = 'Só para mandar as novidades do finde. Fica guardado até 31/12/2026, e você sai quando quiser.';
const FINALIDADE_OPINIAO = 'A nota e o comentário vão sem nome, junto da contagem anônima do que você fez no app, e ficam guardados até 31/12/2026. Servem pra gente saber se o protótipo ajudou.';

const hmac = (sal, texto) => crypto.createHmac('sha256', sal).update(texto, 'utf8').digest('hex').slice(0, 16);
const diaEmSaoPaulo = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

function gravar(arquivo, dados, modo = 0o600) {
  const tmp = `${arquivo}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, typeof dados === 'string' ? dados : JSON.stringify(dados), { mode: modo });
  fs.renameSync(tmp, arquivo);
}

// Normaliza e confere um e-mail. Devolve o e-mail em minúsculas ou null.
function emailValido(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL.test(e)) return null;
  return e;
}

// A nota de indicação (NPS): promotores (9 e 10) menos detratores (0 a 6),
// em pontos de -100 a 100, sobre a última nota de cada aparelho.
function nps(notas) {
  const n = notas.length;
  if (!n) return { respostas: 0, nps: null, promotores: 0, neutros: 0, detratores: 0, media: null };
  const promotores = notas.filter((x) => x >= 9).length;
  const detratores = notas.filter((x) => x <= 6).length;
  return {
    respostas: n,
    nps: Math.round(((promotores - detratores) / n) * 100),
    promotores,
    neutros: n - promotores - detratores,
    detratores,
    media: Math.round((notas.reduce((a, b) => a + b, 0) / n) * 10) / 10,
  };
}

// Um limitador por chave (o IP de quem pede): `max` pedidos por `janelaMs`.
function criarLimite({ max, janelaMs, agoraMs = () => Date.now() }) {
  const vistos = new Map();
  return (chave) => {
    const agora = agoraMs();
    const lista = (vistos.get(chave) || []).filter((t) => agora - t < janelaMs);
    if (lista.length >= max) {
      vistos.set(chave, lista);
      return false;
    }
    lista.push(agora);
    vistos.set(chave, lista);
    if (vistos.size > 5000) for (const [k, v] of vistos) if (!v.some((t) => agora - t < janelaMs)) vistos.delete(k);
    return true;
  };
}

// As contas do resumo, sobre os eventos e as opiniões já lidos (agregar() é
// pura: os testes passam dados fictícios e um "agora").
const MEIA_HORA = 30 * 60 * 1000;
// O funil encadeado: cada passo só conta quem fez o anterior, antes ou junto.
const FUNIL = [
  ['abriu-app', ['abriu-app']],
  ['lista', ['lista']],
  ['detalhe', ['detalhe']],
  ['mandar-ou-convite', ['mandar', 'convite']],
  ['whatsapp', ['whatsapp']],
];
// Eventos cujo `p` é uma categoria pequena e vale contar por valor.
const CATEGORIAS = ['chegou', 'filtro', 'dia', 'ajuste', 'compartilhou', 'opiniao-viu'];
// Eventos cujo `p` é o id de uma festa real.
const DA_FESTA = ['detalhe', 'ingresso', 'mandar', 'convite-ingresso', 'link-fora'];
// A etapa máxima de cada pessoa no uso, da mais rasa à mais funda.
const ETAPAS = ['sem-uso', 'entrou', 'lista', 'detalhe', 'ingresso', 'mandou'];

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);
const mediana = (v) => {
  if (!v.length) return null;
  const s = [...v].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const umaCasa = (x) => Math.round(x * 10) / 10;
// { chave: { vezes, pessoas: Set } } -> { chave: { vezes, pessoas: n } }, por ordem de chave.
const contado = (m) => Object.fromEntries(Object.entries(m).sort().map(([k, v]) => [k, { vezes: v.vezes, pessoas: v.pessoas.size }]));
const somar = (m, chave, a) => {
  (m[chave] ||= { vezes: 0, pessoas: new Set() }).vezes += 1;
  m[chave].pessoas.add(a);
};

// Um uso (25/11, pedido do Caio: um celular pode passar por várias mãos):
// começa a cada página aberta (app, landing, convite, opinião) ou depois de
// 30 min parado. Recarregar a página conta como outro uso.
const ABRE_USO = new Set(['abriu-app', 'abriu-landing', 'abriu-convite', 'abriu-opiniao']);
function usosDe(l) {
  const usos = [];
  for (let i = 0; i < l.length; i += 1) {
    const novo = i === 0 || ABRE_USO.has(l[i].ev) || Date.parse(l[i].em) - Date.parse(l[i - 1].em) > MEIA_HORA;
    if (novo) usos.push([]);
    usos[usos.length - 1].push(l[i]);
  }
  return usos;
}

// O funil encadeado numa lista de eventos já em ordem: quantos passos ela fez.
function passosDoFunil(l) {
  let desde = null;
  let i = 0;
  for (; i < FUNIL.length; i += 1) {
    const e = l.find((x) => FUNIL[i][1].includes(x.ev) && (desde === null || x.em >= desde));
    if (!e) break;
    desde = e.em;
  }
  return i;
}

function etapaDe(nomes) {
  if (!nomes) return 'sem-uso';
  if (nomes.has('mandar') || nomes.has('convite') || nomes.has('whatsapp')) return 'mandou';
  if (nomes.has('ingresso')) return 'ingresso';
  if (nomes.has('detalhe')) return 'detalhe';
  if (nomes.has('lista')) return 'lista';
  return 'entrou';
}

function agregar(todos, todasOpinioes, agoraIso) {
  // A equipe sai de tudo, inclusive do que fez antes de se marcar.
  const equipe = new Set(todos.filter((e) => e.ev === 'equipe').map((e) => e.a));
  const evs = todos.filter((e) => !equipe.has(e.a));
  const opinioes = todasOpinioes.filter((o) => !equipe.has(o.a));

  const porA = new Map();
  for (const e of evs) {
    if (!porA.has(e.a)) porA.set(e.a, []);
    porA.get(e.a).push(e);
  }
  for (const l of porA.values()) l.sort((x, y) => x.em.localeCompare(y.em));

  const porEvento = {};
  const porDia = {};
  const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, {}]));
  const festas = {};
  for (const e of evs) {
    somar(porEvento, e.ev, e.a);
    (porDia[diaEmSaoPaulo(e.em)] ||= new Set()).add(e.a);
    if (!e.p) continue;
    if (porCategoria[e.ev]) somar(porCategoria[e.ev], e.p, e.a);
    if (DA_FESTA.includes(e.ev)) somar((festas[e.p] ||= {}), e.ev, e.a);
  }

  // Funil, retenção, sessões e etapa, aparelho por aparelho.
  const funil = FUNIL.map(() => 0);
  const hoje = diaEmSaoPaulo(agoraIso);
  const ret = { d1: { base: 0, voltaram: 0 }, d7: { base: 0, voltaram: 0 }, outroDia: 0 };
  const sessoes = [];
  const diasAtivos = [];
  const nomesDe = new Map();
  // Os mesmos números, contados por uso em vez de por aparelho.
  const usos = { total: 0, porDia: {}, funil: FUNIL.map(() => 0), comEvento: {} };
  for (const [a, l] of porA) {
    for (let i = 0; i < passosDoFunil(l); i += 1) funil[i] += 1;
    for (const u of usosDe(l)) {
      usos.total += 1;
      const dia = diaEmSaoPaulo(u[0].em);
      usos.porDia[dia] = (usos.porDia[dia] || 0) + 1;
      for (let i = 0; i < passosDoFunil(u); i += 1) usos.funil[i] += 1;
      for (const ev of new Set(u.map((e) => e.ev))) usos.comEvento[ev] = (usos.comEvento[ev] || 0) + 1;
    }
    // D1: voltou no dia seguinte ao primeiro; D7: voltou entre o 7º e o 9º
    // dia. A base é quem entrou há tempo bastante para ter voltado.
    const dias = new Set(l.map((e) => diaEmSaoPaulo(e.em)));
    const d0 = diaEmSaoPaulo(l[0].em);
    for (const [k, de, ate] of [['d1', 1, 1], ['d7', 7, 9]]) {
      if (diasEntre(d0, hoje) < de) continue;
      ret[k].base += 1;
      if ([...dias].some((d) => diasEntre(d0, d) >= de && diasEntre(d0, d) <= ate)) ret[k].voltaram += 1;
    }
    if (dias.size > 1) ret.outroDia += 1;
    diasAtivos.push(dias.size);
    // Sessão: eventos com menos de 30 min entre um e outro.
    let s = 1;
    for (let i = 1; i < l.length; i += 1) if (Date.parse(l[i].em) - Date.parse(l[i - 1].em) > MEIA_HORA) s += 1;
    sessoes.push(s);
    nomesDe.set(a, new Set(l.map((e) => e.ev)));
  }

  // O convite: quantos foram criados, abertos e respondidos, e quem chegou ao
  // finde pela primeira vez por ele. Os eventos do convite não levam o id dele
  // (o planos.json guarda nomes; ligar os dois desfaria o anonimato do uso).
  // Quem criou não conta 'abriu-convite' do próprio convite (medir.js).
  const criacoes = evs.filter((e) => e.ev === 'convite');
  const aberturas = evs.filter((e) => e.ev === 'abriu-convite');
  const respostas = evs.filter((e) => e.ev === 'convite-resposta');
  const criou = new Set(criacoes.map((e) => e.a));
  const novos = [...porA].filter(([a, l]) => !criou.has(a) && (l[0].ev === 'abriu-convite' || (l[0].ev === 'chegou' && l[0].p === 'convite')));

  // A opinião: a taxa de resposta entre quem viu a pergunta, por origem, e o
  // NPS pela etapa mais funda a que a pessoa chegou.
  const taxa = {};
  for (const de of ['app', 'opiniao']) {
    const viram = porCategoria['opiniao-viu'][de]?.pessoas || new Set();
    const daqui = opinioes.filter((o) => o.de === de);
    taxa[de] = { viram: viram.size, responderam: daqui.filter((o) => viram.has(o.a)).length, respostas: daqui.length };
  }
  const notasPorEtapa = {};
  for (const o of opinioes) (notasPorEtapa[etapaDe(nomesDe.get(o.a))] ||= []).push(o.nota);

  const topFestas = Object.entries(festas).map(([id, m]) => ({ id, ...contado(m) }))
    .sort((x, y) => (y.detalhe?.pessoas || 0) - (x.detalhe?.pessoas || 0)
      || (y.ingresso?.pessoas || 0) - (x.ingresso?.pessoas || 0)
      || (y.mandar?.pessoas || 0) - (x.mandar?.pessoas || 0)
      || x.id.localeCompare(y.id))
    .slice(0, 15);

  return {
    equipeFora: equipe.size,
    desde: evs.length ? evs.reduce((m, e) => (e.em < m ? e.em : m), evs[0].em) : null,
    pessoas: porA.size,
    eventos: contado(porEvento),
    porDia: Object.fromEntries(Object.entries(porDia).sort().map(([d, s]) => [d, s.size])),
    funil: FUNIL.map(([passo], i) => ({ passo, pessoas: funil[i] })),
    usos: {
      total: usos.total,
      porDia: Object.fromEntries(Object.entries(usos.porDia).sort()),
      funil: FUNIL.map(([passo], i) => ({ passo, usos: usos.funil[i] })),
      comEvento: Object.fromEntries(Object.entries(usos.comEvento).sort()),
    },
    retencao: ret,
    uso: {
      pessoas: porA.size,
      sessoes: sessoes.reduce((x, y) => x + y, 0),
      sessoesPorPessoa: sessoes.length ? umaCasa(sessoes.reduce((x, y) => x + y, 0) / sessoes.length) : null,
      sessoesMediana: mediana(sessoes),
      comMaisDeUmaSessao: sessoes.filter((s) => s > 1).length,
      diasAtivosMedia: diasAtivos.length ? umaCasa(diasAtivos.reduce((x, y) => x + y, 0) / diasAtivos.length) : null,
    },
    porCategoria: Object.fromEntries(Object.entries(porCategoria).map(([k, m]) => [k, contado(m)])),
    topFestas,
    convite: {
      criados: criacoes.length,
      aberturas: aberturas.length,
      pessoasQueAbriram: new Set(aberturas.map((e) => e.a)).size,
      respostas: respostas.length,
      pessoasQueResponderam: new Set(respostas.map((e) => e.a)).size,
      novos: novos.length,
      novosQueAbriramOApp: novos.filter(([, l]) => l.some((e) => e.ev === 'abriu-app')).length,
    },
    opinioes,
    taxaDeResposta: taxa,
    npsPorEtapa: Object.fromEntries(ETAPAS.filter((k) => notasPorEtapa[k]).map((k) => [k, nps(notasPorEtapa[k])])),
  };
}

// criarValidacao({ dir, site, agora, log })
//   -> { evento, opiniao, inscrever, numeros, listaCsv, expurgar }
function criarValidacao({ dir, site = 'app', agora = () => new Date().toISOString(), log = console } = {}) {
  if (!dir) throw new Error('criarValidacao: falta o diretório');
  const arqUso = path.join(dir, 'validacao-uso.jsonl');
  const arqOpinioes = path.join(dir, 'validacao-opinioes.json');
  const arqLista = path.join(dir, 'validacao-lista.json');
  const arqSal = path.join(dir, 'validacao-sal');
  let sal = null;

  function oSal() {
    if (sal) return sal;
    try {
      sal = fs.readFileSync(arqSal, 'utf8').trim();
    } catch {
      sal = '';
    }
    if (!/^[a-f0-9]{64}$/.test(sal)) {
      sal = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(dir, { recursive: true });
      gravar(arqSal, sal);
    }
    return sal;
  }
  const chaveDo = (aparelho) => (typeof aparelho === 'string' && APARELHO.test(aparelho) ? hmac(oSal(), `aparelho\n${aparelho}`) : null);

  let contagem = null;
  const porAparelhoDia = new Map();
  let avisouTeto = false;
  function eventos() {
    try {
      return fs.readFileSync(arqUso, 'utf8').split('\n').filter(Boolean).map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  // Um evento de uso. Devolve true se contou.
  function evento({ evento: nome, aparelho, p } = {}) {
    if (typeof nome !== 'string' || !EVENTOS.has(nome)) return false;
    const a = chaveDo(aparelho);
    if (!a) return false;
    if (contagem === null) contagem = eventos().length;
    // 'equipe' grava uma linha só e passa pelos tetos: sem ela, a equipe não sai da conta.
    if (contagem >= MAX_EVENTOS && nome !== 'equipe') {
      if (!avisouTeto) log.warn(`[finde] validação: o uso bateu ${MAX_EVENTOS} eventos e parou de contar`);
      avisouTeto = true;
      return false;
    }
    const em = agora();
    const chaveDia = `${diaEmSaoPaulo(em)}|${a}`;
    const vezes = porAparelhoDia.get(chaveDia) || 0;
    if (vezes >= MAX_POR_APARELHO_DIA && nome !== 'equipe') return false;
    if (porAparelhoDia.size > 20000) porAparelhoDia.clear();
    porAparelhoDia.set(chaveDia, vezes + 1);
    // O `p` fora da regra não derruba o evento: conta sem ele.
    let prop = nome !== 'equipe' && typeof p === 'string' && PROP.test(p) ? p : null;
    if (P_DE_CONVITE.has(nome)) prop = null;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(arqUso, `${JSON.stringify({ em, ev: nome, a, ...(prop ? { p: prop } : {}) })}\n`, { mode: 0o600 });
    contagem += 1;
    return true;
  }

  // A nota de 0 a 10 e um comentário opcional. A última de cada aparelho vale.
  function opiniao({ nota, texto, aparelho, de } = {}) {
    const a = chaveDo(aparelho);
    if (!a) return { ok: false, erro: 'Recarregue a página e tente de novo.' };
    if (!Number.isInteger(nota) || nota < 0 || nota > 10) return { ok: false, erro: 'Escolha uma nota de 0 a 10.' };
    const t = typeof texto === 'string' ? texto.trim().slice(0, TEXTO_MAX) : '';
    const dados = lerJson(arqOpinioes, { opinioes: [] });
    const antes = dados.opinioes.findIndex((o) => o.a === a);
    const nova = { em: agora(), a, nota, texto: t || null, de: DE_ONDE.has(de) ? de : site };
    if (antes >= 0) dados.opinioes[antes] = nova;
    else dados.opinioes.push(nova);
    fs.mkdirSync(dir, { recursive: true });
    gravar(arqOpinioes, dados);
    return { ok: true, trocou: antes >= 0 };
  }

  // Um e-mail na lista. Repetido não duplica. Com `sair`, tira da lista.
  function inscrever({ email, de, site: isca, sair = false } = {}) {
    if (typeof isca === 'string' && isca.trim()) return { ok: true, ja: false, isca: true };
    const e = emailValido(email);
    if (!e) return { ok: false, erro: 'Esse e-mail não parece certo. Confere?' };
    const dados = lerJson(arqLista, { inscritos: [] });
    if (sair === true) {
      const antes = dados.inscritos.length;
      dados.inscritos = dados.inscritos.filter((i) => i.email !== e);
      if (dados.inscritos.length !== antes) gravar(arqLista, dados);
      return { ok: true, saiu: true };
    }
    if (dados.inscritos.some((i) => i.email === e)) return { ok: true, ja: true };
    // Só o dia: a hora exata casaria o e-mail com a nota mandada junto.
    dados.inscritos.push({ em: agora().slice(0, 10), email: e, de: DE_ONDE.has(de) ? de : site, finalidade: FINALIDADE_LISTA });
    fs.mkdirSync(dir, { recursive: true });
    gravar(arqLista, dados);
    return { ok: true, ja: false };
  }

  // O resumo: pessoas (aparelhos) por evento e por dia, o funil, a volta, o
  // convite, a nota e a lista, sem os aparelhos da equipe (agregar()).
  function numeros() {
    const { opinioes, ...r } = agregar(eventos(), lerJson(arqOpinioes, { opinioes: [] }).opinioes, agora());
    const lista = lerJson(arqLista, { inscritos: [] }).inscritos;
    return {
      site,
      geradoEm: agora(),
      ...r,
      opiniao: {
        ...nps(opinioes.map((o) => o.nota)),
        comentarios: opinioes.filter((o) => o.texto).map((o) => ({ em: o.em, nota: o.nota, texto: o.texto, de: o.de })),
      },
      lista: { inscritos: lista.length, porOrigem: lista.reduce((m, i) => ({ ...m, [i.de]: (m[i.de] || 0) + 1 }), {}) },
    };
  }

  function listaCsv() {
    const lista = lerJson(arqLista, { inscritos: [] }).inscritos;
    // Sem fórmula: célula que começa com = + - @ tab ou CR ganha um apóstrofo.
    const campo = (v) => {
      const t = String(v ?? '');
      return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
    };
    return ['email,inscrito_em,de', ...lista.map((i) => [i.email, i.em, i.de].map(campo).join(','))].join('\n') + '\n';
  }

  // Apaga tudo (o prazo de guarda do protótipo, D15): uso, opiniões, lista e sal.
  function expurgar() {
    const apagar = [arqUso, arqOpinioes, arqLista, arqSal];
    for (const a of apagar) {
      try {
        fs.rmSync(a, { force: true });
      } catch (e) {
        log.warn(`[finde] validação: não apaguei ${path.basename(a)}: ${e.message}`);
      }
    }
    contagem = null;
    sal = null;
    porAparelhoDia.clear();
  }

  return { evento, opiniao, inscrever, numeros, listaCsv, expurgar };
}

const ARQUIVOS = ['validacao-uso.jsonl', 'validacao-opinioes.json', 'validacao-lista.json', 'validacao-sal'];

module.exports = { criarValidacao, criarLimite, emailValido, nps, agregar, EVENTOS, PROP, ARQUIVOS, FINALIDADE_LISTA, FINALIDADE_OPINIAO };

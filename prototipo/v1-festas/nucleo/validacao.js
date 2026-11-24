'use strict';
// Os dados de validação do protótipo (24/11/2026): quantas pessoas usaram,
// o que acharam e quem quer receber as novidades. Cada site (a landing e o
// app) guarda os seus no próprio volume, e ferramentas/numeros.js junta.
//
//   POST /api/uso            { evento, aparelho }                 contagem sem nome
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

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EVENTOS = new Set([
  // páginas abertas
  'abriu-landing', 'abriu-app', 'abriu-convite', 'abriu-opiniao',
  // o caminho no app
  'lista', 'detalhe', 'ingresso', 'link-fora', 'mandar', 'convite', 'whatsapp', 'convite-resposta',
  // da landing para o app
  'landing-app',
]);
const DE_ONDE = new Set(['landing', 'app', 'opiniao', 'convite']);
const APARELHO = /^[A-Za-z0-9_-]{8,64}$/;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const TEXTO_MAX = 600;
const MAX_EVENTOS = 200000;
// Por aparelho e por dia: mais que isso é robô ou laço, e para de contar.
const MAX_POR_APARELHO_DIA = 300;
// A frase que vai junto do campo de e-mail, e que fica gravada com ele.
const FINALIDADE_LISTA = 'Só para mandar as novidades do finde. Fica guardado até 31/12/2026, e você sai quando quiser.';
const FINALIDADE_OPINIAO = 'A nota e o comentário vão sem nome e ficam guardados até 31/12/2026. Servem pra gente saber se o protótipo ajudou.';

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
  function evento({ evento: nome, aparelho } = {}) {
    if (typeof nome !== 'string' || !EVENTOS.has(nome)) return false;
    const a = chaveDo(aparelho);
    if (!a) return false;
    if (contagem === null) contagem = eventos().length;
    if (contagem >= MAX_EVENTOS) {
      if (!avisouTeto) log.warn(`[finde] validação: o uso bateu ${MAX_EVENTOS} eventos e parou de contar`);
      avisouTeto = true;
      return false;
    }
    const em = agora();
    const chaveDia = `${diaEmSaoPaulo(em)}|${a}`;
    const vezes = porAparelhoDia.get(chaveDia) || 0;
    if (vezes >= MAX_POR_APARELHO_DIA) return false;
    if (porAparelhoDia.size > 20000) porAparelhoDia.clear();
    porAparelhoDia.set(chaveDia, vezes + 1);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(arqUso, `${JSON.stringify({ em, ev: nome, a })}\n`, { mode: 0o600 });
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
    dados.inscritos.push({ em: agora(), email: e, de: DE_ONDE.has(de) ? de : site, finalidade: FINALIDADE_LISTA });
    fs.mkdirSync(dir, { recursive: true });
    gravar(arqLista, dados);
    return { ok: true, ja: false };
  }

  // O resumo: pessoas (aparelhos) por evento, por dia, a nota e a lista.
  function numeros() {
    const evs = eventos();
    const pessoas = new Set(evs.map((e) => e.a));
    const porEvento = {};
    const porDia = {};
    for (const e of evs) {
      (porEvento[e.ev] ||= { vezes: 0, pessoas: new Set() }).vezes += 1;
      porEvento[e.ev].pessoas.add(e.a);
      const d = diaEmSaoPaulo(e.em);
      (porDia[d] ||= new Set()).add(e.a);
    }
    const opinioes = lerJson(arqOpinioes, { opinioes: [] }).opinioes;
    const lista = lerJson(arqLista, { inscritos: [] }).inscritos;
    return {
      site,
      geradoEm: agora(),
      desde: evs.length ? evs[0].em : null,
      pessoas: pessoas.size,
      eventos: Object.fromEntries(Object.entries(porEvento).sort().map(([k, v]) => [k, { vezes: v.vezes, pessoas: v.pessoas.size }])),
      porDia: Object.fromEntries(Object.entries(porDia).sort().map(([d, s]) => [d, s.size])),
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

module.exports = { criarValidacao, criarLimite, emailValido, nps, EVENTOS, ARQUIVOS, FINALIDADE_LISTA, FINALIDADE_OPINIAO };

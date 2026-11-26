'use strict';
// Planos: uma festa mandada pro grupo, e quem respondeu "tô dentro" ou "não rola".
// Guardados em <var>/planos.json, regravado inteiro a cada mudança
// (arquivo temporário e rename, para nunca deixar o arquivo pela metade).
// A avaliação pós-festa ("O público tinha a sua idade?") saiu em 26/11/2026,
// com a idade do produto, até a idade do público ser validada.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class ErroPlano extends Error {
  constructor(status, mensagem, dados = {}) {
    super(mensagem);
    this.status = status;
    this.dados = dados;
  }
}

const LIMITE_NOME = 24;
const LIMITE_RESPOSTAS = 60;
const RESPOSTAS = ['dentro', 'fora'];
const FORMATO_ID = /^[a-z0-9]{8}$/;

// Nome de gente: guardado como texto, do jeito que veio (a página escreve com
// textContent, e o servidor escapa onde precisa). Só sai caractere de controle
// e espaço repetido, e corta em 24 caracteres.
function limparNome(nome) {
  if (typeof nome !== 'string') return null;
  const s = nome
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cortado = Array.from(s).slice(0, LIMITE_NOME).join('').trim();
  return cortado || null;
}

const chaveNome = (nome) => nome.toLocaleLowerCase('pt-BR');

function novoId(existe) {
  for (;;) {
    let id = '';
    for (const b of crypto.randomBytes(8)) id += (b % 36).toString(36);
    if (!existe(id)) return id;
  }
}

// A idade saiu do produto em 26/11/2026. O convite criado antes guardou o
// retrato da festa com ela (a média, a origem, a linha "· média 31 anos", a
// faixa do pedido e o porquê); daqui pra fora, ele sai sem nada disso.
const CAMPOS_DE_IDADE = ['mediaIdade', 'origemIdade', 'origemIdadeCurta', 'origemDetalhe', 'avaliacaoIdade', 'faixas'];
const FALA_DE_IDADE = /\bm[ée]dia\b|\bidade\b|\bfaixa\b/i;
const objeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
function festaSemIdade(f) {
  if (!objeto(f)) return f;
  const limpa = Object.fromEntries(Object.entries(f).filter(([k]) => !CAMPOS_DE_IDADE.includes(k)));
  if (objeto(f.campos)) limpa.campos = Object.fromEntries(Object.entries(f.campos).filter(([k]) => k !== 'mediaIdade'));
  // A fonte das avaliações de idade de quem foi só dava a média.
  if (Array.isArray(f.fontes)) limpa.fontes = f.fontes.filter((x) => !objeto(x) || x.id !== 'avaliacoes');
  if (Array.isArray(f.encontradaEm)) limpa.encontradaEm = f.encontradaEm.filter((x) => x !== 'avaliacoes');
  return limpa;
}
const semFalaDeIdade = (xs) => (Array.isArray(xs) ? xs.filter((x) => !(typeof x === 'string' && FALA_DE_IDADE.test(x))) : xs);
function retratoSemIdade(o) {
  if (!objeto(o)) return o;
  const r = { ...o, festa: festaSemIdade(o.festa) };
  delete r.origem;
  if (typeof r.linha === 'string') r.linha = r.linha.replace(/ · média \d+ anos$/, '');
  r.fora = semFalaDeIdade(r.fora);
  r.motivos = semFalaDeIdade(r.motivos);
  if (typeof r.aviso === 'string' && FALA_DE_IDADE.test(r.aviso)) {
    const resto = r.aviso.replace(/\.$/, '').split('; ').filter((x) => !FALA_DE_IDADE.test(x));
    r.aviso = resto.length ? `${resto.join('; ').replace(/^./, (x) => x.toUpperCase())}.` : null;
  }
  if (objeto(r.cara) && Array.isArray(r.cara.partes)) {
    r.cara = { ...r.cara, partes: r.cara.partes.filter((p) => !objeto(p) || p.criterio !== 'idade') };
    if (Array.isArray(r.cara.semDado)) r.cara.semDado = r.cara.semDado.filter((x) => x !== 'idade');
  }
  if (objeto(r.porque)) {
    const fora = (xs) => (Array.isArray(xs) ? xs.filter((p) => !objeto(p) || p.criterio !== 'idade') : xs);
    r.porque = { ...r.porque, cabe: fora(r.porque.cabe), falta: fora(r.porque.falta) };
  }
  return r;
}
// "Sáb · 19h à 1h · 30 a 35 · até R$ 80": sai a faixa ("30 a 35", "36 ou mais", "28 a 50+").
const pedidoSemIdade = (p) => (typeof p === 'string' ? p.replace(/ · (?:\d{2} a \d{2}\+?|\d{2} ou mais)(?= · |$)/, '') : p);

// O que vai para fora. `passou`: a festa já acabou, e o convite não aceita mais resposta.
function vista(plano, agora) {
  const nomes = (r) => plano.respostas.filter((x) => x.resposta === r).map((x) => x.nome);
  const passou = Boolean(plano.ate && agora && new Date(agora) > new Date(plano.ate));
  return {
    id: plano.id,
    autor: plano.autor,
    criadoEm: plano.criadoEm,
    festa: retratoSemIdade(plano.festa),
    pedido: pedidoSemIdade(plano.pedido),
    data: plano.data || null,
    passou,
    dentro: nomes('dentro'),
    fora: nomes('fora'),
  };
}

function criarPlanos(pasta, { agora = () => new Date().toISOString(), log = console } = {}) {
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, 'planos.json');
  let planos = {};
  try {
    const lido = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (lido && typeof lido === 'object' && !Array.isArray(lido)) planos = lido;
  } catch (e) {
    if (e.code !== 'ENOENT') log.warn(`[finde] não consegui ler ${arquivo} (${e.message}); começo sem planos`);
  }

  function gravar() {
    const tmp = `${arquivo}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(planos));
    fs.renameSync(tmp, arquivo);
  }

  function pegar(id) {
    if (typeof id !== 'string' || !FORMATO_ID.test(id) || !Object.hasOwn(planos, id)) {
      throw new ErroPlano(404, 'Esse convite não existe. Confira o link com quem mandou.');
    }
    return planos[id];
  }

  function exigirNome(nome) {
    const limpo = limparNome(nome);
    if (!limpo) throw new ErroPlano(400, 'Diga seu nome (até 24 letras).');
    return limpo;
  }

  function registrar(plano, nome, resposta, confirmar = true) {
    const chave = chaveNome(nome);
    const nova = { nome, resposta, em: agora() };
    const i = plano.respostas.findIndex((r) => chaveNome(r.nome) === chave);
    if (i >= 0 && !confirmar) {
      const existente = plano.respostas[i].nome;
      throw new ErroPlano(409, `Já tem ${existente} neste convite. É você?`, { duplicado: existente });
    }
    if (i >= 0) plano.respostas[i] = nova;
    else if (plano.respostas.length >= LIMITE_RESPOSTAS) throw new ErroPlano(409, 'Esse convite já tem respostas demais.');
    else plano.respostas.push(nova);
  }

  return {
    // festa: o retrato da opção no momento do envio (sobrevive a mudanças na base).
    // autor: opcional; quando vem, já entra como "tô dentro".
    criar({ festa, pedido, autor, quando }) {
      let nome = null;
      if (autor !== undefined && autor !== null && !(typeof autor === 'string' && autor.trim() === '')) {
        nome = limparNome(autor);
        if (!nome) throw new ErroPlano(400, 'O nome precisa ser texto, com até 24 letras.');
      }
      const id = novoId((x) => Object.hasOwn(planos, x));
      const plano = {
        id, criadoEm: agora(), autor: nome, festa, pedido: pedido || null, respostas: [],
        data: quando ? quando.data : null, ate: quando ? quando.ate : null,
      };
      if (nome) registrar(plano, nome, 'dentro');
      planos[id] = plano;
      gravar();
      return vista(plano, agora());
    },

    ler(id) {
      return vista(pegar(id), agora());
    },

    existe(id) {
      return typeof id === 'string' && FORMATO_ID.test(id) && Object.hasOwn(planos, id);
    },

    // Nome repetido só substitui com confirmar: true ("É você?").
    responder(id, nome, resposta, { confirmar = false } = {}) {
      const plano = pegar(id);
      const limpo = exigirNome(nome);
      if (!RESPOSTAS.includes(resposta)) throw new ErroPlano(400, 'Responda "dentro" ou "fora".');
      if (vista(plano, agora()).passou) throw new ErroPlano(410, 'Essa já foi. O convite não aceita mais resposta.');
      registrar(plano, limpo, resposta, confirmar === true);
      gravar();
      return vista(plano, agora());
    },

    // Os hashes das imagens citadas por convite de festa que não passou: a
    // rota /imagens/ continua servindo o flyer de um convite vivo, mesmo que
    // a festa saia da base (KTD14).
    imagensVigentes() {
      const hashes = new Set();
      const momento = agora();
      for (const plano of Object.values(planos)) {
        if (vista(plano, momento).passou) continue;
        const f = plano.festa && plano.festa.festa;
        if (!f) continue;
        for (const img of [...(Array.isArray(f.imagens) ? f.imagens : []), f.cartaz]) {
          if (img && typeof img === 'object' && typeof img.id === 'string') hashes.add(img.id);
        }
      }
      return hashes;
    },
  };
}

module.exports = { criarPlanos, limparNome, ErroPlano, LIMITE_NOME, LIMITE_RESPOSTAS, retratoSemIdade, pedidoSemIdade };

'use strict';
// Planos: uma festa mandada pro grupo, e quem respondeu "tô dentro" ou "não rola".
// Guardados em <var>/planos.json, regravado inteiro a cada mudança
// (arquivo temporário e rename, para nunca deixar o arquivo pela metade).

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

// O que vai para fora.
function vista(plano) {
  const nomes = (r) => plano.respostas.filter((x) => x.resposta === r).map((x) => x.nome);
  return {
    id: plano.id,
    autor: plano.autor,
    criadoEm: plano.criadoEm,
    festa: plano.festa,
    pedido: plano.pedido,
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
      throw new ErroPlano(409, `Já tem ${existente} na lista. É você?`, { duplicado: existente });
    }
    if (i >= 0) plano.respostas[i] = nova;
    else if (plano.respostas.length >= LIMITE_RESPOSTAS) throw new ErroPlano(409, 'Esse convite já tem respostas demais.');
    else plano.respostas.push(nova);
  }

  return {
    // festa: o retrato da opção no momento do envio (sobrevive a mudanças na base).
    // autor: opcional; quando vem, já entra como "tô dentro".
    criar({ festa, pedido, autor }) {
      let nome = null;
      if (autor !== undefined && autor !== null && !(typeof autor === 'string' && autor.trim() === '')) {
        nome = limparNome(autor);
        if (!nome) throw new ErroPlano(400, 'O nome precisa ser texto, com até 24 letras.');
      }
      const id = novoId((x) => Object.hasOwn(planos, x));
      const plano = { id, criadoEm: agora(), autor: nome, festa, pedido: pedido || null, respostas: [] };
      if (nome) registrar(plano, nome, 'dentro');
      planos[id] = plano;
      gravar();
      return vista(plano);
    },

    ler(id) {
      return vista(pegar(id));
    },

    existe(id) {
      return typeof id === 'string' && FORMATO_ID.test(id) && Object.hasOwn(planos, id);
    },

    // Nome repetido só substitui com confirmar: true ("É você?").
    responder(id, nome, resposta, { confirmar = false } = {}) {
      const plano = pegar(id);
      const limpo = exigirNome(nome);
      if (!RESPOSTAS.includes(resposta)) throw new ErroPlano(400, 'Responda "dentro" ou "fora".');
      registrar(plano, limpo, resposta, confirmar === true);
      gravar();
      return vista(plano);
    },
  };
}

module.exports = { criarPlanos, limparNome, ErroPlano, LIMITE_NOME, LIMITE_RESPOSTAS };

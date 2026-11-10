'use strict';
// Planos: criar, ler, votar, fechar. Guardados em <var>/planos.json,
// regravado inteiro a cada mudança (arquivo temporário e rename).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class ErroPlano extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const LIMITE_NOME = 24;

// Nome de gente: sem HTML, sem caractere de controle, no máximo 24 caracteres.
function limparNome(nome) {
  if (typeof nome !== 'string') return null;
  const s = nome
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cortado = Array.from(s).slice(0, LIMITE_NOME).join('').trim();
  return cortado || null;
}

const chaveNome = (nome) => nome.toLocaleLowerCase('pt-BR');

function novoId(existe) {
  for (;;) {
    const bytes = crypto.randomBytes(8);
    let id = '';
    for (const b of bytes) id += (b % 36).toString(36);
    if (!existe(id)) return id;
  }
}

function contagem(plano) {
  return plano.opcoes.map((o) => plano.votos.filter((v) => v.opcao === o.experiencia.id).length);
}

// O que vai para fora: opções inteiras, com os nomes de quem votou em cada uma.
function vista(plano) {
  return {
    id: plano.id,
    autor: plano.autor,
    criadoEm: plano.criadoEm,
    criterios: plano.criterios,
    opcoes: plano.opcoes.map((o) => ({
      ...o,
      votos: plano.votos.filter((v) => v.opcao === o.experiencia.id).map((v) => v.nome),
    })),
    totalVotos: plano.votos.length,
    fechado: plano.fechado,
  };
}

function criarPlanos(pasta, { agora = () => new Date().toISOString() } = {}) {
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, 'planos.json');
  let planos = {};
  try {
    planos = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (!planos || typeof planos !== 'object' || Array.isArray(planos)) planos = {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[finde] não consegui ler ${arquivo} (${e.message}); começo sem planos`);
  }

  function gravar() {
    const tmp = `${arquivo}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(planos));
    fs.renameSync(tmp, arquivo);
  }

  function pegar(id) {
    if (typeof id !== 'string' || !Object.hasOwn(planos, id)) {
      throw new ErroPlano(404, 'Esse plano não existe. Confira o link com quem mandou.');
    }
    return planos[id];
  }

  function exigirNome(nome) {
    const limpo = limparNome(nome);
    if (!limpo) throw new ErroPlano(400, 'Diga seu nome (até 24 letras).');
    return limpo;
  }

  return {
    criar({ criterios, opcoes, autor }) {
      const nome = exigirNome(autor);
      const id = novoId((x) => Object.hasOwn(planos, x));
      planos[id] = { id, criadoEm: agora(), autor: nome, criterios, opcoes, votos: [], fechado: null };
      gravar();
      return vista(planos[id]);
    },

    ler(id) {
      return vista(pegar(id));
    },

    votar(id, nome, opcao) {
      const plano = pegar(id);
      const limpo = exigirNome(nome);
      if (plano.fechado) throw new ErroPlano(409, 'Esse programa já fechou. Não dá mais para votar.');
      if (!plano.opcoes.some((o) => o.experiencia.id === opcao)) {
        throw new ErroPlano(400, 'Essa opção não está no plano.');
      }
      const chave = chaveNome(limpo);
      const voto = { nome: limpo, opcao, em: agora() };
      const i = plano.votos.findIndex((v) => chaveNome(v.nome) === chave);
      if (i >= 0) plano.votos[i] = voto;
      else plano.votos.push(voto);
      gravar();
      return vista(plano);
    },

    fechar(id, nome) {
      const plano = pegar(id);
      const limpo = exigirNome(nome);
      if (plano.fechado) return vista(plano);
      if (plano.votos.length < 2) throw new ErroPlano(409, 'Precisa de pelo menos dois votos para fechar.');
      const votos = contagem(plano);
      // Mais votada; empate fica com a que está mais acima na lista.
      let melhor = 0;
      votos.forEach((n, i) => {
        if (n > votos[melhor]) melhor = i;
      });
      plano.fechado = { opcao: plano.opcoes[melhor].experiencia.id, por: limpo, em: agora() };
      gravar();
      return vista(plano);
    },
  };
}

module.exports = { criarPlanos, limparNome, ErroPlano, LIMITE_NOME };

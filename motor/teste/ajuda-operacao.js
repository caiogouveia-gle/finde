'use strict';
// Peças dos testes da operação (curadoria, relatório, avaliações, expurgo,
// servidor): semear festas por uma fonte fixa e achar o id de cada uma. Nenhum
// teste toca a rede nem o banco real.
const { executar } = require('../nucleo/coleta');
const { logMudo } = require('./ajuda');

const fonteFixa = (id, itens) => ({ id, nome: id, coletar: async () => ({ itens, avisos: [] }) });

// itens: [{ fonte, idExterno, bruto, texto? }]. Cada fonte roda como uma
// execução, sem classificador, sem Apify e sem fontes de festa (tempo 4).
async function semear(db, itens, agora, opcoes = {}) {
  const porFonte = new Map();
  for (const i of itens) {
    if (!porFonte.has(i.fonte)) porFonte.set(i.fonte, []);
    porFonte.get(i.fonte).push({ idExterno: i.idExterno, bruto: i.bruto, texto: i.texto });
  }
  const resultados = [];
  for (const [fonte, lista] of porFonte) {
    resultados.push(await executar({
      db, fontes: [fonteFixa(fonte, lista)], claude: null, apify: null, classificar: false, fontesDeFesta: [],
      agora, log: logMudo, config: {}, ...opcoes,
    }));
  }
  return resultados;
}

// O id da festa de um item.
const festaDe = (db, fonte, idExterno) => {
  const v = db.prepare('SELECT festa_id FROM vinculos WHERE fonte = ? AND id_externo = ?').get(fonte, idExterno);
  return v ? v.festa_id : null;
};

module.exports = { fonteFixa, semear, festaDe };

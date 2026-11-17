'use strict';
// Indicação do grupo (curadoria manual). Alguém do grupo manda um link; quem
// cuida da base abre a página pública, lê e preenche o registro à mão num JSON
// em motor/entrada/indicacoes/ (fora do git: o repositório é público). Não há
// coletor: o Instagram, o RA e as plataformas de ingresso continuam fora (R15).
//
// Formato (exemplo em motor/exemplos/indicacoes/):
// {
//   "recebidaEm": "2026-11-16T21:37:00-03:00",
//   "festas": [{
//     "id": "...", "origem": "<o link como chegou>",
//     "leitura": [{ "url": "<página lida>", "lidoEm": "<instante>", "campos": ["data", "lotes"] }],
//     "nome": "...", "data": "...", ...os campos do envio da produtora
//   }]
// }
// Cada campo leva como conferidoEm o instante da leitura que o trouxe. Sem nome
// de quem indicou: só o link e o que ele aponta.

const fs = require('node:fs');
const path = require('node:path');
const { slug, url: urlValida } = require('../nucleo/normalizar');
const { dataDoExemplo } = require('./envio');

const instante = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

function itensDaIndicacao(corpo, { origem, mtime, agora = new Date() }) {
  const itens = [];
  const avisos = [];
  if (!corpo || typeof corpo !== 'object' || !Array.isArray(corpo.festas)) {
    return { itens, avisos: [`${origem}: a indicação não traz uma lista "festas"`] };
  }
  const recebida = instante(corpo.recebidaEm);
  for (const f of corpo.festas.slice(0, 200)) {
    if (!f || typeof f !== 'object') continue;
    const link = urlValida(f.origem);
    if (!link) {
      avisos.push(`${origem}: festa sem "origem" (o link indicado); não entra`);
      continue;
    }
    const porCampo = {};
    let ultima = null;
    for (const l of Array.isArray(f.leitura) ? f.leitura : []) {
      const quando = instante(l && l.lidoEm);
      if (!quando || !Array.isArray(l.campos)) continue;
      if (!ultima || quando > ultima) ultima = quando;
      for (const c of l.campos) if (!porCampo[c] || quando > porCampo[c]) porCampo[c] = quando;
    }
    const { origem: _o, leitura: _l, descricao, ...campos } = f;
    const chave = typeof f.id === 'string' && f.id.trim() ? slug(f.id) : slug(`${f.nome || ''}-${f.data || ''}`);
    itens.push({
      idExterno: `grupo:${chave}`.slice(0, 160),
      url: link,
      conferidoEm: ultima || recebida || mtime,
      conferidoPorCampo: porCampo,
      texto: typeof descricao === 'string' ? descricao.slice(0, 6000) : '',
      bruto: {
        ...campos,
        ...(corpo.exemplo === true ? { data: dataDoExemplo(f.data, agora), exemplo: true } : {}),
      },
    });
  }
  return { itens, avisos };
}

module.exports = {
  id: 'indicacao',
  nome: 'Indicado pelo grupo',
  itensDaIndicacao,
  async coletar({ log, config, agora = () => new Date() }) {
    const itens = [];
    const avisos = [];
    for (const pasta of config.pastas || []) {
      let nomes = [];
      try {
        nomes = fs.readdirSync(pasta).filter((n) => n.endsWith('.json')).sort();
      } catch (e) {
        if (e.code !== 'ENOENT') avisos.push(`a pasta ${pasta} não abriu (${e.message})`);
        continue;
      }
      for (const nome of nomes) {
        const arquivo = path.join(pasta, nome);
        let corpo;
        try {
          corpo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        } catch (e) {
          avisos.push(`${nome}: JSON inválido (${e.message})`);
          continue;
        }
        const r = itensDaIndicacao(corpo, { origem: nome, mtime: fs.statSync(arquivo).mtime.toISOString(), agora: agora() });
        itens.push(...r.itens);
        avisos.push(...r.avisos);
      }
      if (log && nomes.length) log.info(`[motor] indicação: ${nomes.length} arquivo(s) em ${pasta}`);
    }
    const ultimo = new Map(itens.map((i) => [i.idExterno, i]));
    return { itens: [...ultimo.values()], avisos };
  },
};

'use strict';
// Indicação (curadoria manual; no app, "Lido na página do ingresso"). Alguém
// do time do Finde manda um link; quem cuida da base abre a página pública,
// lê e preenche o registro à mão num JSON
// em motor/entrada/indicacoes/ (fora do git: o repositório é público). Não há
// coletor: o Instagram, o RA e as plataformas de ingresso continuam fora (R15).
//
// Formato (exemplo em motor/exemplos/indicacoes/):
// {
//   "recebidaEm": "2026-11-16T21:37:00-03:00",
//   "festas": [{
//     "id": "...", "origem": "<o link como chegou>",
//     "leitura": [{ "url": "<página lida>", "lidoEm": "<instante>", "campos": ["data", "lotes"],
//                   "tipo": "ingresso", "nome": "Ingresse" }],
//     "nome": "...", "data": "...", ...os campos do envio da produtora
//   }]
// }
// Cada campo leva como conferidoEm o instante da leitura que o trouxe. Sem nome
// de quem indicou: só o link e o que ele aponta, sem o código dele.
//
// `tipo` diz o que a página é: "ingresso" (a página de compra), "revenda",
// "materia", "oficial", "instagram" ou "outra". Sem tipo, sai do endereço
// (paginaDe). A lista vai no registro como `paginas`, e o app diz cada uma
// pelo que é: preço lido numa matéria não aparece como lido no ingresso.

const fs = require('node:fs');
const path = require('node:path');
const { slug, url: urlValida, semCodigo, TIPOS_PAGINA } = require('../nucleo/normalizar');
const { dataDoExemplo } = require('./envio');
const { NOME_FONTE } = require('../nucleo/catalogo');

const instante = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

// O que a página é e o nome do serviço, pelo endereço, quando a leitura não diz.
const SERVICOS = [
  [/(^|\.)ingresse\.com$/, 'ingresso', 'Ingresse'],
  [/(^|\.)sympla\.com\.br$/, 'ingresso', 'Sympla'],
  [/(^|\.)guicheweb\.com\.br$/, 'ingresso', 'Guichê Web'],
  [/(^|\.)shotgun\.live$/, 'ingresso', 'Shotgun'],
  [/(^|\.)eventbrite\.com(\.br)?$/, 'ingresso', 'Eventbrite'],
  [/(^|\.)dice\.fm$/, 'ingresso', 'DICE'],
  [/(^|\.)instagram\.com$/, 'instagram', 'Instagram'],
];
function paginaDe(l) {
  const u = semCodigo(l.url);
  if (!u) return null;
  const host = new URL(u).hostname.toLowerCase();
  const achado = SERVICOS.find(([re]) => re.test(host));
  const tipo = TIPOS_PAGINA.includes(l.tipo) ? l.tipo : achado ? achado[1] : 'outra';
  const nome = typeof l.nome === 'string' && l.nome.trim() ? l.nome.trim() : achado ? achado[2] : host.replace(/^www\./, '');
  return { tipo, nome, url: u, lidoEm: l.lidoEm, campos: l.campos };
}

// O link que representa a festa no rodapé: a página do ingresso lida por
// último; sem ela, a página de onde veio o preço; sem ela, o link indicado.
function principal(paginas, origem) {
  const maisNova = (ps) => ps.slice().sort((a, b) => Date.parse(b.lidoEm) - Date.parse(a.lidoEm))[0];
  const ingresso = maisNova(paginas.filter((p) => p.tipo === 'ingresso'));
  if (ingresso) return ingresso.url;
  const doPreco = maisNova(paginas.filter((p) => p.campos.includes('lotes')));
  return doPreco ? doPreco.url : semCodigo(origem);
}

// O cartaz que a leitura achou vira `item.imagens` (papel `cartaz-indicado`):
// o tempo 2 (nucleo/imagens.js) baixa, confere o endereço e recodifica; host
// fora da lista só vale para este papel. Só https. O crédito é o de quem divulga
// (a produtora, senão o serviço da página); a origem, a página lida.
function imagensDoCartaz(cartaz, { paginas, campos, link }) {
  if (typeof cartaz !== 'string' || !/^https:\/\//i.test(cartaz.trim())) return [];
  const prod = campos.produtora && typeof campos.produtora === 'object' ? campos.produtora.nome : campos.produtora;
  const quem = (typeof prod === 'string' && prod.trim()) || (paginas[0] && paginas[0].nome) || new URL(link).hostname.replace(/^www\./, '');
  return [{ url: cartaz.trim().slice(0, 500), papel: 'cartaz-indicado', origem: principal(paginas, link), credito: `Divulgação · ${quem}`, leitura: null }];
}

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
    const paginas = [];
    let ultima = null;
    for (const l of Array.isArray(f.leitura) ? f.leitura : []) {
      const quando = instante(l && l.lidoEm);
      if (!quando || !Array.isArray(l.campos)) continue;
      if (!ultima || quando > ultima) ultima = quando;
      for (const c of l.campos) if (!porCampo[c] || quando > porCampo[c]) porCampo[c] = quando;
      const p = paginaDe({ ...l, lidoEm: quando });
      if (p) paginas.push(p);
    }
    if (paginas.length) porCampo.paginas = ultima;
    const { origem: _o, leitura: _l, descricao, cartaz, ...campos } = f;
    const imagens = imagensDoCartaz(cartaz, { paginas, campos, link });
    const chave = typeof f.id === 'string' && f.id.trim() ? slug(f.id) : slug(`${f.nome || ''}-${f.data || ''}`);
    itens.push({
      idExterno: `grupo:${chave}`.slice(0, 160),
      url: principal(paginas, link),
      conferidoEm: ultima || recebida || mtime,
      conferidoPorCampo: porCampo,
      ...(imagens.length ? { imagens } : {}),
      texto: typeof descricao === 'string' ? descricao.slice(0, 6000) : '',
      bruto: {
        ...campos,
        ...(paginas.length ? { paginas } : {}),
        ...(corpo.exemplo === true ? { data: dataDoExemplo(f.data, agora), exemplo: true } : {}),
      },
    });
  }
  return { itens, avisos };
}

module.exports = {
  id: 'indicacao',
  // O nome público diz o que é: alguém leu a página do ingresso à mão. Não é
  // o grupo de quem usa o app.
  nome: NOME_FONTE.indicacao,
  itensDaIndicacao,
  paginaDe,
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

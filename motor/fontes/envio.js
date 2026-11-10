'use strict';
// Envio direto pela produtora (M1), a fonte principal do motor: é a única que
// pode trazer média de idade (R16). Dois caminhos, o mesmo formato:
//
//   1. arquivo JSON numa pasta de entrada (motor/entrada/ por padrão);
//   2. POST /api/envios com o token da produtora (servidor.js), guardado na
//      tabela `envios` e processado aqui na coleta seguinte.
//
// Formato: { produtora: { nome, instagram }, festas: [ { id, nome, data, inicio, ... } ] }
// (exemplos em motor/exemplos/envios/). Pelo endpoint, o nome da produtora vem
// do cadastro dela, não do corpo: uma produtora não fala em nome de outra.

const fs = require('node:fs');
const path = require('node:path');
const { slug } = require('../nucleo/normalizar');

const MAX_FESTAS = 200;

// Só nos exemplos: "proxima-sexta", "proximo-sabado", "proximo-domingo" viram a
// data do próximo fim de semana, para a demonstração não envelhecer.
const DIAS_EXEMPLO = { 'proxima-sexta': 0, 'proximo-sabado': 1, 'proximo-domingo': 2 };
function dataDoExemplo(valor, agora) {
  if (!Object.hasOwn(DIAS_EXEMPLO, valor)) return valor;
  const hoje = new Date(agora.getTime() - 3 * 3600e3); // relógio de São Paulo
  const ateSexta = (5 - hoje.getUTCDay() + 7) % 7; // sexta de hoje ou a próxima
  return new Date(hoje.getTime() + (ateSexta + DIAS_EXEMPLO[valor]) * 86400e3).toISOString().slice(0, 10);
}

function itensDoEnvio(corpo, { produtoraNome, conferidoEm, origem, agora = new Date() }) {
  const itens = [];
  const avisos = [];
  if (!corpo || typeof corpo !== 'object' || !Array.isArray(corpo.festas)) {
    return { itens, avisos: [`${origem}: o envio não traz uma lista "festas"`] };
  }
  const p = corpo.produtora && typeof corpo.produtora === 'object' ? corpo.produtora : {};
  const nomeProdutora = produtoraNome || p.nome;
  if (!nomeProdutora) return { itens, avisos: [`${origem}: envio sem produtora`] };
  if (corpo.festas.length > MAX_FESTAS) avisos.push(`${origem}: só as primeiras ${MAX_FESTAS} festas entram`);
  for (const f of corpo.festas.slice(0, MAX_FESTAS)) {
    if (!f || typeof f !== 'object') continue;
    const chave = typeof f.id === 'string' && f.id.trim() ? slug(f.id) : `${slug(f.nome || '')}-${f.data || ''}`;
    itens.push({
      idExterno: `${slug(nomeProdutora)}:${chave}`.slice(0, 160),
      url: typeof f.linkEvento === 'string' ? f.linkEvento : null,
      conferidoEm,
      texto: typeof f.descricao === 'string' ? f.descricao.slice(0, 6000) : '',
      bruto: {
        ...f,
        ...(corpo.exemplo === true ? { data: dataDoExemplo(f.data, agora) } : {}),
        produtora: { nome: nomeProdutora, instagram: p.instagram },
        ehFesta: true,
        exemplo: corpo.exemplo === true,
      },
    });
  }
  return { itens, avisos };
}

function lerPasta(pasta, log, agora) {
  const itens = [];
  const avisos = [];
  let nomes = [];
  try {
    nomes = fs.readdirSync(pasta).filter((n) => n.endsWith('.json')).sort();
  } catch (e) {
    if (e.code !== 'ENOENT') avisos.push(`a pasta ${pasta} não abriu (${e.message})`);
    return { itens, avisos };
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
    const conferidoEm = fs.statSync(arquivo).mtime.toISOString();
    const r = itensDoEnvio(corpo, { conferidoEm, origem: nome, agora });
    itens.push(...r.itens);
    avisos.push(...r.avisos);
  }
  if (log && nomes.length) log.info(`[motor] envio: ${nomes.length} arquivo(s) em ${pasta}`);
  return { itens, avisos };
}

module.exports = {
  id: 'envio',
  nome: 'Envio da produtora',
  itensDoEnvio,
  dataDoExemplo,
  async coletar({ db, log, config, agora = () => new Date() }) {
    const itens = [];
    const avisos = [];
    for (const pasta of config.pastas || []) {
      const r = lerPasta(pasta, log, agora());
      itens.push(...r.itens);
      avisos.push(...r.avisos);
    }
    // Pelo endpoint: o envio mais recente de cada produtora vale por inteiro.
    const envios = db.prepare(`SELECT e.corpo, e.recebido_em, p.nome FROM envios e JOIN produtoras p ON p.id = e.produtora_id
      WHERE p.ativa = 1 ORDER BY e.recebido_em`).all();
    for (const e of envios) {
      let corpo;
      try {
        corpo = JSON.parse(e.corpo);
      } catch {
        continue;
      }
      const r = itensDoEnvio(corpo, { produtoraNome: e.nome, conferidoEm: e.recebido_em, origem: `envio de ${e.nome}`, agora: agora() });
      itens.push(...r.itens);
      avisos.push(...r.avisos);
    }
    // O mesmo id externo enviado duas vezes: fica o último.
    const ultimo = new Map(itens.map((i) => [i.idExterno, i]));
    return { itens: [...ultimo.values()], avisos };
  },
};

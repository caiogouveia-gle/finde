'use strict';
// `node cli.js indicar <url>`: guarda um link que alguém do grupo mandou, no
// lugar certo de motor/entrada/ (fora do git), para a leitura manual depois.
//
//   festa       → entrada/indicacoes/AAAA-MM-DD-<slug>.json, o esqueleto do registro
//   perfil      → entrada/grupo/contatos.json, a lista privada de produtoras e casas a contatar
//   agenda      → entrada/grupo/a-avaliar.json, para ler os termos antes de virar fonte
//   referencia  → entrada/grupo/a-avaliar.json, para a nota de pesquisa
// (em subpasta: o envio da produtora lê os .json soltos de entrada/)
//
// Sem tipo, um perfil do Instagram (instagram.com/<nome>/) vira "perfil" e o
// resto vira "festa". Nada aqui abre a página: só registra o link.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { slug, url: urlValida } = require('./normalizar');

const TIPOS = ['festa', 'perfil', 'agenda', 'referencia'];

function tipoProvavel(u) {
  const p = new URL(u);
  const partes = p.pathname.split('/').filter(Boolean);
  if (/(^|\.)instagram\.com$/.test(p.hostname) && partes.length === 1) return 'perfil';
  return 'festa';
}

function lerLista(arquivo) {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`${arquivo} não abriu (${e.message}); conserte antes de acrescentar`);
  }
}

function gravarJson(arquivo, dado) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(`${arquivo}.tmp`, `${JSON.stringify(dado, null, 2)}\n`);
  fs.renameSync(`${arquivo}.tmp`, arquivo);
}

const hojeSP = (agora) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const agoraSP = (agora) => `${new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 19)}-03:00`;

// Devolve { tipo, arquivo, novo }: novo=false quando o link já estava lá.
function indicar(raiz, link, { tipo = null, nome = null, agora = new Date() } = {}) {
  const u = urlValida(link);
  if (!u) throw new Error('o link precisa ser http(s)');
  const t = tipo || tipoProvavel(u);
  if (!TIPOS.includes(t)) throw new Error(`tipo "${t}" não existe; use ${TIPOS.join(', ')}`);
  const entrada = path.join(raiz, 'entrada');

  if (t === 'festa') {
    // Sem nome, o arquivo leva o último pedaço do caminho que tem letras e um hash
    // do link: páginas de ingresso têm caminhos iguais ("/<id>/tickets").
    const GENERICOS = new Set(['tickets', 'ticket', 'evento', 'event', 'produto', 'p', 'e']);
    const pedaco = new URL(u).pathname.split('/').filter((x) => x && !GENERICOS.has(x) && /[a-z]/i.test(x) && !/^[0-9a-f-]{20,}$/i.test(x)).pop();
    const hash = crypto.createHash('sha256').update(u).digest('hex').slice(0, 4);
    const base = (nome ? slug(nome) : `${slug(pedaco || new URL(u).hostname.replace(/^www\./, '')).slice(0, 40)}-${hash}`).slice(0, 50) || 'festa';
    const arquivo = path.join(entrada, 'indicacoes', `${hojeSP(agora)}-${base}.json`);
    if (fs.existsSync(arquivo)) return { tipo: t, arquivo, novo: false };
    gravarJson(arquivo, {
      recebidaEm: agoraSP(agora),
      festas: [{
        id: base,
        origem: u,
        leitura: [{ url: u, lidoEm: null, campos: [] }],
        nome: nome || null,
        data: null,
        inicio: null,
        fim: null,
        casa: null,
        endereco: null,
        lotes: [],
        linkCompra: null,
        linkEvento: null,
        instagram: null,
        lineup: null,
        estilos: [],
        idadeMinima: null,
        ehFesta: true,
        descricao: '',
      }],
    });
    return { tipo: t, arquivo, novo: true };
  }

  const arquivo = path.join(entrada, 'grupo', t === 'perfil' ? 'contatos.json' : 'a-avaliar.json');
  const lista = lerLista(arquivo);
  if (lista.some((x) => x.url === u)) return { tipo: t, arquivo, novo: false };
  lista.push(t === 'perfil'
    ? { url: u, nome: nome || null, tipo: 'a classificar', indicadoEm: hojeSP(agora), situacao: 'a contatar', notas: '' }
    : { url: u, tipo: t, indicadoEm: hojeSP(agora), avaliacao: null });
  gravarJson(arquivo, lista);
  return { tipo: t, arquivo, novo: true };
}

module.exports = { indicar, tipoProvavel, TIPOS };

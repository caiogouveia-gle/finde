'use strict';
// O cadastro curado das casas (M29, KTD10 do plano de 24/11/2026):
// config/lugares.json, com id, nome, apelidos, espaços (salas), Instagram,
// endereço, CEP, bairro, região, cidade, lat, lng, fonte da coordenada e
// `conferidoEm`. Um módulo só serve normalização, correlação, mapa e lista de
// perfis. A lista de lugares pode ser injetada nos testes.
//
// `acharLugar` casa por apelido (sem acento, sem "sala/salão/porão", sem o
// `// handle` e sem o parêntese), por rua e número, por CEP e pelo @ da casa.
// `casaCanonica` separa o espaço (sala, salão, porão, pista, terraço) do nome.

const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.join(__dirname, '..', 'config', 'lugares.json');

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// carregarLugares(arquivo?) -> [lugar]. Sem o arquivo, lista vazia.
function carregarLugares(arquivo = ARQUIVO) {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return Array.isArray(j) ? j : Array.isArray(j.lugares) ? j.lugares : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

let cache = null;
const lugaresPadrao = () => {
  if (!cache) cache = carregarLugares();
  return cache;
};

// Os espaços de uma casa que dividem o mesmo endereço e são festas diferentes.
const ESPACOS = [
  ['sala', /\bsala(?:\s+([a-z0-9]{1,12}))?\b/],
  ['salao', /\bsalao\b/],
  ['porao', /\bporao\b/],
  ['pista', /\bpista(?:\s+([a-z0-9]{1,12}))?\b/],
  ['terraco', /\bterraco\b/],
];

// "casa de francisca - porao" -> { espaco: 'porao', resto: ' casa de francisca  ' }
function tirarEspaco(t) {
  for (const [nome, re] of ESPACOS) {
    const m = t.match(re);
    if (m) return { espaco: m[1] ? `${nome}-${m[1]}` : nome, resto: t.replace(m[0], ' ') };
  }
  return { espaco: null, resto: t };
}

const limpar = (t) => semAcento(t).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// As chaves com que um nome de casa pode ser comparado: o texto sem o
// `// handle`, sem o espaço e, de um lado, com o parêntese ("IBT (antiga
// Lions)" dá "ibt" e "ibt antiga lions"), do outro, sem ele.
function chavesDaCasa(texto) {
  const original = String(texto || '').replace(/\s*\/\/.*$/, '');
  const base = semAcento(original);
  const semParenteses = base.replace(/\([^)]*\)/g, ' ');
  const out = new Set();
  for (const t of [semParenteses, base]) {
    const { resto } = tirarEspaco(` ${limpar(t)} `);
    const k = limpar(resto);
    if (k) out.add(k);
  }
  return [...out];
}

// Logradouro e número, normalizados, para comparar "R. Treze de Maio, 830 -
// Bela Vista" com "Rua Treze de Maio, 830".
const PREFIXOS = { r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', al: 'alameda', alameda: 'alameda', tv: 'travessa', travessa: 'travessa',
  pca: 'praca', praca: 'praca', lgo: 'largo', largo: 'largo', est: 'estrada', estrada: 'estrada', rod: 'rodovia', rodovia: 'rodovia',
  viela: 'viela', pas: 'passagem', passagem: 'passagem' };
const TITULOS = { dr: 'doutor', dra: 'doutora', prof: 'professor', profa: 'professora', cel: 'coronel', gen: 'general', eng: 'engenheiro',
  min: 'ministro', pres: 'presidente', sen: 'senador', dep: 'deputado', brig: 'brigadeiro', alm: 'almirante', mal: 'marechal', cap: 'capitao', vis: 'visconde' };
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// ruaENumero("Rua Dr. Teodoro Baima, 100 - República") ->
//   { prefixo: 'rua', rua: 'doutor teodoro baima', numero: '100', chave: 'rua doutor teodoro baima 100' }
// Sem logradouro ou sem número ("s/n"), null.
function ruaENumero(texto) {
  if (typeof texto !== 'string') return null;
  const t = semAcento(texto).replace(/\s+/g, ' ');
  const re = new RegExp(`(?:^|[^a-z])(${Object.keys(PREFIXOS).join('|')})\\.?\\s+(.+?)\\s*(?:,\\s*|\\s+)(\\d{1,5})(?!\\d)(?!\\s*(?:de\\s|o\\b))`);
  const m = t.match(re);
  if (!m) return null;
  const palavras = m[2].replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean)
    .map((p) => TITULOS[p] || p).filter((p) => !LIGACOES.has(p));
  if (!palavras.length) return null;
  const prefixo = PREFIXOS[m[1]];
  const rua = palavras.join(' ');
  return { prefixo, rua, numero: m[3], chave: `${prefixo} ${rua} ${m[3]}` };
}

const soDigitos = (v) => String(v || '').replace(/\D+/g, '');
const handle = (v) => String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/[/?#].*$/, '');

// Índice por lista de lugares (a lista é injetada, então a chave é a própria lista).
const indices = new WeakMap();
function indice(lugares) {
  let i = indices.get(lugares);
  if (i) return i;
  i = { nomes: new Map(), ruas: new Map(), ceps: new Map(), perfis: new Map(), contidos: [] };
  for (const l of lugares) {
    if (!l || !l.id) continue;
    for (const n of [l.nome, ...(Array.isArray(l.apelidos) ? l.apelidos : [])]) {
      for (const k of chavesDaCasa(n)) {
        if (!i.nomes.has(k)) i.nomes.set(k, l);
        // Nome de duas palavras ou mais (e oito letras) também casa dentro de um texto maior.
        if (k.split(' ').length >= 2 && k.length >= 8) i.contidos.push([k, l]);
      }
    }
    const r = ruaENumero(l.endereco);
    if (r && !i.ruas.has(r.chave)) i.ruas.set(r.chave, l);
    const cep = soDigitos(l.cep);
    if (cep.length === 8) i.ceps.set(cep, i.ceps.has(cep) ? null : l); // CEP de duas casas não decide
    const h = handle(l.instagram);
    if (h) i.perfis.set(h, i.perfis.has(h) ? null : l);
  }
  i.contidos.sort((a, b) => b[0].length - a[0].length);
  indices.set(lugares, i);
  return i;
}

function porNome(texto, i) {
  const chaves = chavesDaCasa(texto);
  for (const k of chaves) if (i.nomes.has(k)) return i.nomes.get(k);
  for (const k of chaves) {
    const t = ` ${k} `;
    for (const [nome, l] of i.contidos) if (t.includes(` ${nome} `)) return l;
  }
  return null;
}

function porEndereco(texto, i) {
  const r = ruaENumero(texto);
  if (r) return i.ruas.get(r.chave) || null; // rua e número que não batem: não cai no CEP
  const m = String(texto).match(/(?<!\d)\d{5}-?\d{3}(?!\d)/);
  return m ? i.ceps.get(soDigitos(m[0])) || null : null;
}

// acharLugar({ casa, endereco, legenda, instagram }, lugares?) -> lugar | null
// Ordem: o nome da casa, o endereço (rua e número, ou CEP quando só há CEP),
// o @ do perfil só quando não há casa nem endereço, e o @ da casa marcado na
// legenda, quando é um só.
function acharLugar(entrada, lugares = lugaresPadrao()) {
  if (!entrada || !Array.isArray(lugares) || !lugares.length) return null;
  const i = indice(lugares);
  const casa = typeof entrada.casa === 'string' ? entrada.casa.trim() : '';
  const endereco = typeof entrada.endereco === 'string' ? entrada.endereco.trim() : '';
  if (casa) {
    const l = porNome(casa, i);
    if (l) return l;
  }
  if (endereco) {
    const l = porEndereco(endereco, i);
    if (l) return l;
  }
  const perfil = handle(entrada.instagram);
  if (perfil && !casa && !endereco && i.perfis.get(perfil)) return i.perfis.get(perfil);
  if (typeof entrada.legenda === 'string' && !casa && !endereco) {
    const achados = new Set();
    for (const m of entrada.legenda.toLowerCase().matchAll(/@([a-z0-9._]{2,30})/g)) {
      const l = i.perfis.get(m[1].replace(/\.+$/, ''));
      if (l) achados.add(l);
    }
    if (achados.size === 1) return [...achados][0];
  }
  return null;
}

// casaCanonica("Casa de Francisca - Porão") -> { id, espaco: 'porao', chave: 'casa de francisca' }
// `id` é o do lugar curado quando a casa é conhecida (acharLugar), senão null;
// `chave` é o nome sem acento, sem pontuação e sem o espaço, para comparar.
function casaCanonica(texto, lugares) {
  const original = String(texto || '').replace(/\s*\/\/.*$/, '');
  // O espaço pode estar no parêntese ("Casa de Francisca (Sala B)"); o nome
  // sai sem ele e sem o que mais houver entre parênteses ("IBT (antiga Lions)").
  const { espaco } = tirarEspaco(` ${limpar(original)} `);
  const semParenteses = original.replace(/\([^)]*\)/g, ' ');
  const chave = limpar(tirarEspaco(` ${limpar(semParenteses)} `).resto)
    || limpar(tirarEspaco(` ${limpar(original)} `).resto);
  const lugar = chave ? acharLugar({ casa: texto }, lugares) : null;
  return { id: lugar ? lugar.id : null, espaco, chave };
}

// lugarPorId(id, lugares?) -> lugar | null
function lugarPorId(id, lugares = lugaresPadrao()) {
  return lugares.find((l) => l && l.id === id) || null;
}

module.exports = { carregarLugares, acharLugar, casaCanonica, lugarPorId, ruaENumero, chavesDaCasa, ARQUIVO };

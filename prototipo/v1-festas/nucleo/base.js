'use strict';
// Validação da base de festas. Cada linha inválida sai com um aviso que diz
// qual campo falhou; o resto da base segue valendo.

const { DIAS, FAIXAS, ID_ESTILOS, BAIRROS } = require('./catalogo');

const MAX_PATROCINADAS = 2;
const ID_FAIXAS = FAIXAS.map((f) => f.id);

const texto = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const hora = (v) => typeof v === 'number' && Number.isFinite(v) && (v * 2) % 1 === 0; // de meia em meia hora

function faixaDaIdade(idade) {
  const f = FAIXAS.find((x) => idade >= x.min && idade <= x.max);
  return f ? f.id : null;
}

// Devolve a lista de problemas; vazia quando a linha está boa.
function validarFesta(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['não é um objeto'];
  const p = [];
  if (typeof f.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(f.id)) p.push('id');
  if (!texto(f.nome, 60)) p.push('nome');
  if (!texto(f.produtora, 60)) p.push('produtora');
  if (!texto(f.casa, 60)) p.push('casa');
  if (!Object.hasOwn(BAIRROS, f.bairro)) p.push('bairro');
  else if (f.regiao !== BAIRROS[f.bairro].regiao) p.push('regiao');
  if (!Object.hasOwn(DIAS, f.dia)) p.push('dia');
  if (!hora(f.inicio) || f.inicio < 12 || f.inicio > 26) p.push('inicio');
  if (!hora(f.esquenta) || !(f.esquenta >= f.inicio)) p.push('esquenta');
  if (!hora(f.fim) || !(f.fim > f.esquenta) || f.fim > 32) p.push('fim');
  if (!Number.isInteger(f.mediaIdade) || f.mediaIdade < 18 || f.mediaIdade > 60) p.push('mediaIdade');
  if (!Array.isArray(f.faixas) || f.faixas.length === 0 || !f.faixas.every((x) => ID_FAIXAS.includes(x))
    || new Set(f.faixas).size !== f.faixas.length) {
    p.push('faixas');
  } else if (Number.isInteger(f.mediaIdade) && !f.faixas.includes(faixaDaIdade(f.mediaIdade))) {
    p.push('faixas (a média de idade cai fora delas)');
  } else if (f.faixas.length > 2 || (f.faixas.length === 2
    && Math.abs(ID_FAIXAS.indexOf(f.faixas[0]) - ID_FAIXAS.indexOf(f.faixas[1])) !== 1)) {
    p.push('faixas (no máximo a da média e uma vizinha)');
  }
  if (!Number.isInteger(f.preco) || f.preco < 0 || f.preco > 1000) p.push('preco');
  if (!Array.isArray(f.estilos) || f.estilos.length === 0 || !f.estilos.every((x) => ID_ESTILOS.includes(x))
    || new Set(f.estilos).size !== f.estilos.length) {
    p.push('estilos');
  }
  if (!texto(f.frase, 160)) p.push('frase');
  if (f.selo !== 'editorial' && f.selo !== 'patrocinado') p.push('selo');
  if (!Number.isInteger(f.distanciaMin) || f.distanciaMin < 0 || f.distanciaMin > 30) p.push('distanciaMin');
  return p;
}

// Só os campos conhecidos seguem adiante, congelados.
function limpar(f) {
  return Object.freeze({
    id: f.id, nome: f.nome.trim(), produtora: f.produtora.trim(), casa: f.casa.trim(),
    bairro: f.bairro, regiao: f.regiao, dia: f.dia,
    inicio: f.inicio, esquenta: f.esquenta, fim: f.fim,
    mediaIdade: f.mediaIdade, faixas: Object.freeze([...f.faixas]), preco: f.preco,
    estilos: Object.freeze([...f.estilos]), frase: f.frase.trim(), selo: f.selo, distanciaMin: f.distanciaMin,
  });
}

function prepararBase(linhas) {
  const avisos = [];
  const base = [];
  const vistos = new Set();
  let patrocinadas = 0;
  if (!Array.isArray(linhas)) return { base, avisos: ['a base não é uma lista'] };
  linhas.forEach((f, i) => {
    const rotulo = f && typeof f.id === 'string' ? `"${f.id.slice(0, 60)}"` : `#${i + 1}`;
    const problemas = validarFesta(f);
    if (problemas.length) {
      avisos.push(`ignorei a festa ${rotulo}: ${problemas.join(', ')}`);
      return;
    }
    if (vistos.has(f.id)) {
      avisos.push(`ignorei a festa ${rotulo}: id repetido`);
      return;
    }
    if (f.selo === 'patrocinado' && patrocinadas >= MAX_PATROCINADAS) {
      avisos.push(`ignorei a festa ${rotulo}: já há ${MAX_PATROCINADAS} patrocinadas`);
      return;
    }
    if (f.selo === 'patrocinado') patrocinadas += 1;
    vistos.add(f.id);
    base.push(limpar(f));
  });
  return { base, avisos };
}

function lerLinhas(bruto) {
  if (Array.isArray(bruto)) return bruto;
  if (bruto && Array.isArray(bruto.festas)) return bruto.festas;
  throw new Error('o arquivo não traz uma lista de festas');
}

module.exports = { validarFesta, prepararBase, lerLinhas, faixaDaIdade, MAX_PATROCINADAS };

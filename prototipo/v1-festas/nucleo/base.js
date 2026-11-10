'use strict';
// Validação da base de festas. Cada linha inválida sai com um aviso que diz
// qual campo falhou; o resto da base segue valendo.

const { DIAS, FAIXAS, ID_ESTILOS, BAIRROS, ORIGENS, origemLonga, origemCurta } = require('./catalogo');

const MAX_PATROCINADAS = 2;
const ID_FAIXAS = FAIXAS.map((f) => f.id);

const texto = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const nuloOu = (v, ok) => v === null || ok(v);
const objeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const carimbo = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));
// Link externo: só https, e o Instagram só no domínio dele.
function https(v) {
  if (typeof v !== 'string' || v.length > 300) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}
const instagram = (v) => https(v) && /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/.test(v);

// O menor lote disponível; sem lote, o preço da porta. null quando nada se vende.
// Mesma conta do precoAPartirDe do motor (motor/nucleo/contrato.js).
function menorPreco(lotes, porta) {
  const abertos = (lotes || []).filter((l) => l.disponivel !== false).map((l) => l.preco);
  if (abertos.length) return Math.min(...abertos);
  return porta ? porta.preco : null;
}

const precoValido = (v) => Number.isInteger(v) && v >= 0 && v <= 1000;

// Os campos do registro finde-r14/1 que o detalhe usa. Todos podem faltar:
// campo ausente vale null e aparece como ausente (R12). Quando vem, vem certo.
const vem = (v) => v !== undefined && v !== null;
function validarRegistro(f, p) {
  const e = f.endereco;
  if (vem(e) && (!objeto(e) || !texto(e.texto, 200) || e.bairro !== f.bairro || e.regiao !== f.regiao || e.cidade !== 'São Paulo')) p.push('endereco');
  const lotesOk = !vem(f.lotes) || (Array.isArray(f.lotes) && f.lotes.length <= 12 && f.lotes.every((l) => objeto(l) && texto(l.nome, 40)
    && precoValido(l.preco) && (typeof l.disponivel === 'boolean' || l.disponivel === null)
    // Taxa da plataforma (com centavos) e hora-limite do preço ("R$ 20 até as 23h").
    && (!vem(l.taxa) || (typeof l.taxa === 'number' && l.taxa >= 0 && l.taxa <= 200 && Math.round(l.taxa * 100) === l.taxa * 100))
    && (!vem(l.ate) || (typeof l.ate === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(l.ate)))));
  if (!lotesOk) p.push('lotes');
  const portaOk = !vem(f.entradaNaPorta) || (objeto(f.entradaNaPorta) && precoValido(f.entradaNaPorta.preco));
  if (!portaOk) p.push('entradaNaPorta');
  // Com lotes ou porta, o preço da lista é o menor disponível.
  const vende = vem(f.lotes) || vem(f.entradaNaPorta);
  if (vende && lotesOk && portaOk && Number.isInteger(f.preco) && menorPreco(f.lotes, f.entradaNaPorta) !== f.preco && !p.includes('preco')) p.push('preco');
  if (vem(f.linkCompra) && !https(f.linkCompra)) p.push('linkCompra');
  if (vem(f.linkEvento) && !https(f.linkEvento)) p.push('linkEvento');
  if (vem(f.instagram) && !instagram(f.instagram)) p.push('instagram');
  if (vem(f.cartaz) && !(typeof f.cartaz === 'string' && /^\/cartazes\/[a-z0-9-]{1,60}\.webp$/.test(f.cartaz))) p.push('cartaz');
  if (vem(f.lineup) && !(Array.isArray(f.lineup) && f.lineup.length > 0 && f.lineup.length <= 30 && f.lineup.every((n) => texto(n, 80)))) p.push('lineup');
  if (vem(f.idadeMinima) && !(Number.isInteger(f.idadeMinima) && f.idadeMinima >= 1 && f.idadeMinima <= 21)) p.push('idadeMinima');
  if (vem(f.regras) && !(objeto(f.regras) && Object.entries(f.regras).every(([k, v]) => ['documento', 'vestimenta', 'lista'].includes(k) && texto(v, 160)))) p.push('regras');
  if (vem(f.fontes) && !(Array.isArray(f.fontes) && f.fontes.every((x) => objeto(x) && texto(x.id, 40) && texto(x.nome, 80)
    && (!vem(x.url) || https(x.url)) && carimbo(x.conferidoEm)))) p.push('fontes');
  if (vem(f.campos) && !(objeto(f.campos) && Object.values(f.campos).every((x) => objeto(x) && texto(x.fonte, 40) && carimbo(x.conferidoEm)))) p.push('campos');
  if (vem(f.coletadoEm) && !carimbo(f.coletadoEm)) p.push('coletadoEm');
  if (vem(f.exemplo) && typeof f.exemplo !== 'boolean') p.push('exemplo');
}
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
  if (!precoValido(f.preco)) p.push('preco');
  if (!Array.isArray(f.estilos) || f.estilos.length === 0 || !f.estilos.every((x) => ID_ESTILOS.includes(x))
    || new Set(f.estilos).size !== f.estilos.length) {
    p.push('estilos');
  }
  if (!texto(f.frase, 160)) p.push('frase');
  if (f.selo !== 'editorial' && f.selo !== 'patrocinado') p.push('selo');
  if (!Number.isInteger(f.distanciaMin) || f.distanciaMin < 0 || f.distanciaMin > 30) p.push('distanciaMin');
  const o = f.origemIdade;
  if (!o || typeof o !== 'object' || !ORIGENS.includes(o.tipo)
    || (o.tipo === 'avaliacoes' && !(Number.isInteger(o.avaliacoes) && o.avaliacoes >= 5 && o.avaliacoes <= 10000))) {
    p.push('origemIdade');
  }
  validarRegistro(f, p);
  return p;
}

const copia = (v) => (v === undefined || v === null ? null : congelar(structuredClone(v)));

function congelar(v) {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) congelar(x);
    Object.freeze(v);
  }
  return v;
}

// Só os campos conhecidos seguem adiante, congelados até o fundo.
function limpar(f) {
  return Object.freeze({
    id: f.id, nome: f.nome.trim(), produtora: f.produtora.trim(), casa: f.casa.trim(),
    bairro: f.bairro, regiao: f.regiao, dia: f.dia,
    inicio: f.inicio, esquenta: f.esquenta, fim: f.fim,
    mediaIdade: f.mediaIdade, faixas: Object.freeze([...f.faixas]), preco: f.preco,
    estilos: Object.freeze([...f.estilos]), frase: f.frase.trim(), selo: f.selo, distanciaMin: f.distanciaMin,
    // Na base, a origem da média é um objeto ({ tipo, avaliacoes? }); daqui
    // pra fora, é texto: "informada pela produtora".
    origemIdade: origemLonga(f.origemIdade),
    origemIdadeCurta: origemCurta(f.origemIdade),
    // Registro finde-r14/1: o que o detalhe e o convite mostram.
    endereco: copia(f.endereco),
    lotes: copia(f.lotes),
    entradaNaPorta: copia(f.entradaNaPorta),
    linkCompra: f.linkCompra ?? null, linkEvento: f.linkEvento ?? null, instagram: f.instagram ?? null, cartaz: f.cartaz ?? null,
    lineup: copia(f.lineup),
    idadeMinima: f.idadeMinima ?? null,
    regras: copia(f.regras ?? {}),
    fontes: copia(f.fontes ?? []),
    campos: copia(f.campos ?? {}),
    coletadoEm: f.coletadoEm ?? null,
    exemplo: f.exemplo === true,
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

// A base e o que ela diz de si: se é fictícia, e de quando são os carimbos.
function lerBase(bruto) {
  const linhas = lerLinhas(bruto);
  const ficticia = Boolean(bruto && !Array.isArray(bruto) && bruto.ficticia === true);
  const referencia = ficticia && carimbo(bruto.referencia) ? bruto.referencia : null;
  return { linhas, ficticia, referencia };
}

// "2026-11-10T15:00:00-03:00" + ms, no mesmo fuso de São Paulo.
function somar(iso, ms) {
  const d = new Date(Date.parse(iso) + ms - 3 * 3600e3);
  return `${d.toISOString().slice(0, 19)}-03:00`;
}

// Base fictícia: todos os carimbos andam juntos, pela diferença entre a
// referência e agora, para "conferido há 2 h" continuar verdade no dia da
// banca. As distâncias entre eles ficam as mesmas. Não muda o original.
function deslocarDatas(linhas, ms) {
  if (!Array.isArray(linhas) || !ms) return linhas;
  return linhas.map((f) => {
    if (!objeto(f)) return f;
    const g = structuredClone(f);
    if (carimbo(g.coletadoEm)) g.coletadoEm = somar(g.coletadoEm, ms);
    if (Array.isArray(g.fontes)) for (const x of g.fontes) if (objeto(x) && carimbo(x.conferidoEm)) x.conferidoEm = somar(x.conferidoEm, ms);
    if (objeto(g.campos)) for (const x of Object.values(g.campos)) if (objeto(x) && carimbo(x.conferidoEm)) x.conferidoEm = somar(x.conferidoEm, ms);
    return g;
  });
}

module.exports = { validarFesta, prepararBase, lerLinhas, lerBase, deslocarDatas, menorPreco, faixaDaIdade, MAX_PATROCINADAS };

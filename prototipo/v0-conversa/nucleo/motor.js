'use strict';
// Motor do Finde: escolhe três opções para os critérios da conversa.
// Puro: não lê arquivo, não usa relógio nem Math.random. Mesma entrada, mesma saída.

const TIPOS = ['cultura', 'ar-livre', 'comida', 'bar', 'musica', 'feira', 'jogo', 'passeio'];
const REGIOES = ['pinheiros-vila-madalena', 'centro', 'paulista-ibirapuera'];
const MOMENTOS = ['manha', 'tarde', 'noite'];
const CLIMAS = ['conversar', 'agitar', 'descobrir', 'relaxar', 'comemorar'];
const COMIDAS = ['centro', 'tem', 'nao'];
const SELOS = ['editorial', 'patrocinado'];

const QUEM = ['so', 'casal', 'amigos', 'turma'];
const QUANDO = ['sex-noite', 'sab-dia', 'sab-noite', 'dom'];
const COMIDA_PEDIDO = ['centro', 'pode', 'hoje-nao'];
const ORDEM_PERGUNTAS = ['quando', 'quem', 'regiao', 'preco', 'clima', 'comida'];

const NOME_REGIAO = {
  'pinheiros-vila-madalena': 'Pinheiros e Vila Madalena',
  centro: 'Centro',
  'paulista-ibirapuera': 'Paulista e Ibirapuera',
};
// "olhei fora ___": a preposição muda com o nome.
const FORA_DA_REGIAO = {
  'pinheiros-vila-madalena': 'de Pinheiros e da Vila Madalena',
  centro: 'do Centro',
  'paulista-ibirapuera': 'da Paulista e do Ibirapuera',
};
const FAIXA = ['grátis', 'até R$ 50', 'R$ 50 a 120', 'acima de R$ 120'];
// Tamanho que representa cada grupo. "amigos" é de 3 a 5; o meio da faixa decide.
const TAMANHO = { so: 1, casal: 2, amigos: 4, turma: 6 };

// ---------------------------------------------------------------- validação

function validarExperiencia(e) {
  const p = [];
  if (!e || typeof e !== 'object' || Array.isArray(e)) return ['não é um objeto'];
  const texto = (k) => typeof e[k] === 'string' && e[k].trim() !== '';
  const lista = (k, valores) =>
    Array.isArray(e[k]) && e[k].length > 0 && e[k].every((v) => valores.includes(v));

  if (!texto('id') || !/^[a-z0-9-]{1,80}$/.test(e.id)) p.push('id');
  if (!texto('nome')) p.push('nome');
  if (!TIPOS.includes(e.tipo)) p.push('tipo');
  if (!REGIOES.includes(e.regiao)) p.push('regiao');
  if (!texto('bairro')) p.push('bairro');
  if (![0, 1, 2, 3].includes(e.preco)) p.push('preco');
  if (!lista('momentos', MOMENTOS)) p.push('momentos');
  const g = e.grupo;
  if (!g || !Number.isInteger(g.min) || !Number.isInteger(g.max) || g.min < 1 || g.max < g.min) p.push('grupo');
  if (!lista('climas', CLIMAS)) p.push('climas');
  if (typeof e.arLivre !== 'boolean') p.push('arLivre');
  if (!COMIDAS.includes(e.comida)) p.push('comida');
  if (!texto('resumo')) p.push('resumo');
  if (!texto('porque')) p.push('porque');
  if (!Array.isArray(e.combina) || !e.combina.every((v) => typeof v === 'string')) p.push('combina');
  if (!SELOS.includes(e.selo)) p.push('selo');
  if (typeof e.conferido !== 'boolean') p.push('conferido');
  // Patrocinado só em lugar fictício, com o nome dizendo que é exemplo.
  if (e.selo === 'patrocinado' && typeof e.nome === 'string' && !/exemplo/i.test(e.nome)) {
    p.push('patrocinado sem "exemplo" no nome');
  }
  return p;
}

// Recebe as linhas cruas da base; devolve as válidas e os avisos das que caíram.
function prepararBase(linhas) {
  const avisos = [];
  const base = [];
  const vistos = new Set();
  if (!Array.isArray(linhas)) return { base, avisos: ['a base não é uma lista'] };
  linhas.forEach((e, i) => {
    const problemas = validarExperiencia(e);
    const nome = e && typeof e.id === 'string' ? e.id : `linha ${i + 1}`;
    if (problemas.length) {
      avisos.push(`ignorei ${nome}: campo inválido (${problemas.join(', ')})`);
      return;
    }
    if (vistos.has(e.id)) {
      avisos.push(`ignorei ${nome}: id repetido`);
      return;
    }
    vistos.add(e.id);
    base.push(e);
  });
  return { base, avisos };
}

// ---------------------------------------------------------------- critérios

// Fica só com o que é válido. Não inventa padrão: o que falta continua faltando.
function sanearCriterios(c) {
  const s = {};
  if (!c || typeof c !== 'object') return s;
  if (QUEM.includes(c.quem)) s.quem = c.quem;
  if (QUANDO.includes(c.quando)) s.quando = c.quando;
  if (c.regiao === 'qualquer' || REGIOES.includes(c.regiao)) s.regiao = c.regiao;
  if ([0, 1, 2, 3].includes(c.preco)) s.preco = c.preco;
  if (CLIMAS.includes(c.clima)) s.clima = c.clima;
  if (COMIDA_PEDIDO.includes(c.comida)) s.comida = c.comida;
  if (Array.isArray(c.evitar)) {
    s.evitar = [...new Set(c.evitar.filter((v) => typeof v === 'string' && /^[a-z0-9-]{1,80}$/.test(v)))].slice(0, 100);
  }
  return s;
}

function falta(c) {
  return ORDEM_PERGUNTAS.filter((k) => c[k] === undefined);
}

function completar(c) {
  const s = sanearCriterios(c);
  return {
    quem: s.quem || 'amigos',
    quando: s.quando || 'sab-noite',
    regiao: s.regiao || 'qualquer',
    preco: s.preco === undefined ? 3 : s.preco,
    clima: s.clima || 'conversar',
    comida: s.comida || 'pode',
    evitar: s.evitar || [],
  };
}

function momentosDe(quando) {
  return quando === 'sex-noite' || quando === 'sab-noite' ? ['noite'] : ['manha', 'tarde'];
}

// ---------------------------------------------------------------- filtros e pontos

function passaDuros(e, c) {
  const momentos = momentosDe(c.quando);
  if (!e.momentos.some((m) => momentos.includes(m))) return false;
  if (e.preco > c.preco) return false;
  const n = TAMANHO[c.quem];
  if (n < e.grupo.min || n > e.grupo.max) return false;
  if (c.comida === 'hoje-nao' && e.comida === 'centro') return false;
  if (c.evitar.includes(e.id)) return false;
  return true;
}

const bateClima = (e, c) => e.climas.includes(c.clima);
const bateRegiao = (e, c) => c.regiao === 'qualquer' || e.regiao === c.regiao;

// FNV-1a: desempate estável que muda com o pedido, para a mesma base
// não devolver sempre os mesmos três em pedidos parecidos.
function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

function pontos(e, c) {
  let s = 0;
  if (bateClima(e, c)) s += e.climas[0] === c.clima ? 5 : 4;
  if (c.regiao !== 'qualquer' && e.regiao === c.regiao) s += 3;
  const dia = !momentosDe(c.quando).includes('noite');
  if (dia && e.arLivre) s += 1;
  if (c.comida === 'centro') s += e.comida === 'centro' ? 3 : e.comida === 'tem' ? 1.5 : 0;
  s += hash(`${e.id}|${c.quando}|${c.quem}|${c.clima}|${c.regiao}`) * 0.5;
  return s;
}

function ordenar(lista, c) {
  return lista
    .map((e) => ({ e, p: pontos(e, c) }))
    .sort((a, b) => b.p - a.p || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
    .map((x) => x.e);
}

// Níveis de afrouxamento, na ordem do contrato: região, clima, preço (um degrau).
function niveis(c) {
  const lista = [];
  const pediuRegiao = c.regiao !== 'qualquer';
  lista.push({ c, regiao: pediuRegiao, clima: true, afrouxou: [] });
  if (pediuRegiao) lista.push({ c, regiao: false, clima: true, afrouxou: ['regiao'] });
  const semClima = pediuRegiao ? ['regiao', 'clima'] : ['clima'];
  lista.push({ c, regiao: false, clima: false, afrouxou: semClima });
  if (c.preco < 3) {
    lista.push({ c: { ...c, preco: c.preco + 1 }, regiao: false, clima: false, afrouxou: [...semClima, 'preco'] });
  }
  return lista;
}

// Conjuntos de um nível: "estrita" casa com tudo o que está valendo;
// "pool" é o que passa nos duros (e na região, se ela ainda vale) e serve
// para dar variedade de tipo quando a estrita não dá.
function conjuntos(nivel, base, excluir) {
  const duros = base.filter((e) => !excluir.has(e.id) && passaDuros(e, nivel.c));
  const naRegiao = nivel.regiao ? duros.filter((e) => e.regiao === nivel.c.regiao) : duros;
  const estrita = naRegiao.filter((e) => !nivel.clima || bateClima(e, nivel.c));
  return { estrita, pool: naRegiao };
}

function utilizaveis(lista) {
  const editoriais = lista.filter((e) => e.selo !== 'patrocinado').length;
  return editoriais + (lista.length > editoriais ? 1 : 0);
}

// Escolhe uma experiência para a posição `pos`, ao lado das `outras` já na mesa.
function escolherUma(estrita, pool, c, outras, pos) {
  const ordEstrita = ordenar(estrita, c);
  const ordPool = ordenar(pool, c);
  const temPatrocinada = outras.some((x) => x.selo === 'patrocinado');
  const centroNaMesa = outras.some((x) => x.comida === 'centro');
  const ok = (e, repeteTipo, daEstrita) => {
    if (outras.some((x) => x.id === e.id)) return false;
    if (e.selo === 'patrocinado' && (pos === 0 || temPatrocinada || !daEstrita)) return false;
    if (!repeteTipo && outras.some((x) => x.tipo === e.tipo)) return false;
    if (c.comida === 'pode' && e.comida === 'centro' && centroNaMesa) return false;
    return true;
  };
  const passos = [
    [ordEstrita, false, true],
    [ordPool, false, false],
    [ordEstrita, true, true],
    [ordPool, true, false],
  ];
  for (const [lista, repete, daEstrita] of passos) {
    const achada = lista.find((e) => ok(e, repete, daEstrita || estrita.includes(e)));
    if (achada) return achada;
  }
  return null;
}

// ---------------------------------------------------------------- textos

const FRASE_CLIMA = {
  conversar: 'dá para conversar sem gritar',
  agitar: 'tem agito de verdade',
  descobrir: 'tem coisa nova para ver',
  relaxar: 'dá para ir sem pressa',
  comemorar: 'tem clima de comemoração',
};

function frasePreco(preco) {
  return preco === 0 ? 'de graça' : `${FAIXA[preco]} por pessoa`;
}

function fraseGrupo(e, quem) {
  if (quem === 'so') return 'vai bem sozinho';
  if (quem === 'casal') return 'funciona a dois';
  if (quem === 'amigos') return 'cabe o grupo de amigos';
  return `cabe a turma, até ${e.grupo.max} pessoas`;
}

function motivos(e, c) {
  const m = [];
  if (c.regiao !== 'qualquer' && e.regiao === c.regiao) m.push(`${e.bairro}, na região que você pediu`);
  if (bateClima(e, c)) m.push(FRASE_CLIMA[c.clima]);
  if (c.comida === 'centro' && e.comida === 'centro') m.push('comer é o programa');
  if (e.arLivre && !momentosDe(c.quando).includes('noite')) m.push('é ao ar livre, bom de dia');
  if (e.preco === 0) m.push('de graça');
  m.push(fraseGrupo(e, c.quem));
  // A faixa já aparece no cartão; vira motivo só quando faltaria um segundo.
  if (m.length < 2) m.push(frasePreco(e.preco));
  return m.slice(0, 3);
}

function rotulo(e, c) {
  if (e.selo === 'patrocinado') return 'patrocinado';
  return bateClima(e, c) && bateRegiao(e, c) ? 'sob-medida' : 'da-casa';
}

function acharDepois(e, cEfetivo, porId, naMesa) {
  for (const id of e.combina) {
    const x = porId.get(id);
    if (!x || x.selo === 'patrocinado' || naMesa.includes(x.id)) continue;
    if (passaDuros(x, cEfetivo)) return x;
  }
  return undefined;
}

function montarOpcao(e, c, cEfetivo, porId, naMesa) {
  const opcao = { experiencia: e, rotulo: rotulo(e, c), motivos: motivos(e, c), porque: e.porque };
  const depois = acharDepois(e, cEfetivo, porId, naMesa);
  if (depois) opcao.depois = depois;
  return opcao;
}

function juntar(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

function textoAfrouxou(afrouxou, c, cEfetivo) {
  const partes = afrouxou.map((k) => {
    if (k === 'regiao') return `olhei fora ${FORA_DA_REGIAO[c.regiao]}`;
    if (k === 'clima') return 'saí um pouco do clima que você pediu';
    return `subi o teto para ${FAIXA[cEfetivo.preco]} por pessoa`;
  });
  return juntar(partes);
}

function textoAviso(afrouxou, achou, c, cEfetivo) {
  if (achou === 0) {
    return 'Não achei nada que caiba nesse pedido, nem abrindo região, clima e preço. Tente outro dia, um grupo de outro tamanho ou um teto maior.';
  }
  if (!afrouxou.length && achou >= 3) return undefined;
  let t = '';
  if (afrouxou.length) t = `Com tudo o que você pediu não chegava a três, então ${textoAfrouxou(afrouxou, c, cEfetivo)}.`;
  if (achou < 3) t += `${t ? ' ' : ''}Mesmo assim só achei ${achou === 1 ? 'uma' : 'duas'}.`;
  return t;
}

// ---------------------------------------------------------------- API do motor

function escolher(criterios, base) {
  const c = completar(criterios);
  const porId = new Map(base.map((e) => [e.id, e]));
  let melhor = null;
  for (const nivel of niveis(c)) {
    const { estrita, pool } = conjuntos(nivel, base, new Set());
    const mesa = [];
    for (let pos = 0; pos < 3; pos++) {
      const e = escolherUma(estrita, pool, c, mesa, pos);
      if (!e) break;
      mesa.push(e);
    }
    const resultado = { nivel, mesa };
    if (!melhor || mesa.length > melhor.mesa.length) melhor = resultado;
    if (mesa.length === 3 && utilizaveis(estrita) >= 3) {
      melhor = resultado;
      break;
    }
  }
  const { nivel, mesa } = melhor;
  const ids = mesa.map((e) => e.id);
  const opcoes = mesa.map((e) => montarOpcao(e, c, nivel.c, porId, ids));
  const aviso = textoAviso(nivel.afrouxou, opcoes.length, c, nivel.c);
  return aviso ? { opcoes, aviso } : { opcoes };
}

// Uma substituta para a posição da recusada. `atuais` são os ids na mesa;
// sem eles, a mesa é recalculada pelos critérios.
function trocar(criterios, base, idRecusado, atuais) {
  const c = completar(criterios);
  const novo = { ...c, evitar: [...new Set([...c.evitar, idRecusado])] };
  if (!Array.isArray(atuais) || atuais.length === 0) {
    atuais = escolher(c, base).opcoes.map((o) => o.experiencia.id);
  }
  const porId = new Map(base.map((e) => [e.id, e]));
  const pos = Math.max(0, atuais.indexOf(idRecusado));
  const outras = atuais.filter((id) => id !== idRecusado).map((id) => porId.get(id)).filter(Boolean);
  const excluir = new Set([...atuais, ...novo.evitar]);
  for (const nivel of niveis(novo)) {
    const { estrita, pool } = conjuntos(nivel, base, excluir);
    const e = escolherUma(estrita, pool, novo, outras, pos);
    if (e) {
      const naMesa = [...outras.map((x) => x.id), e.id];
      const r = { opcao: montarOpcao(e, novo, nivel.c, porId, naMesa), criterios: novo };
      if (nivel.afrouxou.length) r.aviso = `Para achar outra, ${textoAfrouxou(nivel.afrouxou, novo, nivel.c)}.`;
      return r;
    }
  }
  return {
    opcao: null,
    criterios: novo,
    aviso: 'Não sobrou outra que caiba nesse pedido. Tente outra região ou um teto maior.',
  };
}

// Remonta opções a partir de ids (para o plano guardar o que foi mandado).
function montarOpcoes(criterios, base, ids) {
  const c = completar(criterios);
  const porId = new Map(base.map((e) => [e.id, e]));
  const mesa = ids.map((id) => porId.get(id));
  if (mesa.some((e) => !e)) return null;
  return mesa.map((e) => montarOpcao(e, c, c, porId, ids));
}

module.exports = {
  TIPOS, REGIOES, MOMENTOS, CLIMAS, COMIDAS, SELOS, QUEM, QUANDO, COMIDA_PEDIDO,
  ORDEM_PERGUNTAS, NOME_REGIAO, FAIXA,
  validarExperiencia, prepararBase, sanearCriterios, falta, completar, momentosDe, passaDuros,
  escolher, trocar, montarOpcoes,
};

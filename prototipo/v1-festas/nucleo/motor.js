'use strict';
// Motor do Finde: escolhe três festas para o pedido.
// Puro e determinístico: não lê arquivo, não usa relógio nem Math.random.
//
// Filtros duros: dia, janela de horário (chegar e voltar, com tolerância
// declarada), hora de voltar dita na conversa (voltaMax), faixa de idade, teto de
// preço, estilos, bairros e tipos de casa recusados, e festas já descartadas.
// Estilo pedido: critério com afrouxamento declarado. Primeiro entram as festas
// que casam com algum estilo pedido; se não chegam a três, a lista se completa
// com som parecido (afinidade maior que zero) e, só então, com outros sons.
// Quando sobram menos de três, afrouxa nesta ordem: horário (uma hora a mais
// de cada lado), preço (um degrau), idade (média até 3 anos fora da faixa).
// O que a pessoa ajustou de propósito na conversa ("firmes") não afrouxa.
// Toda festa que fura o pedido diz o quê, no porquê, em primeiro lugar.
// A lista sai em ordem de horário; a patrocinada fica no lugar dela, nunca em primeiro.

const C = require('./catalogo');

// Tolerância declarada: a pista cheia (o esquenta) pode cair até TOLERANCIA
// horas antes do início da janela e até uma hora antes do fim; a festa precisa
// durar duas horas depois que a pessoa chega e acabar até o fim da janela.
const TOLERANCIA = 1;
const TOLERANCIA_AFROUXADA = 2;
const VOLTA_AFROUXADA = 2;
const MARGEM_DIVERSIDADE = 1.5;
const QUASE_NA_FAIXA = 3;
// A idade vale pela média, não pela faixa que a festa declara: cabe no pedido
// quem tem a média até 1 ano fora da faixa; afrouxando, até 3.
const IDADE_TOLERADA = 1;

const CHAVES_OBRIGATORIAS = ['dia', 'janela', 'faixa', 'teto'];
// A faixa do formulário novo (R20): de 18 a 50, e 50 vale "50 ou mais".
const IDADE_MIN = 18;
const IDADE_MAX = 50;
// Bairro vizinho (R19): mesma região, ou até 12 min de carro pela tabela.
const MINUTOS_VIZINHO = 12;
// Os blocos da lista, na ordem: o que cabe; bairro vizinho; o que fura o
// pedido em som, horário ou preço; média fora da faixa.
const BLOCOS = ['pedido', 'perto', 'quase', 'faixa'];
const DIMENSOES = ['horario', 'preco', 'idade'];

const janelaPorId = (id) => C.JANELAS.find((j) => j.id === id);
const faixaPorId = (id) => C.FAIXAS.find((f) => f.id === id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const NUMERAL = ['nenhuma', 'uma', 'duas', 'três'];

function juntar(partes, conjuncao = 'e') {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} ${conjuncao} ${partes[partes.length - 1]}`;
}

// ---------------------------------------------------------------- critérios

function listaDeEstilos(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => C.ID_ESTILOS.includes(x)))].sort(
    (a, b) => C.ID_ESTILOS.indexOf(a) - C.ID_ESTILOS.indexOf(b),
  );
}

const tetoValido = (v) => v === 'sem-limite' || (Number.isInteger(v) && v >= 0 && v <= 1000);

// Fica só com o que é válido. Nunca lança: o que vier torto, cai.
function sanearCriterios(bruto) {
  const c = {};
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return c;
  if (Object.hasOwn(C.DIAS, bruto.dia)) c.dia = bruto.dia;
  if (janelaPorId(bruto.janela)) c.janela = bruto.janela;
  if (faixaPorId(bruto.faixa)) c.faixa = bruto.faixa;
  // idade: { min, max } inteiros, aparados a 18–50 e na ordem certa.
  const i = bruto.idade;
  if (i && typeof i === 'object' && Number.isInteger(i.min) && Number.isInteger(i.max)) {
    const apara = (x) => Math.max(IDADE_MIN, Math.min(IDADE_MAX, x));
    c.idade = { min: apara(Math.min(i.min, i.max)), max: apara(Math.max(i.min, i.max)) };
  }
  // bairros: vazio é São Paulo inteira.
  if (Array.isArray(bruto.bairros)) c.bairros = [...new Set(bruto.bairros.filter((b) => Object.hasOwn(C.BAIRROS, b)))];
  if (tetoValido(bruto.teto)) c.teto = bruto.teto;
  if (bruto.estilos !== undefined) c.estilos = listaDeEstilos(bruto.estilos);
  if (bruto.evitarEstilos !== undefined) c.evitarEstilos = listaDeEstilos(bruto.evitarEstilos);
  if (Array.isArray(bruto.evitarBairros)) c.evitarBairros = [...new Set(bruto.evitarBairros.filter((b) => Object.hasOwn(C.BAIRROS, b)))];
  if (Array.isArray(bruto.evitarCasas)) c.evitarCasas = [...new Set(bruto.evitarCasas.filter((b) => Object.hasOwn(C.CASAS, b)))];
  if (bruto.perto === null) c.perto = null;
  else if (typeof bruto.perto === 'string' && Object.hasOwn(C.REFERENCIAS, bruto.perto)) c.perto = bruto.perto;
  // voltaMax: a hora de voltar dita na conversa. inicioMin e fimMax são
  // derivados (a janela efetiva) e não são lidos de volta.
  if (bruto.voltaMax === null) c.voltaMax = null;
  else if (typeof bruto.voltaMax === 'number' && bruto.voltaMax >= 19 && bruto.voltaMax <= 30 && (bruto.voltaMax * 2) % 1 === 0) c.voltaMax = bruto.voltaMax;
  if (Array.isArray(bruto.firmes)) c.firmes = DIMENSOES.filter((d) => bruto.firmes.includes(d));
  if (Array.isArray(bruto.evitar)) {
    c.evitar = [...new Set(bruto.evitar.filter((x) => typeof x === 'string' && /^[a-z0-9-]{1,60}$/.test(x)))].slice(0, 40);
  }
  if (typeof bruto.oferta === 'string' && /^[a-z0-9 $]{1,40}$/.test(bruto.oferta)) c.oferta = bruto.oferta;
  return c;
}

// A faixa fixa só falta quando também não veio o intervalo.
const falta = (c) => CHAVES_OBRIGATORIAS.filter((k) => !Object.hasOwn(c, k) && !(k === 'faixa' && c.idade));

// A faixa que vale para o pedido: o intervalo (R20) ou a faixa fixa da conversa.
function faixaDe(c) {
  if (c.idade) {
    const max = c.idade.max >= IDADE_MAX ? 99 : c.idade.max;
    return { min: c.idade.min, max, centro: (c.idade.min + Math.min(c.idade.max, 40)) / 2 };
  }
  return faixaPorId(c.faixa);
}

// A faixa fixa mais perto do centro do intervalo (para a conversa, que ainda
// fala em faixas). Centro entre duas faixas inteiras (29,5) fica com a de baixo.
function faixaDoIntervalo(i) {
  const centro = (i.min + Math.min(i.max, 40)) / 2;
  return (C.FAIXAS.find((f) => centro < f.max + 1) || C.FAIXAS[C.FAIXAS.length - 1]).id;
}

// Desloca o intervalo mantendo a largura, preso a 18–50 ("mais velha": +5).
function deslocarIdade(i, passo) {
  let min = i.min + passo;
  let max = i.max + passo;
  if (max > IDADE_MAX) { min -= max - IDADE_MAX; max = IDADE_MAX; }
  if (min < IDADE_MIN) { max += IDADE_MIN - min; min = IDADE_MIN; }
  return { min: Math.max(IDADE_MIN, min), max: Math.min(IDADE_MAX, max) };
}

// "28 a 35", "28 a 50 ou mais".
const nomeIdade = (i) => `${i.min} a ${i.max}${i.max >= IDADE_MAX ? ' ou mais' : ''}`;

function vizinho(a, b) {
  if (a === b) return true;
  return C.BAIRROS[a].regiao === C.BAIRROS[b].regiao || C.minutosEntre(a, b) <= MINUTOS_VIZINHO;
}

// Onde a festa fica em relação aos bairros pedidos: 'pedido', 'perto' ou null (longe).
function lugar(f, c) {
  if (!c.bairros.length || c.bairros.includes(f.bairro)) return 'pedido';
  return c.bairros.some((b) => vizinho(b, f.bairro)) ? 'perto' : null;
}

function completar(c) {
  const r = {
    dia: c.dia, janela: c.janela, faixa: c.faixa, teto: c.teto, bairros: c.bairros || [],
    estilos: c.estilos || [], evitarEstilos: c.evitarEstilos || [],
    evitarBairros: c.evitarBairros || [], evitarCasas: c.evitarCasas || [],
    perto: c.perto || null, voltaMax: c.voltaMax || null, evitar: c.evitar || [], firmes: c.firmes || [],
  };
  // A janela pedida, em horas que podem passar de 24: chegar a partir de
  // inicioMin, voltar até fimMax (a volta da conversa, se for antes).
  const j = janelaPorId(c.janela);
  if (j) {
    r.inicioMin = j.inicio;
    r.fimMax = r.voltaMax ? Math.min(j.fim, r.voltaMax) : j.fim;
  }
  if (c.idade) {
    r.idade = { ...c.idade };
    // A conversa ainda fala em faixas: sai sempre do intervalo, para não ficar velha.
    r.faixa = faixaDoIntervalo(c.idade);
  }
  if (c.oferta) r.oferta = c.oferta;
  return r;
}

// O pedido como frase, em partes; as que vêm do formulário reabrem a pergunta.
function pedidoEmPartes(c) {
  const j = janelaPorId(c.janela);
  const partes = [
    { chave: 'dia', texto: C.DIAS[c.dia].nome },
    { chave: 'janela', texto: `das ${j.rotulo}` },
    c.idade ? { chave: 'idade', texto: `gente de ${nomeIdade(c.idade)}` } : { chave: 'faixa', texto: `gente de ${C.nomeFaixa(c.faixa)}` },
    { chave: 'teto', texto: c.teto === 'sem-limite' ? 'sem teto de preço' : c.teto === 0 ? 'só de graça' : `até R$ ${c.teto}` },
  ];
  // Onde: os bairros com a preposição de cada um; sem bairro, a cidade toda
  // (só no formulário novo, que tem a pergunta de onde).
  if (c.bairros && c.bairros.length) partes.splice(2, 0, { chave: 'bairros', texto: juntar(c.bairros.map((b) => C.BAIRROS[b].em)) });
  else if (c.idade) partes.splice(2, 0, { chave: 'bairros', texto: 'em toda a cidade' });
  if (c.estilos && c.estilos.length) {
    partes.push({ chave: 'estilos', texto: c.estilos.length > 2 ? 'vários sons' : C.listaDeEstilos(c.estilos) });
  }
  if (c.evitarEstilos && c.evitarEstilos.length) partes.push({ chave: null, texto: `sem ${C.listaDeEstilos(c.evitarEstilos, 'nem')}` });
  if (c.evitarCasas && c.evitarCasas.length) partes.push({ chave: null, texto: `sem ${juntar(c.evitarCasas.map((k) => C.CASAS[k]), 'nem')}` });
  if (c.evitarBairros && c.evitarBairros.length) partes.push({ chave: null, texto: `longe ${juntar(c.evitarBairros.map((b) => C.BAIRROS[b].de))}` });
  if (c.voltaMax) partes.push({ chave: null, texto: `voltando ${C.ateAs(c.voltaMax)}` });
  if (c.perto) partes.push({ chave: null, texto: `perto ${C.REFERENCIAS[c.perto].de}` });
  return partes;
}

// "Sáb · 19h à 1h · 30 a 35 · até R$ 80 · house"
function resumoDoPedido(c) {
  const idade = c.idade ? `${c.idade.min} a ${c.idade.max}${c.idade.max >= IDADE_MAX ? '+' : ''}` : C.nomeFaixa(c.faixa);
  const partes = [C.DIAS[c.dia].curto, janelaPorId(c.janela).rotulo, idade, C.rotuloTeto(c.teto)];
  if (c.bairros && c.bairros.length) partes.splice(2, 0, c.bairros.map((b) => C.BAIRROS[b].nome).join(', '));
  if (c.estilos && c.estilos.length > 2) partes.push('vários sons');
  else if (c.estilos && c.estilos.length) partes.push(C.listaDeEstilos(c.estilos));
  if (c.perto) partes.push(`perto ${C.REFERENCIAS[c.perto].de}`);
  return partes.join(' · ');
}

// ---------------------------------------------------------------- filtros

function proximoDegrau(teto) {
  if (teto === 'sem-limite') return 'sem-limite';
  return C.DEGRAUS_TETO.find((d) => d === 'sem-limite' || d > teto);
}

function faixasVizinhas(id) {
  const i = C.FAIXAS.findIndex((f) => f.id === id);
  return C.FAIXAS.filter((_, j) => Math.abs(j - i) <= 1).map((f) => f.id);
}

// A hora de chegar e a de voltar: a janela é as duas coisas.
function cabeNoHorario(f, janela, folga) {
  const volta = janela.fim + (folga > TOLERANCIA ? VOLTA_AFROUXADA : 0);
  return f.esquenta >= janela.inicio - folga
    && f.esquenta <= janela.fim - 1
    && f.inicio <= janela.fim - 2
    && f.fim >= janela.inicio + 2
    && f.fim <= volta;
}

const cabeNoPreco = (f, teto) => teto === 'sem-limite' || f.preco <= teto;

// Distância, em anos, da média da festa até a faixa pedida (0 dentro dela).
function foraDaFaixa(f, c) {
  const fx = faixaDe(c);
  if (f.mediaIdade < fx.min) return fx.min - f.mediaIdade;
  if (f.mediaIdade > fx.max) return f.mediaIdade - fx.max;
  return 0;
}

// Estilo recusado barra a festa, a não ser que o som principal dela tenha
// sido pedido de propósito ("sem pop" e depois "funk também").
function barradaPorEstilo(f, c) {
  if (!f.estilos.some((e) => c.evitarEstilos.includes(e))) return false;
  return !c.estilos.includes(f.estilos[0]);
}

const barradaPorCasa = (f, c) => c.evitarCasas.some((k) => C.semAcento(f.casa).includes(k));

function passa(f, c, nivel) {
  if (f.dia !== c.dia) return false;
  if (c.evitar.includes(f.id)) return false;
  if (c.evitarBairros.includes(f.bairro)) return false;
  if (barradaPorEstilo(f, c) || barradaPorCasa(f, c)) return false;
  if (c.voltaMax && f.fim > c.voltaMax) return false;
  if (!lugar(f, c)) return false;
  if (!cabeNoHorario(f, janelaPorId(c.janela), nivel.folga)) return false;
  if (!cabeNoPreco(f, nivel.teto)) return false;
  // Com o intervalo (R21), a idade não tira festa: só ordena.
  return Boolean(c.idade) || foraDaFaixa(f, c) <= nivel.idade;
}

const casaComEstilo = (f, c) => c.estilos.length > 0 && f.estilos.some((e) => c.estilos.includes(e));

// ---------------------------------------------------------------- pontos

function distancia(f, perto) {
  const ref = C.REFERENCIAS[perto];
  return C.minutosEntre(ref.bairro, f.bairro) + f.distanciaMin;
}

function afinidade(f, c) {
  let melhor = 0;
  for (const pedido of c.estilos) {
    for (const e of f.estilos) melhor = Math.max(melhor, (C.AFINIDADE[pedido] || {})[e] || 0);
  }
  return melhor;
}

function pontuar(f, c) {
  const faixa = faixaDe(c);
  const janela = janelaPorId(c.janela);
  let s = 0;
  s += 3 * clamp(1 - Math.abs(f.mediaIdade - faixa.centro) / 6);
  s += 2 * clamp(1 - Math.abs(f.esquenta - (janela.inicio + 2)) / 4);
  if (c.estilos.length) {
    if (c.estilos.includes(f.estilos[0])) s += 3;
    else if (casaComEstilo(f, c)) s += 2;
    else s += 1.5 * afinidade(f, c);
  }
  if (c.perto) s += 6 * clamp(1 - distancia(f, c.perto) / 30);
  return Math.round(s * 1000) / 1000;
}

// Quem cabe no pedido sem afrouxar vem antes de quem só entrou afrouxando.
const ordenar = (a, b) => (b.estrita ? 1 : 0) - (a.estrita ? 1 : 0) || b.pontos - a.pontos
  || a.festa.preco - b.festa.preco || a.festa.id.localeCompare(b.festa.id);

// Pega as melhores sem repetir o estilo principal, quando dá.
function separar(candidatas, c, quantas) {
  const resto = [...candidatas].sort(ordenar);
  const escolhidas = [];
  const diversificar = c.estilos.length !== 1;
  while (escolhidas.length < quantas && resto.length) {
    let i = 0;
    if (diversificar && escolhidas.length) {
      const usados = new Set(escolhidas.map((x) => x.festa.estilos[0]));
      const j = resto.findIndex((x) => !usados.has(x.festa.estilos[0]));
      if (j > 0 && (resto[j].estrita || !resto[0].estrita) && resto[j].pontos >= resto[0].pontos - MARGEM_DIVERSIDADE) i = j;
    }
    escolhidas.push(resto.splice(i, 1)[0]);
  }
  return escolhidas;
}

// Primeiro as que casam com o estilo pedido; depois o som parecido; por último, outros sons.
function separarComEstilo(candidatas, c, quantas) {
  if (!c.estilos.length) return separar(candidatas, c, quantas);
  const casam = candidatas.filter((x) => casaComEstilo(x.festa, c));
  const escolhidas = separar(casam, c, quantas);
  for (const grupo of [
    candidatas.filter((x) => !casaComEstilo(x.festa, c) && afinidade(x.festa, c) > 0),
    candidatas.filter((x) => !casaComEstilo(x.festa, c) && afinidade(x.festa, c) === 0),
  ]) {
    if (escolhidas.length >= quantas) break;
    escolhidas.push(...grupo.sort(ordenar).slice(0, quantas - escolhidas.length));
  }
  return escolhidas;
}

// ---------------------------------------------------------------- o porquê

// O que esta festa fura do pedido, em frases curtas. Vem sempre primeiro.
function violacoes(f, c) {
  const v = [];
  const anos = foraDaFaixa(f, c);
  // Com o intervalo, qualquer ano fora conta; até 3, "um pouco" (R21).
  if (c.idade ? anos > 0 : anos > IDADE_TOLERADA) {
    const lado = f.mediaIdade < faixaDe(c).min ? 'abaixo' : 'acima';
    v.push(`média ${f.mediaIdade}, ${c.idade && anos <= QUASE_NA_FAIXA ? 'um pouco ' : ''}${lado} da sua faixa`);
  }
  if (c.estilos.length && !casaComEstilo(f, c)) v.push(afinidade(f, c) > 0 ? 'som parecido, não o pedido' : 'fora do seu som');
  if (!cabeNoPreco(f, c.teto)) v.push(`R$ ${f.preco - c.teto} acima do teto`);
  const j = janelaPorId(c.janela);
  if (f.esquenta < j.inicio - TOLERANCIA || f.fim < j.inicio + 2) v.push(`enche ${C.asHoras(f.esquenta)}, antes da sua hora`);
  else if (f.esquenta > j.fim - 1 || f.inicio > j.fim - 2) v.push(`enche ${C.asHoras(f.esquenta)}, depois da sua hora`);
  const volta = c.voltaMax ? Math.min(c.voltaMax, j.fim) : j.fim;
  if (f.fim > volta) v.push(`acaba ${C.asHoras(f.fim)}, depois da sua volta`);
  return v;
}

// O que distingue a festa, sem repetir o pedido nem a frase do curador.
function distintivos(f, c) {
  const m = [];
  // Bloco dos vizinhos: quão perto do bairro marcado mais próximo.
  if (c.bairros.length && lugar(f, c) === 'perto') {
    const [b, min] = c.bairros.map((x) => [x, C.minutosEntre(x, f.bairro)]).sort((a, z) => a[1] - z[1])[0];
    m.push(`a ${min} min ${C.BAIRROS[b].de}`);
  }
  if (c.perto) m.push(`a ${distancia(f, c.perto)} min ${C.REFERENCIAS[c.perto].de}`);
  if (f.preco === 0) m.push('de graça');
  // Sem conta de troco: o quanto o preço cabe no teto, em palavras.
  else if (c.teto !== 'sem-limite' && c.teto - f.preco >= 30) m.push('bem abaixo do seu teto');
  else if (c.teto !== 'sem-limite' && c.teto - f.preco >= 10) m.push('dentro do seu teto');
  const j = janelaPorId(c.janela);
  if (f.fim <= j.fim - 2) m.push(`acaba ${C.asHoras(f.fim)}, dá pra voltar cedo`);
  if (c.estilos.length > 1) {
    const casou = f.estilos.find((e) => c.estilos.includes(e));
    if (casou) m.push(C.nomeEstilo(casou));
  }
  return m;
}

function opcao(f, c) {
  const fora = violacoes(f, c);
  const extra = distintivos(f, c);
  return {
    festa: f,
    patrocinada: f.selo === 'patrocinado',
    // Cabe no pedido: sem furo e no bairro pedido (vizinho não conta).
    atende: fora.length === 0 && !(c.bairros.length && lugar(f, c) === 'perto'),
    fora,
    linha: C.linhaDaFesta(f),
    hora: C.horaCheia(f.inicio),
    dia: C.DIAS[f.dia].curto,
    bairro: C.BAIRROS[f.bairro].nome,
    horario: C.fraseDoHorario(f),
    preco: C.reais(f.preco),
    origem: { curta: f.origemIdadeCurta, longa: f.origemIdade },
    // Uma frase quando a festa fura o pedido; null quando cabe.
    aviso: fora.length ? `${fora.join('; ').replace(/^./, (x) => x.toUpperCase())}.` : null,
    // O que fura vem inteiro; o que distingue completa até dois.
    motivos: [...fora, ...extra].slice(0, Math.max(2, fora.length)),
    casaComEstilo: c.estilos.length ? casaComEstilo(f, c) : null,
    distancia: c.perto ? distancia(f, c.perto) : null,
    // O bloco da lista (R19, R21): no pedido, perto dos bairros, ou fora da faixa.
    bloco: bloco(f, c),
  };
}

function bloco(f, c) {
  if (c.idade && foraDaFaixa(f, c) > 0) return 'faixa';
  // No formulário novo, nada que fure o pedido fica misturado com o que cabe.
  if (c.idade && violacoes(f, c).length) return 'quase';
  return lugar(f, c) === 'perto' ? 'perto' : 'pedido';
}
const posicaoDoBloco = (f, c) => BLOCOS.indexOf(bloco(f, c));

// ---------------------------------------------------------------- escolher

function niveis(c) {
  const estrito = { folga: TOLERANCIA, teto: c.teto, idade: IDADE_TOLERADA, afrouxou: [] };
  const lista = [estrito];
  let ultimo = estrito;
  if (!c.firmes.includes('horario')) {
    ultimo = { ...ultimo, folga: TOLERANCIA_AFROUXADA, afrouxou: [...ultimo.afrouxou, 'horario'] };
    lista.push(ultimo);
  }
  if (!c.firmes.includes('preco') && c.teto !== 'sem-limite') {
    ultimo = { ...ultimo, teto: proximoDegrau(c.teto), afrouxou: [...ultimo.afrouxou, 'preco'] };
    lista.push(ultimo);
  }
  if (!c.firmes.includes('idade') && !c.idade) {
    lista.push({ ...ultimo, idade: QUASE_NA_FAIXA, afrouxou: [...ultimo.afrouxou, 'idade'] });
  }
  return lista;
}

// As dimensões que esta festa fura (vazio quando cabe no pedido).
function foraDoPedido(f, c) {
  const fora = [];
  const j = janelaPorId(c.janela);
  if (!cabeNoHorario(f, j, TOLERANCIA) || (c.voltaMax && f.fim > c.voltaMax)) fora.push('horario');
  if (!cabeNoPreco(f, c.teto)) fora.push('preco');
  if (c.idade ? foraDaFaixa(f, c) > 0 : foraDaFaixa(f, c) > IDADE_TOLERADA) fora.push('idade');
  if (c.estilos.length && !casaComEstilo(f, c)) fora.push('estilo');
  // Bairro vizinho não é o pedido: entra rotulado, e não conta como "cabe".
  if (c.bairros.length && lugar(f, c) === 'perto') fora.push('lugar');
  return fora;
}

// Uma frase, curta, sobre como entrou o que não cabe.
function textoDoAviso({ ordem, c, nivelUsado, impedimento }) {
  const total = ordem.length;
  const atendem = ordem.filter((x) => foraDoPedido(x.festa, c).length === 0).length;
  // O título já diz "Nada do jeito que você pediu."; a fala diz o resto.
  if (atendem === 0) return impedimento || 'Seguem as mais perto.';
  const dims = new Set(ordem.flatMap((x) => foraDoPedido(x.festa, c)));
  const como = [];
  if (dims.has('horario')) como.push('abrindo o horário');
  if (dims.has('preco')) como.push(nivelUsado.teto === 'sem-limite' ? 'sem teto' : `subindo o teto pra R$ ${nivelUsado.teto}`);
  if (dims.has('idade')) como.push(c.idade ? 'com média fora da sua faixa' : 'com média de idade vizinha');
  if (dims.has('lugar')) como.push('em bairros vizinhos');
  if (dims.has('estilo')) {
    // "Som parecido" só quando todas as de fora do som pedido são mesmo parecidas.
    const parecido = ordem.filter((x) => !casaComEstilo(x.festa, c)).every((x) => afinidade(x.festa, c) > 0);
    como.push(parecido ? 'com som parecido' : 'com outros sons');
  }
  if (atendem === total) return `Só ${NUMERAL[total]} ${total === 1 ? 'cabe' : 'cabem'} nesse pedido.`;
  const resto = total - atendem;
  const cabem = `${atendem === 1 ? 'Uma cabe' : 'Duas cabem'} no pedido`;
  const outras = resto === 1 ? 'a outra entrou' : 'as outras entraram';
  return `${cabem}; ${outras} ${juntar(como)}.`;
}

function rodar(c, base) {
  const editoriais = base.filter((f) => f.selo !== 'patrocinado');
  const lista = niveis(c);
  let nivelUsado = lista[0];
  let candidatas = [];
  for (const nivel of lista) {
    nivelUsado = nivel;
    candidatas = editoriais.filter((f) => passa(f, c, nivel))
      .map((f) => ({ festa: f, pontos: pontuar(f, c), estrita: passa(f, c, lista[0]) }));
    if (candidatas.length >= 3) break;
  }
  // Por camadas (R19, R21): primeiro o que fica nos bairros pedidos e na
  // faixa; depois os bairros vizinhos; por último quem tem a média fora.
  const escolhidas = [];
  for (const b of BLOCOS) {
    if (escolhidas.length >= 3) break;
    const camada = candidatas.filter((x) => posicaoDoBloco(x.festa, c) === BLOCOS.indexOf(b));
    escolhidas.push(...separarComEstilo(camada, c, 3 - escolhidas.length));
  }

  // Patrocinada: cabe no pedido sem afrouxar nada, casa com o estilo pedido
  // (quando há), e é tão aderente quanto a editorial que ela tiraria.
  const patrocinada = base
    .filter((f) => f.selo === 'patrocinado' && passa(f, c, lista[0]) && bloco(f, c) === 'pedido' && (!c.estilos.length || casaComEstilo(f, c)))
    .map((f) => ({ festa: f, pontos: pontuar(f, c) }))
    .sort(ordenar)[0];
  let finais = escolhidas;
  if (patrocinada && escolhidas.length >= 2) {
    const referencia = escolhidas[Math.min(2, escolhidas.length - 1)];
    const primeiraHora = Math.min(...escolhidas.slice(0, 2).map((x) => x.festa.inicio));
    // Na ordem de horário ela nunca pode abrir a lista.
    if (patrocinada.pontos >= referencia.pontos && patrocinada.festa.inicio >= primeiraHora) {
      finais = [...escolhidas.slice(0, 2), patrocinada];
    }
  }
  return { finais, nivelUsado };
}

// Lista vazia: diz o que travou e oferece soltar, quando soltar resolve.
function ofertaQuandoVazio(c, base) {
  const tenta = (mudanca) => rodar(completar({ ...c, ...mudanca }), base).finais.length > 0;
  if (c.firmes.includes('preco') && c.teto !== 'sem-limite') {
    for (const novo of C.DEGRAUS_TETO.filter((d) => d === 'sem-limite' || d > c.teto)) {
      if (!tenta({ teto: novo })) continue;
      if (novo === 'sem-limite') return { texto: `Até R$ ${c.teto}, nada cabe. Quer tirar o teto?`, frase: 'sem limite', rotulo: 'Tirar o teto' };
      return { texto: `Até R$ ${c.teto}, nada cabe. Até R$ ${novo}, sim.`, frase: `ate ${novo}`, rotulo: `Subir pra R$ ${novo}` };
    }
  }
  if (c.voltaMax) {
    const novo = Math.min(30, c.voltaMax + 2);
    if (tenta({ voltaMax: novo })) {
      return { texto: `Voltando ${C.ateAs(c.voltaMax)}, nada cabe. ${C.ateAs(novo).replace(/^a/, 'A')}, sim.`, frase: `voltar ate as ${C.hora(novo)}`, rotulo: `Voltar ${C.ateAs(novo)}` };
    }
  }
  if (c.firmes.includes('horario')) {
    const i = C.JANELAS.findIndex((j) => j.id === c.janela);
    for (const [k, frase] of [[i + 1, 'mais tarde'], [i - 1, 'mais cedo']]) {
      const j = C.JANELAS[k];
      if (j && tenta({ janela: j.id })) return { texto: `Nesse horário nada cabe. ${j.nome[0].toUpperCase()}${j.nome.slice(1)}, sim.`, frase, rotulo: `Ir ${j.pra}` };
    }
  }
  if (c.firmes.includes('idade')) {
    for (const viz of faixasVizinhas(c.faixa).filter((x) => x !== c.faixa)) {
      if (tenta({ faixa: viz })) {
        const nome = C.nomeFaixa(viz);
        return { texto: `Com gente de ${C.nomeFaixa(c.faixa)}, nada cabe. De ${nome}, sim.`, frase: `publico de ${nome}`, rotulo: `Gente de ${nome}` };
      }
    }
  }
  if ((c.evitarEstilos.length || c.evitarCasas.length || c.evitarBairros.length) && tenta({ evitarEstilos: [], evitarCasas: [], evitarBairros: [] })) {
    return { texto: 'Com tudo o que você tirou, nada cabe.', frase: 'pode tudo de novo', rotulo: 'Liberar o que tirei' };
  }
  for (const d of C.ORDEM_DIAS.filter((x) => x !== c.dia)) {
    if (tenta({ dia: d })) {
      const nome = C.DIAS[d].frase;
      return { texto: `${c.firmes.length ? 'Nada cabe nesse pedido.' : 'Nada cabe nesse pedido, nem afrouxando.'} ${d === 'sex' ? 'Na' : 'No'} ${nome}, sim.`, frase: nome, rotulo: `Ver ${d === 'sex' ? 'a' : 'o'} ${nome}` };
    }
  }
  return { texto: 'Nada cabe nesse pedido. Tente outro dia ou outro horário.', frase: null, rotulo: null };
}

// Por que um estilo pedido não entrou: o que barra a melhor festa daquele som.
function impedimentoDoEstilo(criterios, base, estilo) {
  const c = completar(sanearCriterios(criterios));
  const doDia = base.filter((f) => f.dia === c.dia && f.estilos.includes(estilo));
  const nome = C.nomeEstilo(estilo);
  const noDia = c.dia === 'sex' ? 'na sexta' : `no ${C.DIAS[c.dia].frase}`;
  if (!doDia.length) return `Não tem ${nome} ${noDia}.`;
  const j = janelaPorId(c.janela);
  const motivosDe = (f) => {
    if (c.evitar.includes(f.id)) return 'já saiu da lista';
    if (barradaPorEstilo(f, { ...c, estilos: [estilo] })) return `tem ${C.listaDeEstilos(f.estilos.filter((e) => c.evitarEstilos.includes(e)))}, que você tirou`;
    if (c.voltaMax && f.fim > c.voltaMax) return 'acaba depois da sua volta';
    if (!cabeNoHorario(f, j, TOLERANCIA_AFROUXADA)) return `só ${C.asHoras(f.inicio)}, com média ${f.mediaIdade}`;
    if (!cabeNoPreco(f, c.teto) && foraDaFaixa(f, c) > IDADE_TOLERADA) return `só acima de R$ ${c.teto} e com média ${f.mediaIdade}`;
    if (!cabeNoPreco(f, c.teto)) return `só acima de R$ ${c.teto}`;
    if (foraDaFaixa(f, c) > IDADE_TOLERADA) return `só com média ${f.mediaIdade}`;
    return null;
  };
  const razoes = doDia.map(motivosDe).filter(Boolean);
  if (!razoes.length) return null;
  return `${nome[0].toUpperCase()}${nome.slice(1)} ${noDia}, ${razoes[0]}.`;
}

// O preço mais baixo que ainda tem festa nesse pedido (o resto todo valendo).
function precoMinimo(criterios, base) {
  const c = completar(sanearCriterios(criterios));
  const nivel = { folga: TOLERANCIA, teto: 'sem-limite', idade: IDADE_TOLERADA };
  const precos = base.filter((f) => f.selo !== 'patrocinado' && passa(f, c, nivel)).map((f) => f.preco);
  return precos.length ? Math.min(...precos) : null;
}

// escolher(criterios, base) -> { opcoes, atendem, aviso?, oferta?, afrouxou, casam }
function escolher(criteriosBrutos, base) {
  const saneados = sanearCriterios(criteriosBrutos);
  const faltam = falta(saneados);
  if (faltam.length) throw new Error(`faltam critérios: ${faltam.join(', ')}`);
  const c = completar(saneados);
  const { finais, nivelUsado } = rodar(c, base);

  // Em ordem de horário, como uma programação. A patrocinada fica no lugar
  // dela, mas nunca em primeiro.
  const pago = (x) => (x.festa.selo === 'patrocinado' ? 1 : 0);
  const ordem = [...finais].sort((a, b) => posicaoDoBloco(a.festa, c) - posicaoDoBloco(b.festa, c)
    || a.festa.inicio - b.festa.inicio || pago(a) - pago(b) || a.festa.id.localeCompare(b.festa.id));

  const opcoes = ordem.map((x) => opcao(x.festa, c));
  const afrouxou = DIMENSOES.filter((k) => ordem.some((x) => foraDoPedido(x.festa, c).includes(k)));
  const casam = ordem.filter((x) => casaComEstilo(x.festa, c)).length;
  const atendem = opcoes.filter((o) => o.atende).length;
  const resultado = { opcoes, atendem, afrouxou, casam };
  // Os rótulos dos blocos da lista e quantas cabem de fato no pedido (o título conta só essas).
  resultado.noPedido = opcoes.filter((o) => o.bloco === 'pedido' && o.atende).length;
  resultado.blocos = {
    perto: c.bairros.length ? `Perto ${juntar(c.bairros.map((b) => C.BAIRROS[b].de))}` : 'Perto das suas regiões',
    quase: 'Quase no seu pedido',
    faixa: 'Fora da sua faixa',
  };
  if (!ordem.length) {
    const o = ofertaQuandoVazio(c, base);
    resultado.aviso = o.texto;
    if (o.frase) resultado.oferta = { frase: o.frase, rotulo: o.rotulo };
  } else if (atendem < ordem.length || ordem.length < 3) {
    const impedimento = c.estilos.length && casam === 0
      ? impedimentoDoEstilo(c, base, c.estilos[c.estilos.length - 1]) : null;
    resultado.aviso = textoDoAviso({ ordem, c, nivelUsado, impedimento });
  }
  return resultado;
}

module.exports = {
  TOLERANCIA, TOLERANCIA_AFROUXADA, CHAVES_OBRIGATORIAS, DIMENSOES, QUASE_NA_FAIXA, IDADE_TOLERADA,
  sanearCriterios, falta, completar, resumoDoPedido, pedidoEmPartes, escolher, opcao, distancia, pontuar,
  foraDoPedido, proximoDegrau, faixasVizinhas, cabeNoHorario, janelaPorId, impedimentoDoEstilo, casaComEstilo,
  precoMinimo, juntar, vizinho, faixaDe, IDADE_MIN, IDADE_MAX, BLOCOS, deslocarIdade, faixaDoIntervalo, nomeIdade,
};

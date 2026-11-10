'use strict';
// O vocabulário do Finde: dias, janelas de horário, faixas de idade, tetos,
// estilos e bairros, e as funções que escrevem horário e preço do jeito da marca.
// Puro: sem arquivo, sem relógio.

const DIAS = {
  sex: { id: 'sex', nome: 'Sexta', curto: 'Sex', frase: 'sexta' },
  sab: { id: 'sab', nome: 'Sábado', curto: 'Sáb', frase: 'sábado' },
  dom: { id: 'dom', nome: 'Domingo', curto: 'Dom', frase: 'domingo' },
};
const ORDEM_DIAS = ['sex', 'sab', 'dom'];

// Horas contadas da meia-noite do dia da festa; depois da meia-noite passa de 24
// (1h da manhã = 25). Assim uma festa de sábado que acaba às 3h tem fim 27.
const JANELAS = [
  { id: 'fim-de-tarde', inicio: 17, fim: 23, rotulo: '17h às 23h', nome: 'fim de tarde', pra: 'pro fim de tarde', no: 'no fim de tarde' },
  { id: 'comeco-da-noite', inicio: 19, fim: 25, rotulo: '19h à 1h', nome: 'começo da noite', pra: 'pro começo da noite', no: 'no começo da noite' },
  { id: 'noite', inicio: 22, fim: 27, rotulo: '22h às 3h', nome: 'noite', pra: 'pra noite', no: 'na noite' },
];

const FAIXAS = [
  { id: '18-24', min: 18, max: 24, centro: 21.5, rotulo: '18 a 24' },
  { id: '25-29', min: 25, max: 29, centro: 27, rotulo: '25 a 29' },
  { id: '30-35', min: 30, max: 35, centro: 32.5, rotulo: '30 a 35' },
  { id: '36+', min: 36, max: 99, centro: 39, rotulo: '36 ou mais' },
];

// Teto por pessoa, em reais. "sem-limite" é a quarta resposta.
const TETOS = [
  { id: 50, rotulo: 'R$ 50' },
  { id: 80, rotulo: 'R$ 80' },
  { id: 150, rotulo: 'R$ 150' },
  { id: 'sem-limite', rotulo: 'Sem limite' },
];
// Os degraus que o afrouxamento e o "mais barato" percorrem.
const DEGRAUS_TETO = [0, 50, 80, 150, 'sem-limite'];
// Os degraus do "mais barato": mais finos embaixo, para não pular de R$ 50 para grátis.
const DEGRAUS_BARATO = [0, 20, 30, 50, 80, 150];

const ESTILOS = [
  { id: 'house-disco', rotulo: 'House e disco', curto: 'house' },
  { id: 'pop-2000', rotulo: 'Pop anos 2000', curto: 'pop 2000' },
  { id: 'mpb-samba', rotulo: 'MPB e samba', curto: 'MPB' },
  { id: 'funk', rotulo: 'Funk', curto: 'funk' },
  { id: 'indie-rock', rotulo: 'Indie e rock', curto: 'indie' },
  { id: 'eletronica', rotulo: 'Eletrônica', curto: 'eletrônica' },
];
// Quanto um som lembra o outro, para completar a lista quando falta o estilo pedido.
const AFINIDADE = {
  'house-disco': { eletronica: 1, 'pop-2000': 0.5 },
  eletronica: { 'house-disco': 1 },
  'pop-2000': { funk: 0.6, 'house-disco': 0.5, 'indie-rock': 0.4 },
  funk: { 'pop-2000': 0.6 },
  'mpb-samba': { 'indie-rock': 0.3 },
  'indie-rock': { 'pop-2000': 0.4, 'mpb-samba': 0.3 },
};
const ID_ESTILOS = ESTILOS.map((e) => e.id);

const REGIOES = { oeste: 'Zona Oeste', centro: 'Centro', 'centro-sul': 'Centro-Sul' };

// Os sete bairros da base, com a preposição certa para "a 8 min de ___".
const BAIRROS = {
  pinheiros: { nome: 'Pinheiros', de: 'de Pinheiros', regiao: 'oeste' },
  'vila-madalena': { nome: 'Vila Madalena', de: 'da Vila Madalena', regiao: 'oeste' },
  'barra-funda': { nome: 'Barra Funda', de: 'da Barra Funda', regiao: 'oeste' },
  centro: { nome: 'Centro', de: 'do Centro', regiao: 'centro' },
  'bela-vista': { nome: 'Bela Vista', de: 'da Bela Vista', regiao: 'centro' },
  jardins: { nome: 'Jardins', de: 'dos Jardins', regiao: 'centro-sul' },
  'vila-mariana': { nome: 'Vila Mariana', de: 'da Vila Mariana', regiao: 'centro-sul' },
};

// Minutos de carro, à noite, entre os pontos de referência de cada bairro
// (Largo da Batata, Praça Benedito Calixto, metrô Barra Funda, Praça da República,
// Bixiga, Oscar Freire, metrô Vila Mariana). Aproximação de protótipo.
const MINUTOS = {
  pinheiros: { 'vila-madalena': 6, 'barra-funda': 12, centro: 15, 'bela-vista': 14, jardins: 10, 'vila-mariana': 18 },
  'vila-madalena': { 'barra-funda': 12, centro: 16, 'bela-vista': 15, jardins: 12, 'vila-mariana': 20 },
  'barra-funda': { centro: 10, 'bela-vista': 14, jardins: 16, 'vila-mariana': 22 },
  centro: { 'bela-vista': 6, jardins: 12, 'vila-mariana': 15 },
  'bela-vista': { jardins: 7, 'vila-mariana': 10 },
  jardins: { 'vila-mariana': 10 },
};

function minutosEntre(a, b) {
  if (a === b) return 0;
  return (MINUTOS[a] && MINUTOS[a][b]) || (MINUTOS[b] && MINUTOS[b][a]) || 30;
}

// Pontos que alguém pode citar no "mais perto de ___": os sete bairros e
// vizinhos conhecidos, cada um apontando para o bairro da base mais próximo.
const REFERENCIAS = {
  ...Object.fromEntries(Object.entries(BAIRROS).map(([id, b]) => [id, { bairro: id, nome: b.nome, de: b.de }])),
  'largo-da-batata': { bairro: 'pinheiros', nome: 'Largo da Batata', de: 'do Largo da Batata' },
  butanta: { bairro: 'pinheiros', nome: 'Butantã', de: 'do Butantã' },
  'alto-de-pinheiros': { bairro: 'pinheiros', nome: 'Alto de Pinheiros', de: 'do Alto de Pinheiros' },
  sumare: { bairro: 'vila-madalena', nome: 'Sumaré', de: 'do Sumaré' },
  perdizes: { bairro: 'barra-funda', nome: 'Perdizes', de: 'de Perdizes' },
  lapa: { bairro: 'barra-funda', nome: 'Lapa', de: 'da Lapa' },
  'santa-cecilia': { bairro: 'centro', nome: 'Santa Cecília', de: 'de Santa Cecília' },
  higienopolis: { bairro: 'centro', nome: 'Higienópolis', de: 'de Higienópolis' },
  republica: { bairro: 'centro', nome: 'República', de: 'da República' },
  liberdade: { bairro: 'bela-vista', nome: 'Liberdade', de: 'da Liberdade' },
  bixiga: { bairro: 'bela-vista', nome: 'Bixiga', de: 'do Bixiga' },
  consolacao: { bairro: 'bela-vista', nome: 'Consolação', de: 'da Consolação' },
  augusta: { bairro: 'bela-vista', nome: 'Augusta', de: 'da Augusta' },
  paulista: { bairro: 'bela-vista', nome: 'Paulista', de: 'da Paulista' },
  'itaim-bibi': { bairro: 'jardins', nome: 'Itaim', de: 'do Itaim' },
  'jardim-paulista': { bairro: 'jardins', nome: 'Jardim Paulista', de: 'do Jardim Paulista' },
  'oscar-freire': { bairro: 'jardins', nome: 'Oscar Freire', de: 'da Oscar Freire' },
  moema: { bairro: 'vila-mariana', nome: 'Moema', de: 'de Moema' },
  paraiso: { bairro: 'vila-mariana', nome: 'Paraíso', de: 'do Paraíso' },
  ibirapuera: { bairro: 'vila-mariana', nome: 'Ibirapuera', de: 'do Ibirapuera' },
};

// Tipos de casa que dá para recusar ("nada de rooftop"). Casam com o texto de
// `casa` da festa, sem acento.
const CASAS = {
  rooftop: 'rooftop', terraco: 'terraço', galpao: 'galpão', porao: 'porão', quintal: 'quintal',
  praca: 'praça', laje: 'laje', salao: 'salão', clube: 'clube', sobrado: 'sobrado', varanda: 'varanda',
  quadra: 'quadra', 'casa noturna': 'casa noturna', bar: 'bar',
};
const semAcento = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ---------------------------------------------------------------- escrita

// 19 -> "19h00"; 24.5 -> "0h30"; 25 -> "1h00". Para a linha de rótulo.
function horaCheia(h) {
  const total = Math.round(h * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}h${String(mm).padStart(2, '0')}`;
}

// 19 -> "19h"; 24.5 -> "0h30". Para frases.
function hora(h) {
  const total = Math.round(h * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}

// "às 19h", "à 1h", "à meia-noite".
function asHoras(h) {
  const total = Math.round(h * 60) % (24 * 60);
  if (total === 0) return 'à meia-noite';
  if (total < 120) return `à ${hora(h)}`;
  return `às ${hora(h)}`;
}

// "até as 23h", "até a 1h", "até a meia-noite".
function ateAs(h) {
  return asHoras(h).replace(/^às /, 'até as ').replace(/^à /, 'até a ');
}

function reais(valor) {
  return valor === 0 ? 'grátis' : `R$ ${valor}`;
}

function rotuloTeto(teto) {
  if (teto === 'sem-limite') return 'sem limite';
  if (teto === 0) return 'só grátis';
  return `até R$ ${teto}`;
}

function nomeFaixa(id) {
  const f = FAIXAS.find((x) => x.id === id);
  return f ? f.rotulo : id;
}

function nomeEstilo(id) {
  const e = ESTILOS.find((x) => x.id === id);
  return e ? e.curto : id;
}

// "Sáb · 19h00 · Pinheiros · média 31 anos": horário primeiro, idade junto (regra 3 da voz).
function linhaDaFesta(f) {
  return `${DIAS[f.dia].curto} · ${horaCheia(f.inicio)} · ${BAIRROS[f.bairro].nome} · média ${f.mediaIdade} anos`;
}

// "Começa às 19h, a pista enche às 21h e acaba à 1h." Um nome só para o
// melhor momento da festa: a pista cheia.
function fraseDoHorario(f) {
  return `Começa ${asHoras(f.inicio)}, a pista enche ${asHoras(f.esquenta)} e acaba ${asHoras(f.fim)}.`;
}

// De onde vem a média de idade. O número nunca aparece sem a origem.
const ORIGENS = ['produtora', 'edicoes', 'avaliacoes'];
function origemLonga(o) {
  if (o.tipo === 'produtora') return 'informada pela produtora';
  if (o.tipo === 'edicoes') return 'estimada pelo público das edições anteriores';
  return `a partir de ${o.avaliacoes} avaliações de quem foi`;
}
function origemCurta(o) {
  if (o.tipo === 'produtora') return 'pela produtora';
  if (o.tipo === 'edicoes') return 'edições passadas';
  return `${o.avaliacoes} avaliações`;
}

// "house", "house ou pop 2000", "funk, indie ou MPB"
function listaDeEstilos(ids, conjuncao = 'ou') {
  const nomes = ids.map(nomeEstilo);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} ${conjuncao} ${nomes[nomes.length - 1]}`;
}

module.exports = {
  CASAS, semAcento,
  ORIGENS, origemLonga, origemCurta,
  DIAS, ORDEM_DIAS, JANELAS, FAIXAS, TETOS, DEGRAUS_TETO, DEGRAUS_BARATO, ESTILOS, ID_ESTILOS, AFINIDADE, REGIOES, BAIRROS, REFERENCIAS, listaDeEstilos,
  minutosEntre, horaCheia, hora, asHoras, ateAs, reais, rotuloTeto, nomeFaixa, nomeEstilo, linhaDaFesta, fraseDoHorario,
};

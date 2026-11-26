'use strict';
// O vocabulário do Finde: dias, janelas de horário, tetos,
// estilos e bairros, e as funções que escrevem horário e preço do jeito da marca.
// Puro: sem arquivo, sem relógio.

// Os sete dias e "hoje", cada um com o artigo certo ("na sexta", "no sábado";
// "hoje" dispensa artigo). Todos são chaves próprias de DIAS: C.DIAS[f.dia]
// acha qualquer dia (uma festa de segunda, pelo "hoje" do plano de 24/11).
// O pedido aceita só os de ORDEM_DIAS (D2: quinta a domingo, mais "hoje"); a
// base fictícia só tem sexta, sábado e domingo (DIAS_FICTICIOS).
const TODOS_OS_DIAS = {
  seg: { id: 'seg', nome: 'Segunda', curto: 'Seg', frase: 'segunda', artigo: 'na' },
  ter: { id: 'ter', nome: 'Terça', curto: 'Ter', frase: 'terça', artigo: 'na' },
  qua: { id: 'qua', nome: 'Quarta', curto: 'Qua', frase: 'quarta', artigo: 'na' },
  qui: { id: 'qui', nome: 'Quinta', curto: 'Qui', frase: 'quinta', artigo: 'na' },
  sex: { id: 'sex', nome: 'Sexta', curto: 'Sex', frase: 'sexta', artigo: 'na' },
  sab: { id: 'sab', nome: 'Sábado', curto: 'Sáb', frase: 'sábado', artigo: 'no' },
  dom: { id: 'dom', nome: 'Domingo', curto: 'Dom', frase: 'domingo', artigo: 'no' },
  hoje: { id: 'hoje', nome: 'Hoje', curto: 'Hoje', frase: 'hoje', artigo: null },
};
const DIAS = TODOS_OS_DIAS;
// Os dias do pedido, na ordem de "Sair quando?" (KTD15): "hoje" e quinta a domingo.
const ORDEM_DIAS = ['hoje', 'qui', 'sex', 'sab', 'dom'];
// Os dias da semana que o pedido oferece com data (quinta a domingo).
const DIAS_DA_SEMANA_DO_PEDIDO = ['qui', 'sex', 'sab', 'dom'];
// Os dias da base fictícia.
const DIAS_FICTICIOS = ['sex', 'sab', 'dom'];
// getUTCDay() -> id do dia.
const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// "na sexta", "no sábado", "hoje". "pra sexta", "pro sábado", "pra hoje".
// "Nesta sexta", "Neste sábado", "Hoje". Pelo artigo de cada dia.
function noDia(id) {
  const d = DIAS[id];
  if (!d) return 'nesse dia';
  return d.artigo ? `${d.artigo} ${d.frase}` : d.frase;
}
function proDia(id) {
  const d = DIAS[id];
  if (!d) return 'pra esse dia';
  if (!d.artigo) return `pra ${d.frase}`;
  return `${d.artigo === 'na' ? 'pra' : 'pro'} ${d.frase}`;
}
function nesteDia(id) {
  const d = DIAS[id];
  if (!d) return 'Nesse dia';
  if (!d.artigo) return 'Hoje';
  return `${d.artigo === 'na' ? 'Nesta' : 'Neste'} ${d.frase}`;
}
// "pro seu sábado", "pra sua quinta", "pra hoje".
function proSeuDia(id) {
  const d = DIAS[id];
  if (!d) return 'pra esse dia';
  if (!d.artigo) return `pra ${d.frase}`;
  return `${d.artigo === 'na' ? 'pra sua' : 'pro seu'} ${d.frase}`;
}

// Horas contadas da meia-noite do dia da festa; depois da meia-noite passa de 24
// (1h da manhã = 25). Assim uma festa de sábado que acaba às 3h tem fim 27.
const JANELAS = [
  { id: 'fim-de-tarde', inicio: 17, fim: 23, rotulo: '17h às 23h', nome: 'fim de tarde', pra: 'pro fim de tarde', no: 'no fim de tarde' },
  { id: 'comeco-da-noite', inicio: 19, fim: 25, rotulo: '19h à 1h', nome: 'começo da noite', pra: 'pro começo da noite', no: 'no começo da noite' },
  { id: 'noite', inicio: 22, fim: 27, rotulo: '22h às 3h', nome: 'noite', pra: 'pra noite', no: 'na noite' },
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

// As seis regiões do motor (motor/nucleo/bairros.js). As três da base
// fictícia são as chaves próprias; norte, sul e leste ficam no protótipo do
// objeto até a lane dona (U24, U26, U29) oferecer os 14 bairros no pedido.
const TODAS_AS_REGIOES = {
  oeste: 'Zona Oeste', centro: 'Centro', 'centro-sul': 'Centro-Sul', norte: 'Zona Norte', sul: 'Zona Sul', leste: 'Zona Leste',
};
const REGIOES_DA_BASE = ['oeste', 'centro', 'centro-sul'];
const REGIOES = Object.assign(
  Object.create({ norte: TODAS_AS_REGIOES.norte, sul: TODAS_AS_REGIOES.sul, leste: TODAS_AS_REGIOES.leste }),
  Object.fromEntries(REGIOES_DA_BASE.map((id) => [id, TODAS_AS_REGIOES[id]])),
);

// Os 14 bairros do motor (os mesmos ids de motor/nucleo/bairros.js), com a
// preposição certa para "a 8 min de ___" e o ponto de referência de cada um
// para a distância em linha reta (nucleo/geo.js). Pontos conferidos na U34
// (24/11/2026; Benedito Calixto e estação Lapa acertados pelo OSM): Largo da Batata, Praça Benedito Calixto, metrô Barra Funda,
// Praça da República, Bixiga, Oscar Freire, metrô Vila Mariana, PUC em
// Perdizes, estação Lapa, metrô Butantã, metrô Santana, metrô Bresser-Mooca,
// Largo Treze de Maio e o Autódromo de Interlagos.
const TODOS_OS_BAIRROS = {
  pinheiros: { nome: 'Pinheiros', de: 'de Pinheiros', em: 'em Pinheiros', regiao: 'oeste', ponto: { lat: -23.5669, lng: -46.6931, nome: 'Largo da Batata' } },
  'vila-madalena': { nome: 'Vila Madalena', de: 'da Vila Madalena', em: 'na Vila Madalena', regiao: 'oeste', ponto: { lat: -23.5583, lng: -46.6807, nome: 'Praça Benedito Calixto' } },
  'barra-funda': { nome: 'Barra Funda', de: 'da Barra Funda', em: 'na Barra Funda', regiao: 'oeste', ponto: { lat: -23.5255, lng: -46.667, nome: 'metrô Barra Funda' } },
  centro: { nome: 'Centro', de: 'do Centro', em: 'no Centro', regiao: 'centro', ponto: { lat: -23.5434, lng: -46.6427, nome: 'Praça da República' } },
  'bela-vista': { nome: 'Bela Vista', de: 'da Bela Vista', em: 'na Bela Vista', regiao: 'centro', ponto: { lat: -23.5579, lng: -46.644, nome: 'Bixiga' } },
  jardins: { nome: 'Jardins', de: 'dos Jardins', em: 'nos Jardins', regiao: 'centro-sul', ponto: { lat: -23.5627, lng: -46.669, nome: 'Oscar Freire' } },
  'vila-mariana': { nome: 'Vila Mariana', de: 'da Vila Mariana', em: 'na Vila Mariana', regiao: 'centro-sul', ponto: { lat: -23.5893, lng: -46.6345, nome: 'metrô Vila Mariana' } },
  perdizes: { nome: 'Perdizes', de: 'de Perdizes', em: 'em Perdizes', regiao: 'oeste', ponto: { lat: -23.5363, lng: -46.6703, nome: 'PUC, Perdizes' } },
  lapa: { nome: 'Lapa', de: 'da Lapa', em: 'na Lapa', regiao: 'oeste', ponto: { lat: -23.5201, lng: -46.6988, nome: 'estação Lapa' } },
  butanta: { nome: 'Butantã', de: 'do Butantã', em: 'no Butantã', regiao: 'oeste', ponto: { lat: -23.5717, lng: -46.7081, nome: 'metrô Butantã' } },
  santana: { nome: 'Santana', de: 'de Santana', em: 'em Santana', regiao: 'norte', ponto: { lat: -23.5026, lng: -46.6253, nome: 'metrô Santana' } },
  mooca: { nome: 'Mooca', de: 'da Mooca', em: 'na Mooca', regiao: 'leste', ponto: { lat: -23.5463, lng: -46.6074, nome: 'metrô Bresser-Mooca' } },
  'santo-amaro': { nome: 'Santo Amaro', de: 'de Santo Amaro', em: 'em Santo Amaro', regiao: 'sul', ponto: { lat: -23.6532, lng: -46.7099, nome: 'Largo Treze de Maio' } },
  interlagos: { nome: 'Interlagos', de: 'de Interlagos', em: 'em Interlagos', regiao: 'sul', ponto: { lat: -23.7015, lng: -46.6973, nome: 'Autódromo de Interlagos' } },
};
// Os sete da base fictícia são as chaves próprias de BAIRROS (o pedido, a
// validação da base e o conversor só aceitam esses, por Object.hasOwn); os
// outros sete ficam no protótipo: C.BAIRROS[id] acha os 14. A lane dona do
// catálogo depois da fundação (U26) junta os 14 como chaves próprias, quando
// o pedido, o formulário (U24) e a base (base.test.js) estiverem prontos.
const BAIRROS_DA_BASE = ['pinheiros', 'vila-madalena', 'barra-funda', 'centro', 'bela-vista', 'jardins', 'vila-mariana'];
const BAIRROS = Object.assign(
  Object.create(Object.fromEntries(Object.entries(TODOS_OS_BAIRROS).filter(([id]) => !BAIRROS_DA_BASE.includes(id)))),
  Object.fromEntries(BAIRROS_DA_BASE.map((id) => [id, TODOS_OS_BAIRROS[id]])),
);

// Minutos de carro, à noite, entre os pontos de referência dos sete bairros
// da base (só as fictícias usam; a real com coordenada usa a distância em
// linha reta, nucleo/geo.js)
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

// Pontos que alguém pode citar no "mais perto de ___": os 14 bairros e
// vizinhos conhecidos. `bairro` aponta para o bairro da base fictícia mais
// próximo (a tabela de minutos); `ponto`, quando há, é de onde a real com
// coordenada mede a distância em linha reta (nucleo/geo.js). Os quatro
// bairros longe da base (Santana, Mooca, Santo Amaro, Interlagos) apontam
// para si mesmos: as fictícias ficam a 30 min, o padrão da tabela.
const REFERENCIAS = {
  ...Object.fromEntries(Object.entries(TODOS_OS_BAIRROS).map(([id, b]) => [id, { bairro: id, nome: b.nome, de: b.de, ponto: b.ponto }])),
  'largo-da-batata': { bairro: 'pinheiros', nome: 'Largo da Batata', de: 'do Largo da Batata' },
  butanta: { bairro: 'pinheiros', nome: 'Butantã', de: 'do Butantã', ponto: TODOS_OS_BAIRROS.butanta.ponto },
  'alto-de-pinheiros': { bairro: 'pinheiros', nome: 'Alto de Pinheiros', de: 'do Alto de Pinheiros' },
  sumare: { bairro: 'vila-madalena', nome: 'Sumaré', de: 'do Sumaré' },
  perdizes: { bairro: 'barra-funda', nome: 'Perdizes', de: 'de Perdizes', ponto: TODOS_OS_BAIRROS.perdizes.ponto },
  lapa: { bairro: 'barra-funda', nome: 'Lapa', de: 'da Lapa', ponto: TODOS_OS_BAIRROS.lapa.ponto },
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

// 80 -> "R$ 80"; 469.9 -> "R$ 469,90" (preço real pode ter centavos).
function reais(valor) {
  if (valor === 0) return 'grátis';
  return Number.isInteger(valor) ? `R$ ${valor}` : `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
}

function rotuloTeto(teto) {
  if (teto === 'sem-limite') return 'sem limite';
  if (teto === 0) return 'só grátis';
  return `até R$ ${teto}`;
}

function nomeEstilo(id) {
  const e = ESTILOS.find((x) => x.id === id);
  return e ? e.curto : id;
}

// "Sáb · 19h00 · Pinheiros": horário primeiro (regra 3 da voz). Festa real
// sem bairro: o trecho sai, nunca vira um padrão. Sem início
// (horarioIncerto), "horário a confirmar". A média de idade saiu da linha em
// 26/11/2026, até a idade do público ser validada.
const temInicio = (f) => typeof f.inicio === 'number' && Number.isFinite(f.inicio) && f.horarioIncerto !== true;
function linhaDaFesta(f) {
  const partes = [DIAS[f.dia] ? DIAS[f.dia].curto : '', temInicio(f) ? horaCheia(f.inicio) : 'horário a confirmar'].filter(Boolean);
  if (f.bairro && BAIRROS[f.bairro]) partes.push(BAIRROS[f.bairro].nome);
  return partes.join(' · ');
}

// "Começa às 19h, a pista enche às 21h e acaba à 1h." Um nome só para o
// melhor momento da festa: a pista cheia.
// Festa real sem a pista cheia ou sem o fim diz o que se sabe e o que não
// foi divulgado.
function fraseDoHorario(f) {
  const n = (x) => typeof x === 'number' && Number.isFinite(x);
  if (!temInicio(f)) return 'O horário ainda não foi divulgado.';
  if (n(f.esquenta) && n(f.fim)) return `Começa ${asHoras(f.inicio)}, a pista enche ${asHoras(f.esquenta)} e acaba ${asHoras(f.fim)}.`;
  if (n(f.fim)) return `Começa ${asHoras(f.inicio)} e acaba ${asHoras(f.fim)}.`;
  if (n(f.esquenta)) return `Começa ${asHoras(f.inicio)} e a pista enche ${asHoras(f.esquenta)}. A hora de acabar não foi divulgada.`;
  return `Começa ${asHoras(f.inicio)}. A hora de acabar não foi divulgada.`;
}

// "house", "house ou pop 2000", "funk, indie ou MPB"
function listaDeEstilos(ids, conjuncao = 'ou') {
  const nomes = ids.map(nomeEstilo);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} ${conjuncao} ${nomes[nomes.length - 1]}`;
}

module.exports = {
  CASAS, semAcento,
  DIAS, TODOS_OS_DIAS, DIAS_DA_SEMANA, ORDEM_DIAS, DIAS_DA_SEMANA_DO_PEDIDO, DIAS_FICTICIOS, noDia, proDia, nesteDia, proSeuDia, temInicio, JANELAS, TETOS, DEGRAUS_TETO, DEGRAUS_BARATO, ESTILOS, ID_ESTILOS, AFINIDADE,
  REGIOES, TODAS_AS_REGIOES, BAIRROS, TODOS_OS_BAIRROS, REFERENCIAS, listaDeEstilos,
  minutosEntre, horaCheia, hora, asHoras, ateAs, reais, rotuloTeto, nomeEstilo, linhaDaFesta, fraseDoHorario,
};

'use strict';
// Motor do Finde: escolhe três festas para o pedido.
// Puro e determinístico: não lê arquivo, não usa relógio nem Math.random.
//
// Filtros duros: dia, janela de horário (chegar e voltar, com tolerância
// declarada), hora de voltar dita na conversa (voltaMax), teto de preço,
// estilos, bairros e tipos de casa recusados, e festas já descartadas.
// Estilo pedido: critério com afrouxamento declarado. Primeiro entram as festas
// que casam com algum estilo pedido; se não chegam a três, a lista se completa
// com som parecido (afinidade maior que zero) e, só então, com outros sons.
// Quando sobram menos de três, afrouxa nesta ordem: horário (uma hora a mais
// de cada lado) e preço (um degrau).
// A idade do público saiu do pedido em 26/11/2026, até ser validada: não
// filtra, não pontua nem aparece. O `idade` e a `faixa` de um link ou sessão
// antigos são ignorados (sanearCriterios).
// O que a pessoa ajustou de propósito na conversa ("firmes") não afrouxa.
// Toda festa que fura o pedido diz o quê, no porquê, em primeiro lugar.
// A lista sai em ordem de horário; a patrocinada fica no lugar dela, nunca em primeiro.

const C = require('./catalogo');
// A distância em linha reta da real com coordenada (R29).
const G = require('./geo');
// A conta do preço do detalhe (o "a partir de"), a mesma do navegador.
const FT = require('../publico/festa-texto');
// O "% a sua cara" (nucleo/cara.js) usa funções daqui; carrega na hora de
// usar para não fechar um ciclo de require.
const caraDe = (f, c) => require('./cara').cara(f, c);

// Tolerância declarada: a pista cheia (o esquenta) pode cair até TOLERANCIA
// horas antes do início da janela e até uma hora antes do fim; a festa precisa
// durar duas horas depois que a pessoa chega e acabar até o fim da janela.
const TOLERANCIA = 1;
const TOLERANCIA_AFROUXADA = 2;
const VOLTA_AFROUXADA = 2;
const MARGEM_DIVERSIDADE = 1.5;

const CHAVES_OBRIGATORIAS = ['dia', 'janela', 'teto'];
// Bairro vizinho (R19): mesma região, ou até 12 min de carro pela tabela.
const MINUTOS_VIZINHO = 12;
// Real com coordenada (precisão casa ou rua): vizinha até 3 km em linha reta
// do ponto do bairro pedido (R29, U27).
const KM_VIZINHO = 3;
// Os blocos da lista, na ordem: o que cabe; bairro vizinho; o que fura o
// pedido em som, horário ou preço; a real de bairro conhecido e longe (nunca
// some, U27); a real sem bairro ("Local a confirmar", abaixo das que cabem, R29).
const BLOCOS = ['pedido', 'perto', 'quase', 'longe', 'local'];
const DIMENSOES = ['horario', 'preco'];

const janelaPorId = (id) => C.JANELAS.find((j) => j.id === id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const NUMERAL = ['nenhuma', 'uma', 'duas', 'três'];
// Festa real (nucleo/reais.js) pode vir sem pista cheia, fim, bairro,
// preço ou som. O que falta não conta contra nem a favor: não tira a festa,
// não ganha ponto, e quando o pedido perguntou aquilo ela sai do bloco do
// pedido dizendo o que não se sabe (incertos).
const num = (x) => typeof x === 'number' && Number.isFinite(x);
// Festa real sem início (horarioIncerto, U23): o horário não fura nem cabe;
// no "% a sua cara" conta a metade, e a régua não é desenhada.
const semInicio = (f) => !C.temInicio(f);
// A hora em que a pessoa chega com a festa cheia: a pista cheia, ou, sem ela, o começo.
const chegada = (f) => (num(f.esquenta) ? f.esquenta : f.inicio);
// O início para ordenar: sem ele, a festa vai para o fim do bloco.
const inicioParaOrdem = (f) => (semInicio(f) ? 99 : f.inicio);

// O ponto da real com coordenada boa para medir (casa ou rua; bairro nunca).
function pontoDa(f) {
  const l = f && f.local;
  if (!l || !['casa', 'rua'].includes(l.precisao) || !num(l.lat) || !num(l.lng)) return null;
  return { lat: l.lat, lng: l.lng };
}
// De onde medir: os bairros pedidos (o mais perto) ou o ponto citado na conversa.
function pontosDoPedido(c) {
  if (c.bairros && c.bairros.length) return c.bairros.map((b) => [C.BAIRROS[b], G.pontoDoBairro(b)]).filter(([, p]) => p);
  if (c.perto && C.REFERENCIAS[c.perto]) {
    const r = C.REFERENCIAS[c.perto];
    const p = r.ponto || G.pontoDoBairro(r.bairro);
    return p ? [[r, p]] : [];
  }
  return [];
}
// A distância em km, uma casa decimal, da real com coordenada até o ponto
// pedido mais perto, e de onde: { km, de } ou null.
function maisPerto(f, c) {
  const p = pontoDa(f);
  if (!p) return null;
  let melhor = null;
  for (const [ref, ponto] of pontosDoPedido(c)) {
    const km = G.haversineKm(ponto, p);
    if (km !== null && (!melhor || km < melhor.km)) melhor = { km: Math.round(km * 10) / 10, de: ref.de };
  }
  return melhor;
}
const distanciaKm = (f, c) => {
  const m = maisPerto(f, c);
  return m ? m.km : null;
};
// "1,2 km"
const emKm = (km) => `${String(km).replace('.', ',')} km`;
// O fim que pesa contra quando passa da sua volta. Na festa real, não: ela
// seria punida por dizer o fim, enquanto a que não diz passa inteira, e dá
// pra sair antes do fim. O fim cedo demais (antes de você chegar) vale para
// as duas.
const fimLimita = (f) => num(f.fim) && f.real !== true;

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
  // O pedido aceita "hoje" e quinta a domingo (D2), em "esta" semana ou na "proxima".
  if (C.ORDEM_DIAS.includes(bruto.dia)) c.dia = bruto.dia;
  if (bruto.semana === 'esta' || bruto.semana === 'proxima') c.semana = bruto.semana;
  if (janelaPorId(bruto.janela)) c.janela = bruto.janela;
  // `faixa` e `idade`, de link ou sessão antigos, caem aqui (26/11/2026).
  // bairros: vazio é São Paulo inteira.
  // Os 14 bairros do motor (R29).
  if (Array.isArray(bruto.bairros)) c.bairros = [...new Set(bruto.bairros.filter((b) => Object.hasOwn(C.TODOS_OS_BAIRROS, b)))];
  if (tetoValido(bruto.teto)) c.teto = bruto.teto;
  if (bruto.estilos !== undefined) c.estilos = listaDeEstilos(bruto.estilos);
  if (bruto.evitarEstilos !== undefined) c.evitarEstilos = listaDeEstilos(bruto.evitarEstilos);
  if (Array.isArray(bruto.evitarBairros)) c.evitarBairros = [...new Set(bruto.evitarBairros.filter((b) => Object.hasOwn(C.TODOS_OS_BAIRROS, b)))];
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

const falta = (c) => CHAVES_OBRIGATORIAS.filter((k) => !Object.hasOwn(c, k));

function vizinho(a, b) {
  if (a === b) return true;
  return C.BAIRROS[a].regiao === C.BAIRROS[b].regiao || C.minutosEntre(a, b) <= MINUTOS_VIZINHO;
}

// Onde a festa fica em relação aos bairros pedidos: 'pedido', 'perto',
// 'incerto' (sem bairro nem coordenada), 'longe' (real de bairro conhecido e
// longe: nunca some da lista, U27) ou null (fictícia longe: sai).
// A real com coordenada é vizinha até 3 km do ponto de um bairro pedido; sem
// coordenada, pela região (e pela tabela de minutos, nos sete da base).
function lugar(f, c) {
  if (!c.bairros.length || (f.bairro && c.bairros.includes(f.bairro))) return 'pedido';
  const m = maisPerto(f, c);
  if (!f.bairro && !m) return 'incerto';
  const perto = (m && m.km <= KM_VIZINHO) || (f.bairro && c.bairros.some((b) => vizinho(b, f.bairro)));
  if (perto) return 'perto';
  return f.real === true ? 'longe' : null;
}

function completar(c) {
  const r = {
    dia: c.dia, semana: c.dia === 'hoje' ? 'esta' : c.semana || 'esta', janela: c.janela, teto: c.teto, bairros: c.bairros || [],
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
  if (c.oferta) r.oferta = c.oferta;
  return r;
}

// O pedido como frase, em partes; as que vêm do formulário reabrem a pergunta.
function pedidoEmPartes(c) {
  const j = janelaPorId(c.janela);
  const partes = [
    { chave: 'dia', texto: `${C.DIAS[c.dia].nome}${c.semana === 'proxima' ? ' da semana que vem' : ''}` },
    { chave: 'janela', texto: `das ${j.rotulo}` },
    { chave: 'teto', texto: c.teto === 'sem-limite' ? 'sem teto de preço' : c.teto === 0 ? 'só de graça' : `até R$ ${c.teto}` },
  ];
  // Onde: os bairros com a preposição de cada um; sem bairro, a cidade toda.
  if (c.bairros && c.bairros.length) partes.splice(2, 0, { chave: 'bairros', texto: juntar(c.bairros.map((b) => C.BAIRROS[b].em)) });
  else partes.splice(2, 0, { chave: 'bairros', texto: 'em toda a cidade' });
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

// "Sáb · 19h à 1h · Pinheiros · até R$ 80 · house"
function resumoDoPedido(c) {
  const partes = [`${C.DIAS[c.dia].curto}${c.semana === 'proxima' ? ' que vem' : ''}`, janelaPorId(c.janela).rotulo, C.rotuloTeto(c.teto)];
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

// A hora de chegar e a de voltar: a janela é as duas coisas.
function cabeNoHorario(f, janela, folga) {
  // Sem início, não se sabe: não fura (o "% a sua cara" conta a metade).
  if (semInicio(f)) return true;
  const volta = janela.fim + (folga > TOLERANCIA ? VOLTA_AFROUXADA : 0);
  const chega = chegada(f);
  return chega >= janela.inicio - folga
    && chega <= janela.fim - 1
    && f.inicio <= janela.fim - 2
    // Sem o fim, a régua do fim não vale nem contra nem a favor.
    && (!num(f.fim) || f.fim >= janela.inicio + 2)
    && (!fimLimita(f) || f.fim <= volta);
}

// Se a festa fura o horário pedido: a janela (com a folga dada) e a hora de
// voltar dita na conversa, que nunca afrouxa. A mesma régua vale no aviso,
// na lista e no "% a sua cara".
function furaHorario(f, c, folga = TOLERANCIA) {
  return !cabeNoHorario(f, janelaPorId(c.janela), folga) || Boolean(c.voltaMax && fimLimita(f) && f.fim > c.voltaMax);
}

// O preço de quem chega no começo da janela pedida. Lote com hora ("R$ 45
// até as 20h") não vale para quem chega às 22h: a conta segue sem ele, com a
// mesma regra do "a partir de" (FT.preco). Sem lote com hora vencida, o
// preço da festa.
function horaDoLote(ate, inicio) {
  const [h, m] = ate.split(':').map(Number);
  const x = h + m / 60;
  return x < inicio ? x + 24 : x;
}
function precoPara(f, c) {
  if (!num(f.preco) || !c || !Array.isArray(f.lotes)) return f.preco;
  const j = janelaPorId(c.janela);
  if (!j) return f.preco;
  const inicio = semInicio(f) ? j.inicio : f.inicio;
  const chega = Math.max(j.inicio, inicio);
  const vencido = (l) => typeof l.ate === 'string' && /^\d{2}:\d{2}$/.test(l.ate) && horaDoLote(l.ate, inicio) < chega;
  if (!f.lotes.some(vencido)) return f.preco;
  const p = FT.preco({ lotes: f.lotes.filter((l) => !vencido(l)), entradaNaPorta: f.entradaNaPorta || null });
  return num(p.valor) ? p.valor : f.preco;
}

// Preço que não se sabe não fura o teto (e não cabe nele: ver incertos).
const cabeNoPreco = (f, teto, c = null) => teto === 'sem-limite' || !num(f.preco) || precoPara(f, c) <= teto;

// Estilo recusado barra a festa, a não ser que o som principal dela tenha
// sido pedido de propósito ("sem pop" e depois "funk também").
function barradaPorEstilo(f, c) {
  if (!f.estilos.some((e) => c.evitarEstilos.includes(e))) return false;
  return !c.estilos.includes(f.estilos[0]);
}

const barradaPorCasa = (f, c) => Boolean(f.casa) && c.evitarCasas.some((k) => C.semAcento(f.casa).includes(k));

// "hoje": o dia vem da data, e quem chama passa só as festas dela (lista.js).
const doDia = (f, c) => c.dia === 'hoje' || f.dia === c.dia;

// O que a pessoa recusou de propósito: a festa que já saiu, o bairro, o som
// e o tipo de casa. Fica fora até de "ver todas".
const barrada = (f, c) => c.evitar.includes(f.id) || (Boolean(f.bairro) && c.evitarBairros.includes(f.bairro))
  || barradaPorEstilo(f, c) || barradaPorCasa(f, c);

function passa(f, c, nivel) {
  if (!doDia(f, c)) return false;
  if (barrada(f, c)) return false;
  if (c.voltaMax && fimLimita(f) && f.fim > c.voltaMax) return false;
  if (!lugar(f, c)) return false;
  if (!cabeNoHorario(f, janelaPorId(c.janela), nivel.folga)) return false;
  return cabeNoPreco(f, nivel.teto, c);
}

const casaComEstilo = (f, c) => c.estilos.length > 0 && f.estilos.some((e) => c.estilos.includes(e));

// ---------------------------------------------------------------- pontos

function distancia(f, perto) {
  const ref = C.REFERENCIAS[perto];
  if (!f.bairro || !num(f.distanciaMin)) return null;
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
  const janela = janelaPorId(c.janela);
  let s = 0;
  if (num(f.esquenta)) s += 2 * clamp(1 - Math.abs(f.esquenta - (janela.inicio + 2)) / 4);
  if (c.estilos.length) {
    if (c.estilos.includes(f.estilos[0])) s += 3;
    else if (casaComEstilo(f, c)) s += 2;
    else s += 1.5 * afinidade(f, c);
  }
  if (c.perto && distancia(f, c.perto) !== null) s += 6 * clamp(1 - distancia(f, c.perto) / 30);
  else if (c.perto && distanciaKm(f, c) !== null) s += 6 * clamp(1 - distanciaKm(f, c) / 6);
  return Math.round(s * 1000) / 1000;
}

// Quem cabe no pedido sem afrouxar vem antes de quem só entrou afrouxando.
const precoOuFim = (f) => (num(f.preco) ? f.preco : 1e6);
const ordenar = (a, b) => (b.estrita ? 1 : 0) - (a.estrita ? 1 : 0) || b.pontos - a.pontos
  || precoOuFim(a.festa) - precoOuFim(b.festa) || a.festa.id.localeCompare(b.festa.id);

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
  // Sem som informado não é "fora do seu som": é o "som não informado" de incertos.
  if (c.estilos.length && f.estilos.length && !casaComEstilo(f, c)) v.push(afinidade(f, c) > 0 ? 'som parecido, não o pedido' : 'fora do seu som');
  if (!cabeNoPreco(f, c.teto, c)) v.push(`${C.reais(Math.round((precoPara(f, c) - c.teto) * 100) / 100)} acima do teto`);
  // O horário pedido é "seu horário" (chegar) e "sua volta" (voltar), como na
  // pergunta "A que horas chegar e voltar?"; o "% a sua cara" fala igual.
  const j = janelaPorId(c.janela);
  const volta = c.voltaMax ? Math.min(c.voltaMax, j.fim) : j.fim;
  // Sem início, o horário não fura: fica no porquê, no que falta.
  if (semInicio(f)) return v;
  // Sem a pista cheia, quem fala é o começo ("começa às 20h, antes do seu horário").
  const chega = chegada(f);
  const verbo = num(f.esquenta) ? 'enche' : 'começa';
  const temFim = num(f.fim);
  if (chega < j.inicio - TOLERANCIA || (temFim && f.fim < j.inicio + 2)) v.push(`${verbo} ${C.asHoras(chega)}, antes do seu horário`);
  else if (chega > j.fim - 1 || f.inicio > j.fim - 2) v.push(`${verbo} ${C.asHoras(chega)}, ${chega >= volta ? 'depois' : 'perto'} da sua volta`);
  // Quem enche depois da sua volta já disse tudo: não repete o fim.
  if (fimLimita(f) && f.fim > volta && !(chega >= volta && chega > j.fim - 1)) v.push(`acaba ${C.asHoras(f.fim)}, depois da sua volta`);
  return v;
}

// O que o pedido perguntou e a festa não diz (festa real sem o dado). Não
// fura o pedido, mas também não cabe nele: a festa vai para o bloco "quase"
// (ou "Local a confirmar", sem bairro), com isto no aviso. O preço fica de
// fora (R27): sem ele, a festa fica no bloco do pedido e o que falta sai uma vez, no
// porquê; o horário sem início, idem.
function incertos(f, c) {
  const v = [];
  if (c.bairros.length && lugar(f, c) === 'incerto') v.push('bairro não informado');
  if (c.estilos.length && !f.estilos.length) v.push('som não informado');
  return v;
}

// O que distingue a festa, sem repetir o pedido nem a frase do curador.
function distintivos(f, c) {
  const m = [];
  // Bloco dos vizinhos: quão perto do bairro marcado mais próximo.
  const km = maisPerto(f, c);
  if (c.bairros.length && lugar(f, c) === 'perto') {
    if (km) m.push(`a ${emKm(km.km)} ${km.de}`);
    // A tabela de minutos é só das fictícias (R29).
    else if (f.real !== true) {
      const [b, min] = c.bairros.map((x) => [x, C.minutosEntre(x, f.bairro)]).sort((a, z) => a[1] - z[1])[0];
      m.push(`a ${min} min ${C.BAIRROS[b].de}`);
    }
  }
  if (c.perto && distancia(f, c.perto) !== null) m.push(`a ${distancia(f, c.perto)} min ${C.REFERENCIAS[c.perto].de}`);
  else if (c.perto && km) m.push(`a ${emKm(km.km)} ${km.de}`);
  const pago = precoPara(f, c);
  if (!num(pago)) { /* preço não informado: nada a dizer */ } else if (pago === 0) m.push('de graça');
  // Sem conta de troco: o quanto o preço cabe no teto, em palavras.
  else if (c.teto !== 'sem-limite' && c.teto - pago >= 30) m.push('bem abaixo do seu teto');
  else if (c.teto !== 'sem-limite' && c.teto - pago >= 10) m.push('dentro do seu teto');
  const j = janelaPorId(c.janela);
  if (num(f.fim) && f.fim <= j.fim - 2) m.push(`acaba ${C.asHoras(f.fim)}, dá pra voltar cedo`);
  // Festa real que vai além da sua volta: não fura, mas diz até quando vai.
  const volta = c.voltaMax ? Math.min(c.voltaMax, j.fim) : j.fim;
  if (num(f.fim) && !fimLimita(f) && f.fim > volta) m.push(`vai ${C.ateAs(f.fim)}; dá pra sair antes`);
  if (c.estilos.length > 1) {
    const casou = f.estilos.find((e) => c.estilos.includes(e));
    if (casou) m.push(C.nomeEstilo(casou));
  }
  return m;
}

function opcao(f, c) {
  const fora = violacoes(f, c);
  const naoSei = incertos(f, c);
  const extra = distintivos(f, c);
  const dito = [...fora, ...naoSei];
  return {
    festa: f,
    patrocinada: f.selo === 'patrocinado',
    // Cabe no pedido: sem furo, sem dúvida e no bairro pedido (vizinho não conta).
    atende: fora.length === 0 && naoSei.length === 0 && !(c.bairros.length && ['perto', 'longe'].includes(lugar(f, c))),
    fora,
    incertos: naoSei,
    linha: C.linhaDaFesta(f),
    hora: semInicio(f) ? null : C.horaCheia(f.inicio),
    dia: C.DIAS[f.dia] ? C.DIAS[f.dia].curto : null,
    bairro: f.bairro && C.BAIRROS[f.bairro] ? C.BAIRROS[f.bairro].nome : null,
    horario: C.fraseDoHorario(f),
    preco: num(f.preco) ? C.reais(f.preco) : null,
    // Uma frase quando a festa fura o pedido (ou não diz o que ele perguntou); null quando cabe.
    aviso: dito.length ? `${dito.join('; ').replace(/^./, (x) => x.toUpperCase())}.` : null,
    // O que fura vem inteiro; o que distingue completa até dois.
    motivos: [...fora, ...extra].slice(0, Math.max(2, fora.length)),
    casaComEstilo: c.estilos.length ? casaComEstilo(f, c) : null,
    distancia: c.perto ? distancia(f, c.perto) : null,
    // O bloco da lista (R19): no pedido, perto dos bairros, quase, longe ou sem local.
    bloco: bloco(f, c),
    // U27: a distância em linha reta (real com coordenada), o porquê em dados
    // (KTD15), o horário sem início (a régua não é desenhada) e a esgotada.
    distanciaKm: distanciaKm(f, c),
    porque: porqueDe(f, c, caraDe(f, c)),
    horarioIncerto: semInicio(f),
    esgotada: f.esgotado === true,
  };
}

// ---------------------------------------------------------------- o porquê, em dados (U27)

// O valor curto de cada critério na festa, ou null quando ela não diz.
function valorDoCriterio(f, c, criterio) {
  if (criterio === 'horario') return semInicio(f) ? null : C.hora(f.inicio);
  if (criterio === 'bairro') {
    if (f.bairro && C.BAIRROS[f.bairro]) return C.BAIRROS[f.bairro].nome;
    const m = maisPerto(f, c);
    return m ? `a ${emKm(m.km)}` : null;
  }
  if (criterio === 'preco') return num(f.preco) ? C.reais(precoPara(f, c)) : null;
  if (criterio === 'som') {
    if (!f.estilos || !f.estilos.length) return null;
    return C.nomeEstilo(f.estilos.find((e) => c.estilos.includes(e)) || f.estilos[0]);
  }
  return null;
}

// porque: { cabe: [{ criterio, valor }], falta: [{ criterio, valor: null }] }
// (KTD15). cabe: até duas partes do "% a sua cara" que cabem inteiras, na
// ordem dos pesos; falta: os critérios que a festa não diz, pedidos ou não.
// O texto sai de partesDoPorque (publico/festa-texto.js).
const CRITERIOS_DO_PORQUE = ['horario', 'bairro', 'preco', 'som'];
function porqueDe(f, c, k) {
  const partes = k && Array.isArray(k.partes) ? k.partes : [];
  const cabe = CRITERIOS_DO_PORQUE
    .filter((x) => partes.some((p) => p.criterio === x && p.cabe === true))
    .map((criterio) => ({ criterio, valor: valorDoCriterio(f, c, criterio) }))
    .filter((x) => x.valor !== null)
    .slice(0, 2);
  const falta = CRITERIOS_DO_PORQUE.filter((x) => valorDoCriterio(f, c, x) === null).map((criterio) => ({ criterio, valor: null }));
  return { cabe, falta };
}

// A opção da lista: a de opcao mais o "% a sua cara". Só acrescenta um
// campo: não mexe em quais festas entram nem na ordem. O `pct` solto entra
// na lista (lista.js), para a opção daqui e a do detalhe sem pedido
// (GET /api/festa/<id>, só motor.opcao) terem as mesmas chaves, fora a cara.
function opcaoCompleta(f, c) {
  return { ...opcao(f, c), cara: caraDe(f, c) };
}

function bloco(f, c) {
  const onde = lugar(f, c);
  // Sem bairro, "Local a confirmar", abaixo das que cabem (R29); de bairro
  // conhecido e longe, logo acima dela (a real nunca some, U27).
  if (onde === 'incerto') return 'local';
  if (onde === 'longe') return 'longe';
  // Nada que fure o pedido fica misturado com o que cabe.
  if (violacoes(f, c).length || incertos(f, c).length) return 'quase';
  return onde === 'perto' ? 'perto' : 'pedido';
}
const posicaoDoBloco = (f, c) => BLOCOS.indexOf(bloco(f, c));

// ---------------------------------------------------------------- escolher

function niveis(c) {
  const estrito = { folga: TOLERANCIA, teto: c.teto, afrouxou: [] };
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
  return lista;
}

// As dimensões que esta festa fura (vazio quando cabe no pedido).
function foraDoPedido(f, c) {
  const fora = [];
  if (furaHorario(f, c)) fora.push('horario');
  if (!cabeNoPreco(f, c.teto, c)) fora.push('preco');
  if (c.estilos.length && f.estilos.length && !casaComEstilo(f, c)) fora.push('estilo');
  // Bairro vizinho não é o pedido: entra rotulado, e não conta como "cabe".
  if (c.bairros.length && lugar(f, c) === 'perto') fora.push('lugar');
  if (c.bairros.length && lugar(f, c) === 'longe') fora.push('longe');
  if (incertos(f, c).length) fora.push('incerto');
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
  if (dims.has('lugar')) como.push('em bairros vizinhos');
  if (dims.has('longe')) como.push('em outros bairros');
  // O que falta, pelo nome ("sem dizer o bairro"), e não "sem todos os dados".
  if (dims.has('incerto')) {
    const faltam = new Set(ordem.flatMap((x) => incertos(x.festa, c)));
    const nomes = [faltam.has('bairro não informado') ? 'o bairro' : null, faltam.has('som não informado') ? 'o som' : null].filter(Boolean);
    como.push(nomes.length ? `sem dizer ${nomes.join(' nem ')}` : 'sem todos os dados');
  }
  if (dims.has('estilo')) {
    // "Som parecido" só quando todas as de fora do som pedido são mesmo parecidas.
    const parecido = ordem.filter((x) => x.festa.estilos.length && !casaComEstilo(x.festa, c)).every((x) => afinidade(x.festa, c) > 0);
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
  // Por camadas (R19): primeiro o que fica nos bairros pedidos; depois os
  // bairros vizinhos; por último o que fura o pedido.
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
  if ((c.evitarEstilos.length || c.evitarCasas.length || c.evitarBairros.length) && tenta({ evitarEstilos: [], evitarCasas: [], evitarBairros: [] })) {
    return { texto: 'Com tudo o que você tirou, nada cabe.', frase: 'pode tudo de novo', rotulo: 'Liberar o que tirei' };
  }
  // Outro dia da mesma semana ("hoje" não: a base de "hoje" é a do dia).
  for (const d of C.ORDEM_DIAS.filter((x) => x !== c.dia && x !== 'hoje')) {
    if (tenta({ dia: d })) {
      const nome = C.DIAS[d].frase;
      const no = C.noDia(d);
      return { texto: `${c.firmes.length ? 'Nada cabe nesse pedido.' : 'Nada cabe nesse pedido, nem afrouxando.'} ${no[0].toUpperCase()}${no.slice(1)}, sim.`, frase: nome, rotulo: `Ver ${C.DIAS[d].artigo === 'na' ? 'a' : 'o'} ${nome}` };
    }
  }
  return { texto: 'Nada cabe nesse pedido. Tente outro dia ou outro horário.', frase: null, rotulo: null };
}

// Por que um estilo pedido não entrou: o que barra a melhor festa daquele som.
function impedimentoDoEstilo(criterios, base, estilo) {
  const c = completar(sanearCriterios(criterios));
  // Base sem som classificado nesse dia (festas reais sem estilo): não dá
  // para dizer que "não tem house"; não se sabe.
  if (!base.some((f) => doDia(f, c) && f.estilos.length)) return null;
  const desteDia = base.filter((f) => doDia(f, c) && f.estilos.includes(estilo));
  const nome = C.nomeEstilo(estilo);
  const noDia = C.noDia(c.dia);
  if (!desteDia.length) return `Não tem ${nome} ${noDia}.`;
  const j = janelaPorId(c.janela);
  const motivosDe = (f) => {
    if (c.evitar.includes(f.id)) return 'já saiu da lista';
    if (barradaPorEstilo(f, { ...c, estilos: [estilo] })) return `tem ${C.listaDeEstilos(f.estilos.filter((e) => c.evitarEstilos.includes(e)))}, que você tirou`;
    if (c.voltaMax && fimLimita(f) && f.fim > c.voltaMax) return 'acaba depois da sua volta';
    if (!cabeNoHorario(f, j, TOLERANCIA_AFROUXADA)) return `só ${C.asHoras(f.inicio)}`;
    if (!cabeNoPreco(f, c.teto, c)) return `só acima de R$ ${c.teto}`;
    return null;
  };
  const razoes = desteDia.map(motivosDe).filter(Boolean);
  if (!razoes.length) return null;
  return `${nome[0].toUpperCase()}${nome.slice(1)} ${noDia}, ${razoes[0]}.`;
}

// O preço mais baixo que ainda tem festa nesse pedido (o resto todo valendo).
function precoMinimo(criterios, base) {
  const c = completar(sanearCriterios(criterios));
  const nivel = { folga: TOLERANCIA, teto: 'sem-limite' };
  const precos = base.filter((f) => f.selo !== 'patrocinado' && passa(f, c, nivel) && num(f.preco)).map((f) => precoPara(f, c));
  // O teto é inteiro: preço com centavos arredonda para cima.
  return precos.length ? Math.ceil(Math.min(...precos)) : null;
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
    || inicioParaOrdem(a.festa) - inicioParaOrdem(b.festa) || pago(a) - pago(b) || a.festa.id.localeCompare(b.festa.id));

  // Cada opção leva o "% a sua cara" calculado pelo pedido, a distância em
  // km e o porquê em dados (opcaoCompleta). Só campos a mais: não mexe em
  // quais festas entram nem na ordem.
  const opcoes = ordem.map((x) => opcaoCompleta(x.festa, c));
  const afrouxou = DIMENSOES.filter((k) => ordem.some((x) => foraDoPedido(x.festa, c).includes(k)));
  const casam = ordem.filter((x) => casaComEstilo(x.festa, c)).length;
  const atendem = opcoes.filter((o) => o.atende).length;
  const resultado = { opcoes, atendem, afrouxou, casam };
  // Os rótulos dos blocos da lista e quantas cabem de fato no pedido (o título conta só essas).
  resultado.noPedido = opcoes.filter((o) => o.bloco === 'pedido' && o.atende).length;
  resultado.blocos = {
    perto: c.bairros.length ? `Perto ${juntar(c.bairros.map((b) => C.BAIRROS[b].de))}` : 'Perto das suas regiões',
    quase: 'Quase no seu pedido',
    longe: c.bairros.length ? `Longe ${juntar(c.bairros.map((b) => C.BAIRROS[b].de))}` : 'Em outros bairros',
    local: 'Local a confirmar',
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

// ordenarTodas(criterios, festas) -> [opcao] — todas as festas do dia, menos
// as recusadas de propósito, na ordem do motor: o bloco, o "% a sua cara",
// os pontos, o horário. Para "Ver todas as N de sexta" (maisDoDia, R25): a
// real nunca some por não caber; ela diz o que fura.
function ordenarTodas(criteriosBrutos, festas) {
  const c = completar(sanearCriterios(criteriosBrutos));
  const pct = (k) => (k && num(k.pct) ? k.pct : -1);
  return (festas || [])
    .filter((f) => doDia(f, c) && !barrada(f, c))
    .map((f) => ({ f, o: opcaoCompleta(f, c), pontos: pontuar(f, c) }))
    .sort((a, b) => posicaoDoBloco(a.f, c) - posicaoDoBloco(b.f, c) || pct(b.o.cara) - pct(a.o.cara)
      || b.pontos - a.pontos || inicioParaOrdem(a.f) - inicioParaOrdem(b.f) || a.f.id.localeCompare(b.f.id))
    .map((x) => x.o);
}

module.exports = {
  TOLERANCIA, TOLERANCIA_AFROUXADA, CHAVES_OBRIGATORIAS, DIMENSOES,
  sanearCriterios, falta, completar, resumoDoPedido, pedidoEmPartes, escolher, opcao, distancia, pontuar,
  foraDoPedido, furaHorario, fimLimita, incertos, lugar, proximoDegrau, cabeNoHorario, janelaPorId, impedimentoDoEstilo, casaComEstilo,
  precoMinimo, precoPara, juntar, vizinho, afinidade, BLOCOS,
  KM_VIZINHO, ordenarTodas, opcaoCompleta, porqueDe, valorDoCriterio, barrada, doDia, semInicio,
  distanciaKm, maisPerto, emKm, bloco,
};

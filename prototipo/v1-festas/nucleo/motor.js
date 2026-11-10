'use strict';
// Motor do Finde: escolhe três festas para o pedido.
// Puro e determinístico: não lê arquivo, não usa relógio nem Math.random.
//
// Filtros duros: dia, janela de horário (com tolerância declarada), hora de
// voltar (fimMax), faixa de idade, teto de preço, estilos recusados e festas
// já descartadas.
// Estilo pedido: critério com afrouxamento declarado. Primeiro entram as festas
// que casam com algum estilo pedido; se não chegam a três, a lista se completa
// com o som mais parecido, e o aviso diz isso.
// Pontuação: aderência da média de idade ao meio da faixa, esquenta perto do
// melhor momento da janela, estilo e proximidade do bairro citado.
// Quando sobram menos de três, afrouxa nesta ordem e avisa: horário (uma hora
// a mais de cada lado), preço (um degrau), idade (faixa vizinha). O que a
// pessoa ajustou de propósito na conversa ("firmes") não afrouxa.
// A lista sai em ordem de horário, como uma programação; a patrocinada, se
// houver, vem por último.

const C = require('./catalogo');

// Tolerância declarada: o esquenta (o melhor momento da pista) pode cair até
// TOLERANCIA horas antes do início da janela e até uma hora antes do fim dela.
// A festa precisa durar pelo menos duas horas depois que a pessoa chega.
const TOLERANCIA = 1;
const TOLERANCIA_AFROUXADA = 2;
const MARGEM_DIVERSIDADE = 1.5;
const QUASE_NA_FAIXA = 3;

const CHAVES_OBRIGATORIAS = ['dia', 'janela', 'faixa', 'teto'];
const DIMENSOES = ['horario', 'preco', 'idade'];

const janelaPorId = (id) => C.JANELAS.find((j) => j.id === id);
const faixaPorId = (id) => C.FAIXAS.find((f) => f.id === id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const NUMERAL = ['nenhuma', 'uma', 'duas', 'três'];

// ---------------------------------------------------------------- critérios

function listaDeEstilos(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => C.ID_ESTILOS.includes(x)))].sort(
    (a, b) => C.ID_ESTILOS.indexOf(a) - C.ID_ESTILOS.indexOf(b),
  );
}

function tetoValido(v) {
  if (v === 'sem-limite') return true;
  return Number.isInteger(v) && v >= 0 && v <= 1000;
}

// Fica só com o que é válido. Nunca lança: o que vier torto, cai.
function sanearCriterios(bruto) {
  const c = {};
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return c;
  if (Object.hasOwn(C.DIAS, bruto.dia)) c.dia = bruto.dia;
  if (janelaPorId(bruto.janela)) c.janela = bruto.janela;
  if (faixaPorId(bruto.faixa)) c.faixa = bruto.faixa;
  if (tetoValido(bruto.teto)) c.teto = bruto.teto;
  if (bruto.estilos !== undefined) c.estilos = listaDeEstilos(bruto.estilos);
  if (bruto.evitarEstilos !== undefined) c.evitarEstilos = listaDeEstilos(bruto.evitarEstilos);
  if (bruto.perto === null) c.perto = null;
  else if (typeof bruto.perto === 'string' && Object.hasOwn(C.REFERENCIAS, bruto.perto)) c.perto = bruto.perto;
  if (bruto.fimMax === null) c.fimMax = null;
  else if (typeof bruto.fimMax === 'number' && bruto.fimMax >= 19 && bruto.fimMax <= 30 && (bruto.fimMax * 2) % 1 === 0) c.fimMax = bruto.fimMax;
  if (Array.isArray(bruto.firmes)) c.firmes = DIMENSOES.filter((d) => bruto.firmes.includes(d));
  if (Array.isArray(bruto.evitar)) {
    c.evitar = [...new Set(bruto.evitar.filter((x) => typeof x === 'string' && /^[a-z0-9-]{1,60}$/.test(x)))].slice(0, 40);
  }
  if (typeof bruto.oferta === 'string' && /^[a-z0-9 $]{1,40}$/.test(bruto.oferta)) c.oferta = bruto.oferta;
  return c;
}

function falta(c) {
  return CHAVES_OBRIGATORIAS.filter((k) => !Object.hasOwn(c, k));
}

function completar(c) {
  const r = {
    dia: c.dia, janela: c.janela, faixa: c.faixa, teto: c.teto,
    estilos: c.estilos || [], evitarEstilos: c.evitarEstilos || [],
    perto: c.perto || null, fimMax: c.fimMax || null, evitar: c.evitar || [], firmes: c.firmes || [],
  };
  if (c.oferta) r.oferta = c.oferta;
  return r;
}

// O pedido como frase, em partes; as que vêm do formulário reabrem a pergunta.
// [{ chave: 'dia', texto: 'Sábado' }, { chave: 'janela', texto: 'das 19h à 1h' }, ...]
function pedidoEmPartes(c) {
  const j = janelaPorId(c.janela);
  const partes = [
    { chave: 'dia', texto: C.DIAS[c.dia].nome },
    { chave: 'janela', texto: `das ${j.rotulo}` },
    { chave: 'faixa', texto: `gente de ${C.nomeFaixa(c.faixa)}` },
    { chave: 'teto', texto: c.teto === 'sem-limite' ? 'sem teto de preço' : c.teto === 0 ? 'só de graça' : `até R$ ${c.teto}` },
  ];
  if (c.estilos && c.estilos.length) {
    partes.push({ chave: 'estilos', texto: c.estilos.length > 2 ? 'vários sons' : C.listaDeEstilos(c.estilos) });
  }
  if (c.evitarEstilos && c.evitarEstilos.length) partes.push({ chave: null, texto: `sem ${C.listaDeEstilos(c.evitarEstilos, 'nem')}` });
  if (c.fimMax) partes.push({ chave: null, texto: `voltando ${C.ateAs(c.fimMax)}` });
  if (c.perto) partes.push({ chave: null, texto: `perto ${C.REFERENCIAS[c.perto].de}` });
  return partes;
}

// "Sáb · 19h à 1h · 30 a 35 · até R$ 80 · house"
function resumoDoPedido(c) {
  const partes = [C.DIAS[c.dia].curto, janelaPorId(c.janela).rotulo, C.nomeFaixa(c.faixa), C.rotuloTeto(c.teto)];
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

function cabeNoHorario(f, janela, folga) {
  return f.esquenta >= janela.inicio - folga
    && f.esquenta <= janela.fim - 1
    && f.inicio <= janela.fim - 2
    && f.fim >= janela.inicio + 2;
}

function cabeNoPreco(f, teto) {
  return teto === 'sem-limite' || f.preco <= teto;
}

// Estilo recusado barra a festa, a não ser que o som principal dela tenha
// sido pedido de propósito ("sem pop" e depois "funk também" deixa entrar o
// funk que tem um pouco de pop).
function barradaPorEstilo(f, c) {
  if (!f.estilos.some((e) => c.evitarEstilos.includes(e))) return false;
  return !c.estilos.includes(f.estilos[0]);
}

function passa(f, c, nivel) {
  if (f.dia !== c.dia) return false;
  if (c.evitar.includes(f.id)) return false;
  if (barradaPorEstilo(f, c)) return false;
  if (c.fimMax && f.fim > c.fimMax) return false;
  if (!cabeNoHorario(f, janelaPorId(c.janela), nivel.folga)) return false;
  if (!cabeNoPreco(f, nivel.teto)) return false;
  return f.faixas.some((x) => nivel.faixas.includes(x));
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
  const faixa = faixaPorId(c.faixa);
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

// Empate: a mais barata na frente, depois a ordem alfabética do id.
const ordenar = (a, b) => b.pontos - a.pontos || a.festa.preco - b.festa.preco || a.festa.id.localeCompare(b.festa.id);

// Pega as melhores sem repetir o estilo principal, quando dá. Quem pediu um
// estilo só não ganha diversidade de estilo.
function separar(candidatas, c, quantas) {
  const resto = [...candidatas].sort(ordenar);
  const escolhidas = [];
  const diversificar = c.estilos.length !== 1;
  while (escolhidas.length < quantas && resto.length) {
    let i = 0;
    if (diversificar && escolhidas.length) {
      const usados = new Set(escolhidas.map((x) => x.festa.estilos[0]));
      const j = resto.findIndex((x) => !usados.has(x.festa.estilos[0]));
      if (j > 0 && resto[j].pontos >= resto[0].pontos - MARGEM_DIVERSIDADE) i = j;
    }
    escolhidas.push(resto.splice(i, 1)[0]);
  }
  return escolhidas;
}

// Primeiro as que casam com o estilo pedido; depois, se faltar, o som mais parecido.
function separarComEstilo(candidatas, c, quantas) {
  if (!c.estilos.length) return separar(candidatas, c, quantas);
  const casam = candidatas.filter((x) => casaComEstilo(x.festa, c));
  const escolhidas = separar(casam, c, quantas);
  if (escolhidas.length < quantas) {
    const outras = candidatas.filter((x) => !casaComEstilo(x.festa, c)).sort(ordenar);
    escolhidas.push(...outras.slice(0, quantas - escolhidas.length));
  }
  return escolhidas;
}

// ---------------------------------------------------------------- o porquê

// Distância, em anos, da média da festa até a faixa pedida (0 dentro dela).
function foraDaFaixa(f, c) {
  const fx = faixaPorId(c.faixa);
  if (f.mediaIdade < fx.min) return fx.min - f.mediaIdade;
  if (f.mediaIdade > fx.max) return f.mediaIdade - fx.max;
  return 0;
}

// O que distingue esta festa, sem repetir o pedido. Nunca cita estilo que a
// pessoa não pediu; nunca chama de "quase na faixa" quem está longe dela.
function motivos(f, c) {
  const m = [];
  if (c.perto) m.push(`a ${distancia(f, c.perto)} min ${C.REFERENCIAS[c.perto].de}`);
  const anos = foraDaFaixa(f, c);
  if (anos > 0 && anos <= QUASE_NA_FAIXA) m.push(`média ${f.mediaIdade}, quase na sua faixa`);
  if (cabeNoHorario(f, janelaPorId(c.janela), TOLERANCIA)) m.push(`pista cheia ${C.asHoras(f.esquenta)}`);
  else m.push(`esquenta ${C.asHoras(f.esquenta)}, fora da sua janela`);
  if (c.fimMax) m.push(`acaba ${C.asHoras(f.fim)}`);
  if (f.preco === 0) m.push('de graça');
  else if (c.teto !== 'sem-limite') {
    const folga = c.teto - f.preco;
    if (folga >= 10) m.push(`R$ ${folga} abaixo do teto`);
    else if (folga < 0) m.push(`R$ ${-folga} acima do teto`);
  }
  if (c.estilos.length > 1) {
    const casou = f.estilos.find((e) => c.estilos.includes(e));
    if (casou) m.push(C.nomeEstilo(casou));
  }
  // Duas coisas, no máximo: cabe numa linha e diz o que distingue.
  return m.slice(0, 2);
}

function opcao(f, c) {
  return {
    festa: f,
    patrocinada: f.selo === 'patrocinado',
    linha: C.linhaDaFesta(f),
    hora: C.horaCheia(f.inicio),
    dia: C.DIAS[f.dia].curto,
    bairro: C.BAIRROS[f.bairro].nome,
    horario: C.fraseDoHorario(f),
    preco: C.reais(f.preco),
    motivos: motivos(f, c),
    casaComEstilo: c.estilos.length ? casaComEstilo(f, c) : null,
    distancia: c.perto ? distancia(f, c.perto) : null,
  };
}

// ---------------------------------------------------------------- escolher

function niveis(c) {
  const estrito = { folga: TOLERANCIA, teto: c.teto, faixas: [c.faixa], afrouxou: [] };
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
  if (!c.firmes.includes('idade')) {
    lista.push({ ...ultimo, faixas: faixasVizinhas(c.faixa), afrouxou: [...ultimo.afrouxou, 'idade'] });
  }
  return lista;
}

// O que esta festa precisou afrouxar para entrar (vazio quando cabe no pedido).
function foraDoPedido(f, c) {
  const fora = [];
  if (!cabeNoHorario(f, janelaPorId(c.janela), TOLERANCIA)) fora.push('horario');
  if (!cabeNoPreco(f, c.teto)) fora.push('preco');
  if (!f.faixas.includes(c.faixa)) fora.push('idade');
  return fora;
}

// Uma frase, curta, sobre o que foi afrouxado.
function textoDoAviso({ afrouxou, teto, total, c, casam }) {
  const faltouEstilo = c.estilos.length > 0 && casam < Math.min(3, total);
  const partes = [];
  if (afrouxou.includes('horario')) partes.push(total < 3 ? 'abrindo o horário' : 'abri o horário em uma hora');
  if (afrouxou.includes('preco')) {
    const sobe = teto === 'sem-limite' ? 'tirei o teto' : `subi o teto pra R$ ${teto}`;
    partes.push(total < 3 ? 'subindo o teto' : sobe);
  }
  if (afrouxou.includes('idade')) partes.push(total < 3 ? 'incluindo a faixa vizinha' : 'incluí a faixa vizinha');
  const como = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];

  if (total < 3) {
    const n = total === 1 ? 'Só uma cabe' : 'Só duas cabem';
    return como ? `${n}, mesmo ${como}.` : `${n} nesse pedido.`;
  }
  if (faltouEstilo && !como) {
    const sons = C.listaDeEstilos(c.estilos, 'nem');
    if (casam === 0) return `Não achei ${sons} nesse pedido; entraram as mais perto do seu som.`;
    const resto = casam === 1 ? 'as outras são do som mais perto' : 'a outra é do som mais perto';
    return `Só ${NUMERAL[casam]} com ${C.listaDeEstilos(c.estilos)}; ${resto}.`;
  }
  if (faltouEstilo) return `Pra completar a lista, ${como} e trouxe som parecido.`;
  return `Pra completar a lista, ${como}.`;
}

function rodar(c, base) {
  const editoriais = base.filter((f) => f.selo !== 'patrocinado');
  const lista = niveis(c);
  let nivelUsado = lista[0];
  let candidatas = [];
  for (const nivel of lista) {
    nivelUsado = nivel;
    candidatas = editoriais.filter((f) => passa(f, c, nivel)).map((f) => ({ festa: f, pontos: pontuar(f, c) }));
    if (candidatas.length >= 3) break;
  }
  const escolhidas = separarComEstilo(candidatas, c, 3);

  // Patrocinada: cabe no pedido sem afrouxar nada, casa com o estilo pedido
  // (quando há), e é tão aderente quanto a editorial que ela tiraria. No máximo
  // uma, sempre por último, e só com duas editoriais na frente.
  const patrocinada = base
    .filter((f) => f.selo === 'patrocinado' && passa(f, c, lista[0]) && (!c.estilos.length || casaComEstilo(f, c)))
    .map((f) => ({ festa: f, pontos: pontuar(f, c) }))
    .sort(ordenar)[0];
  let finais = escolhidas;
  if (patrocinada && escolhidas.length >= 2) {
    const referencia = escolhidas[Math.min(2, escolhidas.length - 1)];
    if (patrocinada.pontos >= referencia.pontos) finais = [...escolhidas.slice(0, 2), patrocinada];
  }
  return { finais, nivelUsado };
}

// Lista vazia: diz o que travou e oferece soltar, quando soltar resolve.
function ofertaQuandoVazio(c, base) {
  const tenta = (mudanca) => rodar(completar({ ...c, ...mudanca }), base).finais.length > 0;
  if (c.firmes.includes('preco') && c.teto !== 'sem-limite') {
    // O menor degrau que de fato traz alguma festa, com o preço ainda firme.
    for (const novo of C.DEGRAUS_TETO.filter((d) => d === 'sem-limite' || d > c.teto)) {
      if (!tenta({ teto: novo })) continue;
      if (novo === 'sem-limite') {
        return { texto: `Fixei o teto em R$ ${c.teto} e nada cabe. Quer tirar o teto?`, frase: 'sem limite', rotulo: 'tirar o teto' };
      }
      return { texto: `Fixei o teto em R$ ${c.teto} e nada cabe. Quer subir pra R$ ${novo}?`, frase: `ate ${novo}`, rotulo: `subir pra R$ ${novo}` };
    }
  }
  if (c.fimMax) {
    const novo = Math.min(30, c.fimMax + 2);
    if (tenta({ fimMax: novo })) {
      return {
        texto: `Voltando ${C.ateAs(c.fimMax)}, nada cabe. Quer voltar ${C.ateAs(novo)}?`,
        frase: `voltar ate as ${C.hora(novo)}`,
        rotulo: `voltar ${C.ateAs(novo)}`,
      };
    }
  }
  if (c.firmes.includes('horario')) {
    const i = C.JANELAS.findIndex((j) => j.id === c.janela);
    for (const [k, frase] of [[i + 1, 'mais tarde'], [i - 1, 'mais cedo']]) {
      const j = C.JANELAS[k];
      if (j && tenta({ janela: j.id })) return { texto: `Nesse horário nada cabe. Quer tentar ${j.pra}?`, frase, rotulo: frase };
    }
  }
  if (c.firmes.includes('idade')) {
    for (const viz of faixasVizinhas(c.faixa).filter((x) => x !== c.faixa)) {
      if (tenta({ faixa: viz })) {
        const nome = C.nomeFaixa(viz);
        return { texto: `Com gente de ${C.nomeFaixa(c.faixa)}, nada cabe. Quer abrir pra ${nome}?`, frase: `publico de ${nome}`, rotulo: `gente de ${nome}` };
      }
    }
  }
  if (c.evitarEstilos.length && tenta({ evitarEstilos: [] })) {
    return { texto: `Sem ${C.listaDeEstilos(c.evitarEstilos, 'nem')}, nada cabe. Quer liberar qualquer som?`, frase: 'qualquer estilo', rotulo: 'qualquer som' };
  }
  for (const d of C.ORDEM_DIAS.filter((x) => x !== c.dia)) {
    if (tenta({ dia: d })) {
      const nome = C.DIAS[d].frase;
      return { texto: `${c.firmes.length ? 'Nada cabe nesse pedido' : 'Nada cabe nesse pedido, nem afrouxando'}. Quer ver ${d === 'sex' ? 'a' : 'o'} ${nome}?`, frase: nome, rotulo: nome };
    }
  }
  return { texto: 'Nada cabe nesse pedido. Tente outro dia ou outro horário.', frase: null, rotulo: null };
}

// escolher(criterios, base) -> { opcoes, aviso?, oferta?, afrouxou, casam }
function escolher(criteriosBrutos, base) {
  const saneados = sanearCriterios(criteriosBrutos);
  const faltam = falta(saneados);
  if (faltam.length) throw new Error(`faltam critérios: ${faltam.join(', ')}`);
  const c = completar(saneados);
  const { finais, nivelUsado } = rodar(c, base);

  // Em ordem de horário; a patrocinada fica por último.
  const editoriais = finais.filter((x) => x.festa.selo !== 'patrocinado')
    .sort((a, b) => a.festa.inicio - b.festa.inicio || a.festa.id.localeCompare(b.festa.id));
  const ordem = [...editoriais, ...finais.filter((x) => x.festa.selo === 'patrocinado')];

  const afrouxou = DIMENSOES.filter((k) => ordem.some((x) => foraDoPedido(x.festa, c).includes(k)));
  const casam = ordem.filter((x) => casaComEstilo(x.festa, c)).length;
  const resultado = { opcoes: ordem.map((x) => opcao(x.festa, c)), afrouxou, casam };
  if (!ordem.length) {
    const o = ofertaQuandoVazio(c, base);
    resultado.aviso = o.texto;
    if (o.frase) resultado.oferta = { frase: o.frase, rotulo: o.rotulo };
  } else if (afrouxou.length || ordem.length < 3 || (c.estilos.length && casam < ordem.length)) {
    resultado.aviso = textoDoAviso({ afrouxou, teto: nivelUsado.teto, total: ordem.length, c, casam });
  }
  return resultado;
}

// Por que um estilo pedido não entrou: o que barra a melhor festa daquele som.
function impedimentoDoEstilo(criterios, base, estilo) {
  const c = completar(sanearCriterios(criterios));
  const doDia = base.filter((f) => f.dia === c.dia && f.estilos.includes(estilo));
  const nome = C.nomeEstilo(estilo);
  if (!doDia.length) return `Não tem ${nome} ${C.DIAS[c.dia].frase === 'sexta' ? 'na sexta' : `no ${C.DIAS[c.dia].frase}`}.`;
  const j = janelaPorId(c.janela);
  const motivosDe = (f) => {
    if (c.evitar.includes(f.id)) return 'já saiu da lista';
    if (barradaPorEstilo(f, { ...c, estilos: [estilo] })) return `tem ${C.listaDeEstilos(f.estilos.filter((e) => c.evitarEstilos.includes(e)))}, que você tirou`;
    if (c.fimMax && f.fim > c.fimMax) return 'acaba depois da sua volta';
    if (!cabeNoHorario(f, j, TOLERANCIA_AFROUXADA)) return 'fora do seu horário';
    if (!cabeNoPreco(f, c.teto)) return `acima de R$ ${c.teto}`;
    if (!f.faixas.includes(c.faixa)) return 'com outro público';
    return null;
  };
  const razoes = doDia.map(motivosDe).filter(Boolean);
  if (!razoes.length) return null;
  return `Tem ${nome}, mas ${razoes[0]}.`;
}

module.exports = {
  TOLERANCIA, TOLERANCIA_AFROUXADA, CHAVES_OBRIGATORIAS, DIMENSOES, QUASE_NA_FAIXA,
  sanearCriterios, falta, completar, resumoDoPedido, pedidoEmPartes, escolher, opcao, distancia, pontuar,
  foraDoPedido, proximoDegrau, faixasVizinhas, cabeNoHorario, janelaPorId, impedimentoDoEstilo, casaComEstilo,
};

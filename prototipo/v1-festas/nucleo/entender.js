'use strict';
// Ajuste em uma frase -> mudança nos critérios. Puro, por regras, sem modelo
// de linguagem. É aqui que um modelo entraria: a função recebe a frase e os
// critérios atuais e devolve o que mudar; o resto do app não precisa saber como.
//
// entender(texto, atuais) -> { mudar, pedidos, duvida? }
//   atuais: os critérios em vigor, mais `mostradas` (ids na tela),
//   `estilosMostrados` e `precosMostrados`, para "outras", "outro estilo" e
//   "mais barato".
//   pedidos: o que a frase pediu, para a resposta da conversa, mesmo quando
//   nada muda ("mais cedo" quando já é o mais cedo possível).
//   duvida: o que a frase citou sem deixar claro que queria mudar ("domingo
//   tem almoço"): a conversa pergunta em vez de trocar.
//
// Negação vale antes e depois do termo, para dia, som, bairro e tipo de casa:
// "sem funk", "funk não", "nada de rooftop", "Pinheiros não", "longe da Augusta".

const C = require('./catalogo');

const ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(ACENTOS, '')
    .replace(/r\$\s*/g, 'r$ ')
    .replace(/(\d)\s*h\b/g, '$1h')
    .replace(/[^a-z0-9$+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tem = (t, re) => re.test(t);
const palavras = (t) => (t ? t.split(' ').length : 0);

// Negação antes do termo (até três palavras antes) e depois dele.
const NEG_ANTES = /(?:^|\s)(?:sem|nem|nada de|nada em|nada no|nada na|nada do|nada da|menos|nao quero|nao curto|nao gosto de|nao|tira|tira o|tira a|tirar|tirar o|fora|fora de|fora do|fora da|odeio|chega de|zero|evitar|evita|longe de|longe do|longe da|longe dos)\s+(?:o |a |os |as |de |do |da |em |no |na )?$/;
const NEG_DEPOIS = /^\s*(?:nao|nem pensar|fora|de jeito nenhum|nunca|jamais|nao rola|nao da)\b/;

function negado(t, ini, fim) {
  return NEG_ANTES.test(t.slice(Math.max(0, ini - 24), ini)) || NEG_DEPOIS.test(t.slice(fim));
}

// ---------------------------------------------------------------- lugares

const NOMES_DE_LUGAR = {
  pinheiros: ['pinheiros', 'pinheiro'],
  'vila-madalena': ['vila madalena', 'vila mada', 'madalena'],
  'barra-funda': ['barra funda', 'barra'],
  centro: ['centro', 'centrao', 'centro da cidade'],
  'bela-vista': ['bela vista'],
  jardins: ['jardins', 'jardim'],
  'vila-mariana': ['vila mariana', 'vl mariana'],
  'largo-da-batata': ['largo da batata', 'batata'],
  butanta: ['butanta'],
  'alto-de-pinheiros': ['alto de pinheiros'],
  sumare: ['sumare', 'sumarezinho'],
  perdizes: ['perdizes'],
  lapa: ['lapa'],
  'santa-cecilia': ['santa cecilia'],
  higienopolis: ['higienopolis'],
  republica: ['republica'],
  liberdade: ['liberdade'],
  bixiga: ['bixiga', 'bexiga'],
  consolacao: ['consolacao'],
  augusta: ['augusta', 'baixo augusta'],
  paulista: ['paulista', 'avenida paulista', 'av paulista'],
  'itaim-bibi': ['itaim bibi', 'itaim'],
  'jardim-paulista': ['jardim paulista'],
  'oscar-freire': ['oscar freire'],
  moema: ['moema'],
  paraiso: ['paraiso'],
  ibirapuera: ['ibirapuera', 'ibira'],
};
// O nome mais longo primeiro: "alto de pinheiros" antes de "pinheiros".
const LUGARES = Object.entries(NOMES_DE_LUGAR)
  .flatMap(([id, nomes]) => nomes.map((n) => [normalizar(n), id]))
  .sort((a, b) => b[0].length - a[0].length);

function lugarCitado(t) {
  for (const [nome, id] of LUGARES) {
    const m = new RegExp(`\\b${nome}\\b`).exec(t);
    if (m) return { id, negado: negado(t, m.index, m.index + m[0].length) };
  }
  return undefined;
}

// ---------------------------------------------------------------- estilos

const PALAVRAS_DE_ESTILO = [
  ['house-disco', 'house|disco|disco music|nu disco'],
  ['pop-2000', 'pop|anos 2000|flashback|pop 2000'],
  ['mpb-samba', 'mpb|samba|pagode|pagodinho|gafieira|forro|roda de samba|musica brasileira|brasileira|brasilidade'],
  ['funk', 'funk|baile funk|baile'],
  ['indie-rock', 'indie|rock|banda|guitarra'],
  ['eletronica', 'eletronica|eletronico|techno|tecno|electro|eletro'],
];

// Estilos citados, com a negação que vale para a lista inteira:
// "sem funk e indie" recusa os dois; "funk não" recusa; "sem funk, só house" pede house.
function lerEstilos(t) {
  const achados = [];
  for (const [id, lista] of PALAVRAS_DE_ESTILO) {
    const re = new RegExp(`\\b(?:${lista})\\b`, 'g');
    let m;
    while ((m = re.exec(t))) achados.push({ id, ini: m.index, fim: m.index + m[0].length, negado: negado(t, m.index, m.index + m[0].length) });
  }
  achados.sort((a, b) => a.ini - b.ini);
  const querer = [];
  const evitar = [];
  let anterior = null;
  for (const a of achados) {
    const entre = anterior ? t.slice(anterior.fim, a.ini) : '';
    const emLista = anterior && anterior.negado && /^\s*(?:,|e|nem|ou)?\s*(?:o |a |os |as |de )?$/.test(entre);
    a.negado = a.negado || !!emLista;
    (a.negado ? evitar : querer).push(a.id);
    anterior = a;
  }
  const unicos = (l) => [...new Set(l)];
  return { querer: unicos(querer).filter((x) => !evitar.includes(x)), evitar: unicos(evitar) };
}

// ---------------------------------------------------------------- casas

function lerCasas(t) {
  const evitar = [];
  const querer = [];
  for (const k of Object.keys(C.CASAS)) {
    const m = new RegExp(`\\b${k}\\b`).exec(t);
    if (!m) continue;
    (negado(t, m.index, m.index + m[0].length) ? evitar : querer).push(k);
  }
  return { evitar, querer };
}

// ---------------------------------------------------------------- dia

const DIA_RE = { sex: 'sexta|sexta feira|sextou', sab: 'sabado|sab', dom: 'domingo|domingao' };
// Intenção de mudar o dia: "e no domingo?", "pode ser domingo", "prefiro sexta".
const INTENCAO_DIA = '(?:^|\\b)(?:e|pode ser|prefiro|muda pra|mudar pra|troca pra|trocar pra|vamos|bora|tem|tem algo|e no|e na|no|na|pro|pra|para|para o|para a|entao|que tal|melhor)\\s+(?:no |na |o |a )?';

// `pontuado`: a frase sem acento, mas com a pontuação ("sábado, fim de tarde").
function lerDia(t, pontuado) {
  for (const [id, nomes] of Object.entries(DIA_RE)) {
    const m = new RegExp(`\\b(?:${nomes})\\b`).exec(t);
    if (!m) continue;
    const neg = negado(t, m.index, m.index + m[0].length);
    const intencao = palavras(t) <= 2 || new RegExp(`${INTENCAO_DIA}(?:${nomes})\\b`).test(t)
      || new RegExp(`\\b(?:${nomes})\\s*[,;?!]`).test(pontuado);
    return { id, negado: neg, intencao };
  }
  return undefined;
}

// ---------------------------------------------------------------- horário

// Hora citada: "22h", "às 10 da noite", "começa às 9" (de 1 a 11, é da noite).
function horaDe(texto, contexto) {
  let h = Number(texto);
  if (h >= 1 && h <= 11 && !/da manha/.test(contexto)) h += 12;
  return h;
}

function janelaDaHora(h) {
  if (h >= 12 && h <= 18) return 'fim-de-tarde';
  if (h >= 19 && h <= 21) return 'comeco-da-noite';
  if (h >= 22 || h <= 4) return 'noite';
  return undefined;
}

function deslocarJanela(atual, passo) {
  const i = C.JANELAS.findIndex((j) => j.id === atual);
  const k = Math.max(0, Math.min(C.JANELAS.length - 1, (i < 0 ? 1 : i) + passo));
  return C.JANELAS[k].id;
}

// ---------------------------------------------------------------- preço

// "mais barato": parte do mais caro que está na tela (ou do teto, se for menor)
// e desce um degrau fino. Nunca anuncia um teto maior que o de antes.
function degrauAbaixo(teto, precosNaTela = []) {
  const caro = precosNaTela.length ? Math.max(...precosNaTela) : Infinity;
  const base = Math.min(teto === 'sem-limite' ? Infinity : teto, caro);
  if (base === Infinity) return 150;
  const abaixo = C.DEGRAUS_BARATO.filter((x) => x < base);
  return abaixo.length ? abaixo[abaixo.length - 1] : 0;
}

function degrauAcima(teto) {
  if (teto === 'sem-limite') return 'sem-limite';
  return C.DEGRAUS_TETO.find((x) => x === 'sem-limite' || x > teto);
}

// ---------------------------------------------------------------- faixa

function faixaDaIdade(n) {
  const f = C.FAIXAS.find((x) => n >= x.min && n <= x.max);
  return f ? f.id : undefined;
}

function deslocarFaixa(atual, passo) {
  const i = C.FAIXAS.findIndex((f) => f.id === atual);
  const k = Math.max(0, Math.min(C.FAIXAS.length - 1, (i < 0 ? 2 : i) + passo));
  return C.FAIXAS[k].id;
}

// ---------------------------------------------------------------- entender

function entender(texto, atuais = {}) {
  const t = normalizar(texto || '');
  const mudar = {};
  const pedidos = [];
  let duvida;
  let diaRecusado;
  if (!t) return { mudar, pedidos };
  const a = atuais || {};
  const pedir = (p) => {
    if (!pedidos.includes(p)) pedidos.push(p);
  };

  // dia: muda só com intenção clara; negado, sai; citado de passagem, pergunta.
  const pontuado = String(texto || '').toLowerCase().normalize('NFD').replace(ACENTOS, '');
  const dia = lerDia(t, pontuado);
  if (dia && dia.negado) {
    if (a.dia === dia.id) {
      const outros = C.ORDEM_DIAS.filter((d) => d !== dia.id);
      // Sexta ou domingo recusados vão pro sábado; sábado recusado vai pro domingo.
      mudar.dia = outros.includes('sab') ? 'sab' : 'dom';
    }
    pedir('sem-dia');
    diaRecusado = dia.id;
  } else if (dia && dia.intencao) {
    mudar.dia = dia.id;
    pedir('dia');
  } else if (dia && dia.id !== a.dia) {
    duvida = { dia: dia.id };
  }

  // hora de voltar: cria um teto para o fim da festa (voltaMax)
  const VOLTA = /\b(?:acab\w*|termin\w*|voltar|volto|sair|ir embora|embora|dormir|em casa)\s+(?:ate|antes da|antes das|antes de|a|as)\s+(?:as\s+|a\s+)?(meia noite|\d{1,2})(?:h\d{0,2}|\b)/;
  let fim;
  const mv = t.match(VOLTA) || t.match(/\bate (?:a )?(meia noite)\b/);
  if (mv) {
    fim = mv[1] === 'meia noite' ? 24 : Number(mv[1]);
    if (fim < 12) fim += 24;
  } else if (tem(t, /\b(voltar cedo|volto cedo|dormir cedo|durmo cedo|acordo cedo|acordar cedo|trabalho amanha|acabe cedo|acaba cedo|termine cedo|termina cedo)\b/)) {
    fim = 24;
  }
  const querTarde = tem(t, /\b(mais tarde|mais tardinho|madrugada|virar a noite|noite toda|ate de manha|ate amanhecer|amanhecer|tarde da noite)\b/);
  const querCedo = tem(t, /\b(mais cedo|cedinho|mais cedinho|menos tarde|nao muito tarde)\b/);
  // Pedido contraditório: pergunta em vez de aplicar pela metade.
  if ((querTarde && (fim !== undefined || querCedo))) {
    pedir(fim !== undefined ? 'contradicao-volta' : 'contradicao-hora');
    return { mudar: {}, pedidos };
  }
  if (fim !== undefined && fim >= 19 && fim <= 30) {
    mudar.voltaMax = fim;
    const j = C.JANELAS.find((x) => x.id === (a.janela || 'comeco-da-noite'));
    if (j && j.inicio + 2 > fim) mudar.janela = 'fim-de-tarde';
    pedir('fim');
  }

  // horário de chegar: relativo, por nome ou por hora citada (lido junto com a volta)
  if (querCedo) {
    mudar.janela = deslocarJanela(a.janela, -1);
    pedir('mais-cedo');
  } else if (querTarde) {
    mudar.janela = deslocarJanela(a.janela, +1);
    if (a.voltaMax) mudar.voltaMax = null;
    pedir('mais-tarde');
  } else if (tem(t, /\b(fim de tarde|fim da tarde|final da tarde|de tarde|a tarde|happy hour|por do sol|entardecer)\b/)) {
    mudar.janela = 'fim-de-tarde';
    pedir('janela');
  } else if (tem(t, /\b(comeco da noite|inicio da noite|depois do trabalho|depois do expediente|depois do jantar)\b/)) {
    mudar.janela = /depois do jantar/.test(t) ? 'noite' : 'comeco-da-noite';
    pedir('janela');
  } else {
    const re = /\b(?:as|a partir das|depois das|chegar as|chegando as|chegar umas|chegar|comecar as|comeca as|comeca|la pelas|umas)\s+(\d{1,2})(?:h\d{0,2}|\b)(?!\s*(?:pessoas|amig|de nos|reais|conto))( da noite| da tarde| da manha)?/g;
    let m;
    while ((m = re.exec(t))) {
      if (/\b(?:ate|acordo|acordar|acordando)\s*$/.test(t.slice(0, m.index))) continue;
      if (mv && m.index >= mv.index && m.index < mv.index + mv[0].length) continue;
      const j = janelaDaHora(horaDe(m[1], m[2] || ''));
      if (j) {
        mudar.janela = j;
        pedir('janela');
        break;
      }
    }
  }

  // preço: o número vem primeiro ("sem pagar mais de 50" é teto de R$ 50)
  const composto = t.match(/\b(?:sem pagar|nao pagar|pagar|gastar|sem gastar|nao gastar)\s+mais\s+(?:de|que|do que)\s+(?:r\$\s+)?(\d{1,4})\b/);
  if (composto) {
    const v = Number(composto[1]);
    mudar.teto = v > 300 ? 'sem-limite' : v;
    pedir('teto');
  } else if (tem(t, /\b(de graca|gratis|gratuit[oa]s?|sem pagar|free)\b/)) {
    mudar.teto = 0;
    pedir('gratis');
  } else if (tem(t, /\b(mais barat[oa]s?|mais em conta|mais economic[oa]|menos car[oa]|gastar menos|baratinh[oa]|barat[oa]|economizar|to liso|to lisa|to sem grana|sem grana|mai barto)\b/)) {
    mudar.teto = degrauAbaixo(a.teto === undefined ? 'sem-limite' : a.teto, a.precosMostrados || []);
    pedir('mais-barato');
  } else if (tem(t, /\b(sem limite|sem teto|tanto faz o preco|qualquer preco|preco nao importa|dinheiro nao e problema)\b/)) {
    mudar.teto = 'sem-limite';
    pedir('sem-limite');
  } else if (tem(t, /\b(mais car[oa]|gastar mais|pode ser car[oa]|pode gastar|mais chique)\b/)) {
    mudar.teto = degrauAcima(a.teto === undefined ? 80 : a.teto);
    pedir('mais-caro');
  } else {
    let m = t.match(/(?:\bate|\bno maximo|\bmaximo|\bteto de|\bteto|\bgastar|\bpagar)\s+(?:r\$\s+)?(\d{1,4})\b(?!h)/);
    if (!m) m = t.match(/(?:r\$\s+)(\d{1,4})\b/);
    if (!m) m = t.match(/\b(\d{1,4})\s+(?:reais|conto|contos|pila)\b/);
    if (m && !(fim !== undefined && Number(m[1]) === fim % 24)) {
      const v = Number(m[1]);
      mudar.teto = v > 300 ? 'sem-limite' : v;
      pedir('teto');
    }
  }

  // idade do público
  if (tem(t, /\b(da minha idade|da nossa idade|minha faixa|da minha fase|gente como eu)\b/)) {
    pedir('minha-idade');
  } else if (tem(t, /\b(mais velh[oa]s?|mais madur[oa]s?|mais adult[oa]s?|menos novinh[oa]s?|sem novinh[oa]s?|menos jovem|menos jovens|gente mais velha)\b/)) {
    mudar.faixa = deslocarFaixa(a.faixa, +1);
    pedir('mais-velho');
  } else if (tem(t, /\b(mais nov[oa]s?|mais jovem|mais jovens|mais novinh[oa]s?)\b/)) {
    mudar.faixa = deslocarFaixa(a.faixa, -1);
    pedir('mais-novo');
  } else if (tem(t, /\b(publico|idade|anos|gente|galera|turma|povo|pessoal|faixa)\b/)) {
    let m = t.match(/\b(\d{2})\s*(?:a|ate|e|-)\s*(\d{2})\b/);
    let idade;
    if (m) idade = Math.round((Number(m[1]) + Number(m[2])) / 2);
    else {
      m = t.match(/\b(\d{2})\s*(?:\+|ou mais|anos|e poucos|e tantos)/) || t.match(/\b(?:de|dos|das) (\d{2})\b/);
      if (m) idade = Number(m[1]);
    }
    if (tem(t, /\btrinta e poucos|trintoes\b/)) idade = 32;
    if (tem(t, /\bquarenta|quarentoes\b/)) idade = 40;
    if (idade && idade >= 18 && idade <= 70) {
      mudar.faixa = faixaDaIdade(idade);
      pedir('faixa');
    }
  }

  // estilo
  const est = lerEstilos(t);
  if (tem(t, /\b(qualquer estilo|tanto faz o estilo|qualquer musica|tanto faz a musica|qualquer som|tanto faz o som)\b/)) {
    mudar.estilos = [];
    mudar.evitarEstilos = [];
    pedir('qualquer-estilo');
  } else if (tem(t, /\b(outro estilo|outros estilos|outra musica|outro som|outra vibe|outra trilha|musica diferente|outro tipo de musica|outro genero|estilo diferente)\b/)) {
    const fora = new Set([...(a.estilos || []), ...(a.estilosMostrados || [])]);
    const outros = C.ID_ESTILOS.filter((e) => !fora.has(e) && !(a.evitarEstilos || []).includes(e));
    mudar.estilos = outros.length ? outros : [];
    mudar.evitar = [...new Set([...(a.evitar || []), ...(a.mostradas || [])])].slice(0, 40);
    pedir('outro-estilo');
  } else {
    if (est.evitar.length) {
      mudar.evitarEstilos = [...new Set([...(a.evitarEstilos || []), ...est.evitar])];
      mudar.estilos = (a.estilos || []).filter((e) => !est.evitar.includes(e));
      pedir('sem-estilo');
    }
    if (est.querer.length) {
      const somar = tem(t, /\b(tambem|e tambem|junto|alem de)\b/);
      const base = somar ? (mudar.estilos || a.estilos || []) : [];
      mudar.estilos = [...new Set([...base, ...est.querer])];
      const evitar = mudar.evitarEstilos || a.evitarEstilos || [];
      if (evitar.some((e) => est.querer.includes(e))) mudar.evitarEstilos = evitar.filter((e) => !est.querer.includes(e));
      pedir('estilo');
    }
  }

  // tipo de casa: dá para tirar ("nada de rooftop"); procurar por casa, ainda não.
  const casas = lerCasas(t);
  if (casas.evitar.length) {
    mudar.evitarCasas = [...new Set([...(a.evitarCasas || []), ...casas.evitar])];
    pedir('sem-casa');
  } else if (casas.querer.length && !pedidos.length) {
    pedir('casa-positiva');
  }

  // lugar: perto, ou longe (negado)
  const lugar = lugarCitado(t);
  if (lugar && lugar.negado) {
    const bairro = C.REFERENCIAS[lugar.id].bairro;
    mudar.evitarBairros = [...new Set([...(a.evitarBairros || []), bairro])];
    if (a.perto && C.REFERENCIAS[a.perto].bairro === bairro) mudar.perto = null;
    pedir('sem-bairro');
  } else if (lugar) {
    mudar.perto = lugar.id;
    pedir('perto');
  } else if (tem(t, /\b(qualquer lugar|qualquer bairro|tanto faz o lugar|tanto faz onde|tanto faz o bairro|longe tudo bem|pode ser longe)\b/)) {
    mudar.perto = null;
    pedir('qualquer-lugar');
  } else if (tem(t, /\b(metro|onibus|estacionamento|estacionar|uber|taxi)\b/)) {
    pedir('fora-transporte');
  } else if (tem(t, /\b(perto|mais perto|proxim[oa]|do lado|aqui perto|perto de casa|perto de mim|sem andar muito|menos longe)\b/)) {
    pedir(a.perto ? 'perto' : 'perto-sem-lugar');
  }

  // o que o Finde ainda não sabe: clima, segurança
  if (tem(t, /\b(tranquil[oa]s?|calm[oa]s?|sossegad[oa]s?|vazi[oa]s?|cheia|lotad[oa]|fila|open bar|ao vivo|dj|chique|intimista|animad[oa]s?)\b/)) {
    pedir('fora-do-alcance');
  }
  if (tem(t, /\b(segur[oa]|seguranca|perigos[oa]|acessivel|acessibilidade)\b/)) pedir('fora-seguranca');

  // indiferença: "tanto faz", "qualquer coisa", "me surpreende"
  if (!pedidos.length && tem(t, /\b(tanto faz|qualquer coisa|qualquer uma|me surpreend\w*|sei la|escolhe voce|voce escolhe|tanto faz pra mim|pode ser qualquer)\b/)) {
    pedir('surpresa');
  }

  // "sim" para a oferta da resposta anterior
  if (!pedidos.length && !duvida && tem(t, /^(sim|pode|pode ser|quero|bora|ok|claro|manda|vai|isso|beleza|fechou)$/)) {
    pedir('aceitar');
  }

  // outras opções
  if (!pedidos.length && !duvida && tem(t, /\b(outras|outra|mostra mais|tem mais|mais opcoes|outras opcoes|nao gostei|nenhuma|proxima|proximas)\b/)) {
    mudar.evitar = [...new Set([...(a.evitar || []), ...(a.mostradas || [])])].slice(0, 40);
    pedir('outras');
  }

  const r = { mudar, pedidos };
  if (duvida) r.duvida = duvida;
  if (diaRecusado) r.diaRecusado = diaRecusado;
  return r;
}

module.exports = { entender, normalizar, lugarCitado };

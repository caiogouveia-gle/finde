'use strict';
// Ajuste em uma frase -> mudança nos critérios. Puro, por regras, sem modelo
// de linguagem. É aqui que um modelo entraria: a função recebe a frase e os
// critérios atuais e devolve o que mudar; o resto do app não precisa saber como.
//
// entender(texto, atuais) -> { mudar: {criterios parciais}, pedidos: [string] }
//   atuais: os critérios em vigor, mais `mostradas` (ids na tela) e
//   `estilosMostrados` (estilo principal de cada uma), para "outras" e "outro estilo".
//   pedidos: o que a frase pediu, para a resposta da conversa, mesmo quando
//   nada muda ("mais cedo" quando já é o mais cedo possível).

const C = require('./catalogo');

function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/r\$\s*/g, 'r$ ')
    .replace(/(\d)\s*h\b/g, '$1h')
    .replace(/[^a-z0-9$+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tem = (t, re) => re.test(t);

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
// O nome mais longo primeiro: "alto de pinheiros" antes de "pinheiros",
// "jardim paulista" antes de "paulista".
const LUGARES = Object.entries(NOMES_DE_LUGAR)
  .flatMap(([id, nomes]) => nomes.map((n) => [normalizar(n), id]))
  .sort((a, b) => b[0].length - a[0].length);

function lugarCitado(t) {
  for (const [nome, id] of LUGARES) {
    if (new RegExp(`\\b${nome}\\b`).test(t)) return id;
  }
  return undefined;
}

// ---------------------------------------------------------------- estilos

const PALAVRAS_DE_ESTILO = [
  ['house-disco', 'house|disco|disco music|nu disco'],
  ['pop-2000', 'pop|anos 2000|flashback|pop 2000'],
  ['mpb-samba', 'mpb|samba|pagode|gafieira|forro|roda de samba'],
  ['funk', 'funk|baile funk|baile'],
  ['indie-rock', 'indie|rock|banda|guitarra'],
  ['eletronica', 'eletronica|eletronico|techno|tecno|electro|eletro'],
];
const NEGACAO = '(?:sem|nem|nada de|menos|nao quero|nao curto|nao gosto de|tira|tira o|tira a|tirar|tirar o|fora|odeio|chega de|zero|evitar|evita)';

// Estilos citados, com a negação que vale para a lista inteira:
// "sem funk e indie" recusa os dois; "sem funk, só house" recusa um e pede o outro.
function lerEstilos(t) {
  const achados = [];
  for (const [id, palavras] of PALAVRAS_DE_ESTILO) {
    const re = new RegExp(`(\\b${NEGACAO}\\s+(?:o |a |os |as |de )?)?\\b(?:${palavras})\\b`, 'g');
    let m;
    while ((m = re.exec(t))) achados.push({ id, ini: m.index, fim: m.index + m[0].length, negado: !!m[1] });
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

// ---------------------------------------------------------------- horário

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
  if (!t) return { mudar, pedidos };
  const a = atuais || {};
  const pedir = (p) => {
    if (!pedidos.includes(p)) pedidos.push(p);
  };

  // dia
  let dia;
  if (tem(t, /\b(sexta|sexta feira|sex|sextou)\b/)) dia = 'sex';
  else if (tem(t, /\b(sabado|sab)\b/)) dia = 'sab';
  else if (tem(t, /\b(domingo|dom|domingao)\b/)) dia = 'dom';
  if (dia) {
    mudar.dia = dia;
    pedir('dia');
  }

  // hora de voltar: cria um teto para o fim da festa (fimMax)
  const VOLTA = /\b(?:acab\w*|termin\w*|voltar|volto|sair|ir embora|embora|dormir|em casa)\s+(?:ate|antes da|antes das|antes de|a|as)\s+(?:as\s+|a\s+)?(meia noite|\d{1,2})(?:h\d{0,2}|\b)/;
  let fim;
  const mv = t.match(VOLTA) || t.match(/\bate (?:a )?(meia noite)\b/);
  if (mv) {
    fim = mv[1] === 'meia noite' ? 24 : Number(mv[1]);
    if (fim < 12) fim += 24;
  } else if (tem(t, /\b(voltar cedo|volto cedo|dormir cedo|durmo cedo|acordo cedo|acordar cedo|trabalho amanha|acabe cedo|acaba cedo|termine cedo|termina cedo)\b/)) {
    fim = 24;
  }
  if (fim !== undefined && fim >= 19 && fim <= 30) {
    mudar.fimMax = fim;
    // A janela precisa caber antes da volta.
    const j = C.JANELAS.find((x) => x.id === (a.janela || 'comeco-da-noite'));
    if (j && j.inicio + 2 > fim) mudar.janela = 'fim-de-tarde';
    pedir('fim');
  }

  // horário de chegar: relativo, por nome ou por hora citada
  if (tem(t, /\b(mais cedo|cedinho|mais cedinho|menos tarde|nao muito tarde)\b/)) {
    mudar.janela = deslocarJanela(a.janela, -1);
    pedir('mais-cedo');
  } else if (tem(t, /\b(mais tarde|mais tardinho|madrugada|virar a noite|noite toda|ate de manha|ate amanhecer|tarde da noite)\b/)) {
    mudar.janela = deslocarJanela(a.janela, +1);
    if (a.fimMax) mudar.fimMax = null;
    pedir('mais-tarde');
  } else if (tem(t, /\b(fim de tarde|fim da tarde|final da tarde|de tarde|a tarde|happy hour|por do sol|entardecer)\b/)) {
    mudar.janela = 'fim-de-tarde';
    pedir('janela');
  } else if (tem(t, /\b(comeco da noite|inicio da noite|depois do trabalho|depois do expediente)\b/)) {
    mudar.janela = 'comeco-da-noite';
    pedir('janela');
  } else if (fim === undefined) {
    const m = t.match(/\b(?:as|a partir das|depois das|chegar as|chegando as|comecar as|comeca as|la pelas|umas)\s+(\d{1,2})(?:h\d{0,2}|\b)/);
    if (m && !/\bate\s*$/.test(t.slice(0, m.index))) {
      const j = janelaDaHora(Number(m[1]));
      if (j) {
        mudar.janela = j;
        pedir('janela');
      }
    }
  }

  // preço
  if (tem(t, /\b(de graca|gratis|gratuit[oa]s?|sem pagar|free)\b/)) {
    mudar.teto = 0;
    pedir('gratis');
  } else if (tem(t, /\b(mais barat[oa]s?|mais em conta|mais economic[oa]|menos car[oa]|gastar menos|baratinh[oa]|barat[oa]|economizar|to liso|to lisa|to sem grana|sem grana)\b/)) {
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
      // Acima de R$ 300 ninguém está pensando em teto: vira "sem limite".
      const v = Number(m[1]);
      mudar.teto = v > 300 ? 'sem-limite' : v;
      pedir('teto');
    }
  }

  // idade do público
  if (tem(t, /\b(mais velh[oa]s?|mais madur[oa]s?|mais adult[oa]s?|menos novinh[oa]s?|sem novinh[oa]s?|menos jovem|menos jovens|gente mais velha)\b/)) {
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
    if (tem(t, /\btrinta e poucos|trintoes|trintoes\b/)) idade = 32;
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
    // Prefere tudo o que não está na tela agora (ou no pedido atual).
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

  // lugar
  const lugar = lugarCitado(t);
  if (lugar) {
    mudar.perto = lugar;
    pedir('perto');
  } else if (tem(t, /\b(qualquer lugar|qualquer bairro|tanto faz o lugar|tanto faz onde|tanto faz o bairro|longe tudo bem|pode ser longe)\b/)) {
    mudar.perto = null;
    pedir('qualquer-lugar');
  } else if (tem(t, /\b(perto|mais perto|proxim[oa]|do lado|aqui perto|perto de casa|perto de mim|sem andar muito|menos longe)\b/)) {
    pedir(a.perto ? 'perto' : 'perto-sem-lugar');
  }

  // o que o Finde ainda não filtra: clima e tipo de casa
  if (tem(t, /\b(tranquil[oa]s?|calm[oa]s?|sossegad[oa]s?|vazi[oa]s?|cheia|lotad[oa]|rooftop|terraco|ao ar livre|fechad[oa]|galpao|fila|open bar|ao vivo|dj|chique|intimista|animad[oa]s?)\b/)) {
    pedir('fora-do-alcance');
  }

  // "sim" para a oferta da resposta anterior
  if (!pedidos.length && tem(t, /^(sim|pode|pode ser|quero|bora|ok|claro|manda|vai|isso|beleza|fechou)$/)) {
    pedir('aceitar');
  }

  // outras opções
  if (!pedidos.length && tem(t, /\b(outras|outra|mostra mais|tem mais|mais opcoes|outras opcoes|nao gostei|nenhuma|proxima|proximas)\b/)) {
    mudar.evitar = [...new Set([...(a.evitar || []), ...(a.mostradas || [])])].slice(0, 40);
    pedir('outras');
  }

  return { mudar, pedidos };
}

module.exports = { entender, normalizar, lugarCitado };

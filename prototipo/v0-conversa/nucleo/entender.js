'use strict';
// Texto livre -> critérios parciais. Puro, por regras; é aqui que um modelo de
// linguagem entraria no lugar. O que não reconhece fica de fora e a conversa pergunta.
//
// entender(texto, atuais?, pergunta?)
//   atuais: critérios que já valem, para ajustes relativos ("mais barato", "outra região").
//   pergunta: a pergunta em aberto, para respostas soltas ("tanto faz", "4", "80").

const REGIOES = ['pinheiros-vila-madalena', 'centro', 'paulista-ibirapuera'];

const NUMEROS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20,
};
const NUM = `(\\d{1,3}|${Object.keys(NUMEROS).join('|')})`;

const BAIRROS = {
  'pinheiros-vila-madalena': [
    'pinheiros', 'vila madalena', 'vila mada', 'madalena', 'largo da batata', 'beco do batman',
    'sumarezinho', 'sumare', 'vila beatriz', 'alto de pinheiros', 'fradique', 'teodoro sampaio',
  ],
  centro: [
    'centro', 'centrao', 'republica', 'praca da se', 'catedral da se', 'luz', 'bom retiro',
    'santa cecilia', 'consolacao', 'bixiga', 'bela vista', 'liberdade', 'barra funda',
    'higienopolis', 'anhangabau', 'minhocao', 'sao bento', 'copan', 'campos eliseos',
  ],
  'paulista-ibirapuera': [
    'paulista', 'ibirapuera', 'ibira', 'jardins', 'jardim paulista', 'vila mariana', 'moema',
    'paraiso', 'cerqueira cesar', 'augusta', 'oscar freire', 'vila olimpia',
  ],
};

function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/r\$\s*/g, 'r$ ')
    .replace(/[^a-z0-9$ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tem = (t, re) => re.test(t);
const numero = (s) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s]);

function grupoDe(n) {
  if (!n || n < 1) return undefined;
  if (n === 1) return 'so';
  if (n === 2) return 'casal';
  if (n <= 5) return 'amigos';
  return 'turma';
}

function precoDeValor(v) {
  if (v === 0) return 0;
  if (v <= 84) return 1; // nunca passa do que a pessoa disse: até 80 fica em "até R$ 50"
  if (v <= 150) return 2;
  return 3;
}

function lerQuando(t) {
  if (tem(t, /\b(sexta|sex|sextou)\b/)) return 'sex-noite';
  if (tem(t, /\b(sabado|sab)\b/)) {
    if (tem(t, /\b(noite|noitinha|night|balada|jantar|janta)\b/)) return 'sab-noite';
    if (tem(t, /\b(dia|manha|tarde|almoco|almocar|cedo|brunch|cafe da manha)\b/)) return 'sab-dia';
    return undefined;
  }
  if (tem(t, /\b(domingo|dom)\b/)) return 'dom';
  return undefined;
}

function lerQuem(t, pergunta) {
  let m = t.match(new RegExp(`\\beu e mais ${NUM}\\b`));
  if (m) return grupoDe(numero(m[1]) + 1);
  m = t.match(new RegExp(`\\beu e ${NUM} (amigos|amigas|pessoas|colegas)\\b`));
  if (m) return grupoDe(numero(m[1]) + 1);
  m = t.match(new RegExp(`\\b(somos|seremos|sao|serao|vamos em|vai ser em|em|uns|umas|grupo de|turma de) ${NUM}\\b(?! reais| conto| pila)`));
  if (m && !/\b(ate|r\$)\s*$/.test(t.slice(0, m.index))) return grupoDe(numero(m[2]));
  m = t.match(new RegExp(`\\b${NUM} (pessoas|pessoa|amigos|amigas|de nos|colegas|cabecas)\\b`));
  if (m) return grupoDe(numero(m[1]));
  if (tem(t, /\beu e (a |o )?(minha|meu)? ?(namorada|namorado|esposa|marido|mulher|noiva|noivo|crush|date|mae|pai|amiga|amigo|irma|irmao|parceira|parceiro|companheira|companheiro)\b/)) return 'casal';
  if (tem(t, /\b(a dois|casal|nos dois|nos duas|date|encontro|romantico|romantica|eu e ela|eu e ele)\b/)) return 'casal';
  if (tem(t, /\b(sozinho|sozinha|so eu|eu so|so para mim|so pra mim)\b/) && !tem(t, /\bso eu e\b/)) return 'so';
  if (tem(t, /\b(galera|turma|todo mundo|grupao|grupo grande|firma|pessoal todo|time todo|familia toda)\b/)) return 'turma';
  if (tem(t, /\b(amigos|amigas|uns amigos|parca|parceiros|grupo)\b/)) return 'amigos';
  if (pergunta === 'quem') {
    m = t.match(new RegExp(`^${NUM}$`));
    if (m) return grupoDe(numero(m[1]));
  }
  return undefined;
}

function regiaoDe(t) {
  for (const regiao of REGIOES) {
    for (const nome of BAIRROS[regiao]) {
      if (new RegExp(`\\b${nome}\\b`).test(t)) return regiao;
    }
  }
  return undefined;
}

function lerRegiao(t, atuais, pergunta) {
  if (tem(t, /\b(outra regiao|outro lugar|outro bairro|outra area|outro canto|outro lado)\b/)) {
    const i = REGIOES.indexOf(atuais.regiao);
    if (i >= 0) return REGIOES[(i + 1) % REGIOES.length];
    return undefined;
  }
  const r = regiaoDe(t);
  if (r) return r;
  if (tem(t, /\b(qualquer lugar|qualquer regiao|qualquer bairro|tanto faz o lugar|tanto faz onde|onde for|qualquer canto)\b/)) return 'qualquer';
  if (pergunta === 'regiao' && tem(t, /\b(tanto faz|qualquer|tanto|nao sei|sei la|indiferente)\b/)) return 'qualquer';
  return undefined;
}

function lerPreco(t, atuais, pergunta) {
  if (tem(t, /\b(mais barato|mais em conta|mais economico|mais barata|menos caro|gastar menos)\b/)) {
    return Math.max(0, (atuais.preco === undefined ? 2 : atuais.preco) - 1);
  }
  if (tem(t, /\b(mais caro|gastar mais|pode ser mais caro|mais sofisticado)\b/)) {
    return Math.min(3, (atuais.preco === undefined ? 1 : atuais.preco) + 1);
  }
  if (tem(t, /\b(sem gastar muito|gastando pouco|pouco dinheiro)\b/)) return 1;
  if (tem(t, /\b(de graca|gratis|gratuito|gratuita|sem gastar|zero reais|sem grana|sem dinheiro|na faixa)\b/)) return 0;
  let m = t.match(/(?:\bate|\bno maximo|\bmaximo|\bteto|\bteto de|r\$|\borcamento de|\bgastar)\s+(\d{1,4})\b/);
  if (!m) m = t.match(/\b(\d{1,4})\s+(?:reais|conto|contos|pila|mangos|por pessoa|por cabeca|cada)\b/);
  if (m) return precoDeValor(Number(m[1]));
  if (tem(t, /\b(nada muito caro|nao muito caro|preco medio|preco normal|meio termo|moderado)\b/)) return 2;
  if (tem(t, /\b(barato|barata|baratinho|economico|em conta|liso|lisos|duro|apertado)\b/)) return 1;
  if (tem(t, /\b(sem limite|tanto faz o preco|pode gastar|caro|chique|sofisticado|ostentar|esbanjar)\b/)) return 3;
  if (pergunta === 'preco') {
    if (tem(t, /\b(tanto faz|qualquer|tanto|sei la)\b/)) return 3;
    m = t.match(/^(\d{1,4})$/);
    if (m) return precoDeValor(Number(m[1]));
  }
  return undefined;
}

function lerClima(t) {
  if (tem(t, /\b(comemorar|comemoracao|aniversario|niver|celebrar|festejar|despedida|formatura)\b/)) return 'comemorar';
  if (tem(t, /\b(animad[oa]s?|animacao|agitar|agito|agitad[oa]|dancar|balada|festa|pular|pista|mais animado)\b/)) return 'agitar';
  if (tem(t, /\b(conversar|conversa|papo|trocar ideia|bater um papo)\b/)) return 'conversar';
  if (tem(t, /\b(conhecer|descobrir|explorar|novidade|nunca fui|inedito|diferente|(algo|coisa|lugar) nov[oa])\b/)) return 'descobrir';
  if (tem(t, /\b(relaxar|relax|tranquil[oa]|calm[oa]|de boa|sossego|sossegad[oa]|descansar|leve|chill|suave)\b/)) return 'relaxar';
  return undefined;
}

function lerComida(t, pergunta) {
  if (tem(t, /\b(sem comer|sem comida|ja comemos|ja jantamos|ja almocamos|nao quero comer|nao vamos comer|nada de comida|depois do jantar|depois de comer|sem janta|sem jantar|so beber|so bebida|sem fome|barriga cheia|comida nao)\b/)) return 'hoje-nao';
  if (tem(t, /\b(tanto faz comer|pode ter comida|se tiver comida|beliscar|petisco|petiscos|comer alguma coisa|algo para comer|algo pra comer)\b/)) return 'pode';
  if (tem(t, /\b(jantar|jantinha|janta|almoco|almocar|comer bem|comer|comida boa|restaurante|brunch|rodizio|pizza|hamburguer|fome|gastronomi[ac]|comilanca|cafe da manha)\b/)) return 'centro';
  if (pergunta === 'comida' && tem(t, /\b(tanto faz|qualquer|tanto|talvez|pode ser)\b/)) return 'pode';
  if (pergunta === 'comida' && tem(t, /^(nao|hoje nao|nao precisa)$/)) return 'hoje-nao';
  return undefined;
}

function entender(texto, atuais = {}, pergunta) {
  const t = normalizar(texto || '');
  if (!t) return {};
  const r = {
    quando: lerQuando(t),
    quem: lerQuem(t, pergunta),
    regiao: lerRegiao(t, atuais || {}, pergunta),
    preco: lerPreco(t, atuais || {}, pergunta),
    clima: lerClima(t),
    comida: lerComida(t, pergunta),
  };
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return r;
}

module.exports = { entender, normalizar };

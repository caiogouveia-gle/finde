'use strict';
// "% a sua cara": quanto uma festa bate com o pedido, critério por critério.
// Puro e determinístico. Não escolhe nem ordena nada: o motor monta a lista
// e só acrescenta este campo em cada opção.
//
// Pesos: horário 30, idade 25, bairro 20, preço 15, som 10. Critério que a
// pessoa não pediu (nenhum som marcado, a cidade inteira, sem teto, idade de
// 18 a 50 ou mais) sai da conta, e os pesos dos outros se renormalizam.
// Crédito: cabe = 1; 'quase' = 0,5; não cabe = 0.
//
// Cada parte cabe numa linha do detalhe a 390 px (até umas 36 letras) quando
// cabe no pedido: o rótulo ao lado (cabe, quase, não cabe) já dá o veredito,
// e o texto diz só o fato e a referência.
//
// Horário e idade usam a régua do motor, para a parte nunca dizer o contrário
// do aviso da festa: cabe o que ele põe no pedido; 'quase', o que ele só aceita
// afrouxando (a pista até duas horas antes de você chegar, o fim até duas
// horas depois da sua volta; a média até 3 anos fora, o "um pouco" do aviso);
// o resto não cabe.

const C = require('./catalogo');
// O motor não carrega este arquivo no topo (carrega na hora de usar), então
// aqui ele já chega completo.
const M = require('./motor');

const PESOS = { horario: 30, idade: 25, bairro: 20, preco: 15, som: 10 };
const CRITERIOS = ['horario', 'idade', 'bairro', 'preco', 'som'];
const QUASE_ANOS = M.QUASE_NA_FAIXA;
// Preço "quase": até 20% acima do teto (conta em inteiros: acima × 5 ≤ teto).
const QUASE_PRECO_DIVISOR = 5;

const credito = (cabe) => (cabe === true ? 1 : cabe === 'quase' ? 0.5 : 0);

const HORAS = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze'];

// 0,5 -> "meia hora"; 1 -> "uma hora"; 1,5 -> "uma hora e meia"; 3 -> "três horas".
function emHoras(d) {
  const minutos = Math.round(d * 60);
  const h = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!h) return resto === 30 ? 'meia hora' : `${resto} min`;
  const nome = `${HORAS[h] || h} ${h === 1 ? 'hora' : 'horas'}`;
  if (!resto) return nome;
  return resto === 30 ? `${nome} e meia` : `${nome} e ${resto} min`;
}

// 1 -> "1 ano"; 5 -> "5 anos"; 2,5 -> "2,5 anos". Em algarismos, como a média
// e a linha da faixa no detalhe ("3 anos acima da sua faixa").
function emAnos(n) {
  return `${String(n).replace('.', ',')} ${n === 1 ? 'ano' : 'anos'}`;
}

// O som pelo rótulo inteiro do catálogo, como o bloco Som do detalhe:
// "house e disco", "pop anos 2000", "MPB e samba" (sigla fica em caixa alta).
function nomeDoSom(id) {
  const e = C.ESTILOS.find((x) => x.id === id);
  if (!e) return id;
  return /^\p{Lu}{2}/u.test(e.rotulo) ? e.rotulo : e.rotulo[0].toLocaleLowerCase('pt-BR') + e.rotulo.slice(1);
}

// ---------------------------------------------------------------- critérios
// Cada um devolve { cabe, texto }, ou null quando a pessoa não pediu.

// O horário: a mesma régua do motor (motor.furaHorario). Cabe o que ele põe no
// pedido, com a tolerância declarada (a pista pode encher até uma hora antes
// de você chegar); 'quase', o que ele só aceita abrindo o horário; o resto não
// cabe. Assim o aviso da festa e esta parte nunca discordam.
function horario(f, c) {
  const j = M.janelaPorId(c.janela);
  if (!j) return null;
  const cabe = !M.furaHorario(f, c) ? true : !M.furaHorario(f, c, M.TOLERANCIA_AFROUXADA) ? 'quase' : false;
  const comeca = `começa ${C.asHoras(f.inicio)}`;
  if (cabe !== true) return { cabe, texto: furoDoHorario(f, c, j) || `${comeca}, fora do seu horário` };
  if (f.inicio >= j.inicio) return { cabe, texto: `${comeca}, no seu horário` };
  // Começa antes de você chegar: o que conta é a pista cheia (a régua logo
  // acima mostra as duas horas).
  return { cabe, texto: f.esquenta >= j.inicio ? `enche ${C.asHoras(f.esquenta)}, no seu horário` : 'você chega com a pista cheia' };
}

// O que fura no horário, na ordem do aviso do motor e com quanto: cedo demais
// (enche antes de você chegar, ou acaba logo depois), tarde demais (enche ou
// começa perto da sua volta) e o fim depois da sua volta.
function furoDoHorario(f, c, j) {
  const volta = c.voltaMax ? Math.min(j.fim, c.voltaMax) : j.fim;
  const depoisDaVolta = (d) => (d ? `${emHoras(d)} depois da sua volta` : 'na hora da sua volta');
  const furos = [];
  if (f.fim < j.inicio + 2) {
    furos.push(f.fim <= j.inicio
      ? `acaba ${C.asHoras(f.fim)}, antes do seu horário`
      : `acaba ${C.asHoras(f.fim)}, só ${emHoras(f.fim - j.inicio)} depois que você chega`);
  } else if (f.esquenta < j.inicio - M.TOLERANCIA) {
    furos.push(`enche ${C.asHoras(f.esquenta)}, ${emHoras(j.inicio - f.esquenta)} antes do seu horário`);
  } else if (f.esquenta > j.fim - 1 || f.inicio > j.fim - 2) {
    if (f.esquenta >= volta) furos.push(`enche ${C.asHoras(f.esquenta)}, ${depoisDaVolta(f.esquenta - volta)}`);
    else if (f.esquenta > j.fim - 1) furos.push(`enche ${C.asHoras(f.esquenta)}, só ${emHoras(volta - f.esquenta)} antes da sua volta`);
    else furos.push(`começa ${C.asHoras(f.inicio)}, só ${emHoras(volta - f.inicio)} antes da sua volta`);
  }
  if (f.fim > volta && !(furos[0] || '').startsWith('acaba')) {
    furos.push(furos.length ? `acaba ${C.asHoras(f.fim)}` : `acaba ${C.asHoras(f.fim)}, ${depoisDaVolta(f.fim - volta)}`);
  }
  return furos.join(', e ');
}

// Média dentro da faixa = cabe; até 3 anos fora = quase (o "um pouco" do aviso
// do motor). O número da média não se repete aqui: no detalhe, ele está logo
// acima, com a origem; a parte diz só o encaixe, e quanto fura.
function idade(f, c) {
  if (c.idade && c.idade.min <= M.IDADE_MIN && c.idade.max >= M.IDADE_MAX) return null;
  const fx = M.faixaDe(c);
  if (!fx) return null;
  if (f.mediaIdade >= fx.min && f.mediaIdade <= fx.max) return { cabe: true, texto: 'média dentro da sua faixa' };
  const abaixo = f.mediaIdade < fx.min;
  const d = abaixo ? fx.min - f.mediaIdade : f.mediaIdade - fx.max;
  return {
    cabe: d <= QUASE_ANOS ? 'quase' : false,
    texto: `média ${emAnos(d)} ${abaixo ? 'abaixo' : 'acima'} da sua faixa`,
  };
}

// Bairro marcado = cabe; vizinho de um marcado (a mesma noção do motor) = quase.
function bairro(f, c) {
  if (!c.bairros || !c.bairros.length) return null;
  const b = C.BAIRROS[f.bairro];
  const onde = b ? b.em : `em ${f.bairro}`;
  const um = c.bairros.length === 1;
  if (c.bairros.includes(f.bairro)) return { cabe: true, texto: `${onde}, ${um ? 'como' : 'um dos que'} você marcou` };
  const perto = b && c.bairros
    .filter((x) => C.BAIRROS[x] && M.vizinho(x, f.bairro))
    .map((x) => [x, C.minutosEntre(x, f.bairro)])
    .sort((a, z) => a[1] - z[1] || c.bairros.indexOf(a[0]) - c.bairros.indexOf(z[0]))[0];
  if (perto) return { cabe: 'quase', texto: `${onde}, a ${perto[1]} min ${C.BAIRROS[perto[0]].de}` };
  const marcado = um && C.BAIRROS[c.bairros[0]];
  return { cabe: false, texto: `${onde}, longe ${marcado ? marcado.de : 'dos que você marcou'}` };
}

// Até o teto = cabe; até 20% acima = quase.
function preco(f, c) {
  if (c.teto === undefined || c.teto === null || c.teto === 'sem-limite') return null;
  const valor = C.reais(f.preco);
  if (c.teto === 0) {
    return f.preco === 0
      ? { cabe: true, texto: 'grátis, como você pediu' }
      : { cabe: false, texto: `${valor}, e você pediu só de graça` };
  }
  if (f.preco <= c.teto) {
    return { cabe: true, texto: `${valor}, ${f.preco === c.teto ? 'bem no seu teto' : 'abaixo do seu teto'}` };
  }
  const acima = f.preco - c.teto;
  return {
    cabe: acima * QUASE_PRECO_DIVISOR <= c.teto ? 'quase' : false,
    texto: `${valor}, R$ ${acima} acima do seu teto`,
  };
}

// Algum som pedido = cabe. Som só parecido não ganha crédito, mas diz que é
// parecido: nomeia o estilo da festa que mais lembra o pedido, e o som pedido
// que ele lembra.
function som(f, c) {
  if (!c.estilos || !c.estilos.length) return null;
  const um = c.estilos.length === 1;
  const casou = f.estilos.find((e) => c.estilos.includes(e));
  if (casou) return { cabe: true, texto: `${nomeDoSom(casou)}, ${um ? 'como' : 'um dos que'} você pediu` };
  const afinidade = (p, e) => (C.AFINIDADE[p] || {})[e] || 0;
  const lembra = (e) => Math.max(0, ...c.estilos.map((p) => afinidade(p, e)));
  const maisPerto = f.estilos.reduce((a, e) => (lembra(e) > lembra(a) ? e : a), f.estilos[0]);
  if (lembra(maisPerto) > 0) {
    const pedido = c.estilos.reduce((a, p) => (afinidade(p, maisPerto) > afinidade(a, maisPerto) ? p : a), c.estilos[0]);
    return { cabe: false, texto: `${nomeDoSom(maisPerto)}, parecido com ${nomeDoSom(pedido)}` };
  }
  return { cabe: false, texto: `${nomeDoSom(maisPerto)}, fora ${um ? 'do que' : 'dos que'} você pediu` };
}

const AVALIAR = { horario, idade, bairro, preco, som };

// cara(festa, criteriosCompletos) -> { pct, partes: [{ criterio, cabe, texto }] } | null
// null só quando nada foi pedido (não acontece numa lista do motor: a janela é obrigatória).
function cara(f, c) {
  const partes = [];
  let soma = 0;
  let pesos = 0;
  for (const criterio of CRITERIOS) {
    const r = AVALIAR[criterio](f, c);
    if (!r) continue;
    partes.push({ criterio, cabe: r.cabe, texto: r.texto });
    pesos += PESOS[criterio];
    soma += PESOS[criterio] * credito(r.cabe);
  }
  if (!pesos) return null;
  const pct = Math.max(0, Math.min(100, Math.round((soma * 100) / pesos)));
  return { pct, partes };
}

module.exports = { cara, PESOS, CRITERIOS, emHoras, emAnos, nomeDoSom };

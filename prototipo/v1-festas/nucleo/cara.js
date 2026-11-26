'use strict';
// "% a sua cara": quanto uma festa bate com o pedido, critério por critério.
// Puro e determinístico. Não escolhe nem ordena nada: o motor monta a lista
// e só acrescenta este campo em cada opção.
//
// Pesos: horário 30, bairro 20, preço 15, som 10. A idade (25) saiu em
// 26/11/2026, até a idade do público ser validada. Critério que a pessoa não
// pediu (nenhum som marcado, a cidade inteira, sem teto) sai da conta, e os
// pesos dos outros se renormalizam.
// Crédito: cabe = 1; 'quase' = 0,5; não cabe = 0. Uma exceção (KTD15, U27),
// com o crédito na própria parte: o som parecido vale 0,5 + 0,4 × afinidade
// (quem tem o dado nunca fica abaixo de quem não tem).
//
// Cada parte cabe numa linha do detalhe a 390 px (até umas 36 letras) quando
// cabe no pedido: o rótulo ao lado (cabe, quase, não cabe) já dá o veredito,
// e o texto diz só o fato e a referência.
//
// O horário usa a régua do motor, para a parte nunca dizer o contrário do
// aviso da festa: cabe o que ele põe no pedido; 'quase', o que ele só aceita
// afrouxando (a pista até duas horas antes de você chegar, o fim até duas
// horas depois da sua volta); o resto não cabe.

const C = require('./catalogo');
// O motor não carrega este arquivo no topo (carrega na hora de usar), então
// aqui ele já chega completo.
const M = require('./motor');

const PESOS = { horario: 30, bairro: 20, preco: 15, som: 10 };
const CRITERIOS = ['horario', 'bairro', 'preco', 'som'];
// Preço "quase": até 20% acima do teto (conta em inteiros: acima × 5 ≤ teto).
const QUASE_PRECO_DIVISOR = 5;

// Festa real pode não ter o dado de um critério pedido (o bairro, o preço,
// o som). Esse critério entra nas partes com cabe: null ("não se sabe")
// e conta pela metade, como um 'quase': tirá-lo da conta dava 100% a festa que
// só se sabe o horário, e contar zero puniria a festa pelo que a fonte não
// disse. Assim, festa com dado faltando nunca chega a 100%.
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const creditoPadrao = (cabe) => (cabe === true ? 1 : cabe === 'quase' || cabe === null ? 0.5 : 0);
const credito = (r) => (num(r.credito) ? r.credito : creditoPadrao(r.cabe));

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
  // Festa real sem início: não se sabe, conta a metade.
  if (M.semInicio(f)) return { cabe: null, texto: 'horário não divulgado' };
  const cabe = !M.furaHorario(f, c) ? true : !M.furaHorario(f, c, M.TOLERANCIA_AFROUXADA) ? 'quase' : false;
  const comeca = `começa ${C.asHoras(f.inicio)}`;
  if (cabe !== true) return { cabe, texto: furoDoHorario(f, c, j) || `${comeca}, fora do seu horário` };
  if (f.inicio >= j.inicio) return { cabe, texto: `${comeca}, no seu horário` };
  // Sem a pista cheia: começa até uma hora antes de você chegar.
  if (!num(f.esquenta)) return { cabe, texto: `${comeca}, perto do seu horário` };
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
  // Sem a pista cheia, a chegada é o começo; sem o fim, a régua do fim não fala.
  const temFim = num(f.fim);
  const chega = num(f.esquenta) ? f.esquenta : f.inicio;
  const enche = num(f.esquenta) ? 'enche' : 'começa';
  if (temFim && f.fim < j.inicio + 2) {
    furos.push(f.fim <= j.inicio
      ? `acaba ${C.asHoras(f.fim)}, antes do seu horário`
      : `acaba ${C.asHoras(f.fim)}, só ${emHoras(f.fim - j.inicio)} depois que você chega`);
  } else if (chega < j.inicio - M.TOLERANCIA) {
    furos.push(`${enche} ${C.asHoras(chega)}, ${emHoras(j.inicio - chega)} antes do seu horário`);
  } else if (chega > j.fim - 1 || f.inicio > j.fim - 2) {
    if (chega >= volta) furos.push(`${enche} ${C.asHoras(chega)}, ${depoisDaVolta(chega - volta)}`);
    else if (chega > j.fim - 1) furos.push(`${enche} ${C.asHoras(chega)}, só ${emHoras(volta - chega)} antes da sua volta`);
    else furos.push(`começa ${C.asHoras(f.inicio)}, só ${emHoras(volta - f.inicio)} antes da sua volta`);
  }
  if (M.fimLimita(f) && f.fim > volta && !(furos[0] || '').startsWith('acaba')) {
    furos.push(furos.length ? `acaba ${C.asHoras(f.fim)}` : `acaba ${C.asHoras(f.fim)}, ${depoisDaVolta(f.fim - volta)}`);
  }
  return furos.join(', e ');
}

// Bairro marcado = cabe; vizinho de um marcado (a mesma noção do motor) = quase.
// A real com coordenada mede em linha reta (R29): vizinha até 3 km, com os km.
function bairro(f, c) {
  if (!c.bairros || !c.bairros.length) return null;
  const km = M.maisPerto(f, c);
  if (!f.bairro && !km) return { cabe: null, texto: 'bairro não informado' };
  const b = f.bairro ? C.BAIRROS[f.bairro] : null;
  const onde = b ? b.em : f.bairro ? `em ${f.bairro}` : 'no endereço divulgado';
  const um = c.bairros.length === 1;
  if (f.bairro && c.bairros.includes(f.bairro)) return { cabe: true, texto: `${onde}, ${um ? 'como' : 'um dos que'} você marcou` };
  if (km && M.lugar(f, c) === 'perto') return { cabe: 'quase', texto: `${onde}, a ${M.emKm(km.km)} ${km.de}` };
  if (!f.bairro) return { cabe: false, texto: `a ${M.emKm(km.km)} ${km.de}` };
  const perto = b && c.bairros
    .filter((x) => C.BAIRROS[x] && M.vizinho(x, f.bairro))
    .map((x) => [x, C.minutosEntre(x, f.bairro)])
    .sort((a, z) => a[1] - z[1] || c.bairros.indexOf(a[0]) - c.bairros.indexOf(z[0]))[0];
  // A tabela de minutos é só das fictícias (R29); a real sem coordenada diz a região.
  if (perto && f.real === true) return { cabe: 'quase', texto: `${onde}, na região ${C.BAIRROS[perto[0]].de}` };
  if (perto) return { cabe: 'quase', texto: `${onde}, a ${perto[1]} min ${C.BAIRROS[perto[0]].de}` };
  const marcado = um && C.BAIRROS[c.bairros[0]];
  return { cabe: false, texto: `${onde}, longe ${marcado ? marcado.de : 'dos que você marcou'}` };
}

// Até o teto = cabe; até 20% acima = quase.
function preco(f, c) {
  if (c.teto === undefined || c.teto === null || c.teto === 'sem-limite') return null;
  if (!num(f.preco)) return { cabe: null, texto: 'preço não informado' };
  // O preço de quem chega no começo da janela (lote com hora vencida não vale).
  const pago = M.precoPara(f, c);
  const valor = C.reais(pago);
  if (c.teto === 0) {
    return pago === 0
      ? { cabe: true, texto: 'grátis, como você pediu' }
      : { cabe: false, texto: `${valor}, e você pediu só de graça` };
  }
  if (pago <= c.teto) {
    return { cabe: true, texto: `${valor}, ${pago === c.teto ? 'bem no seu teto' : 'abaixo do seu teto'}` };
  }
  const acima = Math.round((pago - c.teto) * 100) / 100;
  return {
    cabe: acima * QUASE_PRECO_DIVISOR <= c.teto ? 'quase' : false,
    texto: `${valor}, ${C.reais(acima)} acima do seu teto`,
  };
}

// Algum som pedido = cabe. Som só parecido não ganha crédito, mas diz que é
// parecido: nomeia o estilo da festa que mais lembra o pedido, e o som pedido
// que ele lembra.
function som(f, c) {
  if (!c.estilos || !c.estilos.length) return null;
  if (!f.estilos || !f.estilos.length) return { cabe: null, texto: 'som não informado' };
  const um = c.estilos.length === 1;
  const casou = f.estilos.find((e) => c.estilos.includes(e));
  // Estilo lido da descrição (regras ou Claude), não dito pela página: "parece".
  const parece = f.estilosInferidos === true ? 'parece ' : '';
  if (casou) return { cabe: true, texto: `${parece}${nomeDoSom(casou)}, ${um ? 'como' : 'um dos que'} você pediu` };
  const afinidade = (p, e) => (C.AFINIDADE[p] || {})[e] || 0;
  const lembra = (e) => Math.max(0, ...c.estilos.map((p) => afinidade(p, e)));
  const maisPerto = f.estilos.reduce((a, e) => (lembra(e) > lembra(a) ? e : a), f.estilos[0]);
  if (lembra(maisPerto) > 0) {
    const pedido = c.estilos.reduce((a, p) => (afinidade(p, maisPerto) > afinidade(a, maisPerto) ? p : a), c.estilos[0]);
    // Parecido vale 0,5 + 0,4 × afinidade: nunca abaixo de quem não diz o som.
    return { cabe: 'quase', credito: Math.round((0.5 + 0.4 * lembra(maisPerto)) * 100) / 100, texto: `${parece}${nomeDoSom(maisPerto)}, parecido com ${nomeDoSom(pedido)}` };
  }
  return { cabe: false, texto: `${parece}${nomeDoSom(maisPerto)}, fora ${um ? 'do que' : 'dos que'} você pediu` };
}

const AVALIAR = { horario, bairro, preco, som };

// cara(festa, criteriosCompletos) -> { pct, partes: [{ criterio, cabe, texto }], semDado? } | null
// null só quando nada foi pedido (não acontece numa lista do motor: a janela é obrigatória).
// semDado: os critérios pedidos que a festa não informa (contam pela metade).
// pct null quando a festa não informa nenhum critério pedido.
function cara(f, c) {
  const partes = [];
  const semDado = [];
  let soma = 0;
  let pesos = 0;
  let conhecidos = 0;
  for (const criterio of CRITERIOS) {
    const r = AVALIAR[criterio](f, c);
    if (!r) continue;
    const parte = { criterio, cabe: r.cabe, texto: r.texto };
    if (num(r.credito)) parte.credito = r.credito;
    partes.push(parte);
    if (r.cabe === null) semDado.push(criterio);
    else conhecidos += 1;
    pesos += PESOS[criterio];
    soma += PESOS[criterio] * credito(r);
  }
  if (!pesos) return null;
  if (!conhecidos) return { pct: null, partes, semDado };
  // Arredonda para baixo quando falta dado: 99,5 não vira 100.
  const bruto = (soma * 100) / pesos;
  const pct = Math.max(0, Math.min(semDado.length ? 99 : 100, Math.round(bruto)));
  return semDado.length ? { pct, partes, semDado } : { pct, partes };
}

module.exports = { cara, PESOS, CRITERIOS, emHoras, nomeDoSom, credito };

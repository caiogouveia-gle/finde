'use strict';
// O recorte da lista (KTD15 do plano de 24/11/2026): o "hoje" em São Paulo,
// as datas de cada dia pedido, as reais que valem, a mistura com as fictícias
// e, a partir da U26, o resultado inteiro (até 3 recomendadas, as demais do
// dia, os outros dias da semana e os exemplos só sem real). Puro: o relógio
// entra como argumento.
//
// A fundação (U4) trouxe para cá o que estava em reais.js (vigentes, passou,
// datasDoDia, reaisDoDia, quandoDaReal, misturar, notaDaMistura e as datas),
// que reais.js reexporta. A U26 deu comportamento ao pedido novo: o dia é
// "hoje" ou de quinta a domingo, em "esta" semana ou na "proxima"
// (datasDoPedido); a lista recomenda até 3 reais e deixa as outras do dia em
// maisDoDia (montarResultado); resultadoDoPedido junta tudo com o motor.
//
// A semana vai de segunda a domingo: na terça, "esta" é de quinta a domingo
// que vêm; no sábado, "esta" já não tem quinta nem sexta. "proxima" é a
// semana seguinte inteira, de quinta a domingo.

const C = require('./catalogo');

const FUSO = 'America/Sao_Paulo';
const NUMERO_DO_DIA = { sex: 5, sab: 6, dom: 0 };
// A posição de cada dia do pedido na semana que começa na segunda (seg = 1).
const POSICAO_NA_SEMANA = { qui: 4, sex: 5, sab: 6, dom: 7 };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const numero = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------- datas

// "2026-11-19": a data de hoje em São Paulo, no instante dado.
function hojeEmSaoPaulo(agoraMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agoraMs));
}

// A noite de hoje em São Paulo: o mesmo corte das 6h de quandoDaReal. Antes
// das 6h, a noite ainda é a da véspera (à 1h30 de sábado, a festa de sexta
// que segue rolando é "hoje"). É o "hoje" do pedido, do formulário e dos
// outros dias; o calendário puro fica em hojeEmSaoPaulo.
const CORTE_DA_NOITE_H = 6;
function noiteEmSaoPaulo(agoraMs) {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' }).format(new Date(agoraMs)));
  const hoje = hojeEmSaoPaulo(agoraMs);
  return hora < CORTE_DA_NOITE_H ? somarDias(hoje, -1) : hoje;
}

// O dia da semana de uma data AAAA-MM-DD (o calendário, sem fuso).
const diaDaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();

function somarDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "2026-11-28" -> "28 nov".
function dataCurta(data) {
  const [, m, d] = data.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

// ---------------------------------------------------------------- o relógio

// Passou quando acabou: o fim informado, ou, sem ele, as 6h do dia seguinte
// (quandoDaReal). É a mesma régua do convite: depois da meia-noite, a festa
// que ainda rola segue na lista, no link e no convite.
const passou = (f, agoraMs) => agoraMs > Date.parse(quandoDaReal(f).ate);

// Só o que não passou.
function vigentes(festas, agoraMs) {
  return festas.filter((f) => !passou(f, agoraMs));
}

// A próxima ocorrência do dia pedido (hoje conta) e a da semana seguinte.
function datasDoDia(dia, agoraMs) {
  const hoje = hojeEmSaoPaulo(agoraMs);
  const alvo = NUMERO_DO_DIA[dia];
  if (alvo === undefined) return [];
  const faltam = (alvo - diaDaSemana(hoje) + 7) % 7;
  const primeira = somarDias(hoje, faltam);
  return [primeira, somarDias(primeira, 7)];
}

// As reais do dia pedido: as da próxima ocorrência dele; se ela não tem
// nenhuma, as da seguinte, dizendo que são da outra semana (`distante`).
function reaisDoDia(festas, dia, agoraMs) {
  const [primeira, seguinte] = datasDoDia(dia, agoraMs);
  const daqui = vigentes(festas, agoraMs);
  const naPrimeira = daqui.filter((f) => f.data === primeira);
  if (naPrimeira.length) return { festas: naPrimeira, data: primeira, distante: false, proxima: primeira };
  const naSeguinte = daqui.filter((f) => f.data === seguinte);
  if (naSeguinte.length) return { festas: naSeguinte, data: seguinte, distante: true, proxima: primeira };
  return { festas: [], data: null, distante: false, proxima: primeira };
}

// O fim da festa para o convite (R13, `passou`): o fim informado, ou, sem
// ele, as 6h do dia seguinte. Em ISO de São Paulo.
function quandoDaReal(f) {
  const horas = numero(f.fim) ? f.fim : 30;
  const ate = new Date(Date.parse(`${f.data}T00:00:00-03:00`) + horas * 3600e3).toISOString();
  return { data: f.data, ate };
}

// ---------------------------------------------------------------- a mistura

// misturar({ real, ficticio, dia, data, distante }) -> o resultado da lista.
//   real, ficticio: o que o motor devolveu para cada base (escolher()).
// Real primeiro, na ordem do motor; a lista se completa com as fictícias até
// três, cada uma com `exemplo: true`. O título conta o que cabe no pedido,
// real ou exemplo (cada exemplo vem marcado). A nota diz o que é real e o que
// é exemplo.
function misturar({ real, ficticio, dia, data = null, distante = false, noDia = null, quantas = 3 }) {
  const reais = (real && real.opcoes ? real.opcoes : []).slice(0, quantas)
    .map((o) => ({ ...o, exemplo: false, dataDistante: distante }));
  const vaga = quantas - reais.length;
  const exemplos = (ficticio && ficticio.opcoes ? ficticio.opcoes : []).slice(0, Math.max(0, vaga))
    .map((o) => ({ ...o, exemplo: true }));
  // Dentro de cada parte, a ordem dos blocos do motor fica como veio.
  const opcoes = [...reais, ...exemplos];
  const comReal = reais.length > 0;
  const fonte = comReal ? real : ficticio;
  const blocos = { ...((ficticio && ficticio.blocos) || {}), ...((real && real.blocos) || {}) };
  const atende = (o) => o.atende && o.bloco === 'pedido';
  const resultado = {
    opcoes,
    atendem: opcoes.filter((o) => o.atende).length,
    afrouxou: [...new Set([...(comReal ? real.afrouxou || [] : []), ...(exemplos.length ? ficticio.afrouxou || [] : [])])],
    casam: opcoes.filter((o) => o.casaComEstilo).length,
    noPedido: opcoes.filter(atende).length,
    blocos,
    misto: true,
    reais: reais.length,
    exemplos: exemplos.length,
    dataReal: comReal ? data : null,
  };
  // O aviso do motor vale para a parte que manda na lista. Quando nenhuma
  // real cabe inteira, o aviso dela ("Seguem as mais perto.") sai, e a nota
  // diz isso com as palavras certas.
  // Quando todas as reais cabem, o aviso delas ("Só uma cabe nesse pedido.")
  // contaria só as reais e desmentiria os exemplos que também cabem: sai, e
  // a nota diz quantas reais cabem.
  const cabem = reais.filter((o) => o.atende).length;
  const avisoDasReais = comReal && cabem > 0 && cabem < reais.length;
  if (fonte && fonte.aviso && (!comReal || avisoDasReais || !exemplos.length)) resultado.aviso = fonte.aviso;
  if (!opcoes.length && ficticio && ficticio.oferta) resultado.oferta = ficticio.oferta;
  const semRealNoDia = noDia === null ? !reais.length : noDia === 0;
  resultado.nota = notaDaMistura({ reais: reais.length, cabem, exemplos: exemplos.length, dia, data, distante, semRealNoDia });
  return resultado;
}

// O que é real e o que é exemplo, numa frase ou duas, na voz do Finde.
// semRealNoDia: nenhuma festa real nas duas próximas datas do dia pedido
// (e não "nenhuma cabe").
function notaDaMistura({ reais, cabem = reais, exemplos, dia, data, distante, semRealNoDia = !reais }) {
  const nesse = C.nesteDia(dia);
  const no = C.noDia(dia);
  const partes = [];
  if (reais && distante && data) {
    partes.push(`${nesse} ainda não tenho festa real; ${reais === 1 ? 'a de cima é' : 'as de cima são'} de ${dataCurta(data)}.`);
  }
  const completei = exemplos === 1 ? 'um exemplo' : 'exemplos';
  if (reais && !cabem) partes.push(reais === 1 ? 'A real não cabe inteira: ela diz o que falta.' : 'Nenhuma real cabe inteira: cada uma diz o que falta.');
  if (reais && cabem === reais && exemplos) {
    partes.push(`${cabem === 1 ? 'Uma festa real cabe' : `${cabem === 2 ? 'Duas' : 'Três'} festas reais cabem`} nesse pedido; completei com ${completei}.`);
  } else if (!reais && exemplos) {
    partes.push(semRealNoDia
      ? `Ainda não tenho festa real ${no}. Seguem exemplos, festas fictícias.`
      : 'Nenhuma festa real cabe nesse pedido. Seguem exemplos, festas fictícias.');
  } else if (reais && exemplos) partes.push(`Completei com ${completei}.`);
  return partes.length ? partes.join(' ') : null;
}

// ---------------------------------------------------------------- o pedido (U26)

// A data da noite da festa: a do /3 (dataDaNoite) ou a data do /2.
const dataDe = (f) => (f && (f.dataDaNoite || f.data)) || null;
const NUMERAL = ['Nenhuma', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez'];
const numeral = (n) => NUMERAL[n] || String(n);

// A segunda-feira da semana de uma data (a semana vai de segunda a domingo).
function segundaDaSemana(data) {
  const d = diaDaSemana(data);
  return somarDias(data, 1 - (d === 0 ? 7 : d));
}

// O id do dia da semana de uma data: 'seg' ... 'dom'.
const idDoDia = (data) => C.DIAS_DA_SEMANA[diaDaSemana(data)];

// datasDoPedido(dia, semana, agoraMs) -> ['AAAA-MM-DD'] ou []
// dia: 'hoje' | 'qui' | 'sex' | 'sab' | 'dom'; semana: 'esta' | 'proxima'.
// "hoje" é a noite de hoje em São Paulo (qualquer dia da semana; antes das
// 6h, a da véspera: noiteEmSaoPaulo). Em "esta",
// o dia que já passou sai ([]); num dia de quinta a domingo, o dia de hoje é
// ele mesmo. "proxima" é o mesmo dia na semana seguinte.
function datasDoPedido(dia, semana = 'esta', agoraMs = Date.now()) {
  const hoje = noiteEmSaoPaulo(agoraMs);
  if (dia === 'hoje') return [hoje];
  const pos = POSICAO_NA_SEMANA[dia];
  if (!pos) return [];
  const data = somarDias(segundaDaSemana(hoje), pos - 1 + (semana === 'proxima' ? 7 : 0));
  if (semana !== 'proxima' && data < hoje) return [];
  return [data];
}

// reaisDoPedido(festas, criterios, agoraMs) -> { festas, datas }
// As reais vigentes da data do pedido (pela noite da festa), esgotadas junto
// (quem monta a lista as põe no fim).
function reaisDoPedido(festas, criterios = {}, agoraMs = Date.now()) {
  const datas = datasDoPedido(criterios.dia, criterios.semana || 'esta', agoraMs);
  return { festas: vigentes(festas || [], agoraMs).filter((f) => datas.includes(dataDe(f))), datas };
}

// pedidoDaData('AAAA-MM-DD', agoraMs) -> { dia, semana } | null
// A data dita na conversa ("dia 5") no vocabulário do pedido: hoje, ou de
// quinta a domingo desta semana ou da próxima. Fora disso, null.
function pedidoDaData(data, agoraMs = Date.now()) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const id = idDoDia(data);
  for (const semana of ['esta', 'proxima']) {
    if (POSICAO_NA_SEMANA[id] && datasDoPedido(id, semana, agoraMs)[0] === data) return { dia: id, semana };
  }
  if (data === noiteEmSaoPaulo(agoraMs)) return { dia: 'hoje', semana: 'esta' };
  return null;
}

// dataDoDiaDoMes(5, agoraMs) -> '2026-12-05': o próximo dia 5 a partir de
// hoje (hoje conta). null quando o mês seguinte também não tem esse dia.
function dataDoDiaDoMes(n, agoraMs = Date.now()) {
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  const [a, m, d] = noiteEmSaoPaulo(agoraMs).split('-').map(Number);
  const existe = (ano, mes) => n <= new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mesQueVem = m === 12 ? [a + 1, 1] : [a, m + 1];
  const [ano, mes] = n >= d && existe(a, m) ? [a, m] : existe(...mesQueVem) ? mesQueVem : [null, null];
  if (!ano) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
}

// opcoesDeDia(festas, agoraMs, semana) -> [{ id, data, rotulo, curto, hoje, reais }]
// As opções de "Sair quando?" (R24) com a data e o número de reais de cada
// uma. Em "esta", os dias que já passaram saem; num dia de quinta a domingo,
// a opção do dia vira "Hoje, sexta" (id do dia, hoje: true) e "Hoje" não se
// repete; "Hoje" com 0 reais vai para o fim. "proxima" não tem "Hoje".
function opcoesDeDia(festas, agoraMs = Date.now(), semana = 'esta') {
  const hoje = noiteEmSaoPaulo(agoraMs);
  const daqui = vigentes(festas || [], agoraMs);
  const conta = (data) => daqui.filter((f) => dataDe(f) === data).length;
  const opcoes = [];
  for (const id of C.DIAS_DA_SEMANA_DO_PEDIDO) {
    const [data] = datasDoPedido(id, semana, agoraMs);
    if (!data) continue;
    const eHoje = data === hoje;
    const nome = C.DIAS[id].nome;
    opcoes.push({
      id, data, hoje: eHoje, reais: conta(data),
      rotulo: eHoje ? `Hoje, ${C.DIAS[id].frase}` : `${nome}, ${dataCurta(data)}`,
      curto: eHoje ? 'Hoje' : C.DIAS[id].curto,
    });
  }
  if (semana !== 'proxima' && !opcoes.some((o) => o.hoje)) {
    const h = { id: 'hoje', data: hoje, hoje: true, reais: conta(hoje), rotulo: 'Hoje', curto: 'Hoje' };
    if (h.reais) opcoes.unshift(h);
    else opcoes.push(h);
  }
  return opcoes;
}

// outrosDiasDe(festas, criterios, agoraMs) -> [{ dia, data, reais }]
// As reais dos outros dias de quinta a domingo da mesma semana (KTD15), sem
// os que já passaram e sem a data pedida.
function outrosDiasDe(festas, criterios = {}, agoraMs = Date.now()) {
  const semana = criterios.dia === 'hoje' ? 'esta' : criterios.semana || 'esta';
  const [pedida] = datasDoPedido(criterios.dia, semana, agoraMs);
  const daqui = vigentes(festas || [], agoraMs);
  const outros = [];
  for (const dia of C.DIAS_DA_SEMANA_DO_PEDIDO) {
    const [data] = datasDoPedido(dia, semana, agoraMs);
    if (!data || data === pedida) continue;
    outros.push({ dia, data, reais: daqui.filter((f) => dataDe(f) === data).length });
  }
  return outros;
}

// A opção como a lista a devolve: real com pct, distância e porquê; fictícia
// marcada como exemplo, sem pct e sem cara (D11).
function comoReal(o, data) {
  const pct = o.cara && typeof o.cara.pct === 'number' ? o.cara.pct : (typeof o.pct === 'number' ? o.pct : null);
  return { ...o, exemplo: false, data: dataDe(o.festa) || data || null, pct };
}
function comoExemplo(o, data) {
  const x = { ...o, exemplo: true, data: o.data || data || null };
  delete x.pct;
  delete x.cara;
  if (!('distanciaKm' in x)) x.distanciaKm = null;
  return x;
}

// A festa tem dado de idade: a média ou a avaliação de quem foi.
const temMedia = (f) => Boolean(f) && ((typeof f.mediaIdade === 'number' && Number.isFinite(f.mediaIdade)) || Boolean(f.avaliacaoIdade));

// O título começa pelo que existe (R25): "Duas festas pro seu sábado.";
// sem real no dia, diz isso e marca os exemplos à parte.
function notaDoResultado({ reais, cabem, exemplos, dia }) {
  if (reais) {
    const titulo = `${numeral(reais)} ${reais === 1 ? 'festa' : 'festas'} ${C.proSeuDia(dia)}.`;
    if (!cabem) return `${titulo} ${reais === 1 ? 'Ela não cabe inteira no pedido: diz o que falta.' : 'Nenhuma cabe inteira no pedido: cada uma diz o que falta.'}`;
    return titulo;
  }
  const no = C.noDia(dia);
  return exemplos ? `Ainda não tenho festa real ${no}. Seguem exemplos, festas fictícias.` : `Ainda não tenho festa real ${no}.`;
}

// montarResultado({ real, ficticio, maisDoDia, outrosDias, criterios, data, base })
//   -> { opcoes, maisDoDia, outrosDias, exemplos, aviso, nota, base, semMedia }
// a forma de teste/dados/resposta-festas-r14-3.json (comReais e semReais).
//   real, ficticio: o que o motor devolveu (escolher) para as reais do dia e
//     para a base fictícia; maisDoDia: as outras reais do dia, já na ordem do
//     motor (ordenarTodas), esgotadas no fim; outrosDias: outrosDiasDe.
// Até 3 recomendadas; as que o motor devolver além disso descem para
// maisDoDia. Esgotada nunca fica entre as 3 (desce, marcada). Fictícias só
// quando o dia não tem real nenhuma, abaixo, com exemplo: true e sem pct.
// semMedia: nenhuma real da resposta tem média (D3, a linha única).
function montarResultado({ real = null, ficticio = null, maisDoDia = [], outrosDias = [], criterios = {}, data = null, base = null } = {}) {
  const doMotor = (real && real.opcoes ? real.opcoes : []).map((o) => comoReal(o, data));
  const esgotada = (o) => o.esgotada === true || (o.festa && o.festa.esgotado === true);
  const opcoes = doMotor.filter((o) => !esgotada(o)).slice(0, 3);
  const ids = new Set(opcoes.map((o) => o.festa && o.festa.id));
  const resto = [...doMotor.filter((o) => !ids.has(o.festa && o.festa.id)), ...(maisDoDia || []).map((o) => comoReal(o, data))];
  const vistos = new Set(ids);
  const unicas = resto.filter((o) => {
    const id = o.festa && o.festa.id;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  const mais = [...unicas.filter((o) => !esgotada(o)), ...unicas.filter(esgotada).map((o) => ({ ...o, esgotada: true }))];
  const reais = [...opcoes, ...mais];
  const semReal = reais.length === 0;
  const exemplos = semReal ? (ficticio && ficticio.opcoes ? ficticio.opcoes : []).map((o) => comoExemplo(o, data)) : [];
  let aviso = (semReal ? ficticio && ficticio.aviso : real && real.aviso) || null;
  // Nenhuma real cabe nem afrouxando, mas o dia tem real: o aviso do motor
  // ofereceria outro dia sem dizer que elas estão logo abaixo.
  if (!semReal && !opcoes.length) {
    aviso = mais.length === 1
      ? `Nada cabe nesse pedido. Segue a festa real ${C.noDia(criterios.dia)}, com o que falta.`
      : `Nada cabe nesse pedido. Seguem as ${mais.length} reais ${C.noDia(criterios.dia)}, cada uma com o que falta.`;
  }
  const cabem = opcoes.filter((o) => o.atende).length;
  return {
    opcoes,
    maisDoDia: mais,
    outrosDias: outrosDias || [],
    exemplos,
    aviso,
    nota: notaDoResultado({ reais: reais.length, cabem, exemplos: exemplos.length, dia: criterios.dia }),
    base: base || null,
    semMedia: reais.every((o) => !temMedia(o.festa)),
  };
}

// resultadoDoPedido({ reais, ficticias, criterios, agoraMs, base }) -> o
// resultado de montarResultado, mais o que a conversa usa (oferta, casam,
// afrouxou, blocos, atendem, noPedido, reais, dataReal).
//   reais: as festas reais convertidas (nucleo/reais.js); ficticias: a base
//   fictícia; criterios: os do pedido (motor.completar); base: o resumo da
//   base para "Atualizado há…" ({ atualizadoEm, total, perfis, sites }).
// As reais da data pedida, menos as recusadas de propósito: o motor escolhe
// até 3 entre as que não esgotaram e as outras descem para maisDoDia na
// ordem dele. As fictícias só entram quando a data não tem real nenhuma; em
// "hoje", só as do dia da semana de hoje.
function resultadoDoPedido({ reais = [], ficticias = [], criterios, agoraMs = Date.now(), base = null } = {}) {
  // Carrega na hora: o motor não depende da lista, e assim nada fecha ciclo.
  const M = require('./motor');
  const c = M.completar(M.sanearCriterios(criterios));
  const [data = null] = datasDoPedido(c.dia, c.semana, agoraMs);
  const { festas } = reaisDoPedido(reais, c, agoraMs);
  const doDia = festas.filter((f) => !M.barrada(f, c));
  const abertas = doDia.filter((f) => f.esgotado !== true);
  const esgotadas = doDia.filter((f) => f.esgotado === true);
  const real = abertas.length ? M.escolher(c, abertas) : null;
  const escolhidas = new Set(real ? real.opcoes.map((o) => o.festa.id) : []);
  const maisDoDia = [
    ...M.ordenarTodas(c, abertas.filter((f) => !escolhidas.has(f.id))),
    ...M.ordenarTodas(c, esgotadas),
  ];
  let ficticio = null;
  if (!festas.length && ficticias && ficticias.length) {
    const doHoje = c.dia === 'hoje' && data ? ficticias.filter((f) => f.dia === idDoDia(data)) : ficticias;
    ficticio = M.escolher(c, doHoje);
  }
  const r = montarResultado({ real, ficticio, maisDoDia, outrosDias: outrosDiasDe(reais, c, agoraMs), criterios: c, data, base });
  const fonte = real || ficticio || {};
  const doMotor = [...r.opcoes, ...r.exemplos];
  return {
    ...r,
    oferta: fonte.oferta,
    casam: doMotor.filter((o) => o.casaComEstilo).length,
    afrouxou: fonte.afrouxou || [],
    blocos: fonte.blocos || {},
    atendem: doMotor.filter((o) => o.atende).length,
    noPedido: doMotor.filter((o) => o.atende && o.bloco === 'pedido').length,
    reais: r.opcoes.length + r.maisDoDia.length,
    dataReal: data,
  };
}

module.exports = {
  FUSO, hojeEmSaoPaulo, noiteEmSaoPaulo, CORTE_DA_NOITE_H, diaDaSemana, somarDias, dataCurta,
  vigentes, passou, datasDoDia, reaisDoDia, quandoDaReal, misturar, notaDaMistura,
  datasDoPedido, reaisDoPedido, montarResultado, resultadoDoPedido, opcoesDeDia, outrosDiasDe, pedidoDaData, dataDoDiaDoMes,
  segundaDaSemana, idDoDia, dataDe, notaDoResultado,
};

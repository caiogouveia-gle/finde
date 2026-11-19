'use strict';
// As festas reais: o registro finde-r14/2 do motor (motor/README.md, "O que o
// motor entrega") no formato da base do app, e a mistura com a base fictícia.
// Puro: não lê arquivo; o relógio entra como argumento.
//
// O que o motor não trouxe fica null ou lista vazia, nunca um padrão
// fictício: sem casa, sem bairro, sem média, o app mostra o vazio. Fica fora
// a festa que a fonte disse que não é festa, a de exemplo do motor, a sem data
// ou sem início, a de fora da cidade de São Paulo ou de cidade que a fonte
// não diz, a esgotada, a de um dia que o app não pergunta (de segunda a
// quinta) e a que já acabou (o fim, ou as 6h do dia seguinte, no momento do
// pedido; ver passou).

const C = require('./catalogo');
// As frases e a conta do preço moram no mesmo arquivo do navegador.
const FT = require('../publico/festa-texto');

const CONTRATO = 'finde-r14/2';
// A /1 gravava "São Paulo" fixo na cidade: com ela, a festa de Cotia voltaria
// para a lista. O export /1 não entra; é preciso exportar de novo.
const CONTRATO_ANTIGO = 'finde-r14/1';
const FUSO = 'America/Sao_Paulo';
const ID = /^[a-z0-9-]{1,60}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// getUTCDay() de cada dia que o app pergunta.
const DIA_DA_SEMANA = { 5: 'sex', 6: 'sab', 0: 'dom' };
const NUMERO_DO_DIA = { sex: 5, sab: 6, dom: 0 };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const objeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const texto = (v, max = 200) => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v.trim() : null);
const numero = (v) => typeof v === 'number' && Number.isFinite(v);
const https = (v) => {
  if (typeof v !== 'string' || v.length > 600) return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
};
const semAcento = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const congelar = (v) => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) congelar(x);
    Object.freeze(v);
  }
  return v;
};
const copia = (v) => (v === undefined || v === null ? null : structuredClone(v));

// ---------------------------------------------------------------- datas

// "2026-11-19": a data de hoje em São Paulo, no instante dado.
function hojeEmSaoPaulo(agoraMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agoraMs));
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

// ISO -> as horas do app: hora + 24 × dias depois da data (1h da manhã
// seguinte = 25). O ISO traz o fuso; a conta é feita no fuso de São Paulo,
// que não tem horário de verão desde 2019. null quando não dá para ler.
function horasDoApp(iso, data) {
  if (typeof iso !== 'string' || !ISO.test(iso) || !DATA.test(data)) return null;
  const t = Date.parse(iso);
  const meiaNoite = Date.parse(`${data}T00:00:00-03:00`);
  if (Number.isNaN(t) || Number.isNaN(meiaNoite)) return null;
  // Em minutos inteiros: "20:15" vira 20,25.
  return Math.round((t - meiaNoite) / 60000) / 60;
}

// ---------------------------------------------------------------- conversão

// A média vem com a origem, ou não vem (R16). Só os três tipos que o app
// sabe dizer; "avaliacoes" precisa do número de avaliações.
function mediaDe(m) {
  if (!objeto(m) || !numero(m.valor) || m.valor < 18 || m.valor > 60 || !C.ORIGENS.includes(m.origem)) return null;
  const tipo = { tipo: m.origem };
  if (m.origem === 'avaliacoes') {
    if (!(Number.isInteger(m.avaliacoes) && m.avaliacoes >= 5)) return null;
    tipo.avaliacoes = m.avaliacoes;
  }
  return {
    // O app escreve a média em anos inteiros; a origem diz de onde ela vem.
    mediaIdade: Math.round(m.valor),
    origemIdade: C.origemLonga(tipo),
    origemIdadeCurta: C.origemCurta(tipo),
    origemDetalhe: texto(m.detalhe, 160),
  };
}

// Endereço só quando diz mais que a cidade ("São Paulo" sozinho não leva a
// lugar nenhum). Bairro e região só com os ids do catálogo do app.
function enderecoDe(e) {
  if (!objeto(e)) return { endereco: null, bairro: null, regiao: null };
  const bairro = typeof e.bairro === 'string' && Object.hasOwn(C.BAIRROS, e.bairro) ? e.bairro : null;
  const regiao = bairro ? C.BAIRROS[bairro].regiao : null;
  const t = texto(e.texto);
  // A cidade é a que o motor leu da fonte, nunca um padrão.
  const cidade = texto(e.cidade, 80);
  const soCidade = !t || (cidade !== null && semAcento(t) === semAcento(cidade));
  return { endereco: soCidade ? null : { texto: t, bairro, regiao, cidade }, bairro, regiao };
}

const valorDe = (v) => (numero(v) && v >= 0 && v <= 5000 ? Math.round(v * 100) / 100 : null);

function lotesDe(lotes) {
  if (!Array.isArray(lotes)) return null;
  const saida = lotes.filter((l) => objeto(l) && texto(l.nome, 80) && valorDe(l.preco) !== null).slice(0, 12).map((l) => {
    const lote = { nome: texto(l.nome, 80), preco: valorDe(l.preco), disponivel: typeof l.disponivel === 'boolean' ? l.disponivel : null };
    if (valorDe(l.taxa) !== null) lote.taxa = valorDe(l.taxa);
    if (typeof l.ate === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(l.ate)) lote.ate = l.ate;
    // O que o lote pede (meia, gênero, código...), como o motor marcou.
    const cs = Array.isArray(l.condicoes) ? [...new Set(l.condicoes.filter((c) => FT.CONDICOES.includes(c)))] : [];
    if (cs.length) lote.condicoes = cs;
    return lote;
  });
  return saida.length ? saida : null;
}

const instagramDe = (v) => (https(v) && /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/.test(v) ? v : null);

const REGRAS = ['documento', 'vestimenta', 'lista'];
function regrasDe(r) {
  if (!objeto(r)) return {};
  return Object.fromEntries(REGRAS.filter((k) => texto(r[k], 200)).map((k) => [k, texto(r[k], 200)]));
}

const carimbo = (v) => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));

// O nome público de cada fonte, quando o app sabe dizer melhor que um export
// antigo: a "indicacao" é um link lido à mão na página do ingresso, não o
// grupo de quem usa o app.
const NOME_DA_FONTE = { indicacao: 'Lido na página do ingresso' };
function fontesDe(fontes) {
  if (!Array.isArray(fontes)) return [];
  return fontes.filter((x) => objeto(x) && texto(x.id, 40) && texto(x.nome, 80) && carimbo(x.conferidoEm))
    .map((x) => ({ id: x.id, nome: NOME_DA_FONTE[x.id] || texto(x.nome, 80), url: https(x.url), conferidoEm: x.conferidoEm }));
}

// As páginas lidas à mão (motor/fontes/indicacao.js): o que cada uma é, o
// que se leu nela e quando. Só https, só os tipos que o app sabe dizer.
const TIPOS_PAGINA = ['ingresso', 'revenda', 'materia', 'oficial', 'instagram', 'outra'];
function paginasDe(ps) {
  if (!Array.isArray(ps)) return [];
  return ps.filter((x) => objeto(x) && TIPOS_PAGINA.includes(x.tipo) && carimbo(x.lidoEm)).slice(0, 12).map((x) => ({
    tipo: x.tipo,
    nome: texto(x.nome, 60),
    url: https(x.url),
    lidoEm: x.lidoEm,
    campos: Array.isArray(x.campos) ? x.campos.filter((c) => typeof c === 'string' && /^[A-Za-z]{1,40}$/.test(c)).slice(0, 30) : [],
  }));
}

// O estilo veio de inferência (as regras do motor ou o Claude, lendo a
// descrição) e não da página ou da produtora.
const INFERENCIA = ['regras', 'claude'];
function estilosInferidos(r) {
  const c = objeto(r.campos) && objeto(r.campos.estilos) ? r.campos.estilos.fonte : null;
  if (c) return INFERENCIA.includes(c);
  return objeto(r.classificacao) && INFERENCIA.includes(r.classificacao.por);
}

// O app é um guia da cidade de São Paulo. Entra só a festa cuja fonte diz
// São Paulo (no texto do endereço, no campo cidade ou no CEP; o motor lê);
// de outra cidade, ou sem cidade dita, fica fora (docs/decisoes.md, 19/11).
function foraDaCidade(e) {
  const cidade = objeto(e) ? texto(e.cidade, 80) : null;
  if (!cidade) return 'cidade não confirmada na página';
  return semAcento(cidade) === 'sao paulo' ? null : `fora de São Paulo (${cidade})`;
}

function camposDe(campos) {
  if (!objeto(campos)) return {};
  return Object.fromEntries(Object.entries(campos)
    .filter(([k, x]) => /^[A-Za-z]{1,40}$/.test(k) && objeto(x) && texto(x.fonte, 40) && carimbo(x.conferidoEm))
    .map(([k, x]) => [k, { fonte: x.fonte, conferidoEm: x.conferidoEm }]));
}

// converterRegistro(r14) -> { festa } | { motivo }. A festa sai congelada, no
// formato da base do app (nucleo/base.js) mais `data` e `real: true`.
function converterRegistro(r) {
  if (!objeto(r)) return { motivo: 'não é um registro' };
  if (r.contrato === CONTRATO_ANTIGO) return { motivo: `export antigo (${CONTRATO_ANTIGO}): a cidade não é confiável` };
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null;
  if (!id) return { motivo: 'id' };
  if (r.ehFesta === false) return { motivo: 'não é festa' };
  if (r.exemplo === true) return { motivo: 'exemplo do motor' };
  const nome = texto(r.nome, 80);
  if (!nome) return { motivo: 'sem nome' };
  const data = typeof r.data === 'string' && DATA.test(r.data) && !Number.isNaN(Date.parse(`${r.data}T12:00:00Z`)) ? r.data : null;
  if (!data) return { motivo: 'sem data' };
  const dia = DIA_DA_SEMANA[diaDaSemana(data)];
  if (!dia) return { motivo: 'dia fora do fim de semana' };
  const inicio = horasDoApp(r.inicio, data);
  if (inicio === null) return { motivo: 'sem início' };
  if (inicio < 6 || inicio > 30) return { motivo: 'início fora do dia' };
  const esquenta = horasDoApp(r.pistaCheia, data);
  const fim = horasDoApp(r.fim, data);
  if (r.esgotado === true) return { motivo: 'esgotada' };
  const cidade = foraDaCidade(r.endereco);
  if (cidade) return { motivo: cidade };

  const lotes = lotesDe(r.lotes);
  const porta = objeto(r.entradaNaPorta) && valorDe(r.entradaNaPorta.preco) !== null ? { preco: valorDe(r.entradaNaPorta.preco) } : null;
  // O preço do filtro de teto é o "a partir de": o menor lote que qualquer
  // pessoa compra, ou o mais alto dos dois quando só há lote por gênero, ou
  // a porta (FT.preco, a mesma conta do precoAPartirDe do motor). Sem lote
  // nem porta, o do motor, se vier.
  const p = FT.preco({ lotes, entradaNaPorta: porta });
  const preco = valorDe(p.valor) !== null ? valorDe(p.valor) : !lotes && !porta && objeto(r.precoAPartirDe) ? valorDe(r.precoAPartirDe.valor) : null;
  const { endereco, bairro, regiao } = enderecoDe(r.endereco);
  const media = mediaDe(r.mediaIdade);
  const estilos = Array.isArray(r.estilos) ? [...new Set(r.estilos.filter((e) => C.ID_ESTILOS.includes(e)))] : [];
  const lineup = Array.isArray(r.lineup) ? r.lineup.map((n) => texto(n, 80)).filter(Boolean).slice(0, 30) : [];

  const festa = {
    id, nome,
    produtora: objeto(r.produtora) ? texto(r.produtora.nome, 80) : texto(r.produtora, 80),
    casa: texto(r.casa, 80),
    bairro, regiao, dia, data,
    inicio,
    // A pista cheia e o fim só quando vêm e fazem sentido; senão, null.
    esquenta: esquenta !== null && esquenta >= inicio && esquenta <= inicio + 12 ? esquenta : null,
    fim: fim !== null && fim > inicio && fim <= inicio + 24 ? fim : null,
    mediaIdade: media ? media.mediaIdade : null,
    origemIdade: media ? media.origemIdade : null,
    origemIdadeCurta: media ? media.origemIdadeCurta : null,
    origemDetalhe: media ? media.origemDetalhe : null,
    faixas: [],
    preco,
    estilos,
    estilosInferidos: estilos.length > 0 && estilosInferidos(r),
    frase: null,
    selo: 'editorial',
    distanciaMin: null,
    endereco,
    lotes,
    entradaNaPorta: porta,
    linkCompra: https(r.linkCompra),
    linkEvento: https(r.linkEvento),
    instagram: instagramDe(r.instagram) || (objeto(r.produtora) ? instagramDe(r.produtora.instagram) : null),
    // O cartaz do motor é uma URL de fora, e a CSP do app só carrega imagem
    // daqui: o detalhe fica sem cartaz, e o endereço segue guardado.
    cartaz: null,
    cartazExterno: https(r.cartaz),
    lineup: lineup.length ? lineup : null,
    idadeMinima: Number.isInteger(r.idadeMinima) && r.idadeMinima >= 1 && r.idadeMinima <= 21 ? r.idadeMinima : null,
    regras: regrasDe(r.regras),
    fontes: fontesDe(r.fontes),
    paginas: paginasDe(r.paginas),
    campos: camposDe(r.campos),
    coletadoEm: carimbo(r.coletadoEm) ? r.coletadoEm : null,
    exemplo: false,
    real: true,
  };
  return { festa: congelar(festa) };
}

// O arquivo exportado (ou a lista crua) -> { festas, fora: [{ id, motivo }], avisos }.
function converterExport(bruto) {
  const linhas = Array.isArray(bruto) ? bruto : objeto(bruto) && Array.isArray(bruto.festas) ? bruto.festas : null;
  if (!linhas) return { festas: [], fora: [], avisos: ['o arquivo não traz uma lista de festas'] };
  const avisos = [];
  if (objeto(bruto) && bruto.contrato !== undefined && bruto.contrato !== CONTRATO) avisos.push(`contrato "${bruto.contrato}", esperava "${CONTRATO}"`);
  if (objeto(bruto) && bruto.contrato === CONTRATO_ANTIGO) {
    avisos.push(`export ${CONTRATO_ANTIGO} recusado: ele grava "São Paulo" fixo na cidade; rode o exportar do motor de novo`);
    return { festas: [], fora: linhas.map((r, i) => ({ id: objeto(r) && typeof r.id === 'string' ? r.id.slice(0, 60) : `#${i + 1}`, motivo: 'export antigo' })), avisos };
  }
  const festas = [];
  const fora = [];
  const vistos = new Set();
  linhas.forEach((r, i) => {
    const rotulo = objeto(r) && typeof r.id === 'string' ? r.id.slice(0, 60) : `#${i + 1}`;
    const { festa, motivo } = converterRegistro(r);
    if (!festa) return fora.push({ id: rotulo, motivo });
    if (vistos.has(festa.id)) return fora.push({ id: rotulo, motivo: 'id repetido' });
    vistos.add(festa.id);
    festas.push(festa);
  });
  return { festas, fora, avisos };
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
  const d = C.DIAS[dia];
  const nesse = d ? `${dia === 'sex' ? 'Nesta' : 'Neste'} ${d.frase}` : 'Nesse dia';
  const no = d ? `${dia === 'sex' ? 'na' : 'no'} ${d.frase}` : 'nesse dia';
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

module.exports = {
  CONTRATO, converterRegistro, converterExport, horasDoApp, hojeEmSaoPaulo, vigentes, passou, datasDoDia, reaisDoDia,
  quandoDaReal, misturar, notaDaMistura, dataCurta,
};

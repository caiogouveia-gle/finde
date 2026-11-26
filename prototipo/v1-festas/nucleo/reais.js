'use strict';
// As festas reais: o registro finde-r14/2 ou /3 do motor (motor/README.md, "O
// que o motor entrega") no formato da base do app, e a mistura com a base
// fictícia.
// Puro: não lê arquivo; o relógio entra como argumento.
//
// O que o motor não trouxe fica null ou lista vazia, nunca um padrão
// fictício: sem casa, sem bairro, o app mostra o vazio. A média de idade
// (`mediaIdade`) que o motor ainda mande é descartada aqui desde 26/11/2026,
// até a idade do público ser validada. Fica fora
// a festa que a fonte disse que não é festa, a de exemplo do motor, a sem
// data, a de fora da cidade de São Paulo ou de cidade que a fonte não diz e a
// que já acabou (o fim, ou as 6h do dia seguinte, no momento do pedido; ver
// passou). Desde a U23 (24/11/2026) entram, marcadas, a festa sem início
// (`horarioIncerto`) e a esgotada (`esgotado`), e qualquer dia da semana: o
// dia é o da noite (`dataDaNoite`), e o "hoje" do pedido pega até a festa de
// segunda; quem escolhe o que mostrar é a lista (nucleo/lista.js).

const C = require('./catalogo');
// As frases e a conta do preço moram no mesmo arquivo do navegador.
const FT = require('../publico/festa-texto');
// O recorte (vigentes, dias, mistura) mora em lista.js; reais.js reexporta
// para o servidor seguir igual (U4 do plano de 24/11/2026).
const L = require('./lista');
const { hojeEmSaoPaulo, diaDaSemana, somarDias, dataCurta, vigentes, passou, datasDoDia, reaisDoDia, quandoDaReal, misturar, notaDaMistura } = L;

// O /3 (24/11/2026) traz a noite da festa, o endereço com coordenada, as
// imagens, o vínculo de cada fonte, as divergências e os ids antigos. Na
// transição o app aceita os dois; o /2 entra sem coordenada nem imagem.
const CONTRATO = 'finde-r14/3';
const CONTRATOS = ['finde-r14/2', 'finde-r14/3'];
// A /1 gravava "São Paulo" fixo na cidade: com ela, a festa de Cotia voltaria
// para a lista. O export /1 não entra; é preciso exportar de novo.
const CONTRATO_ANTIGO = 'finde-r14/1';
const ID = /^[a-z0-9-]{1,60}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// Os sete dias, pelo getUTCDay(): o `dia` e o `diaDaSemana` da festa.
const DIA_CURTO = C.DIAS_DA_SEMANA;

const objeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const texto = (v, max = 200) => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v.trim() : null);
const numero = (v) => typeof v === 'number' && Number.isFinite(v);

// O nome da festa cabe em 80 caracteres. Título de plataforma passa disso
// ("Soirée APRESENTA: Fulano @ Casa | Domingo 13.12 (ATRAÇÃO ..."): fica a parte
// antes do primeiro separador, se ela diz alguma coisa; senão, o corte na
// última palavra inteira, com reticências. Recusar a festa inteira por causa do
// título comprido tirava do app festa boa de sábado.
const SEPARADORES_DE_TITULO = [' | ', ' – ', ' — ', ' - ', ' · ', ' (', ': '];
function nomeCurto(v) {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (n.length <= 80) return n;
  for (const sep of SEPARADORES_DE_TITULO) {
    const i = n.indexOf(sep);
    if (i >= 8 && i <= 80) return n.slice(0, i).replace(/[\s,;:.\-–—·|]+$/, '');
  }
  const corte = n.slice(0, 79);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco >= 40 ? corte.slice(0, espaco) : corte).replace(/[\s,;:.\-–—·|]+$/, '')}…`;
}
// O nome para mostrar (24/11/2026): título de bilheteria vem com data, hora,
// casa, chamada de venda e caixa alta ("Classics |28 de Novembro | A Última
// Classics do ANO!| Cortina"). Fica o primeiro trecho que é nome de festa, e a
// palavra toda em caixa alta (de 4 letras ou mais) vira inicial maiúscula,
// menos as siglas conhecidas. O título da fonte segue em `nomeOriginal`.
const SIGLAS = new Set(['MPB', 'VIP', 'LGBT', 'LGBTQIA', 'B2B', 'DJ', 'DJS', 'SP', 'USA', 'NYC', 'EDM', 'RNB']);
const MESES = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const DIAS_SEMANA = 'segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|seg|ter|qua|qui|sex|sáb|sab|dom';
const RUIDO = [
  new RegExp(`^\\(?(${DIAS_SEMANA})(-feira)?\\)?$`, 'i'),
  /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?(\s.*)?$/,
  new RegExp(`^\\d{1,2}\\s+de\\s+(${MESES})`, 'i'),
  new RegExp(`^(${MESES})(\\s+\\d{4})?$`, 'i'),
  /^(às\s*)?\d{1,2}\s*h(\d{2})?$/i,
  /^(garanta( seu| o seu)? ingresso|ingressos?( à venda)?|entrada gratuita|open bar.*|são paulo|sp)$/i,
];
const semAcentoMin = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function nomeExibido(bruto, { casa = null, bairro = null } = {}) {
  if (typeof bruto !== 'string') return null;
  let n = bruto.replace(/\s+/g, ' ').trim();
  // Data na frente: "28-11 Sabado The Bets", "04/12 (SEX) - Vandals Gang".
  n = n.replace(new RegExp(`^\\d{1,2}[./-]\\d{1,2}([./-]\\d{2,4})?\\s*(\\(?(${DIAS_SEMANA})\\)?)?\\s*[-–—|:]?\\s*`, 'i'), '');
  const trechos = n.split(/\s+[|–—·@-]\s+|\s+\|\s*|\s*\|\s+|\s*\*+\s*/).map((t) => t.trim().replace(/^[\s,;:.\-–—·|]+|[\s,;:\-–—·|]+$/g, '')).filter(Boolean);
  const daCasa = (t) => [casa, bairro].some((c) => c && semAcentoMin(t).length >= 4 && (semAcentoMin(c) === semAcentoMin(t) || semAcentoMin(c).includes(semAcentoMin(t))));
  // Sem o ruído (data, hora, venda, casa), o título curto fica inteiro
  // ("Heavy Love 11 anos · Louie Vega"); o comprido fica no primeiro trecho.
  const bons = trechos.filter((t) => t.length >= 2 && !RUIDO.some((re) => re.test(t)) && !daCasa(t));
  const junto = bons.join(' · ');
  const nome = (bons.length && junto.length <= 32 ? junto : bons[0]) || trechos[0] || n;
  const caixa = nome.replace(/[A-Za-zÀ-ÿ]{4,}/g, (w) => (w === w.toUpperCase() && w !== w.toLowerCase() && !SIGLAS.has(w)
    ? w.charAt(0) + w.slice(1).toLowerCase() : w));
  return caixa.replace(/\s+/g, ' ').trim() || null;
}
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

// As datas do calendário e o "hoje" em São Paulo moram em nucleo/lista.js (um
// lugar só para o recorte); aqui, só a conta das horas do app.

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

// Os 14 bairros do motor (C.TODOS_OS_BAIRROS), com o nome que o motor leu
// (Vila Leopoldina aponta para lapa e continua se chamando Vila Leopoldina).
const umBairro = (id) => (typeof id === 'string' && Object.hasOwn(C.TODOS_OS_BAIRROS, id) ? id : null);

// Endereço só quando diz mais que a cidade ("São Paulo" sozinho não leva a
// lugar nenhum). Bairro e região só com os ids do catálogo do app.
function enderecoDe(e) {
  if (!objeto(e)) return { endereco: null, bairro: null, regiao: null, bairroNome: null };
  const bairro = umBairro(e.bairro);
  const regiao = bairro ? C.TODOS_OS_BAIRROS[bairro].regiao : null;
  const bairroNome = bairro ? texto(e.bairroNome, 60) || C.TODOS_OS_BAIRROS[bairro].nome : null;
  const t = texto(e.texto);
  // A cidade é a que o motor leu da fonte, nunca um padrão.
  const cidade = texto(e.cidade, 80);
  const soCidade = !t || (cidade !== null && semAcento(t) === semAcento(cidade));
  if (soCidade) return { endereco: null, bairro, regiao, bairroNome };
  const endereco = { texto: t, bairro, regiao, cidade };
  // Do /3: de onde veio a cidade, o CEP e a casa do cadastro curado.
  if (ORIGENS_CIDADE.includes(e.cidadeOrigem)) endereco.cidadeOrigem = e.cidadeOrigem;
  if (typeof e.cep === 'string' && /^\d{5}-?\d{3}$/.test(e.cep)) endereco.cep = e.cep;
  if (typeof e.lugar === 'string' && ID.test(e.lugar)) endereco.lugar = e.lugar;
  return { endereco, bairro, regiao, bairroNome };
}

// ---------------------------------------------------------------- campos do /3

const ORIGENS_CIDADE = ['fonte', 'cep', 'casa'];
const PRECISOES = ['casa', 'rua', 'bairro'];
const ORIGENS_GEO = ['curadoria', 'curado', 'pagina', 'nominatim'];

// O ponto da festa (KTD1): só dentro da caixa de São Paulo, com 5 casas.
// Sem coordenada, null; a precisão "bairro" passa, mas nunca vira pino (U33).
function localDe(e) {
  if (!objeto(e) || !numero(e.lat) || !numero(e.lng)) return null;
  if (e.lat < -24.1 || e.lat > -23.3 || e.lng < -47.0 || e.lng > -46.3) return null;
  return {
    lat: Math.round(e.lat * 1e5) / 1e5,
    lng: Math.round(e.lng * 1e5) / 1e5,
    precisao: PRECISOES.includes(e.precisao) ? e.precisao : null,
    origemGeo: ORIGENS_GEO.includes(e.origemGeo) ? e.origemGeo : null,
    lugar: typeof e.lugar === 'string' && ID.test(e.lugar) ? e.lugar : null,
    atribuicaoOsm: e.atribuicaoOsm === true,
  };
}

// As peças de divulgação (KTD1, KTD14): só o hash de 16 e os dois tamanhos
// que o app serve em /imagens/; crédito em texto e origem https (o post ou a
// página, nunca o CDN). O caminho sai absoluto no app.
const SHA = /^[a-f0-9]{16}$/;
const PAPEIS = ['cartaz-enviado', 'cartaz-indicado', 'flyer', 'pagina-ingresso', 'post'];
function imagemDe(x) {
  if (!objeto(x) || typeof x.id !== 'string' || !SHA.test(x.id)) return null;
  if (x.arquivo !== `imagens/${x.id}-1080.webp` || x.miniatura !== `imagens/${x.id}-480.webp`) return null;
  const dim = (v) => (Number.isInteger(v) && v > 0 && v <= 4000 ? v : null);
  const origens = Array.isArray(x.origens) ? x.origens.filter((o) => objeto(o) && texto(o.fonte, 40)).slice(0, 8)
    .map((o) => ({ fonte: o.fonte, origem: https(o.origem), credito: texto(o.credito, 120) })) : [];
  return {
    id: x.id,
    arquivo: `/imagens/${x.id}-1080.webp`,
    miniatura: `/imagens/${x.id}-480.webp`,
    largura: dim(x.largura),
    altura: dim(x.altura),
    papel: PAPEIS.includes(x.papel) ? x.papel : null,
    fonte: texto(x.fonte, 40),
    credito: texto(x.credito, 120),
    origem: https(x.origem),
    conferidoEm: carimbo(x.conferidoEm) ? x.conferidoEm : null,
    principal: x.principal === true,
    origens,
  };
}
const imagensDe = (xs) => (Array.isArray(xs) ? xs.slice(0, 8).map(imagemDe).filter(Boolean) : []);

// Onde as fontes discordam (KTD1): só os cinco campos que o motor compara.
const CAMPOS_DIVERGENTES = ['precoAPartirDe', 'inicio', 'data', 'casa', 'linkCompra'];
function divergenciasDe(ds) {
  if (!Array.isArray(ds)) return [];
  return ds.filter((d) => objeto(d) && CAMPOS_DIVERGENTES.includes(d.campo) && Array.isArray(d.valores)).slice(0, 5).map((d) => ({
    campo: d.campo,
    valores: d.valores.filter((v) => objeto(v) && texto(v.fonte, 40) && carimbo(v.conferidoEm)).slice(0, 8)
      .map((v) => ({ fonte: v.fonte, valor: copia(v.valor), conferidoEm: v.conferidoEm })),
  })).filter((d) => d.valores.length > 1);
}

// O motivo da junção de cada fonte (KTD5): regra, escore e sinais.
const REGRAS_VINCULO = ['link', 'escore', 'manual', 'nova'];
function vinculoDe(v) {
  if (!objeto(v) || !REGRAS_VINCULO.includes(v.regra)) return null;
  const sinais = Array.isArray(v.sinais) ? v.sinais.filter((x) => objeto(x) && texto(x.sinal, 40) && numero(x.peso)).slice(0, 12)
    .map((x) => ({ sinal: x.sinal, peso: x.peso, detalhe: texto(x.detalhe, 160) })) : [];
  return { regra: v.regra, escore: numero(v.escore) ? v.escore : null, sinais };
}

const idsAntigosDe = (xs) => (Array.isArray(xs) ? [...new Set(xs.filter((x) => typeof x === 'string' && ID.test(x)))].slice(0, 20) : []);

// A noite da festa (KTD1): a `dataDaNoite` do motor vale quando é a própria
// data ou a véspera. Sem ela (o /2, ou uma noite que não bate), a conta é a
// mesma do motor (nucleo/contrato.js, dataDaNoite): início antes das 6h, em
// São Paulo, conta como a noite anterior; sem início, a data.
function noiteDe(r, data) {
  if (typeof r.dataDaNoite === 'string' && DATA.test(r.dataDaNoite)
    && (r.dataDaNoite === data || r.dataDaNoite === somarDias(data, -1))) return r.dataDaNoite;
  const h = horasDoApp(r.inicio, data);
  return h !== null && h >= 0 && h < 6 ? somarDias(data, -1) : data;
}

// "2026-11-26T12:05:00.000Z" -> "2026-11-26T09:05:00-03:00": o carimbo do
// envelope no fuso de São Paulo (sem horário de verão desde 2019).
function emSaoPaulo(iso) {
  if (!carimbo(iso)) return null;
  const d = new Date(Date.parse(iso) - 3 * 3600e3);
  return `${d.toISOString().slice(0, 19)}-03:00`;
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
  // A fonte `avaliacoes` (as avaliações de idade de quem foi) só dava a
  // média de idade, que saiu em 26/11/2026: cai aqui.
  return fontes.filter((x) => objeto(x) && texto(x.id, 40) && x.id !== 'avaliacoes' && texto(x.nome, 80) && carimbo(x.conferidoEm))
    .map((x) => {
      const fonte = { id: x.id, nome: NOME_DA_FONTE[x.id] || texto(x.nome, 80), url: https(x.url), conferidoEm: x.conferidoEm };
      // Do /3: o motivo da junção. O /2 não traz, e a chave não aparece.
      const vinculo = vinculoDe(x.vinculo);
      if (vinculo) fonte.vinculo = vinculo;
      return fonte;
    });
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
    campos: Array.isArray(x.campos) ? x.campos.filter((c) => typeof c === 'string' && /^[A-Za-z]{1,40}$/.test(c) && c !== 'mediaIdade').slice(0, 30) : [],
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
    .filter(([k, x]) => /^[A-Za-z]{1,40}$/.test(k) && k !== 'mediaIdade' && objeto(x) && texto(x.fonte, 40) && carimbo(x.conferidoEm))
    .map(([k, x]) => [k, { fonte: x.fonte, conferidoEm: x.conferidoEm }]));
}

// As fontes que descobriram a festa (o "Encontrada em N fontes"): sem quem
// só leu ou corrigiu o que outra trouxe.
const SO_LEITURA = ['claude', 'regras', 'curadoria'];

// Quando o preço foi conferido: o carimbo do campo que deu o preço.
function precoConferidoDe(campos) {
  for (const k of ['precoAPartirDe', 'lotes', 'entradaNaPorta']) {
    if (objeto(campos) && objeto(campos[k]) && carimbo(campos[k].conferidoEm)) return campos[k].conferidoEm;
  }
  return null;
}

// converterRegistro(r14, { geradoEm }) -> { festa } | { motivo }. A festa sai
// congelada, no formato da base do app (nucleo/base.js) mais os campos do
// registro e `real: true`, com a forma de teste/dados/festa-r14-3-convertida.json
// (o /2 entra na mesma forma, sem ponto nem imagem). `geradoEm` é o do
// envelope e vira o `atualizadoEm` da festa.
function converterRegistro(r, contexto = {}) {
  if (!objeto(r)) return { motivo: 'não é um registro' };
  if (r.contrato === CONTRATO_ANTIGO) return { motivo: `export antigo (${CONTRATO_ANTIGO}): a cidade não é confiável` };
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null;
  if (!id) return { motivo: 'id' };
  if (r.ehFesta === false) return { motivo: 'não é festa' };
  if (r.exemplo === true) return { motivo: 'exemplo do motor' };
  if (r.oculta === true || objeto(r.oculta)) return { motivo: 'oculta pela curadoria' };
  const nome = nomeCurto(r.nome);
  if (!nome) return { motivo: 'sem nome' };
  const dataDaFonte = typeof r.data === 'string' && DATA.test(r.data) && !Number.isNaN(Date.parse(`${r.data}T12:00:00Z`)) ? r.data : null;
  if (!dataDaFonte) return { motivo: 'sem data' };
  // O dia é o da noite: a festa de 00h30 de sábado é da sexta, às 24h30.
  const data = noiteDe(r, dataDaFonte);
  const dia = DIA_CURTO[diaDaSemana(data)];
  const inicio = horasDoApp(r.inicio, data);
  if (inicio !== null && (inicio < 6 || inicio > 30)) return { motivo: 'início fora do dia' };
  const cidade = foraDaCidade(r.endereco);
  if (cidade) return { motivo: cidade };
  // Sem início, a régua de horas fica sem âncora: o fim conta da data (até
  // 12h do dia seguinte) e a pista cheia não entra.
  const esquenta = inicio === null ? null : horasDoApp(r.pistaCheia, data);
  const fim = horasDoApp(r.fim, data);
  const fimOk = fim !== null && (inicio === null ? fim >= 12 && fim <= 36 : fim > inicio && fim <= inicio + 24);

  const lotes = lotesDe(r.lotes);
  const porta = objeto(r.entradaNaPorta) && valorDe(r.entradaNaPorta.preco) !== null ? { preco: valorDe(r.entradaNaPorta.preco) } : null;
  // O preço do filtro de teto é o "a partir de": o menor lote que qualquer
  // pessoa compra, ou o mais alto dos dois quando só há lote por gênero, ou
  // a porta (FT.preco, a mesma conta do precoAPartirDe do motor). Sem lote
  // nem porta, o do motor, se vier.
  const p = FT.preco({ lotes, entradaNaPorta: porta });
  const preco = valorDe(p.valor) !== null ? valorDe(p.valor) : !lotes && !porta && objeto(r.precoAPartirDe) ? valorDe(r.precoAPartirDe.valor) : null;
  const { endereco, bairro, regiao, bairroNome } = enderecoDe(r.endereco);
  const estilos = Array.isArray(r.estilos) ? [...new Set(r.estilos.filter((e) => C.ID_ESTILOS.includes(e)))] : [];
  const lineup = Array.isArray(r.lineup) ? r.lineup.map((n) => texto(n, 80)).filter(Boolean).slice(0, 30) : [];
  // Casa que é só o nome da cidade não é casa; produtora igual à casa não se repete.
  let casa = texto(r.casa, 80);
  const cidadeDita = objeto(r.endereco) ? texto(r.endereco.cidade, 80) : null;
  if (casa && (semAcento(casa) === 'sao paulo' || (cidadeDita && semAcento(casa) === semAcento(cidadeDita)))) casa = null;
  let produtora = objeto(r.produtora) ? texto(r.produtora.nome, 80) : texto(r.produtora, 80);
  if (produtora && casa && semAcento(produtora) === semAcento(casa)) produtora = null;
  const imagens = imagensDe(r.imagens);
  const fontes = fontesDe(r.fontes);
  const campos = camposDe(r.campos);

  const nomeLimpo = nomeCurto(nomeExibido(r.nome, { casa, bairro: bairroNome })) || nome;
  const festa = {
    id, nome: nomeLimpo,
    ...(nomeLimpo !== r.nome.trim() ? { nomeOriginal: texto(r.nome, 300) || nome } : {}),
    produtora,
    casa,
    bairro, bairroNome, regiao,
    dia, diaDaSemana: dia,
    data, dataDaNoite: data,
    inicio,
    // Sem início divulgado: a festa entra, e a tela diz que o horário é incerto.
    horarioIncerto: inicio === null,
    // A pista cheia e o fim só quando vêm e fazem sentido; senão, null.
    esquenta: esquenta !== null && esquenta >= inicio && esquenta <= inicio + 12 ? esquenta : null,
    fim: fimOk ? fim : null,
    preco,
    precoConferidoEm: precoConferidoDe(r.campos),
    // Esgotada entra marcada; a lista a põe no fim, fora do ranking.
    esgotado: r.esgotado === true,
    estilos,
    estilosInferidos: estilos.length > 0 && estilosInferidos(r),
    frase: null,
    selo: 'editorial',
    distanciaMin: null,
    endereco,
    local: localDe(r.endereco),
    lotes,
    entradaNaPorta: porta,
    linkCompra: https(r.linkCompra),
    linkEvento: https(r.linkEvento),
    instagram: instagramDe(r.instagram) || (objeto(r.produtora) ? instagramDe(r.produtora.instagram) : null),
    // As peças de divulgação servidas pelo app em /imagens/ (KTD14); o
    // cartaz é a principal. O /2 trazia uma URL de fora, que a CSP não
    // carrega: fica guardada em cartazExterno e nunca vira imagem.
    imagens,
    cartaz: imagens.find((i) => i.principal) || imagens[0] || null,
    cartazExterno: https(r.cartaz),
    lineup: lineup.length ? lineup : null,
    idadeMinima: Number.isInteger(r.idadeMinima) && r.idadeMinima >= 1 && r.idadeMinima <= 21 ? r.idadeMinima : null,
    regras: regrasDe(r.regras),
    fontes,
    encontradaEm: [...new Set(fontes.map((x) => x.id).filter((x) => !SO_LEITURA.includes(x)))],
    paginas: paginasDe(r.paginas),
    divergencias: divergenciasDe(r.divergencias),
    idsAntigos: idsAntigosDe(r.idsAntigos).filter((x) => x !== id),
    campos,
    coletadoEm: carimbo(r.coletadoEm) ? r.coletadoEm : null,
    atualizadoEm: emSaoPaulo(contexto.geradoEm),
    exemplo: false,
    real: true,
  };
  return { festa: congelar(festa) };
}

// O que o export diz de si, para "Atualizado há 3 h · 41 festas lidas de 50
// perfis e 3 sites de ingresso" (R23): o carimbo, quantas festas o motor
// mandou e de quantos perfis do Instagram e sites de ingresso elas vieram.
// Quando o envelope trouxer `perfis` e `sites`, valem os dele.
function resumoDoExport(bruto) {
  const linhas = Array.isArray(bruto) ? bruto : objeto(bruto) && Array.isArray(bruto.festas) ? bruto.festas : [];
  const perfis = new Set();
  const sites = new Set();
  for (const r of linhas) {
    if (!objeto(r)) continue;
    const ids = Array.isArray(r.fontes) ? r.fontes.filter(objeto).map((x) => x.id) : [];
    const perfil = instagramDe(r.instagram) || (objeto(r.produtora) ? instagramDe(r.produtora.instagram) : null);
    if (perfil && ids.includes('instagram')) perfis.add(perfil.toLowerCase().replace(/\/$/, '').replace('://www.', '://'));
    for (const u of [r.linkCompra, ...(Array.isArray(r.fontes) ? r.fontes.filter(objeto).filter((x) => ['paginas', 'plataformas', 'indicacao'].includes(x.id)).map((x) => x.url) : [])]) {
      const v = https(u);
      if (!v) continue;
      const host = new URL(v).hostname.replace(/^www\./, '').split('.').slice(-3).join('.');
      if (!/instagram\.com$/.test(host)) sites.add(host.replace(/^(cart|embedstore|bileto)\./, ''));
    }
  }
  const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const env = objeto(bruto) ? bruto : {};
  return {
    atualizadoEm: emSaoPaulo(env.geradoEm),
    total: inteiro(env.total) !== null ? env.total : linhas.length,
    perfis: inteiro(env.perfis) !== null ? env.perfis : perfis.size,
    sites: inteiro(env.sites) !== null ? env.sites : sites.size,
  };
}

// O arquivo exportado (ou a lista crua) -> { festas, fora: [{ id, motivo }], avisos }.
function converterExport(bruto) {
  const linhas = Array.isArray(bruto) ? bruto : objeto(bruto) && Array.isArray(bruto.festas) ? bruto.festas : null;
  if (!linhas) return { festas: [], fora: [], avisos: ['o arquivo não traz uma lista de festas'] };
  const avisos = [];
  if (objeto(bruto) && bruto.contrato !== undefined && !CONTRATOS.includes(bruto.contrato)) avisos.push(`contrato "${bruto.contrato}", esperava ${CONTRATOS.map((c) => `"${c}"`).join(' ou ')}`);
  if (objeto(bruto) && bruto.contrato === CONTRATO_ANTIGO) {
    avisos.push(`export ${CONTRATO_ANTIGO} recusado: ele grava "São Paulo" fixo na cidade; rode o exportar do motor de novo`);
    return { festas: [], fora: linhas.map((r, i) => ({ id: objeto(r) && typeof r.id === 'string' ? r.id.slice(0, 60) : `#${i + 1}`, motivo: 'export antigo' })), avisos };
  }
  const festas = [];
  const fora = [];
  const vistos = new Set();
  linhas.forEach((r, i) => {
    const rotulo = objeto(r) && typeof r.id === 'string' ? r.id.slice(0, 60) : `#${i + 1}`;
    const { festa, motivo } = converterRegistro(r, { geradoEm: objeto(bruto) ? bruto.geradoEm : null });
    if (!festa) return fora.push({ id: rotulo, motivo });
    if (vistos.has(festa.id)) return fora.push({ id: rotulo, motivo: 'id repetido' });
    vistos.add(festa.id);
    festas.push(festa);
  });
  return { festas, fora, avisos };
}

module.exports = {
  nomeExibido,
  CONTRATO, CONTRATOS, converterRegistro, converterExport, resumoDoExport, horasDoApp, hojeEmSaoPaulo, vigentes, passou, datasDoDia, reaisDoDia,
  quandoDaReal, misturar, notaDaMistura, dataCurta, somarDias, diaDaSemana,
};

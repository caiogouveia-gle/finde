'use strict';
// De um item de fonte para os campos do registro R14. Cada conector entrega um
// "bruto" com nomes simples (data, inicio "22:00", preco "R$ 40" ...); daqui sai
// um objeto só com os campos que a fonte de fato trouxe, já limpos, mais os avisos
// do que foi descartado. Puro: sem banco, sem relógio, sem rede.
//
// Horários: São Paulo não tem horário de verão desde 2019, então todo horário sai
// em ISO com -03:00 (KTD7). Fim ou pista cheia antes do início é no dia seguinte.

const crypto = require('node:crypto');
const { ESTILOS, ORIGENS_IDADE, TIPOS_EVENTO } = require('./catalogo');
const { acharBairro, acharBairroPorCep, extrairCep, semAcento } = require('./bairros');
const { acharLugar, ruaENumero } = require('./lugares');

const FUSO = '-03:00';

function texto(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Só http(s); o resto (javascript:, data:, ftp:) é recusado.
function url(v) {
  if (typeof v !== 'string' || v.length > 500) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// "@coletivo", "coletivo", "instagram.com/coletivo" -> https://www.instagram.com/coletivo/
function instagram(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const u = url(t);
  if (u) {
    const p = new URL(u);
    if (!/(^|\.)instagram\.com$/.test(p.hostname)) return null;
    const nome = p.pathname.split('/').filter(Boolean)[0];
    return nome && /^[A-Za-z0-9._]{1,30}$/.test(nome) ? `https://www.instagram.com/${nome}/` : null;
  }
  const nome = t.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(nome) ? `https://www.instagram.com/${nome}/` : null;
}

// "Gratuito" -> 0; "R$ 25,00" -> 25; "R$20 a R$40" -> 20; 40 -> 40; o resto -> null.
function preco(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= 5000 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== 'string') return null;
  const t = semAcento(v);
  if (/\b(gratuit[oa]|gratis|free|entrada franca|livre)\b/.test(t)) return 0;
  const m = t.match(/(\d{1,4}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].includes(',') ? m[1].replace(/\./g, '').replace(',', '.') : m[1]);
  return preco(n);
}

const dataValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T12:00:00${FUSO}`)) && new Date(`${v}T12:00:00${FUSO}`).toISOString().slice(0, 10) === v;

function minutos(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.trim().match(/^(\d{1,2})(?::|h)?(\d{2})?(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2] || 0);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

function somarDias(data, dias) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// data + "22:00" -> "2026-11-14T22:00:00-03:00"; com base em minutos, rola para o dia seguinte.
function horario(data, hhmm, depoisDe = null) {
  const m = minutos(hhmm);
  if (m === null) return null;
  const dia = depoisDe !== null && m <= depoisDe ? somarDias(data, 1) : data;
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${dia}T${h}:${mm}:00${FUSO}`;
}

// O que um lote pede de quem compra, pelo nome que a fonte deu ou pelo campo
// `condicoes` que a leitura anotou. "De pessoa" (meia, meia social, gênero,
// comissário) não é preço de todo mundo: não vira o "a partir de" (contrato.js).
// "codigo" é o lote que só aparece com um código. O link público sai sem
// código (semCodigo), então esse lote também não é preço de todo mundo.
const CONDICOES = ['meia', 'meia-social', 'feminino', 'masculino', 'comissario', 'codigo'];
const CONDICOES_DE_PESSOA = ['meia', 'meia-social', 'feminino', 'masculino', 'comissario', 'codigo'];
function condicoesDoLote(nome, declaradas) {
  // "Inteira (não é meia)": a negação sai antes de procurar a condição.
  const t = semAcento(typeof nome === 'string' ? nome : '').replace(/\b(?:nao|sem)\s+(?:e\s+)?(?:meia|desconto)(?:[\s-]*(?:social|entrada))?/g, ' ');
  const c = new Set(Array.isArray(declaradas) ? declaradas.filter((x) => CONDICOES.includes(x)) : []);
  if (/meia[\s-]*social|solidari|\+\s*\d+\s*kg|\balimento\b/.test(t)) c.add('meia-social');
  else if (/\bmeia\b|meia[\s-]entrada|\bestudante/.test(t) && !/\binteira\b/.test(t)) c.add('meia');
  // Os dois gêneros no mesmo nome ("Homens e Mulheres") é lote para todo mundo.
  const fem = /\bfemin|\bfem\b|\bmulher/.test(t);
  const masc = /\bmasculin|\bmasc\b|\bhomem\b|\bhomens\b/.test(t);
  if (fem && !masc) c.add('feminino');
  if (masc && !fem) c.add('masculino');
  if (/comissari/.test(t)) c.add('comissario');
  if (/\bcodigo\b|\bcupom\b/.test(t)) c.add('codigo');
  if (c.has('meia-social')) c.delete('meia');
  return CONDICOES.filter((x) => c.has(x));
}

// O código de quem indicou (passkey, cod, cupom) sai do link que vai ao
// público: é de uma pessoa, e o repositório e o app são públicos.
// Vale para todo link, de toda fonte (revisão de 24/11): os nomes que as
// plataformas e as curadoras usam para indicação e rastreio.
// Contato de pessoa (revisão de 24/11): @, e-mail, telefone com ou sem DDD,
// WhatsApp, link. Texto que casa com isso não vai ao público.
const CONTATO = /@[\w.]{2,}|[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/|www\.|wa\.me|\b(whats(app)?|zap|direct|dm|inbox)\b|\(?\d{2}\)?\s*9?\d{4}[-\s.]?\d{4}|\b9?\d{4}[-\s.]\d{4}\b/i;
const temContato = (v) => typeof v === 'string' && CONTATO.test(v);

const PARAMETROS_DE_CODIGO = /^(passkey|cod|codigo|code|coupon|cupom|d|ref|refcode|referral|aff|afiliado|affiliate|promoter|promo|vendedor|mp_rloc|mp_rtil|utm_.*|fbclid|gclid|igshid)$/i;
function semCodigo(v) {
  const u = url(v);
  if (!u) return null;
  const p = new URL(u);
  for (const k of [...p.searchParams.keys()]) if (PARAMETROS_DE_CODIGO.test(k)) p.searchParams.delete(k);
  return p.toString();
}

// "Hora Mágica (até 23:30)" -> "23:30"; "até 0h" -> "00:00"; "até as 1h"
// -> "01:00": a hora que o próprio nome do lote dá.
function ateDoNome(nome) {
  const m = semAcento(typeof nome === 'string' ? nome : '').match(/\bate (?:as |a )?([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)(?!\d)/);
  return m ? `${m[1].padStart(2, '0')}:${m[2] || m[3] || '00'}` : null;
}

function lotes(lista, avisos, fonte = null) {
  if (!Array.isArray(lista)) return null;
  const saida = [];
  for (const l of lista.slice(0, 12)) {
    const p = preco(l && l.preco);
    if (p === null) {
      avisos.push('lote sem preço válido ignorado');
      continue;
    }
    // Nome de lote com contato ("lista com @fulana") vira um nome neutro, fora do envio.
    const nomeLido = texto(l.nome, 80);
    const nomeLote = nomeLido && fonte !== 'envio' && temContato(nomeLido) ? (/lista/i.test(nomeLido) ? 'Lista' : 'Entrada') : nomeLido;
    const lote = {
      nome: nomeLote || `${saida.length + 1}º lote`,
      preco: p,
      disponivel: typeof l.disponivel === 'boolean' ? l.disponivel : null,
    };
    // Os mesmos nomes da base do protótipo: `taxa` em reais e `ate`, a hora em
    // que aquele preço deixa de valer.
    if (l.taxa !== undefined && l.taxa !== null) {
      const t = preco(l.taxa);
      // A taxa passa de R$ 200 em setor caro (15% de R$ 4.750); o que não
      // serve é taxa maior que o próprio ingresso.
      if (t !== null && t <= Math.max(200, p)) lote.taxa = t;
      else avisos.push('taxa de lote inválida ignorada');
    }
    if (l.ate !== undefined && l.ate !== null) {
      if (typeof l.ate === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(l.ate)) lote.ate = l.ate;
      else avisos.push('hora-limite de lote inválida ignorada');
    } else if (ateDoNome(l.nome)) lote.ate = ateDoNome(l.nome);
    const cs = condicoesDoLote(l.nome, l.condicoes);
    if (cs.length) lote.condicoes = cs;
    saida.push(lote);
  }
  return saida.length ? saida : null;
}

function idadeMinima(v) {
  if (Number.isInteger(v)) return v >= 0 && v <= 21 ? (v || null) : null;
  if (typeof v !== 'string') return null;
  const m = v.match(/(\d{1,2})/);
  if (!m) return null; // "Livre" e afins: sem idade mínima
  return idadeMinima(Number(m[1]));
}

// R16: a média só entra com origem declarada. Pelo envio, a produtora declara
// em qualquer das três origens; pelo link indicado, só vale o que a
// produtora publicou (origem "produtora", com o detalhe de onde).
function mediaIdade(v, fonte, avisos) {
  if (v === undefined || v === null) return null;
  if (fonte === 'indicacao') {
    const o = typeof v === 'object' ? v : {};
    if (o.origem !== 'produtora' || !texto(o.detalhe, 160)) {
      avisos.push('média de idade descartada: na indicação, só a declarada pela produtora, com o detalhe de onde (R16)');
      return null;
    }
  } else if (fonte !== 'envio') {
    avisos.push(`média de idade descartada: veio de "${fonte}", e só a produtora declara (R16)`);
    return null;
  }
  const o = typeof v === 'object' ? v : {};
  const valor = o.valor;
  if (!Number.isInteger(valor) || valor < 18 || valor > 60) {
    avisos.push('média de idade descartada: valor fora de 18 a 60');
    return null;
  }
  if (!ORIGENS_IDADE.includes(o.origem)) {
    avisos.push('média de idade descartada: sem origem declarada (R16)');
    return null;
  }
  const saida = { valor, origem: o.origem };
  if (o.origem === 'avaliacoes') {
    if (!Number.isInteger(o.avaliacoes) || o.avaliacoes < 5) {
      avisos.push('média de idade descartada: "avaliacoes" pede ao menos 5 avaliações');
      return null;
    }
    saida.avaliacoes = o.avaliacoes;
  }
  const detalhe = texto(o.detalhe, 160);
  if (o.origem === 'edicoes' && !detalhe) {
    avisos.push('média de idade descartada: "edicoes" pede o detalhe (quais edições)');
    return null;
  }
  if (detalhe) saida.detalhe = detalhe;
  return saida;
}

// A cidade, só do que a fonte diz: o campo `cidade`, o CEP da capital (01000
// a 05999 e 08000 a 08499), a cidade com a UF no endereço ("Cotia/SP",
// "Olinda - PE", "Pacaembu, São Paulo — SP"), ou um trecho "São Paulo" no
// endereço. Bairro de São Paulo seguido de SP ("Pinheiros - SP") é São Paulo;
// bairro sem UF não diz a cidade. Sem nada disso, null: o app não põe na lista
// de São Paulo o que não sabe se é de São Paulo. Os separadores são vírgula,
// hífen, travessão (– e —), barra e `|`.
const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
const SAO_PAULO = 'São Paulo';
const ehSaoPaulo = (t) => /^(?:sao paulo|sampa|sp)$/.test(semAcento(t).replace(/[\s.]+/g, ' ').trim());
// Cidades que aparecem como "casa" ou como o endereço inteiro (sem acento).
const CIDADES = {
  'sao paulo': SAO_PAULO, 'rio de janeiro': 'Rio de Janeiro', 'belo horizonte': 'Belo Horizonte', curitiba: 'Curitiba',
  'porto alegre': 'Porto Alegre', salvador: 'Salvador', recife: 'Recife', fortaleza: 'Fortaleza', brasilia: 'Brasília',
  campinas: 'Campinas', santos: 'Santos', guarulhos: 'Guarulhos', osasco: 'Osasco', cotia: 'Cotia', 'sao bernardo do campo': 'São Bernardo do Campo',
  'santo andre': 'Santo André', 'sao caetano do sul': 'São Caetano do Sul', barueri: 'Barueri', olinda: 'Olinda', niteroi: 'Niterói',
  florianopolis: 'Florianópolis', goiania: 'Goiânia', manaus: 'Manaus', belem: 'Belém', vitoria: 'Vitória', jundiai: 'Jundiaí',
  sorocaba: 'Sorocaba', 'ribeirao preto': 'Ribeirão Preto', 'sao jose dos campos': 'São José dos Campos',
};
const chaveDeTexto = (t) => semAcento(t).replace(/[^a-z0-9]+/g, ' ').trim();
// "São Paulo - SP", "Rio de Janeiro/RJ" -> a cidade; qualquer outro texto, null.
function nomeDeCidade(t) {
  const sem = String(t || '').replace(new RegExp(`\\s*[,/|–—-]\\s*(?:${UFS})\\s*$`), '');
  return CIDADES[chaveDeTexto(sem)] || null;
}

// { cidade, origem } com a origem 'fonte' (campo, UF no texto, trecho) ou 'cep'; ou null.
function cidadeComOrigem(b) {
  const declarada = texto(b.cidade, 80);
  if (declarada) {
    const semUf = declarada.replace(new RegExp(`\\s*[,/|–—-]?\\s*\\b(?:${UFS})$`), '').trim();
    if (ehSaoPaulo(declarada) || ehSaoPaulo(semUf)) return { cidade: SAO_PAULO, origem: 'fonte' };
    return { cidade: semUf || declarada, origem: 'fonte' };
  }
  const t = texto(b.endereco, 200);
  if (!t) return null;
  const cep = t.match(/\b(\d{5})-?\d{3}\b/);
  if (cep) {
    const n = Number(cep[1]);
    if ((n >= 1000 && n <= 5999) || (n >= 8000 && n <= 8499)) return { cidade: SAO_PAULO, origem: 'cep' };
  }
  const comUf = [...t.matchAll(new RegExp(`([A-Za-zÀ-ÿ'. ]{2,40}?)\\s*[/,|–—-]\\s*(${UFS})\\b(?![A-Za-zÀ-ÿ])`, 'g'))]
    .map((m) => ({ nome: m[1].trim(), uf: m[2] })).filter((c) => c.nome && !/\d/.test(c.nome)).pop();
  if (comUf) {
    if (ehSaoPaulo(comUf.nome)) return { cidade: SAO_PAULO, origem: 'fonte' };
    // "Consolação - SP": o bairro não é a cidade.
    if (acharBairro(comUf.nome)) return comUf.uf === 'SP' ? { cidade: SAO_PAULO, origem: 'fonte' } : null;
    return { cidade: comUf.nome, origem: 'fonte' };
  }
  // "Complexo Canindé, São Paulo", "Rua X, 10 São Paulo SP".
  const trechos = t.split(/\s*(?:[,|;()—]|\s[-–]\s)\s*/);
  if (trechos.some((x) => /^(?:\d[\d.]*\s+)?sao paulo(?:\s*[/-]?\s*sp)?$/.test(semAcento(x).trim()))) return { cidade: SAO_PAULO, origem: 'fonte' };
  // O endereço inteiro é o nome de uma cidade ("Rio de Janeiro").
  const inteira = nomeDeCidade(t);
  return inteira ? { cidade: inteira, origem: 'fonte' } : null;
}
const cidade = (b) => {
  const c = cidadeComOrigem(b);
  return c ? c.cidade : null;
};

// A casa como a fonte escreveu -> { casa, endereco }. Sai o `// handle`;
// cidade, UF, "online" e "a definir" não são casa; casa que começa por
// logradouro ("Alameda Barros, 376") é endereço, e "Nome, Rua X 12" separa o
// nome do endereço.
const LOGRADOURO = /^(?:r|rua|av|avenida|al|alameda|tv|travessa|pca|praca|lgo|largo|est|estrada|rod|rodovia|viela|pas|passagem)\b\.?(?:\s|$)/;
const SEM_LOCAL = /^(?:online|on line|a definir|a confirmar|local a definir|local a confirmar|em breve|tbd|n a|sem local)$/;
function limparCasa(v, cidadeDeclarada = null) {
  const t = texto(typeof v === 'string' ? v.replace(/\s*\/\/.*$/, '') : v, 120);
  if (!t) return { casa: null, endereco: null };
  const chave = chaveDeTexto(t);
  const semUf = t.replace(new RegExp(`\\s*[,/|–—-]\\s*(?:${UFS})\\s*$`), '');
  if (SEM_LOCAL.test(chave) || new RegExp(`^(?:${UFS})$`).test(t) || CIDADES[chaveDeTexto(semUf)]
    || (cidadeDeclarada && chaveDeTexto(cidadeDeclarada) === chave)) return { casa: null, endereco: null };
  if (LOGRADOURO.test(chave)) return { casa: null, endereco: t };
  const virgula = t.indexOf(',');
  if (virgula > 0) {
    const resto = t.slice(virgula + 1).trim();
    if (/\d/.test(resto)) return { casa: texto(t.slice(0, virgula), 120), endereco: texto(resto, 200) };
  }
  return { casa: t, endereco: null };
}

// "28.11", "29/11", "28/11/26": a data que a fonte põe no título da festa.
const DATA_NO_NOME = '(?:0?[1-9]|[12]\\d|3[01])[./](?:0?[1-9]|1[0-2])(?:[./](?:\\d{4}|\\d{2}))?';
const SIGLAS = new Set(['DJ', 'MC', 'VIP', 'USP', 'FAAP', 'PUC', 'SP', 'RJ', 'BH', 'UK', 'EUA', 'LGBT', 'LGBTQ', 'LGBTQIA', 'TBT', 'TV', 'NY', 'EDM', 'MPB', 'BR', 'DJS', 'IBT']);
const LIGACOES_DO_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'com']);
const TODA_EM_CAIXA_ALTA = /^[A-ZÀ-Ý0-9'’&.+-]*[A-ZÀ-Ý][A-ZÀ-Ý0-9'’&.+-]*$/;
const letras = (w) => (w.match(/[A-Za-zÀ-ÿ]/g) || []).length;
const ehSigla = (w) => SIGLAS.has(w.replace(/[^A-ZÀ-Ý]/g, '')) || (letras(w) <= 5 && !/[AEIOUÀ-Ý]/.test(w.replace(/[^A-ZÀ-Ý]/g, '')));
function capitalizar(w) {
  const m = w.toLowerCase();
  return m.replace(/(^|[-.+&])([a-zà-ÿ])/g, (_, a, c) => a + c.toUpperCase());
}
// Título em caixa alta vira caixa de título; siglas (DJ, USP) ficam, e uma
// palavra sozinha de até 4 letras também.
function caixaDeTitulo(nome) {
  const palavras = nome.split(' ');
  const saida = [...palavras];
  let i = 0;
  while (i < palavras.length) {
    if (!(TODA_EM_CAIXA_ALTA.test(palavras[i]) && letras(palavras[i]) >= 2)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < palavras.length && TODA_EM_CAIXA_ALTA.test(palavras[j]) && letras(palavras[j]) >= 2) j += 1;
    const corrida = j - i;
    if (corrida >= 2 || letras(palavras[i]) > 4) {
      for (let k = i; k < j; k += 1) {
        if (ehSigla(palavras[k])) continue;
        const baixa = palavras[k].toLowerCase();
        saida[k] = k > 0 && LIGACOES_DO_NOME.has(baixa) ? baixa : capitalizar(palavras[k]);
      }
    }
    i = j;
  }
  return saida.join(' ');
}
function limparNome(v) {
  const original = texto(v, 120);
  if (!original) return null;
  let t = original.replace(/\s*\/\/.*$/, '');
  t = t.replace(new RegExp(`^${DATA_NO_NOME}\\s*[-–—:|·•]\\s*`), '');
  t = t.replace(new RegExp(`\\s*[-–—|·•(]\\s*${DATA_NO_NOME}\\s*\\)?\\s*$`), '');
  t = t.replace(/\s+(?:0[1-9]|[12]\d|3[01])[./](?:0[1-9]|1[0-2])(?:[./]\d{2,4})?$/, '');
  t = t.replace(/\s*[-–—|·•:]\s*$/, '').trim();
  return t ? caixaDeTitulo(t) : original;
}

// Uma ponta do endereço que a fonte escreveu: só é endereço o que tem
// logradouro ou número ("Alameda Barros, 376", "Praça X, s/n"); "Interlagos",
// "República" e "São Paulo" são nomes de lugar, não endereço.
function ehEnderecoDeVerdade(t) {
  if (typeof t !== 'string') return false;
  if (ruaENumero(t)) return true;
  const c = chaveDeTexto(t);
  return /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|praca|pca|largo|lgo|estrada|est|rodovia|rod|viela|passagem)\b/.test(c)
    || /(?:^|\s)\d{1,5}(?:\s|$)/.test(c.replace(/\b\d{5}\s?\d{3}\b/g, ''));
}

// geo do bruto -> { lat, lng, precisao, origemGeo }, só dentro da caixa de São
// Paulo (lat −24,1 a −23,3; lng −47,0 a −46,3); fora dela, null.
const PRECISOES = ['casa', 'rua', 'bairro'];
function geo(g) {
  if (!g || typeof g !== 'object') return null;
  const lat = Number(g.lat !== undefined ? g.lat : g.latitude);
  const lng = Number(g.lng !== undefined ? g.lng : (g.lon !== undefined ? g.lon : g.longitude));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -24.1 || lat > -23.3 || lng < -47.0 || lng > -46.3) return null;
  return {
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    precisao: PRECISOES.includes(g.precisao) ? g.precisao : 'casa',
    origemGeo: 'pagina',
  };
}

// "Sessão de escuta" -> 'sessao-de-escuta'; fora de TIPOS_EVENTO, null.
function tipoDoEvento(v) {
  if (typeof v !== 'string') return null;
  const t = semAcento(v).replace(/[\s_]+/g, '-').replace(/[^a-z-]/g, '');
  return TIPOS_EVENTO.includes(t) ? t : null;
}

const idDaPlataforma = (v) => {
  const t = typeof v === 'number' && Number.isFinite(v) ? String(v) : (typeof v === 'string' ? v.trim() : '');
  return t && t.length <= 80 && /^[\w.:/-]+$/.test(t) ? t : null;
};

// As páginas que a leitura manual abriu, cada uma com o que é (página do
// ingresso, revenda, matéria, site oficial, Instagram) e o que se leu nela.
// O rodapé do app diz cada uma pelo nome; o preço diz de onde veio.
const TIPOS_PAGINA = ['ingresso', 'revenda', 'materia', 'oficial', 'instagram', 'outra'];
const CAMPOS_PAGINA = ['nome', 'produtora', 'casa', 'endereco', 'data', 'inicio', 'pistaCheia', 'fim', 'lotes', 'entradaNaPorta',
  'linkCompra', 'linkEvento', 'instagram', 'cartaz', 'lineup', 'estilos', 'idadeMinima', 'regras', 'ehFesta', 'descricao'];
function paginas(lista, avisos) {
  if (!Array.isArray(lista)) return null;
  const saida = [];
  for (const x of lista.slice(0, 12)) {
    const u = x && semCodigo(x.url);
    const quando = x && typeof x.lidoEm === 'string' && !Number.isNaN(Date.parse(x.lidoEm)) ? new Date(Date.parse(x.lidoEm)).toISOString() : null;
    if (!u || !quando || !TIPOS_PAGINA.includes(x.tipo)) {
      avisos.push('página lida sem link, hora ou tipo válido ignorada');
      continue;
    }
    const campos = Array.isArray(x.campos) ? [...new Set(x.campos.filter((c) => CAMPOS_PAGINA.includes(c)))] : [];
    // A mesma página lida duas vezes vira uma, com a leitura mais nova.
    const igual = saida.find((y) => y.url === u && y.tipo === x.tipo);
    if (igual) {
      igual.campos = [...new Set([...igual.campos, ...campos])];
      if (quando > igual.lidoEm) igual.lidoEm = quando;
      continue;
    }
    saida.push({ tipo: x.tipo, nome: texto(x.nome, 60), url: u, lidoEm: quando, campos });
  }
  saida.sort((a, b) => b.lidoEm.localeCompare(a.lidoEm));
  return saida.length ? saida : null;
}

// O bruto de qualquer fonte -> { campos, avisos }. Campo ausente não entra.
// `opcoes.lugares` injeta a lista de casas curadas (os testes); sem ela, vale
// config/lugares.json.
function normalizarItem(b, fonte, opcoes = {}) {
  const avisos = [];
  const c = {};
  const por = (k, v) => {
    if (v !== null && v !== undefined) c[k] = v;
  };
  const lugares = opcoes && Array.isArray(opcoes.lugares) ? opcoes.lugares : undefined;

  por('nome', limparNome(b.nome));
  if (b.produtora) {
    const p = typeof b.produtora === 'string' ? { nome: b.produtora } : b.produtora;
    const nome = texto(p.nome, 120);
    if (nome) por('produtora', { nome, instagram: instagram(p.instagram) });
  }

  // Casa, endereço, cidade e bairro. A casa que é cidade, UF ou endereço sai
  // do campo `casa`; o endereço só vale com logradouro ou número; o bairro tirado
  // do nome da casa ou de um nome de lugar sem endereço fica à parte
  // (`bairroDaCasa`) e só serve quando nenhuma fonte deu bairro (KTD3).
  const casa = limparCasa(b.casa, texto(b.cidade, 80));
  por('casa', casa.casa);
  const textoBruto = texto(b.endereco, 200) || texto(casa.endereco, 200);
  const cep = extrairCep(b.cep) || extrairCep(textoBruto);
  // O CEP do campo `cep` também diz a cidade (capital) como se estivesse no texto.
  const daCidade = cidadeComOrigem({ ...b, endereco: textoBruto && cep && !textoBruto.includes(cep) ? `${textoBruto} ${cep}` : (textoBruto || cep) });
  const endTexto = ehEnderecoDeVerdade(textoBruto) ? textoBruto : null;
  const perfil = typeof b.instagram === 'string' ? b.instagram
    : (b.produtora && typeof b.produtora === 'object' && typeof b.produtora.instagram === 'string' ? b.produtora.instagram : null);
  const lugar = acharLugar({ casa: casa.casa, endereco: textoBruto, instagram: perfil }, lugares);

  let cidadeFinal = daCidade;
  if (!cidadeFinal && casa.casa === null && typeof b.casa === 'string') {
    // "casa" que é nome de cidade serve de evidência da cidade.
    const nomeDaCasa = nomeDeCidade(b.casa.replace(/\s*\/\/.*$/, ''));
    if (nomeDaCasa) cidadeFinal = { cidade: nomeDaCasa, origem: 'fonte' };
  }
  if (!cidadeFinal && lugar && lugar.cidade) cidadeFinal = { cidade: lugar.cidade, origem: 'casa' };

  const forte = acharBairro(b.bairro, endTexto) || acharBairroPorCep(cep);
  const fraco = forte ? null : ((lugar && lugar.bairro ? { bairro: lugar.bairro, regiao: lugar.regiao || null, nome: lugar.bairroNome || null } : null)
    || acharBairro(textoBruto, casa.casa, b.casa));
  if (endTexto || cep || cidadeFinal || lugar) {
    por('endereco', {
      texto: endTexto,
      bairro: forte ? forte.bairro : null,
      bairroNome: forte ? forte.nome : null,
      regiao: forte ? forte.regiao : null,
      cidade: cidadeFinal ? cidadeFinal.cidade : null,
      cidadeOrigem: cidadeFinal ? cidadeFinal.origem : null,
      cep,
      lugar: lugar ? lugar.id : null,
    });
  }
  if (fraco) por('bairroDaCasa', { bairro: fraco.bairro, bairroNome: fraco.nome || null, regiao: fraco.regiao });
  por('geo', geo(b.geo));
  por('idPlataforma', idDaPlataforma(b.idPlataforma));
  por('tipo', tipoDoEvento(b.tipo));

  if (b.data !== undefined && b.data !== null && !dataValida(b.data)) avisos.push('data inválida');
  if (dataValida(b.data)) {
    por('data', b.data);
    const ini = minutos(b.inicio);
    por('inicio', horario(b.data, b.inicio));
    if (ini !== null) {
      por('pistaCheia', horario(b.data, b.pistaCheia, ini - 1));
      por('fim', horario(b.data, b.fim, ini));
    }
  }

  const ls = lotes(b.lotes, avisos, fonte);
  if (ls) por('lotes', ls);
  else if (b.preco !== undefined && preco(b.preco) !== null) por('lotes', [{ nome: 'Entrada', preco: preco(b.preco), disponivel: null }]);
  if (b.naPorta !== undefined && b.naPorta !== null) {
    const p = typeof b.naPorta === 'object' ? preco(b.naPorta.preco) : preco(b.naPorta);
    if (p !== null) por('entradaNaPorta', { preco: p });
  }

  // O link sai sem o código de quem indicou ou rastreia (semCodigo), venha de
  // onde vier; só o link que a própria produtora mandou fica como veio.
  const limpa = fonte === 'envio' ? url : semCodigo;
  por('linkCompra', limpa(b.linkCompra));
  por('linkEvento', limpa(b.linkEvento));
  por('paginas', paginas(b.paginas, avisos));
  por('instagram', instagram(b.instagram));
  // O cartaz não passa por aqui: a peça de divulgação vai por `item.imagens`
  // (imagens.js), com crédito e link da origem (M33, KTD6).
  if (Array.isArray(b.lineup)) {
    const nomes = b.lineup.map((n) => texto(n, 80)).filter(Boolean).slice(0, 30);
    if (nomes.length) por('lineup', nomes);
  }
  if (Array.isArray(b.estilos)) {
    const es = [...new Set(b.estilos.filter((e) => ESTILOS.includes(e)))];
    if (es.length) por('estilos', es);
    if (es.length < b.estilos.length) avisos.push('estilo fora do catálogo ignorado');
  }
  por('idadeMinima', idadeMinima(b.idadeMinima));
  const regras = {};
  for (const k of ['documento', 'vestimenta', 'lista']) {
    const v = texto(b[k] !== undefined ? b[k] : b.regras && b.regras[k], 160);
    if (v) regras[k] = v;
  }
  if (Object.keys(regras).length) por('regras', regras);
  por('mediaIdade', mediaIdade(b.mediaIdade, fonte, avisos));
  if (typeof b.ehFesta === 'boolean') por('ehFesta', b.ehFesta);
  if (b.exemplo === true) por('exemplo', true);

  return { campos: c, avisos };
}

// "Sexta Sem Pressa" + 2026-11-14 + semente -> "sexta-sem-pressa-20261114-a1b2"
function slug(t) {
  return semAcento(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function novoId(nome, data, semente) {
  const h = crypto.createHash('sha256').update(String(semente)).digest('hex').slice(0, 4);
  const dia = (data || '00000000').replace(/-/g, '');
  const base = slug(nome || 'festa').slice(0, 60 - dia.length - h.length - 2).replace(/-+$/, '') || 'festa';
  return `${base}-${dia}-${h}`;
}

module.exports = {
  normalizarItem, novoId, slug, temContato, CONTATO, preco, instagram, url, horario, idadeMinima, texto, cidade, cidadeComOrigem, limparNome, limparCasa,
  condicoesDoLote, ateDoNome, semCodigo, paginas,
  CONDICOES, CONDICOES_DE_PESSOA, TIPOS_PAGINA,
};

'use strict';
// Monta o registro de festa do R14 a partir dos valores por fonte (KTD2).
// Campo a campo vale a fonte de maior prioridade; no empate, a conferida por
// último. Cada campo leva a fonte e a hora em que foi conferido (R17), e um
// campo que nenhuma fonte trouxe sai null, nunca inventado (R12).

const { PRIORIDADE, NOME_FONTE, CAMPOS, prioridade } = require('./catalogo');
const { CONDICOES_DE_PESSOA } = require('./normalizar');
const { BAIRROS } = require('./bairros');
const agregar = require('./agregar');
const lugaresMod = require('./lugares');
const imagensMod = require('./imagens');

// /2 (19/11/2026): a cidade do endereço é a que a fonte diz (null quando
// não diz; a /1 gravava "São Paulo" fixo), e o registro traz `paginas`.
// /3 (24/11/2026, KTD1 do plano da prova de conceito): `dataDaNoite`,
// `idsAntigos`, o endereço com todas as chaves (coordenada, precisão, origem
// da cidade e do pino), `imagens` e `cartaz` (a peça principal), o vínculo de
// cada fonte com regra, escore e sinais, `divergencias`, `revisar` e o `tipo`
// na classificação. Sem `vendaAberta`. Nesta versão da fundação os campos
// novos saem com valores neutros; as lanes os preenchem (U6, U7, U17).
const VERSAO_CONTRATO = 'finde-r14/3';

const FUSO_MS = 3 * 3600e3; // São Paulo, sem horário de verão desde 2019

// A noite a que a festa pertence (KTD1): início antes das 6h conta como a
// noite anterior; sem início, a própria data. É a chave de dia do app e do
// bloco da correlação. "2026-11-28T00:30:00-03:00" -> "2026-11-27".
function dataDaNoite(data, inicio) {
  const t = typeof inicio === 'string' ? Date.parse(inicio) : NaN;
  if (!Number.isNaN(t)) {
    const local = new Date(t - FUSO_MS);
    if (local.getUTCHours() < 6) local.setUTCDate(local.getUTCDate() - 1);
    return local.toISOString().slice(0, 10);
  }
  return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

// O banco guarda instantes em UTC (comparáveis como texto); o registro sai no
// horário de São Paulo, "2026-11-10T13:30:00-03:00", como a base do protótipo.
function paraSP(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${new Date(t - 3 * 3600e3).toISOString().slice(0, 19)}-03:00`;
}

function escolher(linhas) {
  // linhas: [{ campo, fonte, valor, conferido_em }]. A prioridade do campo
  // (PRIORIDADE_CAMPO) vem antes da geral (KTD2).
  const porCampo = new Map();
  for (const l of linhas) {
    const atual = porCampo.get(l.campo);
    const p = prioridade(l.campo, l.fonte);
    if (!atual) {
      porCampo.set(l.campo, l);
      continue;
    }
    const pa = prioridade(atual.campo, atual.fonte);
    if (p > pa || (p === pa && l.conferido_em > atual.conferido_em)) porCampo.set(l.campo, l);
  }
  return porCampo;
}

// O "a partir de" (AE3 do plano do detalhe): o menor lote disponível que
// qualquer pessoa compra. Lote com condição (meia, meia social, gênero,
// comissário, código; normalizar.js) não conta: a FLOW sai pela inteira de
// R$ 440, não pela meia social de R$ 220. Quando todo lote aberto é por
// gênero, sai o mais alto (é o que vale para todo mundo no teto) e `genero`
// traz os dois. Quando só há lote com outra condição, sai o menor deles, com
// `condicoes` dizendo qual. Esgotado não conta, e diz quantos lotes mais
// baratos, sem condição, já esgotaram.
const GENEROS = ['feminino', 'masculino'];
const conds = (l) => (Array.isArray(l.condicoes) ? l.condicoes : []);
const dePessoa = (l) => conds(l).some((c) => CONDICOES_DE_PESSOA.includes(c));
const menorDe = (ls) => ls.slice().sort((a, b) => a.preco - b.preco)[0] || null;

function precoAPartirDe(lotes, porta) {
  if (Array.isArray(lotes) && lotes.length) {
    const abertos = lotes.filter((l) => l.disponivel !== false);
    if (abertos.length) {
      let escolhido = menorDe(abertos.filter((l) => !dePessoa(l)));
      let genero = null;
      if (!escolhido) {
        const soGenero = abertos.filter((l) => conds(l).every((c) => !CONDICOES_DE_PESSOA.includes(c) || GENEROS.includes(c)));
        const fem = menorDe(soGenero.filter((l) => conds(l).includes('feminino')));
        const masc = menorDe(soGenero.filter((l) => conds(l).includes('masculino')));
        if (fem && masc) {
          escolhido = fem.preco >= masc.preco ? fem : masc;
          genero = { feminino: { valor: fem.preco, lote: fem.nome }, masculino: { valor: masc.preco, lote: masc.nome } };
        } else escolhido = menorDe(abertos);
      }
      const esgotadosAntes = lotes.filter((l) => l.disponivel === false && !dePessoa(l) && l.preco < escolhido.preco).length;
      const saida = { valor: escolhido.preco, lote: escolhido.nome, esgotadosAntes };
      if (conds(escolhido).length && !genero) saida.condicoes = conds(escolhido);
      if (genero) saida.genero = genero;
      return saida;
    }
    if (!porta) return null;
  }
  if (porta) return { valor: porta.preco, lote: 'na porta', esgotadosAntes: 0 };
  return null;
}

// Coordenada com 5 casas (KTD1); fora de número, null.
const coord = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e5) / 1e5 : null);
const PRECISOES = ['casa', 'rua', 'bairro'];
const ORIGENS_CIDADE = ['fonte', 'cep', 'casa'];
const ORIGENS_GEO = ['curadoria', 'curado', 'pagina', 'nominatim'];

// O endereço do /3 com todas as chaves, sempre um objeto (KTD1), a partir de
// um endereço e de um geo já escolhidos.
function enderecoDoRegistro(e, geo) {
  const end = e && typeof e === 'object' ? e : {};
  const g = geo && typeof geo === 'object' ? geo : {};
  const bairro = typeof end.bairro === 'string' ? end.bairro : null;
  const cidade = typeof end.cidade === 'string' ? end.cidade : null;
  const lat = coord(g.lat);
  const lng = coord(g.lng);
  const comPonto = lat !== null && lng !== null;
  return {
    texto: typeof end.texto === 'string' ? end.texto : null,
    bairro,
    bairroNome: typeof end.bairroNome === 'string' ? end.bairroNome : (bairro && BAIRROS[bairro] ? BAIRROS[bairro].nome : null),
    regiao: typeof end.regiao === 'string' ? end.regiao : (bairro && BAIRROS[bairro] ? BAIRROS[bairro].regiao : null),
    cidade,
    cidadeOrigem: cidade ? (ORIGENS_CIDADE.includes(end.cidadeOrigem) ? end.cidadeOrigem : 'fonte') : null,
    cep: typeof end.cep === 'string' ? end.cep : null,
    lugar: typeof end.lugar === 'string' ? end.lugar : null,
    lat: comPonto ? lat : null,
    lng: comPonto ? lng : null,
    precisao: comPonto && PRECISOES.includes(g.precisao) ? g.precisao : null,
    origemGeo: comPonto && ORIGENS_GEO.includes(g.origemGeo) ? g.origemGeo : null,
    atribuicaoOsm: comPonto && (g.origemGeo === 'nominatim' || g.atribuicaoOsm === true),
  };
}

const ler = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const ordenarPor = (campo) => (a, b) => prioridade(campo, b.fonte) - prioridade(campo, a.fonte) || String(b.conferido_em).localeCompare(String(a.conferido_em));
const meta = (l) => (l ? { fonte: l.fonte, conferidoEm: paraSP(l.conferido_em) } : null);
const str = (x) => (typeof x === 'string' && x.trim() ? x : null);

// De onde veio o ponto, quando o geo não disse.
const ORIGEM_GEO_DA_FONTE = { curadoria: 'curadoria', curado: 'curado', nominatim: 'nominatim' };

// O endereço subcampo a subcampo (M27, KTD3): texto, cidade, bairro, CEP,
// lugar e coordenada, cada um da melhor fonte que o tem; um objeto só com
// nulos nunca vence um preenchido. A casa do cadastro curado (lugar,
// resolvido na leitura) completa o que faltar e dá o pino `casa`; a cidade
// dela vale como `cidadeOrigem: 'casa'` só quando nenhuma fonte disse a
// cidade (D6). -> { endereco, subcampos, principal }
function enderecoPorSubcampo(linhas, { casa = null, instagram = null, lugares } = {}) {
  const ends = linhas.filter((l) => l.campo === 'endereco').map((l) => ({ ...l, v: ler(l.valor) }))
    .filter((l) => l.v && typeof l.v === 'object').sort(ordenarPor('endereco'));
  const primeiro = (f) => ends.find((l) => f(l.v));
  const lTexto = primeiro((v) => str(v.texto));
  // A cidade que a fonte disse (pelo texto ou pelo CEP) vence a que a
  // normalização tirou da casa do cadastro (D6: a casa só confirma quando
  // nenhuma fonte disse a cidade).
  const lCidade = primeiro((v) => str(v.cidade) && v.cidadeOrigem !== 'casa') || primeiro((v) => str(v.cidade));
  const lBairro = primeiro((v) => str(v.bairro));
  const lCep = primeiro((v) => str(v.cep));
  const lLugar = primeiro((v) => str(v.lugar));
  const end = {
    texto: lTexto ? lTexto.v.texto : null,
    cidade: lCidade ? lCidade.v.cidade : null,
    cidadeOrigem: lCidade ? lCidade.v.cidadeOrigem : null,
    bairro: lBairro ? lBairro.v.bairro : null,
    bairroNome: lBairro ? str(lBairro.v.bairroNome) : null,
    regiao: lBairro ? str(lBairro.v.regiao) : null,
    cep: lCep ? lCep.v.cep : null,
    lugar: lLugar ? lLugar.v.lugar : null,
  };
  const subcampos = { texto: meta(lTexto), cidade: meta(lCidade), bairro: meta(lBairro), geo: null };

  // O bairro tirado só do nome da casa, quando nenhuma fonte deu bairro (KTD3).
  if (!end.bairro) {
    const lCasa = linhas.filter((l) => l.campo === 'bairroDaCasa').sort(ordenarPor('bairroDaCasa'))
      .map((l) => ({ ...l, v: ler(l.valor) })).find((l) => l.v);
    if (lCasa) {
      const v = typeof lCasa.v === 'string' ? { bairro: lCasa.v } : lCasa.v;
      if (str(v.bairro)) {
        end.bairro = v.bairro;
        end.bairroNome = str(v.bairroNome) || str(v.nome);
        end.regiao = str(v.regiao);
        subcampos.bairro = meta(lCasa);
      }
    }
  }

  // A casa do cadastro: a que a normalização achou ou, na leitura, pela casa.
  let lugar = null;
  try {
    lugar = (end.lugar && lugaresMod.lugarPorId(end.lugar, lugares)) || null;
    if (!lugar && (casa || end.texto)) lugar = lugaresMod.acharLugar({ casa, endereco: end.texto, instagram }, lugares) || null;
  } catch {
    lugar = null;
  }
  // O cadastro diz só o dia em que foi conferido: vale o começo dele em São Paulo.
  const conferidoDoCadastro = (d) => (!str(d) ? null : /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00-03:00` : paraSP(d));
  const doCadastro = lugar ? { fonte: 'curado', conferidoEm: conferidoDoCadastro(lugar.conferidoEm) } : null;
  if (lugar) {
    end.lugar = lugar.id;
    if (!end.texto && str(lugar.endereco)) {
      end.texto = lugar.endereco;
      subcampos.texto = doCadastro;
    }
    if (!end.bairro && str(lugar.bairro)) {
      end.bairro = lugar.bairro;
      end.bairroNome = str(lugar.bairroNome);
      end.regiao = str(lugar.regiao);
      subcampos.bairro = doCadastro;
    }
    if (!end.cep && str(lugar.cep)) end.cep = lugar.cep;
    if (!end.cidade && str(lugar.cidade)) {
      end.cidade = lugar.cidade;
      end.cidadeOrigem = 'casa';
      subcampos.cidade = doCadastro;
    }
  }

  // O ponto (M30): curadoria, casa curada, página, Nominatim (PRIORIDADE_CAMPO.geo).
  const geos = linhas.filter((l) => l.campo === 'geo').map((l) => ({ ...l, v: ler(l.valor) }))
    .filter((l) => l.v && coord(l.v.lat) !== null && coord(l.v.lng) !== null);
  if (lugar && coord(lugar.lat) !== null && coord(lugar.lng) !== null) {
    geos.push({
      campo: 'geo', fonte: 'curado', conferido_em: String(lugar.conferidoEm || ''),
      v: { lat: lugar.lat, lng: lugar.lng, precisao: PRECISOES.includes(lugar.precisao) ? lugar.precisao : 'casa', origemGeo: 'curado', atribuicaoOsm: lugar.fonteGeo === 'nominatim' },
    });
  }
  geos.sort(ordenarPor('geo'));
  const lGeo = geos[0] || null;
  let geo = null;
  if (lGeo) {
    geo = { ...lGeo.v, origemGeo: ORIGENS_GEO.includes(lGeo.v.origemGeo) ? lGeo.v.origemGeo : (ORIGEM_GEO_DA_FONTE[lGeo.fonte] || 'pagina') };
    subcampos.geo = lGeo.fonte === 'curado' ? doCadastro : meta(lGeo);
  }
  const endereco = enderecoDoRegistro(end, geo);
  const principal = lTexto || lCidade || lBairro || ends[0] || null;
  return { endereco, subcampos, principal: principal ? meta(principal) : (subcampos.texto || subcampos.cidade || subcampos.bairro || subcampos.geo) };
}

// As páginas lidas de todas as fontes, sem URL repetida: fica a leitura mais
// nova, com os campos das duas.
function paginasUnidas(linhas) {
  const porUrl = new Map();
  for (const l of linhas.filter((x) => x.campo === 'paginas').sort(ordenarPor('paginas'))) {
    for (const p of ler(l.valor) || []) {
      if (!p || typeof p.url !== 'string') continue;
      const atual = porUrl.get(p.url);
      if (!atual) porUrl.set(p.url, { ...p, campos: [...(p.campos || [])] });
      else {
        atual.campos = [...new Set([...atual.campos, ...(p.campos || [])])];
        if (String(p.lidoEm || '') > String(atual.lidoEm || '')) Object.assign(atual, { ...p, campos: atual.campos });
      }
    }
  }
  return [...porUrl.values()].sort((a, b) => String(b.lidoEm || '').localeCompare(String(a.lidoEm || '')))
    .map((p) => ({ ...p, lidoEm: paraSP(p.lidoEm) }));
}

// Onde as fontes discordam (KTD1): preço a partir de, início, data, casa e
// link de compra, comparados já normalizados. Uma linha por fonte, a de
// maior prioridade primeiro.
const CAMPOS_DIVERGENCIA = ['precoAPartirDe', 'inicio', 'data', 'casa', 'linkCompra'];
function divergenciasDe(linhas) {
  const porFonte = new Map();
  for (const l of linhas) {
    if (!porFonte.has(l.fonte)) porFonte.set(l.fonte, {});
    porFonte.get(l.fonte)[l.campo] = l;
  }
  const saida = [];
  for (const campo of CAMPOS_DIVERGENCIA) {
    const valores = [];
    for (const [fonte, ls] of porFonte) {
      let valor = null;
      let chave = null;
      let quando = null;
      if (campo === 'precoAPartirDe') {
        if (!ls.lotes && !ls.entradaNaPorta) continue;
        const p = precoAPartirDe(ls.lotes ? ler(ls.lotes.valor) : null, ls.entradaNaPorta ? ler(ls.entradaNaPorta.valor) : null);
        if (!p) continue;
        valor = p.valor;
        chave = String(p.valor);
        quando = (ls.lotes || ls.entradaNaPorta).conferido_em;
      } else {
        if (!ls[campo]) continue;
        valor = ler(ls[campo].valor);
        if (typeof valor !== 'string' || !valor) continue;
        if (campo === 'casa') {
          if (agregar.casaVazia(valor)) continue;
          chave = agregar.semAcento(valor).replace(/[^a-z0-9]+/g, '');
        } else if (campo === 'linkCompra') chave = agregar.linkComparavel(valor) || valor;
        else chave = valor;
        quando = ls[campo].conferido_em;
      }
      valores.push({ fonte, valor, chave, quando });
    }
    if (new Set(valores.map((x) => x.chave)).size < 2) continue;
    valores.sort((a, b) => prioridade(campo, b.fonte) - prioridade(campo, a.fonte) || String(b.quando).localeCompare(String(a.quando)));
    saida.push({ campo, valores: valores.map((x) => ({ fonte: x.fonte, valor: x.valor, conferidoEm: paraSP(x.quando) })) });
  }
  return saida;
}

// As fontes que leem se é festa pelo modelo, e as plataformas que só dão o rótulo (KTD2).
const FONTES_DO_MODELO = ['claude', 'instagram', 'paginas'];
const ehPlataforma = (fonte) => prioridade('ehFesta', fonte) === 20;
const decimal = (n) => String(n).replace('.', ',');

// O que pede olho humano (KTD1): plataforma contra modelo no `ehFesta`, casa
// que é cidade, sem cidade, candidato a fusão, e o que o reprocessar marcou.
function revisarDe(linhas, endereco, candidatos = []) {
  const saida = [];
  const interno = linhas.find((l) => l.campo === 'revisar' && l.fonte === 'reprocessar');
  for (const x of (interno && ler(interno.valor)) || []) if (x && x.motivo) saida.push({ motivo: x.motivo, detalhe: x.detalhe || null });
  const ehFesta = linhas.filter((l) => l.campo === 'ehFesta').map((l) => ({ fonte: l.fonte, v: ler(l.valor) })).filter((l) => typeof l.v === 'boolean');
  const plat = ehFesta.filter((l) => ehPlataforma(l.fonte));
  const modelo = ehFesta.filter((l) => FONTES_DO_MODELO.includes(l.fonte));
  for (const p of plat) {
    const contra = modelo.find((m) => m.v !== p.v);
    if (contra) {
      saida.push({ motivo: 'plataforma-contra-modelo', detalhe: `${p.fonte} diz ${p.v ? 'festa' : 'não festa'}; ${contra.fonte} diz ${contra.v ? 'festa' : 'não festa'}` });
      break;
    }
  }
  const casas = linhas.filter((l) => l.campo === 'casa').map((l) => ({ fonte: l.fonte, v: ler(l.valor) }));
  const cidade = casas.find((c) => agregar.casaQueECidade(c.v));
  if (cidade) saida.push({ motivo: 'casa-e-cidade', detalhe: `casa "${cidade.v}" (${cidade.fonte})` });
  if (!endereco.cidade) saida.push({ motivo: 'sem-cidade', detalhe: 'nenhuma fonte disse a cidade' });
  for (const c of candidatos) saida.push({ motivo: 'candidato-a-fusao', detalhe: `escore ${decimal(c.escore)} com ${c.outra}` });
  return saida;
}

// O vínculo de uma fonte com a festa (KTD5): regra, escore e sinais. Coluna
// vazia (vínculo anterior ao /3) sai como 'nova'.
function vinculoDe(x) {
  let sinais = [];
  if (typeof x.motivo === 'string' && x.motivo) {
    try {
      const m = JSON.parse(x.motivo);
      if (Array.isArray(m)) sinais = m;
      else if (m && Array.isArray(m.sinais)) sinais = m.sinais;
    } catch {
      sinais = [];
    }
  }
  return { regra: x.regra || 'nova', escore: typeof x.escore === 'number' ? x.escore : null, sinais };
}

// As imagens da festa com a principal marcada (KTD9); a principal é o cartaz.
function imagensComPrincipal(imagens) {
  const lista = Array.isArray(imagens) ? imagens.filter(Boolean) : [];
  if (!lista.length) return { lista: [], cartaz: null };
  let principal = null;
  try {
    principal = imagensMod.escolherPrincipal(lista);
  } catch {
    principal = null;
  }
  const idDe = (x) => x && (x.id || x.sha);
  const marcadas = lista.map((x) => ({ ...x, principal: Boolean(principal) && idDe(x) === idDe(principal) }));
  // O cartaz é o mesmo item da lista (mesma forma, conferidoEm em -03:00), não
  // o que escolherPrincipal devolve.
  return { lista: marcadas, cartaz: marcadas.find((x) => x.principal) || null };
}

// montarRegistro(festa, linhasValores, vinculos, extra?) -> registro /3.
// extra: { idsAntigos, imagens, candidatos: [{ escore, outra }], lugares } (listarRegistros lê do banco).
function montarRegistro(festa, linhasValores, vinculos, extra = {}) {
  const escolhidos = escolher(linhasValores);
  const v = (campo) => {
    const l = escolhidos.get(campo);
    return l ? JSON.parse(l.valor) : null;
  };
  const campos = {};
  for (const campo of CAMPOS) {
    const l = escolhidos.get(campo);
    if (l) campos[campo] = meta(l);
  }
  const { endereco, subcampos, principal } = enderecoPorSubcampo(linhasValores, { casa: v('casa'), instagram: v('instagram'), lugares: extra.lugares });
  delete campos.endereco;
  if (Object.values(subcampos).some(Boolean)) campos.endereco = { ...principal, subcampos };
  const lotes = v('lotes');
  const porta = v('entradaNaPorta');
  const fontes = vinculos
    .slice()
    .sort((a, b) => (PRIORIDADE[b.fonte] || 0) - (PRIORIDADE[a.fonte] || 0))
    .map((x) => ({ id: x.fonte, nome: NOME_FONTE[x.fonte] || x.fonte, url: x.url || null, conferidoEm: paraSP(x.visto_em), vinculo: vinculoDe(x) }));
  const coletadoEm = paraSP(vinculos.reduce((m, x) => (x.visto_em > m ? x.visto_em : m), '') || null);
  const classif = escolhidos.get('estilos') || escolhidos.get('ehFesta') || escolhidos.get('tipo');
  const tipo = v('tipo');
  const data = v('data');
  const imagensDoRegistro = imagensComPrincipal(extra.imagens);
  const inicio = v('inicio');

  return {
    contrato: VERSAO_CONTRATO,
    id: festa.id,
    nome: v('nome'),
    produtora: v('produtora'),
    casa: v('casa'),
    endereco,
    data,
    dataDaNoite: dataDaNoite(data, inicio),
    inicio,
    pistaCheia: v('pistaCheia'),
    fim: v('fim'),
    lotes: lotes || [],
    precoAPartirDe: precoAPartirDe(lotes, porta),
    esgotado: Array.isArray(lotes) && lotes.length > 0 && lotes.every((l) => l.disponivel === false) && !porta,
    entradaNaPorta: porta,
    linkCompra: v('linkCompra'),
    linkEvento: v('linkEvento'),
    instagram: v('instagram'),
    // As peças de divulgação guardadas (KTD6, KTD9) e a principal.
    imagens: imagensDoRegistro.lista,
    cartaz: imagensDoRegistro.cartaz,
    // As páginas que todas as fontes abriram, sem URL repetida: [{ tipo, nome, url, lidoEm, campos }].
    paginas: paginasUnidas(linhasValores),
    lineup: v('lineup'), // null = lineup ainda não divulgado
    estilos: v('estilos') || [],
    idadeMinima: v('idadeMinima'),
    regras: v('regras') || {},
    mediaIdade: v('mediaIdade'), // null = ainda não informada (R16)
    ehFesta: v('ehFesta'),
    exemplo: v('exemplo') === true, // dado fictício de demonstração
    // Quem decidiu o estilo (ou, sem estilo, se é festa): a fonte, o Claude ou
    // as regras; e o que o evento é, quando alguém disse (festa, show, leitura...).
    classificacao: classif ? { por: classif.fonte, conferidoEm: paraSP(classif.conferido_em), tipo: typeof tipo === 'string' ? tipo : null } : null,
    fontes,
    // Campos em que as fontes discordam; ids de festas absorvidas por esta
    // (festas_alias); motivos para olho humano. O app ignora `revisar`.
    divergencias: divergenciasDe(linhasValores),
    idsAntigos: Array.isArray(extra.idsAntigos) ? extra.idsAntigos.slice() : [],
    revisar: revisarDe(linhasValores, endereco, extra.candidatos || []),
    coletadoEm,
    campos,
  };
}

// A curadoria ocultou a festa (KTD12): fica fora da lista, salvo `todas`.
function oculta(linhasValores) {
  const l = escolher(linhasValores).get('oculta');
  if (!l) return false;
  try {
    return Boolean(JSON.parse(l.valor));
  } catch {
    return false;
  }
}

// A cidade é São Paulo? (para o corte padrão do export)
const ehSP = (c) => /^sao paulo$/.test(agregar.semAcento(c).replace(/[^a-z]+/g, ' ').replace(/\b(sp)\b/g, '').trim());

// Os ids que viraram apelido de cada festa, seguindo a cadeia (festas_alias).
function apelidosPorFesta(db) {
  const filhos = new Map();
  for (const r of db.prepare('SELECT antigo, novo FROM festas_alias').all()) {
    if (!filhos.has(r.novo)) filhos.set(r.novo, []);
    filhos.get(r.novo).push(r.antigo);
  }
  return (id) => {
    const saida = [];
    const fila = [...(filhos.get(id) || [])];
    const vistos = new Set([id]);
    while (fila.length) {
      const x = fila.shift();
      if (vistos.has(x)) continue;
      vistos.add(x);
      saida.push(x);
      fila.push(...(filhos.get(x) || []));
    }
    return saida.sort();
  };
}

// Lê do banco. Filtros: de/ate (AAAA-MM-DD, pela data da festa), todas (inclui
// o que a classificação disse que não é festa, o que a curadoria ocultou e o
// que é de fora de São Paulo), soSP (padrão: festa com cidade conhecida fora
// de São Paulo fica fora, M31), ids, lugares (o cadastro, nos testes).
function listarRegistros(db, { de = null, ate = null, todas = false, ids = null, soSP = true, lugares } = {}) {
  const onde = [];
  const args = [];
  if (de) {
    onde.push('data >= ?');
    args.push(de);
  }
  if (ate) {
    onde.push('data <= ?');
    args.push(ate);
  }
  if (ids) {
    onde.push(`id IN (${ids.map(() => '?').join(',')})`);
    args.push(...ids);
  }
  const festas = db.prepare(`SELECT id, data FROM festas ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''} ORDER BY data, id`).all(...args);
  const qValores = db.prepare('SELECT campo, fonte, valor, conferido_em FROM valores WHERE festa_id = ?');
  // As colunas regra, escore e motivo vêm da linha mais recente de cada (fonte, url).
  const qVinculos = db.prepare('SELECT fonte, url, MAX(visto_em) AS visto_em, regra, escore, motivo FROM vinculos WHERE festa_id = ? GROUP BY fonte, url');
  // Os candidatos a fusão dos dois lados: a festa de um item desta, ou esta de um item de outra.
  const qCand = db.prepare(`SELECT c.escore, c.festa_id AS outra FROM candidatos c JOIN vinculos v ON v.fonte = c.fonte AND v.id_externo = c.id_externo WHERE v.festa_id = ?
    UNION SELECT c.escore, v.festa_id AS outra FROM candidatos c JOIN vinculos v ON v.fonte = c.fonte AND v.id_externo = c.id_externo WHERE c.festa_id = ?`);
  const apelidos = apelidosPorFesta(db);
  const saida = [];
  for (const f of festas) {
    const linhas = qValores.all(f.id);
    const escondida = oculta(linhas);
    if (!todas && escondida) continue;
    let imagens = [];
    try {
      imagens = imagensMod.imagensDaFesta(db, f.id) || [];
    } catch {
      imagens = [];
    }
    const candidatos = [];
    for (const c of qCand.all(f.id, f.id)) if (c.outra !== f.id && !candidatos.some((x) => x.outra === c.outra)) candidatos.push(c);
    const r = montarRegistro(f, linhas, qVinculos.all(f.id), { idsAntigos: apelidos(f.id), imagens, candidatos, lugares });
    // Com `todas`, a oculta vem marcada: quem lê o export inteiro (o app) a deixa fora.
    if (escondida) r.oculta = true;
    if (!todas && r.ehFesta === false) continue;
    if (!todas && soSP && r.endereco.cidade && !ehSP(r.endereco.cidade)) continue;
    saida.push(r);
  }
  saida.sort((a, b) => String(a.inicio || a.data).localeCompare(String(b.inicio || b.data)));
  return saida;
}

module.exports = {
  montarRegistro, listarRegistros, precoAPartirDe, escolher, paraSP, dataDaNoite, enderecoDoRegistro, enderecoPorSubcampo, divergenciasDe, revisarDe, paginasUnidas,
  VERSAO_CONTRATO,
};

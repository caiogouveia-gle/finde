'use strict';
// Monta o registro de festa do R14 a partir dos valores por fonte (KTD2).
// Campo a campo vale a fonte de maior prioridade; no empate, a conferida por
// último. Cada campo leva a fonte e a hora em que foi conferido (R17), e um
// campo que nenhuma fonte trouxe sai null, nunca inventado (R12).

const { PRIORIDADE, NOME_FONTE, CAMPOS } = require('./catalogo');
const { CONDICOES_DE_PESSOA } = require('./normalizar');

// /2 (19/11/2026): a cidade do endereço é a que a fonte diz (null quando
// não diz; a /1 gravava "São Paulo" fixo), e o registro traz `paginas`.
const VERSAO_CONTRATO = 'finde-r14/2';

// O banco guarda instantes em UTC (comparáveis como texto); o registro sai no
// horário de São Paulo, "2026-11-10T13:30:00-03:00", como a base do protótipo.
function paraSP(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${new Date(t - 3 * 3600e3).toISOString().slice(0, 19)}-03:00`;
}

function escolher(linhas) {
  // linhas: [{ campo, fonte, valor, conferido_em }]
  const porCampo = new Map();
  for (const l of linhas) {
    const atual = porCampo.get(l.campo);
    const p = PRIORIDADE[l.fonte] || 0;
    if (!atual) {
      porCampo.set(l.campo, l);
      continue;
    }
    const pa = PRIORIDADE[atual.fonte] || 0;
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

function montarRegistro(festa, linhasValores, vinculos) {
  const escolhidos = escolher(linhasValores);
  const v = (campo) => {
    const l = escolhidos.get(campo);
    return l ? JSON.parse(l.valor) : null;
  };
  const campos = {};
  for (const campo of CAMPOS) {
    const l = escolhidos.get(campo);
    if (l) campos[campo] = { fonte: l.fonte, conferidoEm: paraSP(l.conferido_em) };
  }
  const lotes = v('lotes');
  const porta = v('entradaNaPorta');
  const fontes = vinculos
    .slice()
    .sort((a, b) => (PRIORIDADE[b.fonte] || 0) - (PRIORIDADE[a.fonte] || 0))
    .map((x) => ({ id: x.fonte, nome: NOME_FONTE[x.fonte] || x.fonte, url: x.url || null, conferidoEm: paraSP(x.visto_em) }));
  const coletadoEm = paraSP(vinculos.reduce((m, x) => (x.visto_em > m ? x.visto_em : m), '') || null);
  const classif = escolhidos.get('estilos') || escolhidos.get('ehFesta');

  return {
    contrato: VERSAO_CONTRATO,
    id: festa.id,
    nome: v('nome'),
    produtora: v('produtora'),
    casa: v('casa'),
    endereco: v('endereco'),
    data: v('data'),
    inicio: v('inicio'),
    pistaCheia: v('pistaCheia'),
    fim: v('fim'),
    lotes: lotes || [],
    precoAPartirDe: precoAPartirDe(lotes, porta),
    esgotado: Array.isArray(lotes) && lotes.length > 0 && lotes.every((l) => l.disponivel === false) && !porta,
    entradaNaPorta: porta,
    linkCompra: v('linkCompra'),
    linkEvento: v('linkEvento'),
    instagram: v('instagram'),
    cartaz: v('cartaz'),
    // As páginas que a leitura manual abriu: [{ tipo, nome, url, lidoEm, campos }].
    paginas: (v('paginas') || []).map((p) => ({ ...p, lidoEm: paraSP(p.lidoEm) })),
    lineup: v('lineup'), // null = lineup ainda não divulgado
    estilos: v('estilos') || [],
    idadeMinima: v('idadeMinima'),
    regras: v('regras') || {},
    mediaIdade: v('mediaIdade'), // null = ainda não informada (R16)
    ehFesta: v('ehFesta'),
    exemplo: v('exemplo') === true, // dado fictício de demonstração
    // Quem decidiu o estilo (ou, sem estilo, se é festa): a fonte, o Claude ou as regras.
    classificacao: classif ? { por: classif.fonte, conferidoEm: paraSP(classif.conferido_em) } : null,
    fontes,
    coletadoEm,
    campos,
  };
}

// Lê do banco. Filtros: de/ate (AAAA-MM-DD, pela data da festa), todas (inclui
// o que a classificação disse que não é festa).
function listarRegistros(db, { de = null, ate = null, todas = false, ids = null } = {}) {
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
  const qVinculos = db.prepare('SELECT fonte, url, MAX(visto_em) AS visto_em FROM vinculos WHERE festa_id = ? GROUP BY fonte, url');
  const saida = [];
  for (const f of festas) {
    const r = montarRegistro(f, qValores.all(f.id), qVinculos.all(f.id));
    if (!todas && r.ehFesta === false) continue;
    saida.push(r);
  }
  saida.sort((a, b) => String(a.inicio || a.data).localeCompare(String(b.inicio || b.data)));
  return saida;
}

module.exports = { montarRegistro, listarRegistros, precoAPartirDe, escolher, paraSP, VERSAO_CONTRATO };

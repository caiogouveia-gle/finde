'use strict';
// O vocabulário que o motor divide com o protótipo (prototipo/v1-festas/nucleo/catalogo.js):
// os ids de estilo e as origens da média de idade. Mudança aqui é mudança no
// contrato R14 e se combina com a frente visual.

const ESTILOS = ['house-disco', 'pop-2000', 'mpb-samba', 'funk', 'indie-rock', 'eletronica'];

// De onde a média de idade pode vir (R5 e R16 do plano do detalhe). Só o envio
// da produtora traz média; o motor não estima.
const ORIGENS_IDADE = ['produtora', 'edicoes', 'avaliacoes'];

// Peso de cada fonte quando duas dizem coisas diferentes do mesmo campo (KTD2).
// curadoria (D7) passa todas; avaliacoes só traz mediaIdade (KTD2 do plano de 24/11).
const PRIORIDADE = {
  curadoria: 110,
  envio: 100,
  avaliacoes: 90,
  ical: 80,
  'sympla-apify': 75,
  'shotgun-apify': 75,
  paginas: 72,
  indicacao: 70,
  'ra-apify': 65,
  'mapas-culturais': 60,
  claude: 40,
  instagram: 50,
  regras: 20,
};

// Prioridade de um campo só, consultada antes da geral (escolher, contrato.js).
// ehFesta e tipo: depois da U12 o Instagram e as páginas gravam a leitura do
// modelo, que vence as regras e o rótulo da plataforma. geo: a casa curada
// (resolvida na leitura, `curado`) vence a página, que vence o Nominatim.
const PRIORIDADE_SE_E_FESTA = {
  curadoria: 110,
  envio: 100,
  indicacao: 90,
  claude: 80,
  instagram: 80,
  paginas: 80,
  regras: 30,
  'sympla-apify': 20,
  'shotgun-apify': 20,
  'ra-apify': 20,
};
const PRIORIDADE_CAMPO = {
  ehFesta: PRIORIDADE_SE_E_FESTA,
  tipo: PRIORIDADE_SE_E_FESTA,
  geo: { curadoria: 110, curado: 100, paginas: 72, nominatim: 30 },
};

// A prioridade de uma fonte num campo: a do campo, se houver, senão a geral.
function prioridade(campo, fonte) {
  const doCampo = PRIORIDADE_CAMPO[campo];
  if (doCampo && Object.hasOwn(doCampo, fonte)) return doCampo[fonte];
  return PRIORIDADE[fonte] || 0;
}

// Como cada fonte aparece no rodapé do detalhe (R12 do plano do detalhe).
const NOME_FONTE = {
  envio: 'Enviado pela produtora',
  ical: 'Agenda da produtora',
  // Um link lido à mão na página pública do ingresso (fontes/indicacao.js).
  indicacao: 'Lido na página do ingresso',
  'mapas-culturais': 'Mapa da Cultura',
  // Prova de conceito acadêmica (docs/pesquisa/2026-11-24-arquitetura-hibrida.md).
  'sympla-apify': 'Página da Sympla',
  'shotgun-apify': 'Página do Shotgun',
  'ra-apify': 'Resident Advisor',
  paginas: 'Página lida no navegador',
  instagram: 'Post no Instagram',
  claude: 'Classificação automática (Claude)',
  regras: 'Classificação por regras',
  curadoria: 'Corrigido pela curadoria do Finde',
  avaliacoes: 'Avaliações de quem foi',
  nominatim: 'OpenStreetMap',
};

// Os campos que uma fonte pode gravar em `valores`, na ordem do R14, com os
// do contrato /3 (KTD3 do plano de 24/11): `tipo` (festa, show, leitura...),
// `geo` ({ lat, lng, precisao, origemGeo }), `bairroDaCasa` (o bairro tirado
// só do nome da casa), `idPlataforma` (só correlação) e `oculta` (curadoria).
// CEP, cidade, `cidadeOrigem` e `lugar` vão dentro de `endereco`. O `cartaz`
// saiu: a imagem vai por `item.imagens` e pelas tabelas de imagens (KTD6).
const CAMPOS = [
  'nome', 'produtora', 'casa', 'endereco', 'data', 'inicio', 'pistaCheia', 'fim',
  'lotes', 'entradaNaPorta', 'linkCompra', 'linkEvento', 'instagram',
  'lineup', 'estilos', 'idadeMinima', 'regras', 'mediaIdade', 'ehFesta', 'tipo', 'exemplo',
  'geo', 'bairroDaCasa', 'idPlataforma', 'oculta',
];

// O que o modelo diz que o evento é (KTD1: classificacao.tipo).
const TIPOS_EVENTO = ['festa', 'show', 'leitura', 'sessao-de-escuta', 'feira', 'outro'];

module.exports = { ESTILOS, ORIGENS_IDADE, PRIORIDADE, PRIORIDADE_CAMPO, prioridade, NOME_FONTE, CAMPOS, TIPOS_EVENTO };

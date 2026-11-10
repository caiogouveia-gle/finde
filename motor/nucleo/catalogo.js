'use strict';
// O vocabulário que o motor divide com o protótipo (prototipo/v1-festas/nucleo/catalogo.js):
// os ids de estilo e as origens da média de idade. Mudança aqui é mudança no
// contrato R14 e se combina com a frente visual.

const ESTILOS = ['house-disco', 'pop-2000', 'mpb-samba', 'funk', 'indie-rock', 'eletronica'];

// De onde a média de idade pode vir (R5 e R16 do plano do detalhe). Só o envio
// da produtora traz média; o motor não estima.
const ORIGENS_IDADE = ['produtora', 'edicoes', 'avaliacoes'];

// Peso de cada fonte quando duas dizem coisas diferentes do mesmo campo (KTD2).
const PRIORIDADE = {
  envio: 100,
  ical: 80,
  'mapas-culturais': 60,
  claude: 40,
  regras: 20,
};

// Como cada fonte aparece no rodapé do detalhe (R12 do plano do detalhe).
const NOME_FONTE = {
  envio: 'Enviado pela produtora',
  ical: 'Agenda da produtora',
  'mapas-culturais': 'Mapa da Cultura',
  claude: 'Classificação automática (Claude)',
  regras: 'Classificação por regras',
};

// Os campos que um registro pode ter, na ordem do R14.
const CAMPOS = [
  'nome', 'produtora', 'casa', 'endereco', 'data', 'inicio', 'pistaCheia', 'fim',
  'lotes', 'entradaNaPorta', 'linkCompra', 'linkEvento', 'instagram', 'cartaz',
  'lineup', 'estilos', 'idadeMinima', 'regras', 'mediaIdade', 'ehFesta', 'exemplo',
];

module.exports = { ESTILOS, ORIGENS_IDADE, PRIORIDADE, NOME_FONTE, CAMPOS };

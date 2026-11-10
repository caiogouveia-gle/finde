'use strict';
// Bairros de São Paulo que o motor reconhece num endereço, cada um com a região.
// Os sete do protótipo (pinheiros, vila-madalena, barra-funda, centro, bela-vista,
// jardins, vila-mariana) mantêm o mesmo id e a mesma região de lá; os outros
// entram com a região administrativa mais próxima. Puro.

const REGIOES = {
  oeste: 'Zona Oeste',
  centro: 'Centro',
  'centro-sul': 'Centro-Sul',
  norte: 'Zona Norte',
  sul: 'Zona Sul',
  leste: 'Zona Leste',
};

// id -> { nome, regiao, nomes: outras grafias e sub-bairros que apontam para ele }
const BAIRROS = {
  pinheiros: { nome: 'Pinheiros', regiao: 'oeste', nomes: ['largo da batata', 'alto de pinheiros'] },
  'vila-madalena': { nome: 'Vila Madalena', regiao: 'oeste', nomes: ['sumarezinho'] },
  'barra-funda': { nome: 'Barra Funda', regiao: 'oeste', nomes: ['agua branca'] },
  centro: { nome: 'Centro', regiao: 'centro', nomes: ['republica', 'se', 'santa cecilia', 'campos eliseos', 'luz', 'bom retiro', 'higienopolis', 'vila buarque', 'centro historico'] },
  'bela-vista': { nome: 'Bela Vista', regiao: 'centro', nomes: ['bixiga', 'consolacao', 'liberdade', 'cerqueira cesar', 'augusta', 'paulista'] },
  jardins: { nome: 'Jardins', regiao: 'centro-sul', nomes: ['jardim paulista', 'jardim america', 'jardim europa', 'itaim bibi', 'itaim', 'vila olimpia'] },
  'vila-mariana': { nome: 'Vila Mariana', regiao: 'centro-sul', nomes: ['moema', 'paraiso', 'ibirapuera', 'aclimacao', 'saude'] },
  perdizes: { nome: 'Perdizes', regiao: 'oeste', nomes: ['pompeia', 'vila pompeia'] },
  lapa: { nome: 'Lapa', regiao: 'oeste', nomes: ['vila leopoldina'] },
  butanta: { nome: 'Butantã', regiao: 'oeste', nomes: [] },
  'santana': { nome: 'Santana', regiao: 'norte', nomes: ['tucuruvi', 'casa verde'] },
  mooca: { nome: 'Mooca', regiao: 'leste', nomes: ['bras', 'belenzinho', 'tatuape', 'cambuci'] },
  'santo-amaro': { nome: 'Santo Amaro', regiao: 'sul', nomes: ['brooklin', 'campo belo', 'chacara santo antonio'] },
};

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Índice de nomes, do mais longo para o mais curto, para "vila madalena" ganhar de "madalena".
const INDICE = Object.entries(BAIRROS)
  .flatMap(([id, b]) => [semAcento(b.nome), ...b.nomes].map((n) => [n, id]))
  .sort((a, b) => b[0].length - a[0].length);

// Acha o bairro num texto livre (endereço, nome de bairro). Devolve { bairro, regiao } ou null.
function acharBairro(...textos) {
  for (const t of textos) {
    const limpo = ` ${semAcento(t).replace(/[^a-z0-9]+/g, ' ')} `;
    for (const [nome, id] of INDICE) {
      if (limpo.includes(` ${nome} `)) return { bairro: id, regiao: BAIRROS[id].regiao };
    }
  }
  return null;
}

module.exports = { BAIRROS, REGIOES, acharBairro, semAcento };

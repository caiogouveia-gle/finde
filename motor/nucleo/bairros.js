'use strict';
// Bairros de São Paulo que o motor reconhece num endereço, cada um com a região.
// Os 14 ids são o vocabulário dividido com o app (os sete do protótipo mantêm o
// mesmo id e a mesma região de lá). Bairro que não é um dos 14 aponta para o id
// mais próximo e preserva o nome real (`nome`, que o contrato leva para
// `bairroNome`). Quando o texto não diz o bairro, uma tabela curada de faixas de
// CEP da capital decide. Puro.

const REGIOES = {
  oeste: 'Zona Oeste',
  centro: 'Centro',
  'centro-sul': 'Centro-Sul',
  norte: 'Zona Norte',
  sul: 'Zona Sul',
  leste: 'Zona Leste',
};

// id -> { nome, regiao, nomes: outras grafias e sub-bairros que apontam para ele }
// Os `nomes` levam a grafia real (com acento): é ela que sai em `bairroNome`.
const BAIRROS = {
  pinheiros: { nome: 'Pinheiros', regiao: 'oeste', nomes: ['Largo da Batata', 'Alto de Pinheiros'] },
  'vila-madalena': { nome: 'Vila Madalena', regiao: 'oeste', nomes: ['Sumarezinho'] },
  'barra-funda': { nome: 'Barra Funda', regiao: 'oeste', nomes: ['Água Branca', 'Parque Industrial Tomas Edson'] },
  centro: {
    nome: 'Centro',
    regiao: 'centro',
    nomes: ['República', 'Sé', 'Santa Cecília', 'Campos Elíseos', 'Luz', 'Bom Retiro', 'Higienópolis', 'Vila Buarque', 'Centro Histórico',
      'Anhangabaú', 'Canindé', 'Glicério', 'Santa Ifigênia', 'Pari'],
  },
  'bela-vista': { nome: 'Bela Vista', regiao: 'centro', nomes: ['Bixiga', 'Consolação', 'Liberdade', 'Augusta', 'Paulista', 'Morro dos Ingleses'] },
  jardins: {
    nome: 'Jardins',
    regiao: 'centro-sul',
    nomes: ['Jardim Paulista', 'Jardim América', 'Jardim Europa', 'Itaim Bibi', 'Itaim', 'Vila Olímpia', 'Cerqueira César'],
  },
  'vila-mariana': { nome: 'Vila Mariana', regiao: 'centro-sul', nomes: ['Moema', 'Paraíso', 'Ibirapuera', 'Aclimação', 'Saúde'] },
  perdizes: { nome: 'Perdizes', regiao: 'oeste', nomes: ['Pompeia', 'Vila Pompeia', 'Pacaembu', 'Sumaré'] },
  lapa: { nome: 'Lapa', regiao: 'oeste', nomes: ['Vila Leopoldina'] },
  butanta: { nome: 'Butantã', regiao: 'oeste', nomes: ['Jardim Peri Peri', 'Jd Peri Peri', 'Peri Peri', 'Caxingui'] },
  santana: { nome: 'Santana', regiao: 'norte', nomes: ['Tucuruvi', 'Casa Verde', 'Campo de Marte'] },
  mooca: { nome: 'Mooca', regiao: 'leste', nomes: ['Brás', 'Belenzinho', 'Tatuapé', 'Cambuci', 'Carrão'] },
  'santo-amaro': { nome: 'Santo Amaro', regiao: 'sul', nomes: ['Brooklin', 'Campo Belo', 'Chácara Santo Antônio', 'Granja Julieta', 'Berrini'] },
  interlagos: { nome: 'Interlagos', regiao: 'sul', nomes: ['Autódromo de Interlagos'] },
};

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Índice de nomes, do mais longo para o mais curto, para "vila madalena" ganhar de "madalena".
// Cada entrada: [nome sem acento, id, nome real].
const INDICE = Object.entries(BAIRROS)
  .flatMap(([id, b]) => [b.nome, ...b.nomes].map((n) => [semAcento(n), id, n]))
  .sort((a, b) => b[0].length - a[0].length);

// Acha o bairro num texto livre (endereço, nome de bairro).
// Devolve { bairro, regiao, nome } ou null; `nome` é o nome real que o texto
// usou (Pacaembu), que pode diferir do nome do bairro do app (Perdizes).
function acharBairro(...textos) {
  for (const t of textos) {
    const limpo = ` ${semAcento(t).replace(/[^a-z0-9]+/g, ' ')} `;
    for (const [nome, id, real] of INDICE) {
      if (limpo.includes(` ${nome} `)) return { bairro: id, regiao: BAIRROS[id].regiao, nome: real };
    }
  }
  return null;
}

// Faixas de CEP da capital (os cinco primeiros dígitos) para os 14 bairros.
// Curada à mão, só para quando o texto não diz o bairro: onde a faixa cruza
// vários bairros, vale o do app mais próximo.
const FAIXAS_DE_CEP = [
  [1000, 1139, 'centro'],
  [1140, 1159, 'barra-funda'],
  [1200, 1245, 'centro'],
  [1246, 1259, 'perdizes'],
  [1300, 1349, 'bela-vista'],
  [1400, 1459, 'jardins'],
  [1500, 1529, 'bela-vista'],
  [1530, 1549, 'vila-mariana'],
  [2000, 2399, 'santana'],
  [2500, 2599, 'santana'],
  [2700, 2799, 'santana'],
  [3000, 3499, 'mooca'],
  [4000, 4199, 'vila-mariana'],
  [4500, 4529, 'vila-mariana'],
  [4530, 4559, 'jardins'],
  [4560, 4799, 'santo-amaro'],
  [4800, 4899, 'interlagos'],
  [5000, 5049, 'perdizes'],
  [5050, 5099, 'lapa'],
  [5300, 5329, 'lapa'],
  [5400, 5429, 'pinheiros'],
  [5430, 5449, 'vila-madalena'],
  [5450, 5499, 'pinheiros'],
  [5500, 5599, 'butanta'],
];

// "05413-011", "05413011", "CEP 01144-010" -> o primeiro CEP do texto, "NNNNN-NNN"; ou null.
function extrairCep(t) {
  const m = String(t || '').match(/(?<!\d)(\d{5})-?(\d{3})(?!\d)/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// O bairro pela faixa de CEP da capital. Aceita o CEP ou um texto que o traga.
// Devolve { bairro, regiao, nome } ou null (CEP de fora da tabela ou de fora da capital).
function acharBairroPorCep(cepOuTexto) {
  const cep = extrairCep(cepOuTexto);
  if (!cep) return null;
  const n = Number(cep.slice(0, 5));
  const f = FAIXAS_DE_CEP.find(([de, ate]) => n >= de && n <= ate);
  if (!f) return null;
  const b = BAIRROS[f[2]];
  return { bairro: f[2], regiao: b.regiao, nome: b.nome };
}

module.exports = { BAIRROS, REGIOES, FAIXAS_DE_CEP, acharBairro, acharBairroPorCep, extrairCep, semAcento };

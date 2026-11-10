'use strict';
// O registro de fontes (M3): as que têm conector, ligadas ou não pela
// configuração, e as que ficam de fora com o motivo. O motivo vem da pesquisa
// de 10/11/2026 (docs/pesquisa/2026-11-10-apps-de-eventos.md, seção 3) e da
// sondagem feita ao construir o motor. Nada aqui é parecer jurídico: antes de
// ligar uma fonte nova, leia os termos vigentes dela.

const fs = require('node:fs');
const path = require('node:path');

const CONECTORES = {
  envio: require('./envio'),
  'mapas-culturais': require('./mapas-culturais'),
  ical: require('./ical'),
};

const DESLIGADAS = [
  { id: 'instagram', nome: 'Instagram', motivo: 'Os termos da Meta só permitem coleta programática pelas APIs da plataforma, e a Graph API só lê contas que autorizam o app. Raspagem é violação. Caminho: a produtora conecta a própria conta, ou manda pelo envio.' },
  { id: 'resident-advisor', nome: 'Resident Advisor', motivo: 'Termos de uso (4.4) proíbem software automatizado para extrair conteúdo para fins comerciais e acesso por bots não aprovados por escrito.' },
  { id: 'eventbrite', nome: 'Eventbrite', motivo: 'A busca pública da API foi desligada em 12/12/2019; a API só lê eventos da própria organização, e os termos proíbem raspagem. Caminho: a produtora conecta a conta dela.' },
  { id: 'sympla', nome: 'Sympla', motivo: 'Não há API pública de listagem; a API oficial lê só os eventos de quem tem o token. Termos não puderam ser lidos (403). Caminho: a produtora informa o token dela, conector a construir.' },
  { id: 'shotgun', nome: 'Shotgun', motivo: 'Sem API pública de listagem encontrada; páginas devolveram 429 ao acesso automatizado. Termos não verificados.' },
  { id: 'dice', nome: 'DICE', motivo: 'Sem API pública de listagem encontrada; páginas devolveram 403 ao acesso automatizado. Termos não verificados.' },
  { id: 'fever', nome: 'Fever', motivo: 'Sem API pública de listagem encontrada; termos não puderam ser lidos.' },
  { id: 'google-places', nome: 'Google Maps (Places)', motivo: 'Os termos proíbem guardar nome, endereço e avaliações fora do serviço; só o place ID pode ser guardado. Serve, no máximo, para o link "abrir no mapa".' },
  { id: 'sesc-sp', nome: 'Sesc SP', motivo: 'A API do site (/wp-json/wp/v1/atividades) devolve 403 do CloudFront para cliente automatizado e não há termo de uso publicado. Bloqueio é recusa: não contornamos.' },
];

const RAIZ = path.join(__dirname, '..');

function lerConfig(arquivo = process.env.FINDE_FONTES || path.join(RAIZ, 'config', 'fontes.json')) {
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  // Pastas relativas são relativas a motor/.
  if (c.envio && Array.isArray(c.envio.pastas)) {
    c.envio.pastas = c.envio.pastas.map((p) => (path.isAbsolute(p) ? p : path.join(RAIZ, p)));
  }
  return c;
}

// As fontes que a execução vai rodar e a configuração dela (uma cópia: a
// original não muda). `so` restringe a uma fonte; `exemplos` soma a pasta de
// envios fictícios, só para demonstração.
function fontesLigadas(config, { so = null, exemplos = false } = {}) {
  const c = JSON.parse(JSON.stringify(config));
  if (exemplos) {
    c.envio = c.envio || { ligada: true, pastas: [] };
    c.envio.ligada = true;
    c.envio.pastas = [...(c.envio.pastas || []), path.join(RAIZ, 'exemplos', 'envios')];
  }
  const fontes = Object.entries(CONECTORES)
    .filter(([id]) => (so ? id === so : c[id] && c[id].ligada))
    .map(([, conector]) => conector);
  return { fontes, config: c };
}

function descreverFontes(config) {
  const comConector = Object.entries(CONECTORES).map(([id, c]) => ({
    id,
    nome: c.nome,
    ligada: Boolean(config[id] && config[id].ligada),
    motivo: config[id] && config[id].motivo ? config[id].motivo : null,
  }));
  return [...comConector, ...DESLIGADAS.map((d) => ({ ...d, ligada: false, semConector: true }))];
}

module.exports = { CONECTORES, DESLIGADAS, lerConfig, fontesLigadas, descreverFontes, RAIZ };

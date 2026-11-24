'use strict';
// Peças comuns dos testes: banco em memória, relógio parado, log mudo e um
// fetch falso que responde por padrão de URL. Nenhum teste toca a rede.
const { abrirBanco } = require('../nucleo/banco');

const AGORA = new Date('2026-11-10T15:00:00.000Z'); // terça, 12h em São Paulo

function relogio(inicio = AGORA) {
  let t = inicio.getTime();
  const agora = () => new Date(t);
  agora.andar = (ms) => { t += ms; };
  return agora;
}

const logMudo = { info() {}, warn() {}, error() {} };

function logQueGuarda() {
  const linhas = [];
  const g = (n) => (m) => linhas.push(`${n}: ${m}`);
  return { info: g('info'), warn: g('warn'), error: g('error'), linhas };
}

// rotas: [[regex, (url) => corpo | Response | Error]]
function fetchFalso(rotas) {
  const chamadas = [];
  const f = async (url) => {
    const u = String(url);
    chamadas.push(u);
    for (const [re, resp] of rotas) {
      if (re.test(u)) {
        const r = typeof resp === 'function' ? resp(new URL(u)) : resp;
        if (r instanceof Error) throw r;
        if (r instanceof Response) return r;
        return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
      }
    }
    return new Response('não achei', { status: 404 });
  };
  f.chamadas = chamadas;
  return f;
}

// Cliente do Claude de mentira: devolve `respostas` em ordem (objeto vira JSON;
// Error é lançado) e guarda os pedidos.
function claudeFalso(respostas, { entrada = 900, saida = 300 } = {}) {
  const pedidos = [];
  let i = 0;
  return {
    pedidos,
    cliente: {
      messages: {
        async create(p) {
          pedidos.push(p);
          const r = respostas[Math.min(i, respostas.length - 1)];
          i += 1;
          if (r instanceof Error) throw r;
          return {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r) }],
            usage: { input_tokens: entrada, output_tokens: saida },
          };
        },
      },
    },
  };
}

// Banco em memória já no esquema 3 (abrirBanco migra por padrão).
const novoBanco = () => abrirBanco(':memory:');

// Um fetch que nunca deveria ser chamado: o teste que passa por ele prova que
// nada foi à rede (reprocessar, tempo 2 desligado). Guarda o que tentou.
function fetchQueLanca() {
  const chamadas = [];
  const f = async (url) => {
    chamadas.push(String(url));
    throw new Error(`rede proibida neste teste: ${String(url).slice(0, 80)}`);
  };
  f.chamadas = chamadas;
  return f;
}

// Uma fonte de mentira que devolve itens prontos (lista ou função).
const fonteFixa = (id, itens) => ({ id, nome: id, coletar: async () => ({ itens: typeof itens === 'function' ? itens() : itens, avisos: [] }) });

// Liga uma peça já preparada a um item (as tabelas da KTD6), como a lane de
// imagens faria no tempo 2: o pHash é o que a correlação lê.
function ligarImagem(db, { fonte, idExterno, sha, phash, papel = 'post', quando = '2026-11-24T12:00:00.000Z' }) {
  db.prepare(`INSERT INTO imagens (sha, arquivo, miniatura, phash, criada_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (sha) DO NOTHING`).run(sha, `imagens/${sha}-1080.webp`, `imagens/${sha}-480.webp`, phash, quando);
  db.prepare('INSERT OR IGNORE INTO imagens_item (fonte, id_externo, sha, papel, conferido_em) VALUES (?, ?, ?, ?, ?)').run(fonte, idExterno, sha, papel, quando);
}

// A partição das festas: cada festa como a lista ordenada dos seus itens.
const particao = (db) => {
  const grupos = new Map();
  for (const v of db.prepare('SELECT festa_id, fonte, id_externo FROM vinculos').all()) {
    if (!grupos.has(v.festa_id)) grupos.set(v.festa_id, []);
    grupos.get(v.festa_id).push(`${v.fonte}:${v.id_externo}`);
  }
  return [...grupos.values()].map((g) => g.sort().join(' + ')).sort();
};

module.exports = { AGORA, relogio, logMudo, logQueGuarda, fetchFalso, fetchQueLanca, claudeFalso, novoBanco, fonteFixa, ligarImagem, particao };

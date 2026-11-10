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

const novoBanco = () => abrirBanco(':memory:');

module.exports = { AGORA, relogio, logMudo, logQueGuarda, fetchFalso, claudeFalso, novoBanco };

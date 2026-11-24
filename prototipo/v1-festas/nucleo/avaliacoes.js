'use strict';
// Avaliações pós-festa no app (R34, D3, D15, KTD13 do plano de 24/11/2026):
// quem disse "tô dentro" responde, depois da festa, "O público tinha a sua
// idade?" e a própria idade. Guarda em <dir>/avaliacoes.json só
// { chave, aparelho, planoId, festaId, resposta, idade, em }, nunca o nome:
// `chave` é HMAC-SHA256 de planoId + nome em minúsculas com um sal guardado em
// <dir>/avaliacoes-sal (0600), truncado em 16, para quem tem o link não
// enumerar nomes; `aparelho` também só como HMAC. Uma avaliação por nome e
// uma por aparelho em cada festa. Só resposta com idade (18 a 60) conta.
//
// A cada resposta de festa real, o lote da festa vai ao motor (POST
// /api/avaliacoes, Bearer FINDE_APP_TOKEN, idempotente pela chave); falha
// fica pendente no arquivo e vai na próxima subida ou resposta. `expurgar()`
// apaga tudo (D15, 31/12/2026). Uma demonstração usa festa fictícia, que
// nunca sai daqui.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RESPOSTAS = ['mais-novo', 'na-medida', 'mais-velho'];
const IDADE_MIN = 18;
const IDADE_MAX = 60;
const GUARDA_ATE = '2026-12-31';
// A linha do formulário: para que serve, que é opcional e até quando fica (D15).
const FINALIDADE = 'Opcional e sem nome: serve para dizer a quem procura esta festa se o público tinha a idade de quem foi. A resposta fica guardada até 31/12/2026.';
const LIMITE_MS = 3000;
const APARELHO = /^[A-Za-z0-9_-]{8,64}$/;
const FESTA = /^[a-z0-9-]{1,60}$/;
const PLANO = /^[a-z0-9]{8}$/;

const hmac = (sal, texto) => crypto.createHmac('sha256', sal).update(texto, 'utf8').digest('hex').slice(0, 16);

// chave(sal, planoId, nome) -> hex de 16 (HMAC-SHA256 truncado).
function chave(sal, planoId, nome) {
  if (!sal || typeof planoId !== 'string' || typeof nome !== 'string' || !nome.trim()) return null;
  return hmac(sal, `nome\n${planoId}\n${nome.trim().toLocaleLowerCase('pt-BR')}`);
}

const idadeValida = (v) => Number.isInteger(v) && v >= IDADE_MIN && v <= IDADE_MAX;

// criarAvaliacoes({ dir, motorUrl, token, fetch, agora, log, limiteMs })
//   -> { registrar(entrada), loteDaFesta(festaId), enviarPendentes(), contagem(festaId),
//        jaAvaliou(planoId, nome), pendentes(), expurgar() }
function criarAvaliacoes(opcoes = {}) {
  const {
    dir,
    motorUrl = null,
    token = null,
    fetch: buscar = globalThis.fetch,
    agora = () => new Date().toISOString(),
    log = console,
    limiteMs = LIMITE_MS,
  } = opcoes;
  if (!dir) throw new Error('criarAvaliacoes: falta o diretório');
  const arquivo = path.join(dir, 'avaliacoes.json');
  const arquivoSal = path.join(dir, 'avaliacoes-sal');
  let dados = { avaliacoes: [], pendentes: [] };
  let sal = null;

  try {
    const lido = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (lido && Array.isArray(lido.avaliacoes)) dados = { avaliacoes: lido.avaliacoes, pendentes: Array.isArray(lido.pendentes) ? lido.pendentes : [] };
  } catch (e) {
    if (e.code !== 'ENOENT') log.warn(`[finde] não consegui ler ${arquivo} (${e.message}); começo sem avaliações`);
  }

  // O sal nasce na primeira avaliação, aleatório, legível só pelo dono.
  function oSal() {
    if (sal) return sal;
    try {
      sal = fs.readFileSync(arquivoSal, 'utf8').trim();
    } catch {
      sal = '';
    }
    if (!/^[a-f0-9]{64}$/.test(sal)) {
      fs.mkdirSync(dir, { recursive: true });
      sal = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(arquivoSal, `${sal}\n`, { mode: 0o600 });
    }
    try {
      fs.chmodSync(arquivoSal, 0o600);
    } catch { /* outro sistema de arquivos: segue */ }
    return sal;
  }

  function gravar() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${arquivo}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dados), { mode: 0o600 });
    fs.renameSync(tmp, arquivo);
  }

  const daFesta = (festaId) => dados.avaliacoes.filter((a) => a.festaId === festaId);
  // { avaliacoes, convites } de uma festa, sem nomes.
  function contagem(festaId) {
    const xs = daFesta(festaId);
    return { avaliacoes: xs.length, convites: new Set(xs.map((a) => a.planoId)).size };
  }

  // O lote que vai ao motor: sem nome, sem o texto do aparelho.
  const loteDaFesta = (festaId) => daFesta(festaId).map((a) => ({
    chave: a.chave, festaId: a.festaId, aparelho: a.aparelho, plano: a.planoId, resposta: a.resposta, idade: a.idade, em: a.em,
  }));

  // Devolve o tamanho do lote mandado: quem chama só tira a festa das
  // pendentes se nada entrou enquanto o lote estava em voo.
  async function enviarFesta(festaId) {
    const lote = loteDaFesta(festaId);
    const r = await buscar(`${String(motorUrl).replace(/\/+$/, '')}/api/avaliacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ festaId, avaliacoes: lote }),
      signal: AbortSignal.timeout(limiteMs),
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`o motor respondeu ${r.status}`);
    return lote.length;
  }

  // A rodada por trás: a resposta da avaliação não espera o motor. Uma rodada
  // de cada vez; o que entrar durante ela vai numa rodada seguinte.
  let rodada = null;
  let deNovo = false;
  function enviarPorTras() {
    if (rodada) {
      deNovo = true;
      return rodada;
    }
    rodada = (async () => {
      try {
        do {
          deNovo = false;
          await enviarPendentes();
        } while (deNovo);
      } catch (e) {
        log.warn(`[finde] avaliações: a rodada por trás falhou (${e.message})`);
      } finally {
        rodada = null;
      }
    })();
    return rodada;
  }

  // Manda o lote de cada festa pendente; o que falhar continua pendente.
  async function enviarPendentes() {
    if (!motorUrl || !token || !dados.pendentes.length) return { enviados: 0, pendentes: dados.pendentes.length };
    let enviados = 0;
    for (const festaId of [...dados.pendentes]) {
      try {
        const n = await enviarFesta(festaId);
        enviados += 1;
        // Uma avaliação que entrou durante o envio não foi no lote: a festa
        // fica pendente, e a volta seguinte da rodada manda o lote inteiro.
        if (daFesta(festaId).length !== n) continue;
        dados.pendentes = dados.pendentes.filter((x) => x !== festaId);
      } catch (e) {
        log.warn(`[finde] avaliações de ${festaId} ficaram pendentes (${e.message})`);
      }
    }
    if (enviados) gravar();
    return { enviados, pendentes: dados.pendentes.length };
  }

  return {
    // registrar({ planoId, festaId, nome, aparelho, resposta, idade, real })
    //   -> { ok, conta, motivo?, contagem? }
    // `real`: a festa é do motor, e o lote vai para lá.
    async registrar({ planoId, festaId, nome, aparelho, resposta, idade, real = false } = {}) {
      if (typeof planoId !== 'string' || !PLANO.test(planoId)) return { ok: false, conta: false, motivo: 'convite' };
      if (typeof festaId !== 'string' || !FESTA.test(festaId)) return { ok: false, conta: false, motivo: 'festa' };
      if (typeof aparelho !== 'string' || !APARELHO.test(aparelho)) return { ok: false, conta: false, motivo: 'aparelho' };
      if (!RESPOSTAS.includes(resposta)) return { ok: false, conta: false, motivo: 'resposta' };
      // Sem idade, a resposta não diz nada sobre a idade do público: não conta.
      if (!idadeValida(idade)) return { ok: false, conta: false, motivo: 'idade' };
      const s = oSal();
      const k = chave(s, planoId, nome);
      if (!k) return { ok: false, conta: false, motivo: 'nome' };
      const ap = hmac(s, `aparelho\n${aparelho}`);
      if (dados.avaliacoes.some((a) => a.chave === k)) return { ok: false, conta: false, motivo: 'repetida' };
      if (dados.avaliacoes.some((a) => a.festaId === festaId && a.aparelho === ap)) return { ok: false, conta: false, motivo: 'aparelho repetido' };
      dados.avaliacoes.push({ chave: k, aparelho: ap, planoId, festaId, resposta, idade, em: agora() });
      if (real && motorUrl && token && !dados.pendentes.includes(festaId)) dados.pendentes.push(festaId);
      gravar();
      // Gravou: a resposta sai já; o lote vai ao motor por trás (com o motor
      // pendurado, eram 3 s por festa pendente antes do 201).
      if (real) enviarPorTras();
      return { ok: true, conta: true, contagem: contagem(festaId) };
    },
    loteDaFesta,
    enviarPendentes,
    pendentes: () => [...dados.pendentes],
    // Resolve quando a rodada por trás (se houver) termina.
    ocioso: () => rodada || Promise.resolve(),
    contagem,
    // A pessoa (pelo nome, no convite) já avaliou?
    jaAvaliou(planoId, nome) {
      if (!dados.avaliacoes.length) return false;
      const k = chave(oSal(), planoId, nome);
      return Boolean(k) && dados.avaliacoes.some((a) => a.chave === k);
    },
    // D15: apaga as avaliações, as pendências e o sal.
    async expurgar() {
      const apagados = dados.avaliacoes.length;
      dados = { avaliacoes: [], pendentes: [] };
      sal = null;
      for (const f of [arquivo, arquivoSal]) {
        try {
          fs.rmSync(f, { force: true });
        } catch { /* já não existe */ }
      }
      return { apagados };
    },
  };
}

module.exports = { criarAvaliacoes, chave, RESPOSTAS, FINALIDADE, GUARDA_ATE, IDADE_MIN, IDADE_MAX };

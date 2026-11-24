'use strict';
// A base viva do motor (R23, KTD14 do plano de 24/11/2026): o servidor do app
// lê GET /api/festas?exemplos=0&de=<hoje − 7> do motor pela rede privada
// (FINDE_MOTOR_URL), com validade de 10 minutos contada a cada pedido (o app
// no Fly dorme, então nada de timer), ETag, a última lista boa em
// /data/reais-cache.json e o arquivo da imagem (dados/reais.json) como
// reserva. Quem lê usa a API síncrona (`festas()`, a última lista boa); a
// atualização corre por trás (`atualizar()`), e o boot a frio espera
// `pronta()` até 2 s.
//
// A lista só troca por outra boa: 500, demora acima do limite, JSON quebrado,
// contrato que o app não aceita e lista vazia mantêm a última. O log diz uma
// vez cada mudança de estado (de "ok" para um erro, de um erro para outro),
// nunca a cada pedido.

const fs = require('node:fs');
const path = require('node:path');
const R = require('./reais');
const L = require('./lista');

const VALIDADE_MS = 10 * 60 * 1000;
const LIMITE_MS = 3000;
const BOOT_MS = 2000;
const DIAS_PARA_TRAS = 7;

const objeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Um export (o envelope do motor ou o arquivo de reserva) -> a lista do app,
// ou o motivo de não servir.
function lerExport(bruto, converter) {
  if (!objeto(bruto) || !Array.isArray(bruto.festas)) return { erro: 'a resposta não traz uma lista de festas' };
  if (!R.CONTRATOS.includes(bruto.contrato)) return { erro: `contrato "${String(bruto.contrato).slice(0, 40)}" não aceito` };
  const r = converter(bruto);
  if (!r.festas.length) return { erro: 'a lista veio vazia' };
  return { festas: r.festas, fora: r.fora, avisos: r.avisos, resumo: R.resumoDoExport(bruto) };
}

function lerArquivo(caminho) {
  if (!caminho) return null;
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
}

// Grava inteiro ou nada (arquivo temporário e rename).
function gravarArquivo(caminho, dados) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados));
  fs.renameSync(tmp, caminho);
}

// criarFonteMotor({ url, fetch, cache, reserva, validadeMs, limiteMs, bootMs, relogio, log, converter })
//   -> { festas(), achar(id), atualizar(), pronta(), estado() } | null (sem URL)
//   url       a base do motor (http://finde-motor.internal:8080)
//   cache     onde guardar a última lista boa (/data/reais-cache.json)
//   reserva   o arquivo da imagem (dados/reais.json), quando não há cache
function criarFonteMotor(opcoes = {}) {
  const {
    url = null,
    fetch: buscar = globalThis.fetch,
    cache = null,
    reserva = null,
    validadeMs = VALIDADE_MS,
    limiteMs = LIMITE_MS,
    bootMs = BOOT_MS,
    relogio = () => Date.now(),
    log = console,
    converter = R.converterExport,
  } = opcoes;
  if (!url) return null;
  const base = String(url).replace(/\/+$/, '');

  let lista = [];
  let porId = new Map();
  let etag = null;
  let ultimaTentativa = -Infinity;
  let emCurso = null;
  let primeira = null;
  let situacao = null; // o último estado logado ("ok", ou a frase do erro)
  const est = { origem: null, geradoEm: null, execucaoId: null, total: 0, perfis: 0, sites: 0, recebidas: 0, erro: null, atualizadoEm: null, versao: 0 };

  function trocar(lido, origem, bruto) {
    lista = lido.festas;
    porId = new Map();
    for (const f of lista) {
      porId.set(f.id, f);
      for (const antigo of f.idsAntigos || []) if (!porId.has(antigo)) porId.set(antigo, f);
    }
    Object.assign(est, {
      origem,
      geradoEm: lido.resumo.atualizadoEm,
      execucaoId: objeto(bruto) && (typeof bruto.execucaoId === 'number' || typeof bruto.execucaoId === 'string') ? bruto.execucaoId : null,
      total: lista.length,
      recebidas: lido.resumo.total,
      perfis: lido.resumo.perfis,
      sites: lido.resumo.sites,
      versao: est.versao + 1,
    });
  }

  function anotar(erro) {
    est.erro = erro;
    const agora = erro || 'ok';
    if (agora === situacao) return;
    situacao = agora;
    if (erro) log.warn(`[finde] motor: ${erro}; sigo com a lista ${est.origem ? `de ${est.origem}` : 'vazia'} (${lista.length} festas)`);
    else log.info(`[finde] motor: ${lista.length} festas de ${base}`);
  }

  // No boot: a última lista boa (cache) ou, sem ela, o arquivo da imagem.
  for (const [origem, caminho] of [['cache', cache], ['arquivo', reserva]]) {
    const bruto = lerArquivo(caminho);
    if (!bruto) continue;
    const lido = lerExport(bruto, converter);
    if (lido.erro) continue;
    trocar(lido, origem, bruto);
    if (origem === 'cache' && objeto(bruto) && typeof bruto.etag === 'string') etag = bruto.etag;
    log.info(`[finde] motor: comecei com ${lista.length} festas do ${origem} (${caminho})`);
    break;
  }

  async function buscarAgora() {
    ultimaTentativa = relogio();
    const de = L.somarDias(L.hojeEmSaoPaulo(relogio()), -DIAS_PARA_TRAS);
    const endereco = `${base}/api/festas?exemplos=0&de=${de}`;
    const cabecalhos = { Accept: 'application/json' };
    if (etag) cabecalhos['If-None-Match'] = etag;
    let resposta;
    try {
      resposta = await buscar(endereco, { headers: cabecalhos, signal: AbortSignal.timeout(limiteMs) });
    } catch (e) {
      return anotar(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? `sem resposta em ${limiteMs} ms` : 'fora do ar');
    }
    if (resposta.status === 304) {
      est.atualizadoEm = new Date(relogio()).toISOString();
      if (est.origem !== 'motor' && lista.length) est.origem = 'motor';
      return anotar(null);
    }
    if (resposta.status !== 200) return anotar(`respondeu ${resposta.status}`);
    let bruto;
    try {
      bruto = JSON.parse(await resposta.text());
    } catch {
      return anotar('mandou um JSON quebrado');
    }
    const lido = lerExport(bruto, converter);
    if (lido.erro) return anotar(lido.erro);
    trocar(lido, 'motor', bruto);
    etag = resposta.headers && typeof resposta.headers.get === 'function' ? resposta.headers.get('etag') : null;
    est.atualizadoEm = new Date(relogio()).toISOString();
    if (cache) {
      try {
        gravarArquivo(cache, { ...bruto, etag });
      } catch (e) {
        log.warn(`[finde] motor: não gravei o cache em ${cache} (${e.message})`);
      }
    }
    return anotar(null);
  }

  // Busca a lista nova se passou a validade (ou se nunca buscou); um pedido
  // por vez. Nunca lança.
  function atualizar({ forcar = false } = {}) {
    if (emCurso) return emCurso;
    if (!forcar && relogio() - ultimaTentativa < validadeMs) return Promise.resolve(lista);
    emCurso = buscarAgora()
      .catch((e) => anotar(`erro inesperado (${e && e.message})`))
      .then(() => lista)
      .finally(() => { emCurso = null; });
    return emCurso;
  }

  return {
    // A última lista boa (festas já convertidas para o app).
    festas: () => lista,
    // Uma festa pelo id ou por um id antigo (festa unida no motor).
    achar: (id) => porId.get(id) || null,
    atualizar,
    // O boot a frio: a primeira busca, esperada até `bootMs`. Depois, na hora.
    pronta() {
      if (!primeira) {
        const busca = atualizar({ forcar: true });
        primeira = Promise.race([busca, new Promise((r) => setTimeout(r, bootMs).unref())]).then(() => true);
      }
      return primeira;
    },
    // { origem: 'motor'|'cache'|'arquivo'|null, geradoEm, execucaoId, total, recebidas, perfis, sites, erro, atualizadoEm, versao }
    estado: () => ({ ...est }),
  };
}

module.exports = { criarFonteMotor, VALIDADE_MS, LIMITE_MS, BOOT_MS };

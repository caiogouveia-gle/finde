'use strict';
// Geocodificação de reserva (D9, KTD10 do plano de 24/11/2026): Nominatim só
// para festa sem coordenada da casa curada nem da página, com cache permanente
// (tabela geocodificacoes, inclusive o "não achou", que tenta de novo depois
// de 30 dias), consulta estruturada só com rua e número, no máximo 1 pedido
// por segundo (na agenda, 1 a cada 15 s e 20 por rodada), User-Agent sem dado
// de pessoa, e `config.geocodificacao.ligada` desliga sem deploy. Só no motor.
//
// Política do Nominatim: https://operations.osmfoundation.org/policies/nominatim/
// (cache, 1 pedido por segundo, User-Agent que identifica o aplicativo). Bloqueio
// é recusa (D14): 403, 429 e 503 encerram a rodada, sem repetir nem trocar de modo.

const { ruaENumero, lugarPorId } = require('./lugares');

const URL_PADRAO = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT_PADRAO = 'FindeMotor/0.3 (prova academica)';
const DIAS_PARA_TENTAR_DE_NOVO = 30;
const LIMITE_MS = 15000;
// A capital: esquerda, topo, direita, base (viewbox do Nominatim), com bounded=1.
const CAIXA_DA_CAPITAL = '-46.826,-23.357,-46.365,-24.008';
const DENTRO_DE_SP = { lat: [-24.1, -23.3], lng: [-47.0, -46.3] };
const BLOQUEIO = new Set([403, 429, 503]);

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ehSaoPaulo = (c) => /^(?:sao paulo|sampa)$/.test(semAcento(c).replace(/[\s.]+/g, ' ').trim());
const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

// montarConsulta(endereco) -> { chave, consulta } | null
// Só endereço com rua e número (sem "s/n") de São Paulo. A `chave` é a
// consulta normalizada (a mesma rua e número com grafias diferentes dá uma só).
function montarConsulta(endereco) {
  if (!endereco || typeof endereco !== 'object') return null;
  if (endereco.cidade && !ehSaoPaulo(endereco.cidade)) return null;
  const r = ruaENumero(endereco.texto);
  if (!r) return null;
  // O logradouro como a fonte escreveu, com a abreviação do tipo por extenso
  // ("R." -> "Rua"), que é o que o Nominatim entende.
  const achado = String(endereco.texto).match(/(?:^|[^A-Za-zÀ-ÿ])(r|rua|av|avenida|al|alameda|tv|travessa|pça|pca|praça|praca|lgo|largo|est|estrada|rod|rodovia|viela|pas|passagem)\.?\s+(.+?)\s*(?:,\s*|\s+)\d{1,5}(?!\d)/i);
  const tipo = { rua: 'Rua', avenida: 'Avenida', alameda: 'Alameda', travessa: 'Travessa', praca: 'Praça', largo: 'Largo', estrada: 'Estrada', rodovia: 'Rodovia', viela: 'Viela', passagem: 'Passagem' }[r.prefixo];
  const nomeDaRua = achado ? `${tipo} ${achado[2].replace(/\s+/g, ' ').trim()}` : `${tipo} ${r.rua}`;
  return {
    chave: `${r.chave}|sao paulo|sp`,
    consulta: {
      street: `${r.numero} ${nomeDaRua}`,
      city: 'São Paulo',
      state: 'SP',
      countrycodes: 'br',
      viewbox: CAIXA_DA_CAPITAL,
      bounded: 1,
      addressdetails: 1,
      limit: 1,
      format: 'jsonv2',
    },
    numero: r.numero,
  };
}

// O resultado do Nominatim (jsonv2 com addressdetails) -> { lat, lng, precisao }.
// `casa` com o número pedido, `rua` quando só achou a via, `bairro` quando só
// achou o bairro (que nunca vira pino).
function lerResultado(r, numero) {
  const lat = Number(r && r.lat);
  const lng = Number(r && (r.lon !== undefined ? r.lon : r.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < DENTRO_DE_SP.lat[0] || lat > DENTRO_DE_SP.lat[1] || lng < DENTRO_DE_SP.lng[0] || lng > DENTRO_DE_SP.lng[1]) return null;
  const a = (r && r.address) || {};
  let precisao = 'rua';
  if (a.house_number && String(a.house_number).replace(/\D+/g, '') === String(numero)) precisao = 'casa';
  else if (!a.road && /^(suburb|neighbourhood|city_district|quarter|city|state)$/.test(r.addresstype || r.type || '')) precisao = 'bairro';
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, precisao, origemGeo: 'nominatim' };
}

// criarGeocodificador({ db, fetch, config, agora, log, dormir }) -> { localizar(endereco), resumo() }
// localizar(endereco) -> Promise<{ lat, lng, precisao, origemGeo: 'nominatim' } | null>
function criarGeocodificador({ db, fetch = globalThis.fetch, config = {}, agora = () => new Date(), log = console, dormir = dormirPadrao, lugares } = {}) {
  const ligada = config.ligada === true;
  const intervaloMs = Number.isFinite(config.intervaloMs) ? Math.max(0, config.intervaloMs) : 1100;
  const maxPorRodada = Number.isFinite(config.maxPorRodada) ? config.maxPorRodada : 20;
  const url = config.url || URL_PADRAO;
  const userAgent = typeof config.userAgent === 'string' && config.userAgent ? config.userAgent : USER_AGENT_PADRAO;
  const contagem = { consultas: 0, cache: 0, achou: 0, naoAchou: 0, pulados: 0, curados: 0 };
  let ultimo = null;
  let recusado = false;

  const qCache = db.prepare('SELECT achou, resultado, consultado_em FROM geocodificacoes WHERE chave = ?');
  const qGrava = db.prepare(`INSERT INTO geocodificacoes (chave, consulta, achou, resultado, provedor, consultado_em) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET consulta = excluded.consulta, achou = excluded.achou, resultado = excluded.resultado, provedor = excluded.provedor, consultado_em = excluded.consultado_em`);
  const qUltima = db.prepare('SELECT MAX(consultado_em) AS t FROM geocodificacoes');

  // O ritmo vale também entre execuções: a última consulta gravada conta.
  const ultimaGravada = () => {
    try {
      const t = qUltima.get().t;
      return t ? new Date(t).getTime() : null;
    } catch {
      return null;
    }
  };

  async function respeitarOIntervalo() {
    const ref = ultimo !== null ? ultimo : ultimaGravada();
    if (ref !== null && intervaloMs > 0) {
      const passou = agora().getTime() - ref;
      if (passou >= 0 && passou < intervaloMs) await dormir(intervaloMs - passou);
    }
  }

  async function localizar(endereco) {
    const q = montarConsulta(endereco);
    // A casa curada com coordenada já resolve o pino (KTD2: vale mais que o Nominatim).
    const curada = endereco && endereco.lugar ? lugarPorId(endereco.lugar, lugares) : null;
    if (curada && Number.isFinite(curada.lat) && Number.isFinite(curada.lng)) {
      contagem.curados += 1;
      return null;
    }
    if (!ligada || !q) {
      contagem.pulados += 1;
      return null;
    }
    const guardado = qCache.get(q.chave);
    if (guardado) {
      if (guardado.achou) {
        contagem.cache += 1;
        return JSON.parse(guardado.resultado);
      }
      const dias = (agora().getTime() - new Date(guardado.consultado_em).getTime()) / 86400000;
      if (dias < DIAS_PARA_TENTAR_DE_NOVO) {
        contagem.cache += 1;
        return null;
      }
    }
    if (recusado || contagem.consultas >= maxPorRodada) {
      contagem.pulados += 1;
      return null;
    }

    await respeitarOIntervalo();
    ultimo = agora().getTime();
    contagem.consultas += 1;
    const alvo = `${url}?${new URLSearchParams(Object.entries(q.consulta).map(([k, v]) => [k, String(v)]))}`;
    let res;
    try {
      res = await fetch(alvo, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'pt-BR,pt;q=0.9', Accept: 'application/json' },
        signal: AbortSignal.timeout(LIMITE_MS),
      });
    } catch (e) {
      log.warn?.(`geocodificação: a consulta falhou (${e.message})`);
      return null;
    }
    if (BLOQUEIO.has(res.status)) {
      recusado = true;
      log.warn?.(`geocodificação: o provedor recusou (${res.status}); fim das consultas desta rodada`);
      return null;
    }
    if (!res.ok) {
      log.warn?.(`geocodificação: resposta ${res.status}; nada gravado`);
      return null;
    }
    let lista;
    try {
      lista = await res.json();
    } catch {
      log.warn?.('geocodificação: resposta que não é JSON; nada gravado');
      return null;
    }
    if (!Array.isArray(lista)) return null;
    const achado = lista.length ? lerResultado(lista[0], q.numero) : null;
    qGrava.run(q.chave, JSON.stringify(q.consulta), achado ? 1 : 0, achado ? JSON.stringify(achado) : null, config.provedor || 'nominatim', agora().toISOString());
    if (achado) contagem.achou += 1;
    else contagem.naoAchou += 1;
    return achado;
  }

  return { localizar, resumo: () => ({ ligada, ...contagem }) };
}

module.exports = { criarGeocodificador, montarConsulta, lerResultado, USER_AGENT_PADRAO };

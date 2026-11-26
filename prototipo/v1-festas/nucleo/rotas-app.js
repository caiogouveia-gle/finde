'use strict';
// As rotas novas do site `app` (KTD14, U22 a U25 do plano de 24/11/2026)
// moram aqui, e o servidor.js só as liga, com poucas linhas:
//   GET  /api/reais/estado                 de onde vem a base viva (token de admin do app)
//   GET  /api/festa/:id/agenda.ics         "Pôr na agenda" a partir do detalhe
//   GET  /p/:id/agenda.ics                 "Pôr na agenda" a partir do convite, com o link dele
//   GET  /imagens/<sha16>-(480|1080).webp  o flyer, só o da base atual ou de convite vivo
// E as contas que o servidor junta para o formulário e a lista (KTD15):
// `diasDoFormulario`, `bairrosDoFormulario`, `outrosDias` e `maisDoDia`.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('./catalogo');
const L = require('./lista');
const ics = require('./ics');

const DIAS_DO_PEDIDO = ['hoje', 'qui', 'sex', 'sab', 'dom'];
const DIAS_DO_FIM_DE_SEMANA = ['qui', 'sex', 'sab', 'dom'];
const NOME_IMAGEM = /^([a-f0-9]{16})-(480|1080)\.webp$/;
const LIMITE_IMAGEM = 4 * 1024 * 1024;
const LIMITE_MS = 3000;
const FORMATO_ID_FESTA = /^[a-z0-9-]{1,60}$/;
const FORMATO_ID_PLANO = /^[a-z0-9]{8}$/;
// Imagem de festa não vai para buscador nenhum (KTD17).
const SEM_INDICE = 'noindex, noimageindex';

// ---------------------------------------------------------------- contas

// O dia da semana (seg..dom) de uma data AAAA-MM-DD.
const idDoDia = (data) => C.DIAS_DA_SEMANA[L.diaDaSemana(data)];
const pedidoAceita = (id) => Object.hasOwn(C.DIAS, id);

// Os dias da primeira pergunta (R24, KTD15): hoje, quinta a domingo, em "esta"
// semana e na "proxima". Cada um: { id, semana, data, rotulo: 'Sexta, 27 nov',
// hoje, reais }. Em "esta", os dias que já passaram saem; num dia de quinta a
// domingo, a opção do dia vira "Hoje, sexta" e "hoje" não aparece de novo;
// "hoje" com 0 reais vai para o fim. Só entram os dias que o pedido aceita
// (C.DIAS) e que nucleo/lista.js (datasDoPedido) sabe datar.
function diasDoFormulario({ reais = [], agoraMs = Date.now(), ids = DIAS_DO_PEDIDO } = {}) {
  const hoje = L.noiteEmSaoPaulo(agoraMs);
  const idHoje = idDoDia(hoje);
  const vigentes = L.vigentes(reais, agoraMs);
  const conta = (data) => vigentes.filter((f) => f.data === data).length;
  const hojeTemDiaProprio = ids.includes(idHoje) && pedidoAceita(idHoje);
  const semana = (qual) => {
    const lista = [];
    const vistas = new Set();
    for (const id of ids) {
      if (!pedidoAceita(id)) continue;
      if (id === 'hoje' && (qual !== 'esta' || hojeTemDiaProprio)) continue;
      const [data] = L.datasDoPedido(id, qual, agoraMs);
      if (typeof data !== 'string' || vistas.has(data)) continue;
      if (qual === 'esta' && data < hoje) continue;
      vistas.add(data);
      const ehHoje = data === hoje;
      const d = C.TODOS_OS_DIAS[id === 'hoje' ? idHoje : id];
      lista.push({ id, semana: qual, data, rotulo: ehHoje ? `Hoje, ${d.frase}` : `${d.nome}, ${L.dataCurta(data)}`, hoje: ehHoje, reais: conta(data) });
    }
    // "Hoje" sem festa real não abre a lista: vai para o fim.
    const i = lista.findIndex((x) => x.id === 'hoje');
    if (i >= 0 && lista[i].reais === 0) lista.push(...lista.splice(i, 1));
    return lista;
  };
  return { esta: semana('esta'), proxima: semana('proxima') };
}

// Os 14 bairros do motor por região (R29), cada um com a contagem de reais
// da semana quando tem alguma; bairro sem festa na semana aparece, sem
// contagem.
function bairrosDoFormulario({ reais = [], datas = [] } = {}) {
  const daSemana = reais.filter((f) => datas.includes(f.data));
  return Object.entries(C.TODAS_AS_REGIOES).map(([id, nome]) => ({
    id,
    nome,
    bairros: Object.entries(C.TODOS_OS_BAIRROS).filter(([, b]) => b.regiao === id).map(([bid, b]) => {
      const n = daSemana.filter((f) => f.bairro === bid).length;
      // O ponto do bairro vai junto: o mapa desenha o círculo dos bairros pedidos.
      const ponto = b.ponto ? { lat: b.ponto.lat, lng: b.ponto.lng } : null;
      return n ? { id: bid, rotulo: b.nome, reais: n, ponto } : { id: bid, rotulo: b.nome, ponto };
    }),
  })).filter((z) => z.bairros.length);
}

// As reais dos outros dias de quinta a domingo da mesma semana do pedido
// (KTD15): [{ dia, data, reais }].
function outrosDias({ reais = [], dia, semana = 'esta', agoraMs = Date.now() } = {}) {
  const hoje = L.noiteEmSaoPaulo(agoraMs);
  const [dataDoPedido] = dia ? L.datasDoPedido(dia, semana, agoraMs) : [];
  const vigentes = L.vigentes(reais, agoraMs);
  const saida = [];
  for (const d of DIAS_DO_FIM_DE_SEMANA) {
    if (!pedidoAceita(d)) continue;
    const [data] = L.datasDoPedido(d, semana, agoraMs);
    if (typeof data !== 'string' || data === dataDoPedido || (semana === 'esta' && data < hoje)) continue;
    saida.push({ dia: d, data, reais: vigentes.filter((f) => f.data === data).length });
  }
  return saida;
}

// As reais do dia que não entraram nas recomendadas, como opções do motor,
// pela "% a sua cara"; esgotadas no fim (KTD15). `opcaoDe(festa)` monta a
// opção (motor.opcao com a cara).
function maisDoDia({ festas = [], recomendadas = [], opcaoDe }) {
  const ja = new Set(recomendadas.map((o) => o.festa.id));
  const pct = (o) => (o.cara && typeof o.cara.pct === 'number' ? o.cara.pct : typeof o.pct === 'number' ? o.pct : 0);
  return festas.filter((f) => !ja.has(f.id)).map(opcaoDe)
    .sort((a, b) => (a.festa.esgotado === true) - (b.festa.esgotado === true) || pct(b) - pct(a)
      || (a.festa.inicio ?? 99) - (b.festa.inicio ?? 99) || a.festa.id.localeCompare(b.festa.id));
}

// Os hashes de imagem que a base cita (cartaz e peças).
function hashesDe(festas) {
  const hashes = new Set();
  for (const f of festas) {
    for (const img of [...(Array.isArray(f.imagens) ? f.imagens : []), f.cartaz]) {
      if (img && typeof img === 'object' && typeof img.id === 'string') hashes.add(img.id);
    }
  }
  return hashes;
}

// ---------------------------------------------------------------- tokens

// Compara em tempo constante (as duas pontas viram SHA-256 antes).
function tokenConfere(recebido, esperado) {
  if (typeof esperado !== 'string' || !esperado || typeof recebido !== 'string') return false;
  const a = crypto.createHash('sha256').update(recebido).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}
const bearer = (req) => {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/);
  return m ? m[1] : null;
};

// ---------------------------------------------------------------- imagens

// O cache das imagens no volume (/data/imagens): serve só o que a base cita
// (ou um convite vivo), busca no motor o que falta (tmp e rename), e a cada
// lista nova apaga o que saiu, para uma imagem ocultada no motor dar 404 aqui
// na atualização seguinte. Sem motor, lê de dados/imagens/ (copiadas por
// ferramentas/reais.js).
function criarImagens({ dir, reserva = null, motorUrl = null, fetch: buscar = globalThis.fetch, log = console, limiteMs = LIMITE_MS } = {}) {
  const base = motorUrl ? String(motorUrl).replace(/\/+$/, '') : null;
  const buscando = new Map();

  function local(nome) {
    for (const pasta of [dir, reserva]) {
      if (!pasta) continue;
      const c = path.join(pasta, nome);
      try {
        if (fs.statSync(c).isFile()) return c;
      } catch { /* não está aqui */ }
    }
    return null;
  }

  async function doMotor(nome) {
    if (!base || !dir) return null;
    if (buscando.has(nome)) return buscando.get(nome);
    const p = (async () => {
      let r;
      try {
        r = await buscar(`${base}/imagens/${nome}`, { signal: AbortSignal.timeout(limiteMs) });
      } catch {
        return null;
      }
      if (r.status !== 200) return null;
      const bytes = Buffer.from(await r.arrayBuffer());
      // Só WebP de verdade, e pequeno: o motor recodifica tudo (KTD7).
      if (bytes.length > LIMITE_IMAGEM || bytes.length < 12 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') {
        log.warn(`[finde] imagens: o motor mandou ${nome} fora do formato; não guardei`);
        return null;
      }
      fs.mkdirSync(dir, { recursive: true });
      const destino = path.join(dir, nome);
      const tmp = `${destino}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, destino);
      return destino;
    })().finally(() => buscando.delete(nome));
    buscando.set(nome, p);
    return p;
  }

  return {
    // O caminho no disco da imagem permitida (buscando no motor se faltar), ou null.
    async achar(nome, permitidos) {
      const m = typeof nome === 'string' ? nome.match(NOME_IMAGEM) : null;
      if (!m || !permitidos.has(m[1])) return null;
      return local(nome) || doMotor(nome);
    },
    // Apaga do cache o que a base e os convites vivos não citam mais.
    limpar(permitidos) {
      if (!dir) return 0;
      let nomes;
      try {
        nomes = fs.readdirSync(dir);
      } catch {
        return 0;
      }
      let apagadas = 0;
      for (const nome of nomes) {
        const m = nome.match(NOME_IMAGEM);
        const velhoTmp = /\.tmp$/.test(nome);
        if ((m && !permitidos.has(m[1])) || velhoTmp) {
          try {
            fs.rmSync(path.join(dir, nome), { force: true });
            apagadas += 1;
          } catch { /* segue */ }
        }
      }
      return apagadas;
    },
  };
}

// ---------------------------------------------------------------- as rotas

// ligarRotasApp(contexto) -> (req, res, url) => boolean
// contexto:
//   fonteMotor     a base viva (nucleo/fonte-motor.js), ou null
//   reais()        as reais de agora (com as que passaram há pouco)
//   listaAtual()   a lista da fonte, a mesma referência até ela trocar (para
//                  limpar o cache de imagens só quando a lista muda)
//   achar(id)      uma festa pelo id ou id antigo (fictícia ou real)
//   planos         nucleo/planos.js
//   quando(festa)  { data } da festa (a real tem; a fictícia, o próximo dia dela)
//   imagens        criarImagens(...), ou null
//   adminToken     FINDE_ADMIN_TOKEN do app
//   relogio, log, origem(req), json(res, status, corpo), erro(res, status, msg, dados),
//   enviarCorpo(req, res, status, cabecalhos, buffer), lerCorpo(req), cabecalhosImagem
// A função devolvida responde e devolve true quando a rota é dela; senão, false.
function ligarRotasApp(contexto = {}) {
  const {
    fonteMotor = null, reais = () => [], listaAtual = null, achar = () => null, planos = null,
    quando = (f) => ({ data: f.data || null }), imagens = null, adminToken = null,
    relogio = () => Date.now(), log = console, origem = () => '', json, erro, enviarCorpo, lerCorpo,
  } = contexto;

  // As imagens que podem sair agora: as da base e as dos convites vivos.
  const permitidas = () => {
    const h = hashesDe(reais());
    if (planos && typeof planos.imagensVigentes === 'function') for (const x of planos.imagensVigentes()) h.add(x);
    return h;
  };
  // A cada lista nova, o cache perde o que saiu.
  let listaLimpa = null;
  function limparSeMudou() {
    if (!imagens) return;
    const lista = (listaAtual || reais)();
    if (lista === listaLimpa) return;
    listaLimpa = lista;
    const n = imagens.limpar(permitidas());
    if (n) log.info(`[finde] imagens: ${n} saíram do cache com a lista nova`);
  }

  function enviarIcs(req, res, texto, nome) {
    enviarCorpo(req, res, 200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}.ics"`,
      'Cache-Control': 'no-store',
    }, Buffer.from(texto, 'utf8'));
  }

  async function servirImagem(req, res, nome) {
    const caminho = imagens ? await imagens.achar(nome, permitidas()) : null;
    if (!caminho) return erro(res, 404, 'Não achei essa imagem.');
    let corpo;
    try {
      corpo = fs.readFileSync(caminho);
    } catch {
      return erro(res, 404, 'Não achei essa imagem.');
    }
    return enviarCorpo(req, res, 200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': SEM_INDICE,
    }, corpo);
  }

  return function rotaDoApp(req, res, url) {
    const { pathname } = url;
    const metodo = req.method;
    limparSeMudou();
    const correr = (p) => {
      Promise.resolve().then(p).catch((e) => {
        if (e && typeof e.status === 'number') return erro(res, e.status, e.message, e.dados);
        log.error('[finde] erro inesperado', e);
        if (!res.headersSent) erro(res, 500, 'Algo deu errado aqui do meu lado. Tente de novo.');
      });
      return true;
    };

    if (pathname === '/api/reais/estado') {
      if (metodo !== 'GET') return correr(() => erro(res, 405, 'Esse caminho não aceita esse método.'));
      if (!tokenConfere(bearer(req), adminToken)) return correr(() => erro(res, 401, 'Precisa do token de admin.'));
      return correr(() => json(res, 200, {
        fonte: fonteMotor ? 'motor' : 'arquivo',
        estado: fonteMotor ? fonteMotor.estado() : null,
        reais: reais().length,
        vigentes: L.vigentes(reais(), relogio()).length,
      }));
    }

    const icsFesta = pathname.match(/^\/api\/festa\/([^/]+)\/agenda\.ics$/);
    if (icsFesta) {
      if (metodo !== 'GET' && metodo !== 'HEAD') return correr(() => erro(res, 405, 'Esse caminho não aceita esse método.'));
      return correr(() => {
        const festa = FORMATO_ID_FESTA.test(icsFesta[1]) ? achar(icsFesta[1]) : null;
        if (!festa) return erro(res, 404, 'Essa festa não está na lista.');
        const { data } = quando(festa) || {};
        if (!data) return erro(res, 404, 'Essa festa não tem data.');
        const urlFesta = `${origem(req)}/app?festa=${encodeURIComponent(festa.id)}`;
        return enviarIcs(req, res, ics.montarIcs({ festa, data, uid: `${festa.id}@finde`, urlFesta, agora: relogio() }), festa.id);
      });
    }

    const icsConvite = pathname.match(/^\/p\/([^/]+)\/agenda\.ics$/);
    if (icsConvite && planos) {
      if (metodo !== 'GET' && metodo !== 'HEAD') return correr(() => erro(res, 405, 'Esse caminho não aceita esse método.'));
      return correr(() => {
        const id = icsConvite[1];
        if (!FORMATO_ID_PLANO.test(id) || !planos.existe(id)) return erro(res, 404, 'Esse convite não existe.');
        const p = planos.ler(id);
        const festa = p.festa && p.festa.festa;
        if (!festa || !p.data) return erro(res, 404, 'Esse convite não tem data.');
        const urlConvite = `${origem(req)}/p/${id}`;
        return enviarIcs(req, res, ics.montarIcs({ festa, data: p.data, uid: `${id}-${festa.id}@finde`, urlConvite, agora: relogio() }), festa.id);
      });
    }

    const imagem = pathname.match(/^\/imagens\/([^/]*)$/);
    if (imagem || pathname.startsWith('/imagens/')) {
      if (metodo !== 'GET' && metodo !== 'HEAD') return correr(() => erro(res, 405, 'Esse caminho não aceita esse método.'));
      return correr(() => servirImagem(req, res, imagem ? imagem[1] : ''));
    }
    return false;
  };
}

module.exports = {
  ligarRotasApp, criarImagens, diasDoFormulario, bairrosDoFormulario, outrosDias, maisDoDia, hashesDe, tokenConfere,
  DIAS_DO_PEDIDO, SEM_INDICE,
};

'use strict';
// Uma execução do motor, de ponta a ponta: trava, coleta de cada fonte ligada,
// normaliza, junta, classifica e grava, e fecha com um resumo (M10).
//
// Em quatro tempos (KTD4 do plano de 24/11/2026):
//   1. por item, dentro da transação: o bruto (com o contexto à parte) e o
//      vínculo conservador; as imagens do item ficam numa lista de pendentes
//      (os bytes já estão em disco, a fonte deu só o caminho);
//   2. depois de todas as fontes, fora de transação: prepara as imagens e
//      geocodifica o que ficou sem coordenada, só com `ligada: true` explícito
//      em config.imagens e config.geocodificacao (o padrão {} dos testes deixa
//      o tempo 2 desligado);
//   3. a passada de correlação (correlacao.passada) sobre as festas tocadas;
//   4. as fontes de festa (curadoria, avaliações) gravam direto em valores.
// Cada tempo novo roda em try: falha vira aviso e a execução segue.

const crypto = require('node:crypto');
const path = require('node:path');
const { transacao } = require('./banco');
const { normalizarItem, horario, semCodigo } = require('./normalizar');
const { vincular, gravarValores } = require('./agregar');
const { criarClassificador } = require('./classificar');
const { criarExtrator } = require('./extrair');
const { criarApify } = require('./apify');
const imagens = require('./imagens');
const geocodificar = require('./geocodificar');
const correlacao = require('./correlacao');

// A trava (M10) só abandona execução sem batimento há 10 min (U8): uma coleta
// longa, que bate a cada item, a cada página e no tempo 2, não perde a trava.
const SEM_BATIMENTO_MIN = 10;

function travar(db, gatilho, agora) {
  return transacao(db, () => {
    const limite = new Date(agora.getTime() - SEM_BATIMENTO_MIN * 60e3).toISOString();
    db.prepare("UPDATE execucoes SET estado = 'erro', fim = ?, resumo = ? WHERE estado = 'rodando' AND COALESCE(atualizado_em, inicio) < ?")
      .run(agora.toISOString(), JSON.stringify({ erro: `abandonada (sem batimento há mais de ${SEM_BATIMENTO_MIN} min)` }), limite);
    const rodando = db.prepare("SELECT id FROM execucoes WHERE estado = 'rodando'").get();
    if (rodando) return null;
    return Number(db.prepare("INSERT INTO execucoes (inicio, estado, gatilho, atualizado_em) VALUES (?, 'rodando', ?, ?)")
      .run(agora.toISOString(), gatilho, agora.toISOString()).lastInsertRowid);
  });
}

// As fontes cujo `ehFesta` é a leitura do modelo (KTD2): quando uma delas diz,
// o que as regras disseram da mesma festa sai (U7).
const LEITURA_DO_MODELO = new Set(['instagram', 'paginas']);

// O tempo 1 de um item (KTD4), numa transação: grava o bruto (com o contexto à
// parte), faz o vínculo conservador e grava os valores da fonte, somados aos
// dos outros itens da mesma fonte para a mesma festa nesta rodada (`somados`).
// Usado pela execução e pelo reprocessar. Devolve { festaId, nova }.
function gravarItem(db, { fonte, item, campos, conferidoEm, agora, somados = new Map(), coletadoEm = null, lugares }) {
  // O bruto guardado (e copiado para o bucket) também sai sem código de
  // indicação nos links; só o envio da produtora fica como veio.
  const brutoGuardado = fonte === 'envio' ? item.bruto : { ...item.bruto };
  if (fonte !== 'envio') for (const k of ['linkCompra', 'linkEvento']) if (brutoGuardado[k]) brutoGuardado[k] = semCodigo(brutoGuardado[k]);
  const hash = crypto.createHash('sha256').update(JSON.stringify(brutoGuardado)).digest('hex');
  // Texto e categorias ficam fora do hash, numa coluna à parte, para o
  // próximo reprocessar reclassificar só com o cache (KTD11).
  const contexto = item.texto || (item.categorias || []).length
    ? JSON.stringify({ texto: item.texto || null, categorias: item.categorias || [] })
    : null;
  return transacao(db, () => {
    db.prepare(`INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em, contexto) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (fonte, id_externo) DO UPDATE SET hash = excluded.hash, bruto = excluded.bruto, coletado_em = excluded.coletado_em, contexto = excluded.contexto`)
      .run(fonte, item.idExterno, hash, JSON.stringify(brutoGuardado), coletadoEm || agora().toISOString(), contexto);
    const v = vincular(db, { fonte, idExterno: item.idExterno, url: item.url, campos, agora: typeof conferidoEm === 'string' ? conferidoEm : conferidoEm.padrao, lugares });
    const antes = somados.get(v.festaId);
    const quandoDe = (k) => (typeof conferidoEm === 'string' ? conferidoEm : (conferidoEm[k] || conferidoEm.padrao));
    const quando = {};
    for (const k of Object.keys(campos)) quando[k] = quandoDe(k);
    let juntos = campos;
    if (antes) {
      juntos = { ...antes.campos, ...campos };
      if (antes.campos.paginas && campos.paginas) {
        const vistas = new Set(campos.paginas.map((p) => `${p.tipo} ${p.url}`));
        juntos.paginas = [...campos.paginas, ...antes.campos.paginas.filter((p) => !vistas.has(`${p.tipo} ${p.url}`))];
      }
      for (const [k, t] of Object.entries(antes.quando)) if (!(k in campos)) quando[k] = t;
    }
    somados.set(v.festaId, { campos: juntos, quando });
    gravarValores(db, v.festaId, fonte, juntos, { padrao: typeof conferidoEm === 'string' ? conferidoEm : conferidoEm.padrao, ...quando });
    // O modelo leu se é festa: o palpite das regras sobre a mesma festa sai.
    if (LEITURA_DO_MODELO.has(fonte) && typeof juntos.ehFesta === 'boolean') {
      db.prepare("DELETE FROM valores WHERE festa_id = ? AND fonte = 'regras'").run(v.festaId);
    }
    return v;
  });
}

// Precisa do modelo? Só se o texto existe e falta algo que ele sabe dizer.
function precisaClassificar(item, campos) {
  // O que o Claude já leu (flyer, página) não paga a segunda leitura.
  if (item.lidoPorModelo) return false;
  if (!item.texto && !(item.categorias || []).length) return false; // só o nome não paga a chamada
  return !(campos.estilos && typeof campos.ehFesta === 'boolean' && campos.lineup && campos.idadeMinima !== undefined);
}

function camposDaClassificacao(r, campos) {
  const c = { ehFesta: r.ehFesta };
  if (r.estilos.length) c.estilos = r.estilos;
  if (r.idadeMinima) c.idadeMinima = r.idadeMinima;
  if (r.lineup.length) c.lineup = r.lineup;
  const regras = {};
  for (const k of ['documento', 'vestimenta', 'lista']) if (r[k]) regras[k] = r[k];
  if (Object.keys(regras).length) c.regras = regras;
  if (r.pistaCheia && campos.data && campos.inicio) {
    const [h, m] = campos.inicio.slice(11, 16).split(':').map(Number);
    const pc = horario(campos.data, r.pistaCheia, h * 60 + m - 1);
    if (pc) c.pistaCheia = pc;
  }
  return c;
}

async function executar({
  db,
  fontes,
  gatilho = 'comando',
  claude = null,
  classificadorOpcoes = {},
  fetch = globalThis.fetch,
  agora = () => new Date(),
  log = console,
  config = {},
  forcar = false,
  apifyToken = process.env.APIFY_TOKEN || null,
  apify: apifyPronto = undefined,
  // false desliga o classificador (o reprocessar, KTD11): nada vai ao modelo nem às regras.
  classificar = true,
  // As fontes de festa do tempo 4; null usa as registradas (fontes/index.js).
  fontesDeFesta = null,
  // Onde as imagens moram (FINDE_IMAGENS); só o tempo 2 usa.
  dirImagens = process.env.FINDE_IMAGENS || path.join(__dirname, '..', 'var', 'imagens'),
}) {
  const inicio = agora();
  const execucaoId = travar(db, gatilho, inicio);
  if (!execucaoId) {
    log.warn('[motor] outra execução está rodando; esta não começa');
    return { recusada: true };
  }

  // O batimento da execução (U8): a cada item, a cada imagem e a cada consulta.
  const qBater = db.prepare('UPDATE execucoes SET atualizado_em = ? WHERE id = ?');
  const bater = () => qBater.run(agora().toISOString(), execucaoId);
  bater();

  const classificador = criarClassificador({ db, claude, execucaoId, agora, log, classificar, ...classificadorOpcoes });
  // Prova acadêmica (KTD12–KTD14): o Apify, o leitor de flyer e página, e a
  // fila de links de ingresso que uma fonte acha e outra lê na mesma execução.
  const apify = apifyPronto !== undefined ? apifyPronto : criarApify({ token: apifyToken, fetch, db, execucaoId, agora, log });
  const extrator = criarExtrator({ db, classificador, execucaoId, agora, log });
  const fila = new Set();
  const resumo = { fontes: {}, festasNovas: 0, festasTocadas: 0, avisos: [] };
  const tocadas = new Set();
  // As imagens que as fontes entregaram (item.imagens, com caminho de arquivo
  // temporário ou URL), para o tempo 2.
  const pendentesImagens = [];
  // O cadastro das casas para a correlação: o padrão (config/lugares.json) ou,
  // nos testes, a lista de config.correlacao.lugares.
  const lugares = Array.isArray((config.correlacao || {}).lugares) ? config.correlacao.lugares : undefined;
  const avisar = (a) => {
    if (resumo.avisos.length < 200) resumo.avisos.push(a);
  };

  try {
    for (const fonte of fontes) {
      const r = { itens: 0, gravados: 0, novas: 0, descartados: 0, erro: null };
      resumo.fontes[fonte.id] = r;
      // Fonte com intervalo (uma vez por dia, por exemplo) só roda de novo
      // depois dele; `forcar` passa por cima.
      const intervaloH = Number((config[fonte.id] || {}).intervaloHoras || 0);
      if (intervaloH > 0 && !forcar) {
        const ultima = db.prepare('SELECT ultima_ok FROM fontes_rodadas WHERE fonte = ?').get(fonte.id);
        const horas = ultima ? (agora().getTime() - Date.parse(ultima.ultima_ok)) / 3600e3 : Infinity;
        if (horas < intervaloH) {
          r.pulada = true;
          avisar(`${fonte.id}: rodou há ${horas.toFixed(1)} h; o intervalo é de ${intervaloH} h`);
          continue;
        }
      }
      let coletado;
      try {
        // `batimento`: a fonte longa (as páginas) bate a cada página (U8).
        coletado = await fonte.coletar({ db, fetch, agora, log, config: config[fonte.id] || {}, apify, extrator, fila, classificador, batimento: bater, dirImagens });
      } catch (e) {
        r.erro = e.message;
        avisar(`${fonte.id}: a coleta falhou (${e.message})`);
        continue;
      }
      for (const a of coletado.avisos || []) avisar(`${fonte.id}: ${a}`);
      // Só conta como rodada a fonte que de fato coletou: sem token, sem perfis
      // ou com a chamada principal falhando, ela tenta de novo na próxima.
      if (intervaloH > 0 && coletado.rodou !== false) {
        db.prepare('INSERT INTO fontes_rodadas (fonte, ultima_ok) VALUES (?, ?) ON CONFLICT (fonte) DO UPDATE SET ultima_ok = excluded.ultima_ok')
          .run(fonte.id, agora().toISOString());
      }
      // Dois itens da mesma fonte para a mesma festa (dois posts, a agenda e a
      // página do ingresso) se somam nesta execução, em vez de um apagar os
      // campos do outro (revisão de 24/11).
      const somados = new Map(); // festaId -> { campos, quando: { campo: instante } }
      const pendentes = [];
      for (const item of coletado.itens || []) {
        r.itens += 1;
        const rotulo = `${fonte.id}:${item.idExterno}`;
        const { campos, avisos } = normalizarItem(item.bruto, fonte.id);
        for (const a of avisos) avisar(`${rotulo}: ${a}`);
        if (!campos.nome || !campos.data) {
          r.descartados += 1;
          avisar(`${rotulo}: sem nome ou data; não entra`);
          continue;
        }
        const conferidoEm = item.conferidoPorCampo
          ? { padrao: item.conferidoEm || agora().toISOString(), ...item.conferidoPorCampo }
          : (item.conferidoEm || agora().toISOString());
        const v = gravarItem(db, { fonte: fonte.id, item, campos, conferidoEm, agora, somados, lugares });
        const festaId = v.festaId;
        if (v.nova) {
          r.novas += 1;
          resumo.festasNovas += 1;
        }
        r.gravados += 1;
        tocadas.add(festaId);
        bater();
        if (Array.isArray(item.imagens) && item.imagens.length) {
          pendentesImagens.push({ fonte: fonte.id, idExterno: item.idExterno, festaId, imagens: item.imagens });
        }
        if (classificar && precisaClassificar(item, campos)) pendentes.push({ item, campos, festaId });
      }

      for (const { item, campos, festaId } of pendentes) {
        const c = await classificador.classificar({
          festaId,
          nome: campos.nome,
          casa: campos.casa,
          lineup: campos.lineup,
          categorias: item.categorias,
          texto: item.texto,
        });
        if (!c || !c.resultado) continue;
        gravarValores(db, festaId, c.por, camposDaClassificacao(c.resultado, campos), agora().toISOString());
      }
    }

    // Tempo 2: imagens e geocodificação, fora de transação, só com `ligada: true`.
    const cfgImagens = config.imagens || {};
    if (cfgImagens.ligada === true && pendentesImagens.length) {
      try {
        resumo.imagens = await imagens.processarPendentes(db, pendentesImagens, { fetch, agora, log, config: cfgImagens, dir: dirImagens, batimento: bater });
        for (const a of resumo.imagens.avisos || []) avisar(`imagens: ${a}`);
      } catch (e) {
        avisar(`imagens: o preparo falhou (${e.message})`);
      }
    } else if (pendentesImagens.length) {
      resumo.imagensPendentes = pendentesImagens.length;
    }
    const cfgGeo = config.geocodificacao || {};
    if (cfgGeo.ligada === true && tocadas.size) {
      try {
        const geo = geocodificar.criarGeocodificador({ db, fetch, config: cfgGeo, agora, log });
        const qGeo = db.prepare("SELECT 1 FROM valores WHERE festa_id = ? AND campo = 'geo' LIMIT 1");
        const qEnd = db.prepare("SELECT valor FROM valores WHERE festa_id = ? AND campo = 'endereco'");
        for (const festaId of tocadas) {
          if (qGeo.get(festaId)) continue;
          const enderecos = qEnd.all(festaId).map((l) => JSON.parse(l.valor)).filter((e) => e && e.texto);
          if (!enderecos.length) continue;
          const achado = await geo.localizar(enderecos[0]);
          bater();
          if (achado) gravarValores(db, festaId, 'nominatim', { geo: achado }, agora().toISOString());
        }
        resumo.geocodificacao = geo.resumo();
      } catch (e) {
        avisar(`geocodificação: falhou (${e.message})`);
      }
    }

    // Tempo 3: a passada de correlação sobre as festas tocadas.
    try {
      resumo.correlacao = correlacao.passada(db, { festasTocadas: [...tocadas], agora, log, config: config.correlacao || {} });
    } catch (e) {
      avisar(`correlação: a passada falhou (${e.message})`);
    }
    // Depois da passada, uma festa tocada pode ter sido absorvida: vale o id novo.
    const tocadasFinais = [...new Set([...tocadas].map((id) => correlacao.resolverId(db, id)))];

    // Tempo 4: as fontes de festa, pelo id final.
    const deFesta = fontesDeFesta || require('../fontes').fontesDeFesta(config);
    resumo.fontesDeFesta = {};
    for (const f of deFesta) {
      try {
        const rf = await f.aplicar({ db, agora, festasTocadas: tocadasFinais, config: config[f.id] || {}, log });
        resumo.fontesDeFesta[f.id] = { gravados: (rf && rf.gravados) || 0 };
        for (const a of (rf && rf.avisos) || []) avisar(`${f.id}: ${a}`);
      } catch (e) {
        resumo.fontesDeFesta[f.id] = { erro: e.message };
        avisar(`${f.id}: falhou (${e.message})`);
      }
    }

    resumo.festasTocadas = tocadas.size;
    // A correlação no resumo (U6): festas tocadas com mais de uma fonte e
    // uniões possíveis à espera de olho humano.
    const qFontes = db.prepare('SELECT COUNT(DISTINCT fonte) AS n FROM vinculos WHERE festa_id = ?');
    resumo.festasMultiFonte = tocadasFinais.filter((id) => qFontes.get(id).n > 1).length;
    resumo.candidatos = db.prepare('SELECT COUNT(DISTINCT festa_id || char(31) || fonte || char(31) || id_externo) AS n FROM candidatos').get().n;
    resumo.classificacao = classificador.resumo();
    resumo.leitura = extrator.resumo();
    if (apify) resumo.apifyUsd = apify.gastoUsd();
    if (fila.size) resumo.fila = [...fila].slice(0, 50);
    db.prepare("UPDATE execucoes SET estado = 'ok', fim = ?, resumo = ? WHERE id = ?")
      .run(agora().toISOString(), JSON.stringify(resumo), execucaoId);
    return { execucaoId, ...resumo };
  } catch (e) {
    resumo.erro = e.message;
    db.prepare("UPDATE execucoes SET estado = 'erro', fim = ?, resumo = ? WHERE id = ?")
      .run(agora().toISOString(), JSON.stringify(resumo), execucaoId);
    throw e;
  }
}

module.exports = { executar, travar, precisaClassificar, gravarItem, SEM_BATIMENTO_MIN, LEITURA_DO_MODELO };

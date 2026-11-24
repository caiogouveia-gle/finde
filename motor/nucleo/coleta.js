'use strict';
// Uma execução do motor, de ponta a ponta: trava, coleta de cada fonte ligada,
// normaliza, junta, classifica e grava, e fecha com um resumo (M10).

const crypto = require('node:crypto');
const { transacao } = require('./banco');
const { normalizarItem, horario, semCodigo } = require('./normalizar');
const { vincular, gravarValores } = require('./agregar');
const { criarClassificador } = require('./classificar');
const { criarExtrator } = require('./extrair');
const { criarApify } = require('./apify');

const TRAVA_MIN = 30;

function travar(db, gatilho, agora) {
  return transacao(db, () => {
    const limite = new Date(agora.getTime() - TRAVA_MIN * 60e3).toISOString();
    db.prepare("UPDATE execucoes SET estado = 'erro', fim = ?, resumo = ? WHERE estado = 'rodando' AND inicio < ?")
      .run(agora.toISOString(), JSON.stringify({ erro: `abandonada (mais de ${TRAVA_MIN} min rodando)` }), limite);
    const rodando = db.prepare("SELECT id FROM execucoes WHERE estado = 'rodando'").get();
    if (rodando) return null;
    return Number(db.prepare("INSERT INTO execucoes (inicio, estado, gatilho) VALUES (?, 'rodando', ?)")
      .run(agora.toISOString(), gatilho).lastInsertRowid);
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
}) {
  const inicio = agora();
  const execucaoId = travar(db, gatilho, inicio);
  if (!execucaoId) {
    log.warn('[motor] outra execução está rodando; esta não começa');
    return { recusada: true };
  }

  const classificador = criarClassificador({ db, claude, execucaoId, agora, log, ...classificadorOpcoes });
  // Prova acadêmica (KTD12–KTD14): o Apify, o leitor de flyer e página, e a
  // fila de links de ingresso que uma fonte acha e outra lê na mesma execução.
  const apify = apifyPronto !== undefined ? apifyPronto : criarApify({ token: apifyToken, fetch, db, execucaoId, agora, log });
  const extrator = criarExtrator({ db, classificador, execucaoId, agora, log });
  const fila = new Set();
  const resumo = { fontes: {}, festasNovas: 0, festasTocadas: 0, avisos: [] };
  const tocadas = new Set();
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
        coletado = await fonte.coletar({ db, fetch, agora, log, config: config[fonte.id] || {}, apify, extrator, fila, classificador });
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
        // O bruto guardado (e copiado para o bucket) também sai sem código de
        // indicação nos links; só o envio da produtora fica como veio.
        const brutoGuardado = fonte.id === 'envio' ? item.bruto : { ...item.bruto };
        if (fonte.id !== 'envio') for (const k of ['linkCompra', 'linkEvento']) if (brutoGuardado[k]) brutoGuardado[k] = semCodigo(brutoGuardado[k]);
        const hash = crypto.createHash('sha256').update(JSON.stringify(brutoGuardado)).digest('hex');
        const festaId = transacao(db, () => {
          db.prepare(`INSERT INTO itens_brutos (fonte, id_externo, hash, bruto, coletado_em) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (fonte, id_externo) DO UPDATE SET hash = excluded.hash, bruto = excluded.bruto, coletado_em = excluded.coletado_em`)
            .run(fonte.id, item.idExterno, hash, JSON.stringify(brutoGuardado), agora().toISOString());
          const v = vincular(db, { fonte: fonte.id, idExterno: item.idExterno, url: item.url, campos, agora: typeof conferidoEm === 'string' ? conferidoEm : conferidoEm.padrao });
          if (v.nova) {
            r.novas += 1;
            resumo.festasNovas += 1;
          }
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
          gravarValores(db, v.festaId, fonte.id, juntos, { padrao: agora().toISOString(), ...quando });
          return v.festaId;
        });
        r.gravados += 1;
        tocadas.add(festaId);
        if (precisaClassificar(item, campos)) pendentes.push({ item, campos, festaId });
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
        gravarValores(db, festaId, c.por, camposDaClassificacao(c.resultado, campos), agora().toISOString());
      }
    }
    resumo.festasTocadas = tocadas.size;
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

module.exports = { executar, travar, precisaClassificar };

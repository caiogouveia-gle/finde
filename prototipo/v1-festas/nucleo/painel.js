'use strict';
// O resumo dos números da validação, comum ao painel do terminal
// (ferramentas/numeros.js) e ao painel ao vivo do app (/admin, rota
// GET /api/painel). Junta a landing, o app e o motor; dos e-mails, só a conta.

// Os e-mails distintos de vários CSVs (a primeira coluna); null se algum falhou.
function emailsUnicos(csvs) {
  if (!csvs.length || csvs.some((c) => typeof c !== 'string')) return null;
  return new Set(csvs.flatMap((c) => c.trim().split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean))).size;
}

function juntarNps(a, b) {
  const soma = (k) => (a?.[k] || 0) + (b?.[k] || 0);
  const n = soma('respostas');
  if (!n) return null;
  const media = ((a?.media || 0) * (a?.respostas || 0) + (b?.media || 0) * (b?.respostas || 0)) / n;
  return { respostas: n, promotores: soma('promotores'), neutros: soma('neutros'), detratores: soma('detratores'), nps: Math.round(((soma('promotores') - soma('detratores')) / n) * 100), media: Math.round(media * 10) / 10 };
}

function montarResumo({ landing, app, motor, csvs = [], agora = new Date() }) {
  const festas = Array.isArray(motor?.festas) ? motor.festas : null;
  return {
    geradoEm: agora.toISOString(),
    motor: festas ? {
      festas: festas.length,
      produtoras: new Set(festas.map((f) => f.produtora?.nome || f.produtora).filter(Boolean)).size,
      comMediaDeIdade: festas.filter((f) => Number.isInteger(f.mediaIdade)).length,
      atualizadoEm: motor.geradoEm,
    } : motor,
    landing,
    app,
    nps: juntarNps(landing?.opiniao, app?.opiniao),
    lista: (landing?.lista?.inscritos || 0) + (app?.lista?.inscritos || 0),
    listaUnicos: emailsUnicos(csvs),
    equipeFora: (landing?.equipeFora || 0) + (app?.equipeFora || 0),
  };
}

// As festas mais abertas com nome e produtora do motor, no lugar do id.
function nomearFestas(topFestas, festasDoMotor) {
  const porId = new Map((festasDoMotor || []).map((f) => [f.id, f]));
  return (topFestas || []).map((t) => {
    const m = porId.get(t.id);
    return { ...t, nome: m ? m.nome : null, produtora: m ? (m.produtora?.nome || m.produtora || null) : null };
  });
}

// O painel ao vivo: o app lê os próprios números direto e busca os da landing
// e do motor pela rede. Landing e motor ficam em cache por `cacheMs`, para
// que várias abas abertas não multipliquem as idas.
function criarPainel({ local, listaLocal, urlLanding, urlMotor, token, cacheMs = 10000, agoraMs = () => Date.now(), buscar = fetch }) {
  let cache = null;
  const pegar = async (url, { comToken = true, texto = false } = {}) => {
    try {
      const r = await buscar(url, { headers: comToken ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return { erro: `${r.status} em ${new URL(url).host}` };
      return await (texto ? r.text() : r.json());
    } catch (e) {
      return { erro: `sem resposta de ${new URL(url).host}` };
    }
  };
  function deFora() {
    if (cache && agoraMs() - cache.em < cacheMs) return cache.v;
    // A promessa fica no cache: dois pedidos juntos fazem uma ida só.
    const v = buscarFora();
    cache = { em: agoraMs(), v };
    v.catch(() => { cache = null; });
    return v;
  }
  async function buscarFora() {
    const [landing, motor, csv] = await Promise.all([
      urlLanding ? pegar(`${urlLanding}/api/numeros`) : null,
      urlMotor ? pegar(`${urlMotor}/api/festas`, { comToken: false }) : null,
      urlLanding ? pegar(`${urlLanding}/api/numeros/lista.csv`, { texto: true }) : null,
    ]);
    return { landing, motor, csv };
  }
  return async function painel() {
    const { landing, motor, csv } = await deFora();
    const app = local();
    const csvs = [listaLocal(), ...(csv === null ? [] : [csv])];
    const resumo = montarResumo({ landing, app, motor, csvs, agora: new Date(agoraMs()) });
    const festas = Array.isArray(motor?.festas) ? motor.festas : [];
    if (resumo.app && !resumo.app.erro) resumo.app = { ...resumo.app, topFestas: nomearFestas(resumo.app.topFestas, festas) };
    // Sem a lista da landing, o painel diz que a conta dos e-mails está incompleta.
    if (csv && typeof csv !== 'string') resumo.listaErro = csv.erro || 'lista da landing sem resposta';
    // Os comentários vão (o painel é do admin); e-mails, nunca.
    return resumo;
  };
}

module.exports = { emailsUnicos, juntarNps, montarResumo, nomearFestas, criarPainel };

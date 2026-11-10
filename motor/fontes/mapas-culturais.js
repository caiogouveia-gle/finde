'use strict';
// APIs abertas de agenda no padrão Mapas Culturais (M2): o Mapa da Cultura, do
// Ministério da Cultura, e o SP Cultura, da Prefeitura. O software publica os
// dados para consulta pública por uma API sem chave.
//
// Em 10/11/2026: o filtro por município não funciona em findOccurrences, então
// buscamos as ocorrências da janela e depois os espaços pelo id, filtrando a
// cidade. Naquele dia o Mapa da Cultura tinha 342 ocorrências nos 30 dias
// seguintes e nenhuma na cidade de São Paulo; o SP Cultura não respondia. O
// conector fica ligado porque é permitido e custa pouco; quando a Prefeitura
// voltar, ele traz a agenda da cidade sem mudar nada.

const AGENTE = 'FindeMotor/0.1 (+https://github.com/caiogouveia-gle/finde)';
const LOTE_IDS = 100;

function dataSP(d) {
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

async function pegarJson(fetch, base, rota, params, timeoutMs) {
  const u = new URL(rota, base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { 'User-Agent': AGENTE, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${u.hostname} respondeu ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`${u.hostname} não devolveu uma lista`);
  return j;
}

function endereco(s) {
  const rua = [s.En_Nome_Logradouro, s.En_Num].filter(Boolean).join(', ');
  return [rua, s.En_Bairro].filter(Boolean).join(' - ') || null;
}

async function coletarInstancia(inst, { fetch, agora, config }) {
  const hoje = agora();
  const ate = new Date(hoje.getTime() + (config.dias || 14) * 86400e3);
  const timeout = config.timeoutMs || 20000;
  const ocorrencias = await pegarJson(fetch, inst.base, '/api/event/findOccurrences', {
    '@from': dataSP(hoje),
    '@to': dataSP(ate),
    '@select': 'id,name,shortDescription,terms,classificacaoEtaria,singleUrl,instagram',
  }, timeout);

  const ids = [...new Set(ocorrencias.map((o) => o.space && o.space.id).filter(Number.isInteger))];
  const espacos = new Map();
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    const achados = await pegarJson(fetch, inst.base, '/api/space/find', {
      '@select': 'id,name,En_Municipio,En_Bairro,En_Nome_Logradouro,En_Num',
      id: `IN(${lote.join(',')})`,
      En_Municipio: `ILIKE(${config.municipio || 'São Paulo'})`,
    }, timeout);
    for (const s of achados) espacos.set(s.id, s);
  }

  const itens = [];
  for (const o of ocorrencias) {
    const s = o.space && espacos.get(o.space.id);
    if (!s) continue;
    const inicio = typeof o.starts_at === 'string' ? o.starts_at.slice(0, 5) : null;
    const fim = typeof o.ends_at === 'string' && o.ends_at !== o.starts_at ? o.ends_at.slice(0, 5) : null;
    const eventoId = o.event_id || o.id;
    itens.push({
      idExterno: `${inst.id}:${eventoId}:${o.starts_on}:${inicio || ''}`,
      url: o.singleUrl || `${inst.base.replace(/\/$/, '')}/evento/${eventoId}/`,
      texto: [o.shortDescription, o.rule && o.rule.description, o.rule && o.rule.priceInfo].filter(Boolean).join('\n'),
      categorias: (o.terms && o.terms.linguagem) || [],
      bruto: {
        nome: o.name,
        casa: s.name,
        endereco: endereco(s),
        bairro: s.En_Bairro,
        data: o.starts_on,
        inicio,
        fim,
        preco: o.rule && o.rule.price,
        idadeMinima: o.classificacaoEtaria,
        linkEvento: o.singleUrl || `${inst.base.replace(/\/$/, '')}/evento/${eventoId}/`,
        instagram: o.instagram,
        // Passa adiante só para o normalizador descartar com aviso (R16).
        ...(o.mediaIdade !== undefined ? { mediaIdade: o.mediaIdade } : {}),
      },
    });
  }
  return { itens, total: ocorrencias.length };
}

module.exports = {
  id: 'mapas-culturais',
  nome: 'Mapas Culturais (Mapa da Cultura, SP Cultura)',
  async coletar(ctx) {
    const itens = [];
    const avisos = [];
    for (const inst of ctx.config.instancias || []) {
      if (inst.ligada === false) continue;
      try {
        const r = await coletarInstancia(inst, ctx);
        itens.push(...r.itens);
        if (ctx.log) ctx.log.info(`[motor] ${inst.id}: ${r.total} ocorrências na janela, ${r.itens.length} na cidade`);
      } catch (e) {
        const causa = e.cause && (e.cause.code || e.cause.message);
        avisos.push(`${inst.id}: ${e.name === 'TimeoutError' ? 'não respondeu a tempo' : e.message}${causa ? ` (${causa})` : ''}`);
      }
    }
    return { itens, avisos };
  },
};

'use strict';
// As correções da revisão adversarial de 24/11 no núcleo e no Instagram, cada
// uma com o cenário que falhava.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const { normalizarItem, semCodigo } = require('../nucleo/normalizar');
const { validarResposta } = require('../nucleo/classificar');
const { lerConfig, fontesLigadas, descreverFontes } = require('../fontes');
const instagram = require('../fontes/instagram');
const { novoBanco, relogio, logMudo, claudeFalso } = require('./ajuda');

const fonteFixa = (id, itens) => ({ id, nome: id, coletar: async () => ({ itens: typeof itens === 'function' ? itens() : itens, avisos: [] }) });

test('privacidade: contato de promoter não vai para a regra de entrada', () => {
  const r = validarResposta({
    ehFesta: true, estilos: [], idadeMinima: null, lineup: [], confianca: 'alta', pistaCheia: null,
    documento: 'RG com foto', vestimenta: 'traje livre, dúvidas (11) 98888-7777', lista: 'lista com @fulana.promo até 23h',
  });
  assert.equal(r.documento, 'RG com foto');
  assert.equal(r.vestimenta, null);
  assert.equal(r.lista, null);
  assert.equal(validarResposta({ ehFesta: true, estilos: [], idadeMinima: null, lineup: [], confianca: 'alta', pistaCheia: null, documento: null, vestimenta: null, lista: 'envie para lista@exemplo.com' }).lista, null);
});

test('privacidade: código de indicação e rastreio sai do link de toda fonte, menos do envio', () => {
  assert.equal(semCodigo('https://www.sympla.com.br/evento/x/1?d=ra&mp_rloc=SP&id=3'), 'https://www.sympla.com.br/evento/x/1?id=3');
  assert.equal(semCodigo('https://shotgun.live/e/x?ref=fulana&fbclid=abc'), 'https://shotgun.live/e/x');
  const ig = normalizarItem({ nome: 'X', data: '2026-11-28', linkCompra: 'https://www.ingresse.com/x/?promoter=FULANA' }, 'instagram').campos;
  assert.equal(ig.linkCompra, 'https://www.ingresse.com/x/');
  const envio = normalizarItem({ nome: 'X', data: '2026-11-28', linkCompra: 'https://www.ingresse.com/x/?promoter=CASA' }, 'envio').campos;
  assert.equal(envio.linkCompra, 'https://www.ingresse.com/x/?promoter=CASA');
});

// O teste "cartaz coletado não é guardado" saiu (U5 do plano de 24/11/2026): a
// imagem agora vai por item.imagens, e a regra nova é testada em
// normalizar.test.js (U9) e indicacao.test.js (U14).

test('registro: --fonte não liga conector da prova sem --poc; o Instagram não aparece duas vezes', () => {
  const config = lerConfig();
  assert.deepEqual(fontesLigadas(config, { so: 'instagram' }).fontes, []);
  assert.deepEqual(fontesLigadas(config, { so: 'instagram', poc: true }).fontes.map((f) => f.id), ['instagram']);
  assert.deepEqual(fontesLigadas(config, { so: 'envio' }).fontes.map((f) => f.id), ['envio']);
  const ids = descreverFontes(config).map((f) => f.id);
  assert.equal(ids.filter((i) => i === 'instagram').length, 1);
});

test('vínculo: o mesmo link de compra no mesmo dia junta o flyer e a página do ingresso', async () => {
  const db = novoBanco();
  const flyer = { idExterno: 'ig:a:1', bruto: { nome: 'Baile do Galpão', data: '2026-11-28', inicio: '22:00', linkCompra: 'https://www.sympla.com.br/evento/baile/9' } };
  const pagina = { idExterno: 'pagina:x', bruto: { nome: 'BAILE DO GALPÃO 3 ANOS (open bar)', casa: 'Outro Nome', data: '2026-11-28', linkEvento: 'https://www.sympla.com.br/evento/baile/9/' } };
  await executar({ db, fontes: [fonteFixa('instagram', [flyer]), fonteFixa('paginas', [pagina])], agora: relogio(), log: logMudo });
  const festas = listarRegistros(db, { todas: true });
  assert.equal(festas.length, 1);
  assert.deepEqual(festas[0].fontes.map((f) => f.id).sort(), ['instagram', 'paginas']);
});

test('soma na execução: dois itens da mesma fonte para a mesma festa não apagam os campos um do outro', async () => {
  const db = novoBanco();
  const comPreco = { idExterno: 'ig:a:1', bruto: { nome: 'Baile X', casa: 'Galpão', data: '2026-11-28', lotes: [{ nome: '1º lote', preco: 40 }], linkCompra: 'https://www.ingresse.com/x/' } };
  const comLineup = { idExterno: 'ig:b:1', bruto: { nome: 'Baile X', casa: 'Galpão', data: '2026-11-28', lineup: ['DJ Y'] } };
  await executar({ db, fontes: [fonteFixa('instagram', [comPreco, comLineup])], agora: relogio(), log: logMudo });
  const [f] = listarRegistros(db, { todas: true });
  assert.equal(f.precoAPartirDe.valor, 40);
  assert.deepEqual(f.lineup, ['DJ Y']);
  assert.equal(f.linkCompra, 'https://www.ingresse.com/x/');
});

test('intervalo: fonte de uma vez por dia não roda de novo no mesmo dia, salvo --forcar', async () => {
  const db = novoBanco();
  const agora = relogio();
  let chamadas = 0;
  const fonte = { id: 'instagram', nome: 'i', coletar: async () => { chamadas += 1; return { itens: [], avisos: [] }; } };
  const config = { instagram: { intervaloHoras: 20 } };
  await executar({ db, fontes: [fonte], agora, log: logMudo, config });
  agora.andar(5 * 3600e3);
  const r2 = await executar({ db, fontes: [fonte], agora, log: logMudo, config });
  assert.equal(chamadas, 1);
  assert.equal(r2.fontes.instagram.pulada, true);
  await executar({ db, fontes: [fonte], agora, log: logMudo, config, forcar: true });
  assert.equal(chamadas, 2);
  agora.andar(21 * 3600e3);
  await executar({ db, fontes: [fonte], agora, log: logMudo, config });
  assert.equal(chamadas, 3);
});

test('custo: item lido pelo Claude (flyer, página) não paga a classificação de novo', async () => {
  const db = novoBanco();
  const claude = claudeFalso([{ ehFesta: true, estilos: [], idadeMinima: null, lineup: [], documento: null, vestimenta: null, lista: null, pistaCheia: null, confianca: 'alta' }]);
  const item = { idExterno: 'ig:a:1', lidoPorModelo: true, texto: 'legenda longa', bruto: { nome: 'Baile', data: '2026-11-28' } };
  await executar({ db, fontes: [fonteFixa('instagram', [item])], claude, agora: relogio(), log: logMudo });
  assert.equal(claude.pedidos.length, 0);
});

// Instagram com Apify falso: o post traz duas festas; na segunda rodada a primeira já passou.
function apifyFalso(festasDoFlyer) {
  const chamadas = [];
  return {
    chamadas,
    rodar: async (ator) => {
      chamadas.push(ator);
      if (ator.includes('profile')) return [{ username: 'casa', externalUrl: 'https://www.ingresse.com/x/' }];
      return [{ shortCode: 'P1', url: 'https://www.instagram.com/p/P1/', caption: 'agenda', timestamp: '2026-11-20T10:00:00Z', ownerUsername: 'casa' }];
    },
    festasDoFlyer,
  };
}

test('Instagram: o vínculo é pela festa, não pela posição no post', async () => {
  const db = novoBanco();
  const agora = relogio();
  const festaA = { nome: 'Festa A', data: '2026-11-12', inicio: null, fim: null, casa: 'Casa', endereco: null, lotes: [], linkCompra: null, lineup: [], estilos: [], idadeMinima: null };
  const festaB = { ...festaA, nome: 'Festa B', data: '2026-11-29' };
  const extrator = { lerFlyer: async () => ({ festas: [festaA, festaB], confianca: 'alta' }) };
  const conector = { ...instagram, coletar: (ctx) => instagram.coletar({ ...ctx, extrator, apify: apifyFalso() }) };
  const config = { instagram: { perfis: ['casa'], seguirBio: false } };
  await executar({ db, fontes: [conector], agora, log: logMudo, config });
  agora.andar(3 * 86400e3); // a festa A (12/11) já passou
  await executar({ db, fontes: [conector], agora, log: logMudo, config });
  const nomes = listarRegistros(db, { todas: true }).map((f) => `${f.nome} ${f.data}`).sort();
  assert.deepEqual(nomes, ['Festa A 2026-11-12', 'Festa B 2026-11-29']);
});

test('Instagram: os perfis vão ao Apify uma vez por semana', async () => {
  const db = novoBanco();
  const agora = relogio();
  const apify = apifyFalso();
  // O registro do uso é do cliente real; aqui o falso grava como ele grava.
  const rodar = apify.rodar;
  apify.rodar = async (ator, ...r) => {
    const itens = await rodar(ator, ...r);
    db.prepare("INSERT INTO uso_apify (quando, ator, itens, custo_usd, resultado) VALUES (?, ?, ?, 0, 'ok')").run(agora().toISOString(), ator, itens.length);
    return itens;
  };
  const extrator = { lerFlyer: async () => ({ festas: [], confianca: 'alta' }) };
  const ctx = () => ({ db, fetch: async () => new Response('x'), agora, log: logMudo, config: { perfis: ['casa'] }, apify, extrator, fila: new Set() });
  await instagram.coletar(ctx());
  agora.andar(2 * 86400e3);
  await instagram.coletar(ctx());
  agora.andar(6 * 86400e3);
  await instagram.coletar(ctx());
  assert.equal(apify.chamadas.filter((a) => a.includes('profile')).length, 2);
  assert.equal(apify.chamadas.filter((a) => !a.includes('profile')).length, 3);
});

// ---------------------------------------------------------------- segunda revisão (24/11)

test('agenda: duas festas da mesma agenda no mesmo dia continuam duas', async () => {
  const db = novoBanco();
  const paginas = require('../fontes/paginas');
  const pagina = { url: 'https://casax.example/agenda', final: 'https://casax.example/agenda', status: 200, titulo: 'Agenda', texto: '', links: [], dados: null,
    jsonld: [
      { '@type': 'Event', name: 'Matinê Infantil de Samba', startDate: '2026-11-28T15:00:00-03:00', location: { name: 'Casa X', address: 'Rua Exemplo, 1 - Pinheiros, São Paulo - SP' } },
      { '@type': 'Event', name: 'Noite Techno Profundo', startDate: '2026-11-28T23:00:00-03:00', location: { name: 'Casa X', address: 'Rua Exemplo, 1 - Pinheiros, São Paulo - SP' } },
    ] };
  const conector = { ...paginas, coletar: (ctx) => paginas.coletar({ ...ctx, lerPaginas: async () => [pagina], dormir: async () => {} }) };
  await executar({ db, fontes: [conector], agora: relogio(), log: logMudo, config: { paginas: { agendas: ['https://casax.example/agenda'], pausaMs: 0 } } });
  const nomes = listarRegistros(db, { todas: true }).map((f) => f.nome).sort();
  assert.deepEqual(nomes, ['Matinê Infantil de Samba', 'Noite Techno Profundo']);
});

test('data: festa que mudou de data na página do ingresso muda na busca e no vínculo por link', async () => {
  const db = novoBanco();
  const agora = relogio();
  const link = 'https://shotgun.live/pt-br/events/festa-z';
  let data = '2026-11-28';
  const pagina = fonteFixa('paginas', () => [{ idExterno: `pagina:${link}`, bruto: { nome: 'Festa Z', data, linkEvento: link } }]);
  await executar({ db, fontes: [pagina], agora, log: logMudo });
  data = '2026-11-29';
  agora.andar(86400e3);
  await executar({ db, fontes: [pagina], agora, log: logMudo });
  // O flyer escreve o link de outro jeito (sem o idioma) e com a data nova.
  const flyer = fonteFixa('instagram', [{ idExterno: 'ig:p:1', bruto: { nome: 'FESTA Z apresenta convidados', data: '2026-11-29', linkCompra: 'https://shotgun.live/events/festa-z?ref=x' } }]);
  await executar({ db, fontes: [flyer], agora, log: logMudo });
  const festas = listarRegistros(db, { de: '2026-11-29', todas: true });
  assert.equal(festas.length, 1);
  assert.equal(festas[0].data, '2026-11-29');
});

test('intervalo: falha por dentro da fonte não conta como rodada', async () => {
  const db = novoBanco();
  const agora = relogio();
  let n = 0;
  const fonte = { id: 'instagram', nome: 'i', coletar: async () => { n += 1; return { itens: [], avisos: ['posts não vieram (502)'], rodou: false }; } };
  const config = { instagram: { intervaloHoras: 20 } };
  await executar({ db, fontes: [fonte], agora, log: logMudo, config });
  agora.andar(3 * 3600e3);
  await executar({ db, fontes: [fonte], agora, log: logMudo, config });
  assert.equal(n, 2);
});

test('privacidade: contato não passa no nome do lote nem com celular sem DDD ou nome na lista', () => {
  const c = normalizarItem({ nome: 'X', data: '2026-11-28', lotes: [{ nome: 'Lista com @fulana.promo', preco: 30 }, { nome: '1º lote', preco: 50 }] }, 'instagram').campos;
  assert.deepEqual(c.lotes.map((l) => l.nome), ['Lista', '1º lote']);
  const base = { ehFesta: true, estilos: [], idadeMinima: null, lineup: [], confianca: 'alta', pistaCheia: null, documento: null, vestimenta: null };
  assert.equal(validarResposta({ ...base, lista: 'nome na lista: 98888-7777' }).lista, null);
  assert.equal(validarResposta({ ...base, lista: 'lista com Fulana até 23h' }).lista, null);
  assert.equal(validarResposta({ ...base, lista: 'chama no whats' }).lista, null);
  assert.equal(validarResposta({ ...base, lista: 'nome na lista até 23h' }).lista, 'nome na lista até 23h');
});

test('privacidade: o bruto guardado sai sem código de indicação no link', async () => {
  const db = novoBanco();
  const item = { idExterno: 'grupo:x', bruto: { nome: 'X', data: '2026-11-28', linkCompra: 'https://cart.ingresse.com/abc/tickets?cod=JOAO10' } };
  await executar({ db, fontes: [fonteFixa('indicacao', [item])], agora: relogio(), log: logMudo });
  const bruto = db.prepare('SELECT bruto FROM itens_brutos').get().bruto;
  assert.doesNotMatch(bruto, /JOAO10/);
});

test('Apify: rodada que não termina é cancelada e conta pelo teto', async () => {
  const { criarApify } = require('../nucleo/apify');
  const db = novoBanco();
  const chamadas = [];
  const f = async (u, op = {}) => {
    const url = String(u);
    chamadas.push({ url, op });
    if (url.includes('/abort')) return new Response(JSON.stringify({ data: { id: 'r', status: 'ABORTED', defaultDatasetId: 'ds', usageTotalUsd: 0.01 } }));
    if (url.includes('/runs?') || url.includes('/actor-runs/')) return new Response(JSON.stringify({ data: { id: 'r', status: 'RUNNING', defaultDatasetId: 'ds', usageTotalUsd: 0.01 } }));
    return new Response(null, { status: 204 });
  };
  const apify = criarApify({ token: 't', fetch: f, db, agora: relogio(), log: logMudo, esperaS: 0 });
  await assert.rejects(apify.rodar('apify~instagram-scraper', {}, { tetoUsd: 0.05, timeoutS: 0 }), /RUNNING|ABORTED/);
  assert.ok(chamadas.some((c) => c.url.includes('/actor-runs/r/abort') && c.op.method === 'POST'));
  assert.ok(chamadas.some((c) => c.op.method === 'DELETE'));
  assert.equal(db.prepare('SELECT custo_usd FROM uso_apify').get().custo_usd, 0.05);
});

test('Instagram: links da bio guardados voltam à fila nos dias sem rodada de perfis', async () => {
  const db = novoBanco();
  const agora = relogio();
  const apify = { rodar: async (ator) => (ator.includes('profile') ? [{ username: 'casa', externalUrl: 'https://www.ingresse.com/festa-bio/' }] : []) };
  const ctx = (fila) => ({ db, fetch: async () => new Response('x'), agora, log: logMudo, config: { perfis: ['casa'] }, apify, extrator: null, fila });
  db.prepare("INSERT INTO uso_apify (quando, ator, itens, custo_usd, resultado) VALUES (?, 'apify~instagram-profile-scraper', 1, 0, 'ok')").run(new Date(agora().getTime() + 1000).toISOString());
  const f1 = new Set();
  db.prepare("DELETE FROM uso_apify").run();
  await instagram.coletar(ctx(f1));
  assert.ok(f1.has('https://www.ingresse.com/festa-bio/'));
  db.prepare("INSERT INTO uso_apify (quando, ator, itens, custo_usd, resultado) VALUES (?, 'apify~instagram-profile-scraper', 1, 0, 'ok')").run(agora().toISOString());
  agora.andar(2 * 86400e3);
  const f2 = new Set();
  await instagram.coletar(ctx(f2));
  assert.ok(f2.has('https://www.ingresse.com/festa-bio/'));
});

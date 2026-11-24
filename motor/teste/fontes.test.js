'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mapas = require('../fontes/mapas-culturais');
const ical = require('../fontes/ical');
const envio = require('../fontes/envio');
const { lerConfig, fontesLigadas, descreverFontes, DESLIGADAS } = require('../fontes');
const { normalizarItem } = require('../nucleo/normalizar');
const { relogio, fetchFalso, novoBanco, logMudo } = require('./ajuda');

const dados = (n) => fs.readFileSync(path.join(__dirname, 'dados', n), 'utf8');
const CONFIG_MAPAS = { dias: 14, municipio: 'São Paulo', instancias: [{ id: 'mapa-da-cultura', base: 'https://mapa.example' }] };

test('Mapas Culturais: filtra a cidade pelos espaços e monta o item', async () => {
  const f = fetchFalso([
    [/findOccurrences/, dados('mapas-ocorrencias.json')],
    [/space\/find/, (u) => {
      assert.match(u.searchParams.get('id'), /^IN\(77,88\)$/);
      assert.equal(u.searchParams.get('En_Municipio'), 'ILIKE(São Paulo)');
      return dados('mapas-espacos.json');
    }],
  ]);
  const r = await mapas.coletar({ fetch: f, agora: relogio(), config: CONFIG_MAPAS });
  assert.deepEqual(r.avisos, []);
  assert.equal(r.itens.length, 2); // a de Joinville (espaço 88) fica de fora
  const baile = r.itens.find((i) => i.bruto.nome === 'Baile da Praça');
  assert.equal(baile.idExterno, 'mapa-da-cultura:501:2026-11-14:20:00');
  assert.equal(baile.bruto.endereco, 'Rua Exemplo, 500 - Barra Funda');
  const { campos, avisos } = normalizarItem(baile.bruto, 'mapas-culturais');
  assert.equal(campos.fim, '2026-11-15T02:00:00-03:00');
  assert.deepEqual(campos.lotes, [{ nome: 'Entrada', preco: 0, disponivel: null }]);
  assert.equal(campos.idadeMinima, 18);
  assert.equal(campos.endereco.bairro, 'barra-funda');
  assert.equal(campos.mediaIdade, undefined); // AE2: descartada
  assert.match(avisos.join(), /R16/);
  const expo = r.itens.find((i) => i.bruto.nome === 'Exposição de Gravuras');
  assert.equal(expo.bruto.fim, null); // fim igual ao início não é fim
});

test('Mapas Culturais: instância fora do ar vira aviso, não derruba a coleta', async () => {
  const f = fetchFalso([[/spcultura/, new TypeError('fetch failed')], [/findOccurrences/, '[]']]);
  const r = await mapas.coletar({
    fetch: f, agora: relogio(), log: logMudo,
    config: { instancias: [{ id: 'spcultura', base: 'https://spcultura.example' }, { id: 'mapa-da-cultura', base: 'https://mapa.example' }] },
  });
  assert.equal(r.itens.length, 0);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /^spcultura: fetch failed/);
});

test('iCal: desdobra linhas, converte UTC para −03:00 e ignora o que já passou', () => {
  const itens = ical.itensDoIcs(dados('agenda.ics'), { url: 'https://coletivo.example/agenda.ics', produtora: 'Coletivo Exemplo' }, { agora: relogio(), dias: 30 });
  assert.equal(itens.length, 2);
  const sexta = itens.find((i) => i.bruto.nome === 'Sexta Sem Pressa');
  assert.equal(sexta.bruto.casa, 'Terraço Exemplo');
  assert.equal(sexta.bruto.inicio, '18:00');
  assert.match(sexta.texto, /House e disco no terraço\.\nLote único/);
  const after = itens.find((i) => i.bruto.nome === 'After Exemplo');
  assert.equal(after.bruto.data, '2026-11-14'); // 02h UTC de domingo = 23h de sábado em SP
  assert.equal(after.bruto.inicio, '23:00');
  assert.equal(after.bruto.fim, '05:00');
  assert.match(after.texto, /foi dobrada pelo calendário/);
});

test('envio: os exemplos validam, ganham data do próximo fim de semana e são marcados', async () => {
  const pasta = path.join(__dirname, '..', 'exemplos', 'envios');
  const r = await envio.coletar({ db: novoBanco(), log: logMudo, agora: relogio(), config: { pastas: [pasta] } });
  assert.deepEqual(r.avisos, []);
  assert.equal(r.itens.length, 4);
  for (const i of r.itens) {
    assert.equal(i.bruto.exemplo, true);
    assert.equal(i.bruto.ehFesta, true);
    assert.match(i.bruto.data, /^2026-11-1[345]$/);
  }
  assert.equal(r.itens.find((i) => i.idExterno === 'coletivo-expediente:sexta-sem-pressa').bruto.data, '2026-11-13');
  assert.equal(r.itens.find((i) => i.idExterno === 'coletivo-expediente:domingo-de-quintal').bruto.data, '2026-11-15');
});

test('envio: datas de exemplo ficam no mesmo fim de semana em qualquer dia', () => {
  const sab = new Date('2026-11-14T15:00:00Z');
  assert.deepEqual(['proxima-sexta', 'proximo-sabado', 'proximo-domingo'].map((d) => envio.dataDoExemplo(d, sab)), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.equal(envio.dataDoExemplo('2026-12-01', sab), '2026-12-01');
});

test('envio pelo endpoint: o nome da produtora vem do cadastro, não do corpo', () => {
  const r = envio.itensDoEnvio({ produtora: { nome: 'Outra Produtora' }, festas: [{ id: 'x', nome: 'X', data: '2026-11-14' }] }, { produtoraNome: 'Coletivo Certo', conferidoEm: 't', origem: 'teste' });
  assert.equal(r.itens[0].bruto.produtora.nome, 'Coletivo Certo');
  assert.equal(r.itens[0].idExterno, 'coletivo-certo:x');
});

test('M3: o registro de fontes diz o que está desligado e por quê', () => {
  const config = lerConfig();
  const fontes = descreverFontes(config);
  for (const id of ['instagram', 'resident-advisor', 'eventbrite', 'sympla', 'shotgun', 'dice', 'fever', 'google-places', 'sesc-sp', 'guia-da-parik', 'ingresse', 'visite-sao-paulo', 'ma-to', 'guia-da-semana', 'catraca-livre']) {
    const f = fontes.find((x) => x.id === id);
    assert.ok(f, id);
    assert.equal(f.ligada, false);
    assert.ok(f.motivo.length > 40, id);
  }
  assert.equal(fontes.find((x) => x.id === 'ical').ligada, false);
  assert.equal(DESLIGADAS.length, 15);
});

test('fontesLigadas não muda a configuração original', () => {
  const config = lerConfig();
  const antes = JSON.stringify(config);
  const { fontes } = fontesLigadas(config, { exemplos: true });
  assert.equal(JSON.stringify(config), antes);
  assert.deepEqual(fontes.map((f) => f.id), ['envio', 'mapas-culturais', 'indicacao']);
});

// ---------------------------------------------------------------- a prova de conceito (U20, U21; D1, D14, KTD4, KTD18)

const { fontesDeFesta, FONTES_DE_FESTA, CONECTORES } = require('../fontes');

test('config/fontes.json: os blocos da prova de conceito completa e os tetos do D1 intactos', () => {
  const c = lerConfig();
  assert.equal(c.curadoria.ligada, true);
  assert.equal(c.curadoria.arquivo, 'entrada/curadoria.json');
  assert.equal(c.avaliacoes.ligada, true);
  assert.equal(c.avaliacoes.minimo, 5);
  assert.equal(c.avaliacoes.minimoConvites, 2);
  assert.equal(c.imagens.maxMb, 300);
  assert.equal(c.imagens.folgaDias, 7);
  assert.ok(Array.isArray(c.imagens.hosts) && c.imagens.hosts.length > 0);
  assert.equal(c.geocodificacao.provedor, 'nominatim');
  assert.equal(c.geocodificacao.maxPorRodada, 20);
  assert.equal(c.correlacao.une, 5);
  assert.equal(c.correlacao.talvez, 3);
  // O Instagram e as páginas são da prova (ligam com --poc ou FINDE_POC), e dizem até quando.
  for (const id of ['instagram', 'paginas']) {
    assert.equal(c[id].pocAcademica, true);
    assert.equal(c[id].ligada, false);
    assert.match(c[id].motivo, /07\/12\/2026/);
  }
  // Bloqueio é recusa (D14): nenhuma listagem pede proxy.
  assert.ok(!(c.paginas.listagens || []).some((l) => l.proxy));
  assert.doesNotMatch(JSON.stringify(c), /FINDE_PROXY_URL/);
});

test('as fontes de festa (curadoria, avaliações) não são conectores: não entram em fontesLigadas nem em descreverFontes', () => {
  const config = lerConfig();
  for (const id of ['curadoria', 'avaliacoes']) {
    assert.ok(FONTES_DE_FESTA[id], id);
    assert.equal(CONECTORES[id], undefined, id);
    assert.equal(descreverFontes(config).some((f) => f.id === id), false, id);
  }
  const { fontes } = fontesLigadas(config, { poc: true });
  assert.equal(fontes.some((f) => f.deFesta), false);
});

test('fontesDeFesta: avaliações, depois a curadoria (que vale sobre tudo); ligada:false tira só a que pediu', () => {
  assert.deepEqual(fontesDeFesta(lerConfig()).map((f) => f.id), ['avaliacoes', 'curadoria']);
  assert.deepEqual(fontesDeFesta({}).map((f) => f.id), ['avaliacoes', 'curadoria']);
  assert.deepEqual(fontesDeFesta({ avaliacoes: { ligada: false } }).map((f) => f.id), ['curadoria']);
  assert.deepEqual(fontesDeFesta({ curadoria: { ligada: false } }).map((f) => f.id), ['avaliacoes']);
  for (const f of fontesDeFesta({})) assert.equal(typeof f.aplicar, 'function');
});

test('com --poc a prova liga Instagram e páginas, e a reserva do Apify continua de fora', () => {
  const config = lerConfig();
  const ids = (o) => fontesLigadas(config, o).fontes.map((f) => f.id);
  assert.ok(!ids({}).includes('instagram'));
  assert.ok(ids({ poc: true }).includes('instagram'));
  assert.ok(ids({ poc: true }).includes('paginas'));
  for (const reserva of ['sympla-apify', 'shotgun-apify', 'ra-apify']) assert.ok(!ids({ poc: true }).includes(reserva), reserva);
  assert.deepEqual(ids({ poc: true, so: 'instagram' }), ['instagram']);
  assert.deepEqual(ids({ so: 'instagram' }), [], 'sem --poc a fonte da prova não liga nem pedida por nome');
});

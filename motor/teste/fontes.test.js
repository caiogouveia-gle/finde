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
  for (const id of ['instagram', 'resident-advisor', 'eventbrite', 'sympla', 'shotgun', 'dice', 'fever', 'google-places', 'sesc-sp']) {
    const f = fontes.find((x) => x.id === id);
    assert.ok(f, id);
    assert.equal(f.ligada, false);
    assert.ok(f.motivo.length > 40, id);
  }
  assert.equal(fontes.find((x) => x.id === 'ical').ligada, false);
  assert.equal(DESLIGADAS.length, 9);
});

test('fontesLigadas não muda a configuração original', () => {
  const config = lerConfig();
  const antes = JSON.stringify(config);
  const { fontes } = fontesLigadas(config, { exemplos: true });
  assert.equal(JSON.stringify(config), antes);
  assert.deepEqual(fontes.map((f) => f.id), ['envio', 'mapas-culturais']);
});

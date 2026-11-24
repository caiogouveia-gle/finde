'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lerHorarios, proximoDisparo } = require('../nucleo/agenda');

test('horários do dia em São Paulo, em ordem e sem repetição', () => {
  assert.deepEqual(lerHorarios('21:00, 07:00,12:00,07:00'), [420, 720, 1260]);
  assert.throws(() => lerHorarios('25:00'), /inválido/);
  assert.throws(() => lerHorarios(''), /vazio/);
});

test('próximo disparo: mesmo dia, ou o primeiro de amanhã', () => {
  const hs = lerHorarios('07:00,12:00,17:00,21:00');
  // 15h UTC = 12h em SP: o próximo é 17h SP = 20h UTC
  assert.equal(proximoDisparo(hs, new Date('2026-11-10T15:00:00Z')).toISOString(), '2026-11-10T20:00:00.000Z');
  // 23h30 em SP (02h30 UTC do dia 11): o próximo é 07h SP do dia 11 = 10h UTC
  assert.equal(proximoDisparo(hs, new Date('2026-11-11T02:30:00Z')).toISOString(), '2026-11-11T10:00:00.000Z');
});

// ---------------------------------------------------------------- a tarefa da agenda (U20, M37, KTD18)

const { criarTarefaDeColeta } = require('../nucleo/agenda');
const { podarUso } = require('../nucleo/uso');
const { ambiente } = require('../nucleo/ambiente');
const { lerConfig } = require('../fontes');
const { novoBanco, logMudo, logQueGuarda, relogio } = require('./ajuda');

test('ambiente: FINDE_POC, FINDE_IMAGENS, FINDE_APP_TOKEN e FINDE_INSTAGRAM_PERFIS', () => {
  const vazio = ambiente({});
  assert.equal(vazio.poc, false);
  assert.equal(vazio.appToken, null);
  assert.equal(vazio.perfis, null);
  assert.match(vazio.imagens, /motor\/var\/imagens$/);
  assert.equal(ambiente({ FINDE_POC: '0' }).poc, false);
  assert.equal(ambiente({ FINDE_POC: 'true' }).poc, false, 'só "1" liga a prova paga');
  const cheio = ambiente({ FINDE_POC: '1', FINDE_IMAGENS: '/data/imagens', FINDE_APP_TOKEN: 'segredo-de-teste', FINDE_INSTAGRAM_PERFIS: '/data/entrada/contatos.json' });
  assert.equal(cheio.poc, true);
  assert.equal(cheio.imagens, '/data/imagens');
  assert.equal(cheio.appToken, 'segredo-de-teste');
  assert.equal(cheio.perfis, '/data/entrada/contatos.json');
});

// Uma execução de mentira que só guarda o que recebeu.
function espiao() {
  const chamadas = [];
  const rodar = async (o) => {
    chamadas.push({ gatilho: o.gatilho, dirImagens: o.dirImagens, fontes: o.fontes.map((f) => f.id), config: o.config });
    return { execucaoId: 7, festasTocadas: 3, festasNovas: 1, classificacao: { gastoUsd: 0.01 } };
  };
  rodar.chamadas = chamadas;
  return rodar;
}

test('com FINDE_POC=1 a lista da agenda tem instagram e paginas; sem ela, não', async () => {
  const config = lerConfig();
  const comPoc = espiao();
  await criarTarefaDeColeta({ db: novoBanco(), amb: ambiente({ FINDE_POC: '1' }), config, log: logMudo, rodar: comPoc })();
  assert.equal(comPoc.chamadas.length, 1);
  assert.equal(comPoc.chamadas[0].gatilho, 'agenda');
  assert.ok(comPoc.chamadas[0].fontes.includes('instagram'));
  assert.ok(comPoc.chamadas[0].fontes.includes('paginas'));
  for (const reserva of ['sympla-apify', 'shotgun-apify', 'ra-apify']) assert.ok(!comPoc.chamadas[0].fontes.includes(reserva), `${reserva} (reserva) não liga com a prova`);
  assert.ok(comPoc.chamadas[0].fontes.includes('envio'));

  const semPoc = espiao();
  await criarTarefaDeColeta({ db: novoBanco(), amb: ambiente({}), config, log: logMudo, rodar: semPoc })();
  assert.ok(!semPoc.chamadas[0].fontes.includes('instagram'));
  assert.ok(!semPoc.chamadas[0].fontes.includes('paginas'));
  assert.ok(semPoc.chamadas[0].fontes.includes('envio'), 'as fontes sempre ligadas seguem');
  // O config da execução leva os blocos novos (imagens, geocodificação) como estão no arquivo.
  assert.equal(comPoc.chamadas[0].config.imagens.maxMb, 300);
});

test('a tarefa passa a pasta das imagens, relata a coleta e não relata a recusada pela trava', async () => {
  const l = logQueGuarda();
  const rodar = espiao();
  await criarTarefaDeColeta({ db: novoBanco(), amb: ambiente({ FINDE_IMAGENS: '/data/imagens' }), config: lerConfig(), log: l, rodar })();
  assert.equal(rodar.chamadas[0].dirImagens, '/data/imagens');
  assert.ok(l.linhas.some((x) => /coleta 7: 3 festas, 1 novas, US\$ 0.01/.test(x)));
  const l2 = logQueGuarda();
  await criarTarefaDeColeta({ db: novoBanco(), amb: ambiente({}), config: lerConfig(), log: l2, rodar: async () => ({ recusada: true }) })();
  assert.ok(!l2.linhas.some((x) => /coleta/.test(x)));
});

test('no fim da tarefa poda o uso da API com mais de 30 dias, mesmo se a coleta falhar', async () => {
  const db = novoBanco();
  const agora = relogio(); // 10/11/2026
  const ins = db.prepare('INSERT INTO uso_api (quando, metodo, rota, status, ms, cliente) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('2026-09-01T10:00:00.000Z', 'GET', '/api/festas', 200, 5, 'publico');
  ins.run('2026-10-05T10:00:00.000Z', 'GET', '/api/festas', 200, 5, 'publico');
  ins.run('2026-10-20T10:00:00.000Z', 'GET', '/api/festas', 200, 5, 'publico');
  ins.run('2026-11-10T10:00:00.000Z', 'GET', '/api/festas', 200, 5, 'publico');
  await criarTarefaDeColeta({ db, amb: ambiente({}), config: lerConfig(), agora, log: logMudo, rodar: espiao() })();
  assert.deepEqual(db.prepare('SELECT quando FROM uso_api ORDER BY quando').all().map((l) => l.quando), ['2026-10-20T10:00:00.000Z', '2026-11-10T10:00:00.000Z']);
  // A coleta que falha propaga o erro (a agenda o loga), e a poda roda do mesmo jeito.
  ins.run('2026-08-01T10:00:00.000Z', 'GET', '/api/festas', 200, 5, 'publico');
  await assert.rejects(criarTarefaDeColeta({ db, amb: ambiente({}), config: lerConfig(), agora, log: logMudo, rodar: async () => { throw new Error('a coleta caiu'); } })(), /a coleta caiu/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM uso_api WHERE quando < '2026-10-11'").get().n, 0);
});

test('a limpeza de imagens roda no fim da tarefa, com a folga e o teto do config; erro dela vira aviso', async () => {
  const chamadas = [];
  await criarTarefaDeColeta({
    db: novoBanco(), amb: ambiente({ FINDE_IMAGENS: '/data/imagens' }), config: lerConfig(), log: logMudo, rodar: espiao(),
    limpar: (db, dir, o) => { chamadas.push({ dir, folgaDias: o.folgaDias, maxMb: o.maxMb }); return { apagadas: 2, orfaos: 0, temporarios: 1 }; },
  })();
  assert.deepEqual(chamadas, [{ dir: '/data/imagens', folgaDias: 7, maxMb: 300 }]);
  const l = logQueGuarda();
  await criarTarefaDeColeta({
    db: novoBanco(), amb: ambiente({}), config: lerConfig(), log: l, rodar: espiao(),
    limpar: () => { throw new Error('disco cheio'); },
  })();
  assert.ok(l.linhas.some((x) => /warn: .*limpeza de imagens falhou: disco cheio/.test(x)), l.linhas.join('\n'));
  // Recusada pela trava, a limpeza não roda: a outra execução pode estar no
  // tempo 2, com os WebP gravados e as linhas de imagens ainda por entrar.
  let rodou = 0;
  const contar = () => { rodou += 1; return {}; };
  await criarTarefaDeColeta({ db: novoBanco(), amb: ambiente({}), config: lerConfig(), log: logMudo, rodar: async () => ({ recusada: true }), limpar: contar })();
  assert.equal(rodou, 0);
  // Nem quando outra execução viva começou enquanto esta rodava; a abandonada
  // (sem batimento há mais de 10 min) não segura a limpeza.
  const db = novoBanco();
  const agora = relogio();
  const ins = db.prepare("INSERT INTO execucoes (inicio, estado, gatilho, atualizado_em) VALUES (?, 'rodando', 'cli', ?)");
  const viva = Number(ins.run(agora().toISOString(), new Date(agora().getTime() - 60e3).toISOString()).lastInsertRowid);
  await criarTarefaDeColeta({ db, amb: ambiente({}), config: lerConfig(), agora, log: logMudo, rodar: espiao(), limpar: contar })();
  assert.equal(rodou, 0);
  db.prepare('UPDATE execucoes SET atualizado_em = ? WHERE id = ?').run(new Date(agora().getTime() - 11 * 60e3).toISOString(), viva);
  await criarTarefaDeColeta({ db, amb: ambiente({}), config: lerConfig(), agora, log: logMudo, rodar: espiao(), limpar: contar })();
  assert.equal(rodou, 1);
});

test('podarUso: só o que passou do prazo, e diz quantas linhas', () => {
  const db = novoBanco();
  const ins = db.prepare('INSERT INTO uso_api (quando, metodo, rota, status, ms, cliente) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('2026-10-01T00:00:00.000Z', 'GET', '/x', 200, 1, 'publico');
  ins.run('2026-10-15T00:00:00.000Z', 'GET', '/x', 200, 1, 'publico');
  assert.equal(podarUso(db, { agora: new Date('2026-11-10T12:00:00Z'), dias: 30 }), 1);
  assert.equal(podarUso(db, { agora: new Date('2026-11-10T12:00:00Z'), dias: 30 }), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM uso_api').get().n, 1);
});

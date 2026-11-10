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

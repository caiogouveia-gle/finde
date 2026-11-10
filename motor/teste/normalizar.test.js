'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarItem, preco, instagram, novoId, url } = require('../nucleo/normalizar');

test('horário: fim depois da meia-noite vira o dia seguinte, em −03:00', () => {
  const { campos } = normalizarItem({ nome: 'X', data: '2026-11-14', inicio: '22:00', pistaCheia: '00:30', fim: '04:00' }, 'envio');
  assert.equal(campos.inicio, '2026-11-14T22:00:00-03:00');
  assert.equal(campos.pistaCheia, '2026-11-15T00:30:00-03:00');
  assert.equal(campos.fim, '2026-11-15T04:00:00-03:00');
});

test('pista cheia na mesma hora do início fica no mesmo dia', () => {
  const { campos } = normalizarItem({ nome: 'X', data: '2026-11-14', inicio: '18:00', pistaCheia: '18:00', fim: '23:00' }, 'envio');
  assert.equal(campos.pistaCheia, '2026-11-14T18:00:00-03:00');
});

test('preço em texto', () => {
  assert.equal(preco('Gratuito'), 0);
  assert.equal(preco('Entrada franca'), 0);
  assert.equal(preco('R$ 25,00'), 25);
  assert.equal(preco('R$20 a R$40'), 20);
  assert.equal(preco('R$ 1.200,50'), 1200.5);
  assert.equal(preco('consulte'), null);
  assert.equal(preco(-3), null);
});

test('instagram vira URL canônica; outro domínio é recusado', () => {
  assert.equal(instagram('@coletivo.x'), 'https://www.instagram.com/coletivo.x/');
  assert.equal(instagram('https://instagram.com/coletivo_x/?hl=pt'), 'https://www.instagram.com/coletivo_x/');
  assert.equal(instagram('https://evil.com/coletivo'), null);
  assert.equal(instagram('nome com espaço'), null);
});

test('URL: só http(s)', () => {
  assert.equal(url('javascript:alert(1)'), null);
  assert.equal(url('data:text/html,oi'), null);
  assert.equal(url('https://a.example/x'), 'https://a.example/x');
});

test('R16: média de idade vinda de fonte que não é o envio é descartada com aviso', () => {
  const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-11-14', mediaIdade: { valor: 30, origem: 'produtora' } }, 'mapas-culturais');
  assert.equal(campos.mediaIdade, undefined);
  assert.match(avisos.join(), /só a produtora declara/);
});

test('R16: no envio, média sem origem, origem inventada ou avaliações de menos saem', () => {
  const casos = [
    [{ valor: 30 }, /sem origem/],
    [{ valor: 30, origem: 'chute' }, /sem origem/],
    [{ valor: 30, origem: 'avaliacoes', avaliacoes: 3 }, /ao menos 5/],
    [{ valor: 30, origem: 'edicoes' }, /detalhe/],
    [{ valor: 12, origem: 'produtora' }, /fora de 18 a 60/],
  ];
  for (const [m, re] of casos) {
    const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-11-14', mediaIdade: m }, 'envio');
    assert.equal(campos.mediaIdade, undefined, JSON.stringify(m));
    assert.match(avisos.join(), re);
  }
  const ok = normalizarItem({ nome: 'X', data: '2026-11-14', mediaIdade: { valor: 31, origem: 'edicoes', detalhe: 'três últimas edições' } }, 'envio');
  assert.deepEqual(ok.campos.mediaIdade, { valor: 31, origem: 'edicoes', detalhe: 'três últimas edições' });
});

test('bairro e região saem do endereço', () => {
  const { campos } = normalizarItem({ nome: 'X', data: '2026-11-14', endereco: 'Rua Augusta, 10 - Consolação' }, 'envio');
  assert.equal(campos.endereco.bairro, 'bela-vista');
  assert.equal(campos.endereco.regiao, 'centro');
});

test('estilos fora do catálogo saem; idade "Livre" não vira idade mínima', () => {
  const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-11-14', estilos: ['house-disco', 'axe'], idadeMinima: 'Livre' }, 'envio');
  assert.deepEqual(campos.estilos, ['house-disco']);
  assert.equal(campos.idadeMinima, undefined);
  assert.match(avisos.join(), /fora do catálogo/);
});

test('data inválida não entra e avisa', () => {
  const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-02-30', inicio: '22:00' }, 'envio');
  assert.equal(campos.data, undefined);
  assert.equal(campos.inicio, undefined);
  assert.match(avisos.join(), /data inválida/);
});

test('id: formato do protótipo, estável para a mesma semente', () => {
  const a = novoId('Sexta Sem Pressa — Edição de Verão Extra Longa Demais Para Caber', '2026-11-14', 'envio:x');
  assert.match(a, /^[a-z0-9-]{1,60}$/);
  assert.ok(a.length <= 60);
  assert.equal(a, novoId('Sexta Sem Pressa — Edição de Verão Extra Longa Demais Para Caber', '2026-11-14', 'envio:x'));
  assert.notEqual(a, novoId('Sexta Sem Pressa — Edição de Verão Extra Longa Demais Para Caber', '2026-11-14', 'envio:y'));
});

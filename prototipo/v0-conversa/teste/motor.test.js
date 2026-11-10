'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const motor = require('../nucleo/motor');
const linhas = require('./fixture.json');

const { base } = motor.prepararBase(linhas);
const porId = new Map(base.map((e) => [e.id, e]));

const pedido = (extra = {}) => ({
  quem: 'amigos', quando: 'sab-noite', regiao: 'qualquer', preco: 2, clima: 'conversar', comida: 'pode', evitar: [], ...extra,
});

// Todas as combinações de critérios, para varrer as regras por inteiro.
function* todosOsPedidos() {
  for (const quem of motor.QUEM)
    for (const quando of motor.QUANDO)
      for (const regiao of ['qualquer', ...motor.REGIOES])
        for (const preco of [0, 1, 2, 3])
          for (const clima of motor.CLIMAS)
            for (const comida of motor.COMIDA_PEDIDO) yield { quem, quando, regiao, preco, clima, comida, evitar: [] };
}

test('a fixture inteira é válida', () => {
  assert.equal(base.length, linhas.length);
});

test('validação derruba linha inválida e id repetido, com aviso', () => {
  const ruins = [
    linhas[0],
    { ...linhas[1], tipo: 'balada' },
    { ...linhas[2], preco: 7 },
    { ...linhas[3], momentos: [] },
    { ...linhas[4], grupo: { min: 5, max: 2 } },
    { ...linhas[5], selo: 'patrocinado' },
    linhas[0],
    'texto solto',
  ];
  const { base: b, avisos } = motor.prepararBase(ruins);
  assert.deepEqual(b.map((e) => e.id), ['pinacoteca-luz']);
  assert.equal(avisos.length, 7);
  assert.match(avisos.join('\n'), /tipo/);
  assert.match(avisos.join('\n'), /exemplo/);
  assert.match(avisos.join('\n'), /repetido/);
});

test('filtros duros valem em toda opção, em qualquer pedido sem afrouxar preço', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    const precoAfrouxado = r.aviso && /teto/.test(r.aviso);
    for (const o of r.opcoes) {
      const e = o.experiencia;
      const momentos = motor.momentosDe(c.quando);
      assert.ok(e.momentos.some((m) => momentos.includes(m)), `${e.id} fora do momento`);
      assert.ok(e.preco <= c.preco + (precoAfrouxado ? 1 : 0), `${e.id} acima do teto`);
      const n = { so: 1, casal: 2, amigos: 4, turma: 6 }[c.quem];
      assert.ok(n >= e.grupo.min && n <= e.grupo.max, `${e.id} não cabe o grupo`);
      if (c.comida === 'hoje-nao') assert.notEqual(e.comida, 'centro');
    }
  }
});

test('evitar tira a experiência da mesa', () => {
  const primeiro = motor.escolher(pedido(), base).opcoes[0].experiencia.id;
  const r = motor.escolher(pedido({ evitar: [primeiro] }), base);
  assert.ok(!r.opcoes.some((o) => o.experiencia.id === primeiro));
});

test('as três opções são de tipos diferentes quando a base permite', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    const tipos = r.opcoes.map((o) => o.experiencia.tipo);
    const efetivo = r.aviso && /teto/.test(r.aviso) ? { ...c, preco: c.preco + 1 } : c;
    const tiposPossiveis = new Set(base.filter((e) => motor.passaDuros(e, motor.completar(efetivo))).map((e) => e.tipo));
    if (tiposPossiveis.size >= 3 && r.opcoes.length === 3) {
      assert.equal(new Set(tipos).size, 3, `${JSON.stringify(c)} -> ${tipos}`);
    }
  }
});

test('no máximo uma com comida no centro quando o pedido é "pode"', () => {
  for (const c of todosOsPedidos()) {
    if (c.comida !== 'pode') continue;
    const r = motor.escolher(c, base);
    assert.ok(r.opcoes.filter((o) => o.experiencia.comida === 'centro').length <= 1);
  }
});

test('patrocinado: nunca primeiro, no máximo um, só se passar nos duros', () => {
  let apareceu = 0;
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    const pat = r.opcoes.filter((o) => o.rotulo === 'patrocinado');
    assert.ok(pat.length <= 1);
    if (r.opcoes[0]) assert.notEqual(r.opcoes[0].rotulo, 'patrocinado');
    for (const o of pat) {
      apareceu++;
      assert.equal(o.experiencia.selo, 'patrocinado');
      const efetivo = r.aviso && /teto/.test(r.aviso) ? { ...c, preco: c.preco + 1 } : c;
      assert.ok(motor.passaDuros(o.experiencia, motor.completar(efetivo)));
    }
  }
  assert.ok(apareceu > 0, 'a fixture deveria mostrar o patrocinado em algum pedido');
});

test('patrocinado que seria o melhor não sobe para a primeira posição', () => {
  const patrocinado = porId.get('exemplo-bar-patrocinado');
  const clones = [1, 2, 3].map((i) => ({ ...patrocinado, id: `exemplo-${i}`, nome: `Exemplo ${i}` }));
  const mini = [...clones, porId.get('boteco-da-vila'), porId.get('jogos-vila-mariana'), porId.get('samba-pinheiros')];
  const r = motor.escolher(pedido({ regiao: 'paulista-ibirapuera', clima: 'conversar' }), mini);
  assert.notEqual(r.opcoes[0].rotulo, 'patrocinado');
  assert.ok(r.opcoes.filter((o) => o.rotulo === 'patrocinado').length <= 1);
});

test('patrocinado fora dos filtros duros não entra', () => {
  // De dia o bar patrocinado (só de noite) não pode aparecer.
  for (const quando of ['sab-dia', 'dom']) {
    const r = motor.escolher(pedido({ quando, clima: 'conversar' }), base);
    assert.ok(!r.opcoes.some((o) => o.rotulo === 'patrocinado'));
  }
  // Teto de preço 0: o patrocinado custa 2.
  const r = motor.escolher(pedido({ preco: 0 }), base);
  assert.ok(!r.opcoes.some((o) => o.experiencia.preco > 1));
});

test('rótulos e motivos', () => {
  const r = motor.escolher(pedido({ regiao: 'pinheiros-vila-madalena', clima: 'agitar', preco: 3 }), base);
  assert.equal(r.opcoes.length, 3);
  const primeira = r.opcoes[0];
  assert.equal(primeira.rotulo, 'sob-medida');
  assert.equal(primeira.experiencia.regiao, 'pinheiros-vila-madalena');
  assert.ok(primeira.motivos.length >= 2 && primeira.motivos.length <= 3);
  assert.match(primeira.motivos[0], /região que você pediu/);
  assert.equal(primeira.porque, primeira.experiencia.porque);
  for (const o of r.opcoes) assert.ok(['sob-medida', 'da-casa', 'patrocinado'].includes(o.rotulo));
});

test('depois: primeiro de "combina" que também passa nos filtros', () => {
  const r = motor.escolher(pedido({ quando: 'dom', regiao: 'centro', clima: 'descobrir', preco: 1, quem: 'casal' }), base);
  const pina = r.opcoes.find((o) => o.experiencia.id === 'pinacoteca-luz');
  assert.ok(pina);
  assert.equal(pina.depois.id, 'parque-da-luz');
  // À noite o parque não passa no momento, então não vira segundo tempo.
  const noite = motor.escolher(pedido({ regiao: 'paulista-ibirapuera', clima: 'descobrir', preco: 1 }), base);
  const masp = noite.opcoes.find((o) => o.experiencia.id === 'masp');
  assert.ok(masp);
  assert.equal(masp.depois, undefined);
});

test('afrouxa na ordem região, clima, preço e diz o que afrouxou', () => {
  const regiao = motor.escolher(pedido({ quando: 'dom', regiao: 'centro', clima: 'descobrir', preco: 1, quem: 'casal' }), base);
  assert.equal(regiao.opcoes.length, 3);
  assert.match(regiao.aviso, /fora do Centro/);
  assert.doesNotMatch(regiao.aviso, /clima|teto/);

  const tudo = motor.escolher(pedido({ quem: 'turma', quando: 'sex-noite', regiao: 'centro', preco: 0, clima: 'relaxar', comida: 'hoje-nao' }), base);
  assert.match(tudo.aviso, /fora do Centro/);
  assert.match(tudo.aviso, /clima/);
  assert.match(tudo.aviso, /teto/);
  assert.match(tudo.aviso, /só achei/);
  assert.ok(tudo.opcoes.length > 0);

  const sobMedida = motor.escolher(pedido(), base);
  assert.equal(sobMedida.aviso, undefined);
});

test('nunca devolve lista vazia sem dizer por quê', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    if (r.opcoes.length < 3) assert.ok(r.aviso && r.aviso.length > 10, JSON.stringify(c));
  }
  const vazio = motor.escolher(pedido(), []);
  assert.deepEqual(vazio.opcoes, []);
  assert.match(vazio.aviso, /Não achei nada/);
});

test('determinístico, inclusive com a base em outra ordem', () => {
  const invertida = [...base].reverse();
  for (const c of [pedido(), pedido({ quando: 'dom', clima: 'relaxar' }), pedido({ regiao: 'centro', quem: 'turma' })]) {
    const a = motor.escolher(c, base);
    const b = motor.escolher(c, base);
    const d = motor.escolher(c, invertida);
    assert.deepEqual(a, b);
    assert.deepEqual(a.opcoes.map((o) => o.experiencia.id), d.opcoes.map((o) => o.experiencia.id));
  }
});

test('trocar devolve outra para a mesma posição, respeitando as regras', () => {
  const c = pedido();
  const mesa = motor.escolher(c, base).opcoes.map((o) => o.experiencia.id);
  const r = motor.trocar(c, base, mesa[1], mesa);
  assert.ok(r.opcao);
  const nova = r.opcao.experiencia;
  assert.ok(!mesa.includes(nova.id));
  assert.ok(r.criterios.evitar.includes(mesa[1]));
  assert.ok(motor.passaDuros(nova, motor.completar(c)) || r.aviso);
  const outras = [mesa[0], mesa[2]].map((id) => porId.get(id).tipo);
  assert.ok(!outras.includes(nova.tipo), 'deveria variar o tipo');

  // Determinístico.
  assert.deepEqual(motor.trocar(c, base, mesa[1], mesa), r);
  // Sem `atuais`, recalcula a mesa pelos critérios.
  assert.equal(motor.trocar(c, base, mesa[1]).opcao.experiencia.id, nova.id);
});

test('trocar a primeira nunca põe o patrocinado no lugar', () => {
  for (const c of todosOsPedidos()) {
    const mesa = motor.escolher(c, base).opcoes.map((o) => o.experiencia.id);
    if (!mesa.length) continue;
    const r = motor.trocar(c, base, mesa[0], mesa);
    if (r.opcao) {
      assert.notEqual(r.opcao.rotulo, 'patrocinado');
      assert.ok(!mesa.includes(r.opcao.experiencia.id));
    } else {
      assert.ok(r.aviso);
    }
  }
});

test('trocar sem sobra diz por quê', () => {
  const mini = base.filter((e) => ['bar-no-copan', 'boteco-da-vila', 'jogos-vila-mariana'].includes(e.id));
  const c = pedido();
  const mesa = motor.escolher(c, mini).opcoes.map((o) => o.experiencia.id);
  const r = motor.trocar(c, mini, mesa[0], mesa);
  assert.equal(r.opcao, null);
  assert.match(r.aviso, /Não sobrou/);
});

test('sanear e falta', () => {
  const s = motor.sanearCriterios({ quem: 'x', quando: 'dom', preco: 9, evitar: ['ok', '<b>', 3] });
  assert.deepEqual(s, { quando: 'dom', evitar: ['ok'] });
  assert.deepEqual(motor.falta(s), ['quem', 'regiao', 'preco', 'clima', 'comida']);
});

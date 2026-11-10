'use strict';
// O motor: filtros, honestidade do resultado, patrocinada, afrouxamento,
// ordem por horário e determinismo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const motor = require('../nucleo/motor');
const { prepararBase, lerLinhas } = require('../nucleo/base');
const C = require('../nucleo/catalogo');

const { base } = prepararBase(lerLinhas(require(path.join(__dirname, '..', 'dados', 'festas.json'))));
const pedido = (extra = {}) => ({ dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80, ...extra });
const ids = (r) => r.opcoes.map((o) => o.festa.id);
const faixa = (id) => C.FAIXAS.find((f) => f.id === id);
const longe = (m, fx) => (m < fx.min ? fx.min - m : Math.max(0, m - fx.max));

// Festa mínima para os testes que precisam de base controlada.
function festa(id, extra = {}) {
  return {
    id, nome: id, produtora: 'P', casa: 'casa', bairro: 'pinheiros', regiao: 'oeste', dia: 'sab',
    inicio: 19, esquenta: 21, fim: 25, mediaIdade: 32, faixas: ['30-35'], preco: 50,
    estilos: ['house-disco'], frase: 'f', selo: 'editorial', distanciaMin: 3, origemIdade: { tipo: 'produtora' }, ...extra,
  };
}

// Todos os pedidos de formulário possíveis, sem estilo e com um estilo.
function* todosOsPedidos() {
  for (const dia of C.ORDEM_DIAS) {
    for (const j of C.JANELAS) {
      for (const fx of C.FAIXAS) {
        for (const teto of [50, 80, 150, 'sem-limite']) {
          for (const estilos of [[], ['funk'], ['house-disco', 'pop-2000']]) yield { dia, janela: j.id, faixa: fx.id, teto, estilos };
        }
      }
    }
  }
}

test('o caminho do vídeo: sábado, começo da noite, 30 a 35, até R$ 80, house e pop', () => {
  const r = motor.escolher(pedido({ estilos: ['house-disco', 'pop-2000'] }), base);
  assert.deepEqual(ids(r), ['funk-ao-entardecer', 'sabado-groove', 'noite-aurora']);
  assert.equal(r.atendem, 3);
  assert.equal(r.aviso, undefined);
  const groove = r.opcoes[1];
  assert.equal(groove.linha, 'Sáb · 19h00 · Pinheiros · média 31 anos');
  assert.equal(groove.horario, 'Começa às 19h, a pista enche às 21h e acaba à 1h.');
  assert.deepEqual(groove.motivos, ['sobra R$ 20', 'house']);
});

test('quem atende cabe no pedido de verdade: dia, preço, idade pela média, chegar e voltar', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    const fx = faixa(c.faixa);
    const j = motor.janelaPorId(c.janela);
    for (const o of r.opcoes.filter((x) => x.atende)) {
      const f = o.festa;
      assert.equal(f.dia, c.dia);
      assert.ok(c.teto === 'sem-limite' || f.preco <= c.teto, `${f.id} custa ${f.preco}`);
      assert.ok(longe(f.mediaIdade, fx) <= motor.IDADE_TOLERADA, `${f.id} média ${f.mediaIdade} em ${c.faixa}`);
      assert.ok(motor.cabeNoHorario(f, j, motor.TOLERANCIA), `${f.id} fora do horário`);
      assert.ok(f.fim <= j.fim, `${f.id} acaba depois da volta`);
      if (c.estilos.length) assert.ok(f.estilos.some((e) => c.estilos.includes(e)), `${f.id} fora do som`);
    }
  }
});

test('festa que fura o pedido diz o quê, em primeiro lugar, no porquê', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    for (const o of r.opcoes) {
      assert.equal(o.atende, o.fora.length === 0);
      assert.deepEqual(o.motivos.slice(0, o.fora.length), o.fora, o.festa.id);
      if (o.festa.preco > c.teto) assert.ok(o.fora.some((m) => /acima do teto/.test(m)));
      const fx = faixa(c.faixa);
      if (longe(o.festa.mediaIdade, fx) > motor.IDADE_TOLERADA) {
        assert.ok(o.fora.some((m) => /^média \d+, (abaixo|acima) da sua faixa$/.test(m)), `${o.festa.id} calou a idade`);
      }
    }
  }
});

test('quem pede 36 ou mais não recebe média 29 calada', () => {
  for (const dia of C.ORDEM_DIAS) {
    const r = motor.escolher({ dia, janela: 'noite', faixa: '36+', teto: 80 }, base);
    for (const o of r.opcoes) assert.ok(o.festa.mediaIdade >= 33, `${o.festa.id} média ${o.festa.mediaIdade}`);
    for (const o of r.opcoes.filter((x) => x.festa.mediaIdade < 35)) assert.match(o.motivos[0], /abaixo da sua faixa/);
  }
});

test('a pergunta "chegar e voltar" filtra a volta: no fim de tarde, quem atende acaba até as 23h', () => {
  const r = motor.escolher(pedido({ janela: 'fim-de-tarde' }), base);
  assert.equal(r.atendem, 3);
  assert.ok(r.opcoes.every((o) => o.festa.fim <= 23));
});

test('a lista sai em ordem de horário; a patrocinada fica no lugar dela e nunca em primeiro', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    const hs = r.opcoes.map((o) => o.festa.inicio);
    assert.deepEqual(hs, [...hs].sort((a, b) => a - b), JSON.stringify(c));
    if (r.opcoes.length) assert.equal(r.opcoes[0].patrocinada, false);
    const pagas = r.opcoes.filter((o) => o.patrocinada);
    assert.ok(pagas.length <= 1);
    for (const o of pagas) {
      assert.ok(o.atende, 'patrocinada só quando cabe no pedido');
      if (c.estilos.length) assert.ok(o.casaComEstilo);
    }
  }
});

test('patrocinada fraca não entra; patrocinada sem duas editoriais na frente não entra', () => {
  const fraca = prepararBase([
    festa('a'), festa('b'), festa('c'),
    festa('paga', { selo: 'patrocinado', mediaIdade: 35, esquenta: 23, fim: 25 }),
  ]).base;
  assert.ok(!motor.escolher(pedido(), fraca).opcoes.some((o) => o.patrocinada));
  const sozinha = prepararBase([festa('a'), festa('paga', { selo: 'patrocinado' })]).base;
  assert.deepEqual(ids(motor.escolher(pedido(), sozinha)), ['a']);
  const cedo = prepararBase([festa('a', { inicio: 20 }), festa('b', { inicio: 20 }), festa('c', { inicio: 20 }), festa('paga', { selo: 'patrocinado', inicio: 19 })]).base;
  assert.ok(!motor.escolher(pedido(), cedo).opcoes.some((o) => o.patrocinada), 'abriria a lista');
});

test('estilo: primeiro o som pedido; "som parecido" só quando é parecido de verdade', () => {
  for (const c of todosOsPedidos()) {
    if (!c.estilos.length) continue;
    const r = motor.escolher(c, base);
    for (const o of r.opcoes) {
      if (o.fora.includes('som parecido, não o pedido')) {
        const af = c.estilos.some((p) => o.festa.estilos.some((e) => (C.AFINIDADE[p] || {})[e] > 0));
        assert.ok(af, `${o.festa.id} não é parecido com ${c.estilos}`);
      }
    }
    if (/com som parecido/.test(r.aviso || '')) {
      assert.ok(r.opcoes.filter((o) => !o.casaComEstilo).every((o) => o.fora.includes('som parecido, não o pedido')));
    }
  }
  const r = motor.escolher(pedido({ teto: 50, estilos: ['house-disco', 'pop-2000'] }), base);
  assert.equal(r.aviso, 'Uma cabe no pedido; as outras entraram com outros sons.');
});

test('nada do jeito que você pediu: diz, e diz o que barra o som pedido', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'fim-de-tarde', faixa: '30-35', teto: 50, estilos: ['funk'] }, base);
  assert.equal(r.atendem, 0);
  assert.equal(r.aviso, 'Nada do jeito que você pediu. Funk no domingo, só com média 24.');
});

test('afrouxamento: uma frase, com o valor novo', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '30-35', teto: 80 }, base);
  assert.equal(r.aviso, 'Uma cabe no pedido; a outra entrou abrindo o horário.');
  const preco = motor.escolher({ dia: 'sab', janela: 'noite', faixa: '30-35', teto: 50 }, base);
  assert.equal(preco.aviso, 'Duas cabem no pedido; a outra entrou subindo o teto pra R$ 80.');
  for (const a of [r.aviso, preco.aviso]) assert.equal(a.split('. ').length, 1, a);
});

test('nada cabe e nada estava firme: diz que nem afrouxando e oferece outro dia', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '18-24', teto: 50 }, base);
  assert.deepEqual(r.opcoes, []);
  assert.equal(r.aviso, 'Nada cabe nesse pedido, nem afrouxando. Na sexta, sim.');
  assert.deepEqual(r.oferta, { frase: 'sexta', rotulo: 'Ver a sexta' });
});

test('lista vazia com critério firme: diz o que travou e oferece o menor degrau que resolve', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 0, firmes: ['preco'] }, base);
  assert.equal(r.aviso, 'Até R$ 0, nada cabe. Até R$ 80, sim.');
  assert.doesNotMatch(r.aviso, /nem afrouxando/);
  assert.ok(motor.escolher({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 80, firmes: ['preco'] }, base).opcoes.length > 0);
});

test('dimensão firme não afrouxa: "mais barato" não traz a festa cara de volta', () => {
  const firme = motor.escolher({ dia: 'dom', janela: 'fim-de-tarde', faixa: '30-35', teto: 0, firmes: ['preco'] }, base);
  assert.ok(firme.opcoes.every((o) => o.festa.preco === 0));
});

test('recusas são filtro duro: estilo, bairro e tipo de casa', () => {
  const r = motor.escolher(pedido({ evitarEstilos: ['house-disco'], evitarBairros: ['pinheiros', 'centro'], evitarCasas: ['rooftop'] }), base);
  assert.ok(r.opcoes.length > 0);
  for (const o of r.opcoes) {
    assert.ok(!o.festa.estilos.includes('house-disco'));
    assert.ok(!['pinheiros', 'centro'].includes(o.festa.bairro));
    assert.doesNotMatch(o.festa.casa, /rooftop/);
  }
});

test('"sem pop" e depois "funk também": a festa de funk com um pouco de pop volta', () => {
  const sem = motor.escolher(pedido({ teto: 50, estilos: ['house-disco'], evitarEstilos: ['pop-2000'] }), base);
  assert.ok(!ids(sem).includes('funk-ao-entardecer'));
  const com = motor.escolher(pedido({ teto: 50, estilos: ['house-disco', 'funk'], evitarEstilos: ['pop-2000'] }), base);
  assert.ok(ids(com).includes('funk-ao-entardecer'));
});

test('hora de voltar (voltaMax) é filtro duro', () => {
  const r = motor.escolher(pedido({ voltaMax: 23 }), base);
  assert.ok(r.opcoes.length > 0);
  assert.ok(r.opcoes.every((o) => o.festa.fim <= 23));
});

test('contrato com o front: aviso por opção, origem em texto, janela em inicioMin e fimMax', () => {
  for (const c of todosOsPedidos()) {
    const r = motor.escolher(c, base);
    for (const o of r.opcoes) {
      assert.equal(typeof o.festa.origemIdade, 'string');
      if (o.atende) assert.equal(o.aviso, null);
      else assert.match(o.aviso, /^[A-ZÁÉÍÓÚ].*\.$/);
    }
  }
  const dificil = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 50, estilos: ['funk'] }, base);
  assert.equal(dificil.opcoes[1].aviso, 'Média 33, abaixo da sua faixa; som parecido, não o pedido; R$ 10 acima do teto.');
  const c = motor.completar(pedido({ janela: 'noite' }));
  assert.equal(c.inicioMin, 22);
  assert.equal(c.fimMax, 27);
  assert.equal(motor.completar(pedido({ janela: 'noite', voltaMax: 25 })).fimMax, 25);
  // fimMax e inicioMin são derivados: o que vier de fora é ignorado.
  assert.equal(motor.sanearCriterios({ fimMax: 20, inicioMin: 3 }).fimMax, undefined);
});

test('a média sempre vem com a origem', () => {
  const r = motor.escolher(pedido(), base);
  for (const o of r.opcoes) {
    assert.match(o.origem.longa, /^(informada pela produtora|estimada pelo público das edições anteriores|a partir de \d+ avaliações de quem foi)$/);
    assert.ok(o.origem.curta);
  }
});

test('perto: a mais próxima sobe e o motivo diz quantos minutos', () => {
  const r = motor.escolher(pedido({ perto: 'pinheiros' }), base);
  assert.ok(r.opcoes.some((o) => o.festa.bairro === 'pinheiros'));
  assert.ok(r.opcoes.some((o) => o.motivos.some((m) => /^a \d+ min de Pinheiros$/.test(m))));
});

test('preço mínimo do pedido: o mais barato que ainda tem festa', () => {
  assert.equal(motor.precoMinimo(pedido(), base), 35);
  assert.equal(motor.precoMinimo({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 0 }, base), null);
});

test('determinístico: mesma entrada, mesma saída, em qualquer ordem da base', () => {
  const c = pedido({ estilos: ['mpb-samba'] });
  assert.equal(JSON.stringify(motor.escolher(c, base)), JSON.stringify(motor.escolher(c, [...base].reverse())));
});

test('sanearCriterios descarta o que vier torto; escolher exige as quatro respostas', () => {
  const c = motor.sanearCriterios({
    dia: 'qua', janela: 'madrugada', faixa: '40-50', teto: -5, estilos: ['house-disco', 'axe', 'house-disco'],
    perto: 'marte', evitar: ['ok-id', '<script>'], firmes: ['preco', 'humor'], voltaMax: 99, oferta: '<b>',
    evitarBairros: ['pinheiros', 'atlantida'], evitarCasas: ['rooftop', 'castelo'],
  });
  assert.deepEqual(c, { estilos: ['house-disco'], evitarBairros: ['pinheiros'], evitarCasas: ['rooftop'], evitar: ['ok-id'], firmes: ['preco'] });
  assert.deepEqual(motor.falta(c), ['dia', 'janela', 'faixa', 'teto']);
  assert.throws(() => motor.escolher({ dia: 'sab' }, base), /faltam critérios/);
});

test('pedido em partes: horário primeiro, estilos curtos, cada parte do formulário reabre a pergunta', () => {
  assert.equal(motor.resumoDoPedido(motor.completar(pedido({ estilos: ['funk'] }))), 'Sáb · 19h à 1h · 30 a 35 · até R$ 80 · funk');
  const partes = motor.pedidoEmPartes(motor.completar(pedido({ estilos: ['house-disco'], voltaMax: 23, perto: 'pinheiros', evitarBairros: ['centro'], evitarCasas: ['rooftop'] })));
  assert.deepEqual(partes.map((p) => p.texto), ['Sábado', 'das 19h à 1h', 'gente de 30 a 35', 'até R$ 80', 'house', 'sem rooftop', 'longe do Centro', 'voltando até as 23h', 'perto de Pinheiros']);
  assert.deepEqual(partes.map((p) => p.chave), ['dia', 'janela', 'faixa', 'teto', 'estilos', null, null, null, null]);
});

test('escrita de horário: meia-noite, 1h, meia hora; origem da média', () => {
  assert.equal(C.horaCheia(24.5), '0h30');
  assert.equal(C.asHoras(24), 'à meia-noite');
  assert.equal(C.asHoras(25), 'à 1h');
  assert.equal(C.reais(0), 'grátis');
  assert.equal(C.origemCurta({ tipo: 'avaliacoes', avaliacoes: 42 }), '42 avaliações');
  assert.equal(C.origemLonga({ tipo: 'edicoes' }), 'estimada pelo público das edições anteriores');
});

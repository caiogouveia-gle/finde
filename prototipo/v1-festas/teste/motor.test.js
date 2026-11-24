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
  for (const dia of C.DIAS_FICTICIOS) {
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
  assert.deepEqual(groove.motivos, ['dentro do seu teto', 'house']);
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
  for (const dia of C.DIAS_FICTICIOS) {
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
  assert.equal(r.aviso, 'Funk no domingo, só com média 24.');
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

// ---------------------------------------------------------------- bairros e faixa como preferência (R19 a R21)

const pedidoNovo = (extra = {}) => ({ dia: 'sab', janela: 'comeco-da-noite', idade: { min: 28, max: 35 }, teto: 80, ...extra });
const blocos = (r) => r.opcoes.map((o) => [o.festa.id, o.bloco]);

test('Covers AE7. Bairros marcados primeiro; os vizinhos completam num bloco à parte', () => {
  const r = motor.escolher(pedidoNovo({ janela: 'fim-de-tarde', bairros: ['pinheiros', 'centro'] }), base);
  assert.equal(r.opcoes.length, 3);
  assert.deepEqual(blocos(r).map(([, b]) => b), ['pedido', 'pedido', 'perto']);
  assert.equal(r.opcoes[2].festa.bairro, 'barra-funda');
  assert.equal(r.blocos.perto, 'Perto de Pinheiros e do Centro');
  assert.equal(r.noPedido, 2, 'o título conta só as do pedido');
  assert.match(r.opcoes[2].motivos[0], /^a \d+ min (de Pinheiros|do Centro)$/);
  const pedido = r.opcoes.filter((o) => o.bloco === 'pedido');
  const perto = r.opcoes.filter((o) => o.bloco === 'perto');
  assert.ok(pedido.length >= 1 && perto.length >= 1, JSON.stringify(blocos(r)));
  for (const o of pedido) assert.ok(['pinheiros', 'centro'].includes(o.festa.bairro), o.festa.id);
  for (const o of perto) assert.ok(!['pinheiros', 'centro'].includes(o.festa.bairro), o.festa.id);
  // Os do pedido vêm antes dos vizinhos, e cada bloco em ordem de horário.
  const ordemBlocos = r.opcoes.map((o) => o.bloco);
  assert.deepEqual(ordemBlocos, [...ordemBlocos].sort((a, b) => ['pedido', 'perto', 'faixa'].indexOf(a) - ['pedido', 'perto', 'faixa'].indexOf(b)));
});

test('bairro longe dos marcados não entra, nem como vizinho', () => {
  const r = motor.escolher(pedidoNovo({ bairros: ['pinheiros'] }), base);
  for (const o of r.opcoes) assert.notEqual(o.festa.bairro, 'vila-mariana', o.festa.id);
  assert.ok(motor.vizinho('pinheiros', 'vila-madalena'));
  assert.ok(motor.vizinho('pinheiros', 'barra-funda'));
  assert.ok(!motor.vizinho('pinheiros', 'vila-mariana'));
  assert.ok(motor.vizinho('centro', 'bela-vista'), 'mesma região');
});

test('São Paulo inteira (bairros vazio): nada muda em relação a sem bairros', () => {
  const a = motor.escolher(pedidoNovo(), base);
  const b = motor.escolher(pedidoNovo({ bairros: [] }), base);
  assert.deepEqual(a.opcoes.map((o) => o.festa.id), b.opcoes.map((o) => o.festa.id));
  assert.ok(a.opcoes.every((o) => o.bloco !== 'perto'));
});

test('Covers AE6. Faixa 30 a 36: a festa de média 27 vem depois, no bloco da faixa, com o aviso', () => {
  const c = { dia: 'sex', janela: 'noite', idade: { min: 30, max: 36 }, teto: 50 };
  const r = motor.escolher(c, base);
  const fora = r.opcoes.filter((o) => o.bloco === 'faixa');
  assert.ok(fora.length >= 1, JSON.stringify(blocos(r)));
  const ultimasFaixa = r.opcoes.slice(r.opcoes.length - fora.length);
  assert.deepEqual(ultimasFaixa, fora, 'o bloco da faixa fica no fim');
  for (const o of fora) assert.match(o.aviso, new RegExp(`média ${o.festa.mediaIdade}, (um pouco )?(abaixo|acima) da sua faixa`, 'i'), o.festa.id);
  const vinteSete = fora.find((o) => o.festa.mediaIdade === 27);
  assert.ok(vinteSete, JSON.stringify(blocos(r)));
  assert.match(vinteSete.aviso, /^Média 27, um pouco abaixo da sua faixa/);
});

test('nada some só por idade: faixa 18 a 20 ainda devolve três festas, todas avisadas', () => {
  const r = motor.escolher(pedidoNovo({ idade: { min: 18, max: 20 } }), base);
  assert.equal(r.opcoes.length, 3);
  assert.ok(r.opcoes.every((o) => o.bloco === 'faixa' && /acima da sua faixa/i.test(o.aviso)), JSON.stringify(blocos(r)));
});

test('aviso de idade: até 3 anos é "um pouco"; mais que isso, não', () => {
  const c = motor.completar(motor.sanearCriterios(pedidoNovo({ idade: { min: 30, max: 32 } })));
  assert.match(motor.opcao(festa('x', { mediaIdade: 35, faixas: ['30-35'] }), c).aviso, /^Média 35, um pouco acima/);
  assert.match(motor.opcao(festa('y', { mediaIdade: 40, faixas: ['36+'] }), c).aviso, /^Média 40, acima/);
  assert.equal(motor.opcao(festa('z', { mediaIdade: 31 }), c).aviso, null);
});

test('sanear: intervalo invertido se endireita, fora de 18 a 50 se apara, bairro inválido cai', () => {
  const c = motor.sanearCriterios({ idade: { min: 40, max: 30 }, bairros: ['pinheiros', 'atlantida', 'pinheiros'] });
  assert.deepEqual(c.idade, { min: 30, max: 40 });
  assert.deepEqual(c.bairros, ['pinheiros']);
  assert.deepEqual(motor.sanearCriterios({ idade: { min: 10, max: 90 } }).idade, { min: 18, max: 50 });
  assert.equal(motor.sanearCriterios({ idade: { min: 'x' } }).idade, undefined);
  assert.deepEqual(motor.falta(motor.sanearCriterios({ dia: 'sab', janela: 'noite', idade: { min: 28, max: 35 }, teto: 80 })), []);
  assert.deepEqual(motor.falta(motor.sanearCriterios({ dia: 'sab', janela: 'noite', teto: 80 })), ['faixa']);
});

test('o pedido em frase leva os bairros e a faixa, cada um reabrindo a pergunta', () => {
  const c = motor.completar(motor.sanearCriterios(pedidoNovo({ bairros: ['pinheiros', 'centro'], idade: { min: 28, max: 50 } })));
  const partes = motor.pedidoEmPartes(c);
  assert.ok(partes.some((p) => p.chave === 'bairros' && p.texto === 'em Pinheiros e no Centro'), JSON.stringify(partes));
  assert.ok(partes.some((p) => p.chave === 'idade' && p.texto === 'gente de 28 a 50 ou mais'), JSON.stringify(partes));
  assert.match(motor.resumoDoPedido(c), /28 a 50\+/);
});

test('todos os 528 intervalos de idade funcionam em todos os dias e janelas (nenhum 500)', () => {
  for (let min = 18; min <= 49; min++) {
    for (let max = min + 1; max <= 50; max++) {
      for (const dia of ['sex', 'sab', 'dom']) {
        for (const janela of ['fim-de-tarde', 'noite']) {
          const r = motor.escolher({ dia, janela, idade: { min, max }, teto: 80 }, base);
          assert.ok(Array.isArray(r.opcoes), `${min}–${max} ${dia} ${janela}`);
        }
      }
    }
  }
});

test('festa do bairro vizinho não conta como "cabe": título e fala dizem o mesmo', () => {
  for (const bairros of [['pinheiros'], ['vila-mariana'], ['centro'], ['jardins', 'barra-funda']]) {
    for (const dia of ['sex', 'sab', 'dom']) {
      for (const janela of ['fim-de-tarde', 'comeco-da-noite', 'noite']) {
        const r = motor.escolher({ dia, janela, idade: { min: 28, max: 35 }, teto: 50, bairros }, base);
        if (!r.aviso || !r.opcoes.length) continue;
        const diz = /^Duas cabem/.test(r.aviso) ? 2 : /^Uma cabe/.test(r.aviso) ? 1 : /^Nada do jeito/.test(r.aviso) ? 0 : null;
        if (diz !== null) assert.equal(diz, r.noPedido, `${bairros} ${dia} ${janela}: "${r.aviso}" com ${r.noPedido} no pedido`);
      }
    }
  }
});

test('o pedido diz o lugar com a preposição certa, e "em toda a cidade" sem bairro', () => {
  const frase = (bairros) => motor.pedidoEmPartes(motor.completar(motor.sanearCriterios(pedidoNovo({ bairros })))).find((p) => p.chave === 'bairros').texto;
  assert.equal(frase(['jardins']), 'nos Jardins');
  assert.equal(frase(['vila-madalena', 'barra-funda']), 'na Vila Madalena e na Barra Funda');
  assert.equal(frase(['pinheiros', 'centro']), 'em Pinheiros e no Centro');
  assert.equal(frase([]), 'em toda a cidade');
});

test('festa que fura o pedido (som, horário, preço) vai para um bloco rotulado depois das que cabem', () => {
  // O caso da conferência: a Gafieira (outro som) saía no meio das que cabem.
  const r = motor.escolher(pedidoNovo({ janela: 'comeco-da-noite', idade: { min: 28, max: 40 }, estilos: ['house-disco'], bairros: ['pinheiros', 'centro'] }), base);
  assert.deepEqual(r.opcoes.map((o) => [o.festa.id, o.bloco]), [
    ['disco-ao-por-do-sol', 'pedido'], ['sabado-groove', 'pedido'], ['matine-eletronica', 'perto'],
  ], 'a vaga vai para a vizinha que é house, não para a de outro som');
  assert.equal(r.noPedido, 2);
  // Quando ela aparece, vem depois, rotulada.
  const s = motor.escolher({ dia: 'sex', janela: 'fim-de-tarde', idade: { min: 28, max: 40 }, teto: 80, estilos: ['house-disco'], bairros: [] }, base);
  assert.deepEqual(s.opcoes.map((o) => o.bloco), ['pedido', 'pedido', 'quase']);
  assert.equal(s.blocos.quase, 'Quase no seu pedido');
  assert.match(s.opcoes[2].aviso, /som/);
});

test('no formulário novo, nenhuma festa com aviso fica no bloco do pedido, e os blocos vêm em ordem', () => {
  const ordem = ['pedido', 'perto', 'quase', 'faixa'];
  for (const dia of ['sex', 'sab', 'dom']) for (const janela of ['fim-de-tarde', 'comeco-da-noite', 'noite']) {
    for (const estilos of [[], ['house-disco'], ['funk']]) for (const bairros of [[], ['pinheiros', 'centro'], ['vila-mariana']]) {
      for (const teto of [50, 80]) {
        const r = motor.escolher({ dia, janela, idade: { min: 28, max: 35 }, teto, estilos, bairros }, base);
        const blocosVistos = r.opcoes.map((o) => o.bloco);
        assert.deepEqual(blocosVistos, [...blocosVistos].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)), `${dia} ${janela} ${estilos} ${bairros} ${teto}`);
        for (const o of r.opcoes) if (o.bloco === 'pedido') assert.equal(o.aviso, null, `${o.festa.id} no pedido com "${o.aviso}"`);
      }
    }
  }
});

test('o porquê não soa a conta: "sobra R$ X" vira o quanto cabe no teto', () => {
  const c = motor.completar(motor.sanearCriterios(pedidoNovo({ teto: 80 })));
  const barata = motor.opcao(festa('b', { preco: 40 }), c).motivos.join(' · ');
  const quase = motor.opcao(festa('q', { preco: 65 }), c).motivos.join(' · ');
  assert.doesNotMatch(barata + quase, /sobra R\$/);
  assert.match(barata, /bem abaixo do seu teto/);
  assert.match(quase, /dentro do seu teto/);
});

test('o aviso de horário fala como a pergunta: "seu horário" para chegar, "sua volta" para voltar', () => {
  const c = motor.completar(motor.sanearCriterios(pedidoNovo()));
  const aviso = (extra) => motor.opcao(festa('h', extra), c).aviso;
  // Das 19h à 1h. Enche às 17h: antes de você chegar.
  assert.equal(aviso({ inicio: 15, esquenta: 17, fim: 23 }), 'Enche às 17h, antes do seu horário.');
  // Enche à 0h30: perto da volta. Enche à 1h30: depois dela.
  assert.equal(aviso({ inicio: 22.5, esquenta: 24.5, fim: 25 }), 'Enche à 0h30, perto da sua volta.');
  assert.equal(aviso({ inicio: 23.5, esquenta: 25.5, fim: 28 }), 'Enche à 1h30, depois da sua volta.');
  assert.equal(aviso({ fim: 26 }), 'Acaba às 2h, depois da sua volta.');
  // Em nenhum pedido da grade sobra "sua hora" ou "sua janela".
  for (const p of todosOsPedidos()) {
    for (const o of motor.escolher(p, base).opcoes) assert.doesNotMatch(o.fora.join(' '), /sua hora\b|sua janela/, o.festa.id);
  }
});

test('furaHorario é a régua do horário: a mesma do porquê, do bloco e do afrouxamento', () => {
  const c = motor.completar(motor.sanearCriterios(pedidoNovo()));
  // Começa às 17h e enche às 19h: cabe. A pista uma hora antes de você chegar: ainda cabe (tolerância).
  assert.equal(motor.furaHorario(festa('a', { inicio: 17, esquenta: 19, fim: 23 }), c), false);
  assert.equal(motor.furaHorario(festa('b', { inicio: 16, esquenta: 18, fim: 23 }), c), false);
  // Duas horas antes: fura; abrindo o horário, não.
  assert.equal(motor.furaHorario(festa('c', { inicio: 15, esquenta: 17, fim: 23 }), c), true);
  assert.equal(motor.furaHorario(festa('c', { inicio: 15, esquenta: 17, fim: 23 }), c, motor.TOLERANCIA_AFROUXADA), false);
  // A volta dita na conversa não afrouxa.
  const volta = motor.completar(motor.sanearCriterios({ ...pedidoNovo(), voltaMax: 23 }));
  assert.equal(motor.furaHorario(festa('d'), volta, motor.TOLERANCIA_AFROUXADA), true);
  for (const p of todosOsPedidos()) {
    const cc = motor.completar(motor.sanearCriterios(p));
    for (const o of motor.escolher(p, base).opcoes) {
      assert.equal(motor.foraDoPedido(o.festa, cc).includes('horario'), motor.furaHorario(o.festa, cc), o.festa.id);
    }
  }
});

// ---------------------------------------------------------------- U27 (plano de 24/11/2026)

// Festa real no formato do conversor (/3), com dados fictícios.
function real(id, extra = {}) {
  return {
    ...festa(id, { faixas: [], frase: null, distanciaMin: null, origemIdade: null, mediaIdade: null, esquenta: null, fim: null, inicio: 22 }),
    data: '2026-11-28', dataDaNoite: '2026-11-28', real: true, local: null, esgotado: false, ...extra,
  };
}
const PEDIDO_NOVO = { dia: 'sab', janela: 'noite', idade: { min: 28, max: 35 }, teto: 80 };

test('o pedido aceita "hoje", quinta e a semana; quarta segue recusada; os 14 bairros entram', () => {
  const c = motor.sanearCriterios({ dia: 'qui', semana: 'proxima', bairros: ['interlagos', 'pinheiros', 'atlantida'], evitarBairros: ['santana'] });
  assert.deepEqual(c, { dia: 'qui', semana: 'proxima', bairros: ['interlagos', 'pinheiros'], evitarBairros: ['santana'] });
  assert.equal(motor.sanearCriterios({ dia: 'hoje' }).dia, 'hoje');
  assert.equal(motor.sanearCriterios({ dia: 'qua' }).dia, undefined);
  assert.equal(motor.sanearCriterios({ semana: 'outra' }).semana, undefined);
  assert.deepEqual(C.ORDEM_DIAS, ['hoje', 'qui', 'sex', 'sab', 'dom']);
  // "hoje" sempre é desta semana; o pedido diz a semana que vem.
  assert.equal(motor.completar({ ...PEDIDO_NOVO, dia: 'hoje', semana: 'proxima' }).semana, 'esta');
  assert.equal(motor.completar(PEDIDO_NOVO).semana, 'esta');
  const prox = motor.completar({ ...PEDIDO_NOVO, semana: 'proxima' });
  assert.equal(motor.pedidoEmPartes(prox)[0].texto, 'Sábado da semana que vem');
  assert.match(motor.resumoDoPedido(prox), /^Sáb que vem · /);
  assert.equal(motor.pedidoEmPartes(motor.completar({ ...PEDIDO_NOVO, bairros: ['interlagos'] }))[2].texto, 'em Interlagos');
});

test('"hoje": o motor aceita as festas que quem chama passou, de qualquer dia', () => {
  const seg = real('na-segunda', { dia: 'seg', data: '2026-11-30', dataDaNoite: '2026-11-30' });
  const r = motor.escolher({ ...PEDIDO_NOVO, dia: 'hoje' }, [seg]);
  assert.deepEqual(ids(r), ['na-segunda']);
  assert.equal(r.opcoes[0].dia, 'Seg');
  // A oferta de outro dia nunca é "hoje".
  const vazio = motor.escolher({ ...PEDIDO_NOVO, dia: 'qui', teto: 0, firmes: ['preco'] }, base);
  assert.doesNotMatch(vazio.aviso, /hoje/i);
});

test('preço ausente fica no bloco do pedido, dito uma vez (no porquê), e não vira "quase"', () => {
  const f = real('sem-preco', { preco: null });
  const o = motor.escolher(PEDIDO_NOVO, [f]).opcoes[0];
  assert.equal(o.bloco, 'pedido');
  assert.equal(o.atende, true);
  assert.deepEqual(o.incertos, []);
  assert.equal(o.aviso, null);
  assert.ok(o.porque.falta.some((x) => x.criterio === 'preco'));
  // Na % a sua cara, conta a metade, e a festa não chega a 100%.
  assert.ok(o.cara.semDado.includes('preco'));
  assert.ok(o.cara.pct < 100);
});

test('LUNA no Centro não some num pedido de Pinheiros; a festa sem bairro fica abaixo dela, em "Local a confirmar"', () => {
  const luna = real('luna', { bairro: 'centro', regiao: 'centro', inicio: 23 });
  const semBairro = real('sem-bairro', { bairro: null, regiao: null, inicio: 22 });
  const c = { ...PEDIDO_NOVO, bairros: ['pinheiros'] };
  const r = motor.escolher(c, [semBairro, luna]);
  assert.deepEqual(ids(r), ['luna', 'sem-bairro']);
  assert.deepEqual(r.opcoes.map((o) => o.bloco), ['longe', 'local']);
  assert.equal(r.blocos.local, 'Local a confirmar');
  assert.equal(r.blocos.longe, 'Longe de Pinheiros');
  assert.equal(r.opcoes[0].atende, false);
  // E em "ver todas" (ordenarTodas), a mesma ordem.
  assert.deepEqual(motor.ordenarTodas(c, [semBairro, luna]).map((o) => o.festa.id), ['luna', 'sem-bairro']);
  // A fictícia longe continua fora, como antes.
  assert.equal(motor.lugar({ ...luna, real: false }, motor.completar(c)), null);
});

test('real com coordenada: vizinha até 3 km do ponto do bairro pedido, com a distância em km', () => {
  const c = { ...PEDIDO_NOVO, bairros: ['pinheiros'] };
  // Na Vila Madalena (Praça Benedito Calixto), a 1,3 km do Largo da Batata.
  const perto = real('perto', { bairro: 'vila-madalena', local: { lat: -23.5611, lng: -46.6825, precisao: 'rua' } });
  // Na Bela Vista, a uns 5 km: mesma cidade, longe.
  const longe = real('longe', { bairro: 'bela-vista', regiao: 'centro', local: { lat: -23.5579, lng: -46.644, precisao: 'casa' } });
  // Precisão de bairro não mede.
  const soBairro = real('so-bairro', { bairro: 'bela-vista', regiao: 'centro', local: { lat: -23.5579, lng: -46.644, precisao: 'bairro' } });
  const cc = motor.completar(c);
  assert.equal(motor.lugar(perto, cc), 'perto');
  assert.equal(motor.lugar(longe, cc), 'longe');
  assert.equal(motor.distanciaKm(perto, cc), 1.3);
  assert.ok(motor.distanciaKm(longe, cc) > 4);
  assert.equal(motor.distanciaKm(soBairro, cc), null);
  const r = motor.escolher(c, [perto, longe]);
  assert.equal(r.opcoes[0].festa.id, 'perto');
  assert.equal(r.opcoes[0].distanciaKm, 1.3);
  assert.ok(r.opcoes[0].motivos.includes('a 1,3 km de Pinheiros'), r.opcoes[0].motivos.join(' | '));
  // A real sem coordenada não ganha os minutos da tabela das fictícias.
  const semPonto = motor.escolher(c, [real('sem-ponto', { bairro: 'vila-madalena' })]).opcoes[0];
  assert.ok(!semPonto.motivos.some((m) => /min /.test(m)), semPonto.motivos.join(' | '));
  assert.equal(semPonto.distanciaKm, null);
});

test('horário sem início: não fura, a régua não sai e a opção diz que é incerto', () => {
  const f = real('sem-inicio', { inicio: null, horarioIncerto: true });
  const r = motor.escolher(PEDIDO_NOVO, [f, real('com-inicio', { inicio: 23 })]);
  assert.deepEqual(ids(r), ['com-inicio', 'sem-inicio']);
  const o = r.opcoes[1];
  assert.equal(o.horarioIncerto, true);
  assert.equal(o.hora, null);
  assert.equal(o.linha, 'Sáb · horário a confirmar · Pinheiros');
  assert.equal(o.horario, 'O horário ainda não foi divulgado.');
  assert.deepEqual(o.fora, []);
  assert.ok(o.porque.falta.some((x) => x.criterio === 'horario'));
  assert.equal(motor.furaHorario(f, motor.completar(PEDIDO_NOVO)), false);
});

test('o porquê em dados: até duas partes que cabem, na ordem dos pesos, e tudo o que falta', () => {
  const f = real('porque', { inicio: 23, mediaIdade: 31, origemIdade: 'informada pela produtora', estilos: [], preco: 40 });
  const c = { ...PEDIDO_NOVO, bairros: ['pinheiros'] };
  const o = motor.escolher(c, [f]).opcoes[0];
  assert.deepEqual(o.porque.cabe, [{ criterio: 'horario', valor: '23h' }, { criterio: 'idade', valor: 'média 31' }]);
  assert.deepEqual(o.porque.falta, [{ criterio: 'som', valor: null }]);
  // A fictícia também traz o porquê (a lista tira dela o pct e a cara).
  const fic = motor.escolher({ ...PEDIDO_NOVO, teto: 'sem-limite' }, base).opcoes[0];
  assert.ok(fic.porque.cabe.length >= 1 && fic.porque.cabe.length <= 2);
  // Avaliação de quem foi: "4 de 5 da idade", nunca a média sozinha.
  const av = real('av', { mediaIdade: 31, avaliacaoIdade: { avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 } });
  const oa = motor.escolher(PEDIDO_NOVO, [av]).opcoes[0];
  assert.deepEqual(oa.porque.cabe.find((x) => x.criterio === 'idade'), { criterio: 'idade', valor: '4 de 5 da idade' });
  assert.doesNotMatch(oa.linha, /média/);
});

test('avaliação de outra faixa não fura a idade (é sem dado); a da faixa cruza e cabe', () => {
  const av = (naMedida, faixa) => real(`av-${faixa.join('-')}`, { mediaIdade: 45, avaliacaoIdade: { avaliacoes: 6, naMedida, faixa, convites: 2 } });
  const c = motor.completar(PEDIDO_NOVO);
  assert.equal(motor.idadeNoPedido(av(0.8, [29, 34]), c), 'dentro');
  assert.equal(motor.idadeNoPedido(av(0.2, [29, 34]), c), 'fora');
  assert.equal(motor.idadeNoPedido(av(0.8, [41, 48]), c), 'sem');
  const o = motor.escolher(PEDIDO_NOVO, [av(0.8, [41, 48])]).opcoes[0];
  assert.deepEqual(o.fora, []);
  assert.notEqual(o.bloco, 'faixa');
});

test('ordenarTodas: todas as reais do dia, menos as recusadas, na ordem do motor', () => {
  const festas = [
    real('cabe', { inicio: 23 }),
    real('cara', { inicio: 23, preco: 300 }),
    real('recusada', { inicio: 23 }),
    real('outro-dia', { inicio: 23, dia: 'dom', data: '2026-11-29', dataDaNoite: '2026-11-29' }),
  ];
  const todas = motor.ordenarTodas({ ...PEDIDO_NOVO, evitar: ['recusada'] }, festas);
  assert.deepEqual(todas.map((o) => o.festa.id), ['cabe', 'cara']);
  assert.ok(todas.every((o) => o.porque && o.cara && 'distanciaKm' in o));
});

test('revisão cara-de-ia-03: o aviso diz o que falta pelo nome, e não "sem todos os dados"', () => {
  const sab = base.filter((f) => f.dia === 'sab');
  const bairro = sab[0].bairro;
  // Uma festa sem bairro nem coordenada entra incerta num pedido com bairro.
  const semBairro = { ...sab[0], id: 'sem-bairro-teste', bairro: null, regiao: null, coordenada: null, lat: null, lng: null };
  const r = motor.escolher({ dia: 'sab', janela: 'noite', faixa: '30-35', teto: 'sem-limite', bairros: [bairro] }, [semBairro, ...sab.filter((f) => f.bairro === bairro).slice(0, 1)]);
  assert.equal(r.aviso, 'Uma cabe no pedido; a outra entrou sem dizer o bairro.');
});

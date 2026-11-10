'use strict';
// O motor: filtros duros, pontuação, patrocinada, diversidade, afrouxamento e determinismo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const motor = require('../nucleo/motor');
const { prepararBase, lerLinhas } = require('../nucleo/base');
const C = require('../nucleo/catalogo');

const { base } = prepararBase(lerLinhas(require(path.join(__dirname, '..', 'dados', 'festas.json'))));
const pedido = (extra = {}) => ({ dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80, ...extra });
const ids = (r) => r.opcoes.map((o) => o.festa.id);

// Festa mínima para os testes que precisam de base controlada.
function festa(id, extra = {}) {
  return {
    id, nome: id, produtora: 'P', casa: 'casa', bairro: 'pinheiros', regiao: 'oeste', dia: 'sab',
    inicio: 19, esquenta: 21, fim: 25, mediaIdade: 32, faixas: ['30-35'], preco: 50,
    estilos: ['house-disco'], frase: 'f', selo: 'editorial', distanciaMin: 3, ...extra,
  };
}

test('o caminho do vídeo: sábado, começo da noite, 30 a 35, até R$ 80, house e pop', () => {
  const r = motor.escolher(pedido({ estilos: ['house-disco', 'pop-2000'] }), base);
  assert.deepEqual(ids(r), ['sabado-groove', 'noite-pop-2000', 'noite-aurora']);
  assert.equal(r.aviso, undefined);
  const [primeira] = r.opcoes;
  assert.equal(primeira.linha, 'Sáb · 19h00 · Pinheiros · média 31 anos');
  assert.deepEqual(primeira.motivos, ['pista cheia às 21h', 'R$ 20 abaixo do teto']);
  assert.equal(primeira.horario, 'Começa às 19h, esquenta às 21h e acaba à 1h.');
});

test('filtros duros: dia, faixa, teto e horário de toda festa sem afrouxar', () => {
  for (const dia of C.ORDEM_DIAS) {
    for (const j of C.JANELAS) {
      for (const teto of [50, 80, 150, 'sem-limite']) {
        const c = { dia, janela: j.id, faixa: '30-35', teto };
        const r = motor.escolher(c, base);
        for (const o of r.opcoes) {
          assert.equal(o.festa.dia, dia);
          if (!r.afrouxou.includes('preco')) assert.ok(teto === 'sem-limite' || o.festa.preco <= teto, `${o.festa.id} custa ${o.festa.preco}`);
          if (!r.afrouxou.includes('idade')) assert.ok(o.festa.faixas.includes('30-35'), o.festa.id);
          if (!r.afrouxou.includes('horario')) assert.ok(motor.cabeNoHorario(o.festa, j, motor.TOLERANCIA), o.festa.id);
        }
      }
    }
  }
});

test('janela: a festa que abre à 1h não entra no começo da noite', () => {
  const r = motor.escolher(pedido({ teto: 'sem-limite' }), base);
  assert.ok(!ids(r).includes('galpao-aberto'));
  const tarde = motor.escolher(pedido({ janela: 'noite', faixa: '25-29', teto: 'sem-limite' }), base);
  assert.ok(tarde.opcoes.every((o) => o.festa.esquenta >= 21));
});

test('patrocinada: no máximo uma, nunca em primeiro, só quando cabe sem afrouxar', () => {
  for (const dia of C.ORDEM_DIAS) {
    for (const j of C.JANELAS) {
      for (const fx of C.FAIXAS) {
        for (const teto of [50, 80, 150, 'sem-limite']) {
          const c = { dia, janela: j.id, faixa: fx.id, teto };
          const r = motor.escolher(c, base);
          const pagas = r.opcoes.filter((o) => o.patrocinada);
          assert.ok(pagas.length <= 1);
          if (r.opcoes.length) assert.equal(r.opcoes[0].patrocinada, false);
          for (const o of pagas) assert.deepEqual(motor.foraDoPedido(o.festa, motor.completar(c)), []);
        }
      }
    }
  }
  // Teto de R$ 50 tira a Noite Aurora (R$ 80) do sábado.
  assert.ok(!ids(motor.escolher(pedido({ teto: 50 }), base)).includes('noite-aurora'));
});

test('patrocinada não ocupa vaga quando sobra menos de duas editoriais', () => {
  const b = prepararBase([festa('a'), festa('paga', { selo: 'patrocinado' })]).base;
  const r = motor.escolher(pedido(), b);
  assert.deepEqual(ids(r), ['a']);
});

test('afrouxa com aviso de uma frase, e diz só o que afrouxou', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '30-35', teto: 80 }, base);
  assert.ok(r.opcoes.length < 3);
  assert.deepEqual(r.afrouxou, ['horario']);
  assert.equal(r.aviso, 'Só duas cabem, mesmo abrindo o horário.');

  const preco = motor.escolher({ dia: 'sex', janela: 'noite', faixa: '25-29', teto: 80 }, base);
  assert.equal(preco.opcoes.length, 3);
  assert.deepEqual(preco.afrouxou, ['preco']);
  assert.equal(preco.aviso, 'Pra completar a lista, subi o teto pra R$ 150.');
  assert.ok(preco.opcoes.some((o) => o.motivos.includes('R$ 10 acima do teto')));
  for (const a of [r.aviso, preco.aviso]) assert.equal(a.split('. ').length, 1, a);
});

test('nada cabe e nada estava firme: diz que nem afrouxando e oferece outro dia', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '18-24', teto: 50 }, base);
  assert.deepEqual(r.opcoes, []);
  assert.match(r.aviso, /^Nada cabe nesse pedido, nem afrouxando\. Quer ver a sexta\?$/);
  assert.equal(r.oferta.frase, 'sexta');
});

test('lista vazia com critério firme: diz o que travou e oferece o menor degrau que resolve', () => {
  const r = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 0, firmes: ['preco'] }, base);
  assert.deepEqual(r.opcoes, []);
  assert.equal(r.aviso, 'Fixei o teto em R$ 0 e nada cabe. Quer subir pra R$ 80?');
  assert.doesNotMatch(r.aviso, /nem afrouxando/);
  const aceito = motor.escolher({ dia: 'dom', janela: 'noite', faixa: '36+', teto: 80, firmes: ['preco'] }, base);
  assert.ok(aceito.opcoes.length > 0, 'a oferta resolve de verdade');
});

test('dimensão firme não afrouxa: "mais barato" não traz a festa cara de volta', () => {
  const solto = motor.escolher({ dia: 'dom', janela: 'fim-de-tarde', faixa: '30-35', teto: 0 }, base);
  assert.ok(solto.afrouxou.includes('preco'));
  const firme = motor.escolher({ dia: 'dom', janela: 'fim-de-tarde', faixa: '30-35', teto: 0, firmes: ['preco'] }, base);
  assert.ok(firme.opcoes.every((o) => o.festa.preco === 0));
  assert.ok(!firme.afrouxou.includes('preco'));
});

test('estilo recusado é filtro duro e nunca afrouxa', () => {
  const r = motor.escolher(pedido({ evitarEstilos: ['house-disco', 'funk'] }), base);
  assert.ok(r.opcoes.every((o) => !o.festa.estilos.includes('house-disco') && !o.festa.estilos.includes('funk')));
});

test('diversidade: sem estilo pedido, as três não repetem o estilo principal quando dá', () => {
  const r = motor.escolher(pedido(), base);
  const principais = r.opcoes.filter((o) => !o.patrocinada).map((o) => o.festa.estilos[0]);
  assert.equal(new Set(principais).size, principais.length);
});

test('estilo é critério: primeiro as que casam; se faltam, completa com o som mais perto e diz em uma frase', () => {
  const r = motor.escolher(pedido({ teto: 50, estilos: ['house-disco', 'pop-2000'] }), base);
  assert.equal(r.casam, 1);
  assert.ok(r.opcoes.some((o) => o.casaComEstilo));
  assert.equal(r.aviso, 'Só uma com house ou pop 2000; as outras são do som mais perto.');
  const nenhum = motor.escolher({ dia: 'dom', janela: 'fim-de-tarde', faixa: '30-35', teto: 50, estilos: ['funk'] }, base);
  assert.equal(nenhum.casam, 0);
  assert.equal(nenhum.aviso, 'Não achei funk nesse pedido; entraram as mais perto do seu som.');
});

test('o porquê nunca cita um estilo que não foi pedido', () => {
  const nomes = C.ESTILOS.map((e) => e.curto);
  for (const dia of C.ORDEM_DIAS) {
    for (const j of C.JANELAS) {
      for (const estilos of [[], ['funk'], ['house-disco', 'mpb-samba']]) {
        const r = motor.escolher({ dia, janela: j.id, faixa: '30-35', teto: 80, estilos }, base);
        const pedidos = estilos.map(C.nomeEstilo);
        for (const o of r.opcoes) {
          for (const m of o.motivos) {
            for (const n of nomes) if (m === n) assert.ok(pedidos.includes(n), `${o.festa.id}: "${m}" sem ter sido pedido`);
          }
        }
      }
    }
  }
});

test('idade: "quase na sua faixa" só até 3 anos de distância; nunca para média 40 em 30 a 35', () => {
  for (const dia of C.ORDEM_DIAS) {
    for (const j of C.JANELAS) {
      for (const fx of C.FAIXAS) {
        const r = motor.escolher({ dia, janela: j.id, faixa: fx.id, teto: 'sem-limite' }, base);
        for (const o of r.opcoes) {
          const dist = o.festa.mediaIdade < fx.min ? fx.min - o.festa.mediaIdade : Math.max(0, o.festa.mediaIdade - fx.max);
          const disse = o.motivos.some((m) => /quase na sua faixa/.test(m));
          assert.equal(disse, dist > 0 && dist <= 3, `${o.festa.id} média ${o.festa.mediaIdade} em ${fx.id}`);
          assert.ok(!o.motivos.some((m) => /perto da sua faixa/.test(m)));
        }
      }
    }
  }
});

test('hora de voltar (fimMax) é filtro duro', () => {
  const r = motor.escolher(pedido({ fimMax: 23 }), base);
  assert.ok(r.opcoes.length > 0);
  assert.ok(r.opcoes.every((o) => o.festa.fim <= 23));
  assert.ok(r.opcoes.every((o) => o.motivos.some((m) => /^acaba às/.test(m)) || o.motivos.length === 2));
});

test('"sem pop" e depois "funk também": a festa de funk com um pouco de pop volta', () => {
  const sem = motor.escolher(pedido({ teto: 50, estilos: ['house-disco'], evitarEstilos: ['pop-2000'] }), base);
  assert.ok(!ids(sem).includes('funk-ao-entardecer'));
  const com = motor.escolher(pedido({ teto: 50, estilos: ['house-disco', 'funk'], evitarEstilos: ['pop-2000'] }), base);
  assert.ok(ids(com).includes('funk-ao-entardecer'));
});

test('patrocinada só entra se casa com o estilo pedido e é tão aderente quanto a editorial que tiraria', () => {
  const mpb = motor.escolher(pedido({ estilos: ['mpb-samba'] }), base);
  assert.ok(!mpb.opcoes.some((o) => o.patrocinada));
  const fraca = prepararBase([
    festa('a'), festa('b'), festa('c'),
    festa('paga', { selo: 'patrocinado', mediaIdade: 35, esquenta: 23, fim: 25 }),
  ]).base;
  assert.ok(!motor.escolher(pedido(), fraca).opcoes.some((o) => o.patrocinada));
  const forte = prepararBase([festa('a'), festa('b'), festa('c', { mediaIdade: 35 }), festa('paga', { selo: 'patrocinado' })]).base;
  const r = motor.escolher(pedido(), forte);
  assert.equal(r.opcoes[2].festa.id, 'paga');
});

test('a lista sai em ordem de horário, com a patrocinada por último', () => {
  for (const dia of C.ORDEM_DIAS) {
    const r = motor.escolher({ dia, janela: 'comeco-da-noite', faixa: '30-35', teto: 150 }, base);
    const eds = r.opcoes.filter((o) => !o.patrocinada).map((o) => o.festa.inicio);
    assert.deepEqual(eds, [...eds].sort((a, b) => a - b));
    const i = r.opcoes.findIndex((o) => o.patrocinada);
    if (i >= 0) assert.equal(i, r.opcoes.length - 1);
  }
});

test('um estilo só: todas casam com ele quando a base permite', () => {
  const r = motor.escolher(pedido({ estilos: ['house-disco'], teto: 'sem-limite' }), base);
  assert.ok(r.opcoes.every((o) => o.festa.estilos.includes('house-disco')));
});

test('perto: a mais próxima sobe e o motivo diz quantos minutos', () => {
  const r = motor.escolher(pedido({ perto: 'pinheiros' }), base);
  assert.equal(r.opcoes[0].festa.bairro, 'pinheiros');
  assert.match(r.opcoes[0].motivos[0], /^a \d+ min de Pinheiros$/);
  const longe = motor.escolher(pedido({ perto: 'vila-mariana' }), base);
  assert.notEqual(longe.opcoes[0].festa.id, r.opcoes[0].festa.id);
});

test('evitar tira as festas já vistas', () => {
  const primeira = motor.escolher(pedido(), base);
  const r = motor.escolher(pedido({ evitar: ids(primeira) }), base);
  assert.ok(ids(r).every((id) => !ids(primeira).includes(id)));
});

test('determinístico: mesma entrada, mesma saída, em qualquer ordem da base', () => {
  const c = pedido({ estilos: ['mpb-samba'] });
  const a = JSON.stringify(motor.escolher(c, base));
  const b = JSON.stringify(motor.escolher(c, [...base].reverse()));
  assert.equal(a, b);
});

test('sanearCriterios descarta o que vier torto; escolher exige as quatro respostas', () => {
  const c = motor.sanearCriterios({
    dia: 'qua', janela: 'madrugada', faixa: '40-50', teto: -5, estilos: ['house-disco', 'axe', 'house-disco'],
    perto: 'marte', evitar: ['ok-id', '<script>'], firmes: ['preco', 'humor'], fimMax: 99, oferta: '<b>',
  });
  assert.deepEqual(c, { estilos: ['house-disco'], evitar: ['ok-id'], firmes: ['preco'] });
  assert.deepEqual(motor.falta(c), ['dia', 'janela', 'faixa', 'teto']);
  assert.throws(() => motor.escolher({ dia: 'sab' }, base), /faltam critérios/);
});

test('resumo e pedido em partes: horário primeiro, estilos curtos, cada parte do formulário reabre a pergunta', () => {
  assert.equal(motor.resumoDoPedido(motor.completar(pedido({ estilos: ['funk'] }))), 'Sáb · 19h à 1h · 30 a 35 · até R$ 80 · funk');
  assert.equal(motor.resumoDoPedido(motor.completar(pedido({ teto: 'sem-limite', perto: 'paulista' }))), 'Sáb · 19h à 1h · 30 a 35 · sem limite · perto da Paulista');
  assert.match(motor.resumoDoPedido(motor.completar(pedido({ estilos: ['funk', 'mpb-samba', 'eletronica'] }))), /vários sons$/);
  const partes = motor.pedidoEmPartes(motor.completar(pedido({ estilos: ['house-disco'], fimMax: 23, perto: 'pinheiros' })));
  assert.deepEqual(partes.map((p) => p.texto), ['Sábado', 'das 19h à 1h', 'gente de 30 a 35', 'até R$ 80', 'house', 'voltando até as 23h', 'perto de Pinheiros']);
  assert.deepEqual(partes.map((p) => p.chave), ['dia', 'janela', 'faixa', 'teto', 'estilos', null, null]);
});

test('escrita de horário: meia-noite, 1h, meia hora', () => {
  assert.equal(C.horaCheia(24.5), '0h30');
  assert.equal(C.asHoras(24), 'à meia-noite');
  assert.equal(C.asHoras(25), 'à 1h');
  assert.equal(C.asHoras(23.5), 'às 23h30');
  assert.equal(C.reais(0), 'grátis');
});

'use strict';
// "% a sua cara": pesos, renormalização, "quase", os extremos, os textos, e a
// garantia de que o campo novo não mexe em quais festas entram nem na ordem.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const motor = require('../nucleo/motor');
const { cara, PESOS, CRITERIOS, emHoras, emAnos, nomeDoSom } = require('../nucleo/cara');
const { prepararBase, lerLinhas } = require('../nucleo/base');
const C = require('../nucleo/catalogo');

const DADOS = path.join(__dirname, '..', 'dados', 'festas.json');
const { base } = prepararBase(lerLinhas(require(DADOS)));

// O pedido completo, como o motor o usa.
const pedido = (extra = {}) => motor.completar(motor.sanearCriterios({
  dia: 'sab', janela: 'comeco-da-noite', idade: { min: 28, max: 35 }, bairros: ['pinheiros'], teto: 80, estilos: ['house-disco'], ...extra,
}));

function festa(extra = {}) {
  return {
    id: 'teste', nome: 'Teste', bairro: 'pinheiros', dia: 'sab', inicio: 19, esquenta: 21, fim: 25,
    mediaIdade: 32, preco: 50, estilos: ['house-disco'], selo: 'editorial', distanciaMin: 3,
    origemIdadeCurta: 'pela produtora', ...extra,
  };
}

const porCriterio = (r) => Object.fromEntries(r.partes.map((p) => [p.criterio, p]));

test('100%: bate em tudo, com um texto concreto por critério, horário primeiro', () => {
  const r = cara(festa(), pedido());
  assert.equal(r.pct, 100);
  assert.deepEqual(r.partes.map((p) => p.criterio), ['horario', 'idade', 'bairro', 'preco', 'som']);
  assert.ok(r.partes.every((p) => p.cabe === true));
  assert.deepEqual(r.partes.map((p) => p.texto), [
    'começa às 19h, no seu horário',
    'média dentro da sua faixa',
    'em Pinheiros, como você marcou',
    'R$ 50, abaixo do seu teto',
    'house e disco, como você pediu',
  ]);
});

test('0%: fura tudo, e cada parte diz quanto', () => {
  const r = cara(festa({ inicio: 14, esquenta: 16, fim: 22, mediaIdade: 45, bairro: 'vila-mariana', preco: 150, estilos: ['funk'] }), pedido());
  assert.equal(r.pct, 0);
  assert.ok(r.partes.every((p) => p.cabe === false));
  assert.deepEqual(r.partes.map((p) => p.texto), [
    'enche às 16h, três horas antes do seu horário',
    'média 10 anos acima da sua faixa',
    'na Vila Mariana, longe de Pinheiros',
    'R$ 150, R$ 70 acima do seu teto',
    'funk, fora do que você pediu',
  ]);
});

test('quase vale meio: horário só abrindo, 2 anos fora, bairro vizinho, até 20% acima do teto', () => {
  // A pista enche duas horas antes de você chegar: o motor só aceita abrindo o horário.
  const r = cara(festa({ inicio: 15, esquenta: 17, fim: 23, mediaIdade: 37, bairro: 'vila-madalena', preco: 96, estilos: ['eletronica'] }), pedido());
  const p = porCriterio(r);
  assert.equal(p.horario.cabe, 'quase');
  assert.equal(p.horario.texto, 'enche às 17h, duas horas antes do seu horário');
  assert.equal(p.idade.cabe, 'quase');
  assert.equal(p.idade.texto, 'média 2 anos acima da sua faixa');
  assert.equal(p.bairro.cabe, 'quase');
  assert.equal(p.bairro.texto, 'na Vila Madalena, a 6 min de Pinheiros');
  assert.equal(p.preco.cabe, 'quase');
  assert.equal(p.preco.texto, 'R$ 96, R$ 16 acima do seu teto');
  // Som parecido (U27, KTD15) vale 0,5 + 0,4 × afinidade: eletrônica lembra
  // house com afinidade 1, então 0,9; e diz que é parecido.
  assert.equal(p.som.cabe, 'quase');
  assert.equal(p.som.credito, 0.9);
  assert.equal(p.som.texto, 'eletrônica, parecido com house e disco');
  // (30 + 25 + 20 + 15) × 0,5 + 10 × 0,9 = 54 de 100.
  assert.equal(r.pct, 54);
});

test('quase tem limite: além do horário aberto, de 3 anos ou de 20%, não cabe', () => {
  const p = porCriterio(cara(festa({ inicio: 14.5, esquenta: 16.5, fim: 23, mediaIdade: 39, preco: 97 }), pedido()));
  assert.equal(p.horario.cabe, false);
  assert.equal(p.horario.texto, 'enche às 16h30, duas horas e meia antes do seu horário');
  assert.equal(p.idade.cabe, false);
  assert.equal(p.idade.texto, 'média 4 anos acima da sua faixa');
  assert.equal(p.preco.cabe, false);
  // 3 anos fora ainda é quase: o mesmo "um pouco" do aviso do motor.
  const tres = porCriterio(cara(festa({ mediaIdade: 38 }), pedido()));
  assert.equal(tres.idade.cabe, 'quase');
  assert.equal(tres.idade.texto, 'média 3 anos acima da sua faixa');
  const abaixo = porCriterio(cara(festa({ mediaIdade: 27 }), pedido()));
  assert.equal(abaixo.idade.cabe, 'quase');
  assert.equal(abaixo.idade.texto, 'média 1 ano abaixo da sua faixa');
});

test('horário pela régua do motor: começar antes não fura se a pista enche no seu horário', () => {
  // Começa às 17h e enche às 19h, com o horário das 19h à 1h: o motor põe no pedido.
  const antes = porCriterio(cara(festa({ inicio: 17, esquenta: 19, fim: 23 }), pedido()));
  assert.deepEqual(antes.horario, { criterio: 'horario', cabe: true, texto: 'enche às 19h, no seu horário' });
  // A tolerância declarada do motor: a pista enche até uma hora antes de você chegar.
  const cheia = porCriterio(cara(festa({ inicio: 17, esquenta: 18.5, fim: 23 }), pedido()));
  assert.deepEqual(cheia.horario, { criterio: 'horario', cabe: true, texto: 'você chega com a pista cheia' });
  // Uma hora e meia antes já passa da tolerância: quase, com o mesmo furo do aviso.
  const cedo = porCriterio(cara(festa({ inicio: 16, esquenta: 17.5, fim: 23 }), pedido()));
  assert.equal(cedo.horario.cabe, 'quase');
  assert.equal(cedo.horario.texto, 'enche às 17h30, uma hora e meia antes do seu horário');
});

test('horário: o fim conta contra a sua volta, e a volta dita na conversa não afrouxa', () => {
  // Começa às 19h, mas acaba às 2h, uma hora depois da volta: o motor só aceita abrindo.
  const fim = porCriterio(cara(festa({ fim: 26 }), pedido()));
  assert.equal(fim.horario.cabe, 'quase');
  assert.equal(fim.horario.texto, 'acaba às 2h, uma hora depois da sua volta');
  // Quatro horas depois: nem abrindo.
  const madrugada = porCriterio(cara(festa({ fim: 29 }), pedido()));
  assert.equal(madrugada.horario.cabe, false);
  assert.equal(madrugada.horario.texto, 'acaba às 5h, quatro horas depois da sua volta');
  // Voltando até as 23h (dito na conversa), acabar à 1h não cabe nem quase.
  const volta = porCriterio(cara(festa(), pedido({ voltaMax: 23 })));
  assert.equal(volta.horario.cabe, false);
  assert.equal(volta.horario.texto, 'acaba à 1h, duas horas depois da sua volta');
  // Tarde demais: enche perto da volta, e o fim passa dela.
  const tarde = porCriterio(cara(festa({ inicio: 23.5, esquenta: 24.5, fim: 28 }), pedido()));
  assert.equal(tarde.horario.cabe, false);
  assert.equal(tarde.horario.texto, 'enche à 0h30, só meia hora antes da sua volta, e acaba às 4h');
  // Acaba logo depois de você chegar.
  const curta = porCriterio(cara(festa({ inicio: 16, esquenta: 18, fim: 20 }), pedido()));
  assert.equal(curta.horario.cabe, false);
  assert.equal(curta.horario.texto, 'acaba às 20h, só uma hora depois que você chega');
});

test('renormaliza: critério que a pessoa não pediu sai da conta e das partes', () => {
  // Cidade inteira, sem teto, nenhum som: sobram horário (30) e idade (25).
  const solto = pedido({ bairros: [], teto: 'sem-limite', estilos: [] });
  const r = cara(festa({ inicio: 15, esquenta: 17, fim: 23 }), solto);
  assert.deepEqual(r.partes.map((p) => p.criterio), ['horario', 'idade']);
  // (30 × 0,5 + 25 × 1) / 55 = 72,7%.
  assert.equal(r.pct, 73);
  // Idade de 18 a 50 ou mais também é "qualquer idade": só o horário conta.
  const qualquer = cara(festa({ inicio: 15, esquenta: 17, fim: 23, mediaIdade: 45 }), { ...solto, idade: { min: 18, max: 50 } });
  assert.deepEqual(qualquer.partes.map((p) => p.criterio), ['horario']);
  assert.equal(qualquer.pct, 50);
  // A faixa fixa da conversa antiga conta como pedida.
  const fixa = motor.completar(motor.sanearCriterios({ dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 'sem-limite' }));
  assert.deepEqual(cara(festa(), fixa).partes.map((p) => p.criterio), ['horario', 'idade']);
  // Horário fora (30 × 0) e preço quase (15 × 0,5), sem o resto: 7,5 de 45 = 17%.
  const dois = cara(festa({ inicio: 17, esquenta: 19, fim: 23, preco: 90 }), pedido({ bairros: [], estilos: [], janela: 'noite', idade: { min: 18, max: 50 } }));
  assert.deepEqual(dois.partes.map((p) => [p.criterio, p.cabe]), [['horario', false], ['preco', 'quase']]);
  assert.equal(dois.pct, 17);
});

test('preço: teto zero e preço no teto têm frase própria; bairros e sons no plural', () => {
  const gratis = pedido({ teto: 0, bairros: ['pinheiros', 'centro'], estilos: ['house-disco', 'funk'] });
  const p0 = porCriterio(cara(festa({ preco: 0 }), gratis));
  assert.deepEqual(p0.preco, { criterio: 'preco', cabe: true, texto: 'grátis, como você pediu' });
  assert.equal(p0.bairro.texto, 'em Pinheiros, um dos que você marcou');
  assert.equal(p0.som.texto, 'house e disco, um dos que você pediu');
  const p20 = porCriterio(cara(festa({ preco: 20, estilos: ['mpb-samba'] }), gratis));
  assert.equal(p20.preco.cabe, false);
  assert.equal(p20.preco.texto, 'R$ 20, e você pediu só de graça');
  assert.equal(p20.som.texto, 'MPB e samba, fora dos que você pediu');
  assert.equal(porCriterio(cara(festa({ preco: 80 }), pedido())).preco.texto, 'R$ 80, bem no seu teto');
  assert.equal(porCriterio(cara(festa({ preco: 0 }), pedido())).preco.texto, 'grátis, abaixo do seu teto');
});

test('som parecido nomeia o estilo da festa que mais lembra o pedido, pelo rótulo inteiro', () => {
  // Pedido de funk; a festa é house e disco + pop anos 2000. Quem lembra funk é o pop.
  const p = porCriterio(cara(festa({ estilos: ['house-disco', 'pop-2000'] }), pedido({ estilos: ['funk'] })));
  assert.deepEqual(p.som, { criterio: 'som', cabe: 'quase', credito: 0.74, texto: 'pop anos 2000, parecido com funk' });
  // Sem nada parecido, fica o som principal da festa.
  const fora = porCriterio(cara(festa({ estilos: ['mpb-samba', 'indie-rock'] }), pedido({ estilos: ['eletronica'] })));
  assert.equal(fora.som.texto, 'MPB e samba, fora do que você pediu');
  assert.deepEqual(C.ESTILOS.map((e) => nomeDoSom(e.id)),
    ['house e disco', 'pop anos 2000', 'MPB e samba', 'funk', 'indie e rock', 'eletrônica']);
});

test('horas por extenso, anos em algarismos (como a linha da faixa no detalhe)', () => {
  assert.equal(emHoras(0.5), 'meia hora');
  assert.equal(emHoras(1), 'uma hora');
  assert.equal(emHoras(1.5), 'uma hora e meia');
  assert.equal(emHoras(2), 'duas horas');
  assert.equal(emAnos(1), '1 ano');
  assert.equal(emAnos(5), '5 anos');
  assert.equal(emAnos(2.5), '2,5 anos');
});

// ---------------------------------------------------------------- no motor

// A grade de pedidos: o formulário antigo (faixa fixa) e o novo (intervalo,
// bairros), com e sem teto e som, nos três dias e três janelas.
function* grade() {
  for (const dia of C.DIAS_FICTICIOS) {
    for (const j of C.JANELAS) {
      for (const fx of C.FAIXAS) {
        for (const teto of [0, 50, 80, 150, 'sem-limite']) {
          for (const estilos of [[], ['funk'], ['house-disco', 'pop-2000']]) yield { dia, janela: j.id, faixa: fx.id, teto, estilos };
        }
      }
      for (const idade of [{ min: 28, max: 35 }, { min: 18, max: 50 }, { min: 33, max: 40 }]) {
        for (const bairros of [[], ['pinheiros'], ['centro', 'jardins']]) {
          for (const teto of [50, 'sem-limite']) {
            for (const estilos of [[], ['mpb-samba', 'indie-rock']]) yield { dia, janela: j.id, idade, bairros, teto, estilos };
          }
        }
      }
    }
  }
}

test('a ordem e as festas não mudaram: a mesma lista de antes do campo novo, nos 864 pedidos da grade', () => {
  const linhas = [];
  for (const p of grade()) linhas.push(motor.escolher(p, base).opcoes.map((o) => o.festa.id).join(','));
  assert.equal(linhas.length, 864);
  // Impressão digital tirada com o motor de antes do "% a sua cara" (16/11/2026).
  // Só muda se a base de festas ou a escolha do motor mudarem de propósito.
  // 19/11/2026: o lote com hora ("R$ 45 até as 20h") não vale para quem chega
  // depois dela, e 19 dos 864 pedidos mudam. Sem o `ate` dos lotes, a grade
  // dá a impressão antiga: a mudança é só essa.
  const digital = (b) => crypto.createHash('sha256')
    .update([...grade()].map((p) => motor.escolher(p, b).opcoes.map((o) => o.festa.id).join(',')).join('\n')).digest('hex');
  assert.equal(crypto.createHash('sha256').update(linhas.join('\n')).digest('hex'),
    'd3812d662809e6e5765a355e5b3ef1bb700dc2cfb7dc9d156b918d7ccbc0ba2e');
  const semHora = base.map((f) => ({ ...f, lotes: f.lotes ? f.lotes.map(({ ate, ...l }) => l) : f.lotes }));
  assert.equal(digital(semHora), '49b382ad527a7448676cf65041ebbd502f6cad2b82c882a8314d3a37253ea282');
  const video = motor.escolher({ dia: 'sab', janela: 'comeco-da-noite', faixa: '30-35', teto: 80, estilos: ['house-disco', 'pop-2000'] }, base);
  assert.deepEqual(video.opcoes.map((o) => o.festa.id), ['funk-ao-entardecer', 'sabado-groove', 'noite-aurora']);
  // Funk ao Entardecer começa às 18h e enche às 20h: cabe no horário, como o motor diz.
  assert.deepEqual(video.opcoes.map((o) => o.cara.pct), [100, 100, 100]);
});

test('toda opção do motor traz a cara bem formada, e o resto da opção fica igual', () => {
  for (const p of grade()) {
    const c = motor.completar(motor.sanearCriterios(p));
    for (const o of motor.escolher(p, base).opcoes) {
      const { cara: k, ...resto } = o;
      assert.deepEqual(resto, motor.opcao(o.festa, c));
      // Os campos da U27 (distanciaKm, porque) estão na opção, a do detalhe também.
      assert.equal(o.distanciaKm, null);
      assert.ok(Array.isArray(o.porque.cabe) && Array.isArray(o.porque.falta));
      assert.ok(Number.isInteger(k.pct) && k.pct >= 0 && k.pct <= 100);
      assert.ok(k.partes.length >= 1 && k.partes[0].criterio === 'horario');
      let soma = 0;
      let pesos = 0;
      for (const parte of k.partes) {
        assert.ok(CRITERIOS.includes(parte.criterio));
        assert.ok([true, false, 'quase'].includes(parte.cabe));
        assert.ok(typeof parte.texto === 'string' && parte.texto.length > 0 && parte.texto.length <= 80, parte.texto);
        assert.doesNotMatch(parte.texto, /undefined|null|NaN/);
        pesos += PESOS[parte.criterio];
        const credito = typeof parte.credito === 'number' ? parte.credito : parte.cabe === true ? 1 : parte.cabe === 'quase' ? 0.5 : 0;
        soma += PESOS[parte.criterio] * credito;
      }
      assert.equal(k.pct, Math.round((soma * 100) / pesos));
    }
  }
});

// A grade do formulário novo (intervalo de idade e bairros), com os sons e
// tetos que mais furam: 1.728 pedidos.
function* gradeNova() {
  for (const dia of C.DIAS_FICTICIOS) for (const j of C.JANELAS) {
    for (const bairros of [[], ['pinheiros'], ['centro', 'jardins'], ['vila-mariana']]) {
      for (const idade of [{ min: 28, max: 35 }, { min: 18, max: 50 }, { min: 25, max: 30 }, { min: 33, max: 40 }]) {
        for (const teto of [0, 50, 80, 'sem-limite']) {
          for (const estilos of [[], ['funk'], ['mpb-samba', 'indie-rock']]) yield { dia, janela: j.id, bairros, idade, teto, estilos };
        }
      }
    }
  }
}

test('a cara nunca contradiz o aviso: furo dá menos de 100, o que cabe dá 100, e o horário segue o motor', () => {
  let opcoes = 0;
  for (const p of [...grade(), ...gradeNova()]) {
    const c = motor.completar(motor.sanearCriterios(p));
    const lista = motor.escolher(p, base).opcoes;
    // No formulário do app (intervalo de idade), a primeira, quando cabe no
    // pedido, nunca tem % menor que outra da lista: o Finde não recomenda
    // primeiro a que tem menos a sua cara. (A faixa fixa da conversa antiga
    // aceita a média 1 ano fora sem aviso, e a cara conta esse ano como quase.)
    if (c.idade && lista.length && lista[0].bloco === 'pedido' && lista[0].atende) {
      assert.ok(lista.every((o) => o.cara.pct <= lista[0].cara.pct),
        `a primeira tem % menor: ${lista.map((o) => `${o.festa.id} ${o.cara.pct}`).join(', ')} em ${JSON.stringify(p)}`);
    }
    for (const o of lista) {
      opcoes++;
      const parte = porCriterio(o.cara);
      const quem = `${o.festa.id} em ${JSON.stringify(p)}`;
      // Festa com aviso (o.fora) nunca sai com 100%.
      if (o.fora.length) assert.ok(o.cara.pct < 100, `100% com aviso: ${quem}`);
      // Festa que cabe no pedido não tem parte que "não cabe"; no formulário novo, é 100%.
      if (o.atende) {
        assert.ok(o.cara.partes.every((x) => x.cabe !== false), `cabe no pedido e tem "não cabe": ${quem}`);
        if (c.idade) assert.equal(o.cara.pct, 100, `cabe no pedido e não é 100%: ${quem}`);
      }
      // O horário: cabe se, e só se, o motor não acusa furo de horário.
      const fura = motor.foraDoPedido(o.festa, c).includes('horario');
      assert.equal(parte.horario.cabe === true, !fura, `horário discorda do motor: ${quem}`);
      // A idade: "um pouco" no aviso é "quase" na cara, nunca "não cabe".
      if (c.idade && parte.idade) {
        const umPouco = o.fora.some((x) => /um pouco/.test(x));
        if (umPouco) assert.equal(parte.idade.cabe, 'quase', `"um pouco" virou "${parte.idade.cabe}": ${quem}`);
        if (motor.foraDoPedido(o.festa, c).includes('idade')) assert.notEqual(parte.idade.cabe, true, quem);
      }
      // As palavras do horário são as da pergunta: "seu horário" e "sua volta".
      for (const t of [...o.fora, ...o.cara.partes.map((x) => x.texto)]) {
        assert.doesNotMatch(t, /sua janela|sua hora\b/, quem);
      }
    }
  }
  assert.ok(opcoes > 6000);
});

test('os casos da revisão: a primeira da lista não perde ponto por começar antes, e o aviso de fim tira o 100%', () => {
  const lista = (p) => Object.fromEntries(motor.escolher(p, base).opcoes.map((o) => [o.festa.id, o]));
  // Sexta, das 19h à 1h, cidade inteira, sem teto: as três cabem no pedido e dão 100%.
  const sexta = lista({ dia: 'sex', janela: 'comeco-da-noite', bairros: [], idade: { min: 28, max: 35 }, teto: 'sem-limite', estilos: [] });
  assert.deepEqual(Object.values(sexta).map((o) => [o.festa.id, o.cara.pct]),
    [['sexta-sem-pressa', 100], ['sexta-brasileira', 100], ['clube-varanda', 100]]);
  assert.equal(porCriterio(sexta['sexta-sem-pressa'].cara).horario.texto, 'enche às 20h, no seu horário');
  // O mesmo pedido das 22h às 3h, e o domingo das 19h à 1h: antes saíam 45%, 45%, 100% e 45%, 45%, 73%.
  const noite = lista({ dia: 'sex', janela: 'noite', bairros: [], idade: { min: 28, max: 35 }, teto: 'sem-limite', estilos: [] });
  assert.deepEqual(Object.values(noite).map((o) => [o.festa.id, o.atende, o.cara.pct]),
    [['sexta-brasileira', true, 100], ['clube-varanda', true, 100], ['madrugada-leve', true, 100]]);
  assert.equal(porCriterio(noite['sexta-brasileira'].cara).horario.texto, 'você chega com a pista cheia');
  const domingo = lista({ dia: 'dom', janela: 'comeco-da-noite', bairros: [], idade: { min: 28, max: 35 }, teto: 'sem-limite', estilos: [] });
  assert.deepEqual(Object.values(domingo).map((o) => o.cara.pct), [100, 100, 100]);
  // Sexta, das 17h às 23h, cidade inteira, até R$ 50: Sexta Brasileira tem aviso de fim e não sai com 100%.
  const cedo = lista({ dia: 'sex', janela: 'fim-de-tarde', bairros: [], idade: { min: 28, max: 35 }, teto: 50, estilos: [] });
  assert.equal(cedo['sexta-brasileira'].aviso, 'Acaba à 1h, depois da sua volta.');
  assert.equal(porCriterio(cedo['sexta-brasileira'].cara).horario.cabe, 'quase');
  assert.ok(cedo['sexta-brasileira'].cara.pct < 100);
  // Sábado em Pinheiros, house: Disco ao Pôr do Sol (17h, enche às 19h) cabe no horário.
  const sab = lista({ dia: 'sab', janela: 'comeco-da-noite', bairros: ['pinheiros'], idade: { min: 28, max: 35 }, teto: 80, estilos: ['house-disco'] });
  assert.equal(sab['disco-ao-por-do-sol'].cara.pct, 100);
  // Sábado das 17h às 23h: Sábado Groove acaba à 1h, depois da volta. Aviso e cara dizem o mesmo.
  const tarde = lista({ dia: 'sab', janela: 'fim-de-tarde', bairros: ['pinheiros'], idade: { min: 28, max: 35 }, teto: 80, estilos: ['house-disco'] });
  assert.equal(tarde['sabado-groove'].aviso, 'Acaba à 1h, depois da sua volta.');
  assert.deepEqual(porCriterio(tarde['sabado-groove'].cara).horario,
    { criterio: 'horario', cabe: 'quase', texto: 'acaba à 1h, duas horas depois da sua volta' });
  assert.ok(tarde['sabado-groove'].cara.pct < 100);
  // Sexta na Vila Mariana, funk: Disco do Poente cabe no horário e o som citado é o pop, que lembra funk.
  const funk = lista({ dia: 'sex', janela: 'comeco-da-noite', bairros: ['vila-mariana'], idade: { min: 28, max: 33 }, teto: 50, estilos: ['funk'] });
  const poente = porCriterio(funk['disco-do-poente'].cara);
  assert.equal(poente.horario.cabe, true);
  assert.equal(poente.som.texto, 'pop anos 2000, parecido com funk');
  // Domingo, 25 a 30: Domingueira tem média 33, "um pouco acima" no aviso e "quase" na cara.
  const dom = lista({ dia: 'dom', janela: 'noite', bairros: ['jardins', 'centro'], idade: { min: 25, max: 30 }, teto: 150, estilos: ['mpb-samba', 'indie-rock'] });
  assert.equal(dom.domingueira.aviso, 'Média 33, um pouco acima da sua faixa.');
  assert.deepEqual(porCriterio(dom.domingueira.cara).idade,
    { criterio: 'idade', cabe: 'quase', texto: 'média 3 anos acima da sua faixa' });
});

// No detalhe a 390 px, a coluna do texto da parte tem 250 px: umas 36 letras.
// O que cabe no pedido (a lista de 100%, a mais comum) fica numa linha só, e
// a idade não repete o número da média, que está logo acima com a origem.
test('as partes que cabem cabem numa linha a 390 px', () => {
  for (const p of gradeNova()) {
    for (const o of motor.escolher(p, base).opcoes) {
      for (const parte of o.cara.partes) {
        if (parte.cabe === true) assert.ok(parte.texto.length <= 36, `${parte.texto} (${parte.texto.length})`);
        if (parte.criterio === 'idade') assert.doesNotMatch(parte.texto, /média \d+(?!\d| anos? (acima|abaixo))/, parte.texto);
      }
    }
  }
});

test('motor.opcao sozinha (o convite, o deep link) segue sem cara', () => {
  assert.equal(Object.hasOwn(motor.opcao(base[0], pedido()), 'cara'), false);
});

// ---------------------------------------------------------------- pela API

let servidor;
let raiz;
let pasta;

before(async () => {
  const { criarServidor } = require('../servidor');
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-cara-'));
  servidor = criarServidor({ dados: DADOS, varDir: path.join(pasta, 'var'), log: { info() {}, warn() {}, error() {} } });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  raiz = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  fs.rmSync(pasta, { recursive: true, force: true });
});

async function post(caminho, corpo) {
  const r = await fetch(raiz + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json() };
}

test('API: /api/festas e o ajuste em uma frase (/api/conversa) devolvem a cara, calculada pelo pedido novo', async () => {
  const criterios = { dia: 'sab', janela: 'comeco-da-noite', idade: { min: 28, max: 35 }, bairros: ['pinheiros'], teto: 80, estilos: ['house-disco'] };
  const inicio = await post('/api/festas', { criterios });
  assert.equal(inicio.status, 200);
  assert.ok(inicio.corpo.opcoes.length > 0);
  assert.ok(inicio.corpo.opcoes.every((o) => Number.isInteger(o.cara.pct) && o.cara.partes.length === 5));
  const atuais = inicio.corpo.opcoes.map((o) => o.festa.id);

  // "sem limite" tira o teto: o preço sai da conta.
  const solto = await post('/api/conversa', { criterios: inicio.corpo.criterios, atuais, texto: 'sem limite de preço' });
  assert.equal(solto.status, 200);
  assert.equal(solto.corpo.criterios.teto, 'sem-limite');
  assert.ok(solto.corpo.opcoes.length > 0);
  for (const o of solto.corpo.opcoes) {
    assert.ok(Number.isInteger(o.cara.pct));
    assert.equal(o.cara.partes.some((p) => p.criterio === 'preco'), false);
  }

  // "mais barato" baixa o teto: a parte do preço fala do teto novo.
  const barato = await post('/api/conversa', { criterios: inicio.corpo.criterios, atuais, texto: 'mais barato' });
  assert.equal(barato.status, 200);
  const teto = barato.corpo.criterios.teto;
  assert.ok(teto < 80);
  for (const o of barato.corpo.opcoes) {
    const preco = o.cara.partes.find((p) => p.criterio === 'preco');
    assert.equal(preco.cabe, o.festa.preco <= teto ? true : (o.festa.preco - teto) * 5 <= teto ? 'quase' : false);
  }
});

// ---------------------------------------------------------------- U27 (plano de 24/11/2026)

test('propriedade: iguais menos no som, cara(casa) > cara(parecido) ≥ cara(sem som)', () => {
  let pares = 0;
  for (const pedidos of [['house-disco'], ['funk'], ['pop-2000'], ['mpb-samba', 'indie-rock'], ['eletronica']]) {
    for (const f of base) {
      const parecido = C.ESTILOS.map((e) => e.id).find((e) => !pedidos.includes(e) && pedidos.some((p) => (C.AFINIDADE[p] || {})[e] > 0));
      if (!parecido) continue;
      for (const extra of [{}, { bairros: [] }, { teto: 'sem-limite' }]) {
        const c = pedido({ estilos: pedidos, ...extra });
        const casa = cara({ ...f, estilos: [pedidos[0]] }, c).pct;
        const quase = cara({ ...f, estilos: [parecido] }, c).pct;
        const sem = cara({ ...f, estilos: [] }, c).pct;
        assert.ok(casa > quase, `${f.id} ${pedidos} casa ${casa} parecido ${quase}`);
        assert.ok(quase >= sem, `${f.id} ${pedidos} parecido ${quase} sem ${sem}`);
        pares += 1;
      }
    }
  }
  assert.ok(pares > 100, String(pares));
});

test('propriedade: nenhuma real com dado faltando chega a 100%', () => {
  const faltas = [{ mediaIdade: null }, { bairro: null }, { preco: null }, { estilos: [] }, { inicio: null, horarioIncerto: true }];
  for (const p of grade()) {
    const c = motor.completar(motor.sanearCriterios(p));
    for (const f of base.filter((x) => x.dia === c.dia).slice(0, 4)) {
      for (const falta of faltas) {
        const k = cara({ ...f, ...falta, real: true }, c);
        if (k && k.semDado && k.semDado.length) assert.ok(k.pct === null || k.pct < 100, `${f.id} ${JSON.stringify(falta)} ${k.pct}`);
      }
    }
  }
});

test('horário sem início conta a metade, como o que não se sabe', () => {
  const k = cara(festa({ inicio: null, horarioIncerto: true, esquenta: null, fim: null }), pedido());
  const p = porCriterio(k);
  assert.deepEqual(p.horario, { criterio: 'horario', cabe: null, texto: 'horário não divulgado' });
  assert.ok(k.semDado.includes('horario'));
  // 30 × 0,5 + o resto inteiro (70) = 85.
  assert.equal(k.pct, 85);
});

test('idade pela avaliação de quem foi: vale naMedida quando a faixa cruza, e 0,5 quando não cruza', () => {
  const av = festa({ mediaIdade: 31, avaliacaoIdade: { avaliacoes: 5, naMedida: 0.8, faixa: [29, 34], convites: 2 } });
  const so = (idade) => pedido({ idade, bairros: [], teto: 'sem-limite', estilos: [], janela: 'comeco-da-noite' });
  const dentro = cara(av, so({ min: 28, max: 35 }));
  const pDentro = porCriterio(dentro).idade;
  assert.equal(pDentro.credito, 0.8);
  assert.equal(pDentro.cabe, true);
  assert.equal(pDentro.texto, '4 de 5 acharam o público da idade');
  // Horário 30 × 1 + idade 25 × 0,8 = 50 de 55.
  assert.equal(dentro.pct, Math.round((30 + 25 * 0.8) * 100 / 55));
  const fora = cara(av, so({ min: 40, max: 50 }));
  const pFora = porCriterio(fora).idade;
  assert.equal(pFora.credito, 0.5);
  assert.equal(pFora.cabe, null);
  assert.ok(fora.semDado.includes('idade'));
  assert.equal(fora.pct, Math.round((30 + 25 * 0.5) * 100 / 55));
  // A média 31 nunca aparece sozinha.
  assert.doesNotMatch(JSON.stringify(dentro.partes), /31/);
});

test('bairro de real com coordenada: perto pela distância em linha reta, em km', () => {
  const r = { real: true, local: { lat: -23.5611, lng: -46.6825, precisao: 'rua' } };
  const p = porCriterio(cara(festa({ ...r, bairro: 'vila-madalena' }), pedido()));
  assert.deepEqual(p.bairro, { criterio: 'bairro', cabe: 'quase', texto: 'na Vila Madalena, a 1,3 km de Pinheiros' });
  // Sem coordenada, a real da mesma região diz a região, e não os minutos das fictícias.
  const q = porCriterio(cara(festa({ real: true, bairro: 'vila-madalena' }), pedido()));
  assert.deepEqual(q.bairro, { criterio: 'bairro', cabe: 'quase', texto: 'na Vila Madalena, na região de Pinheiros' });
  // Os 14 bairros do motor no pedido.
  const i = porCriterio(cara(festa({ real: true, bairro: 'interlagos' }), pedido({ bairros: ['interlagos'] })));
  assert.equal(i.bairro.texto, 'em Interlagos, como você marcou');
});

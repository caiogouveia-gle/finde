'use strict';
// A fala do Finde: curta, horário primeiro, humor leve e cúmplice.
// Puro: recebe o pedido, os critérios de antes e de depois e as duas listas,
// e devolve a resposta. No máximo duas frases (mais uma pergunta, quando há):
// o que a lista mostra, a fala não repete.

const C = require('./catalogo');

const PERTO_MIN = 10;
const POSICAO = ['A primeira', 'A segunda', 'A terceira'];
const janela = (id) => C.JANELAS.find((j) => j.id === id);
const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const noDia = (d) => `${d === 'sex' ? 'na' : 'no'} ${C.DIAS[d].frase}`;
const proDia = (d) => `${d === 'sex' ? 'pra' : 'pro'} ${C.DIAS[d].frase}`;

function juntar(nomes, conjuncao = 'e') {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} ${conjuncao} ${nomes[nomes.length - 1]}`;
}

// A primeira fala depois do formulário: o aviso, se houver; senão, curadoria.
function abertura(resultado) {
  if (resultado.aviso) return resultado.aviso;
  const ops = resultado.opcoes.filter((o) => !o.patrocinada);
  if (ops.length < 2) return '';
  const unico = (valores, alvo) => valores.filter((v) => v === alvo).length === 1;
  const esq = ops.map((o) => o.festa.esquenta);
  const precos = ops.map((o) => o.festa.preco);
  const iCedo = unico(esq, Math.min(...esq)) ? esq.indexOf(Math.min(...esq)) : -1;
  const iBarata = unico(precos, Math.min(...precos)) ? precos.indexOf(Math.min(...precos)) : -1;
  const barata = (i) => (ops[i].festa.preco === 0 ? 'é de graça' : 'custa menos');
  if (iCedo >= 0 && iCedo === iBarata) return `${POSICAO[iCedo]} enche antes e ${barata(iBarata)}.`;
  const f = [];
  if (iCedo >= 0) f.push(`${POSICAO[iCedo]} enche antes.`);
  if (iBarata >= 0) f.push(`${POSICAO[iBarata]} ${barata(iBarata)}.`);
  return f.join(' ');
}

function sobrePerto(ref, opcoes) {
  if (!opcoes.length) return '';
  const perto = opcoes.filter((o) => o.distancia <= PERTO_MIN);
  if (!perto.length) return `A mais perto fica a ${Math.min(...opcoes.map((o) => o.distancia))} min ${ref.de}.`;
  const max = Math.max(...perto.map((o) => o.distancia));
  if (perto.length === 1) return `Uma fica a ${max} min ${ref.de}.`;
  if (perto.length === opcoes.length) return `Todas ficam a até ${max} min ${ref.de}.`;
  return `Duas ficam a até ${max} min ${ref.de}.`;
}

function sobreTeto(teto, antes) {
  if (teto === antes && teto === 0) return 'Mais barato que de graça, só ficando em casa.';
  if (teto === 0) return 'Só as de graça, então.';
  if (teto === 'sem-limite') return 'Sem teto, então.';
  return `Até R$ ${teto}, então.`;
}

// "Dança cedo, dorme bem." só quando tudo na tela acaba até a meia-noite.
const dormeBem = (opcoes) => opcoes.length > 0 && opcoes.every((o) => o.festa.fim <= 24);

// O nome da faixa que vale: o intervalo do formulário, ou a faixa fixa.
const nomeDaFaixa = (c) => (c.idade ? `${c.idade.min} a ${c.idade.max}${c.idade.max >= 50 ? ' ou mais' : ''}` : C.nomeFaixa(c.faixa));
const mesmaFaixa = (a, b) => (a.idade && b.idade ? a.idade.min === b.idade.min && a.idade.max === b.idade.max : a.faixa === b.faixa);

function sobreIdade(c, opcoes) {
  if (!opcoes.length) return '';
  const fora = opcoes.filter((o) => o.fora.some((m) => /^média/.test(m))).length;
  const nome = nomeDaFaixa(c);
  if (!fora) return `Sim: todas com média de ${nome}.`;
  const dentro = opcoes.length - fora;
  if (!dentro) return `Nenhuma com média de ${nome} nesse pedido.`;
  return `${dentro === 1 ? 'Uma' : 'Duas'} com média de ${nome}; ${fora === 1 ? 'a outra' : 'as outras'}, não.`;
}

function reagir(pedidos, antes, depois, resultado, extra) {
  const f = [];
  const j = janela(depois.janela);
  let slogan = false;
  const usarSlogan = () => {
    if (slogan || !dormeBem(resultado.opcoes)) return '';
    slogan = true;
    return '';
  };
  for (const p of pedidos) {
    switch (p) {
      case 'dia':
        if (depois.dia === antes.dia) f.push(`Já estamos ${noDia(depois.dia)}.`);
        else if (depois.dia === 'dom') f.push('Domingo, então. A segunda agradece.');
        else f.push(`${C.DIAS[depois.dia].nome}, então.`);
        break;
      case 'sem-dia':
        if (depois.dia !== antes.dia) f.push(`Sem ${C.DIAS[antes.dia].frase}, então. Fui ${proDia(depois.dia)}.`);
        else f.push(`${extra.diaRecusado ? C.DIAS[extra.diaRecusado].nome : 'Esse dia'} já está fora.`);
        break;
      case 'fim':
        f.push(`Voltando ${C.ateAs(depois.voltaMax)}.${depois.voltaMax <= 24 ? usarSlogan() : ''}`);
        break;
      case 'mais-cedo':
        if (depois.janela === antes.janela) f.push(`Mais cedo que ${C.hora(j.inicio)}, só almoço. Fiquei ${j.no}.`);
        else f.push(`Puxei ${j.pra}, das ${j.rotulo}.${usarSlogan()}`);
        break;
      case 'mais-tarde':
        if (depois.janela === antes.janela) f.push('Mais tarde que isso já é madrugada. Fiquei na noite.');
        else f.push(`Fui ${j.pra}, das ${j.rotulo}.`);
        break;
      case 'janela':
        if (!pedidos.includes('fim')) f.push(`${maiuscula(j.nome)}, das ${j.rotulo}.`);
        break;
      case 'gratis':
      case 'mais-barato':
      case 'mais-caro':
      case 'sem-limite':
      case 'teto':
        f.push(extra.piso ? `R$ ${depois.teto} é o mais barato ${noDia(depois.dia)} nesse pedido.` : sobreTeto(depois.teto, antes.teto));
        break;
      case 'mais-velho':
        f.push(mesmaFaixa(depois, antes) ? 'Essa já é a faixa mais velha.' : `Gente de ${nomeDaFaixa(depois)}, então.`);
        break;
      case 'mais-novo':
        f.push(mesmaFaixa(depois, antes) ? 'Essa já é a faixa mais nova.' : `Gente de ${nomeDaFaixa(depois)}, então.`);
        break;
      case 'faixa':
        f.push(mesmaFaixa(depois, antes) ? `Já é gente de ${nomeDaFaixa(depois)}.` : `Gente de ${nomeDaFaixa(depois)}, então.`);
        break;
      case 'minha-idade':
        f.push(sobreIdade(depois, resultado.opcoes));
        break;
      case 'sem-estilo': {
        const novos = depois.evitarEstilos.filter((e) => !antes.evitarEstilos.includes(e));
        f.push(`Sem ${C.listaDeEstilos(novos.length ? novos : depois.evitarEstilos, 'nem')}.`);
        break;
      }
      case 'sem-casa': {
        const novas = depois.evitarCasas.filter((k) => !antes.evitarCasas.includes(k));
        f.push(`Sem ${juntar((novas.length ? novas : depois.evitarCasas).map((k) => C.CASAS[k]), 'nem')}.`);
        break;
      }
      case 'sem-bairro': {
        const novos = depois.evitarBairros.filter((b) => !antes.evitarBairros.includes(b));
        f.push(`Longe ${juntar((novos.length ? novos : depois.evitarBairros).map((b) => C.BAIRROS[b].de))}, então.`);
        break;
      }
      case 'estilo':
        // Só confirma o som se a lista nova tem esse som; senão, diz o que impede.
        if (resultado.casam > 0) f.push(`${maiuscula(C.listaDeEstilos(depois.estilos))}, então.`);
        else if (extra.impedimento) f.push(extra.impedimento);
        break;
      case 'outro-estilo': {
        const trocou = resultado.opcoes.some((o) => o.casaComEstilo);
        f.push(trocou ? 'Troquei a trilha.' : 'Não achei outro som que caiba nesse pedido.');
        break;
      }
      case 'qualquer-estilo':
        f.push('Qualquer som, então.');
        break;
      case 'perto':
        f.push(sobrePerto(C.REFERENCIAS[depois.perto], resultado.opcoes));
        break;
      case 'qualquer-lugar':
        f.push('Qualquer bairro, então.');
        break;
      case 'outras':
        f.push('Deixei essas de lado.');
        break;
      case 'surpresa':
        f.push(resultado.opcoes.length ? 'Então vai na primeira: é a que enche antes.' : 'Então tenta outro dia.');
        break;
      default:
        break;
    }
  }
  return f.filter(Boolean);
}

function diferenca(antesIds, opcoes, nomeDe) {
  const depoisIds = opcoes.map((o) => o.festa.id);
  const entraram = depoisIds.filter((id) => !antesIds.includes(id));
  const sairam = antesIds.filter((id) => !depoisIds.includes(id));
  let frase = '';
  if (!depoisIds.length) frase = '';
  else if (!entraram.length && !sairam.length) frase = 'A lista fica como estava.';
  else if (entraram.length === depoisIds.length && depoisIds.length > 1) frase = 'Lista nova.';
  else frase = `${entraram.length > 1 ? 'Entraram' : 'Entrou'} ${juntar(entraram.map(nomeDe))}.`;
  if (!entraram.length && sairam.length) frase = `${sairam.length > 1 ? 'Saíram' : 'Saiu'} ${juntar(sairam.map(nomeDe))}.`;
  return { entraram, sairam, frase };
}

const O_QUE_DA = 'Dá pra pedir mais cedo, mais barato, outro dia, um bairro ou um som.';
const NAO_PEGUEI = `Não peguei. ${O_QUE_DA}`;
const AINDA_NAO = {
  'fora-do-alcance': 'Clima eu ainda não sei ler.',
  'fora-transporte': 'Metrô e estacionamento eu ainda não sei.',
  'fora-seguranca': 'Segurança eu ainda não sei dizer.',
  'casa-positiva': 'Tipo de casa eu só sei tirar, tipo “nada de rooftop”.',
};
const SO_PERGUNTA = ['perto-sem-lugar', 'aceitar', 'contradicao-volta', 'contradicao-hora', ...Object.keys(AINDA_NAO)];

// responder({ pedidos, antes, depois, antesIds, resultado, nomeDe, impedimento?, duvida?, piso? })
//   -> { texto, entraram, sairam, entendeu }
function responder({ pedidos, antes, depois, antesIds, resultado, nomeDe, impedimento, duvida, piso, diaRecusado }) {
  const reais = pedidos.filter((p) => !SO_PERGUNTA.includes(p));
  const naoSei = pedidos.filter((p) => AINDA_NAO[p]).map((p) => AINDA_NAO[p]);
  const pergunta = duvida && duvida.dia ? `Muda ${proDia(duvida.dia)}?` : '';

  if (!reais.length) {
    let texto;
    if (pedidos.includes('contradicao-volta')) texto = 'Até amanhecer ou voltar cedo? Os dois eu não consigo.';
    else if (pedidos.includes('contradicao-hora')) texto = 'Mais cedo ou mais tarde? Os dois eu não consigo.';
    else if (pedidos.includes('perto-sem-lugar')) texto = 'Perto de onde? Me diz o bairro.';
    else if (pergunta) texto = pergunta;
    else if (naoSei.length) texto = `${naoSei[0]} ${O_QUE_DA.replace('Dá pra', 'Sei')}`.replace('Sei pedir', 'Sei ajustar');
    else if (pedidos.includes('aceitar')) texto = `Sim pra quê? ${O_QUE_DA}`;
    else texto = NAO_PEGUEI;
    return { texto, entraram: [], sairam: [], entendeu: false };
  }

  const d = diferenca(antesIds, resultado.opcoes, nomeDe);
  // Lista vazia: a oferta já diz o que travou. Não repete o pedido.
  if (!resultado.opcoes.length) {
    const frases = [resultado.aviso || 'Nada cabe nesse pedido.'];
    if (pedidos.includes('perto-sem-lugar')) frases.push('Perto de onde?');
    return { texto: frases.join(' '), entraram: [], sairam: d.sairam, entendeu: true };
  }
  const reacoes = reagir(reais, antes, depois, resultado, { impedimento, piso, diaRecusado });
  let frases;
  if (resultado.aviso) {
    // O aviso já diz o que não cabe (e o que barra o som): uma reação e ele.
    frases = [...reacoes.filter((r) => r !== impedimento).slice(0, 1), resultado.aviso];
  } else {
    frases = reacoes.slice(0, 2);
    if (frases.length < 2 && d.frase) frases.push(d.frase);
  }
  if (naoSei.length) frases.push(naoSei[0]);
  if (pedidos.includes('perto-sem-lugar')) frases.push('Perto de onde?');
  if (pergunta) frases.push(pergunta);
  return { texto: frases.join(' '), entraram: d.entraram, sairam: d.sairam, entendeu: true };
}

// Pedido explícito na conversa vira dimensão firme, mas só se mudou algo:
// o motor não a afrouxa mais.
function firmesDe(antes, depois) {
  const novos = [];
  if (antes.teto !== depois.teto) novos.push('preco');
  if (antes.janela !== depois.janela || antes.voltaMax !== depois.voltaMax) novos.push('horario');
  if (!mesmaFaixa(antes, depois)) novos.push('idade');
  return [...new Set([...(antes.firmes || []), ...novos])];
}

module.exports = { abertura, responder, juntar, firmesDe, NAO_PEGUEI };

'use strict';
// A fala do Finde: curta, horário primeiro, humor leve e cúmplice.
// Puro: recebe o pedido, os critérios de antes e de depois e as duas listas,
// e devolve a resposta com o que mudou. No máximo uma frase de afrouxamento
// por turno, e o slogan só quando é verdade.

const C = require('./catalogo');

const PERTO_MIN = 10;
const POSICAO = ['A primeira', 'A segunda', 'A terceira'];
const janela = (id) => C.JANELAS.find((j) => j.id === id);
const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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
  return `Teto em R$ ${teto}.`;
}

// "Dança cedo, dorme bem." só quando tudo na tela acaba até a meia-noite.
const dormeBem = (opcoes) => opcoes.length > 0 && opcoes.every((o) => o.festa.fim <= 24);

function reagir(pedidos, antes, depois, resultado, extra) {
  const f = [];
  const j = janela(depois.janela);
  let slogan = false;
  const usarSlogan = () => {
    if (slogan || !dormeBem(resultado.opcoes)) return '';
    slogan = true;
    return ' Dança cedo, dorme bem.';
  };
  for (const p of pedidos) {
    switch (p) {
      case 'dia':
        if (depois.dia === antes.dia) f.push(`Já estamos ${depois.dia === 'sex' ? 'na' : 'no'} ${C.DIAS[depois.dia].frase}.`);
        else if (depois.dia === 'dom') f.push('Domingo, então. A segunda agradece.');
        else f.push(`${C.DIAS[depois.dia].nome}, então.`);
        break;
      case 'fim':
        f.push(`Voltando ${C.ateAs(depois.fimMax)}.${depois.fimMax <= 24 ? usarSlogan() : ''}`);
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
        // Quando nada cabe, a oferta já diz o teto; não repete.
        if (!(resultado.opcoes.length === 0 && resultado.oferta && /^Fixei o teto/.test(resultado.aviso || ''))) {
          f.push(sobreTeto(depois.teto, antes.teto));
        }
        break;
      case 'mais-velho':
        f.push(depois.faixa === antes.faixa ? 'Essa já é a faixa mais velha.' : `Gente de ${C.nomeFaixa(depois.faixa)}, então.`);
        break;
      case 'mais-novo':
        f.push(depois.faixa === antes.faixa ? 'Essa já é a faixa mais nova.' : `Gente de ${C.nomeFaixa(depois.faixa)}, então.`);
        break;
      case 'faixa':
        f.push(depois.faixa === antes.faixa ? `Já é gente de ${C.nomeFaixa(depois.faixa)}.` : `Gente de ${C.nomeFaixa(depois.faixa)}, então.`);
        break;
      case 'sem-estilo': {
        const novos = depois.evitarEstilos.filter((e) => !antes.evitarEstilos.includes(e));
        f.push(`Sem ${C.listaDeEstilos(novos.length ? novos : depois.evitarEstilos, 'nem')}.`);
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
  else {
    const partes = [];
    if (entraram.length) partes.push(`${entraram.length > 1 ? 'Entraram' : 'Entrou'} ${juntar(entraram.map(nomeDe))}`);
    if (sairam.length) partes.push(`${sairam.length > 1 ? 'saíram' : 'saiu'} ${juntar(sairam.map(nomeDe))}`);
    frase = maiuscula(`${partes.join('; ')}.`);
  }
  return { entraram, sairam, frase };
}

const NAO_PEGUEI = 'Não peguei essa. Tente “mais barato”, “mais cedo”, “sem funk” ou o nome de um bairro.';
const FORA_DO_ALCANCE = 'Clima e tipo de casa eu ainda não filtro. Entendo dia, horário, preço, idade, bairro e som.';

// responder({ pedidos, antes, depois, antesIds, resultado, nomeDe, impedimento? })
//   -> { texto, entraram, sairam, entendeu }
function responder({ pedidos, antes, depois, antesIds, resultado, nomeDe, impedimento }) {
  const reais = pedidos.filter((p) => !['perto-sem-lugar', 'fora-do-alcance', 'aceitar'].includes(p));
  if (!reais.length) {
    let texto = NAO_PEGUEI;
    if (pedidos.includes('perto-sem-lugar')) texto = 'Perto de onde? Me diz o bairro.';
    else if (pedidos.includes('fora-do-alcance')) texto = FORA_DO_ALCANCE;
    else if (pedidos.includes('aceitar')) texto = 'Sim pra quê? Tente “mais barato”, “mais cedo” ou o nome de um bairro.';
    return { texto, entraram: [], sairam: [], entendeu: false };
  }
  const d = diferenca(antesIds, resultado.opcoes, nomeDe);
  const frases = reagir(reais, antes, depois, resultado, { impedimento });
  if (d.frase) frases.push(d.frase);
  // O aviso do motor fala do som que faltou; se o impedimento já falou, não repete.
  if (resultado.aviso && !(impedimento && reais.includes('estilo') && resultado.casam === 0 && !resultado.afrouxou.length && resultado.opcoes.length)) {
    frases.push(resultado.aviso);
  } else if (impedimento && reais.includes('estilo') && resultado.casam === 0 && resultado.opcoes.length) {
    frases.push('Entraram as mais perto do seu som.');
  }
  if (pedidos.includes('perto-sem-lugar')) frases.push('Perto de onde?');
  if (pedidos.includes('fora-do-alcance')) frases.push(FORA_DO_ALCANCE);
  return { texto: frases.join(' '), entraram: d.entraram, sairam: d.sairam, entendeu: true };
}

// Pedido explícito na conversa vira dimensão firme, mas só se mudou algo:
// o motor não a afrouxa mais.
function firmesDe(antes, depois) {
  const novos = [];
  if (antes.teto !== depois.teto) novos.push('preco');
  if (antes.janela !== depois.janela || antes.fimMax !== depois.fimMax) novos.push('horario');
  if (antes.faixa !== depois.faixa) novos.push('idade');
  return [...new Set([...(antes.firmes || []), ...novos])];
}

module.exports = { abertura, responder, juntar, firmesDe, NAO_PEGUEI };

#!/usr/bin/env node
'use strict';
// O painel da validação: junta os números da landing, do app e do motor.
//
//   set -a; . ~/.config/finde/segredos.env; set +a
//   node ferramentas/numeros.js                 o resumo, para ler
//   node ferramentas/numeros.js --json          o mesmo, em JSON
//   node ferramentas/numeros.js --lista <arq>   grava os e-mails das duas listas num CSV (fora do repo)
//
// O token é o FINDE_ADMIN_TOKEN, só do ambiente. Os endereços mudam por
// FINDE_URL_LANDING, FINDE_URL_APP_PUBLICO e FINDE_URL_MOTOR.

const fs = require('node:fs');
const path = require('node:path');

const LANDING = process.env.FINDE_URL_LANDING || 'https://finde.fly.dev';
const APP = process.env.FINDE_URL_APP_PUBLICO || 'https://finde-app.fly.dev';
const MOTOR = process.env.FINDE_URL_MOTOR || 'https://finde-motor.fly.dev';
const TOKEN = process.env.FINDE_ADMIN_TOKEN;

const args = process.argv.slice(2);
const emJson = args.includes('--json');
const iLista = args.indexOf('--lista');
const destinoLista = iLista >= 0 ? args[iLista + 1] : null;

async function pegar(url, { token = true, texto = false } = {}) {
  try {
    const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${TOKEN}` } : {}, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { erro: `${r.status} em ${url}` };
    return await (texto ? r.text() : r.json());
  } catch (e) {
    return { erro: `${e.message} em ${url}` };
  }
}

const NOMES = {
  'chegou-qr': 'chegaram pelo QR Code',
  'abriu-landing': 'abriram a landing',
  'landing-app': 'foram da landing para o app',
  'abriu-app': 'abriram o app',
  lista: 'viram uma lista de festas',
  detalhe: 'abriram o detalhe de uma festa',
  ingresso: 'foram ao ingresso',
  'link-fora': 'abriram outro link da festa',
  mandar: 'tocaram em "Mandar pro grupo"',
  convite: 'criaram um convite',
  whatsapp: 'mandaram no WhatsApp',
  'abriu-convite': 'abriram um convite recebido',
  'convite-resposta': 'responderam a um convite',
  'abriu-opiniao': 'abriram a página de opinião',
  'opiniao-viu': 'viram a pergunta da opinião',
  'opiniao-agora-nao': 'tocaram em "Agora não" na opinião',
  chegou: 'chegaram com a origem marcada',
  todas: 'viram todas as festas',
  filtro: 'usaram um filtro',
  mapa: 'abriram o mapa',
  dia: 'trocaram o dia',
  ajuste: 'pediram um ajuste na conversa',
  agenda: 'puseram uma festa na agenda',
  compartilhou: 'compartilharam uma festa',
  'convite-ingresso': 'foram ao ingresso pelo convite',
};
const PASSOS = {
  'abriu-app': 'abriram o app',
  lista: 'viram a lista',
  detalhe: 'abriram uma festa',
  'mandar-ou-convite': 'tocaram em mandar ou criaram convite',
  whatsapp: 'mandaram no WhatsApp',
};
const ETAPAS = {
  'sem-uso': 'sem uso registrado',
  entrou: 'só entrou',
  lista: 'viu a lista',
  detalhe: 'abriu uma festa',
  ingresso: 'foi ao ingresso',
  mandou: 'mandou pro grupo',
};
// Os rótulos das categorias, quando o código não se explica sozinho.
const ROTULOS = {
  qr: 'QR Code', landing: 'landing', insta: 'Instagram', zap: 'WhatsApp', mbm: 'MBM', cartaz: 'cartaz', convite: 'convite',
  som: 'som', bairro: 'bairro', preco: 'preço', idade: 'idade',
  qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo', hoje: 'hoje',
  entendido: 'entendido', 'nao-entendido': 'não entendido',
  nativo: 'compartilhar do celular', copiou: 'copiou o link',
  app: 'no app', opiniao: 'na página de opinião',
};

// O n vem antes do número; com menos de 10, o aviso.
const amostra = (n) => (n < 10 ? ' (amostra pequena)' : '');
const pct = (x, n) => (n ? ` (${Math.round((x / n) * 100)}%)` : '');
const deN = (x, n) => `n=${n}: ${x}${pct(x, n)}${amostra(n)}`;
const virgula = (x) => String(x).replace('.', ',');

function linhaDoNps(o) {
  if (!o || !o.respostas) return 'nenhuma resposta ainda';
  return `n=${o.respostas}: NPS ${o.nps} · média ${virgula(o.media)} · ${o.promotores} promotores, ${o.neutros} neutros, ${o.detratores} detratores${amostra(o.respostas)}`;
}

function juntarNps(a, b) {
  const soma = (k) => (a?.[k] || 0) + (b?.[k] || 0);
  const n = soma('respostas');
  if (!n) return null;
  const media = ((a?.media || 0) * (a?.respostas || 0) + (b?.media || 0) * (b?.respostas || 0)) / n;
  return { respostas: n, promotores: soma('promotores'), neutros: soma('neutros'), detratores: soma('detratores'), nps: Math.round(((soma('promotores') - soma('detratores')) / n) * 100), media: Math.round(media * 10) / 10 };
}

async function principal() {
  if (!TOKEN) {
    console.error('Falta o FINDE_ADMIN_TOKEN no ambiente. Rode antes: set -a; . ~/.config/finde/segredos.env; set +a');
    process.exit(2);
  }
  // As duas listas vêm sempre: o painel conta os e-mails únicos (a mesma
  // pessoa pode estar nas duas). Só a conta sai na tela.
  const [landing, app, motor, ...csvs] = await Promise.all([
    pegar(`${LANDING}/api/numeros`),
    pegar(`${APP}/api/numeros`),
    pegar(`${MOTOR}/api/festas`, { token: false }),
    pegar(`${LANDING}/api/numeros/lista.csv`, { texto: true }),
    pegar(`${APP}/api/numeros/lista.csv`, { texto: true }),
  ]);

  if (destinoLista) {
    const falhas = csvs.filter((c) => typeof c !== 'string');
    if (falhas.length) {
      console.error(`A lista não saiu inteira: ${falhas.map((f) => f.erro).join('; ')}`);
      process.exit(1);
    }
    const linhas = new Map();
    for (const c of csvs) {
      for (const l of c.trim().split('\n').slice(1)) {
        const email = l.split(',')[0];
        if (email && !linhas.has(email)) linhas.set(email, l);
      }
    }
    const destino = path.resolve(destinoLista);
    if (destino.startsWith(path.resolve(__dirname, '..', '..', '..'))) {
      console.error('A lista tem e-mails: grave fora do repositório.');
      process.exit(2);
    }
    fs.writeFileSync(destino, `email,inscrito_em,de\n${[...linhas.values()].join('\n')}\n`, { mode: 0o600 });
    console.error(`${linhas.size} e-mails em ${destino}`);
  }

  const festas = Array.isArray(motor?.festas) ? motor.festas : null;
  const resumo = montarResumo({ landing, app, motor, csvs });

  if (emJson) {
    console.log(JSON.stringify(resumo, null, 2));
    return;
  }
  console.log(textoDoPainel(resumo, { festas, agora: new Date() }));
}

// Os e-mails distintos de vários CSVs (a primeira coluna); null se algum falhou.
function emailsUnicos(csvs) {
  if (!csvs.length || csvs.some((c) => typeof c !== 'string')) return null;
  return new Set(csvs.flatMap((c) => c.trim().split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean))).size;
}

function montarResumo({ landing, app, motor, csvs = [] }) {
  const festas = Array.isArray(motor?.festas) ? motor.festas : null;
  return {
    geradoEm: new Date().toISOString(),
    motor: festas ? {
      festas: festas.length,
      produtoras: new Set(festas.map((f) => f.produtora?.nome || f.produtora).filter(Boolean)).size,
      comMediaDeIdade: festas.filter((f) => Number.isInteger(f.mediaIdade)).length,
      atualizadoEm: motor.geradoEm,
    } : motor,
    landing,
    app,
    nps: juntarNps(landing?.opiniao, app?.opiniao),
    lista: (landing?.lista?.inscritos || 0) + (app?.lista?.inscritos || 0),
    listaUnicos: emailsUnicos(csvs),
    equipeFora: (landing?.equipeFora || 0) + (app?.equipeFora || 0),
  };
}

// Uma categoria contada por valor ({ zap: { vezes, pessoas } }) numa linha.
function linhaDeCategoria(m) {
  const itens = Object.entries(m || {}).sort((x, y) => y[1].pessoas - x[1].pessoas);
  if (!itens.length) return null;
  return itens.map(([k, v]) => `${ROTULOS[k] || k} ${v.pessoas}${amostra(v.pessoas)}`).join(' · ');
}

// As seções do app: funil, volta, uso, chegada, festas, convite, lista,
// compartilhar e opinião. Cada número leva o n de onde saiu.
function secoesDoApp(s, festasDoMotor) {
  const p = [];
  const evs = s.eventos || {};
  const n = (ev) => evs[ev]?.pessoas || 0;
  if (Array.isArray(s.funil) && s.funil.length) {
    p.push('  Funil (cada passo só conta quem fez o anterior):');
    const base = s.funil[0].pessoas;
    for (const f of s.funil) p.push(`    ${PASSOS[f.passo] || f.passo}: ${deN(f.pessoas, base)}`);
  }
  if (s.retencao) {
    const r = s.retencao;
    p.push('  Volta:');
    p.push(`    D1, voltou no dia seguinte: ${deN(r.d1.voltaram, r.d1.base)}`);
    p.push(`    D7, voltou do 7º ao 9º dia: ${deN(r.d7.voltaram, r.d7.base)}`);
    p.push(`    voltou em outro dia: ${deN(r.outroDia, s.pessoas)}`);
  }
  if (s.uso && s.uso.pessoas) {
    const u = s.uso;
    p.push(`  Uso, n=${u.pessoas}${amostra(u.pessoas)}: ${virgula(u.sessoesPorPessoa)} sessão por pessoa (mediana ${virgula(u.sessoesMediana)}) · ${u.comMaisDeUmaSessao} com mais de uma · ${virgula(u.diasAtivosMedia)} dia ativo em média`);
  }
  const cat = s.porCategoria || {};
  const chegada = linhaDeCategoria(cat.chegou);
  if (chegada) p.push(`  Chegada, por origem (pessoas): ${chegada}`);
  if (Array.isArray(s.topFestas) && s.topFestas.length) {
    const porId = new Map((festasDoMotor || []).map((f) => [f.id, f]));
    p.push('  Festas mais abertas (pessoas):');
    for (const f of s.topFestas.slice(0, 10)) {
      const m = porId.get(f.id);
      const prod = m && (m.produtora?.nome || m.produtora);
      const nome = m ? `${m.nome}${prod ? ` (${prod})` : ''}` : f.id;
      const partes = [['detalhe', 'abriram'], ['ingresso', 'ingresso'], ['mandar', 'grupo'], ['convite-ingresso', 'ingresso pelo convite']]
        .filter(([k]) => f[k]).map(([k, rot]) => `${rot} ${f[k].pessoas}`);
      p.push(`    ${nome}: ${partes.join(' · ')}`);
    }
  }
  if (s.convite && !s.convite.criados && !s.convite.pessoasQueAbriram && !s.convite.novos) p.push('  Convite: nenhum criado nem aberto ainda');
  else if (s.convite) {
    const c = s.convite;
    p.push(`  Convite: n=${c.criados} criados${amostra(c.criados)}`);
    p.push(`    abertos por quem recebeu: ${c.aberturas} vezes, por ${c.pessoasQueAbriram} pessoas`);
    p.push(`    respostas: ${c.respostas}, de ${c.pessoasQueResponderam} pessoas`);
    p.push(`    chegaram ao finde pelo convite: ${c.novos} pessoas novas; ${deN(c.novosQueAbriramOApp, c.novos)} abriram o app depois`);
  }
  const base = n('lista') || s.pessoas || 0;
  const explora = [['todas', 'viram todas'], ['mapa', 'abriram o mapa'], ['dia', 'trocaram o dia'], ['ajuste', 'pediram ajuste'], ['filtro', 'usaram filtro'], ['agenda', 'puseram na agenda']]
    .filter(([ev]) => n(ev));
  if (explora.length) {
    p.push(`  Na lista, entre quem viu a lista, n=${base}${amostra(base)}:`);
    for (const [ev, rot] of explora) p.push(`    ${rot}: ${n(ev)}${pct(n(ev), base)}`);
    for (const [ev, rot] of [['filtro', 'filtro por zona'], ['dia', 'dia escolhido'], ['ajuste', 'ajuste']]) {
      const l = linhaDeCategoria(cat[ev]);
      if (l) p.push(`    ${rot}: ${l}`);
    }
  }
  const comp = linhaDeCategoria(cat.compartilhou);
  if (comp) p.push(`  Compartilhou, por tipo (pessoas): ${comp}`);
  if (s.taxaDeResposta) {
    const linhas = Object.entries(s.taxaDeResposta).filter(([, t]) => t.viram || t.respostas);
    if (linhas.length) {
      p.push('  Opinião, taxa de resposta (responderam entre quem viu a pergunta):');
      for (const [de, t] of linhas) p.push(`    ${ROTULOS[de] || de}: ${deN(t.responderam, t.viram)} · ${t.respostas} respostas ao todo`);
    }
  }
  const etapas = Object.entries(s.npsPorEtapa || {});
  if (etapas.length) {
    p.push('  NPS pela etapa mais funda do uso:');
    for (const [k, o] of etapas) p.push(`    ${ETAPAS[k] || k}: ${linhaDoNps(o)}`);
  }
  return p;
}

function textoDoPainel(resumo, { festas = null, agora = new Date() } = {}) {
  const { landing, app } = resumo;
  const p = [];
  p.push(`Finde · números de ${agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  p.push(`Equipe e testes fora da conta: ${resumo.equipeFora || 0} aparelho${resumo.equipeFora === 1 ? '' : 's'}`);
  p.push('');
  if (resumo.motor?.erro) p.push(`Motor: ${resumo.motor.erro}`);
  else if (resumo.motor) p.push(`Motor: ${resumo.motor.festas} festas reais, de ${resumo.motor.produtoras} produtoras; ${resumo.motor.comMediaDeIdade} com média de idade.`);
  for (const [nome, s] of [['Landing', landing], ['App', app]]) {
    p.push('');
    if (!s) continue;
    if (s.erro) {
      p.push(`${nome}: ${s.erro}`);
      continue;
    }
    p.push(`${nome}: ${s.pessoas} pessoa${s.pessoas === 1 ? '' : 's'} desde ${s.desde ? new Date(s.desde).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}${amostra(s.pessoas)}`);
    // Na ordem do caminho de quem usa; o que não estiver na lista vai no fim.
    const evs = s.eventos || {};
    const ordem = [...Object.keys(NOMES).filter((k) => evs[k]), ...Object.keys(evs).filter((k) => !NOMES[k])];
    for (const ev of ordem) p.push(`  ${String(evs[ev].pessoas).padStart(4)}  ${NOMES[ev] || ev}`);
    const dias = Object.entries(s.porDia || {}).slice(-7);
    if (dias.length) p.push(`  por dia: ${dias.map(([d, n]) => `${d.slice(8)}/${d.slice(5, 7)} ${n}`).join(' · ')}`);
    if (nome === 'App') p.push(...secoesDoApp(s, festas));
    else {
      const chegada = linhaDeCategoria(s.porCategoria?.chegou);
      if (chegada) p.push(`  Chegada, por origem (pessoas): ${chegada}`);
    }
  }
  p.push('');
  p.push(`Opinião: ${linhaDoNps(resumo.nps)}`);
  const comentarios = [...(landing?.opiniao?.comentarios || []), ...(app?.opiniao?.comentarios || [])].sort((a, b) => a.em.localeCompare(b.em));
  for (const c of comentarios.slice(-10)) p.push(`  [${c.nota}] ${c.texto}`);
  p.push('');
  const unicos = resumo.listaUnicos;
  p.push(unicos === null || unicos === undefined
    ? `Lista de e-mails: ${resumo.lista} somando as duas, com possível repetição (landing ${landing?.lista?.inscritos || 0}, app ${app?.lista?.inscritos || 0})`
    : `Lista de e-mails: ${unicos} únicos (landing ${landing?.lista?.inscritos || 0}, app ${app?.lista?.inscritos || 0})`);
  return p.join('\n');
}

module.exports = { textoDoPainel, montarResumo, emailsUnicos, linhaDoNps, juntarNps };

if (require.main === module) principal();

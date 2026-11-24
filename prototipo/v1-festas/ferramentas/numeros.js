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
};

function linhaDoNps(o) {
  if (!o || !o.respostas) return 'nenhuma resposta ainda';
  return `NPS ${o.nps} · ${o.respostas} resposta${o.respostas > 1 ? 's' : ''} · média ${String(o.media).replace('.', ',')} · ${o.promotores} promotores, ${o.neutros} neutros, ${o.detratores} detratores`;
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
  const [landing, app, motor] = await Promise.all([
    pegar(`${LANDING}/api/numeros`),
    pegar(`${APP}/api/numeros`),
    pegar(`${MOTOR}/api/festas`, { token: false }),
  ]);

  if (destinoLista) {
    const csvs = await Promise.all([pegar(`${LANDING}/api/numeros/lista.csv`, { texto: true }), pegar(`${APP}/api/numeros/lista.csv`, { texto: true })]);
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
  const resumo = {
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
  };

  if (emJson) {
    console.log(JSON.stringify(resumo, null, 2));
    return;
  }
  const p = [];
  p.push(`Finde · números de ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  p.push('');
  if (resumo.motor?.erro) p.push(`Motor: ${resumo.motor.erro}`);
  else if (resumo.motor) p.push(`Motor: ${resumo.motor.festas} festas reais, de ${resumo.motor.produtoras} produtoras; ${resumo.motor.comMediaDeIdade} com média de idade.`);
  for (const [nome, s] of [['Landing', landing], ['App', app]]) {
    p.push('');
    if (s?.erro) {
      p.push(`${nome}: ${s.erro}`);
      continue;
    }
    p.push(`${nome}: ${s.pessoas} pessoa${s.pessoas === 1 ? '' : 's'} desde ${s.desde ? new Date(s.desde).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}`);
    // Na ordem do caminho de quem usa; o que não estiver na lista vai no fim.
    const evs = s.eventos || {};
    const ordem = [...Object.keys(NOMES).filter((k) => evs[k]), ...Object.keys(evs).filter((k) => !NOMES[k])];
    for (const ev of ordem) p.push(`  ${String(evs[ev].pessoas).padStart(4)}  ${NOMES[ev] || ev}`);
    const dias = Object.entries(s.porDia || {}).slice(-7);
    if (dias.length) p.push(`  por dia: ${dias.map(([d, n]) => `${d.slice(8)}/${d.slice(5, 7)} ${n}`).join(' · ')}`);
  }
  p.push('');
  p.push(`Opinião: ${linhaDoNps(resumo.nps)}`);
  const comentarios = [...(landing?.opiniao?.comentarios || []), ...(app?.opiniao?.comentarios || [])].sort((a, b) => a.em.localeCompare(b.em));
  for (const c of comentarios.slice(-10)) p.push(`  [${c.nota}] ${c.texto}`);
  p.push('');
  p.push(`Lista de e-mails: ${resumo.lista} (landing ${landing?.lista?.inscritos || 0}, app ${app?.lista?.inscritos || 0})`);
  console.log(p.join('\n'));
}

principal();

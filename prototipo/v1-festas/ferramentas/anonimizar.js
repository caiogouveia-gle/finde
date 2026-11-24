#!/usr/bin/env node
'use strict';
// A fixture do export com a forma do real e sem nada dele (U37, R38): lê um
// export do motor (finde-r14/3) e troca nomes, casas, endereços, perfis,
// URLs de post e de ingresso, créditos, origens, links e coordenadas por
// valores fictícios. Ficam a forma e as lacunas (o que falta no real falta
// aqui também: cidade, início, casa, imagem), as datas, as horas, os preços,
// o vocabulário do motor (bairros, regiões, fontes, regras de vínculo) e os
// carimbos. O teste motor/teste/anonimo.test.js confere que nada do real ficou.
//
//   node ferramentas/anonimizar.js <export> [destino]
//
// Destino padrão: ../../motor/teste/dados/export-anonimo.json.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const objeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Casa que é só o nome de cidade fica como está: é uma lacuna do real, não um dado.
const CIDADES = new Set(['sao paulo', 'sp', 'rio de janeiro', 'cotia', 'olinda', 'campinas']);

// Um contador por tipo de coisa: o mesmo valor real dá sempre o mesmo fictício.
function criarTrocas(semente) {
  const mapas = new Map();
  const troca = (tipo, real, fazer) => {
    if (!mapas.has(tipo)) mapas.set(tipo, new Map());
    const m = mapas.get(tipo);
    const k = semAcento(real);
    if (!m.has(k)) m.set(k, fazer(m.size + 1));
    return m.get(k);
  };
  const hex = (texto, n) => crypto.createHash('sha256').update(`${semente}:${texto}`).digest('hex').slice(0, n);
  return { troca, hex };
}

function anonimizar(bruto, { semente = 'finde-anonimo' } = {}) {
  const { troca, hex } = criarTrocas(semente);
  const linhas = objeto(bruto) && Array.isArray(bruto.festas) ? bruto.festas : Array.isArray(bruto) ? bruto : [];

  const idDe = (real, n, data) => (real ? troca('id', real, (k) => `festa-ficticia-${n || k}-${String(data || '').replace(/-/g, '')}-${hex(real, 4)}`.slice(0, 60)) : real);
  const casaDe = (real) => {
    if (typeof real !== 'string' || !real.trim()) return real;
    if (CIDADES.has(semAcento(real))) return real;
    return troca('casa', real, (k) => `Casa Fictícia ${k}`);
  };
  const lugarDe = (real) => (typeof real === 'string' && real ? troca('lugar', real, (k) => `casa-ficticia-${k}`) : real);
  const produtoraNome = (real) => (typeof real === 'string' && real.trim() ? troca('produtora', real, (k) => `Coletivo Fictício ${k}`) : real);
  const perfil = (real) => (typeof real === 'string' && real.trim() ? troca('perfil', real, (k) => `https://www.instagram.com/perfil_ficticio_${k}/`) : real);
  // Toda URL vira uma de exemplo, pelo tipo de página: nunca o post, o slug ou o host real.
  const url = (real) => {
    if (typeof real !== 'string' || !real) return real;
    let host = '';
    try {
      host = new URL(real).hostname;
    } catch {
      return troca('url', real, (k) => `https://pagina.example/${k}`);
    }
    if (/instagram\.com$/.test(host)) return /\/p\/|\/reel\//.test(real) ? troca('url', real, (k) => `https://posts.example/p/post-ficticio-${k}`) : perfil(real);
    if (/(ingresse|sympla|shotgun|bileto|guicheweb|ticket|mareticket|ra\.co)/.test(host)) return troca('url', real, (k) => `https://ingressos.example/evento/festa-ficticia-${k}`);
    return troca('url', real, (k) => `https://pagina.example/${k}`);
  };
  const credito = (real) => (typeof real === 'string' ? `Divulgação · ${troca('credito', real, (k) => `Fonte Fictícia ${k}`)}` : real);
  const texto = (real) => (typeof real === 'string' && real ? 'texto trocado na anonimização' : real);
  const regras = (r) => (objeto(r) ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? texto(v) : v])) : r);
  const imagem = (im) => {
    if (!objeto(im)) return im;
    const id = im.id ? hex(`imagem:${im.id}`, 16) : im.id;
    return {
      ...im,
      id,
      arquivo: id ? `imagens/${id}-1080.webp` : im.arquivo,
      miniatura: id ? `imagens/${id}-480.webp` : im.miniatura,
      credito: credito(im.credito),
      origem: url(im.origem),
      origens: Array.isArray(im.origens) ? im.origens.map((o) => ({ ...o, origem: url(o.origem), credito: credito(o.credito) })) : im.origens,
    };
  };
  // Coordenada fictícia dentro da capital: o mesmo lugar real dá o mesmo ponto.
  const ponto = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat, lng };
    const h = parseInt(hex(`ponto:${lat.toFixed(5)},${lng.toFixed(5)}`, 8), 16);
    return { lat: Number((-23.62 + (h % 1000) / 1000 * 0.14).toFixed(5)), lng: Number((-46.74 + (Math.floor(h / 1000) % 1000) / 1000 * 0.16).toFixed(5)) };
  };
  const detalhe = (d) => {
    if (typeof d !== 'string') return d;
    return 'detalhe trocado na anonimização';
  };
  const sinal = (s) => (objeto(s) ? { ...s, detalhe: typeof s.detalhe === 'string' ? `${s.sinal || 'sinal'} (fictício)` : s.detalhe } : s);

  const festas = linhas.map((r, i) => {
    if (!objeto(r)) return r;
    const n = i + 1;
    const e = objeto(r.endereco) ? r.endereco : r.endereco;
    const endereco = objeto(e) ? {
      ...e,
      texto: typeof e.texto === 'string' && e.texto ? (CIDADES.has(semAcento(e.texto)) ? e.texto : `Rua Fictícia, ${100 + n}`) : e.texto,
      cep: typeof e.cep === 'string' && e.cep ? `0${String(1000 + n).slice(-4)}-000` : e.cep,
      lugar: lugarDe(e.lugar),
      ...ponto(e.lat, e.lng),
    } : e;
    return {
      ...r,
      id: idDe(r.id, n, r.data),
      nome: `Festa Fictícia ${n}`,
      produtora: objeto(r.produtora) ? { ...r.produtora, nome: produtoraNome(r.produtora.nome), instagram: perfil(r.produtora.instagram) } : produtoraNome(r.produtora),
      casa: casaDe(r.casa),
      endereco,
      lotes: Array.isArray(r.lotes) ? r.lotes.map((l, j) => (objeto(l) ? { ...l, nome: `Lote ${j + 1}` } : l)) : r.lotes,
      precoAPartirDe: objeto(r.precoAPartirDe) ? { ...r.precoAPartirDe, lote: r.precoAPartirDe.lote ? 'Lote 1' : r.precoAPartirDe.lote } : r.precoAPartirDe,
      linkCompra: url(r.linkCompra),
      linkEvento: url(r.linkEvento),
      instagram: perfil(r.instagram),
      imagens: Array.isArray(r.imagens) ? r.imagens.map(imagem) : r.imagens,
      cartaz: imagem(r.cartaz),
      paginas: Array.isArray(r.paginas) ? r.paginas.map((p) => (objeto(p) ? { ...p, nome: `Página ${p.tipo || 'lida'}`, url: url(p.url) } : p)) : r.paginas,
      lineup: Array.isArray(r.lineup) ? r.lineup.map((_, j) => `Artista ${n}.${j + 1}`) : r.lineup,
      regras: regras(r.regras),
      fontes: Array.isArray(r.fontes) ? r.fontes.map((f) => (objeto(f) ? {
        ...f,
        url: url(f.url),
        vinculo: objeto(f.vinculo) ? { ...f.vinculo, sinais: Array.isArray(f.vinculo.sinais) ? f.vinculo.sinais.map(sinal) : f.vinculo.sinais } : f.vinculo,
      } : f)) : r.fontes,
      divergencias: Array.isArray(r.divergencias) ? r.divergencias.map((d) => (objeto(d) ? {
        ...d,
        valores: Array.isArray(d.valores) ? d.valores.map((v) => ({ ...v, valor: d.campo === 'casa' ? casaDe(v.valor) : d.campo === 'linkCompra' ? url(v.valor) : v.valor })) : d.valores,
      } : d)) : r.divergencias,
      idsAntigos: Array.isArray(r.idsAntigos) ? r.idsAntigos.map((x) => idDe(x, null, r.data)) : r.idsAntigos,
      revisar: Array.isArray(r.revisar) ? r.revisar.map((x) => (objeto(x) ? { ...x, detalhe: detalhe(x.detalhe) } : x)) : r.revisar,
    };
  });
  // Uma última passada: nenhum @perfil sobra em texto nenhum.
  const saida = { ...(objeto(bruto) ? bruto : {}), total: festas.length, festas, _leia: 'Fixture gerada por prototipo/v1-festas/ferramentas/anonimizar.js a partir de um export real do motor: só a forma e as lacunas; nomes, casas, endereços, perfis, URLs, créditos e coordenadas são fictícios.' };
  return JSON.parse(JSON.stringify(saida).replace(/(^|[^A-Za-z0-9._%+-])@[A-Za-z0-9._]{2,30}/g, '$1perfil fictício'));
}

if (require.main === module) {
  const [origem, destino] = process.argv.slice(2);
  if (!origem) {
    process.stderr.write('uso: node ferramentas/anonimizar.js <export> [destino]\n');
    process.exit(1);
  }
  const alvo = path.resolve(destino || path.join(__dirname, '..', '..', '..', 'motor', 'teste', 'dados', 'export-anonimo.json'));
  const saida = anonimizar(JSON.parse(fs.readFileSync(origem, 'utf8')));
  fs.writeFileSync(alvo, `${JSON.stringify(saida, null, 1)}\n`);
  process.stdout.write(`${saida.festas.length} registros anonimizados em ${alvo}\n`);
}

module.exports = { anonimizar };

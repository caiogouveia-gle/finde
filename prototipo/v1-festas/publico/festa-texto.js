'use strict';
// As frases do detalhe da festa e do convite, a partir do registro
// finde-r14/1: preço e lote, média e origem, som, regras de entrada, fontes e
// o destino de cada link. Puro, sem DOM: roda no navegador (window.FindeTexto)
// e no node --test (module.exports).

(function (raiz, fabrica) {
  const T = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = T;
  else raiz.FindeTexto = T;
})(typeof self !== 'undefined' ? self : this, () => {
  // Os rótulos de nucleo/catalogo.js (um teste confere que batem).
  const ESTILOS = {
    'house-disco': 'House e disco',
    'pop-2000': 'Pop anos 2000',
    'mpb-samba': 'MPB e samba',
    funk: 'Funk',
    'indie-rock': 'Indie e rock',
    eletronica: 'Eletrônica',
  };

  const SERVICOS = [
    [/(^|\.)sympla\.com\.br$/, 'Sympla'],
    [/(^|\.)shotgun\.live$/, 'Shotgun'],
    [/(^|\.)ingresse\.com$/, 'Ingresse'],
    [/(^|\.)feverup\.com$/, 'Fever'],
    [/(^|\.)eventbrite\.com(\.br)?$/, 'Eventbrite'],
    [/(^|\.)dice\.fm$/, 'DICE'],
    [/(^|\.)ra\.co$/, 'Resident Advisor'],
    [/(^|\.)instagram\.com$/, 'Instagram'],
  ];

  const reais = (v) => (v === 0 ? 'grátis' : `R$ ${v}`);
  // 6 -> "R$ 6"; 7.5 -> "R$ 7,50".
  const centavos = (v) => (Number.isInteger(v) ? `R$ ${v}` : `R$ ${v.toFixed(2).replace('.', ',')}`);

  // "21:00" -> "até as 21h"; "00:00" -> "até a meia-noite"; "01:30" -> "até a 1h30".
  function ateAs(hhmm) {
    const m = typeof hhmm === 'string' && hhmm.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h === 0 && mm === 0) return 'até a meia-noite';
    const t = `${h}h${mm ? String(mm).padStart(2, '0') : ''}`;
    return h < 2 ? `até a ${t}` : `até as ${t}`;
  }
  const lista = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

  function urlSegura(v) {
    if (typeof v !== 'string') return null;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' ? u : null;
    } catch {
      return null;
    }
  }

  // "https://www.sympla.com.br/..." -> "Sympla"; domínio desconhecido -> "Site da produtora".
  function servico(url) {
    const u = urlSegura(url);
    if (!u) return null;
    const host = u.hostname.toLowerCase();
    const achado = SERVICOS.find(([re]) => re.test(host));
    return achado ? achado[1] : 'Site da produtora';
  }

  function usuario(url) {
    const u = urlSegura(url);
    const m = u && u.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
    return m ? `@${m[1]}` : null;
  }

  // "1º lote" e "2º lote" -> "1º e 2º lotes esgotados".
  function notaEsgotados(nomes) {
    if (!nomes.length) return null;
    if (nomes.length === 1) return `${nomes[0]} esgotado`;
    const ordinais = nomes.map((n) => n.replace(/\s*lote$/i, ''));
    return `${lista(ordinais)} lotes esgotados`;
  }

  // O preço que a pessoa paga hoje: o menor lote disponível (o esgotado não
  // conta), a porta quando não há lote, ou o preço da lista numa festa antiga.
  function preco(f) {
    const lotes = Array.isArray(f.lotes) ? f.lotes : null;
    const porta = f.entradaNaPorta && Number.isInteger(f.entradaNaPorta.preco) ? f.entradaNaPorta : null;
    const linkCompra = urlSegura(f.linkCompra) ? f.linkCompra : null;
    const base = { valor: null, lote: null, nota: null, horario: null, taxa: null, depois: null, compra: false, servico: null, url: null };
    if (lotes && lotes.length) {
      const abertos = lotes.filter((l) => l.disponivel !== false).slice().sort((a, b) => a.preco - b.preco);
      if (abertos.length) {
        const menor = abertos[0];
        const antes = lotes.filter((l) => l.disponivel === false && l.preco < menor.preco).map((l) => l.nome);
        // Preço por horário: o lote vale até uma hora, e depois vem o próximo.
        let horario = null;
        const limite = ateAs(menor.ate);
        if (limite) {
          const depois = lotes.slice(lotes.indexOf(menor) + 1).find((l) => l.disponivel !== false && l.preco > menor.preco);
          horario = depois ? `${limite}; depois, ${reais(depois.preco)}` : limite;
        }
        const taxa = typeof menor.taxa === 'number' && menor.taxa > 0 ? `+ ${centavos(menor.taxa)} de taxa` : null;
        if (menor.preco === 0) return { ...base, tipo: 'gratis', valor: 0, texto: 'Grátis', horario, taxa: null };
        const seguinte = horario ? null : lotes.slice(lotes.indexOf(menor) + 1).find((l) => l.disponivel !== false && l.preco > menor.preco);
        return {
          ...base, tipo: 'online', valor: menor.preco, texto: `R$ ${menor.preco}`, lote: horario ? null : menor.nome,
          nota: notaEsgotados(antes), horario, taxa, depois: seguinte ? `depois, ${reais(seguinte.preco)}` : null,
          compra: Boolean(linkCompra), servico: servico(linkCompra), url: linkCompra,
        };
      }
      if (!porta) return { ...base, tipo: 'esgotado', texto: 'Esgotado', nota: notaEsgotados(lotes.map((l) => l.nome)) };
    }
    if (porta) {
      if (porta.preco === 0) return { ...base, tipo: 'gratis', valor: 0, texto: 'Grátis, na porta' };
      return { ...base, tipo: 'porta', valor: porta.preco, texto: `Entrada na porta, R$ ${porta.preco}` };
    }
    if (Number.isInteger(f.preco)) {
      if (f.preco === 0) return { ...base, tipo: 'gratis', valor: 0, texto: 'Grátis' };
      return { ...base, tipo: 'online', valor: f.preco, texto: `R$ ${f.preco}` };
    }
    return { ...base, tipo: 'sem-preco', texto: 'Preço ainda não informado' };
  }

  function precoNaLista(f) {
    const p = preco(f);
    const ate = p.horario ? p.horario.split(';')[0] : null;
    if (p.tipo === 'gratis') return ate ? `grátis ${ate}` : 'grátis';
    if (p.tipo === 'online' && ate) return `R$ ${p.valor} ${ate}`;
    if (p.tipo === 'porta') return `R$ ${p.valor} na porta`;
    if (p.tipo === 'online') return Array.isArray(f.lotes) && f.lotes.length > 1 ? `a partir de ${reais(p.valor)}` : reais(p.valor);
    return p.texto.toLocaleLowerCase('pt-BR');
  }

  // "há 3 h", "ontem", "há 2 dias", "em 05/11". Relógio torto não vira futuro.
  function ha(iso, agora = Date.now()) {
    if (typeof iso !== 'string') return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const min = Math.max(0, (agora - t) / 60000);
    if (min < 15) return 'há poucos minutos';
    if (min < 60) return `há ${Math.round(min / 5) * 5} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `há ${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'ontem';
    if (dias < 7) return `há ${dias} dias`;
    const d = new Date(t - 3 * 3600e3);
    return `em ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function media(f, agora = Date.now()) {
    if (!Number.isInteger(f.mediaIdade)) {
      return { ausente: true, numero: null, texto: 'Média de idade ainda não informada', origem: null, quando: null, frase: 'Média de idade ainda não informada.' };
    }
    const c = f.campos && f.campos.mediaIdade;
    const quando = c ? ha(c.conferidoEm, agora) : null;
    const origem = typeof f.origemIdade === 'string' && f.origemIdade.trim() ? f.origemIdade.trim() : null;
    return {
      ausente: false, numero: f.mediaIdade, texto: `média ${f.mediaIdade} anos`, origem, quando: quando ? `conferida ${quando}` : null,
      // "Média de 32 anos, informada pela produtora."
      frase: `Média de ${f.mediaIdade} anos${origem ? `, ${origem}` : ''}.`,
    };
  }

  function som(f) {
    const nomes = (f.estilos || []).map((e) => ESTILOS[e]).filter(Boolean);
    const estilos = nomes.map((n, i) => (i ? n.charAt(0).toLocaleLowerCase('pt-BR') + n.slice(1) : n)).join(', ');
    const lineup = Array.isArray(f.lineup) && f.lineup.length ? f.lineup.slice() : null;
    const nomes2 = lineup ? lista(lineup) : null;
    // "House e disco, com Duda Maré e Tati Varanda." / "House e disco. Lineup ainda não divulgado."
    const frase = lineup ? `${estilos}${estilos ? ', com ' : 'Com '}${nomes2}.` : `${estilos ? `${estilos}. ` : ''}Lineup ainda não divulgado.`;
    return { estilos, lineup, aviso: lineup ? null : 'Lineup ainda não divulgado.', frase };
  }

  function regras(f) {
    const r = f.regras || {};
    const saida = [];
    if (Number.isInteger(f.idadeMinima)) saida.push({ rotulo: 'Idade mínima', valor: `${f.idadeMinima} anos` });
    if (r.documento) saida.push({ rotulo: 'Documento', valor: r.documento });
    if (r.vestimenta) saida.push({ rotulo: 'Vestimenta', valor: r.vestimenta });
    if (r.lista) saida.push({ rotulo: 'Lista', valor: r.lista });
    return saida;
  }

  // As regras numa frase só, na ordem: "Só maiores de 18. RG ou CNH, original ou digital."
  function regrasFrase(f) {
    const ponto = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
    return regras(f).map((r) => (r.rotulo === 'Idade mínima' ? `Só maiores de ${f.idadeMinima}.` : ponto(r.valor))).join(' ');
  }

  // O rodapé (R12): de onde veio e quando foi conferido, o mais novo primeiro.
  const FEMININO = new Set(['ical', 'claude', 'regras']);
  function fontes(f, agora = Date.now()) {
    return (Array.isArray(f.fontes) ? f.fontes : [])
      .filter((x) => x && typeof x.nome === 'string')
      .slice()
      .sort((a, b) => Date.parse(b.conferidoEm) - Date.parse(a.conferidoEm))
      .map((x) => {
        const quando = ha(x.conferidoEm, agora);
        return { nome: x.nome, quando: quando ? `${FEMININO.has(x.id) ? 'conferida' : 'conferido'} ${quando}` : null };
      });
  }

  // Para onde o link leva. Festa de exemplo: a página de saída do protótipo,
  // para um nome inventado nunca abrir o perfil de alguém de verdade.
  function destino(url, nomeServico, exemplo) {
    if (!urlSegura(url)) return null;
    if (!exemplo) return url;
    return `/fora.html?servico=${encodeURIComponent(nomeServico || servico(url) || 'link')}&para=${encodeURIComponent(url)}`;
  }

  // Os links de origem (R8): Instagram e página do evento. O que falta aparece
  // como ausente, nunca inventado.
  function links(f) {
    const ig = urlSegura(f.instagram) ? f.instagram : null;
    const ev = urlSegura(f.linkEvento) ? f.linkEvento : null;
    return [
      ig ? { papel: 'instagram', servico: 'Instagram', url: ig, texto: `${usuario(ig) || 'Perfil'} no Instagram` }
        : { papel: 'instagram', servico: 'Instagram', url: null, texto: 'Instagram não informado' },
      ev ? { papel: 'evento', servico: servico(ev), url: ev, texto: `Página do evento ${servico(ev) === 'Site da produtora' ? 'no site da produtora' : `no ${servico(ev)}`}` }
        : { papel: 'evento', servico: null, url: null, texto: 'Página do evento não informada' },
    ];
  }

  function mapa(endereco, bairro) {
    if (!endereco || typeof endereco.texto !== 'string' || !endereco.texto.trim()) return null;
    const q = [endereco.texto.trim(), bairro, 'São Paulo'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  return { preco, precoNaLista, ha, media, som, regras, regrasFrase, fontes, servico, usuario, destino, links, mapa, ESTILOS };
});

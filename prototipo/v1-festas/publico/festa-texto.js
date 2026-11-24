'use strict';
// As frases do detalhe da festa e do convite, a partir do registro
// finde-r14/2: preço e lote, média e origem, som, regras de entrada, fontes e
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

  // 6 -> "R$ 6"; 7.5 -> "R$ 7,50". Preço de festa real pode ter centavos.
  const centavos = (v) => (Number.isInteger(v) ? `R$ ${v}` : `R$ ${v.toFixed(2).replace('.', ',')}`);
  const reais = (v) => (v === 0 ? 'grátis' : centavos(v));
  const valor = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

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

  // O lote seguinte no tempo: o mesmo ingresso com o número de lote maior.
  // "2º lote, unissex" -> { n: 2, tipo: "unissex" }; "Lote 02, feminino" ->
  // { n: 2, tipo: "feminino" }. Sem número de lote, null: aí não dá para
  // dizer o que vem depois, e "Backstage" não vira o "depois" da pista.
  const ORDINAL = /(\d+)\s*[º°ªo]?\s*lote\b|\blote\s*(\d+)/i;
  function loteNoTempo(nome) {
    const m = typeof nome === 'string' && nome.match(ORDINAL);
    if (!m) return null;
    const tipo = nome.replace(m[0], ' ').toLocaleLowerCase('pt-BR').replace(/[\s,;()·…-]+/g, ' ').trim();
    return { n: Number(m[1] || m[2]), tipo };
  }
  function loteSeguinte(lotes, menor) {
    // (os lotes de pessoa já saem antes; ver preco)
    const este = loteNoTempo(menor.nome);
    if (!este) return null;
    return lotes.map((l) => [l, loteNoTempo(l.nome)])
      .filter(([l, x]) => x && x.tipo === este.tipo && x.n > este.n && l.disponivel !== false && l.preco > menor.preco)
      .sort((a, b) => a[1].n - b[1].n)
      .map(([l]) => l)[0] || null;
  }

  // O que o lote pede de quem compra: o campo `condicoes` do motor ou o nome
  // do lote. A mesma regra de motor/nucleo/normalizar.js (condicoesDoLote; um
  // teste confere que batem). Lote com condição (de pessoa ou de código) não
  // é preço de todo mundo: o link público sai sem o código de quem indicou.
  const CONDICOES = ['meia', 'meia-social', 'feminino', 'masculino', 'comissario', 'codigo'];
  const DE_PESSOA = ['meia', 'meia-social', 'feminino', 'masculino', 'comissario', 'codigo'];
  const GENEROS = ['feminino', 'masculino'];
  const ROTULO_CONDICAO = {
    meia: 'Meia-entrada', 'meia-social': 'Meia social', feminino: 'Feminino', masculino: 'Masculino', comissario: 'Com comissário', codigo: 'Com código',
  };
  const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function condicoesDoLote(l) {
    // "Inteira (não é meia)": a negação sai antes de procurar a condição.
    const t = semAcento(l && l.nome).replace(/\b(?:nao|sem)\s+(?:e\s+)?(?:meia|desconto)(?:[\s-]*(?:social|entrada))?/g, ' ');
    const c = new Set(l && Array.isArray(l.condicoes) ? l.condicoes.filter((x) => CONDICOES.includes(x)) : []);
    if (/meia[\s-]*social|solidari|\+\s*\d+\s*kg|\balimento\b/.test(t)) c.add('meia-social');
    else if (/\bmeia\b|meia[\s-]entrada|\bestudante/.test(t) && !/\binteira\b/.test(t)) c.add('meia');
    // Os dois gêneros no mesmo nome ("Homens e Mulheres") é lote para todo mundo.
    const fem = /\bfemin|\bfem\b|\bmulher/.test(t);
    const masc = /\bmasculin|\bmasc\b|\bhomem\b|\bhomens\b/.test(t);
    if (fem && !masc) c.add('feminino');
    if (masc && !fem) c.add('masculino');
    if (/comissari/.test(t)) c.add('comissario');
    if (/\bcodigo\b|\bcupom\b/.test(t)) c.add('codigo');
    if (c.has('meia-social')) c.delete('meia');
    return CONDICOES.filter((x) => c.has(x));
  }
  const dePessoa = (l) => condicoesDoLote(l).some((c) => DE_PESSOA.includes(c));
  const menorDe = (ls) => ls.slice().sort((a, b) => a.preco - b.preco)[0] || null;
  // "General Admission, meia social (+1 kg)" -> "General Admission (+1 kg)":
  // o nome sem a palavra da condição, que o rótulo já diz.
  const semCondicao = (nome) => String(nome || '')
    .replace(/\b(meia[\s-]*social|meia[\s-]entrada|meia|solid[aá]ri[oa]|comiss[aá]rios?|feminin[oa]s?|masculin[oa]s?|c[oó]digo|cupom)(?![\p{L}\d])/giu, '')
    .replace(/\s*[,;·-]\s*(?=\()/g, ' ').replace(/\s*[,;·-]\s*(?=[,;·)]|$)/g, '').replace(/^\s*[,;·-]\s*/, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  // "1º lote, feminino" e "1º lote, masculino" -> "1º lote".
  const semGenero = (nome) => String(nome || '').replace(/[,;·(\s-]*\b(feminin[oa]s?|masculin[oa]s?|fem\.?|masc\.?)\b\)?/gi, '').replace(/[\s,;·-]+$/, '').trim();

  // O preço que a pessoa paga hoje: o menor lote disponível que qualquer
  // pessoa compra (sem meia, meia social, gênero ou comissário); a porta
  // quando não há lote; ou o preço da lista numa festa antiga. Quando todo
  // lote aberto é por gênero, os dois, e `valor` é o mais alto, o que vale
  // para todo mundo no teto. É a conta do precoAPartirDe do motor.
  // `outros`: os lotes com condição de pessoa, um por condição, para o
  // detalhe dizer à parte ("Meia social: R$ 220, ..."). `codigo`: o único
  // lote aberto pede um código, que o link público não traz.
  function preco(f) {
    const lotes = Array.isArray(f.lotes) ? f.lotes : null;
    const porta = f.entradaNaPorta && valor(f.entradaNaPorta.preco) ? f.entradaNaPorta : null;
    const linkCompra = urlSegura(f.linkCompra) ? f.linkCompra : null;
    const base = {
      valor: null, lote: null, nota: null, horario: null, taxa: null, depois: null, compra: false, servico: null, url: null,
      genero: null, condicao: null, codigo: false, outros: [], curto: null,
    };
    if (lotes && lotes.length) {
      const abertos = lotes.filter((l) => l.disponivel !== false);
      if (abertos.length) {
        let menor = menorDe(abertos.filter((l) => !dePessoa(l)));
        let genero = null;
        let condicao = null;
        if (!menor) {
          const soGenero = abertos.filter((l) => condicoesDoLote(l).every((c) => !DE_PESSOA.includes(c) || GENEROS.includes(c)));
          const fem = menorDe(soGenero.filter((l) => condicoesDoLote(l).includes('feminino')));
          const masc = menorDe(soGenero.filter((l) => condicoesDoLote(l).includes('masculino')));
          if (fem && masc) {
            genero = { feminino: fem, masculino: masc };
            menor = fem.preco >= masc.preco ? fem : masc;
          } else {
            menor = menorDe(abertos);
            const c = condicoesDoLote(menor).find((x) => DE_PESSOA.includes(x));
            condicao = c ? ROTULO_CONDICAO[c].toLocaleLowerCase('pt-BR') : null;
          }
        }
        const antes = lotes.filter((l) => l.disponivel === false && !dePessoa(l) && l.preco < menor.preco).map((l) => l.nome);
        // Preço por horário: o lote vale até uma hora, e depois vem o próximo.
        let horario = null;
        const limite = genero ? null : ateAs(menor.ate);
        if (limite) {
          // Aqui o lote é definido pela hora: o de depois é o seguinte da lista.
          const depois = lotes.slice(lotes.indexOf(menor) + 1).find((l) => l.disponivel !== false && !dePessoa(l) && l.preco > menor.preco);
          horario = depois ? `${limite}; depois, ${reais(depois.preco)}` : limite;
        }
        const taxaDe = (l) => (typeof l.taxa === 'number' && l.taxa > 0 ? l.taxa : null);
        let taxa = taxaDe(menor) ? `+ ${centavos(taxaDe(menor))} de taxa` : null;
        if (genero) {
          const tf = taxaDe(genero.feminino);
          const tm = taxaDe(genero.masculino);
          taxa = tf && tm ? `+ ${centavos(tf)} e ${centavos(tm)} de taxa` : null;
        }
        // Os lotes de pessoa que não são o preço mostrado: o mais barato de cada condição.
        const outros = [];
        for (const c of DE_PESSOA) {
          if (genero && GENEROS.includes(c)) continue;
          const l = menorDe(abertos.filter((x) => x !== menor && condicoesDoLote(x).includes(c)));
          if (!l || outros.some((o) => o.lote === l.nome)) continue;
          // "Meia social: R$ 220, General Admission (+1 kg)." O rótulo é a
          // palavra da página ("solidário" fica solidário); o resto do nome
          // diz de qual setor e o que a condição pede.
          const rotulo = c === 'meia-social' && /solidari/.test(semAcento(l.nome)) ? 'Solidário' : ROTULO_CONDICAO[c];
          const resto = semCondicao(l.nome);
          outros.push({ condicao: c, valor: l.preco, lote: l.nome, texto: `${rotulo}: ${reais(l.preco)}${resto ? `${resto.startsWith('(') ? ' ' : ', '}${resto}` : ''}.` });
        }
        const codigo = condicoesDoLote(menor).includes('codigo') || Boolean(genero && [genero.feminino, genero.masculino].some((l) => condicoesDoLote(l).includes('codigo')));
        if (menor.preco === 0 && !genero) return { ...base, tipo: 'gratis', valor: 0, texto: 'Grátis', horario, taxa: null, outros, codigo, curto: 'Grátis' };
        const seguinte = horario || genero ? null : loteSeguinte(lotes.filter((l) => !dePessoa(l) || l === menor), menor);
        // Lote de gênero grátis diz "grátis", nunca "R$ 0".
        const texto = genero ? `${reais(genero.feminino.preco)} fem. · ${reais(genero.masculino.preco)} masc.` : centavos(menor.preco);
        const curtoDe = (v, segundo) => (v === 0 ? 'grátis' : segundo ? centavos(v).replace('R$ ', '') : centavos(v));
        const curtoGenero = genero
          ? `${curtoDe(genero.feminino.preco, false)}/${curtoDe(genero.masculino.preco, genero.feminino.preco !== 0)}`
          : null;
        const loteDoGenero = genero && semGenero(genero.feminino.nome) === semGenero(genero.masculino.nome) ? semGenero(genero.feminino.nome) : null;
        return {
          ...base, tipo: 'online', valor: menor.preco, texto,
          curto: genero ? curtoGenero : centavos(menor.preco),
          lote: genero ? loteDoGenero || null : horario ? null : menor.nome,
          nota: notaEsgotados(antes), horario, taxa, depois: seguinte ? `depois, ${reais(seguinte.preco)}` : null,
          genero: genero ? { feminino: genero.feminino.preco, masculino: genero.masculino.preco } : null,
          condicao, codigo, outros,
          compra: Boolean(linkCompra), servico: servico(linkCompra), url: linkCompra,
        };
      }
      if (!porta) return { ...base, tipo: 'esgotado', texto: 'Esgotado', nota: notaEsgotados(lotes.map((l) => l.nome)) };
    }
    if (porta) {
      if (porta.preco === 0) return { ...base, tipo: 'gratis', valor: 0, texto: 'Grátis, na porta', curto: 'Grátis' };
      return { ...base, tipo: 'porta', valor: porta.preco, texto: `Entrada na porta, ${centavos(porta.preco)}`, curto: centavos(porta.preco) };
    }
    if (valor(f.preco)) {
      if (f.preco === 0) return { ...base, tipo: 'gratis', valor: 0, texto: 'Grátis', curto: 'Grátis' };
      return { ...base, tipo: 'online', valor: f.preco, texto: centavos(f.preco), curto: centavos(f.preco) };
    }
    // Sem preço e com link de compra: a página do ingresso diz (R27). O /3
    // não diz se a venda abriu: o link vira "Ver ingressos", nunca "não abriu".
    return { ...base, tipo: 'sem-preco', texto: 'Preço ainda não informado', compra: Boolean(linkCompra), servico: servico(linkCompra), url: linkCompra };
  }

  function precoNaLista(f) {
    const p = preco(f);
    const ate = p.horario ? p.horario.split(';')[0] : null;
    if (p.tipo === 'gratis') return ate ? `grátis ${ate}` : 'grátis';
    if (p.tipo === 'online' && ate) return `${centavos(p.valor)} ${ate}`;
    if (p.tipo === 'porta') return `${centavos(p.valor)} na porta`;
    if (p.tipo === 'online' && p.genero) return p.texto;
    if (p.tipo === 'online' && p.condicao) return `${reais(p.valor)}, ${p.condicao}`;
    if (p.tipo === 'online') {
      // "a partir de" só quando há outro lote que qualquer pessoa compra.
      const livres = Array.isArray(f.lotes) ? f.lotes.filter((l) => l.disponivel !== false && !dePessoa(l)) : [];
      return livres.length > 1 ? `a partir de ${reais(p.valor)}` : reais(p.valor);
    }
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
    const base = typeof f.origemIdade === 'string' && f.origemIdade.trim() ? f.origemIdade.trim() : null;
    // Festa real: de onde a produtora publicou ("no post de 12/11").
    const detalhe = base && typeof f.origemDetalhe === 'string' && f.origemDetalhe.trim() ? f.origemDetalhe.trim() : null;
    const origem = detalhe ? `${base}, ${detalhe}` : base;
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
    // Festa real sem som classificado: "Som não informado." em vez de nada.
    // Estilo que veio da classificação (regras ou Claude), e não da página ou
    // da produtora: é leitura da descrição, e a frase diz que é.
    const inferido = Boolean(estilos && f.estilosInferidos === true);
    const somDito = inferido ? `Parece ${/^\p{Lu}{2}/u.test(estilos) ? estilos : estilos.charAt(0).toLocaleLowerCase('pt-BR') + estilos.slice(1)}, pela descrição da página` : estilos;
    const frase = lineup ? (somDito ? `${somDito}, com ${nomes2}.` : `Som não informado. Lineup: ${nomes2}.`) : `${somDito ? `${somDito}. ` : 'Som não informado. '}Lineup ainda não divulgado.`;
    return { estilos, inferido, lineup, aviso: lineup ? null : 'Lineup ainda não divulgado.', frase };
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

  // As páginas que a leitura manual abriu (registro `paginas`), cada uma
  // pelo que ela é, com o que se leu nela e quando. O rodapé do detalhe.
  const PAGINA = {
    ingresso: { rotulo: 'Página do ingresso', na: 'na página do ingresso', lida: 'lida' },
    revenda: { rotulo: 'Revenda', na: 'na revenda', lida: 'lida' },
    materia: { rotulo: 'Matéria', na: 'na matéria', lida: 'lida' },
    oficial: { rotulo: 'Site oficial', na: 'no site oficial', lida: 'lido' },
    instagram: { rotulo: 'Instagram', na: 'no Instagram', lida: 'lido' },
    outra: { rotulo: 'Página', na: 'na página', lida: 'lida' },
  };
  // O que cada campo lido é, em palavras; a ordem é a do detalhe.
  const LIDO = [
    [['data'], 'data'], [['inicio', 'fim', 'pistaCheia'], 'horário'], [['casa', 'endereco'], 'lugar'], [['lotes', 'entradaNaPorta'], 'preço'],
    [['lineup'], 'lineup'], [['idadeMinima', 'regras'], 'regras de entrada'], [['descricao'], 'descrição'],
  ];
  const nomeDaPagina = (x) => {
    const t = PAGINA[x.tipo] || PAGINA.outra;
    const nome = typeof x.nome === 'string' && x.nome.trim() && x.nome.trim() !== t.rotulo ? x.nome.trim() : null;
    return { ...t, nome };
  };
  function paginas(f, agora = Date.now()) {
    return (Array.isArray(f.paginas) ? f.paginas : [])
      .filter((x) => x && typeof x.tipo === 'string' && typeof x.lidoEm === 'string')
      .slice()
      .sort((a, b) => Date.parse(b.lidoEm) - Date.parse(a.lidoEm))
      .map((x) => {
        const t = nomeDaPagina(x);
        const campos = Array.isArray(x.campos) ? x.campos : [];
        const lido = LIDO.filter(([cs]) => cs.some((c) => campos.includes(c))).map(([, nome]) => nome);
        const quando = ha(x.lidoEm, agora);
        // "Matéria (Billboard Brasil): preço e lineup, lida há 10 min"
        return {
          tipo: x.tipo,
          nome: `${t.rotulo}${t.nome ? ` (${t.nome})` : ''}`,
          lido: lido.length ? lista(lido) : null,
          quando: quando ? `${t.lida} ${quando}` : null,
        };
      });
  }

  // De onde veio o preço: a página que deu os lotes por último. Festa real
  // lida à mão; null sem `paginas` ou sem página de preço.
  function origemDoPreco(f, agora = Date.now()) {
    const ps = (Array.isArray(f.paginas) ? f.paginas : [])
      .filter((x) => x && Array.isArray(x.campos) && x.campos.includes('lotes') && typeof x.lidoEm === 'string')
      .sort((a, b) => Date.parse(b.lidoEm) - Date.parse(a.lidoEm));
    if (!ps.length) return null;
    const x = ps[0];
    const t = nomeDaPagina(x);
    const quando = ha(x.lidoEm, agora);
    if (x.tipo === 'ingresso') return { conferido: true, texto: `Preço conferido na página do ingresso${quando ? `, ${quando}` : ''}.` };
    return {
      conferido: false,
      texto: `Preço lido ${t.na}${t.nome ? ` ${x.tipo === 'materia' ? 'da ' : ''}${t.nome}` : ''}${quando ? `, ${quando}` : ''}; não conferido na página do ingresso.`,
    };
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

  // /app?festa=<id>: o id normalizado, ou null quando não tem forma de id.
  // Caixa e espaço de um link copiado à mão não derrubam o link.
  function idDeFesta(valor) {
    if (typeof valor !== 'string') return null;
    const id = valor.trim().toLocaleLowerCase('pt-BR');
    return /^[a-z0-9-]{1,60}$/.test(id) ? id : null;
  }

  // "média 31 anos, informada pela produtora", para leitor de tela.
  function mediaFalada(f) {
    if (!f || !Number.isInteger(f.mediaIdade)) return 'média de idade não informada';
    const origem = typeof f.origemIdade === 'string' ? f.origemIdade.trim() : '';
    return `média ${f.mediaIdade} anos${origem ? `, ${origem}` : ''}`;
  }

  // A linha da festa da API ("Sáb · 17h00 · Pinheiros · média 30 anos") sem
  // a média, que vai em seguida com a origem, uma vez só.
  const linhaSemMedia = (linha) => String(linha || '').replace(/ · média \d+ anos$/, '');

  // O que o leitor de tela ouve de um cartão da lista: a linha da festa, a
  // média uma vez só (com a origem), o preço, a % quando ela aparece no
  // cartão e as marcas.
  function cartaoFalado(o, { pct = null, nova = false } = {}) {
    const f = o.festa;
    return [o.exemplo === true ? 'exemplo, festa fictícia' : null, linhaSemMedia(o.linha), o.dataDistante && o.data ? dataDoCartao(o.data, f.dia) : null,
      mediaFalada(f), precoNaLista(f), Number.isInteger(pct) ? `${pct}% a sua cara` : null,
      o.patrocinada ? 'patrocinado' : null, nova ? 'nova na lista' : null].filter(Boolean).join(' · ');
  }

  // "sáb, 28 nov": a data de uma festa real que não é a do próximo dia pedido.
  const DIA_CURTO = { sex: 'sex', sab: 'sáb', dom: 'dom' };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function dataDoCartao(iso, dia) {
    const m = typeof iso === 'string' && iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return `${DIA_CURTO[dia] ? `${DIA_CURTO[dia]}, ` : ''}${Number(m[2])} ${MESES[Number(m[1]) - 1]}`;
  }

  // "Casa · Bairro", quando a casa não diz o bairro.
  const casaComBairro = (casa, bairro) => {
    const c = String(casa || '');
    return bairro && !c.includes(bairro) ? `${c} · ${bairro}` : c;
  };

  // A mensagem que vai pro grupo, em texto corrido (a caixa alta do manual é
  // estilo de rótulo, não cabe no WhatsApp). Abre com a hora e a média, com a
  // origem (regra 3 da voz). data: "sáb, 21 nov".
  // Sem média, a mensagem não abre com "média não informada" (R35): traz a
  // casa, o bairro, o preço e o lineup ("com Louie Vega").
  function mensagem({ data, hora, bairro, festa: f, link }) {
    const origem = typeof f.origemIdade === 'string' && f.origemIdade.trim() ? f.origemIdade.trim() : '';
    const media = Number.isInteger(f.mediaIdade) ? `média ${f.mediaIdade} anos${origem ? ` (${origem})` : ''}` : null;
    const quando = [data, hora, media].filter(Boolean).join(' · ');
    const nomes = Array.isArray(f.lineup) ? f.lineup.filter((x) => typeof x === 'string' && x.trim()) : [];
    const lineup = nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : lista(nomes);
    const p = preco(f);
    // Festa fictícia: o grupo não vê o rodapé do protótipo, então a mensagem diz.
    const ficticia = f.real !== true;
    return [
      'Achei essa, bora?',
      ...(ficticia ? ['(Exemplo: festa fictícia do protótipo do Finde.)'] : []),
      '',
      quando.replace(/^./, (x) => x.toLocaleUpperCase('pt-BR')),
      lineup ? `${f.nome}, com ${lineup}` : f.nome,
      // Festa real sem casa nem bairro: só o preço, sem "·" sobrando. Sem
      // preço, nada de "preço não informado" no grupo.
      [casaComBairro(f.casa, bairro), p.tipo === 'sem-preco' ? null : precoNaLista(f)].filter(Boolean).join(' · '),
      '',
      'Diz aqui se você tá dentro:',
      link,
    ];
  }

  // "% a sua cara". A ordem dos critérios é a dos pesos de nucleo/cara.js
  // (horário 30, idade 25, bairro 20, preço 15, som 10; um teste confere).
  const CARA_ORDEM = ['horario', 'idade', 'bairro', 'preco', 'som'];
  const CARA_NOME = { horario: 'o horário', idade: 'a idade', bairro: 'o bairro', preco: 'o preço', som: 'o som' };
  const pctDe = (o) => {
    const c = o && o.cara;
    return c && Number.isInteger(c.pct) && c.pct >= 0 && c.pct <= 100 ? c.pct : null;
  };

  // As partes na ordem do peso, o horário primeiro.
  function ordemDaCara(partes) {
    const pos = (x) => {
      const i = CARA_ORDEM.indexOf(x && x.criterio);
      return i < 0 ? CARA_ORDEM.length : i;
    };
    return (Array.isArray(partes) ? partes : []).filter((x) => x && typeof x.texto === 'string' && x.texto.trim())
      .map((x, i) => [x, i]).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]).map(([x]) => x);
  }

  // "Conta mais o horário, depois a idade e o bairro." Só quando ajuda a
  // conferir a conta: dois critérios ou mais, e algum que não cabe inteiro.
  function pesoDaCara(cara) {
    // O que não se sabe fica na frase de semDadoDaCara.
    const partes = ordemDaCara(cara && cara.partes).filter((x) => x.cabe !== null);
    if (partes.length < 2 || partes.every((x) => x.cabe === true)) return '';
    const nomes = partes.map((x) => CARA_NOME[x.criterio]).filter(Boolean);
    if (nomes.length < 2) return '';
    const resto = nomes.slice(1);
    return `Conta mais ${nomes[0]}, depois ${lista(resto)}.`;
  }

  // "Sem dado, conta pela metade: a idade e o som." Quando a festa real
  // não informa algum critério pedido (cara.semDado, nucleo/cara.js).
  function semDadoDaCara(cara) {
    const ids = cara && Array.isArray(cara.semDado) ? cara.semDado : [];
    const nomes = CARA_ORDEM.filter((k) => ids.includes(k)).map((k) => CARA_NOME[k]);
    return nomes.length ? `Sem dado, conta pela metade: ${lista(nomes)}.` : '';
  }

  // A frase do horário no desenho (painel do convite, convite da landing):
  // "…e acaba às 23h." nunca deixa a hora sozinha na linha de baixo. O verbo,
  // a preposição e a hora andam juntos ("enche às 20h", "e acaba à 1h"); o
  // sujeito fica solto, para "a pista enche à meia-noite" não pedir uma
  // terceira linha a 320 px. A frase da API continua a mesma.
  // Espaço e hífen que não quebram (o U+2011 existe na DM Sans servida).
  const colar = (t) => t.replace(/ /g, '\u00a0').replace(/-/g, '\u2011');
  function horarioSemQuebra(texto) {
    return String(texto || '')
      .replace(/(^|\s)((?:e )?(?:começa|enche|acaba) às? \S+)/giu, (_, antes, trecho) => `${antes}${colar(trecho)}`);
  }

  // "casa · preço · produtora" só quebra antes de um "·": cada trecho anda
  // inteiro ("Coletivo Meia-Luz" não se parte no hífen), e o ponto abre a
  // linha de baixo, nunca fica pendurado no fim da de cima. Trecho longo
  // demais para uma linha estreita (mais de 32 letras) quebra por dentro.
  const TRECHO_INTEIRO = 32;
  function ondeSemQuebra(trechos) {
    return (Array.isArray(trechos) ? trechos : [])
      .map((t) => String(t === null || t === undefined ? '' : t).trim())
      .filter(Boolean)
      .map((t) => (t.length <= TRECHO_INTEIRO ? colar(t) : t.replace(/R\$ (?=\d)/g, 'R$\u00a0')))
      .join(' ·\u00a0');
  }

  // Na lista, a % só aparece quando ajuda a escolher: se todas as festas
  // têm a mesma, ela sai dos cartões e fica no detalhe.
  function pctNosCartoes(opcoes) {
    const pcts = (Array.isArray(opcoes) ? opcoes : []).map(pctDe).filter((x) => x !== null);
    return pcts.length > 1 && new Set(pcts).size > 1;
  }

  // ------------------------------------------------------------ o guia (Direção E, plano de 24/11/2026)

  // "R$ 60" nunca quebra entre o símbolo e o número.
  const semQuebraNoPreco = (t) => String(t).replace(/R\$ (?=\d)/g, 'R$ ');
  // Número nunca fica sozinho na linha (revisão de desenho): "há 2h",
  // "11 anos", "Prado, 1.658", "de R$ 70". O texto continua o mesmo para
  // quem lê com leitor de tela; só o espaço vira inquebrável.
  const semViuva = (t) => semQuebraNoPreco(String(t))
    .replace(/\bhá (?=\d)/g, 'há ')
    .replace(/(\d) (?=\p{L})/gu, '$1 ')
    .replace(/, (?=\d)/g, ', ')
    .replace(/\bde (?=R\$)/g, 'de ');
  // "22h00" vira "22h" (a hora cheia sem os zeros), no app e no convite.
  const horaCurta = (t) => String(t).replace(/h00$/, 'h');
  const maiuscula = (t) => String(t || '').replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'));
  const minuscula = (t) => (/^\p{Lu}{2}/u.test(t) ? t : String(t || '').replace(/^./, (c) => c.toLocaleLowerCase('pt-BR')));

  // "em Pinheiros", "na Vila Madalena": a preposição de cada um dos 14
  // bairros do motor (a mesma de nucleo/catalogo.js, `em`; um teste confere).
  const EM_BAIRRO = {
    Pinheiros: 'em', 'Vila Madalena': 'na', 'Barra Funda': 'na', Centro: 'no', 'Bela Vista': 'na', Jardins: 'nos',
    'Vila Mariana': 'na', Perdizes: 'em', Lapa: 'na', 'Butantã': 'no', Santana: 'em', Mooca: 'na', 'Santo Amaro': 'em', Interlagos: 'em',
  };
  const emBairro = (nome) => `${EM_BAIRRO[nome] || 'em'} ${nome}`;

  // "23h" -> "às 23h"; "0h" -> "à meia-noite"; "1h30" -> "à 1h30".
  function asHoras(valor) {
    const m = typeof valor === 'string' && valor.match(/^(\d{1,2})h(\d{2})?$/);
    if (!m) return `às ${valor}`;
    const h = Number(m[1]) % 24;
    if (h === 0 && !m[2]) return 'à meia-noite';
    return `${h < 2 ? 'à' : 'às'} ${h}h${m[2] || ''}`;
  }

  // O que cada critério que cabe diz, em pedaço de frase.
  const PEDACO = {
    horario: (v) => `começa ${asHoras(v)}`,
    idade: (v) => {
      const a = String(v).match(/^(\d+) de (\d+)/);
      if (a) return `${a[1]} de ${a[2]} que foram acharam o público da idade`;
      const m = String(v).match(/(\d+)/);
      return m ? `média de ${m[1]} anos` : null;
    },
    bairro: (v) => (/^a \d/.test(v) ? `fica ${v} do bairro pedido` : `fica ${emBairro(v)}`),
    // "Começa às 21h e é de graça." / "Começa às 23h e custa R$ 70." (24/11/2026)
    preco: (v) => (/^gr[aá]tis$/i.test(String(v).trim()) ? 'é de graça' : `custa ${v}`),
    som: (v) => `toca ${minuscula(v)}`,
  };
  const FALTA_NOME = { horario: 'o horário', idade: 'a média de idade', bairro: 'o bairro', preco: 'o preço', som: 'o som' };
  // "Não diz o som." / "Não diz o preço nem o som." / "Não diz o bairro, o preço nem o som."
  function naoDiz(nomes) {
    if (!nomes.length) return '';
    if (nomes.length === 1) return `Não diz ${nomes[0]}.`;
    return `Não diz ${nomes.slice(0, -1).join(', ')} nem ${nomes[nomes.length - 1]}.`;
  }

  // O porquê de cada cartão real (R26, KTD15 do plano de 24/11/2026): a opção
  // traz `porque: { cabe: [{ criterio, valor }], falta: [{ criterio, valor }] }`
  // como dado, e o texto sai daqui: até duas partes que cabem e uma linha
  // honesta do que falta. Com a linha única do cabeçalho (semMedia, D3), a
  // média não se repete em cartão nenhum.
  // partesDoPorque(opcao, { semMedia }) -> { cabe: ['começa às 23h', ...], falta: 'Não diz o som.' }
  function partesDoPorque(opcao, { semMedia = false } = {}) {
    const p = opcao && opcao.porque && typeof opcao.porque === 'object' ? opcao.porque : {};
    const cabe = (Array.isArray(p.cabe) ? p.cabe : [])
      .filter((x) => x && PEDACO[x.criterio] && x.valor !== null && x.valor !== undefined && String(x.valor).trim())
      .map((x) => PEDACO[x.criterio](semQuebraNoPreco(String(x.valor).trim())))
      .filter(Boolean)
      .slice(0, 2);
    const faltam = (Array.isArray(p.falta) ? p.falta : [])
      .map((x) => x && x.criterio)
      .filter((c, i, xs) => FALTA_NOME[c] && xs.indexOf(c) === i && !(semMedia && c === 'idade'))
      .sort((a, b) => CARA_ORDEM.indexOf(a) - CARA_ORDEM.indexOf(b))
      .map((c) => FALTA_NOME[c]);
    return { cabe, falta: naoDiz(faltam) };
  }

  // O porquê pronto para o cartão: "Começa às 23h e fica em Pinheiros." e a
  // linha do que falta. Sem nada, os dois vazios (o cartão não mostra a linha).
  function porqueDoCartao(opcao, opcoes) {
    const { cabe, falta } = partesDoPorque(opcao, opcoes);
    // Duas partes com "e"; com vírgula na primeira, ponto e vírgula.
    const juntas = cabe.length > 1 && cabe[0].includes(', ') ? cabe.join('; ') : cabe.join(' e ');
    return { cabe: cabe.length ? `${maiuscula(juntas)}.` : '', falta };
  }

  // A base viva (R23): "Atualizado há 3h" e "41 festas lidas de 50 perfis e
  // 3 sites de ingresso". Sem a data, nada (o cabeçalho não inventa).
  function baseViva(base, agora = Date.now()) {
    if (!base || typeof base !== 'object') return null;
    const quando = ha(base.atualizadoEm, agora);
    if (!quando) return null;
    const n = (v, um, varios) => (Number.isInteger(v) && v >= 0 ? `${v} ${v === 1 ? um : varios}` : null);
    const festas = n(base.total, 'festa lida', 'festas lidas');
    const de = [n(base.perfis, 'perfil', 'perfis'), n(base.sites, 'site de ingresso', 'sites de ingresso')].filter(Boolean);
    return {
      quando: `Atualizado ${quando}`,
      conta: festas ? `${festas}${de.length ? ` de ${lista(de)}` : ''}` : null,
    };
  }

  // O preço conferido há mais de 72 h (R27): marcado no detalhe e fora da barra.
  const PRECO_VELHO_MS = 72 * 3600e3;
  // A hora que vale é a da leitura da página que deu o preço, quando a festa
  // traz páginas lidas: o carimbo do campo é o da última passagem pelo motor
  // (uma indicação reprocessada hoje não confere o preço de novo).
  function precoVelho(f, agora = Date.now()) {
    const lidas = (f && Array.isArray(f.paginas) ? f.paginas : [])
      .filter((x) => x && Array.isArray(x.campos) && x.campos.includes('lotes') && typeof x.lidoEm === 'string')
      .map((x) => Date.parse(x.lidoEm)).filter(Number.isFinite);
    const t = lidas.length ? Math.max(...lidas) : f && typeof f.precoConferidoEm === 'string' ? Date.parse(f.precoConferidoEm) : NaN;
    return Number.isFinite(t) && agora - t > PRECO_VELHO_MS;
  }

  // O texto do link de compra: "Comprar" com preço; "Ver ingressos" sem ele
  // (o /3 não diz se a venda abriu, então o app nunca diz que não abriu).
  const rotuloDaCompra = (p) => (p && p.valor === null ? 'Ver ingressos' : 'Comprar');

  // As fontes que acharam a festa (encontradaEm do /3; sem ele, as fontes do
  // registro), sem as que só leram ou corrigiram: claude, regras, curadoria
  // e avaliações não "acham" festa.
  const SO_LEITURA = new Set(['claude', 'regras', 'curadoria', 'avaliacoes', 'nominatim']);
  function encontradaEm(f) {
    const ids = Array.isArray(f && f.encontradaEm) ? f.encontradaEm
      : (Array.isArray(f && f.fontes) ? f.fontes : []).map((x) => x && x.id);
    return ids.filter((id, i) => typeof id === 'string' && id && !SO_LEITURA.has(id) && ids.indexOf(id) === i);
  }

  // O nome curto de cada fonte numa frase ("a página do ingresso diz R$ 40").
  const NOME_CURTO = {
    paginas: 'a página do ingresso', instagram: 'o post', indicacao: 'a indicação', envio: 'a produtora', ical: 'a agenda da casa',
    'mapas-culturais': 'a agenda da Prefeitura', shotgun: 'a Shotgun', sympla: 'a Sympla', ingresse: 'a Ingresse', curadoria: 'a curadoria',
    plataformas: 'a plataforma de ingresso', claude: 'a leitura da descrição', regras: 'a leitura da descrição', avaliacoes: 'quem foi',
  };
  const nomeCurto = (id) => NOME_CURTO[id] || 'outra fonte';
  // "Página do ingresso", "Post no Instagram": o que a fonte é, no rótulo da lista.
  const NOME_DA_FONTE = {
    paginas: 'Página do ingresso', instagram: 'Post no Instagram', indicacao: 'Indicação ao finde', envio: 'Enviada pela produtora',
    ical: 'Agenda da casa', 'mapas-culturais': 'Agenda da Prefeitura', curadoria: 'Curadoria do finde',
  };

  // O que cada campo lido é, em palavras, para "o que se leu nela".
  const CAMPO_LIDO = [
    [['nome'], 'nome'], [['data', 'inicio', 'fim'], 'horário'], [['lotes', 'precoAPartirDe', 'entradaNaPorta'], 'preço'],
    [['casa', 'endereco', 'geo'], 'endereço'], [['lineup'], 'lineup'], [['estilos'], 'som'], [['mediaIdade'], 'idade'],
  ];

  // A lista das fontes (R31): cada uma com o link para a página ou o post
  // (https só, nunca o perfil), o que se leu nela e quando foi conferida.
  function fontesDaFesta(f, agora = Date.now()) {
    const achou = new Set(encontradaEm(f));
    const campos = f && f.campos && typeof f.campos === 'object' ? f.campos : {};
    const daImagem = new Set((Array.isArray(f && f.imagens) ? f.imagens : []).map((x) => x && x.fonte));
    return (Array.isArray(f && f.fontes) ? f.fontes : [])
      .filter((x) => x && typeof x.id === 'string' && achou.has(x.id))
      .slice()
      .sort((a, b) => (Date.parse(b.conferidoEm) || 0) - (Date.parse(a.conferidoEm) || 0))
      .map((x) => {
        const u = urlSegura(x.url);
        // Perfil não é página da festa: sem link.
        const perfil = u && servico(u.href) === 'Instagram' && usuario(u.href);
        const url = u && !perfil ? u.href : null;
        const serv = url ? servico(url) : null;
        const base = NOME_DA_FONTE[x.id] || (typeof x.nome === 'string' && x.nome.trim()) || 'Outra fonte';
        const nome = serv && serv !== 'Site da produtora' && !base.includes(serv) ? `${base} · ${serv}` : base;
        const lidos = CAMPO_LIDO.filter(([cs]) => cs.some((c) => campos[c] && campos[c].fonte === x.id)).map(([, n]) => n);
        if (daImagem.has(x.id)) lidos.push('flyer');
        const quando = ha(x.conferidoEm, agora);
        return {
          id: x.id, nome, url,
          leu: [lidos.length ? maiuscula(lista(lidos)) : null, quando ? `conferido ${quando}` : null].filter(Boolean).join(' · '),
          rotuloLink: serv === 'Instagram' ? 'Ver o post' : 'Abrir',
        };
      });
  }

  // O porquê da junção (R31), dos sinais do vínculo de cada fonte:
  // "Juntamos pelo link de compra, pelo nome e pelo mesmo flyer." A imagem
  // nunca une sozinha (D10) e vem por último; `imagem` diz se ela pesou, para
  // o detalhe pôr as duas peças lado a lado. Decisão à mão tem frase própria.
  const SINAL = [
    ['link', 'pelo link de compra'], ['idPlataforma', 'pelo mesmo evento na plataforma'], ['nome', 'pelo nome'], ['lugar', 'pela casa'],
    ['perfil', 'pelo perfil do Instagram'], ['lineup', 'pelo lineup'], ['imagem', 'pelo mesmo flyer'],
  ];
  function fraseDaJuncao(f) {
    const vinculos = (Array.isArray(f && f.fontes) ? f.fontes : []).map((x) => x && x.vinculo).filter((v) => v && typeof v === 'object');
    if (vinculos.some((v) => v.regra === 'manual')) return { frase: 'Juntamos à mão, na curadoria do finde.', imagem: false };
    const vistos = new Set();
    for (const v of vinculos) {
      if (v.regra === 'link') vistos.add('link');
      for (const s of Array.isArray(v.sinais) ? v.sinais : []) if (s && typeof s.peso === 'number' && s.peso > 0) vistos.add(s.sinal);
    }
    const pedacos = SINAL.filter(([s]) => vistos.has(s)).map(([, t]) => t);
    if (!pedacos.length) return null;
    return { frase: `Juntamos ${lista(pedacos)}.`, imagem: vistos.has('imagem') };
  }

  // As divergências entre fontes (R31), numa frase cada, só quando os valores
  // já normalizados diferem: "A página do ingresso diz R$ 40; a indicação diz
  // R$ 45. Mostramos o que diz a página do ingresso."
  const horaDe = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const t = Math.round(v * 60) % (24 * 60);
      return `${Math.floor(t / 60)}h${t % 60 ? String(t % 60).padStart(2, '0') : ''}`;
    }
    const m = typeof v === 'string' && v.match(/T(\d{2}):(\d{2})/);
    return m ? `${Number(m[1])}h${m[2] !== '00' ? m[2] : ''}` : null;
  };
  const NORMAL = {
    precoAPartirDe: (v) => (valor(v) ? String(Math.round(v * 100)) : null),
    inicio: (v) => horaDe(v),
    data: (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null),
    casa: (v) => (typeof v === 'string' && v.trim() ? semAcento(v).replace(/[^a-z0-9]+/g, ' ').trim() : null),
    linkCompra: (v) => {
      const u = urlSegura(v);
      return u ? `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}` : null;
    },
  };
  const DITO = {
    precoAPartirDe: (v) => (v === 0 ? 'grátis' : centavos(v)),
    inicio: (v) => horaDe(v),
    data: (v) => { const [, m, d] = v.slice(0, 10).split('-').map(Number); return `${d}/${m}`; },
    casa: (v) => v.trim(),
    linkCompra: (v) => `um link ${servico(v) === 'Site da produtora' ? 'de outro site' : `da ${servico(v)}`}`,
  };
  const ATUAL = { precoAPartirDe: (f) => preco(f).valor, inicio: (f) => f.inicio, data: (f) => f.data, casa: (f) => f.casa, linkCompra: (f) => f.linkCompra };
  function divergencias(f) {
    return (Array.isArray(f && f.divergencias) ? f.divergencias : []).map((d) => {
      const norm = d && NORMAL[d.campo];
      if (!norm || !Array.isArray(d.valores)) return null;
      const vals = d.valores.map((x) => x && { fonte: x.fonte, valor: x.valor, n: norm(x.valor) }).filter((x) => x && x.n !== null);
      const distintos = [...new Set(vals.map((x) => x.n))];
      if (distintos.length < 2) return null;
      // Uma fonte por valor, a primeira que o disse.
      const porValor = distintos.map((n) => vals.find((x) => x.n === n));
      const atual = norm(ATUAL[d.campo](f));
      const mostrado = porValor.find((x) => x.n === atual);
      // Valores diferentes que se dizem igual ("um link da Ingresse" e "um
      // link da Ingresse"): a frase não repete o mesmo dos dois lados.
      const faladas = [...new Set(porValor.map((x) => DITO[d.campo](x.valor)))];
      if (faladas.length < 2) {
        if (d.campo !== 'linkCompra' || !mostrado) return null;
        const serv = servico(mostrado.valor);
        const onde = serv === 'Site da produtora' ? 'do mesmo site' : `da ${serv}`;
        const nome = nomeCurto(mostrado.fonte);
        return `As fontes levam a páginas diferentes ${onde}; o botão abre a que veio ${/^[ao] /.test(nome) ? `d${nome}` : `de ${nome}`}.`;
      }
      const ditas = porValor.map((x) => `${nomeCurto(x.fonte)} diz ${semQuebraNoPreco(DITO[d.campo](x.valor))}`);
      return `${maiuscula(ditas.join('; '))}.${mostrado ? ` Mostramos o que diz ${nomeCurto(mostrado.fonte)}.` : ''}`;
    }).filter(Boolean);
  }

  // A avaliação de quem foi (R34, KTD13): o que a pergunta mede, nunca "média
  // do público". "4 de 5 que foram, de 29 a 34 anos, acharam o público da
  // idade deles."
  function fraseDaAvaliacao(f) {
    const a = f && f.avaliacaoIdade;
    if (!a || !Number.isInteger(a.avaliacoes) || a.avaliacoes < 1 || typeof a.naMedida !== 'number') return null;
    const n = Math.round(a.naMedida * a.avaliacoes);
    const fx = Array.isArray(a.faixa) && a.faixa.length === 2 && a.faixa.every(Number.isInteger) ? a.faixa : null;
    const idade = fx ? (fx[0] === fx[1] ? `, com ${fx[0]} anos` : `, de ${fx[0]} a ${fx[1]} anos`) : '';
    const quem = a.avaliacoes === 1 ? '1 pessoa que foi' : `${n} de ${a.avaliacoes} que foram`;
    if (a.avaliacoes === 1) return `${maiuscula(quem)}${idade}, ${n ? 'achou o público da idade dela' : 'não achou o público da idade dela'}.`;
    return `${quem}${idade}, ${n === 1 ? 'achou' : 'acharam'} o público da idade deles.`;
  }

  // De onde vem (R31): uma linha por campo, o rótulo e a fonte com quando.
  const FONTE_DITA = {
    paginas: 'Página do ingresso', instagram: 'Post no Instagram', indicacao: 'Indicação ao finde', envio: 'A produtora',
    ical: 'Agenda da casa', 'mapas-culturais': 'Agenda da Prefeitura', curadoria: 'Curadoria do finde', avaliacoes: 'Avaliações de quem foi',
    claude: 'Leitura da descrição', regras: 'Leitura da descrição', nominatim: 'OpenStreetMap',
  };
  // "Indicação ao finde" -> "de uma indicação ao finde", para a frase única.
  const DE_FONTE = {
    'Página do ingresso': 'da página do ingresso', 'Post no Instagram': 'de um post no Instagram', 'Indicação ao finde': 'de uma indicação ao finde',
    'A produtora': 'da produtora', 'Agenda da casa': 'da agenda da casa', 'Agenda da Prefeitura': 'da agenda da Prefeitura', 'Curadoria do finde': 'da curadoria do finde',
  };
  function deOndeVem(f, agora = Date.now()) {
    const campos = f && f.campos && typeof f.campos === 'object' ? f.campos : {};
    const fonteDe = (...cs) => {
      const c = cs.map((x) => campos[x]).find((x) => x && x.fonte);
      if (!c) return null;
      const quando = ha(c.conferidoEm, agora);
      return `${FONTE_DITA[c.fonte] || 'Outra fonte'}${quando ? `, ${quando}` : ''}.`;
    };
    const linhas = [];
    const h = fonteDe('inicio', 'data');
    if (h) linhas.push({ campo: 'Horário', texto: h });
    const p = fonteDe('lotes', 'precoAPartirDe', 'entradaNaPorta');
    if (p) linhas.push({ campo: 'Preço', texto: p });
    // O lugar: a fonte do endereço, a da cidade (a casa curada confirma, D6)
    // e a do pino, com a atribuição do OpenStreetMap quando ela vale.
    const l = f && f.local && typeof f.local === 'object' ? f.local : {};
    const e = f && f.endereco && typeof f.endereco === 'object' ? f.endereco : {};
    const local = [];
    if (l.origemGeo === 'curado' || e.cidadeOrigem === 'casa') local.push('Cadastro da casa no finde');
    else {
      const t = fonteDe('endereco', 'casa');
      if (t) local.push(t.replace(/\.$/, ''));
    }
    if (e.cidadeOrigem === 'casa') local.push('cidade pelo cadastro da casa');
    else if (e.cidadeOrigem === 'cep') local.push('cidade pelo CEP');
    if (l.origemGeo === 'nominatim' || l.atribuicaoOsm) local.push('mapa © OpenStreetMap');
    if (local.length) linhas.push({ campo: 'Local', texto: `${local.join('; ')}.` });
    const s = som(f || {});
    if (s.estilos) linhas.push({ campo: 'Som', texto: s.inferido ? 'Leitura da descrição da página.' : fonteDe('estilos') || 'Fonte não informada.' });
    const m = fonteDe('mediaIdade');
    if (m && Number.isInteger(f.mediaIdade)) linhas.push({ campo: 'Idade', texto: m });
    // Tudo da mesma fonte: uma frase só, e não a mesma linha três vezes
    // ("Horário, preço e local vieram de uma indicação ao finde, há 2h.").
    if (linhas.length > 1 && linhas.every((x) => x.texto === linhas[0].texto)) {
      const t = linhas[0].texto.replace(/\.$/, '');
      const corte = t.indexOf(', ');
      const rotulo = corte < 0 ? t : t.slice(0, corte);
      const de = DE_FONTE[rotulo];
      if (de) {
        const campos = linhas.map((x, i) => (i ? x.campo.toLocaleLowerCase('pt-BR') : x.campo));
        return [{ campo: null, junto: true, texto: `${lista(campos)} vieram ${de}${corte < 0 ? '' : t.slice(corte)}.` }];
      }
    }
    return linhas;
  }

  // Os vazios do detalhe numa linha só, no pé (R28): "Não divulgado: fim,
  // lineup, produtora." Só da festa real (a fictícia é completa). O fim não
  // se repete em outra frase do horário.
  function vaziosDaFesta(f) {
    if (!f || f.real !== true) return '';
    const p = preco(f);
    const itens = [
      typeof f.inicio !== 'number' || f.horarioIncerto === true ? 'horário' : null,
      typeof f.fim !== 'number' ? 'fim' : null,
      // A média de idade saiu daqui (24/11/2026): nenhuma fonte informa, e a
      // lista já diz isso uma vez, no topo.
      !f.endereco || typeof f.endereco.texto !== 'string' || !f.endereco.texto.trim() ? 'endereço' : null,
      p.tipo === 'sem-preco' ? 'preço' : null,
      !(Array.isArray(f.estilos) && f.estilos.length) ? 'som' : null,
      !(Array.isArray(f.lineup) && f.lineup.length) ? 'lineup' : null,
      !f.produtora ? 'produtora' : null,
      !regras(f).length ? 'regras da porta' : null,
    ].filter(Boolean);
    return itens.length ? `Não divulgado: ${itens.join(', ')}.` : '';
  }

  // A peça de divulgação (R30): o cartaz do /3 (objeto) ou o da fictícia
  // (caminho). Retrato preenche; paisagem cabe inteira.
  const PAPEL = {
    flyer: 'Flyer', 'cartaz-enviado': 'Cartaz', 'cartaz-indicado': 'Cartaz', 'pagina-ingresso': 'Pôster', post: 'Post',
  };
  const CAMINHO_IMAGEM = /^\/(imagens\/[a-f0-9]{16}-(480|1080)\.webp|cartazes\/[a-z0-9-]+\.(webp|jpg|png))$/;
  function cartazDe(f) {
    const c = f && f.cartaz;
    if (typeof c === 'string' && CAMINHO_IMAGEM.test(c)) {
      return { arquivo: c, miniatura: c, paisagem: false, papel: 'Cartaz', credito: null, divulgacao: null, origem: null, origemRotulo: null };
    }
    if (!c || typeof c !== 'object' || typeof c.arquivo !== 'string' || !CAMINHO_IMAGEM.test(c.arquivo)) return null;
    const mini = typeof c.miniatura === 'string' && CAMINHO_IMAGEM.test(c.miniatura) ? c.miniatura : c.arquivo;
    const credito = typeof c.credito === 'string' && c.credito.trim() ? c.credito.trim() : null;
    // "Divulgação · @perfil" -> "@perfil"
    const divulgacao = credito ? credito.replace(/^divulga[çc][ãa]o\s*[·:-]\s*/i, '').trim() || credito : null;
    const u = urlSegura(c.origem);
    const serv = u ? servico(u.href) : null;
    return {
      arquivo: c.arquivo, miniatura: mini,
      paisagem: Number.isInteger(c.largura) && Number.isInteger(c.altura) && c.largura > c.altura,
      papel: PAPEL[c.papel] || 'Flyer', credito, divulgacao,
      origem: u ? u.href : null,
      origemRotulo: !serv ? null : serv === 'Instagram' ? 'ver no Instagram' : serv === 'Site da produtora' ? 'ver na página' : `ver na ${serv}`,
    };
  }
  // "Flyer · divulgação @perfil" e o alt "Flyer de X, divulgação de @perfil".
  const creditoDaPeca = (c) => (c && c.divulgacao ? `${c.papel} · divulgação ${c.divulgacao}` : c ? c.papel : '');
  const altDaPeca = (c, nome) => (c ? `${c.papel} de ${nome}${c.divulgacao ? `, divulgação de ${c.divulgacao}` : ''}` : '');

  // Filtros em facetas (o "ver todas"): dentro da zona vale qualquer chip
  // marcado, entre zonas valem todos. Cada chip diz quantas festas ficariam
  // com ele, contando as outras zonas como estão; o que daria zero some, para
  // nenhum clique deixar a lista vazia (como os filtros do Splice). Marcado
  // nunca some, nem com 0: é por ele que a pessoa volta atrás.
  function passaNosFiltros(zonas, marcados, o, exceto = null) {
    return zonas.every((z) => {
      if (z === exceto) return true;
      const sel = z.chips.filter((c) => marcados.has(c.id));
      return !sel.length || sel.some((c) => c.cabe(o));
    });
  }
  function facetas(zonas, itens, marcados) {
    return zonas.map((z) => {
      const chips = z.chips.map((c) => {
        const n = itens.filter((o) => passaNosFiltros(zonas, marcados, o, z) && c.cabe(o)).length;
        return { id: c.id, n, marcado: marcados.has(c.id), visivel: marcados.has(c.id) || n > 0 };
      });
      return { nome: z.nome, chips, visivel: chips.some((c) => c.visivel) };
    });
  }
  // Desmarcar um chip numa zona de "qualquer um" estreita a lista, e ela pode
  // zerar: funk ou eletrônica + Pinheiros, e a de Pinheiros era a de funk.
  // Só então sai um filtro marcado sem festa, um por vez, primeiro das outras
  // zonas (`tocada` é a zona do clique), até a lista voltar a ter festa.
  // Com festa na lista nada sai: o marcado sem festa fica à vista, com 0.
  // Devolve os ids que saíram de `marcados`.
  function podarFiltros(zonas, itens, marcados, tocada = null) {
    const sairam = [];
    while (!itens.some((o) => passaNosFiltros(zonas, marcados, o))) {
      const f = facetas(zonas, itens, marcados);
      const zerados = (fora) => f.filter((z) => (z.nome === tocada) !== fora).flatMap((z) => z.chips).filter((c) => c.marcado && c.n === 0);
      const c = zerados(true)[0] || zerados(false)[0] || f.flatMap((z) => z.chips).find((x) => x.marcado);
      if (!c) return sairam;
      marcados.delete(c.id);
      sairam.push(c.id);
    }
    return sairam;
  }

  // A mensagem "como foi?" do convite de festa que passou (R34).
  function mensagemComoFoi({ festa: f, link }) {
    return [`Como foi a ${f && f.nome ? f.nome : 'festa'}? Responde em 10 segundos: o público era da nossa idade?`, link];
  }

  return {
    partesDoPorque, porqueDoCartao, baseViva, precoVelho, rotuloDaCompra, encontradaEm, fontesDaFesta, fraseDaJuncao, divergencias,
    fraseDaAvaliacao, deOndeVem, vaziosDaFesta, cartazDe, creditoDaPeca, altDaPeca, mensagemComoFoi, EM_BAIRRO, semQuebraNoPreco,
    preco, precoNaLista, centavos, condicoesDoLote, CONDICOES, DE_PESSOA, ha, media, som, regras, regrasFrase, fontes, paginas, origemDoPreco, servico, usuario, destino, links, mapa, ESTILOS,
    idDeFesta, casaComBairro, mensagem, CARA_ORDEM, ordemDaCara, pesoDaCara, semDadoDaCara, dataDoCartao, pctNosCartoes, mediaFalada, linhaSemMedia, cartaoFalado,
    horarioSemQuebra, ondeSemQuebra, semViuva, horaCurta, passaNosFiltros, facetas, podarFiltros,
  };
});

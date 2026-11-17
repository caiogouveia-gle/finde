'use strict';
// Servidor do Finde v1: a landing (/), o app (/app), estáticos de publico/,
// a API e as páginas de convite.
// Node puro, sem dependências. `node servidor.js` sobe tudo.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const C = require('./nucleo/catalogo');
const motor = require('./nucleo/motor');
const conversa = require('./nucleo/conversa');
const { entender } = require('./nucleo/entender');
const { prepararBase, lerBase, deslocarDatas } = require('./nucleo/base');
const { criarPlanos, ErroPlano } = require('./nucleo/planos');
const FT = require('./publico/festa-texto');

const RAIZ = __dirname;
const PUBLICO = path.join(RAIZ, 'publico');
const LIMITE_CORPO = 16 * 1024;
const LIMITE_TEXTO = 300;
const FORMATO_ID_FESTA = /^[a-z0-9-]{1,60}$/;

const TIPOS_ARQUIVO = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Tudo vem daqui: scripts, estilos e fontes (servidas de publico/fontes).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

// same-origin: o endereço de origem só vai para o próprio servidor (o app
// sabe se veio da landing); para fora, nada.
const CABECALHOS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ---------------------------------------------------------------- base

// Base fictícia: a cada meia hora os carimbos andam com o relógio (KTD8).
const RELER_FICTICIA_MS = 30 * 60 * 1000;

// Lê a base e relê quando o arquivo muda. Linhas inválidas saem com aviso no log.
// Numa base marcada como fictícia, os carimbos de "conferido" andam com o
// relógio, para "conferido há 2 h" continuar verdade no dia da apresentação.
function criarFonteDaBase(caminho, log, relogio) {
  let atual = { base: [], marca: null, lidaEm: 0, ficticia: false };

  function carregar() {
    let marca;
    try {
      marca = fs.statSync(caminho).mtimeMs;
    } catch {
      marca = 'sem-arquivo';
    }
    const agora = relogio();
    if (marca === atual.marca && !(atual.ficticia && agora - atual.lidaEm >= RELER_FICTICIA_MS)) return atual.base;
    let lida = { linhas: [], ficticia: false, referencia: null };
    try {
      lida = lerBase(JSON.parse(fs.readFileSync(caminho, 'utf8')));
    } catch (e) {
      const motivo = e.code === 'ENOENT' ? 'não existe' : `não abriu (${e.message})`;
      log.warn(`[finde] a base ${caminho} ${motivo}; sigo com a base vazia`);
    }
    const linhas = lida.referencia ? deslocarDatas(lida.linhas, agora - Date.parse(lida.referencia)) : lida.linhas;
    const { base, avisos } = prepararBase(linhas);
    const releitura = marca === atual.marca;
    if (!releitura) {
      for (const a of avisos) log.warn(`[finde] ${a}`);
      log.info(`[finde] base: ${base.length} festas de ${caminho}`);
    }
    atual = { base, marca, lidaEm: agora, ficticia: lida.ficticia };
    return base;
  }

  return { base: carregar };
}

// ---------------------------------------------------------------- respostas

// Texto (HTML, CSS, JS, JSON, SVG) sai comprimido em gzip para quem aceita:
// numa rede lenta, a primeira pintura espera o HTML e o CSS inteiros.
const COMPRIMIVEL = /^(text\/|application\/json|image\/svg\+xml)/;
const MINIMO_PARA_COMPRIMIR = 1024;

function aceitaGzip(req) {
  const aceita = String((req && req.headers['accept-encoding']) || '');
  return /\bgzip\b(?!\s*;\s*q=0(?:\.0+)?\b)/i.test(aceita);
}

// Manda um corpo pronto (Buffer), comprimido quando vale a pena.
function enviarCorpo(req, res, status, cabecalhos, corpo, comprimido) {
  const tipo = cabecalhos['Content-Type'] || '';
  let saida = corpo;
  const extra = {};
  if (corpo.length >= MINIMO_PARA_COMPRIMIR && COMPRIMIVEL.test(tipo)) {
    extra.Vary = 'Accept-Encoding';
    if (aceitaGzip(req)) {
      saida = comprimido ? comprimido() : zlib.gzipSync(corpo);
      extra['Content-Encoding'] = 'gzip';
    }
  }
  res.writeHead(status, { ...CABECALHOS, ...cabecalhos, ...extra, 'Content-Length': saida.length });
  res.end(req && req.method === 'HEAD' ? undefined : saida);
}

function json(res, status, corpo) {
  enviarCorpo(res.req, res, status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, Buffer.from(JSON.stringify(corpo), 'utf8'));
}

const erro = (res, status, mensagem, dados = {}) => json(res, status, { erro: mensagem, ...dados });

// Para texto que entra em atributo ou corpo de HTML gerado no servidor.
function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Origem para os endereços absolutos das imagens de compartilhamento.
function origem(req) {
  const host = String(req.headers.host || '');
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `http://${host}` : '';
}

// Páginas HTML com as metas de compartilhamento preenchidas.
function enviarPagina(req, res, arquivo, { status = 200, titulo, descricao, dados, trocas } = {}) {
  fs.readFile(arquivo, 'utf8', (e, html) => {
    if (e) return erro(res, 404, 'Não achei essa página.');
    let pagina = html.replaceAll('__ORIGEM__', escapar(origem(req)));
    // Trechos de HTML montados (e escapados) aqui no servidor, como a landing.
    for (const [marca, trecho] of Object.entries(trocas || {})) pagina = pagina.replace(marca, () => trecho);
    // JSON dentro de <script type="application/json">: "<" escapado, nada executa.
    pagina = pagina.replace('__DADOS__', () => (dados ? JSON.stringify(dados).replace(/</g, '\\u003c') : 'null'));
    if (titulo) {
      pagina = pagina
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapar(titulo)}$2`)
        .replace(/<title>[^<]*<\/title>/, `<title>${escapar(titulo)}</title>`);
    }
    if (descricao) pagina = pagina.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapar(descricao)}$2`);
    enviarCorpo(req, res, status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    }, Buffer.from(pagina, 'utf8'));
  });
}

// Estáticos de texto comprimidos uma vez só, enquanto o arquivo não muda.
const comprimidos = new Map();

function enviarArquivo(req, res, caminho) {
  fs.stat(caminho, (e, st) => {
    if (e || !st.isFile()) return erro(res, 404, 'Não achei essa página.');
    const tipo = TIPOS_ARQUIVO[path.extname(caminho).toLowerCase()];
    if (!tipo) return erro(res, 404, 'Não achei essa página.');
    const cabecalhos = {
      'Content-Type': tipo,
      // Fontes não mudam: guardam por um ano. O resto revalida.
      'Cache-Control': tipo === 'font/woff2' ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (COMPRIMIVEL.test(tipo)) {
      return fs.readFile(caminho, (e2, corpo) => {
        if (e2) return erro(res, 404, 'Não achei essa página.');
        const marca = `${st.mtimeMs}:${st.size}`;
        enviarCorpo(req, res, 200, cabecalhos, corpo, () => {
          const guardado = comprimidos.get(caminho);
          if (guardado && guardado.marca === marca) return guardado.gz;
          const gz = zlib.gzipSync(corpo);
          comprimidos.set(caminho, { marca, gz });
          return gz;
        });
      });
    }
    res.writeHead(200, { ...CABECALHOS, ...cabecalhos, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(caminho).pipe(res);
  });
}

// Só serve o que está dentro de publico/, depois de decodificar e normalizar.
function estatico(req, res, pathname) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(pathname);
  } catch {
    return erro(res, 400, 'Endereço malformado.');
  }
  if (decodificado.includes('\0') || decodificado.includes('\\')) return erro(res, 400, 'Endereço malformado.');
  const alvo = path.resolve(PUBLICO, '.' + path.posix.normalize('/' + decodificado));
  if (!alvo.startsWith(PUBLICO + path.sep)) return erro(res, 404, 'Não achei essa página.');
  enviarArquivo(req, res, alvo);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    let grande = Number(req.headers['content-length'] || 0) > LIMITE_CORPO;
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > LIMITE_CORPO) grande = true;
      if (tamanho > 1024 * 1024) req.destroy();
      if (!grande) partes.push(parte);
    });
    req.on('end', () => {
      if (grande) return reject(new ErroPlano(413, 'O pedido veio grande demais.'));
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto.trim()) return resolve({});
      try {
        const corpo = JSON.parse(texto);
        if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error();
        resolve(corpo);
      } catch {
        reject(new ErroPlano(400, 'Não entendi o pedido: o corpo precisa ser um objeto JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------- API

function exigirCriterios(bruto) {
  const c = motor.sanearCriterios(bruto);
  const faltam = motor.falta(c);
  if (faltam.length) throw new ErroPlano(400, 'Faltou responder umas perguntas. Vamos do começo?', { faltam });
  return motor.completar(c);
}

function idsNaTela(bruto) {
  if (bruto === undefined) return [];
  if (!Array.isArray(bruto) || bruto.length > 3 || !bruto.every((x) => typeof x === 'string' && FORMATO_ID_FESTA.test(x))) {
    throw new ErroPlano(400, 'A lista de festas na tela veio estranha.');
  }
  return bruto;
}

// A data da festa: o próximo dia da semana dela que ainda não acabou.
// Devolve { data: 'AAAA-MM-DD', ate: ISO do fim da festa }.
function dataDaFesta(f, agora) {
  const alvo = { sex: 5, sab: 6, dom: 0 }[f.dia];
  for (let i = 0; i < 8; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    if (d.getDay() !== alvo) continue;
    const fim = new Date(d.getTime() + f.fim * 3600 * 1000);
    if (fim > agora) {
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { data: dia, ate: fim.toISOString() };
    }
  }
  return null;
}

// A próxima pista que abre, pelo relógio: no fim de semana, a próxima do dia
// (ou do dia seguinte); de segunda a quinta, a primeira da sexta.
function proximaPista(base, agora = new Date()) {
  const ordemDia = { 5: 'sex', 6: 'sab', 0: 'dom' };
  const hoje = ordemDia[agora.getDay()];
  const hora = agora.getHours() + agora.getMinutes() / 60;
  const editoriais = base.filter((f) => f.selo === 'editorial');
  const primeira = (dia, depois = -1) => editoriais
    .filter((f) => f.dia === dia && f.inicio > depois)
    .sort((a, b) => a.inicio - b.inicio || a.id.localeCompare(b.id))[0];
  let f;
  if (hoje) {
    f = primeira(hoje, hora);
    const resto = C.ORDEM_DIAS.slice(C.ORDEM_DIAS.indexOf(hoje) + 1);
    for (const d of resto) f = f || primeira(d);
  }
  f = f || primeira('sex');
  return f ? { linha: C.linhaDaFesta(f), nome: f.nome, origem: f.origemIdade } : null;
}

function formulario(base) {
  const porDia = Object.fromEntries(C.ORDEM_DIAS.map((d) => [d, base.filter((f) => f.dia === d).length]));
  const inicios = base.map((f) => f.inicio);
  return {
    total: base.length,
    porDia,
    abreMaisCedo: inicios.length ? C.hora(Math.min(...inicios)) : null,
    proxima: proximaPista(base),
    ficticia: true,
    dias: C.ORDEM_DIAS.map((id) => ({ id, rotulo: C.DIAS[id].nome })),
    janelas: C.JANELAS.map((j) => ({ id: j.id, rotulo: `${j.rotulo} · ${j.nome}` })),
    faixas: C.FAIXAS.map((f) => ({ id: f.id, rotulo: f.rotulo })),
    // A faixa em que a pessoa se sente bem (R20): de 18 a 50, padrão 28 a 35.
    idade: { min: motor.IDADE_MIN, max: motor.IDADE_MAX, padrao: { min: 28, max: 35 } },
    // Os bairros por zona (R19), na ordem das regiões do catálogo.
    zonas: Object.entries(C.REGIOES).map(([id, nome]) => ({
      id, nome, bairros: Object.entries(C.BAIRROS).filter(([, b]) => b.regiao === id).map(([bid, b]) => ({ id: bid, rotulo: b.nome })),
    })),
    tetos: C.TETOS.map((t) => ({ id: t.id, rotulo: t.rotulo })),
    estilos: C.ESTILOS.map((e) => ({ id: e.id, rotulo: e.rotulo })),
  };
}

// ---------------------------------------------------------------- landing

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const POR_DIA_NA_LANDING = 3;
const FESTA_DO_CONVITE = 'sexta-sem-pressa';

const ordemDaLista = (a, b) => C.ORDEM_DIAS.indexOf(a.dia) - C.ORDEM_DIAS.indexOf(b.dia)
  || a.inicio - b.inicio || a.id.localeCompare(b.id);

// A lista da semana na landing: festas editoriais com média de 28 a 35 que
// começam até as 20h, as três que abrem mais cedo em cada dia, em ordem de
// dia e hora. "Todas" é a soma dos três dias: o filtro de um dia nunca mostra
// festa que "Todas" escondeu. Patrocinada não entra: na landing não há como
// dizer que é.
function selecaoDaLanding(base) {
  const cabe = base.filter((f) => f.selo !== 'patrocinado' && f.mediaIdade >= 28 && f.mediaIdade <= 35 && f.inicio <= 20);
  const porDia = Object.fromEntries(C.ORDEM_DIAS.map((d) => [d, cabe.filter((f) => f.dia === d).sort(ordemDaLista).slice(0, POR_DIA_NA_LANDING)]));
  return { porDia, todas: C.ORDEM_DIAS.flatMap((d) => porDia[d]) };
}

// "sex, 20 nov" (a página põe em caixa alta) a partir da data da festa.
function rotuloDaData(f, agora, { mes = true } = {}) {
  const q = dataDaFesta(f, agora);
  const curto = C.DIAS[f.dia].curto.toLowerCase();
  if (!q) return curto;
  const [, m, d] = q.data.split('-').map(Number);
  return mes ? `${curto}, ${d} ${MESES[m - 1]}` : `${curto} ${d}`;
}

// O convite do herói, montado com uma festa fictícia da base. O cartão
// inteiro é um link para o detalhe dessa festa no app: "Tô dentro" e "Não
// rola" desenham o convite de verdade, e o toque em qualquer ponto abre a
// festa em vez de não fazer nada.
function htmlDoConvite(f, agora) {
  if (!f) return '';
  const dia = C.DIAS[f.dia];
  // Quebra só antes de um "·", e a hora nunca desce sozinha na linha de baixo.
  const onde = escapar(FT.ondeSemQuebra([f.casa, FT.precoNaLista(f), f.produtora]));
  const rotulo = `Ver a festa do exemplo, ${f.nome}: ${dia.nome.toLowerCase()}, ${C.horaCheia(f.inicio)}, média de ${f.mediaIdade} anos, ${f.origemIdade}`;
  return `<figure class="convite" aria-labelledby="convite-legenda">
    <figcaption id="convite-legenda" class="vh">Exemplo de convite do finde, com uma festa fictícia</figcaption>
    <a class="cv-cartao" href="/app?festa=${encodeURIComponent(f.id)}" aria-label="${escapar(rotulo)}">
    <div class="cv cv-topo">
      <span class="cv-marca" aria-hidden="true">finde<span class="ponto">.</span></span>
      <span class="cv-rotulo">Convite · ${escapar(rotuloDaData(f, agora))}</span>
      <span class="cv-titulo">Bora ${dia.id === 'sex' ? 'na' : 'no'} <i>${escapar(dia.frase)}?</i></span>
    </div>
    <div class="cv cv-media">
      <span class="cv-hora-linha"><span class="cv-hora">${escapar(C.horaCheia(f.inicio))}</span><span class="cv-rotulo">Média ${escapar(f.mediaIdade)} anos</span></span>
      <span class="cv-origem">${escapar(f.origemIdade)}</span>
    </div>
    <div class="cv cv-festa">
      <span class="cv-nome">${escapar(f.nome)}</span>
      <span class="cv-onde">${onde}</span>
      <span class="cv-horario">${escapar(FT.horarioSemQuebra(C.fraseDoHorario(f)))}</span>
    </div>
    <div class="cv cv-botoes" aria-hidden="true">
      <span class="cv-botao">Tô dentro</span>
      <span class="cv-botao cv-botao--vazado">Não rola</span>
    </div>
    </a>
    <p class="nota nota-1"><span class="nota-fio" aria-hidden="true"></span><span>Idade média do público, ${escapar(f.origemIdade)}</span></p>
    <p class="nota nota-2"><span class="nota-fio" aria-hidden="true"></span><span>A hora que começa, enche e acaba</span></p>
    <p class="nota nota-3"><span class="nota-fio" aria-hidden="true"></span><span>Seu grupo responde no próprio convite</span></p>
  </figure>`;
}

// As linhas da lista, todas visíveis em "Todas"; o filtro de dia esconde as
// outras. O preço vai num bloco que não quebra e leva o "·" no começo: numa
// tela estreita a linha quebra antes do ponto, nunca deixa o ponto solto.
function htmlDaLista(selecao, agora) {
  return selecao.todas.map((f) => {
    const preco = FT.precoNaLista(f);
    const rotulo = `${C.DIAS[f.dia].nome}, ${C.hora(f.inicio)}: ${f.nome}, ${f.casa}, ${preco}. Média de ${f.mediaIdade} anos, ${f.origemIdade}.`;
    return `<li data-dia="${f.dia}">
      <a class="linha" href="/app?festa=${encodeURIComponent(f.id)}" aria-label="${escapar(rotulo)}">
        <span class="linha-quando"><span class="linha-hora">${escapar(C.hora(f.inicio))}</span><span class="linha-dia">${escapar(rotuloDaData(f, agora, { mes: false }))}</span></span>
        <span class="linha-meio"><span class="linha-nome">${escapar(f.nome)}</span><span class="linha-onde">${escapar(f.casa)} <span class="sem-quebra">· ${escapar(preco)}</span></span></span>
        <span class="linha-media"><span class="linha-media-num">${escapar(f.mediaIdade)}</span><span class="linha-media-rot">Média</span><span class="linha-origem">${escapar(f.origemIdadeCurta)}</span></span>
      </a>
    </li>`;
  }).join('\n');
}

function trocasDaLanding(base, agora) {
  const selecao = selecaoDaLanding(base);
  const convite = base.find((f) => f.id === FESTA_DO_CONVITE) || selecao.todas[0];
  return {
    __CONVITE__: htmlDoConvite(convite, agora),
    __LISTA__: htmlDaLista(selecao, agora),
    __VAZIO__: selecao.todas.length ? ' hidden' : '',
  };
}

// O detalhe de uma festa sem pedido (o link da landing): o mesmo formato de
// um item de opcoes, com um pedido neutro tirado da própria festa (o dia
// dela, a janela em que ela cabe, idade de 18 a 50, sem teto). Sem a cara,
// que só existe diante de um pedido de verdade.
function opcaoSemPedido(f, agora) {
  const pedido = (janela) => motor.completar({ dia: f.dia, janela, idade: { min: motor.IDADE_MIN, max: motor.IDADE_MAX }, teto: 'sem-limite' });
  const opcoes = C.JANELAS.map((j) => motor.opcao(f, pedido(j.id)));
  const o = { ...(opcoes.find((x) => x.atende) || opcoes[0]) };
  delete o.cara;
  // Sem pedido, nada fura: a festa de madrugada, que não cabe em janela
  // nenhuma, também sai sem "depois da sua hora".
  const motivos = o.motivos.filter((m) => !o.fora.includes(m));
  return {
    ...o, atende: true, fora: [], aviso: null, motivos, bloco: 'pedido',
    data: (dataDaFesta(f, agora) || {}).data || null,
  };
}

function criarServidor({
  dados = process.env.FINDE_DADOS || path.join(RAIZ, 'dados', 'festas.json'),
  varDir = process.env.FINDE_VAR || path.join(RAIZ, 'var'),
  log = console,
  relogio = () => Date.now(),
} = {}) {
  const fonte = criarFonteDaBase(path.resolve(dados), log, relogio);
  fonte.base();
  const planos = criarPlanos(path.resolve(varDir), { log });

  // Cada opção leva a data da festa: o detalhe abre com ela (R4). Fica aqui
  // para valer nos três caminhos da conversa.
  function resultado(criterios) {
    const base = fonte.base();
    if (!base.length) return { opcoes: [], afrouxou: [], aviso: 'A lista de festas está vazia agora. Volte daqui a pouco.' };
    const r = motor.escolher(criterios, base);
    const agora = new Date(relogio());
    return { ...r, opcoes: r.opcoes.map((o) => ({ ...o, data: (dataDaFesta(o.festa, agora) || {}).data || null })) };
  }

  const rotas = {
    'GET /api/formulario': () => [200, formulario(fonte.base())],

    'POST /api/festas': (corpo) => {
      const criterios = exigirCriterios(corpo.criterios);
      const r = resultado(criterios);
      if (r.oferta) criterios.oferta = r.oferta.frase;
      return [200, {
        criterios, pedido: motor.resumoDoPedido(criterios), pedidoPartes: motor.pedidoEmPartes(criterios),
        ...r, resposta: conversa.abertura(r),
      }];
    },

    'POST /api/conversa': (corpo) => {
      const antes = exigirCriterios(corpo.criterios);
      if (typeof corpo.texto !== 'string' || !corpo.texto.trim()) throw new ErroPlano(400, 'Escreva o que quer mudar.');
      if (corpo.texto.length > LIMITE_TEXTO) throw new ErroPlano(400, 'Frase longa demais. Tente em poucas palavras.');
      const antesIds = idsNaTela(corpo.atuais);
      const base = fonte.base();
      const porId = new Map(base.map((f) => [f.id, f]));
      const naTela = antesIds.map((id) => porId.get(id)).filter(Boolean);
      const contexto = {
        ...antes,
        mostradas: antesIds,
        estilosMostrados: naTela.map((f) => f.estilos[0]),
        precosMostrados: naTela.map((f) => f.preco),
      };

      let { mudar, pedidos, duvida, diaRecusado } = entender(corpo.texto, contexto);
      // "sim" aceita a oferta da resposta anterior.
      if (pedidos.length === 1 && pedidos[0] === 'aceitar' && antes.oferta) {
        ({ mudar, pedidos, duvida, diaRecusado } = entender(antes.oferta, contexto));
      }
      const mudanca = motor.sanearCriterios(mudar);
      // Com o intervalo de idade (R20): "mais velha" e "mais nova" deslocam o
      // intervalo em cinco anos; "de 30 a 40" vira o intervalo dito; uma idade
      // solta ("gente de 40") vira a faixa fixa dela.
      if (antes.idade && (mudanca.faixa || pedidos.some((p) => p === 'mais-velho' || p === 'mais-novo'))) {
        if (pedidos.includes('mais-velho')) mudanca.idade = motor.deslocarIdade(antes.idade, +5);
        else if (pedidos.includes('mais-novo')) mudanca.idade = motor.deslocarIdade(antes.idade, -5);
        else {
          const m = corpo.texto.match(/\b(\d{2})\s*(?:a|até|ate|e|-)\s*(\d{2})\b/);
          const fx = C.FAIXAS.find((x) => x.id === mudanca.faixa);
          mudanca.idade = m ? { min: Number(m[1]), max: Number(m[2]) } : { min: fx.min, max: Math.min(fx.max, motor.IDADE_MAX) };
          Object.assign(mudanca, motor.sanearCriterios({ idade: mudanca.idade }));
        }
        delete mudanca.faixa;
      }
      const depois = motor.completar({ ...antes, ...mudanca });
      delete depois.oferta;
      depois.firmes = conversa.firmesDe(antes, depois);
      let r = resultado(depois);
      const anterior = () => resultado(antes);
      const nomeDe = (id) => (porId.get(id) ? porId.get(id).nome : id);

      // "mais barato" para no preço mais baixo que ainda tem festa.
      let piso = false;
      if (pedidos.includes('mais-barato') && !r.opcoes.length && depois.teto !== antes.teto) {
        const minimo = motor.precoMinimo(depois, base);
        if (minimo !== null && minimo < (antes.teto === 'sem-limite' ? Infinity : antes.teto)) {
          depois.teto = minimo;
          r = resultado(depois);
          piso = true;
        }
      }

      // "outras": se nada novo cabe de verdade no pedido, avisa e mantém a lista.
      if (pedidos.includes('outras')) {
        const novaQueCabe = r.opcoes.some((o) => !antesIds.includes(o.festa.id) && o.atende);
        if (!novaQueCabe) {
          const a = anterior();
          const { oferta: _, ...semOferta } = antes;
          return [200, {
            criterios: semOferta, pedido: motor.resumoDoPedido(antes), pedidoPartes: motor.pedidoEmPartes(antes),
            ...a, aviso: undefined, oferta: undefined, resposta: 'Já mostrei tudo que cabe nesse pedido.', entendeu: true, entraram: [], sairam: [],
          }];
        }
      }

      let impedimento;
      if (pedidos.includes('estilo') && r.casam === 0 && depois.estilos.length) {
        impedimento = motor.impedimentoDoEstilo(depois, base, depois.estilos[depois.estilos.length - 1]);
      }
      const fala = conversa.responder({ pedidos, antes, depois, antesIds, resultado: r, nomeDe, impedimento, duvida, piso, diaRecusado });
      // Não entendeu: a lista e os critérios ficam como estavam.
      const { oferta: _velha, ...antesSemOferta } = antes;
      const criterios = fala.entendeu ? depois : antesSemOferta;
      const final = fala.entendeu ? r : anterior();
      // A oferta vale só para a próxima frase: a do motor, ou a dúvida sobre o dia.
      let oferta = fala.entendeu ? r.oferta : undefined;
      if (duvida && duvida.dia) {
        const nome = C.DIAS[duvida.dia].frase;
        oferta = { frase: nome, rotulo: `Mudar ${duvida.dia === 'sex' ? 'pra' : 'pro'} ${nome}` };
      }
      if (oferta) criterios.oferta = oferta.frase;
      return [200, {
        criterios,
        pedido: motor.resumoDoPedido(criterios),
        pedidoPartes: motor.pedidoEmPartes(criterios),
        ...final,
        aviso: fala.entendeu ? final.aviso : undefined,
        oferta,
        resposta: fala.texto,
        entendeu: fala.entendeu,
        entraram: fala.entraram,
        sairam: fala.sairam,
      }];
    },

    'POST /api/planos': (corpo) => {
      const criterios = exigirCriterios(corpo.criterios);
      if (typeof corpo.festa !== 'string' || !FORMATO_ID_FESTA.test(corpo.festa)) throw new ErroPlano(400, 'Diga qual festa mandar.');
      const festa = fonte.base().find((f) => f.id === corpo.festa);
      if (!festa) throw new ErroPlano(400, 'Essa festa não está mais na lista.');
      const plano = planos.criar({
        festa: motor.opcao(festa, criterios), pedido: motor.resumoDoPedido(criterios), autor: corpo.autor,
        quando: dataDaFesta(festa, new Date(relogio())),
      });
      return [201, { id: plano.id, url: `/p/${plano.id}`, data: plano.data }];
    },
  };

  // /p/:id: 404 de verdade quando o convite não existe; quando existe, as
  // metas de compartilhamento dizem a festa.
  function paginaDoConvite(req, res, id) {
    const arquivo = path.join(PUBLICO, 'plano.html');
    if (!planos.existe(id)) {
      return enviarPagina(req, res, arquivo, { status: 404, titulo: 'Esse convite não existe · finde.' });
    }
    const p = planos.ler(id);
    const o = p.festa;
    const f = o.festa;
    const dia = C.DIAS[f.dia];
    // A prévia do link é a primeira coisa que o grupo vê: a média vai sempre
    // com a origem (curta no título, inteira na descrição).
    const temMedia = Number.isInteger(f.mediaIdade);
    const curta = f.origemIdadeCurta || (o.origem && o.origem.curta);
    const media = temMedia ? ` · média ${f.mediaIdade}${curta ? ` (${curta})` : ''}` : '';
    const titulo = `Bora ${dia.id === 'sex' ? 'na' : 'no'} ${dia.frase}? ${f.nome}, ${o.hora}${media}`;
    const onde = f.endereco && f.endereco.texto ? `${f.casa}, ${f.endereco.texto}` : f.casa;
    const mediaLonga = temMedia ? ` Média de ${f.mediaIdade} anos${f.origemIdade ? `, ${f.origemIdade}` : ''}.` : '';
    const descricao = `${onde} · ${FT.precoNaLista(f)}. ${o.horario}${mediaLonga}`;
    return enviarPagina(req, res, arquivo, { titulo, descricao });
  }

  async function api(req, res, pathname) {
    const chave = `${req.method} ${pathname}`;
    let acao = rotas[chave];
    const m = pathname.match(/^\/api\/planos\/([^/]+)(?:\/(respostas))?$/);
    const umaFesta = pathname.match(/^\/api\/festa\/([^/]+)$/);
    if (!acao && umaFesta) {
      if (req.method !== 'GET') return erro(res, 405, 'Esse caminho não aceita esse método.');
      const id = umaFesta[1];
      const festa = FORMATO_ID_FESTA.test(id) ? fonte.base().find((f) => f.id === id) : null;
      if (!festa) return erro(res, 404, 'Essa festa não está na lista.');
      return json(res, 200, { opcao: opcaoSemPedido(festa, new Date(relogio())) });
    }
    if (!acao && m) {
      const [, id, sub] = m;
      if (!sub && req.method === 'GET') acao = () => [200, planos.ler(id)];
      else if (sub && req.method === 'POST') acao = (c) => [200, planos.responder(id, c.nome, c.resposta, { confirmar: c.confirmar === true })];
      else return erro(res, 405, 'Esse caminho não aceita esse método.');
    }
    if (!acao) {
      const existe = Object.keys(rotas).some((k) => k.endsWith(` ${pathname}`));
      return existe ? erro(res, 405, 'Esse caminho não aceita esse método.') : erro(res, 404, 'Não achei esse caminho.');
    }
    const corpo = req.method === 'POST' ? await lerCorpo(req) : {};
    const [status, resposta] = acao(corpo);
    json(res, status, resposta);
  }

  return http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://finde').pathname;
    } catch {
      return erro(res, 400, 'Endereço malformado.');
    }
    try {
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') return erro(res, 405, 'Esse caminho não aceita esse método.');
      if (pathname === '/' || pathname === '/index.html') {
        // A landing vem montada: o convite e a lista da semana saem daqui.
        return enviarPagina(req, res, path.join(PUBLICO, 'landing.html'), { trocas: trocasDaLanding(fonte.base(), new Date(relogio())) });
      }
      if (pathname === '/app' || pathname === '/app/') {
        // Os dados da primeira tela vão junto com o HTML: uma ida e volta a menos.
        return enviarPagina(req, res, path.join(PUBLICO, 'index.html'), { dados: formulario(fonte.base()) });
      }
      if (pathname === '/landing.html') return erro(res, 404, 'Não achei essa página.');
      const convite = pathname.match(/^\/p\/([^/]+)\/?$/);
      if (convite) return paginaDoConvite(req, res, convite[1]);
      if (pathname === '/plano.html') return erro(res, 404, 'Não achei essa página.');
      return estatico(req, res, pathname);
    } catch (e) {
      if (e instanceof ErroPlano) return erro(res, e.status, e.message, e.dados);
      log.error('[finde] erro inesperado', e);
      if (!res.headersSent) erro(res, 500, 'Algo deu errado aqui do meu lado. Tente de novo.');
    }
  });
}

if (require.main === module) {
  const porta = Number(process.env.FINDE_PORTA || 8763);
  const servidor = criarServidor();
  servidor.listen(porta, () => console.log(`[finde] no ar em http://localhost:${porta}`));
}

module.exports = { criarServidor, proximaPista, dataDaFesta, selecaoDaLanding, opcaoSemPedido };

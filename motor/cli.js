#!/usr/bin/env node
'use strict';
// Comandos do motor. `node cli.js ajuda` lista todos.

const fs = require('node:fs');
const path = require('node:path');
const { preparar } = require('./nucleo/ambiente');
const { executar } = require('./nucleo/coleta');
const { registrosParaEntregar, envelope, hojeSP, dataOk } = require('./nucleo/exportar');
const { criarProdutora } = require('./nucleo/produtoras');
const { resumoDeUso } = require('./nucleo/uso');
const { modeloAtual } = require('./nucleo/classificar');
const { fontesLigadas, descreverFontes, RAIZ } = require('./fontes');
const { indicar } = require('./nucleo/indicar');
const curadoria = require('./nucleo/curadoria');
const { reprocessar, revincular } = require('./nucleo/reprocessar');
const { relatorio, formatar } = require('./nucleo/relatorio');
const { expurgar } = require('./nucleo/expurgar');
const imagens = require('./nucleo/imagens');
const { resolverId } = require('./nucleo/correlacao');

const AJUDA = `Uso: node cli.js <comando>

Coleta e export
  coletar [--fonte <id>] [--com-exemplos] [--poc] [--forcar]
                                            roda uma coleta agora; --poc liga os conectores da prova acadêmica (Apify, Instagram, páginas);
                                            --forcar ignora o intervalo de cada fonte (uma vez por dia)
  coletar --poc --recuperar-instagram       relê, pelo Apify, os posts que já temos (legenda e flyer); só com --poc, paga, dentro dos tetos
  coletar --poc --dias <n>                  amplia a janela de posts do Instagram para n dias (1 a 30); só com --poc, paga, dentro dos tetos
  exportar [arquivo] [--todas] [--sem-exemplos]
                                            grava os registros R14 em JSON (padrão: var/festas-r14.json); por padrão só São Paulo
                                            e sem as ocultas; --todas inclui o resto

Correlação (as festas que as fontes disseram ser a mesma)
  reprocessar --origem <arquivo> --destino <arquivo> [--simular]
                                            refaz festas, vínculos e valores num banco novo, sem rede e sem chamada paga;
                                            a origem só é lida. --simular mostra o que une e o que separa e não grava
  revincular [--simular]                    reaplica a correlação neste banco; --simular mostra antes de aplicar
  vinculos --revisar                        lista os candidatos a fusão que o escore deixou para olho humano
  decidir une|separa <fonte:id> <fonte:id>  decisão manual sobre dois itens; vale sempre
  revisar [--festa <id>]                    o que pede olho humano: plataforma contra modelo, casa que é cidade, sem cidade, candidatos

Curadoria
  corrigir <festa> <campo> '<json>' --motivo "..."
                                            grava o campo com a fonte curadoria (vale mais que todas); o valor é JSON
                                            ('"Terraço Exemplo"', '{"texto":"Rua X, 1"}'); texto solto também serve
  corrigir <festa> <campo> --desfazer       tira a correção
  ocultar <festa> --motivo "..." [--desfazer]
                                            tira a festa da API e do export (ou a devolve)
  imagem ocultar <sha> --motivo "..."       a imagem some do registro e da rota /imagens/
  imagem listar <festa>                     as peças de divulgação guardadas da festa

Relatório e prazo de guarda
  relatorio [--desde AAAA-MM-DD] [--json] [--app <conversor>]
                                            números para o trabalho: festas por fonte, só Instagram, multi-fonte, custo por festa,
                                            antecedência e o funil de corte; --app aceita o caminho do nucleo/reais.js do app
  expurgar [--simular] [--tudo]             D15: apaga legendas, local marcado, imagens e arquivos, avaliações (--tudo: os brutos do Instagram)

Cadastros e consulta
  produtora criar "<nome>"                  cadastra uma produtora e mostra o token UMA vez
  produtora listar | produtora desativar <id>
  indicar <url> [--tipo festa|perfil|agenda|referencia] [--nome "..."]
                                            guarda um link indicado em entrada/ para a leitura manual
  fontes                                    lista as fontes, ligadas e desligadas, com o motivo
  execucoes                                 as últimas execuções
  uso                                       gasto com o modelo e acessos à API

Ambiente: FINDE_BANCO, FINDE_IMAGENS, ANTHROPIC_API_KEY, APIFY_TOKEN, FINDE_MODELO, FINDE_TETO_EXECUCAO_USD,
FINDE_TETO_DIA_USD, FINDE_FONTES, FINDE_POC, FINDE_APP_TOKEN (ver README).`;

// As opções que levam um valor: o que vem depois delas não é argumento solto.
const COM_VALOR = ['--fonte', '--origem', '--destino', '--desde', '--app', '--motivo', '--dias', '--tipo', '--nome', '--festa'];

// O valor de `corrigir`: JSON quando for JSON, senão o texto como veio.
function lerValor(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

// O módulo do conversor do app: o arquivo nucleo/reais.js, ou a pasta do app.
function carregarConversor(caminho) {
  let alvo = path.resolve(caminho);
  if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'nucleo', 'reais.js');
  if (!fs.existsSync(alvo)) throw new Error(`conversor não encontrado: ${alvo}`);
  const m = require(alvo);
  if (typeof m.converterExport !== 'function') throw new Error(`${alvo} não exporta converterExport`);
  return m;
}

const curto = (x, n = 220) => {
  const t = typeof x === 'string' ? x : JSON.stringify(x);
  return t && t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function main(args, { env = process.env, log = console } = {}) {
  const info = (...a) => log.info(...a);
  const erro = (...a) => log.error(...a);
  const [cmd, ...resto] = args;
  const flag = (f) => resto.includes(f);
  const valor = (f) => {
    const i = resto.indexOf(f);
    return i >= 0 ? resto[i + 1] : null;
  };
  const posicionais = () => resto.filter((a, i) => !a.startsWith('--') && !COM_VALOR.includes(resto[i - 1]));
  const agora = () => new Date();
  if (!cmd || cmd === 'ajuda' || cmd === '--help') {
    info(AJUDA);
    return 0;
  }
  if (cmd === 'indicar') {
    const link = posicionais()[0];
    if (!link) {
      erro('uso: node cli.js indicar <url> [--tipo festa|perfil|agenda|referencia] [--nome "..."]');
      return 1;
    }
    const r = indicar(RAIZ, link, { tipo: valor('--tipo'), nome: valor('--nome') });
    if (!r.novo) info(`já estava: ${r.arquivo}`);
    else if (r.tipo === 'festa') info(`esqueleto criado: ${r.arquivo}\nabra a página, preencha os campos e as leituras (url, lidoEm, campos) e rode \`node cli.js coletar --fonte indicacao\``);
    else info(`${r.tipo} anotado em ${r.arquivo}`);
    return 0;
  }

  // O reprocessar abre a origem só para leitura e sem migrar: nunca passa pelo
  // `preparar`, que abriria e migraria o banco de FINDE_BANCO.
  if (cmd === 'reprocessar') {
    const origem = valor('--origem');
    const destino = valor('--destino');
    const simular = flag('--simular');
    if (!origem || (!destino && !simular)) {
      erro('uso: node cli.js reprocessar --origem <arquivo> --destino <arquivo> [--simular]');
      return 1;
    }
    if (!fs.existsSync(origem)) {
      erro(`a origem não existe: ${origem}`);
      return 1;
    }
    if (destino && path.resolve(destino) === path.resolve(origem)) {
      erro('a origem e o destino são o mesmo arquivo: o reprocessar nunca escreve na origem');
      return 1;
    }
    if (destino && !simular && fs.existsSync(destino)) {
      erro(`o destino já existe (${destino}); escolha um arquivo novo`);
      return 1;
    }
    const r = await reprocessar({ origem, destino, simular, agora, log });
    // As contagens vêm em r.origem e r.destino (objetos): antes → depois.
    const conta = (x, k) => (x && typeof x === 'object' && x[k] !== undefined ? x[k] : '?');
    info(`${simular ? 'simulação' : 'reprocessado'}: ${conta(r.origem, 'festas')} → ${conta(r.destino, 'festas')} festas, ${conta(r.origem, 'vinculos')} → ${conta(r.destino, 'vinculos')} vínculos${r.integridade ? ` (integridade ${r.integridade})` : ''} · unem ${(r.une || []).length}, separam ${(r.separa || []).length}${r.revisar ? `, ${r.revisar} para revisar` : ''}`);
    for (const x of (r.une || []).slice(0, 30)) info(`  une    ${curto(x)}`);
    for (const x of (r.separa || []).slice(0, 30)) info(`  separa ${curto(x)}`);
    if (r.motivo) info(`  ${r.motivo}`);
    if (!r.feito && !r.simulado) return 1;
    if (r.feito) info(`destino: ${destino}`);
    return 0;
  }

  const { amb, db, config, claude } = preparar(env, log);

  if (cmd === 'coletar') {
    const poc = flag('--poc');
    const recuperar = flag('--recuperar-instagram');
    const dias = valor('--dias');
    if ((recuperar || dias !== null) && !poc) {
      erro('--recuperar-instagram e --dias gastam o Apify: só rodam com --poc');
      return 1;
    }
    if (dias !== null && !(/^\d{1,2}$/.test(dias) && +dias >= 1 && +dias <= 30)) {
      erro('--dias é um número de 1 a 30');
      return 1;
    }
    let so = valor('--fonte');
    if (recuperar) {
      if (so && so !== 'instagram') {
        erro('--recuperar-instagram só vale para a fonte instagram');
        return 1;
      }
      so = 'instagram';
    }
    const { fontes, config: cfg } = fontesLigadas(config, { so, exemplos: flag('--com-exemplos') || amb.comExemplos, poc });
    if (!fontes.length && so) {
      erro(`a fonte ${so} está desligada; se for da prova acadêmica, rode com --poc`);
      return 1;
    }
    if (!fontes.length) {
      erro('nenhuma fonte ligada para rodar');
      return 1;
    }
    if (cfg.instagram && (recuperar || dias !== null)) {
      if (dias !== null) cfg.instagram.diasExtra = Number(dias); // janela maior, a lista inteira, sem a rotação (U13)
      if (recuperar) cfg.instagram.recuperar = true;
      const maxItens = cfg.instagram.maxItens || 300;
      const usd = (maxItens * (cfg.instagram.precoPorMil || 2.7)) / 1000;
      info(`[motor] Instagram${recuperar ? ' (recuperação dos posts que já temos)' : ''}${dias !== null ? `, janela de ${dias} dias` : ''}: até ${maxItens} itens, perto de US$ ${usd.toFixed(2)}; os tetos de gasto continuam valendo`);
    }
    info(`[motor] coleta: ${fontes.map((f) => f.id).join(', ')} · classificação ${claude ? `pelo Claude (${modeloAtual()})` : 'por regras (sem ANTHROPIC_API_KEY)'} · Apify ${env.APIFY_TOKEN ? 'com token' : 'sem APIFY_TOKEN'}`);
    const r = await executar({ db, fontes, claude, config: cfg, gatilho: 'comando', forcar: flag('--forcar') || recuperar, dirImagens: amb.imagens, log });
    if (r.recusada) return 2;
    for (const [id, f] of Object.entries(r.fontes)) {
      info(`  ${id}: ${f.itens} itens, ${f.gravados} gravados, ${f.novas} festas novas, ${f.descartados} descartados${f.erro ? `, erro: ${f.erro}` : ''}`);
    }
    const c = r.classificacao;
    info(`  classificação: ${c.claude} pelo Claude, ${c.cache} do cache, ${c.regras} por regras, ${c.invalidas} respostas inválidas, ${c.erros} erros · US$ ${c.gastoUsd}${c.parado ? ` · modelo parado: ${c.parado}` : ''}`);
    if (r.leitura) info(`  leitura de flyer e página: ${r.leitura.lidos} pelo Claude, ${r.leitura.cache} do cache, ${r.leitura.semModelo} sem leitura, ${r.leitura.invalidos} inválidas, ${r.leitura.erros} erros`);
    if (r.apifyUsd !== undefined) info(`  Apify: ≈ US$ ${r.apifyUsd}`);
    if (r.fila) info(`  links de ingresso achados: ${r.fila.length}`);
    if (r.imagens) info(`  imagens: ${r.imagens.guardadas ?? 0} guardadas, ${r.imagens.recusadas ?? 0} recusadas`);
    if (r.imagensPendentes) info(`  imagens: ${r.imagensPendentes} esperando (config.imagens.ligada está desligada)`);
    if (r.correlacao) info(`  correlação: ${r.correlacao.unidas} unidas, ${r.correlacao.candidatos} candidatas, ${r.correlacao.separadas} separadas`);
    if (r.avisos.length) {
      info(`  avisos (${r.avisos.length}):`);
      for (const a of r.avisos.slice(0, 30)) info(`   - ${a}`);
    }
    info(`  execução ${r.execucaoId}: ${r.festasTocadas} festas tocadas, ${r.festasNovas} novas`);
    return 0;
  }

  if (cmd === 'exportar') {
    const destino = posicionais()[0] || path.join(path.dirname(amb.banco), 'festas-r14.json');
    const festas = registrosParaEntregar(db, { de: hojeSP(agora()), todas: flag('--todas'), semExemplos: flag('--sem-exemplos') });
    const corpo = envelope(db, festas, agora);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(`${destino}.tmp`, `${JSON.stringify(corpo, null, 2)}\n`);
    fs.renameSync(`${destino}.tmp`, destino);
    info(`${festas.length} festas em ${destino}${flag('--todas') ? '' : ' (só São Paulo, sem ocultas)'}`);
    return 0;
  }

  if (cmd === 'revincular') {
    const r = revincular(db, { simular: flag('--simular'), agora, log });
    info(`${r.simulado ? 'simulação' : 'revinculado'}: unem ${(r.une || []).length}, separam ${(r.separa || []).length}${r.aplicado ? ' (aplicado)' : ''}`);
    for (const x of (r.une || []).slice(0, 40)) info(`  une    ${curto(x)}`);
    for (const x of (r.separa || []).slice(0, 40)) info(`  separa ${curto(x)}`);
    return 0;
  }

  if (cmd === 'vinculos') {
    if (!flag('--revisar')) {
      erro('uso: node cli.js vinculos --revisar');
      return 1;
    }
    const c = db.prepare('SELECT fonte, id_externo, festa_id, escore, motivo FROM candidatos ORDER BY escore DESC, festa_id').all();
    info(`${c.length} candidato(s) a fusão; ${db.prepare('SELECT COUNT(*) AS n FROM vinculos_decisoes').get().n} decisão(ões) manual(is) já gravada(s)`);
    for (const x of c) {
      info(`  ${x.escore}  ${x.fonte}:${x.id_externo}  ↔  ${resolverId(db, x.festa_id)}`);
      if (x.motivo) info(`        ${curto(x.motivo, 300)}`);
    }
    if (c.length) info('Para decidir: node cli.js decidir une|separa <fonte:id> <fonte:id>');
    return 0;
  }

  if (cmd === 'decidir') {
    const [decisao, a, b] = posicionais();
    if (!['une', 'separa'].includes(decisao) || !a || !b) {
      erro('uso: node cli.js decidir une|separa <fonte:id> <fonte:id>');
      return 1;
    }
    try {
      const r = curadoria.decidir(db, { a: curadoria.parseItem(a), b: curadoria.parseItem(b), decisao, quem: 'cli', agora });
      info(`decisão gravada: ${r.decisao} ${r.a.join(':')} ${r.b.join(':')}`);
      info('Ela vale na próxima coleta; para aplicar agora: node cli.js revincular --simular (e sem --simular)');
      return 0;
    } catch (e) {
      erro(e.message);
      return 1;
    }
  }

  if (cmd === 'corrigir') {
    const [festa, campo, texto] = posicionais();
    if (!festa || !campo || (texto === undefined && !flag('--desfazer'))) {
      erro('uso: node cli.js corrigir <festa> <campo> \'<json>\' --motivo "..."  (ou --desfazer, sem o valor)');
      return 1;
    }
    try {
      if (flag('--desfazer')) {
        const r = curadoria.desfazer(db, { festaId: festa, campo, agora });
        info(`${r.desfeitas} correção(ões) de ${campo} desfeita(s) em ${r.festaId}`);
        return 0;
      }
      const r = curadoria.corrigir(db, { festaId: festa, campo, valor: lerValor(texto), motivo: valor('--motivo'), agora });
      info(`${campo} de ${r.festaId} corrigido pela curadoria (#${r.id})`);
      return 0;
    } catch (e) {
      erro(e.message);
      return 1;
    }
  }

  if (cmd === 'ocultar') {
    const [festa] = posicionais();
    if (!festa) {
      erro('uso: node cli.js ocultar <festa> --motivo "..." [--desfazer]');
      return 1;
    }
    try {
      if (flag('--desfazer')) {
        const r = curadoria.desfazer(db, { festaId: festa, campo: 'oculta', agora });
        info(`${r.festaId}: ${r.desfeitas ? 'volta a aparecer' : 'não estava oculta'}`);
        return 0;
      }
      const r = curadoria.ocultar(db, { festaId: festa, motivo: valor('--motivo'), agora });
      info(`${r.festaId} oculta (#${r.id}); some da API e do export`);
      return 0;
    } catch (e) {
      erro(e.message);
      return 1;
    }
  }

  if (cmd === 'revisar') {
    const itens = curadoria.listarRevisao(db, { festaId: valor('--festa') });
    info(`${itens.length} item(ns) para olho humano`);
    for (const x of itens) info(`  ${x.festaId}${x.nome ? ` (${x.nome})` : ''}: ${x.motivo}${x.detalhe ? ` · ${curto(x.detalhe)}` : ''}`);
    if (itens.length) info('Corrigir: node cli.js corrigir <festa> <campo> \'<json>\' --motivo "..." · ocultar: node cli.js ocultar <festa> --motivo "..."');
    return 0;
  }

  if (cmd === 'imagem') {
    const [sub, alvo] = posicionais();
    if (sub === 'ocultar' && alvo) {
      const r = imagens.ocultar(db, alvo, valor('--motivo'));
      info(r && r.ocultada ? `imagem ${alvo} oculta; some do registro e da rota /imagens/` : `nenhuma imagem com o sha ${alvo}`);
      return r && r.ocultada ? 0 : 1;
    }
    if (sub === 'listar' && alvo) {
      const lista = imagens.imagensDaFesta(db, resolverId(db, alvo));
      info(`${lista.length} imagem(ns) em ${resolverId(db, alvo)}`);
      for (const x of lista) info(`  ${x.id}${x.principal ? ' (principal)' : ''}  ${x.papel || ''}  ${x.largura || '?'}x${x.altura || '?'}  ${x.credito || ''}  ${x.origem || ''}`);
      return 0;
    }
    erro('uso: node cli.js imagem ocultar <sha> --motivo "..."  |  imagem listar <festa>');
    return 1;
  }

  if (cmd === 'relatorio') {
    const desde = valor('--desde');
    if (desde && !dataOk(desde)) {
      erro('--desde é AAAA-MM-DD');
      return 1;
    }
    let conversor = null;
    if (valor('--app')) {
      try {
        conversor = carregarConversor(valor('--app'));
      } catch (e) {
        erro(e.message);
        return 1;
      }
    }
    const r = relatorio(db, { desde, conversor });
    info(flag('--json') ? JSON.stringify(r, null, 2) : formatar(r));
    return 0;
  }

  if (cmd === 'expurgar') {
    const r = expurgar(db, { dirImagens: amb.imagens, simular: flag('--simular'), tudo: flag('--tudo') });
    const a = r.apagados;
    info(`${r.simulado ? 'simulação (nada foi apagado)' : 'expurgado'}: ${a.legendas} post(s) sem legenda e local, ${a.imagens} imagem(ns) no banco, ${a.arquivos} arquivo(s), ${a.avaliacoes} avaliação(ões)${flag('--tudo') ? `, ${a.brutos} bruto(s) do Instagram` : ''}`);
    if (!r.simulado) info('Falta a réplica do bucket (README, "No Fly") e o expurgo do app (/data/avaliacoes.json e /data/imagens).');
    return 0;
  }

  if (cmd === 'produtora') {
    const [sub, arg] = resto;
    if (sub === 'criar') {
      const p = criarProdutora(db, arg);
      info(`produtora "${p.nome}" (${p.id}) criada.`);
      info(`token, mostrado só agora; guarde num gerenciador de senhas e entregue à produtora por canal seguro:\n${p.token}`);
      return 0;
    }
    if (sub === 'listar') {
      for (const p of db.prepare('SELECT id, nome, criada_em, ativa FROM produtoras ORDER BY criada_em').all()) {
        info(`${p.ativa ? '●' : '○'} ${p.id}  ${p.nome}  (desde ${p.criada_em.slice(0, 10)})`);
      }
      return 0;
    }
    if (sub === 'desativar' && arg) {
      const r = db.prepare('UPDATE produtoras SET ativa = 0 WHERE id = ?').run(arg);
      info(r.changes ? `${arg} desativada` : `${arg} não existe`);
      return r.changes ? 0 : 1;
    }
    erro(AJUDA);
    return 1;
  }

  if (cmd === 'fontes') {
    for (const f of descreverFontes(config)) info(`${f.ligada ? '● ligada   ' : '○ desligada'} ${f.id}: ${f.motivo || ''}`);
    return 0;
  }

  if (cmd === 'execucoes') {
    for (const e of db.prepare('SELECT id, inicio, fim, estado, gatilho, resumo FROM execucoes ORDER BY id DESC LIMIT 10').all()) {
      const r = e.resumo ? JSON.parse(e.resumo) : {};
      info(`#${e.id} ${e.inicio} ${e.estado} (${e.gatilho}) · ${r.festasTocadas ?? '-'} festas · US$ ${r.classificacao ? r.classificacao.gastoUsd : 0}`);
    }
    return 0;
  }

  if (cmd === 'uso') {
    info(JSON.stringify(resumoDeUso(db), null, 2));
    return 0;
  }

  erro(AJUDA);
  return 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => {
    console.error(`[motor] ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, AJUDA };

'use strict';
// Expurgo (D15 do plano de 24/11/2026): em 31/12/2026 (o Caio pode mudar a
// data) o motor apaga legendas, local marcado, imagens, avaliações e, com
// `tudo`, os brutos do Instagram. O app apaga o lado dele por conta própria,
// e a réplica do bucket é removida na operação (README, "No Fly").
//
// O que fica: festas, vínculos e valores (são dados públicos de evento), a
// lista de links de bio e o custo. Sem `simular`, ao fim o banco é compactado
// (VACUUM) para o texto apagado não ficar nas páginas livres do arquivo.

const fs = require('node:fs');
const path = require('node:path');
const { transacao } = require('./banco');
const NOME_SEGURO = require('./imagens').NOME_SEGURO || /^[a-f0-9]{16}-(480|1080)\.webp$/;

const CAMPOS_DE_POST = ['legenda', 'local', 'localizacao'];

// Os arquivos de imagem que o motor grava: <sha16>-(480|1080).webp em dirImagens
// (ou numa subpasta dela) e os temporários em tmp/. Só esses; nunca outra coisa
// na pasta.
function arquivosDeImagem(dirImagens) {
  const achados = [];
  const andar = (dir, naTmp) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) andar(caminho, naTmp || e.name === 'tmp');
      else if (e.isFile() && (naTmp || NOME_SEGURO.test(e.name))) achados.push(caminho);
    }
  };
  if (dirImagens && fs.existsSync(dirImagens)) andar(dirImagens, false);
  return achados;
}

// expurgar(db, { dirImagens, simular, tudo }) -> { simulado, feito, apagados: { legendas, imagens, arquivos, avaliacoes, brutos } }
function expurgar(db, { dirImagens = null, simular = false, tudo = false } = {}) {
  const apagados = { legendas: 0, imagens: 0, arquivos: 0, avaliacoes: 0, brutos: 0 };

  // Legendas e local marcado: o bruto sem esses campos e o contexto (texto) vazio.
  const posts = db.prepare("SELECT fonte, id_externo, bruto, contexto FROM itens_brutos WHERE fonte = 'instagram'").all();
  const limpar = [];
  for (const p of posts) {
    let b = null;
    try {
      b = JSON.parse(p.bruto);
    } catch {
      b = null;
    }
    const temCampo = b && CAMPOS_DE_POST.some((k) => k in b && b[k] !== null);
    if (temCampo || p.contexto) limpar.push({ p, b, temCampo });
  }
  apagados.legendas = limpar.length;

  apagados.imagens = db.prepare('SELECT COUNT(*) AS n FROM imagens').get().n;
  apagados.arquivos = arquivosDeImagem(dirImagens).length;
  apagados.avaliacoes = db.prepare('SELECT COUNT(*) AS n FROM avaliacoes').get().n;
  if (tudo) apagados.brutos = posts.length;

  if (simular) return { simulado: true, feito: false, apagados };

  transacao(db, () => {
    const upd = db.prepare("UPDATE itens_brutos SET bruto = ?, contexto = NULL WHERE fonte = 'instagram' AND id_externo = ?");
    for (const { p, b, temCampo } of limpar) {
      let novo = p.bruto;
      if (temCampo) {
        const sem = { ...b };
        for (const k of CAMPOS_DE_POST) delete sem[k];
        novo = JSON.stringify(sem);
      }
      upd.run(novo, p.id_externo);
    }
    db.exec('DELETE FROM imagens_item');
    db.exec('DELETE FROM imagens');
    db.exec('DELETE FROM avaliacoes');
    // A média que veio das avaliações sai junto com elas.
    db.exec("DELETE FROM valores WHERE fonte = 'avaliacoes'");
    if (tudo) db.exec("DELETE FROM itens_brutos WHERE fonte = 'instagram'");
  });

  let removidos = 0;
  for (const arq of arquivosDeImagem(dirImagens)) {
    try {
      fs.rmSync(arq, { force: true });
      removidos += 1;
    } catch {
      // arquivo preso: o próximo expurgo tenta de novo
    }
  }
  apagados.arquivos = removidos;

  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
  } catch {
    // banco em uso por outra conexão: a compactação fica para a próxima
  }
  return { simulado: false, feito: true, apagados };
}

module.exports = { expurgar };

'use strict';
// Rastreio de uso (M13): o gasto com o modelo e os acessos à API, para o
// painel de admin e para o comando `uso`. Nada aqui guarda IP.

function resumoDeUso(db, agora = new Date()) {
  const dia = new Date(agora.getTime() - 86400e3).toISOString();
  const mes = new Date(agora.getTime() - 30 * 86400e3).toISOString();
  const llm = (desde) => db.prepare(`SELECT COUNT(*) AS chamadas, COALESCE(SUM(tokens_entrada), 0) AS tokensEntrada,
    COALESCE(SUM(tokens_saida), 0) AS tokensSaida, ROUND(COALESCE(SUM(custo_usd), 0), 6) AS custoUsd,
    SUM(resultado = 'ok') AS ok, SUM(resultado = 'invalido') AS invalidas, SUM(resultado = 'erro') AS erros
    FROM uso_llm WHERE quando >= ?`).get(desde);
  const api = db.prepare(`SELECT rota, cliente, COUNT(*) AS acessos, ROUND(AVG(ms)) AS msMedio, SUM(status >= 400) AS erros
    FROM uso_api WHERE quando >= ? GROUP BY rota, cliente ORDER BY acessos DESC`).all(dia);
  const ultima = db.prepare('SELECT id, inicio, fim, estado, gatilho FROM execucoes ORDER BY id DESC LIMIT 1').get() || null;
  const festas = db.prepare('SELECT COUNT(*) AS n FROM festas').get().n;
  return { geradoEm: agora.toISOString(), modelo: { ultimas24h: llm(dia), ultimos30dias: llm(mes) }, api24h: api, ultimaExecucao: ultima, festasNoBanco: festas };
}

module.exports = { resumoDeUso };

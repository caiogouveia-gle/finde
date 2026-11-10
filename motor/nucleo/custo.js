'use strict';
// Preço por milhão de tokens, em dólar, da tabela de modelos da API em 10/11/2026
// (primeira parte, prompts de até 100 mil tokens). Confira em
// https://platform.claude.com/docs/en/about-claude/pricing antes de mudar o teto.

const PRECOS = {
  'claude-opus-5-5': { entrada: 4.0, saida: 20.0 },
  'claude-sonnet-5-5': { entrada: 2.0, saida: 10.0 },
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5 },
};

// Modelo fora da tabela: conta pelo mais caro, para o teto nunca ficar frouxo.
const PIOR = { entrada: 10.0, saida: 50.0 };

function custoUsd(modelo, tokensEntrada, tokensSaida) {
  const p = PRECOS[modelo] || PIOR;
  return (tokensEntrada * p.entrada + tokensSaida * p.saida) / 1e6;
}

// Estimativa antes da chamada (KTD5): ~3 caracteres por token em português,
// mais uma saída esperada de 1.000 tokens (a resposta e o raciocínio curto).
const SAIDA_ESPERADA = 1000;
function estimarUsd(modelo, caracteres) {
  return custoUsd(modelo, Math.ceil(caracteres / 3), SAIDA_ESPERADA);
}

module.exports = { PRECOS, custoUsd, estimarUsd, SAIDA_ESPERADA };

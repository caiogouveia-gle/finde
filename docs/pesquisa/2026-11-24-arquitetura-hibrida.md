# Arquitetura híbrida do motor, prova de conceito acadêmica (24/11/2026)

Decisão do Caio em 23 e 24/11/2026, com aval da instituição: como prova de conceito de um trabalho acadêmico sem fins lucrativos, o motor passa a coletar também em plataformas de ingresso e no Instagram. A nota de 23/11 (`2026-11-23-fontes-abertas-e-termos.md`) mostrou que nenhuma fonte aberta traz festas em volume. Esta registra como a prova foi montada e o que ela não faz. O plano técnico está em `docs/plans/2026-11-10-1338-feat-motor-de-coleta-plan.md` (M17 a M23, KTD11 a KTD16, U9 a U14).

## As camadas

| Camada | O que usa | Fontes |
|---|---|---|
| Coletores prontos | Apify, pela rota síncrona da API, com teto de itens e de gasto em cada chamada | Sympla, Shotgun, Resident Advisor, Instagram (posts e perfis) |
| Leitor com navegador | Scrapling, num processo Python à parte | Ingresse (a página só aparece com JavaScript) e agendas dos sites das casas |
| Leitura por IA | Claude Haiku 5.5 com saída estruturada | Flyer e legenda dos posts; texto das páginas sem dados estruturados |
| Normalização | O mesmo motor de antes (contrato `finde-r14/3` desde 24/11; era `/1`) | Todas |

O Instagram é fonte de descoberta. O link da bio, o Linktree e os links de compra dos posts entram numa fila, e os conectores da Sympla, do Shotgun e da Ingresse leem essas páginas na mesma execução. A mesma festa vinda do post e da página do ingresso vira um registro só, e no conflito vale a página do ingresso: Sympla e Shotgun 75, página lida no navegador 72, RA 65, Instagram 50.

## O que a prova não faz

- Não usa login, cookies nem conta de ninguém. Stories ficam de fora por isso.
- Não guarda comentários, curtidas, seguidores nem fotos de pessoas. Do post ficam o link e o que o flyer anuncia; a imagem é lida e descartada.
- Não estima idade a partir de imagem. A média de idade continua só declarada (R16).
- Não vai para o produto comercial. Os conectores ficam marcados `pocAcademica` e desligados por padrão; ligam com `node cli.js coletar --poc`. Para virar produto, o caminho é acordo: Programa de Afiliados da Sympla, envio direto pela produtora e a API do Instagram com autorização.

## Custo esperado

Uma rodada por dia em São Paulo, com 50 perfis no Instagram: Apify entre US$ 15 e 25 por mês (plano Starter de US$ 29), Claude Haiku entre US$ 5 e 10 por mês. Os tetos ficam no próprio motor: `tetoUsd` e `maxItens` por coletor em `motor/config/fontes.json`, e `FINDE_TETO_EXECUCAO_USD` e `FINDE_TETO_DIA_USD` para o Claude, divididos entre classificação, flyers e páginas. As contas e chaves estão em `docs/operacao/2026-11-24-contas-e-chaves.md`.

## O que medir para o relatório

- Cobertura: festas achadas por fonte, e quantas só o Instagram mostrou.
- Precisão da leitura de flyer: conferência manual de uma amostra de 50 posts.
- Antecedência: dias entre o post e a festa.
- Custo por festa confirmada, a partir de `uso_apify` e `uso_llm`.

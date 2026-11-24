---
title: Motor de coleta, agregação e classificação - Plan
type: feat
date: 2026-11-10
topic: motor-de-coleta
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Motor de coleta, agregação e classificação - Plan

## Goal Capsule

**Objective.** Uma execução do motor busca festas de São Paulo em fontes permitidas, junta o que se refere à mesma festa, classifica estilo e público com o Claude dentro de um teto de gasto e entrega registros no formato de R14, cada campo com a fonte e a hora em que foi conferido.

**Means.** Node 24 com `node:sqlite`, conectores puros, classificação pelo Claude com teto e uma API HTTP de leitura (KTD1, KTD4).

**Product authority.** Caio, pelo Grupo 1. O contrato que esta peça cumpre é R14 a R17 de `docs/plans/2026-11-10-1248-feat-detalhe-da-festa-plan.md`; esta peça decide como cumpri-lo e não muda o registro sem acordo com a frente visual.

**Open blockers.** Nenhum para construir. Deploy no Fly e a chave da API de produção esperam o sim do grupo.

**Stop conditions.** Parar e perguntar antes de: tocar em `prototipo/`, fazer commit, criar recurso no Fly, ligar um conector cuja fonte proíba coleta, mudar o formato do registro R14.

**Execution profile.** Uma sessão, sem worktree; testes com `node --test motor/teste/`. Quem integra é a sessão que abriu esta.

## Product Contract

### Summary

Uma pasta nova, `motor/`, com conectores de fonte, um banco SQLite no próprio servidor, a classificação pelo Claude com teto, tarefas agendadas várias vezes ao dia e uma API de leitura que o protótipo consome. Roda local e está pronta para o Fly, sem deploy.

### Problem Frame

A pesquisa de 10/11 mostrou que nenhuma fonte grande de festas autoriza coleta automatizada (RA, Instagram, Eventbrite) e que nenhuma traz a média de idade. Fontes abertas de agenda cultural existem, mas cobrem pouco de festa: o Mapa da Cultura (federal) respondeu em 10/11 com 342 ocorrências no país nos 30 dias seguintes e nenhuma na cidade de São Paulo; o SP Cultura da Prefeitura não respondeu; a API do Sesc SP bloqueia acesso automatizado. O canal que de fato traz festa, com a média de idade, é a produtora mandando os dados. O motor precisa tratar esse envio como fonte principal e as abertas como complemento.

### Key Decisions

- **O envio da produtora é a fonte principal; as abertas complementam.** (session-settled: task-directed — a tarefa pede começar por fontes abertas, APIs oficiais e envio direto; a sondagem de 10/11 mostrou que as abertas quase não trazem festa em SP.) Governs M1, M2, M4.
- **Fontes que proíbem coleta ou bloqueiam acesso automatizado ficam com o conector desligado e o motivo escrito no próprio registro de fontes.** Governs M3.
- **A média de idade nunca vem do modelo nem de fonte aberta; só do envio da produtora, com origem.** Aplica R16 do plano do detalhe. Governs M8.
- **Banco SQLite no servidor**, num volume com cópia contínua por Litestream para um bucket Tigris, o mesmo esquema do Phoenix. (session-settled: task-directed — hospedagem proposta pelo Caio; decisão do grupo pendente.) Governs M10, M12.
- **O modelo é configurável e o padrão é o Claude Haiku 5.5.** (session-settled: user-directed — Caio, 10/11/2026, escolhido no lugar do Claude Opus 5.5: classificar festa é tarefa simples e o Haiku custa cerca de 40 vezes menos.) O teto de gasto vale para qualquer modelo. Governs M6, M7.
- **Sem a chave da API, o motor classifica por regras e diz isso no registro.** Assim a execução local e os testes rodam sem segredo. Governs M6.

### Requirements

Os IDs levam M (motor) para não colidir com R1 a R22 do plano do detalhe.

**Fontes**

- M1. Envio direto pela produtora em dois caminhos: arquivo JSON numa pasta de entrada e um endpoint HTTP autenticado por um token por produtora. Exemplos fictícios acompanham o motor.
- M2. Conector para APIs abertas de agenda no padrão Mapas Culturais (Mapa da Cultura e SP Cultura), filtrado para a cidade de São Paulo.
- M3. Um registro de fontes diz, para cada uma, se está ligada e por quê; Instagram, Resident Advisor, Eventbrite, Sympla, Shotgun, DICE, Fever, Google Places e Sesc SP aparecem desligadas com o motivo.
- M4. Agenda iCal publicada pela própria produtora entra quando ela informa o endereço; vem desligada, sem endereços.

**Agregar e normalizar**

- M5. Itens de fontes diferentes que são a mesma festa viram um registro só, com identificador estável que não muda a cada coleta.
- M6. Estilo, se é festa, idade mínima, lineup e regras de entrada vêm da classificação pelo Claude quando a fonte não os traz estruturados; sem chave ou acima do teto, por regras, marcadas como tal.
- M7. Teto de gasto por execução e por dia, configurável; acima dele a classificação pelo modelo para e o resto segue por regras. Todo uso do modelo fica registrado com tokens e custo estimado.
- M8. A média de idade só entra com origem declarada pela produtora (`produtora`, `edicoes` ou `avaliacoes`); vinda de qualquer outra fonte, é descartada com aviso.

**Guardar e entregar**

- M9. Cada campo do registro guarda a fonte e a hora em que foi conferido; havendo duas fontes, vale a de maior prioridade.
- M10. Cada execução fica registrada (início, fim, fontes, itens, avisos, gasto) e duas execuções não rodam ao mesmo tempo.
- M11. Uma API de leitura entrega os registros no formato de R14, só festas a partir de hoje por padrão, e um comando exporta o mesmo conteúdo para arquivo.
- M12. As tarefas rodam várias vezes ao dia em horários configuráveis, dentro do servidor ou por comando avulso.
- M13. O acesso à API de leitura e ao envio fica registrado para rastreio de uso, sem guardar IP.

**Indicação do grupo (16/11/2026)**

- M14. Links que alguém do grupo manda entram por uma fonte própria, "Indicado pelo grupo": festa lida e preenchida à mão a partir da página pública, com o link recebido como origem e `conferidoEm` por campo. Sem coletor de Instagram, RA ou plataforma de ingresso (R15).
- M15. Perfis de produtoras e casas vão para uma lista privada de quem contatar; agendas e agregadores esperam a leitura dos termos antes de virar fonte. Nada de quem indicou, nem da conversa, entra no registro ou no repositório.
- M16. `node cli.js indicar <url>` registra o próximo link no lugar certo, para a leitura manual depois.

**Arquitetura híbrida, prova de conceito acadêmica (23–24/11/2026)**

- M17. Coletores prontos do Apify trazem festas da Sympla, do Shotgun e do RA em São Paulo, uma vez por dia, com teto de itens e de gasto por rodada e o uso registrado.
- M18. Posts recentes de uma lista de perfis do Instagram entram pelo Apify sem login; o Claude Haiku lê flyer e legenda e devolve as festas anunciadas com data. Nada de comentários, seguidores ou fotos de pessoas é guardado, e a imagem não é republicada.
  - *Nota de 24/11/2026 (plano `plans/2026-11-24-0115-feat-prova-de-conceito-completa-plan.md`, D4):* a peça de divulgação (flyer, banner, cartaz) passa a ser guardada, recodificada em WebP sem EXIF, com crédito e link da origem; foto de público, capa de vídeo e slide sem leitura própria continuam fora (M33).
- M19. O link da bio e o Linktree dos perfis, e os links de compra achados nos posts, viram uma fila de páginas de ingresso que os conectores leem na mesma execução.
- M20. Um leitor de páginas com navegador (Scrapling) lê as páginas que só aparecem com JavaScript (Ingresse) e as agendas dos sites das casas; usa o schema.org da página quando houver e o Haiku quando não.
- M21. O flyer e a página dividem o teto de gasto do classificador; acima dele, ficam sem leitura e a execução registra.
- M22. Todos esses conectores vêm desligados, marcados como prova acadêmica no registro de fontes, e ligam por `--poc` ou pela configuração.
  - *Nota de 24/11/2026 (plano `plans/2026-11-24-0115-feat-prova-de-conceito-completa-plan.md`, D1, D13):* Instagram e páginas ligam no motor do Fly com `FINDE_POC=1` até 07/12/2026; depois voltam a desligados. A CLI local continua exigindo `--poc`.
- M23. A média de idade continua só declarada (R16); nada estima idade a partir de imagem.

### Acceptance Examples

- AE1 (M1, M9). A produtora fictícia envia uma festa com lotes; o registro sai com `fontes` contendo o envio e `conferidoEm` em cada campo enviado.
- AE2 (M8). Um item do Mapa da Cultura chega com um campo de média de idade inventado; o registro sai sem média e a execução registra o aviso.
- AE3 (M5). A mesma festa chega pelo envio e pela agenda iCal da produtora; sai um registro só, com as duas fontes, e o preço do envio prevalece.
- AE4 (M7). Com teto de US$ 0,01, a primeira festa é classificada pelo modelo e as seguintes por regras; a execução registra que o teto parou o modelo.
- AE5 (M6). Sem `ANTHROPIC_API_KEY`, a execução termina, e os registros dizem `classificacao.por: "regras"`.
- AE6 (M14, R16). Uma indicação traz média de idade com `origem: "avaliacoes"`; o registro sai sem média e a execução avisa. Com `origem: "produtora"` e o detalhe de onde foi publicada, a média entra.

### Scope Boundaries

- Deploy, criação de app, volume ou bucket no Fly: fora, até o sim do grupo.
- Painel da produtora com login: fora. O token por produtora é emitido por comando.
- Raspagem de páginas de terceiros: fora.
- Média de idade estimada pelo Finde (por edições ou avaliações calculadas aqui): fora; só a declarada.

### Outstanding Questions

**Deferred to Planning**
- Prioridade exata entre fontes e o que acontece quando uma fonte deixa de trazer um item.

**Resolve Before Planning**
- Nenhuma.

## Planning Contract

### Key Technical Decisions

- **KTD1. Node 24 puro com `node:sqlite`.** Igual ao protótipo: sem build, sem dependência para rodar e testar. A única dependência é `@anthropic-ai/sdk`, carregada só quando há `ANTHROPIC_API_KEY`; sem ela o motor roda inteiro por regras (M6).
- **KTD2. Valores por fonte, escolha na leitura.** A tabela `valores` guarda `(festa, campo, fonte, valor, conferido_em)`. O registro R14 escolhe, campo a campo, o valor da fonte de maior prioridade e, no empate, o mais recente. Assim a origem e a data de cada campo saem de graça (M9) e nada se perde quando uma fonte some. Prioridade: `envio` 100, `ical` 80, `indicacao` 70, `mapas-culturais` 60, `claude` 40, `regras` 20.
- **KTD3. Vínculo estável.** `vinculos(fonte, id_externo) → festa_id`. Item sem vínculo procura festa do mesmo dia com casa e nome parecidos (Jaccard de palavras ≥ 0,5 no nome e casa igual sem acento); sem par, nasce `slug-do-nome-AAAAMMDD-xxxx` (≤ 60 caracteres, `[a-z0-9-]`, o formato do protótipo), com `xxxx` do hash de fonte e id externo (M5).
- **KTD4. Classificação com saída estruturada.** `messages.create` com `output_config.format` em `json_schema`; modelo em `FINDE_MODELO` (padrão `claude-haiku-5-5`, definido só em `motor/nucleo/classificar.js`; esforço `low`). O resultado entra como fonte `claude`. Cache por hash do texto de entrada: festa sem mudança não volta ao modelo.
- **KTD5. Teto antes da chamada.** Antes de cada chamada, o custo estimado (caracteres/3 de entrada, 1.000 de saída, tabela de preços em `custo.js`) somado ao gasto da execução e do dia não pode passar de `FINDE_TETO_EXECUCAO_USD` (0,50) nem de `FINDE_TETO_DIA_USD` (2,00). Depois, grava-se o uso real em `uso_llm` (M7).
- **KTD6. Média de idade só do envio.** O normalizador de qualquer fonte que não seja `envio` descarta `mediaIdade` com aviso; o do envio exige origem válida (`avaliacoes` pede contagem ≥ 5, `edicoes` pede detalhe) (M8).
- **KTD7. Fuso fixo −03:00.** São Paulo não tem horário de verão desde 2019; horários saem em ISO com `-03:00`, e fim antes do início vira o dia seguinte.
- **KTD8. Agenda dentro do servidor.** `FINDE_HORARIOS=07:00,12:00,17:00,21:00`; trava na tabela `execucoes` (uma `rodando` com menos de 30 min impede outra). O comando `node motor/cli.js coletar` serve para cron externo. LaunchAgent no Mac não lê `~/Documents` (TCC), por isso o README manda rodar o servidor ou usar o Fly.
- **KTD10. Indicação como leitura manual registrada (16/11/2026).** (session-settled: user-directed — Caio, 16/11/2026: incorporar os links que o grupo manda.) O arquivo de `entrada/indicacoes/` guarda, além dos campos, a lista `leitura` (URL, `lidoEm`, campos); `gravarValores` aceita um `conferidoEm` por campo. Na indicação, a média de idade só entra com `origem: "produtora"` e `detalhe`. Os lotes adotam `taxa` e `ate`, com os nomes da base do protótipo.
- **KTD11. Prova acadêmica com coleta em plataformas (24/11/2026).** (session-settled: user-directed — Caio, 23–24/11/2026, com aval da instituição, sem fins lucrativos; substitui, só para a prova, a exclusão de Instagram e RA de R15.) Os conectores ficam marcados `pocAcademica` e não vão para o produto comercial sem acordo com as plataformas.
- **KTD12. Apify pela rota síncrona.** `POST /v2/acts/<usuario~ator>/run-sync-get-dataset-items` com o token em `Authorization: Bearer`, `maxItems` e `maxTotalChargeUsd` na própria chamada; custo estimado por mil itens do config, gravado em `uso_apify`. Atores: `hypebridge~sympla-events-scraper`, `crawloop~shotgun-scraper`, `parsebird~resident-advisor-scraper`, `apify~instagram-scraper`, `apify~instagram-profile-scraper`.
- **KTD13. Leitura por IA num só extrator.** `nucleo/extrair.js` lê flyer (imagem em base64 + legenda + data de publicação) e texto de página no mesmo esquema `{ festas: [...] }`, com cache pelo hash da entrada e o teto do classificador (`podeGastar`, `somarGasto`).
- **KTD14. Fila de links na execução.** `executar` cria uma fila compartilhada no contexto dos conectores; o Instagram roda antes e põe nela os links de ingresso; Sympla e Shotgun os somam às URLs de entrada dos atores, e o leitor de páginas pega os da Ingresse.
- **KTD15. Scrapling como processo à parte.** `motor/coletores/paginas/ler.py`, projeto `uv` em Python 3.12 (nodriver e afins não importam no 3.14), lê URLs do stdin e devolve JSON por linha (url final, status, título, texto, JSON-LD); o Node chama pelo `child_process` e o teste injeta um leitor falso.
- **KTD16. Prioridades.** `sympla-apify` e `shotgun-apify` 75, `paginas` 72, `ra-apify` 65, `instagram` 50: a página do ingresso vale mais que o flyer; o envio da produtora continua acima de tudo.
- **KTD17. Apify só para o Instagram; plataformas pelo Scrapling (24/11/2026).** (session-settled: user-directed — Caio, 24/11/2026, pelo custo: o motor inteiro cai de US$ 23–41 para US$ 4–8 por mês; ver `docs/operacao/2026-11-24-contas-e-chaves.md`.) O Apify roda no plano grátis só com `apify~instagram-scraper` (uma vez por dia, `intervaloHoras` 20) e `apify~instagram-profile-scraper` (uma vez por semana). Sympla, Shotgun e RA viram listagens do leitor de páginas (`config.paginas.listagens`), uma vez por dia, São Paulo, próximos 14 dias, com pausa entre pedidos; os atores do Apify para elas ficam como reserva desligada. Proxy só por fonte que bloquear, pela variável `FINDE_PROXY_URL`.
- **KTD18. Correções da revisão adversarial (24/11/2026).** Vínculo do Instagram e das páginas pela própria festa (hash de nome e data, URL ou `@id`), nunca pela posição; o mesmo link de compra no mesmo dia junta festas de fontes diferentes; itens da mesma fonte para a mesma festa se somam na execução; o Apify roda pela rota assíncrona, lê só os campos usados, apaga o dataset e conta o custo real, com teto por execução e por dia (`FINDE_TETO_APIFY_EXECUCAO_USD`, `FINDE_TETO_APIFY_DIA_USD`); o tempo-limite do leitor mata o grupo de processos; regra de entrada sem contato de pessoa; código de indicação fora de todo link, menos o do envio; cartaz só do envio e da indicação; o que o Claude já leu não paga a classificação de novo; `--fonte` não liga conector da prova sem `--poc`.
  - *Nota de 24/11/2026 (plano `plans/2026-11-24-0115-feat-prova-de-conceito-completa-plan.md`):* "cartaz só do envio e da indicação" passa a "imagem guardada só da peça de divulgação" (KTD6 a KTD9 de lá), e os conectores da prova ligam no Fly até 07/12 (KTD18 de lá).
- **KTD9. Fly igual ao Phoenix.** `Dockerfile` com Litestream fixado por versão e sha256, `inicio.sh` que restaura do bucket quando o volume está vazio e supervisiona o Node, `litestream.yml` lendo as variáveis que `fly storage create` define. Nada é criado na conta.

### Sources

- Mapa da Cultura, `https://mapa.cultura.gov.br/api/event/findOccurrences` e `/api/space/find` (Mapas Culturais, dados abertos), conferido em 10/11/2026: o filtro por município não funciona em `findOccurrences`; busca-se as ocorrências da janela e depois os espaços por `id=IN(...)` com `En_Municipio=ILIKE(São Paulo)`.
- SP Cultura, `https://spcultura.prefeitura.sp.gov.br/api/`: mesmo software, sem resposta em 10/11/2026.
- Sesc SP: `robots.txt` permite tudo, mas `/wp-json/wp/v1/atividades/filter` devolve 403 do CloudFront para cliente automatizado; não há termo de uso publicado. Desligado.
- `amberos/modules/spike-pagamentos/{Dockerfile,inicio.sh,litestream.yml,fly.toml}`: o esquema de cópia contínua.

## Implementation Units

- **U1. Banco e contrato.** Goal: esquema SQLite e montagem do registro R14. Requirements: M9, M10, M13. Files: `motor/nucleo/banco.js`, `motor/nucleo/contrato.js`. Approach: tabelas `festas`, `vinculos`, `valores`, `itens_brutos`, `execucoes`, `uso_llm`, `uso_api`, `produtoras`, `classificacoes`; `montarRegistro` aplica KTD2 e calcula `precoAPartirDe` (menor lote disponível, conta os esgotados antes). Test scenarios: prioridade entre fontes; empate pelo mais recente; lote mais barato esgotado; `conferidoEm` por campo. Verification: testes de `contrato`.
- **U2. Normalização.** Goal: item de fonte → campos R14. Requirements: M5, M8. Files: `motor/nucleo/normalizar.js`, `motor/nucleo/bairros.js`. Approach: datas e horas (KTD7), preço em texto, bairro e região por endereço, URLs só http(s), Instagram como URL, slug e id (KTD3), média só do envio (KTD6). Test scenarios: fim depois da meia-noite; "Gratuito"; "R$ 25,00"; média vinda do Mapa descartada com aviso; média sem origem descartada; URL `javascript:` recusada.
- **U3. Fontes.** Goal: conectores e registro de fontes. Requirements: M1–M4. Files: `motor/fontes/{index,envio,mapas-culturais,ical}.js`, `motor/config/fontes.json`, `motor/exemplos/envios/*.json`. Approach: cada conector exporta `{ id, nome, prioridade, coletar(ctx) }` e recebe `fetch` injetado; os desligados ficam no registro com `motivo`. Test scenarios: Mapas com resposta gravada (filtra cidade, monta endereço); erro de rede vira aviso, não derruba a execução; iCal com evento que cruza a meia-noite; exemplos de envio validam.
- **U4. Classificação.** Goal: estilo, se é festa, idade mínima, lineup, regras. Requirements: M6, M7. Files: `motor/nucleo/classificar.js`, `motor/nucleo/custo.js`. Approach: KTD4, KTD5; regras por palavras como reserva. Test scenarios: cliente falso devolve JSON válido; JSON fora do esquema cai para regras; teto parando na segunda chamada (AE4); cache evita segunda chamada; sem chave tudo por regras (AE5); média nunca sai do modelo.
- **U5. Coleta.** Goal: a execução de ponta a ponta. Requirements: M5, M10. Files: `motor/nucleo/coleta.js`, `motor/nucleo/agregar.js`. Approach: trava, coleta por fonte, normaliza, vincula, classifica, grava valores, fecha a execução com resumo. Test scenarios: AE1, AE2, AE3; segunda execução simultânea recusada; reexecução não duplica festas.
- **U6. Servidor, CLI e agenda.** Goal: entregar e agendar. Requirements: M1, M11, M12, M13. Files: `motor/servidor.js`, `motor/cli.js`, `motor/nucleo/agenda.js`. Approach: `GET /api/festas`, `GET /api/festas/:id`, `GET /api/fontes`, `POST /api/envios` (Bearer da produtora), `GET /api/uso` (Bearer de admin), `GET /saude`; CORS opcional por `FINDE_CORS`; CLI `coletar`, `exportar`, `produtora`, `uso`, `fontes`. Test scenarios: envio sem token 401; com token grava e aparece na leitura; corpo grande 413; uso registrado sem IP; agenda calcula a próxima hora em −03:00.
- **U8. Indicação do grupo.** Goal: os links do grupo viram festas, contatos ou fontes a avaliar. Requirements: M14–M16. Files: `motor/fontes/indicacao.js`, `motor/nucleo/indicar.js`, `motor/exemplos/indicacoes/`, `motor/teste/indicacao.test.js`. Test scenarios: `conferidoEm` por leitura; média só declarada pela produtora (AE6); indicação sem origem fica fora; `indicar` separa perfil, festa e agenda e não duplica.
- **U9. Cliente Apify e plataformas.** Goal: Sympla, Shotgun e RA pelo Apify. Requirements: M17, M22. Files: `motor/nucleo/apify.js`, `motor/fontes/plataformas.js`, `motor/config/fontes.json`, `motor/nucleo/banco.js`. Test scenarios: chamada com token no cabeçalho e tetos na URL; mapeamento de cada ator a partir de saída gravada (UTC do Shotgun vira −03:00; preço em texto do RA); fora de São Paulo fica fora; sem `APIFY_TOKEN`, aviso e nada roda.
- **U10. Extrator de flyer e página.** Requirements: M18, M20, M21, M23. Files: `motor/nucleo/extrair.js`, `motor/nucleo/classificar.js`. Test scenarios: pedido com bloco de imagem e saída estruturada; cache evita segunda chamada; teto parado não chama; resposta inválida descartada; festa sem data descartada.
- **U11. Instagram.** Requirements: M18, M19. Files: `motor/fontes/instagram.js`. Test scenarios: posts → festas com o post como origem e `paginas` do tipo instagram; nenhum comentário no bruto; link da bio e Linktree vão para a fila; post sem festa não vira item.
- **U12. Leitor de páginas.** Requirements: M20. Files: `motor/fontes/paginas.js`, `motor/coletores/paginas/{pyproject.toml,ler.py}`. Test scenarios: JSON-LD Event mapeado sem modelo; página sem JSON-LD vai ao extrator; agenda com várias festas vira vários itens; leitor falha → aviso.
- **U13. Execução e CLI.** Requirements: M19, M22. Files: `motor/nucleo/coleta.js`, `motor/nucleo/ambiente.js`, `motor/fontes/index.js`, `motor/cli.js`. Test scenarios: fila do Instagram chega aos atores na mesma execução; `--poc` liga só os conectores marcados; resumo traz gasto do Apify e do extrator.
- **U14. Documentação e prova local.** Files: `motor/README.md`, `docs/pesquisa/2026-11-24-arquitetura-hibrida.md`. Verification: testes verdes; rodada real só com as chaves do Caio.
- **U7. Deploy pronto e README.** Goal: rodar no Fly sem surpresa e explicar tudo. Files: `motor/README.md`, `motor/deploy/{Dockerfile,inicio.sh,litestream.yml,fly.toml}`, `motor/package.json`. Approach: KTD9. Verification: leitura; nada é executado contra o Fly.

## Verification Contract

- `node --test motor/teste/` passa.
- `node motor/cli.js coletar` local, sem chave: coleta do Mapa da Cultura (rede real) e dos envios de exemplo, grava e mostra o resumo.
- `node motor/servidor.js` e `curl localhost:8764/api/festas` devolvem registros R14.

## Definition of Done

- Todos os M1–M13 cobertos por teste ou pela execução local descrita acima.
- `prototipo/` intocado; nenhum segredo em arquivo; nenhum commit.
- Código de tentativas abandonadas removido.

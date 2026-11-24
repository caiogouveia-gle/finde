# Finde, motor de coleta

O protótipo funcional do Finde: busca festas de São Paulo em fontes permitidas, junta o que é a mesma festa, classifica estilo e público com o Claude dentro de um teto de gasto e entrega registros no formato do R14 (`docs/plans/2026-11-10-1248-feat-detalhe-da-festa-plan.md`). O plano desta peça é `docs/plans/2026-11-10-1338-feat-motor-de-coleta-plan.md`.

Node 24. Para coletar, gravar e servir, nenhuma dependência. O SDK da Anthropic só é preciso para classificar pelo Claude.

## Rodar

```bash
cd motor
node cli.js coletar --com-exemplos
```

Sem `ANTHROPIC_API_KEY`, a classificação vai por regras e o registro diz isso (`classificacao.por: "regras"`). Com a chave:

```bash
npm install
export ANTHROPIC_API_KEY=...   # do ambiente; nunca em arquivo
node cli.js coletar --com-exemplos
```

O banco fica em `motor/var/finde.sqlite3` (fora do git). Para servir os registros:

```bash
node servidor.js
```

Abre em `http://localhost:8764`. `curl localhost:8764/api/festas` devolve as festas de hoje em diante.

`--com-exemplos` soma os envios fictícios de `exemplos/envios/` (duas produtoras inventadas, quatro festas no próximo fim de semana, marcadas com `"exemplo": true`). Sem a flag, só entram as fontes reais.

### Comandos

`node cli.js ajuda` lista todos. Resumo:

| Comando | O quê |
|---|---|
| `node cli.js coletar [--fonte <id>] [--com-exemplos] [--poc] [--forcar]` | Uma coleta agora. `--poc` liga os conectores da prova acadêmica; `--forcar` ignora o intervalo de cada fonte |
| `node cli.js coletar --poc --recuperar-instagram` | Relê pelo Apify os posts que já temos (legenda e flyer). Paga, dentro dos tetos; só com `--poc` e com o sim do Caio |
| `node cli.js coletar --poc --dias <n>` | Amplia a janela de posts do Instagram (1 a 30 dias). Paga, dentro dos tetos; só com `--poc` e com o sim do Caio |
| `node cli.js exportar [arquivo] [--todas] [--sem-exemplos]` | Os registros R14 num JSON (padrão `var/festas-r14.json`); por padrão só São Paulo e sem as ocultas; `--todas` inclui o resto |
| `node cli.js reprocessar --origem <arquivo> --destino <arquivo> [--simular]` | Refaz festas, vínculos e valores num banco novo, a partir dos brutos, sem rede e sem chamada paga. A origem só é lida |
| `node cli.js revincular [--simular]` | Reaplica a correlação neste banco; `--simular` mostra o que une e o que separa antes |
| `node cli.js vinculos --revisar` | Os candidatos a fusão que o escore deixou para olho humano |
| `node cli.js decidir une\|separa <fonte:id> <fonte:id>` | Decisão manual sobre dois itens; vale sempre |
| `node cli.js revisar [--festa <id>]` | O que pede olho humano: plataforma contra modelo, casa que é cidade, sem cidade, candidatos |
| `node cli.js corrigir <festa> <campo> '<json>' --motivo "..."` | Grava o campo com a fonte `curadoria`, que vale mais que todas. `--desfazer` (sem valor) tira a correção |
| `node cli.js ocultar <festa> --motivo "..." [--desfazer]` | Tira a festa da API e do export, ou a devolve |
| `node cli.js imagem ocultar <sha> --motivo "..."` · `imagem listar <festa>` | A imagem some do registro e da rota `/imagens/`; ou lista as guardadas |
| `node cli.js relatorio [--desde AAAA-MM-DD] [--json] [--app <conversor>]` | Os números do trabalho acadêmico |
| `node cli.js expurgar [--simular] [--tudo]` | O prazo de guarda (D15) |
| `node cli.js produtora criar "<nome>"` | Cadastra uma produtora e mostra o token uma vez só |
| `node cli.js produtora listar` · `produtora desativar <id>` | |
| `node cli.js indicar <url> [--tipo festa\|perfil\|agenda\|referencia] [--nome "..."]` | Guarda um link indicado em `entrada/` para a leitura manual (ver "Indicação: lido na página do ingresso") |
| `node cli.js fontes` | Fontes ligadas e desligadas, com o motivo |
| `node cli.js execucoes` | As últimas execuções |
| `node cli.js uso` | Gasto com o modelo e acessos à API |

### Ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | (nenhuma) | Liga a classificação pelo Claude |
| `FINDE_MODELO` | `claude-haiku-5-5` | Modelo da classificação (Claude Haiku 5.5, decisão do Caio em 10/11/2026). O padrão mora só em `nucleo/classificar.js` |
| `FINDE_TETO_EXECUCAO_USD` | `0.50` | Teto de gasto com o modelo por execução |
| `FINDE_TETO_DIA_USD` | `2.00` | Teto por dia (horário de São Paulo), somando todas as execuções |
| `FINDE_BANCO` | `var/finde.sqlite3` | O arquivo do banco |
| `FINDE_MOTOR_PORTA` | `8764` | Porta do servidor |
| `FINDE_HORARIOS` | (desligada) | Agenda dentro do servidor: `padrao` (07h, 12h, 17h, 21h) ou uma lista `HH:MM,HH:MM` |
| `FINDE_ADMIN_TOKEN` | (nenhum) | Libera `/api/uso`, `/api/execucoes` e `POST /api/coletar` |
| `FINDE_APP_TOKEN` | (nenhum) | O token que o app manda em `POST /api/avaliacoes` (`Authorization: Bearer ...`), comparado em tempo constante. Sem ele, a rota fica fechada (401) |
| `FINDE_POC` | (desligada) | `1` faz a agenda ligar o Instagram e as páginas (D1, KTD18). No Fly vem do `[env]` do `fly.toml` até 07/12/2026; a CLI continua exigindo `--poc` |
| `FINDE_IMAGENS` | `var/imagens` | Onde as imagens de divulgação moram (no Fly, `/data/imagens`). Dado real, fora do git |
| `FINDE_CORS` | (nenhuma) | Origens que podem ler a API pelo navegador, ex.: `http://localhost:8763` |
| `FINDE_COM_EXEMPLOS` | | `1` soma os exemplos também nas coletas agendadas |
| `FINDE_FONTES` | `config/fontes.json` | Qual configuração de fontes usar |
| `APIFY_TOKEN` | (nenhum) | Liga o Apify da prova acadêmica, só para o Instagram. Vai no cabeçalho, nunca na URL |
| `FINDE_TETO_APIFY_EXECUCAO_USD`, `FINDE_TETO_APIFY_DIA_USD` | `0.25` cada | Teto de gasto no Apify por execução e por dia, somado em `uso_apify` |
| `FINDE_INSTAGRAM_PERFIS` | `entrada/grupo/contatos.json` | Arquivo privado com os perfis do Instagram a acompanhar (no Fly, no volume) |
| `FINDE_CURADORIA_LOTE` | `entrada/curadoria.json` (o `arquivo` do config) | Correções da curadoria em lote. No Fly, `/data/entrada/curadoria.json`, no volume; sem o arquivo, nada entra em lote |
| `UV` | `uv` | Onde está o `uv` que roda o leitor de páginas (`coletores/paginas/`) |

## Agendar

As coletas rodam várias vezes ao dia de dois jeitos.

**Dentro do servidor**, que é o jeito do Fly:

```bash
FINDE_HORARIOS=padrao node servidor.js
```

**Por comando avulso**, para um cron de outra máquina: `node cli.js coletar`. Duas execuções nunca rodam juntas: a segunda vê a trava e sai com código 2. Uma trava com mais de 30 minutos é dada como abandonada.

No Mac, um LaunchAgent não serve: o macOS não deixa um agente agendado ler `~/Documents` sem uma autorização que ninguém vê, e o motor mora lá. Para coletar sozinho no Mac, deixe `FINDE_HORARIOS=padrao node servidor.js` aberto num terminal.

## O que o motor entrega (R14)

`GET /api/festas` devolve `{ contrato: "finde-r14/3", geradoEm, execucaoId, total, festas: [...] }`: `geradoEm` é o fim da última execução que terminou bem e `execucaoId` é o dela. Veja "A API" abaixo para as rotas, os filtros e o `ETag`.

Cada registro:

| Campo | Conteúdo |
|---|---|
| `id` | Estável entre coletas, no formato do protótipo (`[a-z0-9-]`, até 60) |
| `nome`, `casa` | Texto |
| `produtora` | `{ nome, instagram }` |
| `endereco` | Sempre um objeto, com todas as chaves: `{ texto, bairro, bairroNome, regiao, cidade, cidadeOrigem, cep, lugar, lat, lng, precisao, origemGeo, atribuicaoOsm }`. `cidadeOrigem` diz de onde veio a cidade (`fonte`, `cep` ou `casa`, a casa do cadastro curado, D6); `lugar` é o id da casa em `config/lugares.json`; `lat` e `lng` com 5 casas; `precisao` é `casa`, `rua` ou `bairro` (bairro nunca vira pino); `origemGeo` é `curadoria`, `curado`, `pagina` ou `nominatim`, e `atribuicaoOsm` pede a atribuição do OpenStreetMap. Desde a `/2`: `bairro` e `regiao` com os ids do protótipo quando é um dos sete bairros dele; `cidade` só do que a fonte diz (o campo `cidade`, o CEP da capital, a cidade com UF no endereço, como "Cotia/SP", ou um trecho "São Paulo"; bairro de São Paulo seguido de SP, como "Pinheiros - SP", é São Paulo), senão `null`. A versão `/2` do contrato marca essa regra: a `/1` gravava "São Paulo" fixo |
| `data` | `AAAA-MM-DD` |
| `dataDaNoite` | `AAAA-MM-DD`: a noite a que a festa pertence; início antes das 6h conta como a noite anterior, sem início é a `data`. É a chave de dia do app e da correlação |
| `inicio`, `pistaCheia`, `fim` | ISO com `-03:00`; fim depois da meia-noite já cai no dia seguinte |
| `lotes` | `[{ nome, preco, disponivel, taxa?, ate?, condicoes? }]`; `disponivel` é `null` quando a fonte não diz; `taxa` em reais e `ate` (`HH:MM`, a hora em que o preço deixa de valer, também lida do nome, como "Hora Mágica (até 23:30)"), os mesmos nomes da base do protótipo; `condicoes`, o que o lote pede: `meia`, `meia-social` (também "solidário"), `feminino`, `masculino`, `comissario` e `codigo` (só aparece com um código), do nome do lote ou anotadas na leitura. Os dois gêneros no mesmo nome ("Homens e Mulheres") não são condição, e a negação ("Inteira (não é meia)") não vira meia |
| `precoAPartirDe` | `{ valor, lote, esgotadosAntes, condicoes?, genero? }`: o menor lote disponível que qualquer pessoa compra, sem meia, meia social, gênero, comissário ou código (AE3 do detalhe), ou a porta. Só lote por gênero: o mais alto, com `genero: { feminino, masculino }`. Só lote com outra condição: o menor, com `condicoes` |
| `esgotado`, `entradaNaPorta` | `true` quando todos os lotes acabaram e não há porta; `{ preco }` da porta |
| `linkCompra`, `linkEvento`, `instagram` | URLs http(s) ou `null` |
| `imagens` | `[{ id, arquivo, miniatura, largura, altura, papel, fonte, credito, origem, conferidoEm, principal, origens }]`: as peças de divulgação guardadas (`arquivo` e `miniatura` em `imagens/<sha16>-1080.webp` e `-480.webp`, servidos em `GET /imagens/<arquivo>`), com o crédito e o link do post ou da página (nunca a URL do CDN). `papel` é `cartaz-enviado`, `cartaz-indicado`, `flyer`, `pagina-ingresso` ou `post` |
| `cartaz` | A imagem principal, no formato de um item de `imagens`, ou `null` |
| `lineup` | Lista de nomes, ou `null` quando ainda não foi divulgado |
| `estilos` | Ids do catálogo do protótipo (`house-disco`, `pop-2000`, `mpb-samba`, `funk`, `indie-rock`, `eletronica`) |
| `idadeMinima` | Número ou `null` |
| `regras` | `{ documento?, vestimenta?, lista? }` |
| `mediaIdade` | `{ valor, origem, detalhe?, avaliacoes?, naMedida?, faixa?, convites? }` ou `null` (R16). `origem` é `produtora`, `edicoes` ou `avaliacoes`; com `avaliacoes`, `valor` é a média das idades de quem respondeu (nunca mostrada sozinha como média do público), `naMedida` a proporção de "da minha idade", `faixa` a menor e a maior idade e `convites` os aparelhos distintos |
| `ehFesta` | O que a fonte ou a classificação disse, pela prioridade própria do campo (curadoria > envio > indicação > leitura do modelo > regras > plataformas) |
| `exemplo` | `true` nos dados fictícios |
| `classificacao` | `{ por, conferidoEm, tipo }`: quem decidiu o estilo (`envio`, `claude`, `regras`, `instagram`, `paginas`...) e o que o evento é (`festa`, `show`, `leitura`, `sessao-de-escuta`, `feira`, `outro`), ou `null` no tipo. O app escreve "lido do post" ou "da página" quando `por` é `instagram` ou `paginas` |
| `fontes` | `[{ id, nome, url, conferidoEm, vinculo }]`, para o rodapé do detalhe (R12). `vinculo` é `{ regra, escore, sinais: [{ sinal, peso, detalhe }] }`, com `regra` `link`, `escore`, `manual` ou `nova` (o vínculo anterior ao `/3` sai `nova`). Na indicação, `url` é a página do ingresso lida por último (sem ela, a de onde veio o preço), sem código |
| `paginas` | `[{ tipo, nome, url, lidoEm, campos }]`: cada página que a leitura manual abriu, com o que ela é (`ingresso`, `revenda`, `materia`, `oficial`, `instagram`, `outra`) e o que se leu nela. Vazio nas outras fontes |
| `divergencias` | `[{ campo, valores: [{ fonte, valor, conferidoEm }] }]`, só para `precoAPartirDe`, `inicio`, `data`, `casa` e `linkCompra`, comparados já normalizados |
| `idsAntigos` | Ids de festas absorvidas por esta (`festas_alias`): convite e avaliação antigos continuam achando a festa |
| `revisar` | `[{ motivo, detalhe }]` para olho humano (plataforma contra modelo no `ehFesta`, casa que é cidade, sem cidade, candidato a fusão); o app ignora |
| `coletadoEm` | A última vez que alguma fonte confirmou a festa |
| `campos` | Para cada campo presente, `{ fonte, conferidoEm }` (R17); `campos.endereco` traz também `subcampos: { texto, cidade, bairro, geo }`, cada um `{ fonte, conferidoEm }` ou `null` |

O `/3` não tem `vendaAberta`. A forma de cada campo está fixada em `teste/dados/registro-r14-3.json` (três registros fictícios: completo, mínimo e uma festa de 00h30). O app aceita `/2` e `/3` e recusa o `/1`. Festa ocultada pela curadoria fica fora, salvo `todas=1`.

Campo que nenhuma fonte trouxe sai `null` ou lista vazia, nunca inventado. Os instantes de conferência (`conferidoEm`, `coletadoEm`) saem em ISO com `-03:00` e sem milissegundos, como na base do protótipo.

**Para o protótipo consumir.** Há dois caminhos: ler a API (com `FINDE_CORS=http://localhost:8763`, ou o servidor do protótipo buscando do lado dele) ou ler o arquivo de `node cli.js exportar`. O protótipo hoje conta as horas a partir da meia-noite do dia da festa (1h da manhã é 25); daqui sai ISO, e a conversão é `hora + 24 × dias depois da data`. Mudança no formato do registro se combina com a frente visual.

## A API

`node servidor.js` sobe tudo (porta 8764). Nenhuma rota devolve dado pessoal; o uso não guarda IP.

| Rota | Quem | O quê |
|---|---|---|
| `GET /saude` | Fly | `{ ok: true }`. Não grava linha em `uso_api` (a checagem bate a cada 30 s) |
| `GET /api/festas` | público | O envelope `{ contrato, geradoEm, execucaoId, total, festas }`. Só São Paulo (cidade confirmada diferente de São Paulo fica de fora; cidade vazia fica, o app decide) e sem as ocultas pela curadoria. Filtros: `de` e `ate` (`AAAA-MM-DD`; padrão, hoje em São Paulo), `todas=1` (inclui o resto, as ocultas marcadas; só com `Authorization: Bearer $FINDE_ADMIN_TOKEN`, sem ele dá 401), `exemplos=0` (tira os fictícios). `de` mais velho que 7 dias atrás vira 7 dias atrás, sem recusa. Responde com `ETag` (a execução, os filtros e uma impressão do que muda sem execução nova: correção, avaliação, imagem ocultada) e dá 304 com `If-None-Match` |
| `GET /api/festas/:id` | público | Um registro. O id antigo de uma festa unida a outra (`festas_alias`) devolve a festa nova. Festa oculta ou que não é festa dá 404 |
| `GET /imagens/<sha16>-(480\|1080).webp` | público | A peça de divulgação guardada, de `FINDE_IMAGENS`. Só o nome que o motor grava, só imagem que está no banco e não foi ocultada, nem só de festas ocultas; o resto dá 404. `Cache-Control: public, max-age=86400`, `nosniff` |
| `GET /robots.txt` | público | `Disallow: /`. Toda resposta do motor leva `X-Robots-Tag: noindex, noimageindex, nofollow` |
| `POST /api/envios` | produtora | O envio de festas (token de produtora), até 256 KB |
| `POST /api/avaliacoes` | app | O lote de avaliações pós-festa (`Authorization: Bearer $FINDE_APP_TOKEN`, até 256 KB, no máximo 200 por pedido). Cada item: `{ chave, aparelho, planoId, festaId, resposta: 'mais-novo'\|'na-medida'\|'mais-velho', idade }`, sem nome (um item com `nome` derruba o pedido com 400). Idempotente pela chave. Responde 202 com `{ novas, repetidas, recusadas }` e já atualiza a `mediaIdade` da festa |
| `POST /api/coletar` | admin | Dispara uma coleta e responde logo: 202 com `{ execucaoId }`, ou 409 se já há uma rodando. Corpo opcional: `{ "fonte": "<id>", "forcar": true }` |
| `GET /api/uso`, `GET /api/execucoes` | admin | O gasto e as execuções |
| `GET /api/fontes` | público | As fontes, ligadas e desligadas, com o motivo |

**A agenda** (`FINDE_HORARIOS`) roda `coletar` nos horários de São Paulo; com `FINDE_POC=1` liga o Instagram e as páginas. Ao fim de cada rodada limpa as imagens das festas que passaram (com folga e teto de disco) e poda os acessos da API com mais de 30 dias. O fechar do servidor derruba as conexões abertas.

**Avaliações e idade.** O app guarda cada resposta sem nome (a chave é um HMAC) e a manda ao motor. A fonte de festa `avaliacoes` grava `mediaIdade` com `origem: 'avaliacoes'` quando a festa tem pelo menos 5 respostas com idade (18 a 60) de pelo menos 2 convites: `valor` é a média das idades de quem respondeu, `naMedida` a proporção de "da minha idade", `faixa` a menor e a maior idade, `convites` os convites distintos. Resposta sem idade não conta. A produtora que declarou a média (envio, prioridade 100) vale mais que as avaliações (90).

## Correlação, curadoria e relatório

- **Curadoria.** `corrigir` e `ocultar` gravam na tabela `curadoria` e em `valores` com a fonte `curadoria` (prioridade 110, acima de todas). A cada execução e no `reprocessar`, a fonte de festa `curadoria` regrava os campos ativos de cada festa, pelo id atual (apelidos resolvidos), então a correção sobrevive a qualquer coleta e à união de festas. `entrada/curadoria.json` (fora do git) aceita correções em lote: uma lista de `{ festa, campo, valor, motivo? }`, que entra uma vez. `corrigir` de novo o mesmo campo troca a correção; a anterior fica no histórico.
- **Revisão.** `node cli.js revisar` junta o que pede olho humano: a plataforma e o modelo discordando sobre ser festa, a casa que parece cidade ou endereço, a festa sem cidade e os candidatos a fusão (`vinculos --revisar` mostra só estes). `decidir une|separa` grava a decisão manual, que vale sempre sobre o escore.
- **Imagens.** `imagem listar <festa>` mostra as peças guardadas, com crédito e origem; `imagem ocultar <sha> --motivo "..."` tira a peça do registro e da rota (e o app a perde na próxima atualização da base).
- **Relatório.** `node cli.js relatorio [--desde AAAA-MM-DD] [--app <caminho do nucleo/reais.js do app>]` mostra festas por fonte, as que só o Instagram trouxe, as com mais de uma fonte, os candidatos, o custo por festa que chega ao app (Claude e Apify, `uso_llm` e `uso_apify`), a antecedência (mediana de dias entre o post e a festa) e o funil de corte; com `--app`, passa o export pelo conversor do app e conta o motivo de cada corte. `--json` para planilha.
- **O banco reprocessado (U35, 24/11/2026).** `var/finde-r3.sqlite3` é o retrato de 24/11 refeito por `reprocessar` (sem rede e sem chamada paga: `uso_llm` e `uso_apify` sem linha nova) e curado: as duas festas da mesma noite e da mesma casa que o vínculo antigo juntava, separadas; três pares da mesma festa em fontes diferentes, unidos; seis não festa do Instagram ocultadas até a releitura de O2. É o banco ativo a partir dela, por `FINDE_BANCO=var/finde-r3.sqlite3`; o antigo, `var/finde.sqlite3`, fica somente leitura. As peças das indicações estão em `var/imagens/`. Os números e o que ficou de fora estão no relato da costura; a amostra de precisão, em `docs/pesquisa/2026-11-24-precisao-da-leitura.md`.
- **O export inteiro.** `exportar --todas` traz também as ocultas, marcadas com `oculta: true`, e o conversor do app as deixa fora; a lista padrão nem as traz.
- **Expurgo (D15).** `node cli.js expurgar --simular` conta o que sairia; sem `--simular`, apaga legendas e local marcado dos posts do Instagram, as imagens (banco e arquivos de `FINDE_IMAGENS`), as avaliações e a média que veio delas, e compacta o banco. Com `--tudo`, apaga também os brutos do Instagram. A data combinada é 31/12/2026. O app apaga o lado dele (`/data/avaliacoes.json` e `/data/imagens`), e a réplica do bucket é removida a mão (ver "No Fly").

## As fontes

`node cli.js fontes` lista todas. Em resumo:

| Fonte | Estado | Por quê |
|---|---|---|
| Envio da produtora (arquivo em `entrada/` ou `POST /api/envios`) | Ligada | A produtora manda os próprios dados. É a fonte principal e a única que traz média de idade em qualquer origem |
| Indicação, "Lido na página do ingresso" (`entrada/indicacoes/`) | Ligada | Links que alguém do time manda, lidos e preenchidos à mão a partir da página pública. Não há coletor |
| Mapas Culturais: SP Cultura e Mapa da Cultura | Ligada | APIs abertas, sem chave. Em 10/11/2026 o SP Cultura não respondia e o Mapa da Cultura não tinha nenhum evento na cidade nos 30 dias seguintes. O conector fica pronto para quando houver |
| Agenda iCal da produtora | Desligada | Liga quando uma produtora informar o endereço `.ics` em `config/fontes.json` |
| Instagram, Resident Advisor, Eventbrite, Sympla, Shotgun, DICE, Fever, Google Places, Sesc SP, Guia da Parik | Sem conector | Os termos proíbem coleta, não há API pública de listagem, ou o site bloqueia acesso automatizado. O motivo de cada uma está em `fontes/index.js` |
| Visite São Paulo | Candidata, sem conector | Termos e robots.txt permitem; tem API com tipo, data, casa e link de compra, mas poucas festas (7 em 4 semanas, em 23/11/2026). Ver `docs/pesquisa/2026-11-23-fontes-abertas-e-termos.md` |
| Ingresse, MATO, Guia da Semana, Catraca Livre | Sem conector | Avaliadas em 23/11/2026; o motivo de cada uma está em `fontes/index.js` e na nota de pesquisa |

Quando duas fontes falam do mesmo campo, vale a de maior prioridade: envio 100, iCal 80, indicação 70, Mapas Culturais 60, Claude 40, regras 20.

### O envio da produtora

Formato (ver `exemplos/envios/`):

```json
{
  "produtora": { "nome": "Coletivo X", "instagram": "@coletivox" },
  "festas": [{
    "id": "sexta-x", "nome": "Sexta X", "casa": "Terraço", "endereco": "Rua ..., 100 - Pinheiros",
    "data": "2026-11-14", "inicio": "18:00", "pistaCheia": "20:00", "fim": "23:00",
    "lotes": [{ "nome": "1º lote", "preco": 40, "disponivel": false }, { "nome": "2º lote", "preco": 60, "disponivel": true }],
    "naPorta": { "preco": 80 },
    "linkCompra": "https://...", "linkEvento": "https://...", "instagram": "@...", "cartaz": "https://...",
    "lineup": ["DJ A"], "estilos": ["house-disco"], "idadeMinima": 18,
    "regras": { "documento": "RG com foto", "vestimenta": null, "lista": "nome na lista até 23h" },
    "mediaIdade": { "valor": 32, "origem": "produtora" },
    "descricao": "texto livre, que o Claude lê para o que faltar"
  }]
}
```

Pelo endpoint:

```bash
node cli.js produtora criar "Coletivo X"   # mostra o token uma vez
curl -X POST localhost:8764/api/envios -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d @envio.json
```

O envio entra na coleta seguinte. O nome da produtora vem do cadastro, não do corpo.

**Média de idade (R16).** Entra pelo envio, com origem: `produtora` (ela declara), `edicoes` (estimada pelas edições anteriores; pede `detalhe`) ou `avaliacoes` (pede `avaliacoes` com ao menos 5). Pela indicação, só a que a produtora publicou (ver "Indicação: lido na página do ingresso"). Média sem origem, ou vinda de qualquer outra fonte, é descartada com aviso na execução. O modelo nunca diz média: o esquema da resposta nem tem esse campo.

### Indicação: lido na página do ingresso

Quando alguém do time manda um link (pelo WhatsApp, por exemplo), ele entra assim:

```bash
node cli.js indicar https://www.instagram.com/coletivo.x/            # perfil: vai para entrada/grupo/contatos.json
node cli.js indicar https://ingressos.example/festa-x --nome "Festa X" # festa: cria entrada/indicacoes/AAAA-MM-DD-festa-x.json
node cli.js indicar https://agenda.example/ --tipo agenda              # agenda ou referência: entrada/grupo/a-avaliar.json
```

Sem `--tipo`, um perfil do Instagram vira `perfil` e o resto vira `festa`. O comando só registra o link; não abre a página.

Para uma festa, alguém abre a página pública, lê e preenche o esqueleto com os campos do envio (nome, data, início e fim, casa, endereço, lotes, link de compra, Instagram) e anota cada leitura em `leitura`: a URL lida, a hora (`lidoEm`) e os campos que vieram dela. Cada campo do registro sai com o `conferidoEm` da leitura que o trouxe e a fonte "Lido na página do ingresso" (id `indicacao`; o nome diz o que é, e não o grupo de quem usa o app), com o link recebido como origem. Escreva a cidade como a página diz (no endereço ou em `cidade`); sem ela, o app não põe a festa na lista de São Paulo. Cada leitura pode dizer o que a página é (`"tipo"`: `ingresso`, `revenda`, `materia`, `oficial`, `instagram` ou `outra`) e o nome dela (`"nome"`: "Billboard Brasil"); sem isso, o tipo sai do endereço (Ingresse, Sympla, Guichê Web e afins são `ingresso`; o resto é `outra`), e o app diz cada página pelo que ela é. O código de quem indicou (`passkey`, `cod`, `cupom` e afins) sai do link de compra, da fonte e das páginas: é de uma pessoa, e o app é público. Por isso o lote que só aparece com código fica na descrição, fora dos lotes, e o lote com código que entrar leva `"condicoes": ["codigo"]` e não vira o "a partir de". A cidade pode vir do texto da página ou do cartaz que ela publica; a leitura diz de onde. O estilo só sai do texto que descreve o som: curadoria a partir do lineup não entra em `estilos`. Depois, `node cli.js coletar --fonte indicacao`. Exemplo fictício em `exemplos/indicacoes/`.

O preenchimento é manual de propósito: os termos do Instagram, do RA e das plataformas de ingresso não autorizam coleta automatizada (R15), e abrir dezenas de perfis por automação seria isso. Média de idade, só se a produtora a publicou, com `origem: "produtora"` e o `detalhe` de onde (R16); sem isso, fica vazia. Nada de quem indicou entra no registro nem no repositório: os arquivos ficam em `entrada/`, fora do git.

Os perfis de produtoras e casas ficam numa lista privada de quem contatar, `entrada/grupo/contatos.json`, para o convite ao envio direto. Agendas e agregadores esperam em `entrada/grupo/a-avaliar.json` até alguém ler os termos de uso; só então entram em `config/fontes.json`, ligados ou desligados com o motivo, como as outras fontes.

## Prova de conceito acadêmica: arquitetura híbrida

Decisão do Caio em 23 e 24/11/2026, com aval da instituição, para um trabalho acadêmico sem fins lucrativos. O porquê e o que fica de fora estão em `docs/pesquisa/2026-11-24-arquitetura-hibrida.md`; as contas e chaves, em `docs/operacao/2026-11-24-contas-e-chaves.md`.

```bash
node cli.js coletar --poc          # liga os conectores marcados pocAcademica nesta rodada
node cli.js coletar --fonte instagram
```

| Conector | Como | Prioridade |
|---|---|---|
| `instagram` | Único uso do Apify, no plano grátis. Posts recentes dos perfis do arquivo privado, uma vez por dia; perfis (link da bio, Linktree) uma vez por semana. O Claude Haiku lê o flyer e a legenda; os links de compra vão para a fila | 50 |
| `paginas` | Scrapling, uma vez por dia, com pausa de 2 s entre pedidos. Lê as listagens de São Paulo do Shotgun e da Sympla (próximos 14 dias), as páginas da Ingresse que chegam pela fila e as agendas das casas. Usa o schema.org e os dados da própria página; sem eles, o Claude. Bloqueio é recusa (D14): 403, 429 e 503 encerram a leitura daquela página, sem proxy nem outro modo; o Resident Advisor fica de fora | 72 |
| `sympla-apify`, `shotgun-apify`, `ra-apify` | Reserva desligada (Apify), fora do `--poc`; liga só por `--fonte <id> --poc` | 65–75 |

Decisão do Caio em 24/11/2026 (KTD17): o Apify fica só com o Instagram, e o motor inteiro custa perto de US$ 4 a 8 por mês. Cada fonte tem `intervaloHoras` no config: a agenda de 4 rodadas por dia não repete a coleta paga; `--forcar` passa por cima. Cada chamada ao Apify leva teto de itens e de gasto, lê só os campos usados, apaga o dataset na conta e grava o custo real em `uso_apify`. A leitura de flyer e página usa o mesmo teto do Claude que a classificação, e o que já foi lido pelo Claude não paga a classificação de novo. Nada de comentários, seguidores ou contatos é guardado. Das imagens, só a peça de divulgação (flyer, banner, cartaz), recodificada em WebP sem EXIF, com crédito e link da origem; foto de público não é guardada e nenhuma imagem passa por análise de rosto ou idade (D4). Os links saem sem código de indicação. A média de idade só vem declarada pela produtora ou das avaliações de quem foi (`origem: 'avaliacoes'`).

Prova de 24/11/2026, sem chave do Claude: as listagens do Shotgun e da Sympla deram 29 eventos de São Paulo em 31 páginas; 15 saíram como festa.

O leitor de páginas roda em Python 3.12 com `uv`. Uma vez por máquina:

```bash
cd coletores/paginas && uv sync --python 3.12 && uv run python -m playwright install chromium   # o Chromium do Playwright puro, sem os patches do patchright (D14)
```

Ocupa perto de 900 MB (ambiente e Chromium). O `Dockerfile` já faz esse passo, e o `fly.toml` sobe a máquina para 1 GB.

## A classificação pelo Claude

Para cada festa que chegou com texto e sem tudo estruturado, o motor pede ao Claude: se é festa, até dois estilos do catálogo, idade mínima, lineup, regras de entrada e a hora em que a pista enche, só o que o texto diz. O estilo sai só do que o texto diz do som: o nome do evento e os nomes do lineup não bastam ("Deu Samba" sem descrição do som fica sem estilo). As regras de palavras, sem a chave, seguem a mesma lei: o nome sai do texto antes da busca. O registro diz quem decidiu (`classificacao.por` e `campos.estilos.fonte`), e o app mostra o estilo das regras ou do Claude como inferência ("Parece ..., pela descrição da página"). A resposta vem em saída estruturada (`output_config.format`, esquema JSON) e é conferida campo a campo; fora do esquema, cai para regras. O texto da fonte vai entre marcas `<evento>` com a instrução de tratá-lo como dado.

Gasto:

- Antes de cada chamada, o motor estima o custo (caracteres ÷ 3 de entrada, 1.000 tokens de saída) e não chama se passar do teto da execução ou do dia. Acima do teto, o resto vai por regras e a execução registra por quê.
- Depois, grava os tokens e o custo reais em `uso_llm`.
- Festa sem mudança não volta ao modelo: o resultado fica guardado pelo hash do texto.

**Custo estimado.** Uma festa pede cerca de 600 a 1.000 tokens de entrada e 200 a 400 de saída. Com o Claude Haiku 5.5, o padrão (US$ 0,10 e US$ 0,50 por milhão), isso dá perto de US$ 0,0003 por festa nova ou alterada. A execução local de hoje classificou 3 festas, perto de US$ 0,001. Numa operação com 100 festas novas ou alteradas por dia, perto de US$ 0,03 por dia. Os tetos (US$ 0,50 por execução, US$ 2 por dia) são em dólar e valem para qualquer modelo; com o Haiku, a estimativa antes de cada chamada é de uns US$ 0,0006, então o teto da execução só morde depois de umas 800 festas. Com o Claude Opus 5.5 (`FINDE_MODELO=claude-opus-5-5`, US$ 4 e US$ 20), seria perto de US$ 0,01 por festa e o teto pararia em umas 20. Esses números são estimativa: até 10/11 o motor não fez nenhuma chamada paga, porque não havia chave.

## Uso

`GET /api/uso` (com `Authorization: Bearer $FINDE_ADMIN_TOKEN`) e `node cli.js uso` mostram o gasto com o modelo nas últimas 24 horas e 30 dias e os acessos à API por rota e cliente (`publico`, `produtora:<id>`, `admin`). Não se guarda IP.

## No Fly

Nada foi criado na conta: o primeiro deploy só acontece com o sim do Caio (passo O4 do plano de 24/11). O desenho é uma máquina só, com o banco num volume, o Litestream copiando o banco para um bucket Tigris e as imagens no mesmo volume.

**Criar, uma vez**, de dentro de `motor/`:

```bash
fly apps create finde-motor
fly volumes create finde_dados --app finde-motor --region gru --size 2
fly storage create --app finde-motor --name finde-motor-dados   # define BUCKET_NAME e as chaves como segredos
grep -E '^(APIFY_TOKEN|FINDE_ADMIN_TOKEN|FINDE_APP_TOKEN)=' ~/.config/finde/segredos.env | fly secrets import --app finde-motor --stage   # sem mostrar valor; a chave da Anthropic do Fly e o app: ver docs/operacao/2026-11-24-contas-e-chaves.md
fly deploy --app finde-motor --ha=false
```

`--ha=false` mantém **uma máquina só**: o banco é SQLite num volume e a agenda de coletas roda dentro do servidor, então duas máquinas coletariam em dobro e gastariam em dobro. Confira depois com `fly machine list --app finde-motor` (uma linha só). O `fly deploy --build-only` roda o build sem subir nada. O `fly.toml` traz `kill_timeout = 30` (o Litestream fecha a réplica antes de a máquina cair) e, no `[env]`, `FINDE_POC = "1"`, `FINDE_IMAGENS = "/data/imagens"` e `FINDE_INSTAGRAM_PERFIS = "/data/entrada/contatos.json"`. Os tetos de gasto são os de sempre (Claude US$ 0,50 por execução e US$ 2,00 por dia; Apify US$ 0,25 e 0,25): nenhuma variável de teto vai no `fly.toml`, e subir teto é decisão do Caio.

**Segredos** (só pelo `fly secrets`, nunca em arquivo do repo nem em log): `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `FINDE_ADMIN_TOKEN` e `FINDE_APP_TOKEN` (o mesmo valor no app `finde-app`, que o manda em `POST /api/avaliacoes`). O passo a passo sem mostrar valor está em `docs/operacao/2026-11-24-contas-e-chaves.md`.

**Depois do primeiro deploy**, a lista de perfis e a semente do banco sobem pelo volume, e a máquina reinicia para ler:

```bash
fly ssh console --app finde-motor -C "mkdir -p /data/entrada /data/imagens"
fly ssh sftp shell --app finde-motor      # put <local>/contatos.json /data/entrada/contatos.json
                                          # put <local>/curadoria.json /data/entrada/curadoria.json   (opcional, o lote da curadoria)
                                          # put <local>/semente.sqlite3 /data/semente.sqlite3   (opcional, ver abaixo)
fly machine restart --app finde-motor
curl -s https://finde-motor.fly.dev/saude
```

**A semente.** Para partir do banco do Mac (por exemplo, o que o `reprocessar` refez), gere a semente com `sqlite3 var/finde.sqlite3 "VACUUM INTO 'semente.sqlite3'"` (nunca `cp` de banco em WAL) e envie para `/data/semente.sqlite3`. No boot seguinte, `deploy/inicio.sh` confere a integridade, apaga o banco e o `-wal`/`-shm` velhos, move a semente para o lugar do banco e deixa `/data/semente.aplicada`; como foi movida, não é aplicada duas vezes. Semente que não passa na integridade vira `semente.sqlite3.invalida` e o banco atual segue. A primeira geração do bucket, feita com o banco vazio do primeiro boot, é descartável. A perda das imagens com o volume fica aceita e escrita: o Litestream copia só o banco, e a próxima coleta baixa as peças de novo.

**Primeira coleta**: `curl -s -X POST -H "Authorization: Bearer $FINDE_ADMIN_TOKEN" https://finde-motor.fly.dev/api/coletar` responde 202 com o id da execução (409 se já há uma rodando); `GET /api/execucoes` mostra o resumo e `GET /api/uso`, o gasto. Rodadas pagas fora da agenda (`--recuperar-instagram`, `--dias`) só com o sim do Caio.

**Operação do dia a dia**, pela CLI na máquina (`fly ssh console --app finde-motor -C "node /app/cli.js ..."`) ou no Mac contra uma cópia do banco: `corrigir` e `ocultar` (curadoria), `imagem ocultar`, `revisar`, `relatorio`. A média de idade por avaliação chega sozinha pelo `POST /api/avaliacoes`.

**Depois de 07/12/2026 (D13)**: tirar `FINDE_POC` do `[env]` do `fly.toml` e fazer `fly deploy`; as fontes da prova voltam a desligadas.

**Expurgo (D15)**, em 31/12/2026 ou na data que o Caio fixar: `node /app/cli.js expurgar --simular` (conta), depois sem `--simular` (e `--tudo` para os brutos do Instagram); no app, apagar `/data/avaliacoes.json` e `/data/imagens`; e **remover a réplica do bucket**, que ainda tem o banco de antes do expurgo (`fly storage destroy` do bucket do motor, ou apagar o prefixo `finde/` pelo console do Tigris). O expurgo do banco sozinho não basta.

Custo: uma máquina de 1 GB (o leitor de páginas abre um Chromium) com volume de 2 GB passa de US$ 4, mais o gasto com o modelo. O `Dockerfile` instala o Litestream com versão e sha256 fixos, parte de `node:24-bookworm-slim`, e traz o Pillow e o Scrapling pelo `uv.lock` (`UV_FROZEN`, `UV_NO_SYNC`: o `uv run` nunca resolve de novo na máquina). O build de verdade só se prova com `fly deploy --build-only`.

**Plano B.** Se o Fly não estiver de pé, `deploy/mac-reserva/` tem a cópia do motor para `~/Library/Application Support` (fora do TCC), o script de uma volta (coleta, export, conversor do app, envio ao volume do app) e um modelo de LaunchAgent. Está pronto e documentado, sem instalar (ver o `LEIA-ME.md` de lá).

## Testes

```bash
node --test teste/
```

Nenhum teste toca a rede nem a API paga (o `fetch` é falso e o Fly e o Apify nunca são chamados): normalização (horário que cruza a meia-noite, preço em texto, Instagram, URLs, média de idade só com origem), o registro (prioridade entre fontes, campo ausente, menor lote disponível), a classificação com um cliente falso (saída estruturada, cache, resposta inválida, erro, teto da execução e do dia, sem chave), os conectores com respostas gravadas (Mapas Culturais, iCal, exemplos de envio e de indicação, com `conferidoEm` por leitura e taxa e hora-limite de lote), o comando `indicar`, a execução de ponta a ponta (AE1 a AE5 do plano, reexecução, trava) e a API num servidor em porta efêmera (token da produtora, corpo grande, CORS, uso sem IP). A prova acadêmica tem `teste/instagram.test.js` (Apify assíncrono, teto, dataset apagado, flyer pelo Claude, fila, perfis por semana), `teste/paginas.test.js` (listagens, cidade e janela, proxy, tempo-limite que mata o navegador), `teste/plataformas.test.js` (reserva) e `teste/revisao.test.js` (as correções das duas revisões adversariais de 24/11). `teste/ligacao.test.js` cobre as correções de 19/11, com dado inventado: cidade da fonte ou vazia (bairro com UF, CEP da capital, "SP" no campo), condição do lote e o "a partir de" sem ela (gêneros juntos, negação, código), a hora do nome do lote com ou sem minutos, o código fora do link, estilo que não sai do nome (com sufixo, separador sem espaço e nome da casa), o nome público da fonte e as `paginas`.

A operação tem testes próprios: `teste/curadoria.test.js` (ocultar, corrigir, o lote de `entrada/curadoria.json`, decidir, revisar e os comandos pelo `main([...])`), `teste/avaliacoes.test.js` (o mínimo de 5 respostas de 2 convites), `teste/relatorio.test.js`, `teste/expurgar.test.js`, `teste/cli.test.js` (o export só de São Paulo, o reprocessar que não toca o `FINDE_BANCO`, as proteções das rodadas pagas), `teste/agenda.test.js` (a agenda com e sem `FINDE_POC`, a poda), `teste/servidor.test.js` (ETag e 304, `de` limitado, o "hoje" às 22h, `/imagens/`, `/api/avaliacoes`, `/api/coletar`, o id antigo) e `teste/inicio.test.js` (o `inicio.sh` com `litestream` e `node` falsos, e a leitura cruzada do Dockerfile, do `uv.lock`, do `fly.toml` e do `.dockerignore`).

## Onde está cada coisa

- `cli.js`, `servidor.js`: os comandos e a API. `nucleo/exportar.js`: o que o export e a API entregam por padrão (só São Paulo, sem ocultas, envelope e ETag).
- `nucleo/curadoria.js`, `relatorio.js`, `expurgar.js` e `fontes/curadoria.js`, `fontes/avaliacoes.js`: a curadoria, o relatório, o expurgo e as fontes de festa do tempo 4.
- `nucleo/coleta.js`: a execução. `agregar.js`: festa única e valores por fonte. `normalizar.js`: de fonte para campo. `contrato.js`: o registro R14. `classificar.js` e `custo.js`: o Claude e o teto. `agenda.js`, `banco.js`, `produtoras.js`, `uso.js`, `ambiente.js`, `bairros.js`, `catalogo.js`.
- `fontes/`: os conectores e o registro de fontes. `config/fontes.json`: o que está ligado.
- `exemplos/envios/` e `exemplos/indicacoes/`: os exemplos fictícios. `entrada/`: os envios e as indicações reais, e a lista de contatos (fora do git).
- `nucleo/indicar.js`: o comando `indicar`.
- `Dockerfile`, `fly.toml`, `deploy/`: o Fly. `deploy/mac-reserva/`: o plano B no Mac.

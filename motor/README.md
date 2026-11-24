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

| Comando | O quê |
|---|---|
| `node cli.js coletar [--fonte <id>] [--com-exemplos]` | Uma coleta agora |
| `node cli.js exportar [arquivo] [--todas] [--sem-exemplos]` | Os registros R14 num JSON (padrão `var/festas-r14.json`) |
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
| `FINDE_ADMIN_TOKEN` | (nenhum) | Libera `/api/uso` e `/api/execucoes` |
| `FINDE_CORS` | (nenhuma) | Origens que podem ler a API pelo navegador, ex.: `http://localhost:8763` |
| `FINDE_COM_EXEMPLOS` | | `1` soma os exemplos também nas coletas agendadas |
| `FINDE_FONTES` | `config/fontes.json` | Qual configuração de fontes usar |
| `APIFY_TOKEN` | (nenhum) | Liga o Apify da prova acadêmica, só para o Instagram. Vai no cabeçalho, nunca na URL |
| `FINDE_TETO_APIFY_EXECUCAO_USD`, `FINDE_TETO_APIFY_DIA_USD` | `0.25` cada | Teto de gasto no Apify por execução e por dia, somado em `uso_apify` |
| `FINDE_PROXY_URL` | (nenhum) | Proxy para as listagens marcadas `proxy: true` (hoje só o RA). Nunca vai para log ou aviso |
| `FINDE_INSTAGRAM_PERFIS` | `entrada/grupo/contatos.json` | Arquivo privado com os perfis do Instagram a acompanhar (no Fly, no volume) |
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

`GET /api/festas` devolve `{ contrato: "finde-r14/2", geradoEm, total, festas: [...] }`. Filtros: `de` e `ate` (`AAAA-MM-DD`, padrão de hoje em diante), `todas=1` (inclui o que a classificação disse que não é festa), `exemplos=0` (tira os fictícios). `GET /api/festas/:id` devolve um registro.

Cada registro:

| Campo | Conteúdo |
|---|---|
| `id` | Estável entre coletas, no formato do protótipo (`[a-z0-9-]`, até 60) |
| `nome`, `casa` | Texto |
| `produtora` | `{ nome, instagram }` |
| `endereco` | `{ texto, bairro, regiao, cidade }`; `bairro` e `regiao` com os ids do protótipo quando é um dos sete bairros dele; `cidade` só do que a fonte diz (o campo `cidade`, o CEP da capital, a cidade com UF no endereço, como "Cotia/SP", ou um trecho "São Paulo"; bairro de São Paulo seguido de SP, como "Pinheiros - SP", é São Paulo), senão `null`. A versão `/2` do contrato marca essa regra: a `/1` gravava "São Paulo" fixo |
| `data` | `AAAA-MM-DD` |
| `inicio`, `pistaCheia`, `fim` | ISO com `-03:00`; fim depois da meia-noite já cai no dia seguinte |
| `lotes` | `[{ nome, preco, disponivel, taxa?, ate?, condicoes? }]`; `disponivel` é `null` quando a fonte não diz; `taxa` em reais e `ate` (`HH:MM`, a hora em que o preço deixa de valer, também lida do nome, como "Hora Mágica (até 23:30)"), os mesmos nomes da base do protótipo; `condicoes`, o que o lote pede: `meia`, `meia-social` (também "solidário"), `feminino`, `masculino`, `comissario` e `codigo` (só aparece com um código), do nome do lote ou anotadas na leitura. Os dois gêneros no mesmo nome ("Homens e Mulheres") não são condição, e a negação ("Inteira (não é meia)") não vira meia |
| `precoAPartirDe` | `{ valor, lote, esgotadosAntes, condicoes?, genero? }`: o menor lote disponível que qualquer pessoa compra, sem meia, meia social, gênero, comissário ou código (AE3 do detalhe), ou a porta. Só lote por gênero: o mais alto, com `genero: { feminino, masculino }`. Só lote com outra condição: o menor, com `condicoes` |
| `esgotado`, `entradaNaPorta` | `true` quando todos os lotes acabaram e não há porta; `{ preco }` da porta |
| `linkCompra`, `linkEvento`, `instagram`, `cartaz` | URLs http(s) ou `null` |
| `lineup` | Lista de nomes, ou `null` quando ainda não foi divulgado |
| `estilos` | Ids do catálogo do protótipo (`house-disco`, `pop-2000`, `mpb-samba`, `funk`, `indie-rock`, `eletronica`) |
| `idadeMinima` | Número ou `null` |
| `regras` | `{ documento?, vestimenta?, lista? }` |
| `mediaIdade` | `{ valor, origem, detalhe?, avaliacoes? }` ou `null` (R16). `origem` é `produtora`, `edicoes` ou `avaliacoes` |
| `ehFesta` | O que a fonte ou a classificação disse |
| `exemplo` | `true` nos dados fictícios |
| `classificacao` | `{ por, conferidoEm }`: quem decidiu o estilo (`envio`, `claude`, `regras`...) |
| `fontes` | `[{ id, nome, url, conferidoEm }]`, para o rodapé do detalhe (R12). Na indicação, `url` é a página do ingresso lida por último (sem ela, a de onde veio o preço), sem código |
| `paginas` | `[{ tipo, nome, url, lidoEm, campos }]`: cada página que a leitura manual abriu, com o que ela é (`ingresso`, `revenda`, `materia`, `oficial`, `instagram`, `outra`) e o que se leu nela. Vazio nas outras fontes |
| `coletadoEm` | A última vez que alguma fonte confirmou a festa |
| `campos` | Para cada campo presente, `{ fonte, conferidoEm }` (R17) |

Campo que nenhuma fonte trouxe sai `null` ou lista vazia, nunca inventado. Os instantes de conferência (`conferidoEm`, `coletadoEm`) saem em ISO com `-03:00` e sem milissegundos, como na base do protótipo.

**Para o protótipo consumir.** Há dois caminhos: ler a API (com `FINDE_CORS=http://localhost:8763`, ou o servidor do protótipo buscando do lado dele) ou ler o arquivo de `node cli.js exportar`. O protótipo hoje conta as horas a partir da meia-noite do dia da festa (1h da manhã é 25); daqui sai ISO, e a conversão é `hora + 24 × dias depois da data`. Mudança no formato do registro se combina com a frente visual.

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
| `paginas` | Scrapling, uma vez por dia, com pausa de 2 s entre pedidos. Lê as listagens de São Paulo do Shotgun e da Sympla (próximos 14 dias), as páginas da Ingresse que chegam pela fila e as agendas das casas. Usa o schema.org e os dados da própria página; sem eles, o Claude. O RA devolve 403 até com navegador e só roda com `FINDE_PROXY_URL` | 72 |
| `sympla-apify`, `shotgun-apify`, `ra-apify` | Reserva desligada (Apify), fora do `--poc`; liga só por `--fonte <id> --poc` | 65–75 |

Decisão do Caio em 24/11/2026 (KTD17): o Apify fica só com o Instagram, e o motor inteiro custa perto de US$ 4 a 8 por mês. Cada fonte tem `intervaloHoras` no config: a agenda de 4 rodadas por dia não repete a coleta paga; `--forcar` passa por cima. Cada chamada ao Apify leva teto de itens e de gasto, lê só os campos usados, apaga o dataset na conta e grava o custo real em `uso_apify`. A leitura de flyer e página usa o mesmo teto do Claude que a classificação, e o que já foi lido pelo Claude não paga a classificação de novo. Nada de comentários, seguidores, contatos ou fotos de pessoas é guardado; a imagem do flyer é lida e descartada; o cartaz só vem do envio e da indicação; os links saem sem código de indicação; a média de idade continua só declarada.

Prova de 24/11/2026, sem chave do Claude: as listagens do Shotgun e da Sympla deram 29 eventos de São Paulo em 31 páginas; 15 saíram como festa.

O leitor de páginas roda em Python 3.12 com `uv`. Uma vez por máquina:

```bash
cd coletores/paginas && uv sync --python 3.12 && uv run python -m patchright install chromium   # o Chromium do patchright, não o do Playwright
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

Nada foi criado na conta. Com o sim do grupo, de dentro de `motor/`:

```bash
fly apps create finde-motor
fly volumes create finde_dados --region gru --size 1
fly storage create            # bucket Tigris; define BUCKET_NAME e as chaves como segredos
fly secrets set ANTHROPIC_API_KEY=... FINDE_ADMIN_TOKEN=...
fly deploy
```

O `Dockerfile` instala o Litestream com versão e sha256 fixos, e `deploy/inicio.sh` restaura o banco do bucket quando o volume está vazio e depois deixa o Litestream copiar cada commit (`deploy/litestream.yml`), o mesmo desenho do Phoenix. A máquina fica sempre ligada porque a agenda roda dentro dela. Uma `shared-cpu-1x` de 256 MB com volume de 1 GB custa por volta de US$ 2 a 3 por mês, mais o gasto com o modelo. O build da imagem não foi testado.

## Testes

```bash
node --test teste/
```

131 testes, nenhum toca a rede nem a API paga: normalização (horário que cruza a meia-noite, preço em texto, Instagram, URLs, média de idade só com origem), o registro (prioridade entre fontes, campo ausente, menor lote disponível), a classificação com um cliente falso (saída estruturada, cache, resposta inválida, erro, teto da execução e do dia, sem chave), os conectores com respostas gravadas (Mapas Culturais, iCal, exemplos de envio e de indicação, com `conferidoEm` por leitura e taxa e hora-limite de lote), o comando `indicar`, a execução de ponta a ponta (AE1 a AE5 do plano, reexecução, trava) e a API num servidor em porta efêmera (token da produtora, corpo grande, CORS, uso sem IP). A prova acadêmica tem `teste/instagram.test.js` (Apify assíncrono, teto, dataset apagado, flyer pelo Claude, fila, perfis por semana), `teste/paginas.test.js` (listagens, cidade e janela, proxy, tempo-limite que mata o navegador), `teste/plataformas.test.js` (reserva) e `teste/revisao.test.js` (as correções das duas revisões adversariais de 24/11). `teste/ligacao.test.js` cobre as correções de 19/11, com dado inventado: cidade da fonte ou vazia (bairro com UF, CEP da capital, "SP" no campo), condição do lote e o "a partir de" sem ela (gêneros juntos, negação, código), a hora do nome do lote com ou sem minutos, o código fora do link, estilo que não sai do nome (com sufixo, separador sem espaço e nome da casa), o nome público da fonte e as `paginas`.

## Onde está cada coisa

- `cli.js`, `servidor.js`: os comandos e a API.
- `nucleo/coleta.js`: a execução. `agregar.js`: festa única e valores por fonte. `normalizar.js`: de fonte para campo. `contrato.js`: o registro R14. `classificar.js` e `custo.js`: o Claude e o teto. `agenda.js`, `banco.js`, `produtoras.js`, `uso.js`, `ambiente.js`, `bairros.js`, `catalogo.js`.
- `fontes/`: os conectores e o registro de fontes. `config/fontes.json`: o que está ligado.
- `exemplos/envios/` e `exemplos/indicacoes/`: os exemplos fictícios. `entrada/`: os envios e as indicações reais, e a lista de contatos (fora do git).
- `nucleo/indicar.js`: o comando `indicar`.
- `Dockerfile`, `fly.toml`, `deploy/`: o Fly.

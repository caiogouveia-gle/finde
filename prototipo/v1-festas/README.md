# Finde, protótipo v1 (festas)

Guia de festas do fim de semana em São Paulo para quem tem de 28 a 35 anos. A porta de entrada é a landing do manual de marca; o protótipo (o app) é a segunda etapa, aberta a partir dela. No ar, cada um tem o seu endereço: a landing em https://finde.fly.dev e o app em https://finde-app.fly.dev. Para desenvolver, os dois sobem juntos, a landing em `/` e o app em `/app`. No app, a pessoa responde seis perguntas, recebe três festas, cada uma com a "% a sua cara", ajusta a lista em uma frase, abre a festa para conferir tudo o que iria buscar no Instagram, na plataforma de ingresso e no mapa, e só então manda pro grupo. É o fluxo do vídeo 2, com a marca de `docs/marca.md`. Substitui o v0 (`../v0-conversa`), que segue intocado.

## Rodar

Node 24, sem dependência e sem build.

```
node servidor.js
```

Abre em `http://localhost:8763`, na landing. O app fica em `http://localhost:8763/app`. Para o celular na mesma rede, `http://<ip-do-computador>:8763`.

- `FINDE_PORTA`: porta (padrão 8763).
- `FINDE_DADOS`: a base (padrão `dados/festas.json`). Linhas inválidas são ignoradas uma a uma, com aviso no log. Se o arquivo faltar, o app sobe com a lista vazia e diz isso. A base é relida quando o arquivo muda.
- `FINDE_REAIS`: as festas reais (padrão `dados/reais.json`, ver "As festas reais"). Se o arquivo faltar, o app segue só com a base fictícia, como antes.
- `FINDE_VAR`: onde ficam os convites (padrão `var/`, arquivo `planos.json`, gravado de forma atômica), a última lista boa do motor (`reais-cache.json`), as avaliações (`avaliacoes.json` e `avaliacoes-sal`, 0600) e o cache dos flyers (`imagens/`). No Fly, `/data`, no volume.
- `FINDE_MOTOR_URL`: a base viva (ver "A base viva"). No Fly, `http://finde-motor.internal:8080`. Sem ela, as reais vêm só de `FINDE_REAIS`.
- `FINDE_TILES`: o endereço dos tiles do mapa (padrão `https://tile.openstreetmap.org/{z}/{x}/{y}.png`). Vai para o `<meta name="finde-tiles">` do app e a origem dele, só ela, para o `img-src` da CSP do app. Trocar de provedor é trocar a variável e reiniciar.
- `FINDE_APP_TOKEN` e `FINDE_ADMIN_TOKEN`: segredos, só por variável (`fly secrets`), nunca em arquivo. O primeiro manda as avaliações ao motor; o segundo abre `GET /api/reais/estado`. Os dois são comparados em tempo constante.
- `FINDE_SITE`: o que sobe. Sem ela, tudo junto (o jeito de desenvolver e o dos testes). `landing`: só a landing. `app`: só o app, na raiz.
- `FINDE_URL_APP`: para onde vão as portas da landing (padrão `/app`; em `app`, `/`). Com `FINDE_SITE=landing`, tem de ser o endereço completo do app (`https://...`).
- `FINDE_URL_SITE`: a landing, para onde vão o wordmark e o "Voltar" do app (padrão `/`). Com `FINDE_SITE=app`, tem de ser o endereço completo da landing.

O servidor troca `__URL_SITE__` e `__URL_APP__` por esses endereços, escapados para HTML, em toda página que serve. Para simular os dois endereços numa máquina só:

```
FINDE_PORTA=8941 FINDE_SITE=landing FINDE_URL_APP=http://127.0.0.1:8942/ node servidor.js
FINDE_PORTA=8942 FINDE_SITE=app FINDE_URL_SITE=http://127.0.0.1:8941/ node servidor.js
```

## Rotas

Tudo junto (sem `FINDE_SITE`):

| Rota | O que abre |
|---|---|
| `/` | A landing, a porta de entrada |
| `/app` | O app: as seis perguntas, a lista, o detalhe da festa e o envio ao grupo |
| `/app?festa=<id>` | O app direto no detalhe de uma festa, sem pedido (link direto; a landing não tem mais links para festas) |
| `/p/:id` | O convite que o grupo recebe |
| `GET /api/festa/<id>` | Os dados de uma festa, para o detalhe aberto por `/app?festa=<id>` |

Só a landing (`FINDE_SITE=landing`, finde.fly.dev): `/` serve a landing, com os arquivos que ela pede e mais nada. `/app` (com ou sem barra e com a query) vai para `FINDE_URL_APP` com 302, levando a query; `/p/<id>` vai com 301 para o mesmo caminho no endereço do app, e os convites antigos continuam abrindo. A API dá 404, e página que não existe dá um 404 em HTML com o caminho para o app.

Só o app (`FINDE_SITE=app`, finde-app.fly.dev): `/` e `/app` servem o app; `/p/<id>`, a API, `/fora.html` e os estáticos do app continuam. A landing não é servida aqui.

As outras rotas da API estão no fim deste arquivo.

## Testar

```
node --test teste/
```

Testes de: base (validação e cobertura), registro do detalhe (`teste/registro.test.js`: campos do contrato `finde-r14/2`, preço contra lotes, links só `https`, congelamento, relógio da base fictícia), texto do detalhe (`teste/festa-texto.test.js`: porta, lote esgotado, grátis, lineup não divulgado, média ausente, tempo relativo, fontes, destino dos links), motor (filtros, estilo como critério, patrocinada, afrouxamento, lista vazia com oferta, ordem por horário, determinismo), `entender` (mais de 30 frases reais de ajuste), conversa de ponta a ponta (um teste para cada defeito da revisão), convites (nome repetido, escrita atômica), a API num servidor em porta efêmera (path traversal, corpo grande, nome com HTML, CSP, 404 e metas de compartilhamento em `/p/:id`), a landing (`teste/landing.test.js`: o que `/` serve, as quatro portas para o app, o cartão do herói e a demo tirados da base, nada que colete dado, nada inline para a CSP, a base vazia, `/app`, `/api/festa/<id>`, o `landing.css` sem raio fora do celular desenhado, sem gradiente nem sombra, e o movimento), as correções da ligação com o motor (`teste/ligacao.test.js`, com dado inventado: cidade e o export `/1` recusado, preço sem lote de condição, teto pelo lote que vale na hora de chegar, som inferido, páginas lidas, nome da fonte, e o endereço e o ingresso montados num DOM de mentira), as festas reais (`teste/reais.test.js`: o conversor, o filtro do que passou pelo relógio de São Paulo, a próxima data do dia, a mistura e a marca de exemplo, a "% a sua cara" sem dado, o servidor sem o arquivo, com arquivo quebrado e com reais, o convite de real que passou, convites antigos e o arquivo fora do git e dentro da imagem), os dois endereços (`teste/sites.test.js`: `FINDE_SITE`, os redirecionamentos, o que cada modo serve e não serve, o referrer da landing, os dois `fly.toml`, o `X-Robots-Tag` e a CSP com os tiles), a "% a sua cara" (`teste/cara.test.js`), o contrato `/3` do lado do app (`teste/contrato-r14-3.test.js`: a conversão igual à fixture, o `/2` na mesma forma, o `/1` recusado e o export real reexportado, quando o retrato do banco está na máquina), a base viva (`teste/fonte-motor.test.js`, com um motor falso em porta local: cache, 304, cada falha que mantém a lista, o boot a frio e a reserva), as avaliações (`teste/avaliacoes.test.js`: sem nome, uma por pessoa e por aparelho, pendência que sobrevive ao reinício) e o `.ics` (`teste/ics.test.js`). O "Voltar" que sai do app é testado com uma história de mentira em `teste/festa-texto.test.js`.

## As festas reais

Decisão de 19/11/2026: o app mostra as festas reais que o motor (`../../motor`) coleta, e a base fictícia fica de reserva. Para levar o export do motor ao app, um comando:

```
(cd ../../motor && node cli.js exportar)   # grava motor/var/festas-r14.json
node ferramentas/reais.js                  # grava dados/reais.json
```

`ferramentas/reais.js [export] [destino] [--imagens <pasta>]` lê o export `finde-r14/3` (ou o `/2`, na transição; o `/1` é recusado: ele gravava "São Paulo" fixo na cidade), grava em `dados/reais.json` só os registros que o app aceita, do jeito que o motor mandou, lista o que ficou fora e por quê e fecha com o funil por motivo ("funil: 57 no export, 41 entram; fora: 12 cidade não confirmada na página, 4 não é festa."). As imagens das festas aceitas vão de `motor/var/imagens` para `dados/imagens/`, e as que saíram são apagadas, menos as citadas por convite de festa que não passou. Os dois têm dado real: ficam fora do git (regras no `.gitignore` da raiz do repositório) e dentro da imagem do Fly, porque o `Dockerfile` copia `dados/` e o `.dockerignore` não o tira. Para publicar com as festas novas sem o motor no ar, rode o comando antes do `fly deploy`. O servidor relê o arquivo quando ele muda e aceita também o export cru (`FINDE_REAIS=../../motor/var/festas-r14.json`).

**A base viva (24/11/2026, R23).** Com `FINDE_MOTOR_URL`, o app lê `GET /api/festas?exemplos=0&de=<hoje − 7>` do motor (hoje em São Paulo; as passadas recentes ficam para o link e o convite dizerem que passaram), com 3 s de limite, `If-None-Match` e validade de 10 minutos contada a cada pedido: o app no Fly dorme, então não há timer, e o pedido que chega depois da validade dispara a atualização por trás e é servido com a lista que já está em memória. A lista só troca por outra boa: 500, demora, JSON quebrado, contrato que o app não aceita e lista vazia mantêm a última, e o log diz cada mudança de estado uma vez. A última lista boa fica em `$FINDE_VAR/reais-cache.json`; no boot, ela é a lista até o motor responder, e sem ela vale `dados/reais.json`. O primeiro pedido depois do boot espera a lista nova até 2 s. Uma festa unida no motor continua abrindo pelo id antigo (`idsAntigos`). `GET /api/reais/estado` (com `Authorization: Bearer $FINDE_ADMIN_TOKEN`) diz de onde vem a lista, de quando é e o último erro. A landing sozinha nunca fala com o motor.

`nucleo/reais.js` converte cada registro para o formato da base (a forma do `/3` está em `teste/dados/festa-r14-3-convertida.json`): o dia é o da noite (`dataDaNoite`: a festa de 0h30 de sábado é da sexta, às 24h30; sem ela, a mesma conta do motor), e qualquer dia entra, para o "hoje" (quem escolhe o que mostrar é a lista); a data fica em `data`; o ISO vira as horas do app (hora + 24 × dias depois da data); bairro e região só quando o motor deu um dos 14 ids do catálogo, com o nome que o motor leu em `bairroNome` (Vila Leopoldina aponta para lapa e continua se chamando Vila Leopoldina); casa que é o nome da cidade vira `null`, e produtora igual à casa não se repete; o endereço só quando diz mais que "São Paulo"; a média só com a origem (produtora, edições ou avaliações); o preço do teto é o "a partir de" calculado dos lotes pela mesma regra do motor (`FT.preco`): o menor lote que qualquer pessoa compra, sem meia, meia social, gênero, comissário ou código, ou o mais alto quando só há lote por gênero, com centavos quando tem; no teto e na "% a sua cara", o lote com hora ("R$ 45 até as 20h") não vale para quem chega depois dela (`motor.precoPara`); o estilo que veio das regras ou do Claude sai marcado (`estilosInferidos`) e aparece como "Parece ..., pela descrição da página"; a fonte `indicacao` aparece como "Lido na página do ingresso"; as `paginas` lidas à mão passam ao rodapé ("Fontes Matéria (Billboard Brasil): data, preço e lineup, lida há 1h; Página do ingresso (Ingresse): horário e lugar, lida há 2h.") e o ingresso diz de onde veio o preço ("Preço lido na matéria da Billboard Brasil, há 1h; não conferido na página do ingresso."); fontes e campos passam como vieram. No `/3`, as peças de divulgação vêm em `imagens` (só `<sha16>-480|1080.webp`, servidas pelo app em `/imagens/`, com crédito e a origem https do post ou da página) e o `cartaz` é a principal; o ponto da festa vem em `local` (só dentro da caixa de São Paulo, com a precisão e a origem); cada fonte traz o `vinculo` (o porquê da junção); `encontradaEm` lista as fontes que descobriram a festa (sem quem só leu ou corrigiu); `divergencias`, `idsAntigos`, `precoConferidoEm`, `atualizadoEm` (o `geradoEm` do envelope) e, na média por avaliação, `avaliacaoIdade` (`avaliacoes`, `naMedida`, `faixa`, `convites`). O cartaz do `/2` é uma URL de fora, que a CSP não carrega: fica em `cartazExterno` e nunca vira imagem. A festa sem início entra com `horarioIncerto: true`, e a esgotada com `esgotado: true`. Fica fora a festa com `ehFesta: false`, a de exemplo do motor, a oculta pela curadoria, a sem data, a de outra cidade e a de cidade que a fonte não diz (o app é um guia de São Paulo; ver `docs/decisoes.md`, 19/11; desde 24/11 a cidade pode vir do cadastro da casa, D6) e a que já passou. Passou quando acabou: o fim informado ou, sem ele, as 6h do dia seguinte, no relógio de cada pedido (e não de quando o servidor subiu). A régua é a mesma na lista, no link e no convite, então a festa de sábado que vai até de manhã continua aberta à 1h30. A real cujo id repete o de uma fictícia fica fora, com aviso no log.

**A lista (24/11/2026, D11, KTD15).** Sem festa real nenhuma, o app é o protótipo de antes: as fictícias, com a "% a sua cara". Com real vigente, `POST /api/festas` responde na forma de `teste/dados/resposta-festas-r14-3.json`, montada por `nucleo/lista.js`: até 3 reais recomendadas em `opcoes`, as demais do dia em `maisDoDia`, a contagem das reais dos outros dias de quinta a domingo da mesma semana em `outrosDias`, e as fictícias só quando o dia pedido não tem real, em `exemplos`, marcadas e sem %. O pedido aceita `semana: "proxima"` (dentro dos critérios ou ao lado deles) e a conversa a mantém. `base` diz de onde vem a lista (`{ atualizadoEm, total, perfis, sites }`, para "Atualizado há 3 h · 41 festas lidas de 50 perfis e 3 sites de ingresso"). A fictícia leva a marca em tudo que sai do app, porque no grupo ninguém vê o rodapé: "Exemplo · festa fictícia" no cartão de mandar e no convite, "Exemplo · " no título da prévia do link, "Festa fictícia, exemplo do protótipo." na descrição e uma linha na mensagem do WhatsApp.

**A festa real não recebe nada inventado.** O que falta aparece como vazio: "local não divulgado" no cartão, "Produtora não informada.", "Casa não divulgada.", "Endereço não divulgado. Confira na página do ingresso.", "média não informada" ao lado da hora, "Som não informado.", "A hora de acabar não foi divulgada.", cada vazio uma vez só no detalhe. No ingresso, o preço é o de qualquer pessoa, e a meia ou a meia social vem numa linha à parte ("Meia social: R$ 220, General Admission (+1 kg)."); só lote por gênero mostra os dois ("R$ 130 fem. · R$ 160 masc."); o lote com código vai numa linha à parte ("Com código: R$ 120, Pré venda.") e não vira o preço. Sem a pista cheia, a régua do horário usa o começo; sem o fim, a régua do detalhe não aparece, e no lugar dela fica à vista "Pista cheia não informada. A hora de acabar não foi divulgada.". O fim da festa real não conta contra quando passa da sua volta (dá pra sair antes, e a que não informa o fim passaria inteira): o cartão diz "vai até as 6h; dá pra sair antes". O fim cedo demais, antes de você chegar, vale para as duas. Quando o pedido perguntou bairro, preço ou som e a festa não diz, ela sai do bloco do pedido para "Quase no seu pedido", com "Bairro não informado." no aviso. Na "% a sua cara", critério sem dado entra como "Sem dado" e conta pela metade, como um "quase": a porcentagem diz "sem todos os dados", com a frase "Sem dado, conta pela metade: a idade.". Assim nenhuma festa com dado faltando chega a 100%, e a que só informa o horário não passa na frente da que informa tudo.

**Convites.** Os convites guardam a festa inteira de quando foram criados, então os antigos, de festas fictícias, seguem abrindo. O convite de uma real grava a data dela e o fim (sem fim informado, as 6h do dia seguinte); depois disso, abre dizendo "Essa já foi." O link `/app?festa=<id>` de uma real que passou abre "Essa festa já passou." A prévia do link de um convite de festa real com flyer usa a versão 1080 dele (`__IMAGEM_COMPARTILHAR__` no `plano.html`); a fictícia segue com `compartilhar.png`.

**Avaliação pós-festa (R34, KTD13).** Depois da festa, quem disse "tô dentro" responde "O público tinha a sua idade?" e a própria idade (`POST /api/planos/:id/avaliacao`); sem idade, não conta. O app guarda em `$FINDE_VAR/avaliacoes.json` só `{ chave, aparelho, planoId, festaId, resposta, idade, em }`: `chave` é um HMAC-SHA256 de convite + nome em minúsculas com o sal de `avaliacoes-sal` (0600), truncado em 16, e o aparelho também só como HMAC. Uma por nome e uma por aparelho em cada festa. O lote da festa real vai ao motor (`POST $FINDE_MOTOR_URL/api/avaliacoes`, `Bearer $FINDE_APP_TOKEN`, `{ festaId, avaliacoes: [{ chave, festaId, aparelho, plano, resposta, idade, em }] }`); falha fica pendente no arquivo e vai na próxima resposta ou na próxima subida. Festa fictícia (a demonstração) nunca sai do app. O convite diz para que serve, que é opcional e até quando fica guardada (31/12/2026, D15); `expurgar()` em `nucleo/avaliacoes.js` apaga tudo.

**Imagens e buscador (D4, KTD14, KTD17).** `GET /imagens/<sha16>-(480|1080).webp` serve só os hashes da base atual ou de convite de festa que não passou, de `$FINDE_VAR/imagens`, de `dados/imagens/` ou, na falta, do motor (gravado com tmp e rename; só WebP de até 4 MB), com `Cache-Control: public, max-age=86400`. A cada lista nova, o cache perde o que saiu: uma imagem ocultada no motor dá 404 aqui na atualização seguinte. Toda resposta do site `app` leva `X-Robots-Tag: noindex, noimageindex`, e `publico/robots.txt` fecha só `/imagens/` e `/api/` (fechar `/` impediria o buscador de ler o `noindex`). A landing não muda.

**O funil e a fixture do export (U37, R38).** `node ferramentas/funil.js [export] [--agora <ISO>] [--semana AAAA-MM-DD]... [--json]` aplica os cortes do conversor e o "já passou" e conta as reais de quinta a domingo das semanas das apresentações (03–06/12 e 10–13/12, a meta é 5 por dia) e de hoje, com o motivo de cada corte. `node ferramentas/anonimizar.js <export>` gera `motor/teste/dados/export-anonimo.json`: a forma e as lacunas do export real, com nomes, casas, endereços, perfis, URLs, créditos e coordenadas fictícios (o `motor/teste/anonimo.test.js` confere que nada do real ficou). `teste/contrato-cruzado.test.js` liga os dois lados de verdade: o banco do motor em memória, uma execução sem rede, `listarRegistros` e o `converterRegistro` daqui; todo campo do motor chega à festa ou está numa lista `IGNORADOS` com o porquê, e campo novo sem decisão falha.

## A landing

O desenho novo da chefe de design (23/11/2026; resumo em `docs/marca.md`), sempre em modo dia, e a porta para o app. O servidor monta o cartão do herói e o celular da demo com festas da base fictícia; `landing.js` cuida da demo, do menu do celular e do movimento. De cima para baixo:

1. **Menu fixo:** o wordmark, "Guia da semana · Nº 01", as três seções (Demo, Como funciona, Instagram) e o D "Abrir o app". No celular, as seções ficam atrás de um botão (só com JavaScript).
2. **Herói:** o título "Festas que começam no seu horário, com gente da sua idade", o D "Achar a minha festa", que abre o app na primeira pergunta, e o C "ou siga @heyfinde", que desce ao Instagram. Ao lado, a foto de uso (`publico/uso-sofa.jpg`: três amigas no sofá com a lista do app no celular, a tela composta sobre a foto do desenho e salva como uma imagem só) e, sobre ela, o cartão da Sexta Sem Pressa: data da próxima sexta, 18h00, nome, a média com a origem, "Tô dentro" (desce à demo, na tela da festa) e "Exemplo · festa fictícia". Numa coluna, o cartão fica embaixo da foto, sem cobrir o celular.
3. **Demo em três toques:** os passos à esquerda e um celular desenhado com três telas: a lista da semana (quatro festas fictícias, cada média com a origem), a festa (começa, enche, acaba, a média) e o convite no grupo, com as respostas chegando e "Abrir o app". Sem JavaScript, as telas correm de lado com o dedo.
4. **Como funciona:** a foto dos lambes (`publico/lambes.jpg`, recortada sem os cartazes com "a pista abre antes"), "Do sofá à pista" e os três pilares.
5. **Manifesto e Instagram**, em bordô: "still going out. just differently.", "Sair continua no plano. Virar a noite, nem tanto.", e @heyfinde com o D do modo noite.
6. **Rodapé:** o wordmark, as seções, "Abrir o app" e a nota do protótipo, montada pelo servidor.

São quatro portas para o app (menu, botão do herói, fim da demo e rodapé), todas para a primeira pergunta. O formulário de e-mail saiu com o desenho novo; a seção de depoimentos continua fora. Os botões são o D e o C da prancha de teste. O que mais o protótipo faz diferente do desenho está em `docs/marca.md`.

## O fluxo do app

Em `/app` (no ar, na raiz de finde-app.fly.dev). A boas-vindas saiu: quem chega veio da landing e começa na primeira pergunta. O wordmark leva à landing. O "Voltar" da primeira pergunta volta pela história para de onde a pessoa veio, a landing ou o convite (por "Ver outras festas do fim de semana"), e ela reaparece na rolagem em que estava; sem nenhuma das duas antes (link colado, aba nova), vai pelo link à landing. Com a landing em outro endereço, quem diz que a entrada anterior é ela é o referrer: só a página da landing manda a própria origem.

1. **Seis perguntas, uma por tela**, presas embaixo, ao alcance do polegar: dia; janela de horário (17h às 23h, 19h à 1h, 22h às 3h); onde, com bairros em chips por zona que se somam e "São Paulo inteira" marcado de saída e exclusivo; a faixa de idade em que a pessoa se sente bem, num seletor de dois pontos de 18 a 50 (padrão 28 a 35), que se arrasta, anda pelas setas do teclado e por botões de passo, e diz "mínimo, 30 anos" ao leitor de tela; teto (R$ 50, R$ 80, R$ 150, sem limite); estilo, opcional e múltiplo. Um toque numa resposta única já avança; pelo teclado, setas escolhem e Enter confirma. A faixa é flexível: festa com média fora dela aparece depois, com aviso.
2. **Resultado como a programação da noite**: o pedido vira frase ("Sábado, das 19h à 1h, gente de 30 a 35, até R$ 80.") e cada trecho reabre só aquela pergunta. As festas vêm em blocos: primeiro as que cabem; depois, rotuladas, as de bairros vizinhos ("Perto de Pinheiros e do Centro"), as que furam o pedido em som, horário ou preço ("Quase no seu pedido") e as de média fora da faixa ("Fora da sua faixa", com "Média 27, um pouco abaixo da sua faixa"). Nada que fure o pedido fica misturado com o que cabe. Em cada bloco, em ordem de horário, cada festa traz a hora, quando a pista enche, a média com a origem, o nome, a casa, o preço a partir de, a "% a sua cara" e o aviso quando ela fura o pedido. O item inteiro é tocável e abre o detalhe; a lista não manda nada pro grupo. A conversa ajusta em uma frase, com atalhos; o Finde responde curto e diz o que entrou e o que saiu. Quando nada cabe, ele diz o que travou e oferece soltar; "sim" aceita.
3. **Detalhe da festa**, na ordem do plano (`docs/plans/2026-11-10-1248-feat-detalhe-da-festa-plan.md`): data, hora grande, a frase do horário e uma régua das 15h às 3h com a festa, a pista cheia e a janela pedida; a média de idade com a origem e quando foi conferida; a "% a sua cara", com a explicação do que cabe no pedido; o cartaz em miniatura ao lado do nome, da produtora e da casa, a frase do curador, o endereço e "Abrir no mapa"; o ingresso (menor lote disponível, os lotes, "1º lote esgotado", entrada na porta ou grátis, e onde comprar); os links da produtora (Instagram e página do evento, com o nome do serviço; o que falta aparece como não informado); as regras para entrar; o som e o lineup ("Lineup ainda não divulgado." quando não saiu); e de onde vêm os dados, com "conferido há X h". Uma barra fixa no pé leva "Comprar · R$ X" (só quando há venda online) e "Mandar pro grupo". Voltar devolve a lista na mesma rolagem; recarregar no detalhe mantém o detalhe. Aberto por `/app?festa=<id>`, por link direto, o detalhe vem sem pedido e, por isso, sem a porcentagem e sem a janela pedida na régua; "Voltar" leva à landing, e "Mandar pro grupo" continua valendo. Festa que saiu da base mostra "Essa festa saiu." e um botão para começar o pedido.
4. **Mandar pro grupo**: a tela já é a prévia do convite ("Convite de [nome]", "Bora no *sábado?*"). Criado o convite, aparece a prévia da mensagem do WhatsApp e o botão para mandar. Em `/p/:id`, quem recebe vê a festa (hora, média com origem, nome, casa, preço) e responde "tô dentro" ou "não rola"; abaixo da resposta, o cartaz com o endereço e o mapa, o ingresso e os links da produtora; os nomes aparecem, a página se atualiza a cada 4 s (pausa com a aba oculta), e nome repetido pergunta "É você?" antes de trocar a resposta. O servidor preenche o título e a descrição de compartilhamento com a festa.

**Por que confirmação e não votação.** No v0 o grupo votava entre três opções. No v1 a comparação já acontece no app, com o filtro e a conversa; o que o grupo faz no vídeo é topar ou não ("Achei essa, bora?", "Tô dentro."). Por isso o convite leva uma festa só e pede confirmação. Quem manda pode deixar o nome e já entra como "tô dentro".

## Sem festa fictícia

Desde 24/11/2026 o app não mostra a base fictícia (`dados/festas.json`): dia sem festa responde vazio, com um aviso, e o formulário traz `exemplos: false`. `FINDE_EXEMPLOS=1` devolve os exemplos; os testes que passam `dados` continuam com eles. A landing ainda usa a fictícia no cartão do herói e na demo.

`/app?ver=lista&dia=<id>&data=<AAAA-MM-DD>` abre a lista do dia sem as perguntas, com pedido neutro e sem a "% a sua cara" (é o "Ver outras festas" do convite e o "Voltar" de um link direto). O QR Code de divulgação aponta para `/?de=qr`; `medir.js` conta `chegou-qr` e tira a marca do endereço.

## Os números da validação

Cada site (a landing e o app) guarda os seus no próprio volume: `validacao-uso.jsonl`, `validacao-opinioes.json`, `validacao-lista.json` e o sal, todos 0600. O painel junta os dois e o motor:

```bash
set -a; . ~/.config/finde/segredos.env; set +a
node ferramentas/numeros.js
node ferramentas/numeros.js --lista ~/Documents/ChatGPT/Finde/lista.csv
```

Os dois sites precisam do mesmo `FINDE_ADMIN_TOKEN` nos segredos do Fly. A lista em CSV só grava fora do repositório.

## O motor

`nucleo/motor.js` é puro e determinístico. Filtros duros: dia, janela de horário, hora de voltar (quando a pessoa diz "volto até as 23h"), teto de preço, estilos recusados e bairro longe dos marcados. A faixa de idade do formulário (`idade: { min, max }`) não tira festa: ordena, e quem fica fora vai para o bloco da faixa. Os bairros (`bairros`, vazio é São Paulo inteira) entram em camadas: os marcados primeiro, depois os vizinhos (mesma região ou até 12 min de carro). Cada opção sai com `bloco` (`pedido`, `perto`, `quase` ou `faixa`), nessa ordem. Sem `idade`, vale a faixa fixa de antes (`faixa`), que a conversa ainda usa; "mais velha" troca o intervalo pela faixa seguinte. A janela tem tolerância declarada: o esquenta da festa pode cair até 1 h antes do início da janela e até 1 h antes do fim, e a festa precisa durar 2 h depois que a pessoa chega.

O estilo pedido é critério: primeiro entram as festas que casam com ele; se não chegam a três, a lista se completa com o som mais parecido e o aviso diz isso numa frase. Quando sobram menos de três, o motor afrouxa nesta ordem (horário com 2 h de folga, preço um degrau acima, faixa vizinha) e diz só o que foi afrouxado. O que a pessoa ajustou de propósito na conversa fica firme; se isso esvazia a lista, o Finde diz o que travou e oferece o menor degrau que resolve.

Patrocinadas: no máximo duas na base, no máximo uma por resultado, sempre por último, marcadas, e só quando cabem no pedido sem afrouxar, casam com o estilo pedido e são tão aderentes quanto a editorial que tirariam.

## "% a sua cara"

`nucleo/cara.js` diz quanto cada festa bate com o pedido. A lista continua sendo a do motor, na mesma ordem, e a porcentagem entra como um campo a mais em cada opção. Os pesos são horário 30, idade 25, bairro 20, preço 15 e som 10. Critério que a pessoa não pediu (nenhum som marcado, São Paulo inteira, sem teto, idade de 18 a 50) sai da conta, e os pesos dos outros se redistribuem. O que fica perto de caber conta pela metade: até 1 h fora da janela, até 2 anos fora da faixa, bairro vizinho, até 20% acima do teto. Cada critério vem com uma frase, e é essa explicação que o detalhe mostra.

A porcentagem só existe diante de um pedido. Por isso aparece no resultado e no detalhe do app, e fica fora da landing e do detalhe aberto por `/app?festa=<id>`.

## Onde trocar por um modelo de linguagem

`nucleo/entender.js` transforma a frase do ajuste em mudança de critérios, por regras, sem modelo. É o ponto de troca: um modelo receberia a frase e os critérios atuais e devolveria o mesmo `{ mudar, pedidos }`. As respostas do Finde (`nucleo/conversa.js`) e o motor continuariam iguais. Clima ("algo mais tranquilo") e tipo de casa ("nada de rooftop") ainda ficam de fora; o Finde diz o que entende.

## O registro da festa

Cada festa de `dados/festas.json` traz, além dos campos que o motor do protótipo usa (horas em número, `dia`, `mediaIdade` com `origemIdade`, `preco`), os campos do contrato `finde-r14/2` da frente do motor (`motor/nucleo/contrato.js`), com os mesmos nomes: `endereco`, `lotes`, `entradaNaPorta`, `linkCompra`, `linkEvento`, `instagram`, `cartaz`, `lineup`, `idadeMinima`, `regras`, `fontes`, `campos` (fonte e `conferidoEm` por campo), `coletadoEm` e `exemplo`. Todos podem faltar: ausente vale `null` e aparece como ausente, nunca inventado. O `preco` tem de ser o menor lote disponível (ou o da porta). Festa sem lote disponível e sem porta é recusada, porque o motor do protótipo não filtra preço nulo.

A base fictícia diz `"ficticia": true` e uma `referencia`: ao ler, o servidor desloca todos os carimbos pela diferença até agora (e relê a cada 30 min), para "conferido há 2 h" continuar verdade no dia da apresentação. Com `exemplo: true`, os links externos passam por `/fora.html`, que diz para onde a pessoa iria, sem abrir o perfil de ninguém de verdade; abrem em aba nova, e "Voltar pra festa" fecha a aba.

## Imagens

`publico/favicon.svg` (o monograma "f." com o contorno real da Fraunces itálica 300, SOFT 100, WONK 1), `publico/icone-180.png` (apple-touch-icon) e `publico/compartilhar.png` (1200 × 630) foram gerados fora do projeto. O favicon e o ícone saíram de um script avulso com `@napi-rs/canvas` e a Fraunces baixada do Google Fonts. A imagem de compartilhamento (16/11/2026) é um HTML com as fontes locais de `publico/fontes/`, renderizado no Chrome headless: wordmark, rótulo e título da landing sobre nude, e a assinatura numa coluna bordô. Ela não leva hora nem média de festa, porque também é a prévia de todo convite em `/p/:id`. Só os arquivos gerados ficam aqui.

`publico/cartazes/<id>.webp` (720 × 900, 37 arquivos, 0,72 MB) são cartazes tipográficos fictícios, um por festa, como uma produtora pequena postaria: sete famílias de composição pelo som, fontes do sistema do Mac, nenhuma foto, nome ou marca reais. Foram gerados por um script avulso com `@napi-rs/canvas`, fora do projeto.

## O que é fictício

As festas reais vêm de `dados/reais.json` (ver "As festas reais"). Todas as 37 festas, produtoras, casas, endereços, lineups e cartazes de `dados/festas.json` são inventados. As casas são descritas de forma genérica ("terraço em Pinheiros", "galpão na Barra Funda"). Os minutos entre bairros são aproximações. As duas patrocinadas (Clube Varanda e Noite Aurora) também são fictícias. O cartão do herói e a demo, na landing, saem da mesma base. A landing diz no rodapé que as festas dela são fictícias; as telas do app dizem o mesmo quando não há festa real, e "festas reais; as marcadas como exemplo são fictícias" quando há; a página de saída (`fora.html`), que não tem rodapé, diz no texto que as festas do protótipo são inventadas.

## O que ficou de fora

Conta, login, pagamento, venda de ingresso, mapa dentro do app, localização do aparelho, painel das produtoras e a origem real da idade do público (a maior hipótese a validar, ver `docs/conceito.md`). Os convites vivem num arquivo JSON, bom para a demonstração e não para muita gente ao mesmo tempo.

Da landing desenhada: a seção de depoimentos (até haver falas reais aprovadas) e a "% a sua cara" na tela do app da foto do herói.

## Onde está cada coisa

- `servidor.js`: os três jeitos de subir (`FINDE_SITE`), a landing (montada aqui, com o cartão do herói e a demo tirados da base), o app, estáticos, API, página do convite, os redirecionamentos entre os dois endereços, cabeçalhos de segurança (CSP só com `'self'`, sem script inline; as fontes são servidas de `publico/fontes/`).
- `fly.toml` (a landing, app `finde` do Fly) e `fly.app.toml` (o app, `finde-app`), com a mesma imagem (`Dockerfile`). Cada um diz no topo como publicar.
- `nucleo/catalogo.js`: dias, janelas, faixas, tetos, estilos e afinidade entre eles, bairros, minutos entre bairros e a escrita de horário e preço.
- `nucleo/base.js`: validação da base.
- `nucleo/motor.js`, `nucleo/entender.js`, `nucleo/conversa.js`, `nucleo/planos.js`.
- `nucleo/cara.js`: a "% a sua cara".
- `nucleo/reais.js`: as festas reais (conversão do `finde-r14/3` e do `/2`, o resumo do export); `nucleo/lista.js`: o relógio e a lista; `ferramentas/reais.js`, o comando que grava `dados/reais.json` e copia as imagens.
- `nucleo/fonte-motor.js`: a base viva (o motor, o cache e a reserva); `nucleo/rotas-app.js`: as rotas novas do app (estado da base, agenda, avaliação, imagens) e as contas do formulário (os dias com data e os 14 bairros); `nucleo/avaliacoes.js`: as avaliações pós-festa; `nucleo/ics.js`: o `.ics` do "Pôr na agenda".
- `publico/`: `landing.html`, `landing.css` e `landing.js` (a landing), `index.html` e `app.js` (o app: perguntas, resultado, detalhe, envio), `plano.html` e `plano.js` (convite), `festa-texto.js` (as frases do detalhe, sem DOM, testadas no Node), `comum.js` (peças comuns e os blocos da festa), `fora.html` e `fora.js` (a página de saída), `tema.js` (modo dia e noite), `app.css`, `fontes/` (Fraunces, Instrument Serif e DM Sans, com a licença) e `cartazes/`.

## API

- `GET /api/formulario` → perguntas, opções e contagem, as zonas com os 14 bairros (com `reais` quando o bairro tem festa na semana), a faixa de idade (`{ min: 18, max: 50, padrao: { min: 28, max: 35 } }`), `dias` (desta semana) e `semanas: { esta, proxima }`, cada dia `{ id, semana, data, rotulo: "Sexta, 27 nov", hoje, reais }` ("Hoje, sexta" uma vez só; "hoje" sem real vai para o fim; dia que passou fica fora), e `base` (de onde vem a lista, ou `null` sem real).
- `POST /api/festas` `{ criterios }` → `{ criterios, pedido, pedidoPartes, opcoes, aviso?, oferta?, resposta }`. Cada opção traz a festa inteira (com o registro do detalhe), a `data` (AAAA-MM-DD) e a `cara` (`{ pct, partes }`, a "% a sua cara" com a frase de cada critério).
- `GET /api/festa/<id>` → `{ opcao }`, uma festa no mesmo formato de um item de `opcoes`, sem pedido e sem `cara`. Um id antigo (festa unida no motor) acha a festa nova. 404 quando a festa não está na base ou o id não tem o formato de um (com `passou: true` quando é uma real que já passou); 405 para outro método.
- `GET /api/festa/<id>/agenda.ics` e `GET /p/<id>/agenda.ics` → "Pôr na agenda" (`text/calendar; charset=utf-8`, como anexo); o do convite leva o link dele. Festa sem fim acaba às 6h; sem início, vira o dia inteiro.
- `POST /api/planos/:id/avaliacao` `{ nome, aparelho, resposta: "mais-novo" | "na-medida" | "mais-velho", idade }` → 201 `{ conta: true, avaliacoes: { total, convites } }`; 409 antes da festa ou repetida; 403 para quem não disse "tô dentro"; 400 sem idade.
- `GET /api/reais/estado` (Bearer `FINDE_ADMIN_TOKEN`) → de onde vem a base viva.
- `POST /api/uso` `{ evento, aparelho }` → 204. A contagem sem nome (`nucleo/validacao.js`, `publico/medir.js`): a página aberta (`abriu-landing`, `abriu-app`, `abriu-convite`, `abriu-opiniao`) e os passos (`lista`, `detalhe`, `ingresso`, `link-fora`, `mandar`, `convite`, `whatsapp`, `convite-resposta`, `landing-app`). Guarda o evento e um HMAC do id do navegador; nada de IP, nome ou cookie.
- `POST /api/opiniao` `{ nota: 0..10, texto?, aparelho, de }` → `{ ok }`. Vale a última nota de cada aparelho. A página é `/opiniao` (no app; na landing, 302 para lá).
- `POST /api/lista` `{ email, de, site, sair? }` → `{ ok, ja }` ou `{ ok, saiu }`. `site` é a isca: preenchido, some calado. A lista não guarda o aparelho, para o e-mail não se ligar à nota nem ao uso. Sem JavaScript, o formulário da landing posta como formulário comum e volta para `/?lista=ok|saiu|erro|espera#lista`.
- Os três POSTs recusam pedido de outro site (`Sec-Fetch-Site: cross-site` ou `Origin` de fora: 403) e corpo que não é JSON (415; o formulário sem JavaScript é a exceção). Limites: 600 eventos de uso por minuto por IP; opinião e lista, 60 por IP e 6 por pessoa (IP mais aparelho ou e-mail) a cada dez minutos. Corte vai para o log. Tudo isso sai no expurgo do D15 (`ferramentas/expurgar.js`, nos dois apps).
- `GET /api/numeros` e `GET /api/numeros/lista.csv` (Bearer `FINDE_ADMIN_TOKEN`) → o resumo do site (pessoas, passos, por dia, a nota e os comentários, o tamanho da lista) e os e-mails.
- `GET /imagens/<sha16>-(480|1080).webp` → o flyer (ver "Imagens e buscador").
- `GET /robots.txt` (só o app).
- `POST /api/conversa` `{ criterios, texto, atuais: [ids] }` → o mesmo, mais `entendeu`, `entraram`, `sairam`.
- `POST /api/planos` `{ criterios, festa, autor? }` → `{ id, url }`.
- `GET /api/planos/:id` → convite com `dentro` e `fora`; depois da festa, `podeAvaliar`, `avaliacoes: { total, convites }` (sem nomes) e `finalidadeAvaliacao`.
- `POST /api/planos/:id/respostas` `{ nome, resposta: "dentro" | "fora", confirmar? }`. Nome repetido sem `confirmar` dá 409 com "Já tem Ju na lista. É você?".
- `GET /p/:id` → página do convite.
- `GET /` → a landing (tudo junto e só a landing) ou o app (só o app). `GET /app` → o app; com `?festa=<id>`, direto no detalhe da festa. Só a landing: 302 para o endereço do app.

## Lista de e-mails: a saída

A landing não fala em cancelar perto do campo: a saída mora no link de cada e-mail, como fazem Substack, Stripe Press e Meio. **Todo e-mail mandado para a lista tem que trazer no rodapé o link `https://finde.fly.dev/?lista=sair`** (texto sugerido: "Não quer mais receber? Sair da lista"). Essa página vem do servidor no modo de remover e funciona sem JavaScript.

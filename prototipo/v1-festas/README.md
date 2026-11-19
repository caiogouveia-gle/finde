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
- `FINDE_VAR`: onde ficam os convites (padrão `var/`, arquivo `planos.json`, gravado de forma atômica).
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

Testes de: base (validação e cobertura), registro do detalhe (`teste/registro.test.js`: campos do contrato `finde-r14/2`, preço contra lotes, links só `https`, congelamento, relógio da base fictícia), texto do detalhe (`teste/festa-texto.test.js`: porta, lote esgotado, grátis, lineup não divulgado, média ausente, tempo relativo, fontes, destino dos links), motor (filtros, estilo como critério, patrocinada, afrouxamento, lista vazia com oferta, ordem por horário, determinismo), `entender` (mais de 30 frases reais de ajuste), conversa de ponta a ponta (um teste para cada defeito da revisão), convites (nome repetido, escrita atômica), a API num servidor em porta efêmera (path traversal, corpo grande, nome com HTML, CSP, 404 e metas de compartilhamento em `/p/:id`), a landing (`teste/landing.test.js`: o que `/` serve, as quatro portas para o app, o convite do herói como ilustração, a saída da lista da semana, o formulário de e-mail sem envio, a base vazia, `/app`, `/api/festa/<id>` e o `landing.css` sem raio, gradiente nem sombra), as correções da ligação com o motor (`teste/ligacao.test.js`, com dado inventado: cidade e o export `/1` recusado, preço sem lote de condição, teto pelo lote que vale na hora de chegar, som inferido, páginas lidas, nome da fonte, e o endereço e o ingresso montados num DOM de mentira), as festas reais (`teste/reais.test.js`: o conversor, o filtro do que passou pelo relógio de São Paulo, a próxima data do dia, a mistura e a marca de exemplo, a "% a sua cara" sem dado, o servidor sem o arquivo, com arquivo quebrado e com reais, o convite de real que passou, convites antigos e o arquivo fora do git e dentro da imagem), os dois endereços (`teste/sites.test.js`: `FINDE_SITE`, os redirecionamentos, o que cada modo serve e não serve, o referrer da landing, os dois `fly.toml`) e a "% a sua cara" (`teste/cara.test.js`). O "Voltar" que sai do app é testado com uma história de mentira em `teste/festa-texto.test.js`.

## As festas reais

Decisão de 19/11/2026: o app mostra as festas reais que o motor (`../../motor`) coleta, e a base fictícia fica de reserva. Para levar o export do motor ao app, um comando:

```
(cd ../../motor && node cli.js exportar)   # grava motor/var/festas-r14.json
node ferramentas/reais.js                  # grava dados/reais.json
```

`ferramentas/reais.js [export] [destino]` lê o export `finde-r14/2` (o `/1` é recusado: ele gravava "São Paulo" fixo na cidade), grava em `dados/reais.json` só os registros que o app aceita, do jeito que o motor mandou, e lista o que ficou fora e por quê. O arquivo tem dado real: fica fora do git (regra no `.gitignore` da raiz do repositório) e dentro da imagem do Fly, porque o `Dockerfile` copia `dados/` e o `.dockerignore` não o tira. Para publicar com as festas novas, rode o comando antes do `fly deploy`. O servidor relê o arquivo quando ele muda e aceita também o export cru (`FINDE_REAIS=../../motor/var/festas-r14.json`).

`nucleo/reais.js` converte cada registro para o formato da base: a data vira o dia da semana (e fica guardada em `data`); o ISO vira as horas do app (hora + 24 × dias depois da data); bairro e região só quando o motor deu um dos sete ids do catálogo; o endereço só quando diz mais que "São Paulo"; a média só com a origem (produtora, edições ou avaliações); o preço do teto é o "a partir de" calculado dos lotes pela mesma regra do motor (`FT.preco`): o menor lote que qualquer pessoa compra, sem meia, meia social, gênero, comissário ou código, ou o mais alto quando só há lote por gênero, com centavos quando tem; no teto e na "% a sua cara", o lote com hora ("R$ 45 até as 20h") não vale para quem chega depois dela (`motor.precoPara`); o estilo que veio das regras ou do Claude sai marcado (`estilosInferidos`) e aparece como "Parece ..., pela descrição da página"; a fonte `indicacao` aparece como "Lido na página do ingresso"; as `paginas` lidas à mão passam ao rodapé ("Fontes Matéria (Billboard Brasil): data, preço e lineup, lida há 1h; Página do ingresso (Ingresse): horário e lugar, lida há 2h.") e o ingresso diz de onde veio o preço ("Preço lido na matéria da Billboard Brasil, há 1h; não conferido na página do ingresso."); fontes e campos passam como vieram. O cartaz do motor é uma URL de fora, e a CSP só carrega imagem do próprio app: a festa real fica sem cartaz (guardado em `cartazExterno`). Fica fora a festa com `ehFesta: false`, a de exemplo do motor, a sem data ou sem início, a de outra cidade e a de cidade que a fonte não diz (o app é um guia de São Paulo; ver `docs/decisoes.md`, 19/11), a esgotada, a de segunda a quinta e a que já passou. Passou quando acabou: o fim informado ou, sem ele, as 6h do dia seguinte, no relógio de cada pedido (e não de quando o servidor subiu). A régua é a mesma na lista, no link e no convite, então a festa de sábado que vai até de manhã continua aberta à 1h30. A real cujo id repete o de uma fictícia fica fora, com aviso no log.

**A mistura.** Para o dia pedido, valem as reais da próxima data desse dia (hoje conta); se ela não tem nenhuma, as da semana seguinte, e o cartão mostra a data ("sáb, 28 nov"). O motor escolhe entre as reais e, separado, entre as fictícias; a lista põe as reais primeiro e completa até três com fictícias. Com festa real vigente no servidor, toda fictícia sai com `exemplo: true` e aparece marcada: o carimbo "Exemplo" no cartão, o trecho "Exemplos · ..." na lista e "Exemplo · festa fictícia" no topo do detalhe. A fala do Finde diz o que é real e o que é exemplo, e o rodapé passa a "Protótipo · festas reais; as marcadas como exemplo são fictícias". Com a mistura, o título conta só as reais que cabem ("Duas pro seu sábado."); sem nenhuma real na lista, ele diz "Exemplos pro seu domingo.". No convite, o rodapé diz se a festa é real. A fictícia leva a marca em tudo que sai do app, porque no grupo ninguém vê o rodapé: "Exemplo · festa fictícia" no cartão de mandar e no convite, "Exemplo · " no título da prévia do link, "Festa fictícia, exemplo do protótipo." na descrição e uma linha na mensagem do WhatsApp.

**A festa real não recebe nada inventado.** O que falta aparece como vazio: "local não divulgado" no cartão, "Produtora não informada.", "Casa não divulgada.", "Endereço não divulgado. Confira na página do ingresso.", "média não informada" ao lado da hora, "Som não informado.", "A hora de acabar não foi divulgada.", cada vazio uma vez só no detalhe. No ingresso, o preço é o de qualquer pessoa, e a meia ou a meia social vem numa linha à parte ("Meia social: R$ 220, General Admission (+1 kg)."); só lote por gênero mostra os dois ("R$ 130 fem. · R$ 160 masc."); o lote com código vai numa linha à parte ("Com código: R$ 120, Pré venda.") e não vira o preço. Sem a pista cheia, a régua do horário usa o começo; sem o fim, a régua do detalhe não aparece, e no lugar dela fica à vista "Pista cheia não informada. A hora de acabar não foi divulgada.". O fim da festa real não conta contra quando passa da sua volta (dá pra sair antes, e a que não informa o fim passaria inteira): o cartão diz "vai até as 6h; dá pra sair antes". O fim cedo demais, antes de você chegar, vale para as duas. Quando o pedido perguntou bairro, preço ou som e a festa não diz, ela sai do bloco do pedido para "Quase no seu pedido", com "Bairro não informado." no aviso. Na "% a sua cara", critério sem dado entra como "Sem dado" e conta pela metade, como um "quase": a porcentagem diz "sem todos os dados", com a frase "Sem dado, conta pela metade: a idade.". Assim nenhuma festa com dado faltando chega a 100%, e a que só informa o horário não passa na frente da que informa tudo.

**Convites.** Os convites guardam a festa inteira de quando foram criados, então os antigos, de festas fictícias, seguem abrindo. O convite de uma real grava a data dela e o fim (sem fim informado, as 6h do dia seguinte); depois disso, abre dizendo "Essa já foi." O link `/app?festa=<id>` de uma real que passou abre "Essa festa já passou."

## A landing

O desenho da prancha 08 do manual (`docs/marca.md`), sempre em modo dia, com menos do que o desenho: a lista da semana saiu (decisão de 17/11/2026), e a landing é a porta para o app. O servidor monta a página com o convite tirado da base; `landing.js` só cuida do formulário. De cima para baixo:

1. **Cabeçalho:** o wordmark e o link "Abrir o app".
2. **Hero:** o título "Festas que começam no seu horário, com gente da sua idade", o botão "Achar a minha festa", que abre o app na primeira pergunta, e o link "ou receba a lista por e-mail", que desce até o formulário. Ao lado, o convite em bordô da festa fictícia Sexta Sem Pressa, com a data da próxima sexta, três anotações (de onde vem a média de idade, a hora que a festa começa, enche e acaba, e a resposta do grupo no próprio convite) e a legenda "Exemplo de convite · festa fictícia". O convite é ilustração: nada nele é link nem botão, e "Tô dentro" e "Não rola" são miniaturas, menores que o botão do herói, fora da árvore de acessibilidade, com um rótulo para o conjunto. Lado a lado, a coluna de texto tem a altura do cartão: o rótulo na linha do topo dele e as ações do herói fechando na linha de baixo, não na de "Tô dentro".
3. **Três pilares:** horário primeiro, convite para o grupo, com a sua cara. Depois deles, o link "Achar a minha festa", de novo para o app.
4. **Faixa do manifesto:** "still going out. just differently."
5. **Formulário de e-mail**, só visual: o campo não tem `name` e o formulário não tem `action`. Com um e-mail válido, avisa "Isto é um protótipo: seu e-mail não foi enviado nem guardado." Sem JavaScript, o botão fica desligado.
6. **Rodapé:** o wordmark, São Paulo, "Protótipo · festas fictícias" e "Abrir o app".

São quatro portas para o app (cabeçalho, botão do herói, link depois dos pilares e rodapé), todas para a primeira pergunta. A seção de depoimentos do desenho ficou de fora até haver falas reais aprovadas. Os botões são o D (principal) e o C (secundário) da prancha de teste de botões: retângulo sem raio em caixa alta e link com fio rosé e seta. O que mais o protótipo faz diferente do desenho está em `docs/marca.md`.

## O fluxo do app

Em `/app` (no ar, na raiz de finde-app.fly.dev). A boas-vindas saiu: quem chega veio da landing e começa na primeira pergunta. O wordmark leva à landing. O "Voltar" da primeira pergunta volta pela história para de onde a pessoa veio, a landing ou o convite (por "Ver outras festas do fim de semana"), e ela reaparece na rolagem em que estava; sem nenhuma das duas antes (link colado, aba nova), vai pelo link à landing. Com a landing em outro endereço, quem diz que a entrada anterior é ela é o referrer: só a página da landing manda a própria origem.

1. **Seis perguntas, uma por tela**, presas embaixo, ao alcance do polegar: dia; janela de horário (17h às 23h, 19h à 1h, 22h às 3h); onde, com bairros em chips por zona que se somam e "São Paulo inteira" marcado de saída e exclusivo; a faixa de idade em que a pessoa se sente bem, num seletor de dois pontos de 18 a 50 (padrão 28 a 35), que se arrasta, anda pelas setas do teclado e por botões de passo, e diz "mínimo, 30 anos" ao leitor de tela; teto (R$ 50, R$ 80, R$ 150, sem limite); estilo, opcional e múltiplo. Um toque numa resposta única já avança; pelo teclado, setas escolhem e Enter confirma. A faixa é flexível: festa com média fora dela aparece depois, com aviso.
2. **Resultado como a programação da noite**: o pedido vira frase ("Sábado, das 19h à 1h, gente de 30 a 35, até R$ 80.") e cada trecho reabre só aquela pergunta. As festas vêm em blocos: primeiro as que cabem; depois, rotuladas, as de bairros vizinhos ("Perto de Pinheiros e do Centro"), as que furam o pedido em som, horário ou preço ("Quase no seu pedido") e as de média fora da faixa ("Fora da sua faixa", com "Média 27, um pouco abaixo da sua faixa"). Nada que fure o pedido fica misturado com o que cabe. Em cada bloco, em ordem de horário, cada festa traz a hora, quando a pista enche, a média com a origem, o nome, a casa, o preço a partir de, a "% a sua cara" e o aviso quando ela fura o pedido. O item inteiro é tocável e abre o detalhe; a lista não manda nada pro grupo. A conversa ajusta em uma frase, com atalhos; o Finde responde curto e diz o que entrou e o que saiu. Quando nada cabe, ele diz o que travou e oferece soltar; "sim" aceita.
3. **Detalhe da festa**, na ordem do plano (`docs/plans/2026-11-10-1248-feat-detalhe-da-festa-plan.md`): data, hora grande, a frase do horário e uma régua das 15h às 3h com a festa, a pista cheia e a janela pedida; a média de idade com a origem e quando foi conferida; a "% a sua cara", com a explicação do que cabe no pedido; o cartaz em miniatura ao lado do nome, da produtora e da casa, a frase do curador, o endereço e "Abrir no mapa"; o ingresso (menor lote disponível, os lotes, "1º lote esgotado", entrada na porta ou grátis, e onde comprar); os links da produtora (Instagram e página do evento, com o nome do serviço; o que falta aparece como não informado); as regras para entrar; o som e o lineup ("Lineup ainda não divulgado." quando não saiu); e de onde vêm os dados, com "conferido há X h". Uma barra fixa no pé leva "Comprar · R$ X" (só quando há venda online) e "Mandar pro grupo". Voltar devolve a lista na mesma rolagem; recarregar no detalhe mantém o detalhe. Aberto por `/app?festa=<id>`, por link direto, o detalhe vem sem pedido e, por isso, sem a porcentagem e sem a janela pedida na régua; "Voltar" leva à landing, e "Mandar pro grupo" continua valendo. Festa que saiu da base mostra "Essa festa saiu." e um botão para começar o pedido.
4. **Mandar pro grupo**: a tela já é a prévia do convite ("Convite de [nome]", "Bora no *sábado?*"). Criado o convite, aparece a prévia da mensagem do WhatsApp e o botão para mandar. Em `/p/:id`, quem recebe vê a festa (hora, média com origem, nome, casa, preço) e responde "tô dentro" ou "não rola"; abaixo da resposta, o cartaz com o endereço e o mapa, o ingresso e os links da produtora; os nomes aparecem, a página se atualiza a cada 4 s (pausa com a aba oculta), e nome repetido pergunta "É você?" antes de trocar a resposta. O servidor preenche o título e a descrição de compartilhamento com a festa.

**Por que confirmação e não votação.** No v0 o grupo votava entre três opções. No v1 a comparação já acontece no app, com o filtro e a conversa; o que o grupo faz no vídeo é topar ou não ("Achei essa, bora?", "Tô dentro."). Por isso o convite leva uma festa só e pede confirmação. Quem manda pode deixar o nome e já entra como "tô dentro".

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

As festas reais vêm de `dados/reais.json` (ver "As festas reais"). Todas as 37 festas, produtoras, casas, endereços, lineups e cartazes de `dados/festas.json` são inventados. As casas são descritas de forma genérica ("terraço em Pinheiros", "galpão na Barra Funda"). Os minutos entre bairros são aproximações. As duas patrocinadas (Clube Varanda e Noite Aurora) também são fictícias. O convite do herói, na landing, sai da mesma base. A landing diz "Protótipo · festas fictícias" no rodapé (o convite dela é fictício); as telas do app dizem o mesmo quando não há festa real, e "festas reais; as marcadas como exemplo são fictícias" quando há; a página de saída (`fora.html`), que não tem rodapé, diz no texto que as festas do protótipo são inventadas.

## O que ficou de fora

Conta, login, pagamento, venda de ingresso, mapa dentro do app, localização do aparelho, painel das produtoras e a origem real da idade do público (a maior hipótese a validar, ver `docs/conceito.md`). Os convites vivem num arquivo JSON, bom para a demonstração e não para muita gente ao mesmo tempo.

Da landing desenhada: a lista da semana (saiu em 17/11/2026), o envio da lista por e-mail (o formulário é só visual), a seção de depoimentos (até haver falas reais aprovadas) e o hero com foto, que é um teste do manual.

## Onde está cada coisa

- `servidor.js`: os três jeitos de subir (`FINDE_SITE`), a landing (montada aqui, com o convite tirado da base), o app, estáticos, API, página do convite, os redirecionamentos entre os dois endereços, cabeçalhos de segurança (CSP só com `'self'`, sem script inline; as fontes são servidas de `publico/fontes/`).
- `fly.toml` (a landing, app `finde` do Fly) e `fly.app.toml` (o app, `finde-app`), com a mesma imagem (`Dockerfile`). Cada um diz no topo como publicar.
- `nucleo/catalogo.js`: dias, janelas, faixas, tetos, estilos e afinidade entre eles, bairros, minutos entre bairros e a escrita de horário e preço.
- `nucleo/base.js`: validação da base.
- `nucleo/motor.js`, `nucleo/entender.js`, `nucleo/conversa.js`, `nucleo/planos.js`.
- `nucleo/cara.js`: a "% a sua cara".
- `nucleo/reais.js`: as festas reais (conversão do `finde-r14/2`, o relógio, a mistura); `ferramentas/reais.js`, o comando que grava `dados/reais.json`.
- `publico/`: `landing.html`, `landing.css` e `landing.js` (a landing), `index.html` e `app.js` (o app: perguntas, resultado, detalhe, envio), `plano.html` e `plano.js` (convite), `festa-texto.js` (as frases do detalhe, sem DOM, testadas no Node), `comum.js` (peças comuns e os blocos da festa), `fora.html` e `fora.js` (a página de saída), `tema.js` (modo dia e noite), `app.css`, `fontes/` (Fraunces, Instrument Serif e DM Sans, com a licença) e `cartazes/`.

## API

- `GET /api/formulario` → perguntas, opções e contagem, as zonas com os bairros e a faixa de idade (`{ min: 18, max: 50, padrao: { min: 28, max: 35 } }`).
- `POST /api/festas` `{ criterios }` → `{ criterios, pedido, pedidoPartes, opcoes, aviso?, oferta?, resposta }`. Cada opção traz a festa inteira (com o registro do detalhe), a `data` (AAAA-MM-DD) e a `cara` (`{ pct, partes }`, a "% a sua cara" com a frase de cada critério).
- `GET /api/festa/<id>` → `{ opcao }`, uma festa no mesmo formato de um item de `opcoes`, sem pedido e sem `cara`. 404 quando a festa não está na base ou o id não tem o formato de um; 405 para outro método.
- `POST /api/conversa` `{ criterios, texto, atuais: [ids] }` → o mesmo, mais `entendeu`, `entraram`, `sairam`.
- `POST /api/planos` `{ criterios, festa, autor? }` → `{ id, url }`.
- `GET /api/planos/:id` → convite com `dentro` e `fora`.
- `POST /api/planos/:id/respostas` `{ nome, resposta: "dentro" | "fora", confirmar? }`. Nome repetido sem `confirmar` dá 409 com "Já tem Ju na lista. É você?".
- `GET /p/:id` → página do convite.
- `GET /` → a landing (tudo junto e só a landing) ou o app (só o app). `GET /app` → o app; com `?festa=<id>`, direto no detalhe da festa. Só a landing: 302 para o endereço do app.

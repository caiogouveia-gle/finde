# Finde, protótipo v1 (festas)

Guia de festas do fim de semana em São Paulo para quem tem de 28 a 35 anos. A primeira tela é a landing do manual de marca, em `/`. O app fica em `/app`: a pessoa responde seis perguntas, recebe três festas, cada uma com a "% a sua cara", ajusta a lista em uma frase, abre a festa para conferir tudo o que iria buscar no Instagram, na plataforma de ingresso e no mapa, e só então manda pro grupo. É o fluxo do vídeo 2, com a marca de `docs/marca.md`. Substitui o v0 (`../v0-conversa`), que segue intocado.

## Rodar

Node 24, sem dependência e sem build.

```
node servidor.js
```

Abre em `http://localhost:8763`, na landing. O app fica em `http://localhost:8763/app`. Para o celular na mesma rede, `http://<ip-do-computador>:8763`.

- `FINDE_PORTA`: porta (padrão 8763).
- `FINDE_DADOS`: a base (padrão `dados/festas.json`). Linhas inválidas são ignoradas uma a uma, com aviso no log. Se o arquivo faltar, o app sobe com a lista vazia e diz isso. A base é relida quando o arquivo muda.
- `FINDE_VAR`: onde ficam os convites (padrão `var/`, arquivo `planos.json`, gravado de forma atômica).

## Rotas

| Rota | O que abre |
|---|---|
| `/` | A landing, primeira tela do protótipo |
| `/app` | O app: as seis perguntas, a lista, o detalhe da festa e o envio ao grupo |
| `/app?festa=<id>` | O app direto no detalhe de uma festa. É para onde leva cada linha da lista da landing |
| `/p/:id` | O convite que o grupo recebe |
| `GET /api/festa/<id>` | Os dados de uma festa, para o detalhe aberto por `/app?festa=<id>` |

As outras rotas da API estão no fim deste arquivo.

## Testar

```
node --test teste/
```

Testes de: base (validação e cobertura), registro do detalhe (`teste/registro.test.js`: campos do contrato `finde-r14/1`, preço contra lotes, links só `https`, congelamento, relógio da base fictícia), texto do detalhe (`teste/festa-texto.test.js`: porta, lote esgotado, grátis, lineup não divulgado, média ausente, tempo relativo, fontes, destino dos links), motor (filtros, estilo como critério, patrocinada, afrouxamento, lista vazia com oferta, ordem por horário, determinismo), `entender` (mais de 30 frases reais de ajuste), conversa de ponta a ponta (um teste para cada defeito da revisão), convites (nome repetido, escrita atômica), a API num servidor em porta efêmera (path traversal, corpo grande, nome com HTML, CSP, 404 e metas de compartilhamento em `/p/:id`), a landing e as rotas novas (`teste/landing.test.js`: o que `/` serve, o convite do hero, o formulário de e-mail sem envio, a seleção e as linhas da lista da semana, a base vazia, `/app`, `/api/festa/<id>` e o `landing.css` sem raio, gradiente nem sombra) e a "% a sua cara" (`teste/cara.test.js`).

## A landing

Em `/`, o desenho da prancha 08 do manual (`docs/marca.md`), sempre em modo dia, como no desenho. O servidor monta a página com o convite e a lista tirados da base; `landing.js` só filtra a lista por dia e cuida do formulário. De cima para baixo:

1. **Cabeçalho:** o wordmark e o link "Entrar na lista", que desce até o formulário.
2. **Hero:** o título "Festas que começam no seu horário, com gente da sua idade", o botão "Ver as festas da semana", que abre o app na primeira pergunta, e o link "ou receba a lista por e-mail". Ao lado, o convite em bordô da festa fictícia Sexta Sem Pressa, com a data da próxima sexta, e três anotações: de onde vem a média de idade, a hora que a festa começa, enche e acaba, e a resposta do grupo no próprio convite.
3. **A lista da semana**, com filtro por dia (Todas, Sex, Sáb, Dom). Entram as festas editoriais com média de 28 a 35 anos que começam até as 20h, em ordem de dia e hora: oito em Todas, divididas entre os três dias, e até oito em cada dia. Patrocinada não entra, porque a linha não tem como dizer que é. Cada linha traz a hora, o dia, o nome, a casa, o preço e a média com a origem, e abre o detalhe da festa em `/app?festa=<id>`. A lista não mostra a "% a sua cara": sem pedido, não há o que calcular. No fim do painel, "Deixar com a sua cara" abre o app.
4. **Três pilares:** lista pronta, convite para o grupo, com a sua cara.
5. **Faixa do manifesto:** "still going out. just differently."
6. **Formulário de e-mail**, só visual: o campo não tem `name` e o formulário não tem `action`. Com um e-mail válido, avisa "Isto é um protótipo: seu e-mail não foi enviado nem guardado." Sem JavaScript, o botão fica desligado.
7. **Rodapé:** o wordmark, São Paulo e "Protótipo · festas fictícias".

A seção de depoimentos do desenho ficou de fora até haver falas reais aprovadas. Os botões são o D (principal) e o C (secundário) da prancha de teste de botões: retângulo sem raio em caixa alta e link com fio rosé e seta. O que mais o protótipo faz diferente do desenho está em `docs/marca.md`.

## O fluxo do app

Em `/app`. A boas-vindas saiu: quem chega veio da landing e começa na primeira pergunta. O wordmark e o "Voltar" da primeira pergunta levam de volta à landing.

1. **Seis perguntas, uma por tela**, presas embaixo, ao alcance do polegar: dia; janela de horário (17h às 23h, 19h à 1h, 22h às 3h); onde, com bairros em chips por zona que se somam e "São Paulo inteira" marcado de saída e exclusivo; a faixa de idade em que a pessoa se sente bem, num seletor de dois pontos de 18 a 50 (padrão 28 a 35), que se arrasta, anda pelas setas do teclado e por botões de passo, e diz "mínimo, 30 anos" ao leitor de tela; teto (R$ 50, R$ 80, R$ 150, sem limite); estilo, opcional e múltiplo. Um toque numa resposta única já avança; pelo teclado, setas escolhem e Enter confirma. A faixa é flexível: festa com média fora dela aparece depois, com aviso.
2. **Resultado como a programação da noite**: o pedido vira frase ("Sábado, das 19h à 1h, gente de 30 a 35, até R$ 80.") e cada trecho reabre só aquela pergunta. As festas vêm em blocos: primeiro as que cabem; depois, rotuladas, as de bairros vizinhos ("Perto de Pinheiros e do Centro"), as que furam o pedido em som, horário ou preço ("Quase no seu pedido") e as de média fora da faixa ("Fora da sua faixa", com "Média 27, um pouco abaixo da sua faixa"). Nada que fure o pedido fica misturado com o que cabe. Em cada bloco, em ordem de horário, cada festa traz a hora, quando a pista enche, a média com a origem, o nome, a casa, o preço a partir de, a "% a sua cara" e o aviso quando ela fura o pedido. O item inteiro é tocável e abre o detalhe; a lista não manda nada pro grupo. A conversa ajusta em uma frase, com atalhos; o Finde responde curto e diz o que entrou e o que saiu. Quando nada cabe, ele diz o que travou e oferece soltar; "sim" aceita.
3. **Detalhe da festa**, na ordem do plano (`docs/plans/2026-11-10-1248-feat-detalhe-da-festa-plan.md`): data, hora grande, a frase do horário e uma régua das 15h às 3h com a festa, a pista cheia e a janela pedida; a média de idade com a origem e quando foi conferida; a "% a sua cara", com a explicação do que cabe no pedido; o cartaz em miniatura ao lado do nome, da produtora e da casa, a frase do curador, o endereço e "Abrir no mapa"; o ingresso (menor lote disponível, os lotes, "1º lote esgotado", entrada na porta ou grátis, e onde comprar); os links da produtora (Instagram e página do evento, com o nome do serviço; o que falta aparece como não informado); as regras para entrar; o som e o lineup ("Lineup ainda não divulgado." quando não saiu); e de onde vêm os dados, com "conferido há X h". Uma barra fixa no pé leva "Comprar · R$ X" (só quando há venda online) e "Mandar pro grupo". Voltar devolve a lista na mesma rolagem; recarregar no detalhe mantém o detalhe. Aberto por `/app?festa=<id>`, a partir da lista da landing, o detalhe vem sem pedido e, por isso, sem a porcentagem e sem a janela pedida na régua; "Voltar" leva à landing, e "Mandar pro grupo" continua valendo. Festa que saiu da base mostra "Essa festa saiu." e um botão para começar o pedido.
4. **Mandar pro grupo**: a tela já é a prévia do convite ("Convite de [nome]", "Bora no *sábado?*"). Criado o convite, aparece a prévia da mensagem do WhatsApp e o botão para mandar. Em `/p/:id`, quem recebe vê a festa (hora, média com origem, nome, casa, preço) e responde "tô dentro" ou "não rola"; abaixo da resposta, o cartaz com o endereço e o mapa, o ingresso e os links da produtora; os nomes aparecem, a página se atualiza a cada 4 s (pausa com a aba oculta), e nome repetido pergunta "É você?" antes de trocar a resposta. O servidor preenche o título e a descrição de compartilhamento com a festa.

**Por que confirmação e não votação.** No v0 o grupo votava entre três opções. No v1 a comparação já acontece no app, com o filtro e a conversa; o que o grupo faz no vídeo é topar ou não ("Achei essa, bora?", "Tô dentro."). Por isso o convite leva uma festa só e pede confirmação. Quem manda pode deixar o nome e já entra como "tô dentro".

## O motor

`nucleo/motor.js` é puro e determinístico. Filtros duros: dia, janela de horário, hora de voltar (quando a pessoa diz "volto até as 23h"), teto de preço, estilos recusados e bairro longe dos marcados. A faixa de idade do formulário (`idade: { min, max }`) não tira festa: ordena, e quem fica fora vai para o bloco da faixa. Os bairros (`bairros`, vazio é São Paulo inteira) entram em camadas: os marcados primeiro, depois os vizinhos (mesma região ou até 12 min de carro). Cada opção sai com `bloco` (`pedido`, `perto`, `quase` ou `faixa`), nessa ordem. Sem `idade`, vale a faixa fixa de antes (`faixa`), que a conversa ainda usa; "mais velha" troca o intervalo pela faixa seguinte. A janela tem tolerância declarada: o esquenta da festa pode cair até 1 h antes do início da janela e até 1 h antes do fim, e a festa precisa durar 2 h depois que a pessoa chega.

O estilo pedido é critério: primeiro entram as festas que casam com ele; se não chegam a três, a lista se completa com o som mais parecido e o aviso diz isso numa frase. Quando sobram menos de três, o motor afrouxa nesta ordem (horário com 2 h de folga, preço um degrau acima, faixa vizinha) e diz só o que foi afrouxado. O que a pessoa ajustou de propósito na conversa fica firme; se isso esvazia a lista, o Finde diz o que travou e oferece o menor degrau que resolve.

Patrocinadas: no máximo duas na base, no máximo uma por resultado, sempre por último, marcadas, e só quando cabem no pedido sem afrouxar, casam com o estilo pedido e são tão aderentes quanto a editorial que tirariam.

## "% a sua cara"

`nucleo/cara.js` diz quanto cada festa bate com o pedido. A lista continua sendo a do motor, na mesma ordem, e a porcentagem entra como um campo a mais em cada opção. Os pesos são horário 30, idade 25, bairro 20, preço 15 e som 10. Critério que a pessoa não pediu (nenhum som marcado, São Paulo inteira, sem teto, idade de 18 a 50) sai da conta, e os pesos dos outros se redistribuem. O que fica perto de caber conta pela metade: até 1 h fora da janela, até 2 anos fora da faixa, bairro vizinho, até 20% acima do teto. Cada critério vem com uma frase, e é essa explicação que o detalhe mostra.

A porcentagem só existe diante de um pedido. Por isso aparece no resultado e no detalhe do app, e fica fora da lista da landing e do detalhe aberto por `/app?festa=<id>`.

## Onde trocar por um modelo de linguagem

`nucleo/entender.js` transforma a frase do ajuste em mudança de critérios, por regras, sem modelo. É o ponto de troca: um modelo receberia a frase e os critérios atuais e devolveria o mesmo `{ mudar, pedidos }`. As respostas do Finde (`nucleo/conversa.js`) e o motor continuariam iguais. Clima ("algo mais tranquilo") e tipo de casa ("nada de rooftop") ainda ficam de fora; o Finde diz o que entende.

## O registro da festa

Cada festa de `dados/festas.json` traz, além dos campos que o motor do protótipo usa (horas em número, `dia`, `mediaIdade` com `origemIdade`, `preco`), os campos do contrato `finde-r14/1` da frente do motor (`motor/nucleo/contrato.js`), com os mesmos nomes: `endereco`, `lotes`, `entradaNaPorta`, `linkCompra`, `linkEvento`, `instagram`, `cartaz`, `lineup`, `idadeMinima`, `regras`, `fontes`, `campos` (fonte e `conferidoEm` por campo), `coletadoEm` e `exemplo`. Todos podem faltar: ausente vale `null` e aparece como ausente, nunca inventado. O `preco` tem de ser o menor lote disponível (ou o da porta). Festa sem lote disponível e sem porta é recusada, porque o motor do protótipo não filtra preço nulo.

A base fictícia diz `"ficticia": true` e uma `referencia`: ao ler, o servidor desloca todos os carimbos pela diferença até agora (e relê a cada 30 min), para "conferido há 2 h" continuar verdade no dia da apresentação. Com `exemplo: true`, os links externos passam por `/fora.html`, que diz para onde a pessoa iria, sem abrir o perfil de ninguém de verdade; abrem em aba nova, e "Voltar pra festa" fecha a aba.

## Imagens

`publico/favicon.svg` (o monograma "f." com o contorno real da Fraunces itálica 300, SOFT 100, WONK 1), `publico/icone-180.png` (apple-touch-icon) e `publico/compartilhar.png` (1200 × 630) foram gerados fora do projeto. O favicon e o ícone saíram de um script avulso com `@napi-rs/canvas` e a Fraunces baixada do Google Fonts. A imagem de compartilhamento (16/11/2026) é um HTML com as fontes locais de `publico/fontes/`, renderizado no Chrome headless: wordmark, rótulo e título da landing sobre nude, e a assinatura numa coluna bordô. Ela não leva hora nem média de festa, porque também é a prévia de todo convite em `/p/:id`. Só os arquivos gerados ficam aqui.

`publico/cartazes/<id>.webp` (720 × 900, 37 arquivos, 0,72 MB) são cartazes tipográficos fictícios, um por festa, como uma produtora pequena postaria: sete famílias de composição pelo som, fontes do sistema do Mac, nenhuma foto, nome ou marca reais. Foram gerados por um script avulso com `@napi-rs/canvas`, fora do projeto.

## O que é fictício

Todas as 37 festas, produtoras, casas, endereços, lineups e cartazes de `dados/festas.json` são inventados. As casas são descritas de forma genérica ("terraço em Pinheiros", "galpão na Barra Funda"). Os minutos entre bairros são aproximações. As duas patrocinadas (Clube Varanda e Noite Aurora) também são fictícias. O convite do hero e a lista da semana, na landing, saem da mesma base. A interface diz "Protótipo · festas fictícias" no rodapé de todas as telas.

## O que ficou de fora

Conta, login, pagamento, venda de ingresso, mapa dentro do app, localização do aparelho, painel das produtoras e a origem real da idade do público (a maior hipótese a validar, ver `docs/conceito.md`). Os convites vivem num arquivo JSON, bom para a demonstração e não para muita gente ao mesmo tempo.

Da landing desenhada: o envio da lista por e-mail (o formulário é só visual), a seção de depoimentos (até haver falas reais aprovadas) e o hero com foto, que é um teste do manual.

## Onde está cada coisa

- `servidor.js`: a landing (montada aqui, com o convite e a lista da semana tirados da base), o app, estáticos, API, página do convite, cabeçalhos de segurança (CSP só com `'self'`, sem script inline; as fontes são servidas de `publico/fontes/`).
- `nucleo/catalogo.js`: dias, janelas, faixas, tetos, estilos e afinidade entre eles, bairros, minutos entre bairros e a escrita de horário e preço.
- `nucleo/base.js`: validação da base.
- `nucleo/motor.js`, `nucleo/entender.js`, `nucleo/conversa.js`, `nucleo/planos.js`.
- `nucleo/cara.js`: a "% a sua cara".
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
- `GET /` → a landing. `GET /app` → o app; com `?festa=<id>`, direto no detalhe da festa.

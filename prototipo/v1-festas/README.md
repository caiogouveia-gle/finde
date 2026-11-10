# Finde, protótipo v1 (festas)

Guia de festas do fim de semana em São Paulo para quem tem de 28 a 35 anos. A pessoa responde seis perguntas, recebe três festas com o porquê de cada uma, ajusta a lista em uma frase, abre a festa para conferir tudo o que iria buscar no Instagram, na plataforma de ingresso e no mapa, e só então manda pro grupo. É o fluxo do vídeo 2, com a marca de `docs/marca.md`. Substitui o v0 (`../v0-conversa`), que segue intocado.

## Rodar

Node 24, sem dependência e sem build.

```
node servidor.js
```

Abre em `http://localhost:8763`. Para o celular na mesma rede, `http://<ip-do-computador>:8763`.

- `FINDE_PORTA`: porta (padrão 8763).
- `FINDE_DADOS`: a base (padrão `dados/festas.json`). Linhas inválidas são ignoradas uma a uma, com aviso no log. Se o arquivo faltar, o app sobe com a lista vazia e diz isso. A base é relida quando o arquivo muda.
- `FINDE_VAR`: onde ficam os convites (padrão `var/`, arquivo `planos.json`, gravado de forma atômica).

## Testar

```
node --test teste/
```

Testes de: base (validação e cobertura), registro do detalhe (`teste/registro.test.js`: campos do contrato `finde-r14/1`, preço contra lotes, links só `https`, congelamento, relógio da base fictícia), texto do detalhe (`teste/festa-texto.test.js`: porta, lote esgotado, grátis, lineup não divulgado, média ausente, tempo relativo, fontes, destino dos links), motor (filtros, estilo como critério, patrocinada, afrouxamento, lista vazia com oferta, ordem por horário, determinismo), `entender` (mais de 30 frases reais de ajuste), conversa de ponta a ponta (um teste para cada defeito da revisão), convites (nome repetido, escrita atômica) e a API num servidor em porta efêmera (path traversal, corpo grande, nome com HTML, CSP, 404 e metas de compartilhamento em `/p/:id`).

## O fluxo

1. **Boas-vindas** com o lockup oficial, "still going out. *just differently.*", fio rosé, uma frase, a próxima pista que abre pelo relógio (`SÁB · 18H00 · BARRA FUNDA · MÉDIA 31 ANOS`) e o botão de canto reto (sem pílula, decisão de 10/11). À noite, a boas-vindas é o splash negativo do manual.
2. **Seis perguntas, uma por tela**, presas embaixo, ao alcance do polegar: dia; janela de horário (17h às 23h, 19h à 1h, 22h às 3h); onde, com bairros em chips por zona que se somam e "São Paulo inteira" marcado de saída e exclusivo; a faixa de idade em que a pessoa se sente bem, num seletor de dois pontos de 18 a 50 (padrão 28 a 35), que se arrasta, anda pelas setas do teclado e por botões de passo, e diz "mínimo, 30 anos" ao leitor de tela; teto (R$ 50, R$ 80, R$ 150, sem limite); estilo, opcional e múltiplo. Um toque numa resposta única já avança; pelo teclado, setas escolhem e Enter confirma. A faixa é flexível: festa com média fora dela aparece depois, com aviso.
3. **Resultado como a programação da noite**: o pedido vira frase ("Sábado, das 19h à 1h, gente de 30 a 35, até R$ 80.") e cada trecho reabre só aquela pergunta. As festas vêm em blocos: primeiro as que cabem; depois, rotuladas, as de bairros vizinhos ("Perto de Pinheiros e do Centro"), as que furam o pedido em som, horário ou preço ("Quase no seu pedido") e as de média fora da faixa ("Fora da sua faixa", com "Média 27, um pouco abaixo da sua faixa"). Nada que fure o pedido fica misturado com o que cabe. Em cada bloco, em ordem de horário, com hora, a pista cheia e a média (e a origem dela) à esquerda e, à direita, só o que serve para escolher: nome, bairro, preço a partir de, o aviso quando a festa fura o pedido e o porquê. O item inteiro é tocável e abre o detalhe; a lista não manda nada pro grupo. A conversa ajusta em uma frase, com atalhos; o Finde responde curto e diz o que entrou e o que saiu. Quando nada cabe, ele diz o que travou e oferece soltar; "sim" aceita.
4. **Detalhe da festa**, na ordem do plano (`docs/plans/2026-11-10-1248-feat-detalhe-da-festa-plan.md`): data, hora grande, a frase do horário e uma régua das 15h às 3h com a festa, a pista cheia e a janela pedida; a média de idade com a origem e quando foi conferida; o cartaz em miniatura ao lado do nome, da produtora e da casa, a frase do curador, o endereço e "Abrir no mapa"; o ingresso (menor lote disponível, os lotes, "1º lote esgotado", entrada na porta ou grátis, e onde comprar); os links da produtora (Instagram e página do evento, com o nome do serviço; o que falta aparece como não informado); as regras para entrar; o som e o lineup ("Lineup ainda não divulgado." quando não saiu); e de onde vêm os dados, com "conferido há X h". Uma barra fixa no pé leva "Comprar · R$ X" (só quando há venda online) e "Mandar pro grupo". Voltar devolve a lista na mesma rolagem; recarregar no detalhe mantém o detalhe.
5. **Mandar pro grupo**: a tela já é a prévia do convite ("Convite de [nome]", "Bora no *sábado?*"). Criado o convite, aparece a prévia da mensagem do WhatsApp e o botão para mandar. Em `/p/:id`, quem recebe vê a festa (hora, média com origem, nome, casa, preço) e responde "tô dentro" ou "não rola"; abaixo da resposta, o cartaz com o endereço e o mapa, o ingresso e os links da produtora; os nomes aparecem, a página se atualiza a cada 4 s (pausa com a aba oculta), e nome repetido pergunta "É você?" antes de trocar a resposta. O servidor preenche o título e a descrição de compartilhamento com a festa.

**Por que confirmação e não votação.** No v0 o grupo votava entre três opções. No v1 a comparação já acontece no app, com o filtro e a conversa; o que o grupo faz no vídeo é topar ou não ("Achei essa, bora?", "Tô dentro."). Por isso o convite leva uma festa só e pede confirmação. Quem manda pode deixar o nome e já entra como "tô dentro".

## O motor

`nucleo/motor.js` é puro e determinístico. Filtros duros: dia, janela de horário, hora de voltar (quando a pessoa diz "volto até as 23h"), teto de preço, estilos recusados e bairro longe dos marcados. A faixa de idade do formulário (`idade: { min, max }`) não tira festa: ordena, e quem fica fora vai para o bloco da faixa. Os bairros (`bairros`, vazio é São Paulo inteira) entram em camadas: os marcados primeiro, depois os vizinhos (mesma região ou até 12 min de carro). Cada opção sai com `bloco` (`pedido`, `perto`, `quase` ou `faixa`), nessa ordem. Sem `idade`, vale a faixa fixa de antes (`faixa`), que a conversa ainda usa; "mais velha" troca o intervalo pela faixa seguinte. A janela tem tolerância declarada: o esquenta da festa pode cair até 1 h antes do início da janela e até 1 h antes do fim, e a festa precisa durar 2 h depois que a pessoa chega.

O estilo pedido é critério: primeiro entram as festas que casam com ele; se não chegam a três, a lista se completa com o som mais parecido e o aviso diz isso numa frase. Quando sobram menos de três, o motor afrouxa nesta ordem (horário com 2 h de folga, preço um degrau acima, faixa vizinha) e diz só o que foi afrouxado. O que a pessoa ajustou de propósito na conversa fica firme; se isso esvazia a lista, o Finde diz o que travou e oferece o menor degrau que resolve.

Patrocinadas: no máximo duas na base, no máximo uma por resultado, sempre por último, marcadas, e só quando cabem no pedido sem afrouxar, casam com o estilo pedido e são tão aderentes quanto a editorial que tirariam.

## Onde trocar por um modelo de linguagem

`nucleo/entender.js` transforma a frase do ajuste em mudança de critérios, por regras, sem modelo. É o ponto de troca: um modelo receberia a frase e os critérios atuais e devolveria o mesmo `{ mudar, pedidos }`. As respostas do Finde (`nucleo/conversa.js`) e o motor continuariam iguais. Clima ("algo mais tranquilo") e tipo de casa ("nada de rooftop") ainda ficam de fora; o Finde diz o que entende.

## O registro da festa

Cada festa de `dados/festas.json` traz, além dos campos que o motor do protótipo usa (horas em número, `dia`, `mediaIdade` com `origemIdade`, `preco`), os campos do contrato `finde-r14/1` da frente do motor (`motor/nucleo/contrato.js`), com os mesmos nomes: `endereco`, `lotes`, `entradaNaPorta`, `linkCompra`, `linkEvento`, `instagram`, `cartaz`, `lineup`, `idadeMinima`, `regras`, `fontes`, `campos` (fonte e `conferidoEm` por campo), `coletadoEm` e `exemplo`. Todos podem faltar: ausente vale `null` e aparece como ausente, nunca inventado. O `preco` tem de ser o menor lote disponível (ou o da porta). Festa sem lote disponível e sem porta é recusada, porque o motor do protótipo não filtra preço nulo.

A base fictícia diz `"ficticia": true` e uma `referencia`: ao ler, o servidor desloca todos os carimbos pela diferença até agora (e relê a cada 30 min), para "conferido há 2 h" continuar verdade no dia da apresentação. Com `exemplo: true`, os links externos passam por `/fora.html`, que diz para onde a pessoa iria, sem abrir o perfil de ninguém de verdade; abrem em aba nova, e "Voltar pra festa" fecha a aba.

## Imagens

`publico/favicon.svg` (o monograma "f." com o contorno real da Fraunces itálica 300, SOFT 100, WONK 1), `publico/icone-180.png` (apple-touch-icon) e `publico/compartilhar.png` (1200 × 630, lockup negativo) foram gerados por um script avulso, fora do projeto, com `@napi-rs/canvas` e a Fraunces baixada do Google Fonts. Só os arquivos gerados ficam aqui.

`publico/cartazes/<id>.webp` (720 × 900, 37 arquivos, 0,72 MB) são cartazes tipográficos fictícios, um por festa, como uma produtora pequena postaria: sete famílias de composição pelo som, fontes do sistema do Mac, nenhuma foto, nome ou marca reais. Foram gerados por um script avulso com `@napi-rs/canvas`, fora do projeto.

## O que é fictício

Todas as 37 festas, produtoras, casas, endereços, lineups e cartazes de `dados/festas.json` são inventados. As casas são descritas de forma genérica ("terraço em Pinheiros", "galpão na Barra Funda"). Os minutos entre bairros são aproximações. As duas patrocinadas (Clube Varanda e Noite Aurora) também são fictícias. A interface diz "Protótipo · festas fictícias" no rodapé de todas as telas.

## O que ficou de fora

Conta, login, pagamento, venda de ingresso, mapa dentro do app, localização do aparelho, painel das produtoras e a origem real da idade do público (a maior hipótese a validar, ver `docs/conceito.md`). Os convites vivem num arquivo JSON, bom para a demonstração e não para muita gente ao mesmo tempo.

## Onde está cada coisa

- `servidor.js`: estáticos, API, página do convite, cabeçalhos de segurança (CSP só com self e as fontes do Google, sem script inline).
- `nucleo/catalogo.js`: dias, janelas, faixas, tetos, estilos e afinidade entre eles, bairros, minutos entre bairros e a escrita de horário e preço.
- `nucleo/base.js`: validação da base.
- `nucleo/motor.js`, `nucleo/entender.js`, `nucleo/conversa.js`, `nucleo/planos.js`.
- `publico/`: `index.html` e `app.js` (boas-vindas, perguntas, resultado, detalhe, envio), `plano.html` e `plano.js` (convite), `festa-texto.js` (as frases do detalhe, sem DOM, testadas no Node), `comum.js` (peças comuns e os blocos da festa), `fora.html` e `fora.js` (a página de saída), `tema.js` (modo dia e noite), `app.css` e `cartazes/`.

## API

- `GET /api/formulario` → perguntas, opções e contagem, as zonas com os bairros e a faixa de idade (`{ min: 18, max: 50, padrao: { min: 28, max: 35 } }`).
- `POST /api/festas` `{ criterios }` → `{ criterios, pedido, pedidoPartes, opcoes, aviso?, oferta?, resposta }`. Cada opção traz a festa inteira (com o registro do detalhe) e a `data` (AAAA-MM-DD).
- `POST /api/conversa` `{ criterios, texto, atuais: [ids] }` → o mesmo, mais `entendeu`, `entraram`, `sairam`.
- `POST /api/planos` `{ criterios, festa, autor? }` → `{ id, url }`.
- `GET /api/planos/:id` → convite com `dentro` e `fora`.
- `POST /api/planos/:id/respostas` `{ nome, resposta: "dentro" | "fora", confirmar? }`. Nome repetido sem `confirmar` dá 409 com "Já tem Ju na lista. É você?".
- `GET /p/:id` → página do convite.

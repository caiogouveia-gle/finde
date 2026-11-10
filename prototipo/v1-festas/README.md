# Finde, protótipo v1 (festas)

Guia de festas do fim de semana em São Paulo para quem tem de 28 a 35 anos. A pessoa responde cinco perguntas, recebe três festas com o porquê de cada uma, ajusta a lista em uma frase e manda a escolhida pro grupo. É o fluxo do vídeo 2, com a marca de `docs/marca.md`. Substitui o v0 (`../v0-conversa`), que segue intocado.

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

117 testes: base (validação e cobertura), motor (filtros, estilo como critério, patrocinada, afrouxamento, lista vazia com oferta, ordem por horário, determinismo), `entender` (mais de 30 frases reais de ajuste), conversa de ponta a ponta (um teste para cada defeito da revisão), convites (nome repetido, escrita atômica) e a API num servidor em porta efêmera (path traversal, corpo grande, nome com HTML, CSP, 404 e metas de compartilhamento em `/p/:id`).

## O fluxo

1. **Boas-vindas** com o lockup oficial, "A pista abre *antes.*", fio rosé, uma frase, a próxima pista que abre pelo relógio (`SÁB · 18H00 · BARRA FUNDA · MÉDIA 31 ANOS`) e o botão em pílula. À noite, a boas-vindas é o splash negativo do manual.
2. **Cinco perguntas, uma por tela**, presas embaixo, ao alcance do polegar: dia; janela de horário (17h às 23h, 19h à 1h, 22h às 3h); faixa de idade (18 a 24, 25 a 29, 30 a 35, 36 ou mais); teto (R$ 50, R$ 80, R$ 150, sem limite); estilo, opcional e múltiplo. Um toque numa resposta única já avança; pelo teclado, setas escolhem e Enter confirma.
3. **Resultado como a programação da noite**: o pedido vira frase ("Sábado, das 19h à 1h, gente de 30 a 35, até R$ 80.") e cada trecho reabre só aquela pergunta. Embaixo, uma régua das 17h às 3h e as festas em ordem de horário, com hora e média de idade à esquerda e, à direita, nome, onde, a frase do curador e o porquê (o que distingue a festa, sem repetir o pedido). A conversa ajusta em uma frase, com atalhos; o Finde responde curto e diz o que entrou e o que saiu. Quando nada cabe, ele diz o que travou e oferece soltar; "sim" aceita.
4. **Mandar pro grupo**: a tela já é a prévia do convite ("Convite de [nome]", "Bora no *sábado?*"). Criado o convite, aparece a prévia da mensagem do WhatsApp e o botão para mandar. Em `/p/:id`, quem recebe responde "tô dentro" ou "não rola"; os nomes aparecem, a página se atualiza a cada 4 s (pausa com a aba oculta), e nome repetido pergunta "É você?" antes de trocar a resposta. O servidor preenche o título e a descrição de compartilhamento com a festa.

**Por que confirmação e não votação.** No v0 o grupo votava entre três opções. No v1 a comparação já acontece no app, com o filtro e a conversa; o que o grupo faz no vídeo é topar ou não ("Achei essa, bora?", "Tô dentro."). Por isso o convite leva uma festa só e pede confirmação. Quem manda pode deixar o nome e já entra como "tô dentro".

## O motor

`nucleo/motor.js` é puro e determinístico. Filtros duros: dia, janela de horário, hora de voltar (quando a pessoa diz "volto até as 23h"), faixa de idade, teto de preço e estilos recusados. A janela tem tolerância declarada: o esquenta da festa pode cair até 1 h antes do início da janela e até 1 h antes do fim, e a festa precisa durar 2 h depois que a pessoa chega.

O estilo pedido é critério: primeiro entram as festas que casam com ele; se não chegam a três, a lista se completa com o som mais parecido e o aviso diz isso numa frase. Quando sobram menos de três, o motor afrouxa nesta ordem (horário com 2 h de folga, preço um degrau acima, faixa vizinha) e diz só o que foi afrouxado. O que a pessoa ajustou de propósito na conversa fica firme; se isso esvazia a lista, o Finde diz o que travou e oferece o menor degrau que resolve.

Patrocinadas: no máximo duas na base, no máximo uma por resultado, sempre por último, marcadas, e só quando cabem no pedido sem afrouxar, casam com o estilo pedido e são tão aderentes quanto a editorial que tirariam.

## Onde trocar por um modelo de linguagem

`nucleo/entender.js` transforma a frase do ajuste em mudança de critérios, por regras, sem modelo. É o ponto de troca: um modelo receberia a frase e os critérios atuais e devolveria o mesmo `{ mudar, pedidos }`. As respostas do Finde (`nucleo/conversa.js`) e o motor continuariam iguais. Clima ("algo mais tranquilo") e tipo de casa ("nada de rooftop") ainda ficam de fora; o Finde diz o que entende.

## Imagens

`publico/favicon.svg` (o monograma "f." com o contorno real da Fraunces itálica 300, SOFT 100, WONK 1), `publico/icone-180.png` (apple-touch-icon) e `publico/compartilhar.png` (1200 × 630, lockup negativo) foram gerados por um script avulso, fora do projeto, com `@napi-rs/canvas` e a Fraunces baixada do Google Fonts. Só os arquivos gerados ficam aqui.

## O que é fictício

Todas as 37 festas, produtoras e casas de `dados/festas.json` são inventadas. As casas são descritas de forma genérica ("terraço em Pinheiros", "galpão na Barra Funda"). Os minutos entre bairros são aproximações. As duas patrocinadas (Clube Varanda e Noite Aurora) também são fictícias. A interface diz "Protótipo · festas fictícias" no rodapé de todas as telas.

## O que ficou de fora

Conta, login, pagamento, venda de ingresso, mapa, localização do aparelho, painel das produtoras e a origem real da idade do público (a maior hipótese a validar, ver `docs/conceito.md`). Os convites vivem num arquivo JSON, bom para a demonstração e não para muita gente ao mesmo tempo.

## Onde está cada coisa

- `servidor.js`: estáticos, API, página do convite, cabeçalhos de segurança (CSP só com self e as fontes do Google, sem script inline).
- `nucleo/catalogo.js`: dias, janelas, faixas, tetos, estilos e afinidade entre eles, bairros, minutos entre bairros e a escrita de horário e preço.
- `nucleo/base.js`: validação da base.
- `nucleo/motor.js`, `nucleo/entender.js`, `nucleo/conversa.js`, `nucleo/planos.js`.
- `publico/`: `index.html` e `app.js` (boas-vindas, perguntas, resultado, envio), `plano.html` e `plano.js` (convite), `comum.js`, `tema.js` (modo dia e noite) e `app.css`.

## API

- `GET /api/formulario` → perguntas, opções e contagem.
- `POST /api/festas` `{ criterios }` → `{ criterios, pedido, pedidoPartes, opcoes, aviso?, oferta?, resposta }`.
- `POST /api/conversa` `{ criterios, texto, atuais: [ids] }` → o mesmo, mais `entendeu`, `entraram`, `sairam`.
- `POST /api/planos` `{ criterios, festa, autor? }` → `{ id, url }`.
- `GET /api/planos/:id` → convite com `dentro` e `fora`.
- `POST /api/planos/:id/respostas` `{ nome, resposta: "dentro" | "fora", confirmar? }`. Nome repetido sem `confirmar` dá 409 com "Já tem Ju na lista. É você?".
- `GET /p/:id` → página do convite.

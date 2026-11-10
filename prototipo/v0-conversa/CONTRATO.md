# Finde, protótipo: contrato

Protótipo funcional da entrega final de E&I (MBM, Insper). Tese: **o Finde é o concierge que fecha o programa do fim de semana do grupo.** A pessoa conversa, recebe três opções com o porquê de cada uma, manda a lista curta para os amigos por um link, eles votam e o programa fecha.

Público da demo: a banca e os colegas, abrindo um link no celular. Persona: 20 a 30 anos, São Paulo, sai todo fim de semana, decide no grupo de WhatsApp, repete três ou quatro lugares e não tem certeza de que o novo vai ser bom.

## Pilha

Node 24 sem dependências (nem no servidor, nem no navegador, nem build). `node servidor.js` sobe tudo. HTML, CSS e JS à mão, celular primeiro (375 px), funciona até 1280 px sem virar site de desktop: a coluna do app fica centrada, com no máximo 480 px.

Sem som em nenhuma tela. Sem conta, sem login, sem pagamento, sem mapa embutido, sem Trend Score, sem painel B2B.

```
finde/
  servidor.js          HTTP: estáticos, API, páginas de plano
  nucleo/motor.js      escolha das três opções (puro, sem I/O)
  nucleo/entender.js   texto livre -> critérios (puro)
  nucleo/planos.js     criar, ler, votar, fechar (arquivo em var/)
  publico/             index.html, plano.html, app.css, app.js, plano.js
  dados/experiencias.json   a base curada (outro agente escreve; não edite)
  teste/               node --test; fixture própria em teste/fixture.json
  var/                 planos.json (gerado; fora de qualquer commit)
```

Variáveis: `FINDE_PORTA` (padrão 8760), `FINDE_VAR` (pasta de dados gerados, padrão `./var`), `FINDE_DADOS` (padrão `./dados/experiencias.json`).

## Experiência (uma linha da base)

```json
{
  "id": "pinacoteca-luz",
  "nome": "Pinacoteca",
  "tipo": "cultura",
  "regiao": "centro",
  "bairro": "Luz",
  "preco": 1,
  "momentos": ["manha", "tarde"],
  "grupo": { "min": 1, "max": 8 },
  "climas": ["descobrir", "conversar"],
  "arLivre": false,
  "comida": "nao",
  "resumo": "Museu de arte brasileira num prédio de tijolo aparente ao lado do Parque da Luz.",
  "porque": "Dá para ver em duas horas sem pressa e o café do pátio segura a conversa depois.",
  "combina": ["parque-da-luz"],
  "selo": "editorial",
  "conferido": false
}
```

- `tipo`: `cultura`, `ar-livre`, `comida`, `bar`, `musica`, `feira`, `jogo`, `passeio`.
- `regiao`: `pinheiros-vila-madalena`, `centro`, `paulista-ibirapuera`.
- `preco` por pessoa: `0` grátis, `1` até R$ 50, `2` de R$ 50 a R$ 120, `3` acima de R$ 120.
- `momentos`: `manha`, `tarde`, `noite`.
- `climas`: `conversar`, `agitar`, `descobrir`, `relaxar`, `comemorar`.
- `comida`: `centro` (comer é o programa), `tem` (dá para comer lá), `nao`.
- `combina`: ids que fazem um bom segundo tempo (almoço e depois bar, museu e depois parque).
- `selo`: `editorial` ou `patrocinado`. Patrocinado só em lugar fictício, com o nome dizendo que é exemplo.
- `conferido`: `false` até alguém do grupo checar o lugar.

## Critérios (o que a conversa colhe)

```json
{
  "quem": "amigos",            // "so" | "casal" | "amigos" (3 a 5) | "turma" (6 ou mais)
  "quando": "sab-noite",       // "sex-noite" | "sab-dia" | "sab-noite" | "dom"
  "regiao": "qualquer",        // uma das três, ou "qualquer"
  "preco": 2,                  // teto, 0 a 3
  "clima": "conversar",        // um dos cinco
  "comida": "pode",            // "centro" | "pode" | "hoje-nao"
  "evitar": ["id", "..."]      // já recusadas nesta conversa
}
```

`quando` vira momentos: `sex-noite` e `sab-noite` → `noite`; `sab-dia` → `manha` ou `tarde`; `dom` → `manha` ou `tarde`.

## Motor

`escolher(criterios, base) -> { opcoes: [Opcao, Opcao, Opcao], aviso? }`

Uma `Opcao` é `{ experiencia, depois?, rotulo, motivos: [string], porque }`.

- Filtros duros: momento, teto de preço, tamanho do grupo, `comida: "hoje-nao"` tira `comida: "centro"`, e `evitar`.
- Pontuação: clima, região pedida, ar livre de dia, variedade. As três opções têm que ser de `tipo` diferente quando a base permitir, e no máximo uma com `comida: "centro"` quando o pedido for `pode`.
- `rotulo`: `sob-medida` (bateu clima e região), `da-casa` (entrou pela curadoria, não pelo pedido) ou `patrocinado`. No máximo uma patrocinada, nunca na primeira posição, e só se passar nos filtros duros.
- `motivos`: de duas a três frases curtas tiradas do que casou ("cabe os seis", "até R$ 50 por pessoa", "fica em Pinheiros, como você pediu"). `porque` é a frase do curador, da base.
- `depois`: a primeira experiência de `combina` que também passa nos filtros, se houver.
- Se os filtros deixarem menos de três, o motor afrouxa na ordem região, clima, preço (um degrau) e devolve `aviso` dizendo o que afrouxou. Nunca devolve lista vazia sem dizer por quê.
- Determinístico: mesma entrada, mesma saída. Sem `Math.random`.

`trocar(criterios, base, idRecusado)` devolve uma substituta para aquela posição, respeitando as mesmas regras.

## Texto livre

`entender(texto) -> criterios parciais`. Reconhece o básico em português: dia e período ("sábado à noite", "domingo"), tamanho ("somos 4", "eu e minha namorada", "galera"), região e bairros das três regiões, teto ("até 80", "barato", "de graça"), clima ("tranquilo", "animado", "conhecer algo novo") e comida ("sem comer", "jantar"). O que não entender fica de fora e a conversa pergunta. Sem modelo de linguagem; o ponto de troca por um modelo é esta função.

## API

- `GET /api/base` → `{ regioes, total }` (para o texto da abertura).
- `POST /api/conversa` `{ criterios, texto? }` → `{ criterios, falta: ["quem", ...] }` quando falta algo, ou `{ criterios, opcoes, aviso? }`.
- `POST /api/trocar` `{ criterios, id }` → `{ opcao, criterios }`.
- `POST /api/planos` `{ criterios, opcoes: [id, id, id], autor }` → `{ id, url }`.
- `GET /api/planos/:id` → plano com opções inteiras, votos e estado.
- `POST /api/planos/:id/votos` `{ nome, opcao }` → plano atualizado. Um voto por nome; votar de novo troca.
- `POST /api/planos/:id/fechar` `{ nome }` → plano com `fechado: { opcao, por, em }`. A opção fechada é a mais votada; empate fica com a que está mais acima na lista.
- `GET /p/:id` → `plano.html`.

Ids de plano: 8 caracteres de `crypto.randomBytes`, base 36. Corpo de requisição limitado a 16 KB. Nome limitado a 24 caracteres, sem HTML (tudo que vem de fora entra na página por `textContent`). Escrita de `planos.json` atômica (arquivo temporário e `rename`).

## Telas

1. **Conversa** (`/`). O Finde fala primeiro, uma pergunta por vez, com respostas de toque e um campo de texto sempre disponível. Quem escreve "sábado à noite, somos 4, Pinheiros, até 80" pula as perguntas respondidas.
2. **Três opções.** Cada cartão: nome, bairro, faixa de preço, rótulo, os motivos, a frase do curador e o segundo tempo quando houver. Em cada um, "trocar esta". No fim, "mandar pro grupo" pede o nome de quem manda.
3. **Mandar.** Mostra o link do plano, botão de copiar e botão de WhatsApp (`https://wa.me/?text=`), com a mensagem pronta.
4. **Plano** (`/p/:id`). Quem recebe vê as três opções, digita o nome, vota. A contagem aparece com os nomes. A página se atualiza sozinha a cada poucos segundos. "Fechar o programa" aparece depois de dois votos. Fechado, a página vira um bilhete: o que, onde, quem vai.

Rótulos na tela: "sob medida para vocês", "escolha da casa", "patrocinado". Uma linha discreta explica os três. Em toda experiência com `conferido: false`, nada na tela afirma horário ou preço exato.

## Desenho

A identidade vem do vídeo do grupo (teatro de papel): papel creme, traço azul-marinho, um laranja só para a ação.

- Papel `#fff3df`, folha `#fff9ed`, traço e texto `#203f77`, ação `#c77222` (texto sobre papel: `#b55e18`), sombra `#705a3b` a 15%.
- Contorno de 2 px no azul, cantos de 14 a 18 px, sombra curta e deslocada para baixo, como papel recortado sobre papel. Nada de degradê, vidro, brilho, emoji ou ícone de biblioteca.
- Títulos e a voz do Finde em letra de mão: `"Patrick Hand"` servida do próprio projeto se houver arquivo, senão `"Chalkboard SE", "Comic Neue", cursive`. Detalhes e formulário em `-apple-system, "Segoe UI", Roboto, sans-serif`.
- Movimento curto (150 a 250 ms), papel que assenta; respeita `prefers-reduced-motion`.
- Alvos de toque de 44 px. Contraste AA. Foco visível. A conversa é uma região viva (`aria-live="polite"`).

## Texto

Português do Brasil, frases curtas, sem ponto de exclamação em série, sem "incrível", sem vender. O Finde fala como um amigo que conhece a cidade: "Quem vai?", "Achei três. A primeira é a que eu levaria vocês."

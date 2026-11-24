# Movimento da Direção E · Guia

Especificação do movimento das telas novas (U39), para a `app-telas` (U29–U32) e a `app-mapa` (U33) portarem. Tudo aqui roda no rascunho `guia.html` com os mesmos tempos e curvas; as folhas `capturas/mov-*.webp` mostram cada transição congelada em quatro ou cinco tempos (Chrome sem cabeça, mudo, animação a 5% da velocidade).

O vocabulário é o do app (`--mov-*` em `publico/app.css`, lido por `comum.js`). Esta especificação acrescenta dois tempos e não muda nenhum dos que existem.

## Regras

1. A página nasce pronta. A animação só existe enquanto roda (Web Animations com `fill: 'backwards'`, nunca estilo em linha que fica); se falhar, o conteúdo já está lá.
2. Só `transform` e `opacity` animam. Nada de `clip-path`, `filter`, `backdrop-filter`, `height`, `top` ou `left` em animação nova. Revelar é por "cortina": um `::after` na cor do fundo que encolhe por `scaleY` ou `scaleX`. (O `revelar` atual do `comum.js` anima `clip-path`; fica como está onde já é usado, e não entra em transição nova.)
3. O desfoque da capa é estático. O que anima é a escala do recorte (`.capa-foto`), que leva a camada já desfocada inteira; o `<img>` com `filter` nunca é o alvo da animação.
4. O vidro das etiquetas não usa `backdrop-filter`: sobre um fundo que já é desfocado ele não muda nada que se veja e custa a composição da camada de baixo a cada quadro.
5. No Leaflet, nunca animar o elemento do marcador (`.leaflet-marker-icon`): o Leaflet escreve `transform` nele a cada movimento do mapa. Anima o `.pino-in`, de dentro.
6. Movimento reduzido (`prefers-reduced-motion: reduce`): nenhuma translação, escala ou desenho; no máximo uma troca de opacidade de 160 ms, linear. O JS não chama `startViewTransition` (troca direta), e o CSS precisa do bloco abaixo, porque o seletor universal `*` não alcança os pseudo-elementos da View Transition:

   ```css
   @media (prefers-reduced-motion: reduce) {
     ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
   }
   ```

7. Sem som, nunca. Nenhum gesto tem retorno sonoro nem vibração.
8. Toque nunca espera animação: o alvo responde no primeiro quadro (o `:active` e o `scale: .98` do botão), e uma transição em curso não bloqueia o próximo toque.

## Tempos e curvas

| Token | Valor | Uso |
|---|---|---|
| `--mov-saida` | `cubic-bezier(.2, .7, .2, 1)` | o que chega |
| `--mov-troca` | `cubic-bezier(.6, 0, .2, 1)` | o que muda de estado ou sai |
| linear | | só o que marca tempo (a régua da noite) |
| `--mov-toque` | 160 ms | resposta ao toque, saídas curtas, a versão reduzida |
| `--mov-estado` | 320 ms | troca de estado, fio da aba, rótulos |
| `--mov-bloco` | 560 ms | bloco que entra, grupo da View Transition, cortina do mapa |
| `--mov-capa` | 640 ms | NOVO: a foto da capa assenta |
| `--mov-titulo` | 900 ms | título por linha |
| `--mov-regua` | 900 ms | NOVO: o traço da régua da noite, linear |
| `--mov-escala` | 60 ms | degrau da escada, no máximo seis degraus |

Nada passa de 1,4 s do toque ao último quadro.

## Transições

Em cada linha: o gatilho, o que anima, de onde a onde, a duração, a curva, o atraso e a versão reduzida.

### 1. A primeira pergunta entra

- Título por linha (como hoje): `translate 0 108% → 0` dentro da máscara fixa, 900 ms, saída.
- A base viva ("Atualizado há 3 h…"), "Esta semana / A próxima", cada opção e o botão: sobem 12 px e aparecem, 560 ms, saída, a partir de 180 ms, escada de 60 ms (até seis; o resto entra com o sexto).
- O número de festas de cada opção já vem com a página; não conta de 0 até o número.
- "Esta semana" ↔ "A próxima": o sublinhado do rótulo troca sem deslizar (são dois botões, não abas); as opções saem em 140 ms (opacidade, troca) e as novas sobem como na entrada, sem o título.
- Reduzido: opacidade, 160 ms, tudo junto.

### 2. O guia abre (resultado)

Ordem, a partir do fim da pergunta:

| Tempo | Elemento | Movimento |
|---|---|---|
| 0 | fio de cima da edição | `scaleX 0 → 1` da esquerda, 560 ms, saída (`::before`) |
| 80 | fio de baixo da edição | o mesmo (`::after`) |
| 120 | título "Três festas pra sua *sexta.*" | por linha, 900 ms |
| 160 | "Guia da semana", a data, a cidade | sobem 6 px e aparecem, 320 ms, escada de 60 ms |
| 260 | pedido, linha sem média, abas | sobem 12 px, 560 ms, escada |
| 320 | a capa | o bloco inteiro: opacidade 0 → 1 em 320 ms, linear; a foto (`.capa-foto`): `scale 1,08 → 1`, 640 ms, saída |
| 440 | etiquetas, hora, nome, onde, porquê da capa | sobem 12 px, escada |
| 560 | a régua da noite | ver 4 |
| 560 | as chamadas 2 e 3 | sobem 12 px, escada |
| 700 | "Ver todas", "Ver no mapa", "No sábado tem mais 5" | sobem 12 px |

O bloco da capa aparece por opacidade junto com a foto: nunca um retângulo escuro vazio antes da imagem (era o que a primeira filmagem mostrou).

Reduzido: o guia aparece inteiro por opacidade, 160 ms.

### 3. Troca de aba (dia)

- O fio da aba: um elemento só (`.aba-fio`, 1 px de largura, `transform-origin: 0 50%`), movido por `translateX(<left da aba>) scaleX(<largura da palavra>)`, 320 ms, troca. Cobre a palavra, não a contagem.
- O conteúdo do dia que sai: opacidade 1 → 0 e `translate 0 → -6px`, 140 ms, troca, `fill: forwards`; cancelado no instante em que o novo entra (sem um quadro do velho de volta).
- O que entra: a capa como em 2 (sem a régua esperar o título) e as chamadas a partir de 120 ms.
- Na rede: se a lista do dia ainda não chegou em 140 ms, o lugar fica vazio com a linha de rótulo e o fio que corre do app (`p.carregando`); não mostra o dia velho esmaecido.
- Reduzido: o fio pula para a aba nova; o conteúdo troca por opacidade, 160 ms.

### 4. A régua da noite se desenha

- O traço da festa (`.regua-festa`, 3 px): `scaleX 0 → 1` da esquerda, 900 ms, **linear** (é tempo correndo).
- Cada rótulo (18h, 20h enche, 23h) aparece quando o traço passa por ele: atraso = posição × 900 ms; sobe 4 px e aparece, 320 ms, saída.
- O pico (o quadrado de 8 px do "enche"): `scale 0 → 1`, 160 ms, saída, quando o traço chega nele.
- Na capa da lista começa aos 240 ms da capa; no detalhe, aos 200 ms da troca.
- Reduzido: a régua já desenhada, por opacidade.

### 5. Do cartão ao detalhe (View Transitions)

Nomes de `view-transition-name`, postos pelo JS só nos elementos da festa tocada (antes da troca, na origem; dentro do callback, no destino), e tirados no `finished`:

| Nome | Na lista | No detalhe | Movimento |
|---|---|---|---|
| `festa-capa` | `.capa-foto` da capa | `.capa-foto` do detalhe | o recorte com a foto e o véu muda de tamanho e lugar, 560 ms, saída; as duas imagens com `object-fit: cover` e `height: 100%` (a proporção muda, nunca estica) |
| `festa-hora` | a hora da capa ou da chamada | a hora grande | viaja só a imagem de chegada (`old` com `opacity: 0`), 560 ms, saída, como hoje |
| `festa-nome` | o nome | o nome ao lado do cartaz | o mesmo |
| `festa-cartaz` | a miniatura em "ver todas" (só ali há miniatura) | o cartaz de 96×120 | 40×50 → 96×120, mesma proporção, 560 ms; vindo da capa ou de uma chamada (tipográficas), não tem par e entra por opacidade aos 160 ms (`:only-child`), para não aparecer sobre a lista |

- A página que sai: opacidade em 140 ms, troca; a que chega: opacidade em 320 ms, saída, a partir de 100 ms (o que o app já faz).
- As seções do detalhe abaixo da capa sobem 12 px em escada a partir de 240 ms, e a barra sobe de baixo (`translate 0 100% → 0`), 560 ms, a partir de 300 ms.
- **O nome `festa-capa` vai no recorte, não no `<img>`**. Na primeira filmagem, com o nome na imagem, o instantâneo saiu sem o véu e sem o recorte: um clarão branco do tamanho da imagem desfocada (que é 96 px maior que a capa, para esconder a borda do desfoque) cobrindo a tela por 300 ms.
- Volta (detalhe → lista): os mesmos nomes no sentido contrário, no cartão que abriu o detalhe; a lista não reencena a entrada. A rolagem da lista é restaurada antes do instantâneo (dentro do callback, antes de nomear o destino), senão o grupo voa para um lugar fora da tela.
- Sem a API (Safari antigo, Firefox): o detalhe entra como em 2 (capa por opacidade e escala, seções em escada).
- Reduzido: troca direta, sem `startViewTransition`.

### 6. O flyer inteiro

- Toque no cartaz de 96×120: `festa-cartaz` viaja do cartaz para a peça inteira (contida no centro da tela), 560 ms, saída; o fundo noite chapado chega por opacidade com a página (320 ms).
- Fechar (botão, Esc, voltar do navegador): o caminho contrário; o foco volta ao botão do cartaz.
- Sem a API: a peça aparece por opacidade e `scale .96 → 1`, 320 ms.
- Reduzido: opacidade, 160 ms.

### 7. Lista ↔ mapa

Celular (até 1023 px):

- "Ver no mapa": a capa, as chamadas e os filtros saem (sem animação: o mapa os cobre de cima); a página rola até as abas; o painel do mapa abre por cortina: o `::after` na cor do fundo faz `scaleY 1 → 0` com `transform-origin: 50% 100%`, 560 ms, troca. O mapa aparece de cima para baixo, a partir do link.
- `invalidateSize()` do Leaflet no fim da cortina (560 ms), nunca antes.
- Os pinos (`.pino-in`) caem 8 px e aparecem, 320 ms, saída, a partir de 440 ms, escada de 60 ms na ordem da lista, depois do primeiro `load` da camada de telhas ou 400 ms depois de a cortina abrir, o que vier primeiro.
- A atribuição aparece por opacidade aos 400 ms e não sai mais.
- A lista de todas as festas do dia sobe embaixo do mapa a partir de 400 ms.
- "Ver em lista": o mapa some por opacidade, 160 ms; a capa e as chamadas voltam como em 2, sem o título.

Desktop (1024 px ou mais): o mapa abre no lado direito da coluna, com a mesma cortina; a lista fica onde está; o link passa a "Fechar o mapa".

Pino:

- Toque: o pino fica marcado (`aria-pressed`, cores invertidas, `scale 1 → 1,08` no `.pino-in`, 160 ms, saída), e a linha da festa na lista embaixo ganha o fundo apagado e o nome sublinhado; a lista rola até ela (`scrollIntoView({ block: 'nearest' })`, suave só sem movimento reduzido). Segundo toque no mesmo pino abre o detalhe.
- Pino de lugar com mais de uma festa ("18h +1"): o primeiro toque marca as linhas daquela casa.
- No Leaflet: `zoomAnimation` e `fadeAnimation` desligados com movimento reduzido; `fitBounds` sem `animate` na abertura (a cortina já é o movimento).

Reduzido: o mapa aparece por opacidade, 160 ms, com os pinos.

### 8. Ver todas

- "Ver todas as 8 de sexta": a seta gira 90° (160 ms); os filtros e o cabeçalho sobem 12 px; as linhas sobem em escada a partir de 120 ms (seis degraus; a sétima em diante junto com a sexta). Nenhuma altura anima: o conteúdo de baixo é empurrado de uma vez.
- Filtro (`.chip`): o quadrado aparece por escala (160 ms, como no app). As linhas que saem: opacidade, 120 ms, troca; as que ficam deslizam para o lugar novo por FLIP (`translateY` da posição velha até 0), 320 ms, troca; as que entram sobem 12 px.
- Reduzido: troca direta, sem FLIP.

### 9. Como chegar, mini-mapa, fontes

- "Como chegar", "Mostrar mapa", "Encontrada em N fontes": a seta gira 90°, o conteúdo sobe 12 px em escada, 560 ms. O mini-mapa é o mesmo da 7 em versão estática (sem arrastar, sem zoom), com a cortina.
- Fechar: some por opacidade, 160 ms.

### 10. A avaliação no convite

- As opções: o marcador e o fio do pré-quiz (160 ms, como hoje).
- "Mandar resposta": o botão enche da esquerda, como o "Tô dentro" (`encher` do `plano.js`, no `::after`); o formulário sai por opacidade em 160 ms, troca; a confirmação sobe 12 px em escada.
- Reduzido: troca direta.

### 11. Tema dia ↔ noite

Como hoje (`tema.js`): o `main` apaga por opacidade em 160 ms, as cores trocam de uma vez, ele volta. Com o mapa aberto, a camada de telhas do outro tema é trocada no instante do apagado.

## Desempenho

- Medir num celular médio (ou no Chrome com CPU 4× mais lenta): a abertura do guia, a troca de aba e lista → detalhe sem quadro acima de 16,7 ms no painel Performance.
- `will-change: transform` só durante a animação (a Web Animations já promove a camada); nunca fixo no CSS.
- No máximo três etiquetas de vidro por capa.
- A foto da capa usa a miniatura de 480 px (`cartaz.miniatura`), nunca a de 1080; o desfoque de 22 px numa imagem de 480 px ampliada não perde nada que se veja.

## O que testar (para o `movimento-app.test.js`)

Forma do código, como o teste atual:

- `festa-capa` é nome de `.capa-foto`, nunca de `img`.
- Existe a regra de movimento reduzido para `::view-transition-group(*)`.
- Nenhum `animate(` novo com `clipPath`, `filter` ou `backdropFilter` em `app.js`, `comum.js`, `mapa.js`.
- `mapa.js` anima `.pino-in`, nunca o ícone do marcador, e chama `invalidateSize` depois da cortina.
- `::view-transition-new(festa-cartaz):only-child` tem atraso.

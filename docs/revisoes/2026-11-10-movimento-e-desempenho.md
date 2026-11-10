# Revisão adversarial de movimento, fluidez e responsividade, v1-festas (10/11/2026)

Tudo foi medido em tempo real. Usei o Chrome 157 headless, comandado por CDP a partir de scripts Node sem dependências, sobre um servidor próprio na porta 48771 com `FINDE_VAR` no scratchpad. O celular foi emulado em 390×844, dpr 3, `mobile: true`, com toque e UA de iPhone. O desktop, em 1280×800 com dpr 1 e mouse. Os toques são gestos reais (`Input.synthesizeTapGesture`), os cliques são `Input.dispatchMouseEvent` e as teclas, `Input.dispatchKeyEvent`. Os quadros vêm de `Page.startScreencast` e, em paralelo, de um log por `requestAnimationFrame` dentro da página (opacidade, cores, posição). CLS, tarefas longas, Event Timing, paint e LCP foram medidos por `PerformanceObserver`, injetado com `Page.addScriptToEvaluateOnNewDocument`, e houve um trace (`Tracing`) do fluxo inteiro. Áudio com `--mute-audio` e stub mudo de `AudioContext`. O código do protótipo não foi tocado. O relógio foi fixado por sobrescrita de `Date` (14h, 17h59, 20h), conforme o teste.

As capturas estão em `/private/tmp/claude-501/-Users-caiogouveia-Documents-Dev/db5031a9-8197-4384-a228-255bd2752f77/scratchpad/rev-mov/cap/`, abreviado abaixo como `cap/`. Os scripts (`cdp.mjs`, `t1-transicoes.mjs` a `t8-desktop-trace-dobra.mjs`) e as saídas em JSON estão na pasta acima da `cap/`. As tiras de quadros trazem, embaixo de cada quadro, os milissegundos desde o toque.

"Slow 4G" é o perfil do DevTools: 562,5 ms de latência, 1,44 Mbit/s de descida e 675 kbit/s de subida, com cache desligado. "CPU 4×" é `Emulation.setCPUThrottlingRate {rate: 4}`.

## Métricas

| Métrica | Valor medido | Leitura |
|---|---|---|
| Primeira pintura com conteúdo (Slow 4G + CPU 4×, dia) | 2.068 ms | Bloqueada pelo CSS do Google Fonts (termina em 1.265 ms) e pelo `app.css`. O TTFB sozinho é de 565 ms. |
| Tela útil (botão habilitado e próxima pista escrita) | 2.775 ms | Depende de `/api/formulario`, pedido só depois do `app.js`. |
| Fontes prontas (`document.fonts.ready`) | 3.450 ms | O texto aparece no fallback por 1,4 s e depois troca. |
| CLS na carga (dia / noite) | 0,038 / 0,009 | Abaixo de 0,1, mas o título pula 54 px quando a Instrument Serif chega. |
| CLS com a fonte atrasada 3 s | 0,032 | O título só pula aos 6,1 s, com a página já em uso. |
| Tarefas longas (> 50 ms), carga e fluxo com CPU 4× | 0 | A maior tarefa do trace levou 12,3 ms, o maior layout 5,1 ms. |
| INP por Event Timing (toque → próximo quadro, CPU 4×) | 24 a 32 ms | O primeiro quadro responde. O que atrasa é o que vem depois. |
| Toque numa resposta → tela nova | ~290 ms | Atraso de 220 ms de propósito (`AVANCO_MS`), mais o desenho. |
| Duração real do fade de tela | 166 a 167 ms | O CSS diz 160 ms (`app.css:592`). Bate, a 60 Hz. |
| Duração real da troca de tema | 366 a 367 ms | O CSS diz 400 ms (`app.css:74`). |
| "Ver festas" (pergunta 5) → resultado, Slow 4G | 846 ms | A tela fica parada nesse tempo. |
| Atalho de ajuste → resposta, Slow 4G | 852 ms | 52 quadros sem mudança nenhuma. |
| Contraste mínimo do título durante a troca de tema | 1,00:1 | O texto some. Ao fim, 10,93:1. |
| Toque duplo numa opção a ≥ 200 ms | avança duas perguntas | Responde uma pergunta que a pessoa não leu. |
| Toque duplo a 120 ms com `prefers-reduced-motion` | avança duas perguntas | Com o movimento reduzido, o avanço é imediato. |
| Polling do convite, ocioso | 5 pedidos em 20 s, 1 mutação de DOM | Não pisca. |
| Polling com a aba oculta / congelada | 0 pedidos em 9 s / 0 em 9 s | Pausa de verdade. |
| Outro aparelho vê uma resposta | 181 ms a 4.155 ms | Até um ciclo de 4 s. |
| Rolagem horizontal, de 320 a 1440 px, em todas as telas | 0 px | Nada sai pela lateral. |
| "Tô dentro" no convite, visor real do Safari no iPhone (390×664) | base em 721 px | Abaixo da dobra. |

[P1] marca o que a banca perceberia num celular de verdade. A ordem vai do mais grave ao menos grave.

---

## 1. [P1] Um segundo toque responde uma pergunta que a pessoa não leu

**Evidência** (`t3-toque.json`, tela fresca a cada caso, toque real):

| Caso | Intervalo entre toques | Onde terminou | O que estava sob o dedo no 2º toque |
|---|---|---|---|
| Duas vezes na mesma opção (pergunta 1) | 40 ms, 120 ms | 2 de 5 (certo) | a mesma opção |
| Duas vezes na mesma opção (pergunta 1) | 200, 240, 300, 400, 600 ms | **3 de 5** | a opção da pergunta 2 |
| "Ver festas do fim de semana" duas vezes | 80, 150, 250 ms | **2 de 5** | `label.opcao` "Sábado" da pergunta 1 |
| "Ver festas" da pergunta 5 duas vezes | 150, 300 ms | **tela de mandar** | `button.link` "Mandar pro grupo" |
| Mesma opção, com `prefers-reduced-motion` | 120 ms | **4 de 5** (partindo da 2) | a opção da pergunta seguinte |

Quem toca duas vezes na boas-vindas, gesto comum de impaciência, pula a pergunta do dia e fica com "Sábado" sem ter visto a tela. Quem toca duas vezes no último botão cai direto na tela de mandar da primeira festa da lista, sem ver o resultado. O limiar é o próprio `AVANCO_MS`: qualquer segundo toque depois de 220 ms já cai na tela nova, porque as opções ficam no mesmo lugar de uma pergunta para a outra.

**Causa:**
- `app.js:196-200`: o clique agenda `avancar` e só cancela o agendamento da mesma tela. A tela nova aceita toque desde o primeiro quadro, ainda com opacidade 0 (`app.css:592`).
- `app.js:96-100`: o clique em "Ver festas" não tem trava.
- `app.js:138-147`: `avancar` lê `estado.passo` na hora em que dispara, e não na hora do toque.
- Com o movimento reduzido, `reduzir.matches ? 0 : AVANCO_MS` (`app.js:199`) zera a única janela que absorvia o toque duplo.

**Correção:** uma trava de entrada por troca de tela, que vale para todos os botões:

```js
// app.js, perto de desenhar()
let trocouEm = 0;
document.addEventListener('click', (e) => {
  if (e.detail && performance.now() - trocouEm < 350) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
// em desenhar(), quando entrar === true:
trocouEm = performance.now();
```

Em `avancar`, guardar o passo do toque e desistir se ele mudou: `const de = estado.passo; avancoPendente = setTimeout(() => { if (estado.tela === 'pergunta' && estado.passo === de) avancar(); }, …)`. Isso também resolve o achado 9. Com o movimento reduzido, manter 150 ms de trava mesmo com o avanço imediato.

---

## 2. [P1] O botão "Continuar" pisca a cada resposta

**Evidência:** `cap/t1-tira-b-p1-p2.png` (e `b-p2-p3`, `b-p3-p4`, `b-p4-p5`). Aos 89 ms do toque em "Sábado", a pílula bordô "Continuar" aparece embaixo da lista. Ela fica 220 ms na tela e some junto com a pergunta, aos 322 ms. Acontece em todas as quatro perguntas de resposta única. É o elemento mais escuro da tela, então o olho vai até ele bem na hora em que a tela vai embora.

**Causa:** `app.js:183-185`. O `change` da opção tira `data-oculto` do botão, e o toque também dispara esse `change`. O comentário em `app.js:159-160` diz que o botão só aparece "ao voltar ou com foco de teclado", mas o código mostra o botão a cada toque.

**Correção:** marcar a origem no `click`, que chega antes do `change`, e só revelar o botão quando não for toque:

```js
let porToque = false;
input.addEventListener('click', (e) => { porToque = e.detail !== 0; … });
input.addEventListener('change', () => {
  if (p.tipo === 'um') { estado.respostas[p.chave] = o.id; if (!porToque) continuar.removeAttribute('data-oculto'); }
  …
});
```

---

## 3. [P1] Toques que esperam a rede não dão sinal nenhum

**Evidência** (Slow 4G + CPU 4×): `cap/t2-tira-ver-festas-slow4g.png` e `cap/t2-tira-ajuste-slow4g.png`. Entre o toque em "Ver festas" e o resultado passam 846 ms. Depois do escurecimento do `:active` (até ~245 ms), a tela não muda nada até os 711 ms: o texto do botão é o mesmo, ele não fica desabilitado e não aparece `aria-busy`. No atalho de ajuste ("mais barato") são 852 ms e 52 quadros iguais. O realce azul do toque some e nada fica no lugar. Num bar com 4G ruim, a reação natural é tocar de novo. No ajuste, a trava `estado.ocupado` engole o segundo toque em silêncio. Na pergunta 5, o segundo toque cai no achado 1.

**Causa:** `app.js:259-279` (`buscarFestas`) e `app.js:424-446` (`ajustar`) só mexem em `estado.ocupado` e num `aria-busy` que nenhum CSS usa. "Criar o convite" (`app.js:527`) desabilita o botão, e é o único que responde.

**Correção:**
- No toque, antes do `await`, desabilitar o botão e trocar o texto para "Buscando…". Na conversa, escrever na hora a fala da pessoa ("— mais barato") e esmaecer a lista: `.conversa[aria-busy="true"] ~ .festas { opacity: .5; transition: opacity 120ms }`.
- O mesmo vale para "Ajustar" e para os atalhos, que hoje são `button.link` sem estado de espera.

---

## 4. [P1] Na troca de tema, o texto e o botão somem por um instante

**Evidência:**
- `cap/t6-tira-tema-inicio-dia-para-noite.png`: aos 141 ms do toque, a tela está nude, sobra só o ponto rosé, e a palavra "finde." e o botão sumiram (nude sobre nude).
- `cap/t6-tira-tema-resultado-noite-para-dia.png`: no primeiro quadro, todo o texto é bordô sobre bordô.
- `cap/t6-tira-18h-sozinho.png`: às 18h00, sem toque nenhum, o quadro 0 é um retângulo nude com um ponto.

Medido por quadro (`t5-tema-e-movimento.json`), nos quatro sentidos: o contraste mínimo do título é 1,00:1, o do botão primário 1,00:1, o do rótulo 1,03:1 e o do texto corrido 1,05:1. O fundo leva 367 ms para atravessar. Durante 22 quadros, o fundo do `html` (troca seca) e o do `body` (com transição) têm cores diferentes, e isso aparece na rolagem elástica do iOS. Na boas-vindas, o layout inteiro troca de uma vez para o splash (`app.js:77-79`), enquanto o fundo ainda está no meio do caminho.

**Causa:**
- `app.css:74`: só o `body` tem transição de `background-color` e `color`. Os elementos com cor própria (`.titulo`, `.marca`, `.rotulo`, `.botao`…) trocam de uma vez.
- `app.css:78` e `tema.js:29-33`: a classe `.trocando` corta de propósito a transição dos botões. É por isso que o botão nude aparece sobre o fundo ainda nude.

Pôr transição em tudo não resolve, porque duas cores que se cruzam passam pela mesma cor no meio do caminho.

**Correção:** trocar por um crossfade de instantâneos, em que cada camada mantém o próprio contraste:

```js
// tema.js, em alternar() e no setInterval das 18h
const trocar = () => aplicar(novo);
if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(trocar);
else trocar();
```

```css
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 280ms; animation-timing-function: var(--curva); }
```

Tirar a `transition` do `body` (`app.css:74`) e a regra `.trocando` (`app.css:78` e `tema.js:26-33`). Sem View Transitions (Safari < 18), a troca fica seca, o que é melhor que o meio-termo ilegível.

---

## 5. [P1] As ações principais ficam abaixo da dobra no visor real do iPhone

**Evidência:** a 390×844 o emulador mostra a tela inteira do aparelho. O Safari do iPhone 14, com a barra embaixo, deixa uns 664 px visíveis. Medido a 390×664 (`t8-desktop-trace-dobra.json`, `t8b.mjs`):

| Tela | Elemento | Base | Visível até |
|---|---|---|---|
| Convite `/p/:id` | "Tô dentro" / "Não rola" | 721 px | 664 px |
| Mandar, convite criado | "Mandar no WhatsApp" | 724 px (topo em 680) | 664 px |

Capturas: `cap/t8-iphone-safari-convite.png` e `cap/t8-iphone-safari-convite-pronto.png`. Quem abre o link pelo WhatsApp vê a festa, a lista vazia e o campo de nome, mas os dois botões de resposta ficam fora da tela. O foco em `#convite-pronto` (`app.js:545-546`) não rola, porque o rótulo já está visível. Em larguras de Android (360×740) e no SE (375×667), o "Tô dentro" fica em 848 px (`cap/t4-convite.png`). Com sete nomes na lista, a base passa de 923 px a 320×568.

**Causa:** a ordem em `plano.js:171-189`, com quem vai antes da resposta, e em `app.js:573-580`, com a prévia longa antes do botão.

**Correção:**
- No convite, levar o formulário (`form`) para antes de `section.quem`. A lista de quem vai é contexto e pode vir depois.
- Ou prender `.par` embaixo com `position: sticky; bottom: max(var(--e4), env(safe-area-inset-bottom)); background: var(--fundo); padding-top: var(--e3)`.
- Na tela de mandar, pôr o botão do WhatsApp logo depois de "O convite está pronto" e a prévia embaixo dele.

---

## 6. [P1] A fonte chega depois e o título da boas-vindas pula 54 px

**Evidência:** `cap/t2-carga-dia.png` e `cap/t2-carga-fonte-atrasada-3s.png`.
- Com Slow 4G + CPU 4×, o texto aparece aos 2,07 s no fallback, e as fontes só ficam prontas aos 3,45 s.
- "A pista abre antes." quebra em duas linhas no Times (116 px de altura) e cabe numa só na Instrument Serif (72 px). Como `.abre` alinha pelo pé, o título desce de y = 382 para y = 436, e "SEX A DOM · A PARTIR DAS 17H" desce junto (layout-shift às 3.047 ms, valor 0,0234).
- O wordmark sai em Georgia itálico, mais pesado, e só vira Fraunces 300 aos 3,3 s (o ponto rosé se move 4 px).
- Com a fonte atrasada 3 s, o salto acontece aos 6,1 s, quando a pessoa já está lendo.
- Não há FOIT, porque `display=swap` mostra o texto desde a primeira pintura. Com o Google bloqueado, a página funciona inteira no fallback (`cap/t2-fonte-bloqueada.png`).

**Causa:**
- `index.html:20` e `plano.html:20`: o CSS do Google Fonts bloqueia a renderização (termina em 1.265 ms). Os arquivos `woff2` vêm de uma terceira origem e só são pedidos depois que o CSS é lido.
- `app.css:27-29`: os fallbacks não têm ajuste de métrica.

**Correção:**
- Servir os cinco arquivos usados (Fraunces itálico 300, Instrument Serif normal e itálico, DM Sans 400 e 500, subconjunto latino) a partir de `publico/fontes/`. A CSP já permite `self`, e dá para tirar `fonts.googleapis.com` e `fonts.gstatic.com` dela.
- Fazer `<link rel="preload" as="font" type="font/woff2" crossorigin>` dos três que aparecem na boas-vindas.
- Declarar fallbacks com métrica ajustada, para que a quebra não mude:

```css
@font-face { font-family: 'Instrument Serif Fallback'; src: local('Times New Roman'); size-adjust: 84%; ascent-override: 98%; descent-override: 26%; }
--serifa: 'Instrument Serif', 'Instrument Serif Fallback', serif;
```

  Os percentuais são para calibrar: medir com a fonte real até a quebra de "A pista abre antes." coincidir a 360 e a 390 px.
- No wordmark, usar `font-display: block` com até 100 ms, ou um fallback com `font-weight: 300` explícito.

---

## 7. [P2] Cada troca de tela apaga a tela inteira, cabeçalho incluído

**Evidência:** `cap/t1-tira-b-p1-p2.png`. Aos 322 ms há um quadro totalmente vazio. A marca, "Voltar" e a barra de progresso, que são iguais nas duas perguntas, somem e voltam junto com o resto. A opacidade sobe de 0 a 1 em 167 ms (0,28, 0,52, 0,69, 0,81, 0,89, 0,94, 0,97, 0,99, 1,00). O mesmo acontece em boas-vindas → pergunta, pergunta 5 → resultado e resultado → mandar (`t1-transicoes.json`). Com `prefers-reduced-motion`, a animação cai para 1 ms, mas o primeiro quadro ainda sai com opacidade < 1 (`reduzido.p1ParaP2.quadrosComOpacidadeMenorQue1: 1`).

**Causa:** `app.js:64-75` troca tudo com `replaceChildren`, e `.entra` (`app.css:592`) anima o contêiner inteiro a partir de 0. `app.css:597` usa `animation-duration: 1ms` em vez de `animation: none`.

**Correção:**
- Animar só o que muda: `.entra .cabeca-pergunta, .entra .opcoes, .entra .cabeca { animation: surgir 160ms var(--curva) both; }` e nada em `.topo` e `.progresso`.
- Começar de `opacity: .35`, não de 0. E avançar a barra com `transition: background-color 200ms` no `span.feito`.
- No movimento reduzido, usar `.entra, .entra * { animation: none !important; }`.

---

## 8. [P2] A resposta velha do polling desfaz a resposta da pessoa por 4 s

**Evidência:** `t7b-resposta-velha.json` e `cap/t7-tira-resposta-velha.png`. Ju está "dentro" no aparelho A. Segurei uma leitura do polling por 2,5 s, como faz uma rede móvel que reordena, e Ju tocou "Não rola" no meio. O log de mutações mostra:

| t (ms) | Lista e botões |
|---|---|
| 0 | Caio e Ju · Ninguém · "Você tá dentro" |
| 3.919 | Caio · Ju · "Anotado" (a resposta dela) |
| 5.985 | **Caio e Ju · Ninguém · "Você tá dentro"** (a leitura velha) |
| 9.990 | Caio · Ju · "Anotado" |

Por 4 s, a tela diz que ela está dentro, depois de ela ter dito que não vai.

**Causa:** `plano.js:62-85`. `buscar` aplica qualquer resposta com texto diferente da assinatura, mesmo uma que saiu antes do POST. A trava `ocupado` (`plano.js:91`) só impede que um polling comece, e não descarta um que já está no ar.

**Correção:** um contador de geração.

```js
let geracao = 0;
async function buscar() { const g = geracao; … r = await chamar(…); if (g !== geracao) return; … }
// em responder(), antes do POST:
geracao++;
```

---

## 9. [P2] "Voltar" logo depois de responder é desfeito

**Evidência:** `t3-toque.json` → `voltar`. Na pergunta 2, toquei uma opção e, 80 ms depois, "Voltar". O esperado era a pergunta 1, mas a tela terminou na 2 de 5. O avanço agendado disparou depois do `popstate` e avançou a partir da pergunta 1 com a resposta antiga. O histórico ganhou uma entrada a mais (`history.length` = 4).

**Causa:** `app.js:51-60` (o `popstate` não cancela `avancoPendente`) e `app.js:138-147`.

**Correção:** a mesma do achado 1, com o passo guardado no toque. E `clearTimeout` do avanço pendente no `popstate`, guardando o timer em `estado`.

---

## 10. [P2] O realce azul do toque fica em links e no seletor de tema

**Evidência:** `cap/t1-tira-d-ajuste-atalho.png` (retângulo azul sobre "mais barato" aos 115 ms) e `cap/t6-tira-tema-resultado-noite-para-dia.png` (caixa azul sobre o seletor por ~250 ms, atravessando a troca de tema). O valor computado é `rgba(51, 181, 229, 0.4)` em `.link`, `.botao-texto`, `.tema-botao` e `.campo`. Em `.botao` e `.opcao` ele é `rgba(0,0,0,0)`. No iOS o realce é cinza, mas aparece do mesmo jeito.

**Causa:** `-webkit-tap-highlight-color: transparent` só existe em `.botao` (`app.css:295`) e `.opcao` (`app.css:378`).

**Correção:** `button, a, label, input { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }`. O `:active { opacity: .85 }` que já existe passa a ser o retorno do toque. O `touch-action` também tira o risco de zoom por toque duplo nos links do pedido.

---

## 11. [P2] Com o teclado aberto, o campo da conversa sai da tela quando o Finde não entende

**Evidência:** `cap/t4-teclado-depois-nao-entendeu.png`. A 390×508 (844 menos os 336 px do teclado do iPhone), escrevi "algo mais tranquilo" e toquei "Ajustar". A resposta aparece no topo, mas o campo, que continua focado e com o texto devolvido, fica em y = 923, abaixo da área visível. Quem quer corrigir a frase não vê onde está digitando. Antes de enviar, o campo encostava no teclado: base em 508 de 508 (`cap/t4-teclado-campo-antes.png`).

**Causa:** `app.js:448-455`. Rola até a conversa e, quando não entende, foca o campo com `preventScroll: true`.

**Correção:** quando `!d.entendeu`, rolar até o formulário (`form.scrollIntoView({ block: 'end' })`) e mostrar a resposta do Finde logo acima do campo, dentro de `.ajuste`. Quando entende, manter o comportamento atual.

---

## 12. [P2] A boas-vindas pula 26 px quando os dados chegam

**Evidência:** layout-shift às 2.601 ms (valor 0,010). `.proxima` passa de 59 a 85 px de altura, e o título, o fio e o texto sobem 26 px (de 413 para 387). Visível em `cap/t2-carga-dia.png`, entre os quadros de 2.098 e 2.648 ms. Acontece em toda carga, com ou sem fonte.

**Causa:** `app.js:103-106` desenha "Abrindo a pista…" numa linha só, e `app.js:600-607` troca por duas linhas.

**Correção:** reservar as duas linhas desde o começo, com `el('p', { class: 'proxima-nome', texto: ' ' })` no lugar do `null`, ou `min-height` em `.proxima`. Melhor ainda: o servidor já reescreve o HTML (`servidor.js`, `enviarPagina`) e pode embutir `proxima` e o formulário num `<script type="application/json">`. Isso tira uma ida e volta: a tela útil cai de 2,78 s para perto da primeira pintura, 2,07 s.

---

## 13. [P2] Dobra em telas baixas e no celular deitado

**Evidência:** `cap/t4-inicio.png`, `cap/t4-pergunta5.png` e `t4-responsivo.json`.

| Tela | Visor | Elemento | Base | Altura do visor |
|---|---|---|---|---|
| Boas-vindas | 320×568 | "Ver festas do fim de semana" | 656 | 568 |
| Boas-vindas | 844×390 | idem | 566 | 390 |
| Pergunta 5 | 320×568 | "Ver festas" | 639 | 568 |
| Pergunta 5 | 844×390 | idem | 639 | 390 |
| Resultado | 320×568 e 375×667 | festas inteiras à vista | 1 de 3 | |

Deitado, a boas-vindas mostra só o lockup e o título. Não há corte nem sobreposição em nenhuma das 11 medidas, e a rolagem horizontal é 0 em todas.

**Causa:** `app.css:326-334`. O lockup tem `padding-top: 32px`, e `.abre` tem `padding: 48px 0 32px` fixo, sem variação pela altura.

**Correção:**

```css
@media (max-height: 620px) {
  .tela-inicio .lockup { padding-top: 0; }
  .lockup .marca { font-size: 64px; }
  .tela-inicio .abre { padding: var(--e5) 0 var(--e4); }
  .titulo--pergunta { font-size: 36px; }
}
```

---

## 14. [P3] Detalhes

- **Criar o convite sobe a tela 12 px.** O campo de nome (30 px) vira um `span`, e o título passa de y = 134 para y = 122 (`t8` → `saltoTituloAoCriar`, `cap/t1-tira-f-criar-convite.png`). Causa: `app.js:498-503`. Correção: dar ao `span` o mesmo `display: inline-block; height: 30px; line-height: 30px` do campo.
- **Áreas de toque abaixo de 44 px.** Medidas por teste de acerto (`elementFromPoint`), não pela caixa:
  - os trechos do pedido ("Sábado", "das 19h à 1h", "gente de 25 a 29") têm 43 px de altura (`app.css:410`, `padding: 10px 0`): passar para 11 px;
  - o campo "seu nome" da tela de mandar tem 30 px (`app.css:506`): passar para `height: 44px` com `padding-top: 14px`, mantendo o fio embaixo.
- **O rodapé quebra em duas linhas a 360 px.** "Protótipo · festas fictícias" e "14H00 · NOITE ÀS 18H" ficam com duas linhas cada (`cap/t4-inicio.png`, 360×740). Correção: `white-space: nowrap` em `.tema-botao` e `.nota`, com `flex-wrap: wrap` em `.rodape-linha` (`app.css:579`).
- **A queda de rede não sai da tela.** Com 6 s sem internet, o convite escreve "Sem conexão agora. Tento de novo em instantes." Dez segundos depois da volta, a mensagem continua lá (`t7-convite.json` → `quedaDeRede`, `cap/t7-convite-A-depois-da-queda.png`). Causa: `plano.js:81` sai cedo quando a assinatura não mudou, sem limpar o status escrito em `plano.js:68`. Correção: limpar o status antes do `return` (`if (dom.status && /Sem conexão/.test(dom.status.textContent)) desenhar();`).
- **A frase do curador é cortada com reticências a 320 px** ("Boa hora pra cheg…", `cap/t4-resultado.png`), pelo `line-clamp: 2` (`app.css:468`). A 320 px, liberar três linhas.
- **Desktop:** com o cursor parado, a opção da tela nova já nasce em hover (`hoverAposAvanco`). É cosmético e só acontece com mouse.

---

## O que resistiu ao ataque

- **O primeiro quadro.** O INP ficou entre 24 e 32 ms em todos os toques com CPU 4×. A marcação (● e peso 500) aparece no quadro seguinte ao toque.
- **Tarefas longas.** Zero, na carga e no fluxo inteiro com CPU 4×. A maior tarefa do trace levou 12,3 ms, o maior layout 5,1 ms e o maior recálculo de estilo 1,2 ms.
- **Rolagem horizontal, corte e sobreposição.** Nada de 320 a 1440 px, nem deitado. As laterais do desktop não invadem a coluna a 1024 px.
- **Hover grudado.** Não há no celular: as regras de hover estão em `@media (hover: hover) and (pointer: fine)` (`app.css:307`), e a emulação confirma `hover: none`.
- **Teclado físico.** As setas escolhem sem avançar, o "Continuar" aparece com foco de teclado e o Enter confirma. O toque duplo de mouse a 90 ms não avança duas vezes.
- **Convite com dois aparelhos.**
  - Nomes diferentes ao mesmo tempo: os dois entram.
  - O mesmo nome nos dois aparelhos: o segundo recebe "Já tem Ju na lista. É você?".
  - O polling ocioso faz 5 pedidos em 20 s e 1 mutação de DOM, sem piscar (`cap/t7-tira-polling-A-ve-B.png`).
  - Com a aba oculta de verdade (outra aba ativada no headless, `visibilityState: hidden`), não houve pedido em 9 s. Com a página congelada (`Page.setWebLifecycleState frozen`), também não. Ao voltar, o nome novo aparece em 33 ms.
  - Digitar o nome com o polling rodando não tira o foco nem o cursor.
- **Movimento reduzido.** A animação de tela cai para 1 ms, a transição do tema também, o `scrollIntoView` fica `auto` e o atraso de avanço vai a 0. Sobram o quadro único do achado 7 e o toque duplo do achado 1.
- **Fonte bloqueada.** A página funciona inteira no fallback, sem FOIT.

## Ordem sugerida

1, 2 e 3 vêm juntos, porque mexem nos mesmos manipuladores de toque e dão a sensação de app firme. Depois o 5 (ordem do convite e da tela de mandar), o 4 (View Transition no tema) e o 6 (fontes servidas pelo próprio servidor, com preload). Os demais cabem numa passada.

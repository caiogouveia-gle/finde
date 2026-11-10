# Validação de movimento, desempenho, toque e responsividade, v1-festas (10/11/2026, segunda rodada)

Esta é a segunda rodada, adversarial, sobre o código que saiu da fusão das três frentes (lógica, interação e CSS). A primeira está em `2026-11-10-movimento-e-desempenho.md`, e os números citados como "antes" vêm dela.

**Como foi medido.** O ambiente repete o da primeira rodada. Usei o Chrome 157 headless (`--headless=new --mute-audio --disable-features=MacAppCodeSignClone`, porta 9351, perfil no scratchpad), comandado por CDP a partir de scripts Node sem dependências. O servidor rodou com `FINDE_PORTA=48801` e `FINDE_VAR` no scratchpad. O celular foi emulado em 390×844, dpr 3, com toque real (`Input.synthesizeTapGesture`) e UA de iPhone. As medidas por quadro vêm de `requestAnimationFrame` dentro da página, e os filmes, de `Page.startScreencast`. CLS, Event Timing, tarefas longas, paint e LCP saíram de `PerformanceObserver`. Slow 4G é o perfil do DevTools (562,5 ms, 1,44 Mbit/s), com cache desligado. CPU 4× é `Emulation.setCPUThrottlingRate`. Usei stub mudo de `AudioContext`, e nada tocou som. Servidor e Chrome foram encerrados pelo PID, e o código do protótipo não foi tocado.

**Retrato do código.** O código mudou durante a medição: `app.js`, `comum.js` e `index.html` foram regravados às 12h28, e o título da boas-vindas virou "still going out. *just differently.*". As medidas valem para o estado das 12h28. Há uma cópia em `…/scratchpad/val-mov/snap/`, e as linhas citadas abaixo são dessa versão.

**Onde está a evidência.** Os scripts (`v1-transicoes.mjs` a `v11-passou.mjs`), as saídas em JSON e as capturas (`cap/`) estão em `/private/tmp/claude-501/-Users-caiogouveia-Documents-Dev/db5031a9-8197-4384-a228-255bd2752f77/scratchpad/val-mov/`. Abaixo, essa pasta aparece abreviada como `val-mov/`.

## Achados da primeira rodada

| Achado anterior | Situação agora | Evidência |
|---|---|---|
| 1. [P1] Toque duplo responde a pergunta seguinte | **Resolvido** | Na mesma opção, com 40 a 400 ms entre os toques, a pessoa termina em "2 de 5". Com 600 ms, avança, porque o segundo toque chega depois dos 450 ms de trava e conta como toque de propósito. Dois toques em "Ver festas" (80, 150 e 250 ms) terminam em "1 de 5". Dois toques no último botão terminam no resultado, e o segundo cai sobre `li.festa`, que não reage. Com movimento reduzido, 120, 300 e 500 ms ficam em "2 de 5", e 700 ms avança. Ver `val-mov/t3-toque.json` e `v6-fluxo.json` → `duploReduzido`. |
| 2. [P1] "Continuar" pisca a cada resposta | **Resolvido** | Em p1→p2, p2→p3, p3→p4 e p4→p5 por toque, nenhum quadro mostra o botão com opacidade acima de 0. Ele só aparece na pergunta 5, que é de escolha múltipla, e ao voltar a uma pergunta já respondida, como previsto. Ver `v1-transicoes.json` e `cap/v1-tira-b-p1-p2.png`. |
| 3. [P1] Toques que esperam a rede não dão sinal | **Parcial** | "Ver festas" com Slow 4G passa a mostrar "Buscando…" e o fio correndo no primeiro quadro depois do toque, e o resultado chega aos 843 ms (antes, 846 ms sem sinal nenhum). No atalho de ajuste, a fala "— mais barato", o "Procurando…" e o atalho em espera aparecem no mesmo quadro, e a resposta chega aos 885 ms. Mas a lista não esmaece durante a espera: a opacidade de `.festas` fica em 1 do toque até a resposta (achado novo N2). Ver `v2-desempenho.json` e `v7-extras.json` → `listaNoAjuste`. |
| 4. [P1] Na troca de tema, texto e botão somem | **Resolvido** | O contraste intrínseco mínimo, isto é, a cor do texto contra o fundo sem contar a opacidade, ficou em 10,93:1 em todos os quadros, nos quatro sentidos e na troca automática das 18h (antes, 1,00:1). O conteúdo apaga em 117 ms, o fundo troca no quadro em que o `main` está em α = 0, e o conteúdo volta em 117 ms. São 6 quadros (~100 ms) abaixo de 50%. O `html` e o `body` não divergem em nenhum quadro (antes, 22). Com movimento reduzido, a troca é seca. O contraste efetivo chega a 1:1 no fundo do mergulho, e isso é intencional: é um corte, não uma mistura. Ver `v4-tema.json` e `cap/v4-tira-inicio-dia-para-noite.png`. |
| 5. [P1] Ações abaixo da dobra no Safari do iPhone (390×664) | **Resolvido** | No convite, a base de "Tô dentro" está em 609 de 664 (antes, 721), vazio ou com sete nomes. A 360×640, fica em 609 de 640. Na tela de mandar, "Mandar no WhatsApp" vai de 543 a 587 de 664 (antes, 680 a 724). No SE (375×548 visíveis), o convite continua em 601 de 548. Ver `v5-convite.json`, `cap/v5-convite-390x664-vazio.png` e `cap/v5-mandar-pronto-390x664.png`. |
| 6. [P1] A fonte chega depois e o título pula 54 px | **Resolvido, com custo** | O CLS da carga ficou em 0 em todos os casos: dia, noite, fonte atrasada 3 s, fonte bloqueada e noite com atraso (antes, de 0,009 a 0,038). Comparei reserva e fonte real em 6 larguras e 7 telas: 37 de 42 combinações são idênticas. As diferenças ficam no resultado a 390 (o pedido quebra em 2 linhas na reserva e em 1 na fonte) e a 320 (+19 px numa festa), e em 2 px na boas-vindas a 360. O custo foi a primeira pintura, que piorou ~800 ms (achado novo N1). Ver `v3-fontes.json` e `v2-desempenho.json`. |
| 7. [P2] A troca de tela apaga tudo, cabeçalho incluído | **Resolvido** | O topo e a barra de progresso ficam em opacidade 1 em todos os quadros. A cabeça e as opções sobem de 0,35 a 1 em ~150 ms. Com movimento reduzido, nenhum quadro fica abaixo de 1. Ver `v1-transicoes.json` e `v1-transicoes-reduzido.json`. |
| 8. [P2] A resposta velha do polling desfaz a resposta | **Resolvido** | Com um GET do polling preso por 2,5 s, Ju muda para "não rola", e a lista passa direto a "Caio · Ju" sem voltar atrás nos 9 s seguintes. Ver `v5-convite.json` → `respostaVelha`. |
| 9. [P2] "Voltar" logo depois de responder é desfeito | **Resolvido** | Com "Voltar" 80 ms depois de tocar a opção, a tela termina em "1 de 5". O `history.length` 4 é o normal: `about:blank`, início, p1 e p2. |
| 10. [P2] Realce azul do toque | **Resolvido** | `-webkit-tap-highlight-color` vale `rgba(0,0,0,0)` em `.botao`, `.link`, `.tema-botao` e `.campo`. |
| 11. [P2] Com o teclado aberto, o campo sai da tela quando o Finde não entende | **Resolvido** | A 390×508, depois de "algo mais tranquilo", o campo fica entre 452 e 496 de 508, focado e com o texto, e a resposta aparece logo acima (y = 391). Ver `v6-fluxo.json` → `tecladoVirtual` e `cap/v6-teclado-nao-entendeu.png`. |
| 12. [P2] A boas-vindas pula 26 px quando os dados chegam | **Resolvido** | Os dados vêm embutidos no HTML. Na carga, nenhum layout-shift. |
| 13. [P2] Dobra em telas baixas e deitado | **Parcial** | Boas-vindas a 320×568: "Ver festas" com base em 562 (antes, 656), resolvido. Pergunta 5 a 320×568: 625 (antes, 639). Deitado (844×390): boas-vindas em 540 (antes, 566), pergunta 1 em 440 e pergunta 5 em 625, tudo abaixo de 390. Ver `v9-dobra.json`. |
| 14. [P3] Criar o convite sobe a tela | **Piorou** | O salto passou de 12 px para 28 px (achado novo N8). |
| 14. [P3] Áreas de toque < 44 px | **Parcial** | O campo de nome da tela de mandar tem 44 px, resolvido. Os trechos do pedido caíram de 43 para 28 px de altura efetiva (achado novo N9). |
| 14. [P3] Rodapé em duas linhas a 360 | **Resolvido** | Com 45 px, cabe numa linha a 360. A 320 quebra em duas linhas de 20 e 44 px, sem cortar texto. |
| 14. [P3] "Sem conexão" não sai da tela | **Resolvido** | A mensagem aparece no evento `offline` e some no mesmo instante em que a rede volta (6.004 ms, para 6 s fora). Ver `v5-convite.json` → `queda`. |
| 14. [P3] Frase do curador cortada a 320 | **Resolvido** | São três linhas a 320 (`app.css:557`), sem reticências nos pedidos medidos. |
| Polling do convite | **Resolvido, com resto** | Ocioso, faz 5 pedidos em 20 s. Com a aba oculta ou num convite que passou, 0 pedidos em 10 s. Mas agora há 51 mutações de DOM em 20 s (antes, 1), achado novo N11. |
| Recarregar | **Parcial** | Recarregar em p3, no resultado ou em mandar devolve à mesma tela, com a linha do tempo posicionada (0 traços sem `left`). Mas "Voltar" depois de recarregar leva ao início, e o histórico ganha uma entrada a cada recarga (achado novo N6). |
| Teclado físico | **Resolvido** | As setas escolhem sem avançar, o "Continuar" aparece (opacidade 1, `pointer-events: auto`) e o Enter avança. O Enter não é travado logo depois da troca, como deve ser. Um duplo clique de mouse a 90 ms avança uma vez só. Ver `v7-extras.json` → `teclado`. |

## Métricas, antes e depois (390×844 com toque; Slow 4G e CPU 4× quando indicado)

| Métrica | Antes | Agora | Leitura |
|---|---|---|---|
| TTFB (Slow 4G) | 565 ms | 566 ms | igual |
| Primeira pintura, boas-vindas (Slow 4G + CPU 4×) | 2.068 ms | 2.872 ms (três rodadas: 2.904 a 2.968) | **+~850 ms** (N1) |
| Tela útil (botão habilitado e próxima pista; relógio CDP) | 2.775 ms | 3.212 ms | +437 ms (N1) |
| Fontes prontas | 3.450 ms | 2.866 ms | −584 ms |
| CLS da carga, dia / noite | 0,038 / 0,009 | 0 / 0 | resolvido |
| CLS com a fonte atrasada 3 s / bloqueada | 0,032 / 0,010 | 0 / 0 | resolvido |
| Tarefas longas na carga (CPU 4×) | 0 | 1, de 76 a 134 ms | Layout 30 ms, recálculo de estilo 23 ms e `app.js` 16 ms (trace, N12) |
| Tarefas longas no fluxo (CPU 4×, fontes em cache) | 0 | 0 | igual |
| INP por Event Timing (CPU 4×) | 24 a 32 ms | 16 a 80 ms | O pior é "Ver festas" na carga fria (80 ms). Nas outras interações, de 24 a 40 ms. |
| Toque numa opção → tela nova (do clique à troca do DOM) | ~290 ms (pelo screencast) | 222 a 228 ms | É o `AVANCO_MS`. |
| "Ver festas" (boas-vindas) e "Mandar pro grupo" → tela nova | | 2 a 28 ms | |
| Fade de tela | 0 → 1 em 167 ms, tela inteira | 0,35 → 1 em ~150 ms, só o conteúdo | resolvido |
| Troca de tema | 367 ms de mistura, contraste mínimo 1,00:1 | 240 ms de corte, contraste intrínseco mínimo 10,93:1 | resolvido |
| "Ver festas" (p5) → resultado, Slow 4G | 846 ms sem sinal | 843 ms, "Buscando…" no 1º quadro | sinal resolvido |
| Atalho de ajuste → resposta, Slow 4G | 852 ms, 52 quadros parados | 885 ms, fala e "Procurando…" no 1º quadro | sinal resolvido, lista não esmaece (N2) |
| CLS depois de um ajuste | 0 | 0,039 a 0,067 por ajuste | N10 |
| Toque duplo ≥ 200 ms | avança duas | avança uma | resolvido |
| Polling ocioso | 5 pedidos / 20 s, 1 mutação | 5 pedidos / 20 s, 51 mutações | N11 |
| Resposta velha do polling | desfeita por 4 s | não desfaz | resolvido |
| Rolagem horizontal, 320 a 1440 | 0 px | 0 px, exceto o resultado a 320, com 9 px | N5 |
| "Tô dentro" a 390×664 | base em 721 | base em 609 | resolvido |
| Convite `/p/:id` (Slow 4G + CPU 4×) | | FCP 1.948 ms ("Abrindo a pista…"), LCP 3.236 ms, CLS 0 | "Abrindo a pista…" fica ~1,3 s na tela e o convite entra com fade. Sem salto. |
| Linha do tempo: rótulos que colidem ou saem do traço | | 0 em 26 linhas, a 320 e a 390 (9 pedidos) | Sem problema. |

## Achados novos

### N1. [P2] Os quatro preloads de fonte atrasam a primeira pintura em ~500 a 850 ms no Slow 4G

**Evidência:** `v2-desempenho.json` e `v8-preload.json`. Para medir o custo, o HTML foi reescrito em trânsito por `Fetch`, sem tocar no código, em três rodadas de cada variante:

| Variante | FCP | Tela útil (relógio da página) | Fontes prontas | CLS |
|---|---|---|---|---|
| Como está, 4 preloads (132 KB) | 2.904 a 2.968 ms | 2.808 a 2.858 ms | ~2.900 ms | 0 |
| Sem nenhum preload | 2.376 a 2.400 ms | 2.187 a 2.243 ms | ~3.650 ms | 0 |
| Só os dois da Instrument Serif | 2.516 a 2.596 ms | 2.404 a 2.449 ms | 3.654 a 6.196 ms | 0 |

A página não pinta nada antes do `app.js`, porque o `main` vem vazio. Os quatro `woff2` pedidos com prioridade alta dividem a banda com `app.css`, `comum.js` e `app.js`. O `app.js` termina aos 2.759 ms, contra ~2.000 ms antes.

**Causa:** `index.html:18-21` e `plano.html:18-21`, e o `dm-sans.woff2` variável de 62 KB (100 a 1000), o maior dos quatro, que só usa os pesos 400 e 500.

**Correção:** tirar o preload da DM Sans e da Instrument Serif itálica. As reservas `Sans Reserva` e `Serifa Reserva` itálica já têm a métrica ajustada e não pulam (`v3-fontes.json`). Recortar a DM Sans em dois arquivos estáticos, 400 e 500, no subconjunto latino. Ao tirar o preload da Fraunces, trocar `font-display: block` (`app.css:30`) por `swap`, porque a `Marca Reserva` (`app.css:53-58`) já existe. Com `block` e sem preload, o wordmark fica invisível até a fonte chegar.

### N2. [P2] A lista não esmaece durante o ajuste, e a lista inteira volta a aparecer do zero depois dele

**Evidência:** `v7-extras.json` → `listaNoAjuste`. O `aria-busy="true"` entra aos 104 ms, mas a opacidade de `.festas` fica em 1 até a resposta. Depois da resposta, a lista inteira sobe de 0,35 a 1 em 160 ms, e não só as festas novas.

**Causa:** `app.css:715-716`. A animação `surgir` com preenchimento `both` em `.entra .festas` continua mandando na opacidade depois de terminar, e uma animação preenchida ganha da regra `.tela-resultado[aria-busy="true"] .festas { opacity: .45 }` (`app.css:515`). Como `trocarResultado` (`app.js:562-566`) troca `#lista-festas` dentro de uma `.tela-resultado` que ainda tem `.entra`, a lista nova casa de novo com `.entra .festas` e anima.

**Correção:** trocar `both` por `backwards` nas regras de `.entra` (`app.css:716`). Ou tirar a classe `.entra` da tela no `animationend` do primeiro desenho, o que resolve os dois problemas e deixa animar só `.festa.nova`, como diz o comentário de `app.css:712-713`.

### N3. [P2] "Voltar" durante "Ver festas" com a rede lenta é desfeito

**Evidência:** `v6-fluxo.json` → `voltarDuranteBusca`. Na pergunta 5, toquei "Ver festas" e, 250 ms depois, "Voltar". A tela foi para "4 de 5", mas quando a resposta chegou, saltou para o resultado.

**Causa:** `app.js:328-359`. Depois do `await`, `buscarFestas` chama `ir('resultado')` sem conferir se a pessoa ainda está na tela que pediu a busca.

**Correção:** guardar `const de = history.state` (ou `estado.tela` e `estado.passo`) antes do `await` e, se mudou, chamar `soltar()` e sair sem navegar. Melhor ainda: um `AbortController` cancelado no `popstate`.

### N4. [P2] Sair do resultado durante um ajuste apaga o nome digitado e tira o foco

**Evidência:** `v6-fluxo.json` → `sairDuranteAjuste`. Com Slow 4G, toquei um atalho e, 80 ms depois, "Mandar pro grupo" (a lista continua tocável durante a espera). Na tela de mandar, digitei "Caio digitando". Quando a resposta do ajuste chegou, a tela foi redesenhada: o campo voltou vazio, e o foco caiu no `body`, o que fecha o teclado no iPhone.

**Causa:** `app.js:553-558`. Sem `#tela-resultado` na tela, `trocarResultado` chama `desenhar()` com `estado.tela === 'mandar'`, chamado a partir de `ajustar` (`app.js:607-620`).

**Correção:** em `ajustar`, depois do `await`, se `estado.tela !== 'resultado'`, atualizar o estado, chamar `salvar()` e sair sem desenhar. Em `trocarResultado`, trocar o `desenhar` por `return` quando a tela não for o resultado.

### N5. [P2] A 320 px, um motivo longo alarga a página do resultado para 329 px

**Evidência:** `v10-transborda.mjs` e `v9-dobra.json`. No pedido sáb / 19h à 1h / 25 a 29 / R$ 80, o item "acaba às 23h, dá pra voltar cedo" mede 197 px numa coluna de ~164 px. O documento passa a ter 329 px de largura: o Safari e o Chrome do celular reduzem o zoom da página inteira (o `innerWidth` virou 329) ou deixam rolar de lado. A primeira rodada tinha 0 px em todas as larguras.

**Causa:** `app.css:560`, `.porque .item { white-space: nowrap; }`.

**Correção:** trocar por `white-space: normal`, ou manter o `nowrap` só a partir de 360 px (`@media (min-width: 360px)`).

### N6. [P2] Depois de recarregar, "Voltar" vai para o início, e o histórico cresce a cada recarga

**Evidência:** `v6-fluxo.json` → `recarregar` e `recarregarVoltar`. Recarreguei na tela de mandar e toquei "Voltar": a tela foi para o início, e não para o resultado. Um segundo "voltar" do navegador leva ao resultado. Em p3, "Voltar" depois de recarregar também vai para o início, e não para p2. O `history.length` sobe uma entrada a cada recarga (5 → 6, 9 → 10, 11 → 12).

**Causa:** `app.js:795-801`. `iniciar()` sempre faz `replaceState(inicio)` e `pushState(tela)`. Numa recarga, as entradas antigas da mesma aba continuam embaixo.

**Correção:** quando `history.state && history.state.tela` já existe (recarga ou volta de outra página), usar esse estado e só desenhar, sem `replaceState` nem `pushState`. Montar a pilha início + tela só quando não houver estado (aba nova a partir de uma sessão salva).

### N7. [P3] Pergunta 5 e boas-vindas deitado continuam abaixo da dobra

Este é o resto do achado 13. A 320×568, o botão da pergunta 5 tem base em 625. A 844×390, a boas-vindas tem o botão em 540, a pergunta 1 em 440 e a pergunta 5 em 625.

**Causa:** `.espaco` em `app.css:444` e `479` e `.opcao` em `app.css:480` não encolhem mais com a altura.

**Correção:** em `@media (max-height: 620px)`, usar `.espaco { flex-basis: var(--e4) }` e `.opcao { min-height: 44px; padding: 11px 0 }`. Deitado, abaixo de 440 px de altura, prender `.pe` com `position: sticky; bottom: 0; background: var(--fundo)`.

### N8. [P3] Criar o convite sobe a tela 28 px

**Evidência:** `v9-dobra.json` → `saltoCriar`. O título vai de y = 164 para y = 136. O campo e o nome fixo agora têm 44 px, iguais. O que some é a dica "Com seu nome, você já entra na lista.".

**Causa:** `app.js:699`.

**Correção:** manter a linha da dica com outro texto depois de criar ("Você já está na lista." ou o espaço vazio com a mesma altura).

### N9. [P3] Os trechos do pedido têm 28 px de altura de toque

**Evidência:** `t3-toque.json` → `alvos.resultado`. "Sábado" mede 53×28 px, "das 19h à 1h" 81×28 e "até R$ 80" 67×28 (antes, 43 px). Foi uma troca deliberada para não invadir a linha vizinha (`app.css:498-502`). Passa no WCAG 2.5.8 AA (24 px), mas fica longe dos 44 pt do iOS.

**Causa:** `app.css:496` (`line-height: 1.9`) e `502`.

**Correção:** subir `.pedido` para `line-height: 2.6` (39 px), com `padding: 9px 0; margin: -9px 0` nos trechos. Ou quebrar o pedido em uma linha por trecho a 390.

### N10. [P3] A seção de ajuste pula ~88 px quando a resposta chega

**Evidência:** `v6-fluxo.json` → `saltoAjuste`. Com os atalhos à vista, a resposta troca a lista: os atalhos descem de y = 535 para 623 num quadro, e depois começa a rolagem suave até a conversa. O layout-shift vale 0,039 (0,067 em `v2-desempenho.json`). Ele cai fora da janela de 500 ms do toque e conta no CLS.

**Causa:** `app.js:562-566` substitui o nó `#atalhos`, e a ancoragem de rolagem perde a referência.

**Correção:** trocar os filhos de `#atalhos` (`replaceChildren`) em vez do nó. Ou rolar até a conversa com `behavior: 'auto'` no mesmo quadro da troca, e só depois animar.

### N11. [P3] O polling redesenha o convite sem mudança nenhuma

**Evidência:** `v5-convite.json` → `ocioso`. São 51 mutações em 20 s, com 5 leituras iguais. Cada leitura reescreve `textContent`, `className` e `aria-pressed` dos rótulos, dos nomes e dos botões. Na tela nada muda, mas uma seleção de texto se perde a cada 4 s, e o cursor do VoiceOver pode pular.

**Causa:** `plano.js:97-99` (`if (r.texto === assinatura) { if (dom.montado) desenhar(); … }`).

**Correção:** `return` sem desenhar quando a assinatura é a mesma. O aviso de conexão já é limpo em `plano.js:96`.

### N12. [P3] Uma tarefa longa de ~80 ms na carga com CPU 4×

**Evidência:** trace em `v7-extras.json` → `traceCarga`. A tarefa soma Layout 30 ms, `UpdateLayoutTree` 23 ms e `EvaluateScript app.js` 16 ms. As quatro fontes já estão prontas no primeiro layout. Num aparelho real, deve dar ~20 ms.

**Correção:** a de N1 alivia esta, porque o primeiro layout passa a acontecer na fonte de reserva. Não pede trabalho próprio.

### N13. [P3] Toque duplo no seletor de tema faz o tema piscar

**Evidência:** `v4-tema.json` → `inicio-toque-duplo-tema`. O segundo toque, que chega durante a volta do conteúdo, inverte de novo. A pessoa vê 2 quadros do tema novo e um segundo mergulho, e termina no tema de partida (266 ms abaixo de 50%). Já um segundo toque durante a saída não faz nada. O comentário de `tema.js:48` promete o contrário: que o segundo toque muda o destino.

**Causa:** `tema.js:79`. `alternar()` calcula o novo tema por `atual()`, que só muda no meio da troca.

**Correção:** `const base = troca ? troca.tema : atual(); const novo = base === 'noite' ? 'dia' : 'noite';`, e ignorar um toque que chegue até 120 ms depois do fim da troca.

### N14. [P3] O convite que passou

O estado novo está certo: sem campo, sem botões, sem polling (0 pedidos em 10 s), e o caminho do 410 com a página aberta funciona e anuncia "Essa já foi." (`v11-passou.json`, `cap/v11-convite-passou.png`). Restam dois detalhes:
- o título continua perguntando "Bora no *sábado?*" sobre uma festa que já passou;
- depois do 410, o botão tocado some, e o foco cai no `body`.

**Correção:** em `plano.js:238-247`, trocar o título por um no passado e focar o `h1` (`tabindex="-1"` já existe).

## O que resistiu ao ataque

- **A trava de toque.** Vale para todos os botões, com e sem movimento reduzido, e não trava o teclado.
- **O primeiro quadro.** Entre 16 e 40 ms em todos os toques do fluxo com CPU 4×.
- **A linha do tempo.** Nenhuma colisão nem rótulo fora do traço em 26 linhas a 320 e a 390. O posicionamento pelo CSSOM sobrevive à recarga e ao ajuste.
- **A reserva de fonte.** Com as métricas ajustadas, a página pinta na reserva e troca sem mover nada, mesmo com a fonte atrasada 3 s ou bloqueada.
- **O convite.** A dobra a 390×664, a resposta velha descartada, o aviso de conexão que aparece e some na hora, a carga em Slow 4G sem salto e o estado de passou estão corretos.

## Ordem sugerida

N2 e N1 primeiro: um é a regra de CSS que a fusão matou, o outro é o maior custo de desempenho da rodada. Depois N3, N4 e N6, que são a mesma família (uma resposta ou um redesenho que chega depois de a pessoa ter saído da tela), e N5, que é uma linha de CSS. Os P3 cabem numa passada.

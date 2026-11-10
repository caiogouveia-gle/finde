# Validação de desenho, v1-festas (10/11/2026, segunda rodada)

Rodada adversarial sobre o código depois da fusão das três frentes. Chrome 157 headless por CDP, com `--mute-audio` e stub mudo de `AudioContext`, servidor próprio na porta 48803 e `FINDE_VAR` no scratchpad. Larguras de 390×844, 375×667 e 390×664 com dpr 3, e 1280×800 e 1440×900 com dpr 2. Dia e noite em todas. A noite foi forçada por `sessionStorage` e pelo relógio (fuso de Daca, cerca de 21h), para a boas-vindas da noite aparecer de verdade. O código do protótipo não foi tocado.

As capturas estão em `/private/tmp/claude-501/-Users-caiogouveia-Documents-Dev/db5031a9-8197-4384-a228-255bd2752f77/scratchpad/val-des/cap/`, abreviada abaixo como `cap/`. São 352 arquivos, com prefixos `m390dia`, `m390noite`, `m375dia`, `m375noite`, `m390x664dia`, `m390x664noite`, `d1280dia`, `d1280noite`, `d1440dia` e `d1440noite`. A numeração segue a da primeira rodada: 01 a 11 no fluxo, 21 a 27 nos estados do resultado e 29 a 39 no convite. Os scripts estão na pasta acima da `cap/`: `fluxo.mjs`, `estados.mjs`, `convite.mjs`, `faixa.mjs`, `espera.mjs`, `anima.mjs`, `medir.mjs` e `auditar.mjs`.

**Estado do código.** O `app.js`, o `comum.js`, o `index.html` e o `nucleo/conversa.js` mudaram às 12h28, durante a primeira passada. O servidor guarda o `nucleo/` na memória, então as falas da primeira passada vinham do `conversa.js` antigo. Reiniciei o servidor e refiz o fluxo e os estados a 390, de dia e de noite. As falas citadas abaixo são as do código atual (hash dos fontes `e4279e03`). O desenho das outras larguras não depende do `conversa.js`.

**Auditoria automática** (em todas as telas e larguras): nenhum texto "null", "undefined" ou "NaN", nenhuma rolagem horizontal, nenhum elemento fora da coluna e nenhum rótulo da linha do tempo colidindo. As classes sem regra de estilo são só ganchos estruturais (`mm`, `lista`, `lt-rotulo--inicio`, `opcao--um`, `convite`). O título das perguntas fica na mesma altura nas cinco telas em todas as larguras (226 px a 390×844, 156 px a 375 e a 664, 220 px a 1280 e 234 px a 1440).

## Achados da primeira rodada

| # | Achado | Situação | Prova |
|---|---|---|---|
| 1 | Régua de horários não comunica | Resolvido, com defeitos novos (N1, N8, N9) | `m390dia-07c-primeira-festa-viewport.png` |
| 2 | Patrocinada quebra a ordem | Resolvido: 18h, 19h, 19h, com a patrocinada no lugar dela | `m390dia-07-resultado-inicial.png` |
| 3 | Título das perguntas pula | Resolvido: variação de 0 px | medidas acima |
| 4 | Desktop com duas marcas, localhost e relógio ilegível | Resolvido em parte: uma marca só, localhost escondido, "12*h*38" legível. Falta o QR num endereço público | `d1280dia-07b-resultado-dobra.png`, `d1440noite-38-convite-host-publico.png` |
| 5 | Convite respondido igual ao sem resposta | Resolvido | `m390dia-30-…`, `m390x664dia-34b-respondido-dobra.png` |
| 6 | Fala do Finde repete e soa como log | Parcial: vazio em duas frases, slogan fora. Ainda repete o título (N2) e usa ponto e vírgula | `m390dia-21-…`, `m390dia-22c-…` |
| 7 | Motivo repete o curador, hierarquia invertida | Resolvido no resultado. No convite, a repetição voltou (N10) | `m390dia-31-convite-varias.png` |
| 8 | Saída do vazio fraca | Resolvido: botão vazado "Voltar até as 2h", e a oferta some depois de um "Não peguei" | `m390dia-22-conversa-longa.png` |
| 9 | Opções recuadas 16 px, lista sem começo | Resolvido: nome em x=24, fio em cima | `m390dia-02c-p1-foco-teclado.png` |
| 10 | Marcador rosé 2,01:1, igual nos dois tipos | Resolvido: bordô, círculo na única, quadrado na múltipla | `m390dia-06c-ver-festas-buscando.png` |
| 11 | Afrouxada não aparece | Resolvido por outro caminho: aviso por festa. O pedido não risca nada, e não precisa | `m390dia-21-resultado-afrouxou.png` |
| 12 | `tabular-nums` sem efeito, "20h00" invade a calha | Resolvido: dígitos em caixas de .9ch, hh 24–55,5, h 55,5–73,3, mm 73,3–104,8 nas três linhas | log `log-m390dia.json` |
| 13 | Itálico demais no convite | Resolvido: "MÉDIA 30 ANOS" em caixa alta na linha de base da hora | `m390noite-10-mandar.png` |
| 14 | Tracking apertado no Instrument Serif | Resolvido | `m390dia-06a-p5-dobra.png` |
| 15 | Sem estado de carregando no ajuste | Parcial: fala "Procurando…" e atalho com fio correndo. A lista não esmaece (N3) | `m390dia-08c-ajuste-carregando.png`, `m390dia-24-ajuste-carregando-lista.png` |
| 16 | Hover inerte | Resolvido no CSS (`app.css:390-398`). Não conferido com ponteiro real | — |
| 17 | Foco vira caixa | Resolvido: sublinhado de 1,5 px | `m390dia-02c-p1-foco-teclado.png` |
| 18 | Seletor de tema parece estado | Resolvido: "noite às 18h · ver agora", sublinhado | `m390dia-01b-boas-vindas-dobra.png` |
| 19 | Noite perde a promessa | Não resolvido de outro jeito: agora dia e noite perderam a promessa (N6) | `m390noite-01b-boas-vindas-dobra.png` |
| 20 | Coluna do desktop sobra no meio | Parcial: rodapé e relógio fecham na mesma linha. O ajuste segue abaixo da dobra, e o lado direito fica vazio | `d1280dia-07b-resultado-dobra.png` |
| 21 | Placeholder repete o atalho | Trocado, mas agora cortado (N4) | `m390dia-07-resultado-inicial.png` |
| 22 | Ritmo vertical da festa | Resolvido: 20/24 px | — |
| 23 | Linha de estado gruda nos botões | Resolvido | `m390dia-31-convite-varias.png` |
| 24 | Microcopy defensiva | Parcial: "Abre a lista", "A internet sumiu no meio", "sobra R$ 20". "Teto" voltou no aviso (N11) | `m390dia-21-…` |
| 25 | "● Nova" e "Patrocinado" como badge | Resolvido | `m390dia-08-…` |
| 26 | Grafite ausente | Resolvido: faixa no convite. Fio da noite subiu para 2,37:1 | `m390dia-31-…` |
| 27 | Progresso cheio antes da hora | Resolvido | `m390dia-06c-…` |
| 28 | Hora escrita de dois jeitos | Resolvido: "17h00" nos dois lugares | `m390dia-01b-…` |
| 29 | 375 quebra a boas-vindas | Resolvido: cabe com rodapé | `m375dia-01b-boas-vindas-dobra.png` |
| 30 | Dica do nome longe do campo | Resolvido | `m390noite-10-mandar.png` |

Contagem: 21 resolvidos, 6 parciais, 1 trocado por outro defeito (21) e 1 não resolvido (19). O 16 ficou sem prova visual.

## O que a tarefa pediu para julgar

**A linha do tempo por festa.** Quando a festa e a janela não coincidem, ela funciona. Em `m390dia-21-resultado-afrouxou.png`, "Último Disco" vai das 18h à 0h, e o colchete rosé da janela começa às 22h. Dá para ver sem ler que a festa acaba quando a janela começa. Em `m390dia-27-sexta-fim-de-tarde.png`, "Sexta Brasileira" passa da ponta direita do colchete, e é isso que o aviso diz. A 390, o eixo tem 234 px (23 px por hora), os rótulos têm 11 px a 4,94:1, e nada colide. Como desenho, está limpo: traço de 1,5 px, bloco de 5 px na pista cheia e só as duas horas da festa.

Ela não diz "começa cedo, volta cedo" de relance. Não há nenhuma âncora absoluta no eixo: nem 17h, nem meia-noite, nem 3h. A posição só se lê contra o colchete. Quando a festa coincide com a janela, como em "Sábado Groove" e "Noite Aurora" de `m390dia-07c-…`, a linha repete o pedido e não informa nada. Há ainda três defeitos: o eixo achata tudo o que começa antes das 17h (N1, que faz a linha mentir), o colchete fica abaixo dos 3:1 de dia (N8) e falta a âncora da meia-noite (N9).

**O aviso por festa.** Ele está no lugar certo, logo abaixo do nome, e na cor da tinta. Tem três problemas. O fio rosé que o precede rima com o "— " da fala da pessoa (N13). O texto junta violações com ponto e vírgula e usa "teto" (N11). E ele não aparece quando a festa começa três horas antes da janela, mas a pista enche dentro da tolerância (`m390dia-09-conversa-longa.png`, festas das 16h num pedido das 19h). Nesse caso é a linha do tempo que avisa.

**A origem da idade.** A presença dela resolve a pergunta da banca. O texto longo é que pesa demais na coluna da hora: "estimada pelo público das edições anteriores" ocupa quatro linhas de 12 px embaixo de "média 31" e faz a coluna da esquerda ficar mais alta que o miolo da festa (N7).

**Carregando.** "Buscando…" e "Criando…" na pílula, com o fio correndo, ficam bons (`m390dia-06c-…`, `m390dia-10c-criando.png`). No ajuste, o atalho tocado esmaece e a fala vira "Procurando…". A lista deveria esmaecer, e não esmaece (N3). "Abrindo a pista…" no convite é uma linha de rótulo solta numa tela vazia, sem a marca (N17).

**Os três estados do convite.** Sem resposta, os dois botões vazados com o mesmo peso. Respondido, a escolha vira pílula cheia e a outra vira link. Passou, a faixa grafite vira fios e tudo baixa um tom. Os três se distinguem de relance. Ficam dois defeitos: "Anotado: não rola" quebra em duas linhas dentro da pílula a 390 e a 375 (N5), e na festa que passou o título continua perguntando "Bora no sábado?" (N16).

**O desktop.** A faixa grafite de borda a borda dá ao convite a massa de cor que faltava. O relógio "12*h*38" está legível, e o rótulo dele fecha na mesma linha do rodapé da coluna (763 px contra 763 px a 1280). Só que o conteúdo da faixa entra 24 px para dentro da coluna (N4b). O lado direito continua vazio em localhost e, num endereço público, mostra só texto, sem o QR.

**O alinhamento das horas.** Está resolvido na coluna: as três horas medem 80,8 px e o "h" cai no mesmo x. Sobra um desvio ótico de cerca de 3 px: o "1" centrado na caixa de .9ch afasta "17h00" da margem do texto de baixo (N18).

## Achados novos

### N1. [P1] A linha do tempo achata as festas que começam antes das 17h

**Capturas:** `cap/m390dia-22c-vazio-com-oferta.png`, `cap/m390dia-09-conversa-longa.png`, `cap/m390dia-23-nao-entendeu.png`

**Onde:** `publico/app.js:22` (`EIXO = { de: 17, ate: 27 }`) e `app.js:391` (`noEixo` com `Math.max(EIXO.de, …)`); seletores `.lt-festa`, `.lt-pico` e `.lt-rotulo--inicio`.

**Problema:** a base tem seis festas que começam às 15h ou às 16h, e uma que vai até as 7h (fim 31). As das 15h e das 16h começam no mesmo ponto que a das 17h. Em `-22c`, "Samba de Domingo" (15h) tem o traço e o bloco da pista cheia colados na borda esquerda (`left: 0%` nos dois). O rótulo diz 15h, e o desenho diz 17h. É o único gráfico do produto, e ele erra justamente a informação que o produto vende.

**Correção:** eixo das 15h às 3h, e a festa que passa das 3h sai pela borda sem fecho.

```js
const EIXO = { de: 15, ate: 27 };
```

```css
.lt-festa--segue { border-right: 0; mask-image: linear-gradient(90deg, #000 85%, transparent); }
```

Em `linhaDoTempo` (`app.js:408`), quando `f.fim > EIXO.ate`, aplique `lt-festa--segue` e mantenha o rótulo do fim com a hora real ("7h") em `right: 0`. Com 12 h no eixo, a 390 sobram 19,5 px por hora, o que ainda é legível.

### N2. [P1] A fala repete o título, palavra por palavra

**Capturas:** `cap/m390dia-21-resultado-afrouxou.png`, `cap/m390dia-27-sexta-fim-de-tarde.png`, `cap/m390dia-08-resultado-dois-ajustes.png`

**Onde:** `nucleo/motor.js:341` (`Nada do jeito que você pediu. ${impedimento || 'Estas são o mais perto disso.'}`) e `publico/app.js:367` (o mesmo texto no `h1`).

**Problema:** o título em 40 px diz "Nada do jeito que você *pediu.*", e a linha logo abaixo começa com "Nada do jeito que você pediu.". Em `-21`, a fala continua com "Funk no domingo, só às 17h, com média 24.", que fala de uma festa que não está na lista. A lista mostra 18h e 20h. "Estas são o mais perto disso" tem concordância de tradução.

**Correção:**
- Em `textoDoAviso`, quando `atendem === 0`, devolver só o impedimento. A frase-padrão passa a ser "Seguem as mais perto."
- O impedimento só cita festa que está na tela. Se a do impedimento ficou de fora, a frase fala do critério: "Funk no domingo, só bem mais cedo e com gente mais nova."

### N3. [P2] A lista não esmaece enquanto carrega e pisca inteira a cada ajuste

**Capturas:** `cap/m390dia-24-ajuste-carregando-lista.png` (lista em opacidade 1 aos 50, 200 e 600 ms com `aria-busy="true"`); medição em `anima.mjs`

**Onde:** `publico/app.css:515` (`.tela-resultado[aria-busy="true"] .festas { opacity: .45 }`) contra `app.css:715-716` (`.entra .festas { animation: surgir 160ms … both }`); `app.js:115`, que deixa a raiz com `.entra` para sempre.

**Problema:** a animação com `fill-mode: both` segura `opacity: 1` e vence a regra do carregando. Como a raiz `#tela-resultado` mantém `.entra`, cada `#lista-festas` novo que `trocarResultado` insere roda `surgir` de novo, de .35 a 1. Medido: `surgir:running` logo depois de um ajuste. O comentário de `app.css:712-713` promete o contrário: "Depois de um ajuste, só as festas novas".

**Correção:**
- `app.css:716`: `animation: surgir 160ms var(--curva) backwards;`
- Em `trocarResultado` (`app.js:553`), antes do laço: `$atual.classList.remove('entra');`

### N4. [P2] O placeholder do ajuste sai cortado, e a faixa grafite do desktop sai desalinhada

**Capturas:** `cap/m390dia-07-resultado-inicial.png` ("algo perto da Paulista, até 23|"), `cap/d1280dia-11b-mandar-pronto-dobra.png`, `cap/d1440noite-38-convite-host-publico.png`

**Onde:** (a) `publico/app.js:513`; (b) `publico/app.css:698`.

**Problema:**
- (a) O placeholder mede 236 px. O campo tem 213 px a 375, 228 px a 390 e 278 px a 440. Ele corta no "23h" em todo celular.
- (b) Na faixa, a hora e o nome começam em x=468 a 1280 (528 a 1440), e o título e o formulário em x=444 (504). O `padding-inline: calc(50vw - 50% + var(--lateral))` soma a lateral duas vezes, porque o 50% já é a caixa de conteúdo da coluna.

**Correção:**
- (a) `placeholder: 'perto da Paulista, até 23h'` (cerca de 200 px).
- (b) `.festa-convite { margin-inline: calc(50% - 50vw); padding-inline: calc(50vw - 50%); }`

### N5. [P2] "Anotado: não rola" quebra em duas linhas dentro da pílula

**Captura:** `cap/m390dia-35-convite-respondido-fora.png`

**Onde:** `publico/plano.js:264`; `app.css:653` (`.par` em `1fr 1fr`) e `app.css:337` (`padding: 0 26px`).

**Problema:** a 390 e a 375, a pílula de 44 px vira um bloco de duas linhas ("Anotado: não / rola"). É o único botão do produto que quebra.

**Correção:** o texto passa a ser "Você tá fora", paralelo a "Você tá dentro", e `.par .botao { white-space: nowrap; }`.

### N6. [P2] A boas-vindas trocou a promessa pela assinatura em inglês

**Capturas:** `cap/m390dia-01b-boas-vindas-dobra.png`, `cap/m390noite-01b-boas-vindas-dobra.png`, `cap/d1280dia-01b-boas-vindas-dobra.png`

**Onde:** `publico/app.js:180-183` (`lockup('', 'p', false)` e `h1` "still going out. *just differently.*"); `comum.js:50-53`.

**Problema:**
- O `h1` da primeira tela não diz o que o produto faz. O manual põe a assinatura no lockup e a linha funcional ("a pista abre antes") na loja e no splash.
- O itálico pega duas palavras, e o manual pede uma por frase.
- Sem a assinatura embaixo, o wordmark fica solto, com cerca de 190 px de nude vazio até o rótulo a 390×844.
- `docs/decisoes.md` não registra essa troca.

**Correção:** se não houve decisão do grupo, voltar ao lockup oficial com a assinatura (`lockup()`) e ao `h1` "A pista abre *antes.*". À noite, "A pista já *abriu.*", como no achado 19 da primeira rodada. Se a assinatura como título foi decisão, registrá-la em `decisoes.md` e passar o itálico só para "*differently.*".

### N7. [P2] A origem da idade ocupa quatro linhas na coluna da hora

**Capturas:** `cap/m390dia-07c-primeira-festa-viewport.png`, `cap/m390dia-22c-vazio-com-oferta.png`

**Onde:** `publico/comum.js:129-133` (usa `f.origemIdade`, a longa); `app.js:450`; `app.css:527`.

**Problema:** em 92 px, "estimada pelo público das edições anteriores" vira um bloco de quatro linhas cinzentas, mais alto que "média 31". A coluna da esquerda passa a competir com o miolo, e a hora perde o isolamento de programação.

**Correção:** no resultado, usar a curta, que já vem na API (`f.origemIdadeCurta`: "pela produtora", "edições passadas", "124 avaliações"). `idadeOrigem(f, { curta: true })` lê esse campo. A longa fica no convite, onde há largura.

### N8. [P2] O colchete da janela fica abaixo de 3:1 de dia

**Capturas:** `cap/m390dia-07c-primeira-festa-viewport.png`, `cap/m390dia-21-resultado-afrouxou.png`

**Onde:** `publico/app.css:573` (`.lt-janela`, borda `var(--fio)`) e `app.css:581` (`.amostra-janela`).

**Problema:** rosé sobre nude dá 2,01:1. A janela é a referência contra a qual a linha inteira se lê, e é o traço mais fraco dela. Na noite, o rosé sobre bordô dá 5,43:1 e está bem.

**Correção:** de dia, `.lt-janela, .legenda .amostra-janela { border-color: var(--rotulo); }` (4,94:1). Na noite, mantém o rosé: `:root[data-tema="noite"] .lt-janela { border-color: var(--fio); }`.

### N9. [P2] O eixo não tem âncora, e "volta cedo" só se lê contra o pedido

**Capturas:** `cap/m390dia-07c-primeira-festa-viewport.png` (duas linhas idênticas à janela), `cap/d1440noite-07b-resultado-dobra.png`

**Onde:** `publico/app.css:571-577`; `app.js:408-419`.

**Problema:** sem marca de meia-noite, uma festa das 19h à 1h e outra das 17h às 23h só se distinguem pelos números. A promessa do produto é voltar cedo, e o gráfico não tem a linha que define "cedo".

**Correção:** um tique de meia-noite em todas as linhas, no mesmo x:

```css
.linha-tempo::after { content: ''; position: absolute; left: var(--meia-noite); top: 4px; height: 9px; border-left: .5px solid var(--rotulo); }
```

Com o eixo de N1, `--meia-noite: 75%`. Na legenda, acrescente "| meia-noite". O rótulo "0h" (`app.js:393-397`) passa a "meia-noite" só no fim de festa, como no `catalogo.js`.

### N10. [P2] No convite, o horário aparece duas vezes na mesma frase

**Capturas:** `cap/m390dia-31-convite-varias.png` ("…a pista enche às 21h e acaba à 1h. House no terraço, pista cheia às 21h…"), `cap/d1440noite-38-…`

**Onde:** `publico/app.js:707` e `publico/plano.js:209` (`${o.horario} ${f.frase}`); `dados/festas.json`, em que 6 das 37 frases trazem hora.

**Problema:** é a peça que circula no WhatsApp, e ela repete a informação dentro de 20 palavras.

**Correção:** regra de base. A frase do curador não traz horário. Em `nucleo/base.js`, rejeitar `/\b\d{1,2}h/` em `frase`, com aviso no log, e reescrever as seis frases. Enquanto isso, só juntar `o.horario` quando `!/\b\d{1,2}h/.test(f.frase)`.

### N11. [P2] O aviso por festa volta ao tom de relatório

**Captura:** `cap/m390dia-21-resultado-afrouxou.png` ("Fora do seu som; R$ 20 acima do teto; enche às 20h, antes da sua hora.")

**Onde:** `nucleo/motor.js:298` (`fora.join('; ')`) e `motor.js:258` (`acima do teto`).

**Correção:**
- Frases separadas: `fora.map((x) => x[0].toUpperCase() + x.slice(1)).join('. ') + '.'`
- "R$ 20 acima do teto" passa a "R$ 20 além do seu limite".

### N12. [P2] "Não peguei" aparece duas vezes na mesma tela

**Captura:** `cap/m390dia-23-nao-entendeu.png`

**Onde:** `publico/app.js:628` (`local.textContent = d.resposta`), somado à fala do Finde no topo.

**Problema:** a mesma frase de duas linhas aparece em 16 px no topo e em 15 px junto do campo.

**Correção:** quando `!d.entendeu`, guardar `estado.fala = { voce: exibido || texto, finde: null }`. A resposta fica só junto do campo, onde a pessoa vai reescrever.

### N13. [P2] O título conta uma festa e a lista mostra duas

**Captura:** `cap/m390dia-22c-vazio-com-oferta.png` ("Uma pro seu *domingo.*" sobre duas festas)

**Onde:** `publico/app.js:366-368` (`n = r.atendem`).

**Correção:** o título conta o que está na tela (`r.opcoes.length`). Quantas cabem fica para a fala e para o aviso de cada festa, que já dizem isso.

### N14. [P2] O preço quebra no meio, e os trechos curtos do pedido abrem vãos

**Capturas:** `cap/m390dia-27-sexta-fim-de-tarde.png` ("Vila Madalena · R$ / 45" e " Sexta ,"), `cap/m390dia-21-resultado-afrouxou.png` ("funk  .")

**Onde:** (a) `nucleo/catalogo.js:155` (`reais`); (b) `publico/app.css:502` (`.pedido .link { min-width: 44px; text-align: center }`).

**Problema:**
- (a) "R$" fica no fim de uma linha e "45" no começo da seguinte.
- (b) "funk" mede 30 px numa caixa de 44, e "Sexta" também fica abaixo dos 44. Sobram 7 px de cada lado, sem sublinhado, e a vírgula ou o ponto descola da palavra. Medido em `medir.mjs`.

**Correção:**
- (a) `` `R$ ${valor}` `` em `reais` e em `rotuloTeto`.
- (b) Tirar `min-width` e `text-align`, e ampliar o toque sem mexer no texto: `.pedido .link { position: relative; } .pedido .link::after { content: ''; position: absolute; top: 0; bottom: 0; left: min(0px, calc(50% - 22px)); right: min(0px, calc(50% - 22px)); }`

### N15. [P2] "Hoje à noite" aparece numa terça

**Capturas:** `cap/m390noite-01b-boas-vindas-dobra.png`, `cap/d1440noite-01b-boas-vindas-dobra.png`

**Onde:** `publico/app.js:171`, `app.js:182` e `app.js:187`.

**Problema:** às 21h de uma terça, a tela diz "HOJE À NOITE" e "Ainda dá tempo". Logo abaixo, a próxima pista é "SEX · 17H00".

**Correção:** `const noite = … && [5, 6, 0].includes(new Date().getDay());`. Fora do fim de semana, a noite usa o texto do dia.

### N16. [P3] A festa que passou ainda pergunta

**Captura:** `cap/m390dia-37-convite-passou.png`

**Onde:** `publico/plano.js:202`.

**Correção:** com `plano.passou`, o título passa a `titulo('h1', …, 'Foi no ', 'sábado.')`.

### N17. [P3] "Abrindo a pista…" sem marca, solto no meio

**Captura:** `cap/m390dia-29-convite-abrindo.png`

**Onde:** `publico/plano.html:34-36`; `app.css:380-388`.

**Correção:** pôr no HTML estático o mesmo topo das outras telas (`<header class="topo"><p class="marca">finde<span class="ponto">.</span></p></header>`) e o rótulo na altura do título (`p.carregando { margin: var(--e8) 0 0; }`), em vez de `margin: auto 0`.

### N18. [P3] Acabamento

- **O separador do porquê fica pendurado.** "sobra R$ 30 ·" no fim da linha, em `cap/m390dia-07c-…`. Em `app.js:462`, levar o " ·" para dentro do `span.item` anterior (`m + (i < n - 1 ? ' ·' : '')`) e separar os itens com espaço comum.
- **O "1" da hora entra cerca de 3 px.** Em `cap/m390noite-10-mandar.png`, "17h00" começa à direita de "informada pela produtora". Em `app.css:160`: `.hora .hh .d:first-child { text-align: left; }`.
- **Grafite sobre bordô dá 1,04:1 de luminância.** Na noite, a faixa se distingue só pelo tom (`cap/m390noite-10-mandar.png`). Basta um fio rosé em cima e embaixo, só na noite: `:root[data-tema="noite"] .festa-convite { border-block: .5px solid var(--fio); }`.
- **A legenda deixa um "·" solto.** Em "sua janela · ▪ pista cheia" (`app.js:506`), trocar o " · " por um espaço de 12 px (`column-gap: 12px` em `.legenda`).
- **A pergunta 1 tem um vão de cerca de 300 px entre a lista e "Continuar".** Isso a 390×844 (`cap/m390dia-02c-…`). É o preço do título fixo. Aceitável. Se incomodar, a lista pode descer com `margin-top: auto` só quando tiver três opções ou menos.

## O que ainda denuncia protótipo de aula

1. A linha do tempo desenha festas das 15h e das 16h como se fossem das 17h (N1). Quem olhar dois segundos para "Samba de Domingo" vê o 15h encostado na borda.
2. O título e a fala dizem a mesma frase, um embaixo do outro (N2).
3. O placeholder cortado em todo celular (N4a) e "R$ / 45" quebrado (N14).
4. "Anotado: não / rola" em duas linhas na pílula (N5).
5. A primeira tela em inglês, sem dizer o que o app faz (N6).

## O que já parece produto

O convite: a faixa grafite, a hora de 56 px com "MÉDIA 31 ANOS" na linha de base, os nomes em Instrument Serif e os três estados legíveis de relance. A lista como programação, com a coluna de horas alinhada e a patrocinada no lugar dela. As perguntas com o título fixo, o marcador pendurado e o foco em sublinhado. O vazio com "Voltar até as 2h" em pílula. O relógio do desktop com o *h* em itálico. Corrigidos N1 a N5, a banca vê um produto. O resto é acabamento.

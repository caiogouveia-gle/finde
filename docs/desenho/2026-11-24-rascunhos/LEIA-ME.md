# Rascunhos da Direção E · Guia (U39, 24/11/2026)

Desenho e movimento das telas novas do app, antes do código: a primeira pergunta, o resultado como guia da semana, "ver todas", o mapa, o detalhe com o cartaz e as fontes, a peça inteira e o convite com a avaliação. A `app-telas` (U29–U32) e a U33 da `app-mapa` portam daqui. A revisão em seis lentes fechou sem P1 aberto (`revisao.md`).

Tudo é fictício: as festas, as casas, os @ e os cartazes são os da base de exemplo do protótipo (`prototipo/v1-festas/publico/cartazes/`, referenciados, não copiados), mais um banner em paisagem desenhado para o rascunho (`banner-ficticio.svg`). O mapa é uma ilustração; no app as telhas vêm do provedor da U33.

## Como abrir

Precisa de um servidor estático na raiz do repo (as fontes não carregam por `file://`):

```sh
python3.14 -m http.server 8790 -d ~/Documents/Dev/finde
```

e abrir `http://localhost:8790/docs/desenho/2026-11-24-rascunhos/guia.html`. A página começa na primeira pergunta; "Continuar" leva ao guia, a capa ao detalhe, "Mandar pro grupo" ao convite. Parâmetros para ir direto a um estado: `tela` (`pergunta`, `resultado`, `vazio`, `detalhe`, `convite`), `tema=noite`, `estado` (`todas`, `mapa`), `media=com`, `abre` (`chegar`, `mini`, `fontes`, `peca`, `enviado`, separados por vírgula), `parado=1` (sem animação de entrada).

## Arquivos

- `guia.html`, `rascunhos.css`, `guia.js`: o rascunho. O CSS usa os nomes de token e de classe do app (`.link`, `.botao`, `.chip`, `.hora`, `.porque`, `--mov-*`); o que é novo está marcado NOVO. Sem estilo em linha no HTML, como pede a CSP do app.
- `mudo.js`: stub mudo de `AudioContext`, carregado antes de tudo.
- `movimento.md`: cada transição com gatilho, propriedades, duração, curva, atraso e versão reduzida; os nomes de `view-transition-name`; as regras de desempenho; o que o `movimento-app.test.js` deve conferir.
- `revisao.md`: as seis lentes, os achados, as correções e a segunda passada.
- `capturas/`: 390 px (dia e noite), 320, 390 × 664 (primeira tela no Safari), 1280; e as cinco folhas de movimento (`mov-*.webp`).

## O que ficou decidido

**O guia (resultado, R24–R27, R29, R32)**

- Cabeçalho de revista: o wordmark do manual (`finde.`, nunca "✶ FINDE ✶" em caixa alta, como na prancha 17), "Ajustar" à direita, a edição entre dois fios ("Guia da semana · 26 a 29 nov · São Paulo"; abaixo de 360 px sai a cidade) e a base viva em duas linhas fixas ("Atualizado há 3 h" / "41 festas lidas de 50 perfis e 3 sites de ingresso"), com o quadrado rosé.
- Título como hoje ("Três festas pra sua *sexta.*"), o pedido com links e a linha única sem média ("Nenhuma das três divulgou a média de idade ainda.") quando nenhuma das reais tem média. Com a linha no cabeçalho, nenhum cartão repete que falta a média.
- Abas dos dias logo acima da capa: Hoje (só quando hoje não é de quinta a domingo; num desses dias, a aba do dia vira "Hoje"), Qui, Sex, Sáb, Dom, em Instrument Serif 20 px, com a contagem real em DM Sans 11 px. Sublinhado único que desliza. Dia com 0 reais fica com a contagem 0 e abre a tela de exemplos.
- A capa é a festa de maior "% a sua cara": o cartaz (miniatura de 480 px) desfocado em 22 px, de borda a borda no celular, sob um véu chapado bordô-noite a 72% (sem degradê); dentro, de cima para baixo: no máximo duas etiquetas de vidro fumê (o espaço, "92% a sua cara"), a hora em 64 px com o dia, o nome em 40 px, a régua da noite, casa · lugar · preço, e o porquê. Sem cartaz, a capa é bordô chapada (grafite à noite). Contraste no pior caso (cartaz branco): 6,4:1 no texto, 5,2:1 no apoio.
- As chamadas 2 e 3 são tipográficas, como a programação de hoje (hora, nome, casa, preço, o porquê e a % só quando ela varia entre as três), sem miniatura e sem repetir o dia da aba.
- Embaixo: "Ver todas as N de sexta" e "Ver no mapa" (links C, lado a lado quando cabem), e "No sábado tem mais 5" no pé.
- Ver todas: filtros por zona (Som, Bairro, Preço) com o `.chip` atual, "3 sem som informado" na linha de baixo da zona, "Com ingresso online" no preço e "Com média informada" só quando alguma tiver; as linhas com hora, nome, casa e preço e **a miniatura aprovada** (40 × 50 à direita; retrato `cover`, paisagem `contain` sobre `--fio-off`; `alt` "Flyer de <festa>, divulgação de <crédito>"); "Local a confirmar" num bloco depois.
- Dia sem festa real: "Nada pra sua *terça,* ainda.", o link para o próximo dia com reais e os exemplos num bloco "Exemplos · festas fictícias", cada linha começando por "Exemplo", sem %.

**O mapa (R32, KTD16)**

- No celular, "Ver no mapa" troca a capa e as chamadas pelo painel do mapa (58% da altura, entre 340 e 520 px, de borda a borda), com a linha "6 de 8 com endereço · Ver em lista" em cima e, embaixo, "2 festas sem endereço divulgado ficam só na lista." e a lista de todas as do dia. Tocar no pino marca a linha; o segundo toque abre o detalhe.
- No desktop o mapa abre no lado direito da coluna e a lista fica; o link vira "Fechar o mapa".
- Pino quadrado, sem raio nem sombra: bordô com texto nude-claro de dia, nude-claro com texto bordô à noite; a hora em DM Sans 12 px 500; o da melhor maior, em Instrument Serif 18 px; casa com mais de uma festa mostra "18h +1". Marcado: cores invertidas e contorno. Bairros pedidos como círculo fino rosé, sem rótulo (a telha já escreve o nome). Zoom em dois quadrados de 44 px com fio, sem raio. Atribuição sempre visível, em faixa chapada na cor do fundo.
- Tema escuro: telhas escuras (o rascunho imita o Dark Matter); a decisão do provedor é da U33.

**O detalhe (R26–R33)**

- Capa escura com o mesmo cartaz desfocado: a data, a hora em 72 px, a régua com "18h começa · 20h enche · 23h acaba", e o cartaz nítido de 96 × 120 à esquerda do nome (40 px); embaixo, o crédito "Flyer · divulgação @perfil". Tocar no cartaz abre a peça inteira sobre fundo noite chapado, com o crédito e "ver no Instagram".
- Depois, na ordem: % a sua cara com uma linha por critério (o sem dado conta pela metade e diz isso); "Idade do público" com a frase da avaliação, só quando houver ("4 de 5 que foram, de 29 a 34 anos, acharam o público da idade deles.", com a origem); Onde (casa, endereço, bairro, "a 0,6 km de Pinheiros, em linha reta", "Como chegar" e "Mostrar mapa" como links C; "Como chegar" abre Google Maps, Apple Maps e Uber numa linha com fio à esquerda); Ingresso (valor, lote e taxa, onde e quando foi conferido, "Comprar na Ingresse", e "Pôr na agenda · Compartilhar" na linha de baixo); "Encontrada em 3 fontes" (cada fonte com o que se leu e "conferido há X", link para a página ou o post, e a frase da junção com as duas miniaturas lado a lado quando a imagem pesou); "De onde vem" com uma linha por campo e a divergência numa frase; os vazios numa linha só no pé ("Não divulgado: …").
- No desktop, o lado esquerdo troca o relógio pelo flyer inteiro, nítido, com o crédito.
- Barra fixa como hoje: preço e "Mandar pro grupo" (D).

**O convite com avaliação (R34)**

- A festa que passou vira registro (o painel perde o fundo e ganha fios), com "Você disse tô dentro, com Bia e Leo."
- "Como foi" / "O público tinha a *sua* idade?", as três opções no desenho do pré-quiz, "Você tem [31] anos" e a dica "Sem a idade, a resposta não conta.", a finalidade ("Opcional. Serve pra dizer, a quem procurar esta festa, se o público é da fase dela. Guardamos sem o seu nome, até 31/12/2026.") e "Mandar resposta" (D). Depois: "Anotado. *Valeu.*" e "Quando cinco pessoas responderem, a festa ganha a idade de quem foi."
- "Pro grupo": a prévia da mensagem e "Mandar "como foi?" pro grupo" (C).

**A primeira pergunta (R23, R24)**

- Como hoje, com a base viva abaixo do título, "Esta semana / A próxima" acima das opções, e cada dia com o número de festas reais em serifa à direita ("Hoje terça · 2", "Quinta, 26 nov · 8"…). Dias que passaram saem; "Hoje" com 0 reais vai para o fim.

**Movimento**

Em `movimento.md`. O resumo: a capa da lista vira a do detalhe (View Transitions, com o nome no recorte `.capa-foto`, nunca no `<img>`), hora e nome viajam como hoje, o cartaz cresce da miniatura ou do cartaz para a peça inteira; as chamadas entram em escada; a régua se desenha linear em 900 ms; o fio das abas desliza; o mapa abre por cortina a partir do link; só `transform` e `opacity`; o desfoque nunca anima; movimento reduzido vira uma troca de opacidade de 160 ms, com a regra própria para os pseudo-elementos da View Transition.

## Pedidos às outras lanes

- **`app-telas`:** portar os tokens novos (`--nude-claro`, `--noite`, `--veu`, `--vidro`, `--vidro-fio`, `--mov-capa`, `--mov-regua`) para `app.css`; as abas como botões com nome acessível completo; o `festa-capa` no recorte; a regra de movimento reduzido para `::view-transition-*`; a capa sem cartaz em bordô chapado. A miniatura em "ver todas" está aprovada.
- **`app-mapa`:** pino e cores acima; animar `.pino-in`, nunca o ícone; `invalidateSize()` no fim da cortina; pinos depois da primeira telha ou de 400 ms; zoom de 44 px; o mini-mapa do detalhe estático, atrás do toque.
- **`fundacao` / costura:** nenhum arquivo de outra lane foi tocado. O rascunho referencia `prototipo/v1-festas/publico/cartazes/` e `publico/fontes/` por caminho relativo; se esses arquivos mudarem de lugar, o rascunho perde as imagens e as fontes.

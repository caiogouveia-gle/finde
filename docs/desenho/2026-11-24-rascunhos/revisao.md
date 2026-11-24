# Revisão do rascunho em várias lentes (U39, 24/11/2026)

Seis lentes: proporção, acabamento, marca e manual, movimento e desempenho, cara de catálogo ou de IA, e alternativas (que questiona o layout básico). A sessão não tinha como abrir revisores em paralelo; cada lente foi feita em separado, uma depois da outra, sobre capturas novas (Chrome sem cabeça, mudo, 390, 320, 664 de altura e 1280 px, dia e noite) e sobre folhas de movimento filmadas a 5% da velocidade. Depois das correções, as capturas foram refeitas e as seis lentes passaram de novo.

Gravidade: P1 impede aprovar; P2 corrigir antes do código ou anotar para a lane que porta; P3 gosto ou ajuste fino.

## Primeira passada

### Proporção

- **P1, corrigido.** A capa começava aos 470 px e o conteúdo dela ficava no pé: na primeira tela do celular (390 × 664, o visor do Safari) aparecia um bloco escuro com as etiquetas e nada da festa. A capa passou a ter altura pelo conteúdo, com a hora logo abaixo das etiquetas, e a linha "As três melhores · Ver no mapa" saiu de cima dela ("Ver no mapa" foi para baixo das chamadas, ao lado de "Ver todas"). Agora a primeira tela mostra o título, as abas, a hora, o nome e a régua (`capturas/guia-390-primeira-tela-664.webp`).
- **P2, corrigido.** As cinco abas e "Ver no mapa" na mesma linha não cabiam em 390: o domingo sumia.
- **P2, corrigido.** A 320, a edição quebrava em seis linhas; a cidade sai abaixo de 360 px e as abas apertam.
- **P2, corrigido.** A base viva quebrava com o "·" pendurado no fim da linha; virou duas linhas fixas.
- **P3, aberto.** Os filtros de "ver todas" ocupam cerca de 200 px a 390. Aceito: só aparecem depois do toque.

### Acabamento

- **P2, corrigido.** O campo de idade do convite misturava "anos." com a dica numa coluna estreita; agora "Você tem [31] anos" numa linha e a dica embaixo.
- **P2, corrigido.** "R$ 60" quebrava entre o símbolo e o número; espaço inseparável em todo preço.
- **P2, corrigido.** A chamada repetia "SEX" sob a hora, dentro da aba de sexta.
- **P2, corrigido.** A contagem do pino ("+1") estava em 10 px com 80% de opacidade; foi para 11 px cheia. Os botões de zoom foram de 36 para 44 px.
- **P2, corrigido.** A peça inteira deixava a página aparecer por trás (fundo a 96%); fundo noite chapado.
- **P2, corrigido.** No mapa, o círculo do bairro repetia o nome que a telha já escreve.
- **P2, para a `app-telas`.** As abas no rascunho são `role="tab"` sem painel; no app, botões com `aria-pressed` ou abas completas, e um nome acessível que diga "Sexta, 8 festas", não "Sex 8".

### Marca e manual

- **Decidido.** O cabeçalho da prancha 17 escreve "✶ FINDE ✶" em Instrument Serif, caixa alta. O manual diz que a marca é sempre `finde.` em Fraunces, minúscula. O guia usa o wordmark e põe a edição ("Guia da semana · 26 a 29 nov · São Paulo") entre dois fios.
- **Decidido.** A prancha 17 escurece a foto com um degradê. A decisão de 10/11 proíbe degradê. O véu é chapado: bordô-noite a 72%.
- **Decidido.** O vidro da prancha usa `backdrop-filter`. Aqui é um vidro fumê sem desfoque próprio (o fundo já é desfocado): noite a 28% com fio nude a 42%, canto reto, só sobre a foto.
- Rosé nunca em texto sobre nude: conferido. Um itálico por frase: conferido. Botão D para a ação principal, C para as outras, nenhum controle novo com raio (o círculo do bairro no mapa e o marcador redondo do pré-quiz não são controles). Média sempre com a origem; "% a sua cara" só no guia e no detalhe; a fictícia marcada em tudo.

### Movimento e desempenho

- **P1, corrigido.** Lista → detalhe: com o `view-transition-name` no `<img>` desfocado, o instantâneo saía sem o véu e sem o recorte, e uma mancha branca do tamanho da imagem (96 px maior que a capa) cobria a tela por 300 ms (folha da primeira filmagem). O nome foi para o recorte `.capa-foto`, que leva foto e véu juntos (`capturas/mov-lista-detalhe.webp`).
- **P1, corrigido.** O cartaz do detalhe, sem par na capa tipográfica, aparecia no primeiro quadro sobre a lista. Ganhou `:only-child` com atraso de 160 ms.
- **P2, corrigido.** A capa nascia como um retângulo escuro vazio por 300 ms antes da foto (abertura do guia e troca de aba). Agora o bloco inteiro aparece por opacidade enquanto a foto assenta.
- **P2, corrigido.** A primeira versão animava `clip-path` nos fios da edição e escalava o `<img>` com `filter`. Os fios são pseudo-elementos com `scaleX`; a escala vai no recorte, e a camada desfocada é rasterizada uma vez.
- **P2, corrigido.** O seletor universal do movimento reduzido não alcança os pseudo-elementos da View Transition; a regra própria está no CSS e em `movimento.md`.
- **P2, para a `app-mapa`.** Os pinos esperam a primeira telha (ou 400 ms) e o `invalidateSize()` vem no fim da cortina; nunca animar o ícone do Leaflet.

### Cara de catálogo ou de IA

- **P2, aceito com cuidado.** Etiqueta de vidro sobre foto é o tique mais comum de app gerado. Ficaram duas, retas, sem desfoque próprio, em 12 px; nunca mais de três.
- **P3, aceito.** As miniaturas em "ver todas" puxam para vitrine de loja. Ficam: são 40 × 50 à direita, a linha continua tipográfica (hora em serifa, nome, casa e preço), e o flyer é o que a pessoa reconhece do Instagram. Na lista das três, nenhuma miniatura.
- **P3, aceito.** O quadradinho rosé da base viva lembra o "ao vivo" de painel. É quadrado e da cor do ponto da marca; fica.
- Sem estrela, sem ícone, sem emoji, sem sombra, sem pílula.

### Alternativas

- **A capa da melhor contra três chamadas iguais.** Três iguais seriam mais neutras e mais baixas, mas perdem a capa de revista da Direção E e o lugar para a foto. Fica a capa, com regra para quando a melhor não tem cartaz: capa bordô chapada, sem foto (grafite à noite).
- **As abas repetem a pergunta "Sair quando?".** Repetem, de propósito: a pergunta escolhe o dia uma vez, e as abas trocam sem voltar ao questionário, com a contagem real de cada dia. "No sábado tem mais 5" no pé da lista continua, como o "continua na p. 2" de revista; aponta para a mesma troca.
- **Mapa em tela cheia contra painel na página.** Tela cheia esconde a lista e pede um "fechar"; o painel mantém abas e lista à vista e sincroniza pino e linha. No desktop o mapa abre no lado direito e a lista fica.
- **Detalhe claro, como hoje, contra capa escura.** A capa escura no topo pesa, mas é o que deixa a capa da lista virar a do detalhe sem corte. No desktop, o lado esquerdo mostra o flyer inteiro, nítido, no lugar do relógio.
- **Sem a edição entre fios.** Economizaria 38 px. Fica: é o que diz "guia da semana" antes de qualquer festa.

## Segunda passada

Capturas refeitas depois das correções (`capturas/`), mesmas larguras e temas, e as cinco folhas de movimento filmadas de novo. Nenhum erro de console; nenhuma rolagem horizontal em 320, 390 e 1280.

Contraste no pior caso da capa (cartaz todo branco sob o véu, fundo resultante rgb(99, 79, 84)): nude-claro 6,4:1, texto de apoio 5,2:1, texto da etiqueta 8,8:1.

Nada de P1 ficou aberto. Ficam abertos um P3 de proporção (altura dos filtros) e os dois P2 marcados "para a `app-telas`" e "para a `app-mapa`", que são instruções de porte e estão em `LEIA-ME.md` e `movimento.md`.

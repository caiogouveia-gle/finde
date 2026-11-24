# Precisão da leitura: o que deu para medir em 24/11/2026

O plano de 24/11 (U38) pede uma amostra da precisão da leitura de flyer, começando pelas 12 páginas conferidas em 24/11 e indo até 50 posts. Esta nota diz o que foi medido no banco reprocessado da U35 (`motor/var/finde-r3.sqlite3`, origem: o retrato de 24/11) e o que só dá para medir depois da recuperação paga do Instagram (O2). Os números são do banco, não de estimativa.

## O que ainda não dá para medir

A leitura de flyer propriamente dita (o que o modelo tira da imagem do post) não tem amostra conferível hoje. O código que coletou os 18 posts de 24/11 era o anterior à U13: guardava o que a leitura devolveu, mas não a legenda, o local marcado nem a imagem. Sem a peça e sem o texto, não há contra o que conferir. A O2 relê esses posts com o código novo (legenda até 6.000 caracteres, `publicadoEm`, local, e a peça quando a leitura diz `flyer`), e é sobre ela que a amostra de 50 posts se faz.

## O que foi medido

**Se é festa, nos posts do Instagram.** O código antigo gravava `ehFesta: true` fixo para todo post. Dos 27 eventos lidos de 18 posts, 6 não eram festa e foram ocultados pela curadoria (AE4): uma leitura com música na Casa de Francisca, o show com leitura de Mônica Salmaso e Julián Fuks (duas datas), uma sessão de escuta e uma conversa sobre pesquisa sonora num bar de audição, e uma sessão de jazz para ouvir sentado. Precisão do "é festa" fixo: 21 de 27, 78%. A `extrair/3` (U12) passa a perguntar ao modelo, com os mesmos critérios do classificador (leitura e sessão de escuta dão `false`).

**Se é festa, no classificador (Claude Haiku, as leituras gravadas até 24/11).** 47 decisões gravadas, 16 delas `false`. Conferidas uma a uma pelo nome e pela casa: 14 corretas (networking, bazar, terapia com diapasões, confraternização de escritório, pré-venda de congresso, choro e jazz ao vivo, shows de bar), 1 errada (Like Old's, festa de música dos anos 90 e 2000, lida numa página da Ingresse quase vazia; corrigida pela curadoria) e 1 discutível (aniversário de um motoclube com programação de festa). Das `true`, nenhuma foi ocultada na revisão da U35, que olhou a lista inteira pelo nome e pela casa, sem abrir cada página; não vale como conferência. Precisão das `false`: 14 de 16. Os 6 eventos do Instagram ocultados não tinham passado pelo classificador.

**O que o post diz, campo a campo.** Dos 27 eventos do Instagram: casa em 21 (78%), início em 11 (41%), lineup em 19 (70%), estilo em 10 (37%) e link de compra em 1. A cidade nunca veio do post: as 8 festas do export que o app corta por "cidade não confirmada" são posts sem casa conhecida ou carrinhos da Ingresse sem casa. O local marcado (U13) e a cidade lida pelo modelo (U12) são o que deve fechar essa lacuna depois de O2.

**As 12 páginas conferidas em 24/11 (U15).** Lidas pelo próprio `ler.py`, de graça, no modo comum: Shotgun traz imagem e coordenada no JSON-LD; Sympla traz CEP, coordenada e banner no `__NEXT_DATA__`, mas não o preço (só no texto da página no navegador); Ingresse traz CEP, cidade e imagem no JSON-LD de `www.ingresse.com/<slug>/`, sem coordenada nem preço, e as páginas `cart.ingresse.com` não têm JSON-LD. Essa leitura é estrutural e não depende do modelo: o que a página traz, o motor pega. O detalhe está no retrato da lane `motor-fontes`.

**Imagens.** As 8 peças das indicações de 16 a 19/11 passaram pelo caminho de produção (download com o endereço fixado, worker com Pillow, WebP sem EXIF): 8 de 8 guardadas, 7 peças distintas (sábado e domingo da Primavera têm o mesmo pôster). Nenhuma veio do Instagram, pelo motivo acima.

## Como fazer a amostra de 50 posts depois de O2

1. Sortear 50 itens do Instagram relidos (`itens_brutos` com `legenda` no bruto), no máximo 3 por perfil.
2. Para cada um, abrir o post e anotar à mão: é festa (sim ou não), data, início, casa, cidade, lineup e se a peça é flyer, foto ou outra.
3. Comparar com o bruto e com o registro: acerto por campo, e o "é festa" em verdadeiro e falso positivo.
4. Registrar aqui, com a data, o número de cada campo e os erros que se repetem; um erro recorrente vira caso no `classificar.test.js` ou no `instagram.test.js`.

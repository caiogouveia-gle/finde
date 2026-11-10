# Faixa de idade como preferência e escolha múltipla de lugares

Pesquisa rápida de 10/11/2026 para o Finde (28 a 35 anos, São Paulo). Limite importante: as centrais de ajuda do Tinder, do Hinge e do Bumble devolveram 403 ao abrir; o que consta delas vem de trechos de busca, não da página aberta. RA e Shotgun/DICE/Fever também não abriram ou não detalharam. Tudo isso está marcado "não verificado". Rótulos exatos dos apps podem diferir.

## Decisão 1: faixa de idade como preferência arrastável

| App | Controle | Limites e padrão | Exclui ou ordena | Sinal do que está fora | Fonte |
|---|---|---|---|---|---|
| Tinder | Slider de faixa de idade em Configurações > Descoberta; interruptor sob cada slider para mostrar gente "um pouco fora" da faixa | 18 a 55+ (fonte de terceiros, não verificado no app); padrão não verificado | Faixa vale primeiro; fora dela aparece sobretudo quando as recomendações dentro acabam (verificado em trecho da central) | Não verificado | [Tinder, central](https://www.help.tinder.com/hc/en-us/articles/115003340963-Discovery-Settings) (403 ao abrir; só trecho de busca) |
| Hinge | Preferências de namoro; cada preferência tem o interruptor "dealbreaker" | Limites e padrão não verificados | Dealbreaker ligado filtra (exclui); desligado prioriza quem se encaixa, mas pode mostrar outros | Não verificado. Relato de usuário (não verificado): o dealbreaker de idade só pegaria o máximo | [Hinge, central](https://help.hinge.co/hc/en-us/articles/360011063294-How-do-I-change-my-Preferences) (403; trecho de busca) |
| Bumble | Filtros na aba "People"; interruptor sob idade, distância e idioma ("mostrar outras pessoas se acabarem"); traços podem virar deal-breaker | Limites e padrão não verificados | Filtro é a regra; o interruptor relaxa um pouco quando a fila acaba; deal-breaker não relaxa | Não verificado | [Bumble, central](https://support.bumble.com/hc/en-us/articles/28423691289629) (403; trecho de busca) |
| Apps de eventos e vida noturna | Nenhum exemplo encontrado de faixa de "idade do público" em Shotgun, DICE, Sympla, Fever ou RA | n/a | n/a | n/a | não verificado |

Acessibilidade do seletor de dois pontos (verificado):
- Padrão WAI-ARIA de slider com vários thumbs: cada thumb tem `role="slider"`, `aria-valuenow`, `aria-valuemin`/`aria-valuemax`, e nome por `aria-labelledby` ou `aria-label`. `aria-valuetext` serve quando o número sozinho não diz tudo ([APG, slider multithumb](https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/), acessado em 10/11/2026).
- Teclado: cada thumb entra na ordem de Tab e responde às mesmas teclas do slider simples. A ordem de Tab não muda quando um thumb ultrapassa o outro. Quando o limite de um thumb depende do outro, atualize o min ou o max do dependente a cada mudança.
- Alvo de toque: WCAG 2.2 (2.5.8) pede 24 por 24 px CSS no mínimo, com exceção de espaçamento por círculo de 24 px sem sobreposição ([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), 10/11/2026). Para polegar, 44 px é a referência comum (não verificado aqui).
- Alternativa ao arrastar (WCAG 2.5.7): a página aberta não explicou o critério; não verificado. A prática comum é oferecer também dois campos numéricos ou botões de passo.

## Decisão 2: escolha múltipla de lugares e regiões

| App | Única ou múltipla | Chips | Mapa ou lista | "Qualquer lugar" | Ordena por proximidade ou filtra | Fonte |
|---|---|---|---|---|---|---|
| Airbnb | Uma busca por vez; área definida pelo mapa (mover e dar zoom revela mais anúncios) | Não verificado | Mapa e lista juntos | Não verificado | Filtra pela área visível; "buscar nesta área" não confirmado na página | [Airbnb, ajuda 421](https://www.airbnb.com/help/article/421) |
| iFood / Rappi | Um endereço de entrega ativo; trocar o endereço troca a lista | Não | Lista, com endereços salvos | Não | Filtra: só aparece quem entrega naquele endereço; o raio é da loja (até cerca de 10 km, fonte de terceiros) | [Tecnoblog](https://tecnoblog.net/responde/como-pedir-para-outra-pessoa-ou-endereco-no-ifood-rappi/), [Saipos](https://saipos.com/integracoes/ifood/como-aumentar-area-de-entrega-do-ifood) (nada oficial) |
| Google Maps | Uma área por vez: botão "Pesquisar nesta área" depois de mover o mapa (fonte de terceiros; ajuda oficial não aberta) | Não | Mapa | Não | Filtra pela área visível | [AddictiveTips](https://www.addictivetips.com/ios/search-a-specific-area-in-google-maps); ajuda oficial em [support.google.com/gmm/answer/3273353](https://support.google.com/gmm/answer/3273353) não verificada |
| Sympla | Cidade, ou local exato, escolhido na home ou em qualquer página; mapa de eventos "perto de você ou onde escolher" | Não verificado | Lista e mapa | Não verificado | Cidade filtra; "exato" tende a proximidade (não verificado) | [App Store, Sympla](https://apps.apple.com/BR/app/id1136318924) |
| Shotgun, DICE, Fever | Não abertos | n/d | n/d | n/d | n/d | não verificado |
| Resident Advisor | Páginas por país e cidade (`ra.co/events/<país>/<cidade>`); filtros de data, gênero e tipo vistos nos resultados; filtro por área e se aceita várias: não confirmado | n/d | Lista | Existe "all" na URL por país (visto em resultados) | Filtra por cidade | [RA](https://ra.co/events/ca/hamilton/techno) (resultado de busca); página de São Paulo deu 403 |
| QuintoAndar | Digitar bairro, cidade, rua ou região; ou "navegar pelo mapa para definir a região", com área ajustável | Não verificado | Mapa e lista | Não verificado | Filtra; a escolha múltipla de bairros não foi confirmada | [QuintoAndar, filtros](https://www.quintoandar.com.br/guias/?p=2442529) |
| Zap Imóveis | URLs por região (ex.: `sp+sao-paulo+zona-oeste`); várias localizações juntas não confirmado | não verificado | Lista | não verificado | Filtra | [Zap, exemplo](https://www.zapimoveis.com.br/aluguel/imoveis/sp+sao-paulo+zona-oeste/?pagina=35) |

Leitura honesta: das nove referências pedidas, só Sympla, QuintoAndar e Airbnb tiveram página aberta, e nenhuma confirmou multiescolha de bairros. O que a pesquisa sustenta é o padrão dominante (um endereço ou uma área por vez, filtrando) e a ausência de um exemplo bem documentado de chips de várias regiões.

## O que isso recomenda para o Finde

- **Idade, o controle.** Seletor de dois pontos, padrão 28 a 35, limites 18 a 60 (limites são sugestão, não vieram de fonte). Segue o padrão ARIA de multi-thumb, com `aria-valuetext` ("28 anos"), alvo de toque de pelo menos 44 px e os dois números também editáveis em campos ou por botões de passo, para quem não arrasta.
- **Idade, o padrão de comportamento.** Preferência que ordena, não filtro que exclui. Tinder e Bumble mostram que o filtro duro esgota a fila; o Hinge resolve com o interruptor, e o Finde pode deixar o interruptor de fora no início: tudo é preferência, e ninguém recebe um "exige".
- **O que fica fora da faixa.** Aparece depois do que está dentro, nunca some. Cada festa fora ganha um rótulo curto ("público costuma ser mais novo" ou "mais velho") em vez de esconder. Se o Caio quiser a exigência, ofereça o interruptor estilo Hinge como segunda etapa.
- **Lugares, o modelo.** Escolha múltipla com chips removíveis (bairros ou regiões de São Paulo), mais a opção "Qualquer lugar" como chip exclusivo (marcar limpa os outros). Lista de bairros agrupados por zona como entrada principal; mapa como apoio, não como obrigação.
- **Várias regiões.** Os chips filtram o conjunto; dentro dele, ordene por proximidade do primeiro chip ou da localização atual. Mostre a contagem por chip e um resumo ("3 regiões · 42 festas"). Uma festa fora das regiões escolhidas pode aparecer numa faixa "perto das suas regiões", nunca misturada.
- **Validar antes de decidir.** Abrir no app real RA, Shotgun, DICE e Fever para ver se há multiescolha de áreas; é o que esta pesquisa não confirmou.

## Fontes e datas

Acessadas em 10/11/2026, salvo indicação. Páginas marcadas 403 não abriram; só se usou o trecho de busca.

- Tinder, central de ajuda: https://www.help.tinder.com/hc/en-us/articles/115003340963-Discovery-Settings (403)
- Hinge, central de ajuda: https://help.hinge.co/hc/en-us/articles/360011063294-How-do-I-change-my-Preferences (403)
- Bumble, central de ajuda: https://support.bumble.com/hc/en-us/articles/28423691289629 (403)
- W3C APG, slider multithumb: https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/ (aberta)
- W3C WCAG 2.2, tamanho do alvo: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (aberta)
- Airbnb, ajuda 421: https://www.airbnb.com/help/article/421 (aberta)
- Google Maps, trecho de terceiros: https://www.addictivetips.com/ios/search-a-specific-area-in-google-maps (só busca)
- Tecnoblog (iFood/Rappi): https://tecnoblog.net/responde/como-pedir-para-outra-pessoa-ou-endereco-no-ifood-rappi/ (só busca)
- Saipos (área de entrega iFood): https://saipos.com/integracoes/ifood/como-aumentar-area-de-entrega-do-ifood (só busca)
- Sympla, App Store: https://apps.apple.com/BR/app/id1136318924 (aberta)
- QuintoAndar, guia de filtros: https://www.quintoandar.com.br/guias/?p=2442529 (aberta)
- RA, exemplo de página: https://ra.co/events/ca/hamilton/techno (só busca); https://ra.co/events/br/saopaulo (403)
- Zap Imóveis, exemplo de URL: https://www.zapimoveis.com.br/aluguel/imoveis/sp+sao-paulo+zona-oeste/?pagina=35 (só busca)

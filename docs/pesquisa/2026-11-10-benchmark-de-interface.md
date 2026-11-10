# Benchmark de interface para o Finde

Acesso em 10/11/2026. As imagens ficam fora do repositório, na pasta privada `ChatGPT/Finde/pesquisa/2026-11-10-benchmark-visual/`, porque são telas de terceiros. Aqui só os nomes dos arquivos.

Método: Chrome headless sem som, user agent comum, celular emulado (390×844, escala 2), geolocalização em São Paulo, sem login, sem compra, só navegação. Cookies: recusados quando havia botão de recusa (Shotgun, "Negar"); nos outros (Sympla, DICE, Eventbrite) o banner ficou aberto e aparece nas capturas. Cada app abaixo marca **visto** (página real renderizada) ou **loja/ajuda** (captura oficial da App Store BR ou página de ajuda).

## Apps de eventos

### Shotgun (visto, mobile e desktop)
URL: shotgun.live/pt-br/cities/sao-paulo e shotgun.live/pt-br/events/sacra-303-13-ed.
- **Lugar.** O Shotgun escolhe só cidade. Há três seletores empilhados no topo (cidade, "Por gênero musical", "Por data"). O da cidade abre uma folha com busca, "Perto de mim" no topo e a lista de cidades do país, com a atual marcada. Não existe bairro. `shotgun-filtro-cidade-mobile.png`
- **Filtros.** Data abre um calendário do mês, em inglês na versão visitada (Su, Mo...). Gênero é lista. Preço não é filtro. `shotgun-filtro-data-mobile.png`, `shotgun-filtro-genero-mobile.png`
- **Lista.** Agrupada por dia ("QUARTA 11 NOV"). Cada cartão: imagem grande, título, casa, depois uma linha com data e hora em laranja e o preço ou estado ("R$ 20,00", "Gratuito", "Lista de espera"), e por último etiquetas de gênero. Data e hora vêm antes do preço. `shotgun-cidade-topo-mobile.png`, `shotgun-cidade-lista-mobile.png`, `shotgun-cidade-lista-desktop.png`
- **Detalhe.** Imagem, título, "Por <produtor>", data com início e fim ("21:00 a 05:00"), casa, endereço, depois os botões "Ingressos" e "Tenho interesse" no corpo da página (não há barra fixa na web). Abaixo: ingressos com regra no nome ("FREE até 23h, R$ 20 depois"), descrição, lineup, produtor com seguidores, "Mood" (gêneros), localização. `shotgun-detalhe-topo-mobile.png`, `shotgun-detalhe-meio-mobile.png`, `shotgun-detalhe-baixo-mobile.png`, `shotgun-detalhe-desktop.png`
- **Público.** Na web, só seguidores do produtor. No app (loja), "3 amigos e 5k têm interesse" e aviso de "onde seus amigos estão indo". `shotgun-app-loja-capturas-mobile.png`

### Sympla (visto, mobile e desktop)
URL: sympla.com.br/eventos/sao-paulo-sp, busca `?s=festa` e uma página de evento (Pink Flamingo, Treta Festa).
- **Lugar.** Cidade no topo, em chip removível ("São Paulo x"). O seletor abre tela cheia com "Usar minha localização atual", "Todos os lugares" e lista de cidades. Sem bairro. `sympla-cidade-seletor-mobile.png`, `sympla-busca-festa-mobile.png`
- **Filtros.** Fileira de chips: cidade, "Quando?", Categorias, Preço, Tipo do evento. "Quando?" abre folha com atalhos (Hoje, Amanhã, Nesta semana, Neste fim de semana) e calendário que aceita várias datas, com botão "Mostrar resultados". Preço tem só duas opções, Grátis e Pago, sem faixa de valor. `sympla-filtro-data-mobile.png`, `sympla-filtro-preco-mobile.png`, `sympla-filtro-categorias-mobile.png`
- **Lista.** Contagem ("7590 eventos encontrados"), ordenação ("Relevantes") e cartões horizontais: miniatura, título, cidade, data e hora. Sem preço no cartão. Na página de cidade, os eventos vêm em carrosséis por categoria. `sympla-cidade-topo-mobile.png`, `sympla-cidade-lista-mobile.png`, `sympla-busca-festa-desktop.png`
- **Detalhe.** Imagem, título, início e fim, local com link, selo "Parcele em até 12x", seletor de lote com quantidade e taxa visível ("R$ 30,00 (+3,99 taxa)"). **Barra fixa no pé** com total, parcelamento e botão verde "Comprar Ingressos" com a quantidade. Depois: descrição, política de cancelamento, local com "Ver no mapa", produtor, "Fale com o produtor". `sympla-detalhe-topo-mobile.png`, `sympla-detalhe-meio-mobile.png`, `sympla-detalhe-baixo-mobile.png`, `sympla-detalhe-desktop.png`
- **Público.** Nenhum sinal.

### Fever (visto, mobile)
URL: feverup.com/pt/sao-paulo, /eventos-musica e feverup.com/m/830433.
- **Lugar.** Cidade em faixa de links no topo (Guarulhos, São Bernardo, Santo André, Santos, outras capitais), mais ícone de pino. Região metropolitana aparece como cidades vizinhas, sem bairro. `fever-cidade-topo-mobile.png`
- **Filtros.** Abas de subcategoria ("Todos", "Concertos"...), e chips "Data", "Este fim de semana", "Nesta semana". Há também um filtro por "astral" na home (Noturno, Com amigos...). `fever-musica-topo-mobile.png`
- **Lista.** Grade de duas colunas, imagem quadrada com coração, casa, título, data, "A partir de R$". Classificação por estrelas em parte dos cartões. `fever-musica-topo-mobile.png`, `fever-cidade-lista-mobile.png`
- **Detalhe.** Imagem larga, título, selo, descrição longa com regras na imagem (vestuário proibido, meia-entrada), "Como chegar" com endereço, seletor de data e opção de ingresso com preço. **Botão flutuante "Ingressos"** em pílula azul, sempre visível. `fever-detalhe-topo-mobile.png`, `fever-detalhe-meio-mobile.png`, `fever-detalhe-baixo-mobile.png`
- **Público.** Nota média e número de avaliações. Nada de idade.

### DICE (visto, mas sem São Paulo)
URL: dice.fm/browse e dice.fm/event/... (Cidade do México).
- **Lugar.** A lista de cidades do DICE não inclui nenhuma do Brasil. O padrão foi San Juan, por IP. Três botões no topo: cidade, data, preço. A cidade abre lista agrupada por país. `dice-filtro-cidade-mobile.png`, `dice-browse-inicial-mobile.png`
- **Lista.** Nome do artista, data por extenso, casa, "A partir de MX$". `dice-lista-mexico-mobile.png`
- **Detalhe.** Imagem, depois bloco escuro com "A partir de <preço>" e botão amarelo "Comprar bilhetes" lado a lado, abaixo da imagem. Depois: faixa principal, sobre, **faixa etária da entrada em linguagem de regra ("Para mayores de 18 años, traer INE")**, reembolso, lineup com horário de cada atração, local com mapa, "Portas abrem às". Se a barra é fixa ao rolar, não foi verificado. `dice-detalhe-topo-mobile.png`, `dice-detalhe-meio-mobile.png`, `dice-detalhe-baixo-mobile.png`
- Os filtros de data e preço (`dice-filtro-data-mobile.png`, `dice-filtro-preco-mobile.png`) foram capturados, mas não conferi o conteúdo.
- App BR na loja: `dice-app-loja-capturas-mobile.png` (não analisada).

### Resident Advisor (só loja)
O site (ra.co) devolveu "Access is temporarily restricted" ao headless. Não insisti. Fonte: capturas do app "RA Guide" na App Store BR (`ra-guide-loja-capturas-mobile.png`), que mostram a versão de Londres.
- **Lugar.** Cidade em título grande no topo, com um chip de data e um chip de cidade ao lado de um ícone de filtros.
- **Lista.** Abas "All / For You / New". Lista agrupada por dia ("FRI, 24 MAY"), cada item com nome, lineup resumido, local e um número com ícone de pessoa (interessados, ex. 23.230). Também uma fileira "Popular" com cartazes.
- **Detalhe.** Título, **contador "1014 Interested" com botão**, data e horário, local com seta, botão "Buy tickets".
- **Público.** O contador de interessados é o único sinal, sem idade.

### Eventbrite (visto, mobile)
URL: eventbrite.com.br/d/brazil--s%C3%A3o-paulo/party/ e um evento. Os resultados de São Paulo para "party" foram eventos de igreja, então vale pelo desenho, não pelo conteúdo.
- **Lugar.** Caminho na URL e migalhas (Brasil / São Paulo / Party). Sem bairro nos filtros.
- **Filtros.** Fileira de chips: Filtros, Data, Categoria, Formato, Preço, Idioma, Moeda. `eventbrite-lista-topo-mobile.png`
- **Lista.** Cartão com imagem grande, título, data e hora, "cidade · local", preço ("Gratuito"), produtor com seguidores, selo "Vendas terminam em breve".
- **Detalhe.** Imagem, selo de urgência, título, produtor com "Seguir", local, data, depois visão geral, "Good to know" com duração, local com mapa e como chegar, agenda, perguntas frequentes. `eventbrite-detalhe-topo-mobile.png`, `eventbrite-detalhe-meio-mobile.png`

### Partiful (visto, mobile, só descoberta)
URL: partiful.com/explore. Mostra Nova York, sem São Paulo.
- **Lugar.** Campo "Search for your city" e carrosséis por cidade.
- **Cartão.** Imagem com o anfitrião no topo e **uma estrela com número (ex. 494) sobre a imagem**, depois título, "dia da semana às hora · bairro" ("Sun at 12pm · Brooklyn"), com o bairro no cartão. `partiful-discover-mobile.png`

## Apps de namoro: faixa de idade

As capturas de loja são de marketing e nenhuma mostra o seletor de idade. O que há vem das páginas de ajuda e de buscas, marcado como tal.

- **Tinder** (ajuda). Configurações de Discovery têm idade e distância; sob cada controle, um alternador decide se aparecem pessoas "um pouco fora" da faixa. A ajuda diz que podem aparecer perfis fora da faixa sobretudo quando as recomendações dentro dela acabam. `tinder-ajuda-discovery-mobile.png`, `tinder-loja-capturas-mobile.png`
- **Hinge** (ajuda, atualizada em 27/07/2026). Preferência de idade pode ser "Dealbreaker" (só mostra quem cabe) ou "Flexível" (prioriza a faixa, mas mostra outros). A tela de preferências marca o rótulo. `hinge-ajuda-preferencias-mobile.png`, `hinge-loja-capturas-mobile.png`
- **Bumble** (loja). A tela de filtros mostra o controle de distância com um alternador logo abaixo ("Ver pessoas um pouco mais distantes se minhas opções acabarem"), e uma seção de interesses com outro alternador no mesmo molde. Para idade não vi tela; blogs descrevem o mesmo padrão, o que não está confirmado por fonte oficial. `bumble-loja-capturas-mobile.png`
- Nos três, o controle de faixa não corta: ou aceita quem está fora, ou avisa o limite.

## Apps de lugar e região

- **QuintoAndar** (loja). Busca pelo mapa: chips de preço sobre o mapa, botão "Área do mapa · 5 filtros", ícone de localização. Detalhe com abas "Fotos / Vídeo / Mapa / Rua" e valor "total" (aluguel + condomínio + IPTU) em destaque. `quintoandar-loja-capturas-mobile.png`
- **ZAP Imóveis** (loja). Campo "Localização do mapa", chips Filtros / Ver mapa / Criar alerta / Ordenar, contador "18 imóveis de 117.632", folha de filtros com Cancelar e Aplicar, "Faixa de preço" com Mínimo e Máximo, "Busca pelo mapa" com bolhas de preço. `zap-loja-capturas-mobile.png`
- **Airbnb** (loja). Pílula de busca no topo com resumo ("Acomodações em Cidade do México · Qualquer dia · 3 hóspedes") e ícone de filtros ao lado; "Qualquer dia" como valor padrão explícito. `airbnb-loja-capturas-mobile.png`
- **Google Maps** (loja). Resultados em folha deslizante sobre o mapa; chips "Ordenar por", "Aberto agora", "Preço"; "Aberto · Fecha às 23:00 · 1 km" no cartão. `googlemaps-loja-capturas-mobile.png`

## O que serve ao Finde

### (a) Escolha de bairros e região
- Nenhum app de evento visto escolhe bairro: Shotgun, Sympla, Fever e Eventbrite fecham em cidade, com "Perto de mim" ou "Usar minha localização" (Shotgun, Sympla). O Finde tem aqui um espaço que ninguém ocupa. `shotgun-filtro-cidade-mobile.png`, `sympla-cidade-seletor-mobile.png`
- Valor padrão explícito para "sem filtro": Sympla tem "Todos os lugares"; Airbnb escreve "Qualquer dia". O Finde pode ter "São Paulo inteira" como primeira opção marcada, e bairros como chips que se somam (vários), não lista exclusiva. Sympla, Airbnb.
- Chip removível com o valor atual ("São Paulo x"), que mostra o que está ligado e desliga num toque. Sympla. `sympla-busca-festa-mobile.png`
- Bairro no cartão da lista, como "Sun at 12pm · Brooklyn". Partiful. É o que permite conferir a escolha sem abrir o evento.
- Mapa só como segunda visão, não como entrada: QuintoAndar e ZAP abrem pelo mapa porque o imóvel é um lugar; a festa é uma noite, e o Finde recebe o pedido em texto/chips. Para "distância não fechada" (conceito, seção 2), a ideia do alternador "mostrar um pouco mais longe se acabar" (Bumble) serve melhor que um raio em km.

### (b) Faixa de idade
- Em nenhum app de evento visto há idade do público. O único número de público é interesse (RA "1014 Interested", Partiful estrela, Shotgun "3 amigos e 5k têm interesse"). A idade média do Finde é inédita e precisa vir com fonte, como já está no plano. `ra-guide-loja-capturas-mobile.png`, `partiful-discover-mobile.png`
- Para o seletor 28–35: o padrão dos apps de namoro é faixa com dois pontos e um comportamento definido para quem fica de fora. Duas versões a escolher: **estrito** (Hinge "Dealbreaker") ou **flexível** (Hinge "Flexível", Tinder e Bumble com alternador "mostrar um pouco fora"). Para o Finde, "flexível" combina com a dor "muito novo", desde que o cartão diga a média de quem vai e não esconda a festa. Hinge, Tinder, Bumble.
- Idade mínima de entrada é regra da casa e fica no bloco de regras ("Para mayores de 18"), separada da média do público. DICE. `dice-detalhe-meio-mobile.png`
- Limite: as telas dos seletores de idade não foram vistas, só a descrição de ajuda. Convém abrir os apps antes de copiar o desenho.

### (c) Cartão da lista
- Ordem que se repete: imagem, título, casa, data e hora, preço ou estado, gêneros. O Shotgun usa uma linha só para data e hora e preço, em laranja, com o estado ("Lista de espera") ao lado. `shotgun-cidade-lista-mobile.png`
- Agrupar por dia com cabeçalho ("QUARTA 11 NOV"), como Shotgun e RA, combina com um guia de fim de semana.
- O Sympla não mostra preço no cartão, o que obriga a abrir o evento para saber se cabe no orçamento, que é um dos filtros centrais do Finde. O Fever e o Shotgun mostram. Sympla (contra-exemplo), Fever, Shotgun.
- Para o Finde, os dados do cartão que os outros não trazem: horário de abertura (a dor "abre à 1h") e média de idade. Shotgun mostra só hora de início, e só no detalhe aparece o fim ("21:00 a 05:00").
- Estrela ou contador de interesse sobre a imagem, como no Partiful, para o sinal social, se o Finde tiver essa informação.

### (d) Página de detalhe e barra fixa
- Ordem recorrente: imagem, título, produtor, data com início e fim, local, ingressos, descrição, lineup, regras, mapa, produtor. Shotgun, Sympla, DICE, Eventbrite. `shotgun-detalhe-topo-mobile.png`
- Barra fixa de compra: Sympla (total + botão verde com quantidade, no pé) e Fever (pílula flutuante "Ingressos"). Shotgun na web deixa os botões no corpo. A versão mais completa é a do Sympla, que mostra o total na barra antes de tocar. Para o Finde, a barra fixa leva o par de ações já decidido no plano (mandar para o grupo, comprar), e pode repetir o preço como o Sympla. `sympla-detalhe-baixo-mobile.png`, `fever-detalhe-baixo-mobile.png`
- Preço com a taxa à vista ("R$ 30,00 (+3,99 taxa)", Sympla) e "o preço que vais pagar, sem surpresas" (DICE). Dado útil para o teto de gasto.
- Regra do preço por horário no nome do ingresso ("FREE até 23h, R$ 20 depois", Shotgun) é típica de festa e muda a conta do usuário; o detalhe do Finde precisa de espaço para ela. `shotgun-detalhe-topo-mobile.png`
- Regras de entrada em bloco próprio (vestuário e meia-entrada no Fever; idade mínima no DICE; horário das portas no DICE). `fever-detalhe-baixo-mobile.png`, `dice-detalhe-meio-mobile.png`
- Links para fora ficam no fim: "Fale com o produtor" (Sympla), seguir o produtor (Shotgun, Eventbrite). Instagram não apareceu como bloco visível nas páginas visitadas.

### (e) Filtros
- Fileira de chips que abrem folha, com botão de confirmação ("Mostrar resultados") e atalhos de data antes do calendário: Hoje, Amanhã, Nesta semana, Neste fim de semana. Sympla. O Fever repete os atalhos "Este fim de semana" e "Nesta semana" como chips diretos. `sympla-filtro-data-mobile.png`, `fever-musica-topo-mobile.png`
- Para o Finde, "Este fim de semana" como padrão ligado, e calendário como exceção.
- Preço: Sympla só tem Grátis e Pago; DICE tem um filtro de preço (conteúdo não conferido). Para teto de gasto, um valor máximo único parece mais direto que faixa. Sympla (contra-exemplo). `sympla-filtro-preco-mobile.png`
- Gênero é filtro de lista no Shotgun e etiqueta no cartão. Para o Finde, "estilo" é opcional, então pode ser só chips no fim. `shotgun-filtro-genero-mobile.png`
- Contagem de resultados e ordenação visíveis acima da lista ("7590 eventos encontrados · Relevantes"). Sympla.
- Quando as opções acabam, dizer isso e alargar (alternador do Bumble e do Tinder), em vez de tela vazia. A Eventbrite mostra "Nada corresponde à sua pesquisa" e oferece populares no lugar (`eventbrite-lista-meio-mobile.png`, não conferido em detalhe).

## O que não foi visto
- ra.co: bloqueado, só loja.
- DICE em São Paulo: não existe; visto com Cidade do México.
- Seletor de idade dos apps de namoro: só ajuda e descrição, sem tela.
- Capturas de loja são de marketing e podem não refletir a versão atual.
- Barra fixa do DICE ao rolar, filtros de data e preço do DICE e as páginas de desktop do Shotgun e do Sympla (capturadas) foram só parcialmente conferidos.

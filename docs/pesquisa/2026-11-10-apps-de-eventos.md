# Apps de eventos: página de detalhe, ingresso, social e dados (10/11/2026)

Pesquisa para o Finde (festas, 28 a 35 anos, São Paulo). Cada afirmação traz a fonte pelo número [n] da lista no fim. Onde não consegui abrir a página, está escrito "não verificado". Páginas de RA, Shotgun e Eventbrite devolveram 403 ou 429 ao WebFetch, então a ordem exata dessas páginas vem de trechos de busca e de listagens de loja, que são fonte mais fraca.

## 1. Tabela comparativa

| App | Página de detalhe (ordem observada) | Ingresso | Social | Sinais de público |
|---|---|---|---|---|
| **Sympla** | Aviso de status, título, data com início e fim ("de 29/08 às 22h até 30/08 às 07h"), local resumido, descrição (idade mínima e regras vêm aqui, em texto livre), taxas, política do evento, endereço com "Ver no mapa" e "Denunciar", produtor com "Fale com o produtor", pagamento, ajuda. Nesse exemplo (evento encerrado) não apareciam lineup, lotes nem preço [1] | Dentro do Sympla (web e app), ingresso nominal, limite por usuário, parcelamento [1][2] | Sem seção de compartilhar na página; o app permite compartilhar evento [2] | Só texto livre ("proibida entrada de menores de 18"). Sem campo estruturado, sem interessados [1] |
| **Fever** | Aviso de disponibilidade e alerta, galeria, título com nota (4,8 de 213 avaliações), data com "portas abrem 21h, show 00h", local, categorias de ingresso (Inteiro, Meia, Promo), descrição e destaques, regras de entrada (vestimenta), avaliações, lineup, sobre o local, mapa estático, contato [3] | Dentro do Fever (app e site), venda exclusiva em alguns locais; troca ou reembolso até 7 dias e 24 h antes [3][4] | Transferência de ingresso para amigos [4]. Sem "amigos que vão" visto | Avaliação média e nº de avaliações. Idade mínima não constava naquele evento [3]. Listagem mostra "a partir de R$" e selo "Novo!" [5] |
| **Shotgun** | Pelos trechos de busca: nome, data, lineup (alguns eventos dizem que o lineup sai aos poucos), tipos de ingresso (online, "fura-fila"), textos de entrada [6][7]. Página não aberta | Dentro do app e site; revenda e lista de espera para esgotados [8] | App diz "acompanhar para onde os amigos vão"; seguir organizadores e artistas [8] | Eventos "Para todas as idades" aparecem só no título [6]. App 13+ [8]. Não vi média de idade |
| **DICE** | Crítica de design (iOS): cabeçalho com título, banner, data e hora em amarelo, local; linha de ações (salvar, compartilhar, curtir); descrição; políticas; barra fixa com menor preço e "Get Tickets", que abre os níveis [9]. Crítica aponta preço mostrado era o do lote mais barato mesmo esgotado [9] | Dentro do app; ingresso só em QR no app; lista de espera para esgotados; devolução de ingresso [10][11] | Seguir amigos para ver o que salvaram ou compraram; convidar amigo na página do evento; "em alta com seus amigos" na home [10][12]. Enviar ingresso a quem não tem conta pede cadastro [9] | Não vi idade nem "vibe" na página. Não verificado |
| **RA** | Pelos trechos de busca: data, local com endereço, contagem "Interested", lineup [13]. Página não aberta | Link para fora ou venda própria conforme o evento; não verificado | Botão "Interested" (contador); sem chat de grupo visto [13] | Número de interessados (12 num festival, 0 ou 2 em eventos pequenos) [13]. Sem idade média |
| **Eventbrite** | Não verificado (página de evento não aberta) | Dentro do Eventbrite; não verificado em detalhe | Não verificado | Não verificado |
| **Partiful** | Página do convite: tema e pôster, anfitrião, data, local, descrição, quem vai (se o anfitrião mostrar), atividade e comentários, álbum de fotos [14][15][16] | Opcional: ingressos com código promocional, "Chip In" por Venmo e similares, check-in com equipe [15] | Referência. Ver seção 2 | Lista de convidados e "# Going" visíveis, anfitrião pode ocultar ou anonimizar [15][16]. Sem faixa etária |
| **Instagram** (canal) | Perfil e post do organizador: cartaz, legenda livre, link na bio. Não há estrutura de evento; não verificado em detalhe | Sempre link para fora | Compartilhar post, DM, comentários | Seguidores, curtidas, quem comenta. É o único sinal de "vibe" visual |
| **Google Maps** (canal) | Estabelecimento: nome, nota, nº de avaliações, horário, endereço, fotos. Dados da API sujeitos a política de cache [17]. Detalhe de UI do Maps não verificado | Nenhum | Compartilhar link | Nota e avaliações do local, não da festa |

### Partiful, o fluxo em detalhe

- Criar: modelos e temas; o anfitrião cria conta com o telefone, que é também o login [18][14].
- Convidar: um link só, que serve para quem usa e quem não usa iPhone; compartilha por texto, WhatsApp e outros [14][18].
- RSVP: o convidado abre o link, informa o telefone e responde sem baixar app, segundo descrições de terceiros e do próprio listing [18][14]. As ações exatas (Going, Maybe, Can't go) não estão na ajuda que abri; a ajuda confirma que existe um RSVP "Maybe" desligável [15].
- Ao responder, o convidado vê quem mais vai, salvo se o anfitrião ocultar [18][16].
- Lembretes: o anfitrião vê ou desliga lembretes automáticos [15]; há "text blasts" do anfitrião para todos [14].
- Controles: aprovação de convidados, limite de +1, lista de espera com entrada automática (parar exige desligar RSVPs), senha no evento, ocultar lista e contagem [15][16][18].
- Reclamação em review: o convite chega como notificação que pede resposta imediata, não há cópia por e-mail, quem não tem o app só recebe texto em alguns casos; o app serve mais para plano casual que formal [14].

## 2. Padrões a copiar e a evitar

**Copiar**
1. Data e hora no topo, com início e fim (Sympla mostra o fim "às 07h" do dia seguinte) [1]; a DICE destaca data e hora em cor [9]. Para festa, o horário de abertura difere do horário em que a pista enche; o Fever separa "portas 21h" de "show 00h" [3].
2. Barra fixa com preço e ação única embaixo (DICE) [9], mostrando o menor preço **disponível**, não o do lote esgotado (falha apontada na crítica) [9].
3. Regras de entrada em seção própria e curta: idade, documento, vestimenta (Fever, Sympla) [1][3]. Hoje, no Sympla, a idade fica enterrada na descrição [1]; no Finde ela deve ser um campo.
4. Página compartilhável sem login e RSVP por telefone (Partiful) [14][18], porque o fluxo termina no WhatsApp.
5. Link do organizador e "Fale com o produtor" (Sympla) para dúvida [1].
6. Anfitrião controla o que o grupo vê (Partiful) [16]; para o Finde, equivale a mostrar contagem só quando há número real.
7. Lista de espera para esgotado (Shotgun, DICE, Partiful) [8][10][15].

**Evitar**
1. Exigir cadastro para enviar ao amigo (DICE pede convite de registro a quem não é usuário) [9].
2. Lista de espera que não anda: reclamações recorrentes na DICE [11].
3. Dependência de app para ver ingresso, com queda do app no dia (reviews DICE) [11].
4. Suporte só por formulário depois de problema na porta (review do Shotgun, set/2024) [8].
5. Contagem "Interested" com zero ou dois: sinal de página vazia (RA) [13]. Não mostrar número abaixo de um limiar.
6. Convite só por notificação sem cópia salva (review do Partiful) [14].
7. Páginas com recomendações antes do conteúdo, como o Fever mostra "experiências similares" antes dos detalhes no markup [3].

## 3. Disponibilidade de dados para um agregador

Nada abaixo é parecer jurídico; confira os termos vigentes antes de construir.

| Fonte | O que está documentado |
|---|---|
| Eventbrite | A busca pública de eventos da API foi desligada em 12/12/2019, segundo o changelog citado por busca; terceiros dizem que a API cobre só eventos da própria organização [19]. Termo de uso: um trecho reproduzido diz que scraping e coleta automatizada são proibidos; não confirmei no texto vivo (a página oficial devolveu 403) [19] |
| RA | Termos de uso (versão UK, 4.4): proíbem software automatizado para extrair conteúdo para fins comerciais sem acordo escrito, e acesso por bots, scripts e crawlers não aprovados por escrito, salvo buscadores [20] |
| Instagram | Meta: APIs de plataforma são o único meio permitido de coleta programática sem permissão escrita; requisições a outros domínios do Instagram são violação [21] |
| Google Maps (Places) | Cache e armazenamento só onde os termos permitem; copiar nome, endereço e avaliações fora do serviço é proibido; place ID pode ser guardado sem prazo; latitude e longitude até 30 dias [17] |
| Sympla, Fever, Shotgun, DICE | Termos do Sympla e do Fever não consegui abrir (403 no Sympla). Não encontrei API pública oficial de listagem para nenhum dos quatro. Não verificado |
| schema.org/Event | Nas páginas que consegui ler (Sympla, Fever), o texto extraído não mostrou JSON-LD; isso não prova ausência, porque o extrator só devolve texto. Para saber, rode `curl` na página e procure `application/ld+json` |
| Partiful | Convites privados ou por link: sem uso como fonte; não verificado |

Conclusão prática: nenhuma fonte acima tem, nos documentos que li, autorização expressa para agregação por raspagem. O caminho com fonte é acordo direto com produtores, cadastro feito pelo produtor, ou uso de APIs de quem oferece (Google Places com place ID, Meta Graph).

## 4. Para o Finde

A página de detalhe precisa de, nesta ordem: nome e cartaz; quando (início, fim, abertura); onde (bairro, endereço, mapa); quanto (menor lote disponível e link para comprar fora); quem entra (idade mínima, regra de porta, documento); quem toca (lineup e gênero); o que o organizador publicou (Instagram); e o botão "mandar pro grupo" fixo embaixo, como a barra da DICE. Sinais de público só quando há dado real: faixa de idade declarada pelo organizador, não estimada. Nenhum dos apps pesquisados mostra média de idade; o que existe é idade mínima, contagem de interessados (RA), nota (Fever) e seguidores (Instagram).

## 5. Fontes abertas (acesso em 10/11/2026)

[1] https://www.sympla.com.br/evento/esbornia-sao-paulo-pix/3545180
[2] https://apps.apple.com/BR/app/id1136318924
[3] https://feverup.com/m/676530
[4] Resultado de busca sobre FAQ do Fever (exchange 7 dias): https://docs.google.com/document/d/1hhnGpwHLv4vpF5O2oi8F389nZqIekdByVfEY7oc1UqM/export?format=pdf (só trecho de busca, não aberto)
[5] https://feverup.com/pt/sao-paulo/festas-discotecas
[6] https://shotgun.live/fr/events/sadfestival-primeira-edicao-para-todas-as-idades (só trecho de busca, não aberto; WebFetch 429)
[7] https://www.bandsintown.com/e/1035312076-carlos-do-complexo-at-espaco-usine (só trecho de busca)
[8] https://apps.apple.com/app/shotgun/id760028892
[9] https://ixd.prattsi.org/2026/02/design-critique-dice-ios-app/
[10] https://dicefm.zendesk.com/hc/en-gb/articles/22365422759313-Getting-started-with-DICE (só trecho de busca; WebFetch 403)
[11] https://apps.apple.com/us/app/dice-live-shows/id898358948 (reviews, via trecho de busca)
[12] https://fueled.com/?p=29652
[13] https://ra.co/events/2497079 e outras páginas de ra.co (só trecho de busca; WebFetch 403)
[14] https://apps.apple.com/us/app/partiful-invites/id1662982304
[15] https://help.partiful.com/hc/en-us/articles/28895223149979-What-features-are-available-to-change-in-my-Event-Settings
[16] https://help.partiful.com/hc/en-us/articles/26503238663195-Can-I-hide-the-guest-list-or-guest-count-on-the-party-page
[17] https://developers.google.com/maps/documentation/places/web-service/policies
[18] Busca sobre fluxo do Partiful (fontes de terceiros, ex.: https://party.pro/Partiful, https://sacra.com/chat/h/ca6c792b-7d6d-42a9-ae5f-0970a819c66c/); não abertas
[19] Busca sobre Eventbrite (https://groups.google.com/g/eventbrite-api/c/FT2MsDswdrA, https://www.eventbrite.com/tos); páginas oficiais devolveram 403 ou redirecionamento e não foram lidas
[20] https://ra.co/terms
[21] https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/

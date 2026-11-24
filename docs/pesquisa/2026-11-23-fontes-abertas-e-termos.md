# Fontes abertas de festas e o que os termos permitem (23/11/2026)

Em 23/11 o motor tinha 13 festas, todas lidas à mão a partir de links do grupo. Esta nota responde se alguma agenda ou plataforma permite coleta automática que traga volume. Nada aqui é parecer jurídico. Os termos foram lidos em 23/11; as citações são curtas e o resto é paráfrase.

## Resultado

| Fonte | Termos | robots.txt | Dados estruturados | Festas que traria | Situação |
|---|---|---|---|---|---|
| Visite São Paulo (Fundação 25 de Janeiro) | Termos de 19/03/2021 não tratam de coleta, reprodução nem uso comercial; só proíbem uso impróprio das marcas | Libera as páginas de evento; fecha só `/calendario-de-eventos-todos/` | API pública `/wp-json/wp/v2/evento` com tipo, data, casa, endereço, horário e link de compra | Entre os 800 eventos publicados por último, 155 futuros e 7 do tipo festa nas quatro semanas seguintes; última importação em 06/11 | Candidata. Conector pequeno |
| Ingresse | Termos de Serviço de 24/01/2024 não tratam de coleta; os dados do evento vêm do organizador (7.1); proíbem contornar a segurança (10) | Libera tudo | A página de evento só se monta com JavaScript; sem schema.org | Não se aplica | Leitura manual de cada link |
| Sympla | Termos de Uso Gerais definem crawler e proíbem violar a segurança, sem vedar coleta por escrito. O Programa de Afiliados proíbe robôs e dá ao afiliado licença para divulgar os links da campanha | Devolve 503 a cliente automatizado | Páginas de evento com título e descrição em meta tags | Não se aplica | Programa de Afiliados a avaliar |
| MATO (ma.to) | Termos de 28/10/2025 não tratam de coleta; reservam o conteúdo original ao MATO | Marca o conteúdo como `ai-input=no` para agentes que não estão na lista deles | Não avaliado | Não avaliado | Fora, porque o Finde classifica com o Claude |
| Catraca Livre | Sem termos publicados (404); só política de privacidade | Fecha `/wp-json/` | Texto editorial | Baixo | Fora |
| Guia da Semana | Não lidos: 403 em todas as páginas | Libera, mas o site bloqueia | Não avaliado | Não avaliado | Fora: bloqueio é recusa |

A amostra do Visite São Paulo mostra o problema: de 30 eventos tirados das 300 publicações mais recentes, um era festa; o resto era show, congresso, feira e corrida. Ele importa eventos de plataformas como Sympla, Ticket360 e Shotgun em lotes, e o último lote foi em 06/11.

## O que isso quer dizer

Nenhuma fonte aberta e permitida traz festas em volume. As festas do público de 28 a 35 estão na Sympla, na Ingresse, na Shotgun e no Instagram, e nenhuma delas abre os dados para um agregador. O motor não fica forte por coleta automática.

Os caminhos que trazem volume passam por acordo:

1. **Programa de Afiliados da Sympla.** As produtoras põem eventos num conjunto disponível aos afiliados e definem a comissão. O Finde entraria como afiliado e divulgaria esses eventos com o link dele. Isso traz festas com autorização e é a comissão por ingresso de `docs/conceito.md`, seção 5. Falta ler se o app do Finde conta como "mídia" do afiliado: os termos aceitam os canais que a produtora indicar e não contam divulgação em outro site.
2. **Envio direto pela produtora.** É o único caminho que traz a média de idade. O endpoint existe; falta a página de formulário e o convite aos contatos.
3. **Curadoras e parceiros.** O Guia da Parik e o MATO têm agenda própria e programa para receber eventos. Uma parceria troca dados por divulgação.

Enquanto isso, duas medidas pequenas ajudam:

- O conector do Visite São Paulo, para pegar as festas que ele já lista, perto de duas por semana. Vale avisar a fundação pelo contato do site, já que os termos não falam de reuso.
- A leitura assistida dos links do grupo a partir do texto da página que a pessoa copia. O Claude extrai os campos e alguém confere, sem o motor abrir páginas de plataforma por conta própria.

## Fontes

- Visite São Paulo: https://visitesaopaulo.com/termosecondicoes/, https://visitesaopaulo.com/robots.txt, https://visitesaopaulo.com/wp-json/wp/v2/evento
- Ingresse: https://sobre.ingresse.com/terms-of-service
- Sympla: https://termos-e-politicas.sympla.com.br/hc/pt-br/articles/44293992401300-Termos-de-Uso-Gerais e https://termos-e-politicas.sympla.com.br/hc/pt-br/articles/37343148870932-Termos-de-Uso-Programa-de-Afiliados-Sympla (lidos no navegador; o leitor automático recebeu 403)
- MATO: https://ma.to/terms, https://ma.to/robots.txt
- Catraca Livre: https://catracalivre.com.br/politica-de-privacidade/, https://catracalivre.com.br/robots.txt
- Guia da Semana: https://www.guiadasemana.com.br/ (403)

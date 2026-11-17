# Referências de recomendação indicadas pelo grupo (16/11/2026)

Em 16/11 o grupo mandou 38 links para alimentar o motor. Quase todos eram perfis de festas e casas, um festival e páginas de compra de ingresso, que viraram contatos ou festas indicadas (`motor/README.md`, seção "Indicação do grupo"). Um deles é uma referência de como recomendar, e está aqui. A leitura foi feita por busca na web e pela prévia do link; o perfil no Instagram não foi aberto por automação, porque os termos da Meta não permitem.

## Guia da Parik

**O que é.** Uma curadora de eventos de São Paulo, com perfil no Instagram e no TikTok e um Linktree. A descrição diz que conecta a pessoa "a festas, descontos e tudo que rola na cidade". Junto com o perfil vieram links de compra na Ingresse com o código dela: numa festa, 10% de desconto; em outras, um ingresso mais barato liberado pelo código (na Xamêgo, R$ 115 em vez de R$ 130). Uma das festas era no Rio de Janeiro e ficou fora da base.

**O que ela faz que o Finde ainda não faz.**

1. **Recomenda em nome de uma pessoa.** A confiança vem de quem indica, e não de um filtro. No Finde, o "porquê" de cada festa é escrito pelo sistema, a partir do pedido.
2. **Junta a indicação com um desconto.** O cupom transforma a recomendação em vantagem concreta e deixa a curadora medir quanto vendeu.
3. **Fala com quem já a segue.** A lista dela chega a quem escolheu ouvi-la, e o gosto dela é o filtro.

**O que isso muda no desenho da recomendação.** A ordem e a explicação hoje saem de `prototipo/v1-festas/nucleo/motor.js`, e a "% a sua cara" que está entrando pesa horário 30, idade 25, bairro 20, preço 15 e som 10, calculada pelo pedido.

- **Curadoria como sinal, sem virar critério.** Uma festa indicada por uma curadora ou pelo grupo pode trazer essa marca no detalhe ("indicada por …"), como fonte do dado, sem entrar na conta da "% a sua cara". Se entrasse, a porcentagem deixaria de medir o encaixe com o pedido. O motor já guarda essa origem: a fonte "Indicado pelo grupo" aparece em `fontes`.
- **O desconto entra no preço.** Um cupom muda o "a partir de". Se o Finde passar a ter cupons de produtoras ou de parceiras, o lote precisa saber o preço com e sem cupom, e o filtro de teto deve usar o preço que a pessoa vai pagar de fato. Hoje o registro tem `preco`, `taxa` e `ate` por lote, e nenhum campo de cupom.
- **Modelo de negócio.** O cupom com código próprio é a "comissão por ingresso" de `docs/conceito.md`, seção 5, já funcionando no mercado. É um argumento para a comissão sobre a assinatura, e um formato de parceria: a curadora manda as festas pelo envio direto e ganha pelo código.
- **Curador como canal.** Para a Vaga Zero de growth, perfis assim são canal de aquisição do público de 28 a 35, mais do que concorrentes.

## Fora desta nota

- Os perfis de festas e casas viraram a lista privada de contatos do motor, fora do repositório.
- A Mare Ticket (mareticket.com.br), uma loja de ingressos, espera alguém ler os termos antes de qualquer uso (`motor/entrada/grupo/a-avaliar.json`, fora do git).

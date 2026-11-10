# Finde: conceito e plano

Revisão de 10/11/2026. Substitui a tese de 09/11 (motor de descoberta de experiências urbanas em geral) pelo recorte que o grupo definiu na Aula 5 do Start e no vídeo 2.

> **Still going out, just differently.**

O Finde é um guia de festas para quem tem entre 28 e 35 anos em São Paulo. Ele reúne as festas do fim de semana, que hoje chegam espalhadas em perfis, links e grupos de WhatsApp, e filtra pelo que importa a esse público: a idade de quem frequenta, o horário, quanto custa e, se a pessoa quiser, o estilo de música.

## 1. O que mudou desde a primeira versão

| Data | Tese | O que levou à mudança |
|---|---|---|
| 04/11 | Curadoria de experiências urbanas com assistente contextual | Negociação simulada da Aula 5 do Ignite |
| 09/11, tarde | Concierge que fecha o programa do grupo | Primeira entrevista: a decisão nasce no grupo |
| 09/11, noite | Motor de descoberta: agregador mais algoritmo, experiências em geral | Decisão do Caio: o valor está em encontrar melhor |
| 09/11, aula | **Guia de festas para 28 a 35 anos** | Value Proposition Framework feito em sala e vídeo 2 |

A versão atual combina as duas últimas. O mecanismo continua sendo a descoberta por agregação e filtro; o que muda é o recorte, que deixa de ser "tudo o que há para fazer na cidade" e passa a ser festa, para um público que se sente fora do lugar na maior parte delas.

## 2. Para quem

**Bruna, 30 anos**, mora em São Paulo, de classe média a alta, sai com o grupo de amigos no fim de semana. A persona é a do vídeo 2; a faixa vem do framework feito em sala.

| Dor | Como aparece | Situação |
|---|---|---|
| Público muito novo | Festa universitária; "fui nessa, só tinha gente muito nova" | Central |
| Horário que não cabe na rotina | Festa que abre à 1h da manhã | Central |
| Excesso de opções sem filtro | O grupo despeja links e perfis; "Vixe, preciso filtrar aqui" | Central |
| Orçamento | Não é tratado como frustração; entra na solução como teto de gasto | Filtro |
| Estilo musical | Preferência, sem ser dor | Filtro opcional |
| Distância | Apareceu na conversa e não foi fechado | Ajuste pelo chat |
| Festa "hypada" | O grupo concluiu que não é problema | Fora |

**Job to be Done.** Quando o grupo combina de sair no fim de semana, quero achar depressa uma festa com gente da minha idade, num horário que caiba na minha rotina e dentro do que eu quero gastar.

## 3. Proposta de valor

Versão feita pelo grupo em sala, no modelo da Aula 5 (Geoffrey Moore), com o refinamento proposto ao lado.

| Bloco | Versão de sala | Refinamento |
|---|---|---|
| Para | Adultos de 28 a 35 anos, classe média a alta, residentes em São Paulo | Mantido |
| Que | Precisam filtrar festas com base nas suas preferências de idade, horário e verba | Mantido |
| Nosso produto ou serviço | Guia de festas inteligente | Mantido |
| Que entrega | Recomendações personalizadas | Três festas que cabem no pedido, cada uma com o porquê, ajustáveis por conversa |
| Diferentemente de | Redes sociais e LLMs | Redes sociais, que mostram o que está em alta sem filtrar por público, e assistentes de IA, que respondem sem uma base de festas atual |
| Nossa solução | Personalizada, assertiva e instantânea | Mantido, com a explicação de cada indicação como prova de assertividade |

## 4. Como funciona (o protótipo)

O vídeo 2 já mostra o fluxo:

1. **Formulário curto**, uma pergunta por tela: quando; que horas chegar e ir embora; público de que idade (18 a 24, 25 a 29, 30 a 35, 36 ou mais); até quanto paga; estilo (opcional).
2. **Resultado que vira conversa:** três festas, cada uma com o porquê ("público de 30 a 35 · abre às 22h · R$ 60"). A pessoa ajusta por frase: "tem alguma mais perto de Pinheiros?".
3. **Mandar ao grupo:** a escolhida vai para o WhatsApp do grupo.

Por trás, o motor coleta festas de fontes públicas (perfis de casas e produtoras, plataformas de ingressos, agendas), junta numa base única e ordena pelo pedido.

**O ponto mais difícil do motor é o dado que define o produto.** Horário, preço, local e estilo costumam estar na divulgação da festa. A idade do público quase nunca está. Hipóteses para obtê-la, a testar:

- a produtora declara o público, como parte do perfil que ela mesma mantém (e que é também a porta do plano pago);
- quem foi avalia ("o público tinha a minha idade?"), o que exige base de usuários;
- sinais indiretos: preço, horário, casa, estilo e histórico da produtora.

Se nenhum desses caminhos funcionar bem, o filtro principal do produto vira chute. É a primeira coisa a validar.

## 5. Modelo de negócio

Quem usa não paga. Quem paga são produtoras de festa, casas noturnas e bares com programação de festa, que querem encontrar o público certo. Duas formas possíveis, a escolher com as entrevistas:

- **Assinatura**, nos três planos que o grupo já tinha (R$ 199, R$ 599 e R$ 1.499 por mês), graduados por pessoas encaminhadas.
- **Comissão por ingresso** vendido pelo link do Finde, mais natural em festa, onde quase tudo se vende antes.

O ranking orgânico não se vende. Destaque pago aparece sempre identificado.

## 6. O que precisa mudar para tudo ficar consistente

| Peça | Situação | O que muda |
|---|---|---|
| Vídeo 2 (v24) | Alinhado | Conferir se a rubrica aceita 1:15 (a do vídeo 1 pedia até 1 minuto) |
| Entrega final do Ignite (v2, prazo 30/11) | Fala de experiências em geral e de 20 a 34 anos | Mercado (população de 28 a 35 e número de produtoras e casas noturnas, no lugar de 50,5 mil bares e restaurantes); métrica de valor e preço (assinatura ou comissão por ingresso); canais (perfis de festa, criadores da noite) e persona. Equipe e funding mudam pouco: a Vaga Zero de growth por redes sociais serve bem ao recorte |
| Percurso do Start (v2) | Persona, JTBD e VPF da tese anterior | Trocar pela persona, pelo JTBD e pelo framework deste documento; atualizar a ficha técnica e a descrição do vídeo 2 |
| Protótipo v0 (`prototipo/v0-conversa`) | Conversa sobre 75 experiências escritas à mão | A casca reaproveita (resultado com porquê, ajuste por frase, link para o grupo). Mudam a entrada (formulário de cinco perguntas), a base (festas, com idade do público) e a linguagem visual |
| Entrevistas | Uma, com homem de 27 anos, sem foco em festa | Refazer com o público de 28 a 35, mostrando o vídeo 2 |
| Linguagem de design | Não existe | Definir antes de retomar o protótipo |

## 7. Próximos passos

1. Entrevistas com 28 a 35 anos, mostrando o vídeo 2. Perguntas em `docs/disciplina.md`.
2. Conversas com duas ou três produtoras ou casas: como chegam ao público hoje, se declarariam a idade do público, assinatura ou comissão.
3. Reescrever a entrega do Ignite com o recorte de festas, antes de 30/11.
4. Definir a linguagem de design.
5. Protótipo v1: formulário, resultado com conversa e envio ao grupo, sobre uma base de festas reais de um fim de semana.

## 8. Em aberto

- Assinatura ou comissão por ingresso.
- De onde vem a idade do público (seção 4).
- Distância: filtro ou só ajuste no chat.
- A faixa: 28 a 35 no framework, mas o formulário oferece 30 a 35 como opção; vale testar o corte nas entrevistas.

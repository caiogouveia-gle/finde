---
title: Detalhe da festa antes do grupo - Plan
type: feat
date: 2026-11-10
topic: detalhe-da-festa
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Detalhe da festa antes do grupo - Plan

## Goal Capsule

**Objective.** Quem recebe as três festas do Finde consegue conferir, numa tela só, tudo o que hoje vai buscar no Instagram, na página de ingressos e no mapa, e só então manda a festa escolhida para o grupo.

**Means.** Uma página de detalhe da festa no protótipo visual (`prototipo/v1-festas`), entre o resultado e o envio ao grupo, com os dados que o motor de coleta vai de fato conseguir entregar.

**Product authority.** Caio, pelo Grupo 1. O protótipo visual é a área ativa desta peça. O motor de coleta, agregação e classificação é a área vizinha: este documento só fixa o que ele precisa entregar para sustentar a tela (R14 a R17), sem planejar como.

**Open blockers.** Nenhum. As perguntas abertas estão classificadas em Outstanding Questions.

## Product Contract

### Summary

O resultado deixa de ter "Mandar pro grupo" em cada festa. Tocar numa festa abre o detalhe: horário e média de idade primeiro, depois local, preço, regras de entrada, som e os links de verdade (Instagram, página do evento, onde comprar). O envio ao grupo e a compra ficam numa barra fixa no pé do detalhe. O protótipo continua visual, com dados fictícios, mas cada campo corresponde a algo que o motor sabe obter e mostra de onde veio.

### Problem Frame

O v1 leva a pessoa da lista direto ao grupo. Na vida real ninguém faz isso: antes de propor uma festa, a pessoa abre o Instagram para ver a cara do público e as edições passadas, confere preço e lote na plataforma de ingresso e olha onde fica. O protótipo, do jeito que está, demonstra um gesto que o público-alvo não faria e esconde a parte em que o Finde mais economiza esforço, que é juntar essas fontes. Nenhum app de eventos mostra média de idade do público, o dado que diferencia o Finde (`docs/pesquisa/2026-11-10-apps-de-eventos.md`), e por isso a tela precisa deixar claro de onde ele vem.

### Key Decisions

- **O protótipo desta peça é visual, não funcional.** O motor real é construído em paralelo, noutra frente. (session-settled: user-directed — chosen over continuar evoluindo o v1 funcional: o importante agora é a usabilidade alinhada à realidade de uso.) Governs R1, R14.
- **O envio ao grupo sai da lista e só acontece a partir do detalhe.** (session-settled: user-directed — chosen over manter "Mandar pro grupo" em cada festa: ninguém manda sem antes conferir.) Governs R3, R9.
- **Os links de origem fazem parte do produto.** Instagram, página do evento e onde comprar aparecem no detalhe; o Finde agrega e leva para fora, sem vender ingresso. (session-settled: user-directed — chosen over um detalhe só com dados resumidos.) Governs R7, R8.
- **Horário e média de idade abrem o detalhe.** Regra 3 da voz da marca (`docs/marca.md`), confirmada pelo benchmark: Sympla, DICE e Fever põem data e hora no topo. Governs R4, R5.
- **Todo dado mostra de onde veio e quando foi conferido.** A média de idade não existe em nenhuma fonte pública; o caminho realista é a produtora declarar. Governs R5, R12, R16.
- **Uma ação principal fixa no pé (padrão DICE), com o menor preço disponível.** O benchmark aponta a falha de mostrar preço de lote esgotado. Governs R9, R10.

### Requirements

**Do resultado ao detalhe**

- R1. O protótipo visual roda com dados fictícios e declara isso de forma discreta, como hoje.
- R2. Cada festa do resultado é tocável por inteiro e abre o detalhe; a lista mostra só o que serve para escolher (horário, média de idade, nome, bairro, preço a partir de, porquê).
- R3. A lista não oferece "Mandar pro grupo".

**O detalhe da festa, na ordem**

- R4. Topo: dia e horário de início, a hora em que a pista enche e o horário de fim, com a linha do tempo da festa contra a janela pedida.
- R5. Logo abaixo do horário, a média de idade com a origem do dado (informada pela produtora, estimada por edições anteriores ou por avaliações de quem foi) e a data em que foi conferida.
- R6. Cartaz ou foto, nome, produtora e casa, endereço e um link para abrir no mapa.
- R7. Preço do menor lote disponível e onde comprar; quando a entrada é na porta, isso é dito no lugar do link.
- R8. Links de origem: Instagram da festa ou da produtora e página do evento, cada um rotulado com o nome do serviço e abrindo fora do Finde.
- R9. Barra fixa no pé com "Mandar pro grupo" como ação principal e "Comprar ingresso" como secundária quando houver link.
- R10. Regras de entrada em bloco curto: idade mínima, documento, vestimenta e lista, quando existirem.
- R11. Som e lineup, quando houver; quando o lineup ainda não saiu, isso é dito.
- R12. Rodapé do detalhe com as fontes usadas e "conferido há X horas"; um campo ausente aparece como ausente, nunca inventado.

**O convite ao grupo**

- R13. O convite que o grupo recebe mostra o essencial do detalhe (R4, R5, R6, R7) e os mesmos links, e continua permitindo "tô dentro" e "não rola" sem conta.

**O que o motor precisa entregar (área vizinha, só contrato)**

- R14. Para cada festa, um registro normalizado com: identificador estável, nome, produtora, casa, endereço, data, início, pista cheia, fim, preço por lote com disponibilidade, link de compra, link do evento, Instagram, cartaz, lineup, estilos, idade mínima, média de idade com origem, fontes e data da coleta.
- R15. Fontes permitidas primeiro: envio pelas produtoras, APIs oficiais e páginas públicas cujos termos não proíbam coleta. Coleta automatizada de Instagram e Resident Advisor fica fora, porque os termos proíbem (`docs/pesquisa/2026-11-10-apps-de-eventos.md`, seção 3).
- R16. A média de idade só entra com origem declarada; sem origem, o campo fica vazio.
- R17. A base se atualiza várias vezes ao dia, e cada campo guarda quando foi conferido.

### Key Flow

1. Formulário de cinco perguntas, sem mudança.
2. Resultado com três festas. A pessoa toca numa.
3. Detalhe (R4 a R12). A pessoa abre o Instagram ou a página do evento, se quiser, e volta.
4. "Mandar pro grupo" na barra fixa: prévia do convite, nome, envio pelo WhatsApp.
5. O grupo abre o convite (R13) e responde.

Voltar do detalhe devolve à lista na mesma posição, com os ajustes da conversa preservados.

### Acceptance Examples

- AE1 (R7). Festa com entrada só na porta: o detalhe diz "Entrada na porta, R$ 40" e a barra fixa mostra só "Mandar pro grupo".
- AE2 (R5, R16). Festa sem média declarada: o detalhe mostra "Média de idade ainda não informada", e para quem filtrou por faixa a festa só aparece com esse aviso.
- AE3 (R7, R9). Lote mais barato esgotado: o preço exibido é o do próximo lote disponível, com "1º lote esgotado".
- AE4 (R11). Lineup não anunciado: o bloco de som mostra o estilo e "lineup ainda não divulgado".
- AE5 (R3, R9). Na lista não existe botão de envio; a única forma de mandar é pelo detalhe.

### Success Criteria

- Uma pessoa de 28 a 35 anos, numa entrevista com o protótipo, decide se mandaria a festa ao grupo sem sair do Finde, ou saindo só para o Instagram ou para a compra.
- A banca entende em 30 segundos de onde vem a média de idade.

### Scope Boundaries

**Fora desta peça**
- Compra de ingresso dentro do Finde.
- Conta de usuário, amigos e "quem vai" além do convite.
- Avaliação pós-festa pelo usuário (fica como uma das origens da média, R5, sem tela própria agora).
- O motor de coleta em si: arquitetura, banco, agendamento e classificação são do plano da área vizinha.

**Fora da identidade do produto**
- Revenda de ingresso e lista de espera própria.

### How This Work Fits Together

<!-- ce-section: work-relationships -->

- **Protótipo visual (esta peça).** Depende só dos dados fictícios, ampliados com os campos de R14.
- **Protótipo funcional, o motor de coleta, agregação e classificação (área vizinha, plano próprio).** Entrega os registros de R14 a R17. Hospedagem proposta: Fly, com banco no próprio servidor e tarefas agendadas várias vezes ao dia (decisão do grupo pendente).
- As duas frentes se encontram no formato do registro de festa (R14). Mudança nele é decidida nos dois planos.

### Dependencies / Assumptions

- Suposição: produtoras aceitariam declarar a faixa de idade do público em troca de visibilidade. Não testada; é a primeira pergunta das conversas com produtoras (`docs/disciplina.md`).
- Os achados da revisão adversarial de 10/11 (`docs/revisoes/`) seguem valendo para as telas que não mudam.

### Outstanding Questions

**Resolve Before Planning**
- Nenhuma.

**Deferred to Planning**
- Se o detalhe é uma tela própria com endereço (`/festa/:id`) ou uma folha sobre a lista.
- Como representar o cartaz nos dados fictícios sem usar imagem de festa real.
- Se o convite (R13) reaproveita o próprio detalhe ou uma versão reduzida.

### Sources / Research

- `docs/pesquisa/2026-11-10-apps-de-eventos.md`: benchmark de Sympla, Fever, Shotgun, DICE, RA, Partiful, Instagram e Google Maps (ordem da página de detalhe, ingresso, social, sinais de público, termos de coleta).
- `docs/conceito.md`, seção 4: a idade do público como o dado mais difícil.
- `docs/marca.md`: voz "horário primeiro".
- `docs/revisoes/2026-11-10-resumo.md`: revisão adversarial do v1.

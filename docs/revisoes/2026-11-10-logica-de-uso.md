# Revisão adversarial da lógica de uso do protótipo v1

10/11/2026. Protótipo em `prototipo/v1-festas/`, sem nenhuma alteração no código.

## Como foi feita

Servidor próprio na porta 48772, com os convites numa pasta de rascunho. Chrome 157 headless comandado por CDP a partir de scripts Node, emulando celular de 390 × 844 com toque, user agent de iPhone e áudio mudo. Cada amigo do convite abriu a página num contexto de navegador isolado, o equivalente a outro aparelho ou a uma aba anônima. As jornadas rodaram às 11h de uma terça-feira, então tudo foi visto no modo dia. O modo noite não foi testado.

Os scripts, os registros e as capturas estão em:

`/private/tmp/claude-501/-Users-caiogouveia-Documents-Dev/db5031a9-8197-4384-a228-255bd2752f77/scratchpad/rev-uso/`

- `j1.mjs` a `j7.mjs`: as jornadas.
- `j1.log.md`, `j234.log.md`, `j5.log.md`, `j6.log.md` e `j7.log.md`: o texto de cada tela, a fala do Finde e a lista depois de cada frase.
- `cap/`: as capturas. Abaixo, cada captura aparece só pelo nome do arquivo dentro de `cap/`.

Para registrar o convite antigo, uma linha com `criadoEm` de 14/10 foi acrescentada ao `planos.json` da pasta de rascunho, e o servidor foi reiniciado.

## O que funciona

- **Tempo até o resultado.** São seis toques do "Ver festas" às três festas, cerca de 9 s no script com as esperas. A proposta de valor aparece antes de 30 s: o pedido vira frase clicável e cada festa traz a hora e a média de idade à esquerda.
- **Navegação.** "Voltar" do app e do navegador preservam a resposta marcada. Avançar e voltar entre resultado e perguntas funciona. Um trecho do pedido reabre só aquela pergunta.
- **Convite.**
  - Abre em contexto isolado.
  - A lista se atualiza sozinha em até 4 s: a aba da Ju viu o "não rola" do Pedro.
  - Nome repetido pergunta "É você?" e a opção "vou pôr o sobrenome" devolve o foco ao campo.
  - `/p/abcdefgh`, `/p/ABC`, barra no fim e `?utm=` têm resposta certa.
- **Frase não entendida.** A frase volta ao campo com o foco nele e a lista não muda.
- **Voz.** Quando acerta, a voz é da marca: "Domingo, então. A segunda agradece."; "Mais cedo que 17h, só almoço. Fiquei no fim de tarde."; "Voltando até a meia-noite. Dança cedo, dorme bem."
- **Patrocinada.** Vem marcada, por último, com "Só aparece quando cabe no pedido."

## Achados, do mais ao menos grave

[P1] marca o que a banca perceberia em cinco minutos.

### 1. [P1] A conversa faz o contrário quando a negação vem depois ou é de dia ou lugar

- **Jornada 5.** Cada frase foi dita a partir da base da Bruna (sábado, 17h às 23h, 30 a 35, até R$ 80, house).
- **O que aconteceu:**
  - "funk não" respondeu "Funk, então." e trouxe funk (`j5.log.md`, nº 36).
  - "sexta não" respondeu "Sexta, então. Lista nova." (`j5-26.png`).
  - "Pinheiros não" acrescentou "perto de Pinheiros" ao pedido (`j5-27.png`).
  - "longe da augusta" virou "perto da Augusta".
- **Causa:**
  - A negação de estilo só é lida antes do termo: `NEGACAO` + estilo, em `nucleo/entender.js:82-89`.
  - Dia e lugar não têm negação nenhuma: `entender.js:167-169` e `entender.js:296-299`.
- **Correção:**
  - Aceitar a negação depois do termo (`(estilo)\s+(nao|nem pensar|fora)`).
  - Para dia, "<dia> não" tira o dia e pergunta qual, ou oferece os outros dois.
  - Para lugar, "longe de"/"<lugar> não" vira `evitarBairro`, um filtro novo. Enquanto isso não existir, a resposta deve ser "Ainda não sei tirar um bairro", e o pedido não pode mudar no sentido oposto.
  - Pôr um teste para cada uma dessas frases em `teste/entender.test.js`.

### 2. [P1] O pedido composto vira "só de graça" e esvazia a lista

- **Jornada 5.** A partir da base: "quero house mas sem pagar mais de 50 e perto da vila madalena".
- **O que aconteceu:**
  - O pedido virou "só de graça, house, perto da Vila Madalena".
  - O título ficou "Nada pro seu sábado, ainda."
  - A fala foi "Tem house, mas acima de R$ 0. Fixei o teto em R$ 0 e nada cabe." (`j5-18.png`)
- **Causa:** "sem pagar" casa com a regra de grátis antes de o número ser lido (`nucleo/entender.js:219`). A regra do teto (`entender.js:232`) só é tentada quando nenhuma das anteriores casou.
- **Correção:**
  - Procurar o número primeiro: `(sem pagar|nao pagar|pagar) mais de (\d+)` vira teto igual ao número.
  - "sem pagar" sozinho continua grátis.
  - Pôr um teste para a frase.

### 3. [P1] No pedido difícil, o Finde não diz "não tem"

- **Jornada 3.** Domingo, 22h às 3h, 36 ou mais, R$ 50, funk.
- **O que aconteceu:**
  - O título diz "Duas pro seu domingo." e a fala diz "Só duas cabem, mesmo abrindo o horário, subindo o teto e incluindo a faixa vizinha." (`j3-01-resultado.png`)
  - As duas festas violam todos os critérios. São house e pop/indie, nenhuma é funk. Custam R$ 70 e R$ 60, acima do teto de R$ 50. Uma esquenta às 20h, fora da janela. Têm médias de 35 e 33, abaixo do 36 ou mais.
  - O funk nunca é mencionado.
  - O teto novo não é dito.
  - O "R$ 20 acima do teto" é cortado do porquê, que mostra no máximo dois motivos.
  - Na sexta, com o mesmo pedido, sai "Três pra sua sexta" e "trouxe som parecido", com samba e house para quem pediu funk (`j3-06-sexta-noite-36.png`).
- **Causa:**
  - Quando sobram menos de três, o aviso usa o ramo `total < 3` (`nucleo/motor.js:312-315`), que ignora o estilo que faltou.
  - `impedimentoDoEstilo` (`motor.js:430-448`) só é chamado na conversa (`servidor.js:313`), nunca no primeiro resultado.
  - `motivos` corta em dois (`motor.js:252`).
- **Correção:**
  - Quando o resultado só existe porque três ou mais critérios foram afrouxados, o título passa a ser "Nada do jeito que você pediu" e a fala diz o que não há, com o impedimento do estilo. Por exemplo: "Funk no domingo só tem às 17h, com gente de 24."
  - As festas aparecem embaixo, como "o mais perto disso".
  - Toda festa fora do teto mostra o preço acima do teto, mesmo que outro motivo saia da lista.

### 4. [P1] Quem pede 36 ou mais recebe festa de média 29 sem aviso

- **Jornada 3b e jornada 3, depois de "e no sábado?".**
- **O que aconteceu:**
  - Na sexta, com 36 ou mais, entrou "Pop Arquivo · média 29", com o porquê "pista cheia à meia-noite · R$ 20 acima do teto" (`j3-06-sexta-noite-36.png`).
  - No sábado, entraram "Noite Pop 2000 · média 30" e "Funk ao Entardecer · média 31" (`j234.log.md`).
  - Nenhum porquê fala de idade. É o filtro que define o produto.
- **Causa:**
  - O afrouxamento de idade aceita qualquer festa com uma faixa em comum com as vizinhas (`motor.js:153` e `286`). Pop Arquivo declara `25-29/30-35`, então passa para quem pediu 36 ou mais.
  - O porquê só fala da idade quando a média está a até 3 anos da faixa (`motor.js:237`). Acima disso, cala.
- **Correção:**
  - Afrouxar pela média (`|mediaIdade - limite da faixa| <= 3`), e não pela faixa declarada.
  - Quando a média estiver mais longe, o porquê deve dizer, como primeiro motivo, "média 29, mais nova que você pediu".

### 5. [P1] A média de idade aparece como fato exato, sem origem

- **Todas as jornadas.**
- **O que aconteceu:** "média 30", "MÉDIA 31 ANOS" na boas-vindas, na lista, no convite e na mensagem do WhatsApp. São números inteiros, sem fonte, sem "estimada" e sem quantas pessoas responderam (`j1-01-boas-vindas.png`, `j1-12-convite-pronto.png`).
- **Por que importa:** o próprio `docs/conceito.md` (seção 4) diz que esse dado quase nunca está na divulgação e que, sem ele, "o filtro principal do produto vira chute". A banca vai perguntar de onde vem o número. Hoje a tela responde com uma precisão que o produto não teria.
- **Causa:** `linhaDaFesta` em `nucleo/catalogo.js:167-169` e `mediaIdade` em `dados/festas.json`.
- **Correção:**
  - Trocar por faixa com origem: "público 30–35 · declarado pela produtora" ou "público 30–35 · 42 avaliações".
  - Em pelo menos uma festa fictícia, mostrar o estado honesto "público ainda sem avaliação".
  - É o modo mais barato de mostrar à banca que a hipótese foi pensada.

### 6. [P1] O porquê não sustenta a recomendação

- **Jornada 1.**
- **O que aconteceu:**
  - A primeira festa da Bruna tem como único motivo "pista cheia às 19h" (`j1-08-resultado-cheio.png`).
  - A patrocinada tem o mesmo motivo da segunda.
  - Nenhum porquê cita idade, hora de acabar ou preço quando o preço é igual ao teto.
  - O conceito promete o porquê como "prova de assertividade" e dá o exemplo "público de 30 a 35 · abre às 22h · R$ 60".
- **Causa:** `motivos` (`motor.js:233-253`) evita de propósito repetir o pedido. A pessoa precisa reconstruir sozinha por que a festa cabe.
- **Correção:**
  - Primeiro motivo fixo e afirmativo sobre a idade: "gente da sua faixa (média 30)".
  - Depois, o que distingue: a hora de acabar ("acaba às 23h, dá pra voltar cedo") ou o preço.
  - Na patrocinada, o porquê deve dizer por que ela cabe, não só repetir a hora da pista.

### 7. [P1] As frases mais naturais desse público não são entendidas

- **Jornadas 2 e 5.**
- **O que aconteceu:** responderam "Não peguei essa. Tente “mais barato”, “mais cedo”, “sem funk” ou o nome de um bairro.":
  - "tem com gente da minha idade?";
  - "chegar às 10 da noite";
  - "começa às 9";
  - "depois do jantar";
  - "qualquer coisa", "tanto faz", "me surpreende" e "sei lá, escolhe você";
  - "quero ir sozinha", "vou com meu namorado";
  - "isso é seguro?", "tem estacionamento?";
  - "volto de uber, então tanto faz";
  - "mai barto", "bora num pagodinho" e "😍🔥".

  O "sem funk" da sugestão aparece até para quem nunca falou de funk (`j5-14.png`, `j2-05-qualquer-coisa.png`).
- **Causa:**
  - Hora em formato de 12 h ou "da noite" não é lida: `janelaDaHora(9)` devolve `undefined` (`entender.js:110-115`).
  - Não há regras para indiferença, para pergunta nem para companhia.
  - O texto de recusa é fixo (`nucleo/conversa.js:157`).
- **Correção:**
  - Hora de 1 a 11 com "da noite" ou sem contexto vira +12.
  - "tanto faz/qualquer coisa/me surpreende" vira "outras" com uma fala própria ("Então vou pela pista que enche antes.").
  - Pergunta que o Finde não responde ganha resposta honesta e curta, como "Segurança e estacionamento eu ainda não sei. Sei dia, horário, preço, idade, bairro e som.", no mesmo molde de `FORA_DO_ALCANCE`.
  - "da minha idade" mantém a faixa e confirma.
  - A sugestão da recusa usa atalhos que façam sentido no pedido atual.

### 8. [P1] Recarregar apaga tudo, e voltar depois mostra um erro cru

- **Jornada 4.**
- **O que aconteceu:**
  - Recarregar no resultado ou no meio da conversa volta para a boas-vindas e perde pedido, lista, conversa e texto digitado (`j4-11-reload-resultado.png`, `j4-14-reload-na-conversa.png`).
  - O botão Voltar do navegador leva então à pergunta 5, sem respostas.
  - Tocar "Ver festas de qualquer som" ali mostra "Faltam respostas do formulário: dia, janela, faixa, teto." (`j4-13-submit-pos-reload.png`).
- **Causa:**
  - O estado vive só em memória (`publico/app.js:25-38`).
  - `iniciar` troca a entrada do histórico por `inicio` (`app.js:586`), mas as entradas antigas continuam.
  - O guarda do `popstate` só confere `estado.form` (`app.js:55`).
  - A mensagem é a do servidor (`servidor.js:195`).
- **Correção:**
  - Guardar `criterios` e `respostas` em `sessionStorage`, ou na query (`?d=sab&j=fim-de-tarde&f=30-35&t=80&e=house`), e reabrir o resultado ao carregar.
  - No `popstate`, voltar ao início quando faltar resposta anterior ao passo.
  - Traduzir o 400 em "Faltou responder umas perguntas. Vamos do começo?", com o botão para o começo.

### 9. [P1] Uma frase longa troca o dia pelo dia errado e responde com confiança

- **Jornada 5, nº 24.** A frase dita foi "então, a gente é um grupo de umas 6 pessoas, todo mundo na faixa dos 30, queremos chegar umas 20h, dançar um pouco de música brasileira e estar em casa antes da 1h porque domingo tem almoço de família".
- **O que aconteceu:**
  - O dia virou domingo, por causa do almoço.
  - As 20h foram ignoradas e a janela continuou das 17h.
  - A música brasileira foi ignorada e o pedido continuou house.
  - A resposta foi "Domingo, então. A segunda agradece. Voltando até a 1h. Já é gente de 30 a 35. Lista nova." (`j5-24.png`)
- **Causa:**
  - Qualquer menção a um dia muda o dia (`entender.js:167-169`).
  - O horário de chegar só é lido quando não há hora de voltar (`entender.js:207`).
  - "música brasileira" não está em `PALAVRAS_DE_ESTILO` (`entender.js:74-81`).
- **Correção:**
  - Dia só muda com verbo de ir/sair, ou quando a frase é curta.
  - Ler chegada e volta na mesma frase.
  - Incluir "brasileira/MPB/forró" no estilo.
  - Quando a frase tem mais de 20 palavras, a resposta diz o que pegou e o que não pegou: "Peguei: volta até a 1h. Não peguei: o horário de chegar."

### 10. [P2] "A que horas chegar e voltar?" não filtra a volta

- **Jornada 1.**
- **O que aconteceu:** Bruna escolheu "17h às 23h". Duas das três festas acabam à 1h (Sábado Groove e Noite Aurora). Só saíram quando ela disse "quero voltar pra casa até meia-noite" (`j1-10-ajuste2-cheio.png`).
- **Causa:** o filtro de janela exige só que a festa dure 2 h depois da chegada (`motor.js:131`). A volta só existe como `fimMax`, vindo da conversa.
- **Correção:** uma das duas.
  - Trocar o título para "A que horas chegar?".
  - Usar o fim da janela como volta suave: pontuar melhor quem acaba até o fim da janela e dizer "acaba à 1h" no porquê quando passa.

### 11. [P2] "O som mais perto do seu" é dito quando não há som parecido

- **Jornadas 5 e 3b.**
- **O que aconteceu:**
  - Com "tô liso", a fala foi "Não achei house nesse pedido; entraram as mais perto do seu som.", e entraram funk, MPB e rock (`j5-15.png`).
  - Para funk na sexta, a fala foi "trouxe som parecido", com samba e house.
  - A tabela de afinidade (`catalogo.js:49-56`) dá zero para MPB e rock em relação a house, e para samba em relação a funk.
- **Causa:** a lista se completa pela ordem geral (`motor.js:215-216`), sem piso de afinidade. Os textos de `motor.js:318-322` afirmam a semelhança assim mesmo.
- **Correção:**
  - Completar só com afinidade maior que zero.
  - Quando não houver, dizer "Sem house nesse preço. Pus o que cabe, de outros sons."

### 12. [P2] Os atalhos não leem o pedido

- **Jornada 3.**
- **O que aconteceu:**
  - "sem funk" é oferecido a quem acabou de pedir funk (`j3-01-resultado.png`).
  - "mais perto de Pinheiros" é sempre o primeiro atalho.
  - "mais cedo" aparece numa lista que já está fora da janela.
- **Causa:** `app.js:366` só confere `evitarEstilos`.
- **Correção:**
  - Não oferecer "sem X" quando X está em `estilos`.
  - No pedido difícil, oferecer os atalhos que resolvem: outro dia, horário anterior ou outra faixa.

### 13. [P2] Pedido contraditório aplicado pela metade

- **Jornada 5, nº 41 e nº 19.**
- **O que aconteceu:**
  - "quero dançar até amanhecer mas voltar cedo" respondeu "Voltando até a meia-noite. Dança cedo, dorme bem. Fui pro começo da noite, das 19h à 1h."
  - A lista trouxe duas festas das 17h (`j5-41.png`).
  - "quero mais cedo e mais tarde" aplicou só o "mais cedo", sem comentar.
- **Causa:** as regras de volta e de "mais tarde" rodam em sequência sem conferir conflito (`entender.js:176-200`).
- **Correção:** detectar o par contraditório e perguntar, na voz da marca: "Até amanhecer ou voltar cedo? Os dois eu não consigo."

### 14. [P2] O convite não diz a data, onde é nem como comprar, e não vence

- **Jornadas 1 e 7.**
- **O que aconteceu:**
  - O convite diz "Bora no sábado?" e mostra "terraço em Pinheiros".
  - Não diz qual sábado, o endereço, nem o link do ingresso (`j1-13-bruna-no-convite.png`).
  - Um convite criado em 14/10 abre em 10/11 como se fosse do próximo sábado e aceita respostas (`j7-01-convite-de-14-out.png`).
- **Causa:**
  - As festas não têm data, só dia da semana (`dados/festas.json`).
  - A página do convite mostra só `criadoEm` (`publico/plano.js:166-175`).
  - Não há validade em `nucleo/planos.js`.
- **Correção:**
  - Gravar a data da festa no convite: "sáb, 14 nov".
  - Depois dela, mostrar "Essa já foi." e fechar as respostas.
  - Mesmo fictícios, um endereço e um botão "ingresso" fecham o ciclo de decisão do grupo.

### 15. [P2] Qualquer um troca a resposta de outra pessoa

- **Jornada 7.**
- **O que aconteceu:** num contexto novo, alguém digitou "ju", tocou "Não rola" e depois "Sou eu". A Ju saiu do "tô dentro" e foi para o "não rola" (`j7-02-outra-pessoa-vira-a-ju.png` e o estado em `j7.log.md`).
- **Causa:** "Sou eu" reenvia com `confirmar: true` (`plano.js:248-249`), e o servidor substitui sem prova de identidade (`planos.js:90-101`).
- **Correção:**
  - Devolver um token por resposta, guardado no `localStorage` de quem respondeu.
  - Trocar a resposta só com o token. Sem ele, entrar como "Ju (2)".
  - Num protótipo de grupo de amigos, é aceitável deixar como está, desde que a equipe saiba responder se a banca perguntar.

### 16. [P2] A resposta do Finde pode não ser lida pelo leitor de tela

- **Jornada 6.**
- **O que aconteceu:**
  - Depois de ajustar pelo teclado, o foco cai no `body`.
  - O nó com `aria-live` é outro: o script marcou o nó antes do ajuste e conferiu depois.
  - A árvore de acessibilidade do resultado (`Accessibility.getFullAXTree`) não expõe nenhuma região viva. A do convite expõe o `status`.
- **Causa:** `ajustar` redesenha a tela inteira (`app.js:447`). A região criada em `app.js:381` nasce já com o texto, e região viva recém-inserida costuma não ser anunciada. O campo é recriado e só recebe foco quando a frase não foi entendida (`app.js:450-456`).
- **Correção:**
  - Manter `#conversa` e `#campo` fixos e atualizar só o conteúdo da conversa e da lista.
  - Devolver o foco ao campo depois de cada ajuste.
  - Dar `role="status"` à conversa.

### 17. [P2] "perto do metrô" responde sobre Pinheiros

- **Jornada 5, nº 4, depois de um pedido com Pinheiros.**
- **O que aconteceu:** a resposta foi "Duas ficam a até 5 min de Pinheiros. A lista fica como estava." Ela parece responder ao metrô e não responde.
- **Causa:** "perto" sem lugar repete o bairro anterior (`entender.js:303-304`).
- **Correção:** quando a frase cita metrô, ônibus ou estacionamento, responder "Metrô eu ainda não sei."

### 18. [P2] Uma das três vagas é paga em quase todo pedido comum

- **Jornadas 1, 2 e 4.**
- **O que aconteceu:** Noite Aurora ou Clube Varanda aparecem em três dos quatro resultados de base. Com três vagas, isso dá 33% de anúncio. O conceito diz que "o ranking orgânico não se vende". A banca pode ler como a mesma coisa.
- **Causa:** `motor.js:341-349`. A patrocinada entra quando pontua tanto quanto a terceira editorial, e as duas fictícias foram desenhadas para caber no pedido típico.
- **Correção:**
  - Mostrar a patrocinada fora da lista de três, como "também cabe", abaixo da régua.
  - Ou limitá-la a pedidos em que ela seja a melhor de fato.

### 19. [P2] "Mais barato" repetido trava numa frase só

- **Jornada 5, bloco C.**
- **O que aconteceu:**
  - De R$ 80, a sequência foi R$ 50, R$ 30, R$ 20, R$ 0, R$ 0, R$ 0.
  - A partir de R$ 30, a mesma fala se repetiu: "Fixei o teto em R$ 30 e nada cabe. Quer subir pra R$ 50?" (`j5-47.png` a `j5-49.png`).
  - A piada "Mais barato que de graça, só ficando em casa." existe e nunca aparece.
- **Causa:**
  - `sobreTeto` é suprimido quando a oferta de teto existe (`conversa.js:93`).
  - Os degraus descem abaixo do que a base tem (`catalogo.js:38`).
- **Correção:**
  - Parar no degrau mais barato que ainda tem festa e dizer "R$ 35 é o mais barato do sábado."
  - Deixar a piada para o caso de já estar em zero.

### 20. [P2] Avisos longos e sem o valor novo

- **Jornada 3.**
- **O que aconteceu:**
  - "Pra completar a lista, abri o horário em uma hora, subi o teto pra R$ 80 e incluí a faixa vizinha e trouxe som parecido." tem dois "e" seguidos.
  - "subindo o teto" (`j3-01-resultado.png`) não diz para quanto.
- **Causa:** `motor.js:304-322`.
- **Correção:**
  - Juntar as partes com `juntar` e incluir o som entre elas.
  - No caso `total < 3`, dizer o valor: "subindo o teto pra R$ 80".

### 21. [P3] Pelo teclado, sair do grupo de rádios leva ao vazio

- **Jornada 6.**
- **O que aconteceu:** sem nada marcado, Tab a partir do rádio vai para o `body`. O "Continuar" fica com `display: none` quando o foco sai (`j6-02-tab-sai-do-grupo.png`). Setas e Enter funcionam, e o foco visível existe nas opções (contorno no rótulo).
- **Causa:** `publico/app.css:398-400`.
- **Correção:** deixar o botão no fluxo de foco, desabilitado e visível, enquanto não houver resposta.

### 22. [P3] Nome acessível colado nas opções de horário

- **Jornada 6.** O leitor ouve "17h às 23hfim de tarde".
- **Causa:** os dois `span` sem separador (`app.js:201-206`).
- **Correção:** um espaço ou ", " visualmente oculto entre `opcao-nome` e `opcao-detalhe`.

### 23. [P3] O campo do nome fica antes do foco na tela de mandar

- **Jornada 6.** O foco entra no título "Bora no sábado?". Tab vai direto para "Criar o convite" e pula o nome.
- **Causa:** o campo está em `de-quem`, antes do `h1` (`app.js:505-509`), e o foco vai para o `h1` (`app.js:72-73`).
- **Correção:** focar o campo do nome ao abrir a tela, ou movê-lo para junto do botão.

### 24. [P3] Enviar o campo vazio não dá retorno

- **Jornada 5, nº 11 e 12.** Enter com o campo vazio ou só com espaços não faz nada, nem uma linha de ajuda.
- **Causa:** `app.js:397-401`.
- **Correção:** focar o campo e mostrar "Escreve o que quer mudar. Tipo: mais cedo."

### 25. [P3] Voltar depois de criar o convite permite criar outro igual

- **Jornada 7.**
- **O que aconteceu:** "Voltar" e "Mandar pro grupo" na mesma festa abre a tela de criar de novo, sem o link anterior. São dois convites para a mesma festa, e o grupo pode receber links diferentes (`j7-04-mandar-de-novo.png`).
- **Causa:** `app.js:336-340` zera `estado.convite`.
- **Correção:** lembrar o convite por festa durante a sessão e reabrir o já criado.

### 26. [P3] Detalhes de texto

- "CONVITE DE  BRUNA" com espaço duplo na tela de mandar (`j1-12-convite-pronto.png`), por causa do `gap` e do nó de texto em `app.js:508`.
- "Ninguém ainda. Seja o primeiro." no masculino (`plano.js:204`). Melhor: "Ninguém ainda."
- "17h às 23h · fim de tarde": 23h não é fim de tarde.
- A régua não tem legenda nem liga cada traço a uma festa (`app.js:307-318`).

## A banca de empreendedorismo

**Proposta de valor em menos de 30 segundos.** Sim. A boas-vindas já mostra horário e média de idade numa festa ("SEX · 17H00 · BELA VISTA · MÉDIA 31 ANOS"), e seis toques levam às três festas. O preço aparece só na quarta pergunta, mas aparece. O pedido em frase no topo do resultado é a melhor prova do produto, porque mostra os quatro filtros juntos.

**O porquê.** Não convence como está (achado 6). Diz "pista cheia às 19h" e deixa idade, volta e preço para a pessoa conferir sozinha. Quando o resultado é ruim, como no pedido difícil, o porquê esconde justamente o que não cabe (achados 3 e 4).

**O que parece truque:**
- **Idade.** A média de idade exata, sem origem (achado 5), é o que um avaliador cético ataca primeiro, e o conceito já sabe disso.
- **Patrocinada.** A patrocinada em um de três lugares (achado 18) parece venda de ranking, por mais bem marcada que esteja.
- **Conversa.** A conversa passa por inteligência e é regra de palavra. Basta uma negação depois do termo ("funk não") para virar o contrário (achado 1). Na frente da banca, o grupo deve usar os atalhos, ou deixar dito que `entender.js` é o ponto de troca por um modelo.

**O que falta para alguém dizer "eu usaria isso no sábado":**
- festas reais de um fim de semana, com data;
- endereço e ingresso no convite;
- a origem da idade do público, mesmo que seja "declarada pela produtora";
- o "não tem" dito com franqueza;
- entender "tem com gente da minha idade?", que é a pergunta do próprio público.

## O que não foi testado

- **Modo noite.** O teste rodou às 11h.
- **Leitor de tela.** O VoiceOver não foi rodado. A avaliação vem da árvore de acessibilidade e do foco.
- **Envio real pelo WhatsApp.** Foi conferido só o `href` do `wa.me`, que leva o link `localhost`.
- **Acesso por celular na rede.**

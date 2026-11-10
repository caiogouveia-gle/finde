# Validação da lógica de uso do protótipo v1

10/11/2026, segunda rodada, adversarial. Protótipo em `prototipo/v1-festas/`, sem nenhuma alteração no código. Confere os 26 achados de `2026-11-10-logica-de-uso.md` depois da fusão das frentes de lógica, interação e CSS.

## Como foi feita

Servidor próprio na porta 48802, com os convites numa pasta de rascunho. Chrome 157 headless por CDP, celular de 390 × 844 com toque, user agent de iPhone, `--mute-audio` e stub mudo de `AudioContext`. Cada amigo do convite abriu a página num contexto isolado. Modo dia (as jornadas rodaram entre 12h e 13h). Os 145 testes de `node --test teste/` passam.

Scripts, registros e capturas:

`/private/tmp/claude-501/-Users-caiogouveia-Documents-Dev/db5031a9-8197-4384-a228-255bd2752f77/scratchpad/val-uso/`

- `j1.mjs`, `j234.mjs`, `j5.mjs`, `j6.mjs`, `j7.mjs`: as jornadas. `util.mjs` procura "undefined", "null", "NaN" e texto vazio em cada tela.
- `j1.log.md`, `j234.log.md`, `j5-completo.log.md`, `j6.log.md`, `j7.log.md`: o que cada tela mostrou.
- `replay.mjs`: repete as 68 frases direto na API.
- `cap/`: as capturas.

**O código mudou durante a rodada.** Às 12h28, `app.js`, `comum.js`, `conversa.js` e `index.html` foram regravados por outra frente. O servidor carrega `nucleo/` uma vez só, então parte das frases rodou com o `conversa.js` anterior. O servidor foi reiniciado e `replay.mjs` repetiu as 68 frases no código novo: 67 respostas iguais. A única diferença foi a nº 35, que perdeu o "Dança cedo, dorme bem.". Os achados abaixo valem para o código das 12h28.

## Achados anteriores

| Nº | Achado | Situação | O que se vê agora |
|---|---|---|---|
| 1 | Negação depois do termo, de dia e de lugar | Parcial | "funk não", "sexta não", "sábado não", "Pinheiros não", "nada de rooftop" e "longe da augusta" funcionam. Duas negações novas ainda invertem o pedido (achado novo 3). |
| 2 | Pedido composto vira "só de graça" | Resolvido | "sem pagar mais de 50" vira teto de R$ 50. |
| 3 | O pedido difícil não diz "não tem" | Resolvido | "Nada do jeito que você pediu. Funk no domingo, só às 17h, com média 24." Cada festa lista tudo o que fura, com o valor: "Fora do seu som; R$ 20 acima do teto; enche às 20h, antes da sua hora." (`j3-01-resultado.png`). |
| 4 | 36 ou mais recebe média 29 sem aviso | Resolvido | "Média 33, abaixo da sua faixa" vem como aviso da festa. |
| 5 | Média sem origem | Resolvido | A origem aparece na lista ("a partir de 124 avaliações de quem foi"), na boas-vindas, no convite e na mensagem do WhatsApp. Resta o `og:title` do convite ("· média 30") sem origem, além da média lida duas vezes pelo leitor de tela (achado novo 9). |
| 6 | O porquê não sustenta a recomendação | Parcial | O que fura vem primeiro. Mas em 1.008 pedidos simulados, 103 das 2.233 festas mostradas (4,6%) não têm porquê, e todas são festas que cabem no pedido. Entre elas está a única festa que cabe para a Bruna. A patrocinada sai sem porquê em 12 das 30 vezes. Nenhum porquê afirma a idade. |
| 7 | Frases naturais não entendidas | Parcial | Agora entende "da minha idade", "às 10 da noite", "começa às 9", "depois do jantar", "tanto faz", segurança, estacionamento e metrô. Continua sem pegar erro de digitação ("mas cedo", "pinheros", "sabdo", "hause"), e quatro perguntas fora do escopo recebem a resposta errada (achado novo 6). |
| 8 | Recarregar apaga tudo | Resolvido | Recarregar no resultado e no meio do formulário volta à mesma tela. Voltar depois disso leva ao início. Só o texto digitado e não enviado se perde. |
| 9 | Frase longa troca o dia | Resolvido | A frase do grupo de 6 vira das 19h à 1h, MPB e volta à 1h, e o Finde pergunta "Muda pro domingo?" em vez de trocar. A fala não diz que pôs MPB nem que mudou o horário. |
| 10 | A volta não filtra | Resolvido | A festa precisa acabar até o fim da janela. Esse filtro causou o achado novo 2. |
| 11 | "Som parecido" quando não há | Resolvido | Sem afinidade, o texto diz "com outros sons". |
| 12 | Atalhos não leem o pedido | Resolvido | "sem funk" não aparece para quem pediu funk. No pedido difícil, os atalhos são outro dia, horário, teto e qualquer som. "mais perto de Pinheiros" continua sempre presente. |
| 13 | Contraditório aplicado pela metade | Resolvido | "Até amanhecer ou voltar cedo? Os dois eu não consigo." A lista não muda. |
| 14 | Convite sem data, lugar e validade | Parcial | Mostra "SÁB, 14 NOV". O convite vencido mostra "Essa já foi. O convite não aceita mais resposta.", e o servidor devolve 410. Ainda faltam endereço e ingresso. Convites gravados antes da mudança, sem `data`, continuam abertos para sempre. |
| 15 | Qualquer um troca a resposta de outra pessoa | Não resolvido | Em outro aparelho, "ju" + "Sou eu" tirou a Ju do "tô dentro". O nome também passou a ser gravado como "ju". Aceitável num protótipo, desde que a equipe saiba responder. |
| 16 | Resposta não lida pelo leitor de tela | Resolvido | O campo continua sendo o mesmo nó, o foco volta a ele depois do ajuste e `#anuncio` (`role=status`) recebe a fala inteira. |
| 17 | "perto do metrô" responde sobre Pinheiros | Resolvido | "Metrô e estacionamento eu ainda não sei." |
| 18 | Patrocinada em um de três lugares | Parcial | Nunca vem em primeiro (0 em 540 pedidos simulados) e aparece em 24 deles (4%). Mas continua dentro das três vagas no pedido típico (sábado, 19h à 1h, 30 a 35, até R$ 80). |
| 19 | "Mais barato" trava | Parcial | Desce a R$ 50 e para em "R$ 35 é o mais barato no sábado nesse pedido.". O "mais barato" seguinte desce a R$ 30, esvazia a lista e oferece "Até R$ 50, sim.", pulando o R$ 35 (`j5-61.png`). |
| 20 | Avisos longos e sem valor | Resolvido | "subindo o teto pra R$ 80". |
| 21 | Tab sai do grupo de rádios para o vazio | Não resolvido | Sem nada marcado, o Tab depois do rádio vai para o `body`. O "Continuar" fica `disabled` e não recebe foco. |
| 22 | Nome acessível colado | Resolvido | "17h às 23h , fim de tarde". Sobra um espaço antes da vírgula. |
| 23 | Campo do nome fora do foco | Resolvido | O foco abre no campo do nome. |
| 24 | Enviar vazio sem retorno | Resolvido | "Escreve o que quer mudar. Tipo: mais cedo." |
| 25 | Voltar e criar outro convite igual | Resolvido | Voltar e mandar de novo reabre o mesmo link. |
| 26 | Detalhes de texto | Parcial | "Ninguém." no lugar de "Seja o primeiro" e a legenda da régua estão resolvidos. "17h às 23h · fim de tarde" continua igual. |

## As frases

Base A: sábado, 17h às 23h, 30 a 35, até R$ 80, house. Lista da base: Disco ao Pôr do Sol (house), Funk ao Entardecer (som parecido), Terraço MPB (fora do som). Base B: a mesma, das 19h à 1h. Cada frase parte da base, menos as encadeadas (o "sim" e o "mais barato" repetido). Captura de cada uma: `cap/j5-NN.png`.

| Nº | Frase | O que o Finde fez | |
|---|---|---|---|
| 1 | funk não | Tirou funk. "Sem funk." | certo |
| 2 | menos funk | Tirou funk. | certo |
| 3 | sexta não | "Sexta já está fora." Lista igual. | certo |
| 4 | sábado não | "Sem sábado, então. Fui pro domingo." | certo |
| 5 | Pinheiros não | Longe de Pinheiros. Diz "House no sábado, só acima de R$ 80.", e é falso: há house a R$ 60 e R$ 70 | errado |
| 6 | nada de rooftop | "Sem rooftop." | certo |
| 7 | não quero terraço | Sem terraço. "Nada do jeito que você pediu.", e a Matinê Eletrônica entra com "Acaba à meia-noite, depois da sua volta." | certo |
| 8 | longe da augusta | "Longe da Bela Vista, então." | certo |
| 9 | house não, quero samba | O pedido virou "sem house nem MPB" | errado |
| 10 | nem pensar em house | "House, então." | errado |
| 11 | quero house mas sem pagar mais de 50 e perto da vila madalena | Até R$ 50, house, perto da Vila Madalena. "House no sábado, só acima de R$ 50." | certo |
| 12 | quero mais cedo e mais tarde | "Mais cedo ou mais tarde? Os dois eu não consigo." | certo |
| 13 | quero dançar até amanhecer mas voltar cedo | "Até amanhecer ou voltar cedo? Os dois eu não consigo." | certo |
| 14 | mais barato e mais perto de pinheiros | Até R$ 50 e perto de Pinheiros. "Nada do jeito que você pediu." | certo |
| 15 | sem funk e sem pop, só house até 23h | "Sem pop 2000 nem funk." | certo |
| 16 | quero samba e funk | "MPB ou funk, então." Três que casam. | certo |
| 17 | isso é seguro? | "Segurança eu ainda não sei dizer." | certo |
| 18 | tem estacionamento? | "Metrô e estacionamento eu ainda não sei." | certo |
| 19 | perto do metrô | Igual à anterior | certo |
| 20 | tem open bar? | "Tipo de casa eu só sei tirar, tipo “nada de rooftop”." | errado |
| 21 | qual o endereço? | "Não peguei." | errado |
| 22 | vai chover no sábado? | "Já estamos no sábado." | errado |
| 23 | quanto sai o uber? | "Metrô e estacionamento eu ainda não sei." | errado |
| 24 | bora num pagodinho | "MPB, então." | certo |
| 25 | tô liso | Até R$ 50. "House no sábado, só acima de R$ 50." | certo |
| 26 | sextou | "Sexta, então." | certo |
| 27 | quero um rolê de boa | "Não peguei." | aceitável |
| 28 | uma balada top | "Não peguei." | aceitável |
| 29 | mai barto | Até R$ 50 (a grafia está escrita na regra) | certo |
| 30 | mas cedo | "Não peguei." | errado |
| 31 | pinheros | "Não peguei." | errado |
| 32 | sabdo de noite | "Não peguei." | errado |
| 33 | hause | "Não peguei." | errado |
| 34 | frase longa do grupo de 6 com "domingo tem almoço" | 19h à 1h, MPB, volta à 1h. "Voltando até a 1h. Já é gente de 30 a 35. Muda pro domingo?" A fala não diz que pôs MPB nem que mudou o horário. | certo |
| 35 | frase longa das amigas de 32, samba, até 60, antes da meia-noite | Até R$ 60, MPB, volta à meia-noite | certo |
| 36 | tanto faz | "Então vai na primeira: é a que enche antes." | certo |
| 37 | às 10 da noite | "Noite, das 22h às 3h." | certo |
| 38 | chegar às 10 da noite | Igual à anterior | certo |
| 39 | começa às 9 | "Começo da noite, das 19h à 1h." | certo |
| 40 | depois do jantar | Noite | certo |
| 41 | da minha idade | "Sim: todas com média de 30 a 35." (é verdade) | certo |
| 42 | tem com gente da minha idade? | Igual à anterior | certo |
| 43 | gente de 40 | 36 ou mais. "Nada do jeito que você pediu." | certo |
| 44 | mais velha | Igual à anterior | certo |
| 45 | um lugar com gente de 30 e poucos | "Já é gente de 30 a 35." | certo |
| 46 | domingo tem almoço | "Muda pro domingo?" A lista não muda e aparece o botão "Mudar pro domingo". | certo |
| 47 | sim (depois da 46) | "Domingo, então. A segunda agradece." | certo |
| 48 | quero mais cedo e mais tarde | Pergunta | certo |
| 49 | sim (depois da 48) | "Sim pra quê?" Nada muda. | certo |
| 50 | grátis | "Até R$ 0, nada cabe. Até R$ 50, sim." | voz errada |
| 51 | sim (depois da 50) | Até R$ 50, e aí "Nada do jeito que você pediu. House no sábado, só acima de R$ 50." | errado |
| 52 | e no domingo? | "Domingo, então. A segunda agradece." | certo |
| 53 | quero voltar às 2 | "Voltando até as 2h." O pedido diz "das 17h às 23h… voltando até as 2h" e a lista não muda. | errado |
| 54 | volto de uber, então tanto faz | "Metrô e estacionamento eu ainda não sei." | errado |
| 55 | pode ser mais tarde | "Fui pro começo da noite, das 19h à 1h." | certo |
| 56 | 😍🔥 | "Não peguei." | certo |
| 57 | (vazio) | "Escreve o que quer mudar. Tipo: mais cedo." | certo |
| 58 | funk | "Funk, então." | certo |
| 59 | mais barato (base B) | Até R$ 50 | certo |
| 60 | mais barato | "R$ 35 é o mais barato no sábado nesse pedido." | certo |
| 61 | mais barato | Até R$ 30 e lista vazia. "Até R$ 30, nada cabe. Até R$ 50, sim." | errado |
| 62 | mais barato | Até R$ 20, lista vazia | errado |
| 63 | mais barato | Só de graça, "Até R$ 0, nada cabe." | errado |
| 64 | sem house (base B) | "Sem house. Lista nova." | certo |
| 65 | house de novo | "House, então. Lista nova." | certo |
| 66 | outro estilo | "Troquei a trilha." | certo |
| 67 | nada de rooftop (base B) | Tirou a patrocinada (rooftop) e entrou a Matinê Eletrônica | certo |
| 68 | menos funk (base B) | "Sem funk. A lista fica como estava." | certo |

São 68 frases: 48 certas, 2 aceitáveis e 18 erradas ou com voz errada. Quando acerta, a voz é a da marca: curta, com o horário primeiro, e humor só onde cabe ("A segunda agradece.", "Os dois eu não consigo."). Fora disso, ela erra em "Até R$ 0" e no "Nada do jeito que você pediu." repetido logo abaixo do título igual.

## Honestidade do resultado

- **Aviso quando fura.** Sim, festa por festa, com o valor. O "Nada do jeito que você pediu" aparece quando nenhuma cabe. Exceções: o impedimento falso (achado novo 4) e a oferta que não cumpre (achado novo 5).
- **Média com origem.** Sim, em todas as telas.
- **Ordem por horário.** Sim, nos 1.008 pedidos simulados e em todas as telas vistas.
- **Patrocinada.** Nunca vem em primeiro e só entra quando cabe sem afrouxar e casa com o som. Mas a primeira fala do resultado pode apontar para ela como a mais barata (achado novo 1), e ela fica sem porquê em 12 das 30 vezes.
- **Volta.** Filtrada pelo fim da janela. A volta dita na conversa, quando é depois da janela, é anunciada e não muda nada (achado novo 7).

## Regressões da fusão

Nenhum "undefined", "null", "NaN", "[object" ou texto vazio apareceu na tela, nos rótulos acessíveis, na mensagem do WhatsApp ou no convite, em nenhuma jornada. Os campos que o front lê existem na API com o mesmo nome: `festa.origemIdade` (texto), `atendem`, `criterios.inicioMin`/`fimMax`, `data` do convite e `aviso` por opção. O campo `opcao.origem` vai na resposta e o front não usa. A regressão de fato é a do achado novo 1.

## Achados novos

### 1. [P1] A primeira fala aponta a patrocinada como a mais barata

- **Onde:** sábado, 19h à 1h, 30 a 35, até R$ 80, qualquer som. É o pedido típico (jornada 4, conferido de novo na API depois do reinício).
- **O que aconteceu:** a lista é 1. Gafieira Moderna (R$ 40), 2. Noite Aurora (patrocinada, R$ 80), 3. Rock na Laje (R$ 35). A fala diz "A primeira enche antes. A segunda custa menos." A segunda é a patrocinada, e é a mais cara. Em 540 pedidos simulados, isso acontece em seis, todos no sábado, 30 a 35.
- **Causa:** `abertura` (`nucleo/conversa.js:22-37`) tira a patrocinada da conta e usa a posição dentro da lista sem ela (`POSICAO[iBarata]`). Desde a fusão, `escolher` (`motor.js:475`) ordena por horário e a patrocinada pode ficar no meio, então as posições não batem. "A primeira enche antes" também ignora o empate: a patrocinada enche às 21h, como a primeira.
- **Correção:** calcular o índice na lista que aparece na tela (`resultado.opcoes`), excluir a patrocinada só como candidata e tratar o empate como "não único". Pôr um teste com a patrocinada no meio.

### 2. [P1] A Bruna do vídeo recebe uma house e duas de outro som

- **Onde:** jornada 1, sábado, 17h às 23h, 30 a 35, até R$ 80, house.
- **O que aconteceu:** o título é "Uma pro seu sábado.", e a fala diz "Uma cabe no pedido; as outras entraram com outros sons." (`j1-08-resultado-cheio.png`). Entram Funk ao Entardecer e Terraço MPB. Ficam de fora Sábado Groove (house, média 31, R$ 60, Pinheiros, acaba à 1h) e Matinê Eletrônica (house, R$ 70, acaba à meia-noite). Na primeira rodada, a mesma pessoa via três festas de house.
- **Causa:** o motor só afrouxa o horário quando há menos de três candidatas de qualquer som (`motor.js:364-369`). No nível estrito já há quatro, de outros sons, e a lista se completa com elas (`separarComEstilo`, `motor.js:236-248`). O som pedido acaba sendo a primeira coisa a ceder, antes de uma volta uma ou duas horas depois.
- **Correção:** quando há som pedido, afrouxar o horário e o preço até ter três que casam, ou até acabar a escada, antes de completar com outro som. A festa entra com o aviso "Acaba à 1h, depois da sua volta.", que já existe. Oferecer o atalho "voltar mais tarde" quando o que segura o som é a volta.

### 3. [P1] Duas negações comuns ainda invertem o pedido

- **O que aconteceu:**
  - "house não, quero samba" virou "sem house nem MPB" (nº 9).
  - "nem pensar em house" respondeu "House, então." (nº 10).
- **Causa:**
  - `normalizar` (`entender.js:22-32`) apaga a vírgula, e `NEG_ANTES` (`entender.js:38`) lê "nao quero" antes de "samba".
  - `NEG_ANTES` não tem "nem pensar em" nem "de jeito nenhum" antes do termo.
- **Correção:** procurar a negação no texto com pontuação (o `pontuado` que `lerDia` já usa) e não deixar que ela atravesse vírgula, ponto ou "mas". Incluir "nem pensar em" e "de jeito nenhum" antes do termo. Pôr as duas frases em `teste/entender.test.js`.

### 4. [P2] O impedimento do som pode ser falso

- **Onde:** "Pinheiros não" (nº 5).
- **O que aconteceu:** "House no sábado, só acima de R$ 80." Há house a R$ 60 (Sábado Groove, em Pinheiros) e a R$ 70 (Matinê Eletrônica, que acaba à meia-noite).
- **Causa:** `impedimentoDoEstilo` (`motor.js:434-454`) ignora `evitarBairros` e `evitarCasas` e testa o horário com a folga afrouxada, enquanto o filtro de verdade usa a volta estrita. O resultado é que só a festa de R$ 110 tem motivo, e ele vira a frase.
- **Correção:** usar a mesma sequência de filtros de `passa`, incluindo bairro e casa ("House no sábado, só em Pinheiros, que você tirou."), e tomar o motivo da festa mais perto de caber, não o primeiro da lista.

### 5. [P2] A oferta promete uma lista que não entrega

- **Onde:** "grátis" e depois "sim" (nº 50 e 51).
- **O que aconteceu:** a oferta diz "Até R$ 50, sim." Depois do "sim", vem "Nada do jeito que você pediu. House no sábado, só acima de R$ 50."
- **Causa:** `ofertaQuandoVazio` (`motor.js:391-431`) testa `finais.length > 0`, e as festas de outro som contam.
- **Correção:** com som pedido, a oferta só vale se o novo teto trouxer festa que casa. Se não trouxer, a oferta deve dizer "Até R$ 50, só de outros sons."

### 6. [P2] Perguntas fora do escopo recebem a resposta errada

- **O que aconteceu:**
  - "tem open bar?" respondeu "Tipo de casa eu só sei tirar".
  - "vai chover no sábado?" respondeu "Já estamos no sábado."
  - "quanto sai o uber?" e "volto de uber, então tanto faz" responderam "Metrô e estacionamento eu ainda não sei."
  - "qual o endereço?" respondeu "Não peguei."
- **Causa:**
  - "bar" está em `CASAS` (`catalogo.js`) e casa com "open bar". `casa-positiva` é empurrado antes de `fora-do-alcance`, e `responder` usa só o primeiro (`conversa.js:196`).
  - "sábado" seguido de "?" conta como intenção de dia (`entender.js:149-150`).
  - "uber" cai em `fora-transporte`.
  - Não há regra para endereço.
- **Correção:**
  - Não casar "bar" depois de "open".
  - Dar prioridade a `fora-do-alcance`.
  - Chuva vira clima ("Tempo eu não sei.").
  - Para uber: "Volta de Uber eu não calculo. Sei a hora que acaba."
  - Para endereço: "O endereço vai no convite." Hoje não vai, então esta resposta depende do achado anterior 14.

### 7. [P2] "quero voltar às 2" anuncia uma mudança que não acontece

- **O que aconteceu:** com a janela das 17h às 23h, a fala diz "Voltando até as 2h." O pedido mostra "das 17h às 23h, … voltando até as 2h", e a lista não muda (nº 53).
- **Causa:** `completar` (`motor.js:95`) faz `fimMax = min(janela.fim, voltaMax)`, então uma volta depois do fim da janela não tem efeito.
- **Correção:** quando `voltaMax` passa do fim da janela, mudar para a janela que cobre essa volta, ou estender `fimMax` até ela, e dizer isso: "Voltando até as 2h. Abri o horário."

### 8. [P2] O "mais barato" passa do piso que ele mesmo anunciou

- **O que aconteceu:** depois de "R$ 35 é o mais barato no sábado nesse pedido.", o "mais barato" seguinte vai para R$ 30, esvazia a lista e oferece R$ 50 (nº 60 a 63). A piada "Mais barato que de graça" continua sem aparecer.
- **Causa:** o piso só é aplicado quando `minimo < antes.teto` (`servidor.js:321-328`). No piso, `minimo === antes.teto`, e a regra não dispara. A oferta sobe pelos degraus de `DEGRAUS_TETO`, que não têm R$ 35.
- **Correção:** com `minimo === antes.teto`, manter o teto e dizer "R$ 35 já é o mais barato do sábado." A oferta deve usar o preço mínimo, não o degrau.

### 9. [P3] Pequenos

- **Fala repetida.** O título e a primeira frase da fala dizem o mesmo "Nada do jeito que você pediu." (`j3-01-resultado.png`). Tirar o prefixo de `textoDoAviso` (`motor.js:341`) quando o título já diz isso.
- **"Até R$ 0, nada cabe."** Trocar por "De graça, nada cabe." (`motor.js:396-397`).
- **Média lida duas vezes.** O leitor de tela ouve "média 30 anos · média 30, informada pela produtora": `linhaDaFesta` + `mediaFalada`, em `app.js:445` e `plano.js:205`. O `og:title` do convite traz a média sem origem (`servidor.js:396`).
- **Pergunta longe do botão.** "Muda pro domingo?" aparece ao lado do campo, e o botão "Mudar pro domingo" fica no topo, fora da vista. O "sim" funciona.
- **Porquê às avessas.** Para quem pediu das 22h às 3h, "acaba à meia-noite, dá pra voltar cedo" vende como vantagem uma festa que dura duas horas depois da chegada (Vinil e Vinho, `motor.js:274`).
- **Ponto solto.** No pedido, o ponto final fica afastado do último trecho ("funk  ."), em `j3-01-resultado.png`.
- **Convite sem data.** Os convites antigos sem `data` nunca vencem. Usar `criadoEm` mais 7 dias como limite (`planos.js:52`).
- **Boas-vindas.** Às 12h28, a boas-vindas trocou o título "A pista abre antes." pelo h1 em inglês "still going out. just differently." (`app.js:183`). Não é lógica de uso, mas tirou do topo a única frase em português que dizia a proposta.

## O que não foi testado

- **Modo noite.**
- **VoiceOver.** A avaliação vem da árvore de acessibilidade e do foco.
- **Envio real pelo WhatsApp.** Só o `href`, que leva o link `localhost`.
- **Acesso por celular na rede.**

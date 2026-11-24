# Contas e chaves para o motor rodar de verdade (24/11/2026)

O que o Caio cria e configura para o motor do Finde (`motor/`) coletar, classificar e servir em produção, dentro da arquitetura híbrida decidida em 24/11/2026 e ajustada no mesmo dia para gastar menos: o Apify só para o Instagram; Scrapling, rodando no próprio motor, para Sympla, Shotgun, Resident Advisor, Ingresse e sites de casas; e Claude Haiku para ler flyers e páginas. Prova de conceito acadêmica, sem fins lucrativos.

Este documento não cria nada. Nenhuma conta foi aberta, nenhuma chave existe ainda e nada foi feito no Fly. Os preços foram conferidos nas páginas oficiais em 24/11/2026; a fonte de cada um está no fim.

Duas regras valem para tudo abaixo:

- **Chave nenhuma entra em arquivo do repositório**, nem em `.env` dentro de `finde/`, nem em mensagem, nem em print. No Mac ela mora num arquivo fora do repo com permissão 0600; no Fly, em `fly secrets`.
- **Quem digita a chave é o Caio.** Os comandos abaixo foram escritos para que o valor nunca apareça no terminal nem no histórico do shell.

## 0. O cofre local (uma vez, antes de tudo)

Um arquivo só, fora do repositório, que guarda todas as chaves do motor neste Mac:

```bash
mkdir -p ~/.config/finde && chmod 700 ~/.config/finde
```

```bash
touch ~/.config/finde/segredos.env && chmod 600 ~/.config/finde/segredos.env
```

Cada chave entra no arquivo colada do clipboard, sem passar pela tela (o `pbpaste` lê o que foi copiado no site):

```bash
printf 'ANTHROPIC_API_KEY=%s\n' "$(pbpaste)" >> ~/.config/finde/segredos.env
```

Depois de colar, limpe o clipboard copiando qualquer outra coisa. Para carregar no terminal antes de rodar o motor:

```bash
set -a; . ~/.config/finde/segredos.env; set +a
```

Se quiser que todo terminal novo já carregue, a mesma linha vai no fim do `~/.zshrc`. Prefiro deixar manual: o motor só precisa das chaves quando é rodado de propósito.

Para conferir o que está lá sem mostrar valor nenhum:

```bash
cut -d= -f1 ~/.config/finde/segredos.env
```

## 1. Anthropic API (Claude Haiku 5.5)

**Para que serve no motor.** A classificação (`nucleo/classificar.js`): diz se é festa, os estilos do catálogo, idade mínima, lineup, regras de entrada e a hora em que a pista enche, e, na arquitetura nova, lê flyers e páginas. Sem a chave, tudo cai para as regras de palavras e o registro diz `classificacao.por: "regras"`.

**Cadastro.** https://platform.claude.com (o Console da API; é uma conta separada da assinatura do claude.ai, mesmo com o mesmo e-mail).

**Plano.** Não há plano: a API é pré-paga em créditos. Compra-se um saldo, e a API para quando ele acaba. Créditos vencem um ano depois da compra e não são reembolsáveis.

**Preço.** Claude Haiku 5.5 (`claude-haiku-5-5`): US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída, para pedidos de até 100 mil tokens (acima disso, US$ 0,50 e US$ 2,50; o motor nunca chega perto).

**Custo mensal estimado.** O README do motor estima US$ 0,0003 por festa nova ou alterada; 100 por dia dão uns US$ 0,03 por dia, perto de **US$ 1 por mês**. Flyer em imagem pesa mais que texto (uma imagem vira de mil a dois mil tokens de entrada), e mesmo assim fica na casa de **US$ 1 a 5 por mês**. O pior caso é o teto do motor: US$ 2 por dia, US$ 60 por mês, e é para isso que serve o limite do workspace.

**Passo a passo.**

1. Entrar no Console e criar a organização, se ainda não houver. *(Caio: conta, termos.)*
2. Em **Settings → Billing**, comprar créditos: US$ 10 bastam para meses. **Não ligar o auto-reload.** *(Caio: cartão.)* **Conferido em 24/11/2026: a conta já existe e não precisa comprar nada.** Há US$ 12,40 de crédito comprado e US$ 197,30 de crédito promocional da API (vence em 09/12/2026). A recarga automática está ligada (até US$ 20 quando cai abaixo de US$ 5) e vale para a organização inteira, então desligar afeta os outros projetos que usam a API.
3. Em **Settings → Workspaces**, criar um workspace `finde`. O workspace padrão não aceita limite próprio; um workspace novo aceita.
4. Em **Gastos e uso → Limites de gastos** (https://platform.claude.com/settings/spend-limits), no bloco do workspace `finde`, **Definir limite**: **US$ 10**. Em **Adicionar notificação**, um aviso em US$ 5. O limite da organização hoje está em US$ 200.000, ou seja, sem trava na prática.
5. Em **Settings → API keys**, escolher o workspace `finde` no seletor e **Create key**, com o nome `finde-mac`. A chave aparece uma vez só: copiar e já gravar no cofre com o comando da seção 0 (linha `ANTHROPIC_API_KEY`). A chave fica presa ao workspace e herda o limite dele.
6. Uma segunda chave, `finde-motor`, para o Fly, separada da do Mac: se uma vazar, revoga-se só ela. Gravar como `ANTHROPIC_API_KEY_FLY`:

```bash
printf 'ANTHROPIC_API_KEY_FLY=%s\n' "$(pbpaste)" >> ~/.config/finde/segredos.env
```

**Variáveis.**

| Variável | Valor | Onde |
|---|---|---|
| `ANTHROPIC_API_KEY` | a chave | no cofre, a `finde-mac`; no Fly, a `finde-motor` (guardada no cofre como `ANTHROPIC_API_KEY_FLY` e renomeada na ida, seção 5) |
| `FINDE_MODELO` | `claude-haiku-5-5` | não precisa definir: é o padrão do código |
| `FINDE_TETO_EXECUCAO_USD` | `0.50` | opcional; o padrão do código já é esse |
| `FINDE_TETO_DIA_USD` | `2.00` | opcional; o padrão do código já é esse |

Os dois tetos do motor e o limite do workspace se somam: o motor para de chamar o Claude ao passar de US$ 0,50 numa execução ou US$ 2 no dia; se o código errar a conta, o Console corta em US$ 10 no mês. Para apertar no começo, `FINDE_TETO_DIA_USD=0.50` é um bom valor de estreia.

## 2. Apify (só o Instagram)

**Decisão de 24/11/2026.** O Apify ficou só com o Instagram, a única fonte que não compensa coletar por conta própria (login, bloqueios, mudanças frequentes). Sympla, Shotgun e Resident Advisor saíram do Apify e passaram para o Scrapling (seção 4). Com isso, o custo do Apify cai de US$ 19 a 33 por mês para algo entre zero e uns US$ 10 (Starter com o desconto acadêmico).

**Para que serve no motor.** Roda os coletores prontos do Instagram e devolve os itens em JSON. O cliente está em `nucleo/apify.js`: chama a rota síncrona com o token no cabeçalho e manda em cada chamada um teto de itens (`maxItems`) e de gasto (`maxTotalChargeUsd`). Coletores:

| Coletor | Para quê | Preço por 1.000 itens (24/11/2026) |
|---|---|---|
| `apify~instagram-scraper` | posts novos de uma lista fechada de produtoras e casas | US$ 2,70 no grátis; US$ 2,30 no Starter |
| `apify~instagram-profile-scraper` | dados do perfil (bio, link), uma vez por semana | US$ 2,60 no grátis; US$ 2,30 no Starter |

Os três coletores que saíram (`hypebridge~sympla-events-scraper`, `crawloop~shotgun-scraper`, `parsebird~resident-advisor-scraper`) ficam como reserva: se o Scrapling de alguma dessas fontes quebrar e demorar a voltar, o coletor do Apify cobre o buraco por alguns dias, a US$ 2,20 a 3 por mil itens.

**Cadastro.** https://console.apify.com/sign-up

**Plano recomendado: começar no grátis.** O plano grátis dá US$ 5 de uso por mês, sem cartão, e bloqueia a conta quando o saldo acaba, até o mês virar. Para o Instagram, o volume cabe:

| Por mês | Itens | Custo no grátis |
|---|---|---|
| Posts (≈ 50 por dia) | 1.500 | ≈ US$ 4,05 |
| Perfis (≈ 50 por semana) | 200 | ≈ US$ 0,52 |
| **Mês** | 1.700 | **≈ US$ 4,57** |

Fica perto do limite. Se o grupo quiser mais perfis ou mais posts, ou se o bloqueio no fim do mês atrapalhar, o passo seguinte é o **Starter com o desconto acadêmico**: a página https://apify.com/resources/universities dizia em 24/11/2026 **50% de desconto** em qualquer plano pago, por no máximo quatro meses (um semestre, sem renovação), para aluno ou pesquisador de instituição credenciada. Isso deixa o Starter em uns **US$ 9,50 por mês** com US$ 19 de uso incluído. O formulário pede o nome de usuário do Apify, o e-mail da universidade, o curso, o uso pretendido e um comprovante de matrícula; a resposta leva até duas semanas. A página de preços do Apify fala em 30%; vale o que o formulário aprovar. Sem e-mail da universidade o pedido ainda é possível: a página diz que, nesse caso, o Apify verifica pela carteirinha ISIC ou outro comprovante enviado no formulário, o que tende a demorar mais.

**Passo a passo.**

1. Criar a conta com um e-mail comum (24/11/2026: o e-mail do Insper está com problema no autenticador). *(Caio: conta, termos.)*
2. Abrir as páginas dos dois coletores do Instagram, ler a aba **Pricing** e aceitar o que cada um pedir. Alguns coletores pagos por evento só rodam pela API depois desse aceite. *(Caio: termos de cada coletor.)*
3. Em **Settings → API & Integrations**, criar um token com o nome `finde-motor` (**+ Create a new token**). Se a tela oferecer escopo, restringir a rodar atores e ler datasets. Copiar e gravar no cofre:

```bash
printf 'APIFY_TOKEN=%s\n' "$(pbpaste)" >> ~/.config/finde/segredos.env
```

4. Só se o grátis não bastar: pedir o desconto em https://apify.com/resources/universities, assinar o Starter em **Billing → Subscription** e pôr o limite de uso em **Billing → Limits → Custom usage limit → Edit limit** (https://console.apify.com/billing#/limits). Com US$ 25 de limite, a pior fatura do mês fica em uns US$ 16 com o desconto de 50%. *(Caio: cartão.)*

**Variável.** `APIFY_TOKEN`. Sem ela, `criarApify` devolve `null` e o motor segue sem o Instagram.

**Volume é decisão do código.** A agenda padrão do motor (`FINDE_HORARIOS=padrao`) roda quatro vezes por dia. O Instagram deve ir ao Apify uma vez por dia, só com posts novos (o coletor aceita data mínima), e os perfis uma vez por semana; senão os 1.700 itens viram 6.800 e o grátis acaba na primeira semana. A outra sessão decide; o número acima só vale assim.

**Termos.** Os termos do Instagram, do RA e das plataformas de ingresso proíbem coleta automatizada, pelo Apify ou pelo Scrapling, e o README do motor registrava isso como motivo para não ter conector (R15). A decisão de 24/11/2026 de coletar como prova de conceito acadêmica, sem fins lucrativos e com aval da instituição, é do Caio e do grupo. Vale guardar o aval por escrito e atualizar a tabela de fontes do README e `fontes/index.js` quando o código ligar essas fontes, para o repositório não dizer duas coisas.

## 3. Proxy residencial de reserva (FloppyData), opcional

**Para que serve.** Só entra se alguma fonte do Scrapling (Shotgun, RA, Sympla, Ingresse) começar a bloquear o IP do Fly. Com quatro plataformas no Scrapling em vez de uma, a chance de precisar dele subiu: datacenter costuma ser o primeiro IP bloqueado. Mesmo assim, **não abrir conta antes de haver um bloqueio de verdade**; o motor mostra o bloqueio como erro na execução da fonte.

**Cadastro.** https://floppydata.com

**Preço (24/11/2026).** Proxy rotativo a **US$ 1 por GB**, um só saldo que vale para residencial, móvel e datacenter. Compra-se GB, sem mensalidade. A página não diz o pacote mínimo nem se há teste grátis; conferir na hora da compra.

**Custo mensal estimado.** Uma página de evento com o navegador do Scrapling pesa de 1 a 3 MB; 100 páginas por dia dão 3 a 9 GB por mês, **US$ 3 a 9**. Quando a fonte entrega os eventos em JSON (Shotgun e RA, pelo que se vê nas páginas), não há navegador nem imagem, e o tráfego cai para dezenas de MB por mês, centavos. Zero enquanto não for usado.

**Passo a passo (só se precisar).**

1. Criar a conta e comprar o menor pacote de GB. *(Caio: conta, termos, cartão.)*
2. No painel, gerar o usuário e a senha do proxy e escolher a localização **Brasil** (a Ingresse e o Shotgun mostram conteúdo por país).
3. Montar a URL no formato `http://usuario:senha@host:porta` e gravar no cofre, colando a URL inteira do clipboard:

```bash
printf 'FINDE_PROXY_URL=%s\n' "$(pbpaste)" >> ~/.config/finde/segredos.env
```

**Variável.** `FINDE_PROXY_URL` é um **nome sugerido**: o código de hoje não lê nenhuma variável de proxy. Quem implementar o Scrapling confirma o nome; se mudar, muda aqui.

## 4. Scrapling (sem conta): Sympla, Shotgun, RA, Ingresse e casas

**Decisão de 24/11/2026.** O Scrapling, rodando dentro do próprio motor, passou a cobrir Sympla, Shotgun e Resident Advisor, além da Ingresse e dos sites de casas que já eram dele. É o que tira o custo do Apify dessas fontes.

**Conta e custo.** Biblioteca Python de código aberto: sem cadastro, chave nem mensalidade. O custo vira manutenção: quando uma plataforma muda a página, o coletor quebra e alguém do grupo conserta. O Apify cobrava justamente por isso.

**O que fica para o código** (a outra sessão), registrado aqui porque mexe no deploy e no custo:

- A imagem do Fly passa a precisar de Python. Se alguma fonte exigir navegador, também de um Chromium, e a máquina sobe de 256 MB para 512 MB ou 1 GB (seção 5).
- Onde a página traz os eventos em JSON (a API que o próprio site usa no Shotgun e no RA), buscar o JSON sem navegador: mais leve, mais estável e sem proxy na maior parte do tempo.
- Uma rodada por dia por plataforma, só eventos de São Paulo nos próximos 14 dias, com pausa entre pedidos. Volume baixo é o que evita bloqueio.
- O proxy da seção 3 entra pela variável `FINDE_PROXY_URL`, só nas fontes que bloquearem.
- Os coletores do Apify dessas fontes ficam de reserva (seção 2), para cobrir uma quebra que demore.

## 5. Fly.io

**Para que serve.** Hospeda o motor sempre ligado (a agenda de coletas roda dentro do servidor), com o banco SQLite num volume e o Litestream copiando cada commit para um bucket Tigris. O desenho está em `motor/fly.toml`, `motor/Dockerfile` e `motor/deploy/`.

**Conta.** Já existe (a do Phoenix e da Aubrax). **Nada a criar de conta.** Os comandos abaixo são para o Caio rodar quando decidir subir; nenhum foi rodado.

**Preço (24/11/2026).**

| Item | Preço | No motor |
|---|---|---|
| Máquina `shared-cpu-1x` 256 MB | US$ 2,19 por mês (preço de `iad`/`ewr`; `gru` pode custar um pouco mais, a página não diz quanto) | 1 máquina, sempre ligada |
| Volume | US$ 0,15 por GB por mês | 1 GB, US$ 0,15 |
| Tigris (bucket) | US$ 0,02 por GB por mês; os primeiros 5 GB, grátis; sem custo de saída | o banco tem poucos MB: US$ 0 |

**Custo mensal estimado: US$ 2,50 a 3.** Se o Scrapling com navegador rodar dentro da mesma máquina, ela precisa subir para 512 MB ou 1 GB, e o custo vai para US$ 4 a 6.

**Comandos, de dentro de `motor/`, nesta ordem.**

```bash
cd ~/Documents/Dev/finde/motor
```

```bash
fly apps create finde-motor
```

```bash
fly volumes create finde_dados --app finde-motor --region gru --size 1
```

O `fly storage create` cria o bucket Tigris e define sozinho, como segredos do app, `BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3` e `AWS_REGION`, exatamente os nomes que `deploy/inicio.sh` e `deploy/litestream.yml` leem:

```bash
fly storage create --app finde-motor --name finde-motor-dados
```

Os segredos do motor vão do cofre direto para o Fly, sem aparecer na tela. O `fly secrets import` lê linhas `NOME=valor` da entrada padrão; o `grep` escolhe só o que o Fly deve ter, e a chave do Mac fica de fora:

```bash
grep -E '^(APIFY_TOKEN|FINDE_ADMIN_TOKEN|FINDE_PROXY_URL)=' ~/.config/finde/segredos.env | fly secrets import --app finde-motor --stage
```

```bash
grep -E '^ANTHROPIC_API_KEY_FLY=' ~/.config/finde/segredos.env | sed 's/^ANTHROPIC_API_KEY_FLY=/ANTHROPIC_API_KEY=/' | fly secrets import --app finde-motor --stage
```

Nota sobre as duas chaves da Anthropic: no cofre, a do Mac fica como `ANTHROPIC_API_KEY` e a do Fly como `ANTHROPIC_API_KEY_FLY`; o segundo comando a renomeia na ida. Se preferir uma chave só, basta trocar o `grep` do segundo comando por `^ANTHROPIC_API_KEY=` e tirar o `sed`.

Conferir que os nomes estão lá (o Fly mostra só os nomes e um resumo, nunca o valor):

```bash
fly secrets list --app finde-motor
```

Subir:

```bash
fly deploy --app finde-motor
```

Conferir de fora, pelo endereço público:

```bash
curl -s https://finde-motor.fly.dev/saude
```

```bash
curl -s https://finde-motor.fly.dev/api/festas | head -c 400
```

Pontos em aberto do Fly, para saber antes do primeiro deploy:

- O build da imagem nunca foi testado (o README diz isso). O primeiro `fly deploy` pode falhar por motivo de código, e não de conta.
- O `fly.toml` já traz `FINDE_HORARIOS=padrao` (quatro coletas por dia). Ver a nota de custo do Apify na seção 2.
- O Tigris guarda os dados fora do Brasil por padrão. É a mesma pergunta de LGPD que está aberta para o Phoenix; aqui o banco só tem festas públicas e produtoras cadastradas, sem dado pessoal de usuário, mas vale decidir junto.

## 6. `FINDE_ADMIN_TOKEN`

**Para que serve.** Libera `GET /api/uso` e `GET /api/execucoes` (o gasto com o modelo e as execuções). Sem ele, essas rotas ficam fechadas.

**Sem conta, sem custo.** Gera-se no Mac, direto para o cofre, sem passar pela tela:

```bash
printf 'FINDE_ADMIN_TOKEN=%s\n' "$(openssl rand -hex 32)" >> ~/.config/finde/segredos.env
```

Vai para o Fly junto com os outros pelo `fly secrets import` da seção 5. Para usar:

```bash
set -a; . ~/.config/finde/segredos.env; set +a; curl -s -H "Authorization: Bearer $FINDE_ADMIN_TOKEN" https://finde-motor.fly.dev/api/uso
```

## Custo total estimado por mês

Em dólar, sem IOF nem a taxa de câmbio do cartão. Já com a decisão de 24/11/2026 (Apify só no Instagram).

| Serviço | Esperado | Pior caso (com os limites desta página) |
|---|---|---|
| Anthropic (Haiku 5.5) | US$ 1 a 5 | US$ 10 (limite do workspace) |
| Apify (só Instagram) | US$ 0 no plano grátis | ≈ US$ 16 no Starter com desconto acadêmico de 50% e limite de US$ 25 |
| Scrapling (Sympla, Shotgun, RA, Ingresse, casas) | US$ 0 | US$ 0 (o custo é manutenção) |
| FloppyData | US$ 0 (só se houver bloqueio) | US$ 3 a 9 se for ligado |
| Fly.io (máquina, volume, Tigris) | US$ 2,50 a 3 | US$ 6 com máquina maior para o Scrapling com navegador |
| `FINDE_ADMIN_TOKEN` | US$ 0 | US$ 0 |
| **Total** | **≈ US$ 4 a 8** | **≈ US$ 44** |

Antes da decisão, com Sympla, Shotgun e RA também no Apify, o esperado era US$ 23 a 41.

## Checklist em ordem

Marcados com **[Caio]** os passos que só ele faz (conta, cartão, termos, colar chave). Os outros um agente pode rodar com ele presente, sem ver valor de chave.

1. [x] Criar o cofre local `~/.config/finde/segredos.env` (0600). (seção 0) Feito em 24/11/2026.
2. [x] Anthropic: conta no Console. Já existia.
3. [x] Anthropic: créditos. Já há saldo (crédito promocional até 09/12/2026); nada a comprar.
4. [x] Anthropic: workspace `finde` com limite mensal de US$ 10. Feito em 24/11/2026 (o aviso por e-mail em US$ 5 ficou de fora).
5. [x] Anthropic: chaves `finde-mac` e `finde-motor` no workspace `finde`, no cofre como `ANTHROPIC_API_KEY` e `ANTHROPIC_API_KEY_FLY`. Feito em 24/11/2026; as duas responderam a uma chamada de teste ao Haiku 5.5. **Vencem em 24/12/2026** (30 dias).
6. [ ] Rodar uma coleta local com a chave e conferir o gasto real: `node cli.js coletar --com-exemplos` e depois `node cli.js uso`.
7. [x] Apify: conta no plano grátis. Feito em 24/11/2026.
8. [x] Apify: os dois coletores do Instagram abertos no Console; nenhum pediu aceite à parte. Preços conferidos: US$ 2,70 e US$ 2,60 por mil.
9. [x] Apify: token `finde-motor` no cofre como `APIFY_TOKEN`, conferido na API. Feito em 24/11/2026. **Vence em 23/02/2027** (90 dias).
10. [ ] Montar a lista fechada de perfis do Instagram (produtoras e casas) que o motor vai seguir.
11. [x] Gerar o `FINDE_ADMIN_TOKEN` direto no cofre. (seção 6) Feito em 24/11/2026.
12. [ ] Combinar com a sessão do código: Instagram uma vez por dia só com posts novos, perfis uma vez por semana; Sympla, Shotgun e RA pelo Scrapling, uma rodada por dia.
13. [ ] Rodar uma coleta local com o Apify e o Scrapling ligados, quando o código estiver pronto, e conferir o custo em `uso_apify` e no painel do Apify.
14. [ ] Só se o grátis não bastar: **[Caio]** pedir o desconto acadêmico, assinar o Starter e pôr o limite de uso em US$ 25.
15. [ ] **[Caio]** Decidir subir para o Fly (é escrita em produção na conta dele).
16. [ ] Fly: `fly apps create`, `fly volumes create`, `fly storage create`. (seção 5)
17. [ ] Fly: importar os segredos do cofre com `fly secrets import --stage` e conferir com `fly secrets list`.
18. [ ] Fly: `fly deploy` e conferir `/saude` e `/api/festas` pelo endereço público.
19. [ ] Uma semana depois, comparar o gasto real dos três painéis (Console da Anthropic, Apify, Fly) com a tabela acima e ajustar os limites.
20. [ ] Só se alguma fonte do Scrapling bloquear: **[Caio]** criar a conta no FloppyData, comprar o menor pacote e colar a URL do proxy no cofre; importar no Fly.

## Fontes (consultadas em 24/11/2026)

- Preço do Claude Haiku 5.5: tabela de modelos da documentação da Claude API (skill `claude-api`, cache de 03/11/2026), US$ 0,10 e US$ 0,50 por milhão de tokens até 100 mil tokens.
- Créditos pré-pagos, auto-reload e validade de um ano: https://support.claude.com/en/articles/8977456-how-can-i-pay-for-my-claude-api-usage
- Limite mensal por workspace e chaves presas ao workspace: https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces
- Desconto acadêmico do Apify (50% por até quatro meses, lido na página em 24/11/2026): https://apify.com/resources/universities
- Planos do Apify (grátis com US$ 5, Starter US$ 19, uso incluído, US$ 0,20 por CU, proxy residencial US$ 8 por GB, limite máximo de US$ 100 no Starter): https://apify.com/pricing
- Onde fica o limite de uso do Apify: https://docs.apify.com/platform/console/billing e https://docs.apify.com/account/limits
- Coletores: https://apify.com/apify/instagram-scraper, https://apify.com/apify/instagram-profile-scraper, https://apify.com/hypebridge/sympla-events-scraper, https://apify.com/crawloop/shotgun-scraper, https://apify.com/parsebird/resident-advisor-scraper
- FloppyData (US$ 1 por GB, rotativo): https://floppydata.com/pricing
- Fly.io (máquina US$ 2,19, volume US$ 0,15 por GB): https://docs.fly.io/about/pricing
- Tigris (US$ 0,02 por GB, 5 GB grátis, sem custo de saída): https://www.tigrisdata.com/docs/pricing

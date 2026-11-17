# Como contribuir

Este repositório é do Grupo 1 de Inovação e Empreendedorismo (MBM Insper, turma 13B). Qualquer integrante pode sugerir mudanças. O Caio revisa e junta na `main`.

Antes de mexer, leia [`docs/conceito.md`](docs/conceito.md) (o que o Finde é hoje) e [`docs/decisoes.md`](docs/decisoes.md) (o que o grupo já decidiu).

## O repositório é público

Qualquer pessoa na internet lê tudo o que entra aqui, inclusive o histórico de commits. Então **não entra**:

- nome, e-mail, telefone ou foto de colega, entrevistado ou professor;
- entrevista bruta (áudio, transcrição, anotações com nomes): resumos sem identificação podem entrar;
- material do professor ou do Blackboard (slides, enunciados, rubricas);
- chave de API, token, senha ou arquivo `.env`;
- captura de tela de outros apps (Sympla, Shotgun etc.): a pesquisa descreve em texto e as imagens ficam no Drive do grupo;
- festa, produtora ou perfil de Instagram real nos dados do protótipo: os dados são fictícios e os nomes são inventados.

Se algo assim subir por engano, avise o Caio antes de tentar apagar: depois de enviado, um arquivo continua no histórico e precisa de limpeza própria.

## O caminho de uma mudança

1. **Abra uma issue** quando a mudança mexer numa decisão do grupo (público, proposta de valor, preço, marca) ou for grande. Mudança pequena (texto, erro, ajuste visual) pode ir direto para o passo 2.
2. **Faça a mudança num branch:**
   - sem acesso de escrita, faça um *fork* do repositório e trabalhe na sua cópia;
   - com acesso de escrita, crie um branch com nome curto, como `ajuste-convite` ou `pesquisa-produtoras`. Não envie direto para a `main`.
3. **Rode os testes** da parte que você mexeu (abaixo). Um PR com teste vermelho não entra.
4. **Abra o pull request** para a `main`, preenchendo o modelo: o que mudou, por quê e como conferir. Para mudança visual, anexe uma captura do protótipo.
5. **Revisão:** o Caio comenta ou junta. Responda os comentários no próprio PR.

Prefira PRs pequenos, com um assunto só. É mais fácil revisar três PRs de 50 linhas que um de 600.

## Commits

Assunto curto, no imperativo e em português ("Corrige o horário do convite", "Acrescenta pesquisa com produtoras"). Se precisar explicar, deixe uma linha em branco e escreva um parágrafo. Use o e-mail *noreply* do GitHub (em *Settings → Emails*, marque "Keep my email addresses private"), para o seu e-mail pessoal não ficar público no histórico.

## Rodar o protótipo

Node 24, sem dependências.

```bash
cd prototipo/v1-festas
node servidor.js
```

Abre em `http://localhost:8763`, na landing; o app fica em `/app`. Testes: `node --test teste/`. Os dados ficam em `dados/festas.json`, e a interface em `publico/`.

A versão no ar é https://finde.fly.dev. Só o Caio publica, depois que o PR entra na `main`.

## Rodar o motor de coleta

```bash
cd motor
node cli.js coletar --com-exemplos
node --test teste/
```

Sem chave da Anthropic, a classificação vai por regras, e isso basta para desenvolver. O [`motor/README.md`](motor/README.md) tem o resto. Fonte nova de festas só entra se os termos dela permitirem coleta automatizada; Instagram, Resident Advisor e as plataformas de ingresso ficam de fora por isso.

## Desenho e texto do protótipo

- **Base:** o manual de marca do grupo, resumido em [`docs/marca.md`](docs/marca.md): cores, tipografia e voz.
- **Porta de entrada:** a landing, em `/`. É a primeira tela de quem abre o protótipo. O app fica em `/app`, e `/app?festa=<id>` abre direto o detalhe de uma festa. Mudança na landing parte da prancha 08 do manual e das diferenças anotadas em [`docs/marca.md`](docs/marca.md). Depoimento só entra com fala real aprovada, e o formulário de e-mail continua sem enviar nem guardar nada.
- **Botões:** são dois, tirados da prancha de teste de botões do manual (decisão de 16/11/2026).
  - Principal, a opção D: retângulo sem raio, fundo bordô, texto nude em DM Sans 12 px, caixa alta, espaçamento de .16em. No modo noite, fundo nude e texto bordô. Quando dois ficam lado a lado, como "Tô dentro" e "Não rola", o segundo é o contorno do D.
  - Secundário, a opção C: link com fio rosé embaixo e seta.
  - As outras opções da prancha (A, B, E e F) não entram.
- **Canto reto:** nada de pílula nem de canto arredondado em painel, mesmo onde a prancha do manual ainda desenha assim (decisão de 10/11/2026).
- **Evite o visual de interface feita por IA:**
  - gradiente;
  - sombra difusa;
  - cartão flutuante;
  - emoji;
  - ícone decorativo;
  - frase de marketing.
- **Horário primeiro:** toda festa abre com a hora de início e a média de idade do público.
- **Assinatura:** a única aprovada é *still going out. just differently.*
- **Média de idade:** sempre com a origem (informada pela produtora, estimada por edições anteriores ou por avaliações). Sem origem, aparece como não informada.
- **Testes de navegador:** sem som. O protótipo não toca nada, e qualquer teste novo também não deve tocar.

## Onde ficam as coisas

| Pasta | O quê |
|---|---|
| `docs/` | Conceito, decisões, marca, disciplina |
| `docs/plans/` | Planos de cada frente, com os requisitos numerados (R1, R2…). Ao mudar um comportamento previsto, cite o requisito no PR |
| `docs/pesquisa/` | Benchmarks e pesquisas, com fonte e data |
| `docs/revisoes/` | Revisões do protótipo |
| `prototipo/v1-festas/` | O protótipo atual |
| `motor/` | O motor de coleta, agregação e classificação |
| `entregas/`, `video/` | Versões das entregas da disciplina e a fonte do vídeo 2 |

O formato do registro de festa (`motor/nucleo/contrato.js`) é compartilhado entre o protótipo e o motor. Mudança nele precisa vir nos dois lados, no mesmo PR.

## Usando IA

Pode usar Claude, ChatGPT ou o que preferir. Quem abre o PR responde pelo conteúdo: confira o que foi gerado, rode os testes e tire o texto com cara de IA antes de enviar.

# Finde

**Still going out, just differently.**

Guia de festas para quem tem entre 28 e 35 anos em São Paulo: junta as festas do fim de semana e filtra pela idade de quem frequenta, pelo horário e pelo quanto a pessoa quer gastar. Projeto do Grupo 1 em Inovação e Empreendedorismo (MBM Insper, turma 13B).

## Por onde começar

- [`docs/conceito.md`](docs/conceito.md): o que é o Finde hoje, para quem, a proposta de valor, como funciona e o que falta para tudo ficar consistente.
- [`docs/disciplina.md`](docs/disciplina.md): o que cada entrega pede, prazos e pesos, roteiro de entrevistas.
- [`docs/marca.md`](docs/marca.md): resumo do manual de identidade visual, com a landing e o teste de botões.
- [`docs/decisoes.md`](docs/decisoes.md): as decisões tomadas, com data.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): como sugerir mudanças por pull request, o que não pode entrar num repositório público e como rodar os testes.

## O que tem aqui

| Pasta | O quê |
|---|---|
| `docs/` | Conceito, plano, requisitos da disciplina e decisões |
| `entregas/` | Versões entregues ou em revisão: entrega do Ignite, percurso do Start, vídeo 2 |
| `motor/` | Motor de coleta: busca festas em fontes permitidas, junta duplicatas, classifica e entrega registros no formato do detalhe da festa (ver `motor/README.md`) |
| `video/v24/` | Fonte do vídeo 2: roteiro em `roteiro.json`, cenas em `src/render.cjs`, desenhos em `assets/` |
| `prototipo/v1-festas/` | Protótipo atual: a landing em `/` e o app em `/app` (seis perguntas, a programação da noite com ajuste por conversa, o detalhe da festa e o convite para o grupo), sob o manual de marca. Festas fictícias |
| `prototipo/v0-conversa/` | Primeiro protótipo, da tese anterior (conversa sobre experiências em geral) |

Os documentos de trabalho em Word ficam no Google Drive do grupo, na pasta `E&I-Folia`. Entrevistas brutas e material do professor não entram aqui.

## Rodar o protótipo

Node 24, sem dependências.

```bash
cd prototipo/v1-festas && node servidor.js
```

Abre em `http://localhost:8763`. Testes: `node --test teste/`.

- `/` é a landing, a primeira tela: o que é o Finde, um convite de exemplo, a lista da semana com filtro por dia e um formulário de e-mail só visual, que avisa que é protótipo e não envia nem guarda nada.
- `/app` é o app: as seis perguntas, a lista com a "% a sua cara" de cada festa, o detalhe da festa e o envio ao grupo. `/app?festa=<id>` abre direto o detalhe de uma festa da lista da landing.
- `/p/:id` é o convite que o grupo recebe.

No ar, em endereço provisório: https://finde.fly.dev (Fly.io, São Paulo; a máquina dorme sem uso e acorda no primeiro acesso). Para publicar de novo: `fly deploy` dentro de `prototipo/v1-festas`.

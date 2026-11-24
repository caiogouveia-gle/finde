# Roteiro do deploy do motor e do app (24/11/2026)

O passo O4 do plano `docs/plans/2026-11-24-0115-feat-prova-de-conceito-completa-plan.md`, na ordem em que se faz, com o que conferir em cada passo. Nada aqui foi rodado: o deploy é do orquestrador, com a autorização de 24/11, e para antes de qualquer coisa que suba teto de custo, mexa na landing ou exponha segredo. Os comandos de conta e de chave estão em `docs/operacao/2026-11-24-contas-e-chaves.md`; o detalhe de cada comando do motor, em `motor/README.md`, seção "No Fly". O cofre é `~/.config/finde/segredos.env` (o plano o chama de `motor.env`; é o mesmo arquivo).

## Antes de começar

- As duas suítes verdes no checkout que vai subir: `cd motor && node --test teste/` e `cd prototipo/v1-festas && node --test teste/`.
- O banco que vira semente é o reprocessado e curado da U35: `motor/var/finde-r3.sqlite3` (69 festas, 76 vínculos, 7 imagens, 8 correções de curadoria, `integrity_check` ok). O banco antigo, `motor/var/finde.sqlite3`, fica como está, somente leitura.
- As imagens que vão com a semente estão em `motor/var/imagens/` (14 arquivos, 7 peças). O Litestream não as copia; elas sobem pelo `sftp` ou o primeiro ciclo baixa de novo as que têm endereço de origem (indicação, envio e páginas: desde a revisão de 24/11, a linha sem arquivo não conta como conhecida). O flyer do Instagram volta quando o post é lido de novo.
- Uma reserva do app congelada na véspera: `node ferramentas/reais.js` grava `prototipo/v1-festas/dados/reais.json` e `dados/imagens/` (fora do git, dentro da imagem). Hoje: 45 no export, 37 entram.
- Deploy da landing continua congelado até o fim; `fly.toml` da landing não entra em nada disto.

## 1. O motor

1. `fly apps create finde-motor`.
2. `fly volumes create finde_dados --app finde-motor --region gru --size 2` (2 GB: o banco e até 300 MB de imagens).
3. `fly storage create --app finde-motor --name finde-motor-dados` (o bucket do Litestream; as chaves dele viram segredos sozinhas).
4. Segredos sem mostrar valor, como em `contas-e-chaves.md`, seções 5 e 7: `ANTHROPIC_API_KEY` (a do Fly), `APIFY_TOKEN`, `FINDE_ADMIN_TOKEN`, `FINDE_APP_TOKEN`, todos com `fly secrets import --stage`. Conferir com `fly secrets list --app finde-motor` (mostra só os nomes).
5. `fly deploy --app finde-motor --build-only`. Se o build falhar, para aqui.
6. `fly deploy --app finde-motor --ha=false`, e `fly machine list --app finde-motor` com **uma** linha só.
7. A semente: `sqlite3 motor/var/finde-r3.sqlite3 "VACUUM INTO '/tmp/semente.sqlite3'"` (nunca `cp` de banco aberto), depois `fly ssh console --app finde-motor -C "mkdir -p /data/entrada /data/imagens"`, e no `fly ssh sftp shell`: `put /tmp/semente.sqlite3 /data/semente.sqlite3`, `put motor/entrada/grupo/contatos.json /data/entrada/contatos.json` e, se quiser as peças já, cada `motor/var/imagens/*.webp` em `/data/imagens/`. Depois `fly machine restart --app finde-motor`.
8. Conferir:
   - `curl -s https://finde-motor.fly.dev/saude` responde, e `/data/semente.aplicada` existe (`fly ssh console -C "ls /data"`).
   - `curl -s https://finde-motor.fly.dev/api/festas | jq '.contrato, .total'` dá `finde-r14/3` e 45 (o total muda com o dia: o padrão corta as passadas de mais de 7 dias).
   - `curl -sI https://finde-motor.fly.dev/imagens/7befeb625a382015-480.webp` dá 200 se as peças subiram.
9. A primeira coleta só de páginas: `curl -s -X POST -H "Authorization: Bearer $FINDE_ADMIN_TOKEN" -d '{"fonte":"paginas"}' https://finde-motor.fly.dev/api/coletar` (o token vem do cofre carregado no shell, sem `echo`). Conferir em `GET /api/execucoes` que alguma página voltou 2xx do IP do Fly; se a Sympla e o Shotgun derem 403, 429 ou 503, é recusa (D14) e fica anotado, sem contorno.
10. Depois, a coleta completa pela agenda (`FINDE_HORARIOS = "padrao"` no `fly.toml`) ou por `POST /api/coletar` sem corpo. `GET /api/uso` mostra o gasto, que fica dentro dos tetos de D1.

## 2. O app

1. Segredos do `finde-app`: o mesmo `FINDE_APP_TOKEN` do motor e um `FINDE_ADMIN_TOKEN` (pode ser o mesmo valor do motor ou outro), com `fly secrets import --stage`.
2. A reserva: `node ferramentas/reais.js` na véspera, para a imagem levar `dados/reais.json` e `dados/imagens/`.
3. `fly deploy -c fly.app.toml` (dentro de `prototipo/v1-festas`). O `fly.app.toml` já traz `FINDE_MOTOR_URL = "http://finde-motor.internal:8080"` e `FINDE_TILES` no OpenStreetMap.
4. Conferir:
   - `curl -s https://finde-app.fly.dev/api/formulario | jq .base` com o `atualizadoEm` da última execução do motor (e não o de 24/11, que é o da reserva).
   - `curl -sI https://finde-app.fly.dev/` com `X-Robots-Tag: noindex, noimageindex`; `curl -sI https://finde.fly.dev/` **sem** ele (a landing não muda).
   - `curl -s https://finde-app.fly.dev/robots.txt` fecha só `/imagens/` e `/api/`.
   - Uma imagem em `/imagens/<sha16>-480.webp` com 200 e `image/webp`.
   - `GET /api/reais/estado` com o token de admin diz que a lista vem do motor.
   - O mapa num celular de verdade: "Ver no mapa" abre, a atribuição aparece, dois dedos movem o mapa e um dedo rola a página (o gesto não se prova no navegador sem cabeça).
5. O app atual no Fly fica como reserva da demonstração até a conferência acima passar.

## 3. Depois

- **Avaliação real (O3).** Só por convite de festa real a que o grupo foi; a demonstração usa festa fictícia, que nunca sai do app.
- **Recuperação do Instagram (O2).** Com o sim do Caio e o custo de `custoEsperado` na mão: dia 1, `coletar --poc --recuperar-instagram`; dia 2, `coletar --poc --dias 10`. Depois, tirar as ocultações provisórias da U35 que a leitura nova tornar desnecessárias (`node cli.js ocultar <festa> --desfazer`) e regerar a fixture `motor/teste/dados/export-anonimo.json` com `prototipo/v1-festas/ferramentas/anonimizar.js`, baixando o teto de "cidade não confirmada" do `anonimo.test.js` para 0,15.
- **Medições (O5).** Em 29/11 e 06/12: `node ferramentas/funil.js <export do motor no ar>` e um `reais.json` de reserva congelado.
- **07/12 (D13).** Tirar `FINDE_POC` do `[env]` do `motor/fly.toml`, `fly deploy`, e uma linha em `docs/decisoes.md`.
- **31/12 (D15).** `expurgar` nos dois lados e a remoção do bucket, como no README do motor.

## Se der errado

- **Build do motor falha:** o plano B do Mac (`motor/deploy/mac-reserva/LEIA-ME.md`) coleta no Mac e envia o `reais-cache.json` ao volume do app; o app sobe igual, lendo a reserva.
- **Semente inválida:** vira `/data/semente.sqlite3.invalida` e o banco que havia fica; gerar de novo com `VACUUM INTO` e reenviar.
- **Motor fora do ar com o app no ar:** o app segue com `/data/reais-cache.json` e diz há quanto tempo a lista foi gerada (AE7).
- **Imagem que não devia aparecer:** `node cli.js imagem ocultar <sha> --motivo "..."` no motor; o app dá 404 nela na atualização seguinte (até 10 minutos).

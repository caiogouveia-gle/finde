# Plano B: o motor no Mac

Para quando o motor do Fly não estiver no ar (conta, deploy ou bucket com problema) e a base viva do app ainda precisar de festas novas. **Está pronto e documentado, e não está instalado.** Nada aqui roda sozinho: o Caio decide se instala.

O que faz, uma vez por dia: coleta a prova (Instagram e páginas, `--poc`), exporta, passa o export pelo conversor do app (`ferramentas/reais.js`), e manda ao volume do app o `reais-cache.json` e as imagens que ele cita. O app lê esse arquivo quando o motor não responde (R23, `/data/reais-cache.json`).

## Por que fora de `~/Documents`

Um LaunchAgent não lê `~/Documents`: o macOS pede uma autorização que ninguém vê e o processo fica parado no `opendir`. Por isso o motor e o conversor do app vão para uma cópia em `~/Library/Application Support/finde-motor`, e o script mora lá.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `preparar-copia.sh` | Faz e refaz a cópia (motor sem `var/` nem `entrada/`, conversor do app, `npm ci`, `uv sync`). A mão, de dentro do repositório. |
| `rodar.sh` | Uma volta: coleta, exporta, converte, envia. Falha cedo, com exit diferente de 0. |
| `modelo.plist` | LaunchAgent de modelo (`br.finde.motor-reserva`, 07h por dia). Troque `__HOME__`. |

## Antes da primeira volta (a mão, uma vez)

1. `sh deploy/mac-reserva/preparar-copia.sh`.
2. O Chromium do leitor de páginas: `cd "$HOME/Library/Application Support/finde-motor/motor/coletores/paginas" && uv run python -m playwright install chromium` (o Playwright puro; o Chromium do patchright, se já estiver lá, também serve).
3. A lista de perfis do Instagram em `~/Library/Application Support/finde-motor/motor/entrada/grupo/contatos.json` (dado real, fora do git).
4. O cofre `~/.config/finde/segredos.env` (0600) com `ANTHROPIC_API_KEY`, `APIFY_TOKEN` e, para o envio, `FLY_API_TOKEN` (acesso ao app `finde-app`). O script lê o cofre com `set -a` e não imprime nada.
5. Uma volta a mão: `sh "$HOME/Library/Application Support/finde-motor/motor/deploy/mac-reserva/rodar.sh"`. **Gasta o Apify e o Claude**, dentro dos tetos de sempre (US$ 0,50 e 2,00 de Claude; 0,25 e 0,25 de Apify). Só rode com o sim do Caio.

## Instalar (só se o Caio quiser)

```bash
sed "s#__HOME__#$HOME#g" deploy/mac-reserva/modelo.plist > ~/Library/LaunchAgents/br.finde.motor-reserva.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/br.finde.motor-reserva.plist
launchctl kickstart "gui/$(id -u)/br.finde.motor-reserva"
```

O teste de instalação é o `kickstart` e a conferência do código de saída: `launchctl print "gui/$(id -u)/br.finde.motor-reserva" | grep "last exit code"` tem de dar 0, e `~/Library/Logs/finde-motor-reserva.log` mostra a volta. Se der diferente de 0, o log diz onde parou.

## Tirar

```bash
launchctl bootout "gui/$(id -u)/br.finde.motor-reserva"
rm ~/Library/LaunchAgents/br.finde.motor-reserva.plist
```

## Limites

- O envio (`fly ssh console` e `fly ssh sftp`) nunca foi rodado contra o Fly: confira na primeira volta. O formato que o app espera em `/data/reais-cache.json` é o do `ferramentas/reais.js` (`{ contrato, geradoEm, copiadoEm, total, festas }`).
- O banco do plano B é outro (`finde-motor/var/finde.sqlite3`): não compartilha histórico com o do Fly. Para partir do banco do Fly, baixe a réplica do bucket com `litestream restore` e ponha o arquivo ali.
- Depois de 07/12/2026 a coleta paga sai (D13): o `--poc` do `rodar.sh` deixa de valer sem a decisão do Caio.

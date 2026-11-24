#!/bin/sh
# Plano B do motor no Mac (use só se o motor do Fly não estiver no ar): uma volta
# da coleta e do envio. Roda a coleta da prova (Instagram e páginas), exporta,
# passa o export pelo conversor do app e manda o resultado e as imagens ao volume
# do app. Pensado para um LaunchAgent (modelo.plist); a mão, é `sh rodar.sh`.
#
# Não imprime segredo: o cofre é lido com `set -a` e nada é ecoado. Falha cedo
# (set -e) para o LaunchAgent mostrar exit diferente de 0.
#
# NÃO TESTADO contra o Fly: o envio usa `fly ssh` e precisa de FLY_API_TOKEN no
# cofre (token de acesso ao app finde-app, 0600, só neste Mac).
set -eu

BASE=${FINDE_RESERVA:-$HOME/Library/Application Support/finde-motor}
COFRE=${FINDE_COFRE:-$HOME/.config/finde/segredos.env}
APP_FLY=${FINDE_APP_FLY:-finde-app}
NO_APP_CACHE=${FINDE_APP_CACHE:-/data/reais-cache.json}
NO_APP_IMAGENS=${FINDE_APP_IMAGENS:-/data/imagens}

[ -d "$BASE/motor" ] || { echo "sem a copia em $BASE; rode preparar-copia.sh" >&2; exit 2; }
[ -f "$COFRE" ] || { echo "sem o cofre em $COFRE" >&2; exit 2; }

# Uma volta de cada vez.
TRAVA="$BASE/var/rodando.lock"
if ! mkdir "$TRAVA" 2>/dev/null; then
  # trava com mais de 3 horas é de uma volta que morreu
  if [ -n "$(find "$TRAVA" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then rmdir "$TRAVA"; mkdir "$TRAVA"; else echo "outra volta rodando" >&2; exit 3; fi
fi
trap 'rmdir "$TRAVA" 2>/dev/null || true' EXIT

mkdir -p "$BASE/var/imagens"
set -a
# shellcheck disable=SC1090
. "$COFRE"
set +a
export FINDE_BANCO="$BASE/var/finde.sqlite3" FINDE_IMAGENS="$BASE/var/imagens" FINDE_POC=1

cd "$BASE/motor"
node cli.js coletar --poc
node cli.js exportar "$BASE/var/festas-r14.json"
node "$BASE/app/ferramentas/reais.js" "$BASE/var/festas-r14.json" "$BASE/var/reais.json"

# A lista do que subir: o reais.json do app e as imagens que ele cita.
node -e '
const fs = require("node:fs");
const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const nomes = new Set();
for (const f of j.festas || []) for (const i of f.imagens || []) for (const k of ["arquivo", "miniatura"]) if (i[k]) nomes.add(String(i[k]).replace(/^imagens\//, ""));
process.stdout.write([...nomes].filter((n) => /^[a-f0-9]{16}-(480|1080)\.webp$/.test(n)).join("\n"));
' "$BASE/var/reais.json" > "$BASE/var/subir.txt"

# O que já foi, para não mandar de novo.
touch "$BASE/var/enviadas.txt"
fly ssh console -a "$APP_FLY" -C "mkdir -p $NO_APP_IMAGENS"
while IFS= read -r nome; do
  [ -n "$nome" ] || continue
  grep -qxF "$nome" "$BASE/var/enviadas.txt" && continue
  [ -f "$BASE/var/imagens/$nome" ] || continue
  fly ssh sftp put -a "$APP_FLY" "$BASE/var/imagens/$nome" "$NO_APP_IMAGENS/$nome"
  echo "$nome" >> "$BASE/var/enviadas.txt"
done < "$BASE/var/subir.txt"

# O reais.json por último, com troca atômica no volume do app.
fly ssh console -a "$APP_FLY" -C "rm -f $NO_APP_CACHE.novo"
fly ssh sftp put -a "$APP_FLY" "$BASE/var/reais.json" "$NO_APP_CACHE.novo"
fly ssh console -a "$APP_FLY" -C "mv -f $NO_APP_CACHE.novo $NO_APP_CACHE"
echo "volta do plano B concluida"

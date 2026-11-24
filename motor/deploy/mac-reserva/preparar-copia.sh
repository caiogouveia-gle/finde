#!/bin/sh
# Plano B do motor no Mac: faz (ou refaz) a cópia do motor e das ferramentas do
# app em ~/Library/Application Support/finde-motor, FORA de ~/Documents. O macOS
# não deixa um LaunchAgent ler ~/Documents (TCC): o agente ficaria parado
# esperando uma autorização que ninguém vê. Rode este script a mão, de dentro do
# repositório, sempre que o código mudar. NÃO instala nada e não toca no Fly.
#
#   sh deploy/mac-reserva/preparar-copia.sh
set -eu

AQUI=$(cd "$(dirname "$0")" && pwd)
MOTOR=$(cd "$AQUI/../.." && pwd)
APP=$(cd "$MOTOR/../prototipo/v1-festas" && pwd)
BASE=${FINDE_RESERVA:-$HOME/Library/Application Support/finde-motor}

mkdir -p "$BASE/motor" "$BASE/app" "$BASE/var"

# O motor sem o banco, as imagens e a entrada (dado real: fica onde está).
# `cp -c` (clone APFS) onde der; rsync resolve o resto e preserva o que já está na cópia.
rsync -a --delete --exclude 'var' --exclude 'node_modules' --exclude 'entrada' --exclude 'teste' --exclude '.venv' \
  "$MOTOR/" "$BASE/motor/"
# A entrada: só as indicações e o lote de curadoria; a lista de perfis (contatos.json) vai uma vez, a mão.
mkdir -p "$BASE/motor/entrada"
[ -d "$MOTOR/entrada/indicacoes" ] && rsync -a --delete "$MOTOR/entrada/indicacoes/" "$BASE/motor/entrada/indicacoes/"
[ -f "$MOTOR/entrada/curadoria.json" ] && cp "$MOTOR/entrada/curadoria.json" "$BASE/motor/entrada/curadoria.json"

# O conversor do app, que filtra e valida o export antes de ele ir para o Fly.
rsync -a --delete "$APP/nucleo/" "$BASE/app/nucleo/"
rsync -a --delete "$APP/ferramentas/" "$BASE/app/ferramentas/"

# Dependências do motor (o SDK da Anthropic) e do leitor de páginas (uv, Python 3.12).
( cd "$BASE/motor" && npm ci --omit=dev --no-audit --no-fund )
( cd "$BASE/motor/coletores/paginas" && uv sync --frozen --python 3.12 --no-dev )
echo "copia pronta em $BASE"
echo "falta, uma vez: o Chromium do leitor (uv run python -m patchright install chromium em coletores/paginas) e a lista de perfis em $BASE/motor/entrada/grupo/contatos.json"

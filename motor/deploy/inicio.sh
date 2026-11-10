#!/bin/sh
# Início do motor na imagem (o CMD do Dockerfile). Mesmo desenho do Phoenix
# (amberos/modules/spike-pagamentos/inicio.sh):
#
# Com o bucket configurado (BUCKET_NAME e as chaves que `fly storage create` define):
#   1. volume sem banco (máquina nova): `litestream restore -if-replica-exists` traz o banco do bucket.
#      Bucket ilegível derruba o boot: subir vazio replicaria um banco vazio por cima do bom.
#   2. `litestream replicate -exec "node servidor.js"`: o Litestream supervisiona o Node e copia cada commit.
# Sem bucket: o Node sozinho.
set -eu

DADOS=${FINDE_DADOS:-/data}
DB=${FINDE_BANCO:-$DADOS/finde.sqlite3}
CONFIG=${LITESTREAM_CONFIG:-/app/deploy/litestream.yml}
SERVIDOR="node /app/servidor.js"

replica_ligada() {
  [ "${REPLICA_BUCKET:-on}" != "off" ] && [ -n "${BUCKET_NAME:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ] \
    && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && [ -n "${AWS_ENDPOINT_URL_S3:-}" ]
}

if ! replica_ligada; then
  echo "inicio: sem bucket configurado; Node sem Litestream" >&2
  exec $SERVIDOR
fi

mkdir -p "$DADOS"
if [ ! -e "$DB" ]; then
  echo "inicio: sem banco em $DB; restaurando do bucket" >&2
  litestream restore -config "$CONFIG" -if-replica-exists -o "$DB.restaurando" "$DB"
  if [ -e "$DB.restaurando" ]; then
    mv "$DB.restaurando" "$DB"
    echo "inicio: banco restaurado do bucket" >&2
  else
    echo "inicio: o bucket não tem réplica; banco novo" >&2
  fi
fi

exec litestream replicate -config "$CONFIG" -exec "$SERVIDOR"

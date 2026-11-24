#!/bin/sh
# Início do motor na imagem (o CMD do Dockerfile). Mesmo desenho do Phoenix
# (amberos/modules/spike-pagamentos/inicio.sh):
#
# 0. Semente (opcional): se existir $DADOS/semente.sqlite3 (enviada por
#    `fly ssh sftp`, feita com `VACUUM INTO` no Mac), ela VIRA o banco antes de
#    qualquer outra coisa: apaga $DB, $DB-wal e $DB-shm, confere a integridade da
#    semente, move-a para $DB e deixa uma marca ($DADOS/semente.aplicada). Como
#    foi movida, ela não é aplicada duas vezes. Semente que não passa na
#    integridade vira $DADOS/semente.sqlite3.invalida e o banco que havia fica.
#
# Com o bucket configurado (BUCKET_NAME e as chaves que `fly storage create` define):
#   1. volume sem banco (máquina nova): `litestream restore -if-replica-exists` traz o banco do bucket.
#      Bucket ilegível derruba o boot: subir vazio replicaria um banco vazio por cima do bom.
#      Um $DB.restaurando de um boot que caiu no meio é apagado antes.
#   2. `litestream replicate -exec "node servidor.js"`: o Litestream supervisiona o Node e copia cada commit.
#      Só o banco é replicado; as imagens (FINDE_IMAGENS) não, e a perda delas com o volume fica aceita.
# Sem bucket: o Node sozinho.
set -eu

DADOS=${FINDE_DADOS:-/data}
DB=${FINDE_BANCO:-$DADOS/finde.sqlite3}
CONFIG=${LITESTREAM_CONFIG:-/app/deploy/litestream.yml}
SERVIDOR="node /app/servidor.js"
SEMENTE=${FINDE_SEMENTE:-$DADOS/semente.sqlite3}

replica_ligada() {
  [ "${REPLICA_BUCKET:-on}" != "off" ] && [ -n "${BUCKET_NAME:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ] \
    && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && [ -n "${AWS_ENDPOINT_URL_S3:-}" ]
}

# A semente abre e passa no integrity_check? (Node 24, node:sqlite, só leitura.)
semente_integra() {
  node -e 'const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(process.argv[1], { readOnly: true }); const r = d.prepare("PRAGMA integrity_check").get(); d.close(); process.exit(Object.values(r)[0] === "ok" ? 0 : 1)' "$1"
}

mkdir -p "$DADOS"

if [ -e "$SEMENTE" ]; then
  if semente_integra "$SEMENTE"; then
    echo "inicio: semente $SEMENTE integra; ela vira o banco" >&2
    rm -f "$DB" "$DB-wal" "$DB-shm" "$DB.restaurando"
    mv "$SEMENTE" "$DB"
    # Se a semente veio com os arquivos de WAL e SHM ao lado, são dela, não do banco antigo.
    rm -f "$SEMENTE-wal" "$SEMENTE-shm"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$DADOS/semente.aplicada"
  else
    echo "inicio: a semente $SEMENTE não passou na integridade; fica como .invalida e o banco atual segue" >&2
    mv "$SEMENTE" "$SEMENTE.invalida"
  fi
fi

if ! replica_ligada; then
  echo "inicio: sem bucket configurado; Node sem Litestream" >&2
  exec $SERVIDOR
fi

if [ ! -e "$DB" ]; then
  echo "inicio: sem banco em $DB; restaurando do bucket" >&2
  # Sobra de um restore que caiu no meio: apagar antes, para não confundir com o de agora.
  rm -f "$DB.restaurando"
  litestream restore -config "$CONFIG" -if-replica-exists -o "$DB.restaurando" "$DB"
  if [ -e "$DB.restaurando" ]; then
    mv "$DB.restaurando" "$DB"
    echo "inicio: banco restaurado do bucket" >&2
  else
    echo "inicio: o bucket não tem réplica; banco novo" >&2
  fi
fi

exec litestream replicate -config "$CONFIG" -exec "$SERVIDOR"

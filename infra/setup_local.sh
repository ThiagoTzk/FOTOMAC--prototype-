#!/usr/bin/env bash
# Prepares the LOCAL development environment: PostgreSQL database, SeaweedFS credentials and the
# facial recognition model files (YuNet + SFace).
# Idempotent: running it twice does not break anything and never overwrites existing secrets.
#
# Production (CESMAC server) does NOT use this script: there the DBA/infra team provides
# the database and the SeaweedFS endpoint, and only backend/.env changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
S3_CONFIG="$ROOT/infra/seaweedfs/s3.json"
PG_BIN="/opt/homebrew/opt/postgresql@17/bin"

rand() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }

# 1. Secrets — generated once, per machine. Never a shared/default password (RF001 note 5 spirit).
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS="$(rand 32)"; S3_KEY="$(rand 20)"; S3_SECRET="$(rand 40)"
  cat >"$ENV_FILE" <<EOF
# Local secrets — NEVER commit this file (it is in .gitignore).
FOTOMAC_DATABASE_URL=postgresql+psycopg://fotomac:${DB_PASS}@127.0.0.1:5432/fotomac
FOTOMAC_TEST_DATABASE_URL=postgresql+psycopg://fotomac:${DB_PASS}@127.0.0.1:5432/fotomac_test
FOTOMAC_S3_ENDPOINT=http://127.0.0.1:8333
FOTOMAC_S3_ACCESS_KEY=${S3_KEY}
FOTOMAC_S3_SECRET_KEY=${S3_SECRET}
FOTOMAC_S3_BUCKET=fotomac-acervo
FOTOMAC_FACE_ENGINE=sface
# Key of the pgcrypto encryption of the hired photographer's CPF and birth date (RF031). Keep it
# outside the database and never change it while encrypted data exists (it could not be read back).
FOTOMAC_IDENTITY_KEY=$(rand 48)
EOF
  chmod 600 "$ENV_FILE"
  echo "Criado $ENV_FILE (permissão 600)."
fi
# Installations made before v2.0 have no identity key yet: add one, once.
if ! grep -q '^FOTOMAC_IDENTITY_KEY=' "$ENV_FILE"; then
  printf '# Key of the pgcrypto encryption of the hired photographer CPF / birth date (RF031).\nFOTOMAC_IDENTITY_KEY=%s\n' "$(rand 48)" >>"$ENV_FILE"
  echo "Chave de criptografia da identificação acrescentada a $ENV_FILE."
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
DB_PASS="$(sed -E 's#.*://fotomac:([^@]+)@.*#\1#' <<<"$FOTOMAC_DATABASE_URL")"

# 2. PostgreSQL: dedicated role (not superuser) owning its own databases.
"$PG_BIN/psql" -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fotomac') THEN
    CREATE ROLE fotomac LOGIN PASSWORD '${DB_PASS}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END \$\$;
SQL
for db in fotomac fotomac_test; do
  if ! "$PG_BIN/psql" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    "$PG_BIN/createdb" -O fotomac "$db"
  fi
  # pgvector needs a superuser to be enabled once; the app role then only uses it.
  "$PG_BIN/psql" -d "$db" -q -c "CREATE EXTENSION IF NOT EXISTS vector;"
  # unaccent: search that ignores accents ("fecial" finds "FeCiAL", "edicao" finds "Edição"), RF013.
  "$PG_BIN/psql" -d "$db" -q -c "CREATE EXTENSION IF NOT EXISTS unaccent;"
  # pg_trgm: public search tolerant to simple spelling mistakes ("fecil" finds "FeCiAL"), RF013 note 1.
  "$PG_BIN/psql" -d "$db" -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
done
echo "PostgreSQL: bancos fotomac e fotomac_test prontos (extensão vector ativa)."

# 3. SeaweedFS S3 identities. There is NO anonymous identity: unauthenticated requests are
#    refused, so the photo bucket is private by default (RNF10, RS020).
mkdir -p "$(dirname "$S3_CONFIG")"
cat >"$S3_CONFIG" <<EOF
{
  "identities": [
    {
      "name": "fotomac-api",
      "credentials": [{ "accessKey": "${FOTOMAC_S3_ACCESS_KEY}", "secretKey": "${FOTOMAC_S3_SECRET_KEY}" }],
      "actions": ["Read", "Write", "List", "Tagging", "Admin"]
    }
  ]
}
EOF
chmod 600 "$S3_CONFIG"
echo "SeaweedFS: credenciais gravadas em infra/seaweedfs/s3.json (permissão 600)."

# 4. Facial recognition models (YuNet + SFace, official opencv_zoo files — the same ones measured in
#    fotomac-lab's Test 1). Checked by SHA-256: a different file would produce vectors that do not
#    compare with the stored ones, and the API refuses to load it anyway (app/face/sface_engine.py).
MODELS="$ROOT/backend/models"
ZOO="https://github.com/opencv/opencv_zoo/raw/main/models"
mkdir -p "$MODELS"
while read -r file folder sum; do
  if [[ ! -f "$MODELS/$file" ]] || [[ "$(shasum -a 256 "$MODELS/$file" | cut -d' ' -f1)" != "$sum" ]]; then
    curl -fsSL -o "$MODELS/$file.part" "$ZOO/$folder/$file"
    [[ "$(shasum -a 256 "$MODELS/$file.part" | cut -d' ' -f1)" == "$sum" ]] || { echo "Checksum diferente: $file"; rm -f "$MODELS/$file.part"; exit 1; }
    mv "$MODELS/$file.part" "$MODELS/$file"
  fi
done <<LIST
face_detection_yunet_2023mar.onnx face_detection_yunet 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
face_recognition_sface_2021dec.onnx face_recognition_sface 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79
LIST
echo "Reconhecimento facial: modelos YuNet + SFace conferidos em backend/models/."

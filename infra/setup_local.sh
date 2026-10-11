#!/usr/bin/env bash
# Prepares the LOCAL development environment: PostgreSQL database + SeaweedFS credentials.
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
FOTOMAC_FACE_ENGINE=insightface
EOF
  chmod 600 "$ENV_FILE"
  echo "Criado $ENV_FILE (permissão 600)."
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

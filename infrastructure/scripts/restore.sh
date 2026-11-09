#!/usr/bin/env sh
# SMART MARKET — restore a backup made by backup.sh into an EMPTY database.
#
#   DATABASE_URL=postgresql://user:pass@host:5432/smart_market_restore ./restore.sh backups/smart_market_2026-11-09_020000.dump
#
# Restore into a fresh database first and check it (row counts, latest payments)
# before switching the API over. Never restore on top of the live database.
set -eu

: "${DATABASE_URL:?set DATABASE_URL (target, must be an empty database)}"
FILE="${1:?usage: restore.sh <file.dump>}"
URL="$(printf '%s' "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')"

TABLES="$(psql "$URL" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
if [ "$TABLES" != "0" ]; then
  echo "Refusing to restore: target database already has $TABLES tables. Use an empty database." >&2
  exit 1
fi

pg_restore --no-owner --exit-on-error --dbname="$URL" "$FILE"
psql "$URL" -tAc 'SELECT count(*) AS payments FROM "Payment"' | sed 's/^/Payments restored: /'
psql "$URL" -tAc 'SELECT count(*) AS audit FROM "AuditLog"' | sed 's/^/Audit records restored: /'

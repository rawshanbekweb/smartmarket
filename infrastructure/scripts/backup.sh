#!/usr/bin/env sh
# SMART MARKET — PostgreSQL backup (financial records: run at least daily).
#
#   DATABASE_URL=postgresql://user:pass@host:5432/smart_market ./backup.sh [/var/backups/smart-market]
#
# Docker compose stack:
#   docker compose exec -T db pg_dump -U smart_market -d smart_market -Fc > smart_market_$(date +%F).dump
#
# Writes a compressed custom-format dump (pg_restore compatible), verifies that it
# can be read back, and keeps the last $KEEP_DAYS days of dumps.
set -eu

: "${DATABASE_URL:?set DATABASE_URL}"
DIR="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
# pg_dump does not understand Prisma's ?schema= parameter
URL="$(printf '%s' "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')"

mkdir -p "$DIR"
FILE="$DIR/smart_market_$(date +%Y-%m-%d_%H%M%S).dump"
TMP="$FILE.partial"

pg_dump --format=custom --compress=9 --no-owner --file="$TMP" "$URL"
# A dump that cannot be listed is not a backup.
pg_restore --list "$TMP" > /dev/null
mv "$TMP" "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

find "$DIR" -name 'smart_market_*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete

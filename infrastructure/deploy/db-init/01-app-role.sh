#!/bin/sh
# Runs once, when the PostgreSQL volume is first initialised.
# The API connects as smart_market_app: it can read/write rows but is NOT the owner of
# any table, so it cannot TRUNCATE tables or disable the AuditLog append-only trigger.
# Migrations run as the owner (smart_market) through MIGRATE_DATABASE_URL.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE smart_market_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE smart_market TO smart_market_app;
GRANT USAGE ON SCHEMA public TO smart_market_app;
-- Tables/sequences created later by migrations (owned by smart_market) — no TRUNCATE.
ALTER DEFAULT PRIVILEGES FOR ROLE smart_market IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smart_market_app;
ALTER DEFAULT PRIVILEGES FOR ROLE smart_market IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO smart_market_app;
SQL

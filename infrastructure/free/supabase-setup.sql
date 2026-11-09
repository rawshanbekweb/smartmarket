-- SMART MARKET — run ONCE in Supabase → SQL Editor, BEFORE the first deploy.
-- Replace CHANGE_ME with a strong password (openssl rand -hex 24).

-- 1) Runtime role for the API. It is NOT the owner of the tables (migrations run as
--    "postgres"), so it cannot TRUNCATE tables or disable the AuditLog append-only trigger.
CREATE ROLE smart_market_app LOGIN PASSWORD 'CHANGE_ME';
GRANT USAGE ON SCHEMA public TO smart_market_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smart_market_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO smart_market_app;

-- 2) Supabase exposes the public schema through its Data API (PostgREST) to the
--    "anon" / "authenticated" roles. SMART MARKET never uses that API: make sure
--    financial tables can never be read or written through it.
--    (Also switch the Data API off: Project Settings → Data API.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

# Security notes

## Implemented
- **Passwords:** bcrypt (cost 12 for created/reset users; 10 for demo seed). Constant-cost compare for unknown users. Policy: ≥10 characters with upper case, lower case and a digit. Accounts created or reset by the CHIEF must replace the initial password at first login (`mustChangePassword`; the API answers `403 PASSWORD_CHANGE_REQUIRED` to everything but `/api/auth/*`).
- **Lockout:** after `auth.maxFailedLogins` (default 5) consecutive wrong passwords the account is locked for `auth.lockoutMinutes` (default 15). Counters live in PostgreSQL, so they survive restarts and are shared by all instances. CHIEF can unlock from the Users page; lockouts are audited (`ACCOUNT_LOCKED`, `USER_UNLOCKED`).
- **Sessions:** JWT in `httpOnly`, `SameSite=Strict` cookie (`Secure` when `COOKIE_SECURE=true`). The user is re-loaded from DB on each request. Every token carries the user's `sessionVersion`; it is bumped on password change/reset, deactivation and role change, which revokes all previously issued sessions at once.
- **CSRF:** SameSite=Strict + mandatory `X-Requested-With: SmartMarket` header on state-changing requests.
- **RBAC:** `requireRole` on every route, plus in-service checks for financial operations (cash payment: CASHIER; cancellation: CHIEF; exemption approval: CHIEF; tariff change: CHIEF). Cashier data scoping is enforced in queries.
- **Validation:** Zod on all inputs. Prisma parameterises all queries (raw SQL uses tagged templates only).
- **Rate limiting:** login (20/15 min), public QR reads (60/min), complaints (5/15 min) + honeypot field.
- **Headers:** Helmet (API), restrictive CSP for JSON API, Nginx security headers.
- **CORS:** explicit allow-list (`CORS_ORIGINS`) with credentials.
- **Errors:** generic 500 responses; stack traces only in server logs. Audit `before/after` payloads are sanitised (keys matching password/secret/token/hash/key are redacted).
- **Financial integrity:** DB transactions + per-space advisory lock; idempotency keys for cash payments; unique `(provider, providerTxnId)` for callbacks; CHECK constraints (positive amounts, valid windows); single active payment cycle (partial unique index); payments are never deleted.
- **Audit:** append-only. A PostgreSQL trigger rejects UPDATE/DELETE on `AuditLog`. No API endpoint modifies audit records.
- **Cameras:** only a `streamConfigRef` key name is stored; URLs/credentials are rejected by validation. Internal vision API uses a shared key with timing-safe comparison and is blocked at Nginx.
- **Demo safety:** seed refuses to run when `NODE_ENV=production` or `DEMO_MODE≠true`. In production the server refuses to start with `DEMO_MODE=true` or with `dev-`/`CHANGE_ME` secrets, and warns when `COOKIE_SECURE=false` or `CORS_ORIGINS` points to localhost. `setup:production` refuses a database that contains demo data.

## Remaining limitations / production checklist
1. Run the API with a PostgreSQL role that is **not** the table owner, so it cannot `TRUNCATE` or `DROP TRIGGER`. Done in the production stack: the API uses `smart_market_app` (created by `infrastructure/deploy/db-init`), migrations run as the owner via `MIGRATE_DATABASE_URL`.
2. Terminate TLS in front of Nginx and set `COOKIE_SECURE=true`.
3. Rotate `JWT_SECRET` / `VISION_API_KEY` via your secret manager; never commit `.env`.
4. Rate limits are in-memory (per process). For multiple API instances use a shared store (e.g. Redis).
5. No 2FA yet for CHIEF accounts — recommended before go-live.
6. Click payments are recorded manually by collectors; until they are reconciled against the Click statement they are `verification=PENDING`. Reconcile daily — an unreconciled Click entry is a claim, not proof of money received.
7. Back up PostgreSQL daily (financial records) and test restores: `infrastructure/scripts/backup.sh` (verified custom-format dump + retention) and `restore.sh` (only into an empty database).
8. Logout clears the cookie on that device only; to end every session of an account, change (or have the CHIEF reset) its password.

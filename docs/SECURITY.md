# Security notes

## Implemented
- **Passwords:** bcrypt (cost 12 for created/reset users; 10 for demo seed). Constant-cost compare for unknown users.
- **Sessions:** JWT in `httpOnly`, `SameSite=Strict` cookie (`Secure` when `COOKIE_SECURE=true`). The user is re-loaded from DB on each request, so deactivation takes effect immediately.
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
- **Demo safety:** seed refuses to run when `NODE_ENV=production` or `DEMO_MODE≠true`; server refuses to start in production with a `dev-` JWT secret.

## Remaining limitations / production checklist
1. Run the API with a PostgreSQL role that has `INSERT, SELECT` on `AuditLog` but is **not** the table owner, so it cannot `TRUNCATE` or `DROP TRIGGER`. The migration owner role should be separate.
2. Terminate TLS in front of Nginx and set `COOKIE_SECURE=true`.
3. Rotate `JWT_SECRET` / `VISION_API_KEY` via your secret manager; never commit `.env`.
4. Rate limits are in-memory (per process). For multiple API instances use a shared store (e.g. Redis).
5. No 2FA yet for CHIEF accounts — recommended before go-live.
6. Real payment adapters must implement provider signature verification + replay protection before being enabled.
7. Back up PostgreSQL daily (financial records) and test restores.

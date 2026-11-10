# SMART MARKET — notes for AI assistants

npm workspaces monorepo: `apps/api` (Express + Prisma + PostgreSQL), `apps/web` (React + Vite + AntD + Tailwind), `services/vision` (Python skeleton).

## Commands
- `npm run dev` — API (4000) + web (5173, proxies `/api` and `/socket.io`)
- `npm run db:deploy` / `npm run db:migrate` / `npm run db:seed` (DEMO only, wipes all tables)
- `npm run setup:production -- --market … --name … --username …` — first CHIEF + market on an empty real DB
- Deploy (pilot): push to main → CI → Render deploy hook (`render.yaml`, `infrastructure/docker/app.Dockerfile`; the API serves the SPA via `WEB_DIST_DIR`), DB on Supabase — `docs/DEPLOY-FREE.md`. Own VPS: manual `Deploy (VPS)` workflow — `docs/DEPLOY.md`.
- `npm test` — Vitest against `smart_market_test` DB (never the dev DB)
- `npm run typecheck`, `npm run lint`, `npm run build`
- On Windows, stop the running API before `npm install` / `prisma generate` (the engine DLL is locked).

## Rules that must hold
- Business logic lives in `apps/api/src/services`, never in React components.
- Space status is derived only in `services/spaceStatus.service.ts` (`deriveStatus`).
- Payments: collected on the spot by a market employee (role CASHIER) — CASH or CLICK with `externalRef` (no provider API). CLICK is reconciled via `verification`; cash via shift handover (`expectedCash/declaredCash/receivedCash`). PAYME/UZUM enum values are legacy only.
- Revenue counts `status = SUCCESS` only. Payments are never deleted; cancellation = status change + `PaymentCancellation` + audit (CHIEF only).
- Every sensitive route declares `requireRole(...)`; financial service functions re-check the role.
- Auth: `requireAuth` also blocks `mustChangePassword` users; `/api/auth/*` uses `requireSession`. Bump `sessionVersion` whenever a change must log a user out everywhere.
- Alert escalation is driven by persisted timestamps (`adminNotifyAt`, `chiefEscalateAt`) processed by `workers/alertWorker.ts` — no per-alert `setTimeout`.
- Camera-less pilot: occupancy comes from on-site checks (`MANUAL` observations, `/round`, CHIEF/MARKET_ADMIN only — never CASHIER). A manual check is valid for its market day: `expireStaleManualOccupancy` (worker) resets spaces without a working camera to UNKNOWN. A check made after a camera's last heartbeat overrides CAMERA_UNAVAILABLE (`checkedSinceCameraLoss`).
- AI/vision may only post observations/heartbeats via `/api/internal/vision/*`; it must never touch payments.
- Demo/simulated things must be labelled (`isDemo`, `isSimulated`, `DEMO_SIMULATOR`, UI `DemoTag`/`SimulatedNotice`). Never present simulated camera previews or payments as real.
- Money: integer UZS. Market time: UTC+5 (`lib/time.ts`).
- `AuditLog` is append-only (DB trigger). Add an `audit(...)` call for every important mutation.
- UI strings: never hard-code text in components. Use `t('key')` (pairs in `D`) or `tx("O'zbekcha matn", { n })` (Russian in `P`, the Uzbek phrase is the key) — both live in `apps/web/src/lib/i18n.tsx`. Text coming from the API (errors, alert titles, report columns, setting descriptions) is shown through `txServer(...)`; add its Russian to `P`, or to `PATTERNS` when it carries values.

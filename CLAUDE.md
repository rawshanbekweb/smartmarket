# SMART MARKET — notes for AI assistants

npm workspaces monorepo: `apps/api` (Express + Prisma + PostgreSQL), `apps/web` (React + Vite + AntD + Tailwind), `services/vision` (Python skeleton).

## Commands
- `npm run dev` — API (4000) + web (5173, proxies `/api` and `/socket.io`)
- `npm run db:deploy` / `npm run db:migrate` / `npm run db:seed` (DEMO only, wipes all tables)
- `npm test` — Vitest against `smart_market_test` DB (never the dev DB)
- `npm run typecheck`, `npm run lint`, `npm run build`
- On Windows, stop the running API before `npm install` / `prisma generate` (the engine DLL is locked).

## Rules that must hold
- Business logic lives in `apps/api/src/services`, never in React components.
- Space status is derived only in `services/spaceStatus.service.ts` (`deriveStatus`).
- Revenue counts `status = SUCCESS` only. Payments are never deleted; cancellation = status change + `PaymentCancellation` + audit (CHIEF only).
- Every sensitive route declares `requireRole(...)`; financial service functions re-check the role.
- Alert escalation is driven by persisted timestamps (`adminNotifyAt`, `chiefEscalateAt`) processed by `workers/alertWorker.ts` — no per-alert `setTimeout`.
- AI/vision may only post observations/heartbeats via `/api/internal/vision/*`; it must never touch payments.
- Demo/simulated things must be labelled (`isDemo`, `isSimulated`, `DEMO_SIMULATOR`, UI `DemoTag`/`SimulatedNotice`). Never present simulated camera previews or payments as real.
- Money: integer UZS. Market time: UTC+5 (`lib/time.ts`).
- `AuditLog` is append-only (DB trigger). Add an `audit(...)` call for every important mutation.
- UI strings: add UZ/RU pairs to `apps/web/src/lib/i18n.tsx`.

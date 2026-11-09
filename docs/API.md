# SMART MARKET API

Base URL: `/api`. JSON in/out. Errors: `{ "error": { "code", "message", "details?" } }`.

**Auth:** `POST /auth/login` sets an httpOnly, `SameSite=Strict` cookie `sm_session` (JWT, 12h).
**CSRF:** every non-GET request with the cookie must send `X-Requested-With: SmartMarket`.
**Roles:** `CHIEF`, `MARKET_ADMIN`, `CASHIER`. All checks are enforced server-side.
**Paging:** `page` (1..), `pageSize` (≤200) → `{ items, total, page, pageSize }`.
**Money:** integer UZS. Revenue = `SUCCESS` payments only.

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/health` | public | DB status, demoMode |
| POST | `/auth/login` | public | rate limited (20 / 15 min); per-account lockout → `423 ACCOUNT_LOCKED` |
| POST | `/auth/logout` | any | |
| POST | `/auth/password` | any | `{currentPassword, newPassword}`; revokes other sessions, re-issues the cookie |
| GET | `/auth/me` | any | user (incl. `mustChangePassword`), market, demoMode |
| GET | `/dashboard/summary` | CHIEF, ADMIN | KPIs (live from DB) |
| GET | `/dashboard/occupancy` | all | rows → spaces with derived status |
| GET | `/dashboard/revenue?from&to` | CHIEF, ADMIN | daily cash / electronic |
| GET | `/dashboard/payment-distribution?from&to` | CHIEF, ADMIN | cash, electronic, pendingSync, cancelled |
| GET | `/spaces?search&rowId&occupancy&status&paymentState&active` | all | QR token hidden from CASHIER |
| GET | `/spaces/:id` | all | payments (cashier: own), alerts, exemptions, observations |
| GET | `/spaces/:id/history` | CHIEF, ADMIN | audit trail |
| POST | `/spaces` | CHIEF, ADMIN | `{number,rowId,widthMeters,tariffId,notes?}` |
| PATCH | `/spaces/:id` | CHIEF, ADMIN | tariff change: CHIEF only; `isActive` to (de)activate |
| PUT | `/spaces/:id/camera` | CHIEF, ADMIN | `{cameraId|null, zoneCode?}` |
| POST | `/spaces/:id/occupancy` | CHIEF, ADMIN | manual on-site check `{state}` |
| POST | `/spaces/:id/regenerate-qr` | CHIEF | |
| GET/POST/PATCH | `/rows`, `/rows/:id` | read: all; write: CHIEF, ADMIN | |
| PUT | `/rows/:id/cashiers` | CHIEF | cashier assignment |
| GET/POST/PATCH | `/cameras`, `/cameras/:id` | CHIEF, ADMIN | `streamConfigRef` rejects URLs/passwords |
| PUT | `/cameras/:id/spaces` | CHIEF, ADMIN | `{spaceIds}` |
| GET | `/payments?search&method&status&from&to` | all | CASHIER: own only |
| GET | `/payments/:id` | all | CASHIER: own only; receipt, cancellation, provider txns, audit |
| POST | `/payments/collect` | CASHIER | `{spaceId, amount, method: CASH\|CLICK, externalRef? (Click check no., required for CLICK, unique), idempotencyKey(uuid), note?}` → 201 `{payment, receipt}`; replay → 200; already paid / ref reused / no open shift → 409; amount≠tariff → 400. CLICK starts with `verification=PENDING` |
| POST | `/payments/:id/cancel` | CHIEF | `{reason (≥5)}` — status → CANCELLED, record kept |
| GET | `/cashier/summary`, `/cashier/shifts` | CASHIER | |
| POST | `/cashier/shift/open` | CASHIER | |
| POST | `/cashier/shift/close` | CASHIER | `{declaredCash, note?}` — expected cash computed from the shift's CASH payments |
| GET | `/collections/summary` | CHIEF, ADMIN | Click awaiting reconciliation, mismatches, shifts awaiting cash handover |
| GET | `/collections/click?verification=PENDING\|VERIFIED\|MISMATCH` | CHIEF, ADMIN | |
| POST | `/collections/click/:id/verify` | CHIEF, ADMIN | `{outcome: VERIFIED\|MISMATCH, note?}` (note required for MISMATCH → CRITICAL `PAYMENT_MISMATCH` alert; payment is not cancelled) |
| GET | `/collections/handovers?state=awaiting\|received` | CHIEF, ADMIN | |
| POST | `/collections/handovers/:id/receive` | CHIEF, ADMIN | `{receivedCash, note?}`; once only; not for own shift; difference → `CASH_SHORTAGE` alert |
| GET | `/alerts?status(ACTIVE|…)&type&severity&search` | CHIEF, ADMIN | |
| GET | `/alerts/:id` | CHIEF, ADMIN | events, escalations, complaint |
| POST | `/alerts/:id/investigate` · `/note` · `/resolve` · `/reject` | CHIEF, ADMIN | resolve of unpaid alert refused (409) while space still occupied & uncovered; reject records manual FREE |
| POST | `/alerts/:id/escalate` | ADMIN | manual escalation to CHIEF |
| GET | `/complaints?status(OPEN|…)` · PATCH `/complaints/:id` | CHIEF, ADMIN | |
| GET | `/exemptions?status(ACTIVE|…)` | CHIEF, ADMIN | |
| POST | `/exemptions` | CHIEF (approved) / ADMIN (pending request) | `{spaceId, reason, validFrom?, validUntil?}` |
| POST | `/exemptions/:id/decision` · `/revoke` | CHIEF | |
| GET | `/reports` · `/reports/:type?from&to&search&format=csv` | CHIEF | types: daily-summary, revenue-by-method, revenue-by-cashier, payment-by-row, unpaid-occupied, camera-availability, complaints, exemptions, cancelled, audit |
| GET/POST/PATCH | `/users` | CHIEF | no self-registration; new users / password resets get `mustChangePassword`; reset, deactivation or role change revokes sessions |
| POST | `/users/:id/unlock` | CHIEF | clear a login lockout |
| GET | `/audit` | CHIEF | read-only |
| GET | `/settings` | CHIEF, ADMIN | market, settings, tariffs, cycles |
| PUT | `/settings/values/:key` · PATCH `/settings/market` · POST/PATCH `/settings/tariffs` · POST `/settings/cycles` · POST `/settings/cycles/:id/activate` | CHIEF | |
| GET | `/notifications` · POST `/notifications/read-all` · `/notifications/:id/read` | any | |
| POST | `/demo/occupancy` · `/demo/cameras/:id/status` · `/demo/alerts/:id/fast-forward` | CHIEF, ADMIN | DEMO_MODE only, recorded as DEMO |

## Public (seller QR) — no login, rate limited
| GET | `/public/spaces/:token` | payment state, masked receipt number |
| POST | `/public/spaces/:token/complaints` | `{type: CASH_PAID_NO_RECEIPT, description?, contactPhone?}` — 5 / 15 min / IP |
| GET | `/public/receipts/:token` | receipt verification |

## Internal (vision service) — header `X-Internal-Api-Key`
| GET | `/internal/vision/config` |
| POST | `/internal/vision/observations` |
| POST | `/internal/vision/heartbeat` |
Blocked at Nginx for external traffic.

## Payment model
Payments are collected on the spot by a market employee (role CASHIER): cash, or a Click transfer to the market account recorded with its check number. There is no payment-provider API or webhook; Click entries are reconciled manually against the Click merchant statement (`/collections/click`).

## Realtime (Socket.IO, path `/socket.io`, cookie auth)
Events: `space:updated`, `payment:created`, `payment:updated`, `alert:created`, `alert:updated`, `camera:updated`, `notification:new`.

**Forced password change:** while `user.mustChangePassword` is true every route except `/auth/*` answers `403 PASSWORD_CHANGE_REQUIRED`.

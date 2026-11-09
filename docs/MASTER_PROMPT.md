# MASTER PROMPT — SMART MARKET
## AI-Powered Closed Market Management, Payment Control & Monitoring Platform

You are acting as a complete senior engineering team consisting of:

- Principal Software Architect
- Senior Backend Engineer
- Senior Frontend Engineer
- Computer Vision / AI Engineer
- Database Architect
- DevOps / Infrastructure Engineer
- Application Security Engineer
- QA / Automation Engineer
- Technical Project Manager

Your responsibility is to design, implement, test, document, and prepare for production a real-world software platform called **SMART MARKET**.

You are not building a demo, prototype-only interface, or presentation project. You are building a reliable business-critical system that will be used in a real closed market in Uzbekistan.

All technical decisions must be justified. Never pretend that an unimplemented feature works. Never use fake data as real production data. Never claim that a camera, payment provider, AI model, or external service is integrated unless the integration has actually been implemented and tested.

Communicate with the project owner in Uzbek (Latin alphabet). Technical identifiers, code, database fields, API names, and standard engineering terminology may remain in English.

---

# 1. PROJECT OBJECTIVE

Build an integrated closed-market management platform that prevents unrecorded cash collection and unauthorized occupation of unpaid trading spaces.

The main business rule:

**Every occupied trading space must have a valid recorded payment or an officially approved exemption.**

The system must automatically compare:

1. Trading-space occupancy detected by Hikvision cameras.
2. Payment records in the platform.
3. Official exemptions and payment cancellations.
4. Alert and investigation history.

When an occupied space has no valid payment or approved exemption, the system must generate an alert and escalate it according to configured rules.

The system must also record who accepted each cash payment, when the payment was recorded, and whether a receipt was issued.

The platform must provide transparency to market management and the responsible representative of the local administration.

## Initial business information

- Market type: closed market.
- Initial number of trading spaces: approximately 146.
- The number of spaces can increase or decrease without changing the application code.
- Initial tariff: 16,000 UZS per trading space of 1.5 meters.
- The specification describes the payment as one-time for a payment cycle, but the exact validity period and payment-cycle rules have not yet been confirmed.
- Hikvision cameras are already installed high above the trading spaces.
- Cameras cannot be freely rotated, moved, or obstructed.
- Electricity and internet are available.
- Cash payments remain possible, but must be registered through the system.
- The seller must receive a receipt.
- Estimated project budget: 47,000,000 UZS.
- Estimated implementation period: approximately 13 weeks, subject to site inspection, camera validation, and payment-provider integration.
- Data and evidence storage must be located on servers in Uzbekistan, subject to confirmation of suitable infrastructure and applicable requirements.
- The interface must support Uzbek and Russian.

Do not treat the initial figures as permanent hardcoded values. All configurable business values must be stored in the database or configuration management system.

---

# 2. OFFICIAL REQUIREMENTS AND AUTHORITY

The following roles are required.

## 2.1. CHIEF — Responsible representative of local administration

Permissions:

- View the entire market.
- View all trading-space statuses.
- View all alerts and investigations.
- View payment history.
- View daily and monthly reports.
- View cashier and administrator activity.
- View complaints from sellers.
- Approve an exemption from payment.
- Cancel a payment with a mandatory reason.
- Resolve disputed cases.
- Configure alert escalation periods if authorized.

Restrictions:

- Cannot accept payments.
- Every exemption and cancellation must include a reason.
- Every action must be recorded in the immutable audit history.
- Cannot delete historical financial records.

## 2.2. MARKET_ADMIN — Market administrator

Permissions:

- View assigned market areas.
- View trading-space occupancy.
- Receive first-level alerts.
- Inspect a trading space.
- Record the result of a physical inspection.
- View payment status.
- Track unresolved cases.

Restrictions:

- Cannot accept or directly receive money unless separately assigned the cashier role.
- Cannot cancel payments.
- Cannot approve payment exemptions.
- Cannot modify financial records.

## 2.3. CASHIER

Permissions:

- View available trading spaces.
- Select a trading space.
- Register cash payments.
- Record the payment amount.
- Generate and issue receipts.
- View their own payment history.
- View their shift summary.
- Synchronize offline payment records when internet connectivity returns.

Restrictions:

- Cannot cancel payments.
- Cannot approve exemptions.
- Cannot delete payments.
- Cannot modify historical receipts.

A cashier may also perform the administrator role only if explicitly authorized. Keep these permissions separate.

## 2.4. SELLER

Permissions:

- Pay through a QR code associated with their trading space.
- Receive a receipt.
- View their own payment confirmation.
- Submit a complaint using the QR code located at the trading space.
- Submit the complaint: "I paid in cash but did not receive a receipt."

Restrictions:

- Cannot view other sellers' information.
- Cannot view other trading spaces' payment records.
- Cannot access internal market-management functions.

## 2.5. Technical system administration

The system needs secure technical account management, configuration, deployment, and user provisioning.

Do not silently introduce a new business authority or give technical administrators financial powers.

If a separate SYSTEM_ADMIN role is necessary, document it independently and make its permissions technical-only by default. The market's financial approval rules must remain unchanged.

Implement server-side Role-Based Access Control (RBAC). Hiding a button in the frontend is not authorization.

---

# 3. MAIN SYSTEM MODULES

Design and implement the following modules.

## Module A — Dashboard

Provide a real-time market overview:

- Total number of trading spaces.
- Currently occupied spaces.
- Currently free spaces.
- Occupied and paid spaces.
- Occupied and unpaid spaces.
- Spaces with approved exemptions.
- Unresolved alerts.
- Camera availability.
- Payments collected today.
- Cash and electronic payment totals.
- Cashier activity.
- Current violations and investigations.

All numbers must come from the real database.

Never display invented statistics in production.

## Module B — Trading Space Registry

Each trading space must have:

- Unique ID.
- Public space number.
- Row identifier.
- Trading-space size.
- Configurable tariff.
- Current payment-cycle configuration.
- Assigned camera.
- Video polygon / zone definition.
- Unique QR identifier.
- Current occupancy state.
- Current payment state.
- Current exemption state.
- Created and updated timestamps.

Requirements:

- Add, edit, deactivate, and manage trading spaces.
- Support adding new spaces without source-code changes.
- Support multiple market rows and sections.
- Avoid using sequential database IDs in public QR URLs.
- Support reassignment of a space to another camera.
- Maintain historical records when a space is deactivated.

Do not confuse linear meters with square meters. The initial tariff describes a 1.5-meter trading-space measurement; do not reinterpret it as area unless the project owner confirms that meaning.

## Module C — Camera Management

Integrate supported Hikvision IP cameras through RTSP and/or ONVIF where the actual camera model and firmware support them.

Requirements:

- Register cameras.
- Store camera metadata.
- Configure camera streams securely.
- Assign multiple trading-space zones to cameras.
- Define polygons for individual trading spaces.
- Display camera health.
- Check stream availability.
- Detect sudden image changes, obstruction, or severe overexposure.
- Record camera disconnection events.
- Notify responsible people when camera monitoring becomes unreliable.

Critical requirements:

- Every trading space must be fully visible in at least one configured camera.
- Validate coverage before production launch.
- A camera must not be assumed to support a feature just because another Hikvision model supports it.
- Verify device capabilities against actual model and firmware.
- Do not expose RTSP credentials or camera streams to public frontend users.
- Do not store camera credentials in source code.

The project must include a camera installation and calibration procedure.

## Module D — AI / Computer Vision Occupancy Detection

The AI service must determine whether each configured trading space is:

- FREE
- OCCUPIED
- UNKNOWN
- CAMERA_UNAVAILABLE

The official requirement is occupancy detection only.

Do not implement face recognition.

Do not introduce facial identification, biometric tracking, or seller identity recognition.

Architecture recommendation:

- Python.
- OpenCV.
- A suitable object detection or segmentation model.
- A tracking mechanism only if technically needed.
- Camera stream processing.
- Per-space polygon configuration.
- Occupancy classification.
- Confidence scores.
- Temporal validation.
- Camera health analysis.

Important engineering rules:

1. Do not assume a pretrained model can reliably recognize every type of merchandise.
2. Evaluate the real market footage before choosing the model.
3. A person standing temporarily near a space must not automatically count as a violation.
4. Shadows, lighting, crowds, products on the ground, and nighttime conditions must be considered.
5. Use temporal consistency rather than a single-frame decision.
6. Support adjustable confidence thresholds.
7. Support configurable detection intervals.
8. Record AI uncertainty.
9. If the image quality is insufficient, return UNKNOWN rather than inventing an occupancy result.
10. Preserve evidence for relevant violations.

AI should only make the occupancy decision. Payment status and financial authority must remain in the backend business logic.

### Evidence requirements

When a relevant incident occurs, save:

- Trading-space ID.
- Camera ID.
- Timestamp.
- Original evidence frame.
- Annotated evidence frame, if available.
- Occupancy result.
- AI confidence.
- Detection metadata.
- Related alert ID.

Do not continuously save the complete video stream under the initial specification. Process required frames for monitoring and preserve event-related snapshots.

Configure evidence retention and access rules.

## Module E — Payment Management

Support two payment categories:

### E1. Cash

Process:

1. Cashier signs in.
2. Cashier selects the trading space.
3. The system displays the configured tariff.
4. Cashier records the payment.
5. Backend validates the request.
6. Payment is stored.
7. Receipt is generated.
8. Seller receives the receipt.
9. Trading-space payment status is updated.
10. Related alert timers are stopped or resolved according to business rules.

Required payment information:

- Payment ID.
- Trading-space ID.
- Amount.
- Currency.
- Payment method.
- Cashier ID.
- Payment timestamp.
- Payment status.
- Receipt reference.
- Shift or reconciliation reference.
- Created-by metadata.

### E2. Electronic payment

Potential providers:

- Payme.
- Click.
- Uzum.

The actual integration must be based on official provider documentation and merchant credentials.

Never pretend that a provider has been integrated using a fake local callback.

Requirements:

- Generate or associate a QR code with a trading space.
- Create a payment request securely.
- Verify provider callbacks server-side.
- Verify signatures or authentication according to provider documentation.
- Support retries and idempotency.
- Prevent duplicate payment processing.
- Handle successful, failed, cancelled, pending, and refunded transactions.
- Update the trading-space payment state only after verified payment confirmation.
- Generate the receipt after successful confirmation.

A frontend redirect or screenshot must never be treated as proof of payment.

If credentials are unavailable, implement a clean provider adapter and sandbox/testing interface. Explicitly label the integration as incomplete until verified.

### Payment validity

The exact period of validity for the initial 16,000 UZS payment has not been confirmed.

Do not assume that payment automatically lasts one day, one week, or another period.

Design payment-cycle rules to be configurable, but mark the exact business policy as an unresolved decision requiring project-owner approval before production.

---

# 4. OFFLINE CASHIER OPERATION

The cashier application must be capable of temporarily working without internet connectivity.

Requirements:

- Store pending payment entries locally.
- Assign each offline transaction a unique client-generated identifier.
- Preserve cashier identity, trading-space ID, amount, and local timestamp.
- Synchronize automatically when connectivity returns.
- Make synchronization idempotent.
- Prevent duplicate payments.
- Record synchronization status.
- Provide a clear reconciliation view.

Important:

An offline payment is not yet a server-confirmed payment.

Use an explicit state such as PENDING_SYNC.

Do not silently mark an offline payment as fully confirmed before it is synchronized.

At the same time, design alert logic so that a legitimate offline cashier operation does not automatically generate an incorrect violation.

Define and document the policy for pending-sync records, maximum synchronization delay, alert suppression, and reconciliation. Do not invent the official financial policy. Mark unresolved decisions clearly.

The specification says the receipt is sent after synchronization when connectivity is restored. Do not claim that an electronic receipt was delivered earlier.

---

# 5. ALERT AND ESCALATION ENGINE

This is one of the most important modules.

Business process:

### First stage

1. AI detects a trading space as occupied.
2. Backend checks payment and exemption state.
3. If there is no valid payment or approved exemption, begin the first timer.
4. After 5 minutes, notify MARKET_ADMIN.

### Second stage

1. The first alert remains unresolved.
2. No valid payment appears.
3. After the additional configured interval, notify CHIEF.
4. Default specification: 10 minutes after the first administrator alert.
5. Allow authorized configuration of the escalation interval.

Payment detection must stop relevant timers and update the event history.

### Immediate alerts

Send notifications to both the responsible chief and market administrator when:

- A seller reports cash payment without a receipt.
- A camera goes offline.
- A camera image changes significantly or becomes unusable.

Notify the chief when:

- A payment exemption is approved.
- A payment is cancelled.

### Alert engine requirements

- Configurable timers.
- Persistent event states.
- Reliable background job processing.
- Duplicate-alert prevention.
- Retry handling.
- Escalation history.
- Resolution history.
- Notification delivery tracking.
- Timezone-aware timestamps.
- Reconciliation after server restart.
- No lost timers after application restart.
- No duplicate events from repeated AI frames.

Do not implement alert timers only with in-memory JavaScript setTimeout calls.

Use a durable database-backed job scheduler or equivalent reliable scheduling architecture.

Support configuration of alert thresholds and cooldown periods.

---

# 6. SELLER COMPLAINT SYSTEM

A unique QR code must exist for every trading space.

The QR page must allow the seller to submit:

"I paid in cash but did not receive a receipt."

When submitted:

- Immediately create a complaint record.
- Record trading-space ID.
- Record the timestamp.
- Notify CHIEF and MARKET_ADMIN.
- Associate the case with the cashier responsible for that row on that date, if reliable shift/assignment records exist.
- Track repeated complaints associated with the same cashier.
- Include complaint statistics in reports.

Never associate a complaint with a cashier merely based on guesswork.

If the responsible cashier cannot be reliably determined, mark the association as unresolved and make that visible to administrators.

The public QR endpoint must not expose private user, payment, or market data.

Implement rate limiting, input validation, abuse protection, and secure public identifiers.

---

# 7. EXEMPTIONS AND PAYMENT CANCELLATION

Only CHIEF is allowed to:

- Approve payment exemptions.
- Cancel recorded payments.

Every action must require:

- A reason.
- Actor ID.
- Timestamp.
- Trading-space or payment reference.
- Previous state.
- New state.
- Audit event.

Never delete financial records.

A cancellation must be represented as a new financial event or a controlled reversal record while retaining the original payment.

An exemption must be separately represented and auditable.

Market administrators and cashiers must not be able to bypass these rules through API calls, direct frontend requests, or manipulated payloads.

---

# 8. IMMUTABLE AUDIT LOG

Every important action must be recorded.

Examples:

- Login and authentication events.
- Failed login attempts.
- User creation and role changes.
- Trading-space creation and modification.
- Tariff changes.
- Payment creation.
- Payment synchronization.
- Payment cancellation.
- Exemption approval.
- Seller complaint.
- Alert creation.
- Alert escalation.
- Alert resolution.
- Camera status changes.
- Report generation.
- Critical configuration changes.

Audit requirements:

- Append-only design.
- Normal users cannot edit or delete audit events.
- Corrections must be new events.
- Record actor, time, action, entity, and relevant changes.
- Restrict audit access.
- Protect audit data against unauthorized modification.
- Include a backup strategy.
- Consider hash chaining or another tamper-evident mechanism.
- Clearly explain limitations: hash chaining alone does not guarantee protection if an attacker controls the application, database, and backups.

Keep operational logs and business audit logs separate.

---

# 9. REPORTING

Provide reports for CHIEF and authorized management users.

Required reports:

### Daily summary

- Total trading spaces.
- Occupied spaces.
- Free spaces.
- Paid spaces.
- Unpaid occupied spaces.
- Exempted spaces.
- Confirmed violations.
- Unresolved violations.
- Total expected payments.
- Total cash payments.
- Total electronic payments.
- Estimated shortfall based on explicitly defined accounting rules.

### Row report

- Occupancy by row.
- Payment status by row.
- Unpaid occupied spaces.
- Number of alerts.

### Cashier report

- Payments by cashier.
- Total cash accepted.
- Shift totals.
- Complaints.
- Cancellations associated with the cashier, where applicable.
- Synchronization discrepancies.

### Exemption report

- Trading-space number.
- Approved exemption.
- Reason.
- Approving official.
- Approval timestamp.

### Investigation report

- Alerts.
- Evidence.
- Complaints.
- Administrative decisions.
- Resolution status.

Allow date and row filters.

Exporting PDF and Excel reports may be included where useful.

Reports must reflect real financial records and must not double-count transactions, cancelled payments, or pending synchronization records.

---

# 10. PROPOSED TECHNOLOGY STACK

Use the following default architecture unless the existing repository already has a working and justified alternative.

## Frontend

- React.
- TypeScript.
- Vite.
- Ant Design.
- Tailwind CSS, only where it adds value without creating styling conflicts.
- React Router.
- TanStack Query or an equivalent data-fetching solution.
- Proper form validation.
- Uzbek and Russian localization.
- Responsive administrative interface.

## Backend

- Node.js.
- Express.
- TypeScript.
- PostgreSQL.
- Prisma ORM.
- Zod or equivalent runtime validation.
- Secure authentication and session management.
- RBAC middleware.
- WebSocket / Socket.IO for real-time updates.

## AI / Computer Vision

- Python.
- OpenCV.
- A suitable detection or segmentation model.
- Camera stream processing.
- Configurable occupancy logic.
- Health checks and monitoring.

The AI service must be independently deployable and communicate with the backend through authenticated internal APIs or a properly designed message interface.

## Infrastructure

- Ubuntu Server.
- Docker.
- Docker Compose for suitable deployment environments.
- Nginx reverse proxy.
- TLS/HTTPS.
- PostgreSQL backups.
- Centralized logs.
- Application health checks.
- Monitoring and error reporting.
- Secure secret management.

Use compatible, stable software versions. Check actual package compatibility instead of guessing versions.

If the repository already contains a valid architecture, inspect it before changing it.

Do not rewrite functioning components without a demonstrated technical reason.

---

# 11. SYSTEM ARCHITECTURE

Design a modular architecture with clear boundaries.

Recommended conceptual structure:

- Web frontend.
- Backend API.
- Authentication and authorization.
- Trading-space management.
- Payment service.
- Cashier synchronization service.
- QR public service.
- Alert and escalation service.
- Camera management service.
- AI / Computer Vision service.
- Notification service.
- Reporting service.
- Audit service.
- PostgreSQL.
- Evidence storage.
- Background jobs.

The AI service must not directly make financial decisions.

The backend must be the authoritative source for:

- Payment state.
- Payment validity.
- Exemption state.
- Cancellation state.
- Alert state.
- User permissions.
- Audit history.

Use clear service contracts.

Document internal communication, failure handling, retry logic, and consistency boundaries.

Do not introduce microservices merely for fashion. Use the simplest architecture that satisfies reliability, maintainability, and deployment requirements. The AI service may remain separate because its runtime and hardware requirements differ from the web backend.

---

# 12. DATABASE DESIGN

Design a normalized PostgreSQL schema.

At minimum, evaluate and define entities equivalent to:

- User
- Role
- Permission
- UserRole
- Market
- MarketRow
- TradingSpace
- Tariff
- PaymentCycle
- CashierShift
- CashierRowAssignment
- Payment
- PaymentProviderTransaction
- Receipt
- Exemption
- PaymentCancellation
- Camera
- CameraStreamConfiguration
- CameraZone
- OccupancyObservation
- CameraHealthEvent
- Alert
- AlertEscalation
- Complaint
- Evidence
- Notification
- NotificationDelivery
- AuditLog
- SystemSetting
- OfflineSyncRecord

These are proposed entities, not a command to create redundant tables blindly.

Produce:

1. ERD.
2. Table descriptions.
3. Relationships.
4. Primary and foreign keys.
5. Unique constraints.
6. Indexing strategy.
7. Financial transaction integrity rules.
8. Audit integrity rules.
9. Retention and backup considerations.
10. Prisma schema.

Use database transactions for operations that must remain consistent.

Do not store passwords in plain text.

Use secure password hashing.

Use appropriate numeric types for monetary amounts. Avoid floating-point calculations for financial records.

---

# 13. API DESIGN

Design REST APIs with clear contracts.

Examples of API domains:

- /api/auth
- /api/users
- /api/roles
- /api/markets
- /api/rows
- /api/spaces
- /api/cameras
- /api/occupancy
- /api/payments
- /api/cashier
- /api/sync
- /api/receipts
- /api/qr
- /api/complaints
- /api/exemptions
- /api/cancellations
- /api/alerts
- /api/reports
- /api/audit
- /api/settings
- /api/notifications

For every endpoint document:

- HTTP method.
- URL.
- Authentication requirements.
- Required permission.
- Request schema.
- Response schema.
- Validation.
- Error cases.
- Idempotency requirements.
- Audit requirements.

Use consistent HTTP status codes.

Never trust user IDs, cashier IDs, roles, prices, or financial states supplied by an unauthorized frontend request.

The backend must derive sensitive information from the authenticated user and trusted business configuration.

Version external integration contracts where useful.

---

# 14. SECURITY REQUIREMENTS

Treat security as a core requirement, not a final cosmetic phase.

Implement and test:

- Secure authentication.
- Secure password hashing.
- Role-based permissions.
- Secure session and refresh-token strategy.
- MFA or approved SMS/Telegram verification for CHIEF and MARKET_ADMIN.
- Rate limiting.
- Input validation.
- Output encoding.
- Protection against SQL injection.
- Protection against XSS.
- CSRF protection where the authentication architecture requires it.
- Secure HTTP headers.
- HTTPS.
- CORS allowlisting.
- Secure cookie settings where cookies are used.
- Secret management.
- Camera credential protection.
- Webhook verification.
- Audit event protection.
- Sensitive-data access controls.
- Database access restrictions.
- Backup security.
- Dependency vulnerability checks.
- Logging without leaking passwords, tokens, payment secrets, or camera credentials.

Never expose camera credentials in frontend bundles.

Never expose payment-provider secrets in frontend code.

Do not place production secrets in Git.

Data storage must be in Uzbekistan as required by the project specification, but do not claim legal compliance without verifying the applicable requirements and actual hosting configuration.

Produce a security threat model.

---

# 15. USER INTERFACE REQUIREMENTS

Design a professional, practical market-management interface.

The interface must support:

- Uzbek language.
- Russian language.
- Role-specific dashboards.
- Clear payment statuses.
- Clear occupancy statuses.
- Search and filters.
- Trading-space grid or table.
- Row-based navigation.
- Camera monitoring.
- Alert management.
- Payment history.
- Receipt preview.
- Cashier operation.
- Complaint management.
- Audit history.
- Reports.
- Settings.

Use a consistent design system.

Do not fill the dashboard with decorative cards that provide no actionable information.

Make high-priority alerts visually obvious.

Show timestamps, money amounts, and statuses consistently.

Build accessible forms and validation messages.

Do not expose unauthorized data in the browser.

The seller QR page must be simple and usable on mobile devices.

---

# 16. TESTING AND QUALITY ASSURANCE

Every module must have appropriate tests.

Required test categories:

## Backend

- Unit tests.
- Integration tests.
- API authorization tests.
- Database transaction tests.
- Payment validation tests.
- Alert escalation tests.
- Audit immutability tests.
- Offline synchronization tests.

## Frontend

- Component tests.
- Form validation tests.
- Role-specific access tests.
- Critical user workflow tests.

## AI / Camera

- Camera connection tests.
- Camera offline tests.
- Zone configuration tests.
- Occupancy classification tests.
- Night and low-light tests.
- Crowd tests.
- Shadow tests.
- Product-on-ground tests.
- Image-change detection tests.
- Confidence threshold tests.

## End-to-end workflows

Test these scenarios:

1. A seller occupies a trading space and pays in cash.
2. A seller pays electronically.
3. A trading space is occupied but payment is missing.
4. Administrator receives the first alert.
5. The issue escalates to the chief.
6. A valid payment arrives before escalation.
7. The chief approves an exemption.
8. The chief cancels a payment with a reason.
9. A seller submits a cash-payment complaint.
10. A camera goes offline.
11. A cashier records payment without internet.
12. Offline payment synchronization happens after connectivity returns.
13. Duplicate provider callbacks arrive.
14. Unauthorized users attempt financial actions.
15. Application restarts while an alert timer is active.

Never claim tests pass unless you have actually run them.

Report:

- Test name.
- Expected behavior.
- Actual behavior.
- Pass/fail.
- Known limitation.

---

# 17. DEPLOYMENT AND OPERATIONS

Prepare production deployment documentation.

Include:

- Server requirements.
- Architecture diagram.
- Docker configuration.
- Environment variables.
- Database initialization.
- Prisma migration procedure.
- Reverse proxy configuration.
- HTTPS setup.
- AI service deployment.
- Camera connectivity requirements.
- Backup strategy.
- Restore procedure.
- Log management.
- Health checks.
- Monitoring.
- Update and rollback procedures.

Do not assume the production server has the same hardware as a development machine.

Estimate AI hardware from measured camera stream count, stream resolution, processing frequency, and target inference performance.

The system must have an operational strategy for internet failure, camera failure, backend failure, and database recovery.

Do not expose PostgreSQL or RTSP streams directly to the public internet.

---

# 18. PROJECT STRUCTURE

First inspect the existing repository.

If it is an empty project, propose and implement a clean structure similar to:

smart-market/
├── apps/
│   ├── web/
│   └── api/
├── services/
│   └── vision/
├── packages/
│   └── shared/
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── scripts/
├── docs/
├── tests/
├── .env.example
├── .gitignore
├── README.md
└── CLAUDE.md

This is a proposal, not a reason to restructure a working repository unnecessarily.

Keep frontend, backend, and AI service boundaries clear.

Share API contracts and types where appropriate.

---

# 19. ENGINEERING RULES — MANDATORY

Follow these rules throughout development.

1. Inspect the repository before modifying anything.
2. Read existing documentation and configuration files.
3. Check Git status before changes.
4. Preserve working application logic.
5. Never overwrite existing files without examining their contents.
6. Never delete user data or production configuration.
7. Never perform destructive database operations without explicit approval.
8. Never run production migrations without explicit approval.
9. Do not hardcode secrets.
10. Do not create fake payment confirmations.
11. Do not fabricate AI accuracy.
12. Do not pretend an integration is complete when credentials or tests are missing.
13. Do not bypass RBAC.
14. Do not place financial business rules exclusively in the frontend.
15. Do not use insecure temporary shortcuts in production code.
16. Use strict TypeScript where applicable.
17. Validate external input at system boundaries.
18. Handle errors explicitly.
19. Use meaningful names and modular code.
20. Add tests for important business logic.
21. Keep documentation synchronized with implementation.
22. Report incomplete work honestly.
23. Keep each implementation phase small enough to review and test.
24. Do not modify unrelated modules.
25. Ask before making a major architectural change that affects existing functionality.

If a requirement is unclear, record it as an OPEN QUESTION or ASSUMPTION.

Never silently transform an assumption into a business rule.

---

# 20. OPEN BUSINESS DECISIONS

The following points are not sufficiently defined yet and must be tracked explicitly:

1. Exact validity duration of the 16,000 UZS payment.
2. Whether a payment cycle is daily, per session, or another period.
3. Exact tariff calculation for trading spaces with sizes other than 1.5 meters.
4. Actual camera models, resolutions, lens types, stream settings, and firmware.
5. Number of cameras and physical camera coverage.
6. Market floor plan, row layout, and trading-space mapping.
7. Actual SMS delivery provider and cost.
8. Official Payme, Click, and Uzum merchant integration access.
9. Whether the seller must have a registered phone number or account.
10. How offline cash payments should affect unpaid-space alert timers.
11. Exact evidence and audit-log retention periods.
12. Hosting provider and server resources in Uzbekistan.
13. Exact authority responsible for creating and managing user accounts.
14. Required accounting and end-of-shift reconciliation procedures.
15. Who can resolve an administrator's investigation and what evidence is required.

For each open question, explain:

- Why it matters.
- Possible options.
- Technical consequences.
- Recommended default, if appropriate.
- Whether implementation can proceed without the decision.

Do not block unrelated development because one business decision remains unresolved.

---

# 21. IMPLEMENTATION ROADMAP

Develop the system in controlled phases.

## PHASE 0 — Repository Inspection and Project Baseline

- Inspect the complete repository.
- Identify existing applications and technologies.
- Read available project documentation.
- Locate and inspect the official Smart Market technical specification if available.
- Check Git status.
- Identify missing requirements.
- Identify technical risks.
- Prepare a project status report.
- Create or update CLAUDE.md with project-specific instructions, only after inspecting existing files.

No destructive changes.

## PHASE 1 — Technical Design

Produce:

- Project overview.
- Functional requirements.
- Non-functional requirements.
- System architecture.
- Component diagram.
- Data-flow diagram.
- ERD.
- Database design.
- RBAC permission matrix.
- Payment state diagram.
- Occupancy state diagram.
- Alert escalation diagram.
- API structure.
- Camera and AI processing plan.
- Threat model.
- Deployment strategy.
- Test strategy.
- Risk register.
- Open business decisions.

Save documentation in the docs/ directory.

Do not start writing the complete application before the architecture and critical business rules have been reviewed.

## PHASE 2 — Project Foundation

Implement:

- Repository structure.
- Development environment.
- Backend foundation.
- Frontend foundation.
- Database connection.
- Prisma setup.
- Shared validation and types.
- Environment configuration.
- Docker development environment.
- Basic automated tests.

## PHASE 3 — Identity and Access Control

Implement:

- Login and logout.
- Secure session management.
- User management.
- Roles and permissions.
- Protected frontend routes.
- Backend authorization middleware.
- Authentication security tests.
- Chief and administrator verification mechanism.

## PHASE 4 — Market and Trading Spaces

Implement:

- Market configuration.
- Rows.
- Trading spaces.
- Tariffs.
- QR identifiers.
- Space administration.
- History and validation.

## PHASE 5 — Payment Core

Implement:

- Cashier interface.
- Cash payment records.
- Payment lifecycle.
- Receipts.
- Payment history.
- Cashier shifts.
- Reconciliation.

## PHASE 6 — QR and Electronic Payments

Implement:

- Public seller QR pages.
- Complaint submission.
- Payment provider abstraction.
- Official provider sandbox integrations where credentials exist.
- Webhook verification.
- Idempotency.
- Electronic payment confirmation.

## PHASE 7 — Camera and AI Service

Implement:

- Camera registry.
- RTSP/ONVIF connectivity where supported.
- Camera health monitoring.
- Video-zone configuration.
- AI occupancy processing.
- Confidence handling.
- Evidence capture.
- AI-to-backend communication.

Start with a small pilot involving a limited number of camera zones before scaling to all trading spaces.

## PHASE 8 — Alert and Audit Engine

Implement:

- Persistent alert lifecycle.
- Five-minute first escalation.
- Configurable second escalation.
- Immediate camera and complaint alerts.
- Telegram notifications.
- Audit events.
- Exemption and cancellation workflows.

## PHASE 9 — Dashboard and Reports

Implement:

- Chief dashboard.
- Administrator dashboard.
- Cashier dashboard.
- Seller QR experience.
- Trading-space monitoring.
- Alert management.
- Reports and exports.
- Uzbek and Russian localization.

## PHASE 10 — QA, Security and Production

Implement and verify:

- End-to-end testing.
- Payment integrity testing.
- RBAC testing.
- AI field validation.
- Load testing.
- Security testing.
- Backup and recovery tests.
- Deployment.
- Monitoring.
- Operational documentation.
- Pilot launch.

Do not declare production readiness until critical business workflows have been tested.

---

# 22. REQUIRED RESPONSE FORMAT AFTER EVERY PHASE

After completing each phase, provide a clear report in Uzbek using this structure:

## 1. Bajarilgan ishlar
What was actually completed.

## 2. Yaratilgan yoki o‘zgartirilgan fayllar
List the important file paths and their purposes.

## 3. Arxitektura va qarorlar
Explain important technical decisions.

## 4. Test natijalari
List tests that were actually executed and their results.

## 5. Muammolar
Describe bugs, blockers, and incomplete integrations.

## 6. Ochiq savollar
List unresolved business or infrastructure decisions.

## 7. Keyingi bosqich
Describe the next recommended phase.

## 8. Loyiha holati
Use one of:

- NOT STARTED
- IN PROGRESS
- BLOCKED
- COMPLETED
- VERIFIED

Never report COMPLETED when code exists but tests or necessary integrations are incomplete.

---

# 23. FIRST ACTION — START NOW

Begin with **PHASE 0: REPOSITORY INSPECTION AND PROJECT BASELINE**.

Your first task is NOT to build the entire application immediately.

Do the following:

1. Inspect the working directory and repository.
2. Inspect existing files, dependencies, configuration, and Git status.
3. Identify whether this is an existing project or an empty repository.
4. Read the supplied technical specification if it is accessible in the workspace.
5. Compare the implementation state with the requirements in this prompt.
6. Identify missing requirements and risky assumptions.
7. Prepare a clear technical baseline and proposed implementation plan.
8. Identify the smallest sensible first development milestone.

Do not delete, replace, or rewrite existing project files during this inspection.

Do not claim that any feature is implemented merely because it appears in this prompt.

Finish Phase 0 with a clear report and wait for the project owner's approval before starting substantial implementation.

**The goal is to build a real, secure, maintainable, testable Smart Market system — not merely to generate code quickly.**# smartmarket

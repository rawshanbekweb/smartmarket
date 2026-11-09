-- Append-only protection for the audit trail.
-- Any UPDATE or DELETE on "AuditLog" raises an error, regardless of the application code path.
-- Limitation: the table owner / superuser can still TRUNCATE or drop the trigger. In production,
-- run the API with a dedicated role that does not own the table (see docs/SECURITY.md).
CREATE OR REPLACE FUNCTION smart_market_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION smart_market_audit_immutable();

-- Gap-tolerant, concurrency-safe receipt numbering.
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

-- Financial integrity checks.
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amount" > 0);
ALTER TABLE "Tariff" ADD CONSTRAINT tariff_amount_positive CHECK ("amount" > 0);
ALTER TABLE "Tariff" ADD CONSTRAINT tariff_width_positive CHECK ("widthMeters" > 0);
ALTER TABLE "TradingSpace" ADD CONSTRAINT space_width_positive CHECK ("widthMeters" > 0);
ALTER TABLE "Exemption" ADD CONSTRAINT exemption_window_valid CHECK ("validUntil" > "validFrom");
ALTER TABLE "PaymentCycle" ADD CONSTRAINT cycle_duration_valid CHECK (
  ("type" = 'CALENDAR_DAY') OR ("durationMinutes" IS NOT NULL AND "durationMinutes" > 0)
);
-- At most one active payment cycle per market.
CREATE UNIQUE INDEX payment_cycle_one_active ON "PaymentCycle" ("marketId") WHERE "isActive";

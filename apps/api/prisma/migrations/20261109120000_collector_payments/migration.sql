-- On-the-spot collection (cash / manually recorded Click transfer), Click reconciliation, cash handover
-- CreateEnum
CREATE TYPE "PaymentVerification" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'MISMATCH');

-- AlterEnum


ALTER TYPE "AlertType" ADD VALUE 'PAYMENT_MISMATCH';
ALTER TYPE "AlertType" ADD VALUE 'CASH_SHORTAGE';

-- AlterTable
ALTER TABLE "CashierShift" ADD COLUMN     "declaredCash" INTEGER,
ADD COLUMN     "expectedCash" INTEGER,
ADD COLUMN     "handoverNote" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "receivedCash" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "verification" "PaymentVerification" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateIndex
CREATE INDEX "CashierShift_status_receivedAt_idx" ON "CashierShift"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_verification_createdAt_idx" ON "Payment"("verification", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_method_externalRef_key" ON "Payment"("method", "externalRef");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A Click payment must carry the reference the collector copied from the Click check
-- (legacy simulated demo rows excepted).
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_click_ref_check"
  CHECK ("method" <> 'CLICK' OR "externalRef" IS NOT NULL OR "isSimulated");

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_cash_amounts_check"
  CHECK (COALESCE("expectedCash", 0) >= 0 AND COALESCE("declaredCash", 0) >= 0 AND COALESCE("receivedCash", 0) >= 0);

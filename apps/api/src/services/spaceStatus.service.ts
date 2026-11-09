import type { CameraStatus, OccupancyState } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';

export type SpaceDisplayStatus =
  | 'FREE'
  | 'OCCUPIED_PAID'
  | 'OCCUPIED_UNPAID'
  | 'EXEMPTED'
  | 'UNKNOWN'
  | 'CAMERA_UNAVAILABLE';

export type PaymentState = 'PAID' | 'EXEMPTED' | 'UNPAID';

export interface SpaceStatusInfo {
  status: SpaceDisplayStatus;
  paymentState: PaymentState;
  validPayment: { id: string; validUntil: Date | null; amount: number; method: string } | null;
  activeExemption: { id: string; validUntil: Date; reason: string } | null;
}

const UNAVAILABLE: CameraStatus[] = ['OFFLINE', 'MAINTENANCE'];

/** Single source of truth for the business status of a trading space. */
export function deriveStatus(input: {
  occupancyState: OccupancyState;
  cameraStatus: CameraStatus | null;
  hasValidPayment: boolean;
  hasActiveExemption: boolean;
}): { status: SpaceDisplayStatus; paymentState: PaymentState } {
  const paymentState: PaymentState = input.hasValidPayment
    ? 'PAID'
    : input.hasActiveExemption
      ? 'EXEMPTED'
      : 'UNPAID';

  let status: SpaceDisplayStatus;
  if (input.cameraStatus && UNAVAILABLE.includes(input.cameraStatus)) status = 'CAMERA_UNAVAILABLE';
  else if (input.occupancyState === 'FREE') status = 'FREE';
  else if (input.occupancyState === 'UNKNOWN') status = 'UNKNOWN';
  else if (input.hasValidPayment) status = 'OCCUPIED_PAID';
  else if (input.hasActiveExemption) status = 'EXEMPTED';
  else status = 'OCCUPIED_UNPAID';

  return { status, paymentState };
}

/** Valid = SUCCESS status and the configured validity window covers `now`. */
export const validPaymentWhere = (now: Date) => ({
  status: 'SUCCESS' as const,
  validFrom: { lte: now },
  validUntil: { gt: now },
});

export const activeExemptionWhere = (now: Date) => ({
  status: 'APPROVED' as const,
  validFrom: { lte: now },
  validUntil: { gt: now },
});

/** Compute statuses for a set of spaces (or all spaces of the market). */
export async function computeStatuses(
  db: Db,
  where: { marketId?: string; ids?: string[] } = {},
  now = new Date(),
): Promise<Map<string, SpaceStatusInfo>> {
  const spaces = await db.tradingSpace.findMany({
    where: { ...(where.marketId && { marketId: where.marketId }), ...(where.ids && { id: { in: where.ids } }) },
    select: {
      id: true,
      occupancyState: true,
      cameraZone: { select: { camera: { select: { status: true } } } },
      payments: {
        where: validPaymentWhere(now),
        orderBy: { validUntil: 'desc' },
        take: 1,
        select: { id: true, validUntil: true, amount: true, method: true },
      },
      exemptions: {
        where: activeExemptionWhere(now),
        orderBy: { validUntil: 'desc' },
        take: 1,
        select: { id: true, validUntil: true, reason: true },
      },
    },
  });

  const result = new Map<string, SpaceStatusInfo>();
  for (const s of spaces) {
    const validPayment = s.payments[0] ?? null;
    const activeExemption = s.exemptions[0] ?? null;
    const derived = deriveStatus({
      occupancyState: s.occupancyState,
      cameraStatus: s.cameraZone?.camera.status ?? null,
      hasValidPayment: !!validPayment,
      hasActiveExemption: !!activeExemption,
    });
    result.set(s.id, { ...derived, validPayment, activeExemption });
  }
  return result;
}

export async function statusOf(spaceId: string, db: Db = prisma, now = new Date()) {
  const map = await computeStatuses(db, { ids: [spaceId] }, now);
  return map.get(spaceId) ?? null;
}

/** True when an occupied space is covered by a valid payment or approved exemption. */
export async function isCovered(db: Db, spaceId: string, now = new Date()) {
  const [p, e] = await Promise.all([
    db.payment.count({ where: { spaceId, ...validPaymentWhere(now) } }),
    db.exemption.count({ where: { spaceId, ...activeExemptionWhere(now) } }),
  ]);
  return p > 0 || e > 0;
}

import type { AlertStatus } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';
import { minutes } from '../lib/time';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';
import { emit } from '../realtime/socket';
import { getSetting, isWithinWorkingHours } from './settings.service';
import { isCovered } from './spaceStatus.service';
import { notifyRoles, pushNotifications } from './notification.service';
import type { AuthUser } from '../middleware/auth';

export const ACTIVE_ALERT_STATUSES: AlertStatus[] = ['OPEN', 'ADMIN_NOTIFIED', 'INVESTIGATING', 'ESCALATED'];

/**
 * Open an UNPAID_OCCUPANCY alert for a space when it is occupied, observable and
 * not covered by a valid payment/exemption. The escalation schedule is persisted
 * on the row (adminNotifyAt) so it survives restarts.
 */
export async function ensureUnpaidAlert(db: Db, spaceId: string, now = new Date(), isDemo = false) {
  const space = await db.tradingSpace.findUnique({
    where: { id: spaceId },
    include: { cameraZone: { include: { camera: true } }, market: { select: { utcOffsetMinutes: true } } },
  });
  if (!space || !space.isActive || space.occupancyState !== 'OCCUPIED') return null;
  const cam = space.cameraZone?.camera;
  if (cam && (cam.status === 'OFFLINE' || cam.status === 'MAINTENANCE')) return null;
  // Goods left overnight are not unpaid trading: only open new alerts during working hours.
  if (!(await isWithinWorkingHours(now, space.market.utcOffsetMinutes, db))) return null;
  if (await isCovered(db, spaceId, now)) return null;

  const existing = await db.alert.findFirst({
    where: { spaceId, type: 'UNPAID_OCCUPANCY', status: { in: ACTIVE_ALERT_STATUSES } },
  });
  if (existing) return existing;

  const delay = await getSetting('alert.adminNotifyDelayMinutes', db);
  const alert = await db.alert.create({
    data: {
      type: 'UNPAID_OCCUPANCY',
      severity: 'WARNING',
      status: 'OPEN',
      title: `${space.number}-joy: to'lovsiz bandlik`,
      message: "Joy band, lekin amaldagi to'lov yoki imtiyoz topilmadi.",
      spaceId,
      cameraId: cam?.id,
      detectedAt: now,
      adminNotifyAt: new Date(now.getTime() + minutes(delay)),
      isDemo,
      events: { create: { action: 'CREATED', note: `Avtomatik aniqlandi. ${delay} daqiqadan so'ng admin xabardor qilinadi.` } },
    },
  });
  emit('alert:created', { id: alert.id, type: alert.type, spaceId });
  return alert;
}

/** Stop escalation: payment confirmed / exemption approved. */
export async function resolveUnpaidAlerts(
  db: Db,
  spaceId: string,
  note: string,
  opts: { actor?: AuthUser | null; onlyOpen?: boolean } = {},
) {
  const alerts = await db.alert.findMany({
    where: {
      spaceId,
      type: 'UNPAID_OCCUPANCY',
      status: { in: opts.onlyOpen ? ['OPEN'] : ACTIVE_ALERT_STATUSES },
    },
    select: { id: true },
  });
  const now = new Date();
  for (const a of alerts) {
    await db.alert.update({
      where: { id: a.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        resolvedById: opts.actor?.id,
        resolutionNote: note,
        events: { create: { action: 'AUTO_RESOLVED', note, actorId: opts.actor?.id } },
      },
    });
  }
  return alerts.map((a) => a.id);
}

/** Immediate alerts (camera failure, complaint) notify admin and chief at once. */
export async function createImmediateAlert(
  db: Db,
  data: {
    type: 'CAMERA_OFFLINE' | 'SELLER_COMPLAINT';
    title: string;
    message?: string;
    spaceId?: string;
    cameraId?: string;
    complaintId?: string;
    isDemo?: boolean;
  },
) {
  const now = new Date();
  const alert = await db.alert.create({
    data: {
      ...data,
      severity: data.type === 'CAMERA_OFFLINE' ? 'CRITICAL' : 'WARNING',
      status: 'ADMIN_NOTIFIED',
      detectedAt: now,
      adminNotifiedAt: now,
      escalations: { create: [{ level: 'MARKET_ADMIN' }, { level: 'CHIEF' }] },
      events: { create: { action: 'CREATED', note: 'Darhol MARKET_ADMIN va CHIEF xabardor qilindi.' } },
    },
  });
  const notice = { type: data.type, title: data.title, body: data.message, link: `/alerts/${alert.id}`, alertId: alert.id };
  const userIds = await notifyRoles(db, ['MARKET_ADMIN', 'CHIEF'], notice);
  return { alert, userIds, notice };
}

/** Informational, already-closed alert used for the activity feed (cancellations, exemptions). */
export async function createInfoAlert(
  db: Db,
  data: { type: 'PAYMENT_CANCELLED' | 'EXEMPTION_APPROVED'; title: string; message?: string; spaceId?: string; paymentId?: string; actorId?: string },
) {
  const now = new Date();
  return db.alert.create({
    data: {
      type: data.type,
      severity: 'INFO',
      status: 'RESOLVED',
      title: data.title,
      message: data.message,
      spaceId: data.spaceId,
      paymentId: data.paymentId,
      detectedAt: now,
      resolvedAt: now,
      resolvedById: data.actorId,
      resolutionNote: "Ma'lumot uchun hodisa",
      events: { create: { action: 'CREATED', actorId: data.actorId } },
    },
  });
}

// ─── Persistent escalation processor ───────────────────────────────────────

/**
 * Process due escalations. Called periodically by the worker; all state lives in
 * PostgreSQL, so a restart simply resumes from the persisted timestamps.
 * Each transition uses a conditional update (status guard) so concurrent workers
 * cannot double-process the same alert.
 */
export async function processDueAlerts(now = new Date()) {
  let notified = 0;
  let escalated = 0;
  let autoResolved = 0;

  // 1) OPEN → ADMIN_NOTIFIED
  const dueAdmin = await prisma.alert.findMany({
    where: { type: 'UNPAID_OCCUPANCY', status: 'OPEN', adminNotifyAt: { lte: now } },
    include: { space: true },
    take: 200,
  });
  for (const a of dueAdmin) {
    const result = await prisma.$transaction(async (tx) => {
      if (a.spaceId && ((await isCovered(tx, a.spaceId, now)) || a.space?.occupancyState !== 'OCCUPIED')) {
        await resolveUnpaidAlerts(tx, a.spaceId, "Avtomatik yopildi: to'lov/imtiyoz topildi yoki joy bo'shadi", { onlyOpen: true });
        return 'resolved' as const;
      }
      const chiefDelay = await getSetting('alert.chiefEscalationDelayMinutes', tx);
      const claimed = await tx.alert.updateMany({
        where: { id: a.id, status: 'OPEN' },
        data: {
          status: 'ADMIN_NOTIFIED',
          adminNotifiedAt: now,
          chiefEscalateAt: new Date(now.getTime() + minutes(chiefDelay)),
        },
      });
      if (!claimed.count) return null;
      await tx.alertEscalation.create({ data: { alertId: a.id, level: 'MARKET_ADMIN' } });
      await tx.alertEvent.create({ data: { alertId: a.id, action: 'ADMIN_NOTIFIED', note: `MARKET_ADMIN xabardor qilindi. ${chiefDelay} daqiqada hal bo'lmasa CHIEF ga eskalatsiya.` } });
      const notice = { type: 'ALERT_ADMIN', title: a.title, body: 'Joy band, to\'lov topilmadi. Tekshiring.', link: `/alerts/${a.id}`, alertId: a.id };
      const ids = await notifyRoles(tx, ['MARKET_ADMIN'], notice);
      await audit(tx, { actor: null, action: 'ALERT_ADMIN_NOTIFIED', entityType: 'Alert', entityId: a.id, summary: a.title });
      return { ids, notice };
    });
    if (result === 'resolved') autoResolved++;
    else if (result) {
      notified++;
      pushNotifications(result.ids, result.notice);
      emit('alert:updated', { id: a.id });
    }
  }

  // 2) ADMIN_NOTIFIED / INVESTIGATING → ESCALATED (CHIEF)
  const dueChief = await prisma.alert.findMany({
    where: {
      type: 'UNPAID_OCCUPANCY',
      status: { in: ['ADMIN_NOTIFIED', 'INVESTIGATING'] },
      chiefEscalateAt: { lte: now },
    },
    include: { space: true },
    take: 200,
  });
  for (const a of dueChief) {
    const result = await prisma.$transaction(async (tx) => {
      if (a.spaceId && (await isCovered(tx, a.spaceId, now))) {
        await resolveUnpaidAlerts(tx, a.spaceId, "Avtomatik yopildi: to'lov yoki imtiyoz tasdiqlandi");
        return 'resolved' as const;
      }
      const claimed = await tx.alert.updateMany({
        where: { id: a.id, status: { in: ['ADMIN_NOTIFIED', 'INVESTIGATING'] } },
        data: { status: 'ESCALATED', escalatedAt: now, severity: 'CRITICAL' },
      });
      if (!claimed.count) return null;
      await tx.alertEscalation.create({ data: { alertId: a.id, level: 'CHIEF' } });
      await tx.alertEvent.create({ data: { alertId: a.id, action: 'ESCALATED', note: 'Belgilangan vaqtda hal qilinmadi — CHIEF ga eskalatsiya qilindi.' } });
      const notice = { type: 'ALERT_ESCALATED', title: a.title, body: 'Ogohlantirish rahbarga eskalatsiya qilindi.', link: `/alerts/${a.id}`, alertId: a.id };
      const ids = await notifyRoles(tx, ['CHIEF'], notice);
      await audit(tx, { actor: null, action: 'ALERT_ESCALATED', entityType: 'Alert', entityId: a.id, summary: a.title });
      return { ids, notice };
    });
    if (result === 'resolved') autoResolved++;
    else if (result) {
      escalated++;
      pushNotifications(result.ids, result.notice);
      emit('alert:updated', { id: a.id });
    }
  }

  return { notified, escalated, autoResolved };
}

/** Catch spaces whose payment validity expired while they stay occupied. */
export async function sweepUncoveredOccupiedSpaces(now = new Date()) {
  const occupied = await prisma.tradingSpace.findMany({
    where: {
      isActive: true,
      occupancyState: 'OCCUPIED',
      alerts: { none: { type: 'UNPAID_OCCUPANCY', status: { in: ACTIVE_ALERT_STATUSES } } },
    },
    select: { id: true, isDemo: true },
  });
  let created = 0;
  for (const s of occupied) {
    const a = await ensureUnpaidAlert(prisma, s.id, now, s.isDemo);
    if (a) created++;
  }
  if (created) logger.info('Sweep created unpaid alerts', { created });
  return created;
}

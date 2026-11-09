import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { conflict, notFound } from '../lib/errors';
import { paged, paging } from '../lib/http';
import { audit } from '../lib/audit';
import { ACTIVE_ALERT_STATUSES } from '../services/alert.service';
import { isCovered } from '../services/spaceStatus.service';
import { recordObservation } from '../services/occupancy.service';
import { notifyRoles, pushNotifications } from '../services/notification.service';
import { emit } from '../realtime/socket';

export const alertsRouter = Router();
alertsRouter.use(requireAuth, requireRole('CHIEF', 'MARKET_ADMIN'));

const TYPES = ['UNPAID_OCCUPANCY', 'CAMERA_OFFLINE', 'SELLER_COMPLAINT', 'PAYMENT_CANCELLED', 'EXEMPTION_APPROVED', 'PAYMENT_MISMATCH', 'CASH_SHORTAGE'] as const;
const STATUSES = ['OPEN', 'ADMIN_NOTIFIED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'REJECTED'] as const;

const include = {
  space: { select: { id: true, number: true, row: { select: { name: true } } } },
  camera: { select: { id: true, code: true, name: true } },
  assignedTo: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AlertInclude;

alertsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = z
      .object({
        status: z.union([z.enum(STATUSES), z.literal('ACTIVE')]).optional(),
        type: z.enum(TYPES).optional(),
        severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
        search: z.string().trim().max(50).optional(),
      })
      .parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const where: Prisma.AlertWhereInput = {
      ...(q.status === 'ACTIVE' ? { status: { in: ACTIVE_ALERT_STATUSES } } : q.status ? { status: q.status } : {}),
      ...(q.type && { type: q.type }),
      ...(q.severity && { severity: q.severity }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { space: { number: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.alert.findMany({ where, include, orderBy: { detectedAt: 'desc' }, skip, take }),
      prisma.alert.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  }),
);

alertsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const a = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: {
        ...include,
        complaint: true,
        escalations: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { fullName: true } } } },
      },
    });
    if (!a) throw notFound('Ogohlantirish topilmadi');
    res.json(a);
  }),
);

async function loadActive(id: string) {
  const a = await prisma.alert.findUnique({ where: { id } });
  if (!a) throw notFound('Ogohlantirish topilmadi');
  if (!ACTIVE_ALERT_STATUSES.includes(a.status)) throw conflict('Ogohlantirish allaqachon yopilgan');
  return a;
}

const noteBody = z.object({ note: z.string().trim().min(3).max(1000) });

alertsRouter.post(
  '/:id/investigate',
  ah(async (req, res) => {
    const { note } = z.object({ note: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
    const a = await loadActive(req.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.alert.update({
        where: { id: a.id },
        data: {
          status: a.status === 'ESCALATED' ? 'ESCALATED' : 'INVESTIGATING',
          assignedToId: req.user!.id,
          events: { create: { action: 'INVESTIGATING', note: note ?? "Tekshiruv boshlandi", actorId: req.user!.id } },
        },
      });
      await audit(tx, { actor: req.user, req, action: 'ALERT_INVESTIGATING', entityType: 'Alert', entityId: a.id, summary: a.title });
    });
    emit('alert:updated', { id: a.id });
    res.json({ ok: true });
  }),
);

alertsRouter.post(
  '/:id/note',
  ah(async (req, res) => {
    const { note } = noteBody.parse(req.body);
    const a = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!a) throw notFound();
    await prisma.alertEvent.create({ data: { alertId: a.id, action: 'NOTE', note, actorId: req.user!.id } });
    res.json({ ok: true });
  }),
);

/**
 * Resolve with an investigation result. For unpaid-occupancy alerts the backend
 * refuses to close the alert while the space is still occupied and uncovered:
 * record a payment/exemption, or mark the detection as false (reject).
 */
alertsRouter.post(
  '/:id/resolve',
  ah(async (req, res) => {
    const { note } = noteBody.parse(req.body);
    const a = await loadActive(req.params.id);
    if (a.type === 'UNPAID_OCCUPANCY' && a.spaceId) {
      const space = await prisma.tradingSpace.findUnique({ where: { id: a.spaceId } });
      if (space?.occupancyState === 'OCCUPIED' && !(await isCovered(prisma, a.spaceId))) {
        throw conflict("Joy hali ham band va to'lov topilmadi. Avval to'lovni qayd eting, imtiyoz so'rang yoki noto'g'ri aniqlash sifatida rad eting.");
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.alert.update({
        where: { id: a.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedById: req.user!.id,
          resolutionNote: note,
          events: { create: { action: 'RESOLVED', note, actorId: req.user!.id } },
        },
      });
      await audit(tx, { actor: req.user, req, action: 'ALERT_RESOLVED', entityType: 'Alert', entityId: a.id, summary: `${a.title}: ${note}` });
    });
    emit('alert:updated', { id: a.id });
    res.json({ ok: true });
  }),
);

/** False detection: reject the alert and record a manual FREE check so it is not re-raised. */
alertsRouter.post(
  '/:id/reject',
  ah(async (req, res) => {
    const { note } = noteBody.parse(req.body);
    const a = await loadActive(req.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.alert.update({
        where: { id: a.id },
        data: {
          status: 'REJECTED',
          resolvedAt: new Date(),
          resolvedById: req.user!.id,
          resolutionNote: note,
          events: { create: { action: 'REJECTED', note, actorId: req.user!.id } },
        },
      });
      await audit(tx, { actor: req.user, req, action: 'ALERT_REJECTED', entityType: 'Alert', entityId: a.id, summary: `${a.title}: ${note}` });
    });
    if (a.type === 'UNPAID_OCCUPANCY' && a.spaceId) {
      await recordObservation({ spaceId: a.spaceId, state: 'FREE', source: 'MANUAL' }, req.user);
    }
    emit('alert:updated', { id: a.id });
    res.json({ ok: true });
  }),
);

alertsRouter.post(
  '/:id/escalate',
  requireRole('MARKET_ADMIN'),
  ah(async (req, res) => {
    const { note } = noteBody.parse(req.body);
    const a = await loadActive(req.params.id);
    if (a.status === 'ESCALATED') throw conflict('Allaqachon eskalatsiya qilingan');
    const r = await prisma.$transaction(async (tx) => {
      await tx.alert.update({
        where: { id: a.id },
        data: {
          status: 'ESCALATED',
          escalatedAt: new Date(),
          severity: 'CRITICAL',
          events: { create: { action: 'ESCALATED', note, actorId: req.user!.id } },
        },
      });
      await tx.alertEscalation.upsert({
        where: { alertId_level: { alertId: a.id, level: 'CHIEF' } },
        create: { alertId: a.id, level: 'CHIEF' },
        update: {},
      });
      const notice = { type: 'ALERT_ESCALATED', title: a.title, body: note, link: `/alerts/${a.id}`, alertId: a.id };
      const ids = await notifyRoles(tx, ['CHIEF'], notice);
      await audit(tx, { actor: req.user, req, action: 'ALERT_ESCALATED_MANUAL', entityType: 'Alert', entityId: a.id, summary: `${a.title}: ${note}` });
      return { ids, notice };
    });
    pushNotifications(r.ids, r.notice);
    emit('alert:updated', { id: a.id });
    res.json({ ok: true });
  }),
);

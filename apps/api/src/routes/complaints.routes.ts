import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { notFound } from '../lib/errors';
import { paged, paging } from '../lib/http';
import { audit } from '../lib/audit';
import { ACTIVE_ALERT_STATUSES } from '../services/alert.service';
import { emit } from '../realtime/socket';

export const complaintsRouter = Router();
complaintsRouter.use(requireAuth, requireRole('CHIEF', 'MARKET_ADMIN'));

const include = {
  space: { select: { id: true, number: true, row: { select: { name: true } } } },
  relatedCashier: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
  alerts: { select: { id: true, status: true } },
} satisfies Prisma.ComplaintInclude;

complaintsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = z.object({ status: z.enum(['OPEN', 'NEW', 'INVESTIGATING', 'RESOLVED', 'REJECTED']).optional(), search: z.string().trim().max(50).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const where: Prisma.ComplaintWhereInput = {
      ...(q.status === 'OPEN' ? { status: { in: ['NEW', 'INVESTIGATING'] } } : q.status ? { status: q.status } : {}),
      ...(q.search && { space: { number: { contains: q.search, mode: 'insensitive' } } }),
    };
    const [items, total, byStatus] = await Promise.all([
      prisma.complaint.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.complaint.count({ where }),
      prisma.complaint.groupBy({ by: ['status'], _count: true }),
    ]);
    res.json({ ...paged(items, total, page, pageSize), byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])) });
  }),
);

complaintsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const body = z
      .object({ status: z.enum(['INVESTIGATING', 'RESOLVED', 'REJECTED']), note: z.string().trim().min(3).max(1000) })
      .parse(req.body);
    const c = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound('Shikoyat topilmadi');
    const closing = body.status !== 'INVESTIGATING';
    await prisma.$transaction(async (tx) => {
      await tx.complaint.update({
        where: { id: c.id },
        data: {
          status: body.status,
          resolutionNote: body.note,
          ...(closing && { resolvedAt: new Date(), resolvedById: req.user!.id }),
        },
      });
      const alerts = await tx.alert.findMany({ where: { complaintId: c.id, status: { in: ACTIVE_ALERT_STATUSES } } });
      for (const a of alerts) {
        await tx.alert.update({
          where: { id: a.id },
          data: closing
            ? {
                status: body.status === 'RESOLVED' ? 'RESOLVED' : 'REJECTED',
                resolvedAt: new Date(),
                resolvedById: req.user!.id,
                resolutionNote: body.note,
                events: { create: { action: body.status, note: body.note, actorId: req.user!.id } },
              }
            : {
                status: 'INVESTIGATING',
                assignedToId: req.user!.id,
                events: { create: { action: 'INVESTIGATING', note: body.note, actorId: req.user!.id } },
              },
        });
      }
      await audit(tx, { actor: req.user, req, action: `COMPLAINT_${body.status}`, entityType: 'Complaint', entityId: c.id, before: { status: c.status }, after: body });
    });
    emit('alert:updated', { complaintId: c.id });
    res.json({ ok: true });
  }),
);

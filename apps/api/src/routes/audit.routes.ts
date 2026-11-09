import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { dateRangeQuery, paged, paging } from '../lib/http';
import { resolveRange } from '../services/analytics.service';

export const auditRouter = Router();
// Read-only. There is intentionally no update/delete endpoint for audit records.
auditRouter.use(requireAuth, requireRole('CHIEF'));

auditRouter.get(
  '/',
  ah(async (req, res) => {
    const q = dateRangeQuery
      .extend({ search: z.string().trim().max(60).optional(), action: z.string().max(60).optional(), entityType: z.string().max(40).optional(), actorId: z.string().optional() })
      .parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const range = q.from || q.to ? await resolveRange(q.from, q.to) : null;
    const where: Prisma.AuditLogWhereInput = {
      ...(range && { createdAt: { gte: range.start, lt: range.end } }),
      ...(q.action && { action: q.action }),
      ...(q.entityType && { entityType: q.entityType }),
      ...(q.actorId && { actorId: q.actorId }),
      ...(q.search && {
        OR: [{ summary: { contains: q.search, mode: 'insensitive' } }, { action: { contains: q.search, mode: 'insensitive' } }],
      }),
    };
    const [items, total, actions] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { actor: { select: { fullName: true, username: true } } }, orderBy: { id: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
    ]);
    res.json({ ...paged(items, total, page, pageSize), actions: actions.map((a) => a.action) });
  }),
);

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { getMarket } from '../services/market.service';
import { computeStatuses } from '../services/spaceStatus.service';

export const rowsRouter = Router();
rowsRouter.use(requireAuth);

rowsRouter.get(
  '/',
  ah(async (_req, res) => {
    const market = await getMarket();
    const rows = await prisma.marketRow.findMany({
      where: { marketId: market.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        spaces: { where: { isActive: true }, select: { id: true } },
        cashierAssignment: { where: { endsAt: null }, include: { cashier: { select: { id: true, fullName: true } } } },
      },
    });
    const statuses = await computeStatuses(prisma, { marketId: market.id });
    res.json(
      rows.map((r) => {
        const counts = { FREE: 0, OCCUPIED_PAID: 0, OCCUPIED_UNPAID: 0, EXEMPTED: 0, UNKNOWN: 0, CAMERA_UNAVAILABLE: 0 } as Record<string, number>;
        for (const s of r.spaces) counts[statuses.get(s.id)?.status ?? 'UNKNOWN']++;
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          sortOrder: r.sortOrder,
          isActive: r.isActive,
          isDemo: r.isDemo,
          spaceCount: r.spaces.length,
          statusCounts: counts,
          cashiers: r.cashierAssignment.map((a) => a.cashier),
        };
      }),
    );
  }),
);

const rowBody = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().optional(),
});

rowsRouter.post(
  '/',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = rowBody.parse(req.body);
    const market = await getMarket();
    const row = await prisma.$transaction(async (tx) => {
      const r = await tx.marketRow.create({ data: { ...body, marketId: market.id } });
      await audit(tx, { actor: req.user, req, action: 'ROW_CREATED', entityType: 'MarketRow', entityId: r.id, summary: `Qator ${r.name}`, after: body });
      return r;
    });
    res.status(201).json(row);
  }),
);

rowsRouter.patch(
  '/:id',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = rowBody.partial().parse(req.body);
    const before = await prisma.marketRow.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Qator topilmadi');
    const row = await prisma.$transaction(async (tx) => {
      const r = await tx.marketRow.update({ where: { id: before.id }, data: body });
      await audit(tx, { actor: req.user, req, action: 'ROW_UPDATED', entityType: 'MarketRow', entityId: r.id, before, after: body });
      return r;
    });
    res.json(row);
  }),
);

/** Assign a cashier to a row (used to associate complaints with a cashier when reliable). */
rowsRouter.put(
  '/:id/cashiers',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = z.object({ cashierIds: z.array(z.string()).max(10) }).parse(req.body);
    const row = await prisma.marketRow.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Qator topilmadi');
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.cashierRowAssignment.updateMany({ where: { rowId: row.id, endsAt: null }, data: { endsAt: now } });
      const cashiers = await tx.user.findMany({ where: { id: { in: body.cashierIds }, role: 'CASHIER', isActive: true } });
      if (cashiers.length) {
        await tx.cashierRowAssignment.createMany({ data: cashiers.map((c) => ({ cashierId: c.id, rowId: row.id, startsAt: now })) });
      }
      await audit(tx, { actor: req.user, req, action: 'ROW_CASHIERS_ASSIGNED', entityType: 'MarketRow', entityId: row.id, after: { cashierIds: cashiers.map((c) => c.id) } });
    });
    res.json({ ok: true });
  }),
);

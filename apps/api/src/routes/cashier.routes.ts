import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { startOfLocalDay } from '../lib/time';
import { getMarket } from '../services/market.service';
import { closeShift, openShift } from '../services/payment.service';
import { paymentListInclude } from './payments.routes';

export const cashierRouter = Router();
cashierRouter.use(requireAuth, requireRole('CASHIER'));

cashierRouter.get(
  '/summary',
  ah(async (req, res) => {
    const market = await getMarket();
    const me = req.user!.id;
    const todayStart = startOfLocalDay(new Date(), market.utcOffsetMinutes);
    const shift = await prisma.cashierShift.findFirst({ where: { cashierId: me, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
    const [today, shiftAgg, recent, rows, byMethod] = await Promise.all([
      prisma.payment.aggregate({ where: { cashierId: me, status: 'SUCCESS', method: 'CASH', paidAt: { gte: todayStart } }, _sum: { amount: true }, _count: true }),
      shift
        ? prisma.payment.aggregate({ where: { shiftId: shift.id, status: 'SUCCESS' }, _sum: { amount: true }, _count: true })
        : null,
      prisma.payment.findMany({ where: { cashierId: me }, include: paymentListInclude, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.cashierRowAssignment.findMany({ where: { cashierId: me, endsAt: null }, include: { row: { select: { id: true, name: true, code: true } } } }),
      prisma.payment.groupBy({ by: ['status'], where: { cashierId: me, createdAt: { gte: todayStart } }, _count: true, _sum: { amount: true } }),
    ]);
    res.json({
      shift: shift && { ...shift, totalAmount: shiftAgg?._sum.amount ?? 0, count: shiftAgg?._count ?? 0 },
      cashToday: { amount: today._sum.amount ?? 0, count: today._count },
      todayByStatus: byMethod.map((g) => ({ status: g.status, count: g._count, amount: g._sum.amount ?? 0 })),
      recent,
      assignedRows: rows.map((r) => r.row),
    });
  }),
);

cashierRouter.get(
  '/shifts',
  ah(async (req, res) => {
    const shifts = await prisma.cashierShift.findMany({ where: { cashierId: req.user!.id }, orderBy: { openedAt: 'desc' }, take: 30 });
    const sums = await prisma.payment.groupBy({
      by: ['shiftId'],
      where: { shiftId: { in: shifts.map((s) => s.id) }, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    });
    const m = new Map(sums.map((s) => [s.shiftId, s]));
    res.json(shifts.map((s) => ({ ...s, totalAmount: m.get(s.id)?._sum.amount ?? 0, count: m.get(s.id)?._count ?? 0 })));
  }),
);

cashierRouter.post(
  '/shift/open',
  ah(async (req, res) => {
    const body = z.object({ note: z.string().max(200).optional() }).parse(req.body ?? {});
    res.json(await openShift(req.user!, body.note));
  }),
);

cashierRouter.post('/shift/close', ah(async (req, res) => res.json(await closeShift(req.user!))));

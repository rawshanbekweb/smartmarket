import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { paged, paging } from '../lib/http';
import { receiveShiftCash, verifyClickPayment } from '../services/payment.service';
import { paymentListInclude } from './payments.routes';

/**
 * Control of on-the-spot collection: Click reconciliation against the merchant
 * statement and counting of the cash each collector hands over.
 */
export const collectionsRouter = Router();
collectionsRouter.use(requireAuth, requireRole('CHIEF', 'MARKET_ADMIN'));

collectionsRouter.get(
  '/summary',
  ah(async (_req, res) => {
    const [pending, mismatch, awaiting] = await Promise.all([
      prisma.payment.aggregate({ where: { method: 'CLICK', verification: 'PENDING', status: 'SUCCESS' }, _sum: { amount: true }, _count: true }),
      prisma.payment.count({ where: { method: 'CLICK', verification: 'MISMATCH', status: 'SUCCESS' } }),
      prisma.cashierShift.aggregate({ where: { status: 'CLOSED', receivedAt: null }, _sum: { expectedCash: true }, _count: true }),
    ]);
    res.json({
      clickPending: { count: pending._count, amount: pending._sum.amount ?? 0 },
      clickMismatch: mismatch,
      handoversAwaiting: { count: awaiting._count, amount: awaiting._sum.expectedCash ?? 0 },
    });
  }),
);

collectionsRouter.get(
  '/click',
  ah(async (req, res) => {
    const q = z.object({ verification: z.enum(['PENDING', 'VERIFIED', 'MISMATCH']).default('PENDING') }).parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const where: Prisma.PaymentWhereInput = { method: 'CLICK', verification: q.verification, isSimulated: false };
    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { ...paymentListInclude, verifiedBy: { select: { fullName: true } } },
        // oldest first: reconcile in statement order
        orderBy: { paidAt: q.verification === 'PENDING' ? 'asc' : 'desc' },
        skip,
        take,
      }),
      prisma.payment.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  }),
);

collectionsRouter.post(
  '/click/:id/verify',
  ah(async (req, res) => {
    const body = z.object({ outcome: z.enum(['VERIFIED', 'MISMATCH']), note: z.string().trim().min(3).max(300).optional() }).parse(req.body);
    res.json(await verifyClickPayment(req.params.id, body.outcome, body.note, req.user!, req));
  }),
);

collectionsRouter.get(
  '/handovers',
  ah(async (req, res) => {
    const q = z.object({ state: z.enum(['awaiting', 'received']).default('awaiting') }).parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const where: Prisma.CashierShiftWhereInput = { status: 'CLOSED', receivedAt: q.state === 'awaiting' ? null : { not: null } };
    const [items, total] = await Promise.all([
      prisma.cashierShift.findMany({
        where,
        include: { cashier: { select: { id: true, fullName: true } }, receivedBy: { select: { fullName: true } }, _count: { select: { payments: true } } },
        orderBy: q.state === 'awaiting' ? { closedAt: 'asc' } : { receivedAt: 'desc' },
        skip,
        take,
      }),
      prisma.cashierShift.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  }),
);

collectionsRouter.post(
  '/handovers/:id/receive',
  ah(async (req, res) => {
    const body = z.object({ receivedCash: z.number().int().min(0), note: z.string().trim().max(300).optional() }).parse(req.body);
    res.json(await receiveShiftCash(req.params.id, body.receivedCash, body.note, req.user!, req));
  }),
);

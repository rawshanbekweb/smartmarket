import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { forbidden, notFound } from '../lib/errors';
import { dateRangeQuery, paged, paging } from '../lib/http';
import { resolveRange } from '../services/analytics.service';
import {
  applyProviderEvent,
  cancelPayment,
  createCashPayment,
  createSimulatedElectronicPayment,
} from '../services/payment.service';
import { providerStatusList } from '../integrations/payments/adapters';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const METHODS = ['CASH', 'PAYME', 'CLICK', 'UZUM'] as const;
const STATUSES = ['PENDING', 'PENDING_SYNC', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'] as const;

const listQuery = dateRangeQuery.extend({
  search: z.string().trim().max(50).optional(),
  method: z.enum(METHODS).optional(),
  status: z.enum(STATUSES).optional(),
  cashierId: z.string().optional(),
  spaceId: z.string().optional(),
});

export const paymentListInclude = {
  space: { select: { id: true, number: true, row: { select: { name: true } } } },
  cashier: { select: { id: true, fullName: true } },
  receipt: { select: { receiptNumber: true } },
} satisfies Prisma.PaymentInclude;

paymentsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = listQuery.parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const range = q.from || q.to ? await resolveRange(q.from, q.to) : null;
    const where: Prisma.PaymentWhereInput = {
      ...(range && { createdAt: { gte: range.start, lt: range.end } }),
      ...(q.method && { method: q.method }),
      ...(q.status && { status: q.status }),
      ...(q.spaceId && { spaceId: q.spaceId }),
      ...(q.cashierId && { cashierId: q.cashierId }),
      // Cashiers only ever see their own transactions (enforced server-side).
      ...(req.user!.role === 'CASHIER' && { cashierId: req.user!.id }),
      ...(q.search && {
        OR: [
          { id: { contains: q.search } },
          { space: { number: { contains: q.search, mode: 'insensitive' } } },
          { receipt: { receiptNumber: { contains: q.search, mode: 'insensitive' } } },
          { cashier: { fullName: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, include: paymentListInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.payment.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  }),
);

paymentsRouter.get('/providers', ah(async (_req, res) => res.json(providerStatusList())));

paymentsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const p = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        ...paymentListInclude,
        receipt: true,
        cycle: { select: { name: true, type: true, isDemo: true } },
        cancellation: { include: { cancelledBy: { select: { fullName: true } } } },
        providerTxns: { select: { provider: true, providerTxnId: true, state: true, isSimulated: true, createdAt: true, signatureValid: true } },
      },
    });
    if (!p) throw notFound("To'lov topilmadi");
    if (req.user!.role === 'CASHIER' && p.cashierId !== req.user!.id) throw forbidden();
    const auditTrail =
      req.user!.role === 'CASHIER'
        ? []
        : await prisma.auditLog.findMany({
            where: { entityType: 'Payment', entityId: p.id },
            orderBy: { createdAt: 'asc' },
            include: { actor: { select: { fullName: true } } },
          });
    res.json({ ...p, auditTrail });
  }),
);

paymentsRouter.post(
  '/cash',
  requireRole('CASHIER'),
  ah(async (req, res) => {
    const body = z
      .object({
        spaceId: z.string().min(1),
        amount: z.number().int().positive(),
        idempotencyKey: z.string().uuid(),
        note: z.string().max(300).optional(),
      })
      .parse(req.body);
    const r = await createCashPayment(body, req.user!, req);
    res.status(r.replayed ? 200 : 201).json(r);
  }),
);

paymentsRouter.post(
  '/:id/cancel',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
    await cancelPayment(req.params.id, body.reason, req.user!, req);
    res.json({ ok: true });
  }),
);

// ─── DEMO electronic payment simulator ─────────────────────────────────────

function demoOnly() {
  if (!env.DEMO_MODE) throw new AppError(404, 'NOT_FOUND', 'Topilmadi');
}

paymentsRouter.post(
  '/demo-electronic',
  requireRole('CASHIER', 'CHIEF'),
  ah(async (req, res) => {
    demoOnly();
    const body = z
      .object({ spaceId: z.string().min(1), method: z.enum(['PAYME', 'CLICK', 'UZUM']), idempotencyKey: z.string().uuid() })
      .parse(req.body);
    const r = await createSimulatedElectronicPayment(body, req.user!, req);
    res.status(201).json(r);
  }),
);

/** Simulated provider callback — goes through the same idempotent confirmation path. */
paymentsRouter.post(
  '/:id/demo-callback',
  requireRole('CASHIER', 'CHIEF'),
  ah(async (req, res) => {
    demoOnly();
    const body = z.object({ outcome: z.enum(['SUCCESS', 'FAILED', 'PENDING_SYNC']) }).parse(req.body);
    const p = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { providerTxns: true } });
    if (!p || !p.isSimulated || !p.providerTxns[0]) throw notFound('Simulyatsiya to\'lovi topilmadi');
    const txn = p.providerTxns[0];
    const r = await applyProviderEvent(
      txn.provider,
      { providerTxnId: txn.providerTxnId, paymentId: p.id, outcome: body.outcome, amount: p.amount, raw: { simulated: true, outcome: body.outcome } },
      true,
    );
    res.json(r);
  }),
);

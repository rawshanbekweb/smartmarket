import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { env } from '../config/env';
import { statusOf } from '../services/spaceStatus.service';
import { createImmediateAlert } from '../services/alert.service';
import { pushNotifications } from '../services/notification.service';
import { emit } from '../realtime/socket';

/**
 * Public seller endpoints (QR sticker on each trading space). Access is by an
 * unguessable token; responses expose only non-sensitive information.
 */
export const publicRouter = Router();

const readLimiter = rateLimit({ windowMs: 60_000, limit: env.isTest ? 1000 : 60, standardHeaders: 'draft-7', legacyHeaders: false });
const complaintLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: "Juda ko'p murojaat. 15 daqiqadan so'ng qayta urinib ko'ring." } },
});

const tokenParam = z.object({ token: z.string().regex(/^[a-f0-9]{16,64}$/) });

const maskReceipt = (n: string) => n.replace(/^(.*)(\d{4})$/, (_m, a: string, b: string) => `${'•'.repeat(Math.min(a.length, 6))}${b}`);

publicRouter.get(
  '/spaces/:token',
  readLimiter,
  ah(async (req, res) => {
    const { token } = tokenParam.parse(req.params);
    const space = await prisma.tradingSpace.findUnique({
      where: { qrToken: token },
      include: { row: true, market: true, tariff: true },
    });
    if (!space || !space.isActive) throw notFound("Savdo joyi topilmadi yoki QR kod eskirgan");
    const st = await statusOf(space.id);
    const payment = st?.validPayment
      ? await prisma.payment.findUnique({ where: { id: st.validPayment.id }, include: { receipt: true } })
      : null;
    res.json({
      market: { name: space.market.name, isDemo: space.market.isDemo },
      space: { number: space.number, row: space.row.name, widthMeters: space.widthMeters.toString() },
      tariff: { amount: space.tariff.amount, currency: 'UZS' },
      paymentState: st?.paymentState ?? 'UNPAID',
      payment: payment && {
        paidAt: payment.paidAt,
        validUntil: payment.validUntil,
        method: payment.method,
        amount: payment.amount,
        receiptNumberMasked: payment.receipt ? maskReceipt(payment.receipt.receiptNumber) : null,
      },
      exemptionUntil: st?.activeExemption?.validUntil ?? null,
      demoMode: env.DEMO_MODE,
    });
  }),
);

/** Receipt verification for the QR printed on a receipt. */
publicRouter.get(
  '/receipts/:token',
  readLimiter,
  ah(async (req, res) => {
    const { token } = tokenParam.parse(req.params);
    const r = await prisma.receipt.findUnique({ where: { publicToken: token }, include: { payment: true } });
    if (!r) throw notFound('Chek topilmadi');
    const c = r.content as Record<string, unknown>;
    res.json({
      receiptNumber: r.receiptNumber,
      issuedAt: r.issuedAt,
      spaceNumber: c.spaceNumber,
      amount: r.payment.amount,
      method: r.payment.method,
      validUntil: r.payment.validUntil,
      status: r.payment.status,
      demo: c.demo,
    });
  }),
);

publicRouter.post(
  '/spaces/:token/complaints',
  complaintLimiter,
  ah(async (req, res) => {
    const { token } = tokenParam.parse(req.params);
    const body = z
      .object({
        type: z.literal('CASH_PAID_NO_RECEIPT'),
        description: z.string().trim().max(1000).optional(),
        contactPhone: z
          .string()
          .trim()
          .regex(/^\+?[0-9 ()-]{7,20}$/, "Telefon raqami noto'g'ri")
          .optional()
          .or(z.literal('')),
        // Honeypot field for naive bots
        website: z.string().max(0).optional(),
      })
      .parse(req.body);
    const space = await prisma.tradingSpace.findUnique({ where: { qrToken: token }, include: { row: true } });
    if (!space || !space.isActive) throw notFound('Savdo joyi topilmadi');

    // Associate a cashier only when exactly one cashier is assigned to the row right now.
    const assignments = await prisma.cashierRowAssignment.findMany({ where: { rowId: space.rowId, endsAt: null } });
    const relatedCashierId = assignments.length === 1 ? assignments[0].cashierId : null;

    const r = await prisma.$transaction(async (tx) => {
      const complaint = await tx.complaint.create({
        data: {
          spaceId: space.id,
          type: body.type,
          description: body.description,
          contactPhone: body.contactPhone || null,
          relatedCashierId,
          isDemo: space.isDemo,
        },
      });
      const alert = await createImmediateAlert(tx, {
        type: 'SELLER_COMPLAINT',
        title: `${space.number}-joy: naqd to'langan, chek berilmagan`,
        message: body.description || "Sotuvchi naqd to'lov qilgani, lekin chek olmaganini bildirdi.",
        spaceId: space.id,
        complaintId: complaint.id,
        isDemo: space.isDemo,
      });
      await audit(tx, { actor: null, req, action: 'COMPLAINT_SUBMITTED', entityType: 'Complaint', entityId: complaint.id, summary: `Joy ${space.number}` });
      return { complaint, alert };
    });
    pushNotifications(r.alert.userIds, r.alert.notice);
    emit('alert:created', { id: r.alert.alert.id });
    res.status(201).json({ ok: true, reference: r.complaint.id.slice(-8).toUpperCase() });
  }),
);

import { randomBytes } from 'crypto';
import type { Request } from 'express';
import type { Market, PaymentCycle } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { endOfLocalDay, localDateKey, minutes } from '../lib/time';
import { emit } from '../realtime/socket';
import { getActiveCycle, getMarket } from './market.service';
import { getSetting } from './settings.service';
import { createImmediateAlert, createInfoAlert, ensureUnpaidAlert, resolveUnpaidAlerts } from './alert.service';
import { pushNotifications } from './notification.service';
import { validPaymentWhere } from './spaceStatus.service';
import type { AuthUser } from '../middleware/auth';

/** Revenue only ever counts SUCCESS payments. */
export const CONFIRMED_STATUSES = ['SUCCESS'] as const;

/** Validity window according to the configured payment cycle. */
export function computeValidity(cycle: PaymentCycle, market: Pick<Market, 'utcOffsetMinutes'>, paidAt: Date) {
  if (cycle.type === 'CALENDAR_DAY') {
    return { validFrom: paidAt, validUntil: endOfLocalDay(paidAt, market.utcOffsetMinutes) };
  }
  if (!cycle.durationMinutes || cycle.durationMinutes <= 0) {
    throw new AppError(500, 'CYCLE_MISCONFIGURED', "To'lov sikli noto'g'ri sozlangan");
  }
  return { validFrom: paidAt, validUntil: new Date(paidAt.getTime() + minutes(cycle.durationMinutes)) };
}

async function nextReceiptNumber(tx: Tx, market: Market, at: Date) {
  const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('receipt_number_seq') AS n`;
  return `SM-${localDateKey(at, market.utcOffsetMinutes).replace(/-/g, '')}-${String(n).padStart(6, '0')}`;
}

/** Serialise payment creation per space to prevent concurrent double payments. */
async function lockSpace(tx: Tx, spaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${spaceId}))`;
}

async function issueReceipt(tx: Tx, paymentId: string, market: Market) {
  const p = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { space: { include: { row: true } }, cashier: true, cycle: true },
  });
  const issuedAt = p.paidAt ?? new Date();
  const receiptNumber = await nextReceiptNumber(tx, market, issuedAt);
  const footer = await getSetting('receipt.footerText', tx);
  return tx.receipt.create({
    data: {
      paymentId,
      receiptNumber,
      publicToken: randomBytes(16).toString('hex'),
      issuedAt,
      content: {
        marketName: market.name,
        marketAddress: market.address,
        receiptNumber,
        spaceNumber: p.space.number,
        rowName: p.space.row.name,
        amount: p.amount,
        currency: 'UZS',
        method: p.method,
        externalRef: p.externalRef,
        cashierName: p.cashier?.fullName ?? null,
        paidAt: issuedAt.toISOString(),
        validUntil: p.validUntil?.toISOString() ?? null,
        cycleName: p.cycle?.name ?? null,
        simulated: p.isSimulated,
        demo: market.isDemo,
        footer,
      },
    },
  });
}

async function openShiftFor(tx: Tx, cashierId: string) {
  return tx.cashierShift.findFirst({ where: { cashierId, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
}

/** Methods a collector can accept on the spot. */
export const COLLECT_METHODS = ['CASH', 'CLICK'] as const;
export type CollectMethod = (typeof COLLECT_METHODS)[number];

export interface CollectPaymentInput {
  spaceId: string;
  amount: number;
  method: CollectMethod;
  /** Click check / transaction number; required for CLICK. */
  externalRef?: string;
  idempotencyKey: string;
  note?: string;
}

/** Normalise a Click reference so "№ 12 345" and "12345" cannot be recorded twice. */
export const normalizeRef = (ref: string) => ref.replace(/[\s№#-]/g, '').toUpperCase();

/**
 * On-the-spot collection by a market employee (role CASHIER): cash in hand, or a
 * Click transfer to the market account shown to the collector on the seller's phone.
 * validate → store → receipt → stop alerts → audit, in one DB transaction.
 * Click payments start as verification=PENDING until reconciled with the Click statement.
 */
export async function createCollectedPayment(input: CollectPaymentInput, actor: AuthUser, req?: Request) {
  if (actor.role !== 'CASHIER') throw forbidden("To'lovni faqat yig'uvchi xodim (kassir) qabul qiladi");
  const externalRef = input.method === 'CLICK' ? normalizeRef(input.externalRef ?? '') : null;
  if (input.method === 'CLICK' && (!externalRef || externalRef.length < 4)) {
    throw badRequest('Click to\'lovi uchun chek / tranzaksiya raqamini kiriting');
  }

  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { receipt: true },
  });
  if (existing) {
    if (existing.cashierId !== actor.id) throw conflict('Idempotency kaliti boshqa tranzaksiyaga tegishli');
    return { payment: existing, receipt: existing.receipt, replayed: true };
  }

  const market = await getMarket();
  const result = await prisma.$transaction(async (tx) => {
    await lockSpace(tx, input.spaceId);
    const space = await tx.tradingSpace.findUnique({ where: { id: input.spaceId }, include: { tariff: true } });
    if (!space || space.marketId !== market.id) throw notFound('Savdo joyi topilmadi');
    if (!space.isActive) throw badRequest('Savdo joyi faol emas');
    if (!space.tariff.isActive) throw badRequest('Ushbu joy tarifi faol emas');
    // The amount is decided by the backend tariff; the cashier only confirms it.
    if (input.amount !== space.tariff.amount) {
      throw badRequest(`Summa tarifga mos emas. Tarif: ${space.tariff.amount} UZS`);
    }

    const cycle = await getActiveCycle(market.id, tx);
    if (!cycle) throw conflict("Faol to'lov sikli sozlanmagan. Rahbar Sozlamalarda siklni faollashtirishi kerak.");

    const shift = await openShiftFor(tx, actor.id);
    if (!shift) throw conflict('Avval kassa smenasini oching');

    const now = new Date();
    if (externalRef) {
      const used = await tx.payment.findUnique({ where: { method_externalRef: { method: 'CLICK', externalRef } }, include: { space: true } });
      if (used) throw conflict(`Bu Click raqami allaqachon ishlatilgan (joy ${used.space.number})`, { paymentId: used.id });
    }

    const already = await tx.payment.findFirst({ where: { spaceId: space.id, ...validPaymentWhere(now) } });
    if (already) {
      throw conflict(`Bu joy uchun amaldagi to'lov mavjud (${already.validUntil?.toISOString()} gacha)`, {
        paymentId: already.id,
      });
    }

    const validity = computeValidity(cycle, market, now);
    const payment = await tx.payment.create({
      data: {
        spaceId: space.id,
        cashierId: actor.id,
        shiftId: shift.id,
        cycleId: cycle.id,
        method: input.method,
        status: 'SUCCESS',
        amount: space.tariff.amount,
        paidAt: now,
        ...validity,
        externalRef,
        verification: input.method === 'CLICK' ? 'PENDING' : 'NOT_REQUIRED',
        idempotencyKey: input.idempotencyKey,
        note: input.note,
        isDemo: market.isDemo,
      },
    });
    const receipt = await issueReceipt(tx, payment.id, market);
    const resolved = await resolveUnpaidAlerts(tx, space.id, `To'lov tasdiqlandi (chek ${receipt.receiptNumber})`, { actor });
    await audit(tx, {
      actor,
      req,
      action: 'PAYMENT_CREATED',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `${input.method === 'CASH' ? 'Naqd' : `Click (${externalRef})`} to'lov ${payment.amount} UZS, joy ${space.number}, chek ${receipt.receiptNumber}`,
      after: { amount: payment.amount, method: input.method, externalRef, spaceId: space.id, validUntil: payment.validUntil, resolvedAlerts: resolved },
      isDemo: market.isDemo,
    });
    return { payment, receipt, resolved };
  });

  emit('payment:created', { id: result.payment.id, spaceId: input.spaceId });
  emit('space:updated', { id: input.spaceId });
  for (const id of result.resolved) emit('alert:updated', { id });
  return { payment: result.payment, receipt: result.receipt, replayed: false };
}

/** CHIEF-only cancellation. The original record is kept; only its status changes. */
export async function cancelPayment(paymentId: string, reason: string, actor: AuthUser, req?: Request) {
  if (actor.role !== 'CHIEF') throw forbidden("To'lovni faqat rahbar bekor qila oladi");
  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { space: true } });
    if (!p) throw notFound("To'lov topilmadi");
    if (!['SUCCESS', 'PENDING', 'PENDING_SYNC'].includes(p.status)) {
      throw conflict(`Bu holatdagi to'lovni bekor qilib bo'lmaydi: ${p.status}`);
    }
    const claimed = await tx.payment.updateMany({ where: { id: p.id, status: p.status }, data: { status: 'CANCELLED' } });
    if (!claimed.count) throw conflict("To'lov holati o'zgargan, qayta urinib ko'ring");
    await tx.paymentCancellation.create({ data: { paymentId: p.id, reason, cancelledById: actor.id } });
    await audit(tx, {
      actor,
      req,
      action: 'PAYMENT_CANCELLED',
      entityType: 'Payment',
      entityId: p.id,
      summary: `To'lov bekor qilindi: ${p.amount} UZS, joy ${p.space.number}. Sabab: ${reason}`,
      before: { status: p.status },
      after: { status: 'CANCELLED', reason },
    });
    await createInfoAlert(tx, {
      type: 'PAYMENT_CANCELLED',
      title: `${p.space.number}-joy: to'lov bekor qilindi`,
      message: reason,
      spaceId: p.spaceId,
      paymentId: p.id,
      actorId: actor.id,
    });
    // If the space is still occupied it may now be uncovered.
    await ensureUnpaidAlert(tx, p.spaceId);
    return p;
  });
  emit('payment:updated', { id: paymentId });
  emit('space:updated', { id: result.spaceId });
  return result;
}

export async function openShift(actor: AuthUser, note?: string) {
  if (actor.role !== 'CASHIER') throw forbidden();
  const market = await getMarket();
  return prisma.$transaction(async (tx) => {
    const open = await openShiftFor(tx, actor.id);
    if (open) return open;
    const shift = await tx.cashierShift.create({ data: { cashierId: actor.id, note, isDemo: market.isDemo } });
    await audit(tx, { actor, action: 'SHIFT_OPENED', entityType: 'CashierShift', entityId: shift.id });
    return shift;
  });
}

/**
 * Close the collector's shift. The expected cash is computed from the shift's
 * confirmed CASH payments; the collector declares what they hand over.
 */
export async function closeShift(actor: AuthUser, declaredCash: number, note?: string) {
  if (actor.role !== 'CASHIER') throw forbidden();
  return prisma.$transaction(async (tx) => {
    const open = await openShiftFor(tx, actor.id);
    if (!open) throw conflict('Ochiq smena yo\'q');
    const groups = await tx.payment.groupBy({
      by: ['method'],
      where: { shiftId: open.id, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    });
    const sum = (m: string) => groups.find((g) => g.method === m)?._sum.amount ?? 0;
    const expectedCash = sum('CASH');
    const shift = await tx.cashierShift.update({
      where: { id: open.id },
      data: { status: 'CLOSED', closedAt: new Date(), expectedCash, declaredCash, handoverNote: note },
    });
    const count = groups.reduce((n, g) => n + g._count, 0);
    await audit(tx, {
      actor,
      action: 'SHIFT_CLOSED',
      entityType: 'CashierShift',
      entityId: shift.id,
      summary: `Smena yopildi: ${count} ta to'lov; naqd kutilgan ${expectedCash}, topshirilmoqda ${declaredCash} UZS; Click ${sum('CLICK')} UZS`,
      after: { expectedCash, declaredCash, click: sum('CLICK') },
    });
    return { shift, totalAmount: expectedCash + sum('CLICK'), cashAmount: expectedCash, clickAmount: sum('CLICK'), count };
  });
}

/**
 * MARKET_ADMIN / CHIEF counts the cash handed over by a collector and confirms it.
 * Any difference against the expected amount raises a CASH_SHORTAGE alert.
 */
export async function receiveShiftCash(shiftId: string, receivedCash: number, note: string | undefined, actor: AuthUser, req?: Request) {
  if (actor.role !== 'CHIEF' && actor.role !== 'MARKET_ADMIN') throw forbidden();
  const result = await prisma.$transaction(async (tx) => {
    const shift = await tx.cashierShift.findUnique({ where: { id: shiftId }, include: { cashier: { select: { fullName: true } } } });
    if (!shift) throw notFound('Smena topilmadi');
    if (shift.status !== 'CLOSED') throw conflict('Smena hali yopilmagan');
    if (shift.cashierId === actor.id) throw forbidden("O'z smenangiz pulini o'zingiz qabul qila olmaysiz");
    const claimed = await tx.cashierShift.updateMany({
      where: { id: shift.id, receivedAt: null },
      data: { receivedCash, receivedById: actor.id, receivedAt: new Date(), handoverNote: note ?? shift.handoverNote },
    });
    if (!claimed.count) throw conflict('Bu smena puli allaqachon qabul qilingan');
    const expected = shift.expectedCash ?? 0;
    const diff = receivedCash - expected;
    await audit(tx, {
      actor,
      req,
      action: 'SHIFT_CASH_RECEIVED',
      entityType: 'CashierShift',
      entityId: shift.id,
      summary: `${shift.cashier.fullName}: kutilgan ${expected}, qabul qilindi ${receivedCash} UZS${diff ? ` (farq ${diff})` : ''}`,
      before: { expectedCash: expected, declaredCash: shift.declaredCash },
      after: { receivedCash, difference: diff },
    });
    const alert = diff
      ? await createImmediateAlert(tx, {
          type: 'CASH_SHORTAGE',
          title: `Naqd topshirishda farq: ${shift.cashier.fullName}`,
          message: `Kutilgan ${expected} UZS, qabul qilingan ${receivedCash} UZS (farq ${diff} UZS).`,
          isDemo: shift.isDemo,
        })
      : null;
    return { difference: diff, alert };
  });
  if (result.alert) pushNotifications(result.alert.userIds, result.alert.notice);
  return { difference: result.difference };
}

/** Reconcile a manually recorded Click payment against the Click merchant statement. */
export async function verifyClickPayment(
  paymentId: string,
  outcome: 'VERIFIED' | 'MISMATCH',
  note: string | undefined,
  actor: AuthUser,
  req?: Request,
) {
  if (actor.role !== 'CHIEF' && actor.role !== 'MARKET_ADMIN') throw forbidden();
  if (outcome === 'MISMATCH' && !note) throw badRequest('Nomuvofiqlik sababini yozing');
  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { space: true, cashier: { select: { fullName: true } } } });
    if (!p) throw notFound("To'lov topilmadi");
    if (p.method !== 'CLICK') throw badRequest("Faqat Click to'lovlari tekshiriladi");
    const claimed = await tx.payment.updateMany({
      where: { id: p.id, verification: 'PENDING' },
      data: { verification: outcome, verifiedById: actor.id, verifiedAt: new Date(), verificationNote: note },
    });
    if (!claimed.count) throw conflict("Bu to'lov allaqachon tekshirilgan");
    await audit(tx, {
      actor,
      req,
      action: outcome === 'VERIFIED' ? 'PAYMENT_VERIFIED' : 'PAYMENT_MISMATCH',
      entityType: 'Payment',
      entityId: p.id,
      summary: `Click ${p.externalRef}: ${outcome === 'VERIFIED' ? 'ko\'chirmada topildi' : `mos emas — ${note}`}`,
      before: { verification: 'PENDING' },
      after: { verification: outcome, note },
    });
    // The payment stays SUCCESS until the CHIEF decides: cancellation is a separate, audited CHIEF action.
    const alert =
      outcome === 'MISMATCH'
        ? await createImmediateAlert(tx, {
            type: 'PAYMENT_MISMATCH',
            title: `${p.space.number}-joy: Click to'lovi ko'chirmada topilmadi`,
            message: `Chek ${p.externalRef}, ${p.amount} UZS, xodim ${p.cashier?.fullName ?? '—'}. ${note}`,
            spaceId: p.spaceId,
            isDemo: p.isDemo,
          })
        : null;
    return { alert };
  });
  if (result.alert) pushNotifications(result.alert.userIds, result.alert.notice);
  emit('payment:updated', { id: paymentId });
  return { ok: true };
}

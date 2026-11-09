import { randomBytes } from 'crypto';
import type { Request } from 'express';
import type { Market, PaymentCycle, PaymentMethod } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { endOfLocalDay, localDateKey, minutes } from '../lib/time';
import { emit } from '../realtime/socket';
import { getActiveCycle, getMarket } from './market.service';
import { getSetting } from './settings.service';
import { createInfoAlert, ensureUnpaidAlert, resolveUnpaidAlerts } from './alert.service';
import { validPaymentWhere } from './spaceStatus.service';
import { DemoSimulatorAdapter } from '../integrations/payments/adapters';
import type { ElectronicMethod, ProviderEvent } from '../integrations/payments/PaymentProvider';
import type { AuthUser } from '../middleware/auth';
import { env } from '../config/env';

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

export interface CashPaymentInput {
  spaceId: string;
  amount: number;
  idempotencyKey: string;
  note?: string;
}

/** Cash workflow: validate → store → receipt → stop alerts → audit. One DB transaction. */
export async function createCashPayment(input: CashPaymentInput, actor: AuthUser, req?: Request) {
  if (actor.role !== 'CASHIER') throw forbidden("Naqd to'lovni faqat kassir qabul qiladi");

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
        method: 'CASH',
        status: 'SUCCESS',
        amount: space.tariff.amount,
        paidAt: now,
        ...validity,
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
      summary: `Naqd to'lov ${payment.amount} UZS, joy ${space.number}, chek ${receipt.receiptNumber}`,
      after: { amount: payment.amount, method: 'CASH', spaceId: space.id, validUntil: payment.validUntil, resolvedAlerts: resolved },
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

// ─── Electronic payments (DEMO simulator only, until providers are integrated) ──

export async function createSimulatedElectronicPayment(
  input: { spaceId: string; method: ElectronicMethod; idempotencyKey: string },
  actor: AuthUser,
  req?: Request,
) {
  if (!env.DEMO_MODE) throw new AppError(503, 'PROVIDER_NOT_INTEGRATED', "Elektron to'lov provayderlari hali ulanmagan");
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { providerTxns: true } });
  if (existing) return { payment: existing, replayed: true };

  const market = await getMarket();
  const adapter = new DemoSimulatorAdapter(input.method);
  return prisma.$transaction(async (tx) => {
    await lockSpace(tx, input.spaceId);
    const space = await tx.tradingSpace.findUnique({ where: { id: input.spaceId }, include: { tariff: true } });
    if (!space || !space.isActive) throw notFound('Faol savdo joyi topilmadi');
    const cycle = await getActiveCycle(market.id, tx);
    if (!cycle) throw conflict("Faol to'lov sikli sozlanmagan");
    const now = new Date();
    if (await tx.payment.findFirst({ where: { spaceId: space.id, ...validPaymentWhere(now) } })) {
      throw conflict("Bu joy uchun amaldagi to'lov mavjud");
    }
    const payment = await tx.payment.create({
      data: {
        spaceId: space.id,
        cashierId: actor.role === 'CASHIER' ? actor.id : null,
        cycleId: cycle.id,
        method: input.method,
        status: 'PENDING',
        amount: space.tariff.amount,
        idempotencyKey: input.idempotencyKey,
        isSimulated: true,
        isDemo: true,
        note: "DEMO simulyatsiya — haqiqiy provayder to'lovi emas",
      },
    });
    const invoice = await adapter.createInvoice({ paymentId: payment.id, amount: payment.amount, description: `Joy ${space.number}` });
    await tx.paymentProviderTransaction.create({
      data: {
        paymentId: payment.id,
        provider: input.method,
        providerTxnId: invoice.providerTxnId,
        state: 'CREATED',
        signatureValid: true,
        isSimulated: true,
        payload: { simulated: true },
      },
    });
    await audit(tx, {
      actor,
      req,
      action: 'PAYMENT_ELECTRONIC_INITIATED',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `DEMO ${input.method} to'lovi yaratildi, joy ${space.number}`,
      isDemo: true,
    });
    return { payment: { ...payment, providerTxnId: invoice.providerTxnId }, replayed: false };
  });
}

/**
 * Apply a verified provider event. Idempotent: the same providerTxnId+outcome can
 * be delivered many times; only the first transition takes effect.
 */
export async function applyProviderEvent(provider: PaymentMethod, event: ProviderEvent, simulated: boolean) {
  const market = await getMarket();
  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.paymentProviderTransaction.findUnique({
      where: { provider_providerTxnId: { provider, providerTxnId: event.providerTxnId } },
      include: { payment: { include: { space: true, cycle: true } } },
    });
    if (!txn || txn.paymentId !== event.paymentId) throw notFound('Provayder tranzaksiyasi topilmadi');
    const p = txn.payment;
    if (event.amount !== p.amount) throw badRequest('Summa mos kelmadi');
    if (p.status !== 'PENDING' && p.status !== 'PENDING_SYNC') {
      return { payment: p, idempotent: true, resolved: [] as string[] };
    }
    await lockSpace(tx, p.spaceId);
    const now = new Date();
    let resolved: string[] = [];
    if (event.outcome === 'SUCCESS') {
      const cycle = p.cycle ?? (await getActiveCycle(market.id, tx));
      if (!cycle) throw conflict("Faol to'lov sikli sozlanmagan");
      const validity = computeValidity(cycle, market, now);
      await tx.payment.update({ where: { id: p.id }, data: { status: 'SUCCESS', paidAt: now, ...validity } });
      await issueReceipt(tx, p.id, market);
      resolved = await resolveUnpaidAlerts(tx, p.spaceId, `Elektron to'lov tasdiqlandi (${provider}${simulated ? ', DEMO' : ''})`);
    } else {
      await tx.payment.update({ where: { id: p.id }, data: { status: event.outcome === 'FAILED' ? 'FAILED' : 'PENDING_SYNC' } });
    }
    await tx.paymentProviderTransaction.update({
      where: { id: txn.id },
      data: { state: event.outcome, payload: event.raw as any },
    });
    await audit(tx, {
      actor: null,
      action: 'PAYMENT_PROVIDER_CALLBACK',
      entityType: 'Payment',
      entityId: p.id,
      summary: `${provider} callback: ${event.outcome}${simulated ? ' (DEMO)' : ''}`,
      isDemo: simulated,
    });
    const updated = await tx.payment.findUniqueOrThrow({ where: { id: p.id }, include: { receipt: true } });
    return { payment: updated, idempotent: false, resolved };
  });
  if (!result.idempotent) {
    emit('payment:updated', { id: result.payment.id });
    emit('space:updated', { id: result.payment.spaceId });
  }
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

export async function closeShift(actor: AuthUser) {
  if (actor.role !== 'CASHIER') throw forbidden();
  return prisma.$transaction(async (tx) => {
    const open = await openShiftFor(tx, actor.id);
    if (!open) throw conflict('Ochiq smena yo\'q');
    const agg = await tx.payment.aggregate({
      where: { shiftId: open.id, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    });
    const shift = await tx.cashierShift.update({ where: { id: open.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await audit(tx, {
      actor,
      action: 'SHIFT_CLOSED',
      entityType: 'CashierShift',
      entityId: shift.id,
      summary: `Smena yopildi: ${agg._count} ta to'lov, ${agg._sum.amount ?? 0} UZS`,
    });
    return { shift, totalAmount: agg._sum.amount ?? 0, count: agg._count };
  });
}

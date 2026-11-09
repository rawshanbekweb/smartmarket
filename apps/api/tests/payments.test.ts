import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, loginAs, prisma, resetDb, uuid, findUnpaidOccupiedSpace } from './helpers';

describe('cash payment workflow', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('demo seed totals are internally consistent', async () => {
    const chief = await loginAs('chief');
    const s = (await chief.get('/api/dashboard/summary')).body;
    expect(s.totalSpaces).toBe(146);
    const sum = Object.values(s.statusCounts as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.totalSpaces);
    expect(s.unpaidOccupied).toBe(8);
    // KPI "payments today" equals the sum of SUCCESS payments paid today in the DB
    const start = new Date(Date.now() + 5 * 3600_000);
    start.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(start.getTime() - 5 * 3600_000);
    const agg = await prisma.payment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: dayStart } }, _sum: { amount: true } });
    expect(s.paymentsToday.amount).toBe(agg._sum.amount);
  });

  it('cashier records a cash payment end-to-end', async () => {
    const cashier = await loginAs('kassir1');
    const chief = await loginAs('chief');
    const before = (await chief.get('/api/dashboard/summary')).body;
    const space = await findUnpaidOccupiedSpace();
    const activeAlert = await prisma.alert.findFirst({ where: { spaceId: space.id, type: 'UNPAID_OCCUPANCY', status: { notIn: ['RESOLVED', 'REJECTED'] } } });
    expect(activeAlert).not.toBeNull();

    // wrong amount is rejected — the backend tariff decides
    const wrong = await cashier.post('/api/payments/collect', { spaceId: space.id, amount: 1, idempotencyKey: uuid() });
    expect(wrong.status).toBe(400);

    const key = uuid();
    const res = await cashier.post('/api/payments/collect', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: key });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('SUCCESS');
    expect(res.body.receipt.receiptNumber).toMatch(/^SM-\d{8}-\d{6}$/);

    // idempotent replay returns the same payment
    const replay = await cashier.post('/api/payments/collect', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: key });
    expect(replay.status).toBe(200);
    expect(replay.body.payment.id).toBe(res.body.payment.id);

    // a second payment for the same cycle is refused
    const dup = await cashier.post('/api/payments/collect', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() });
    expect(dup.status).toBe(409);

    // space status, alerts, dashboard, audit
    const detail = (await chief.get(`/api/spaces/${space.id}`)).body;
    expect(detail.status).toBe('OCCUPIED_PAID');
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: activeAlert!.id } });
    expect(alert.status).toBe('RESOLVED');
    const after = (await chief.get('/api/dashboard/summary')).body;
    expect(after.unpaidOccupied).toBe(before.unpaidOccupied - 1);
    expect(after.paymentsToday.amount).toBe(before.paymentsToday.amount + space.tariff.amount);
    const log = await prisma.auditLog.findFirst({ where: { action: 'PAYMENT_CREATED', entityId: res.body.payment.id } });
    expect(log).not.toBeNull();
  });

  it('requires an open shift', async () => {
    const cashier = await loginAs('kassir2');
    expect((await cashier.post('/api/cashier/shift/close', { declaredCash: 0 })).status).toBe(200);
    const space = await findUnpaidOccupiedSpace();
    const res = await cashier.post('/api/payments/collect', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() });
    expect(res.status).toBe(409);
    expect((await cashier.post('/api/cashier/shift/open', {})).status).toBe(200);
  });

  it('CHIEF cancellation keeps the record and removes it from revenue', async () => {
    const chief = await loginAs('chief');
    const before = (await chief.get('/api/dashboard/summary')).body;
    const p = await prisma.payment.findFirstOrThrow({ where: { status: 'SUCCESS', paidAt: { gte: new Date(Date.now() - 3600_000 * 5) } }, orderBy: { paidAt: 'desc' } });
    expect((await chief.post(`/api/payments/${p.id}/cancel`, { reason: 'ok' })).status).toBe(400); // reason too short
    const res = await chief.post(`/api/payments/${p.id}/cancel`, { reason: "Test: noto'g'ri joy" });
    expect(res.status).toBe(200);
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: p.id }, include: { cancellation: true } });
    expect(stored.status).toBe('CANCELLED');
    expect(stored.cancellation?.reason).toMatch(/Test/);
    const after = (await chief.get('/api/dashboard/summary')).body;
    expect(after.paymentsToday.amount).toBe(before.paymentsToday.amount - p.amount);
    const dist = (await chief.get('/api/dashboard/payment-distribution')).body;
    expect(dist.confirmedRevenue).toBe(dist.cash.amount + dist.electronic.amount);
  });

  it('Click payment needs a unique reference and waits for reconciliation', async () => {
    const cashier = await loginAs('kassir1');
    const space = await findUnpaidOccupiedSpace(['A', 'B']);
    const body = { spaceId: space.id, amount: space.tariff.amount, method: 'CLICK' };
    expect((await cashier.post('/api/payments/collect', { ...body, idempotencyKey: uuid() })).status).toBe(400);

    const res = await cashier.post('/api/payments/collect', { ...body, externalRef: '№ 9876 5432', idempotencyKey: uuid() });
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ method: 'CLICK', status: 'SUCCESS', verification: 'PENDING', externalRef: '98765432' });

    // the same Click check cannot pay for another space
    const other = await findUnpaidOccupiedSpace(['A', 'B']);
    const dup = await cashier.post('/api/payments/collect', { spaceId: other.id, amount: other.tariff.amount, method: 'CLICK', externalRef: '98765432', idempotencyKey: uuid() });
    expect(dup.status).toBe(409);

    // reconciliation: cashiers cannot, admins can, exactly once
    expect((await cashier.post(`/api/collections/click/${res.body.payment.id}/verify`, { outcome: 'VERIFIED' })).status).toBe(403);
    const admin = await loginAs('admin');
    expect((await admin.post(`/api/collections/click/${res.body.payment.id}/verify`, { outcome: 'MISMATCH' })).status).toBe(400); // reason required
    expect((await admin.post(`/api/collections/click/${res.body.payment.id}/verify`, { outcome: 'MISMATCH', note: "Ko'chirmada yo'q" })).status).toBe(200);
    expect((await admin.post(`/api/collections/click/${res.body.payment.id}/verify`, { outcome: 'VERIFIED' })).status).toBe(409);
    const alert = await prisma.alert.findFirst({ where: { type: 'PAYMENT_MISMATCH', spaceId: space.id } });
    expect(alert?.severity).toBe('CRITICAL');
    // the payment itself is untouched until the CHIEF decides
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: res.body.payment.id } })).status).toBe('SUCCESS');
  });

  it('cash handover: expected amount from the shift, shortage raises an alert', async () => {
    const cashier = await loginAs('kassir3');
    await cashier.post('/api/cashier/shift/close', { declaredCash: 0 });
    expect((await cashier.post('/api/cashier/shift/open', {})).status).toBe(200);
    const space = await findUnpaidOccupiedSpace(['E', 'F']);
    expect((await cashier.post('/api/payments/collect', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() })).status).toBe(201);
    expect((await cashier.post('/api/cashier/shift/close', {})).status).toBe(400); // declared amount required
    const closed = await cashier.post('/api/cashier/shift/close', { declaredCash: space.tariff.amount });
    expect(closed.status).toBe(200);
    expect(closed.body.cashAmount).toBe(space.tariff.amount);
    const shiftId = closed.body.shift.id;

    expect((await cashier.post(`/api/collections/handovers/${shiftId}/receive`, { receivedCash: 1 })).status).toBe(403);
    const admin = await loginAs('admin');
    const awaiting = (await admin.get('/api/collections/handovers')).body;
    expect(awaiting.items.some((h: { id: string }) => h.id === shiftId)).toBe(true);
    const r = await admin.post(`/api/collections/handovers/${shiftId}/receive`, { receivedCash: space.tariff.amount - 1000 });
    expect(r.status).toBe(200);
    expect(r.body.difference).toBe(-1000);
    expect((await admin.post(`/api/collections/handovers/${shiftId}/receive`, { receivedCash: 0 })).status).toBe(409);
    expect(await prisma.alert.count({ where: { type: 'CASH_SHORTAGE' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'SHIFT_CASH_RECEIVED', entityId: shiftId } })).toBe(1);
  });

  it('legacy provider endpoints are gone', async () => {
    const chief = await loginAs('chief');
    expect((await chief.post('/api/payments/demo-electronic', {})).status).toBe(404);
    // no webhook route any more: falls through to the CSRF guard / 404, never reaches payment code
    const webhook = await request(app).post('/api/webhooks/payments/click').send({});
    expect([403, 404]).toContain(webhook.status);
  });

  it('reports never count cancelled or pending payments as revenue', async () => {
    const chief = await loginAs('chief');
    const r = (await chief.get('/api/reports/revenue-by-method')).body;
    const agg = await prisma.payment.aggregate({
      where: { status: 'SUCCESS', paidAt: { gte: new Date(Date.now() - 31 * 86_400_000) } },
      _sum: { amount: true },
    });
    expect(r.summary[0].value).toBeLessThanOrEqual(agg._sum.amount!);
    const csv = await chief.get('/api/reports/daily-summary?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
  });
});

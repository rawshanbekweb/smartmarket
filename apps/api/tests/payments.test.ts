import { beforeAll, describe, expect, it } from 'vitest';
import { loginAs, prisma, resetDb, uuid, findUnpaidOccupiedSpace } from './helpers';

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
    const wrong = await cashier.post('/api/payments/cash', { spaceId: space.id, amount: 1, idempotencyKey: uuid() });
    expect(wrong.status).toBe(400);

    const key = uuid();
    const res = await cashier.post('/api/payments/cash', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: key });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('SUCCESS');
    expect(res.body.receipt.receiptNumber).toMatch(/^SM-\d{8}-\d{6}$/);

    // idempotent replay returns the same payment
    const replay = await cashier.post('/api/payments/cash', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: key });
    expect(replay.status).toBe(200);
    expect(replay.body.payment.id).toBe(res.body.payment.id);

    // a second payment for the same cycle is refused
    const dup = await cashier.post('/api/payments/cash', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() });
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
    expect((await cashier.post('/api/cashier/shift/close', {})).status).toBe(200);
    const space = await findUnpaidOccupiedSpace();
    const res = await cashier.post('/api/payments/cash', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() });
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

  it('demo electronic payment is idempotent on provider callbacks', async () => {
    const chief = await loginAs('chief');
    const space = await findUnpaidOccupiedSpace();
    const created = await chief.post('/api/payments/demo-electronic', { spaceId: space.id, method: 'CLICK', idempotencyKey: uuid() });
    expect(created.status).toBe(201);
    const id = created.body.payment.id;
    const first = await chief.post(`/api/payments/${id}/demo-callback`, { outcome: 'SUCCESS' });
    expect(first.body.idempotent).toBe(false);
    const second = await chief.post(`/api/payments/${id}/demo-callback`, { outcome: 'SUCCESS' });
    expect(second.body.idempotent).toBe(true);
    expect(await prisma.receipt.count({ where: { paymentId: id } })).toBe(1);
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

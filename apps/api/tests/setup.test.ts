import { beforeAll, describe, expect, it } from 'vitest';
import { loginAs, prisma, resetDb } from './helpers';

describe('market set-up helpers', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('creates a numbered range of spaces in one request, all or nothing', async () => {
    const admin = await loginAs('admin');
    const row = await prisma.marketRow.findFirstOrThrow({ where: { code: 'A' } });
    const tariff = await prisma.tariff.findFirstOrThrow({ where: { isActive: true } });
    const before = await prisma.tradingSpace.count();

    const ok = await admin.post('/api/spaces/bulk', { rowId: row.id, tariffId: tariff.id, widthMeters: 1.5, prefix: 'Z-', from: 1, to: 12, padLength: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ created: 12, first: 'Z-01', last: 'Z-12' });
    expect(await prisma.tradingSpace.count()).toBe(before + 12);
    const created = await prisma.tradingSpace.findMany({ where: { number: { startsWith: 'Z-' } }, orderBy: { positionInRow: 'asc' } });
    expect(new Set(created.map((s) => s.qrToken)).size).toBe(12);
    expect(new Set(created.map((s) => s.positionInRow)).size).toBe(12);
    expect(await prisma.auditLog.count({ where: { action: 'SPACES_BULK_CREATED' } })).toBe(1);

    // overlapping range: nothing is created, the clash is named
    const clash = await admin.post('/api/spaces/bulk', { rowId: row.id, tariffId: tariff.id, widthMeters: 1.5, prefix: 'Z-', from: 10, to: 20 });
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toContain('Z-10');
    expect(await prisma.tradingSpace.count()).toBe(before + 12);

    expect((await admin.post('/api/spaces/bulk', { rowId: row.id, tariffId: tariff.id, widthMeters: 1.5, prefix: 'Y-', from: 5, to: 1 })).status).toBe(400);
    expect((await admin.post('/api/spaces/bulk', { rowId: row.id, tariffId: tariff.id, widthMeters: 1.5, prefix: 'Y-', from: 1, to: 500 })).status).toBe(400);
  });

  it('cashiers cannot create spaces', async () => {
    const cashier = await loginAs('kassir1');
    const row = await prisma.marketRow.findFirstOrThrow();
    const tariff = await prisma.tariff.findFirstOrThrow();
    const res = await cashier.post('/api/spaces/bulk', { rowId: row.id, tariffId: tariff.id, widthMeters: 1, prefix: 'Q-', from: 1, to: 2 });
    expect(res.status).toBe(403);
  });

  it('duplicate space numbers, row codes and logins get a specific message', async () => {
    const chief = await loginAs('chief');
    const space = await prisma.tradingSpace.findFirstOrThrow({ include: { row: true } });
    const dupSpace = await chief.post('/api/spaces', { number: space.number, rowId: space.rowId, widthMeters: 1.5, tariffId: space.tariffId });
    expect(dupSpace.status).toBe(409);
    expect(dupSpace.body.error.message).toContain(space.number);
    const dupRow = await chief.post('/api/rows', { code: space.row.code, name: 'Takror' });
    expect(dupRow.status).toBe(409);
    const dupUser = await chief.post('/api/users', { fullName: 'Takror Kassir', username: 'kassir1', role: 'CASHIER', password: 'Takror@2026xx' });
    expect(dupUser.status).toBe(409);
    expect(dupUser.body.error.message).toContain('kassir1');
  });

  it('the space list can return the whole market for pickers', async () => {
    const cashier = await loginAs('kassir1');
    const total = await prisma.tradingSpace.count({ where: { isActive: true } });
    const res = await cashier.get('/api/spaces?pageSize=2000');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(total);
    expect((await cashier.get('/api/payments?pageSize=2000')).status).toBe(400);
  });

  it('reports which set-up steps are still missing', async () => {
    const chief = await loginAs('chief');
    const full = (await chief.get('/api/dashboard/setup')).body;
    expect(full.complete).toBe(true);
    expect(Object.values(full.steps).every(Boolean)).toBe(true);

    await prisma.paymentCycle.updateMany({ data: { isActive: false } });
    const missing = (await chief.get('/api/dashboard/setup')).body;
    expect(missing.complete).toBe(false);
    expect(missing.steps).toMatchObject({ cycle: false, tariff: true, spaces: true });

    const cashier = await loginAs('kassir1');
    expect((await cashier.get('/api/dashboard/setup')).status).toBe(403);
  });
});

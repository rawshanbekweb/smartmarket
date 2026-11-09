import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, loginAs, prisma, resetDb, uuid } from './helpers';
import { processDueAlerts } from '../src/services/alert.service';
import { recordObservation } from '../src/services/occupancy.service';

const MIN = 60_000;

describe('alert lifecycle (persistent escalation)', () => {
  beforeAll(async () => {
    await resetDb();
  });

  async function freshOccupiedSpace() {
    // A free space under an online camera with no payment
    const now = new Date();
    const space = await prisma.tradingSpace.findFirstOrThrow({
      where: {
        occupancyState: 'FREE',
        row: { code: 'A' },
        cameraZone: { camera: { status: 'ONLINE' } },
        payments: { none: { status: 'SUCCESS', validUntil: { gt: now } } },
      },
      include: { tariff: true },
    });
    await recordObservation({ spaceId: space.id, state: 'OCCUPIED', source: 'AI', confidence: 0.95 });
    return space;
  }

  it('occupied without payment → alert → admin after 5 min → chief after +10 min (timestamps in DB)', async () => {
    const space = await freshOccupiedSpace();
    const alert = await prisma.alert.findFirstOrThrow({ where: { spaceId: space.id, type: 'UNPAID_OCCUPANCY', status: 'OPEN' } });
    expect(alert.adminNotifyAt!.getTime() - alert.detectedAt.getTime()).toBe(5 * MIN);

    // nothing happens before the deadline
    await processDueAlerts(new Date(alert.detectedAt.getTime() + 4 * MIN));
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe('OPEN');

    // simulating a restart: only persisted timestamps drive the processor
    await processDueAlerts(new Date(alert.detectedAt.getTime() + 5 * MIN + 1000));
    const notified = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(notified.status).toBe('ADMIN_NOTIFIED');
    expect(notified.chiefEscalateAt!.getTime() - notified.adminNotifiedAt!.getTime()).toBe(10 * MIN);
    const adminNotes = await prisma.notification.count({ where: { alertId: alert.id, user: { role: 'MARKET_ADMIN' } } });
    expect(adminNotes).toBeGreaterThan(0);

    await processDueAlerts(new Date(notified.chiefEscalateAt!.getTime() + 1000));
    const escalated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(escalated.status).toBe('ESCALATED');
    expect(escalated.severity).toBe('CRITICAL');

    // processing again is a no-op (idempotent)
    await processDueAlerts(new Date(notified.chiefEscalateAt!.getTime() + 2000));
    expect(await prisma.alertEscalation.count({ where: { alertId: alert.id, level: 'CHIEF' } })).toBe(1);
  });

  it('payment confirmation stops escalation', async () => {
    const space = await freshOccupiedSpace();
    const alert = await prisma.alert.findFirstOrThrow({ where: { spaceId: space.id, status: 'OPEN' } });
    const cashier = await loginAs('kassir1');
    const r = await cashier.post('/api/payments/cash', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() });
    expect(r.status).toBe(201);
    await processDueAlerts(new Date(Date.now() + 60 * MIN));
    const after = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(after.status).toBe('RESOLVED');
    expect(after.escalatedAt).toBeNull();
  });

  it('admin cannot resolve an unpaid alert while the space is still occupied and unpaid; reject marks false detection', async () => {
    const space = await freshOccupiedSpace();
    const alert = await prisma.alert.findFirstOrThrow({ where: { spaceId: space.id, status: 'OPEN' } });
    const admin = await loginAs('admin');
    expect((await admin.post(`/api/alerts/${alert.id}/resolve`, { note: 'hal qilindi' })).status).toBe(409);
    expect((await admin.post(`/api/alerts/${alert.id}/reject`, { note: "Noto'g'ri aniqlash: yuk qoldirilgan" })).status).toBe(200);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe('REJECTED');
    expect((await prisma.tradingSpace.findUniqueOrThrow({ where: { id: space.id } })).occupancyState).toBe('FREE');
  });

  it('CHIEF exemption approval resolves active unpaid alerts', async () => {
    const space = await freshOccupiedSpace();
    const alert = await prisma.alert.findFirstOrThrow({ where: { spaceId: space.id, status: 'OPEN' } });
    const chief = await loginAs('chief');
    const res = await chief.post('/api/exemptions', { spaceId: space.id, reason: 'Test imtiyoz sababi' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe('RESOLVED');
    const detail = (await chief.get(`/api/spaces/${space.id}`)).body;
    expect(detail.status).toBe('EXEMPTED');
  });

  it('MARKET_ADMIN exemption is only a PENDING request', async () => {
    const admin = await loginAs('admin');
    const space = await prisma.tradingSpace.findFirstOrThrow({ where: { row: { code: 'B' } } });
    const res = await admin.post('/api/exemptions', { spaceId: space.id, reason: "Admin so'rovi test" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  it('seller QR complaint creates an immediate alert; QR exposes no internal data', async () => {
    const space = await prisma.tradingSpace.findFirstOrThrow({ where: { row: { code: 'C' } } });
    const info = await request(app).get(`/api/public/spaces/${space.qrToken}`);
    expect(info.status).toBe(200);
    expect(JSON.stringify(info.body)).not.toMatch(/cashier|qrToken|spaceId|"id"/);
    const res = await request(app).post(`/api/public/spaces/${space.qrToken}/complaints`).send({ type: 'CASH_PAID_NO_RECEIPT', description: 'Test shikoyat' });
    expect(res.status).toBe(201);
    const alert = await prisma.alert.findFirstOrThrow({ where: { spaceId: space.id, type: 'SELLER_COMPLAINT' }, orderBy: { createdAt: 'desc' } });
    expect(alert.status).toBe('ADMIN_NOTIFIED');
    expect((await request(app).get('/api/public/spaces/deadbeefdeadbeefdeadbeef')).status).toBe(404);
  });

  it('camera going offline raises an immediate critical alert', async () => {
    const chief = await loginAs('chief');
    const cam = await prisma.camera.findFirstOrThrow({ where: { code: 'CAM-01' } });
    expect((await chief.post(`/api/demo/cameras/${cam.id}/status`, { status: 'OFFLINE' })).status).toBe(200);
    const alert = await prisma.alert.findFirstOrThrow({ where: { cameraId: cam.id, type: 'CAMERA_OFFLINE', status: 'ADMIN_NOTIFIED' } });
    expect(alert.severity).toBe('CRITICAL');
    await chief.post(`/api/demo/cameras/${cam.id}/status`, { status: 'ONLINE' });
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe('RESOLVED');
  });
});

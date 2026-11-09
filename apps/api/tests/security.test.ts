import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, loginAs, prisma, resetDb, uuid, findUnpaidOccupiedSpace } from './helpers';

describe('authentication & authorization', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('rejects unauthenticated access to protected APIs', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });

  it('rejects wrong password without revealing which field was wrong', async () => {
    const res = await request(app).post('/api/auth/login').set('X-Requested-With', 'SmartMarket').send({ username: 'chief', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Login yoki parol/);
  });

  it('logs in and sets an httpOnly SameSite=Strict cookie; never returns password hash', async () => {
    const res = await request(app).post('/api/auth/login').set('X-Requested-With', 'SmartMarket').send({ username: 'chief', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const chief = await loginAs('chief');
    const res = await chief.agent.post('/api/notifications/read-all').send({});
    expect(res.status).toBe(403);
  });

  it('CASHIER cannot cancel payments (backend enforced)', async () => {
    const cashier = await loginAs('kassir1');
    const p = await prisma.payment.findFirstOrThrow({ where: { status: 'SUCCESS' } });
    const res = await cashier.post(`/api/payments/${p.id}/cancel`, { reason: 'test reason' });
    expect(res.status).toBe(403);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('SUCCESS');
  });

  it('MARKET_ADMIN cannot cancel payments or approve exemptions', async () => {
    const admin = await loginAs('admin');
    const p = await prisma.payment.findFirstOrThrow({ where: { status: 'SUCCESS' } });
    expect((await admin.post(`/api/payments/${p.id}/cancel`, { reason: 'test reason' })).status).toBe(403);
    const pending = await prisma.exemption.findFirstOrThrow({ where: { status: 'PENDING' } });
    expect((await admin.post(`/api/exemptions/${pending.id}/decision`, { decision: 'APPROVED' })).status).toBe(403);
  });

  it('CASHIER cannot access exemptions, alerts, audit or users', async () => {
    const cashier = await loginAs('kassir1');
    for (const url of ['/api/exemptions', '/api/alerts', '/api/audit', '/api/users', '/api/reports/daily-summary']) {
      expect((await cashier.get(url)).status).toBe(403);
    }
  });

  it('MARKET_ADMIN cannot record cash payments', async () => {
    const admin = await loginAs('admin');
    const space = await findUnpaidOccupiedSpace();
    const res = await admin.post('/api/payments/cash', { spaceId: space.id, amount: space.tariff.amount, idempotencyKey: uuid() });
    expect(res.status).toBe(403);
  });

  it('CASHIER only sees own transactions', async () => {
    const cashier = await loginAs('kassir1');
    const res = await cashier.get('/api/payments?pageSize=200');
    expect(res.status).toBe(200);
    const me = await prisma.user.findUniqueOrThrow({ where: { username: 'kassir1' } });
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((p: any) => p.cashier?.id === me.id)).toBe(true);
  });

  it('internal vision API requires the shared key and cannot touch payments', async () => {
    const bad = await request(app).post('/api/internal/vision/observations').set('X-Internal-Api-Key', 'nope').send({ cameraCode: 'CAM-01', observations: [] });
    expect(bad.status).toBe(401);
    const ok = await request(app)
      .post('/api/internal/vision/observations')
      .set('X-Internal-Api-Key', process.env.VISION_API_KEY!)
      .send({ cameraCode: 'CAM-01', observations: [{ zoneCode: 'Z-A-01', state: 'OCCUPIED', confidence: 0.9 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.accepted).toBe(1);
    expect((await request(app).post('/api/internal/payments').set('X-Internal-Api-Key', process.env.VISION_API_KEY!)).status).toBe(404);
  });

  it('audit log is append-only at the database level', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { summary: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it('real payment provider webhooks are disabled until integrated', async () => {
    const res = await request(app).post('/api/webhooks/payments/payme').send({});
    expect(res.status).toBe(503);
  });
});

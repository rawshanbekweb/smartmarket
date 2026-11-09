import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, loginAs, prisma, resetDb } from './helpers';
import { DEMO_PASSWORD } from '../src/demo/seedDemo';
import { env, productionConfigErrors } from '../src/config/env';
import { isWithinWorkingHours } from '../src/services/settings.service';
import { ensureUnpaidAlert } from '../src/services/alert.service';
import { bootstrapProduction } from '../src/services/bootstrap.service';

const login = (username: string, password = DEMO_PASSWORD) =>
  request(app).post('/api/auth/login').set('X-Requested-With', 'SmartMarket').send({ username, password });

const NEW_PASSWORD = 'Yangi-Parol-2026';

describe('account protection', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('locks an account after repeated wrong passwords, even for the correct one; CHIEF can unlock', async () => {
    for (let i = 0; i < 5; i++) expect((await login('admin2', 'wrong-password')).status).toBe(401);
    const blocked = await login('admin2');
    expect(blocked.status).toBe(423);
    expect(blocked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(await prisma.auditLog.count({ where: { action: 'ACCOUNT_LOCKED' } })).toBe(1);

    const chief = await loginAs('chief');
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'admin2' } });
    expect((await chief.post(`/api/users/${u.id}/unlock`)).status).toBe(200);
    expect((await login('admin2')).status).toBe(200);
  });

  it('a successful login resets the failure counter', async () => {
    for (let i = 0; i < 4; i++) await login('admin', 'wrong-password');
    expect((await login('admin')).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).failedLoginCount).toBe(0);
  });

  it('password reset by CHIEF revokes existing sessions and forces a password change', async () => {
    const cashier = await loginAs('kassir2');
    expect((await cashier.get('/api/payments')).status).toBe(200);

    const chief = await loginAs('chief');
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'kassir2' } });
    expect((await chief.patch(`/api/users/${u.id}`, { password: 'Vaqtincha-2026' })).status).toBe(200);

    // old session is dead
    expect((await cashier.get('/api/payments')).status).toBe(401);

    // new session works only for changing the password
    const fresh = request.agent(app);
    const r = await fresh.post('/api/auth/login').set('X-Requested-With', 'SmartMarket').send({ username: 'kassir2', password: 'Vaqtincha-2026' });
    expect(r.body.user.mustChangePassword).toBe(true);
    const blocked = await fresh.get('/api/payments');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const weak = await fresh.post('/api/auth/password').set('X-Requested-With', 'SmartMarket').send({ currentPassword: 'Vaqtincha-2026', newPassword: 'short1' });
    expect(weak.status).toBe(400);
    const changed = await fresh.post('/api/auth/password').set('X-Requested-With', 'SmartMarket').send({ currentPassword: 'Vaqtincha-2026', newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    // the re-issued cookie keeps this device logged in
    expect((await fresh.get('/api/payments')).status).toBe(200);
  });

  it('changing own password logs out other devices and needs the current password', async () => {
    const laptop = await loginAs('admin');
    const phone = await loginAs('admin');
    expect((await phone.post('/api/auth/password', { currentPassword: 'wrong', newPassword: NEW_PASSWORD })).status).toBe(400);
    expect((await phone.post('/api/auth/password', { currentPassword: DEMO_PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(200);
    expect((await laptop.get('/api/dashboard/summary')).status).toBe(401);
    expect((await phone.get('/api/dashboard/summary')).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_CHANGED' } })).toBeGreaterThanOrEqual(1);
  });

  it('deactivating a user ends their session immediately', async () => {
    const cashier = await loginAs('kassir3');
    const chief = await loginAs('chief');
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'kassir3' } });
    expect((await chief.patch(`/api/users/${u.id}`, { isActive: false })).status).toBe(200);
    expect((await cashier.get('/api/payments')).status).toBe(401);
    expect((await chief.patch(`/api/users/${u.id}`, { isActive: true })).status).toBe(200);
  });

  it('newly created users must change the initial password; weak passwords are rejected', async () => {
    const chief = await loginAs('chief');
    const weak = await chief.post('/api/users', { fullName: 'Yangi Kassir', username: 'kassir9', role: 'CASHIER', password: 'abc12345' });
    expect(weak.status).toBe(400);
    const ok = await chief.post('/api/users', { fullName: 'Yangi Kassir', username: 'kassir9', role: 'CASHIER', password: 'Boshlangich-2026' });
    expect(ok.status).toBe(201);
    expect(ok.body.mustChangePassword).toBe(true);
  });
});

describe('working hours', () => {
  beforeAll(async () => {
    await resetDb();
  });

  // 2026-11-09 local (UTC+5): 03:00 local = 22:00Z previous day, 12:00 local = 07:00Z
  const night = new Date('2026-11-08T22:00:00Z');
  const noon = new Date('2026-11-09T07:00:00Z');

  it('defaults to round-the-clock monitoring', async () => {
    expect(await isWithinWorkingHours(night, 300)).toBe(true);
  });

  it('rejects malformed hours', async () => {
    const chief = await loginAs('chief');
    const res = await chief.agent.put('/api/settings/values/market.workingHoursStart').set('X-Requested-With', 'SmartMarket').send({ value: '25:00' });
    expect(res.status).toBe(400);
  });

  it('does not open unpaid-occupancy alerts outside working hours', async () => {
    const chief = await loginAs('chief');
    const put = (k: string, value: string) => chief.agent.put(`/api/settings/values/${k}`).set('X-Requested-With', 'SmartMarket').send({ value });
    expect((await put('market.workingHoursStart', '06:00')).status).toBe(200);
    expect((await put('market.workingHoursEnd', '20:00')).status).toBe(200);

    expect(await isWithinWorkingHours(night, 300)).toBe(false);
    expect(await isWithinWorkingHours(noon, 300)).toBe(true);

    const free = await prisma.tradingSpace.findFirstOrThrow({
      where: {
        occupancyState: 'FREE',
        isActive: true,
        cameraZone: { camera: { status: 'ONLINE' } },
        payments: { none: { status: 'SUCCESS', validUntil: { gt: night } } },
        exemptions: { none: { status: 'APPROVED', validUntil: { gt: night } } },
      },
    });
    const space = await prisma.tradingSpace.update({ where: { id: free.id }, data: { occupancyState: 'OCCUPIED' } });
    expect(await ensureUnpaidAlert(prisma, space.id, night)).toBeNull();
    expect(await ensureUnpaidAlert(prisma, space.id, noon)).not.toBeNull();
  });

  it('supports windows that wrap past midnight', async () => {
    await prisma.systemSetting.update({ where: { key: 'market.workingHoursStart' }, data: { value: '20:00' } });
    await prisma.systemSetting.update({ where: { key: 'market.workingHoursEnd' }, data: { value: '04:00' } });
    expect(await isWithinWorkingHours(night, 300)).toBe(true);
    expect(await isWithinWorkingHours(noon, 300)).toBe(false);
  });
});

describe('production configuration & bootstrap', () => {
  it('refuses demo mode and placeholder secrets in production', () => {
    const errors = productionConfigErrors({
      ...env,
      isProd: true,
      DEMO_MODE: true,
      JWT_SECRET: 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS',
      VISION_API_KEY: 'CHANGE_ME_INTERNAL_VISION_KEY',
    });
    expect(errors).toHaveLength(3);
    expect(productionConfigErrors({ ...env, isProd: false, DEMO_MODE: true })).toEqual([]);
  });

  it('refuses to bootstrap a database with demo data', async () => {
    await resetDb();
    await expect(
      bootstrapProduction(prisma, { marketName: 'Bozor', fullName: 'Rahbar Ismi', username: 'rahbar', password: 'Kuchli-Parol-2026' }),
    ).rejects.toThrow(/DEMO/);
  });

  it('creates the market and first CHIEF on an empty database, exactly once', async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "AuditLog", "Notification", "AlertEvent", "AlertEscalation", "Alert", "Complaint", "Exemption", "PaymentCancellation", "Receipt", "PaymentProviderTransaction", "Payment", "CashierShift", "CashierRowAssignment", "OccupancyObservation", "CameraHealthEvent", "CameraZone", "Camera", "TradingSpace", "PaymentCycle", "Tariff", "MarketRow", "Market", "SystemSetting", "User" RESTART IDENTITY CASCADE`,
    );
    const input = { marketName: 'Haqiqiy bozor', fullName: 'Rahbar Ismi', username: 'Rahbar', password: 'Kuchli-Parol-2026' };
    await expect(bootstrapProduction(prisma, { ...input, password: 'weak' })).rejects.toThrow();

    const r = await bootstrapProduction(prisma, input);
    expect(r.marketCreated).toBe(true);
    expect(r.user).toMatchObject({ username: 'rahbar', role: 'CHIEF' });
    expect(await prisma.auditLog.count({ where: { action: 'SYSTEM_BOOTSTRAPPED' } })).toBe(1);

    const res = await login('rahbar', input.password);
    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(false);

    await expect(bootstrapProduction(prisma, { ...input, username: 'boshqa' })).rejects.toThrow(/allaqachon/);
    await resetDb();
  });
});

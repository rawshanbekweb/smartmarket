/**
 * DEMO data generator. Every record is flagged isDemo=true and labelled "DEMO".
 * Data is deterministic (seeded PRNG) and internally consistent: dashboard totals
 * are computed live from these same rows.
 *
 * This wipes ALL tables. It refuses to run unless DEMO_MODE=true and NODE_ENV≠production.
 */
import { randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma, type PrismaClient, type PaymentMethod } from '@prisma/client';
import { endOfLocalDay, localDateKey, startOfLocalDay } from '../lib/time';
import { SETTING_DEFAULTS } from '../services/settings.service';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEMO_PASSWORD = 'Demo@2026';
export const DEMO_USERS = [
  { username: 'chief', fullName: 'Rustam Karimov (DEMO rahbar)', role: 'CHIEF' },
  { username: 'admin', fullName: 'Dilnoza Yusupova (DEMO admin)', role: 'MARKET_ADMIN' },
  { username: 'admin2', fullName: 'Jasur Toshmatov (DEMO admin)', role: 'MARKET_ADMIN' },
  { username: 'kassir1', fullName: 'Malika Rahimova (DEMO kassir)', role: 'CASHIER' },
  { username: 'kassir2', fullName: 'Bekzod Aliyev (DEMO kassir)', role: 'CASHIER' },
  { username: 'kassir3', fullName: 'Nodira Saidova (DEMO kassir)', role: 'CASHIER' },
] as const;

const ROWS = [
  { code: 'A', count: 25 },
  { code: 'B', count: 25 },
  { code: 'C', count: 24 },
  { code: 'D', count: 24 },
  { code: 'E', count: 24 },
  { code: 'F', count: 24 },
];
const TARIFF_AMOUNT = 16_000;
const OFF = 300; // UTC+5

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemo(prisma: PrismaClient, opts: { now?: Date; quiet?: boolean } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed DEMO data in production.');
  if (process.env.DEMO_MODE !== 'true') throw new Error('Refusing to seed: DEMO_MODE must be true.');

  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);  
  const now = opts.now ?? new Date();
  const rand = rng(146_2026);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const shuffle = <T>(arr: T[]) => {
    const c = [...arr];
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  };
  const token = (n = 12) => randomBytes(n).toString('hex');

  // ── wipe ────────────────────────────────────────────────────────────────
  const tables = [
    'AuditLog', 'Notification', 'AlertEvent', 'AlertEscalation', 'Alert', 'Complaint', 'Exemption',
    'PaymentCancellation', 'Receipt', 'PaymentProviderTransaction', 'Payment', 'CashierShift',
    'CashierRowAssignment', 'OccupancyObservation', 'CameraHealthEvent', 'CameraZone', 'Camera',
    'TradingSpace', 'PaymentCycle', 'Tariff', 'MarketRow', 'Market', 'SystemSetting', 'User',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  log('• tables truncated');

  // ── market, settings, tariff, cycle ─────────────────────────────────────
  const market = await prisma.market.create({
    data: { name: 'SMART MARKET — Demo bozor', address: 'DEMO manzil (namoyish uchun)', utcOffsetMinutes: OFF, isDemo: true },
  });
  await prisma.systemSetting.createMany({
    data: Object.entries(SETTING_DEFAULTS).map(([key, d]) => ({ key, value: d.value, description: d.description })),
  });
  const tariff = await prisma.tariff.create({
    data: { marketId: market.id, name: 'Standart joy — 1,5 m (DEMO)', amount: TARIFF_AMOUNT, widthMeters: new Prisma.Decimal('1.50'), isDefault: true, isDemo: true },
  });
  const cycle = await prisma.paymentCycle.create({
    data: {
      marketId: market.id,
      name: 'DEMO: kunlik sikl (namoyish)',
      type: 'CALENDAR_DAY',
      description: "DEMO namunasi. Haqiqiy to'lov muddati hali tasdiqlanmagan — bu faqat ish jarayonini ko'rsatish uchun.",
      isActive: true,
      isDemo: true,
    },
  });

  // ── users ───────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: Record<string, { id: string; fullName: string; role: string }> = {};
  for (const u of DEMO_USERS) {
    const created = await prisma.user.create({
      data: { ...u, passwordHash: hash, isDemo: true, phone: '+998 90 000 00 00', lastLoginAt: new Date(now.getTime() - between(1, 20) * HOUR) },
    });
    users[u.username] = created;
  }
  const chief = users.chief;
  const admin = users.admin;
  const cashierForRow: Record<string, string> = {
    A: users.kassir1.id, B: users.kassir1.id, C: users.kassir2.id, D: users.kassir2.id, E: users.kassir3.id, F: users.kassir3.id,
  };

  // ── rows, cameras, spaces, zones ────────────────────────────────────────
  type Space = { id: string; number: string; rowCode: string; rowName: string; cameraId: string; cameraCode: string; zoneCode: string };
  const spaces: Space[] = [];
  const cameras: { id: string; code: string; status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' }[] = [];
  const zones: Prisma.CameraZoneCreateManyInput[] = [];
  const spaceRows: Prisma.TradingSpaceCreateManyInput[] = [];
  let camNo = 0;
  for (const [ri, r] of ROWS.entries()) {
    const row = await prisma.marketRow.create({
      data: { marketId: market.id, code: r.code, name: `${r.code} qator`, sortOrder: ri + 1, isDemo: true },
    });
    await prisma.cashierRowAssignment.create({
      data: { cashierId: cashierForRow[r.code], rowId: row.id, startsAt: new Date(now.getTime() - 60 * DAY), isDemo: true },
    });
    const half = Math.ceil(r.count / 2);
    const rowCams: string[] = [];
    for (let h = 0; h < 2; h++) {
      camNo++;
      const code = `CAM-${String(camNo).padStart(2, '0')}`;
      const status = code === 'CAM-09' ? 'OFFLINE' : code === 'CAM-04' ? 'DEGRADED' : 'ONLINE';
      const cam = await prisma.camera.create({
        data: {
          marketId: market.id,
          code,
          name: `${r.code} qator, ${h === 0 ? 'boshi' : 'oxiri'} (DEMO)`,
          ipAddress: `192.168.10.${100 + camNo}`,
          model: 'Hikvision — model aniqlanmagan (DEMO)',
          provider: 'DEMO',
          streamConfigRef: `DEMO_CAM_${String(camNo).padStart(2, '0')}`,
          status,
          lastHeartbeatAt: status === 'OFFLINE' ? new Date(now.getTime() - 40 * MIN) : now,
          lastFrameAt: status === 'OFFLINE' ? new Date(now.getTime() - 40 * MIN) : now,
          isDemo: true,
          createdAt: new Date(now.getTime() - 60 * DAY),
        },
      });
      cameras.push({ id: cam.id, code, status });
      rowCams.push(cam.id);
    }
    for (let i = 1; i <= r.count; i++) {
      const id = randomUUID();
      const number = `${r.code}-${String(i).padStart(2, '0')}`;
      const camIdx = i <= half ? 0 : 1;
      const posInCam = camIdx === 0 ? i - 1 : i - half - 1;
      const perCam = camIdx === 0 ? half : r.count - half;
      const w = 1 / perCam;
      const zoneCode = `Z-${number}`;
      spaceRows.push({
        id, marketId: market.id, rowId: row.id, number, positionInRow: i, widthMeters: new Prisma.Decimal('1.50'),
        tariffId: tariff.id, qrToken: token(), occupancyState: 'UNKNOWN', isDemo: true,
        createdAt: new Date(now.getTime() - 60 * DAY),
      });
      zones.push({
        id: randomUUID(), cameraId: rowCams[camIdx], spaceId: id, zoneCode,
        polygon: [[posInCam * w, 0.35], [(posInCam + 1) * w - 0.01, 0.35], [(posInCam + 1) * w - 0.01, 0.95], [posInCam * w, 0.95]],
      });
      const cam = cameras.find((c) => c.id === rowCams[camIdx])!;
      spaces.push({ id, number, rowCode: r.code, rowName: row.name, cameraId: cam.id, cameraCode: cam.code, zoneCode });
    }
  }
  await prisma.tradingSpace.createMany({ data: spaceRows });
  await prisma.cameraZone.createMany({ data: zones });
  log(`• ${spaces.length} spaces, ${cameras.length} cameras`);

  // ── collectors ──────────────────────────────────────────────────────────
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const receipts: Prisma.ReceiptCreateManyInput[] = [];
  const cancellations: Prisma.PaymentCancellationCreateManyInput[] = [];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const shifts: Prisma.CashierShiftCreateManyInput[] = [];
  const observations: Prisma.OccupancyObservationCreateManyInput[] = [];
  const alerts: Prisma.AlertCreateManyInput[] = [];
  const alertEvents: Prisma.AlertEventCreateManyInput[] = [];
  const escalations: Prisma.AlertEscalationCreateManyInput[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const healthEvents: Prisma.CameraHealthEventCreateManyInput[] = [];
  const complaints: Prisma.ComplaintCreateManyInput[] = [];
  const exemptions: Prisma.ExemptionCreateManyInput[] = [];
  const spaceState = new Map<string, { occupancyState: 'FREE' | 'OCCUPIED' | 'UNKNOWN'; lastDetectedAt: Date | null }>();

  const shiftKey = new Map<string, string>(); // cashierId|day → shiftId
  const shiftFor = (cashierId: string, at: Date) => {
    const dayKey = localDateKey(at, OFF);
    const k = `${cashierId}|${dayKey}`;
    let id = shiftKey.get(k);
    if (!id) {
      id = randomUUID();
      const dayStart = startOfLocalDay(at, OFF);
      const isToday = dayKey === localDateKey(now, OFF);
      shifts.push({
        id, cashierId, status: isToday ? 'OPEN' : 'CLOSED', isDemo: true,
        openedAt: new Date(Math.min(dayStart.getTime() + 6 * HOUR, at.getTime() - 10 * MIN)),
        closedAt: isToday ? null : new Date(dayStart.getTime() + 18 * HOUR),
      });
      shiftKey.set(k, id);
    }
    return id;
  };

  // Collectors take cash or a Click transfer (recorded with its check number) on the spot.
  const methodPick = (): PaymentMethod => (rand() < 0.7 ? 'CASH' : 'CLICK');
  let clickSeq = 0;

  type PayOpts = { space: Space; at: Date; method?: PaymentMethod; status?: 'SUCCESS' | 'CANCELLED'; cancelAt?: Date; cancelReason?: string; verification?: 'PENDING' | 'VERIFIED' | 'MISMATCH' };
  const addPayment = (o: PayOpts) => {
    const method = o.method ?? methodPick();
    const status = o.status ?? 'SUCCESS';
    const id = randomUUID();
    const cashierId = cashierForRow[o.space.rowCode];
    const isClick = method === 'CLICK';
    // Older Click payments are already reconciled; today's wait for the statement.
    const verification = !isClick ? 'NOT_REQUIRED' : o.verification ?? (o.at < todayStart ? 'VERIFIED' : 'PENDING');
    const externalRef = isClick ? `DEMO${String(4_100_000 + ++clickSeq)}` : null;
    payments.push({
      id, spaceId: o.space.id, cashierId, shiftId: shiftFor(cashierId, o.at), cycleId: cycle.id,
      method, status, amount: TARIFF_AMOUNT,
      validFrom: o.at, validUntil: endOfLocalDay(o.at, OFF), paidAt: o.at,
      externalRef, verification,
      verifiedById: verification === 'VERIFIED' || verification === 'MISMATCH' ? admin.id : null,
      verifiedAt: verification === 'VERIFIED' || verification === 'MISMATCH' ? new Date(o.at.getTime() + 20 * HOUR) : null,
      verificationNote: verification === 'MISMATCH' ? "Click ko'chirmasida bunday chek yo'q (DEMO)" : null,
      idempotencyKey: randomUUID(), isDemo: true, createdAt: o.at, updatedAt: o.cancelAt ?? o.at,
    });
    audits.push({
      actorId: cashierId, actorRole: 'CASHIER',
      action: 'PAYMENT_CREATED', entityType: 'Payment', entityId: id,
      summary: `${isClick ? `Click (${externalRef})` : 'Naqd'} to'lov ${TARIFF_AMOUNT} UZS, joy ${o.space.number}`,
      isDemo: true, createdAt: o.at,
    });
    if (status === 'CANCELLED' && o.cancelAt) {
      cancellations.push({ id: randomUUID(), paymentId: id, reason: o.cancelReason ?? 'Xato kiritilgan (DEMO)', cancelledById: chief.id, createdAt: o.cancelAt });
      audits.push({
        actorId: chief.id, actorRole: 'CHIEF', action: 'PAYMENT_CANCELLED', entityType: 'Payment', entityId: id,
        summary: `To'lov bekor qilindi: ${TARIFF_AMOUNT} UZS, joy ${o.space.number}. Sabab: ${o.cancelReason}`, isDemo: true, createdAt: o.cancelAt,
      });
      alerts.push({
        id: randomUUID(), type: 'PAYMENT_CANCELLED', severity: 'INFO', status: 'RESOLVED', title: `${o.space.number}-joy: to'lov bekor qilindi`,
        message: o.cancelReason, spaceId: o.space.id, paymentId: id, detectedAt: o.cancelAt, resolvedAt: o.cancelAt, resolvedById: chief.id,
        resolutionNote: "Ma'lumot uchun hodisa", isDemo: true, createdAt: o.cancelAt,
      });
    }
    {
      const c = DEMO_USERS.find((u) => users[u.username].id === cashierId);
      receipts.push({
        id: randomUUID(), paymentId: id, receiptNumber: '', publicToken: token(16), issuedAt: o.at,
        content: {
          marketName: market.name, marketAddress: market.address, spaceNumber: o.space.number, rowName: o.space.rowName,
          amount: TARIFF_AMOUNT, currency: 'UZS', method, externalRef, cashierName: c?.fullName ?? null, paidAt: o.at.toISOString(),
          validUntil: endOfLocalDay(o.at, OFF).toISOString(), cycleName: cycle.name, demo: true,
          footer: SETTING_DEFAULTS['receipt.footerText'].value,
        },
      });
    }
    return id;
  };

  const obs = (space: Space, state: 'FREE' | 'OCCUPIED' | 'UNKNOWN', at: Date) => {
    observations.push({ id: randomUUID(), spaceId: space.id, cameraId: space.cameraId, state, confidence: Math.round(between(0.82, 0.99) * 100) / 100, source: 'DEMO_SIMULATOR', observedAt: at, isDemo: true, createdAt: at });
    const cur = spaceState.get(space.id);
    if (!cur?.lastDetectedAt || cur.lastDetectedAt <= at) spaceState.set(space.id, { occupancyState: state, lastDetectedAt: at });
  };

  const todayStart = startOfLocalDay(now, OFF);
  // Today's trading window: from 06:00 local (or day start if earlier) until a few minutes ago.
  const winStart = Math.min(todayStart.getTime() + 6 * HOUR, now.getTime() - 3 * HOUR);
  const winEnd = now.getTime() - 20 * MIN;
  const todayAt = () => new Date(Math.max(todayStart.getTime() + MIN, between(winStart, winEnd)));

  // ── history (previous 30 days) ──────────────────────────────────────────
  const cancelReasons = ["Kassir noto'g'ri joyni tanlagan", 'Ikki marta kiritilgan', 'Sotuvchi o\'sha kuni savdo qilmadi — qaytarildi'];
  for (let d = 30; d >= 1; d--) {
    const dayStart = new Date(todayStart.getTime() - d * DAY);
    const payCount = 100 + Math.floor(rand() * 26);
    const chosen = shuffle(spaces).slice(0, payCount);
    for (const s of chosen) {
      const at = new Date(dayStart.getTime() + between(6.5, 13) * HOUR);
      const roll = rand();
      if (roll < 0.012) {
        addPayment({ space: s, at, status: 'CANCELLED', cancelAt: new Date(at.getTime() + between(20, 90) * MIN), cancelReason: pick(cancelReasons) });
        addPayment({ space: s, at: new Date(at.getTime() + 2 * HOUR), method: 'CASH' });
      } else if (roll < 0.016) {
        addPayment({ space: s, at, method: 'CLICK', verification: 'MISMATCH' });
      } else addPayment({ space: s, at });
    }
    // unpaid-occupancy alerts that were handled that day
    const handled = 2 + Math.floor(rand() * 4);
    for (const s of shuffle(spaces).slice(0, handled)) {
      const det = new Date(dayStart.getTime() + between(7, 15) * HOUR);
      const escalatedCase = rand() < 0.3;
      const aId = randomUUID();
      const resAt = new Date(det.getTime() + (escalatedCase ? between(16, 40) : between(6, 14)) * MIN);
      alerts.push({
        id: aId, type: 'UNPAID_OCCUPANCY', severity: escalatedCase ? 'CRITICAL' : 'WARNING', status: 'RESOLVED',
        title: `${s.number}-joy: to'lovsiz bandlik`, message: "Joy band, lekin amaldagi to'lov yoki imtiyoz topilmadi.",
        spaceId: s.id, cameraId: s.cameraId, detectedAt: det, adminNotifyAt: new Date(det.getTime() + 5 * MIN),
        adminNotifiedAt: new Date(det.getTime() + 5 * MIN), chiefEscalateAt: new Date(det.getTime() + 15 * MIN),
        escalatedAt: escalatedCase ? new Date(det.getTime() + 15 * MIN) : null, resolvedAt: resAt,
        resolvedById: escalatedCase ? chief.id : admin.id,
        resolutionNote: pick(["Sotuvchi to'lov qildi, chek berildi", "Joy tekshirildi — sotuvchi to'lovni amalga oshirdi", 'Noto\'g\'ri aniqlash: joyda faqat yuk qoldirilgan']),
        isDemo: true, createdAt: det,
      });
      escalations.push({ id: randomUUID(), alertId: aId, level: 'MARKET_ADMIN', createdAt: new Date(det.getTime() + 5 * MIN) });
      if (escalatedCase) escalations.push({ id: randomUUID(), alertId: aId, level: 'CHIEF', createdAt: new Date(det.getTime() + 15 * MIN) });
      alertEvents.push(
        { id: randomUUID(), alertId: aId, action: 'CREATED', note: 'Avtomatik aniqlandi (DEMO)', createdAt: det },
        { id: randomUUID(), alertId: aId, action: 'ADMIN_NOTIFIED', createdAt: new Date(det.getTime() + 5 * MIN) },
        { id: randomUUID(), alertId: aId, action: 'RESOLVED', actorId: escalatedCase ? chief.id : admin.id, createdAt: resAt },
      );
    }
    // occasional camera outage
    if (d % 6 === 0) {
      const cam = pick(cameras.filter((c) => c.code !== 'CAM-09'));
      const off = new Date(dayStart.getTime() + between(8, 16) * HOUR);
      const back = new Date(off.getTime() + between(15, 90) * MIN);
      healthEvents.push(
        { id: randomUUID(), cameraId: cam.id, status: 'OFFLINE', message: "Signal yo'qoldi (DEMO)", isDemo: true, createdAt: off },
        { id: randomUUID(), cameraId: cam.id, status: 'ONLINE', message: 'Qayta ulandi (DEMO)', isDemo: true, createdAt: back },
      );
      alerts.push({
        id: randomUUID(), type: 'CAMERA_OFFLINE', severity: 'CRITICAL', status: 'RESOLVED', title: `${cam.code} aloqani yo'qotdi`,
        cameraId: cam.id, detectedAt: off, adminNotifiedAt: off, resolvedAt: back, resolutionNote: 'Kamera qayta ulandi', isDemo: true, createdAt: off,
      });
    }
  }
  for (const c of cameras) {
    healthEvents.push({ id: randomUUID(), cameraId: c.id, status: 'ONLINE', message: "O'rnatildi (DEMO)", isDemo: true, createdAt: new Date(now.getTime() - 60 * DAY) });
  }

  // ── today ───────────────────────────────────────────────────────────────
  const offlineCam = cameras.find((c) => c.code === 'CAM-09')!;
  const underOffline = spaces.filter((s) => s.cameraId === offlineCam.id);
  const observable = shuffle(spaces.filter((s) => s.cameraId !== offlineCam.id));
  const paidOcc = observable.slice(0, 98);
  const unpaidOcc = observable.slice(98, 106);
  const exempted = observable.slice(106, 110);
  const unknown = observable.slice(110, 112);
  const free = observable.slice(112);

  for (const s of paidOcc) {
    const at = todayAt();
    obs(s, 'OCCUPIED', new Date(Math.max(todayStart.getTime(), at.getTime() - between(1, 4) * MIN)));
    addPayment({ space: s, at });
    obs(s, 'OCCUPIED', new Date(now.getTime() - between(1, 15) * MIN));
  }
  for (const [i, s] of free.entries()) {
    if (i < 3) {
      const at = todayAt();
      obs(s, 'OCCUPIED', new Date(at.getTime() - 2 * MIN));
      addPayment({ space: s, at });
      obs(s, 'FREE', new Date(Math.min(now.getTime() - 5 * MIN, at.getTime() + between(60, 180) * MIN)));
    } else obs(s, 'FREE', new Date(now.getTime() - between(1, 20) * MIN));
  }
  for (const s of unknown) obs(s, 'UNKNOWN', new Date(now.getTime() - between(2, 4) * HOUR));
  for (const [i, s] of underOffline.entries()) {
    const before = new Date(now.getTime() - 45 * MIN);
    if (i < 8) {
      addPayment({ space: s, at: todayAt() });
      obs(s, 'OCCUPIED', before);
    } else obs(s, 'FREE', before);
  }
  healthEvents.push({ id: randomUUID(), cameraId: offlineCam.id, status: 'OFFLINE', message: "Heartbeat kelmadi (DEMO simulyatsiya)", isDemo: true, createdAt: new Date(now.getTime() - 40 * MIN) });
  const camAlertId = randomUUID();
  alerts.push({
    id: camAlertId, type: 'CAMERA_OFFLINE', severity: 'CRITICAL', status: 'ADMIN_NOTIFIED', title: `${offlineCam.code} aloqani yo'qotdi`,
    message: `Kamera signal bermayapti. ${underOffline.length} ta joy kuzatilmayapti. (DEMO)`, cameraId: offlineCam.id,
    detectedAt: new Date(now.getTime() - 40 * MIN), adminNotifiedAt: new Date(now.getTime() - 40 * MIN), isDemo: true, createdAt: new Date(now.getTime() - 40 * MIN),
  });
  escalations.push({ id: randomUUID(), alertId: camAlertId, level: 'MARKET_ADMIN' }, { id: randomUUID(), alertId: camAlertId, level: 'CHIEF' });
  alertEvents.push({ id: randomUUID(), alertId: camAlertId, action: 'CREATED', note: 'Darhol MARKET_ADMIN va CHIEF xabardor qilindi.', createdAt: new Date(now.getTime() - 40 * MIN) });
  const cam04 = cameras.find((c) => c.code === 'CAM-04')!;
  healthEvents.push({ id: randomUUID(), cameraId: cam04.id, status: 'DEGRADED', message: "Tasvir sifati past (DEMO)", isDemo: true, createdAt: new Date(now.getTime() - 3 * HOUR) });

  for (const s of exempted) {
    obs(s, 'OCCUPIED', new Date(now.getTime() - between(2, 30) * MIN));
    const from = new Date(todayStart.getTime() - between(0, 3) * DAY);
    const exId = randomUUID();
    exemptions.push({
      id: exId, spaceId: s.id, reason: pick(["Ijtimoiy imtiyoz — nogironligi bor sotuvchi (DEMO)", "Bozor ma'muriyati tomonidan tashkil etilgan tadbir (DEMO)", 'Faxriy sotuvchi uchun imtiyoz (DEMO)']),
      status: 'APPROVED', validFrom: from, validUntil: new Date(endOfLocalDay(now, OFF).getTime() + Math.floor(between(0, 5)) * DAY),
      requestedById: admin.id, approvedById: chief.id, approvedAt: from, isDemo: true, createdAt: from,
    });
    audits.push({ actorId: chief.id, actorRole: 'CHIEF', action: 'EXEMPTION_APPROVED', entityType: 'Exemption', entityId: exId, summary: `Joy ${s.number}`, isDemo: true, createdAt: from });
    alerts.push({
      id: randomUUID(), type: 'EXEMPTION_APPROVED', severity: 'INFO', status: 'RESOLVED', title: `${s.number}-joy: imtiyoz tasdiqlandi`,
      spaceId: s.id, detectedAt: from, resolvedAt: from, resolvedById: chief.id, resolutionNote: "Ma'lumot uchun hodisa", isDemo: true, createdAt: from,
    });
  }

  // Unpaid occupied spaces at different stages of the alert lifecycle.
  const stages: { status: 'OPEN' | 'ADMIN_NOTIFIED' | 'INVESTIGATING' | 'ESCALATED'; ago: number }[] = [
    { status: 'OPEN', ago: 2 }, { status: 'OPEN', ago: 4 }, { status: 'ADMIN_NOTIFIED', ago: 7 }, { status: 'ADMIN_NOTIFIED', ago: 9 },
    { status: 'ADMIN_NOTIFIED', ago: 12 }, { status: 'INVESTIGATING', ago: 11 }, { status: 'ESCALATED', ago: 26 }, { status: 'ESCALATED', ago: 48 },
  ];
  const unpaidAlertIds: string[] = [];
  for (const [i, s] of unpaidOcc.entries()) {
    const st = stages[i];
    const det = new Date(now.getTime() - st.ago * MIN);
    if (i === 7) {
      // Cash payment recorded earlier, then cancelled by CHIEF → space became unpaid.
      const paidAt = new Date(det.getTime() - 2 * HOUR);
      addPayment({ space: s, at: paidAt, method: 'CASH', status: 'CANCELLED', cancelAt: new Date(det.getTime() - 5 * MIN), cancelReason: "Kassir noto'g'ri joyni tanlagan — boshqa joyga qayta kiritiladi" });
    }
    obs(s, 'OCCUPIED', det);
    obs(s, 'OCCUPIED', new Date(now.getTime() - between(0.5, 1.5) * MIN));
    const id = randomUUID();
    unpaidAlertIds.push(id);
    const notifiedAt = st.status !== 'OPEN' ? new Date(det.getTime() + 5 * MIN) : null;
    const escalatedAt = st.status === 'ESCALATED' ? new Date(det.getTime() + 15 * MIN) : null;
    alerts.push({
      id, type: 'UNPAID_OCCUPANCY', severity: st.status === 'ESCALATED' ? 'CRITICAL' : 'WARNING', status: st.status,
      title: `${s.number}-joy: to'lovsiz bandlik`, message: "Joy band, lekin amaldagi to'lov yoki imtiyoz topilmadi.",
      spaceId: s.id, cameraId: s.cameraId, detectedAt: det, adminNotifyAt: new Date(det.getTime() + 5 * MIN), adminNotifiedAt: notifiedAt,
      chiefEscalateAt: notifiedAt ? new Date(notifiedAt.getTime() + 10 * MIN) : null, escalatedAt,
      assignedToId: st.status === 'INVESTIGATING' ? admin.id : null, isDemo: true, createdAt: det,
    });
    alertEvents.push({ id: randomUUID(), alertId: id, action: 'CREATED', note: "Avtomatik aniqlandi. 5 daqiqadan so'ng admin xabardor qilinadi.", createdAt: det });
    if (notifiedAt) {
      escalations.push({ id: randomUUID(), alertId: id, level: 'MARKET_ADMIN', createdAt: notifiedAt });
      alertEvents.push({ id: randomUUID(), alertId: id, action: 'ADMIN_NOTIFIED', note: 'MARKET_ADMIN xabardor qilindi.', createdAt: notifiedAt });
      for (const u of [users.admin, users.admin2]) {
        notifications.push({ id: randomUUID(), userId: u.id, type: 'ALERT_ADMIN', title: `${s.number}-joy: to'lovsiz bandlik`, body: "Joy band, to'lov topilmadi. Tekshiring.", link: `/alerts/${id}`, alertId: id, createdAt: notifiedAt });
      }
    }
    if (st.status === 'INVESTIGATING') alertEvents.push({ id: randomUUID(), alertId: id, action: 'INVESTIGATING', note: 'Joyga borib tekshirilmoqda', actorId: admin.id, createdAt: new Date(notifiedAt!.getTime() + MIN) });
    if (escalatedAt) {
      escalations.push({ id: randomUUID(), alertId: id, level: 'CHIEF', createdAt: escalatedAt });
      alertEvents.push({ id: randomUUID(), alertId: id, action: 'ESCALATED', note: 'Belgilangan vaqtda hal qilinmadi — CHIEF ga eskalatsiya qilindi.', createdAt: escalatedAt });
      notifications.push({ id: randomUUID(), userId: chief.id, type: 'ALERT_ESCALATED', title: `${s.number}-joy: to'lovsiz bandlik`, body: 'Ogohlantirish rahbarga eskalatsiya qilindi.', link: `/alerts/${id}`, alertId: id, createdAt: escalatedAt });
    }
  }
  // Pending exemption request from an admin
  exemptions.push({
    id: randomUUID(), spaceId: unpaidOcc[1].id, reason: "Sotuvchi ijtimoiy himoyaga muhtoj — hujjatlar tekshirilmoqda (DEMO)", status: 'PENDING',
    validFrom: todayStart, validUntil: endOfLocalDay(now, OFF), requestedById: admin.id, isDemo: true, createdAt: new Date(now.getTime() - 3 * MIN),
  });
  // Historical exemptions
  for (const [i, s] of shuffle(spaces).slice(0, 3).entries()) {
    const from = new Date(todayStart.getTime() - (20 - i * 5) * DAY);
    exemptions.push({
      id: randomUUID(), spaceId: s.id, reason: i === 2 ? "Hujjatlar yetarli emas (DEMO)" : "Ta'mirlash ishlari sababli (DEMO)",
      status: i === 2 ? 'REJECTED' : 'APPROVED', validFrom: from, validUntil: new Date(from.getTime() + 2 * DAY), requestedById: admin.id,
      approvedById: chief.id, approvedAt: from, isDemo: true, createdAt: from,
    });
  }

  // ── complaints ──────────────────────────────────────────────────────────
  const addComplaint = (s: Space, at: Date, status: 'NEW' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED', desc: string, resolution?: string) => {
    const cId = randomUUID();
    const closed = status === 'RESOLVED' || status === 'REJECTED';
    complaints.push({
      id: cId, spaceId: s.id, type: 'CASH_PAID_NO_RECEIPT', status, description: desc, relatedCashierId: cashierForRow[s.rowCode],
      resolutionNote: resolution, resolvedById: closed ? admin.id : null, resolvedAt: closed ? new Date(at.getTime() + 40 * MIN) : null, isDemo: true, createdAt: at,
    });
    const aId = randomUUID();
    alerts.push({
      id: aId, type: 'SELLER_COMPLAINT', severity: 'WARNING', status: closed ? (status === 'RESOLVED' ? 'RESOLVED' : 'REJECTED') : status === 'INVESTIGATING' ? 'INVESTIGATING' : 'ADMIN_NOTIFIED',
      title: `${s.number}-joy: naqd to'langan, chek berilmagan`, message: desc, spaceId: s.id, complaintId: cId, detectedAt: at, adminNotifiedAt: at,
      resolvedAt: closed ? new Date(at.getTime() + 40 * MIN) : null, resolvedById: closed ? admin.id : null, resolutionNote: resolution,
      assignedToId: status === 'INVESTIGATING' ? admin.id : null, isDemo: true, createdAt: at,
    });
    escalations.push({ id: randomUUID(), alertId: aId, level: 'MARKET_ADMIN', createdAt: at }, { id: randomUUID(), alertId: aId, level: 'CHIEF', createdAt: at });
    alertEvents.push({ id: randomUUID(), alertId: aId, action: 'CREATED', note: 'Sotuvchi QR orqali shikoyat yubordi (DEMO)', createdAt: at });
    if (!closed) {
      for (const u of [users.admin, users.admin2, chief]) {
        notifications.push({ id: randomUUID(), userId: u.id, type: 'SELLER_COMPLAINT', title: `${s.number}-joy: naqd to'langan, chek berilmagan`, body: desc, link: `/alerts/${aId}`, alertId: aId, createdAt: at });
      }
    }
    audits.push({ actorRole: 'SYSTEM', action: 'COMPLAINT_SUBMITTED', entityType: 'Complaint', entityId: cId, summary: `Joy ${s.number}`, isDemo: true, createdAt: at });
  };
  addComplaint(unpaidOcc[6], new Date(now.getTime() - 20 * MIN), 'NEW', "Ertalab kassirga naqd 16 000 so'm berdim, chek bermadi. (DEMO)");
  addComplaint(unpaidOcc[3], new Date(now.getTime() - 8 * MIN), 'INVESTIGATING', "To'lov qildim, lekin tizimda ko'rinmayapti. (DEMO)");
  for (let k = 0; k < 6; k++) {
    const s = pick(spaces);
    const at = new Date(todayStart.getTime() - (2 + k * 4) * DAY + between(8, 14) * HOUR);
    addComplaint(s, at, k % 3 === 2 ? 'REJECTED' : 'RESOLVED', "Naqd to'lov uchun chek berilmadi (DEMO)", k % 3 === 2 ? "To'lov o'sha kuni amalga oshirilmagani aniqlandi" : 'Chek qayta chiqarildi, kassirga ogohlantirish berildi');
  }

  // ── logins & misc audit ─────────────────────────────────────────────────
  for (let d = 14; d >= 0; d--) {
    for (const u of Object.values(users)) {
      const at = new Date(todayStart.getTime() - d * DAY + between(6, 8) * HOUR);
      if (at > now) continue;
      audits.push({ actorId: u.id, actorRole: u.role, action: 'LOGIN', entityType: 'User', entityId: u.id, ip: '10.0.0.15', isDemo: true, createdAt: at });
    }
  }
  audits.push({ actorId: chief.id, actorRole: 'CHIEF', action: 'CYCLE_ACTIVATED', entityType: 'PaymentCycle', entityId: cycle.id, summary: `${cycle.name} faollashtirildi`, isDemo: true, createdAt: new Date(now.getTime() - 30 * DAY) });

  // ── persist ─────────────────────────────────────────────────────────────
  // Receipt numbers in chronological order.
  receipts.sort((a, b) => +new Date(a.issuedAt as Date) - +new Date(b.issuedAt as Date));
  receipts.forEach((r, i) => {
    r.receiptNumber = `SM-${localDateKey(r.issuedAt as Date, OFF).replace(/-/g, '')}-${String(i + 1).padStart(6, '0')}`;
    (r.content as Record<string, unknown>).receiptNumber = r.receiptNumber;
  });
  audits.sort((a, b) => +new Date(a.createdAt as Date) - +new Date(b.createdAt as Date));

  const chunked = async <T>(rows: T[], fn: (c: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000));
  };
  // Cash handover of closed shifts: expected = shift's confirmed cash; one historic shortage.
  const cashByShift = new Map<string, number>();
  for (const p of payments) {
    if (p.method === 'CASH' && p.status === 'SUCCESS' && p.shiftId) cashByShift.set(p.shiftId, (cashByShift.get(p.shiftId) ?? 0) + p.amount);
  }
  const closed = shifts.filter((s) => s.status === 'CLOSED').sort((a, b) => +new Date(a.closedAt!) - +new Date(b.closedAt!));
  for (const [i, s] of closed.entries()) {
    const expected = cashByShift.get(s.id!) ?? 0;
    const last = i >= closed.length - 2; // the two most recent wait for the admin to count the cash
    const short = i === closed.length - 5 ? 20_000 : 0;
    Object.assign(s, {
      expectedCash: expected,
      declaredCash: expected - short,
      ...(last ? {} : { receivedCash: expected - short, receivedById: admin.id, receivedAt: new Date(+new Date(s.closedAt!) + 30 * MIN) }),
    });
  }
  await prisma.cashierShift.createMany({ data: shifts });
  await chunked(payments, (c) => prisma.payment.createMany({ data: c }));
  await chunked(receipts, (c) => prisma.receipt.createMany({ data: c }));
  await prisma.paymentCancellation.createMany({ data: cancellations });
  await chunked(observations, (c) => prisma.occupancyObservation.createMany({ data: c }));
  await prisma.cameraHealthEvent.createMany({ data: healthEvents });
  await prisma.complaint.createMany({ data: complaints });
  await prisma.exemption.createMany({ data: exemptions });
  await chunked(alerts, (c) => prisma.alert.createMany({ data: c }));
  await chunked(alertEvents, (c) => prisma.alertEvent.createMany({ data: c }));
  await prisma.alertEscalation.createMany({ data: escalations });
  await prisma.notification.createMany({ data: notifications });
  await chunked(audits, (c) => prisma.auditLog.createMany({ data: c }));
  for (const [spaceId, st] of spaceState) {
    await prisma.tradingSpace.update({ where: { id: spaceId }, data: st });
  }
  await prisma.$executeRawUnsafe(`SELECT setval('receipt_number_seq', ${receipts.length + 1}, false)`);

  const summary = {
    spaces: spaces.length,
    cameras: cameras.length,
    payments: payments.length,
    receipts: receipts.length,
    alerts: alerts.length,
    complaints: complaints.length,
    exemptions: exemptions.length,
    observations: observations.length,
    auditLogs: audits.length,
    today: { paidOccupied: paidOcc.length, unpaidOccupied: unpaidOcc.length, exempted: exempted.length, free: free.length, unknown: unknown.length, cameraUnavailable: underOffline.length },
  };
  log('• done', summary);
  return { summary, unpaidAlertIds, ids: { chief: chief.id, admin: admin.id, kassir1: users.kassir1.id, market: market.id } };
}

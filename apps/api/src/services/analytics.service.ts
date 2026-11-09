import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { localDateKey, parseLocalDate, startOfLocalDay } from '../lib/time';
import { getMarket } from './market.service';
import { computeStatuses, type SpaceDisplayStatus } from './spaceStatus.service';
import { ACTIVE_ALERT_STATUSES } from './alert.service';

const DAY = 86_400_000;

/** Resolve a [from, to) range of local days. Defaults to the last `defaultDays` days. */
export async function resolveRange(from?: string, to?: string, defaultDays = 14) {
  const market = await getMarket();
  const off = market.utcOffsetMinutes;
  const today = localDateKey(new Date(), off);
  const toKey = to ?? today;
  const fromKey = from ?? localDateKey(new Date(parseLocalDate(toKey, off).getTime() - (defaultDays - 1) * DAY), off);
  const start = parseLocalDate(fromKey, off);
  const end = new Date(parseLocalDate(toKey, off).getTime() + DAY);
  return { market, off, fromKey, toKey, start, end };
}

export async function dashboardSummary() {
  const market = await getMarket();
  const now = new Date();
  const off = market.utcOffsetMinutes;
  const todayStart = startOfLocalDay(now, off);
  const yesterdayStart = new Date(todayStart.getTime() - DAY);
  const yesterdaySameTime = new Date(now.getTime() - DAY);

  const statuses = await computeStatuses(prisma, { marketId: market.id }, now);
  const activeSpaces = await prisma.tradingSpace.findMany({ where: { marketId: market.id, isActive: true }, select: { id: true } });
  const counts: Record<SpaceDisplayStatus, number> = {
    FREE: 0,
    OCCUPIED_PAID: 0,
    OCCUPIED_UNPAID: 0,
    EXEMPTED: 0,
    UNKNOWN: 0,
    CAMERA_UNAVAILABLE: 0,
  };
  let paid = 0;
  for (const s of activeSpaces) {
    const st = statuses.get(s.id);
    if (!st) continue;
    counts[st.status]++;
    if (st.paymentState === 'PAID') paid++;
  }

  const [today, yesterday, activeAlerts, criticalAlerts, cameras, pendingToday] = await Promise.all([
    prisma.payment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: todayStart, lte: now } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { status: 'SUCCESS', paidAt: { gte: yesterdayStart, lte: yesterdaySameTime } }, _sum: { amount: true }, _count: true }),
    prisma.alert.count({ where: { status: { in: ACTIVE_ALERT_STATUSES } } }),
    prisma.alert.count({ where: { status: { in: ACTIVE_ALERT_STATUSES }, severity: 'CRITICAL' } }),
    prisma.camera.groupBy({ by: ['status'], where: { marketId: market.id }, _count: true }),
    prisma.payment.count({ where: { status: { in: ['PENDING', 'PENDING_SYNC'] }, createdAt: { gte: todayStart } } }),
  ]);
  const camTotal = cameras.reduce((a, c) => a + c._count, 0);
  const camOnline = cameras.filter((c) => c.status === 'ONLINE' || c.status === 'DEGRADED').reduce((a, c) => a + c._count, 0);

  return {
    generatedAt: now.toISOString(),
    totalSpaces: activeSpaces.length,
    occupied: counts.OCCUPIED_PAID + counts.OCCUPIED_UNPAID + counts.EXEMPTED,
    free: counts.FREE,
    paid,
    unpaidOccupied: counts.OCCUPIED_UNPAID,
    exempted: counts.EXEMPTED,
    unknown: counts.UNKNOWN,
    cameraUnavailableSpaces: counts.CAMERA_UNAVAILABLE,
    statusCounts: counts,
    activeAlerts,
    criticalAlerts,
    paymentsToday: { amount: today._sum.amount ?? 0, count: today._count, pending: pendingToday },
    paymentsYesterdaySameTime: { amount: yesterday._sum.amount ?? 0, count: yesterday._count },
    cameras: {
      total: camTotal,
      online: camOnline,
      byStatus: Object.fromEntries(cameras.map((c) => [c.status, c._count])),
    },
  };
}

export async function occupancyMap() {
  const market = await getMarket();
  const now = new Date();
  const [rows, statuses] = await Promise.all([
    prisma.marketRow.findMany({
      where: { marketId: market.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        spaces: {
          where: { isActive: true },
          orderBy: { positionInRow: 'asc' },
          select: { id: true, number: true, occupancyState: true, lastDetectedAt: true, widthMeters: true, cameraZone: { select: { camera: { select: { code: true } } } } },
        },
      },
    }),
    computeStatuses(prisma, { marketId: market.id }, now),
  ]);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    spaces: r.spaces.map((s) => ({
      id: s.id,
      number: s.number,
      widthMeters: s.widthMeters.toString(),
      status: statuses.get(s.id)?.status ?? 'UNKNOWN',
      paymentState: statuses.get(s.id)?.paymentState ?? 'UNPAID',
      lastDetectedAt: s.lastDetectedAt,
      cameraCode: s.cameraZone?.camera.code ?? null,
    })),
  }));
}

/** Daily revenue series. Only SUCCESS payments count as revenue. */
export async function revenueSeries(from?: string, to?: string) {
  const { off, fromKey, toKey, start, end } = await resolveRange(from, to);
  const rows = await prisma.$queryRaw<{ day: string; cash: bigint; electronic: bigint; cnt: bigint }[]>(Prisma.sql`
    SELECT to_char(("paidAt" + make_interval(mins => ${off}::int)), 'YYYY-MM-DD') AS day,
           COALESCE(SUM(CASE WHEN method = 'CASH' THEN amount ELSE 0 END), 0) AS cash,
           COALESCE(SUM(CASE WHEN method <> 'CASH' THEN amount ELSE 0 END), 0) AS electronic,
           COUNT(*) AS cnt
    FROM "Payment"
    WHERE status = 'SUCCESS' AND "paidAt" >= ${start} AND "paidAt" < ${end}
    GROUP BY 1 ORDER BY 1`);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { date: string; cash: number; electronic: number; total: number; count: number }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += DAY) {
    const key = localDateKey(new Date(t), off);
    const r = byDay.get(key);
    const cash = Number(r?.cash ?? 0);
    const electronic = Number(r?.electronic ?? 0);
    out.push({ date: key, cash, electronic, total: cash + electronic, count: Number(r?.cnt ?? 0) });
  }
  return { from: fromKey, to: toKey, series: out };
}

/** Distribution by category. Pending and cancelled are reported but never added to revenue. */
export async function paymentDistribution(from?: string, to?: string) {
  const { fromKey, toKey, start, end } = await resolveRange(from, to);
  const groups = await prisma.payment.groupBy({
    by: ['status', 'method'],
    where: { createdAt: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: true,
  });
  const bucket = () => ({ amount: 0, count: 0 });
  const d = { cash: bucket(), electronic: bucket(), pendingSync: bucket(), cancelled: bucket(), failed: bucket() };
  for (const g of groups) {
    const amt = g._sum.amount ?? 0;
    const target =
      g.status === 'SUCCESS'
        ? g.method === 'CASH'
          ? d.cash
          : d.electronic
        : g.status === 'PENDING' || g.status === 'PENDING_SYNC'
          ? d.pendingSync
          : g.status === 'CANCELLED' || g.status === 'REFUNDED'
            ? d.cancelled
            : d.failed;
    target.amount += amt;
    target.count += g._count;
  }
  return { from: fromKey, to: toKey, ...d, confirmedRevenue: d.cash.amount + d.electronic.amount };
}

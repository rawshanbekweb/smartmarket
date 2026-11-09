import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { localDateKey } from '../lib/time';
import { resolveRange } from './analytics.service';
import { computeStatuses } from './spaceStatus.service';

export interface ReportColumn {
  key: string;
  title: string;
  type?: 'money' | 'number' | 'date' | 'text' | 'percent';
}

export interface Report {
  type: string;
  title: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: { label: string; value: number | string; type?: ReportColumn['type'] }[];
}

type Range = Awaited<ReturnType<typeof resolveRange>>;

const n = (v: unknown) => Number(v ?? 0);

const builders: Record<string, { title: string; build: (r: Range, search?: string) => Promise<Omit<Report, 'type' | 'title' | 'from' | 'to'>> }> = {
  'daily-summary': {
    title: 'Kunlik hisobot',
    build: async (r) => {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT to_char(("createdAt" + make_interval(mins => ${r.off}::int)), 'YYYY-MM-DD') AS date,
          COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0) AS revenue,
          COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS' AND method = 'CASH'), 0) AS cash,
          COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS' AND method <> 'CASH'), 0) AS electronic,
          COUNT(*) FILTER (WHERE status IN ('PENDING','PENDING_SYNC')) AS pending_count,
          COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_count
        FROM "Payment" WHERE "createdAt" >= ${r.start} AND "createdAt" < ${r.end}
        GROUP BY 1 ORDER BY 1 DESC`);
      const out = rows.map((x) => ({ date: x.date, successCount: n(x.success_count), revenue: n(x.revenue), cash: n(x.cash), electronic: n(x.electronic), pendingCount: n(x.pending_count), cancelledCount: n(x.cancelled_count) }));
      return {
        columns: [
          { key: 'date', title: 'Sana', type: 'date' },
          { key: 'successCount', title: "Muvaffaqiyatli to'lovlar", type: 'number' },
          { key: 'revenue', title: 'Tasdiqlangan tushum', type: 'money' },
          { key: 'cash', title: 'Naqd', type: 'money' },
          { key: 'electronic', title: 'Elektron', type: 'money' },
          { key: 'pendingCount', title: 'Kutilmoqda', type: 'number' },
          { key: 'cancelledCount', title: 'Bekor qilingan', type: 'number' },
        ],
        rows: out,
        summary: [
          { label: 'Jami tushum', value: out.reduce((a, x) => a + x.revenue, 0), type: 'money' },
          { label: "To'lovlar soni", value: out.reduce((a, x) => a + x.successCount, 0), type: 'number' },
          { label: "O'rtacha kunlik tushum", value: out.length ? Math.round(out.reduce((a, x) => a + x.revenue, 0) / out.length) : 0, type: 'money' },
        ],
      };
    },
  },
  'revenue-by-method': {
    title: "To'lov usuli bo'yicha tushum",
    build: async (r) => {
      const g = await prisma.payment.groupBy({ by: ['method'], where: { status: 'SUCCESS', paidAt: { gte: r.start, lt: r.end } }, _sum: { amount: true }, _count: true });
      const total = g.reduce((a, x) => a + (x._sum.amount ?? 0), 0);
      const rows = g.map((x) => ({ method: x.method, count: x._count, amount: x._sum.amount ?? 0, share: total ? Math.round(((x._sum.amount ?? 0) / total) * 1000) / 10 : 0 }));
      return {
        columns: [
          { key: 'method', title: "To'lov usuli" },
          { key: 'count', title: 'Soni', type: 'number' },
          { key: 'amount', title: 'Summa', type: 'money' },
          { key: 'share', title: 'Ulush', type: 'percent' },
        ],
        rows: rows.sort((a, b) => b.amount - a.amount),
        summary: [{ label: 'Jami tasdiqlangan tushum', value: total, type: 'money' }],
      };
    },
  },
  'revenue-by-cashier': {
    title: "Kassir bo'yicha tushum",
    build: async (r, search) => {
      const g = await prisma.payment.groupBy({ by: ['cashierId'], where: { status: 'SUCCESS', method: 'CASH', paidAt: { gte: r.start, lt: r.end } }, _sum: { amount: true }, _count: true });
      const users = await prisma.user.findMany({ where: { id: { in: g.map((x) => x.cashierId!).filter(Boolean) } } });
      const name = new Map(users.map((u) => [u.id, u.fullName]));
      let rows = g.map((x) => ({ cashier: name.get(x.cashierId ?? '') ?? "Noma'lum", count: x._count, amount: x._sum.amount ?? 0 }));
      if (search) rows = rows.filter((x) => x.cashier.toLowerCase().includes(search.toLowerCase()));
      return {
        columns: [
          { key: 'cashier', title: 'Kassir' },
          { key: 'count', title: "Naqd to'lovlar", type: 'number' },
          { key: 'amount', title: 'Summa', type: 'money' },
        ],
        rows: rows.sort((a, b) => b.amount - a.amount),
        summary: [{ label: 'Jami naqd', value: rows.reduce((a, x) => a + x.amount, 0), type: 'money' }],
      };
    },
  },
  'payment-by-row': {
    title: "Qator bo'yicha to'lovlar",
    build: async (r) => {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT mr.name AS row_name, COUNT(p.id) AS cnt, COALESCE(SUM(p.amount), 0) AS amount,
               (SELECT COUNT(*) FROM "TradingSpace" ts2 WHERE ts2."rowId" = mr.id AND ts2."isActive") AS spaces
        FROM "MarketRow" mr
        LEFT JOIN "TradingSpace" ts ON ts."rowId" = mr.id
        LEFT JOIN "Payment" p ON p."spaceId" = ts.id AND p.status = 'SUCCESS' AND p."paidAt" >= ${r.start} AND p."paidAt" < ${r.end}
        GROUP BY mr.id, mr.name, mr."sortOrder" ORDER BY mr."sortOrder"`);
      const out = rows.map((x) => ({ row: x.row_name, spaces: n(x.spaces), count: n(x.cnt), amount: n(x.amount) }));
      return {
        columns: [
          { key: 'row', title: 'Qator' },
          { key: 'spaces', title: 'Faol joylar', type: 'number' },
          { key: 'count', title: "To'lovlar", type: 'number' },
          { key: 'amount', title: 'Summa', type: 'money' },
        ],
        rows: out,
        summary: [{ label: 'Jami', value: out.reduce((a, x) => a + x.amount, 0), type: 'money' }],
      };
    },
  },
  'unpaid-occupied': {
    title: "Hozir band, lekin to'lanmagan joylar",
    build: async (_r, search) => {
      const statuses = await computeStatuses(prisma, {});
      const ids = [...statuses].filter(([, s]) => s.status === 'OCCUPIED_UNPAID').map(([id]) => id);
      const spaces = await prisma.tradingSpace.findMany({
        where: { id: { in: ids }, ...(search && { number: { contains: search, mode: 'insensitive' } }) },
        include: { row: true, alerts: { where: { type: 'UNPAID_OCCUPANCY' }, orderBy: { detectedAt: 'desc' }, take: 1 }, tariff: true },
      });
      const rows = spaces.map((s) => ({ space: s.number, row: s.row.name, lastDetectedAt: s.lastDetectedAt, alertStatus: s.alerts[0]?.status ?? '—', tariff: s.tariff.amount }));
      return {
        columns: [
          { key: 'space', title: 'Joy' },
          { key: 'row', title: 'Qator' },
          { key: 'lastDetectedAt', title: 'Oxirgi aniqlash', type: 'date' },
          { key: 'alertStatus', title: 'Ogohlantirish holati' },
          { key: 'tariff', title: 'Tarif', type: 'money' },
        ],
        rows,
        summary: [
          { label: "To'lanmagan band joylar", value: rows.length, type: 'number' },
          { label: 'Potensial yo\'qotish', value: rows.reduce((a, x) => a + x.tariff, 0), type: 'money' },
        ],
      };
    },
  },
  'camera-availability': {
    title: 'Kameralar mavjudligi',
    build: async (r) => {
      const cams = await prisma.camera.findMany({
        include: { healthEvents: { where: { createdAt: { lt: r.end } }, orderBy: { createdAt: 'asc' } }, _count: { select: { zones: true } } },
        orderBy: { code: 'asc' },
      });
      const now = new Date();
      const windowEnd = r.end < now ? r.end : now;
      const windowMs = Math.max(1, windowEnd.getTime() - r.start.getTime());
      const rows = cams.map((c) => {
        // Integrate downtime from status transitions within the window.
        let state: string = 'ONLINE';
        let cursor = r.start.getTime();
        let down = 0;
        let outages = 0;
        for (const e of c.healthEvents) {
          const t = e.createdAt.getTime();
          if (t <= r.start.getTime()) {
            state = e.status;
            continue;
          }
          if (state === 'OFFLINE' || state === 'MAINTENANCE') down += Math.min(t, windowEnd.getTime()) - cursor;
          if (e.status === 'OFFLINE' && state !== 'OFFLINE') outages++;
          state = e.status;
          cursor = t;
        }
        if (state === 'OFFLINE' || state === 'MAINTENANCE') down += windowEnd.getTime() - cursor;
        return {
          code: c.code,
          name: c.name,
          status: c.status,
          spaces: c._count.zones,
          outages,
          downtimeMinutes: Math.round(Math.max(0, down) / 60000),
          availability: Math.round((1 - Math.max(0, down) / windowMs) * 1000) / 10,
          lastHeartbeatAt: c.lastHeartbeatAt,
        };
      });
      return {
        columns: [
          { key: 'code', title: 'ID' },
          { key: 'name', title: 'Kamera' },
          { key: 'status', title: 'Joriy holat' },
          { key: 'spaces', title: 'Joylar', type: 'number' },
          { key: 'outages', title: 'Uzilishlar', type: 'number' },
          { key: 'downtimeMinutes', title: 'Ishlamagan vaqt (daq)', type: 'number' },
          { key: 'availability', title: 'Mavjudlik', type: 'percent' },
          { key: 'lastHeartbeatAt', title: 'Oxirgi signal', type: 'date' },
        ],
        rows,
        summary: [
          { label: "O'rtacha mavjudlik", value: rows.length ? Math.round((rows.reduce((a, x) => a + x.availability, 0) / rows.length) * 10) / 10 : 0, type: 'percent' },
          { label: 'Jami uzilishlar', value: rows.reduce((a, x) => a + x.outages, 0), type: 'number' },
        ],
      };
    },
  },
  complaints: {
    title: 'Shikoyatlar statistikasi',
    build: async (r, search) => {
      const items = await prisma.complaint.findMany({
        where: { createdAt: { gte: r.start, lt: r.end }, ...(search && { space: { number: { contains: search, mode: 'insensitive' } } }) },
        include: { space: { include: { row: true } }, relatedCashier: true },
        orderBy: { createdAt: 'desc' },
      });
      const rows = items.map((c) => ({ createdAt: c.createdAt, space: c.space.number, row: c.space.row.name, type: c.type, status: c.status, cashier: c.relatedCashier?.fullName ?? '—', resolution: c.resolutionNote ?? '' }));
      const by = (s: string) => rows.filter((x) => x.status === s).length;
      return {
        columns: [
          { key: 'createdAt', title: 'Vaqt', type: 'date' },
          { key: 'space', title: 'Joy' },
          { key: 'row', title: 'Qator' },
          { key: 'type', title: 'Turi' },
          { key: 'status', title: 'Holat' },
          { key: 'cashier', title: 'Bog\'liq kassir' },
          { key: 'resolution', title: 'Natija' },
        ],
        rows,
        summary: [
          { label: 'Jami', value: rows.length, type: 'number' },
          { label: 'Yangi', value: by('NEW'), type: 'number' },
          { label: 'Tekshirilmoqda', value: by('INVESTIGATING'), type: 'number' },
          { label: 'Hal qilingan', value: by('RESOLVED'), type: 'number' },
          { label: 'Rad etilgan', value: by('REJECTED'), type: 'number' },
        ],
      };
    },
  },
  exemptions: {
    title: 'Imtiyozlar',
    build: async (r, search) => {
      const items = await prisma.exemption.findMany({
        where: { validFrom: { lt: r.end }, validUntil: { gt: r.start }, ...(search && { space: { number: { contains: search, mode: 'insensitive' } } }) },
        include: { space: true, approvedBy: true, requestedBy: true },
        orderBy: { validFrom: 'desc' },
      });
      const rows = items.map((e) => ({ space: e.space.number, status: e.status, reason: e.reason, validFrom: e.validFrom, validUntil: e.validUntil, requestedBy: e.requestedBy.fullName, approvedBy: e.approvedBy?.fullName ?? '—' }));
      return {
        columns: [
          { key: 'space', title: 'Joy' },
          { key: 'status', title: 'Holat' },
          { key: 'reason', title: 'Sabab' },
          { key: 'validFrom', title: 'Boshlanish', type: 'date' },
          { key: 'validUntil', title: 'Tugash', type: 'date' },
          { key: 'requestedBy', title: "So'ragan" },
          { key: 'approvedBy', title: 'Tasdiqlagan' },
        ],
        rows,
        summary: [
          { label: 'Jami', value: rows.length, type: 'number' },
          { label: 'Tasdiqlangan', value: rows.filter((x) => x.status === 'APPROVED').length, type: 'number' },
        ],
      };
    },
  },
  cancelled: {
    title: "Bekor qilingan to'lovlar",
    build: async (r, search) => {
      const items = await prisma.paymentCancellation.findMany({
        where: { createdAt: { gte: r.start, lt: r.end }, ...(search && { payment: { space: { number: { contains: search, mode: 'insensitive' } } } }) },
        include: { payment: { include: { space: true, cashier: true, receipt: true } }, cancelledBy: true },
        orderBy: { createdAt: 'desc' },
      });
      const rows = items.map((c) => ({ cancelledAt: c.createdAt, receipt: c.payment.receipt?.receiptNumber ?? '—', space: c.payment.space.number, method: c.payment.method, amount: c.payment.amount, cashier: c.payment.cashier?.fullName ?? '—', cancelledBy: c.cancelledBy.fullName, reason: c.reason }));
      return {
        columns: [
          { key: 'cancelledAt', title: 'Bekor qilingan vaqt', type: 'date' },
          { key: 'receipt', title: 'Chek' },
          { key: 'space', title: 'Joy' },
          { key: 'method', title: 'Usul' },
          { key: 'amount', title: 'Summa', type: 'money' },
          { key: 'cashier', title: 'Kassir' },
          { key: 'cancelledBy', title: 'Bekor qilgan' },
          { key: 'reason', title: 'Sabab' },
        ],
        rows,
        summary: [
          { label: 'Soni', value: rows.length, type: 'number' },
          { label: 'Summa (tushumga kirmaydi)', value: rows.reduce((a, x) => a + x.amount, 0), type: 'money' },
        ],
      };
    },
  },
  audit: {
    title: 'Audit tarixi',
    build: async (r, search) => {
      const items = await prisma.auditLog.findMany({
        where: {
          createdAt: { gte: r.start, lt: r.end },
          ...(search && { OR: [{ action: { contains: search, mode: 'insensitive' } }, { summary: { contains: search, mode: 'insensitive' } }] }),
        },
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      });
      const rows = items.map((a) => ({ createdAt: a.createdAt, actor: a.actor?.fullName ?? 'TIZIM', role: a.actorRole ?? '', action: a.action, entity: a.entityType, summary: a.summary ?? '' }));
      return {
        columns: [
          { key: 'createdAt', title: 'Vaqt', type: 'date' },
          { key: 'actor', title: 'Foydalanuvchi' },
          { key: 'role', title: 'Rol' },
          { key: 'action', title: 'Amal' },
          { key: 'entity', title: 'Obyekt' },
          { key: 'summary', title: 'Tavsif' },
        ],
        rows,
        summary: [{ label: 'Yozuvlar (maks. 2000)', value: rows.length, type: 'number' }],
      };
    },
  },
};

export const REPORT_TYPES = Object.entries(builders).map(([type, b]) => ({ type, title: b.title }));

export async function buildReport(type: string, from?: string, to?: string, search?: string): Promise<Report> {
  const b = builders[type];
  if (!b) throw badRequest("Noma'lum hisobot turi");
  const range = await resolveRange(from, to, 30);
  const body = await b.build(range, search);
  return { type, title: b.title, from: range.fromKey, to: range.toKey, ...body };
}

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(report: Report, offsetMinutes: number) {
  const esc = (v: unknown, type?: string) => {
    let s: string;
    if (v instanceof Date) s = new Date(v.getTime() + offsetMinutes * 60000).toISOString().replace('T', ' ').slice(0, 19);
    else if (v === null || v === undefined) s = '';
    else s = String(v);
    if (type !== 'money' && type !== 'number' && type !== 'percent' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = report.columns.map((c) => esc(c.title)).join(',');
  const lines = report.rows.map((r) => report.columns.map((c) => esc(r[c.key], c.type)).join(','));
  return '﻿' + [header, ...lines].join('\r\n');
}

export { localDateKey };

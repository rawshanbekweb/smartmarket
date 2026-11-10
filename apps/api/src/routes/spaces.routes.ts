import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { paged, paging } from '../lib/http';
import { audit } from '../lib/audit';
import { getMarket } from '../services/market.service';
import { computeStatuses } from '../services/spaceStatus.service';
import { recordObservation } from '../services/occupancy.service';
import { emit } from '../realtime/socket';

export const spacesRouter = Router();
spacesRouter.use(requireAuth);

const STATUS = ['FREE', 'OCCUPIED_PAID', 'OCCUPIED_UNPAID', 'EXEMPTED', 'UNKNOWN', 'CAMERA_UNAVAILABLE'] as const;

const listQuery = z.object({
  search: z.string().trim().max(50).optional(),
  rowId: z.string().optional(),
  occupancy: z.enum(['FREE', 'OCCUPIED', 'UNKNOWN']).optional(),
  status: z.enum(STATUS).optional(),
  paymentState: z.enum(['PAID', 'UNPAID', 'EXEMPTED']).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
});

const spaceInclude = {
  row: { select: { id: true, code: true, name: true } },
  tariff: { select: { id: true, name: true, amount: true, widthMeters: true } },
  cameraZone: { select: { id: true, zoneCode: true, camera: { select: { id: true, code: true, name: true, status: true } } } },
} satisfies Prisma.TradingSpaceInclude;

type SpaceRow = Prisma.TradingSpaceGetPayload<{ include: typeof spaceInclude }>;

function serialize(s: SpaceRow, st: ReturnType<Map<string, any>['get']>, includeQr: boolean) {
  return {
    id: s.id,
    number: s.number,
    positionInRow: s.positionInRow,
    widthMeters: s.widthMeters.toString(),
    row: s.row,
    tariff: { ...s.tariff, widthMeters: s.tariff.widthMeters.toString() },
    camera: s.cameraZone?.camera ?? null,
    cameraZone: s.cameraZone ? { id: s.cameraZone.id, zoneCode: s.cameraZone.zoneCode } : null,
    occupancyState: s.occupancyState,
    lastDetectedAt: s.lastDetectedAt,
    isActive: s.isActive,
    notes: s.notes,
    isDemo: s.isDemo,
    qrToken: includeQr ? s.qrToken : undefined,
    status: st?.status ?? 'UNKNOWN',
    paymentState: st?.paymentState ?? 'UNPAID',
    validPayment: st?.validPayment ?? null,
    activeExemption: st?.activeExemption ?? null,
  };
}

spacesRouter.get(
  '/',
  ah(async (req, res) => {
    const q = listQuery.parse(req.query);
    // Pickers (cashier, exemptions, camera zones) load the whole market in one request.
    const { page, pageSize, skip, take } = paging(req.query, 2000);
    const market = await getMarket();
    const where: Prisma.TradingSpaceWhereInput = {
      marketId: market.id,
      ...(q.active !== 'all' && { isActive: q.active === 'true' }),
      ...(q.rowId && { rowId: q.rowId }),
      ...(q.occupancy && { occupancyState: q.occupancy }),
      ...(q.search && { number: { contains: q.search, mode: 'insensitive' } }),
    };
    const spaces = await prisma.tradingSpace.findMany({
      where,
      include: spaceInclude,
      orderBy: [{ row: { sortOrder: 'asc' } }, { positionInRow: 'asc' }],
    });
    const statuses = await computeStatuses(prisma, { ids: spaces.map((s) => s.id) });
    const includeQr = req.user!.role !== 'CASHIER';
    let rows = spaces.map((s) => serialize(s, statuses.get(s.id), includeQr));
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.paymentState) rows = rows.filter((r) => r.paymentState === q.paymentState);
    res.json(paged(rows.slice(skip, skip + take), rows.length, page, pageSize));
  }),
);

spacesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const s = await prisma.tradingSpace.findUnique({ where: { id: req.params.id }, include: spaceInclude });
    if (!s) throw notFound('Savdo joyi topilmadi');
    const statuses = await computeStatuses(prisma, { ids: [s.id] });
    const isCashier = req.user!.role === 'CASHIER';
    const [payments, alerts, exemptions, observations] = await Promise.all([
      prisma.payment.findMany({
        where: { spaceId: s.id, ...(isCashier && { cashierId: req.user!.id }) },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { cashier: { select: { fullName: true } }, receipt: { select: { receiptNumber: true } } },
      }),
      isCashier
        ? []
        : prisma.alert.findMany({ where: { spaceId: s.id }, orderBy: { detectedAt: 'desc' }, take: 10 }),
      isCashier
        ? []
        : prisma.exemption.findMany({ where: { spaceId: s.id }, orderBy: { createdAt: 'desc' }, take: 10, include: { approvedBy: { select: { fullName: true } } } }),
      prisma.occupancyObservation.findMany({ where: { spaceId: s.id }, orderBy: { observedAt: 'desc' }, take: 15 }),
    ]);
    res.json({ ...serialize(s, statuses.get(s.id), !isCashier), payments, alerts, exemptions, observations });
  }),
);

spacesRouter.get(
  '/:id/history',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'TradingSpace', entityId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { fullName: true } } },
    });
    res.json(logs);
  }),
);

const spaceBody = z.object({
  number: z.string().trim().min(1).max(20),
  rowId: z.string().min(1),
  widthMeters: z.coerce.number().positive().max(100),
  tariffId: z.string().min(1),
  positionInRow: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
});

spacesRouter.post(
  '/',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = spaceBody.parse(req.body);
    const market = await getMarket();
    const [row, tariff] = await Promise.all([
      prisma.marketRow.findFirst({ where: { id: body.rowId, marketId: market.id } }),
      prisma.tariff.findFirst({ where: { id: body.tariffId, marketId: market.id, isActive: true } }),
    ]);
    if (!row) throw badRequest('Qator topilmadi');
    if (!tariff) throw badRequest('Faol tarif topilmadi');
    if (await prisma.tradingSpace.findFirst({ where: { marketId: market.id, number: body.number } })) {
      throw conflict(`${body.number} raqamli joy allaqachon mavjud`);
    }
    const position = body.positionInRow ?? (await prisma.tradingSpace.count({ where: { rowId: row.id } })) + 1;
    const space = await prisma.$transaction(async (tx) => {
      const created = await tx.tradingSpace.create({
        data: {
          marketId: market.id,
          rowId: row.id,
          number: body.number,
          positionInRow: position,
          widthMeters: new Prisma.Decimal(body.widthMeters),
          tariffId: tariff.id,
          qrToken: randomBytes(12).toString('hex'),
          notes: body.notes ?? undefined,
        },
      });
      await audit(tx, { actor: req.user, req, action: 'SPACE_CREATED', entityType: 'TradingSpace', entityId: created.id, summary: `Joy ${created.number} yaratildi`, after: body });
      return created;
    });
    emit('space:updated', { id: space.id });
    res.status(201).json(space);
  }),
);

const bulkBody = z
  .object({
    rowId: z.string().min(1),
    tariffId: z.string().min(1),
    widthMeters: z.coerce.number().positive().max(100),
    /** Text before the running number, e.g. "A-" → A-01, A-02 … */
    prefix: z.string().trim().max(12).default(''),
    from: z.coerce.number().int().min(0).max(99_999),
    to: z.coerce.number().int().min(0).max(99_999),
    /** Minimum digits of the running number (2 → 01, 02 …). */
    padLength: z.coerce.number().int().min(1).max(5).default(2),
  })
  .refine((b) => b.to >= b.from, { message: "Oxirgi raqam birinchisidan kichik bo'lmasligi kerak", path: ['to'] })
  .refine((b) => b.to - b.from < 300, { message: "Bir martada ko'pi bilan 300 ta joy yaratiladi", path: ['to'] });

/** Create a numbered range of spaces in one row (first set-up of a real market). All or nothing. */
spacesRouter.post(
  '/bulk',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = bulkBody.parse(req.body);
    const market = await getMarket();
    const [row, tariff] = await Promise.all([
      prisma.marketRow.findFirst({ where: { id: body.rowId, marketId: market.id } }),
      prisma.tariff.findFirst({ where: { id: body.tariffId, marketId: market.id, isActive: true } }),
    ]);
    if (!row) throw badRequest('Qator topilmadi');
    if (!tariff) throw badRequest('Faol tarif topilmadi');
    const numbers: string[] = [];
    for (let n = body.from; n <= body.to; n++) numbers.push(`${body.prefix}${String(n).padStart(body.padLength, '0')}`);
    if (numbers.some((n) => n.length > 20)) throw badRequest('Joy raqami 20 belgidan oshmasligi kerak');
    const taken = await prisma.tradingSpace.findMany({ where: { marketId: market.id, number: { in: numbers } }, select: { number: true }, orderBy: { number: 'asc' } });
    if (taken.length) {
      const list = taken.slice(0, 8).map((t) => t.number).join(', ');
      throw conflict(`Bu raqamli joylar allaqachon mavjud: ${list}${taken.length > 8 ? ` va yana ${taken.length - 8} ta` : ''}`);
    }
    await prisma.$transaction(async (tx) => {
      const last = await tx.tradingSpace.aggregate({ where: { rowId: row.id }, _max: { positionInRow: true } });
      const start = (last._max.positionInRow ?? 0) + 1;
      await tx.tradingSpace.createMany({
        data: numbers.map((number, i) => ({
          marketId: market.id,
          rowId: row.id,
          number,
          positionInRow: start + i,
          widthMeters: new Prisma.Decimal(body.widthMeters),
          tariffId: tariff.id,
          qrToken: randomBytes(12).toString('hex'),
        })),
      });
      await audit(tx, {
        actor: req.user,
        req,
        action: 'SPACES_BULK_CREATED',
        entityType: 'MarketRow',
        entityId: row.id,
        summary: `${row.name}: ${numbers.length} ta joy yaratildi (${numbers[0]} … ${numbers[numbers.length - 1]})`,
        after: { ...body, count: numbers.length },
      });
    });
    emit('space:updated', { rowId: row.id });
    res.status(201).json({ created: numbers.length, first: numbers[0], last: numbers[numbers.length - 1] });
  }),
);

spacesRouter.patch(
  '/:id',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = spaceBody.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const before = await prisma.tradingSpace.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Savdo joyi topilmadi');
    // Tariff is a financial attribute: CHIEF only.
    if (body.tariffId && body.tariffId !== before.tariffId && req.user!.role !== 'CHIEF') {
      throw forbidden("Tarifni faqat rahbar o'zgartira oladi");
    }
    const space = await prisma.$transaction(async (tx) => {
      const updated = await tx.tradingSpace.update({
        where: { id: before.id },
        data: {
          ...body,
          ...(body.widthMeters !== undefined && { widthMeters: new Prisma.Decimal(body.widthMeters) }),
        },
      });
      await audit(tx, {
        actor: req.user,
        req,
        action: body.isActive === false ? 'SPACE_DEACTIVATED' : body.isActive === true ? 'SPACE_ACTIVATED' : 'SPACE_UPDATED',
        entityType: 'TradingSpace',
        entityId: before.id,
        summary: `Joy ${updated.number} yangilandi`,
        before: { number: before.number, rowId: before.rowId, widthMeters: before.widthMeters.toString(), tariffId: before.tariffId, isActive: before.isActive },
        after: body,
      });
      return updated;
    });
    emit('space:updated', { id: space.id });
    res.json(space);
  }),
);

spacesRouter.put(
  '/:id/camera',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = z.object({ cameraId: z.string().nullable(), zoneCode: z.string().trim().max(30).optional() }).parse(req.body);
    const space = await prisma.tradingSpace.findUnique({ where: { id: req.params.id }, include: { cameraZone: true } });
    if (!space) throw notFound('Savdo joyi topilmadi');
    await prisma.$transaction(async (tx) => {
      if (!body.cameraId) {
        if (space.cameraZone) await tx.cameraZone.delete({ where: { id: space.cameraZone.id } });
      } else {
        const cam = await tx.camera.findUnique({ where: { id: body.cameraId } });
        if (!cam) throw badRequest('Kamera topilmadi');
        const zoneCode = body.zoneCode || `Z-${space.number}`;
        await tx.cameraZone.upsert({
          where: { spaceId: space.id },
          create: { cameraId: cam.id, spaceId: space.id, zoneCode },
          update: { cameraId: cam.id, zoneCode },
        });
      }
      await audit(tx, {
        actor: req.user,
        req,
        action: 'SPACE_CAMERA_ASSIGNED',
        entityType: 'TradingSpace',
        entityId: space.id,
        summary: `Joy ${space.number} kamerasi: ${body.cameraId ?? 'olib tashlandi'}`,
        before: space.cameraZone,
        after: body,
      });
    });
    emit('space:updated', { id: space.id });
    res.json({ ok: true });
  }),
);

/** Manual on-site check by an administrator (e.g. after investigating an alert). */
spacesRouter.post(
  '/:id/occupancy',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = z.object({ state: z.enum(['FREE', 'OCCUPIED', 'UNKNOWN']) }).parse(req.body);
    const r = await recordObservation({ spaceId: req.params.id, state: body.state, source: 'MANUAL' }, req.user);
    if (!r) throw notFound('Savdo joyi topilmadi');
    res.json({ ok: true });
  }),
);

/**
 * Walk-round check (camera-less pilot): an administrator marks many spaces at once.
 * Cashiers are excluded on purpose — the person collecting money must not be the one
 * who decides which spaces count as occupied.
 */
spacesRouter.post(
  '/occupancy/bulk',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const body = z
      .object({ items: z.array(z.object({ spaceId: z.string().min(1), state: z.enum(['FREE', 'OCCUPIED']) })).min(1).max(300) })
      .parse(req.body);
    const market = await getMarket();
    const ids = [...new Set(body.items.map((i) => i.spaceId))];
    const known = await prisma.tradingSpace.count({ where: { id: { in: ids }, marketId: market.id, isActive: true } });
    if (known !== ids.length) throw badRequest("Ba'zi joylar topilmadi");
    const observedAt = new Date();
    for (const item of body.items) {
      await recordObservation({ spaceId: item.spaceId, state: item.state, source: 'MANUAL', observedAt }, req.user);
    }
    res.json({ ok: true, updated: body.items.length });
  }),
);

spacesRouter.post(
  '/:id/regenerate-qr',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const space = await prisma.$transaction(async (tx) => {
      const s = await tx.tradingSpace.update({ where: { id: req.params.id }, data: { qrToken: randomBytes(12).toString('hex') } });
      await audit(tx, { actor: req.user, req, action: 'SPACE_QR_REGENERATED', entityType: 'TradingSpace', entityId: s.id, summary: `Joy ${s.number} QR yangilandi` });
      return s;
    });
    res.json({ qrToken: space.qrToken });
  }),
);

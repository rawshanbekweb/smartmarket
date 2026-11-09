import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { listSettings, SETTING_DEFAULTS, type SettingKey } from '../services/settings.service';
import { getMarket } from '../services/market.service';
import { providerStatusList } from '../integrations/payments/adapters';
import { env } from '../config/env';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (_req, res) => {
    const market = await getMarket();
    const [settings, tariffs, cycles] = await Promise.all([
      listSettings(),
      prisma.tariff.findMany({ where: { marketId: market.id }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { spaces: true } } } }),
      prisma.paymentCycle.findMany({ where: { marketId: market.id }, orderBy: { createdAt: 'asc' } }),
    ]);
    res.json({
      market,
      settings,
      tariffs: tariffs.map(({ _count, ...t }) => ({ ...t, widthMeters: t.widthMeters.toString(), spaceCount: _count.spaces })),
      cycles,
      providers: providerStatusList(),
      demoMode: env.DEMO_MODE,
    });
  }),
);

// Everything below changes approved business configuration → CHIEF only.

settingsRouter.put(
  '/values/:key',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const key = req.params.key as SettingKey;
    if (!(key in SETTING_DEFAULTS)) throw notFound("Noma'lum sozlama");
    const def = SETTING_DEFAULTS[key].value;
    const value =
      typeof def === 'number'
        ? z.number().int().min(1).max(10_000).parse(req.body?.value)
        : z.string().trim().min(1).max(300).parse(req.body?.value);
    const before = await prisma.systemSetting.findUnique({ where: { key } });
    await prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value, description: SETTING_DEFAULTS[key].description, updatedById: req.user!.id },
        update: { value, updatedById: req.user!.id },
      });
      await audit(tx, { actor: req.user, req, action: 'SETTING_UPDATED', entityType: 'SystemSetting', entityId: key, before: { value: before?.value ?? def }, after: { value } });
    });
    res.json({ ok: true });
  }),
);

settingsRouter.patch(
  '/market',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = z.object({ name: z.string().trim().min(2).max(100).optional(), address: z.string().trim().max(200).nullable().optional() }).parse(req.body);
    const market = await getMarket();
    const updated = await prisma.$transaction(async (tx) => {
      const m = await tx.market.update({ where: { id: market.id }, data: body });
      await audit(tx, { actor: req.user, req, action: 'MARKET_UPDATED', entityType: 'Market', entityId: m.id, before: { name: market.name, address: market.address }, after: body });
      return m;
    });
    res.json(updated);
  }),
);

const tariffBody = z.object({
  name: z.string().trim().min(2).max(60),
  amount: z.number().int().positive().max(100_000_000),
  widthMeters: z.number().positive().max(100),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

settingsRouter.post(
  '/tariffs',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = tariffBody.parse(req.body);
    const market = await getMarket();
    const t = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.tariff.updateMany({ where: { marketId: market.id }, data: { isDefault: false } });
      const t = await tx.tariff.create({ data: { ...body, widthMeters: new Prisma.Decimal(body.widthMeters), marketId: market.id } });
      await audit(tx, { actor: req.user, req, action: 'TARIFF_CREATED', entityType: 'Tariff', entityId: t.id, summary: `${t.name}: ${t.amount} UZS`, after: body });
      return t;
    });
    res.status(201).json(t);
  }),
);

settingsRouter.patch(
  '/tariffs/:id',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = tariffBody.partial().parse(req.body);
    const before = await prisma.tariff.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Tarif topilmadi');
    const t = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.tariff.updateMany({ where: { marketId: before.marketId }, data: { isDefault: false } });
      const t = await tx.tariff.update({
        where: { id: before.id },
        data: { ...body, ...(body.widthMeters !== undefined && { widthMeters: new Prisma.Decimal(body.widthMeters) }) },
      });
      await audit(tx, { actor: req.user, req, action: 'TARIFF_UPDATED', entityType: 'Tariff', entityId: t.id, summary: t.name, before: { amount: before.amount, widthMeters: before.widthMeters.toString(), isActive: before.isActive }, after: body });
      return t;
    });
    res.json(t);
  }),
);

settingsRouter.post(
  '/cycles',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        type: z.enum(['CALENDAR_DAY', 'FIXED_DURATION']),
        durationMinutes: z.number().int().positive().max(60 * 24 * 62).optional(),
        description: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    if (body.type === 'FIXED_DURATION' && !body.durationMinutes) throw badRequest('FIXED_DURATION uchun davomiylik kerak');
    const market = await getMarket();
    const c = await prisma.$transaction(async (tx) => {
      const c = await tx.paymentCycle.create({ data: { ...body, marketId: market.id, isActive: false } });
      await audit(tx, { actor: req.user, req, action: 'CYCLE_CREATED', entityType: 'PaymentCycle', entityId: c.id, summary: c.name, after: body });
      return c;
    });
    res.status(201).json(c);
  }),
);

settingsRouter.post(
  '/cycles/:id/activate',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const c = await prisma.paymentCycle.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound("To'lov sikli topilmadi");
    await prisma.$transaction(async (tx) => {
      await tx.paymentCycle.updateMany({ where: { marketId: c.marketId, isActive: true }, data: { isActive: false } });
      await tx.paymentCycle.update({ where: { id: c.id }, data: { isActive: true } });
      await audit(tx, { actor: req.user, req, action: 'CYCLE_ACTIVATED', entityType: 'PaymentCycle', entityId: c.id, summary: `${c.name} faollashtirildi (yangi to'lovlarga qo'llanadi)` });
    });
    res.json({ ok: true });
  }),
);

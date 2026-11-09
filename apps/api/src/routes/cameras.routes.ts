import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { getMarket } from '../services/market.service';
import { computeStatuses } from '../services/spaceStatus.service';
import { cameraProviderFor } from '../integrations/camera';
import { emit } from '../realtime/socket';

export const camerasRouter = Router();
camerasRouter.use(requireAuth, requireRole('CHIEF', 'MARKET_ADMIN'));

camerasRouter.get(
  '/',
  ah(async (_req, res) => {
    const market = await getMarket();
    const cams = await prisma.camera.findMany({
      where: { marketId: market.id },
      orderBy: { code: 'asc' },
      include: { _count: { select: { zones: true } } },
    });
    res.json(
      cams.map(({ _count, ...c }) => ({ ...c, assignedSpaces: _count.zones })),
    );
  }),
);

camerasRouter.get(
  '/:id',
  ah(async (req, res) => {
    const cam = await prisma.camera.findUnique({
      where: { id: req.params.id },
      include: {
        zones: { include: { space: { select: { id: true, number: true, occupancyState: true, lastDetectedAt: true, row: { select: { name: true } } } } }, orderBy: { zoneCode: 'asc' } },
        healthEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!cam) throw notFound('Kamera topilmadi');
    const statuses = await computeStatuses(prisma, { ids: cam.zones.map((z) => z.spaceId) });
    const [observations, alerts, preview] = await Promise.all([
      prisma.occupancyObservation.findMany({
        where: { cameraId: cam.id },
        orderBy: { observedAt: 'desc' },
        take: 25,
        include: { space: { select: { number: true } } },
      }),
      prisma.alert.findMany({ where: { cameraId: cam.id }, orderBy: { detectedAt: 'desc' }, take: 10 }),
      cameraProviderFor(cam).preview(cam),
    ]);
    res.json({
      ...cam,
      zones: cam.zones.map((z) => ({ ...z, status: statuses.get(z.spaceId)?.status ?? 'UNKNOWN' })),
      observations,
      alerts,
      preview,
    });
  }),
);

const camBody = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  ipAddress: z.string().trim().ip().optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  provider: z.enum(['DEMO', 'HIKVISION']).default('HIKVISION'),
  // Only a reference key — credentials are rejected.
  streamConfigRef: z
    .string()
    .trim()
    .max(120)
    .refine((v) => !/rtsp:\/\/|:\/\/.*@|password/i.test(v), "Bu maydonga URL yoki parol yozmang — faqat konfiguratsiya kaliti nomi")
    .optional()
    .nullable(),
  monitoringEnabled: z.boolean().optional(),
});

camerasRouter.post(
  '/',
  ah(async (req, res) => {
    const body = camBody.parse(req.body);
    const market = await getMarket();
    const cam = await prisma.$transaction(async (tx) => {
      const c = await tx.camera.create({ data: { ...body, marketId: market.id, status: 'OFFLINE' } });
      await audit(tx, { actor: req.user, req, action: 'CAMERA_CREATED', entityType: 'Camera', entityId: c.id, summary: `${c.code} ${c.name}`, after: body });
      return c;
    });
    emit('camera:updated', { id: cam.id });
    res.status(201).json(cam);
  }),
);

camerasRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const body = camBody.partial().parse(req.body);
    const before = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Kamera topilmadi');
    const cam = await prisma.$transaction(async (tx) => {
      const c = await tx.camera.update({ where: { id: before.id }, data: body });
      await audit(tx, { actor: req.user, req, action: 'CAMERA_UPDATED', entityType: 'Camera', entityId: c.id, before, after: body });
      return c;
    });
    emit('camera:updated', { id: cam.id });
    res.json(cam);
  }),
);

/** Assign a set of spaces to this camera (creates/moves their zones). */
camerasRouter.put(
  '/:id/spaces',
  ah(async (req, res) => {
    const body = z.object({ spaceIds: z.array(z.string()).max(100) }).parse(req.body);
    const cam = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!cam) throw notFound('Kamera topilmadi');
    const spaces = await prisma.tradingSpace.findMany({ where: { id: { in: body.spaceIds } } });
    if (spaces.length !== body.spaceIds.length) throw badRequest("Ba'zi joylar topilmadi");
    await prisma.$transaction(async (tx) => {
      await tx.cameraZone.deleteMany({ where: { cameraId: cam.id, spaceId: { notIn: body.spaceIds } } });
      for (const s of spaces) {
        await tx.cameraZone.upsert({
          where: { spaceId: s.id },
          create: { cameraId: cam.id, spaceId: s.id, zoneCode: `Z-${s.number}` },
          update: { cameraId: cam.id },
        });
      }
      await audit(tx, { actor: req.user, req, action: 'CAMERA_SPACES_ASSIGNED', entityType: 'Camera', entityId: cam.id, summary: `${cam.code}: ${spaces.length} ta joy`, after: { spaceIds: body.spaceIds } });
    });
    emit('camera:updated', { id: cam.id });
    res.json({ ok: true });
  }),
);

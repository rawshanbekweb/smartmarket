import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { AppError, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { env } from '../config/env';
import { recordObservation, setCameraStatus } from '../services/occupancy.service';
import { runWorkerTick } from '../workers/alertWorker';

/**
 * DEMO-only simulators. Disabled (404) unless DEMO_MODE=true.
 * Every simulated event is stored with source DEMO_SIMULATOR / isDemo=true.
 */
export const demoRouter = Router();
demoRouter.use((_req, _res, next) => (env.DEMO_MODE ? next() : next(new AppError(404, 'NOT_FOUND', 'Topilmadi'))));
demoRouter.use(requireAuth, requireRole('CHIEF', 'MARKET_ADMIN'));

demoRouter.post(
  '/occupancy',
  ah(async (req, res) => {
    const body = z.object({ spaceId: z.string().min(1), state: z.enum(['FREE', 'OCCUPIED', 'UNKNOWN']) }).parse(req.body);
    const space = await prisma.tradingSpace.findUnique({ where: { id: body.spaceId }, include: { cameraZone: true } });
    if (!space) throw notFound('Savdo joyi topilmadi');
    await recordObservation({ spaceId: space.id, cameraId: space.cameraZone?.cameraId, state: body.state, confidence: 0.99, source: 'DEMO_SIMULATOR' });
    await audit(prisma, { actor: req.user, req, action: 'DEMO_OCCUPANCY_SIMULATED', entityType: 'TradingSpace', entityId: space.id, summary: `DEMO: ${space.number} → ${body.state}`, isDemo: true });
    res.json({ ok: true });
  }),
);

demoRouter.post(
  '/cameras/:id/status',
  ah(async (req, res) => {
    const body = z.object({ status: z.enum(['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE']) }).parse(req.body);
    const cam = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!cam) throw notFound('Kamera topilmadi');
    if (cam.provider !== 'DEMO') throw new AppError(400, 'BAD_REQUEST', 'Faqat DEMO kameralar simulyatsiya qilinadi');
    await setCameraStatus(cam.id, body.status, `DEMO simulyatsiya: ${body.status}`);
    await audit(prisma, { actor: req.user, req, action: 'DEMO_CAMERA_STATUS_SIMULATED', entityType: 'Camera', entityId: cam.id, summary: `DEMO: ${cam.code} → ${body.status}`, isDemo: true });
    res.json({ ok: true });
  }),
);

/**
 * Fast-forward an alert's persisted escalation deadline to "now" and run the
 * worker once, so the 5 + 10 minute escalation can be demonstrated live.
 */
demoRouter.post(
  '/alerts/:id/fast-forward',
  ah(async (req, res) => {
    const a = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!a) throw notFound('Ogohlantirish topilmadi');
    const now = new Date();
    if (a.status === 'OPEN') await prisma.alert.update({ where: { id: a.id }, data: { adminNotifyAt: now } });
    else if (a.status === 'ADMIN_NOTIFIED' || a.status === 'INVESTIGATING') await prisma.alert.update({ where: { id: a.id }, data: { chiefEscalateAt: now } });
    await prisma.alertEvent.create({ data: { alertId: a.id, action: 'DEMO_FAST_FORWARD', note: 'DEMO: eskalatsiya vaqti tezlashtirildi', actorId: req.user!.id } });
    const result = await runWorkerTick(new Date(now.getTime() + 1000));
    res.json({ ok: true, result });
  }),
);

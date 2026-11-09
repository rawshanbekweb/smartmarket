import { Router, type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { notFound, unauthorized } from '../lib/errors';
import { env } from '../config/env';
import { recordHeartbeat, recordObservation, setCameraStatus } from '../services/occupancy.service';

/**
 * Internal API for the vision (AI) service. Authenticated with a shared key
 * (X-Internal-Api-Key). The AI can only report observations and camera health —
 * it has no access to payment creation or cancellation.
 */
export const internalRouter = Router();

function requireInternalKey(req: Request, _res: Response, next: NextFunction) {
  const given = Buffer.from(req.get('x-internal-api-key') ?? '');
  const expected = Buffer.from(env.VISION_API_KEY);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return next(unauthorized('Invalid internal API key'));
  next();
}
internalRouter.use(requireInternalKey);

internalRouter.post(
  '/vision/observations',
  ah(async (req, res) => {
    const body = z
      .object({
        cameraCode: z.string().min(1),
        frameAt: z.coerce.date().optional(),
        observations: z
          .array(
            z.object({
              zoneCode: z.string().min(1),
              state: z.enum(['FREE', 'OCCUPIED', 'UNKNOWN']),
              confidence: z.number().min(0).max(1).optional(),
              observedAt: z.coerce.date().optional(),
            }),
          )
          .max(200),
      })
      .parse(req.body);
    const cam = await prisma.camera.findUnique({ where: { code: body.cameraCode }, include: { zones: true } });
    if (!cam) throw notFound('Camera not registered');
    const zones = new Map(cam.zones.map((z) => [z.zoneCode, z]));
    let accepted = 0;
    const rejected: string[] = [];
    for (const o of body.observations) {
      const zone = zones.get(o.zoneCode);
      if (!zone) {
        rejected.push(o.zoneCode);
        continue;
      }
      await recordObservation({
        spaceId: zone.spaceId,
        cameraId: cam.id,
        state: o.state,
        confidence: o.confidence,
        source: 'AI',
        observedAt: o.observedAt ?? body.frameAt ?? new Date(),
      });
      accepted++;
    }
    await recordHeartbeat(cam.id, body.frameAt ?? new Date());
    res.json({ accepted, rejected });
  }),
);

internalRouter.post(
  '/vision/heartbeat',
  ah(async (req, res) => {
    const body = z
      .object({ cameraCode: z.string().min(1), status: z.enum(['ONLINE', 'DEGRADED', 'OFFLINE']).default('ONLINE'), lastFrameAt: z.coerce.date().optional(), message: z.string().max(200).optional() })
      .parse(req.body);
    const cam = await prisma.camera.findUnique({ where: { code: body.cameraCode } });
    if (!cam) throw notFound('Camera not registered');
    if (body.status === 'OFFLINE' || body.status === 'DEGRADED') await setCameraStatus(cam.id, body.status, body.message);
    else await recordHeartbeat(cam.id, body.lastFrameAt);
    res.json({ ok: true });
  }),
);

/** Zone configuration for the vision service. Contains no credentials. */
internalRouter.get(
  '/vision/config',
  ah(async (_req, res) => {
    const cams = await prisma.camera.findMany({ where: { monitoringEnabled: true }, include: { zones: true } });
    res.json(
      cams.map((c) => ({
        cameraCode: c.code,
        provider: c.provider,
        streamConfigRef: c.streamConfigRef,
        zones: c.zones.map((z) => ({ zoneCode: z.zoneCode, polygon: z.polygon })),
      })),
    );
  }),
);

internalRouter.use((_req, _res, next) => next(notFound('Unknown internal endpoint')));

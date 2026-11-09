import type { CameraStatus, ObservationSource, OccupancyState } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { emit } from '../realtime/socket';
import { ensureUnpaidAlert, resolveUnpaidAlerts, createImmediateAlert, ACTIVE_ALERT_STATUSES } from './alert.service';
import { pushNotifications } from './notification.service';
import { cameraProviderFor } from '../integrations/camera';
import { getSetting } from './settings.service';
import type { AuthUser } from '../middleware/auth';

export interface ObservationInput {
  spaceId: string;
  cameraId?: string | null;
  state: OccupancyState;
  confidence?: number | null;
  source: ObservationSource;
  observedAt?: Date;
}

/**
 * Ingest an occupancy observation (from AI, the demo simulator, or a manual check).
 * Observations never create or cancel payments — they only update occupancy and
 * drive the alert lifecycle.
 */
export async function recordObservation(input: ObservationInput, actor?: AuthUser | null) {
  const observedAt = input.observedAt ?? new Date();
  const isDemo = input.source === 'DEMO_SIMULATOR';

  const res = await prisma.$transaction(async (tx) => {
    const space = await tx.tradingSpace.findUnique({ where: { id: input.spaceId } });
    if (!space) return null;
    await tx.occupancyObservation.create({
      data: {
        spaceId: input.spaceId,
        cameraId: input.cameraId ?? undefined,
        state: input.state,
        confidence: input.confidence ?? undefined,
        source: input.source,
        observedAt,
        isDemo,
      },
    });
    // Ignore out-of-order observations for the current state.
    if (space.lastDetectedAt && space.lastDetectedAt > observedAt) return { space, changed: false };

    await tx.tradingSpace.update({
      where: { id: space.id },
      data: { occupancyState: input.state, lastDetectedAt: observedAt },
    });

    if (input.state === 'OCCUPIED') {
      await ensureUnpaidAlert(tx, space.id, observedAt, isDemo || space.isDemo);
    } else if (input.state === 'FREE') {
      // Only cancel alerts that have not been handed to a person yet.
      await resolveUnpaidAlerts(tx, space.id, "Joy bo'shadi — ogohlantirish avtomatik yopildi", { onlyOpen: true });
    }
    if (input.source === 'MANUAL' && actor) {
      await audit(tx, {
        actor,
        action: 'OCCUPANCY_MANUAL_SET',
        entityType: 'TradingSpace',
        entityId: space.id,
        summary: `${space.number}: ${input.state}`,
      });
    }
    return { space, changed: space.occupancyState !== input.state };
  });

  if (res) emit('space:updated', { id: input.spaceId, state: input.state });
  return res;
}

/** Apply a camera status change, recording a health event and alerting on failure. */
export async function setCameraStatus(cameraId: string, status: CameraStatus, message?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const cam = await tx.camera.findUnique({ where: { id: cameraId } });
    if (!cam || cam.status === status) return null;
    await tx.camera.update({
      where: { id: cameraId },
      data: { status, ...(status === 'ONLINE' && { lastHeartbeatAt: new Date() }) },
    });
    await tx.cameraHealthEvent.create({ data: { cameraId, status, message, isDemo: cam.isDemo } });

    let pushed: { userIds: string[]; notice: any } | null = null;
    if (status === 'OFFLINE') {
      const already = await tx.alert.findFirst({
        where: { cameraId, type: 'CAMERA_OFFLINE', status: { in: ACTIVE_ALERT_STATUSES } },
      });
      if (!already) {
        const r = await createImmediateAlert(tx, {
          type: 'CAMERA_OFFLINE',
          title: `${cam.name} (${cam.code}) aloqani yo'qotdi`,
          message: message ?? 'Kamera signal bermayapti. Biriktirilgan joylar kuzatilmayapti.',
          cameraId,
          isDemo: cam.isDemo,
        });
        pushed = { userIds: r.userIds, notice: r.notice };
      }
    } else if (status === 'ONLINE') {
      const open = await tx.alert.findMany({
        where: { cameraId, type: 'CAMERA_OFFLINE', status: { in: ACTIVE_ALERT_STATUSES } },
      });
      for (const a of open) {
        await tx.alert.update({
          where: { id: a.id },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            resolutionNote: 'Kamera qayta ulandi',
            events: { create: { action: 'AUTO_RESOLVED', note: 'Kamera qayta ulandi' } },
          },
        });
      }
    }
    await audit(tx, { actor: null, action: 'CAMERA_STATUS_CHANGED', entityType: 'Camera', entityId: cameraId, summary: `${cam.code}: ${cam.status} → ${status}`, isDemo: cam.isDemo });
    return { pushed };
  });
  if (result?.pushed) pushNotifications(result.pushed.userIds, result.pushed.notice);
  if (result) emit('camera:updated', { id: cameraId, status });
  return result;
}

/** Record a heartbeat pushed by the vision service (or the demo provider). */
export async function recordHeartbeat(cameraId: string, lastFrameAt?: Date | null) {
  const cam = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!cam) return;
  await prisma.camera.update({
    where: { id: cameraId },
    data: { lastHeartbeatAt: new Date(), ...(lastFrameAt && { lastFrameAt }) },
  });
  if (cam.status === 'OFFLINE') await setCameraStatus(cameraId, 'ONLINE', 'Heartbeat qayta tiklandi');
}

/** Periodic camera health check: provider polling + heartbeat timeout detection. */
export async function checkCameraHealth(now = new Date()) {
  const timeoutSec = await getSetting('camera.heartbeatTimeoutSeconds');
  const cameras = await prisma.camera.findMany({ where: { monitoringEnabled: true } });
  for (const cam of cameras) {
    const health = await cameraProviderFor(cam).checkHealth(cam);
    if (health) {
      await prisma.camera.update({
        where: { id: cam.id },
        data: { lastHeartbeatAt: now, lastFrameAt: health.lastFrameAt ?? undefined },
      });
      continue;
    }
    const stale = !cam.lastHeartbeatAt || now.getTime() - cam.lastHeartbeatAt.getTime() > timeoutSec * 1000;
    if (stale && (cam.status === 'ONLINE' || cam.status === 'DEGRADED')) {
      await setCameraStatus(cam.id, 'OFFLINE', `Heartbeat ${timeoutSec} soniyadan beri kelmadi`);
    }
  }
}

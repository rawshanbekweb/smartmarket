import { env } from '../config/env';
import { logger } from '../lib/logger';
import { processDueAlerts, sweepUncoveredOccupiedSpaces } from '../services/alert.service';
import { checkCameraHealth, expireStaleManualOccupancy } from '../services/occupancy.service';

/**
 * Persistent alert processor. It holds no timers per alert: every tick reads due
 * work from PostgreSQL (adminNotifyAt / chiefEscalateAt), so escalations resume
 * correctly after a restart. Running several API instances is safe because each
 * transition is guarded by a conditional status update.
 */
export async function runWorkerTick(now = new Date()) {
  await checkCameraHealth(now);
  // Before the sweep: yesterday's manual checks must not open alerts today.
  await expireStaleManualOccupancy(now);
  await sweepUncoveredOccupiedSpaces(now);
  return processDueAlerts(now);
}

export function startAlertWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runWorkerTick();
      if (r.notified || r.escalated || r.autoResolved) logger.info('Alert worker', r);
    } catch (err) {
      logger.error('Alert worker tick failed', { err: String((err as Error)?.stack ?? err) });
    } finally {
      running = false;
    }
  };
  const handle = setInterval(tick, env.ALERT_WORKER_INTERVAL_SECONDS * 1000);
  void tick();
  return () => clearInterval(handle);
}

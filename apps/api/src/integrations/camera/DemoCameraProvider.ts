import type { Camera } from '@prisma/client';
import type { CameraHealth, CameraPreview, CameraProvider } from './CameraProvider';

/**
 * DEMO provider. It does not connect to any device. It keeps demo cameras that are
 * not deliberately switched off "alive" by producing a simulated heartbeat, so the
 * offline-detection and alerting logic can be demonstrated end-to-end.
 */
export class DemoCameraProvider implements CameraProvider {
  readonly type = 'DEMO' as const;

  async checkHealth(camera: Camera): Promise<CameraHealth | null> {
    if (camera.status === 'OFFLINE' || camera.status === 'MAINTENANCE') return null;
    return { status: camera.status, lastFrameAt: new Date(), message: 'DEMO heartbeat (simulyatsiya)' };
  }

  async preview(_camera: Camera): Promise<CameraPreview> {
    return {
      kind: 'SIMULATED',
      note: "DEMO simulyatsiya: bu jonli Hikvision oqimi emas. Zonalar ma'lumotlar bazasidagi holat bo'yicha chiziladi.",
      generatedAt: new Date().toISOString(),
    };
  }
}

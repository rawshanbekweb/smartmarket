import type { Camera, CameraStatus } from '@prisma/client';

export interface CameraHealth {
  status: CameraStatus;
  lastFrameAt: Date | null;
  message?: string;
}

export type CameraPreview =
  | { kind: 'SIMULATED'; note: string; generatedAt: string }
  | { kind: 'UNAVAILABLE'; note: string };

/**
 * Boundary between the platform and physical camera systems.
 * Occupancy detection itself runs in the separate vision service (services/vision),
 * which pushes results through the authenticated internal API.
 */
export interface CameraProvider {
  readonly type: Camera['provider'];
  /** Poll health. Returning null means "no new information" (rely on pushed heartbeats). */
  checkHealth(camera: Camera): Promise<CameraHealth | null>;
  preview(camera: Camera): Promise<CameraPreview>;
}

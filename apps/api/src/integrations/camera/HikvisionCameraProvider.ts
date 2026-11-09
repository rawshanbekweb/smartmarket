import type { Camera } from '@prisma/client';
import type { CameraHealth, CameraPreview, CameraProvider } from './CameraProvider';

/**
 * FUTURE INTEGRATION — not connected.
 *
 * Planned approach (to be validated on the installed hardware):
 *  - Stream: RTSP (e.g. rtsp://<host>:554/Streaming/Channels/101), consumed by the
 *    vision service only — never exposed to browsers.
 *  - Health/snapshot: Hikvision ISAPI (/ISAPI/System/status, /ISAPI/Streaming/channels/101/picture)
 *    or ONVIF GetStatus where supported.
 *  - Credentials are resolved server-side from `camera.streamConfigRef` (a secret key name),
 *    never stored in the database or returned by the API.
 *
 * Until the integration is built and tested against real devices, this provider
 * reports "no information" so the camera is governed by heartbeats pushed from the
 * vision service.
 */
export class HikvisionCameraProvider implements CameraProvider {
  readonly type = 'HIKVISION' as const;

  async checkHealth(_camera: Camera): Promise<CameraHealth | null> {
    return null;
  }

  async preview(_camera: Camera): Promise<CameraPreview> {
    return {
      kind: 'UNAVAILABLE',
      note: "Hikvision integratsiyasi hali ulanmagan (rejalashtirilgan). Jonli ko'rinish mavjud emas.",
    };
  }
}

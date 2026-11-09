import type { Camera } from '@prisma/client';
import type { CameraProvider } from './CameraProvider';
import { DemoCameraProvider } from './DemoCameraProvider';
import { HikvisionCameraProvider } from './HikvisionCameraProvider';

const providers: Record<Camera['provider'], CameraProvider> = {
  DEMO: new DemoCameraProvider(),
  HIKVISION: new HikvisionCameraProvider(),
};

export const cameraProviderFor = (camera: Camera) => providers[camera.provider];
export type { CameraProvider } from './CameraProvider';

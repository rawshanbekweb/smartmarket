export type SpaceStatus = 'FREE' | 'OCCUPIED_PAID' | 'OCCUPIED_UNPAID' | 'EXEMPTED' | 'UNKNOWN' | 'CAMERA_UNAVAILABLE';
export const SPACE_STATUSES: SpaceStatus[] = ['FREE', 'OCCUPIED_PAID', 'OCCUPIED_UNPAID', 'EXEMPTED', 'UNKNOWN', 'CAMERA_UNAVAILABLE'];

export interface Space {
  id: string;
  number: string;
  positionInRow: number;
  widthMeters: string;
  row: { id: string; code: string; name: string };
  tariff: { id: string; name: string; amount: number; widthMeters: string };
  camera: { id: string; code: string; name: string; status: string } | null;
  cameraZone: { id: string; zoneCode: string } | null;
  occupancyState: 'FREE' | 'OCCUPIED' | 'UNKNOWN';
  lastDetectedAt: string | null;
  isActive: boolean;
  notes: string | null;
  isDemo: boolean;
  qrToken?: string;
  status: SpaceStatus;
  paymentState: 'PAID' | 'UNPAID' | 'EXEMPTED';
  validPayment: { id: string; validUntil: string | null; amount: number; method: string } | null;
  activeExemption: { id: string; validUntil: string; reason: string } | null;
}

export interface Payment {
  id: string;
  spaceId: string;
  method: 'CASH' | 'PAYME' | 'CLICK' | 'UZUM';
  status: 'PENDING' | 'PENDING_SYNC' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  amount: number;
  paidAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  /** Click check number recorded by the collector */
  externalRef: string | null;
  verification: 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED' | 'MISMATCH';
  isSimulated: boolean;
  isDemo: boolean;
  note: string | null;
  space: { id: string; number: string; row: { name: string } };
  cashier: { id: string; fullName: string } | null;
  receipt: { receiptNumber: string } | null;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: string;
  title: string;
  message: string | null;
  detectedAt: string;
  adminNotifyAt: string | null;
  adminNotifiedAt: string | null;
  chiefEscalateAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  isDemo: boolean;
  space: { id: string; number: string; row: { name: string } } | null;
  camera: { id: string; code: string; name: string } | null;
  assignedTo: { id: string; fullName: string } | null;
  resolvedBy: { id: string; fullName: string } | null;
}

export interface Camera {
  id: string;
  code: string;
  name: string;
  ipAddress: string | null;
  model: string | null;
  provider: 'DEMO' | 'HIKVISION';
  streamConfigRef: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'MAINTENANCE';
  monitoringEnabled: boolean;
  lastHeartbeatAt: string | null;
  lastFrameAt: string | null;
  isDemo: boolean;
  createdAt: string;
  assignedSpaces: number;
}

export interface OccupancyRow {
  id: string;
  code: string;
  name: string;
  spaces: { id: string; number: string; widthMeters: string; status: SpaceStatus; paymentState: string; lastDetectedAt: string | null; cameraCode: string | null }[];
}

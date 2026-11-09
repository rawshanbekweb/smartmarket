import { colors } from '../theme';
import { useI18n } from '../lib/i18n';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'violet';

const tones: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: '#15803d', bg: colors.okBg },
  warn: { fg: '#b45309', bg: colors.warnBg },
  bad: { fg: '#b91c1c', bg: colors.badBg },
  info: { fg: '#1d4ed8', bg: colors.infoBg },
  neutral: { fg: '#475569', bg: colors.neutralBg },
  violet: { fg: '#6d28d9', bg: colors.violetBg },
};

export function Chip({ tone, children, dot = true }: { tone: Tone; children: React.ReactNode; dot?: boolean }) {
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: t.fg, background: t.bg }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.fg }} />}
      {children}
    </span>
  );
}

/** Colors for the six space statuses (used by the grid, legend and chips). */
export const SPACE_STATUS_STYLE: Record<string, { fill: string; border: string; text: string; tone: Tone }> = {
  FREE: { fill: '#ffffff', border: '#cbd5e1', text: '#475569', tone: 'neutral' },
  OCCUPIED_PAID: { fill: '#16a34a', border: '#15803d', text: '#ffffff', tone: 'ok' },
  OCCUPIED_UNPAID: { fill: '#dc2626', border: '#b91c1c', text: '#ffffff', tone: 'bad' },
  EXEMPTED: { fill: '#7c3aed', border: '#6d28d9', text: '#ffffff', tone: 'violet' },
  UNKNOWN: { fill: '#e2e8f0', border: '#cbd5e1', text: '#475569', tone: 'neutral' },
  CAMERA_UNAVAILABLE: { fill: '#f59e0b', border: '#d97706', text: '#1f2937', tone: 'warn' },
};

export function SpaceStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={SPACE_STATUS_STYLE[status]?.tone ?? 'neutral'}>{t(`space.${status}`)}</Chip>;
}

const paymentTone: Record<string, Tone> = {
  SUCCESS: 'ok',
  PENDING: 'warn',
  PENDING_SYNC: 'warn',
  FAILED: 'bad',
  CANCELLED: 'neutral',
  REFUNDED: 'info',
};
export function PaymentStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={paymentTone[status] ?? 'neutral'}>{t(`ps.${status}`)}</Chip>;
}

export function PaymentStateChip({ state }: { state: string }) {
  const { t } = useI18n();
  return <Chip tone={state === 'PAID' ? 'ok' : state === 'EXEMPTED' ? 'violet' : 'bad'}>{t(`pay.${state}`)}</Chip>;
}

const alertTone: Record<string, Tone> = {
  OPEN: 'warn',
  ADMIN_NOTIFIED: 'warn',
  INVESTIGATING: 'info',
  ESCALATED: 'bad',
  RESOLVED: 'ok',
  REJECTED: 'neutral',
};
export function AlertStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={alertTone[status] ?? 'neutral'}>{t(`as.${status}`)}</Chip>;
}

export function SeverityChip({ severity }: { severity: string }) {
  const { t } = useI18n();
  return <Chip tone={severity === 'CRITICAL' ? 'bad' : severity === 'WARNING' ? 'warn' : 'info'}>{t(`sev.${severity}`)}</Chip>;
}

export function CameraStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={status === 'ONLINE' ? 'ok' : status === 'DEGRADED' ? 'warn' : status === 'OFFLINE' ? 'bad' : 'neutral'}>{t(`cs.${status}`)}</Chip>;
}

export function ComplaintStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={status === 'NEW' ? 'warn' : status === 'INVESTIGATING' ? 'info' : status === 'RESOLVED' ? 'ok' : 'neutral'}>{t(`cmp.${status}`)}</Chip>;
}

export function ExemptionStatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return <Chip tone={status === 'APPROVED' ? 'violet' : status === 'PENDING' ? 'warn' : 'neutral'}>{t(`ex.${status}`)}</Chip>;
}

export function MethodLabel({ method, simulated }: { method: string; simulated?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium">{t(`pm.${method}`)}</span>
      {simulated && (
        <span className="rounded border border-dashed border-amber-400 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          {t('c.simulated')}
        </span>
      )}
    </span>
  );
}

/** Click reconciliation state; nothing is shown for cash (controlled via the shift handover). */
export function VerificationChip({ value }: { value: string }) {
  const { t } = useI18n();
  if (value === 'NOT_REQUIRED') return null;
  const tone: Tone = value === 'VERIFIED' ? 'ok' : value === 'MISMATCH' ? 'bad' : 'warn';
  return <Chip tone={tone} dot={false}>{t(`pv.${value}`)}</Chip>;
}

export function DemoTag({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">DEMO</span>
  );
}

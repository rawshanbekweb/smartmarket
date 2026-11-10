import { SPACE_STATUS_STYLE } from './Status';
import type { SpaceStatus } from '../lib/types';
import { tx } from '../lib/i18n';

/**
 * Clearly-labelled SIMULATED camera frame. It draws the configured zones and
 * colours them from database status. It is never presented as a live stream.
 */
export function SimulatedPreview({
  zones,
  cameraStatus,
  label = tx("DEMO SIMULYATSIYA — jonli oqim emas"),
  compact,
}: {
  zones: { key: string; label: string; status: SpaceStatus }[];
  cameraStatus: string;
  label?: string;
  compact?: boolean;
}) {
  const offline = cameraStatus === 'OFFLINE' || cameraStatus === 'MAINTENANCE';
  const n = Math.max(zones.length, 1);
  const w = 100 / n;
  return (
    <div className="relative overflow-hidden rounded-lg bg-[#1b2333]" style={{ aspectRatio: '16 / 9' }}>
      <svg viewBox="0 0 100 56.25" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#253047" />
            <stop offset="1" stopColor="#1a2232" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="56.25" fill="url(#floor)" />
        <rect x="0" y="0" width="100" height="16" fill="#2c374d" />
        {zones.map((z, i) => {
          const st = SPACE_STATUS_STYLE[z.status];
          const occupied = z.status === 'OCCUPIED_PAID' || z.status === 'OCCUPIED_UNPAID' || z.status === 'EXEMPTED';
          return (
            <g key={z.key} opacity={offline ? 0.25 : 1}>
              <rect x={i * w + 0.4} y="20" width={w - 0.8} height="33" fill={occupied ? st.fill : 'transparent'} fillOpacity={occupied ? 0.28 : 0} stroke={z.status === 'FREE' ? '#94a3b8' : st.fill} strokeWidth="0.35" strokeDasharray={z.status === 'FREE' ? '1 0.8' : undefined} />
              {occupied && <rect x={i * w + w * 0.25} y="30" width={w * 0.5} height="14" rx="1" fill="#cbd5e1" opacity="0.35" />}
              {!compact && (
                <text x={i * w + w / 2} y="51" fontSize={n > 14 ? 1.9 : 2.4} fill="#e2e8f0" textAnchor="middle" fontFamily="Inter, sans-serif">
                  {z.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute left-2 top-2 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-950">{label}</div>
      {offline && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-red-600/90 px-2 py-1 text-xs font-semibold text-white">{tx("Signal yo'q")}</span>
        </div>
      )}
    </div>
  );
}

export function UnavailablePreview({ note }: { note: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500" style={{ aspectRatio: '16 / 9' }}>
      {note}
    </div>
  );
}

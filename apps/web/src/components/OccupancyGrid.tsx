import { Tooltip } from 'antd';
import { useI18n } from '../lib/i18n';
import { SPACE_STATUSES, type OccupancyRow, type SpaceStatus } from '../lib/types';
import { SPACE_STATUS_STYLE } from './Status';
import { Cctv } from 'lucide-react';

export function StatusLegend({ counts, active, onToggle }: { counts?: Partial<Record<SpaceStatus, number>>; active?: SpaceStatus | null; onToggle?: (s: SpaceStatus) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-1">
      {SPACE_STATUSES.map((s) => {
        const st = SPACE_STATUS_STYLE[s];
        const dim = active && active !== s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle?.(s)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 ${dim ? 'opacity-40' : ''} ${active === s ? 'bg-slate-100 font-semibold' : ''}`}
            aria-pressed={active === s}
          >
            <span className="h-3 w-3 rounded-[3px]" style={{ background: st.fill, border: `1px solid ${st.border}` }} />
            {t(`space.${s}`)}
            {counts && <span className="tabular font-semibold text-slate-900">{counts[s] ?? 0}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Interactive market map: every row with its trading spaces as clickable cells. */
export function OccupancyGrid({ rows, onSelect, filter }: { rows: OccupancyRow[]; onSelect: (spaceId: string) => void; filter?: SpaceStatus | null }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3">
          <div className="w-14 shrink-0 pt-1.5">
            <div className="text-[13px] font-semibold text-slate-800">{r.name}</div>
            <div className="text-[11px] text-slate-400">{r.spaces.length} joy</div>
          </div>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {r.spaces.map((s) => {
              const st = SPACE_STATUS_STYLE[s.status];
              const dim = filter && filter !== s.status;
              return (
                <Tooltip
                  key={s.id}
                  mouseEnterDelay={0.15}
                  title={
                    <div className="text-xs">
                      <div className="font-semibold">{s.number}</div>
                      <div>{t(`space.${s.status}`)}</div>
                      {s.cameraCode && (
                        <div className="flex items-center gap-1 opacity-80">
                          <Cctv size={11} /> {s.cameraCode}
                        </div>
                      )}
                    </div>
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    aria-label={`${s.number}: ${t(`space.${s.status}`)}`}
                    className="space-cell tabular flex h-8 w-[46px] cursor-pointer items-center justify-center rounded-md p-0 text-[11px] font-semibold"
                    style={{
                      background: st.fill,
                      color: st.text,
                      border: `1px solid ${st.border}`,
                      opacity: dim ? 0.18 : 1,
                      ...(s.status === 'CAMERA_UNAVAILABLE' && { backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.35) 0 4px, transparent 4px 8px)' }),
                    }}
                  >
                    {s.number.split('-')[1] ?? s.number}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

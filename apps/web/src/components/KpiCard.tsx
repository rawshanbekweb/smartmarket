import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'violet';
const toneCls: Record<Tone, string> = {
  ok: 'bg-green-50 text-green-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  neutral: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-700',
};

export function KpiCard({
  label,
  value,
  icon,
  tone = 'neutral',
  hint,
  delta,
  to,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  delta?: { pct: number; label: string } | null;
  to?: string;
}) {
  const body = (
    <div className="sm-card flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-slate-500">{label}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneCls[tone]}`}>{icon}</span>
      </div>
      <div className="tabular text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {delta && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${delta.pct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {delta.pct >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {delta.pct >= 0 ? '+' : ''}
            {delta.pct.toFixed(1)}%
          </span>
        )}
        {delta && <span>{delta.label}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full text-inherit no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

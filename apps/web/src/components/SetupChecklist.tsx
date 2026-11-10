import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';

interface SetupStatus {
  complete: boolean;
  steps: Record<'tariff' | 'cycle' | 'rows' | 'spaces' | 'cashier' | 'assignment', boolean>;
}

const STEPS: { key: keyof SetupStatus['steps']; to: string; chiefOnly?: boolean }[] = [
  { key: 'tariff', to: '/settings', chiefOnly: true },
  { key: 'cycle', to: '/settings', chiefOnly: true },
  { key: 'rows', to: '/rows' },
  { key: 'spaces', to: '/spaces' },
  { key: 'cashier', to: '/users', chiefOnly: true },
  { key: 'assignment', to: '/rows', chiefOnly: true },
];

/** Shown on the dashboard until a new market has everything needed to take its first payment. */
export function SetupChecklist() {
  const { t } = useI18n();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['dashboard', 'setup'], queryFn: () => get<SetupStatus>('/dashboard/setup') });
  // Stays until every step is done, including the optional cashier-to-row assignment.
  if (!q.data || STEPS.every((s) => q.data.steps[s.key])) return null;
  const chief = can('CHIEF');
  const done = STEPS.filter((s) => q.data.steps[s.key]).length;
  const next = STEPS.find((s) => !q.data.steps[s.key]);

  return (
    <section className="sm-card border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-slate-900">{t('setup.title')}</h2>
        <span className="tabular text-xs text-slate-500">{done} / {STEPS.length}</span>
      </div>
      <p className="mb-3 mt-1 text-sm text-slate-600">{t('setup.subtitle')}</p>
      <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((s, i) => {
          const ok = q.data.steps[s.key];
          const allowed = chief || !s.chiefOnly;
          const body = (
            <>
              {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" />}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${ok ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{i + 1}. {t(`setup.${s.key}`)}</span>
                {!ok && <span className="block text-xs text-slate-500">{allowed ? t(`setup.${s.key}.hint`) : t('setup.chiefOnly')}</span>}
              </span>
              {!ok && allowed && <ArrowRight size={15} className="mt-1 shrink-0 text-blue-600" />}
            </>
          );
          const cls = `flex items-start gap-2 rounded-lg border border-solid p-3 no-underline ${!ok && s === next ? 'border-blue-300 bg-white' : 'border-slate-200 bg-white/70'}`;
          return (
            <li key={s.key}>
              {!ok && allowed ? <Link to={s.to} className={`${cls} hover:border-blue-400`}>{body}</Link> : <div className={cls}>{body}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

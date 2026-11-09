import type { ReactNode } from 'react';
import { Button, Skeleton } from 'antd';
import { AlertTriangle, Inbox, ShieldAlert } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { errorMessage } from '../lib/api';

export function PageHeader({ title, subtitle, extra }: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </div>
  );
}

export function Card({ title, extra, children, className = '', bodyClass = 'p-4' }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`sm-card ${className}`}>
      {(title || extra) && (
        <header className="flex items-center justify-between gap-2 border-0 border-b border-solid border-slate-100 px-4 py-3">
          <div className="sm-card-title">{title}</div>
          {extra && <div className="flex items-center gap-2">{extra}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function EmptyState({ text, icon }: { text?: string; icon?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
      {icon ?? <Inbox size={28} strokeWidth={1.5} />}
      <div className="text-sm">{text ?? t('c.empty')}</div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <AlertTriangle size={28} className="text-red-500" strokeWidth={1.5} />
      <div className="text-sm font-medium text-slate-700">{t('c.error')}</div>
      <div className="max-w-md text-xs text-slate-500">{errorMessage(error)}</div>
      {onRetry && (
        <Button size="small" onClick={onRetry}>
          {t('c.retry')}
        </Button>
      )}
    </div>
  );
}

/** Uniform loading / error rendering for a query. */
export function QueryView<T>({
  q,
  children,
  rows = 4,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
  rows?: number;
}) {
  if (q.isLoading) return <Skeleton active paragraph={{ rows }} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return <EmptyState />;
  return <>{children(q.data)}</>;
}

export function Forbidden() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
      <ShieldAlert size={36} strokeWidth={1.5} />
      <div className="text-base font-medium">{t('c.forbidden')}</div>
    </div>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-0 border-b border-dashed border-slate-100 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}

export function SimulatedNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

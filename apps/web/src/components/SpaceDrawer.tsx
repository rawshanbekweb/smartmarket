import { Button, Drawer, Skeleton, Space as AntSpace } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtDateTime, fmtMoney, fmtAgo } from '../lib/format';
import type { Alert, Payment, Space } from '../lib/types';
import { AlertStatusChip, CameraStatusChip, MethodLabel, PaymentStateChip, PaymentStatusChip, SpaceStatusChip, DemoTag } from './Status';
import { ErrorState, Field } from './common';

type SpaceDetail = Space & { payments: Payment[]; alerts: Alert[] };

export function SpaceDrawer({ spaceId, onClose }: { spaceId: string | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['space', spaceId], queryFn: () => get<SpaceDetail>(`/spaces/${spaceId}`), enabled: !!spaceId });
  const s = q.data;
  return (
    <Drawer
      open={!!spaceId}
      onClose={onClose}
      width={440}
      title={
        s ? (
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{s.number}</span>
            <SpaceStatusChip status={s.status} />
            <DemoTag show={s.isDemo} />
          </div>
        ) : (
          t('c.loading')
        )
      }
      extra={
        s && (
          <Link to={`/spaces/${s.id}`}>
            <Button size="small" icon={<ExternalLink size={13} />}>
              {t('c.details')}
            </Button>
          </Link>
        )
      }
    >
      {q.isLoading && <Skeleton active paragraph={{ rows: 10 }} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {s && (
        <div className="flex flex-col gap-5">
          <section>
            <Field label={t('c.row')}>{s.row.name}</Field>
            <Field label={t('c.size')}>{s.widthMeters} m (uzunlik)</Field>
            <Field label={t('c.tariff')}>{fmtMoney(s.tariff.amount)}</Field>
            <Field label="Bandlik">{t(`occ.${s.occupancyState}`)}</Field>
            <Field label="To'lov holati">
              <PaymentStateChip state={s.paymentState} />
            </Field>
            <Field label={t('c.lastDetected')}>
              {s.lastDetectedAt ? `${fmtDateTime(s.lastDetectedAt)} · ${fmtAgo(s.lastDetectedAt, lang)}` : '—'}
            </Field>
            <Field label={t('c.camera')}>
              {s.camera ? (
                <AntSpace size={6}>
                  <Link to={`/cameras/${s.camera.id}`}>{s.camera.code}</Link>
                  <CameraStatusChip status={s.camera.status} />
                </AntSpace>
              ) : (
                '—'
              )}
            </Field>
            {s.validPayment && <Field label={t('c.validUntil')}>{fmtDateTime(s.validPayment.validUntil)}</Field>}
            {s.activeExemption && (
              <Field label={t('nav.exemptions')}>
                {fmtDateTime(s.activeExemption.validUntil)} gacha — {s.activeExemption.reason}
              </Field>
            )}
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('nav.payments')}</div>
            {!s.payments.length && <div className="text-sm text-slate-400">{t('c.empty')}</div>}
            <div className="flex flex-col gap-1.5">
              {s.payments.slice(0, 5).map((p) => (
                <Link key={p.id} to={`/payments/${p.id}`} className="flex items-center justify-between rounded-lg border border-solid border-slate-100 px-3 py-2 text-sm text-slate-700 no-underline hover:bg-slate-50">
                  <span>
                    <span className="block font-medium tabular">{fmtMoney(p.amount)}</span>
                    <span className="block text-xs text-slate-500">
                      {fmtDateTime(p.paidAt ?? p.createdAt)} · <MethodLabel method={p.method} simulated={p.isSimulated} />
                    </span>
                  </span>
                  <PaymentStatusChip status={p.status} />
                </Link>
              ))}
            </div>
          </section>

          {s.alerts.length > 0 && (
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('nav.alerts')}</div>
              <div className="flex flex-col gap-1.5">
                {s.alerts.slice(0, 5).map((a) => (
                  <Link key={a.id} to={`/alerts/${a.id}`} className="flex items-center justify-between rounded-lg border border-solid border-slate-100 px-3 py-2 text-sm text-slate-700 no-underline hover:bg-slate-50">
                    <span>
                      <span className="block font-medium">{t(`at.${a.type}`)}</span>
                      <span className="block text-xs text-slate-500">{fmtDateTime(a.detectedAt)}</span>
                    </span>
                    <AlertStatusChip status={a.status} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

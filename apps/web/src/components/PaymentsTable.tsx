import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Select, Table } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { get, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtDateTime, fmtMoney } from '../lib/format';
import type { Payment } from '../lib/types';
import { MethodLabel, PaymentStatusChip, DemoTag, VerificationChip } from './Status';
import { ErrorState } from './common';

export interface PaymentFilters {
  search?: string;
  method?: string;
  status?: string;
  verification?: string;
  from?: string;
  to?: string;
  cashierId?: string;
}

/** Server-side paginated, searchable payment table (used on dashboard and payments page). */
export function PaymentsTable({ initial = {}, pageSize = 10, extraFilters, compact }: { initial?: PaymentFilters; pageSize?: number; extraFilters?: PaymentFilters; compact?: boolean }) {
  const { t } = useI18n();
  const [f, setF] = useState<PaymentFilters>(initial);
  const [page, setPage] = useState(1);
  const params = { ...f, ...extraFilters, page, pageSize };
  const q = useQuery({
    queryKey: ['payments', params],
    queryFn: () => get<Paged<Payment>>('/payments', params as Record<string, unknown>),
    placeholderData: keepPreviousData,
  });
  const set = (patch: PaymentFilters) => {
    setF((p) => ({ ...p, ...patch }));
    setPage(1);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input.Search allowClear defaultValue={initial.search} placeholder={`${t('c.search')}: ID, ${t('c.space').toLowerCase()}, ${t('c.receipt').toLowerCase()}, ${t('c.cashier').toLowerCase()}`} onSearch={(v) => set({ search: v || undefined })} className="w-full sm:w-80" />
        <Select allowClear placeholder={t('c.method')} value={f.method} onChange={(v) => set({ method: v })} className="w-36" options={['CASH', 'CLICK'].map((m) => ({ value: m, label: t(`pm.${m}`) }))} />
        <Select allowClear placeholder={t('pv.title')} value={f.verification} onChange={(v) => set({ verification: v })} className="w-44" options={['PENDING', 'VERIFIED', 'MISMATCH'].map((s) => ({ value: s, label: t(`pv.${s}`) }))} />
        <Select allowClear placeholder={t('c.status')} value={f.status} onChange={(v) => set({ status: v })} className="w-48" options={['SUCCESS', 'PENDING', 'PENDING_SYNC', 'FAILED', 'CANCELLED', 'REFUNDED'].map((s) => ({ value: s, label: t(`ps.${s}`) }))} />
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Table<Payment>
          rowKey="id"
          size={compact ? 'small' : 'middle'}
          loading={q.isFetching && !q.data}
          dataSource={q.data?.items}
          scroll={{ x: 900 }}
          pagination={{ current: page, pageSize, total: q.data?.total, onChange: setPage, showSizeChanger: false, showTotal: (n) => `${n} ta` }}
          columns={[
            {
              title: 'ID / ' + t('c.receipt'),
              key: 'id',
              render: (_, p) => (
                <Link to={`/payments/${p.id}`} className="block">
                  <span className="block font-mono text-xs text-slate-800">{p.receipt?.receiptNumber ?? `#${p.id.slice(-8)}`}</span>
                  <span className="block font-mono text-[11px] text-slate-400">{p.id.slice(0, 12)}…</span>
                </Link>
              ),
            },
            { title: t('c.space'), key: 'space', render: (_, p) => <Link to={`/spaces/${p.space.id}`} className="font-semibold">{p.space.number}</Link> },
            { title: t('c.cashier'), key: 'cashier', render: (_, p) => p.cashier?.fullName ?? <span className="text-slate-400">—</span> },
            {
              title: t('c.method'),
              key: 'method',
              render: (_, p) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  <MethodLabel method={p.method} simulated={p.isSimulated} />
                  {p.externalRef && <span className="font-mono text-[11px] text-slate-500">{p.externalRef}</span>}
                  <VerificationChip value={p.verification} />
                </span>
              ),
            },
            { title: t('c.amount'), key: 'amount', align: 'right', render: (_, p) => <span className={`tabular font-semibold ${p.status === 'CANCELLED' || p.status === 'REFUNDED' ? 'text-slate-400 line-through decoration-slate-300' : p.status !== 'SUCCESS' ? 'text-slate-400' : ''}`}>{fmtMoney(p.amount)}</span> },
            { title: t('c.date'), key: 'date', render: (_, p) => <span className="tabular whitespace-nowrap text-slate-600">{fmtDateTime(p.paidAt ?? p.createdAt)}</span> },
            { title: t('c.status'), key: 'status', render: (_, p) => <span className="flex items-center gap-1.5"><PaymentStatusChip status={p.status} /><DemoTag show={p.isDemo} /></span> },
          ]}
        />
      )}
    </div>
  );
}

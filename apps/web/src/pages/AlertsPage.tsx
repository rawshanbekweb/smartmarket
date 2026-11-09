import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Input, Segmented, Select, Table } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { get, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtAgo, fmtDateTime } from '../lib/format';
import type { Alert } from '../lib/types';
import { PageHeader, Card, ErrorState } from '../components/common';
import { AlertStatusChip, SeverityChip, DemoTag } from '../components/Status';

const TYPES = ['UNPAID_OCCUPANCY', 'CAMERA_OFFLINE', 'SELLER_COMPLAINT', 'PAYMENT_CANCELLED', 'EXEMPTION_APPROVED', 'PAYMENT_MISMATCH', 'CASH_SHORTAGE'];

export default function AlertsPage() {
  const { t, lang } = useI18n();
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1);
  const status = sp.get('status') ?? 'ACTIVE';
  const type = sp.get('type') ?? undefined;
  const severity = sp.get('severity') ?? undefined;
  const search = sp.get('search') ?? undefined;
  const set = (k: string, v?: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
    setPage(1);
  };
  const params = { status: status === 'ALL' ? undefined : status, type, severity, search, page, pageSize: 20 };
  const q = useQuery({ queryKey: ['alerts', params], queryFn: () => get<Paged<Alert>>('/alerts', params), placeholderData: keepPreviousData, refetchInterval: 30_000 });

  return (
    <div>
      <PageHeader title={t('nav.alerts')} subtitle="To'lovsiz bandlik 5 daqiqada adminga, yana 10 daqiqada rahbarga eskalatsiya qilinadi (sozlanadi)" />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-0 border-b border-solid border-slate-100 p-4">
          <Segmented value={status} onChange={(v) => set('status', v === 'ACTIVE' ? undefined : String(v))}
            options={[{ value: 'ACTIVE', label: 'Faol' }, { value: 'ESCALATED', label: t('as.ESCALATED') }, { value: 'RESOLVED', label: t('as.RESOLVED') }, { value: 'REJECTED', label: t('as.REJECTED') }, { value: 'ALL', label: t('c.all') }]} />
          <Select allowClear placeholder="Turi" value={type} onChange={(v) => set('type', v)} className="w-52" options={TYPES.map((x) => ({ value: x, label: t(`at.${x}`) }))} />
          <Select allowClear placeholder="Darajasi" value={severity} onChange={(v) => set('severity', v)} className="w-40" options={['CRITICAL', 'WARNING', 'INFO'].map((x) => ({ value: x, label: t(`sev.${x}`) }))} />
          <Input.Search allowClear defaultValue={search} placeholder={`${t('c.search')}: joy`} onSearch={(v) => set('search', v || undefined)} className="w-full sm:w-56" />
        </div>
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <Table<Alert>
            rowKey="id"
            loading={q.isFetching && !q.data}
            dataSource={q.data?.items}
            scroll={{ x: 1000 }}
            pagination={{ current: page, pageSize: 20, total: q.data?.total, onChange: setPage, showSizeChanger: false, showTotal: (n) => `${n} ta` }}
            columns={[
              { title: 'Darajasi', key: 'sev', render: (_, a) => <SeverityChip severity={a.severity} /> },
              {
                title: 'Hodisa',
                key: 't',
                render: (_, a) => (
                  <Link to={`/alerts/${a.id}`} className="block">
                    <span className="flex items-center gap-2 font-medium text-slate-800">{t(`at.${a.type}`)} <DemoTag show={a.isDemo} /></span>
                    <span className="block text-xs text-slate-500">{a.title}</span>
                  </Link>
                ),
              },
              { title: 'Joylashuv', key: 'loc', render: (_, a) => (a.space ? `${a.space.number} · ${a.space.row.name}` : a.camera ? `${a.camera.code}` : '—') },
              { title: 'Aniqlangan', key: 'd', render: (_, a) => <span title={fmtDateTime(a.detectedAt)} className="whitespace-nowrap">{fmtAgo(a.detectedAt, lang)}</span> },
              { title: t('c.status'), key: 's', render: (_, a) => <AlertStatusChip status={a.status} /> },
              { title: "Mas'ul", key: 'as', render: (_, a) => a.assignedTo?.fullName ?? a.resolvedBy?.fullName ?? '—' },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

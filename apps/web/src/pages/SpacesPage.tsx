import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Input, Select, Table } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Plus, Cctv } from 'lucide-react';
import { get, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtMoney } from '../lib/format';
import { SPACE_STATUSES, type Space } from '../lib/types';
import { PageHeader, Card, ErrorState } from '../components/common';
import { SpaceStatusChip, PaymentStateChip, CameraStatusChip, DemoTag } from '../components/Status';
import { SpaceForm } from '../components/SpaceForm';
import { SpaceDrawer } from '../components/SpaceDrawer';

export default function SpacesPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Space | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const filters = {
    search: sp.get('search') ?? undefined,
    rowId: sp.get('rowId') ?? undefined,
    occupancy: sp.get('occupancy') ?? undefined,
    status: sp.get('status') ?? undefined,
    paymentState: sp.get('paymentState') ?? undefined,
    active: sp.get('active') ?? 'true',
  };
  const setFilter = (k: string, v?: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
    setPage(1);
  };
  const rows = useQuery({ queryKey: ['rows'], queryFn: () => get<{ id: string; name: string }[]>('/rows') });
  const q = useQuery({
    queryKey: ['spaces', filters, page],
    queryFn: () => get<Paged<Space>>('/spaces', { ...filters, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const manage = can('CHIEF', 'MARKET_ADMIN');

  return (
    <div>
      <PageHeader
        title={t('nav.spaces')}
        subtitle={q.data ? `${q.data.total} ta joy topildi` : undefined}
        extra={
          manage && (
            <Button type="primary" icon={<Plus size={16} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              {t('c.add')}
            </Button>
          )
        }
      />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap gap-2 border-0 border-b border-solid border-slate-100 p-4">
          <Input.Search allowClear defaultValue={filters.search} placeholder={`${t('c.search')}: A-12`} onSearch={(v) => setFilter('search', v || undefined)} className="w-full sm:w-56" />
          <Select allowClear placeholder={t('c.row')} value={filters.rowId} onChange={(v) => setFilter('rowId', v)} className="w-36" options={rows.data?.map((r) => ({ value: r.id, label: r.name }))} />
          <Select allowClear placeholder="Bandlik" value={filters.occupancy} onChange={(v) => setFilter('occupancy', v)} className="w-36" options={['FREE', 'OCCUPIED', 'UNKNOWN'].map((o) => ({ value: o, label: t(`occ.${o}`) }))} />
          <Select allowClear placeholder={t('c.status')} value={filters.status} onChange={(v) => setFilter('status', v)} className="w-52" options={SPACE_STATUSES.map((s) => ({ value: s, label: t(`space.${s}`) }))} />
          <Select allowClear placeholder="To'lov holati" value={filters.paymentState} onChange={(v) => setFilter('paymentState', v)} className="w-40" options={['PAID', 'UNPAID', 'EXEMPTED'].map((s) => ({ value: s, label: t(`pay.${s}`) }))} />
          {manage && (
            <Select value={filters.active} onChange={(v) => setFilter('active', v === 'true' ? undefined : v)} className="w-32" options={[{ value: 'true', label: t('c.active') }, { value: 'false', label: t('c.inactive') }, { value: 'all', label: t('c.all') }]} />
          )}
        </div>
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <Table<Space>
            rowKey="id"
            loading={q.isFetching && !q.data}
            dataSource={q.data?.items}
            scroll={{ x: 1000 }}
            onRow={(r) => ({ onClick: () => setDrawer(r.id), className: 'cursor-pointer' })}
            pagination={{ current: page, pageSize: 25, total: q.data?.total, onChange: setPage, showSizeChanger: false, showTotal: (n) => `${n} ta` }}
            columns={[
              {
                title: t('c.space'),
                key: 'n',
                render: (_, s) => (
                  <span className="flex items-center gap-2">
                    <Link to={`/spaces/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold">{s.number}</Link>
                    {!s.isActive && <span className="text-xs text-slate-400">({t('c.inactive')})</span>}
                    <DemoTag show={s.isDemo} />
                  </span>
                ),
              },
              { title: t('c.row'), key: 'r', render: (_, s) => s.row.name },
              { title: t('c.size'), key: 'w', render: (_, s) => `${s.widthMeters} m` },
              { title: t('c.tariff'), key: 't', align: 'right', render: (_, s) => <span className="tabular">{fmtMoney(s.tariff.amount)}</span> },
              { title: t('c.status'), key: 's', render: (_, s) => <SpaceStatusChip status={s.status} /> },
              { title: "To'lov", key: 'p', render: (_, s) => <PaymentStateChip state={s.paymentState} /> },
              {
                title: t('c.camera'),
                key: 'c',
                render: (_, s) =>
                  s.camera ? (
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <Cctv size={13} className="text-slate-400" /> <span className="font-mono text-xs">{s.camera.code}</span>
                      {s.camera.status !== 'ONLINE' && <CameraStatusChip status={s.camera.status} />}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  ),
              },
              { title: t('c.lastDetected'), key: 'l', render: (_, s) => <span className="whitespace-nowrap text-slate-500">{fmtAgo(s.lastDetectedAt, lang)}</span> },
              ...(manage
                ? [
                    {
                      title: '',
                      key: 'a',
                      render: (_: unknown, s: Space) => (
                        <Button size="small" onClick={(e) => { e.stopPropagation(); setEditing(s); setFormOpen(true); }}>
                          {t('c.edit')}
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>
      <SpaceForm open={formOpen} space={editing} onClose={() => setFormOpen(false)} />
      <SpaceDrawer spaceId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

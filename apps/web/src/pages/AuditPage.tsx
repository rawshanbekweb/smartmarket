import { useState } from 'react';
import { DatePicker, Input, Select, Table, Tag } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { Lock } from 'lucide-react';
import { get, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import { PageHeader, Card, ErrorState } from '../components/common';
import { DemoTag } from '../components/Status';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  actorRole: string | null;
  ip: string | null;
  isDemo: boolean;
  createdAt: string;
  before: unknown;
  after: unknown;
  actor: { fullName: string; username: string } | null;
}

const actionColor = (a: string) => (/CANCEL|REJECT|FAILED|REVOKED|DEACTIV/.test(a) ? 'red' : /CREATED|APPROVED|LOGIN$|OPENED|RESOLVED/.test(a) ? 'green' : /ESCALAT/.test(a) ? 'orange' : 'default');

export default function AuditPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<string>();
  const [action, setAction] = useState<string>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const params = { search, action, page, pageSize: 30, from: range?.[0].format('YYYY-MM-DD'), to: range?.[1].format('YYYY-MM-DD') };
  const q = useQuery({ queryKey: ['audit', params], queryFn: () => get<Paged<AuditRow> & { actions: string[] }>('/audit', params), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader
        title={t('nav.audit')}
        subtitle={<span className="inline-flex items-center gap-1.5"><Lock size={13} /> Faqat qo'shish mumkin: o'zgartirish va o'chirish ma'lumotlar bazasi darajasida bloklangan</span>}
      />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap gap-2 border-0 border-b border-solid border-slate-100 p-4">
          <Input.Search allowClear placeholder={t('c.search')} onSearch={(v) => { setSearch(v || undefined); setPage(1); }} className="w-full sm:w-64" />
          <Select allowClear showSearch placeholder="Amal" value={action} onChange={(v) => { setAction(v); setPage(1); }} className="w-64" options={q.data?.actions.map((a) => ({ value: a, label: a }))} />
          <DatePicker.RangePicker format="DD.MM.YYYY" onChange={(v) => { setRange(v && v[0] && v[1] ? [v[0], v[1]] : null); setPage(1); }} />
        </div>
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <Table<AuditRow>
            rowKey="id"
            size="middle"
            loading={q.isFetching && !q.data}
            dataSource={q.data?.items}
            scroll={{ x: 1000 }}
            pagination={{ current: page, pageSize: 30, total: q.data?.total, onChange: setPage, showSizeChanger: false, showTotal: (n) => `${n} ta yozuv` }}
            expandable={{
              rowExpandable: (r) => !!(r.before || r.after),
              expandedRowRender: (r) => (
                <div className="grid gap-3 md:grid-cols-2">
                  <pre className="m-0 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(r.before, null, 2) ?? '—'}</pre>
                  <pre className="m-0 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(r.after, null, 2) ?? '—'}</pre>
                </div>
              ),
            }}
            columns={[
              { title: '#', dataIndex: 'id', width: 70, render: (v) => <span className="font-mono text-xs text-slate-400">{v}</span> },
              { title: t('c.time'), key: 'd', render: (_, r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
              { title: 'Foydalanuvchi', key: 'u', render: (_, r) => (r.actor ? <span>{r.actor.fullName} <span className="text-xs text-slate-400">@{r.actor.username}</span></span> : <span className="text-slate-500">{r.actorRole ?? 'TIZIM'}</span>) },
              { title: 'Amal', key: 'a', render: (_, r) => <span className="flex items-center gap-1"><Tag color={actionColor(r.action)} className="font-mono text-[11px]">{r.action}</Tag><DemoTag show={r.isDemo} /></span> },
              { title: 'Obyekt', key: 'e', render: (_, r) => <span className="text-xs">{r.entityType}{r.entityId && <span className="block font-mono text-[10px] text-slate-400">{r.entityId.slice(0, 14)}</span>}</span> },
              { title: 'Tavsif', dataIndex: 'summary', render: (v) => <span className="text-sm">{v ?? '—'}</span> },
              { title: 'IP', dataIndex: 'ip', render: (v) => <span className="font-mono text-[11px] text-slate-500">{v ?? '—'}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

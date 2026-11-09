import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Form, Input, Modal, Segmented, Select, Table, Button } from 'antd';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { errorMessage, get, patch, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import { PageHeader, Card, ErrorState } from '../components/common';
import { ComplaintStatusChip, DemoTag } from '../components/Status';
import { KpiCard } from '../components/KpiCard';
import { MessageSquareWarning, Search, CheckCircle2, XCircle } from 'lucide-react';

interface Complaint {
  id: string;
  type: string;
  status: string;
  description: string | null;
  contactPhone: string | null;
  resolutionNote: string | null;
  createdAt: string;
  isDemo: boolean;
  space: { id: string; number: string; row: { name: string } };
  relatedCashier: { id: string; fullName: string } | null;
  resolvedBy: { fullName: string } | null;
  alerts: { id: string; status: string }[];
}

export default function ComplaintsPage() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('OPEN');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<string>();
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [form] = Form.useForm();
  const params = { status: status === 'ALL' ? undefined : status, search, page, pageSize: 20 };
  const q = useQuery({ queryKey: ['complaints', params], queryFn: () => get<Paged<Complaint> & { byStatus: Record<string, number> }>('/complaints', params), placeholderData: keepPreviousData });
  const items = q.data?.items;
  const save = useMutation({
    mutationFn: (v: { status: string; note: string }) => patch(`/complaints/${editing!.id}`, v),
    onSuccess: () => { message.success('Saqlandi'); setEditing(null); qc.invalidateQueries({ queryKey: ['complaints'] }); qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const by = q.data?.byStatus ?? {};

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('nav.complaints')} subtitle="Sotuvchilar QR kod orqali yuborgan shikoyatlar (CASH_PAID_NO_RECEIPT)" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t('cmp.NEW')} value={by.NEW ?? 0} icon={<MessageSquareWarning size={17} />} tone="warn" />
        <KpiCard label={t('cmp.INVESTIGATING')} value={by.INVESTIGATING ?? 0} icon={<Search size={17} />} tone="info" />
        <KpiCard label={t('cmp.RESOLVED')} value={by.RESOLVED ?? 0} icon={<CheckCircle2 size={17} />} tone="ok" />
        <KpiCard label={t('cmp.REJECTED')} value={by.REJECTED ?? 0} icon={<XCircle size={17} />} tone="neutral" />
      </div>
      <Card bodyClass="p-0">
        <div className="flex flex-wrap gap-2 border-0 border-b border-solid border-slate-100 p-4">
          <Segmented value={status} onChange={(v) => { setStatus(String(v)); setPage(1); }}
            options={[{ value: 'OPEN', label: 'Ochiq' }, { value: 'RESOLVED', label: t('cmp.RESOLVED') }, { value: 'REJECTED', label: t('cmp.REJECTED') }, { value: 'ALL', label: t('c.all') }]} />
          <Input.Search allowClear placeholder={`${t('c.search')}: joy`} onSearch={(v) => { setSearch(v || undefined); setPage(1); }} className="w-full sm:w-56" />
        </div>
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <Table<Complaint>
            rowKey="id"
            loading={q.isFetching && !q.data}
            dataSource={items}
            scroll={{ x: 1000 }}
            pagination={{ current: page, pageSize: 20, total: q.data?.total, onChange: setPage, showSizeChanger: false }}
            columns={[
              { title: t('c.time'), key: 'd', render: (_, c) => <span className="whitespace-nowrap">{fmtDateTime(c.createdAt)}</span> },
              { title: t('c.space'), key: 's', render: (_, c) => <Link to={`/spaces/${c.space.id}`} className="font-semibold">{c.space.number}</Link> },
              { title: 'Mazmun', key: 'm', render: (_, c) => <span className="flex items-center gap-2"><span className="line-clamp-2 max-w-sm text-sm">{c.description ?? "Naqd to'langan, chek berilmagan"}</span><DemoTag show={c.isDemo} /></span> },
              { title: "Bog'liq kassir", key: 'k', render: (_, c) => c.relatedCashier?.fullName ?? <span className="text-slate-400">aniqlanmagan</span> },
              { title: t('c.status'), key: 'st', render: (_, c) => <ComplaintStatusChip status={c.status} /> },
              { title: 'Natija', key: 'r', render: (_, c) => <span className="text-xs text-slate-600">{c.resolutionNote ?? '—'}</span> },
              {
                title: '',
                key: 'a',
                render: (_, c) => (
                  <span className="flex gap-1">
                    {c.alerts[0] && <Link to={`/alerts/${c.alerts[0].id}`}><Button size="small">Ogohlantirish</Button></Link>}
                    {(c.status === 'NEW' || c.status === 'INVESTIGATING') && <Button size="small" type="primary" onClick={() => { form.setFieldsValue({ status: c.status === 'NEW' ? 'INVESTIGATING' : 'RESOLVED' }); setEditing(c); }}>Ko'rib chiqish</Button>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Modal open={!!editing} title={`Shikoyat: ${editing?.space.number}`} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={save.isPending} okText={t('c.save')} destroyOnHidden>
        <p className="text-sm text-slate-600">{editing?.description}</p>
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="status" label="Yangi holat" rules={[{ required: true }]}>
            <Select options={['INVESTIGATING', 'RESOLVED', 'REJECTED'].map((s) => ({ value: s, label: t(`cmp.${s}`) }))} />
          </Form.Item>
          <Form.Item name="note" label="Tekshiruv natijasi" rules={[{ required: true, min: 3 }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

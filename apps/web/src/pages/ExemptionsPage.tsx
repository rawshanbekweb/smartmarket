import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, DatePicker, Form, Input, Modal, Segmented, Select, Table } from 'antd';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Plus } from 'lucide-react';
import { errorMessage, get, post, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import type { Space } from '../lib/types';
import { PageHeader, Card, ErrorState } from '../components/common';
import { ExemptionStatusChip, DemoTag } from '../components/Status';

interface Exemption {
  id: string;
  reason: string;
  status: string;
  validFrom: string;
  validUntil: string;
  decisionNote: string | null;
  isDemo: boolean;
  createdAt: string;
  space: { id: string; number: string; row: { name: string } };
  requestedBy: { fullName: string };
  approvedBy: { fullName: string } | null;
}

/** CHIEF: creates an approved exemption. MARKET_ADMIN: submits a request for CHIEF approval. */
export function ExemptionModal({ open, onClose, spaceId }: { open: boolean; onClose: () => void; spaceId?: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const spaces = useQuery({ queryKey: ['spaces', 'all-options'], queryFn: () => get<Paged<Space>>('/spaces', { pageSize: 2000 }), enabled: open && !spaceId });
  const save = useMutation({
    mutationFn: (v: any) =>
      post('/exemptions', {
        spaceId: spaceId ?? v.spaceId,
        reason: v.reason,
        validFrom: v.range?.[0]?.toISOString(),
        validUntil: v.range?.[1]?.toISOString(),
      }),
    onSuccess: () => {
      message.success(can('CHIEF') ? 'Imtiyoz tasdiqlandi' : "So'rov rahbarga yuborildi");
      qc.invalidateQueries({ queryKey: ['exemptions'] });
      qc.invalidateQueries({ queryKey: ['space'] });
      qc.invalidateQueries({ queryKey: ['spaces'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal open={open} title={can('CHIEF') ? 'Imtiyoz berish' : "Imtiyoz so'rash (rahbar tasdiqlaydi)"} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} okText={t('c.save')} destroyOnHidden>
      <Form form={form} layout="vertical" className="mt-4" onFinish={(v) => save.mutate(v)} initialValues={{ range: [dayjs(), dayjs().endOf('day')] }}>
        {!spaceId && (
          <Form.Item name="spaceId" label={t('c.space')} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" loading={spaces.isLoading} options={spaces.data?.items.map((s) => ({ value: s.id, label: s.number }))} />
          </Form.Item>
        )}
        <Form.Item name="reason" label={t('c.reason')} rules={[{ required: true, min: 5 }]}>
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
        <Form.Item name="range" label="Amal qilish muddati" rules={[{ required: true }]}>
          <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" className="w-full" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function ExemptionsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const params = { status: status === 'ALL' ? undefined : status, page, pageSize: 20 };
  const q = useQuery({ queryKey: ['exemptions', params], queryFn: () => get<Paged<Exemption>>('/exemptions', params), placeholderData: keepPreviousData });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => post(path, body),
    onSuccess: () => { message.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['exemptions'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const askNote = (title: string, path: string, body: (note: string) => unknown, danger = false) => {
    let note = '';
    modal.confirm({
      title,
      content: <Input.TextArea rows={3} placeholder="Izoh" onChange={(e) => (note = e.target.value)} />,
      okButtonProps: { danger },
      onOk: () => act.mutateAsync({ path, body: body(note) }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.exemptions')}
        subtitle="Faqat rahbar imtiyozni tasdiqlaydi. Har bir qaror audit jurnaliga yoziladi."
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{can('CHIEF') ? 'Imtiyoz berish' : "Imtiyoz so'rash"}</Button>}
      />
      <Card bodyClass="p-0">
        <div className="border-0 border-b border-solid border-slate-100 p-4">
          <Segmented value={status} onChange={(v) => { setStatus(String(v)); setPage(1); }}
            options={[{ value: 'ACTIVE', label: 'Hozir amalda' }, { value: 'PENDING', label: t('ex.PENDING') }, { value: 'APPROVED', label: t('ex.APPROVED') }, { value: 'REJECTED', label: t('ex.REJECTED') }, { value: 'REVOKED', label: t('ex.REVOKED') }, { value: 'ALL', label: t('c.all') }]} />
        </div>
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <Table<Exemption>
            rowKey="id"
            loading={q.isFetching && !q.data}
            dataSource={q.data?.items}
            scroll={{ x: 1000 }}
            pagination={{ current: page, pageSize: 20, total: q.data?.total, onChange: setPage, showSizeChanger: false }}
            columns={[
              { title: t('c.space'), key: 's', render: (_, e) => <Link to={`/spaces/${e.space.id}`} className="font-semibold">{e.space.number}</Link> },
              { title: t('c.reason'), key: 'r', render: (_, e) => <span className="flex items-center gap-2">{e.reason} <DemoTag show={e.isDemo} /></span> },
              { title: 'Muddat', key: 'm', render: (_, e) => <span className="whitespace-nowrap text-xs">{fmtDateTime(e.validFrom)} — {fmtDateTime(e.validUntil)}</span> },
              { title: t('c.status'), key: 'st', render: (_, e) => <ExemptionStatusChip status={e.status} /> },
              { title: "So'ragan", key: 'q', render: (_, e) => e.requestedBy.fullName },
              { title: 'Tasdiqlagan', key: 'a', render: (_, e) => e.approvedBy?.fullName ?? '—' },
              ...(can('CHIEF')
                ? [{
                    title: '',
                    key: 'x',
                    render: (_: unknown, e: Exemption) => (
                      <span className="flex gap-1">
                        {e.status === 'PENDING' && (
                          <>
                            <Button size="small" type="primary" onClick={() => askNote(`${e.space.number}: tasdiqlash`, `/exemptions/${e.id}/decision`, (note) => ({ decision: 'APPROVED', note: note || undefined }))}>Tasdiqlash</Button>
                            <Button size="small" danger onClick={() => askNote(`${e.space.number}: rad etish`, `/exemptions/${e.id}/decision`, (note) => ({ decision: 'REJECTED', note: note || undefined }), true)}>Rad etish</Button>
                          </>
                        )}
                        {e.status === 'APPROVED' && new Date(e.validUntil) > new Date() && (
                          <Button size="small" onClick={() => askNote(`${e.space.number}: imtiyozni bekor qilish`, `/exemptions/${e.id}/revoke`, (note) => ({ note: note || 'Bekor qilindi' }), true)}>Bekor qilish</Button>
                        )}
                      </span>
                    ),
                  }]
                : []),
            ]}
          />
        )}
      </Card>
      <ExemptionModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

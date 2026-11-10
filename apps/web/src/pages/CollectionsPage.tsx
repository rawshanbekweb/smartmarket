import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Form, Input, InputNumber, Modal, Segmented, Table, Tabs } from 'antd';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Banknote, CircleAlert, Smartphone } from 'lucide-react';
import { errorMessage, get, post, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtDateTime, fmtMoney } from '../lib/format';
import type { Payment } from '../lib/types';
import { PageHeader, Card, ErrorState } from '../components/common';
import { Chip, DemoTag, VerificationChip } from '../components/Status';
import { KpiCard } from '../components/KpiCard';

interface Summary {
  clickPending: { count: number; amount: number };
  clickMismatch: number;
  handoversAwaiting: { count: number; amount: number };
}

interface Handover {
  id: string;
  openedAt: string;
  closedAt: string;
  expectedCash: number | null;
  declaredCash: number | null;
  receivedCash: number | null;
  receivedAt: string | null;
  handoverNote: string | null;
  isDemo: boolean;
  cashier: { id: string; fullName: string };
  receivedBy: { fullName: string } | null;
  _count: { payments: number };
}

type ClickRow = Payment & { verifiedBy: { fullName: string } | null; verifiedAt: string | null; verificationNote: string | null };

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['collections'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
  };
}

function ClickReconciliation() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const invalidate = useInvalidate();
  const [state, setState] = useState<'PENDING' | 'VERIFIED' | 'MISMATCH'>('PENDING');
  const [page, setPage] = useState(1);
  const [mismatch, setMismatch] = useState<ClickRow | null>(null);
  const [form] = Form.useForm();
  const q = useQuery({
    queryKey: ['collections', 'click', state, page],
    queryFn: () => get<Paged<ClickRow>>('/collections/click', { verification: state, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const verify = useMutation({
    mutationFn: (v: { id: string; outcome: 'VERIFIED' | 'MISMATCH'; note?: string }) => post(`/collections/click/${v.id}/verify`, { outcome: v.outcome, note: v.note }),
    onSuccess: (_d, v) => {
      message.success(v.outcome === 'VERIFIED' ? t('col.verified') : t('col.mismatchSent'));
      setMismatch(null);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <div>
      <p className="mt-0 text-sm text-slate-500">{t('col.clickHelp')}</p>
      <Segmented
        className="mb-3"
        value={state}
        onChange={(v) => { setState(v as typeof state); setPage(1); }}
        options={(['PENDING', 'VERIFIED', 'MISMATCH'] as const).map((s) => ({ value: s, label: t(`pv.${s}`) }))}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Table<ClickRow>
          rowKey="id"
          size="middle"
          loading={q.isFetching && !q.data}
          dataSource={q.data?.items}
          scroll={{ x: 900 }}
          pagination={{ current: page, pageSize: 20, total: q.data?.total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: t('col.clickRef'), key: 'ref', render: (_, p) => <Link to={`/payments/${p.id}`} className="font-mono font-semibold">{p.externalRef}</Link> },
            { title: t('c.date'), key: 'd', render: (_, p) => <span className="tabular whitespace-nowrap">{fmtDateTime(p.paidAt)}</span> },
            { title: t('c.amount'), key: 'a', align: 'right', render: (_, p) => <span className="tabular font-semibold">{fmtMoney(p.amount)}</span> },
            { title: t('c.space'), key: 's', render: (_, p) => p.space.number },
            { title: t('c.cashier'), key: 'c', render: (_, p) => <span className="flex items-center gap-1.5">{p.cashier?.fullName ?? '—'} <DemoTag show={p.isDemo} /></span> },
            state === 'PENDING'
              ? {
                  title: '',
                  key: 'act',
                  render: (_, p) => (
                    <span className="flex gap-1.5">
                      <Button size="small" type="primary" loading={verify.isPending && verify.variables?.id === p.id} onClick={() => verify.mutate({ id: p.id, outcome: 'VERIFIED' })}>
                        {t('col.found')}
                      </Button>
                      <Button size="small" danger onClick={() => { form.resetFields(); setMismatch(p); }}>{t('col.notFound')}</Button>
                    </span>
                  ),
                }
              : {
                  title: t('col.checkedBy'),
                  key: 'by',
                  render: (_, p) => (
                    <span className="text-xs">
                      <VerificationChip value={p.verification} /> {p.verifiedBy?.fullName} · {fmtDateTime(p.verifiedAt)}
                      {p.verificationNote && <span className="block text-slate-500">{p.verificationNote}</span>}
                    </span>
                  ),
                },
          ]}
        />
      )}
      <Modal open={!!mismatch} title={t('col.notFound')} okText={t('col.reportMismatch')} okButtonProps={{ danger: true }} onCancel={() => setMismatch(null)} onOk={() => form.submit()} confirmLoading={verify.isPending} destroyOnHidden>
        <p className="text-sm text-slate-600">{t('col.mismatchHelp')}</p>
        <Form form={form} layout="vertical" onFinish={(v) => mismatch && verify.mutate({ id: mismatch.id, outcome: 'MISMATCH', note: v.note })}>
          <Form.Item name="note" label={t('c.reason')} rules={[{ required: true, min: 3 }]}>
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function CashHandovers() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const invalidate = useInvalidate();
  const [state, setState] = useState<'awaiting' | 'received'>('awaiting');
  const [page, setPage] = useState(1);
  const [receiving, setReceiving] = useState<Handover | null>(null);
  const [form] = Form.useForm();
  const q = useQuery({
    queryKey: ['collections', 'handovers', state, page],
    queryFn: () => get<Paged<Handover>>('/collections/handovers', { state, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const receive = useMutation({
    mutationFn: (v: { id: string; receivedCash: number; note?: string }) => post<{ difference: number }>(`/collections/handovers/${v.id}/receive`, v),
    onSuccess: (d) => {
      if (d.difference) message.warning(`${t('col.difference')}: ${fmtMoney(d.difference)}`);
      else message.success(t('col.received'));
      setReceiving(null);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const diff = (h: Handover) => (h.receivedCash ?? 0) - (h.expectedCash ?? 0);

  return (
    <div>
      <p className="mt-0 text-sm text-slate-500">{t('col.cashHelp')}</p>
      <Segmented className="mb-3" value={state} onChange={(v) => { setState(v as typeof state); setPage(1); }} options={[{ value: 'awaiting', label: t('col.awaiting') }, { value: 'received', label: t('col.receivedTab') }]} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Table<Handover>
          rowKey="id"
          loading={q.isFetching && !q.data}
          dataSource={q.data?.items}
          scroll={{ x: 900 }}
          pagination={{ current: page, pageSize: 20, total: q.data?.total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: t('c.cashier'), key: 'c', render: (_, h) => <span className="flex items-center gap-1.5 font-medium">{h.cashier.fullName} <DemoTag show={h.isDemo} /></span> },
            { title: t('col.shift'), key: 's', render: (_, h) => <span className="tabular text-xs">{fmtDateTime(h.openedAt)} — {fmtDateTime(h.closedAt)}</span> },
            { title: t('col.expected'), key: 'e', align: 'right', render: (_, h) => <span className="tabular font-semibold">{fmtMoney(h.expectedCash ?? 0)}</span> },
            {
              title: t('col.declared'),
              key: 'dc',
              align: 'right',
              render: (_, h) => <span className={`tabular ${h.declaredCash !== h.expectedCash ? 'font-semibold text-red-600' : ''}`}>{h.declaredCash == null ? '—' : fmtMoney(h.declaredCash)}</span>,
            },
            state === 'awaiting'
              ? {
                  title: '',
                  key: 'act',
                  render: (_, h) => (
                    <Button size="small" type="primary" icon={<Banknote size={14} />} onClick={() => { form.setFieldsValue({ receivedCash: h.declaredCash ?? h.expectedCash, note: undefined }); setReceiving(h); }}>
                      {t('col.receive')}
                    </Button>
                  ),
                }
              : {
                  title: t('col.receivedCol'),
                  key: 'r',
                  render: (_, h) => (
                    <span className="text-xs">
                      <span className="tabular font-semibold">{fmtMoney(h.receivedCash ?? 0)}</span>{' '}
                      {diff(h) === 0 ? <Chip tone="ok">{t('col.match')}</Chip> : <Chip tone="bad">{`${t('col.difference')} ${fmtMoney(diff(h))}`}</Chip>}
                      <span className="block text-slate-500">{h.receivedBy?.fullName} · {fmtDateTime(h.receivedAt)}</span>
                    </span>
                  ),
                },
          ]}
        />
      )}
      <Modal open={!!receiving} title={t('col.receive')} okText={t('col.confirmReceive')} onCancel={() => setReceiving(null)} onOk={() => form.submit()} confirmLoading={receive.isPending} destroyOnHidden>
        {receiving && (
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div>{receiving.cashier.fullName}</div>
            <div className="mt-1 flex justify-between"><span className="text-slate-500">{t('col.expected')}</span><span className="tabular font-semibold">{fmtMoney(receiving.expectedCash ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{t('col.declared')}</span><span className="tabular">{fmtMoney(receiving.declaredCash ?? 0)}</span></div>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={(v) => receiving && receive.mutate({ id: receiving.id, receivedCash: v.receivedCash, note: v.note || undefined })}>
          <Form.Item name="receivedCash" label={t('col.counted')} extra={t('col.countedHelp')} rules={[{ required: true }]}>
            <InputNumber min={0} step={1000} className="!w-full" size="large" suffix="UZS" />
          </Form.Item>
          <Form.Item name="note" label={t('c.note')}>
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function CollectionsPage() {
  const { t } = useI18n();
  const s = useQuery({ queryKey: ['collections', 'summary'], queryFn: () => get<Summary>('/collections/summary'), refetchInterval: 60_000 });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.collections')} subtitle={t('col.subtitle')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={t('col.kpiClickPending')} value={s.data?.clickPending.count ?? '—'} icon={<Smartphone size={17} />} tone="warn" hint={fmtMoney(s.data?.clickPending.amount ?? 0)} />
        <KpiCard label={t('col.kpiMismatch')} value={s.data?.clickMismatch ?? '—'} icon={<CircleAlert size={17} />} tone="bad" hint={t('col.kpiMismatchHint')} />
        <KpiCard label={t('col.kpiAwaiting')} value={s.data?.handoversAwaiting.count ?? '—'} icon={<BadgeCheck size={17} />} tone="info" hint={fmtMoney(s.data?.handoversAwaiting.amount ?? 0)} />
      </div>
      <Card>
        <Tabs items={[
          { key: 'click', label: t('col.tabClick'), children: <ClickReconciliation /> },
          { key: 'cash', label: t('col.tabCash'), children: <CashHandovers /> },
        ]} />
      </Card>
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert as AntAlert, App, Button, Form, Input, InputNumber, Modal, Segmented, Select, Skeleton, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, LockOpen, Lock, Printer, Search, Smartphone, Receipt as ReceiptIcon } from 'lucide-react';
import { errorMessage, get, newIdempotencyKey, post, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtMoney, fmtTime } from '../lib/format';
import type { Payment, Space } from '../lib/types';
import { PageHeader, Card, Field, EmptyState, SimulatedNotice } from '../components/common';
import { PaymentStateChip, PaymentStatusChip, SpaceStatusChip } from '../components/Status';
import { PaymentsTable } from '../components/PaymentsTable';
import { Receipt, type ReceiptData } from '../components/Receipt';
import { KpiCard } from '../components/KpiCard';

interface Summary {
  shift: { id: string; openedAt: string; totalAmount: number; cashAmount: number; clickAmount: number; count: number } | null;
  cashToday: { amount: number; count: number };
  todayByStatus: { status: string; count: number; amount: number }[];
  recent: Payment[];
  assignedRows: { id: string; name: string; code: string }[];
}

export default function CashierPage() {
  const { t } = useI18n();
  const { me } = useAuth();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [rowId, setRowId] = useState<string | undefined>();
  const [onlyUnpaid, setOnlyUnpaid] = useState<'all' | 'unpaid'>('unpaid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ paymentId: string; r: ReceiptData } | null>(null);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [method, setMethod] = useState<'CASH' | 'CLICK'>('CASH');
  const [clickRef, setClickRef] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeForm] = Form.useForm();
  const payPanel = useRef<HTMLDivElement>(null);
  /** On a phone the payment panel sits below the grid: bring it into view once a space is picked. */
  const selectSpace = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => payPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const summary = useQuery({ queryKey: ['cashier', 'summary'], queryFn: () => get<Summary>('/cashier/summary'), refetchInterval: 30_000 });
  const rows = useQuery({ queryKey: ['rows'], queryFn: () => get<{ id: string; name: string }[]>('/rows') });
  const spaces = useQuery({ queryKey: ['spaces', 'cashier'], queryFn: () => get<Paged<Space>>('/spaces', { pageSize: 2000 }), refetchInterval: 30_000 });
  const shifts = useQuery({ queryKey: ['cashier', 'shifts'], queryFn: () => get<any[]>('/cashier/shifts') });

  const assignedIds = new Set(summary.data?.assignedRows.map((r) => r.id));
  const list = useMemo(() => {
    let l = spaces.data?.items ?? [];
    if (rowId) l = l.filter((s) => s.row.id === rowId);
    if (search) l = l.filter((s) => s.number.toLowerCase().includes(search.toLowerCase()));
    if (onlyUnpaid === 'unpaid') l = l.filter((s) => s.paymentState === 'UNPAID');
    // Assigned rows first, unpaid occupied first.
    return [...l].sort((a, b) => Number(assignedIds.has(b.row.id)) - Number(assignedIds.has(a.row.id)) || Number(b.status === 'OCCUPIED_UNPAID') - Number(a.status === 'OCCUPIED_UNPAID'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces.data, rowId, search, onlyUnpaid, summary.data]);
  const selected = spaces.data?.items.find((s) => s.id === selectedId) ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cashier'] });
    qc.invalidateQueries({ queryKey: ['spaces'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
  };
  const shiftMut = useMutation({
    mutationFn: (v: { action: 'open' | 'close'; declaredCash?: number; note?: string }) =>
      post<any>(`/cashier/shift/${v.action}`, v.action === 'close' ? { declaredCash: v.declaredCash, note: v.note } : {}),
    onSuccess: (d, v) => {
      if (v.action === 'close') {
        setCloseOpen(false);
        modal.success({ title: t('cash.shiftClosed'), content: `${t('pm.CASH')}: ${fmtMoney(d.cashAmount)} · ${t('pm.CLICK')}: ${fmtMoney(d.clickAmount)}. ${t('cash.handOver')}` });
      } else message.success('Smena ochildi');
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const pay = useMutation({
    mutationFn: (s: Space) =>
      post<{ payment: Payment; receipt: ReceiptData }>('/payments/collect', {
        spaceId: s.id,
        amount: s.tariff.amount,
        method,
        externalRef: method === 'CLICK' ? clickRef : undefined,
        idempotencyKey: idemKey,
      }),
    onSuccess: (d) => {
      setIdemKey(newIdempotencyKey());
      setClickRef('');
      setReceipt({ paymentId: d.payment.id, r: d.receipt });
      message.success(t('cash.success'));
      invalidate();
    },
    onError: (e) => {
      message.error(errorMessage(e));
      setIdemKey(newIdempotencyKey());
    },
  });

  const confirmPay = (s: Space) =>
    modal.confirm({
      title: method === 'CASH' ? t('cash.confirm') : t('cash.confirmClick'),
      icon: method === 'CASH' ? <Banknote className="mr-2 text-green-600" size={22} /> : <Smartphone className="mr-2 text-blue-600" size={22} />,
      content: (
        <div className="mt-2 text-sm">
          <Field label={t('c.space')}>{s.number} · {s.row.name}</Field>
          <Field label={t('c.tariff')}>{s.tariff.name}</Field>
          {method === 'CLICK' && <Field label={t('col.clickRef')}><span className="font-mono">{clickRef}</span></Field>}
          <div className="mt-3 rounded-lg bg-green-50 p-3 text-center">
            <div className="text-xs text-green-700">Qabul qilinadigan summa</div>
            <div className="tabular text-2xl font-bold text-green-800">{fmtMoney(s.tariff.amount)}</div>
          </div>
        </div>
      ),
      okText: method === 'CASH' ? 'Naqd qabul qilindi' : t('cash.clickReceived'),
      cancelText: t('c.cancel'),
      onOk: () => pay.mutateAsync(s),
    });

  const shift = summary.data?.shift;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('cash.title')}
        subtitle={<span>{me?.user.fullName} · Biriktirilgan qatorlar: {summary.data?.assignedRows.map((r) => r.name).join(', ') || '—'}</span>}
        extra={
          shift ? (
            <Button icon={<Lock size={15} />} onClick={() => setCloseOpen(true)}>
              {t('cash.closeShift')}
            </Button>
          ) : (
            <Button type="primary" icon={<LockOpen size={15} />} loading={shiftMut.isPending} onClick={() => shiftMut.mutate({ action: 'open' })}>
              {t('cash.openShift')}
            </Button>
          )
        }
      />

      {summary.isLoading ? (
        <Skeleton active />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t('cash.cashToday')} value={<span className="text-[22px]">{fmtMoney(summary.data?.cashToday.amount)}</span>} icon={<Banknote size={17} />} tone="ok" hint={`${summary.data?.cashToday.count ?? 0} ta to'lov`} />
          <KpiCard label={t('cash.shiftTotal')} value={<span className="text-[22px]">{fmtMoney(shift?.totalAmount ?? 0)}</span>} icon={<ReceiptIcon size={17} />} tone="info" hint={shift ? `${t('pm.CASH')} ${fmtMoney(shift.cashAmount)} · ${t('pm.CLICK')} ${fmtMoney(shift.clickAmount)}` : 'Smena yopiq'} />
          <KpiCard label="Smena holati" value={shift ? 'Ochiq' : 'Yopiq'} icon={shift ? <LockOpen size={17} /> : <Lock size={17} />} tone={shift ? 'ok' : 'warn'} hint={shift ? fmtDateTime(shift.openedAt) : "To'lov uchun oching"} />
          <KpiCard label="To'lanmagan band joylar" value={spaces.data?.items.filter((s) => s.status === 'OCCUPIED_UNPAID').length ?? 0} icon={<Search size={17} />} tone="bad" hint="Barcha qatorlar bo'yicha" />
        </div>
      )}

      {!shift && !summary.isLoading && <AntAlert type="warning" showIcon message={t('cash.noShift')} />}

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <Card title={t('cash.selectSpace')} bodyClass="p-0">
          <div className="flex flex-wrap gap-2 border-0 border-b border-solid border-slate-100 p-3">
            <Input allowClear autoFocus prefix={<Search size={15} className="text-slate-400" />} placeholder="Joy raqami: A-12" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-52" size="large" />
            <Select allowClear placeholder={t('c.row')} value={rowId} onChange={setRowId} className="w-36" size="large" options={rows.data?.map((r) => ({ value: r.id, label: `${r.name}${assignedIds.has(r.id) ? ' ★' : ''}` }))} />
            <Segmented size="large" value={onlyUnpaid} onChange={(v) => setOnlyUnpaid(v as 'all' | 'unpaid')} options={[{ value: 'unpaid', label: "To'lanmagan" }, { value: 'all', label: t('c.all') }]} />
          </div>
          <div className="grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {spaces.isLoading && <Skeleton active />}
            {!spaces.isLoading && !list.length && <div className="col-span-full"><EmptyState /></div>}
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSpace(s.id)}
                className={`cursor-pointer rounded-lg border border-solid p-2.5 text-left transition-colors ${selectedId === s.id ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold">{s.number}</span>
                  {assignedIds.has(s.row.id) && <span className="text-[10px] text-amber-500">★</span>}
                </div>
                <div className="mt-1"><SpaceStatusChip status={s.status} /></div>
                <div className="tabular mt-1 text-xs text-slate-500">{fmtMoney(s.tariff.amount)}</div>
              </button>
            ))}
          </div>
        </Card>

        <div ref={payPanel} className="flex scroll-mt-20 flex-col gap-5">
          <Card title="To'lov">
            {!selected ? (
              <EmptyState text="Chap tomondan joyni tanlang" />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{selected.number}</span>
                  <PaymentStateChip state={selected.paymentState} />
                </div>
                <div>
                  <Field label={t('c.row')}>{selected.row.name}</Field>
                  <Field label={t('c.size')}>{selected.widthMeters} m</Field>
                  <Field label={t('c.status')}><SpaceStatusChip status={selected.status} /></Field>
                  {selected.validPayment && <Field label={t('c.validUntil')}>{fmtDateTime(selected.validPayment.validUntil)}</Field>}
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <div className="text-xs text-slate-500">{t('c.tariff')} · {selected.tariff.name}</div>
                  <div className="tabular text-3xl font-bold text-slate-900">{fmtMoney(selected.tariff.amount)}</div>
                </div>
                {selected.paymentState !== 'UNPAID' ? (
                  <AntAlert type="success" showIcon message={selected.paymentState === 'PAID' ? t('cash.alreadyPaid') : 'Bu joy imtiyozli'} />
                ) : (
                  <>
                    <Segmented
                      block
                      size="large"
                      value={method}
                      onChange={(v) => setMethod(v as 'CASH' | 'CLICK')}
                      options={[
                        { value: 'CASH', label: <span className="inline-flex items-center gap-1.5"><Banknote size={15} /> {t('pm.CASH')}</span> },
                        { value: 'CLICK', label: <span className="inline-flex items-center gap-1.5"><Smartphone size={15} /> {t('pm.CLICK')}</span> },
                      ]}
                    />
                    {method === 'CLICK' && (
                      <div>
                        <Input size="large" inputMode="numeric" value={clickRef} onChange={(e) => setClickRef(e.target.value)} placeholder={t('cash.clickRefPlaceholder')} className="font-mono" />
                        <div className="mt-1 text-[11px] text-slate-500">{t('cash.clickHelp')}</div>
                      </div>
                    )}
                    <Button
                      type="primary"
                      size="large"
                      block
                      icon={<CheckCircle2 size={18} />}
                      disabled={!shift || (method === 'CLICK' && clickRef.replace(/\D/g, '').length < 4)}
                      loading={pay.isPending}
                      onClick={() => confirmPay(selected)}
                      className="!h-12 !bg-green-600 hover:!bg-green-700"
                    >
                      {method === 'CASH' ? t('cash.confirm') : t('cash.confirmClick')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
          <Card title="So'nggi tranzaksiyalarim">
            {summary.data?.recent.slice(0, 5).map((p) => (
              <Link key={p.id} to={`/payments/${p.id}`} className="flex justify-between border-0 border-b border-solid border-slate-50 py-2 text-sm text-inherit no-underline last:border-0">
                <span><span className="font-semibold">{p.space.number}</span> <span className="text-xs text-slate-500">{fmtTime(p.paidAt ?? p.createdAt)}</span></span>
                <span className="flex items-center gap-2">
                  {p.status !== 'SUCCESS' && <PaymentStatusChip status={p.status} />}
                  <span className={`tabular ${p.status === 'CANCELLED' ? 'text-slate-400 line-through' : ''}`}>{fmtMoney(p.amount)}</span>
                </span>
              </Link>
            ))}
            {!summary.data?.recent.length && <EmptyState text="Bugun hali to'lov yo'q" />}
          </Card>
        </div>
      </div>

      <Card title={t('cash.history')}>
        <PaymentsTable pageSize={10} compact />
      </Card>

      <Card title="Smenalar tarixi">
        <Table rowKey="id" size="small" loading={shifts.isLoading} dataSource={shifts.data} pagination={{ pageSize: 7 }}
          columns={[
            { title: 'Ochilgan', key: 'o', render: (_, s) => fmtDateTime(s.openedAt) },
            { title: 'Yopilgan', key: 'c', render: (_, s) => (s.closedAt ? fmtDateTime(s.closedAt) : <span className="font-medium text-green-700">Ochiq</span>) },
            { title: "To'lovlar", dataIndex: 'count', align: 'right' },
            { title: 'Jami', key: 'a', align: 'right', render: (_, s) => <span className="tabular font-semibold">{fmtMoney(s.totalAmount)}</span> },
            { title: t('cash.handoverCol'), key: 'h', render: (_, s) => (s.status === 'OPEN' ? '—' : s.receivedAt ? <span className="text-xs text-green-700">{t('col.received')}: {fmtMoney(s.receivedCash)}</span> : <span className="text-xs text-amber-700">{t('col.awaiting')}: {fmtMoney(s.declaredCash ?? 0)}</span>) },
          ]} />
      </Card>

      <SimulatedNotice>Kassir to'lovni bekor qila olmaydi va imtiyoz bera olmaydi. Xato kiritilgan to'lov bo'yicha rahbarga murojaat qiling.</SimulatedNotice>

      <Modal open={closeOpen} title={t('cash.closeShift')} okText={t('cash.closeShift')} onCancel={() => setCloseOpen(false)} onOk={() => closeForm.submit()} confirmLoading={shiftMut.isPending} destroyOnHidden>
        {shift && (
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{t('cash.expectedCash')}</span><span className="tabular font-semibold">{fmtMoney(shift.cashAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{t('pm.CLICK')}</span><span className="tabular">{fmtMoney(shift.clickAmount)}</span></div>
          </div>
        )}
        <Form form={closeForm} layout="vertical" preserve={false} initialValues={{ declaredCash: shift?.cashAmount }} onFinish={(v) => shiftMut.mutate({ action: 'close', declaredCash: v.declaredCash, note: v.note || undefined })}>
          <Form.Item name="declaredCash" label={t('cash.declaredCash')} extra={t('cash.declaredHelp')} rules={[{ required: true }]}>
            <InputNumber min={0} step={1000} precision={0} className="!w-full" size="large" suffix="UZS" />
          </Form.Item>
          <Form.Item name="note" label={t('c.note')}>
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!receipt} onCancel={() => setReceipt(null)} footer={null} width={380} title={<span className="flex items-center gap-2"><CheckCircle2 size={18} className="text-green-600" /> {t('cash.success')}</span>}>
        {receipt && (
          <div className="flex flex-col items-center gap-3">
            <Receipt r={receipt.r} />
            <div className="flex gap-2">
              <Link to={`/receipts/${receipt.paymentId}/print`} target="_blank"><Button type="primary" icon={<Printer size={15} />}>Chop etish</Button></Link>
              <Button onClick={() => setReceipt(null)}>{t('c.close')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

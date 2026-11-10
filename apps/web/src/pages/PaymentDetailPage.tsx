import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { App, Button, Form, Input, Modal } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { errorMessage, get, post } from '../lib/api';
import { useI18n, tx } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtMoney } from '../lib/format';
import type { Payment } from '../lib/types';
import { PageHeader, Card, Field, QueryView, SimulatedNotice } from '../components/common';
import { PaymentStatusChip, MethodLabel, DemoTag, VerificationChip } from '../components/Status';
import { Receipt, type ReceiptData } from '../components/Receipt';

type Detail = Omit<Payment, 'receipt'> & {
  receipt: ReceiptData | null;
  cycle: { name: string; type: string; isDemo: boolean } | null;
  cancellation: { reason: string; createdAt: string; cancelledBy: { fullName: string } } | null;
  verifiedBy: { fullName: string } | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  auditTrail: { id: string; action: string; summary: string | null; createdAt: string; actor: { fullName: string } | null }[];
};

export default function PaymentDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [form] = Form.useForm();
  const q = useQuery({ queryKey: ['payment', id], queryFn: () => get<Detail>(`/payments/${id}`) });
  const cancel = useMutation({
    mutationFn: (reason: string) => post(`/payments/${id}/cancel`, { reason }),
    onSuccess: () => {
      message.success(tx("To'lov bekor qilindi. Asl yozuv saqlanib qoldi."));
      setCancelOpen(false);
      qc.invalidateQueries();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <QueryView q={q} rows={10}>
      {(p) => (
        <div className="flex flex-col gap-5">
          <div>
            <Link to="/payments" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft size={14} /> {t('nav.payments')}</Link>
            <PageHeader
              title={<span className="flex items-center gap-3">{fmtMoney(p.amount)} <PaymentStatusChip status={p.status} /> <DemoTag show={p.isDemo} /></span>}
              subtitle={<span className="font-mono">{p.receipt?.receiptNumber ?? p.id}</span>}
              extra={
                <>
                  {p.receipt && (
                    <Link to={`/receipts/${p.id}/print`} target="_blank">
                      <Button icon={<Printer size={15} />}>{tx("Chop etish")}</Button>
                    </Link>
                  )}
                  {can('CHIEF') && ['SUCCESS', 'PENDING', 'PENDING_SYNC'].includes(p.status) && (
                    <Button danger icon={<Ban size={15} />} onClick={() => setCancelOpen(true)}>
                      {t('c.cancel')}
                    </Button>
                  )}
                </>
              }
            />
          </div>
          {p.isSimulated && <SimulatedNotice>{t('pay.legacySimulated')}</SimulatedNotice>}
          {p.verification === 'MISMATCH' && <SimulatedNotice>{t('pay.mismatchNotice')}</SimulatedNotice>}
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="flex flex-col gap-5">
              <Card title={tx("To'lov ma'lumotlari")}>
                <Field label={tx("To'lov ID")}><span className="font-mono text-xs">{p.id}</span></Field>
                <Field label={t('c.space')}><Link to={`/spaces/${p.space.id}`}>{p.space.number}</Link> · {p.space.row.name}</Field>
                <Field label={t('c.method')}><MethodLabel method={p.method} simulated={p.isSimulated} /></Field>
                {p.externalRef && <Field label={t('col.clickRef')}><span className="font-mono">{p.externalRef}</span></Field>}
                {p.verification !== 'NOT_REQUIRED' && (
                  <Field label={t('pv.title')}>
                    <VerificationChip value={p.verification} />
                    {p.verifiedBy && <span className="ml-2 text-xs text-slate-500">{p.verifiedBy.fullName} · {fmtDateTime(p.verifiedAt)}</span>}
                    {p.verificationNote && <span className="block text-xs text-slate-500">{p.verificationNote}</span>}
                  </Field>
                )}
                <Field label={t('c.cashier')}>{p.cashier?.fullName ?? '—'}</Field>
                <Field label={tx("Yaratilgan")}>{fmtDateTime(p.createdAt)}</Field>
                <Field label={tx("To'langan")}>{fmtDateTime(p.paidAt)}</Field>
                <Field label={tx("Amal qilish oralig'i")}>{p.validFrom ? `${fmtDateTime(p.validFrom)} — ${fmtDateTime(p.validUntil)}` : '—'}</Field>
                <Field label={tx("To'lov sikli")}>{p.cycle ? `${p.cycle.name}${p.cycle.isDemo ? ` (${t('c.demo')})` : ''}` : '—'}</Field>
                {p.note && <Field label={t('c.note')}>{p.note}</Field>}
              </Card>
              {p.cancellation && (
                <Card title={tx("Bekor qilish")}>
                  <Field label={t('c.reason')}>{p.cancellation.reason}</Field>
                  <Field label={tx("Bekor qilgan")}>{p.cancellation.cancelledBy.fullName}</Field>
                  <Field label={t('c.time')}>{fmtDateTime(p.cancellation.createdAt)}</Field>
                </Card>
              )}
              {p.auditTrail.length > 0 && (
                <Card title={tx("Audit izi")}>
                  <div className="flex flex-col">
                    {p.auditTrail.map((a) => (
                      <div key={a.id} className="flex gap-3 border-0 border-b border-solid border-slate-50 py-2 text-sm last:border-0">
                        <span className="w-32 shrink-0 text-xs text-slate-500">{fmtDateTime(a.createdAt)}</span>
                        <span>
                          <span className="font-mono text-xs font-semibold">{a.action}</span> · {a.actor?.fullName ?? tx("Tizim")}
                          {a.summary && <span className="block text-xs text-slate-500">{a.summary}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
            <div>
              {p.receipt ? <Receipt r={p.receipt} cancelled={p.status === 'CANCELLED'} /> : <Card><div className="py-8 text-center text-sm text-slate-400">{tx("Chek faqat tasdiqlangan to'lov uchun chiqariladi")}</div></Card>}
            </div>
          </div>
          <Modal open={cancelOpen} title={tx("To'lovni bekor qilish")} okText={tx("Bekor qilishni tasdiqlash")} okButtonProps={{ danger: true }} onCancel={() => setCancelOpen(false)} onOk={() => form.submit()} confirmLoading={cancel.isPending} destroyOnHidden>
            <p className="text-sm text-slate-600">{tx("Asl tranzaksiya o'chirilmaydi — holati \"Bekor qilingan\" ga o'zgaradi va audit jurnaliga yoziladi. Bu summa tushumdan chiqariladi.")}</p>
            <Form form={form} layout="vertical" onFinish={(v) => cancel.mutate(v.reason)}>
              <Form.Item name="reason" label={t('c.reason')} rules={[{ required: true, min: 5, message: tx("Kamida 5 belgi") }]}>
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
            </Form>
          </Modal>
        </div>
      )}
    </QueryView>
  );
}

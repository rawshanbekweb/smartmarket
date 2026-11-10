import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Form, Input, Result, Segmented, Skeleton } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, BadgePercent, Store, MessageSquareWarning, ReceiptText } from 'lucide-react';
import { errorMessage, get, post } from '../lib/api';
import { useI18n, tx } from '../lib/i18n';
import { fmtDateTime, fmtMoney } from '../lib/format';

interface SpaceInfo {
  market: { name: string; isDemo: boolean };
  space: { number: string; row: string; widthMeters: string };
  tariff: { amount: number };
  paymentState: 'PAID' | 'UNPAID' | 'EXEMPTED';
  payment: { paidAt: string; validUntil: string; method: string; amount: number; receiptNumberMasked: string | null } | null;
  exemptionUntil: string | null;
  demoMode: boolean;
}

interface ReceiptInfo {
  receiptNumber: string;
  issuedAt: string;
  spaceNumber: string;
  amount: number;
  method: string;
  validUntil: string | null;
  status: string;
  demo: boolean;
}

const L = {
  uz: {
    paid: "To'langan", unpaid: "To'lov topilmadi", exempt: "Imtiyoz amalda", until: "Amal qiladi", receipt: "Chek", complaint: "Naqd to'ladim, lekin chek olmadim",
    desc: "Qisqacha izoh (ixtiyoriy)", phone: "Telefon (ixtiyoriy)", send: "Shikoyat yuborish", sent: "Shikoyatingiz qabul qilindi", ref: "Murojaat raqami",
    sentHint: "Bozor ma'muriyati xabardor qilindi va tekshiradi.", tariff: "Tarif", notFound: "QR kod yaroqsiz yoki joy topilmadi", receiptOk: "Chek haqiqiy", receiptCancelled: "Bu chek bekor qilingan",
  },
  ru: {
    paid: 'Оплачено', unpaid: 'Оплата не найдена', exempt: 'Действует льгота', until: 'Действует до', receipt: 'Чек', complaint: 'Оплатил наличными, но не получил чек',
    desc: 'Краткое описание (необязательно)', phone: 'Телефон (необязательно)', send: 'Отправить жалобу', sent: 'Ваша жалоба принята', ref: 'Номер обращения',
    sentHint: 'Администрация рынка уведомлена и проверит.', tariff: 'Тариф', notFound: 'QR-код недействителен или место не найдено', receiptOk: 'Чек действителен', receiptCancelled: 'Этот чек отменён',
  },
};

function Shell({ children, demo }: { children: React.ReactNode; demo?: boolean }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="min-h-screen bg-slate-100">
      {demo && <div className="bg-amber-500 px-3 py-1.5 text-center text-[11.5px] font-semibold text-amber-950">{t('demo.banner')}</div>}
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold"><Store size={20} className="text-emerald-600" /> SMART MARKET</span>
          <Segmented size="small" value={lang} onChange={(v) => setLang(v as 'uz' | 'ru')} options={[{ label: 'UZ', value: 'uz' }, { label: 'RU', value: 'ru' }]} />
        </div>
        {children}
      </div>
    </div>
  );
}

function ReceiptVerify({ token }: { token: string }) {
  const { lang } = useI18n();
  const l = L[lang];
  const q = useQuery({ queryKey: ['public-receipt', token], queryFn: () => get<ReceiptInfo>(`/public/receipts/${token}`), retry: false });
  return (
    <Shell demo={q.data?.demo}>
      {q.isLoading && <Skeleton active />}
      {q.isError && <Result status="404" title={l.notFound} />}
      {q.data && (
        <div className="sm-card p-5">
          <div className="flex items-center gap-2 text-lg font-semibold">
            {q.data.status === 'CANCELLED' ? <XCircle className="text-red-600" /> : <CheckCircle2 className="text-green-600" />}
            {q.data.status === 'CANCELLED' ? l.receiptCancelled : l.receiptOk}
          </div>
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{l.receipt}</span><span className="font-mono">{q.data.receiptNumber}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{tx("Joy")}</span><span className="font-semibold">{q.data.spaceNumber}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{tx("Summa")}</span><span>{fmtMoney(q.data.amount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{tx("Sana")}</span><span>{fmtDateTime(q.data.issuedAt)}</span></div>
            {q.data.validUntil && <div className="flex justify-between"><span className="text-slate-500">{l.until}</span><span>{fmtDateTime(q.data.validUntil)}</span></div>}
          </div>
        </div>
      )}
    </Shell>
  );
}

function SpacePage({ token }: { token: string }) {
  const { lang } = useI18n();
  const l = L[lang];
  const [form] = Form.useForm();
  const [ref, setRef] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['public-space', token], queryFn: () => get<SpaceInfo>(`/public/spaces/${token}`), retry: false });
  const send = useMutation({
    mutationFn: (v: { description?: string; contactPhone?: string }) => post<{ reference: string }>(`/public/spaces/${token}/complaints`, { type: 'CASH_PAID_NO_RECEIPT', ...v }),
    onSuccess: (d) => setRef(d.reference),
  });
  const d = q.data;
  return (
    <Shell demo={d?.demoMode || d?.market.isDemo}>
      {q.isLoading && <Skeleton active paragraph={{ rows: 6 }} />}
      {q.isError && <Result status="404" title={l.notFound} />}
      {d && (
        <>
          <div className="sm-card overflow-hidden">
            <div className={`p-5 text-white ${d.paymentState === 'PAID' ? 'bg-green-600' : d.paymentState === 'EXEMPTED' ? 'bg-violet-600' : 'bg-red-600'}`}>
              <div className="text-sm opacity-90">{d.market.name}</div>
              <div className="mt-1 text-4xl font-bold">{d.space.number}</div>
              <div className="text-sm opacity-90">{d.space.row} · {d.space.widthMeters} m</div>
              <div className="mt-4 flex items-center gap-2 text-lg font-semibold">
                {d.paymentState === 'PAID' ? <CheckCircle2 /> : d.paymentState === 'EXEMPTED' ? <BadgePercent /> : <XCircle />}
                {d.paymentState === 'PAID' ? l.paid : d.paymentState === 'EXEMPTED' ? l.exempt : l.unpaid}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 p-5 text-sm">
              {d.payment && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">{l.until}</span><span className="font-semibold">{fmtDateTime(d.payment.validUntil)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{tx("Summa")}</span><span>{fmtMoney(d.payment.amount)}</span></div>
                  {d.payment.receiptNumberMasked && <div className="flex justify-between"><span className="text-slate-500">{l.receipt}</span><span className="font-mono">{d.payment.receiptNumberMasked}</span></div>}
                </>
              )}
              {d.exemptionUntil && <div className="flex justify-between"><span className="text-slate-500">{l.until}</span><span>{fmtDateTime(d.exemptionUntil)}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">{l.tariff}</span><span>{fmtMoney(d.tariff.amount)}</span></div>
            </div>
          </div>

          <div className="sm-card p-5">
            {ref ? (
              <Result status="success" title={l.sent} subTitle={<>{l.sentHint}<br />{l.ref}: <b className="font-mono">{ref}</b></>} />
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2 font-semibold"><MessageSquareWarning size={18} className="text-amber-600" /> {l.complaint}</div>
                {send.isError && <Alert type="error" showIcon className="mb-3" message={errorMessage(send.error)} />}
                <Form form={form} layout="vertical" onFinish={(v) => send.mutate(v)}>
                  <Form.Item name="description" label={l.desc}><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
                  <Form.Item name="contactPhone" label={l.phone} rules={[{ pattern: /^\+?[0-9 ()-]{7,20}$/, message: '+998 90 123 45 67' }]}><Input inputMode="tel" placeholder="+998" /></Form.Item>
                  <Form.Item name="website" hidden><Input tabIndex={-1} autoComplete="off" /></Form.Item>
                  <Button type="primary" htmlType="submit" block size="large" loading={send.isPending} icon={<ReceiptText size={16} />}>{l.send}</Button>
                </Form>
              </>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

export default function PublicQrPage() {
  const { publicToken, receiptToken } = useParams();
  if (receiptToken) return <ReceiptVerify token={receiptToken} />;
  return <SpacePage token={publicToken!} />;
}

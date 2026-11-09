import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { App, Button, Form, Input, Modal, Steps } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, CheckCircle2, XCircle, ArrowUpCircle, FlaskConical, MessageSquarePlus } from 'lucide-react';
import { errorMessage, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import type { Alert } from '../lib/types';
import { PageHeader, Card, Field, QueryView, SimulatedNotice } from '../components/common';
import { AlertStatusChip, SeverityChip, DemoTag, ComplaintStatusChip } from '../components/Status';

type Detail = Alert & {
  complaint: { id: string; status: string; description: string | null; contactPhone: string | null } | null;
  escalations: { level: string; createdAt: string }[];
  events: { id: string; action: string; note: string | null; createdAt: string; actor: { fullName: string } | null }[];
};

const ACTIVE = ['OPEN', 'ADMIN_NOTIFIED', 'INVESTIGATING', 'ESCALATED'];

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className="font-semibold text-red-600">muddat o'tdi — navbatdagi tekshiruvda</span>;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return <span className="tabular font-semibold">{m}:{String(s).padStart(2, '0')}</span>;
}

export default function AlertDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { can, me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | 'resolve' | 'reject' | 'escalate' | 'note'>(null);
  const [form] = Form.useForm();
  const q = useQuery({ queryKey: ['alert', id], queryFn: () => get<Detail>(`/alerts/${id}`), refetchInterval: 15_000 });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(path, body ?? {}),
    onSuccess: () => {
      message.success('Saqlandi');
      setDialog(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['alert'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const dialogs = {
    resolve: { title: 'Tekshiruv natijasi — hal qilish', ok: 'Hal qilindi', path: 'resolve' },
    reject: { title: "Noto'g'ri aniqlash — rad etish", ok: 'Rad etish', path: 'reject' },
    escalate: { title: 'Rahbarga eskalatsiya', ok: 'Eskalatsiya', path: 'escalate' },
    note: { title: "Izoh qo'shish", ok: t('c.save'), path: 'note' },
  } as const;

  return (
    <QueryView q={q} rows={10}>
      {(a) => {
        const active = ACTIVE.includes(a.status);
        const stepIdx = a.status === 'OPEN' ? 0 : a.status === 'ADMIN_NOTIFIED' || a.status === 'INVESTIGATING' ? 1 : a.status === 'ESCALATED' ? 2 : 3;
        return (
          <div className="flex flex-col gap-5">
            <div>
              <Link to="/alerts" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft size={14} /> {t('nav.alerts')}</Link>
              <PageHeader
                title={<span className="flex flex-wrap items-center gap-3">{t(`at.${a.type}`)} <AlertStatusChip status={a.status} /> <SeverityChip severity={a.severity} /> <DemoTag show={a.isDemo} /></span>}
                subtitle={a.title}
                extra={
                  active && (
                    <>
                      {a.status !== 'INVESTIGATING' && <Button icon={<Search size={15} />} onClick={() => act.mutate({ path: `/alerts/${a.id}/investigate` })}>Tekshiruvni boshlash</Button>}
                      <Button icon={<MessageSquarePlus size={15} />} onClick={() => setDialog('note')}>Izoh</Button>
                      <Button type="primary" icon={<CheckCircle2 size={15} />} onClick={() => setDialog('resolve')}>Hal qilish</Button>
                      <Button icon={<XCircle size={15} />} onClick={() => setDialog('reject')}>Rad etish</Button>
                      {can('MARKET_ADMIN') && a.status !== 'ESCALATED' && <Button danger icon={<ArrowUpCircle size={15} />} onClick={() => setDialog('escalate')}>Eskalatsiya</Button>}
                    </>
                  )
                }
              />
            </div>

            {a.type === 'UNPAID_OCCUPANCY' && (
              <Card title="Eskalatsiya jarayoni">
                <Steps
                  current={stepIdx}
                  status={a.status === 'REJECTED' ? 'error' : a.status === 'ESCALATED' ? 'error' : undefined}
                  items={[
                    { title: 'Aniqlandi', description: fmtDateTime(a.detectedAt) },
                    { title: 'Admin xabardor', description: a.adminNotifiedAt ? fmtDateTime(a.adminNotifiedAt) : a.adminNotifyAt && active ? <span>qoldi: <Countdown to={a.adminNotifyAt} /></span> : '—' },
                    { title: 'Rahbarga eskalatsiya', description: a.escalatedAt ? fmtDateTime(a.escalatedAt) : a.chiefEscalateAt && active ? <span>qoldi: <Countdown to={a.chiefEscalateAt} /></span> : '—' },
                    { title: a.status === 'REJECTED' ? 'Rad etildi' : 'Hal qilindi', description: a.resolvedAt ? fmtDateTime(a.resolvedAt) : '—' },
                  ]}
                />
                {active && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="text-sm text-slate-600">
                      Hal qilish uchun: kassada to'lovni qayd eting, imtiyoz so'rang yoki aniqlash noto'g'ri bo'lsa rad eting. To'lov tasdiqlanishi bilan ogohlantirish avtomatik yopiladi.
                    </div>
                    {me?.demoMode && (a.status === 'OPEN' || a.status === 'ADMIN_NOTIFIED' || a.status === 'INVESTIGATING') && (
                      <Button size="small" icon={<FlaskConical size={13} />} loading={act.isPending} onClick={() => act.mutate({ path: `/demo/alerts/${a.id}/fast-forward` })}>
                        DEMO: keyingi bosqichga tezlashtirish
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
              <Card title="Tafsilotlar">
                <Field label="Aniqlangan">{fmtDateTime(a.detectedAt)}</Field>
                {a.space && <Field label={t('c.space')}><Link to={`/spaces/${a.space.id}`}>{a.space.number}</Link> · {a.space.row.name}</Field>}
                {a.camera && <Field label={t('c.camera')}><Link to={`/cameras/${a.camera.id}`}>{a.camera.code}</Link> · {a.camera.name}</Field>}
                <Field label="Xabar">{a.message ?? '—'}</Field>
                <Field label="Eskalatsiyalar">{a.escalations.map((e) => `${t(`role.${e.level}`)} (${fmtDateTime(e.createdAt)})`).join(', ') || '—'}</Field>
                <Field label="Mas'ul">{a.assignedTo?.fullName ?? '—'}</Field>
                {a.resolvedAt && <Field label="Yopgan">{a.resolvedBy?.fullName ?? 'Tizim (avtomatik)'}</Field>}
                {a.resolutionNote && <Field label="Natija">{a.resolutionNote}</Field>}
                {a.complaint && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between"><span className="font-semibold">Sotuvchi shikoyati</span><ComplaintStatusChip status={a.complaint.status} /></div>
                    <div className="text-slate-600">{a.complaint.description ?? '—'}</div>
                    {a.complaint.contactPhone && <div className="mt-1 text-xs text-slate-500">Tel: {a.complaint.contactPhone}</div>}
                    <Link to="/complaints" className="mt-1 inline-block text-xs">Shikoyatlar bo'limi →</Link>
                  </div>
                )}
              </Card>
              <Card title="Hodisalar tarixi">
                <div className="relative flex flex-col gap-0 pl-4">
                  <div className="absolute bottom-2 left-[5px] top-2 w-px bg-slate-200" />
                  {a.events.map((e) => (
                    <div key={e.id} className="relative py-2">
                      <span className="absolute -left-[14px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-solid border-white bg-blue-500" />
                      <div className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="font-mono text-xs font-semibold text-slate-700">{e.action}</span>
                        <span className="text-xs text-slate-400">{fmtDateTime(e.createdAt)} · {e.actor?.fullName ?? 'Tizim'}</span>
                      </div>
                      {e.note && <div className="text-sm text-slate-600">{e.note}</div>}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            {a.isDemo && <SimulatedNotice>Bu DEMO ma'lumotlari asosidagi ogohlantirish.</SimulatedNotice>}

            <Modal open={!!dialog} title={dialog ? dialogs[dialog].title : ''} okText={dialog ? dialogs[dialog].ok : ''} onCancel={() => setDialog(null)} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnHidden
              okButtonProps={{ danger: dialog === 'escalate' || dialog === 'reject' }}>
              {dialog === 'reject' && <p className="text-sm text-slate-600">Joy qo'lda "bo'sh" deb belgilanadi, shuning uchun ogohlantirish qayta yaratilmaydi.</p>}
              <Form form={form} layout="vertical" onFinish={(v) => dialog && act.mutate({ path: `/alerts/${a.id}/${dialogs[dialog].path}`, body: v })}>
                <Form.Item name="note" label="Izoh / tekshiruv natijasi" rules={[{ required: true, min: 3 }]}>
                  <Input.TextArea rows={3} maxLength={1000} showCount />
                </Form.Item>
              </Form>
            </Modal>
          </div>
        );
      }}
    </QueryView>
  );
}

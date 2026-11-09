import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { App, Button, Dropdown, Form, Input, Modal, Select, Table, Tabs } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Cctv, Edit3, Power, BadgePercent, ScanEye, FlaskConical, QrCode, RefreshCw } from 'lucide-react';
import { errorMessage, get, post, patch, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtMoney, fmtAgo } from '../lib/format';
import type { Alert, Camera, Payment, Space } from '../lib/types';
import { PageHeader, Card, Field, QueryView } from '../components/common';
import { SpaceStatusChip, PaymentStateChip, PaymentStatusChip, MethodLabel, AlertStatusChip, CameraStatusChip, ExemptionStatusChip, DemoTag, Chip } from '../components/Status';
import { SpaceForm } from '../components/SpaceForm';
import { ExemptionModal } from './ExemptionsPage';

type Detail = Space & {
  payments: Payment[];
  alerts: Alert[];
  exemptions: { id: string; reason: string; status: string; validFrom: string; validUntil: string; approvedBy: { fullName: string } | null }[];
  observations: { id: string; state: string; source: string; confidence: number | null; observedAt: string }[];
};

export default function SpaceDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { can, me } = useAuth();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const [camForm] = Form.useForm();
  const q = useQuery({ queryKey: ['space', id], queryFn: () => get<Detail>(`/spaces/${id}`) });
  const manage = can('CHIEF', 'MARKET_ADMIN');
  const history = useQuery({ queryKey: ['space', id, 'history'], queryFn: () => get<any[]>(`/spaces/${id}/history`), enabled: manage });
  const cameras = useQuery({ queryKey: ['cameras'], queryFn: () => get<Camera[]>('/cameras'), enabled: manage && camOpen });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['space'] });
    qc.invalidateQueries({ queryKey: ['spaces'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      message.success('Saqlandi');
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const qrUrl = (token: string) => `${window.location.origin}/qr/${token}`;

  return (
    <QueryView q={q} rows={10}>
      {(s) => (
        <div className="flex flex-col gap-5">
          <div>
            <Link to="/spaces" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500">
              <ArrowLeft size={14} /> {t('nav.spaces')}
            </Link>
            <PageHeader
              title={
                <span className="flex items-center gap-3">
                  {s.number} <SpaceStatusChip status={s.status} /> <DemoTag show={s.isDemo} />
                  {!s.isActive && <Chip tone="neutral">{t('c.inactive')}</Chip>}
                </span>
              }
              subtitle={`${s.row.name} · ${s.widthMeters} m · ${fmtMoney(s.tariff.amount)}`}
              extra={
                manage && (
                  <>
                    <Button icon={<Edit3 size={15} />} onClick={() => setEditOpen(true)}>{t('c.edit')}</Button>
                    <Button icon={<Cctv size={15} />} onClick={() => { camForm.setFieldsValue({ cameraId: s.camera?.id ?? null, zoneCode: s.cameraZone?.zoneCode }); setCamOpen(true); }}>Kamera</Button>
                    <Button icon={<BadgePercent size={15} />} onClick={() => setExOpen(true)}>{can('CHIEF') ? 'Imtiyoz berish' : "Imtiyoz so'rash"}</Button>
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'free', icon: <ScanEye size={14} />, label: "Joyida tekshirildi: bo'sh", onClick: () => act.mutate(() => post(`/spaces/${s.id}/occupancy`, { state: 'FREE' })) },
                          { key: 'occ', icon: <ScanEye size={14} />, label: 'Joyida tekshirildi: band', onClick: () => act.mutate(() => post(`/spaces/${s.id}/occupancy`, { state: 'OCCUPIED' })) },
                          ...(me?.demoMode
                            ? [
                                { type: 'divider' as const },
                                { key: 'd1', icon: <FlaskConical size={14} />, label: 'DEMO: kamera "band" deb aniqladi', onClick: () => act.mutate(() => post('/demo/occupancy', { spaceId: s.id, state: 'OCCUPIED' })) },
                                { key: 'd2', icon: <FlaskConical size={14} />, label: 'DEMO: kamera "bo\'sh" deb aniqladi', onClick: () => act.mutate(() => post('/demo/occupancy', { spaceId: s.id, state: 'FREE' })) },
                              ]
                            : []),
                          { type: 'divider' as const },
                          {
                            key: 'active',
                            icon: <Power size={14} />,
                            danger: s.isActive,
                            label: s.isActive ? 'Joyni faolsizlantirish' : 'Joyni faollashtirish',
                            onClick: () =>
                              modal.confirm({
                                title: s.isActive ? `${s.number} joyini faolsizlantirish?` : `${s.number} joyini faollashtirish?`,
                                content: "Tarix va to'lovlar saqlanib qoladi.",
                                onOk: () => act.mutateAsync(() => patch(`/spaces/${s.id}`, { isActive: !s.isActive })),
                              }),
                          },
                        ],
                      }}
                    >
                      <Button>Yana…</Button>
                    </Dropdown>
                  </>
                )
              }
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Asosiy ma'lumotlar">
              <Field label={t('c.row')}>{s.row.name}</Field>
              <Field label={t('c.size')}>{s.widthMeters} m (old tomon uzunligi)</Field>
              <Field label={t('c.tariff')}>{s.tariff.name}</Field>
              <Field label="Bandlik">{t(`occ.${s.occupancyState}`)}</Field>
              <Field label="To'lov holati"><PaymentStateChip state={s.paymentState} /></Field>
              <Field label={t('c.lastDetected')}>{s.lastDetectedAt ? `${fmtDateTime(s.lastDetectedAt)} (${fmtAgo(s.lastDetectedAt, lang)})` : '—'}</Field>
              {s.validPayment && <Field label={t('c.validUntil')}>{fmtDateTime(s.validPayment.validUntil)}</Field>}
              {s.activeExemption && <Field label="Imtiyoz">{fmtDateTime(s.activeExemption.validUntil)} gacha</Field>}
              {s.notes && <Field label={t('c.note')}>{s.notes}</Field>}
            </Card>
            <Card title="Kamera">
              {s.camera ? (
                <>
                  <Field label={t('c.camera')}><Link to={`/cameras/${s.camera.id}`}>{s.camera.code} — {s.camera.name}</Link></Field>
                  <Field label={t('c.status')}><CameraStatusChip status={s.camera.status} /></Field>
                  <Field label="Zona ID"><span className="font-mono">{s.cameraZone?.zoneCode}</span></Field>
                </>
              ) : (
                <div className="py-6 text-center text-sm text-slate-400">Kamera biriktirilmagan</div>
              )}
              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">So'nggi kuzatuvlar</div>
              <div className="mt-1 max-h-40 overflow-y-auto">
                {s.observations.slice(0, 8).map((o) => (
                  <div key={o.id} className="flex justify-between py-1 text-xs">
                    <span className="text-slate-500">{fmtDateTime(o.observedAt)}</span>
                    <span>
                      {t(`occ.${o.state}`)} · <span className="text-slate-400">{o.source === 'DEMO_SIMULATOR' ? 'DEMO sim.' : o.source}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
            {s.qrToken && (
              <Card title={<span className="flex items-center gap-2"><QrCode size={15} /> Sotuvchi QR kodi</span>} extra={can('CHIEF') && (
                <Button size="small" icon={<RefreshCw size={13} />} onClick={() => modal.confirm({ title: 'QR kodni yangilash?', content: 'Eski QR stiker ishlamay qoladi.', onOk: () => act.mutateAsync(() => post(`/spaces/${s.id}/regenerate-qr`)) })}>Yangilash</Button>
              )}>
                <div className="flex flex-col items-center gap-3">
                  <QRCodeSVG value={qrUrl(s.qrToken)} size={150} level="M" />
                  <a href={qrUrl(s.qrToken)} target="_blank" rel="noreferrer" className="break-all text-center text-xs">{qrUrl(s.qrToken)}</a>
                  <div className="text-center text-xs text-slate-500">Sotuvchi skanerlab to'lov holatini ko'radi va shikoyat yuboradi.</div>
                </div>
              </Card>
            )}
          </div>

          <Card bodyClass="px-4 pb-2">
            <Tabs
              items={[
                {
                  key: 'p',
                  label: `${t('nav.payments')} (${s.payments.length})`,
                  children: (
                    <Table<Payment> rowKey="id" size="small" pagination={false} dataSource={s.payments} scroll={{ x: 700 }}
                      columns={[
                        { title: t('c.receipt'), key: 'r', render: (_, p) => <Link to={`/payments/${p.id}`} className="font-mono text-xs">{p.receipt?.receiptNumber ?? p.id.slice(-8)}</Link> },
                        { title: t('c.date'), key: 'd', render: (_, p) => fmtDateTime(p.paidAt ?? p.createdAt) },
                        { title: t('c.method'), key: 'm', render: (_, p) => <MethodLabel method={p.method} simulated={p.isSimulated} /> },
                        { title: t('c.cashier'), key: 'c', render: (_, p) => p.cashier?.fullName ?? '—' },
                        { title: t('c.amount'), key: 'a', align: 'right', render: (_, p) => fmtMoney(p.amount) },
                        { title: t('c.status'), key: 's', render: (_, p) => <PaymentStatusChip status={p.status} /> },
                      ]} />
                  ),
                },
                ...(manage
                  ? [
                      {
                        key: 'a',
                        label: `${t('nav.alerts')} (${s.alerts.length})`,
                        children: (
                          <Table<Alert> rowKey="id" size="small" pagination={false} dataSource={s.alerts}
                            columns={[
                              { title: 'Turi', key: 't', render: (_, a) => <Link to={`/alerts/${a.id}`}>{t(`at.${a.type}`)}</Link> },
                              { title: t('c.time'), key: 'd', render: (_, a) => fmtDateTime(a.detectedAt) },
                              { title: t('c.status'), key: 's', render: (_, a) => <AlertStatusChip status={a.status} /> },
                              { title: 'Natija', key: 'n', render: (_, a) => a.resolutionNote ?? '—' },
                            ]} />
                        ),
                      },
                      {
                        key: 'e',
                        label: `${t('nav.exemptions')} (${s.exemptions.length})`,
                        children: (
                          <Table rowKey="id" size="small" pagination={false} dataSource={s.exemptions}
                            columns={[
                              { title: t('c.reason'), dataIndex: 'reason' },
                              { title: 'Muddat', key: 'm', render: (_, e) => `${fmtDateTime(e.validFrom)} — ${fmtDateTime(e.validUntil)}` },
                              { title: t('c.status'), key: 's', render: (_, e) => <ExemptionStatusChip status={e.status} /> },
                              { title: 'Tasdiqlagan', key: 'b', render: (_, e) => e.approvedBy?.fullName ?? '—' },
                            ]} />
                        ),
                      },
                      {
                        key: 'h',
                        label: "O'zgarishlar tarixi",
                        children: (
                          <Table rowKey="id" size="small" pagination={false} loading={history.isLoading} dataSource={history.data}
                            columns={[
                              { title: t('c.time'), key: 'd', render: (_, a) => fmtDateTime(a.createdAt) },
                              { title: 'Foydalanuvchi', key: 'u', render: (_, a) => a.actor?.fullName ?? 'Tizim' },
                              { title: 'Amal', dataIndex: 'action' },
                              { title: 'Tavsif', dataIndex: 'summary' },
                            ]} />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Card>

          <SpaceForm open={editOpen} space={s} onClose={() => setEditOpen(false)} />
          <ExemptionModal open={exOpen} onClose={() => setExOpen(false)} spaceId={s.id} />
          <Modal open={camOpen} title={`${s.number}: kamera biriktirish`} onCancel={() => setCamOpen(false)} onOk={() => camForm.submit()} okText={t('c.save')} confirmLoading={act.isPending} destroyOnHidden>
            <Form form={camForm} layout="vertical" className="mt-4" onFinish={(v) => act.mutate(() => put(`/spaces/${s.id}/camera`, { cameraId: v.cameraId ?? null, zoneCode: v.zoneCode || undefined }).then(() => setCamOpen(false)))}>
              <Form.Item name="cameraId" label={t('c.camera')}>
                <Select allowClear loading={cameras.isLoading} placeholder="Kamerasiz" options={cameras.data?.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))} />
              </Form.Item>
              <Form.Item name="zoneCode" label="Kamera zona ID" extra="Vision xizmati shu zona kodi bilan natija yuboradi">
                <Input placeholder={`Z-${s.number}`} />
              </Form.Item>
            </Form>
          </Modal>
        </div>
      )}
    </QueryView>
  );
}

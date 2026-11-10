import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { App, Button, Modal, Select, Table, Tabs } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit3, FlaskConical, Grid3x3 } from 'lucide-react';
import { errorMessage, get, post, put, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtDateTime } from '../lib/format';
import type { Camera, Space, SpaceStatus } from '../lib/types';
import { PageHeader, Card, Field, QueryView, SimulatedNotice } from '../components/common';
import { CameraStatusChip, SpaceStatusChip, AlertStatusChip, DemoTag, Chip } from '../components/Status';
import { SimulatedPreview, UnavailablePreview } from '../components/CameraPreview';
import { CameraForm } from './CamerasPage';

type Detail = Camera & {
  zones: { id: string; zoneCode: string; spaceId: string; status: SpaceStatus; space: { id: string; number: string; occupancyState: string; lastDetectedAt: string | null; row: { name: string } } }[];
  healthEvents: { id: string; status: string; message: string | null; createdAt: string }[];
  observations: { id: string; state: string; source: string; confidence: number | null; observedAt: string; space: { number: string } }[];
  alerts: { id: string; type: string; status: string; title: string; detectedAt: string }[];
  preview: { kind: 'SIMULATED' | 'UNAVAILABLE'; note: string };
};

export default function CameraDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const q = useQuery({ queryKey: ['camera', id], queryFn: () => get<Detail>(`/cameras/${id}`), refetchInterval: 20_000 });
  const spaces = useQuery({ queryKey: ['spaces', 'all-for-camera'], queryFn: () => get<Paged<Space>>('/spaces', { pageSize: 2000 }), enabled: assignOpen });
  const mut = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { message.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['camera'] }); qc.invalidateQueries({ queryKey: ['cameras'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <QueryView q={q} rows={10}>
      {(c) => (
        <div className="flex flex-col gap-5">
          <div>
            <Link to="/cameras" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft size={14} /> {t('nav.cameras')}</Link>
            <PageHeader
              title={<span className="flex items-center gap-3">{c.name} <CameraStatusChip status={c.status} /> <DemoTag show={c.isDemo} /></span>}
              subtitle={<span className="font-mono">{c.code}</span>}
              extra={
                <>
                  <Button icon={<Grid3x3 size={15} />} onClick={() => { setSelected(c.zones.map((z) => z.spaceId)); setAssignOpen(true); }}>Joylarni biriktirish</Button>
                  <Button icon={<Edit3 size={15} />} onClick={() => setEdit(true)}>{t('c.edit')}</Button>
                  {me?.demoMode && c.provider === 'DEMO' && (
                    <Button
                      icon={<FlaskConical size={15} />}
                      onClick={() => mut.mutate(() => post(`/demo/cameras/${c.id}/status`, { status: c.status === 'OFFLINE' ? 'ONLINE' : 'OFFLINE' }))}
                    >
                      DEMO: {c.status === 'OFFLINE' ? 'qayta ulash' : 'uzilishni simulyatsiya qilish'}
                    </Button>
                  )}
                </>
              }
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Ko'rinish">
              {c.preview.kind === 'SIMULATED' ? (
                <SimulatedPreview zones={c.zones.map((z) => ({ key: z.id, label: z.space.number, status: z.status }))} cameraStatus={c.status} />
              ) : (
                <UnavailablePreview note={c.preview.note} />
              )}
              <div className="mt-3"><SimulatedNotice>{c.preview.note}</SimulatedNotice></div>
            </Card>
            <Card title="Ma'lumotlar">
              <Field label="ID"><span className="font-mono">{c.code}</span></Field>
              <Field label="IP manzil"><span className="font-mono">{c.ipAddress ?? '—'}</span></Field>
              <Field label="Model">{c.model ?? '—'}</Field>
              <Field label="Provayder">{c.provider === 'DEMO' ? <Chip tone="warn">DEMO simulyatsiya</Chip> : <Chip tone="neutral">Hikvision — ulanmagan</Chip>}</Field>
              <Field label="Oqim konfiguratsiyasi">{c.streamConfigRef ? <span className="font-mono text-xs">{c.streamConfigRef}</span> : '—'}</Field>
              <Field label="Monitoring">{c.monitoringEnabled ? 'Yoqilgan' : "O'chirilgan"}</Field>
              <Field label={t('c.lastHeartbeat')}>{fmtDateTime(c.lastHeartbeatAt)} ({fmtAgo(c.lastHeartbeatAt, lang)})</Field>
              <Field label="Oxirgi kadr">{fmtDateTime(c.lastFrameAt)}</Field>
              <Field label="Yaratilgan">{fmtDateTime(c.createdAt)}</Field>
              <Field label="Biriktirilgan joylar">{c.zones.length}</Field>
            </Card>
          </div>
          <Card bodyClass="px-4 pb-2">
            <Tabs
              items={[
                {
                  key: 'z', label: `Zonalar (${c.zones.length})`,
                  children: (
                    <Table rowKey="id" size="small" pagination={false} dataSource={c.zones}
                      columns={[
                        { title: 'Zona', dataIndex: 'zoneCode', render: (v) => <span className="font-mono text-xs">{v}</span> },
                        { title: t('c.space'), key: 's', render: (_, z) => <Link to={`/spaces/${z.space.id}`}>{z.space.number}</Link> },
                        { title: t('c.row'), key: 'r', render: (_, z) => z.space.row.name },
                        { title: t('c.status'), key: 'st', render: (_, z) => <SpaceStatusChip status={z.status} /> },
                        { title: t('c.lastDetected'), key: 'l', render: (_, z) => fmtAgo(z.space.lastDetectedAt, lang) },
                      ]} />
                  ),
                },
                {
                  key: 'o', label: 'Monitoring hodisalari',
                  children: (
                    <Table rowKey="id" size="small" pagination={{ pageSize: 10 }} dataSource={c.observations}
                      columns={[
                        { title: t('c.time'), key: 't', render: (_, o) => fmtDateTime(o.observedAt) },
                        { title: t('c.space'), key: 's', render: (_, o) => o.space.number },
                        { title: 'Holat', key: 'st', render: (_, o) => t(`occ.${o.state}`) },
                        { title: 'Ishonch', key: 'c', render: (_, o) => (o.confidence != null ? `${Math.round(o.confidence * 100)}%` : '—') },
                        { title: 'Manba', key: 'src', render: (_, o) => (o.source === 'DEMO_SIMULATOR' ? <Chip tone="warn">DEMO sim.</Chip> : o.source) },
                      ]} />
                  ),
                },
                {
                  key: 'h', label: 'Ulanish tarixi',
                  children: (
                    <Table rowKey="id" size="small" pagination={{ pageSize: 10 }} dataSource={c.healthEvents}
                      columns={[
                        { title: t('c.time'), key: 't', render: (_, e) => fmtDateTime(e.createdAt) },
                        { title: t('c.status'), key: 's', render: (_, e) => <CameraStatusChip status={e.status} /> },
                        { title: 'Izoh', dataIndex: 'message' },
                      ]} />
                  ),
                },
                {
                  key: 'a', label: `Ogohlantirishlar (${c.alerts.length})`,
                  children: (
                    <Table rowKey="id" size="small" pagination={false} dataSource={c.alerts}
                      columns={[
                        { title: 'Sarlavha', key: 't', render: (_, a) => <Link to={`/alerts/${a.id}`}>{a.title}</Link> },
                        { title: t('c.time'), key: 'd', render: (_, a) => fmtDateTime(a.detectedAt) },
                        { title: t('c.status'), key: 's', render: (_, a) => <AlertStatusChip status={a.status} /> },
                      ]} />
                  ),
                },
              ]}
            />
          </Card>
          <CameraForm open={edit} camera={c} onClose={() => setEdit(false)} />
          <Modal open={assignOpen} title={`${c.code}: joylarni biriktirish`} width={640} onCancel={() => setAssignOpen(false)} confirmLoading={mut.isPending}
            onOk={() => mut.mutate(() => put(`/cameras/${c.id}/spaces`, { spaceIds: selected }).then(() => setAssignOpen(false)))}>
            <p className="text-xs text-slate-500">Tanlangan joy boshqa kameradan shu kameraga ko'chiriladi.</p>
            <Select mode="multiple" className="w-full" value={selected} onChange={setSelected} loading={spaces.isLoading} optionFilterProp="label"
              options={spaces.data?.items.map((s) => ({ value: s.id, label: `${s.number}${s.camera && s.camera.id !== c.id ? ` (${s.camera.code})` : ''}` }))} />
          </Modal>
        </div>
      )}
    </QueryView>
  );
}

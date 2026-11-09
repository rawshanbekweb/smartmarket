import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Form, Input, Modal, Select, Switch, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { errorMessage, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtAgo, fmtDateTime } from '../lib/format';
import type { Camera } from '../lib/types';
import { PageHeader, Card, ErrorState, SimulatedNotice } from '../components/common';
import { CameraStatusChip, DemoTag, Chip } from '../components/Status';

export function CameraForm({ open, camera, onClose }: { open: boolean; camera?: Camera | null; onClose: () => void }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const save = useMutation({
    mutationFn: (v: any) => (camera ? patch(`/cameras/${camera.id}`, v) : post('/cameras', v)),
    onSuccess: () => { message.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['cameras'] }); qc.invalidateQueries({ queryKey: ['camera'] }); onClose(); },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal open={open} title={camera ? `${camera.code}: tahrirlash` : "Kamera qo'shish"} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} okText={t('c.save')} destroyOnHidden afterOpenChange={(o) => o && form.setFieldsValue(camera ?? { provider: 'HIKVISION', monitoringEnabled: true })}>
      <Form form={form} layout="vertical" className="mt-4" onFinish={(v) => save.mutate({ ...v, ipAddress: v.ipAddress || null })}>
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="code" label="Kamera ID" rules={[{ required: true }]}><Input placeholder="CAM-13" /></Form.Item>
          <Form.Item name="name" label="Nomi" rules={[{ required: true }]}><Input placeholder="G qator, boshi" /></Form.Item>
          <Form.Item name="ipAddress" label="IP manzil"><Input placeholder="192.168.10.113" /></Form.Item>
          <Form.Item name="model" label="Model"><Input placeholder="DS-2CD…" /></Form.Item>
          <Form.Item name="provider" label="Provayder">
            <Select options={[{ value: 'HIKVISION', label: 'Hikvision (kelajakdagi integratsiya)' }, { value: 'DEMO', label: 'DEMO simulyatsiya' }]} />
          </Form.Item>
          <Form.Item name="monitoringEnabled" label="Monitoring" valuePropName="checked"><Switch /></Form.Item>
        </div>
        <Form.Item name="streamConfigRef" label="Oqim konfiguratsiyasi kaliti" extra="Faqat server sirlaridagi kalit nomi (masalan HIK_CAM_13). RTSP URL yoki parolni bu yerga yozmang.">
          <Input placeholder="HIK_CAM_13" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function CamerasPage() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['cameras'], queryFn: () => get<Camera[]>('/cameras') });
  const online = q.data?.filter((c) => c.status === 'ONLINE' || c.status === 'DEGRADED').length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.cameras')}
        subtitle={q.data ? `${online}/${q.data.length} ta kamera ishlamoqda` : undefined}
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('c.add')}</Button>}
      />
      <SimulatedNotice>
        Hozirgi versiyada kameralar <b>DEMO provayder</b> orqali simulyatsiya qilinadi. Hikvision RTSP/ISAPI integratsiyasi rejalashtirilgan va hali ulanmagan — tizim haqiqiy kameraga ulanganini da'vo qilmaydi.
      </SimulatedNotice>
      <Card bodyClass="p-0">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <Table<Camera>
            rowKey="id"
            loading={q.isLoading}
            dataSource={q.data}
            pagination={false}
            scroll={{ x: 900 }}
            columns={[
              { title: 'ID', key: 'c', render: (_, c) => <Link to={`/cameras/${c.id}`} className="font-mono font-semibold">{c.code}</Link> },
              { title: 'Nomi', key: 'n', render: (_, c) => <span className="flex items-center gap-2">{c.name} <DemoTag show={c.isDemo} /></span> },
              { title: 'IP', dataIndex: 'ipAddress', render: (v) => <span className="font-mono text-xs">{v ?? '—'}</span> },
              { title: 'Provayder', key: 'p', render: (_, c) => (c.provider === 'DEMO' ? <Chip tone="warn">DEMO sim.</Chip> : <Chip tone="neutral">Hikvision · ulanmagan</Chip>) },
              { title: t('c.status'), key: 's', render: (_, c) => <CameraStatusChip status={c.status} /> },
              { title: 'Joylar', dataIndex: 'assignedSpaces', align: 'right' },
              { title: t('c.lastHeartbeat'), key: 'h', render: (_, c) => <span title={fmtDateTime(c.lastHeartbeatAt)}>{fmtAgo(c.lastHeartbeatAt, lang)}</span> },
              { title: 'Monitoring', key: 'm', render: (_, c) => (c.monitoringEnabled ? <Chip tone="ok">Yoqilgan</Chip> : <Chip tone="neutral">O'chirilgan</Chip>) },
            ]}
          />
        )}
      </Card>
      <CameraForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

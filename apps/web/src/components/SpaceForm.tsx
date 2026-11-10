import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n, tx } from '../lib/i18n';
import { fmtMoney } from '../lib/format';
import type { Space } from '../lib/types';

interface RowOpt { id: string; name: string; code: string }
interface SettingsData { tariffs: { id: string; name: string; amount: number; widthMeters: string; isActive: boolean; isDefault: boolean }[] }

export function SpaceForm({ open, space, onClose }: { open: boolean; space?: Space | null; onClose: () => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const rows = useQuery({ queryKey: ['rows'], queryFn: () => get<RowOpt[]>('/rows'), enabled: open });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => get<SettingsData>('/settings'), enabled: open });

  useEffect(() => {
    if (!open) return;
    if (space) form.setFieldsValue({ number: space.number, rowId: space.row.id, widthMeters: Number(space.widthMeters), tariffId: space.tariff.id, notes: space.notes });
    else form.resetFields();
  }, [open, space, form]);

  useEffect(() => {
    if (open && !space && settings.data) {
      const def = settings.data.tariffs.find((x) => x.isDefault && x.isActive);
      if (def && !form.getFieldValue('tariffId')) form.setFieldsValue({ tariffId: def.id, widthMeters: Number(def.widthMeters) });
    }
  }, [open, space, settings.data, form]);

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => (space ? patch(`/spaces/${space.id}`, v) : post('/spaces', v)),
    onSuccess: () => {
      message.success(space ? tx("Joy yangilandi") : tx("Yangi joy qo'shildi"));
      qc.invalidateQueries({ queryKey: ['spaces'] });
      qc.invalidateQueries({ queryKey: ['space'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['rows'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title={space ? `${t('c.edit')}: ${space.number}` : `${t('c.add')}: ${t('c.space').toLowerCase()}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('c.save')}
      cancelText={t('c.cancel')}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark="optional" className="mt-4">
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="number" label={tx("Joy raqami")} rules={[{ required: true, max: 20 }]}>
            <Input placeholder="A-26" />
          </Form.Item>
          <Form.Item name="rowId" label={t('c.row')} rules={[{ required: true }]}>
            <Select loading={rows.isLoading} options={rows.data?.map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="widthMeters" label={tx("Uzunligi (metr, maydon emas)")} rules={[{ required: true }]} tooltip={tx("Savdo joyining old tomon uzunligi metrlarda. Kvadrat metr emas.")}>
            <InputNumber min={0.1} max={100} step={0.5} suffix={tx("m")} className="w-full" />
          </Form.Item>
          <Form.Item name="tariffId" label={t('c.tariff')} rules={[{ required: true }]} extra={space && !can('CHIEF') ? tx("Tarifni faqat rahbar o'zgartiradi") : undefined}>
            <Select
              disabled={!!space && !can('CHIEF')}
              loading={settings.isLoading}
              options={settings.data?.tariffs.filter((x) => x.isActive).map((x) => ({ value: x.id, label: `${x.name} — ${fmtMoney(x.amount)}` }))}
            />
          </Form.Item>
        </div>
        <Form.Item name="notes" label={t('c.note')}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtMoney } from '../lib/format';

interface RowOpt { id: string; name: string; code: string }
interface SettingsData { tariffs: { id: string; name: string; amount: number; widthMeters: string; isActive: boolean; isDefault: boolean }[] }
interface BulkValues { rowId: string; tariffId: string; widthMeters: number; prefix?: string; from: number; to: number; padLength: number }

const MAX = 300;
const numberOf = (v: Partial<BulkValues>, n: number) => `${v.prefix ?? ''}${String(n).padStart(v.padLength ?? 2, '0')}`;

/** Creates a numbered range of spaces in one row — the first set-up of a real market. */
export function BulkSpaceForm({ open, rowId, onClose }: { open: boolean; rowId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<BulkValues>();
  const values = Form.useWatch([], form) as Partial<BulkValues> | undefined;
  const rows = useQuery({ queryKey: ['rows'], queryFn: () => get<RowOpt[]>('/rows'), enabled: open });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => get<SettingsData>('/settings'), enabled: open });

  useEffect(() => {
    if (!open || !settings.data || form.getFieldValue('tariffId')) return;
    const def = settings.data.tariffs.find((x) => x.isDefault && x.isActive) ?? settings.data.tariffs.find((x) => x.isActive);
    if (def) form.setFieldsValue({ tariffId: def.id, widthMeters: Number(def.widthMeters) });
  }, [open, settings.data, form]);

  const save = useMutation({
    mutationFn: (v: BulkValues) => post<{ created: number; first: string; last: string }>('/spaces/bulk', { ...v, prefix: v.prefix ?? '' }),
    onSuccess: (d) => {
      message.success(`${d.created} ${t('bulk.created')} (${d.first} … ${d.last})`);
      for (const key of ['spaces', 'rows', 'dashboard']) qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const from = values?.from;
  const to = values?.to;
  const count = typeof from === 'number' && typeof to === 'number' && to >= from ? to - from + 1 : 0;

  return (
    <Modal
      open={open}
      title={t('bulk.title')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={count ? `${t('bulk.create')} (${count})` : t('bulk.create')}
      okButtonProps={{ disabled: !count || count > MAX }}
      cancelText={t('c.cancel')}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        requiredMark="optional"
        className="mt-4"
        initialValues={{ rowId, from: 1, padLength: 2 }}
        onFinish={(v) => save.mutate(v)}
        onValuesChange={(ch: Partial<BulkValues>) => {
          // Suggest "A-" for row A until the user types their own prefix.
          if (ch.rowId && !form.isFieldTouched('prefix')) {
            const code = rows.data?.find((r) => r.id === ch.rowId)?.code;
            if (code) form.setFieldsValue({ prefix: `${code}-` });
          }
          if (ch.tariffId) {
            const tariff = settings.data?.tariffs.find((x) => x.id === ch.tariffId);
            if (tariff) form.setFieldsValue({ widthMeters: Number(tariff.widthMeters) });
          }
        }}
      >
        <p className="mb-4 mt-0 text-xs text-slate-500">{t('bulk.help')}</p>
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="rowId" label={t('c.row')} rules={[{ required: true }]}>
            <Select loading={rows.isLoading} options={rows.data?.map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="prefix" label={t('bulk.prefix')} rules={[{ max: 12 }]}>
            <Input placeholder="A-" />
          </Form.Item>
          <Form.Item name="from" label={t('bulk.from')} rules={[{ required: true }]}>
            <InputNumber min={0} max={99999} precision={0} className="!w-full" />
          </Form.Item>
          <Form.Item
            name="to"
            label={t('bulk.to')}
            dependencies={['from']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, v) => {
                  const f = getFieldValue('from');
                  if (typeof v !== 'number' || typeof f !== 'number') return Promise.resolve();
                  if (v < f) return Promise.reject(new Error(t('bulk.errOrder')));
                  if (v - f + 1 > MAX) return Promise.reject(new Error(t('bulk.errMax')));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <InputNumber min={0} max={99999} precision={0} className="!w-full" />
          </Form.Item>
          <Form.Item name="padLength" label={t('bulk.pad')} rules={[{ required: true }]}>
            <Select options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} — ${String(1).padStart(n, '0')}` }))} />
          </Form.Item>
          <Form.Item name="widthMeters" label={t('bulk.width')} rules={[{ required: true }]}>
            <InputNumber min={0.1} max={100} step={0.5} className="!w-full" />
          </Form.Item>
        </div>
        <Form.Item name="tariffId" label={t('c.tariff')} rules={[{ required: true }]}>
          <Select
            loading={settings.isLoading}
            notFoundContent={t('bulk.noTariff')}
            options={settings.data?.tariffs.filter((x) => x.isActive).map((x) => ({ value: x.id, label: `${x.name} — ${fmtMoney(x.amount)}` }))}
          />
        </Form.Item>
        {count > 0 && count <= MAX && typeof from === 'number' && typeof to === 'number' && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">{t('bulk.preview')}: </span>
            <span className="font-mono font-semibold">{numberOf(values ?? {}, from)}</span>
            {count > 1 && <span className="font-mono font-semibold"> … {numberOf(values ?? {}, to)}</span>}
            <span className="text-slate-500"> · {count} {t('bulk.count')}</span>
          </div>
        )}
      </Form>
    </Modal>
  );
}

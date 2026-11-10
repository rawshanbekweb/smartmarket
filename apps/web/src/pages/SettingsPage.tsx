import { useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Select, Switch, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { errorMessage, get, patch, post, put } from '../lib/api';
import { useI18n, tx, txServer } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtMoney } from '../lib/format';
import { PageHeader, Card, Field, QueryView, SimulatedNotice } from '../components/common';
import { Chip, DemoTag } from '../components/Status';

interface SettingsData {
  market: { id: string; name: string; address: string | null; utcOffsetMinutes: number; isDemo: boolean };
  settings: { key: string; value: number | string; defaultValue: number | string; description: string; updatedAt: string | null; updatedBy: string | null }[];
  tariffs: { id: string; name: string; amount: number; widthMeters: string; isDefault: boolean; isActive: boolean; isDemo: boolean; spaceCount: number }[];
  cycles: { id: string; name: string; type: 'CALENDAR_DAY' | 'FIXED_DURATION'; durationMinutes: number | null; description: string | null; isActive: boolean; isDemo: boolean }[];
  demoMode: boolean;
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const chief = can('CHIEF');
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get<SettingsData>('/settings') });
  const [tariffOpen, setTariffOpen] = useState<SettingsData['tariffs'][number] | 'new' | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [tForm] = Form.useForm();
  const [cForm] = Form.useForm();
  const [mForm] = Form.useForm();
  const mut = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { message.success(tx("Saqlandi")); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['me'] }); setTariffOpen(null); setCycleOpen(false); },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <QueryView q={q} rows={10}>
      {(d) => (
        <div className="flex flex-col gap-5">
          <PageHeader title={t('nav.settings')} subtitle={chief ? tx("Tasdiqlangan biznes sozlamalari. Har bir o'zgarish audit jurnaliga yoziladi.") : tx("Faqat ko'rish — o'zgartirish huquqi rahbarda")} />
          {d.demoMode && <SimulatedNotice>{tx("Tizim DEMO rejimida ishlamoqda. Haqiqiy bozor ma'lumotlariga o'tish uchun README dagi \"DEMO dan haqiqiy ma'lumotga o'tish\" bo'limiga qarang.")}</SimulatedNotice>}

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title={<span className="flex items-center gap-2">{tx("Bozor")} <DemoTag show={d.market.isDemo} /></span>}>
              <Form form={mForm} layout="vertical" initialValues={d.market} onFinish={(v) => mut.mutate(() => patch('/settings/market', v))} disabled={!chief}>
                <Form.Item name="name" label={tx("Nomi")} rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="address" label={tx("Manzil")}><Input /></Form.Item>
                <Field label={tx("Vaqt mintaqasi")}>{tx("UTC+5 (Toshkent)")}</Field>
                {chief && <Button type="primary" htmlType="submit" className="mt-3" loading={mut.isPending}>{t('c.save')}</Button>}
              </Form>
            </Card>

            <Card title={tx("Ogohlantirish va tizim sozlamalari")}>
              <div className="flex flex-col gap-3">
                {d.settings.map((s) => (
                  <div key={s.key} className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-dashed border-slate-100 pb-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{txServer(s.description)}</div>
                      <div className="font-mono text-[11px] text-slate-400">{s.key}{s.updatedBy && ` · ${s.updatedBy}, ${fmtDateTime(s.updatedAt)}`}</div>
                    </div>
                    {typeof s.defaultValue === 'number' ? (
                      <InputNumber disabled={!chief} min={1} max={10000} defaultValue={Number(s.value)} className="w-28"
                        onBlur={(e) => { const v = Number(e.target.value); if (v && v !== s.value) mut.mutate(() => put(`/settings/values/${s.key}`, { value: v })); }} />
                    ) : (
                      <Input disabled={!chief} defaultValue={String(s.value)} className="w-72"
                        onBlur={(e) => { if (e.target.value && e.target.value !== s.value) mut.mutate(() => put(`/settings/values/${s.key}`, { value: e.target.value })); }} />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title={tx("Tariflar")} extra={chief && <Button size="small" icon={<Plus size={14} />} onClick={() => { tForm.resetFields(); setTariffOpen('new'); }}>{t('c.add')}</Button>} bodyClass="p-0">
            <Table rowKey="id" pagination={false} dataSource={d.tariffs}
              columns={[
                { title: tx("Nomi"), key: 'n', render: (_, x) => <span className="flex items-center gap-2 font-medium">{x.name} <DemoTag show={x.isDemo} />{x.isDefault && <Chip tone="info" dot={false}>{tx("Standart")}</Chip>}</span> },
                { title: tx("Summa (bir sikl uchun)"), key: 'a', align: 'right', render: (_, x) => <span className="tabular font-semibold">{fmtMoney(x.amount)}</span> },
                { title: tx("Uzunlik"), key: 'w', render: (_, x) => `${x.widthMeters} m` },
                { title: tx("Joylar"), dataIndex: 'spaceCount', align: 'right' },
                { title: t('c.status'), key: 's', render: (_, x) => (x.isActive ? <Chip tone="ok">{t('c.active')}</Chip> : <Chip tone="neutral">{t('c.inactive')}</Chip>) },
                ...(chief ? [{ title: '', key: 'e', render: (_: unknown, x: SettingsData['tariffs'][number]) => <Button size="small" onClick={() => { tForm.setFieldsValue({ ...x, widthMeters: Number(x.widthMeters) }); setTariffOpen(x); }}>{t('c.edit')}</Button> }] : []),
              ]} />
          </Card>

          <Card title={tx("To'lov sikllari")} extra={chief && <Button size="small" icon={<Plus size={14} />} onClick={() => { cForm.resetFields(); cForm.setFieldsValue({ type: 'FIXED_DURATION' }); setCycleOpen(true); }}>{t('c.add')}</Button>} bodyClass="p-0">
            <div className="p-4 pb-0"><SimulatedNotice>{tx("To'lovning haqiqiy amal qilish muddati hali tasdiqlanmagan. Sikl sozlanadi; faollashtirilgan sikl faqat yangi to'lovlarga qo'llanadi.")}</SimulatedNotice></div>
            <Table rowKey="id" pagination={false} dataSource={d.cycles} className="mt-2"
              columns={[
                { title: tx("Nomi"), key: 'n', render: (_, c) => <span className="flex items-center gap-2 font-medium">{c.name} <DemoTag show={c.isDemo} /></span> },
                { title: tx("Turi"), key: 't', render: (_, c) => (c.type === 'CALENDAR_DAY' ? tx("Kalendar kun (kun oxirigacha)") : tx("Belgilangan davomiylik: {n} daqiqa", { n: c.durationMinutes ?? 0 })) },
                { title: tx("Izoh"), dataIndex: 'description', render: (v) => <span className="text-xs text-slate-500">{v ?? '—'}</span> },
                { title: t('c.status'), key: 's', render: (_, c) => (c.isActive ? <Chip tone="ok">{tx("Faol")}</Chip> : <Chip tone="neutral">{tx("Faol emas")}</Chip>) },
                ...(chief ? [{ title: '', key: 'a', render: (_: unknown, c: SettingsData['cycles'][number]) => !c.isActive && <Button size="small" onClick={() => modal.confirm({ title: tx("\"{name}\" siklini faollashtirish?", { name: c.name }), content: tx("Yangi to'lovlar shu sikl bo'yicha amal qiladi. Mavjud to'lovlar o'zgarmaydi."), onOk: () => mut.mutateAsync(() => post(`/settings/cycles/${c.id}/activate`)) })}>{tx("Faollashtirish")}</Button> }] : []),
              ]} />
          </Card>

          <Card title={t('pay.modelTitle')}>
            <p className="m-0 text-sm text-slate-600">{t('pay.modelNote')}</p>
          </Card>

          <Modal open={!!tariffOpen} title={tariffOpen === 'new' ? tx("Yangi tarif") : tx("Tarifni tahrirlash")} onCancel={() => setTariffOpen(null)} onOk={() => tForm.submit()} confirmLoading={mut.isPending} destroyOnHidden>
            <Form form={tForm} layout="vertical" className="mt-4" onFinish={(v) => mut.mutate(() => (tariffOpen === 'new' ? post('/settings/tariffs', v) : patch(`/settings/tariffs/${(tariffOpen as any).id}`, v)))}>
              <Form.Item name="name" label={tx("Nomi")} rules={[{ required: true }]}><Input placeholder={tx("Standart joy — 1,5 m")} /></Form.Item>
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="amount" label={tx("Summa (so'm)")} rules={[{ required: true }]}><InputNumber min={1} step={1000} className="w-full" formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} parser={(v) => Number(String(v).replace(/\s/g, '')) as any} /></Form.Item>
                <Form.Item name="widthMeters" label={tx("Uzunlik (m)")} rules={[{ required: true }]}><InputNumber min={0.1} step={0.5} className="w-full" /></Form.Item>
                <Form.Item name="isDefault" label={tx("Standart")} valuePropName="checked"><Switch /></Form.Item>
                {tariffOpen !== 'new' && <Form.Item name="isActive" label={t('c.active')} valuePropName="checked"><Switch /></Form.Item>}
              </div>
            </Form>
          </Modal>
          <Modal open={cycleOpen} title={tx("Yangi to'lov sikli")} onCancel={() => setCycleOpen(false)} onOk={() => cForm.submit()} confirmLoading={mut.isPending} destroyOnHidden>
            <Form form={cForm} layout="vertical" className="mt-4" onFinish={(v) => mut.mutate(() => post('/settings/cycles', v))}>
              <Form.Item name="name" label={tx("Nomi")} rules={[{ required: true }]}><Input placeholder={tx("Haftalik")} /></Form.Item>
              <Form.Item name="type" label={tx("Turi")} rules={[{ required: true }]}>
                <Select options={[{ value: 'CALENDAR_DAY', label: tx("Kalendar kun (kun oxirigacha)") }, { value: 'FIXED_DURATION', label: tx("Belgilangan davomiylik") }]} />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(a, b) => a.type !== b.type}>
                {({ getFieldValue }) => getFieldValue('type') === 'FIXED_DURATION' && (
                  <Form.Item name="durationMinutes" label={tx("Davomiylik (daqiqa)")} rules={[{ required: true }]} extra={tx("Masalan: 1440 = 1 kun, 10080 = 1 hafta")}>
                    <InputNumber min={1} className="w-full" />
                  </Form.Item>
                )}
              </Form.Item>
              <Form.Item name="description" label={tx("Izoh")}><Input /></Form.Item>
            </Form>
          </Modal>
        </div>
      )}
    </QueryView>
  );
}

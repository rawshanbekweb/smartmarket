import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { errorMessage, get, patch, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { SPACE_STATUSES } from '../lib/types';
import { PageHeader, QueryView, EmptyState } from '../components/common';
import { SPACE_STATUS_STYLE, DemoTag, Chip } from '../components/Status';

interface Row {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isDemo: boolean;
  spaceCount: number;
  statusCounts: Record<string, number>;
  cashiers: { id: string; fullName: string }[];
}

export default function RowsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rows'], queryFn: () => get<Row[]>('/rows') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => get<{ id: string; fullName: string; role: string; isActive: boolean }[]>('/users'), enabled: can('CHIEF') });
  const [editing, setEditing] = useState<Row | null | 'new'>(null);
  const [cashierRow, setCashierRow] = useState<Row | null>(null);
  const [form] = Form.useForm();
  const [cform] = Form.useForm();

  const save = useMutation({
    mutationFn: (v: any) => (editing === 'new' ? post('/rows', v) : patch(`/rows/${(editing as Row).id}`, v)),
    onSuccess: () => { message.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['rows'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setEditing(null); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const assign = useMutation({
    mutationFn: (v: { cashierIds: string[] }) => put(`/rows/${cashierRow!.id}/cashiers`, v),
    onSuccess: () => { message.success('Kassirlar biriktirildi'); qc.invalidateQueries({ queryKey: ['rows'] }); setCashierRow(null); },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title={t('nav.rows')}
        subtitle="Qatorlar soni va tarkibi kod o'zgartirmasdan boshqariladi"
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={() => { form.resetFields(); setEditing('new'); }}>{t('c.add')}</Button>}
      />
      <QueryView q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState text="Qatorlar hali yaratilmagan" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => {
                const total = r.spaceCount || 1;
                return (
                  <div key={r.id} className={`sm-card p-4 ${r.isActive ? '' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold">{r.name} <DemoTag show={r.isDemo} /> {!r.isActive && <Chip tone="neutral">{t('c.inactive')}</Chip>}</div>
                        <div className="text-xs text-slate-500">Kod: {r.code} · {r.spaceCount} ta faol joy</div>
                      </div>
                      <div className="flex gap-1">
                        {can('CHIEF') && <Button size="small" icon={<Users size={13} />} onClick={() => { cform.setFieldsValue({ cashierIds: r.cashiers.map((c) => c.id) }); setCashierRow(r); }} />}
                        <Button size="small" onClick={() => { form.setFieldsValue(r); setEditing(r); }}>{t('c.edit')}</Button>
                      </div>
                    </div>
                    <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                      {SPACE_STATUSES.map((s) => (
                        <div key={s} style={{ width: `${((r.statusCounts[s] ?? 0) / total) * 100}%`, background: SPACE_STATUS_STYLE[s].fill === '#ffffff' ? '#cbd5e1' : SPACE_STATUS_STYLE[s].fill }} title={`${t(`space.${s}`)}: ${r.statusCounts[s] ?? 0}`} />
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      {SPACE_STATUSES.map((s) => (
                        <div key={s} className="flex flex-col">
                          <span className="truncate text-slate-500">{t(`space.${s}`)}</span>
                          <span className="tabular text-sm font-semibold">{r.statusCounts[s] ?? 0}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-0 border-t border-solid border-slate-100 pt-3 text-xs">
                      <span className="text-slate-500">Kassir: {r.cashiers.map((c) => c.fullName).join(', ') || '—'}</span>
                      <Link to={`/spaces?rowId=${r.id}`}>Joylar →</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </QueryView>

      <Modal open={!!editing} title={editing === 'new' ? 'Yangi qator' : 'Qatorni tahrirlash'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={save.isPending} okText={t('c.save')} destroyOnHidden>
        <Form form={form} layout="vertical" className="mt-4" onFinish={(v) => save.mutate(v)}>
          <div className="grid grid-cols-3 gap-3">
            <Form.Item name="code" label="Kod" rules={[{ required: true, max: 10 }]}><Input placeholder="G" /></Form.Item>
            <Form.Item name="name" label="Nomi" className="col-span-2" rules={[{ required: true }]}><Input placeholder="G qator" /></Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="sortOrder" label="Tartib raqami" initialValue={0}><InputNumber min={0} className="w-full" /></Form.Item>
            {editing !== 'new' && <Form.Item name="isActive" label={t('c.active')} valuePropName="checked"><Switch /></Form.Item>}
          </div>
        </Form>
      </Modal>

      <Modal open={!!cashierRow} title={`${cashierRow?.name}: kassirlar`} onCancel={() => setCashierRow(null)} onOk={() => cform.submit()} confirmLoading={assign.isPending} okText={t('c.save')}>
        <p className="text-xs text-slate-500">Shikoyat kelganda kassir faqat qatorga bitta kassir biriktirilgan bo'lsa avtomatik bog'lanadi.</p>
        <Form form={cform} onFinish={(v) => assign.mutate({ cashierIds: v.cashierIds ?? [] })}>
          <Form.Item name="cashierIds">
            <Select mode="multiple" options={users.data?.filter((u) => u.role === 'CASHIER' && u.isActive).map((u) => ({ value: u.id, label: u.fullName }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

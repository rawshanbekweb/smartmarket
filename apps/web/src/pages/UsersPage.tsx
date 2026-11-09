import { useState } from 'react';
import { App, Button, Form, Input, Modal, Select, Switch, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { errorMessage, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { PageHeader, Card, ErrorState } from '../components/common';
import { Chip, DemoTag } from '../components/Status';

interface User {
  id: string;
  fullName: string;
  username: string;
  role: 'CHIEF' | 'MARKET_ADMIN' | 'CASHIER';
  phone: string | null;
  isActive: boolean;
  isDemo: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const { t } = useI18n();
  const { me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [form] = Form.useForm();
  const q = useQuery({ queryKey: ['users'], queryFn: () => get<User[]>('/users') });
  const save = useMutation({
    mutationFn: (v: any) => {
      const body = { ...v };
      if (!body.password) delete body.password;
      if (editing === 'new') return post('/users', body);
      delete body.username;
      return patch(`/users/${(editing as User).id}`, body);
    },
    onSuccess: () => { message.success('Saqlandi'); setEditing(null); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const isNew = editing === 'new';

  return (
    <div>
      <PageHeader
        title={t('nav.users')}
        subtitle="Boshqaruv foydalanuvchilarini faqat rahbar yaratadi. O'zini ro'yxatdan o'tkazish yo'q."
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={() => { form.resetFields(); form.setFieldsValue({ role: 'CASHIER' }); setEditing('new'); }}>{t('c.add')}</Button>}
      />
      <Card bodyClass="p-0">
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <Table<User>
            rowKey="id"
            loading={q.isLoading}
            dataSource={q.data}
            pagination={false}
            scroll={{ x: 800 }}
            columns={[
              { title: 'F.I.Sh.', key: 'n', render: (_, u) => <span className="flex items-center gap-2 font-medium">{u.fullName} <DemoTag show={u.isDemo} /></span> },
              { title: 'Login', dataIndex: 'username', render: (v) => <span className="font-mono text-xs">{v}</span> },
              { title: 'Rol', key: 'r', render: (_, u) => <Chip tone={u.role === 'CHIEF' ? 'violet' : u.role === 'MARKET_ADMIN' ? 'info' : 'neutral'} dot={false}>{t(`role.${u.role}`)}</Chip> },
              { title: 'Telefon', dataIndex: 'phone', render: (v) => v ?? '—' },
              { title: t('c.status'), key: 's', render: (_, u) => (u.isActive ? <Chip tone="ok">{t('c.active')}</Chip> : <Chip tone="neutral">{t('c.inactive')}</Chip>) },
              { title: 'Oxirgi kirish', key: 'l', render: (_, u) => fmtDateTime(u.lastLoginAt) },
              { title: '', key: 'a', render: (_, u) => <Button size="small" onClick={() => { form.setFieldsValue({ ...u, password: '' }); setEditing(u); }}>{t('c.edit')}</Button> },
            ]}
          />
        )}
      </Card>
      <Modal open={!!editing} title={isNew ? "Foydalanuvchi qo'shish" : 'Foydalanuvchini tahrirlash'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={save.isPending} okText={t('c.save')} destroyOnHidden>
        <Form form={form} layout="vertical" className="mt-4" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="fullName" label="F.I.Sh." rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="username" label="Login" rules={[{ required: isNew, pattern: /^[a-z0-9._-]{3,32}$/, message: '3-32 ta kichik lotin harf/raqam' }]}><Input disabled={!isNew} /></Form.Item>
            <Form.Item name="role" label="Rol" rules={[{ required: true }]}>
              <Select disabled={!isNew && (editing as User)?.id === me?.user.id} options={['CHIEF', 'MARKET_ADMIN', 'CASHIER'].map((r) => ({ value: r, label: t(`role.${r}`) }))} />
            </Form.Item>
            <Form.Item name="phone" label="Telefon"><Input placeholder="+998 90 123 45 67" /></Form.Item>
            {!isNew && <Form.Item name="isActive" label={t('c.active')} valuePropName="checked"><Switch disabled={(editing as User)?.id === me?.user.id} /></Form.Item>}
          </div>
          <Form.Item name="password" label={isNew ? 'Parol' : "Yangi parol (o'zgartirmaslik uchun bo'sh qoldiring)"} rules={[{ required: isNew, min: 8, message: 'Kamida 8 belgi, harf va raqam' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

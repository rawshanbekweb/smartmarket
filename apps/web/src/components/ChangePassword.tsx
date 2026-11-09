import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal } from 'antd';
import { KeyRound, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

/** Mirrors the server policy (services/auth.service.ts) so users see problems before submitting. */
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;

function ChangePasswordForm({ onDone, submitLabel }: { onDone: () => void; submitLabel: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (v: { currentPassword: string; newPassword: string }) => {
    setError(null);
    setLoading(true);
    try {
      await post('/auth/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      await qc.invalidateQueries({ queryKey: ['me'] });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
      {error && <Alert type="error" showIcon message={error} className="mb-4" />}
      <Form.Item name="currentPassword" label={t('pw.current')} rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" autoFocus />
      </Form.Item>
      <Form.Item name="newPassword" label={t('pw.new')} extra={t('pw.policy')} rules={[{ required: true }, { pattern: PASSWORD_RULE, message: t('pw.policy') }]}>
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="confirm"
        label={t('pw.confirm')}
        dependencies={['newPassword']}
        rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator: (_, v) => (!v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error(t('pw.mismatch')))),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>
        {submitLabel}
      </Button>
    </Form>
  );
}

/** Full-screen gate shown while the account still uses a password handed out by the CHIEF. */
export function ForcedPasswordChange() {
  const { me, logout } = useAuth();
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-solid border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <KeyRound size={20} />
          </span>
          <div>
            <h1 className="m-0 text-lg font-semibold">{t('pw.forcedTitle')}</h1>
            <div className="text-xs text-slate-500">@{me?.user.username}</div>
          </div>
        </div>
        <p className="mb-5 mt-0 text-sm text-slate-600">{t('pw.forcedText')}</p>
        <ChangePasswordForm onDone={() => undefined} submitLabel={t('pw.submit')} />
        <Button type="link" block className="mt-2" icon={<LogOut size={14} />} onClick={() => void logout()}>
          {t('top.logout')}
        </Button>
      </div>
    </div>
  );
}

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  return (
    <Modal open={open} title={t('pw.title')} onCancel={onClose} footer={null} destroyOnHidden>
      <p className="mt-0 text-xs text-slate-500">{t('pw.otherDevices')}</p>
      <ChangePasswordForm
        submitLabel={t('pw.submit')}
        onDone={() => {
          message.success(t('pw.changed'));
          onClose();
        }}
      />
    </Modal>
  );
}

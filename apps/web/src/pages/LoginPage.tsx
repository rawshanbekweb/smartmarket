import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Segmented } from 'antd';
import { Lock, Store, User, ShieldCheck, Cctv, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { errorMessage, get } from '../lib/api';
import { homeFor } from '../components/AppLayout';

const DEMO = [
  { u: 'chief', role: 'CHIEF' },
  { u: 'admin', role: 'MARKET_ADMIN' },
  { u: 'kassir1', role: 'CASHIER' },
];

export function LoginPage() {
  const { me, login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const health = useQuery({ queryKey: ['health'], queryFn: () => get<{ demoMode: boolean }>('/health'), retry: false });

  // Download the landing pages' code while the user types, so the first screen after login renders immediately.
  useEffect(() => {
    import('./DashboardPage').catch(() => undefined);
    import('./CashierPage').catch(() => undefined);
  }, []);

  if (me) return <Navigate to={loc.state?.from ?? homeFor(me.user.role)} replace />;

  const submit = async (v: { username: string; password: string }) => {
    setError(null);
    setLoading(true);
    try {
      const session = await login(v.username, v.password);
      nav(loc.state?.from ?? (session ? homeFor(session.user.role) : '/'), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const isDev = !!health.data?.demoMode;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f172a] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Store size={24} />
          </span>
          <span className="text-lg font-bold tracking-wide">SMART MARKET</span>
        </div>
        <div className="max-w-lg">
          <h2 className="m-0 text-[34px] font-semibold leading-tight">
            {lang === 'ru' ? 'Каждое занятое место — с подтверждённой оплатой.' : "Har bir band joy — tasdiqlangan to'lov bilan."}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            {lang === 'ru'
              ? 'Учёт торговых мест, кассовые платежи с чеками, видеонаблюдение за занятостью и контроль расхождений в одной системе.'
              : "Savdo joylari hisobi, chekli kassa to'lovlari, kamera orqali bandlik nazorati va nomuvofiqliklarni aniqlash — yagona tizimda."}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { i: <Wallet size={18} />, l: lang === 'ru' ? 'Касса и чеки' : 'Kassa va cheklar' },
              { i: <Cctv size={18} />, l: lang === 'ru' ? 'Камеры' : 'Kameralar' },
              { i: <ShieldCheck size={18} />, l: lang === 'ru' ? 'Аудит' : 'Audit' },
            ].map((x) => (
              <div key={x.l} className="rounded-xl border border-solid border-white/10 bg-white/5 p-3 text-[13px] text-slate-200">
                <div className="mb-2 text-emerald-400">{x.i}</div>
                {x.l}
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500">© {new Date().getFullYear()} SMART MARKET</div>
      </aside>

      <main className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <Store size={22} className="text-emerald-600" />
              <span className="font-bold">SMART MARKET</span>
            </div>
            <Segmented className="ml-auto" size="small" value={lang} onChange={(v) => setLang(v as 'uz' | 'ru')} options={[{ label: 'UZ', value: 'uz' }, { label: 'RU', value: 'ru' }]} />
          </div>
          <h1 className="m-0 text-2xl font-semibold">{t('login.title')}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{t('login.subtitle')}</p>
          {error && <Alert type="error" showIcon message={error} className="mb-4" />}
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} size="large">
            <Form.Item name="username" label={t('login.username')} rules={[{ required: true }]}>
              <Input prefix={<User size={16} className="text-slate-400" />} autoComplete="username" autoFocus />
            </Form.Item>
            <Form.Item name="password" label={t('login.password')} rules={[{ required: true }]}>
              <Input.Password prefix={<Lock size={16} className="text-slate-400" />} autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('login.submit')}
            </Button>
          </Form>
          {isDev && (
            <div className="mt-8 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4">
              <div className="mb-2 text-xs font-semibold text-amber-800">{t('login.demoAccounts')}</div>
              <div className="flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <Button key={d.u} size="small" onClick={() => form.setFieldsValue({ username: d.u, password: 'Demo@2026' })}>
                    {d.u} · {t(`role.${d.role}`)}
                  </Button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-amber-700">Parol / Пароль: Demo@2026</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

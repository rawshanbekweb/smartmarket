import { Suspense, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Drawer, Dropdown, Input, Layout, Menu, Popover, Segmented, Skeleton, Tooltip } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Grid3x3, Rows3, Cctv, CreditCard, Wallet, BellRing, MessageSquareWarning, BadgePercent,
  FileBarChart, Users, ScrollText, Settings, Bell, LogOut, Search, Menu as MenuIcon, Store, CalendarDays, KeyRound, HandCoins,
} from 'lucide-react';
import { ChangePasswordModal } from './ChangePassword';
import { useAuth, type Role } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { get, post } from '../lib/api';
import { fmtAgo, marketTime } from '../lib/format';
import { useRealtime } from '../lib/realtime';

const { Sider, Header, Content } = Layout;

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  roles: Role[];
  group: string;
}

const ALL: Role[] = ['CHIEF', 'MARKET_ADMIN', 'CASHIER'];
const MGMT: Role[] = ['CHIEF', 'MARKET_ADMIN'];

const NAV: NavItem[] = [
  { key: '/dashboard', icon: <LayoutDashboard size={17} />, label: 'nav.dashboard', roles: MGMT, group: 'monitoring' },
  { key: '/spaces', icon: <Grid3x3 size={17} />, label: 'nav.spaces', roles: ALL, group: 'monitoring' },
  { key: '/rows', icon: <Rows3 size={17} />, label: 'nav.rows', roles: MGMT, group: 'monitoring' },
  { key: '/cameras', icon: <Cctv size={17} />, label: 'nav.cameras', roles: MGMT, group: 'monitoring' },
  { key: '/cashier', icon: <Wallet size={17} />, label: 'nav.cashier', roles: ['CASHIER'], group: 'finance' },
  { key: '/payments', icon: <CreditCard size={17} />, label: 'nav.payments', roles: ALL, group: 'finance' },
  { key: '/collections', icon: <HandCoins size={17} />, label: 'nav.collections', roles: MGMT, group: 'finance' },
  { key: '/alerts', icon: <BellRing size={17} />, label: 'nav.alerts', roles: MGMT, group: 'control' },
  { key: '/complaints', icon: <MessageSquareWarning size={17} />, label: 'nav.complaints', roles: MGMT, group: 'control' },
  { key: '/exemptions', icon: <BadgePercent size={17} />, label: 'nav.exemptions', roles: MGMT, group: 'control' },
  { key: '/reports', icon: <FileBarChart size={17} />, label: 'nav.reports', roles: ['CHIEF'], group: 'admin' },
  { key: '/users', icon: <Users size={17} />, label: 'nav.users', roles: ['CHIEF'], group: 'admin' },
  { key: '/audit', icon: <ScrollText size={17} />, label: 'nav.audit', roles: ['CHIEF'], group: 'admin' },
  { key: '/settings', icon: <Settings size={17} />, label: 'nav.settings', roles: MGMT, group: 'admin' },
];

export const homeFor = (role: Role) => (role === 'CASHIER' ? '/cashier' : '/dashboard');

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton.Input active size="large" style={{ width: 260 }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sm-card p-4">
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
          </div>
        ))}
      </div>
      <div className="sm-card p-4">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    </div>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function Notifications() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => get<{ items: NotificationItem[]; unread: number }>('/notifications'), refetchInterval: 60_000 });
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: (id: string) => post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  const content = (
    <div className="w-[340px]">
      <div className="flex items-center justify-between border-0 border-b border-solid border-slate-100 pb-2">
        <span className="font-semibold">{t('top.notifications')}</span>
        <Button size="small" type="link" onClick={() => readAll.mutate()} disabled={!q.data?.unread}>
          {t('top.markAllRead')}
        </Button>
      </div>
      <div className="max-h-[380px] overflow-y-auto">
        {!q.data?.items.length && <div className="py-8 text-center text-sm text-slate-400">{t('top.noNotifications')}</div>}
        {q.data?.items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              if (!n.readAt) readOne.mutate(n.id);
              setOpen(false);
              if (n.link) nav(n.link);
            }}
            className="flex w-full cursor-pointer gap-2 border-0 border-b border-solid border-slate-50 bg-transparent px-1 py-2.5 text-left hover:bg-slate-50"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-blue-600'}`} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-slate-800">{n.title}</span>
              {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
              <span className="block text-[11px] text-slate-400">{fmtAgo(n.createdAt, lang)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" arrow={false}>
      <Badge count={q.data?.unread ?? 0} size="small" offset={[-4, 4]}>
        <Button type="text" shape="circle" aria-label={t('top.notifications')} icon={<Bell size={18} />} />
      </Badge>
    </Popover>
  );
}

export function AppLayout() {
  const { me, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useRealtime(!!me);
  if (!me) return null;
  const role = me.user.role;

  const items = NAV.filter((n) => n.roles.includes(role));
  const groups = ['monitoring', 'finance', 'control', 'admin']
    .map((g) => ({
      type: 'group' as const,
      key: g,
      label: t(`nav.group.${g}`),
      children: items.filter((i) => i.group === g).map((i) => ({ key: i.key, icon: i.icon, label: <Link to={i.key}>{t(i.label)}</Link> })),
    }))
    .filter((g) => g.children.length);
  const selected = items.find((i) => loc.pathname.startsWith(i.key))?.key ?? '';

  const onSearch = (v: string) => {
    const s = v.trim();
    if (!s) return;
    if (/^SM-/i.test(s) || role === 'CASHIER') nav(`/payments?search=${encodeURIComponent(s)}`);
    else nav(`/spaces?search=${encodeURIComponent(s)}`);
  };

  const menu = (
    <div className="flex h-full flex-col">
      <Link to={homeFor(role)} className="flex items-center gap-2.5 px-5 py-5 no-underline">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <Store size={20} />
        </span>
        <span>
          <span className="block text-[15px] font-bold tracking-wide text-white">SMART MARKET</span>
          <span className="block text-[11px] text-slate-400">{t('login.subtitle')}</span>
        </span>
      </Link>
      <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={groups} onClick={() => setMobileOpen(false)} className="flex-1 border-0" />
      <div className="m-3 rounded-lg bg-white/5 p-3 text-[11px] leading-snug text-slate-400">
        {me.demoMode ? (
          <>
            <span className="font-semibold text-amber-300">DEMO</span> · {t('demo.banner').split('—')[1]?.trim()}
          </>
        ) : (
          me.market?.name
        )}
      </div>
    </div>
  );

  return (
    <Layout className="min-h-screen">
      <Sider width={248} breakpoint="lg" collapsedWidth={0} trigger={null} className="sm-sider !fixed left-0 top-0 z-30 hidden h-screen lg:block">
        {menu}
      </Sider>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" width={260} styles={{ body: { padding: 0, background: '#0f172a' }, header: { display: 'none' } }}>
        <div className="sm-sider h-full">{menu}</div>
      </Drawer>
      <Layout className="lg:ml-[248px]">
        {me.demoMode && (
          <div className="demo-stripes no-print bg-amber-500 px-4 py-1.5 text-center text-[12.5px] font-semibold text-amber-950">{t('demo.banner')}</div>
        )}
        <Header className="no-print sticky top-0 z-20 flex items-center gap-3 border-0 border-b border-solid border-slate-200/80 !px-4 lg:!px-6">
          <Button type="text" className="lg:!hidden" icon={<MenuIcon size={20} />} onClick={() => setMobileOpen(true)} aria-label="menu" />
          <div className="hidden min-w-0 flex-col leading-tight md:flex">
            <span className="truncate text-[14px] font-semibold text-slate-900">{me.market?.name ?? 'SMART MARKET'}</span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays size={12} /> {marketTime(new Date())?.format('DD.MM.YYYY, dddd')}
            </span>
          </div>
          <div className="mx-auto w-full max-w-md">
            <Input.Search
              allowClear
              placeholder={t('top.search')}
              prefix={<Search size={15} className="text-slate-400" />}
              onSearch={onSearch}
              aria-label={t('c.search')}
            />
          </div>
          <Segmented size="small" value={lang} onChange={(v) => setLang(v as 'uz' | 'ru')} options={[{ label: 'UZ', value: 'uz' }, { label: 'RU', value: 'ru' }]} />
          <Notifications />
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'who', label: <div className="text-xs text-slate-500">@{me.user.username} · {t(`role.${role}`)}</div>, disabled: true },
                { type: 'divider' },
                { key: 'password', icon: <KeyRound size={14} />, label: t('pw.title'), onClick: () => setPasswordOpen(true) },
                { key: 'logout', icon: <LogOut size={14} />, label: t('top.logout'), danger: true, onClick: async () => { await logout(); nav('/login'); } },
              ],
            }}
          >
            <button type="button" className="flex cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-1.5 py-1 hover:bg-slate-100">
              <Avatar size={32} style={{ background: '#1e2b47', fontWeight: 600 }}>
                {me.user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </Avatar>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block max-w-[180px] truncate text-[13px] font-medium text-slate-800">{me.user.fullName}</span>
                <span className="block text-[11px] text-slate-500">{t(`role.${role}`)}</span>
              </span>
            </button>
          </Dropdown>
          <Tooltip title={t('top.logout')}>
            <Button type="text" shape="circle" icon={<LogOut size={17} />} onClick={async () => { await logout(); nav('/login'); }} aria-label={t('top.logout')} />
          </Tooltip>
        </Header>
        <Content className="mx-auto w-full max-w-[1600px] p-4 lg:p-6">
          {/* Page chunks suspend here, so the shell (sidebar, header) never disappears during navigation. */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Layout>
  );
}

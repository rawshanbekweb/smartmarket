import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Segmented, Skeleton, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  Grid3x3, Users2, SquareDashed, CircleCheck, CircleAlert, BellRing, Banknote, Cctv, RefreshCw, ArrowRight,
} from 'lucide-react';
import { get, type Paged } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { daysAgoKey, fmtAgo, fmtMoney, fmtNum, fmtTime, todayKey } from '../lib/format';
import type { Alert, Camera, OccupancyRow, SpaceStatus } from '../lib/types';
import { PageHeader, Card, QueryView, EmptyState } from '../components/common';
import { KpiCard } from '../components/KpiCard';
import { OccupancyGrid, StatusLegend } from '../components/OccupancyGrid';
import { SpaceDrawer } from '../components/SpaceDrawer';
import { RevenueChart, type RevenuePoint } from '../components/charts';
import { AlertStatusChip, CameraStatusChip, SeverityChip, DemoTag } from '../components/Status';
import { SimulatedPreview } from '../components/CameraPreview';
import { PaymentsTable } from '../components/PaymentsTable';
import { colors } from '../theme';

interface Summary {
  generatedAt: string;
  totalSpaces: number;
  occupied: number;
  free: number;
  paid: number;
  unpaidOccupied: number;
  exempted: number;
  unknown: number;
  cameraUnavailableSpaces: number;
  statusCounts: Record<SpaceStatus, number>;
  activeAlerts: number;
  criticalAlerts: number;
  paymentsToday: { amount: number; count: number; pending: number };
  paymentsYesterdaySameTime: { amount: number; count: number };
  cameras: { total: number; online: number; byStatus: Record<string, number> };
}

interface Distribution {
  cash: { amount: number; count: number };
  electronic: { amount: number; count: number };
  pendingSync: { amount: number; count: number };
  cancelled: { amount: number; count: number };
  failed: { amount: number; count: number };
  confirmedRevenue: number;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function Kpis({ s }: { s: Summary }) {
  const { t } = useI18n();
  const f = (key: string, a: number | string, b?: number | string) => t(key).replace('{a}', String(a)).replace('{b}', String(b ?? ''));
  const y = s.paymentsYesterdaySameTime.amount;
  const delta = y > 0 ? { pct: ((s.paymentsToday.amount - y) / y) * 100, label: t('hint.vsYesterday') } : null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
      <KpiCard label={t('kpi.total')} value={fmtNum(s.totalSpaces)} icon={<Grid3x3 size={17} />} tone="info" hint={f('hint.unknownNoCam', s.unknown, s.cameraUnavailableSpaces)} to="/spaces" />
      <KpiCard label={t('kpi.occupied')} value={fmtNum(s.occupied)} icon={<Users2 size={17} />} tone="neutral" hint={f('hint.occupancy', pct(s.occupied, s.totalSpaces))} to="/spaces?occupancy=OCCUPIED" />
      <KpiCard label={t('kpi.free')} value={fmtNum(s.free)} icon={<SquareDashed size={17} />} tone="neutral" hint={f('hint.free', pct(s.free, s.totalSpaces))} to="/spaces?status=FREE" />
      <KpiCard label={t('kpi.paid')} value={fmtNum(s.paid)} icon={<CircleCheck size={17} />} tone="ok" hint={f('hint.exempt', s.exempted)} to="/spaces?paymentState=PAID" />
      <KpiCard label={t('kpi.unpaid')} value={<span className={s.unpaidOccupied ? 'text-red-600' : ''}>{fmtNum(s.unpaidOccupied)}</span>} icon={<CircleAlert size={17} />} tone={s.unpaidOccupied ? 'bad' : 'ok'} hint={t(s.unpaidOccupied ? 'hint.checkNow' : 'hint.noMismatch')} to="/spaces?status=OCCUPIED_UNPAID" />
      <KpiCard label={t('kpi.alerts')} value={fmtNum(s.activeAlerts)} icon={<BellRing size={17} />} tone={s.criticalAlerts ? 'bad' : s.activeAlerts ? 'warn' : 'ok'} hint={f('hint.critical', s.criticalAlerts)} to="/alerts?status=ACTIVE" />
      <KpiCard label={t('kpi.today')} value={<span className="text-[22px]">{fmtMoney(s.paymentsToday.amount)}</span>} icon={<Banknote size={17} />} tone="ok" delta={delta} hint={f('hint.countPending', s.paymentsToday.count, s.paymentsToday.pending)} to="/payments" />
      <KpiCard label={t('kpi.cameras')} value={`${s.cameras.online}/${s.cameras.total}`} icon={<Cctv size={17} />} tone={s.cameras.online < s.cameras.total ? 'warn' : 'ok'} hint={f('hint.working', pct(s.cameras.online, s.cameras.total))} to="/cameras" />
    </div>
  );
}

function DistributionPanel({ d }: { d: Distribution }) {
  const { t } = useI18n();
  const rows = [
    { key: 'cash', label: t('dist.cash'), v: d.cash, color: colors.series1, revenue: true },
    { key: 'electronic', label: t('dist.electronic'), v: d.electronic, color: colors.series2, revenue: true },
    { key: 'pending', label: t('dist.pendingSync'), v: d.pendingSync, color: '#94a3b8', revenue: false },
    { key: 'cancelled', label: t('dist.cancelled'), v: d.cancelled, color: '#cbd5e1', revenue: false },
  ];
  const max = Math.max(...rows.map((r) => r.v.amount), 1);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <div className="text-xs text-slate-500">Tasdiqlangan tushum</div>
        <div className="tabular text-2xl font-semibold text-slate-900">{fmtMoney(d.confirmedRevenue)}</div>
      </div>
      <div className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-slate-600">{r.label}</span>
              <span className="tabular font-semibold text-slate-900">
                {fmtMoney(r.v.amount)} <span className="font-normal text-slate-400">· {r.v.count}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (r.v.amount / max) * 100)}%`, background: r.color, ...(r.revenue ? {} : { backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.55) 0 3px, transparent 3px 6px)' }) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4 text-[11px] leading-snug text-slate-400">{t('dist.note')}</div>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const { t, lang } = useI18n();
  if (!alerts.length) return <EmptyState text="Faol hodisalar yo'q" />;
  return (
    <div className="-mx-1 flex flex-col">
      {alerts.map((a) => (
        <Link key={a.id} to={`/alerts/${a.id}`} className="flex gap-3 rounded-lg px-1 py-2.5 text-inherit no-underline hover:bg-slate-50">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.severity === 'CRITICAL' ? 'bg-red-500' : a.severity === 'WARNING' ? 'bg-amber-500' : 'bg-blue-500'}`} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium text-slate-800">{t(`at.${a.type}`)}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{fmtAgo(a.detectedAt, lang)}</span>
            </span>
            <span className="block truncate text-xs text-slate-500">
              {a.space ? `${a.space.number} · ${a.space.row.name}` : a.camera ? `${a.camera.code} · ${a.camera.name}` : a.title}
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              <AlertStatusChip status={a.status} />
              <SeverityChip severity={a.severity} />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const isChief = can('CHIEF');
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<SpaceStatus | null>(null);

  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => get<Summary>('/dashboard/summary'), refetchInterval: 30_000 });
  const occupancy = useQuery({ queryKey: ['dashboard', 'occupancy'], queryFn: () => get<OccupancyRow[]>('/dashboard/occupancy'), refetchInterval: 30_000 });
  const rangeParams = { from: daysAgoKey(range - 1), to: todayKey() };
  const revenue = useQuery({ queryKey: ['dashboard', 'revenue', range], queryFn: () => get<{ series: RevenuePoint[] }>('/dashboard/revenue', rangeParams) });
  const dist = useQuery({ queryKey: ['dashboard', 'distribution', range], queryFn: () => get<Distribution>('/dashboard/payment-distribution', rangeParams) });
  const alerts = useQuery({ queryKey: ['alerts', 'latest'], queryFn: () => get<Paged<Alert>>('/alerts', { pageSize: 8 }), refetchInterval: 30_000 });
  const cameras = useQuery({ queryKey: ['cameras'], queryFn: () => get<Camera[]>('/cameras') });

  const zonesByCamera = useMemo(() => {
    const m = new Map<string, { key: string; label: string; status: SpaceStatus }[]>();
    for (const r of occupancy.data ?? []) for (const s of r.spaces) if (s.cameraCode) {
      if (!m.has(s.cameraCode)) m.set(s.cameraCode, []);
      m.get(s.cameraCode)!.push({ key: s.id, label: s.number, status: s.status });
    }
    return m;
  }, [occupancy.data]);

  const refreshAll = () => [summary, occupancy, revenue, dist, alerts, cameras].forEach((q) => q.refetch());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('dash.title')}
        subtitle={
          <span>
            {t('dash.subtitle')}
            {summary.data && <span className="text-slate-400"> · {t('dash.updated')} {fmtTime(summary.data.generatedAt)}</span>}
          </span>
        }
        extra={
          <Tooltip title={t('c.refresh')}>
            <Button icon={<RefreshCw size={15} />} onClick={refreshAll} loading={summary.isFetching}>
              {t('c.refresh')}
            </Button>
          </Tooltip>
        }
      />

      <QueryView q={summary} rows={3}>
        {(s) => <Kpis s={s} />}
      </QueryView>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={t('dash.occupancy')}
          extra={<span className="hidden text-xs text-slate-400 md:inline">{t('dash.occupancyHint')}</span>}
        >
          <div className="mb-4">
            <StatusLegend counts={summary.data?.statusCounts} active={filter} onToggle={(s) => setFilter((f) => (f === s ? null : s))} />
          </div>
          <QueryView q={occupancy} rows={6}>
            {(rows) => <OccupancyGrid rows={rows} onSelect={setSelected} filter={filter} />}
          </QueryView>
        </Card>
        <Card
          title={t('dash.latestAlerts')}
          extra={
            <Link to="/alerts" className="flex items-center gap-1 text-xs">
              {t('c.viewAll')} <ArrowRight size={12} />
            </Link>
          }
        >
          <QueryView q={alerts} rows={8}>
            {(d) => <AlertsPanel alerts={d.items} />}
          </QueryView>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={t('dash.revenue')}
          extra={
            <Segmented
              size="small"
              value={range}
              onChange={(v) => setRange(v as 7 | 14 | 30)}
              options={[
                { value: 7, label: t('range.7') },
                { value: 14, label: t('range.14') },
                { value: 30, label: t('range.30') },
              ]}
            />
          }
        >
          <QueryView q={revenue} rows={7}>
            {(d) => <RevenueChart data={d.series} />}
          </QueryView>
        </Card>
        <Card title={`${t('dash.distribution')} · ${range} kun`}>
          <QueryView q={dist} rows={6}>
            {(d) => <DistributionPanel d={d} />}
          </QueryView>
        </Card>
      </div>

      <Card
        title={
          <span className="flex items-center gap-2">
            {t('dash.cameras')} <DemoTag show={cameras.data?.some((c) => c.isDemo)} />
          </span>
        }
        extra={
          <Link to="/cameras" className="flex items-center gap-1 text-xs">
            {t('c.viewAll')} <ArrowRight size={12} />
          </Link>
        }
      >
        {cameras.isLoading ? (
          <Skeleton active />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {(cameras.data ?? []).map((c) => (
              <Link key={c.id} to={`/cameras/${c.id}`} className="rounded-xl border border-solid border-slate-200 p-2.5 text-inherit no-underline transition-shadow hover:shadow-md">
                {c.provider === 'DEMO' ? (
                  <SimulatedPreview compact zones={zonesByCamera.get(c.code) ?? []} cameraStatus={c.status} label="DEMO simulyatsiya" />
                ) : (
                  <div className="flex items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-500" style={{ aspectRatio: '16/9' }}>
                    Jonli ko'rinish ulanmagan
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-slate-800">{c.name}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{c.code}</span>
                  </span>
                  <CameraStatusChip status={c.status} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                  <span>{c.assignedSpaces} joy</span>
                  <span>{t('c.lastHeartbeat')}: {fmtTime(c.lastHeartbeatAt)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">Monitoring: {c.monitoringEnabled ? 'yoqilgan' : "o'chirilgan"}</div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('dash.recent')} extra={isChief && <Link to="/reports" className="text-xs">{t('nav.reports')} →</Link>}>
        <PaymentsTable pageSize={8} compact />
      </Card>

      <SpaceDrawer spaceId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

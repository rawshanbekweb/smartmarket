import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { colors } from '../theme';
import { fmtCompact, fmtMoney } from '../lib/format';
import { useI18n } from '../lib/i18n';

export interface RevenuePoint {
  date: string;
  cash: number;
  electronic: number;
  total: number;
  count: number;
}

function RevenueTooltip({ active, payload, label }: any) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as RevenuePoint;
  return (
    <div className="rounded-lg border border-solid border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-slate-800">{dayjs(label).format('DD.MM.YYYY, dd')}</div>
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: colors.series1 }} />{t('chart.cash')}</span>
        <span className="tabular font-medium text-slate-900">{fmtMoney(p.cash)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: colors.series2 }} />{t('chart.electronic')}</span>
        <span className="tabular font-medium text-slate-900">{fmtMoney(p.electronic)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-6 border-0 border-t border-solid border-slate-100 pt-1">
        <span className="font-semibold text-slate-700">{t('chart.total')}</span>
        <span className="tabular font-semibold text-slate-900">{fmtMoney(p.total)}</span>
      </div>
      <div className="text-slate-400">{p.count} ta to'lov</div>
    </div>
  );
}

/** Stacked daily revenue (cash + electronic = total). Single y-axis; only SUCCESS payments. */
export function RevenueChart({ data, height = 280 }: { data: RevenuePoint[]; height?: number }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.series1 }} />{t('chart.cash')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.series2 }} />{t('chart.electronic')}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="0" />
          <XAxis dataKey="date" tickFormatter={(d) => dayjs(d).format('DD.MM')} tick={{ fontSize: 11, fill: colors.ink2 }} axisLine={{ stroke: colors.axis }} tickLine={false} minTickGap={8} />
          <YAxis tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11, fill: colors.ink2 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(15,23,42,.04)' }} />
          <Bar dataKey="cash" stackId="r" fill={colors.series1} stroke="#fff" strokeWidth={1} name={t('chart.cash')} />
          <Bar dataKey="electronic" stackId="r" fill={colors.series2} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} name={t('chart.electronic')} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

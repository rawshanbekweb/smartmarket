import { useState } from 'react';
import { App, Button, DatePicker, Input, Table } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { Download, FileBarChart } from 'lucide-react';
import { api, errorMessage, get } from '../lib/api';
import { useI18n, tx, txServer } from '../lib/i18n';
import { daysAgoKey, downloadBlob, fmtDateTime, fmtMoney, fmtNum, todayKey } from '../lib/format';
import { PageHeader, Card, QueryView } from '../components/common';

interface ReportCol { key: string; title: string; type?: 'money' | 'number' | 'date' | 'text' | 'percent' }
interface Report {
  type: string;
  title: string;
  from: string;
  to: string;
  columns: ReportCol[];
  rows: Record<string, any>[];
  summary: { label: string; value: number | string; type?: ReportCol['type'] }[];
}

const fmt = (v: any, type?: ReportCol['type']) => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return fmtMoney(Number(v));
  if (type === 'number') return fmtNum(Number(v));
  if (type === 'percent') return `${v}%`;
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dayjs(v).format('DD.MM.YYYY') : fmtDateTime(v);
  return String(v);
};

export default function ReportsPage() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [type, setType] = useState('daily-summary');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(daysAgoKey(29)), dayjs(todayKey())]);
  const [search, setSearch] = useState<string>();
  const [downloading, setDownloading] = useState(false);
  const types = useQuery({ queryKey: ['reports', 'types'], queryFn: () => get<{ type: string; title: string }[]>('/reports') });
  const params = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), search };
  const q = useQuery({ queryKey: ['reports', type, params], queryFn: () => get<Report>(`/reports/${type}`, params), placeholderData: keepPreviousData });

  const exportCsv = async () => {
    setDownloading(true);
    try {
      const r = await api.get(`/reports/${type}`, { params: { ...params, format: 'csv' }, responseType: 'blob' });
      downloadBlob(r.data, `smart-market-${type}-${params.from}_${params.to}.csv`);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.reports')}
        subtitle={tx("Barcha hisobotlar ma'lumotlar bazasidagi yozuvlardan hisoblanadi. Tushumga faqat muvaffaqiyatli to'lovlar kiradi.")}
        extra={<Button type="primary" icon={<Download size={15} />} loading={downloading} onClick={exportCsv}>{t('c.export')}</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card bodyClass="p-2">
          <nav className="flex flex-col gap-0.5">
            {types.data?.map((r) => (
              <button key={r.type} type="button" onClick={() => setType(r.type)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border-0 px-3 py-2 text-left text-[13px] ${type === r.type ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-transparent text-slate-700 hover:bg-slate-50'}`}>
                <FileBarChart size={14} className="shrink-0" /> {txServer(r.title)}
              </button>
            ))}
          </nav>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker.RangePicker value={range} format="DD.MM.YYYY" allowClear={false} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
                presets={[
                  { label: tx("Bugun"), value: [dayjs(), dayjs()] },
                  { label: tx("7 kun"), value: [dayjs().subtract(6, 'day'), dayjs()] },
                  { label: tx("30 kun"), value: [dayjs().subtract(29, 'day'), dayjs()] },
                ]} />
              <Input.Search allowClear placeholder={t('c.search')} onSearch={(v) => setSearch(v || undefined)} className="w-full sm:w-64" />
            </div>
          </Card>
          <QueryView q={q} rows={8}>
            {(r) => (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  {r.summary.map((s) => (
                    <div key={s.label} className="sm-card p-4">
                      <div className="text-xs text-slate-500">{txServer(s.label)}</div>
                      <div className="tabular mt-1 text-xl font-semibold">{fmt(s.value, s.type)}</div>
                    </div>
                  ))}
                </div>
                <Card title={`${txServer(r.title)} · ${dayjs(r.from).format('DD.MM.YYYY')} — ${dayjs(r.to).format('DD.MM.YYYY')}`} bodyClass="p-0">
                  <Table
                    rowKey={(row) => JSON.stringify(row)}
                    size="middle"
                    loading={q.isFetching}
                    dataSource={r.rows}
                    scroll={{ x: 900 }}
                    pagination={{ pageSize: 25, showSizeChanger: false, showTotal: (n) => tx("{n} ta qator", { n }) }}
                    columns={r.columns.map((c) => ({
                      title: txServer(c.title),
                      dataIndex: c.key,
                      align: c.type === 'money' || c.type === 'number' || c.type === 'percent' ? ('right' as const) : undefined,
                      render: (v: any) => <span className={c.type === 'money' || c.type === 'number' ? 'tabular' : ''}>{fmt(v, c.type)}</span>,
                    }))}
                  />
                </Card>
              </>
            )}
          </QueryView>
        </div>
      </div>
    </div>
  );
}

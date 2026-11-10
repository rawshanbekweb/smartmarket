import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Segmented } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cctv, CheckCheck, TriangleAlert } from 'lucide-react';
import { errorMessage, get, post } from '../lib/api';
import { tx } from '../lib/i18n';
import { fmtTime, marketTime } from '../lib/format';
import type { OccupancyRow, OccupancySpace } from '../lib/types';
import { PageHeader, QueryView, EmptyState, SimulatedNotice } from '../components/common';
import { PaymentStateChip } from '../components/Status';

type Mark = 'OCCUPIED' | 'FREE';

/** A check counts for the market day it was made on (the server resets older ones). */
const checkedToday = (s: OccupancySpace) =>
  s.occupancyState !== 'UNKNOWN' && !!s.lastDetectedAt && marketTime(s.lastDetectedAt)!.isSame(marketTime(new Date())!, 'day');
const cameraDown = (s: OccupancySpace) => s.cameraStatus === 'OFFLINE' || s.cameraStatus === 'MAINTENANCE';
const cameraLive = (s: OccupancySpace) => !!s.cameraStatus && !cameraDown(s);

/**
 * Camera-less pilot: an administrator walks a row and marks every space occupied or free.
 * Occupied spaces without a valid payment or exemption raise the usual unpaid alert.
 */
export default function RoundPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dashboard', 'occupancy'], queryFn: () => get<OccupancyRow[]>('/dashboard/occupancy'), refetchInterval: 30_000 });
  const [rowId, setRowId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, Mark>>({});

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const row = rows.find((r) => r.id === rowId) ?? rows[0];

  const refresh = () => {
    for (const key of ['dashboard', 'spaces', 'rows', 'alerts']) qc.invalidateQueries({ queryKey: [key] });
  };
  const mark = useMutation({
    mutationFn: (v: { spaceId: string; state: Mark }) => post(`/spaces/${v.spaceId}/occupancy`, { state: v.state }),
    onMutate: (v) => setPending((p) => ({ ...p, [v.spaceId]: v.state })),
    onError: (e) => message.error(errorMessage(e)),
    onSettled: async (_d, _e, v) => {
      await qc.invalidateQueries({ queryKey: ['dashboard', 'occupancy'] });
      setPending((p) => {
        const { [v.spaceId]: _done, ...rest } = p;
        return rest;
      });
      refresh();
    },
  });
  const bulk = useMutation({
    mutationFn: (items: { spaceId: string; state: Mark }[]) => post('/spaces/occupancy/bulk', { items }),
    onSuccess: (_d, items) => {
      message.success(tx("{n} ta joy bo'sh deb belgilandi", { n: items.length }));
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const stateOf = (s: OccupancySpace): Mark | null => pending[s.id] ?? (checkedToday(s) && s.occupancyState !== 'UNKNOWN' ? (s.occupancyState as Mark) : null);
  const stats = useMemo(() => {
    const out = new Map<string, { total: number; done: number; unpaid: number }>();
    for (const r of rows) {
      const mine = r.spaces.filter((s) => !cameraLive(s));
      out.set(r.id, {
        total: mine.length,
        done: mine.filter((s) => checkedToday(s)).length,
        unpaid: r.spaces.filter((s) => s.status === 'OCCUPIED_UNPAID').length,
      });
    }
    return out;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={tx("Aylanma tekshiruv")} subtitle={tx("Qator bo'ylab yurib, har bir joyni band yoki bo'sh deb belgilang. Band, lekin to'lanmagan joy bo'yicha ogohlantirish avtomatik ochiladi.")} />
      <QueryView q={q} rows={8}>
        {() =>
          !row ? (
            <EmptyState text={tx("Qatorlar hali yaratilmagan")} />
          ) : (
            <>
              <Segmented
                value={row.id}
                onChange={(v) => setRowId(String(v))}
                options={rows.map((r) => {
                  const st = stats.get(r.id)!;
                  return {
                    value: r.id,
                    label: (
                      <span className="inline-flex items-center gap-1.5 px-1">
                        <span className="font-semibold">{r.name}</span>
                        <span className={`tabular text-xs ${st.total > 0 && st.done === st.total ? 'text-green-700' : 'text-slate-500'}`}>{st.done}/{st.total}</span>
                        {st.unpaid > 0 && <span className="tabular rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-700">{st.unpaid}</span>}
                      </span>
                    ),
                  };
                })}
              />
              <RowRound
                key={row.id}
                row={row}
                stat={stats.get(row.id)!}
                stateOf={stateOf}
                busy={(id) => id in pending}
                onMark={(spaceId, state) => mark.mutate({ spaceId, state })}
                bulkLoading={bulk.isPending}
                onMarkRestFree={(ids) =>
                  modal.confirm({
                    title: tx("Qolgan {n} ta joyni bo'sh deb belgilash?", { n: ids.length }),
                    content: tx("Faqat hali tekshirilmagan joylar belgilanadi. Xato bo'lsa, joyni alohida tuzatish mumkin."),
                    okText: tx("Bo'sh deb belgilash"),
                    onOk: () => bulk.mutateAsync(ids.map((spaceId) => ({ spaceId, state: 'FREE' as const }))),
                  })
                }
              />
              <SimulatedNotice>{tx("Belgi faqat shu kun uchun amal qiladi: ertasi kuni joylar yana \"noma'lum\" bo'ladi va qayta tekshiriladi. Ishlab turgan kamera ostidagi joylarni kamera o'zi kuzatadi.")}</SimulatedNotice>
            </>
          )
        }
      </QueryView>
    </div>
  );
}

function RowRound({
  row, stat, stateOf, busy, onMark, onMarkRestFree, bulkLoading,
}: {
  row: OccupancyRow;
  stat: { total: number; done: number; unpaid: number };
  stateOf: (s: OccupancySpace) => Mark | null;
  busy: (id: string) => boolean;
  onMark: (spaceId: string, state: Mark) => void;
  onMarkRestFree: (ids: string[]) => void;
  bulkLoading: boolean;
}) {
  const rest = row.spaces.filter((s) => !cameraLive(s) && stateOf(s) === null).map((s) => s.id);
  return (
    <section className="sm-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-0 border-b border-solid border-slate-100 px-4 py-3">
        <div className="text-sm">
          <span className="font-semibold text-slate-900">{tx("Tekshirildi: {a} / {b}", { a: stat.done, b: stat.total })}</span>
          {stat.unpaid > 0 && (
            <Link to={`/spaces?rowId=${row.id}&status=OCCUPIED_UNPAID`} className="ml-3 inline-flex items-center gap-1 font-medium text-red-700">
              <TriangleAlert size={14} /> {tx("Band, to'lanmagan: {n}", { n: stat.unpaid })}
            </Link>
          )}
        </div>
        {rest.length > 0 && (
          <Button icon={<CheckCheck size={15} />} loading={bulkLoading} onClick={() => onMarkRestFree(rest)}>
            {tx("Qolgan {n} tasi bo'sh", { n: rest.length })}
          </Button>
        )}
      </header>
      {row.spaces.length === 0 && <EmptyState text={tx("Bu qatorda joy yo'q")} />}
      <ul className="m-0 grid list-none gap-0 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {row.spaces.map((s) => {
          const state = stateOf(s);
          const unpaid = state === 'OCCUPIED' && s.paymentState === 'UNPAID';
          const live = cameraLive(s);
          return (
            <li key={s.id} className={`flex items-center gap-3 border-0 border-b border-solid border-slate-100 px-4 py-2.5 ${unpaid ? 'bg-red-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link to={`/spaces/${s.id}`} className="text-[17px] font-bold text-slate-900 no-underline">{s.number}</Link>
                  <PaymentStateChip state={s.paymentState} />
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  {live ? (
                    <><Cctv size={12} /> {tx("Kamera kuzatmoqda")}</>
                  ) : state ? (
                    tx("tekshirildi {t}", { t: fmtTime(s.lastDetectedAt) })
                  ) : cameraDown(s) ? (
                    <><Cctv size={12} className="text-amber-600" /> {tx("Kamera ishlamayapti")}</>
                  ) : (
                    tx("tekshirilmagan")
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <MarkButton active={state === 'OCCUPIED'} tone="occupied" disabled={live || busy(s.id)} onClick={() => onMark(s.id, 'OCCUPIED')}>{tx("Band")}</MarkButton>
                <MarkButton active={state === 'FREE'} tone="free" disabled={live || busy(s.id)} onClick={() => onMark(s.id, 'FREE')}>{tx("Bo'sh")}</MarkButton>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MarkButton({ active, tone, disabled, onClick, children }: { active: boolean; tone: 'occupied' | 'free'; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  const on = tone === 'occupied' ? 'border-slate-900 bg-slate-900 text-white' : 'border-green-600 bg-green-600 text-white';
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`h-11 min-w-[68px] cursor-pointer rounded-lg border border-solid px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? on : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}
    >
      {children}
    </button>
  );
}

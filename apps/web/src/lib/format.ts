import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
import { tx } from './i18n';

dayjs.extend(utc);
dayjs.extend(relativeTime);

// Market time is UTC+5 (Asia/Tashkent, no DST). Display in market time regardless of the viewer's device.
const OFFSET = 300;
export const marketTime = (d: string | Date | null | undefined) => (d ? dayjs(d).utcOffset(OFFSET) : null);

export const fmtMoney = (n: number | null | undefined) =>
  `${new Intl.NumberFormat('ru-RU').format(Math.round(n ?? 0)).replace(/[\u00a0\u202f]/g, ' ')} ${tx("so'm")}`;
export const fmtNum = (n: number | null | undefined) => new Intl.NumberFormat('ru-RU').format(n ?? 0).replace(/[\u00a0\u202f]/g, ' ');
export const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} ${tx("mln")}` : n >= 1000 ? `${Math.round(n / 1000)} ${tx("ming")}` : String(n);

export const fmtDateTime = (d: string | Date | null | undefined) => marketTime(d)?.format('DD.MM.YYYY HH:mm') ?? '—';
export const fmtDate = (d: string | Date | null | undefined) => marketTime(d)?.format('DD.MM.YYYY') ?? '—';
export const fmtTime = (d: string | Date | null | undefined) => marketTime(d)?.format('HH:mm') ?? '—';

export function fmtAgo(d: string | Date | null | undefined, lang: 'uz' | 'ru' = 'uz') {
  if (!d) return '—';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return lang === 'ru' ? 'только что' : 'hozirgina';
  if (mins < 60) return lang === 'ru' ? `${mins} мин назад` : `${mins} daq oldin`;
  const h = Math.floor(mins / 60);
  if (h < 24) return lang === 'ru' ? `${h} ч назад` : `${h} soat oldin`;
  return fmtDateTime(d);
}

export const todayKey = () => dayjs().utcOffset(OFFSET).format('YYYY-MM-DD');
export const daysAgoKey = (n: number) => dayjs().utcOffset(OFFSET).subtract(n, 'day').format('YYYY-MM-DD');

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

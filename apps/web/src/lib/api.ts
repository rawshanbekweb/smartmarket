import axios, { AxiosError } from 'axios';
import { tx, txServer } from './i18n';

/** All calls go to the same origin (/api is proxied by Vite in dev and Nginx in prod). */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'X-Requested-With': 'SmartMarket' },
  timeout: 20_000,
});

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export function errorMessage(err: unknown, fallback = tx("Xatolik yuz berdi")): string {
  const e = err as AxiosError<ApiErrorBody>;
  if (e?.response?.data?.error?.message) {
    const details = e.response.data.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
    const field = details?.fieldErrors && Object.entries(details.fieldErrors)[0];
    const message = txServer(e.response.data.error.message);
    return field ? `${message}: ${field[0]} — ${txServer(field[1][0])}` : message;
  }
  if (e?.code === 'ECONNABORTED') return tx("Server javob bermadi (timeout)");
  if (e?.message === 'Network Error') return tx("Server bilan aloqa yo'q");
  return fallback;
}

export const get = <T,>(url: string, params?: Record<string, unknown>) => api.get<T>(url, { params }).then((r) => r.data);
export const post = <T,>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data);
export const patch = <T,>(url: string, body?: unknown) => api.patch<T>(url, body).then((r) => r.data);
export const put = <T,>(url: string, body?: unknown) => api.put<T>(url, body).then((r) => r.data);

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

// Market-local calendar helpers. Uzbekistan (Asia/Tashkent) is UTC+5 without DST,
// so a fixed offset stored on the Market record is sufficient and deterministic.

const MIN = 60_000;

/** Start of the local calendar day (as a UTC instant) that contains `at`. */
export function startOfLocalDay(at: Date, offsetMinutes: number): Date {
  const local = new Date(at.getTime() + offsetMinutes * MIN);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMinutes * MIN);
}

/** Last millisecond of the local calendar day that contains `at`. */
export function endOfLocalDay(at: Date, offsetMinutes: number): Date {
  return new Date(startOfLocalDay(at, offsetMinutes).getTime() + 24 * 60 * MIN - 1);
}

/** YYYY-MM-DD in market-local time. */
export function localDateKey(at: Date, offsetMinutes: number): string {
  return new Date(at.getTime() + offsetMinutes * MIN).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as the start of that local day. */
export function parseLocalDate(key: string, offsetMinutes: number): Date {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - offsetMinutes * MIN);
}

export const minutes = (n: number) => n * MIN;

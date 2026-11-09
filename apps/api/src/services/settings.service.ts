import { prisma, type Db } from '../lib/prisma';

/** Business settings with defaults. Values live in SystemSetting; these are fallbacks. */
export const SETTING_DEFAULTS = {
  'alert.adminNotifyDelayMinutes': {
    value: 5,
    description: "To'lovsiz bandlik aniqlangandan keyin MARKET_ADMIN xabardor qilinadigan vaqt (daqiqa)",
  },
  'alert.chiefEscalationDelayMinutes': {
    value: 10,
    description: 'Admin xabardor qilingandan keyin CHIEF ga eskalatsiya vaqti (daqiqa)',
  },
  'camera.heartbeatTimeoutSeconds': {
    value: 180,
    description: "Kamera signal bermasa 'oflayn' deb belgilanadigan vaqt (soniya)",
  },
  'exemption.defaultValidityDays': {
    value: 1,
    description: 'Imtiyozning standart amal qilish muddati (kun)',
  },
  'auth.maxFailedLogins': {
    value: 5,
    description: "Ketma-ket noto'g'ri parol kiritishlar soni — shundan so'ng akkaunt vaqtincha bloklanadi",
  },
  'auth.lockoutMinutes': {
    value: 15,
    description: 'Akkaunt bloklanish muddati (daqiqa)',
  },
  'market.workingHoursStart': {
    value: '00:00',
    description: "Bozor ish vaqti boshlanishi (HH:MM, bozor vaqti). Ish vaqtidan tashqarida to'lovsiz bandlik ogohlantirishi yaratilmaydi",
  },
  'market.workingHoursEnd': {
    value: '24:00',
    description: "Bozor ish vaqti tugashi (HH:MM). 00:00–24:00 = kun bo'yi nazorat",
  },
  'receipt.footerText': {
    value: "To'lovingiz uchun rahmat! Chekni saqlab qo'ying.",
    description: 'Chek pastki matni',
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K]['value'] extends number
  ? number
  : string;

export async function getSetting<K extends SettingKey>(key: K, db: Db = prisma): Promise<SettingValue<K>> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  return (row?.value ?? SETTING_DEFAULTS[key].value) as SettingValue<K>;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Per-key validation beyond the number/string type check. Returns an error message or null. */
export function validateSettingValue(key: SettingKey, value: number | string): string | null {
  if (key === 'market.workingHoursStart' || key === 'market.workingHoursEnd') {
    return typeof value === 'string' && HHMM.test(value) ? null : "Vaqt HH:MM formatida bo'lishi kerak (masalan 06:00)";
  }
  if (key === 'auth.maxFailedLogins' && typeof value === 'number' && (value < 3 || value > 20)) return "3 dan 20 gacha bo'lishi kerak";
  return null;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Whether `at` falls inside the market's working hours (market-local time).
 * A window whose end is before its start wraps past midnight (e.g. 20:00–04:00).
 */
export async function isWithinWorkingHours(at: Date, offsetMinutes: number, db: Db = prisma): Promise<boolean> {
  const start = toMinutes(await getSetting('market.workingHoursStart', db));
  const end = toMinutes(await getSetting('market.workingHoursEnd', db));
  if (start === end || (start === 0 && end === 24 * 60)) return true;
  const local = new Date(at.getTime() + offsetMinutes * 60_000);
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return start < end ? m >= start && m < end : m >= start || m < end;
}

export async function listSettings() {
  const rows = await prisma.systemSetting.findMany({ include: { updatedBy: { select: { fullName: true } } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => {
    const row = byKey.get(key);
    return {
      key,
      value: row?.value ?? SETTING_DEFAULTS[key].value,
      defaultValue: SETTING_DEFAULTS[key].value,
      description: SETTING_DEFAULTS[key].description,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.fullName ?? null,
    };
  });
}

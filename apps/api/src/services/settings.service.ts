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

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'uz' | 'ru';

/** [Uzbek (Latin), Russian] */
const D: Record<string, [string, string]> = {
  // navigation
  'nav.group.monitoring': ['Monitoring', 'Мониторинг'],
  'nav.group.finance': ['Moliya', 'Финансы'],
  'nav.group.control': ['Nazorat', 'Контроль'],
  'nav.group.admin': ['Boshqaruv', 'Администрирование'],
  'nav.dashboard': ['Boshqaruv paneli', 'Панель управления'],
  'nav.spaces': ['Savdo joylari', 'Торговые места'],
  'nav.rows': ['Bozor qatorlari', 'Торговые ряды'],
  'nav.cameras': ['Kamera monitoringi', 'Видеомониторинг'],
  'nav.payments': ["To'lovlar", 'Платежи'],
  'nav.cashier': ['Kassa', 'Касса'],
  'nav.alerts': ['Ogohlantirishlar', 'Оповещения'],
  'nav.complaints': ['Shikoyatlar', 'Жалобы'],
  'nav.exemptions': ['Imtiyozlar', 'Льготы'],
  'nav.reports': ['Hisobotlar', 'Отчёты'],
  'nav.users': ['Foydalanuvchilar', 'Пользователи'],
  'nav.audit': ['Audit jurnali', 'Журнал аудита'],
  'nav.settings': ['Sozlamalar', 'Настройки'],
  // top bar
  'top.search': ['Joy raqami, chek yoki kassir…', 'Номер места, чек или кассир…'],
  'top.notifications': ['Bildirishnomalar', 'Уведомления'],
  'top.markAllRead': ["Hammasini o'qildi", 'Прочитать все'],
  'top.noNotifications': ["Yangi bildirishnoma yo'q", 'Нет новых уведомлений'],
  'top.logout': ['Chiqish', 'Выйти'],
  'demo.banner': ["DEMO MODE — Namoyish ma'lumotlari. Bu haqiqiy bozor ma'lumotlari emas.", 'ДЕМО-РЕЖИМ — Демонстрационные данные. Это не реальные данные рынка.'],
  // roles
  'role.CHIEF': ['Rahbar', 'Руководитель'],
  'role.MARKET_ADMIN': ['Bozor administratori', 'Администратор рынка'],
  'role.CASHIER': ['Kassir', 'Кассир'],
  // space statuses
  'space.FREE': ["Bo'sh", 'Свободно'],
  'space.OCCUPIED_PAID': ["Band — to'langan", 'Занято — оплачено'],
  'space.OCCUPIED_UNPAID': ["Band — to'lanmagan", 'Занято — не оплачено'],
  'space.EXEMPTED': ['Imtiyozli', 'Льгота'],
  'space.UNKNOWN': ["Noma'lum", 'Неизвестно'],
  'space.CAMERA_UNAVAILABLE': ['Kamera ishlamayapti', 'Камера недоступна'],
  'occ.FREE': ["Bo'sh", 'Свободно'],
  'occ.OCCUPIED': ['Band', 'Занято'],
  'occ.UNKNOWN': ["Noma'lum", 'Неизвестно'],
  'pay.PAID': ["To'langan", 'Оплачено'],
  'pay.UNPAID': ["To'lanmagan", 'Не оплачено'],
  'pay.EXEMPTED': ['Imtiyoz', 'Льгота'],
  // payment statuses
  'ps.PENDING': ['Kutilmoqda', 'Ожидание'],
  'ps.PENDING_SYNC': ['Sinxronlash kutilmoqda', 'Ожидает синхронизации'],
  'ps.SUCCESS': ['Muvaffaqiyatli', 'Успешно'],
  'ps.FAILED': ['Muvaffaqiyatsiz', 'Ошибка'],
  'ps.CANCELLED': ['Bekor qilingan', 'Отменён'],
  'ps.REFUNDED': ['Qaytarilgan', 'Возвращён'],
  'pm.CASH': ['Naqd', 'Наличные'],
  'pm.PAYME': ['Payme', 'Payme'],
  'pm.CLICK': ['Click', 'Click'],
  'pm.UZUM': ['Uzum', 'Uzum'],
  // alerts
  'as.OPEN': ['Ochiq', 'Открыто'],
  'as.ADMIN_NOTIFIED': ['Admin xabardor', 'Админ уведомлён'],
  'as.INVESTIGATING': ['Tekshirilmoqda', 'Проверяется'],
  'as.ESCALATED': ['Rahbarga eskalatsiya', 'Эскалировано руководителю'],
  'as.RESOLVED': ['Hal qilingan', 'Решено'],
  'as.REJECTED': ['Rad etilgan', 'Отклонено'],
  'at.UNPAID_OCCUPANCY': ["To'lovsiz bandlik", 'Занято без оплаты'],
  'at.CAMERA_OFFLINE': ['Kamera uzildi', 'Камера отключена'],
  'at.SELLER_COMPLAINT': ['Sotuvchi shikoyati', 'Жалоба продавца'],
  'at.PAYMENT_CANCELLED': ["To'lov bekor qilindi", 'Платёж отменён'],
  'at.EXEMPTION_APPROVED': ['Imtiyoz tasdiqlandi', 'Льгота одобрена'],
  'sev.INFO': ["Ma'lumot", 'Инфо'],
  'sev.WARNING': ['Ogohlantirish', 'Предупреждение'],
  'sev.CRITICAL': ['Kritik', 'Критично'],
  'cs.ONLINE': ['Onlayn', 'Онлайн'],
  'cs.OFFLINE': ['Oflayn', 'Офлайн'],
  'cs.DEGRADED': ['Sifat past', 'Деградация'],
  'cs.MAINTENANCE': ["Ta'mirda", 'Обслуживание'],
  'cmp.NEW': ['Yangi', 'Новая'],
  'cmp.INVESTIGATING': ['Tekshirilmoqda', 'Проверяется'],
  'cmp.RESOLVED': ['Hal qilingan', 'Решена'],
  'cmp.REJECTED': ['Rad etilgan', 'Отклонена'],
  'ex.PENDING': ['Kutilmoqda', 'Ожидает'],
  'ex.APPROVED': ['Tasdiqlangan', 'Одобрена'],
  'ex.REJECTED': ['Rad etilgan', 'Отклонена'],
  'ex.REVOKED': ['Bekor qilingan', 'Отозвана'],
  // dashboard
  'dash.title': ['Boshqaruv paneli', 'Панель управления'],
  'dash.subtitle': ['Bozorning joriy holati va bugungi tushum', 'Текущее состояние рынка и выручка за сегодня'],
  'kpi.total': ['Jami savdo joylari', 'Всего торговых мест'],
  'kpi.occupied': ['Band joylar', 'Занятые места'],
  'kpi.free': ["Bo'sh joylar", 'Свободные места'],
  'kpi.paid': ["To'langan joylar", 'Оплаченные места'],
  'kpi.unpaid': ["To'lanmagan band joylar", 'Занято без оплаты'],
  'kpi.alerts': ['Faol ogohlantirishlar', 'Активные оповещения'],
  'kpi.today': ["Bugungi to'lovlar", 'Платежи сегодня'],
  'kpi.cameras': ['Kameralar mavjudligi', 'Доступность камер'],
  'dash.occupancy': ['Bozor bandligi xaritasi', 'Карта занятости рынка'],
  'dash.occupancyHint': ["Joy ustiga bosing — batafsil ma'lumot", 'Нажмите на место для подробностей'],
  'dash.revenue': ['Kunlik tushum', 'Ежедневная выручка'],
  'dash.distribution': ["To'lovlar taqsimoti", 'Распределение платежей'],
  'dash.latestAlerts': ['Oxirgi hodisalar', 'Последние события'],
  'dash.cameras': ['Kameralar', 'Камеры'],
  'dash.recent': ["So'nggi tranzaksiyalar", 'Последние транзакции'],
  'dash.myQueue': ['Mening navbatim', 'Моя очередь'],
  'dist.cash': ['Naqd (tasdiqlangan)', 'Наличные (подтв.)'],
  'dist.electronic': ['Elektron (tasdiqlangan)', 'Электронные (подтв.)'],
  'dist.pendingSync': ['Kutilmoqda / sinxronlash', 'Ожидание / синхронизация'],
  'dist.cancelled': ['Bekor qilingan', 'Отменённые'],
  'dist.note': ["Kutilayotgan va bekor qilingan to'lovlar tushumga kiritilmaydi", 'Ожидающие и отменённые платежи не входят в выручку'],
  'chart.cash': ['Naqd', 'Наличные'],
  'chart.electronic': ['Elektron', 'Электронные'],
  'chart.total': ['Jami', 'Итого'],
  'range.7': ['7 kun', '7 дней'],
  'range.14': ['14 kun', '14 дней'],
  'range.30': ['30 kun', '30 дней'],
  'hint.unknownNoCam': ["{a} noma'lum · {b} kamerasiz", '{a} неизв. · {b} без камеры'],
  'hint.occupancy': ['{a}% bandlik', 'занятость {a}%'],
  'hint.free': ["{a}% joy bo'sh", 'свободно {a}%'],
  'hint.exempt': ['+ {a} imtiyozli', '+ {a} с льготой'],
  'hint.checkNow': ['darhol tekshirish kerak', 'требуется проверка'],
  'hint.noMismatch': ["nomuvofiqlik yo'q", 'расхождений нет'],
  'hint.critical': ['{a} kritik', 'критичных: {a}'],
  'hint.vsYesterday': ['kechagi shu vaqtga nisbatan', 'к вчера на это же время'],
  'hint.countPending': ['{a} ta · {b} kutilmoqda', '{a} шт · {b} в ожидании'],
  'hint.working': ['{a}% ishlamoqda', 'работает {a}%'],
  'dash.updated': ['yangilandi', 'обновлено'],
  // common
  'c.search': ['Qidirish', 'Поиск'],
  'c.all': ['Barchasi', 'Все'],
  'c.add': ["Qo'shish", 'Добавить'],
  'c.edit': ['Tahrirlash', 'Редактировать'],
  'c.save': ['Saqlash', 'Сохранить'],
  'c.cancel': ['Bekor qilish', 'Отмена'],
  'c.close': ['Yopish', 'Закрыть'],
  'c.view': ["Ko'rish", 'Просмотр'],
  'c.details': ['Batafsil', 'Подробнее'],
  'c.status': ['Holat', 'Статус'],
  'c.actions': ['Amallar', 'Действия'],
  'c.date': ['Sana', 'Дата'],
  'c.time': ['Vaqt', 'Время'],
  'c.amount': ['Summa', 'Сумма'],
  'c.method': ['Usul', 'Способ'],
  'c.space': ['Joy', 'Место'],
  'c.row': ['Qator', 'Ряд'],
  'c.camera': ['Kamera', 'Камера'],
  'c.cashier': ['Kassir', 'Кассир'],
  'c.reason': ['Sabab', 'Причина'],
  'c.note': ['Izoh', 'Комментарий'],
  'c.size': ["O'lcham", 'Размер'],
  'c.tariff': ['Tarif', 'Тариф'],
  'c.active': ['Faol', 'Активно'],
  'c.inactive': ['Nofaol', 'Неактивно'],
  'c.yes': ['Ha', 'Да'],
  'c.no': ["Yo'q", 'Нет'],
  'c.refresh': ['Yangilash', 'Обновить'],
  'c.export': ['CSV yuklab olish', 'Скачать CSV'],
  'c.loading': ['Yuklanmoqda…', 'Загрузка…'],
  'c.empty': ["Ma'lumot topilmadi", 'Данные не найдены'],
  'c.error': ["Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'],
  'c.retry': ['Qayta urinish', 'Повторить'],
  'c.viewAll': ["Barchasini ko'rish", 'Смотреть все'],
  'c.demo': ['DEMO', 'ДЕМО'],
  'c.simulated': ['Simulyatsiya', 'Симуляция'],
  'c.from': ['dan', 'с'],
  'c.lastDetected': ['Oxirgi aniqlash', 'Последнее обнаружение'],
  'c.lastHeartbeat': ['Oxirgi signal', 'Последний сигнал'],
  'c.receipt': ['Chek', 'Чек'],
  'c.validUntil': ['Amal qiladi', 'Действует до'],
  'c.forbidden': ["Bu sahifaga kirish huquqingiz yo'q", 'У вас нет доступа к этой странице'],
  // login
  'login.title': ['Tizimga kirish', 'Вход в систему'],
  'login.subtitle': ['Yopiq bozor boshqaruv platformasi', 'Платформа управления закрытым рынком'],
  'login.username': ['Login', 'Логин'],
  'login.password': ['Parol', 'Пароль'],
  'login.submit': ['Kirish', 'Войти'],
  'login.demoAccounts': ['DEMO hisoblar (faqat ishlab chiqish uchun)', 'ДЕМО-аккаунты (только для разработки)'],
  // cashier
  'cash.title': ['Kassa', 'Касса'],
  'cash.openShift': ['Smenani ochish', 'Открыть смену'],
  'cash.closeShift': ['Smenani yopish', 'Закрыть смену'],
  'cash.noShift': ["Ochiq smena yo'q. To'lov qabul qilish uchun smenani oching.", 'Нет открытой смены. Откройте смену для приёма платежей.'],
  'cash.selectSpace': ['Joyni tanlang', 'Выберите место'],
  'cash.confirm': ["Naqd to'lovni tasdiqlash", 'Подтвердить оплату наличными'],
  'cash.cashToday': ['Bugun naqd qabul qilindi', 'Принято наличными сегодня'],
  'cash.shiftTotal': ['Smena jami', 'Итого за смену'],
  'cash.history': ['Mening tranzaksiyalarim', 'Мои транзакции'],
  'cash.alreadyPaid': ["Bu joy uchun amaldagi to'lov mavjud", 'Для этого места уже есть действующий платёж'],
  'cash.success': ["To'lov qabul qilindi", 'Платёж принят'],
  'cash.demoElectronic': ["DEMO elektron to'lov simulyatori", 'ДЕМО-симулятор электронной оплаты'],
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

function initialLang(): Lang {
  try {
    const v = localStorage.getItem('sm.lang');
    if (v === 'uz' || v === 'ru') return v;
  } catch {
    /* storage unavailable */
  }
  return 'uz';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('sm.lang', l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((key: string, fallback?: string) => D[key]?.[lang === 'uz' ? 0 : 1] ?? fallback ?? key, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}

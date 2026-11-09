# SMART MARKET

Yopiq bozor uchun boshqaruv platformasi: savdo joylari, kassa to'lovlari va cheklar, kamera orqali bandlik nazorati, ogohlantirishlar eskalatsiyasi, shikoyatlar, imtiyozlar, hisobotlar va audit.

> **Asosiy qoida:** har bir band savdo joyi amaldagi to'lov yoki rasmiy tasdiqlangan imtiyozga ega bo'lishi kerak. Tizim kuzatilgan bandlik bilan qayd etilgan to'lovlar orasidagi nomuvofiqlikni aniqlaydi.

---

## 1. Texnologiyalar

| Qatlam | Texnologiya |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, Ant Design 5, Tailwind CSS 3, React Router 6, TanStack Query 5, Axios, Recharts, Lucide |
| Backend | Node.js (≥20), Express 4, TypeScript, Prisma 6, PostgreSQL, Zod, JWT (httpOnly cookie), Socket.IO |
| Vision (kelajak) | Python skeleti (`services/vision`) — ichki API orqali bandlik natijalarini yuboradi |
| Infratuzilma | Docker Compose, Nginx |

## 2. Loyiha tuzilmasi

```
smartmarket/
├── apps/
│   ├── api/                 Express + Prisma backend
│   │   ├── prisma/          schema.prisma, migratsiyalar
│   │   ├── src/
│   │   │   ├── routes/      HTTP marshrutlar (har birida RBAC)
│   │   │   ├── services/    biznes-logika (to'lov, ogohlantirish, bandlik, hisobot)
│   │   │   ├── integrations/ camera/ (Demo, Hikvision*) va payments/ (Payme*, Click*, Uzum*, DEMO simulyator)
│   │   │   ├── workers/     doimiy (DB asosidagi) ogohlantirish protsessori
│   │   │   └── demo/        DEMO seed generatori
│   │   └── tests/           Vitest + Supertest (alohida test bazasida)
│   └── web/                 React frontend
├── services/vision/         AI/kamera xizmati skeleti (Python)
├── infrastructure/          Dockerfile lar va Nginx
├── docs/                    API.md, SECURITY.md
├── docker-compose.yml
└── .env.example
```
`*` — kelajakdagi integratsiya, hozir ulanmagan.

## 3. Lokal ishga tushirish (Windows / macOS / Linux)

Talablar: Node.js 20+ (sinovda 24.12), PostgreSQL 14+ (sinovda 18.1).

```bash
# 1. Bog'liqliklar
npm install

# 2. Muhit sozlamalari
cp .env.example apps/api/.env
#   apps/api/.env ichida DATABASE_URL, JWT_SECRET, VISION_API_KEY ni to'ldiring
#   DEMO uchun: DEMO_MODE=true

# 3. Ma'lumotlar bazasi
createdb smart_market            # yoki psql: CREATE DATABASE smart_market;
npm run db:deploy                # migratsiyalar
npm run db:seed                  # DEMO ma'lumotlar (faqat DEMO_MODE=true bo'lsa)

# 4. Ishga tushirish (API + web birga)
npm run dev
```

| Xizmat | Manzil |
|---|---|
| Boshqaruv paneli (web) | **http://localhost:5173** |
| API | http://localhost:4000/api |
| Health check | http://localhost:4000/api/health |

> DEMO ma'lumotlari seed vaqtiga nisbatan yaratiladi ("bugun", "5 daqiqa oldin"). Namoyishdan oldin `npm run db:seed` ni qayta ishga tushiring — u barcha jadvallarni tozalab, yangi DEMO to'plam yaratadi.

### DEMO hisoblar (faqat ishlab chiqish / namoyish uchun)

Barchasi uchun parol: **`Demo@2026`**

| Login | Rol | Imkoniyatlar |
|---|---|---|
| `chief` | CHIEF (rahbar) | Hamma narsa: hisobotlar, to'lovni bekor qilish, imtiyoz tasdiqlash, audit, sozlamalar, foydalanuvchilar |
| `admin`, `admin2` | MARKET_ADMIN | Monitoring, ogohlantirishlar, tekshiruv, joy/qator/kamera boshqaruvi, imtiyoz so'rovi |
| `kassir1`, `kassir2`, `kassir3` | CASHIER | Smena, naqd to'lov, chek, o'z tranzaksiyalari |

Seller (sotuvchi) uchun hisob yo'q: har bir joyning QR kodi `/qr/:publicToken` sahifasini ochadi (joy sahifasida QR ko'rsatiladi).

## 4. Docker Compose

```bash
cp .env.example .env               # POSTGRES_PASSWORD, JWT_SECRET, VISION_API_KEY ni to'ldiring
docker compose up -d --build       # db + api (migratsiyalar avtomatik) + web (nginx)
# ixtiyoriy, faqat DEMO_MODE=true bo'lsa:
docker compose exec api node dist/demo/seedCli.js
# http://localhost:8080
```
DEMO ma'lumotlari hech qachon avtomatik yuklanmaydi.

## 5. Tekshiruvlar

```bash
npm run typecheck   # API + web TypeScript
npm run lint        # ESLint
npm test            # API testlari (alohida smart_market_test bazasida, avtomatik migratsiya + seed)
npm run build       # production build
```
Testlar `DATABASE_URL` dagi baza nomini `smart_market_test` ga almashtiradi (yoki `TEST_DATABASE_URL`). Test bazasini oldindan yarating: `CREATE DATABASE smart_market_test;`

## 6. Funksional / simulyatsiya / kelajak

| Modul | Holat |
|---|---|
| Autentifikatsiya, RBAC, audit, sozlamalar | ✅ Ishlaydi |
| Savdo joylari, qatorlar CRUD, QR kodlar | ✅ Ishlaydi |
| Naqd to'lov + chek + smena (kassa) | ✅ Ishlaydi |
| To'lovni bekor qilish (faqat CHIEF, sabab bilan, yozuv o'chirilmaydi) | ✅ Ishlaydi |
| Ogohlantirishlar: 5 daq → admin, +10 daq → rahbar (DB asosidagi, restartga chidamli) | ✅ Ishlaydi |
| Bozor ish vaqti (ish vaqtidan tashqarida to'lovsiz bandlik ogohlantirishi yaratilmaydi) | ✅ Ishlaydi |
| Akkaunt himoyasi: bloklash, sessiyalarni bekor qilish, birinchi kirishda parolni almashtirish | ✅ Ishlaydi |
| Production bootstrap (`setup:production`), zaxira nusxa skriptlari | ✅ Ishlaydi |
| Shikoyatlar (QR, rate limit), imtiyozlar (faqat CHIEF tasdiqlaydi) | ✅ Ishlaydi |
| Hisobotlar + CSV eksport | ✅ Ishlaydi |
| UZ / RU interfeys | ✅ Asosiy navigatsiya, holatlar, KPI, kassa, QR sahifa. Ba'zi ichki sahifa matnlari hozircha faqat o'zbekcha |
| Kamera kuzatuvi | 🟡 DEMO provayder (simulyatsiya, aniq belgilangan) |
| Kamera ko'rinishi | 🟡 Simulyatsiya qilingan kadr — jonli oqim emas |
| Payme / Click / Uzum | 🟡 DEMO simulyator; haqiqiy adapterlar o'chirilgan (webhook 503 qaytaradi) |
| Hikvision RTSP/ISAPI | 🔲 Kelajak: `HikvisionCameraProvider` va `services/vision` chegaralari tayyor |
| AI bandlik modeli | 🔲 Kelajak: ichki API (`/api/internal/vision/*`) tayyor va sinovdan o'tgan |

## 7. DEMO dan haqiqiy ma'lumotga o'tish

1. Yangi (bo'sh) baza yarating, `DEMO_MODE=false`, `NODE_ENV=production`, kuchli `JWT_SECRET` va `VISION_API_KEY` (`openssl rand -hex 48`), `COOKIE_SECURE=true` (HTTPS ortida), `CORS_ORIGINS` = haqiqiy HTTPS manzil. Production rejimida server DEMO_MODE yoki `CHANGE_ME` kalitlar bilan ishga tushmaydi.
2. `npm run db:deploy` (yoki Docker) — migratsiyalar.
3. Bozor va birinchi rahbar hisobini yarating (parol yashirin so'raladi; DEMO ma'lumotli bazada ishlamaydi):
   ```bash
   npm run setup:production -- --market "Bozor nomi" --address "Manzil" --name "F.I.Sh." --username rahbar
   # Docker:  docker compose exec -e BOOTSTRAP_CHIEF_PASSWORD='...' api node dist/cli/bootstrap.js --market "..." --name "..." --username rahbar
   ```
   So'ng interfeysdan qolgan foydalanuvchilarni qo'shing — ular birinchi kirishda berilgan parolni o'zlarinikiga almashtiradi.
4. Sozlamalar → Bozor, Tarif (tasdiqlangan summa), **To'lov sikli** (tasdiqlangan muddat bilan yangi sikl yarating va faollashtiring), **ish vaqti** (`market.workingHoursStart/End`).
5. Qatorlar va savdo joylarini kiriting (soni kodda qattiq yozilmagan), kameralarni qo'shing va joylarga biriktiring.
6. QR stikerlarni joy sahifasidan chop eting.
7. Kundalik zaxira nusxani yoqing (cron): `DATABASE_URL=... infrastructure/scripts/backup.sh /var/backups/smart-market`. Tiklashni bo'sh bazada sinab ko'ring: `infrastructure/scripts/restore.sh`.

## 8. Ma'lum cheklovlar

- To'lovning haqiqiy amal qilish muddati tasdiqlanmagan — DEMO kunlik sikl ishlatiladi (`Sozlamalar → To'lov sikllari`).
- Real kamera va real AI ulanmagan; bandlik DEMO simulyator, qo'lda tekshiruv yoki ichki API orqali keladi.
- Payme/Click/Uzum integratsiyasi merchant shartnomasi, rasmiy protokol va sandbox sinovlarini talab qiladi.
- Audit jurnali triggeri UPDATE/DELETE ni bloklaydi, ammo jadval egasi (superuser) TRUNCATE yoki triggerni o'chirishi mumkin — productionda API ni jadval egasi bo'lmagan alohida rol bilan ishga tushiring (`docs/SECURITY.md`).
- Docker konfiguratsiyasi yozilgan, lekin ushbu muhitda Docker daemon o'chiq bo'lgani uchun `docker compose up` sinovdan o'tkazilmagan.
- Bir bozor rejimi: barcha jadvallar `marketId` bilan bog'langan, lekin interfeys hozircha bitta bozorni ko'rsatadi.
- Ish vaqti standart holatda 00:00–24:00 (kun bo'yi). Bozorning haqiqiy ish vaqtini Sozlamalarda kiriting, aks holda tunda qolgan mollar uchun ogohlantirish chiqadi.
- CHIEF uchun 2FA hali yo'q.

Batafsil: [docs/API.md](docs/API.md), [docs/SECURITY.md](docs/SECURITY.md), [services/vision/README.md](services/vision/README.md).

# SMART MARKET — bepul hosting (pilot): Render + Supabase

> **Bu variant pilot va sinov uchun mo'ljallangan.** Uning cheklovlarini 7-bo'limda o'qing. Ayniqsa O'zbekiston fuqarolarining shaxsiy ma'lumotlarini mamlakat ichida saqlash talabiga e'tibor bering. Real ishga tushirishda O'zbekistondagi serverga o'tish uchun [DEPLOY.md](DEPLOY.md) tayyor.

## 1. Nima uchun Vercel emas

Vercel'ning bepul (Hobby) tarifida serverless funksiyalar WebSocket server bo'la olmaydi, cron esa kuniga atigi bir marta ishlaydi. SMART MARKET'ga esa doimiy ishlaydigan jarayon kerak: real vaqt bildirishnomalari (Socket.IO) va har 15 soniyada ishlaydigan ogohlantirish eskalatsiyasi (5 daqiqa → admin, +10 daqiqa → rahbar). Vercel'da bu imkoniyatlar ishlamaydi yoki kod qayta yozilishi kerak bo'ladi.

## 2. Arxitektura

```
Brauzer ──HTTPS──► Render (bepul web service, Frankfurt)
                    └─ bitta Docker konteyner: React SPA + REST API + Socket.IO + ogohlantirish worker'i
                          └──► Supabase Postgres (bepul, session pooler orqali)
GitHub Actions: main'ga push → CI (test/lint/build) → Render deploy hook
                har kecha 02:00 → pg_dump → AES-256 bilan shifrlash → artifact (30 kun)
UptimeRobot: har 5 daqiqada /api/health → servis uxlab qolmaydi + monitoring
```

## 3. Supabase (ma'lumotlar bazasi)

1. [supabase.com](https://supabase.com) → **New project**. Region: **Central EU (Frankfurt)**. Kuchli DB parol tanlang.
2. **SQL Editor** → `infrastructure/free/supabase-setup.sql` faylini oching, `CHANGE_ME`ni yangi parol bilan almashtiring (`openssl rand -hex 24`) va ishga tushiring. Bu skript:
   - API uchun jadval egasi bo'lmagan `smart_market_app` rolini yaratadi, shuning uchun API audit jurnalini o'chira olmaydi;
   - Supabase Data API orqali jadvallarga kirishni yopadi.
3. **Project Settings → Data API** bo'limida Data API'ni o'chiring. SMART MARKET undan foydalanmaydi.
4. **Connect → Session pooler** (port 5432, IPv4) manzilini nusxalang. Ikkita URL kerak bo'ladi:
   ```
   MIGRATE_DATABASE_URL = postgresql://postgres.<ref>:<DB parol>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?schema=public
   DATABASE_URL         = postgresql://smart_market_app.<ref>:<app parol>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?schema=public&connection_limit=5
   ```
   `<ref>` — loyiha identifikatori. Pooler host nomini Supabase panelidan oling: yuqoridagi faqat namuna.

## 4. Render (ilova)

1. [render.com](https://render.com) → GitHub bilan kiring → **New → Blueprint** → `smartmarket` repo'sini tanlang. `render.yaml` avtomatik o'qiladi.
2. So'ralgan maydonlarni to'ldiring:
   - `DATABASE_URL`, `MIGRATE_DATABASE_URL` — 3-bo'limdagi URL'lar;
   - `CORS_ORIGINS` — `https://smartmarket.onrender.com` (Render bergan manzil).

   `JWT_SECRET` va `VISION_API_KEY` avtomatik yaratiladi.
3. Birinchi deploy'ni Render'ning o'zi boshlaydi. Docker build va migratsiyalar 5–10 daqiqa davom etadi. Natijani `https://<manzil>/api/health` da tekshiring: `"status":"ok"` chiqishi kerak.
4. **Settings → Deploy Hook** URL'ini nusxalang (5-bo'lim uchun kerak).

### Birinchi rahbar hisobi

Render free tarifida Shell yo'q, shuning uchun bu bosqich **lokal kompyuterdan** bajariladi. Bunda faqat bazaga ulanish kerak:

```bash
cd smartmarket
# DATABASE_URL = MIGRATE_DATABASE_URL (3-bo'lim). Parol yashirin so'raladi.
DATABASE_URL='postgresql://postgres.<ref>:<DB parol>@<pooler host>:5432/postgres?schema=public' \
  npm run setup:production -- --market "Bozor nomi" --address "Manzil" --name "F.I.Sh." --username rahbar
```

So'ng `https://<manzil>` ga `rahbar` bilan kiring.

### IP manzilni tekshirish (muhim)

Kirgandan keyin **Audit jurnali**dagi `LOGIN` yozuvi IP'si sizning haqiqiy IP'ingiz bo'lishi kerak ([ifconfig.me](https://ifconfig.me) bilan solishtiring). Agar u Render yoki Cloudflare manziliga o'xshasa, Render'da `TRUST_PROXY_HOPS` qiymatini 2 ga oshiring. Aks holda login urinishlari cheklovi (rate-limit) barcha foydalanuvchilarni bitta IP deb hisoblaydi.

## 5. GitHub sozlamalari

**Settings → Secrets and variables → Actions:**

| Secret | Qiymat |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → Settings → Deploy Hook |
| `BACKUP_DATABASE_URL` | `MIGRATE_DATABASE_URL` bilan bir xil (owner, session pooler) |
| `BACKUP_PASSPHRASE` | `openssl rand -hex 32`. **Bu kalitni GitHub'dan tashqarida ham saqlang**, aks holda zaxira nusxani ocha olmaysiz |

Bundan keyin `main` branch'ga har bir push quyidagicha ishlaydi: CI (typecheck, lint, test, build) o'tadi, keyin Render'ga deploy qilinadi. CI yiqilsa, deploy bo'lmaydi.

## 6. Uxlab qolmaslik va monitoring

Render free servisi 15 daqiqa so'rov kelmasa uxlaydi, qayta uyg'onishi ~1 daqiqa oladi. Uxlab yotganda ogohlantirish worker'i ham to'xtaydi. Eskalatsiya vaqtlari bazada saqlangani uchun uyg'onganda davom etadi, lekin kechikadi.

Yechim: [UptimeRobot](https://uptimerobot.com) (bepul) → **New monitor → HTTP(s)** → `https://<manzil>/api/health`, oraliq 5 daqiqa. Bu ham servisni uyg'oq tutadi, ham u ishlamay qolsa sizga email yuboradi. Oyiga 744 soat ishlash Render'ning bepul 750 soat limitiga sig'adi, lekin **faqat bitta** bepul servis bo'lsa.

## 7. Cheklovlar (bilib turing)

| Cheklov | Ta'siri |
|---|---|
| **Ma'lumotlar Frankfurtda (EI) saqlanadi** | O'zbekiston qonunchiligi fuqarolarning shaxsiy ma'lumotlarini (ism, telefon) mamlakat ichida saqlashni talab qiladi. Pilot uchun real shaxsiy ma'lumotlarni minimal kiriting. Real ishga tushirishdan oldin [DEPLOY.md](DEPLOY.md) bo'yicha O'zbekistondagi serverga o'ting |
| Supabase 500 MB | To'lovlar va audit uchun yetarli. Real kameralar ulansa, bandlik kuzatuvlari tez to'planadi, shunda pullik tarif yoki o'z server kerak bo'ladi |
| Supabase o'zi kunlik backup qilmaydi | GitHub Actions backup'i buni qoplaydi (5-bo'lim). Oyiga bir marta tiklashni sinab ko'ring |
| Supabase 7 kun faolsiz qolsa pauza qiladi | UptimeRobot so'rovlari bazaga ham tegadi, shuning uchun bu holat yuz bermaydi |
| Render 512 MB RAM, umumiy CPU | Bitta bozor uchun yetarli. Kamera yoki AI oqimi uchun yetmaydi |
| Bepul tariflar shartlari o'zgarishi mumkin | Ular haqidagi ma'lumotlar 2026-yil noyabr holatiga ko'ra |

## 8. Zaxira nusxani tiklash

```bash
# GitHub → Actions → Database backup → kerakli run → Artifacts → yuklab oling
gpg --decrypt smart_market_2026-11-09_2100.dump.gpg > backup.dump      # BACKUP_PASSPHRASE so'raladi
# bo'sh bazaga (masalan yangi Supabase loyihasi yoki lokal Postgres):
DATABASE_URL=postgresql://... infrastructure/scripts/restore.sh backup.dump
```

## 9. O'z serverga o'tish

Kod ikkala variantni ham qo'llaydi. O'tish quyidagicha bo'ladi:
1. [DEPLOY.md](DEPLOY.md) bo'yicha VPS'ni tayyorlang.
2. Supabase'dan oxirgi zaxira nusxani VPS bazasiga tiklang.
3. **Actions → Deploy (VPS)** workflow'ini ishga tushiring.
4. Render servisini o'chiring.

# SMART MARKET — production'ga chiqarish (deploy)

## 1. Arxitektura

```
Internet ──► Caddy (80/443, avtomatik HTTPS)
               └─► web  (nginx: React SPA + /api, /socket.io proxy)
                     └─► api (Node.js, migratsiyalar start'da)
                           └─► PostgreSQL 16 (faqat ichki tarmoq)
             backup (har kuni 02:00 Toshkent, tekshirilgan pg_dump)
```

- Barcha xizmatlar bitta VPS'da Docker Compose orqali ishlaydi (`infrastructure/deploy/docker-compose.prod.yml`).
- Image'lar serverda build qilinmaydi: GitHub Actions ularni yig'ib, GHCR'ga (`ghcr.io/<owner>/smartmarket-api|web`) joylaydi.
- API bazaga **jadval egasi bo'lmagan** `smart_market_app` roli bilan ulanadi. U `AuditLog`ni TRUNCATE qila olmaydi va audit triggerini o'chira olmaydi. Migratsiyalar egasi (`smart_market`) roli bilan bajariladi.
- Tashqariga faqat 80/443 portlar ochiq. PostgreSQL internetga chiqmaydi, `/api/internal/*` esa Caddy'da yopilgan.

## 2. Server tanlash

- **Joylashuv:** O'zbekistondagi data-markaz (masalan UzCloud, Uztelecom yoki boshqa mahalliy provayder). Fuqarolarning shaxsiy ma'lumotlari (ism, telefon) mamlakat ichida saqlanishi kerak (shaxsiy ma'lumotlar to'g'risidagi qonun, 27¹-modda).
- **Minimal hajm:** 2 vCPU, 4 GB RAM, 60–80 GB SSD, Ubuntu 22.04 yoki 24.04. Kameralar va AI modeli qo'shilganda kamida 8 GB RAM kerak bo'ladi, AI uchun alohida server ham bo'lishi mumkin.
- **Zaxira nusxa uchun ikkinchi joy:** boshqa server yoki S3-mos saqlash joyi kerak (8-bo'limga qarang).

## 3. Serverni tayyorlash (bir marta)

```bash
# lokal kompyuterdan: o'z SSH kalitingizni serverga qo'shing
ssh-copy-id root@SERVER_IP

# serverda (avval skriptni o'qib chiqing):
scp infrastructure/deploy/server-setup.sh root@SERVER_IP:/root/
ssh root@SERVER_IP 'bash /root/server-setup.sh'
```

Skript quyidagilarni bajaradi: Docker o'rnatadi, `deploy` foydalanuvchisini yaratadi, SSH'da parol bilan kirishni o'chiradi, UFW (22/80/443), fail2ban va avtomatik xavfsizlik yangilanishlarini yoqadi, vaqt zonasini Asia/Tashkent qiladi.

### Deploy uchun SSH kaliti

```bash
ssh-keygen -t ed25519 -f smartmarket_deploy -N ""          # lokal kompyuterda
ssh root@SERVER_IP "cat >> /home/deploy/.ssh/authorized_keys" < smartmarket_deploy.pub
ssh-keyscan -H SERVER_IP                                    # VPS_KNOWN_HOSTS uchun
```

### `.env` fayli

```bash
ssh deploy@SERVER_IP
cd /opt/smartmarket
nano .env      # infrastructure/deploy/.env.production.example asosida
chmod 600 .env
```

Har bir maxfiy kalit uchun `openssl rand -hex 32` buyrug'idan foydalaning.

**Domen hali yo'q bo'lsa:** `SITE_ADDRESS=203-0-113-10.sslip.io` (IP manzildagi nuqtalar o'rniga chiziqcha) va `PUBLIC_URL=https://203-0-113-10.sslip.io` deb yozing. sslip.io bu nomni serveringiz IP'siga yo'naltiradi, shuning uchun Let's Encrypt HTTPS sertifikati domensiz ham ishlaydi. Domen olingach, A-yozuvini server IP'siga yo'naltiring va bu ikki qatorni o'zgartirib, qayta deploy qiling. Foydalanuvchilar bir marta qayta kiradi.

## 4. GitHub sozlamalari (bir marta)

**Settings → Secrets and variables → Actions:**

| Secret | Qiymat |
|---|---|
| `VPS_HOST` | server IP yoki domen |
| `VPS_USER` | `deploy` |
| `VPS_PORT` | SSH porti (standart 22 bo'lsa, qo'shmasa ham bo'ladi) |
| `VPS_SSH_KEY` | `smartmarket_deploy` faylining **maxfiy** qismi |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -H SERVER_IP` natijasi |

**Settings → Environments → `production`:** "Required reviewers" ga o'zingizni qo'shing. Shunda har bir deploy sizning tasdig'ingizni kutadi.

## 5. Release va deploy

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions quyidagi bosqichlarni bajaradi:
1. **CI:** typecheck, lint, testlar (alohida PostgreSQL'da) va build.
2. **Images:** api va web image'lari yig'iladi va `ghcr.io/...:v1.0.0` sifatida joylanadi.
3. **Deploy** (tasdiqlangandan keyin): fayllar serverga ko'chiriladi va `deploy.sh v1.0.0` ishga tushadi:
   - deploydan oldingi zaxira nusxa olinadi;
   - yangi image'lar tortiladi va qayta ishga tushiriladi (migratsiyalar avtomatik bajariladi);
   - `/api/health` 2 daqiqagacha tekshiriladi;
   - **xato bo'lsa, oldingi versiyaga avtomatik qaytariladi** (rollback).

Har bir `main` push'ida va pull request'da faqat CI ishlaydi.

Mavjud versiyani qayta deploy qilish: **Actions → Deploy → Run workflow →** kerakli tag.

> Migratsiyalar faqat oldinga ishlaydi. Agar yangi versiya bazani o'zgartirib, keyin ishlamay qolsa, rollback faqat kodni qaytaradi. Bazani esa deploydan oldin olingan zaxira nusxadan tiklash kerak (8-bo'limga qarang).

## 6. Birinchi ishga tushirish

Birinchi deploy'dan keyin:

```bash
ssh deploy@SERVER_IP
cd /opt/smartmarket
docker compose -f docker-compose.prod.yml exec -e BOOTSTRAP_CHIEF_PASSWORD='Vaqtincha-Parol-2026' api \
  node dist/cli/bootstrap.js --market "Bozor nomi" --address "Manzil" --name "F.I.Sh." --username rahbar
```

So'ng `https://<SITE_ADDRESS>` manziliga `rahbar` bilan kiring. Tizim parolni almashtirishni talab qiladi. Keyin: Sozlamalar (tarif, to'lov sikli, ish vaqti) → Qatorlar → Savdo joylari → Foydalanuvchilar (yig'uvchi xodimlar) → QR stikerlar.

## 7. Kundalik ishlash

```bash
cd /opt/smartmarket
docker compose -f docker-compose.prod.yml ps               # holat
docker compose -f docker-compose.prod.yml logs -f api      # loglar
cat .deployed_tag                                          # joriy versiya
```

**Monitoring:** UptimeRobot yoki shunga o'xshash bepul xizmatda `https://<manzil>/api/health` uchun 5 daqiqalik tekshiruv sozlang (`"status":"ok"` va HTTP 200). Bu tekshiruv baza ishlamay qolganini ham aniqlaydi (503 qaytaradi).

## 8. Zaxira nusxa va tiklash

- `backup` konteyneri har kuni 02:00 da (Toshkent vaqti) `/opt/smartmarket/backups/` papkasiga tekshirilgan dump yozadi va 30 kunlik nusxalarni saqlaydi. Har bir deploy oldidan ham qo'shimcha dump olinadi.
- **Faqat bitta serverda saqlangan nusxa yetarli emas.** Server yo'qolsa, nusxalar ham yo'qoladi. Har kuni boshqa joyga ko'chiring, masalan boshqa serverdan `rsync` orqali:
  ```bash
  rsync -az deploy@SERVER_IP:/opt/smartmarket/backups/ /zaxira/smartmarket/
  ```
- **Tiklash** faqat bo'sh bazaga qilinadi. Avval sinov bazasida tekshiring:
  ```bash
  docker compose -f docker-compose.prod.yml exec db createdb -U smart_market restore_test
  docker compose -f docker-compose.prod.yml exec -T backup sh -c \
    'DATABASE_URL=postgresql://smart_market:$POSTGRES_PASSWORD@db:5432/restore_test sh /dev/stdin /backups/<fayl>.dump' \
    < infrastructure/scripts/restore.sh
  ```
  Oyiga bir marta tiklashni sinab ko'ring. Sinab ko'rilmagan zaxira nusxaga tayanib bo'lmaydi.

## 9. Kelajak: kameralar

Kameralar bozorning lokal tarmog'ida joylashgan, server esa data-markazda. Ularni ulash uchun bozorda kichik edge-kompyuter o'rnatiladi. U RTSP oqimini o'qib, AI modelini ishga tushiradi va natijani `/api/internal/vision/*` ga yuboradi. Bu ichki API tashqi internetga yopiq, shuning uchun edge-kompyuter serverga **WireGuard VPN** orqali ulanadi. Kamera parollari faqat edge-kompyuterda saqlanadi.

## 10. Hali sinovdan o'tmagan

- `docker compose` stack'i, Dockerfile'lar va GitHub Actions workflow'lari yozilgan. Lokal tekshiruvdan o'tgan qismlari: YAML va shell sintaksisi hamda `docker compose config`. Lekin stack Docker daemon ishlayotgan muhitda hali to'liq ishga tushirib ko'rilmagan. Birinchi release'dan oldin staging serverda yoki lokal Docker Desktop'da sinab ko'ring.

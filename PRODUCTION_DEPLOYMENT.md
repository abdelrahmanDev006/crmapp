# دليل النشر الرسمي (Production)

هذا الدليل لتجهيز نسخة تسليم رسمية وآمنة وقابلة للرفع.

للنشر المباشر على Railway استخدم الدليل المخصص:
- `RAILWAY_DEPLOYMENT.md`

## 1) تجهيز ملفات البيئة

من جذر المشروع:

```powershell
Copy-Item .env.production.example .env.production
Copy-Item backend/.env.production.example backend/.env.production
Copy-Item frontend/.env.production.example frontend/.env.production
```

عدّل القيم التالية قبل أي تشغيل:

- `backend/.env.production`
  - `DATABASE_URL`
  - `JWT_SECRET` (قيمة قوية >= 32 حرف)
  - `ALLOWED_ORIGINS` (الدومين الحقيقي فقط)
  - `AUTH_RATE_LIMIT_MAX`
  - `WHATSAPP_CLOUD_ENABLED=true` (إذا أردت إرسال واتساب تلقائي)
  - `WHATSAPP_CLOUD_ACCESS_TOKEN` و `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `.env.production`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_DB`
  - `VITE_API_URL` (يفضل `/api` مع reverse proxy الداخلي)

## 2) فحص الإعدادات الأمنية قبل النشر

```powershell
cd backend
$env:ENV_FILE=".env.production"
npm run security:validate-env
```

إذا ظهر `PASSED` فالإعدادات جاهزة.

## 3) تشغيل الإنتاج عبر Docker Compose

من جذر المشروع:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

الخدمات:

- Frontend: `http://YOUR_SERVER_IP/`
- Backend health عبر الواجهة: `http://YOUR_SERVER_IP/api/health`

## 4) إنشاء/تحديث أدمن الإنتاج (مرة واحدة)

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend `
  npm run admin:bootstrap -- --name "مدير النظام" --email "admin@yourcompany.com" --password "StrongPass!2026"
```

## 5) قواعد تشغيل مهمة

- النسخة الإنتاجية الافتراضية تكون بدون بيانات (لا مناطق/عملاء/مندوبين).
- أنشئ فقط حساب الأدمن عبر `admin:bootstrap` بعد التشغيل.
- لا تستخدم `prisma:seed` في الإنتاج. وإذا اضطررت، اجعل `SEED_MODE=ADMIN_ONLY`.
- لا تستخدم حسابات `@crm.local` في البيئة الرسمية.
- لا تحفظ كلمات المرور في ملفات مشاركة عامة.
- فعّل HTTPS على مستوى السيرفر/الـ reverse proxy.
- خذ نسخ احتياطية يومية لقاعدة البيانات.

## 6) تحديثات لاحقة بدون توقف كبير

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

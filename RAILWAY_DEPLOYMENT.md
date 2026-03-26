# نشر نسخة Production على Railway

هذا الدليل يجهز لك المشروع للنشر على Railway كبيئة إنتاج كاملة:
- Database: `Railway Postgres` أو `Supabase Postgres`
- Backend (Node/Express)
- Frontend (Vite + Nginx)

## 1) تجهيز المشروع

1. ارفع المشروع على GitHub.
2. تأكد أن الملفات التالية موجودة:
   - `backend/Dockerfile`
   - `frontend/Dockerfile`
   - `frontend/nginx.conf.template`

## 2) إنشاء Project وخدمات Railway

1. أنشئ Project جديد على Railway.
2. أضف Service للـ Backend من نفس الـ repo:
   - Root Directory: `backend`
3. أضف Service للـ Frontend من نفس الـ repo:
   - Root Directory: `frontend`
4. اختر قاعدة البيانات:
   - خيار A: أضف Service PostgreSQL على Railway.
   - خيار B: استخدم Supabase (ولا تضيف PostgreSQL Service داخل Railway).

مهم:
- اجعل أسماء الخدمات واضحة (مثال: `crm-backend`, `crm-frontend`, `crm-postgres`).

## 3) إعداد متغيرات Backend

في خدمة الـ Backend أضف:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=REPLACE_WITH_DATABASE_URL
DIRECT_URL=REPLACE_WITH_DIRECT_URL
JWT_SECRET=REPLACE_WITH_STRONG_SECRET_MIN_32
JWT_EXPIRES_IN=1d
REJECTED_RETRY_DAYS=28
ALLOWED_ORIGINS=https://${{crm-frontend.RAILWAY_PUBLIC_DOMAIN}}
CORS_CREDENTIALS=true
TRUST_PROXY=true
JSON_BODY_LIMIT=1mb
AUTH_RATE_LIMIT_WINDOW_MINUTES=15
AUTH_RATE_LIMIT_MAX=80
WHATSAPP_CLOUD_ENABLED=false
WHATSAPP_CLOUD_ACCESS_TOKEN=
WHATSAPP_CLOUD_PHONE_NUMBER_ID=
WHATSAPP_CLOUD_API_VERSION=v21.0
WHATSAPP_REQUEST_TIMEOUT_MS=15000
WHATSAPP_MESSAGE_DELAY_MS=150
```

قيمة `DATABASE_URL` و `DIRECT_URL` حسب نوع قاعدة البيانات:

- خيار Railway Postgres:
  - `DATABASE_URL=${{crm-postgres.DATABASE_URL}}`
  - `DIRECT_URL=${{crm-postgres.DATABASE_URL}}`
- خيار Supabase:
  - `DATABASE_URL` = Pooler URL (عادة بورت `6543` مع `sslmode=require`)
  - `DIRECT_URL` = Direct URL (عادة `db.<project-ref>.supabase.co:5432` مع `sslmode=require`)

## 4) إعداد متغيرات Frontend

في خدمة الـ Frontend أضف:

```env
VITE_API_URL=/api
BACKEND_API_ORIGIN=https://${{crm-backend.RAILWAY_PUBLIC_DOMAIN}}
```

هذا الإعداد يجعل الـ Frontend يرسل على `/api`، وNginx يعمل Proxy للـ Backend عبر HTTPS.

## 5) إعداد Health Checks

- Backend Healthcheck Path: `/api/health`
- Frontend Healthcheck Path: `/health`

## 6) إعداد Domains

1. أنشئ Public Domain للـ Frontend (إلزامي).
2. أنشئ Public Domain للـ Backend (إلزامي مع إعداد `BACKEND_API_ORIGIN` الحالي).

## 7) أول تشغيل وإنشاء الأدمن

بعد نجاح أول Deploy:

1. افتح Shell في خدمة الـ Backend.
2. نفّذ:

```bash
npm run admin:bootstrap -- --name "مدير النظام" --email "admin@yourcompany.com" --password "StrongPass!2026"
```

## 8) التحقق النهائي

- افتح رابط الـ Frontend.
- سجّل الدخول بحساب الأدمن.
- تأكد من عمل:
  - صفحة العملاء
  - `/api/health`
  - إضافة/تعديل عميل

## 9) نقل البيانات عند التحويل إلى Supabase

لو عندك بيانات بالفعل على قاعدة Railway الحالية وتريد نقلها إلى Supabase:

1. جهّز Supabase Project وخذ `Direct URL`.
2. ارفع آخر نسخة كود (التي تحتوي سكربت `db:copy`).
3. شغّل النسخ من داخل خدمة الـ Backend الحالية:

```bash
TARGET_DATABASE_URL="SUPABASE_DIRECT_URL_WITH_SSLMODE_REQUIRE" npm run db:copy
```

ملاحظة:
- السكربت يقرأ المصدر تلقائيًا من `DATABASE_URL` الحالي للخدمة، وينسخ الجداول بالترتيب مع الحفاظ على IDs.
- لو قاعدة Supabase ليست فارغة استخدم:
  - `ALLOW_NON_EMPTY_TARGET=true TARGET_DATABASE_URL="..." npm run db:copy`

4. بعد نجاح النسخ، غيّر متغيرات خدمة الـ Backend:
   - `DATABASE_URL` إلى Supabase Pooler URL
   - `DIRECT_URL` إلى Supabase Direct URL
5. اعمل Redeploy للـ Backend وتحقق من `/api/health`.

## 10) ملاحظات Production مهمة

- لا تستخدم حسابات `@crm.local` في البيئة الرسمية.
- لا تستخدم `prisma:seed` في الإنتاج.
- استخدم كلمة مرور قوية جدًا للـ `JWT_SECRET`.
- الأفضل استخدام Custom Domain + HTTPS دائمًا.

## مراجع Railway الرسمية

- Config as Code: https://docs.railway.com/config-as-code/reference
- Domains & Private Networking: https://docs.railway.com/networking/domains/working-with-domains
- Best Practices (Reference Variables): https://docs.railway.com/overview/best-practices

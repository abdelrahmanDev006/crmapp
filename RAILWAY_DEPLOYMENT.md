# نشر نسخة Production على Railway

هذا الدليل يجهز لك المشروع للنشر على Railway كبيئة إنتاج كاملة:
- PostgreSQL
- Backend (Node/Express)
- Frontend (Vite + Nginx)

## 1) تجهيز المشروع

1. ارفع المشروع على GitHub.
2. تأكد أن الملفات التالية موجودة (وهي موجودة بالفعل):
   - `backend/Dockerfile`
   - `frontend/Dockerfile`
   - `frontend/nginx.conf.template`

## 2) إنشاء Project على Railway

1. أنشئ Project جديد على Railway.
2. أضف Service قاعدة بيانات PostgreSQL من لوحة Railway.
3. أضف Service للـ Backend من نفس الـ repo:
   - Root Directory: `backend`
4. أضف Service للـ Frontend من نفس الـ repo:
   - Root Directory: `frontend`

مهم:
- اجعل أسماء الخدمات واضحة (مثال: `crm-backend`, `crm-frontend`, `crm-postgres`) لأننا سنستخدمها في Reference Variables.

## 3) إعداد متغيرات Backend

في خدمة الـ Backend أضف المتغيرات التالية:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=${{crm-postgres.DATABASE_URL}}
JWT_SECRET=REPLACE_WITH_STRONG_SECRET_MIN_32
JWT_EXPIRES_IN=1d
REJECTED_RETRY_DAYS=28
WORK_TIMEZONE=Africa/Cairo
ALLOWED_ORIGINS=https://${{crm-frontend.RAILWAY_PUBLIC_DOMAIN}}
CORS_CREDENTIALS=true
TRUST_PROXY=true
JSON_BODY_LIMIT=1mb
AUTH_RATE_LIMIT_WINDOW_MINUTES=15
AUTH_RATE_LIMIT_MAX=80
AUTH_COOKIE_NAME=crm_access_token
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_MAX_AGE_HOURS=24
```

ملاحظات:
- استبدل `crm-postgres` و `crm-frontend` باسم الخدمة الفعلي عندك.

## 4) إعداد متغيرات Frontend

في خدمة الـ Frontend أضف:

```env
VITE_API_URL=/api
BACKEND_API_ORIGIN=http://${{crm-backend.RAILWAY_PRIVATE_DOMAIN}}:5000
```

هذا الإعداد يجعل الـ Frontend يرسل على `/api`، وNginx يعمل Proxy للـ Backend عبر Private Network.

## 5) إعداد Health Checks

- Backend Healthcheck Path: `/api/health`
- Frontend Healthcheck Path: `/health`

## 6) إعداد Domains

1. أنشئ Public Domain للـ Frontend (إلزامي).
2. إنشاء Public Domain للـ Backend اختياري (مفيد للاختبار الخارجي فقط).

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

## 9) ملاحظات Production مهمة

- لا تستخدم حسابات `@crm.local` في البيئة الرسمية.
- لا تستخدم `prisma:seed` في الإنتاج.
- استخدم كلمة مرور قوية جدًا للـ `JWT_SECRET`.
- الأفضل استخدام Custom Domain + HTTPS دائمًا.

## مراجع Railway الرسمية

- Config as Code: https://docs.railway.com/config-as-code/reference
- Domains & Private Networking: https://docs.railway.com/networking/domains/working-with-domains
- Best Practices (Reference Variables): https://docs.railway.com/overview/best-practices

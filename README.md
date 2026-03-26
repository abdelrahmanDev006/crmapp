# CRM APP - نظام إدارة العملاء والزيارات الدورية (عربي RTL)

تطبيق Web كامل (Backend + Frontend) لإدارة العملاء والزيارات الدورية، موجه للسوق العربي.

## المميزات الرئيسية
- واجهة عربية بالكامل `RTL` ومتجاوبة (Desktop / Tablet / Mobile).
- تسجيل دخول آمن عبر `JWT`.
- صلاحيات متعددة:
  - `Admin`: إدارة المستخدمين، المناطق، العملاء، رؤية كل البيانات.
  - `Representative`: رؤية بيانات منطقته فقط، بدون تصدير.
- تقسيم العملاء حسب Tabs:
  - أسبوعي
  - كل أسبوعين
  - شهري
  - لم يرد
  - مرفوض
- منطق ترحيل تلقائي للزيارة عند "تم التعامل":
  - أسبوعي: +7
  - كل أسبوعين: +14
  - شهري: +28
- الالتزام بأن الدورة الشهرية = 28 يوم عمل.
- عدم ترحيل العملاء بحالة "رفض التعامل".
- سجل كامل لكل زيارة سابقة.
- Pagination + Filtering لعدد كبير من العملاء (5000+).

## التقنيات
### Backend
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL
- JWT + bcrypt + RBAC

### Frontend
- React (Hooks)
- React Router
- Axios
- واجهة عربية RTL

## تصميم قاعدة البيانات
الملفات:
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.js`

الجداول الأساسية:
- `Region` (مناطق ديناميكية يمكن إضافتها/تعديلها)
- `User` (Admin / Representative)
- `Client` (بيانات العميل + نوع الزيارة + الحالة + موعد الزيارة القادمة)
- `VisitHistory` (سجل الزيارات والتحويلات السابقة)

Enums:
- `Role`: `ADMIN`, `REPRESENTATIVE`
- `VisitType`: `WEEKLY`, `BIWEEKLY`, `MONTHLY`
- `ClientStatus`: `ACTIVE`, `NO_ANSWER`, `REJECTED`

## منطق الزيارات
الملف: `backend/src/utils/dateUtils.js`
- يتم تطبيع التواريخ إلى يوم عمل داخل شهر 28 يوم.
- عند "تم التعامل":
  - `WEEKLY` -> +7
  - `BIWEEKLY` -> +14
  - `MONTHLY` -> +28
- `REJECTED`: يتم تحديد تاريخ إعادة محاولة مستقبلي (افتراضيًا بعد 28 يوم عمل).
- لا يمكن تحويل العميل المرفوض إلى `ACTIVE` قبل تاريخ إعادة المحاولة.
- يمكن ضبط مدة إعادة المحاولة من `REJECTED_RETRY_DAYS` في `backend/.env`.
- `NO_ANSWER`: تظهر في تبويب منفصل.

## REST API Endpoints
Base URL: `http://localhost:5000/api`

### Auth
- `POST /auth/login` تسجيل الدخول
- `GET /auth/me` بيانات المستخدم الحالي

### Dashboard
- `GET /dashboard/summary` ملخص عام (مع أعداد المناطق)

### Users (Admin فقط)
- `GET /users` قائمة المستخدمين (pagination + search)
- `POST /users` إنشاء مستخدم
- `PATCH /users/:id` تحديث مستخدم (مثل تفعيل/إيقاف)
- `DELETE /users/:id` حذف مستخدم

### Regions
- `GET /regions` قائمة المناطق
- `POST /regions` إنشاء منطقة (Admin)
- `GET /regions/:id` تفاصيل منطقة
- `PATCH /regions/:id` تحديث منطقة (Admin)
- `DELETE /regions/:id` حذف منطقة (Admin - إذا غير مرتبطة بعملاء/مستخدمين)
- `POST /regions/:id/handle-all` تم التعامل مع المنطقة بالكامل

### Clients
- `GET /clients` قائمة العملاء (filters + pagination + `dueDate` لعرض مستحقي يوم محدد)
- `POST /clients` إنشاء عميل (Admin)
- `GET /clients/:id` تفاصيل عميل + سجل زيارات
- `PATCH /clients/:id` تحديث عميل (Admin)
- `DELETE /clients/:id` حذف عميل (Admin)
- `POST /clients/:id/handle` تحديث حالة/نتيجة الزيارة (يدعم `advanceDays` + `referenceDate` للترحيل بعد عدد أيام محدد)
- `POST /clients/alerts/whatsapp/today` إرسال تنبيه واتساب تلقائي لعملاء اليوم (يتطلب إعداد WhatsApp Cloud API)
- `POST /clients/alerts/whatsapp/new` إرسال رسالة واتساب تلقائية للعملاء الجدد المضافين اليوم (يتطلب إعداد WhatsApp Cloud API)

## تشغيل المشروع محليًا

## 1) تشغيل PostgreSQL
من جذر المشروع:
```bash
docker compose up -d postgres
```

## 2) إعداد Backend
```bash
cd backend
copy .env.example .env
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

إعدادات أمان موصى بها في `backend/.env`:
- `ALLOWED_ORIGINS` قائمة الدومينات المسموح بها للواجهة (مفصولة بفواصل).
- `CORS_CREDENTIALS=true` لتفعيل الكوكيز/الهيدر المعتمد عند الحاجة.
- `SEED_ADMIN_PASSWORD` و `SEED_REP_DEFAULT_PASSWORD` (اختياري) لتحديد كلمات مرور seed يدويًا بدل التوليد العشوائي.
- عند استخدام Supabase: اضبط `DATABASE_URL` (Pooler) و `DIRECT_URL` (Direct) مع `sslmode=require`.

Backend يعمل على:
- `http://localhost:5000`

## 3) إعداد Frontend
في Terminal آخر:
```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

Frontend يعمل على:
- `http://localhost:5173`

## نسخة Production جاهزة للرفع
- تم إضافة ملفات تشغيل إنتاج مباشرة:
  - `docker-compose.prod.yml`
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
- تم إضافة أمثلة إعدادات الإنتاج:
  - `.env.production.example`
  - `backend/.env.production.example`
  - `frontend/.env.production.example`
  - `backend/.env.railway.example`
  - `frontend/.env.railway.example`
- تم إضافة سكربتات أمان وإدارة إنتاج:
  - `npm run security:validate-env`
  - `npm run admin:bootstrap -- --name ... --email ... --password ...`

خطوات النشر التفصيلية موجودة في:
- `PRODUCTION_DEPLOYMENT.md`
- `RENDER_DEPLOYMENT.md` (نشر مباشر على Render عبر Blueprint)
- `RAILWAY_DEPLOYMENT.md` (نشر مباشر على Railway - Production)
- `SUPABASE_MIGRATION.md` (تحويل قاعدة البيانات من Railway/أي PostgreSQL إلى Supabase)

## حسابات Seed
- لا يتم إنشاء كلمات مرور ثابتة أو متوقعة.
- عند إنشاء مستخدمين جدد عبر `seed`، يتم توليد كلمات مرور قوية تلقائيًا (أو استخدام قيم `SEED_*` من `.env`).
- لتدوير أي كلمات مرور افتراضية قديمة في قاعدة البيانات الحالية:
```bash
cd backend
npm run security:rotate-default-passwords
```

## هيكل المشروع
```text
backend/
  prisma/
  src/
    config/
    constants/
    controllers/
    middlewares/
    routes/
    schemas/
    services/
    utils/
frontend/
  src/
    api/
    auth/
    components/
    layout/
    pages/
    utils/
```

## نقاط الأمان المطبقة
- تشفير كلمات المرور باستخدام `bcrypt`.
- JWT Authentication لكل المسارات الحساسة.
- التحقق من الصلاحيات `RBAC` قبل إرجاع البيانات.
- منع المندوب من الوصول لمناطق أخرى.
- حماية أساسية عبر `helmet`, `cors`, `rate-limit`.

## ملاحظات للتوسع
الهيكل الحالي جاهز لإضافة:
- Notifications
- Reports
- Mobile App integration
- Export rules للأدمن فقط

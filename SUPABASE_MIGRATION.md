# تحويل قاعدة البيانات إلى Supabase

هذا الدليل يشرح تحويل النظام الحالي إلى Supabase كقاعدة بيانات مع الحفاظ على نفس Backend وFrontend.

## 1) ما الذي سيتغير؟

- لا تغيير في الكود الخاص بالـ Auth أو الشاشات.
- التغيير فقط في متغيرات قاعدة البيانات:
  - `DATABASE_URL` (للاتصالات العادية)
  - `DIRECT_URL` (لمهاجرات Prisma)

## 2) جهز روابط Supabase

من لوحة Supabase:

1. افتح `Project Settings` ثم `Database`.
2. انسخ رابطين:
   - Pooler URL (عادة Port `6543`) وضع فيه `sslmode=require`.
   - Direct URL (عادة `db.<project-ref>.supabase.co:5432`) وضع فيه `sslmode=require`.

مثال شائع:

```text
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
DIRECT_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

## 3) لو عندك بيانات حالية على Railway Postgres

انسخ البيانات أولًا قبل تبديل `DATABASE_URL`:

1. افتح Shell لخدمة الـ Backend على Railway (وهي ما زالت متصلة بقاعدة Railway الحالية).
2. شغل النسخ إلى Supabase:

```bash
TARGET_DATABASE_URL="SUPABASE_DIRECT_URL" npm run db:copy
```

ملاحظات:
- السكربت `db:copy` يقرأ المصدر تلقائيًا من `DATABASE_URL` الحالي.
- لو قاعدة Supabase ليست فارغة:

```bash
ALLOW_NON_EMPTY_TARGET=true TARGET_DATABASE_URL="SUPABASE_DIRECT_URL" npm run db:copy
```

## 4) بدّل متغيرات Backend على Railway

من جهازك المحلي (بعد `railway login`):

```bash
railway variable set -s crm-backend \
  "DATABASE_URL=SUPABASE_POOLER_URL" \
  "DIRECT_URL=SUPABASE_DIRECT_URL"
```

بعدها اعمل `Redeploy` لخدمة `crm-backend`.

## 5) تحقق نهائي

1. افتح:
   - `https://<frontend-domain>/health`
   - `https://<frontend-domain>/api/health`
2. سجّل دخول بحساب الأدمن.
3. جرّب إضافة عميل وتعديله.

## 6) ملاحظات مهمة

- لا تستخدم Service Role Key من Supabase داخل هذا الـ backend.
- اترك `WHATSAPP_CLOUD_ENABLED=false` لو لن تستخدم WhatsApp Cloud.
- في الإنتاج تأكد أن `ALLOWED_ORIGINS` يحتوي فقط دومين الواجهة الرسمي.

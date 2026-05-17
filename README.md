<div align="center">
  <h1>🌟 CRM Web Application</h1>
  <p>نظام متكامل لإدارة العملاء والزيارات الدورية والعمليات الميدانية</p>
  
  ![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
  ![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
  ![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
</div>

<br />

## 📋 نظرة عامة
تطبيق Web متكامل (Backend + Frontend) مصمم خصيصاً للسوق العربي لإدارة العملاء والزيارات الدورية بفعالية. يوفر النظام واجهة مستخدم باللغة العربية (RTL) بالكامل، مع تجربة مستخدم سلسة على جميع الأجهزة (Desktop, Tablet, Mobile).

---

## ✨ المميزات الرئيسية

- **🌐 واجهة عربية (RTL)**: تصميم متجاوب يدعم جميع الشاشات.
- **🔐 حماية متقدمة**: مصادقة آمنة عبر `JWT` مخزن في `httpOnly cookie`.
- **👥 نظام صلاحيات (RBAC)**:
  - `مدير (Admin)`: تحكم كامل في المستخدمين، المناطق، والعملاء.
  - `مندوب (Representative)`: صلاحيات محدودة مخصصة لمنطقته فقط.
- **📁 تنظيم ذكي للعملاء**: تقسيم مبتكر للعملاء عبر تبويبات (أسبوعي، شهري، استثنائي، عملاء بيع، إلخ).
- **🔄 أتمتة مواعيد الزيارات**:
  - ترحيل تلقائي لموعد الزيارة عند "تم التعامل" بناءً على نوع الزيارة (أسبوعي، شهري...).
  - نظام معالجة لـ "رفض التعامل (كانسل)" و "لم يرد".
- **📊 سجلات دقيقة**: تتبع كامل لتاريخ زيارات كل عميل، وسجل نشاطات لمديري النظام (Activity Logs).
- **⚡ أداء عالي**: دعم Pagination و Filtering متقدم للتعامل مع آلاف السجلات بكل سهولة ومرونة.

---

## 🛠️ التقنيات المستخدمة

### 🔙 الباك إند (Backend)
- **بيئة التشغيل:** Node.js
- **إطار العمل:** Express.js
- **قاعدة البيانات:** PostgreSQL
- **ORM:** Prisma
- **الأمان:** JWT + bcrypt + Helmet + CORS

### 🎨 الفرونت إند (Frontend)
- **المكتبة الأساسية:** React.js (Hooks)
- **التوجيه:** React Router DOM
- **الطلبات:** Axios + Vite
- **التصميم:** Custom Vanilla CSS (Modern, Responsive, Glassmorphism elements)

---

## 🗄️ هيكل قاعدة البيانات (Database Schema)

- `Region`: إدارة المناطق الجغرافية.
- `User`: إدارة حسابات المديرين والمناديب وتوزيع الصلاحيات.
- `Client`: بيانات العملاء، الحالات، المنتجات، والأسعار.
- `VisitHistory`: سجل تفصيلي لكل تفاعلات النظام مع العميل (History).
- `ActivityLog`: سجل حركات المستخدمين لمراقبة النظام من قبل الإدارة.

---

## 🚀 التشغيل المحلي (Local Development)

### 1️⃣ إعداد قاعدة البيانات (PostgreSQL)
باستخدام Docker (مستحسن):
```bash
docker compose -f docker-compose.yml up -d postgres
```

### 2️⃣ تشغيل الباك إند
```bash
cd backend
cp .env.example .env  # ثم قم بتعديل الإعدادات إن لزم الأمر
npm install
npx prisma migrate dev --name init
npm run prisma:seed   # لإنشاء بيانات تجريبية وحسابات افتراضية
npm run dev
```
> 📌 الباك إند سيعمل على: `http://localhost:5000`

### 3️⃣ تشغيل الفرونت إند
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
> 📌 الفرونت إند سيعمل على: `http://localhost:5173`

---

## 🌍 النشر على السيرفر (Production Deployment)

المشروع مهيأ بالكامل للنشر في بيئة الإنتاج من خلال ملفات الـ Docker المرفقة أو خدمات الـ PaaS:
- **Docker Compose**: `docker-compose.prod.yml`
- أدلة النشر المرفقة في المستودع:
  - 📄 `RAILWAY_DEPLOYMENT.md`: دليل النشر على منصة Railway.
  - 📄 `RENDER_DEPLOYMENT.md`: دليل النشر على منصة Render.
  - 📄 `PRODUCTION_DEPLOYMENT.md`: دليل عام للنشر المتقدم.

---

## 🛡️ الأمان والحماية
- **تشفير كلمات المرور** باستخدام `bcrypt`.
- **JWT Cookies** للحد من هجمات اختطاف الجلسات.
- **Helmet.js** لإضافة ترويسات حماية HTTP.
- **Rate Limiting** للحد من الهجمات التكرارية.
- **فصل الصلاحيات (RBAC)** لحماية الـ Endpoints في الـ API ومنع المناديب من الوصول لبيانات غير مصرح بها.

---

## 📂 هيكل المشروع (Folder Structure)
```text
├── backend/
│   ├── prisma/            # ملفات قاعدة البيانات و Migration
│   └── src/
│       ├── controllers/   # معالجة الطلبات
│       ├── routes/        # مسارات الـ API
│       ├── services/      # منطق الأعمال (Business Logic)
│       └── ...
├── frontend/
│   ├── src/
│   │   ├── components/    # مكونات UI قابلة لإعادة الاستخدام
│   │   ├── pages/         # صفحات التطبيق
│   │   ├── api/           # إعدادات Axios وربط الـ API
│   │   └── ...
└── README.md
```

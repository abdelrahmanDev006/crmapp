# 🚀 دليل النشر الشامل على سيرفرات Contabo

بما إنك هتستخدم **Contabo**، فده معناه إنك هتحصل على **VPS** (Virtual Private Server) نظيف تماماً، والمشروع بتاعنا مهيأ بشكل مثالي للعمل عليه باستخدام `Docker`. 

إليك الخطوات بالتفصيل خطوة بخطوة:

---

## 1️⃣ حجز السيرفر (VPS) وإعداده
1. ادخل على موقع [Contabo](https://contabo.com) واشترِ الخطة المناسبة (خطة الـ Cloud VPS S ممتازة جداً وكافية للنظام).
2. عند اختيار نظام التشغيل (OS)، اختر **Ubuntu 22.04** أو **Ubuntu 24.04**.
3. بعد الدفع، هيوصلك إيميل فيه الـ **IP** بتاع السيرفر وكلمة مرور الـ **root**.
4. افتح الـ Terminal في جهازك وادخل على السيرفر:
```bash
ssh root@YOUR_SERVER_IP
# هيطلب منك الباسوورد اللي جاتلك في الإيميل
```

---

## 2️⃣ تثبيت البرامج الأساسية (Docker & Git)
أول ما تدخل على السيرفر، انسخ ونفذ الأوامر دي لتحديث النظام وتسطيب Docker و Git:

```bash
# 1. تحديث النظام
apt update && apt upgrade -y

# 2. تسطيب Git
apt install git -y

# 3. تسطيب Docker و Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose-plugin -y
```

---

## 3️⃣ سحب كود المشروع للسيرفر
هنسحب الكود بتاعك من GitHub للسيرفر:

```bash
# الدخول لمجلد المنزل
cd /root

# سحب الكود (غير الرابط لرابط مستودعك الخاص لو كان private هيطلب يوزر وباسوورد)
git clone https://github.com/abdelrahmanDev006/crmapp.git

# الدخول لمجلد المشروع
cd crmapp
```

---

## 4️⃣ تجهيز ملفات البيئة (Environment Variables)
المشروع بيحتاج ملفات `.env` عشان يشتغل. إحنا مجهزين ملفات `example`، كل اللي هتعمله إنك تنسخها وتعدلها:

```bash
# 1. ملفات الإنتاج الأساسية
cp .env.production.example .env.production
cp backend/.env.production.example backend/.env.production
cp frontend/.env.production.example frontend/.env.production
```

**تعديل الملفات:**
استخدم محرر النصوص `nano` لتعديل الملفات:
```bash
nano backend/.env.production
```
*(للخروج والحفظ في nano: اضغط `Ctrl+X` ثم `Y` ثم `Enter`)*

💡 **أهم قيم لازم تتأكد منها في `backend/.env.production`:**
- `JWT_SECRET`: لازم يكون قوي جداً (ممكن تولده بالأمر ده على جهازك: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- `ALLOWED_ORIGINS`: حط فيه الـ IP بتاع سيرفر Contabo أو الدومين بتاعك (مثال: `http://192.168.1.1` أو `https://mycrm.com`)

💡 **أهم قيم في `.env.production` (في مسار المشروع الرئيسي):**
- `POSTGRES_USER` و `POSTGRES_PASSWORD`: اختار باسوورد قوية لقاعدة البيانات.
- `VITE_API_URL`: خليها `/api` زي ما هي لو هتستخدم الدومين/IP مباشرة، لأن النظام مجهز بـ Reverse Proxy داخلي بيحول الطلبات للباك إند تلقائيًا.

---

## 5️⃣ تشغيل النظام 🚀
دلوقتي كل حاجة جاهزة، هتشغل النظام عن طريق Docker Compose بالأمر ده:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
*الأمر ده هيحمل الصور ويبني المشروع (الواجهة والباك وقاعدة البيانات) ويشغلهم في الخلفية. (ممكن ياخد 3-5 دقايق أول مرة).*

---

## 6️⃣ إنشاء حساب الأدمن الأول
عشان تقدر تدخل للنظام، لازم تنشئ حساب مدير (Admin) عشان مفيش أي حسابات بتكون موجودة في الإنتاج:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend npm run admin:bootstrap -- --name "المدير العام" --email "admin@mycrm.com" --password "StrongPassword123!"
```
*(غير الإيميل والباسوورد للي يناسبك).*

---

## 7️⃣ الدخول للنظام
دلوقتي تقدر تفتح المتصفح بتاعك وتكتب الـ IP بتاع سيرفر Contabo:
`http://YOUR_SERVER_IP/`

هتلاقي النظام فتح معاك وتقدر تسجل دخول بحساب الأدمن اللي لسه عامله.

---

## 💡 نصائح مهمة للإنتاج (Production)

### 1. كيف أقوم بتحديث النظام لاحقاً؟
لو عدلت الكود على جهازك ورفعته لـ GitHub، عشان تطبقه على Contabo اعمل التالي:
```bash
cd /root/crmapp
git pull origin main
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

### 2. كيفية ربط دومين وتفعيل HTTPS (اختياري لكن مهم جداً)
بما إنك بتتعامل مع نظام فيه بيانات عملاء وباسوردات، يُفضل ربطه بدومين وتفعيل `HTTPS`.
أسهل طريقة هي تسطيب **Nginx Proxy Manager** كحاوية Docker إضافية أو استخدام **Cloudflare**:
- اربط الدومين بتاعك بـ Cloudflare.
- وجه الـ DNS (A Record) للـ IP بتاع Contabo.
- فعّل الـ `Full (Strict)` SSL من لوحة تحكم Cloudflare.

### 3. أخذ نسخ احتياطية (Backups)
لحفظ نسخة احتياطية من قاعدة البيانات على سيرفرك:
```bash
docker exec crm-postgres-prod pg_dump -U myuser mydb > backup_$(date +\%F).sql
```
*(استبدل `myuser` بـ `POSTGRES_USER` و `mydb` بـ `POSTGRES_DB` من ملف `.env`)*

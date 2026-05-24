/**
 * سكريبت استعادة البيانات من ملف الـ Backup
 * 
 * الاستخدام:
 *   DATABASE_URL="postgresql://..." node scripts/import-production.js backups/production-full-backup-XXXX.json
 * 
 * ⚠️ تحذير: هذا السكريبت يحذف جميع البيانات الحالية قبل الاستعادة
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const backupFile = process.argv[2];
if (!backupFile) {
  console.error("❌ محتاج تحدد ملف الـ backup:");
  console.error("   DATABASE_URL=\"...\" node scripts/import-production.js backups/production-full-backup-XXXX.json");
  process.exit(1);
}

const filePath = path.resolve(__dirname, "..", backupFile);
if (!fs.existsSync(filePath)) {
  console.error(`❌ الملف مش موجود: ${filePath}`);
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const { regions, users, clients, visitHistories, activityLogs } = raw.tables;

  console.log(`📂 ملف الـ Backup: ${backupFile}`);
  console.log(`📅 تاريخ التصدير: ${raw.exportDate}`);
  console.log(`   - مناطق: ${regions.length}`);
  console.log(`   - مستخدمين: ${users.length}`);
  console.log(`   - عملاء: ${clients.length}`);
  console.log(`   - زيارات: ${visitHistories.length}`);
  console.log(`   - نشاطات: ${activityLogs.length}`);
  console.log("");

  // حذف البيانات الحالية بالترتيب الصحيح (FK constraints)
  console.log("🗑️  جاري حذف البيانات القديمة...");
  await prisma.activityLog.deleteMany();
  await prisma.visitHistory.deleteMany();
  await prisma.client.deleteMany();

  // فك ارتباط المناطق من المستخدمين (Many-to-Many)
  const existingUsers = await prisma.user.findMany({ include: { regions: true } });
  for (const u of existingUsers) {
    if (u.regions.length > 0) {
      await prisma.user.update({
        where: { id: u.id },
        data: { regions: { set: [] } }
      });
    }
  }
  await prisma.user.deleteMany();
  await prisma.region.deleteMany();

  // إعادة تعيين الـ sequences
  console.log("🔄 إعادة تعيين الـ auto-increment...");
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Region_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "User_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Client_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "VisitHistory_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "ActivityLog_id_seq" RESTART WITH 1`);

  // إدخال المناطق
  console.log("📍 جاري استعادة المناطق...");
  for (const r of regions) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Region" (id, code, name, "isDeleted", "deletedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      r.id, r.code, r.name, r.isDeleted || false, r.deletedAt ? new Date(r.deletedAt) : null, new Date(r.createdAt), new Date(r.updatedAt)
    );
  }
  const maxRegionId = Math.max(...regions.map(r => r.id));
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Region_id_seq" RESTART WITH ${maxRegionId + 1}`);

  // إدخال المستخدمين
  console.log("👥 جاري استعادة المستخدمين...");
  for (const u of users) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, name, email, "passwordHash", role, "isActive", "allowedDate", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::\"Role\", $6, $7, $8, $9)`,
      u.id, u.name, u.email, u.passwordHash, u.role, u.isActive, u.allowedDate || null, new Date(u.createdAt), new Date(u.updatedAt)
    );
  }
  const maxUserId = Math.max(...users.map(u => u.id));
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "User_id_seq" RESTART WITH ${maxUserId + 1}`);

  // استعادة علاقات المناطق-المستخدمين (Many-to-Many)
  console.log("🔗 جاري استعادة ربط المناطق بالمستخدمين...");
  // نحتاج نعرف الجدول الوسيط - اسمه _RegionToUser
  // نجيب البيانات من الـ backup لو موجودة، أو نعيد بناءها
  if (raw.tables._RegionToUser) {
    for (const link of raw.tables._RegionToUser) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_RegionToUser" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        link.A, link.B
      );
    }
  }

  // إدخال العملاء
  console.log("🏢 جاري استعادة العملاء...");
  for (const c of clients) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Client" (id, name, phone, address, "locationUrl", products, price, "regionId", "visitType", "customVisitIntervalDays", status, "noAnswerCount", "nextVisitDate", "pendingOutcome", "pendingNote", "pendingVisitType", "pendingCustomVisitIntervalDays", "createdById", "isDeleted", "deletedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::\"VisitType\", $10, $11::\"ClientStatus\", $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      c.id, c.name, c.phone, c.address, c.locationUrl || null, c.products, c.price || null,
      c.regionId, c.visitType, c.customVisitIntervalDays || null, c.status, c.noAnswerCount || 0,
      new Date(c.nextVisitDate),
      c.pendingOutcome || null, c.pendingNote || null, c.pendingVisitType || null, c.pendingCustomVisitIntervalDays || null,
      c.createdById || null, c.isDeleted || false, c.deletedAt ? new Date(c.deletedAt) : null,
      new Date(c.createdAt), new Date(c.updatedAt)
    );
  }
  const maxClientId = Math.max(...clients.map(c => c.id));
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Client_id_seq" RESTART WITH ${maxClientId + 1}`);

  // إدخال سجل الزيارات
  console.log("📋 جاري استعادة سجل الزيارات...");
  for (const v of visitHistories) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VisitHistory" (id, "clientId", "visitedById", "visitDate", "previousStatus", "newStatus", note, "previousNextVisitDate", "newNextVisitDate", "createdAt") VALUES ($1, $2, $3, $4, $5::\"ClientStatus\", $6::\"ClientStatus\", $7, $8, $9, $10)`,
      v.id, v.clientId, v.visitedById, new Date(v.visitDate),
      v.previousStatus, v.newStatus, v.note || null,
      v.previousNextVisitDate ? new Date(v.previousNextVisitDate) : null,
      v.newNextVisitDate ? new Date(v.newNextVisitDate) : null,
      new Date(v.createdAt)
    );
  }
  const maxVisitId = Math.max(...visitHistories.map(v => v.id));
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "VisitHistory_id_seq" RESTART WITH ${maxVisitId + 1}`);

  // إدخال سجل النشاطات
  console.log("📝 جاري استعادة سجل النشاطات...");
  for (const log of activityLogs) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActivityLog" (id, "userId", action, "entityType", "entityId", "entityName", details, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      log.id, log.userId, log.action, log.entityType, log.entityId || null, log.entityName || null, log.details || null, new Date(log.createdAt)
    );
  }
  const maxLogId = Math.max(...activityLogs.map(l => l.id));
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "ActivityLog_id_seq" RESTART WITH ${maxLogId + 1}`);

  console.log("\n✅ تم استعادة جميع البيانات بنجاح! 🎉");
}

main()
  .catch((e) => {
    console.error("❌ خطأ:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

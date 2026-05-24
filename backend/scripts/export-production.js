const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:egzEUhSYOWHnPNhQzkcmHwgHTUhSXsxZ@shortline.proxy.rlwy.net:16890/railway"
    }
  }
});

async function main() {
  console.log("🔗 جاري الاتصال بقاعدة بيانات الـ Production...");

  const [regions, users, clients, visits, activityLogs, regionUserLinks] = await Promise.all([
    prisma.$queryRaw`SELECT * FROM "Region"`,
    prisma.$queryRaw`SELECT * FROM "User"`,
    prisma.$queryRaw`SELECT * FROM "Client"`,
    prisma.$queryRaw`SELECT * FROM "VisitHistory"`,
    prisma.$queryRaw`SELECT * FROM "ActivityLog"`,
    prisma.$queryRaw`SELECT * FROM "_RegionToUser"`
  ]);

  console.log(`✅ تم جلب البيانات:`);
  console.log(`   - المناطق: ${regions.length}`);
  console.log(`   - المستخدمين: ${users.length}`);
  console.log(`   - ربط المناطق بالمستخدمين: ${regionUserLinks.length}`);
  console.log(`   - العملاء: ${clients.length}`);
  console.log(`   - سجل الزيارات: ${visits.length}`);
  console.log(`   - سجل النشاطات: ${activityLogs.length}`);

  const backupData = {
    exportDate: new Date().toISOString(),
    version: "1.0",
    tables: {
      regions,
      users,
      _RegionToUser: regionUserLinks,
      clients,
      visitHistories: visits,
      activityLogs
    }
  };

  const backupDir = path.join(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(backupDir, `production-full-backup-${timestamp}.json`);
  
  fs.writeFileSync(filePath, JSON.stringify(backupData, (key, value) => {
    return typeof value === "bigint" ? Number(value) : value;
  }, 2));

  console.log(`\n📦 تم حفظ الـ Backup في:\n   ${filePath}`);
  console.log(`   حجم الملف: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`);
} 

main()
  .catch((e) => {
    console.error("❌ خطأ:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

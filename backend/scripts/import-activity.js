const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const fileData = fs.readFileSync(process.argv[2], 'utf8');
  const data = JSON.parse(fileData);
  const activityLogs = data.tables.activityLogs;

  console.log("📝 جاري استعادة سجل النشاطات...", activityLogs.length);
  
  // Clear existing ActivityLogs first to avoid duplicates
  await prisma.activityLog.deleteMany({});
  
  const chunkSize = 500;
  for (let i = 0; i < activityLogs.length; i += chunkSize) {
    const chunk = activityLogs.slice(i, i + chunkSize);
    console.log(`Inserting chunk ${i} to ${i + chunk.length}`);
    
    const values = [];
    chunk.forEach(log => {
      // Escape strings and handle nulls
      const id = log.id;
      const userId = log.userId;
      const action = log.action.replace(/'/g, "''");
      const entityType = log.entityType.replace(/'/g, "''");
      const entityId = log.entityId ? log.entityId : 'NULL';
      const entityName = log.entityName ? `'${log.entityName.replace(/'/g, "''")}'` : 'NULL';
      const details = log.details ? `'${JSON.stringify(log.details).replace(/'/g, "''")}'` : 'NULL';
      const createdAt = new Date(log.createdAt).toISOString();
      
      values.push(`(${id}, ${userId}, '${action}', '${entityType}', ${entityId}, ${entityName}, ${details}, '${createdAt}')`);
    });
    
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActivityLog" (id, "userId", action, "entityType", "entityId", "entityName", details, "createdAt") VALUES ${values.join(', ')}`
    );
  }

  const maxLogId = Math.max(...activityLogs.map(l => l.id), 0);
  if (maxLogId > 0) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "ActivityLog_id_seq" RESTART WITH ${maxLogId + 1}`);
  }

  console.log("\n✅ تم استعادة سجل النشاطات بنجاح! 🎉");
}

main()
  .catch((e) => {
    console.error("❌ خطأ:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

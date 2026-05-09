const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to production database...");
  const [users, regions, clients, visits] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true } }),
    prisma.region.findMany(),
    prisma.client.findMany(),
    prisma.visitHistory.findMany()
  ]);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupData = {
    timestamp,
    users,
    regions,
    clients,
    visits
  };

  const filename = `crm-backup-production-${timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
  console.log(`Backup saved to ${filename}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

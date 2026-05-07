const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function main() {
  const prisma = new PrismaClient();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  console.log('Starting backup...');

  try {
    const [users, regions, clients, visits] = await Promise.all([
      prisma.user.findMany(),
      prisma.region.findMany(),
      prisma.client.findMany({ include: { visits: true } }),
      prisma.visitHistory.findMany()
    ]);

    const backupData = {
      timestamp,
      users,
      regions,
      clients,
      visits
    };

    const fileName = `backup-${timestamp}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
    
    console.log(`Backup completed successfully!`);
    console.log(`File saved to: ${filePath}`);
    console.log(`Total records: 
      Users: ${users.length}
      Regions: ${regions.length}
      Clients: ${clients.length}
      Visits: ${visits.length}`);
  } catch (error) {
    console.error('Backup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed of 5000 clients...");

  // 1. Create more regions if needed
  const existingRegions = await prisma.region.findMany();
  const regionsToCreate = 40;
  
  if (existingRegions.length < 40) {
    console.log(`Creating ${regionsToCreate} more regions...`);
    const startCode = existingRegions.length > 0 ? Math.max(...existingRegions.map(r => r.code)) + 1 : 1001;
    
    for (let i = 0; i < regionsToCreate; i++) {
      await prisma.region.create({
        data: {
          code: startCode + i,
          name: `منطقة تجريبية ${startCode + i}`
        }
      });
    }
  }

  const allRegions = await prisma.region.findMany();
  const regionIds = allRegions.map(r => r.id);
  
  console.log(`Using ${regionIds.length} regions to distribute 5000 clients.`);

  const visitTypes = ["WEEKLY", "BIWEEKLY", "MONTHLY"];
  const statuses = ["ACTIVE", "NO_ANSWER"];
  
  const batchSize = 500;
  const totalClients = 5000;
  
  for (let i = 0; i < totalClients; i += batchSize) {
    const clientsData = [];
    for (let j = 0; j < batchSize; j++) {
      const clientIndex = i + j + 1;
      const regionId = regionIds[Math.floor(Math.random() * regionIds.length)];
      
      clientsData.push({
        name: `عميل تجريبي ${clientIndex}`,
        phone: `01${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
        address: `شارع ${clientIndex}, الحي ${Math.floor(Math.random() * 10) + 1}`,
        products: "منتج A, منتج B",
        price: (Math.floor(Math.random() * 500) + 50).toString(),
        regionId: regionId,
        visitType: visitTypes[Math.floor(Math.random() * visitTypes.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        nextVisitDate: new Date(Date.now() + Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
      });
    }
    
    await prisma.client.createMany({
      data: clientsData
    });
    
    console.log(`Inserted batch ${i / batchSize + 1} (${i + batchSize} clients)...`);
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

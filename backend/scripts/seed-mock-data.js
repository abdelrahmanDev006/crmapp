const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Wiping database...");
  await prisma.visitHistory.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.region.deleteMany();
  
  console.log("Creating 30 Regions...");
  const regions = [];
  for (let i = 1; i <= 30; i++) {
    const region = await prisma.region.create({
      data: {
        name: `منطقة ${i}`,
        code: i
      }
    });
    regions.push(region);
  }

  console.log("Creating 5 Admins...");
  const passwordHash = await bcrypt.hash("123456", 10);
  for (let i = 1; i <= 5; i++) {
    await prisma.user.create({
      data: {
        name: `المدير ${i}`,
        email: `admin${i}@crm.local`,
        passwordHash: passwordHash,
        role: "ADMIN",
        isActive: true,
      }
    });
  }

  console.log("Creating 20 Representatives...");
  const reps = [];
  for (let i = 1; i <= 20; i++) {
    const repRegions = [
      { id: regions[Math.floor(Math.random() * regions.length)].id },
      { id: regions[Math.floor(Math.random() * regions.length)].id }
    ];
    
    const uniqueRepRegions = Array.from(new Set(repRegions.map(r => r.id))).map(id => ({ id }));

    const rep = await prisma.user.create({
      data: {
        name: `المندوب ${i}`,
        email: `rep${i}@crm.local`,
        passwordHash: passwordHash,
        role: "REPRESENTATIVE",
        isActive: true,
        regions: {
          connect: uniqueRepRegions
        }
      }
    });
    reps.push(rep);
  }

  console.log("Creating 10,000 Clients (this might take a minute)...");
  const batchSize = 1000;
  const visitTypes = ["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"];
  const statuses = ["ACTIVE", "NO_ANSWER", "REJECTED"];

  for (let b = 0; b < 10; b++) {
    const clientsData = [];
    for (let i = 1; i <= batchSize; i++) {
      const clientIndex = b * batchSize + i;
      const region = regions[Math.floor(Math.random() * regions.length)];
      const visitType = visitTypes[Math.floor(Math.random() * visitTypes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      clientsData.push({
        name: `العميل ${clientIndex}`,
        phone: `01${Math.floor(100000000 + Math.random() * 900000000)}`,
        address: `عنوان العميل ${clientIndex} في ${region.name}`,
        regionId: region.id,
        products: `منتج ${Math.floor(Math.random() * 10)}، منتج ${Math.floor(Math.random() * 10)}`,
        price: (Math.floor(Math.random() * 100) * 10).toString(),
        visitType: visitType,
        customVisitIntervalDays: visitType === "CUSTOM" ? Math.floor(Math.random() * 30) + 10 : null,
        status: status,
        nextVisitDate: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
        noAnswerCount: status === "NO_ANSWER" ? Math.floor(Math.random() * 3) + 1 : 0,
      });
    }
    
    await prisma.client.createMany({
      data: clientsData
    });
    console.log(`Created batch ${b + 1}/10`);
  }

  console.log("Seeding completed successfully! Admins and reps all have password '123456'");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

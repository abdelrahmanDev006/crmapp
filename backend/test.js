const prisma = require('./src/config/prisma');

async function main() {
  const [year, month] = ["2026", "06"];
  const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const endDate = new Date(Date.UTC(Number(year), Number(month), 1));

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      status: "REJECTED",
      AND: [
        {
          OR: [
            {
              visits: {
                some: {
                  newStatus: "REJECTED",
                  visitDate: { gte: startDate, lt: endDate }
                }
              }
            },
            {
              visits: { none: {} },
              updatedAt: { gte: startDate, lt: endDate }
            }
          ]
        }
      ]
    }
  });

  console.log(`Found ${clients.length} clients for ${year}-${month}`);
}

main().finally(() => prisma.$disconnect());

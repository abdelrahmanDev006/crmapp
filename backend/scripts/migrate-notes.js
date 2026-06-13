const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    include: {
      visits: {
        where: { note: { not: null, notIn: [''] } },
        orderBy: { visitDate: 'asc' },
        take: 1
      }
    }
  });
  
  let count = 0;
  for (const c of clients) {
    if (c.visits.length > 0 && c.visits[0].note) {
      await prisma.client.update({
        where: { id: c.id },
        data: { note: c.visits[0].note }
      });
      count++;
    }
  }
  console.log(`Updated notes for ${count} clients.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

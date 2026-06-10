const prisma = require('./src/config/prisma');

async function check() {
  const clients = await prisma.client.findMany({
    where: { visitType: 'ONE_TIME' },
    orderBy: { updatedAt: 'desc' },
    take: 5
  });
  console.log(clients.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    nextVisitDate: c.nextVisitDate,
    isExceptional: c.isExceptional,
    updatedAt: c.updatedAt
  })));
}
check().catch(console.error).finally(() => process.exit(0));

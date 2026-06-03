const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.region.findUnique({ where: { id: 1 } });
  console.log("Region 1:", r);
}
main().finally(() => prisma.$disconnect());

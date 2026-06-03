const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.region.findFirst();
  console.log(result.id);
}
main().finally(() => prisma.$disconnect());

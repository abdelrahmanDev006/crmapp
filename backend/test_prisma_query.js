const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });
async function main() {
  const start = Date.now();
  await prisma.client.findFirst({
    where: {
      isDeleted: false,
      regionId: 1,
      name: { equals: "test name", mode: "insensitive" }
    }
  });
  console.log("Time taken:", Date.now() - start, "ms");
}
main().finally(() => prisma.$disconnect());

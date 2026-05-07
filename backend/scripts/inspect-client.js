const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findUnique({
    where: { id: 245 },
    include: { visits: true }
  });
  console.log('CLIENT 245:', JSON.stringify(client, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

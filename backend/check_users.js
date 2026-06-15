const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { name: { contains: "ahmed", mode: "insensitive" } }
  });
  console.log(users);
}
main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

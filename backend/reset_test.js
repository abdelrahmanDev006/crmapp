const prisma = require('./src/config/prisma');
async function reset() {
  await prisma.client.update({
    where: { id: 7055 },
    data: { 
      status: 'ACTIVE', 
      nextVisitDate: new Date('2026-06-08T21:00:00.000Z'),
      noAnswerCount: 0
    }
  });
  console.log("Reset done");
}
reset().catch(console.error).finally(() => process.exit(0));

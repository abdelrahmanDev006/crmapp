const prisma = require('./src/config/prisma');
async function fix() {
  const result = await prisma.client.updateMany({
    where: { visitType: 'ONE_TIME', isDeleted: true, isExceptional: false },
    data: { isDeleted: false, deletedAt: null }
  });
  console.log("Fixed", result.count, "deleted ONE_TIME clients");
}
fix().catch(console.error).finally(() => process.exit(0));

const prisma = require('./src/config/prisma');
async function check() {
  const c = await prisma.client.findUnique({ where: { id: 7055 } });
  console.log({ id: c.id, visitType: c.visitType, status: c.status, nextVisitDate: c.nextVisitDate, isDeleted: c.isDeleted, isExceptional: c.isExceptional });
  
  // Now try the exact query
  const results = await prisma.client.findMany({
    where: {
      isDeleted: false,
      NOT: [{ isExceptional: true, status: "REJECTED" }],
      visitType: "ONE_TIME"
    }
  });
  console.log("Query results count:", results.length);
  results.forEach(r => console.log({ id: r.id, name: r.name, status: r.status, isExceptional: r.isExceptional, isDeleted: r.isDeleted }));
}
check().catch(console.error).finally(() => process.exit(0));

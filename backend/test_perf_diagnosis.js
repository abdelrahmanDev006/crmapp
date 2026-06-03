const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

async function measure(label, fn) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  console.log(`  [${ms}ms] ${label}`);
  return result;
}

async function main() {
  console.log("=== COMPREHENSIVE PERFORMANCE DIAGNOSIS ===\n");

  // 1. Basic DB connectivity
  console.log("--- 1. Database Connectivity ---");
  await measure("SELECT 1 (ping)", () => prisma.$queryRawUnsafe("SELECT 1"));
  await measure("SELECT 1 (2nd call, warm)", () => prisma.$queryRawUnsafe("SELECT 1"));

  // 2. Count clients
  console.log("\n--- 2. Table Size ---");
  const clientCount = await measure("Client COUNT", () => prisma.client.count());
  console.log(`     Total clients: ${clientCount}`);
  const visitCount = await measure("VisitHistory COUNT", () => prisma.visitHistory.count());
  console.log(`     Total visits: ${visitCount}`);
  const logCount = await measure("ActivityLog COUNT", () => prisma.activityLog.count());
  console.log(`     Total logs: ${logCount}`);

  // 3. Region lookup (used in createClient)
  console.log("\n--- 3. Region Lookup (PK index) ---");
  await measure("region.findUnique(id:1)", () => prisma.region.findUnique({ where: { id: 1 } }));

  // 4. Phone duplicate check (raw SQL with functional index)
  console.log("\n--- 4. Phone Duplicate Check ---");
  await measure("findDuplicatePhoneClient (raw SQL)", () => prisma.$queryRaw`
    SELECT c.id, c.name, c.phone, c."regionId"
    FROM "Client" c
    WHERE c."isDeleted" = false AND regexp_replace(
      translate(c.phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
      '[^0-9]',
      '',
      'g'
    ) = '01099999999'
    LIMIT 1
  `);

  // 5. Name duplicate check (raw SQL - the new fix)
  console.log("\n--- 5. Name Duplicate Check (NEW raw SQL) ---");
  await measure("name duplicate (raw SQL LOWER)", () => prisma.$queryRaw`
    SELECT c.id, c.name
    FROM "Client" c
    WHERE c."isDeleted" = false
      AND c."regionId" = 1
      AND LOWER(c.name) = LOWER(${"اسم تجريبي غير موجود"})
    LIMIT 1
  `);

  // 6. Name duplicate check (OLD Prisma ILIKE - for comparison)
  console.log("\n--- 6. Name Duplicate Check (OLD Prisma ILIKE - comparison) ---");
  await measure("name duplicate (Prisma ILIKE)", () => prisma.client.findFirst({
    where: {
      isDeleted: false,
      regionId: 1,
      name: { equals: "اسم تجريبي غير موجود", mode: "insensitive" }
    },
    select: { id: true, name: true }
  }));

  // 7. Client creation in transaction (dry run - rollback)
  console.log("\n--- 7. Transaction: Create + VisitHistory ---");
  const txStart = Date.now();
  try {
    await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: "TEST_PERF_" + Date.now(),
          phone: "00000000000",
          address: "test",
          products: "test",
          regionId: 1,
          visitType: "WEEKLY",
          status: "ACTIVE",
          nextVisitDate: new Date(),
          createdById: 1
        },
        include: { region: true }
      });
      console.log(`  [${Date.now() - txStart}ms] client.create inside TX`);
      
      // Rollback by throwing
      throw new Error("ROLLBACK_TEST");
    });
  } catch (e) {
    if (e.message !== "ROLLBACK_TEST") throw e;
  }
  console.log(`  [${Date.now() - txStart}ms] Full transaction (rolled back)`);

  // 8. Activity log insert
  console.log("\n--- 8. Activity Log Insert ---");
  await measure("activityLog.create", async () => {
    const log = await prisma.activityLog.create({
      data: {
        userId: 1,
        action: "TEST_PERF",
        entityType: "CLIENT",
        entityName: "test",
        details: "performance test"
      }
    });
    // Clean up
    await prisma.activityLog.delete({ where: { id: log.id } });
  });

  // 9. The REAL bottleneck: listClientsByRegionPage (called after create)
  console.log("\n--- 9. listClientsByRegionPage simulation ---");
  const regionGroupStart = Date.now();
  const regionGroups = await measure("groupBy regionId", () => prisma.client.groupBy({
    by: ["regionId"],
    where: { isDeleted: false },
    _count: { _all: true }
  }));
  
  const regionIds = regionGroups.map(g => g.regionId);
  const regionDetails = await measure("region.findMany (sorted)", () => prisma.region.findMany({
    where: { id: { in: regionIds } },
    select: { id: true, code: true },
    orderBy: { code: "asc" }
  }));

  const pageRegionIds = regionDetails.slice(0, 5).map(r => r.id);
  const items = await measure("client.findMany (5 regions + relations)", () => prisma.client.findMany({
    where: { isDeleted: false, regionId: { in: pageRegionIds } },
    include: {
      region: { select: { id: true, code: true, name: true } },
      visits: { select: { note: true }, where: { note: { not: null } }, orderBy: { visitDate: "desc" } }
    },
    orderBy: [{ nextVisitDate: "asc" }, { id: "asc" }]
  }));
  console.log(`  Total items for 5 regions: ${items.length}`);
  console.log(`  Total listClientsByRegionPage time: ${Date.now() - regionGroupStart}ms`);

  // 10. Check EXPLAIN for phone query
  console.log("\n--- 10. EXPLAIN ANALYZE: Phone Index ---");
  const phoneExplain = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT c.id FROM "Client" c
    WHERE c."isDeleted" = false AND regexp_replace(
      translate(c.phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
      '[^0-9]', '', 'g'
    ) = '01099999999'
    LIMIT 1
  `);
  phoneExplain.forEach(r => console.log("  ", r["QUERY PLAN"]));

  // 11. Check EXPLAIN for name query
  console.log("\n--- 11. EXPLAIN ANALYZE: Name Index ---");
  const nameExplain = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT c.id FROM "Client" c
    WHERE c."isDeleted" = false
      AND c."regionId" = 1
      AND LOWER(c.name) = LOWER('test')
    LIMIT 1
  `);
  nameExplain.forEach(r => console.log("  ", r["QUERY PLAN"]));

  // 12. List all indexes on Client table
  console.log("\n--- 12. Existing Indexes on Client ---");
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'Client'
    ORDER BY indexname;
  `);
  indexes.forEach(idx => console.log(`  ${idx.indexname}: ${idx.indexdef}`));

  console.log("\n=== DIAGNOSIS COMPLETE ===");
}

main().finally(() => prisma.$disconnect());

const { PrismaClient } = require("@prisma/client");

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function printUsageAndExit() {
  console.error("Usage:");
  console.error('  TARGET_DATABASE_URL="<postgres-url>" npm run db:copy');
  console.error("");
  console.error("Optional:");
  console.error('  SOURCE_DATABASE_URL="<postgres-url>"');
  console.error("  ALLOW_NON_EMPTY_TARGET=true");
  console.error("  BATCH_SIZE=500");
  process.exit(1);
}

function toSummary(counts) {
  return `regions=${counts.regions}, users=${counts.users}, clients=${counts.clients}, visits=${counts.visits}, total=${counts.total}`;
}

async function getCounts(client) {
  const [regions, users, clients, visits] = await Promise.all([
    client.region.count(),
    client.user.count(),
    client.client.count(),
    client.visitHistory.count()
  ]);

  return {
    regions,
    users,
    clients,
    visits,
    total: regions + users + clients + visits
  };
}

async function insertInBatches(label, rows, batchSize, insertFn) {
  if (!rows || rows.length === 0) {
    console.log(`[COPY] ${label}: no rows`);
    return;
  }

  for (let start = 0; start < rows.length; start += batchSize) {
    const chunk = rows.slice(start, start + batchSize);
    await insertFn(chunk);
    console.log(`[COPY] ${label}: ${Math.min(start + chunk.length, rows.length)}/${rows.length}`);
  }
}

async function resetSequences(target) {
  await target.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Region"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "Region"), 1), true);`
  );
  await target.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "User"), 1), true);`
  );
  await target.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Client"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "Client"), 1), true);`
  );
  await target.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"VisitHistory"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "VisitHistory"), 1), true);`
  );
}

async function main() {
  const sourceUrl = String(process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  const targetUrl = String(process.env.TARGET_DATABASE_URL || "").trim();
  const allowNonEmptyTarget = parseBoolean(process.env.ALLOW_NON_EMPTY_TARGET, false);
  const batchSize = parseNumber(process.env.BATCH_SIZE, 500);

  if (!sourceUrl || !targetUrl) {
    printUsageAndExit();
  }

  if (sourceUrl === targetUrl) {
    throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL must be different.");
  }

  const source = new PrismaClient({
    datasources: {
      db: {
        url: sourceUrl
      }
    }
  });

  const target = new PrismaClient({
    datasources: {
      db: {
        url: targetUrl
      }
    }
  });

  try {
    console.log("[COPY] Connecting...");
    await Promise.all([source.$connect(), target.$connect()]);

    const [sourceCounts, targetCounts] = await Promise.all([getCounts(source), getCounts(target)]);
    console.log(`[COPY] Source counts: ${toSummary(sourceCounts)}`);
    console.log(`[COPY] Target counts: ${toSummary(targetCounts)}`);

    if (sourceCounts.total === 0) {
      console.log("[COPY] Source is empty, nothing to copy.");
      return;
    }

    if (targetCounts.total > 0 && !allowNonEmptyTarget) {
      throw new Error(
        "Target database is not empty. Re-run with ALLOW_NON_EMPTY_TARGET=true if you want this script to wipe target tables before copy."
      );
    }

    if (targetCounts.total > 0 && allowNonEmptyTarget) {
      console.log("[COPY] Wiping target tables...");
      await target.visitHistory.deleteMany({});
      await target.client.deleteMany({});
      await target.user.deleteMany({});
      await target.region.deleteMany({});
    }

    console.log("[COPY] Reading from source...");
    const [regions, users, clients, visits] = await Promise.all([
      source.region.findMany({ orderBy: { id: "asc" } }),
      source.user.findMany({ orderBy: { id: "asc" } }),
      source.client.findMany({ orderBy: { id: "asc" } }),
      source.visitHistory.findMany({ orderBy: { id: "asc" } })
    ]);

    console.log(`[COPY] Using batch size: ${batchSize}`);
    await insertInBatches("Region", regions, batchSize, (chunk) => target.region.createMany({ data: chunk }));
    await insertInBatches("User", users, batchSize, (chunk) => target.user.createMany({ data: chunk }));
    await insertInBatches("Client", clients, batchSize, (chunk) => target.client.createMany({ data: chunk }));
    await insertInBatches("VisitHistory", visits, batchSize, (chunk) => target.visitHistory.createMany({ data: chunk }));

    console.log("[COPY] Resetting sequences...");
    await resetSequences(target);

    const finalCounts = await getCounts(target);
    console.log(`[COPY] Final target counts: ${toSummary(finalCounts)}`);

    if (
      finalCounts.regions !== sourceCounts.regions ||
      finalCounts.users !== sourceCounts.users ||
      finalCounts.clients !== sourceCounts.clients ||
      finalCounts.visits !== sourceCounts.visits
    ) {
      throw new Error("Copy finished with mismatched row counts.");
    }

    console.log("[COPY] Database copy completed successfully.");
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((error) => {
  console.error("[COPY] FAILED");
  console.error(error.message || error);
  process.exit(1);
});

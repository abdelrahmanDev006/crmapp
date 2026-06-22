const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const prisma = new PrismaClient();

function formatIds(ids) {
  return ids.slice(0, 10).join(", ");
}

function printDuplicateRows(title, rows, renderKey) {
  if (rows.length === 0) {
    return;
  }

  console.error(title);
  for (const row of rows) {
    const ids = Array.isArray(row.clientIds) ? row.clientIds : [];
    console.error(`- ${renderKey(row)} | count=${row.count} | clientIds=${formatIds(ids)}`);
  }
}

async function main() {
  const duplicatePhones = await prisma.$queryRaw`
    WITH normalized_clients AS (
      SELECT
        id,
        COALESCE(
          "phoneNormalized",
          NULLIF(
            regexp_replace(
              translate(phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
              '[^0-9]',
              '',
              'g'
            ),
            ''
          )
        ) AS "normalizedPhone"
      FROM "Client"
      WHERE "isDeleted" = false
    )
    SELECT
      "normalizedPhone",
      COUNT(*)::int AS "count",
      array_agg(id ORDER BY id) AS "clientIds"
    FROM normalized_clients
    WHERE "normalizedPhone" IS NOT NULL
    GROUP BY "normalizedPhone"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, "normalizedPhone"
    LIMIT 50;
  `;

  if (duplicatePhones.length === 0) {
    console.log("[CLIENT DUPLICATE CHECK] PASSED");
    return;
  }

  console.error("[CLIENT DUPLICATE CHECK] FAILED");
  printDuplicateRows("Duplicate active phone numbers:", duplicatePhones, (row) => {
    return `phoneNormalized=${row.normalizedPhone}`;
  });
  console.error("Resolve these duplicates before applying the unique-index migration.");
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

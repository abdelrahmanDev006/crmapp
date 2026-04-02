const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const { getCurrentWorkWeekStart } = require("../src/utils/dateUtils");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

async function normalizeClientNextVisitDates() {
  let processed = 0;
  let updated = 0;
  let cursorId = 0;

  while (true) {
    const clients = await prisma.client.findMany({
      where: {
        id: {
          gt: cursorId
        }
      },
      orderBy: {
        id: "asc"
      },
      take: BATCH_SIZE,
      select: {
        id: true,
        nextVisitDate: true
      }
    });

    if (clients.length === 0) {
      break;
    }

    const updates = clients
      .map((client) => {
        const normalizedDate = getCurrentWorkWeekStart(client.nextVisitDate);
        return {
          id: client.id,
          currentDate: client.nextVisitDate,
          normalizedDate
        };
      })
      .filter((item) => item.currentDate.getTime() !== item.normalizedDate.getTime());

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((item) =>
          prisma.client.update({
            where: { id: item.id },
            data: { nextVisitDate: item.normalizedDate }
          })
        )
      );
    }

    processed += clients.length;
    updated += updates.length;
    cursorId = clients[clients.length - 1].id;

    console.log(`Processed ${processed} clients, updated ${updated}.`);
  }

  console.log(`Normalization completed. Processed ${processed} clients, updated ${updated}.`);
}

normalizeClientNextVisitDates()
  .catch((error) => {
    console.error("Failed to normalize client nextVisitDate values:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

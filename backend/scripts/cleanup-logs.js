const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function cleanupLogs() {
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.activityLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });

    console.log(`Successfully deleted ${result.count} old activity logs.`);
  } catch (error) {
    console.error("Error cleaning up logs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupLogs();

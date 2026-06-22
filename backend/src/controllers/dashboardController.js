const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");
const { ClientStatuses, Roles } = require("../constants/enums");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { getRegionSummary } = require("./regionController");
const { logActivity } = require("../services/logService");

async function streamJsonArray(res, key, fetchBatch) {
  res.write(`"${key}":[`);

  let cursorId = 0;
  let isFirstItem = true;
  let count = 0;

  while (true) {
    const batch = await fetchBatch(cursorId);

    if (batch.length === 0) {
      break;
    }

    for (const item of batch) {
      if (!isFirstItem) {
        res.write(",");
      }

      res.write(JSON.stringify(item));
      isFirstItem = false;
      count += 1;
      cursorId = item.id;
    }
  }

  res.write("]");
  return count;
}

function getWorkDateRange(dateValue) {
  const start = normalizeToWorkDate(dateValue);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

const summary = asyncHandler(async (req, res) => {
  const todayRange = getWorkDateRange(new Date());

  const globalWhere =
    req.user.role === Roles.ADMIN
      ? { isDeleted: false }
        : {
            isDeleted: false,
            regionId: { in: req.user.regions?.map((r) => r.id) || [] }
          };

  const [regions, dueClients, statusGroups] = await Promise.all([
    getRegionSummary(),
    prisma.client.count({
      where: {
        ...globalWhere,
        nextVisitDate: {
          gte: todayRange.start,
          lt: todayRange.end
        },
        status: { in: [ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER] }
      }
    }),
    prisma.client.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: globalWhere
    })
  ]);

  const statusCounts = statusGroups.reduce((acc, group) => {
    acc[group.status] = group._count._all;
    return acc;
  }, { ACTIVE: 0, REJECTED: 0, NO_ANSWER: 0 });

  const totalClients = statusCounts.ACTIVE + statusCounts.NO_ANSWER;
  const activeClients = statusCounts.ACTIVE;
  const rejectedClients = statusCounts.REJECTED;

  const regionItems =
    req.user.role === Roles.ADMIN 
      ? regions 
      : regions.filter((region) => req.user.regions?.some(r => Number(r.id) === Number(region.id)));

  res.json({
    totals: {
      totalClients,
      dueClients,
      activeClients,
      rejectedClients
    },
    regions: regionItems
  });
});

const backup = asyncHandler(async (req, res) => {
  if (req.user.role !== Roles.ADMIN) {
    return res.status(403).json({ message: "غير مسموح بالوصول لهذا الإجراء" });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  res.setHeader("Content-Disposition", `attachment; filename=crm-backup-${timestamp}.json`);
  res.setHeader("Content-Type", "application/json");

  res.write("{");
  res.write(`"timestamp":${JSON.stringify(timestamp)},`);

  const usersCount = await streamJsonArray(res, "users", (cursorId) =>
    prisma.user.findMany({
      where: { id: { gt: cursorId } },
      select: { id: true, name: true, email: true, role: true, regions: true, isActive: true },
      orderBy: { id: "asc" },
      take: 500
    })
  );
  res.write(",");

  const regionsCount = await streamJsonArray(res, "regions", (cursorId) =>
    prisma.region.findMany({
      where: { id: { gt: cursorId } },
      orderBy: { id: "asc" },
      take: 500
    })
  );
  res.write(",");

  const clientsCount = await streamJsonArray(res, "clients", (cursorId) =>
    prisma.client.findMany({
      where: { id: { gt: cursorId } },
      orderBy: { id: "asc" },
      take: 500
    })
  );
  res.write(",");

  const visitsCount = await streamJsonArray(res, "visits", (cursorId) =>
    prisma.visitHistory.findMany({
      where: { id: { gt: cursorId } },
      orderBy: { id: "asc" },
      take: 500
    })
  );

  res.write("}");
  res.end();

  logActivity({
    userId: req.user.id,
    action: "EXPORT_BACKUP",
    entityType: "SYSTEM",
    entityName: "database",
    details: `تم تصدير نسخة احتياطية كاملة (${usersCount} مستخدم، ${regionsCount} منطقة، ${clientsCount} عميل، ${visitsCount} زيارة)`
  }).catch((error) => {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  });
});

module.exports = {
  summary,
  backup
};

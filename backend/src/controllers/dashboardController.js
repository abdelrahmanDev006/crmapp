const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");
const { Roles } = require("../constants/enums");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { getRegionSummary } = require("./regionController");
const { logActivity } = require("../services/logService");

const summary = asyncHandler(async (req, res) => {
  const today = normalizeToWorkDate(new Date());

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
        nextVisitDate: today,
        status: "ACTIVE"
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
  }, { ACTIVE: 0, REJECTED: 0 });

  const totalClients = statusCounts.ACTIVE;
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

  const [users, regions, clients, visits] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, regions: true, isActive: true } }),
    prisma.region.findMany(),
    prisma.client.findMany(),
    prisma.visitHistory.findMany()
  ]);

  logActivity({
    userId: req.user.id,
    action: "EXPORT_BACKUP",
    entityType: "SYSTEM",
    entityName: "database",
    details: `تم تصدير نسخة احتياطية كاملة (${users.length} مستخدم، ${regions.length} منطقة، ${clients.length} عميل، ${visits.length} زيارة)`
  });

  res.setHeader("Content-Disposition", `attachment; filename=crm-backup-${timestamp}.json`);
  res.setHeader("Content-Type", "application/json");

  res.json({
    timestamp,
    users,
    regions,
    clients,
    visits
  });
});

module.exports = {
  summary,
  backup
};

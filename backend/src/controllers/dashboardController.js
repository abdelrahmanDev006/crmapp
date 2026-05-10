const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");
const { Roles } = require("../constants/enums");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { getRegionSummary } = require("./regionController");

const summary = asyncHandler(async (req, res) => {
  const today = normalizeToWorkDate(new Date());

  const globalWhere =
    req.user.role === Roles.ADMIN
      ? {}
        : {
            regionId: { in: req.user.regions?.map((r) => r.id) || [] }
          };

  const [regions, dueClients, statusGroups] = await Promise.all([
    getRegionSummary(),
    prisma.client.count({
      where: {
        ...globalWhere,
        nextVisitDate: { lte: today },
        status: { in: ["ACTIVE", "NO_ANSWER"] }
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
  }, { ACTIVE: 0, NO_ANSWER: 0, REJECTED: 0, PENDING_APPROVAL: 0 });

  const totalClients = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const activeClients = statusCounts.ACTIVE;
  const noAnswerClients = statusCounts.NO_ANSWER;
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
      noAnswerClients,
      rejectedClients
    },
    regions: regionItems
  });
});

const backup = asyncHandler(async (req, res) => {
  if (req.user.role !== Roles.ADMIN) {
    return res.status(403).json({ message: "غير مسموح بالوصول لهذا الإجراء" });
  }

  const [users, regions, clients, visits] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, regions: true, isActive: true } }),
    prisma.region.findMany(),
    prisma.client.findMany(),
    prisma.visitHistory.findMany()
  ]);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
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

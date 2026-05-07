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
          regionId: req.user.regionId
        };

  const [regions, totalClients, dueClients, rejectedClients, noAnswerClients, activeClients] = await Promise.all([
    getRegionSummary(),
    prisma.client.count({ where: globalWhere }),
    prisma.client.count({
      where: {
        ...globalWhere,
        nextVisitDate: { lte: today },
        status: { in: ["ACTIVE", "NO_ANSWER"] }
      }
    }),
    prisma.client.count({
      where: {
        ...globalWhere,
        status: "REJECTED"
      }
    }),
    prisma.client.count({
      where: {
        ...globalWhere,
        status: "NO_ANSWER"
      }
    }),
    prisma.client.count({
      where: {
        ...globalWhere,
        status: "ACTIVE"
      }
    })
  ]);

  const regionItems =
    req.user.role === Roles.ADMIN ? regions : regions.filter((region) => Number(region.id) === Number(req.user.regionId));

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
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, regionId: true, isActive: true } }),
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

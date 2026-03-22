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
        status: { not: "REJECTED" }
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

module.exports = {
  summary
};

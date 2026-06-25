const { Prisma } = require("@prisma/client");
const { Roles, ClientStatuses, VisitTypes } = require("../constants/enums");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");
const {
  normalizeRepresentativeAction,
  sqlTimestamp,
  canUserAccessRegion,
  getWorkDateRange
} = require("./clientUtils");

function buildRepresentativeLatestActionSqlParts(filters, user, options = {}) {
  if (!user.allowedDate) {
    return {
      from: Prisma.sql`FROM "Client" c`,
      where: Prisma.sql`WHERE FALSE`
    };
  }

  const allowedRange = getWorkDateRange(user.allowedDate);
  const conditions = [
    Prisma.sql`c."isDeleted" = false`,
    Prisma.sql`NOT (c."isExceptional" = true AND c."status"::text = ${ClientStatuses.REJECTED})`
  ];
  const userRegionIds = (user.regions || [])
    .map((region) => Number(region.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (userRegionIds.length === 0) {
    conditions.push(Prisma.sql`FALSE`);
  } else {
    conditions.push(Prisma.sql`c."regionId" IN (${Prisma.join(userRegionIds)})`);
  }

  if (options.regionIds?.length) {
    conditions.push(Prisma.sql`c."regionId" IN (${Prisma.join(options.regionIds.map(Number))})`);
  }

  if (filters.regionId) {
    if (!canUserAccessRegion(user, filters.regionId)) {
      throw createHttpError(403, "غير مصرح لك باستعراض هذه المنطقة");
    }
    conditions.push(Prisma.sql`c."regionId" = ${Number(filters.regionId)}`);
  }

  if (filters.visitType) {
    conditions.push(Prisma.sql`c."visitType"::text = ${filters.visitType}`);
  }

  if (filters.status) {
    conditions.push(Prisma.sql`c."status"::text = ${filters.status}`);
  } else {
    conditions.push(Prisma.sql`c."status"::text IN (${Prisma.join([ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER])})`);
  }

  if (filters.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(Prisma.sql`(
      c."name" ILIKE ${searchTerm}
      OR c."phone" ILIKE ${searchTerm}
      OR c."address" ILIKE ${searchTerm}
      OR COALESCE(c."locationUrl", '') ILIKE ${searchTerm}
      OR c."products" ILIKE ${searchTerm}
      OR COALESCE(c."price", '') ILIKE ${searchTerm}
    )`);
  }

  if (filters.createdDate) {
    const selectedCreatedDate = normalizeToWorkDate(filters.createdDate);
    const nextCreatedDate = new Date(selectedCreatedDate);
    nextCreatedDate.setUTCDate(nextCreatedDate.getUTCDate() + 1);

    conditions.push(Prisma.sql`c."createdAt" >= ${sqlTimestamp(selectedCreatedDate)} AND c."createdAt" < ${sqlTimestamp(nextCreatedDate)}`);
  }

  if (filters.rejectedMonth && filters.status === ClientStatuses.REJECTED) {
    const [year, month] = filters.rejectedMonth.split("-");
    if (year && month) {
      const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      const endDate = new Date(Date.UTC(Number(year), Number(month), 1));

      conditions.push(Prisma.sql`(
        EXISTS (
          SELECT 1
          FROM "VisitHistory" rejected_visit
          WHERE rejected_visit."clientId" = c.id
            AND rejected_visit."newStatus"::text = ${ClientStatuses.REJECTED}
            AND rejected_visit."visitDate" >= ${sqlTimestamp(startDate)}
            AND rejected_visit."visitDate" < ${sqlTimestamp(endDate)}
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM "VisitHistory" any_visit
            WHERE any_visit."clientId" = c.id
          )
          AND c."updatedAt" >= ${sqlTimestamp(startDate)}
          AND c."updatedAt" < ${sqlTimestamp(endDate)}
        )
      )`);
    }
  }

  if (filters.dueOnly === true || filters.dueOnly === "true") {
    conditions.push(Prisma.sql`c."nextVisitDate" <= ${sqlTimestamp(normalizeToWorkDate(new Date()))}`);
  } else if (filters.overdueOnly === true || filters.overdueOnly === "true") {
    conditions.push(Prisma.sql`c."nextVisitDate" < ${sqlTimestamp(normalizeToWorkDate(new Date()))}`);
  }

  if (filters.exceptionalOnly === true || filters.exceptionalOnly === "true") {
    conditions.push(Prisma.sql`c."isExceptional" = true`);
  }

  const latestVisitJoin = Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT latest_visit_inner.id, latest_visit_inner."newStatus"
      FROM "VisitHistory" latest_visit_inner
      WHERE latest_visit_inner."clientId" = c.id
        AND latest_visit_inner."visitDate" >= ${sqlTimestamp(allowedRange.start)}
        AND latest_visit_inner."visitDate" < ${sqlTimestamp(allowedRange.end)}
      ORDER BY latest_visit_inner."visitDate" DESC, latest_visit_inner.id DESC
      LIMIT 1
    ) latest_visit ON true
  `;
  const action =
    options.actionOverride !== undefined
      ? normalizeRepresentativeAction(options.actionOverride)
      : normalizeRepresentativeAction(filters.repAction);
  const isOneTimeFilter = filters.visitType === VisitTypes.ONE_TIME;

  if (action === "PENDING") {
    if (!isOneTimeFilter) {
      conditions.push(Prisma.sql`c."nextVisitDate" >= ${sqlTimestamp(allowedRange.start)} AND c."nextVisitDate" < ${sqlTimestamp(allowedRange.end)}`);
    }
    conditions.push(Prisma.sql`latest_visit.id IS NULL`);
  } else if (action) {
    conditions.push(Prisma.sql`latest_visit."newStatus"::text = ${action}`);
  } else if (!isOneTimeFilter) {
    conditions.push(Prisma.sql`(
      (c."nextVisitDate" >= ${sqlTimestamp(allowedRange.start)} AND c."nextVisitDate" < ${sqlTimestamp(allowedRange.end)})
      OR latest_visit.id IS NOT NULL
    )`);
  }

  return {
    from: Prisma.sql`FROM "Client" c ${latestVisitJoin}`,
    where: Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
  };
}

function buildClientWhere(filters, user) {
  const where = { 
    isDeleted: false,
    NOT: [
      { isExceptional: true, status: ClientStatuses.REJECTED }
    ]
  }; // استبعاد العملاء المحذوفين والشكاوى المنتهية

  const isOneTimeFilter = filters.visitType === VisitTypes.ONE_TIME;

  if (user.role === Roles.REPRESENTATIVE) {
    const userRegionIds = user.regions?.map(r => r.id) || [];
    where.regionId = { in: userRegionIds };

    if (!filters.status) {
      where.status = { in: [ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER] };
    }

    if (!isOneTimeFilter) {
      if (user.allowedDate) {
        const repAction = normalizeRepresentativeAction(filters.repAction);
        const selectedDate = normalizeToWorkDate(user.allowedDate);
        const nextDay = new Date(selectedDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const representativeVisitFilter = {
          visitDate: {
            gte: selectedDate,
            lt: nextDay
          }
        };

        if (repAction === "PENDING") {
          where.nextVisitDate = {
            gte: selectedDate,
            lt: nextDay
          };
          where.visits = {
            none: representativeVisitFilter
          };
        } else if (repAction) {
          where.visits = {
            some: {
              ...representativeVisitFilter,
              newStatus: repAction
            }
          };
        } else {
          where.OR = [
            {
              nextVisitDate: {
                gte: selectedDate,
                lt: nextDay
              }
            },
            {
              visits: {
                some: representativeVisitFilter
              }
            }
          ];
        }
      } else {
        where.id = -1; // Hide all clients if no allowedDate is set
      }
    }
  }

  if (filters.regionId) {
    if (user.role === Roles.REPRESENTATIVE && !canUserAccessRegion(user, filters.regionId)) {
      throw createHttpError(403, "غير مصرح لك باستعراض هذه المنطقة");
    }

    where.regionId = Number(filters.regionId);
  }

  if (filters.visitType) {
    where.visitType = filters.visitType;
  }

  if (filters.status) {
    where.status = filters.status;
  } else if (!where.status) {
     where.status = { in: [ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER] };
  }

  if (filters.rejectedMonth && where.status === ClientStatuses.REJECTED) {
    const [year, month] = filters.rejectedMonth.split("-");
    if (year && month) {
      const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      const endDate = new Date(Date.UTC(Number(year), Number(month), 1));
      
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          {
            visits: {
              some: {
                newStatus: ClientStatuses.REJECTED,
                visitDate: {
                  gte: startDate,
                  lt: endDate
                }
              }
            }
          },
          {
            visits: { none: {} },
            updatedAt: {
              gte: startDate,
              lt: endDate
            }
          }
        ]
      });
    }
  }

  if (filters.search) {
    if (!where.AND) where.AND = [];
    where.AND.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { phone: { contains: filters.search, mode: "insensitive" } },
        { address: { contains: filters.search, mode: "insensitive" } },
        { locationUrl: { contains: filters.search, mode: "insensitive" } },
        { products: { contains: filters.search, mode: "insensitive" } },
        { price: { contains: filters.search, mode: "insensitive" } }
      ]
    });
  }

  if (filters.createdDate) {
    const selectedCreatedDate = normalizeToWorkDate(filters.createdDate);
    const nextCreatedDate = new Date(selectedCreatedDate);
    nextCreatedDate.setUTCDate(nextCreatedDate.getUTCDate() + 1);

    where.createdAt = {
      gte: selectedCreatedDate,
      lt: nextCreatedDate
    };
  }

  if (!isOneTimeFilter) {
    if (filters.dueDate && user.role !== Roles.REPRESENTATIVE) {
      const selectedDate = normalizeToWorkDate(filters.dueDate);
      const nextDay = new Date(selectedDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      where.nextVisitDate = {
        gte: selectedDate,
        lt: nextDay
      };
    } else if (filters.dueOnly === true || filters.dueOnly === "true") {
      where.nextVisitDate = {
        lte: normalizeToWorkDate(new Date())
      };
    } else if (filters.overdueOnly === true || filters.overdueOnly === "true") {
      where.nextVisitDate = {
        lt: normalizeToWorkDate(new Date())
      };
    }
  }

  if (filters.exceptionalOnly === true || filters.exceptionalOnly === "true") {
    where.isExceptional = true;
    
    // Map the date filter to exceptionalNextVisitDate if it exists
    if (where.nextVisitDate) {
      where.exceptionalNextVisitDate = where.nextVisitDate;
      delete where.nextVisitDate;
    }
  }

  return where;
}

module.exports = {
  buildRepresentativeLatestActionSqlParts,
  buildClientWhere
};

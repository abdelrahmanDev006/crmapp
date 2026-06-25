const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { Roles, ClientStatuses, VisitTypes } = require("../constants/enums");
const {
  normalizeToWorkDate,
  calculateNextVisitDate,
  addWorkDaysWith28DayMonth,
  getCurrentWorkWeekStart
} = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");
const { normalizeCustomVisitIntervalDays, resolveNextVisitDate, getVisitTypeLabel } = require("./visitScheduler");

function buildClientWithRelations(user) {
  const relations = {
    region: {
      select: {
        id: true,
        code: true,
        name: true
      }
    }
  };

  if (user?.role === Roles.REPRESENTATIVE) {
    const visitWhere = {};

    if (user.allowedDate) {
      const allowedRange = getWorkDateRange(user.allowedDate);
      visitWhere.visitDate = {
        gte: allowedRange.start,
        lt: allowedRange.end
      };
    }

    relations.visits = {
      where: visitWhere,
      select: {
        note: true,
        visitDate: true,
        newStatus: true,
        paymentMethod: true,
        collectedAmount: true,
        deliveredProducts: true,
        visitedById: true
      },
      orderBy: [{ visitDate: "desc" }, { id: "desc" }],
      take: 1
    };
  } else {
    // الأدمن يرى ملاحظات زيارات الأدمن فقط — بدون أي بيانات تحصيل من المندوب
    relations.visits = {
      select: {
        note: true
      },
      where: {
        visitedBy: {
          role: Roles.ADMIN
        }
      },
      orderBy: [{ visitDate: "desc" }, { id: "desc" }],
      take: 1
    };
  }

  return relations;
}

function normalizeRepresentativeAction(value) {
  const action = String(value || "").trim().toUpperCase();
  const allowedActions = new Set([
    "PENDING",
    ClientStatuses.ACTIVE,
    ClientStatuses.NO_ANSWER,
    ClientStatuses.REJECTED
  ]);

  return allowedActions.has(action) ? action : null;
}

function toSqlTimestamp(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid SQL timestamp value");
  }

  return date.toISOString().replace("T", " ").replace("Z", "");
}

function sqlTimestamp(dateValue) {
  return Prisma.sql`${toSqlTimestamp(dateValue)}::timestamp`;
}

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

async function countRepresentativeClients(filters, user, actionOverride) {
  const parts = buildRepresentativeLatestActionSqlParts(filters, user, { actionOverride });
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::int AS count
    ${parts.from}
    ${parts.where}
  `);

  return Number(rows[0]?.count || 0);
}

async function getRepresentativeRegionGroups(filters, user) {
  const parts = buildRepresentativeLatestActionSqlParts(filters, user);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT c."regionId", COUNT(*)::int AS count
    ${parts.from}
    ${parts.where}
    GROUP BY c."regionId"
  `);

  return rows.map((row) => ({
    regionId: Number(row.regionId),
    _count: { _all: Number(row.count || 0) }
  }));
}

async function getRepresentativeClientIds(filters, user, options = {}) {
  const parts = buildRepresentativeLatestActionSqlParts(filters, user, {
    regionIds: options.regionIds
  });

  if (options.perRegionLimit) {
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT ranked.id
      FROM (
        SELECT
          c.id,
          c."regionId",
          ROW_NUMBER() OVER (
            PARTITION BY c."regionId"
            ORDER BY c."address" ASC, c."nextVisitDate" ASC, c.id ASC
          ) AS row_number
        ${parts.from}
        ${parts.where}
      ) ranked
      WHERE ranked.row_number <= ${Number(options.perRegionLimit)}
      ORDER BY ranked."regionId" ASC, ranked.row_number ASC
    `);

    return rows.map((row) => Number(row.id));
  }

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT c.id
    ${parts.from}
    ${parts.where}
    ORDER BY c."address" ASC, c."nextVisitDate" ASC, c.id ASC
    OFFSET ${Number(options.offset || 0)}
    LIMIT ${Number(options.limit || 20)}
  `);

  return rows.map((row) => Number(row.id));
}

async function findClientsByOrderedIds(ids, user) {
  if (ids.length === 0) {
    return [];
  }

  const order = new Map(ids.map((id, index) => [Number(id), index]));
  const items = await prisma.client.findMany({
    where: { id: { in: ids } },
    include: buildClientWithRelations(user)
  });

  return items.sort((first, second) => order.get(first.id) - order.get(second.id));
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

async function getRepresentativeActionCounts(filters, user) {
  const baseFilters = { ...filters };
  delete baseFilters.repAction;

  const [all, pending, handled, noAnswer, rejected] = await Promise.all([
    countRepresentativeClients(baseFilters, user, null),
    countRepresentativeClients(baseFilters, user, "PENDING"),
    countRepresentativeClients(baseFilters, user, ClientStatuses.ACTIVE),
    countRepresentativeClients(baseFilters, user, ClientStatuses.NO_ANSWER),
    countRepresentativeClients(baseFilters, user, ClientStatuses.REJECTED)
  ]);

  return {
    ALL: all,
    PENDING: pending,
    ACTIVE: handled,
    NO_ANSWER: noAnswer,
    REJECTED: rejected
  };
}

function enforceClientScope(user, client) {
  if (!client) {
    throw createHttpError(404, "العميل غير موجود");
  }

  if (user.role === Roles.REPRESENTATIVE && (!user.regions || !user.regions.some(r => Number(r.id) === Number(client.regionId)))) {
    throw createHttpError(403, "لا يمكنك الوصول لهذا العميل");
  }
}

function canUserAccessRegion(user, regionId) {
  if (user.role === Roles.ADMIN) {
    return true;
  }

  return user.regions?.some((region) => Number(region.id) === Number(regionId)) || false;
}

function getWorkDateRange(dateValue) {
  const start = normalizeToWorkDate(dateValue);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function isWithinDateRange(value, range) {
  const normalized = normalizeToWorkDate(value);
  return normalized >= range.start && normalized < range.end;
}

function enforceRepresentativeClientAction(user, client) {
  if (user.role !== Roles.REPRESENTATIVE) {
    return;
  }

  if (!user.allowedDate) {
    throw createHttpError(403, "لم يتم تحديد يوم عمل لهذا المندوب");
  }

  const allowedRange = getWorkDateRange(user.allowedDate);

  if (!isWithinDateRange(client.nextVisitDate, allowedRange)) {
    throw createHttpError(403, "لا يمكنك تسجيل زيارة لهذا العميل خارج يوم العمل المحدد");
  }
}

async function listClients(filters, user) {
  const MAX_PAGE_SIZE = 50; // حد أقصى صغير جداً لمنع أي بطء أو Timeouts في حالة إن المتصفح لسه شغال بالنسخة القديمة
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(Math.max(1, Number(filters.pageSize) || 20), MAX_PAGE_SIZE);

  if (user.role === Roles.REPRESENTATIVE) {
    const [ids, total] = await Promise.all([
      getRepresentativeClientIds(filters, user, {
        offset: (page - 1) * pageSize,
        limit: pageSize
      }),
      countRepresentativeClients(filters, user)
    ]);
    const items = await findClientsByOrderedIds(ids, user);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  const where = buildClientWhere(filters, user);

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: buildClientWithRelations(user),
      orderBy: filters.visitType === VisitTypes.ONE_TIME 
        ? [{ updatedAt: "desc" }] 
        : [{ address: "asc" }, { nextVisitDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.client.count({ where })
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

async function listClientsByRegionPage(filters, user) {
  const regionPage = Math.max(1, Number(filters.regionPage) || 1);
  const regionPageSize = Math.min(Math.max(1, Number(filters.regionPageSize) || 3), 10);
  // حد أقصى صارم لعدد العملاء لكل منطقة — يمنع إرجاع آلاف السجلات دفعة واحدة
  const MAX_CLIENTS_PER_REGION = 200;
  const where = buildClientWhere(filters, user);

  // Step 1: الحصول على المناطق اللي فيها عملاء مطابقين للفلتر (query خفيف جداً)
  const regionGroups =
    user.role === Roles.REPRESENTATIVE
      ? await getRepresentativeRegionGroups(filters, user)
      : await prisma.client.groupBy({
          by: ["regionId"],
          where,
          _count: { _all: true }
        });
  const representativeActionCounts =
    user.role === Roles.REPRESENTATIVE
      ? await getRepresentativeActionCounts(filters, user)
      : null;

  if (regionGroups.length === 0) {
    return {
      items: [],
      totalClients: 0,
      totalRegions: 0,
      totalRegionPages: 1,
      regionPage: 1,
      regionPageSize,
      representativeActionCounts
    };
  }

  // Step 2: ترتيب المناطق بالكود
  const matchingRegionIds = regionGroups.map((g) => g.regionId);
  const regionDetails = await prisma.region.findMany({
    where: { id: { in: matchingRegionIds } },
    select: { id: true, code: true },
    orderBy: { code: "asc" }
  });

  const sortedRegionIds = regionDetails.map((r) => r.id);

  // Step 3: تقسيم المناطق لصفحات
  const totalRegions = sortedRegionIds.length;
  const totalRegionPages = Math.ceil(totalRegions / regionPageSize) || 1;
  const safePage = Math.min(regionPage, totalRegionPages);
  const pageRegionIds = sortedRegionIds.slice(
    (safePage - 1) * regionPageSize,
    safePage * regionPageSize
  );

  // Step 4: جلب عملاء كل منطقة بشكل متوازٍ مع حد أقصى 200 عميل لكل منطقة
  // السبب: جلب 5 مناطق × 1167 عميل = 5835 سجل في طلب واحد كان يستغرق 300ms+
  // الآن: جلب متوازٍ مع حد 200 لكل منطقة = أقل من 70ms دائماً
  const items =
    user.role === Roles.REPRESENTATIVE
      ? await findClientsByOrderedIds(
          await getRepresentativeClientIds(filters, user, {
            regionIds: pageRegionIds,
            perRegionLimit: MAX_CLIENTS_PER_REGION
          }),
          user
        )
      : (
          await Promise.all(
            pageRegionIds.map((rid) =>
              prisma.client.findMany({
                where: { ...where, regionId: rid },
                include: buildClientWithRelations(user),
                orderBy: filters.visitType === VisitTypes.ONE_TIME
                  ? [{ updatedAt: "desc" }]
                  : [{ address: "asc" }, { nextVisitDate: "asc" }, { id: "asc" }],
                take: MAX_CLIENTS_PER_REGION
              })
            )
          )
        ).flat();
  const totalClients = regionGroups.reduce((sum, g) => sum + g._count._all, 0);

  return {
    items,
    totalClients,
    totalRegions,
    totalRegionPages,
    regionPage: safePage,
    regionPageSize,
    representativeActionCounts
  };
}

async function getClientById(id, user, includeVisits = false) {
  const client = await prisma.client.findUnique({
    where: { id: Number(id) },
    include: {
      ...buildClientWithRelations(user),
      ...(includeVisits
        ? {
            visits: {
              ...(user.role === Roles.ADMIN
                ? {
                    where: {
                      visitedBy: {
                        role: Roles.ADMIN
                      }
                    }
                  }
                : {}),
              include: {
                visitedBy: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              orderBy: {
                visitDate: "desc"
              },
              take: 50
            }
          }
        : {})
    }
  });

  enforceClientScope(user, client);
  return client;
}

async function handleClientVisit({
  clientId,
  user,
  outcome,
  note,
  paymentMethod,
  visitType,
  customVisitIntervalDays,
  advanceDays,
  referenceDate,
  collectedAmount,
  deliveredProducts
}) {
  const existingClient = await getClientById(clientId, user, false);

  const previousStatus = existingClient.status;
  const previousNextVisitDate = existingClient.nextVisitDate;
  const previousNoAnswerCount = Number(existingClient.noAnswerCount || 0);
  const previousCustomVisitIntervalDays = normalizeCustomVisitIntervalDays(existingClient.customVisitIntervalDays);
  const nextVisitType = visitType || existingClient.visitType;
  const visitTypeChanged = existingClient.visitType !== nextVisitType;
  const requestedCustomVisitIntervalDays = normalizeCustomVisitIntervalDays(customVisitIntervalDays);
  const nextCustomVisitIntervalDays =
    nextVisitType === VisitTypes.CUSTOM
      ? requestedCustomVisitIntervalDays ||
        (existingClient.visitType === VisitTypes.CUSTOM ? previousCustomVisitIntervalDays : null)
      : null;

  if (nextVisitType === VisitTypes.CUSTOM && !nextCustomVisitIntervalDays) {
    throw createHttpError(400, "حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
  }

  const customIntervalChanged =
    nextVisitType === VisitTypes.CUSTOM &&
    Number(previousCustomVisitIntervalDays || 0) !== Number(nextCustomVisitIntervalDays || 0);
  const newStatus = outcome;
  const newNoAnswerCount =
    newStatus === ClientStatuses.NO_ANSWER
      ? previousNoAnswerCount + 1
      : 0;

  const newNextVisitDate = resolveNextVisitDate({
    currentDate: existingClient.nextVisitDate,
    visitType: nextVisitType,
    customVisitIntervalDays: nextCustomVisitIntervalDays,
    outcome,
    advanceDays,
    referenceDate
  });

  const statusRecoveryNote =
    previousStatus === ClientStatuses.REJECTED && newStatus === ClientStatuses.ACTIVE
      ? "تمت إعادة تفعيل العميل بعد الكنسلة"
      : null;

  const visitTypeChangeNote = visitTypeChanged
    ? `تم تغيير نوع الزيارة من ${getVisitTypeLabel(existingClient.visitType, previousCustomVisitIntervalDays)} إلى ${getVisitTypeLabel(nextVisitType, nextCustomVisitIntervalDays)}`
    : null;

  const customIntervalChangeNote = customIntervalChanged
    ? `تم تحديث ميعاد الزيارة المخصص إلى كل ${nextCustomVisitIntervalDays} يوم`
    : null;

  const generatedNote =
    [note, statusRecoveryNote, visitTypeChangeNote, customIntervalChangeNote].filter(Boolean).join(" | ") || null;

  const isExceptional = existingClient.isExceptional;

  // Representatives record the visit history only — never modify client data
  if (user.role === Roles.REPRESENTATIVE) {
    return prisma.$transaction(async (tx) => {
      const allowedRange = getWorkDateRange(user.allowedDate);
      const existingVisit = await tx.visitHistory.findFirst({
        where: {
          clientId: existingClient.id,
          visitDate: {
            gte: allowedRange.start,
            lt: allowedRange.end
          }
        },
        select: { id: true }
      });

      if (existingVisit) {
        throw createHttpError(409, "تم تسجيل زيارة لهذا العميل في يوم العمل المحدد بالفعل");
      }

      enforceRepresentativeClientAction(user, existingClient);

      await tx.visitHistory.create({
        data: {
          client: { connect: { id: existingClient.id } },
          visitedBy: { connect: { id: user.id } },
          previousStatus: previousStatus || ClientStatuses.ACTIVE,
          newStatus: newStatus || ClientStatuses.ACTIVE,
          note: generatedNote,
          paymentMethod: paymentMethod || null,
          collectedAmount: typeof collectedAmount === 'number' ? collectedAmount : null,
          deliveredProducts: typeof deliveredProducts === 'string' ? deliveredProducts : null,
          previousNextVisitDate,
          newNextVisitDate: previousNextVisitDate,
          visitDate: new Date()
        }
      });

      return tx.client.findUnique({
        where: { id: existingClient.id },
        include: buildClientWithRelations(user)
      });
    });
  }

  // Admin actions apply fully
  return prisma.$transaction(async (tx) => {
    const finalStatus = isExceptional ? ClientStatuses.REJECTED : newStatus;
    const finalNextVisitDate = isExceptional ? new Date() : newNextVisitDate;

    const updatedClient = await tx.client.update({
      where: { id: existingClient.id },
      data: {
        status: finalStatus,
        noAnswerCount: newNoAnswerCount,
        nextVisitDate: finalNextVisitDate,
        visitType: nextVisitType,
        customVisitIntervalDays: nextCustomVisitIntervalDays,
        pendingOutcome: null,
        pendingNote: null,
        pendingVisitType: null,
        pendingCustomVisitIntervalDays: null
      },
      include: buildClientWithRelations(user)
    });

    await tx.visitHistory.create({
      data: {
        client: { connect: { id: existingClient.id } },
        visitedBy: { connect: { id: user.id } },
        previousStatus: previousStatus || ClientStatuses.ACTIVE,
        newStatus: newStatus || ClientStatuses.ACTIVE,
        note: generatedNote,
        paymentMethod: paymentMethod || null,
        collectedAmount: typeof collectedAmount === 'number' ? collectedAmount : null,
        deliveredProducts: typeof deliveredProducts === 'string' ? deliveredProducts : null,
        previousNextVisitDate,
        newNextVisitDate: finalNextVisitDate,
        visitDate: new Date()
      }
    });

    return updatedClient;
  });
}


async function handleRegionClients({ regionId, user, note }) {
  if (user.role !== Roles.ADMIN && user.role !== Roles.REPRESENTATIVE) {
    throw createHttpError(403, "ليس لديك صلاحية لتنفيذ هذا الإجراء");
  }

  if (!canUserAccessRegion(user, regionId)) {
    throw createHttpError(403, "\u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u0625\u062f\u0627\u0631\u0629 \u0647\u0630\u0647 \u0627\u0644\u0645\u0646\u0637\u0642\u0629");
  }

  if (user.role === Roles.REPRESENTATIVE && !user.allowedDate) {
    throw createHttpError(403, "لم يتم تحديد يوم عمل لهذا المندوب");
  }

  const region = await prisma.region.findFirst({
    where: {
      id: Number(regionId),
      isDeleted: false
    }
  });

  if (!region) {
    throw createHttpError(404, "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629");
  }

  const skippedRejectedCount = await prisma.client.count({
    where: {
      regionId: Number(regionId),
      isDeleted: false,
      OR: [
        { status: ClientStatuses.REJECTED },
        { visitType: VisitTypes.ONE_TIME }
      ]
    }
  });

  const allowedRange = user.role === Roles.REPRESENTATIVE ? getWorkDateRange(user.allowedDate) : null;
  const baseWhere = {
    regionId: Number(regionId),
    isDeleted: false,
    status: { not: ClientStatuses.REJECTED },
    visitType: { not: VisitTypes.ONE_TIME },
    ...(allowedRange
      ? {
          nextVisitDate: {
            gte: allowedRange.start,
            lt: allowedRange.end
          },
          visits: {
            none: {
              visitDate: {
                gte: allowedRange.start,
                lt: allowedRange.end
              }
            }
          }
        }
      : {})
  };

  const totalEligible = await prisma.client.count({ where: baseWhere });

  if (totalEligible === 0) {
    return {
      region,
      updatedCount: 0,
      skippedRejectedCount
    };
  }

  const currentWeekStart = getCurrentWorkWeekStart(new Date());
  const regionHandledNote =
    note || "\u062a\u0645 \u0627\u0644\u062a\u0639\u0627\u0645\u0644 \u0645\u0639 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644";
  const batchSize = 500;
  let lastId = 0;
  let updatedCount = 0;

  while (true) {
    const clients = await prisma.client.findMany({
      where: {
        ...baseWhere,
        id: { gt: lastId }
      },
      select: {
        id: true,
        status: true,
        visitType: true,
        customVisitIntervalDays: true,
        nextVisitDate: true
      },
      orderBy: { id: "asc" },
      take: batchSize
    });

    if (clients.length === 0) {
      break;
    }

    lastId = clients[clients.length - 1].id;
    updatedCount += clients.length;

    const updateBuckets = new Map();
    const visitHistoryPayload = clients.map((client) => {
      const nextVisitDate =
        client.visitType === VisitTypes.CUSTOM
          ? addWorkDaysWith28DayMonth(currentWeekStart, normalizeCustomVisitIntervalDays(client.customVisitIntervalDays) || 7)
          : calculateNextVisitDate(currentWeekStart, client.visitType);

      if (user.role === Roles.ADMIN) {
        const bucketKey = `${client.visitType}:${nextVisitDate.toISOString()}`;
        if (!updateBuckets.has(bucketKey)) {
          updateBuckets.set(bucketKey, {
            nextVisitDate,
            ids: []
          });
        }
        updateBuckets.get(bucketKey).ids.push(client.id);
      }

      return {
        clientId: client.id,
        visitedById: user.id,
        previousStatus: client.status,
        newStatus: ClientStatuses.ACTIVE,
        note: regionHandledNote,
        previousNextVisitDate: client.nextVisitDate,
        newNextVisitDate: user.role === Roles.ADMIN ? nextVisitDate : client.nextVisitDate,
        visitDate: new Date()
      };
    });

    await prisma.$transaction(async (tx) => {
      const clientUpdateOperations =
        user.role === Roles.ADMIN
          ? Array.from(updateBuckets.values()).map((bucket) =>
              tx.client.updateMany({
                where: { id: { in: bucket.ids } },
                data: {
                  status: ClientStatuses.ACTIVE,
                  noAnswerCount: 0,
                  nextVisitDate: bucket.nextVisitDate
                }
              })
            )
          : [];

      await Promise.all([
        ...clientUpdateOperations,
        tx.visitHistory.createMany({ data: visitHistoryPayload })
      ]);
    });
  }

  return {
    region,
    updatedCount,
    skippedRejectedCount
  };
}

async function bulkEditClients(user, data) {
  const { clientIds, regionId, nextVisitDate } = data;
  
  if (!clientIds || clientIds.length === 0) {
    throw createHttpError(400, "يجب تحديد عميل واحد على الأقل");
  }

  const updateData = {};
  if (regionId !== undefined && regionId !== null) {
    updateData.regionId = regionId;
  }
  
  if (nextVisitDate !== undefined && nextVisitDate !== null) {
    const parsedDate = new Date(nextVisitDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      updateData.nextVisitDate = normalizeToWorkDate(parsedDate);
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw createHttpError(400, "يجب تحديد منطقة أو تاريخ للزيارة");
  }

  if (user.role !== "ADMIN") {
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { regionId: true }
    });
    
    const allowedRegionIds = user.regions.map(r => r.id);
    const hasUnauthorizedRegion = clients.some(c => !allowedRegionIds.includes(c.regionId));
    
    if (hasUnauthorizedRegion || (regionId && !allowedRegionIds.includes(regionId))) {
      throw createHttpError(403, "غير مصرح لك بتعديل هؤلاء العملاء أو نقلهم لهذه المنطقة");
    }
  }

  const result = await prisma.client.updateMany({
    where: { id: { in: clientIds } },
    data: updateData
  });

  return { updatedCount: result.count };
}

module.exports = {
  listClients,
  listClientsByRegionPage,
  getClientById,
  handleClientVisit,
  handleRegionClients,
  enforceClientScope,
  toggleExceptionalStatus,
  bulkEditClients
};

async function toggleExceptionalStatus(clientId, user, isExceptional, exceptionalReason, customDate, products, price) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId }
  });

  enforceClientScope(user, existing);

  // إذا كان إزالة للشكوى، نقوم بتحديث العميل الحالي (رغم أننا الآن نتعامل بنسخ منفصلة، نحتفظ بهذا للنسخ القديمة أو التراجع)
  if (!isExceptional) {
    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        isExceptional: false,
        exceptionalReason: null,
        exceptionalNextVisitDate: null
      },
      include: buildClientWithRelations(user)
    });
    return updatedClient;
  }

  // إذا كان إضافة شكوى، نقوم باستنساخ العميل
  let nextExceptionalDate = null;
  if (customDate) {
    nextExceptionalDate = normalizeToWorkDate(new Date(customDate));
  } else {
    const baseDate = new Date();
    baseDate.setUTCDate(baseDate.getUTCDate() + 7);
    nextExceptionalDate = normalizeToWorkDate(baseDate);
  }

  const clonedClient = await prisma.client.create({
    data: {
      name: existing.name,
      phone: existing.phone,
      address: existing.address,
      regionId: existing.regionId,
      visitType: existing.visitType,
      customVisitIntervalDays: existing.customVisitIntervalDays,
      status: ClientStatuses.ACTIVE,
      nextVisitDate: nextExceptionalDate,
      createdById: user.id,
      locationUrl: existing.locationUrl,
      products: products !== undefined ? products : existing.products,
      price: price !== undefined ? price : existing.price,
      isExceptional: true,
      exceptionalReason: exceptionalReason || null,
      exceptionalNextVisitDate: nextExceptionalDate
    },
    include: buildClientWithRelations(user)
  });

  return clonedClient;
}

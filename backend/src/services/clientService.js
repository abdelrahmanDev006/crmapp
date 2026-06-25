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
const {
  normalizeRepresentativeAction,
  toSqlTimestamp,
  sqlTimestamp,
  canUserAccessRegion,
  getWorkDateRange,
  isWithinDateRange,
  enforceClientScope,
  enforceRepresentativeClientAction
} = require("./clientUtils");
const { buildRepresentativeLatestActionSqlParts, buildClientWhere } = require("./clientQueryBuilder");

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

const prisma = require("../config/prisma");
const { Roles, ClientStatuses, VisitTypes } = require("../constants/enums");
const {
  normalizeToWorkDate,
  toStartOfUtcDay,
  calculateNextVisitDate,
  addWorkDaysWith28DayMonth,
  getCurrentWorkWeekStart
} = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");

const clientWithRelations = {
  region: {
    select: {
      id: true,
      code: true,
      name: true
    }
  },
  visits: {
    select: {
      note: true,
      visitDate: true,
      newStatus: true,
      paymentMethod: true
    },
    orderBy: {
      visitDate: "desc"
    },
    take: 1
  }
};

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
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

    if (!isOneTimeFilter) {
      if (user.allowedDate) {
        const selectedDate = normalizeToWorkDate(user.allowedDate);
        const nextDay = new Date(selectedDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);

        where.OR = [
          {
            nextVisitDate: {
              gte: selectedDate,
              lt: nextDay
            }
          },
          {
            visits: {
              some: {
                visitDate: {
                  gte: selectedDate,
                  lt: nextDay
                },
                visitedById: user.id
              }
            }
          }
        ];
      } else {
        where.id = -1; // Hide all clients if no allowedDate is set
      }
    }
  }

  if (filters.regionId) {
    where.regionId = Number(filters.regionId);
  }

  if (filters.visitType) {
    where.visitType = filters.visitType;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
      { address: { contains: filters.search, mode: "insensitive" } },
      { locationUrl: { contains: filters.search, mode: "insensitive" } },
      { products: { contains: filters.search, mode: "insensitive" } },
      { price: { contains: filters.search, mode: "insensitive" } }
    ];
  }

  if (filters.createdDate) {
    const selectedCreatedDate = toStartOfUtcDay(filters.createdDate);
    const nextCreatedDate = new Date(selectedCreatedDate);
    nextCreatedDate.setUTCDate(nextCreatedDate.getUTCDate() + 1);

    where.createdAt = {
      gte: selectedCreatedDate,
      lt: nextCreatedDate
    };

    if (!filters.status) {
      where.status = {
        not: ClientStatuses.REJECTED
      };
    }
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

      if (!filters.status) {
        where.status = {
          not: ClientStatuses.REJECTED
        };
      }
    } else if (filters.dueOnly === true || filters.dueOnly === "true") {
      where.nextVisitDate = {
        lte: normalizeToWorkDate(new Date())
      };
      if (!filters.status) {
        where.status = {
          in: [ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER]
        };
      }
    } else if (filters.overdueOnly === true || filters.overdueOnly === "true") {
      where.nextVisitDate = {
        lt: normalizeToWorkDate(new Date())
      };
      if (!filters.status) {
        where.status = {
          in: [ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER]
        };
      }
    }
  }

  if (filters.exceptionalOnly === true || filters.exceptionalOnly === "true") {
    where.isExceptional = true;
    
    // Map the date filter to exceptionalNextVisitDate if it exists
    if (where.nextVisitDate) {
      where.exceptionalNextVisitDate = where.nextVisitDate;
      delete where.nextVisitDate;
    }
    
    if (!filters.status) {
      where.status = {
        not: ClientStatuses.REJECTED
      };
    }
  }

  return where;
}

function enforceClientScope(user, client) {
  if (!client) {
    throw createHttpError(404, "العميل غير موجود");
  }

  if (user.role === Roles.REPRESENTATIVE && (!user.regions || !user.regions.some(r => Number(r.id) === Number(client.regionId)))) {
    throw createHttpError(403, "لا يمكنك الوصول لهذا العميل");
  }
}

async function listClients(filters, user) {
  const MAX_PAGE_SIZE = 50; // حد أقصى صغير جداً لمنع أي بطء أو Timeouts في حالة إن المتصفح لسه شغال بالنسخة القديمة
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(Math.max(1, Number(filters.pageSize) || 20), MAX_PAGE_SIZE);
  const where = buildClientWhere(filters, user);

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: clientWithRelations,
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
  const regionGroups = await prisma.client.groupBy({
    by: ["regionId"],
    where,
    _count: { _all: true }
  });

  if (regionGroups.length === 0) {
    return {
      items: [],
      totalClients: 0,
      totalRegions: 0,
      totalRegionPages: 1,
      regionPage: 1,
      regionPageSize
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
  const regionItemsArrays = await Promise.all(
    pageRegionIds.map((rid) =>
      prisma.client.findMany({
        where: { ...where, regionId: rid },
        include: clientWithRelations,
        orderBy: filters.visitType === VisitTypes.ONE_TIME 
          ? [{ updatedAt: "desc" }] 
          : [{ address: "asc" }, { nextVisitDate: "asc" }, { id: "asc" }],
        take: MAX_CLIENTS_PER_REGION
      })
    )
  );

  const items = regionItemsArrays.flat();
  const totalClients = regionGroups.reduce((sum, g) => sum + g._count._all, 0);

  return {
    items,
    totalClients,
    totalRegions,
    totalRegionPages,
    regionPage: safePage,
    regionPageSize
  };
}

async function getClientById(id, user, includeVisits = false) {
  const client = await prisma.client.findUnique({
    where: { id: Number(id) },
    include: {
      ...clientWithRelations,
      ...(includeVisits
        ? {
            visits: {
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
              }
            }
          }
        : {})
    }
  });

  enforceClientScope(user, client);
  return client;
}

function normalizeCustomVisitIntervalDays(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return null;
  }

  return parsed;
}

function resolveNextVisitDate({
  currentDate,
  visitType,
  customVisitIntervalDays,
  outcome,
  advanceDays,
  referenceDate
}) {
  // ONE_TIME: no next visit after ANY handling (ACTIVE, REJECTED, NO_ANSWER)
  // Since nextVisitDate is now required in the DB, we set it to a far future date 
  // so it never appears in due or overdue lists.
  if (visitType === VisitTypes.ONE_TIME) {
    return new Date("2099-12-31T23:59:59.999Z");
  }

  if (outcome === ClientStatuses.REJECTED) {
    // Keep canceled clients available for manual reactivation/offers at any time.
    return referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(new Date());
  }

  if (outcome === ClientStatuses.NO_ANSWER) {
    const noAnswerBaseDate = currentDate
      ? normalizeToWorkDate(currentDate)
      : referenceDate
        ? normalizeToWorkDate(referenceDate)
        : normalizeToWorkDate(new Date());
    const noAnswerRetryDate = addWorkDaysWith28DayMonth(noAnswerBaseDate, 7);
    return normalizeToWorkDate(noAnswerRetryDate);
  }

  if (Number.isFinite(Number(advanceDays)) && Number(advanceDays) > 0) {
    const baseDate = referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(new Date());
    const advancedDate = addWorkDaysWith28DayMonth(baseDate, Number(advanceDays));
    return normalizeToWorkDate(advancedDate);
  }

  const nextVisitBaseDate = currentDate ? normalizeToWorkDate(currentDate) : normalizeToWorkDate(new Date());

  if (visitType === VisitTypes.CUSTOM) {
    const customIntervalDays = normalizeCustomVisitIntervalDays(customVisitIntervalDays);

    if (!customIntervalDays) {
      throw createHttpError(400, "حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
    }

    return normalizeToWorkDate(addWorkDaysWith28DayMonth(nextVisitBaseDate, customIntervalDays));
  }

  const calculatedNextVisitDate = calculateNextVisitDate(nextVisitBaseDate, visitType);
  return normalizeToWorkDate(calculatedNextVisitDate);
}

function getVisitTypeLabel(type, customVisitIntervalDays = null) {
  const labels = {
    WEEKLY: "أسبوعي",
    BIWEEKLY: "أسبوعين",
    MONTHLY: "شهري",
    CUSTOM: "ميعاد آخر",
    ONE_TIME: "بيع"
  };

  if (type === VisitTypes.CUSTOM) {
    const customIntervalDays = normalizeCustomVisitIntervalDays(customVisitIntervalDays);
    if (customIntervalDays) {
      return `ميعاد آخر (كل ${customIntervalDays} يوم)`;
    }
  }

  return labels[type] || type;
}

async function handleClientVisit({
  clientId,
  user,
  outcome,
  note,
  visitType,
  customVisitIntervalDays,
  advanceDays,
  referenceDate,
  paymentMethod
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

  // Representatives' actions now go through directly but DO NOT modify the Client's main status or nextVisitDate
  // They only record the visit history so the representative gets credited.
  if (user.role === Roles.REPRESENTATIVE) {
    return prisma.$transaction(async (tx) => {
      await tx.visitHistory.create({
        data: {
          client: { connect: { id: existingClient.id } },
          visitedBy: { connect: { id: user.id } },
          previousStatus: previousStatus || ClientStatuses.ACTIVE,
          newStatus: newStatus || ClientStatuses.ACTIVE,
          note: generatedNote,
          paymentMethod: paymentMethod || null,
          previousNextVisitDate,
          newNextVisitDate: previousNextVisitDate, // No change
          visitDate: new Date()
        }
      });

      // return the client with relations so the frontend gets the new visit
      return tx.client.findUnique({
        where: { id: existingClient.id },
        include: clientWithRelations
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
      include: clientWithRelations
    });

    await tx.visitHistory.create({
      data: {
        client: { connect: { id: existingClient.id } },
        visitedBy: { connect: { id: user.id } },
        previousStatus: previousStatus || ClientStatuses.ACTIVE,
        newStatus: newStatus || ClientStatuses.ACTIVE,
        note: generatedNote,
        paymentMethod: paymentMethod || null,
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

  if (user.role === Roles.REPRESENTATIVE && Number(user.regionId) !== Number(regionId)) {
    throw createHttpError(403, "\u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u0625\u062f\u0627\u0631\u0629 \u0647\u0630\u0647 \u0627\u0644\u0645\u0646\u0637\u0642\u0629");
  }

  const region = await prisma.region.findUnique({
    where: { id: Number(regionId) }
  });

  if (!region) {
    throw createHttpError(404, "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629");
  }

  const clients = await prisma.client.findMany({
    where: {
      regionId: Number(regionId),
      isDeleted: false
    },
    select: {
      id: true,
      status: true,
      noAnswerCount: true,
      visitType: true,
      customVisitIntervalDays: true,
      nextVisitDate: true
    }
  });

  if (clients.length === 0) {
    return {
      region,
      updatedCount: 0,
      skippedRejectedCount: 0
    };
  }

  const eligibleClients = clients.filter((client) => 
    client.status !== ClientStatuses.REJECTED && client.visitType !== VisitTypes.ONE_TIME
  );

  const skippedRejectedCount = clients.length - eligibleClients.length;

  if (eligibleClients.length === 0) {
    return {
      region,
      updatedCount: 0,
      skippedRejectedCount
    };
  }

  const currentWeekStart = getCurrentWorkWeekStart(new Date());
  const updateBuckets = new Map();
  const regionHandledNote =
    note || "\u062a\u0645 \u0627\u0644\u062a\u0639\u0627\u0645\u0644 \u0645\u0639 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644";

  const visitHistoryPayload = eligibleClients.map((client) => {
    const nextVisitDate =
      client.visitType === VisitTypes.CUSTOM
        ? addWorkDaysWith28DayMonth(currentWeekStart, normalizeCustomVisitIntervalDays(client.customVisitIntervalDays) || 7)
        : calculateNextVisitDate(currentWeekStart, client.visitType);

    const bucketKey = `${client.visitType}:${nextVisitDate.toISOString()}`;
    if (!updateBuckets.has(bucketKey)) {
      updateBuckets.set(bucketKey, {
        visitType: client.visitType,
        nextVisitDate,
        ids: []
      });
    }
    updateBuckets.get(bucketKey).ids.push(client.id);

    return {
      clientId: client.id,
      visitedById: user.id,
      previousStatus: client.status,
      newStatus: ClientStatuses.ACTIVE,
      note: regionHandledNote,
      previousNextVisitDate: client.nextVisitDate,
      newNextVisitDate: nextVisitDate,
      visitDate: new Date()
    };
  });

  await prisma.$transaction(async (tx) => {
    const clientUpdateOperations = Array.from(updateBuckets.values()).flatMap((bucket) =>
      chunkArray(bucket.ids, 500).map((idBatch) =>
        tx.client.updateMany({
          where: { id: { in: idBatch } },
          data: {
            status: ClientStatuses.ACTIVE,
            noAnswerCount: 0,
            nextVisitDate: bucket.nextVisitDate
          }
        })
      )
    );

    const visitHistoryOperations = chunkArray(visitHistoryPayload, 500).map((batch) =>
      tx.visitHistory.createMany({
        data: batch
      })
    );

    await Promise.all([...clientUpdateOperations, ...visitHistoryOperations]);
  });

  return {
    region,
    updatedCount: eligibleClients.length,
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
      include: clientWithRelations
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
    include: clientWithRelations
  });

  return clonedClient;
}

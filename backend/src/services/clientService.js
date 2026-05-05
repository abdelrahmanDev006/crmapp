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
  const where = {};

  if (user.role === Roles.REPRESENTATIVE) {
    where.regionId = user.regionId;
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

  if (filters.dueDate) {
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
  } else if (filters.dueOnly === true) {
    where.nextVisitDate = {
      lte: normalizeToWorkDate(new Date())
    };
  }

  return where;
}

function enforceClientScope(user, client) {
  if (!client) {
    throw createHttpError(404, "العميل غير موجود");
  }

  if (user.role === Roles.REPRESENTATIVE && Number(user.regionId) !== Number(client.regionId)) {
    throw createHttpError(403, "لا يمكنك الوصول لهذا العميل");
  }
}

async function listClients(filters, user) {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const where = buildClientWhere(filters, user);

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: clientWithRelations,
      orderBy: [{ nextVisitDate: "asc" }, { id: "asc" }],
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
    CUSTOM: "ميعاد آخر"
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
  referenceDate
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

  return prisma.$transaction(async (tx) => {
    const updatedClient = await tx.client.update({
      where: { id: existingClient.id },
      data: {
        status: newStatus,
        noAnswerCount: newNoAnswerCount,
        nextVisitDate: newNextVisitDate,
        visitType: nextVisitType,
        customVisitIntervalDays: nextCustomVisitIntervalDays
      },
      include: clientWithRelations
    });

    await tx.visitHistory.create({
      data: {
        clientId: existingClient.id,
        visitedById: user.id,
        previousStatus,
        newStatus,
        note: generatedNote,
        previousNextVisitDate,
        newNextVisitDate,
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
      regionId: Number(regionId)
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

  const eligibleClients = clients.filter((client) => client.status !== ClientStatuses.REJECTED);

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

module.exports = {
  listClients,
  getClientById,
  handleClientVisit,
  handleRegionClients,
  enforceClientScope
};

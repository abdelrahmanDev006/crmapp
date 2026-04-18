const prisma = require("../config/prisma");
const env = require("../config/env");
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

function canRetryRejectedClient(client, referenceDate = new Date()) {
  if (client.status !== ClientStatuses.REJECTED) {
    return true;
  }

  const today = normalizeToWorkDate(referenceDate);
  const retryDate = normalizeToWorkDate(client.nextVisitDate);
  return today.getTime() >= retryDate.getTime();
}

function resolveNextVisitDate({ currentDate, visitType, outcome, rejectedRetryDays, advanceDays, referenceDate }) {
  if (outcome === ClientStatuses.REJECTED) {
    // After rejection, schedule a future retry date.
    const retryDate = addWorkDaysWith28DayMonth(normalizeToWorkDate(new Date()), rejectedRetryDays);
    return normalizeToWorkDate(retryDate);
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

  if (visitType === VisitTypes.CUSTOM) {
    const customBaseDate = referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(currentDate || new Date());
    return normalizeToWorkDate(customBaseDate);
  }

  if (Number.isFinite(Number(advanceDays)) && Number(advanceDays) > 0) {
    const baseDate = referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(new Date());
    const advancedDate = addWorkDaysWith28DayMonth(baseDate, Number(advanceDays));
    return normalizeToWorkDate(advancedDate);
  }

  const nextVisitBaseDate = currentDate ? normalizeToWorkDate(currentDate) : normalizeToWorkDate(new Date());
  const calculatedNextVisitDate = calculateNextVisitDate(nextVisitBaseDate, visitType);
  return normalizeToWorkDate(calculatedNextVisitDate);
}

function getVisitTypeLabel(type) {
  const labels = {
    WEEKLY: "أسبوعي",
    BIWEEKLY: "كل أسبوعين",
    MONTHLY: "شهري",
    CUSTOM: "ميعاد آخر"
  };

  return labels[type] || type;
}

function formatWorkDateForMessage(dateValue) {
  const normalized = normalizeToWorkDate(dateValue);
  const day = String(normalized.getUTCDate()).padStart(2, "0");
  const month = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  const year = String(normalized.getUTCFullYear());

  return `${day}/${month}/${year}`;
}

async function handleClientVisit({ clientId, user, outcome, note, visitType, advanceDays, referenceDate }) {
  const existingClient = await getClientById(clientId, user, false);
  const isRejectedRecoveryOutcome =
    existingClient.status === ClientStatuses.REJECTED &&
    (outcome === ClientStatuses.NO_ANSWER || outcome === ClientStatuses.ACTIVE);

  if (isRejectedRecoveryOutcome) {
    const canRetry = canRetryRejectedClient(existingClient, referenceDate || new Date());
    if (!canRetry) {
      throw createHttpError(
        400,
        `يمكن إعادة المحاولة مع هذا العميل بعد ${formatWorkDateForMessage(existingClient.nextVisitDate)}`
      );
    }
  }

  const previousStatus = existingClient.status;
  const previousNextVisitDate = existingClient.nextVisitDate;
  const nextVisitType = visitType || existingClient.visitType;
  const visitTypeChanged = existingClient.visitType !== nextVisitType;
  const newStatus = outcome;

  if (newStatus === ClientStatuses.ACTIVE && nextVisitType === VisitTypes.CUSTOM && !referenceDate) {
    throw createHttpError(400, "يرجى تحديد الموعد القادم عند اختيار نوع الزيارة ميعاد آخر");
  }

  const newNextVisitDate = resolveNextVisitDate({
    currentDate: existingClient.nextVisitDate,
    visitType: nextVisitType,
    outcome,
    rejectedRetryDays: env.rejectedRetryDays,
    advanceDays,
    referenceDate
  });

  const statusRecoveryNote =
    previousStatus === ClientStatuses.REJECTED && newStatus === ClientStatuses.ACTIVE
      ? "تمت إعادة تفعيل العميل بعد فترة سقوط"
      : null;

  const visitTypeChangeNote = visitTypeChanged
    ? `تم تغيير نوع الزيارة من ${getVisitTypeLabel(existingClient.visitType)} إلى ${getVisitTypeLabel(nextVisitType)}`
    : null;

  const generatedNote = [note, statusRecoveryNote, visitTypeChangeNote].filter(Boolean).join(" | ") || null;

  return prisma.$transaction(async (tx) => {
    const updatedClient = await tx.client.update({
      where: { id: existingClient.id },
      data: {
        status: newStatus,
        nextVisitDate: newNextVisitDate,
        visitType: nextVisitType
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
      visitType: true,
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

  const currentWorkDate = normalizeToWorkDate(new Date());
  const eligibleClients = clients.filter((client) => {
    if (client.status !== ClientStatuses.REJECTED) {
      return true;
    }

    return canRetryRejectedClient(client, currentWorkDate);
  });

  const skippedRejectedCount = clients.length - eligibleClients.length;

  if (eligibleClients.length === 0) {
    return {
      region,
      updatedCount: 0,
      skippedRejectedCount
    };
  }

  const currentWeekStart = getCurrentWorkWeekStart(new Date());
  const nextVisitDatesByType = {
    [VisitTypes.WEEKLY]: calculateNextVisitDate(currentWeekStart, VisitTypes.WEEKLY),
    [VisitTypes.BIWEEKLY]: calculateNextVisitDate(currentWeekStart, VisitTypes.BIWEEKLY),
    [VisitTypes.MONTHLY]: calculateNextVisitDate(currentWeekStart, VisitTypes.MONTHLY),
    [VisitTypes.CUSTOM]: addWorkDaysWith28DayMonth(currentWeekStart, 7)
  };
  const idsByVisitType = {
    [VisitTypes.WEEKLY]: [],
    [VisitTypes.BIWEEKLY]: [],
    [VisitTypes.MONTHLY]: [],
    [VisitTypes.CUSTOM]: []
  };
  const regionHandledNote =
    note || "\u062a\u0645 \u0627\u0644\u062a\u0639\u0627\u0645\u0644 \u0645\u0639 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644";

  const visitHistoryPayload = eligibleClients.map((client) => {
    idsByVisitType[client.visitType].push(client.id);

    return {
      clientId: client.id,
      visitedById: user.id,
      previousStatus: client.status,
      newStatus: ClientStatuses.ACTIVE,
      note: regionHandledNote,
      previousNextVisitDate: client.nextVisitDate,
      newNextVisitDate: nextVisitDatesByType[client.visitType],
      visitDate: new Date()
    };
  });

  await prisma.$transaction(async (tx) => {
    const clientUpdateOperations = Object.entries(idsByVisitType).flatMap(([visitType, ids]) =>
      chunkArray(ids, 500).map((idBatch) =>
        tx.client.updateMany({
          where: { id: { in: idBatch } },
          data: {
            status: ClientStatuses.ACTIVE,
            nextVisitDate: nextVisitDatesByType[visitType]
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
  enforceClientScope,
  canRetryRejectedClient
};

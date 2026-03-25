const prisma = require("../config/prisma");
const env = require("../config/env");
const { Roles, ClientStatuses, VisitTypes } = require("../constants/enums");
const { normalizeToWorkDate, toStartOfUtcDay, calculateNextVisitDate, addWorkDaysWith28DayMonth } = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");
const {
  normalizePhoneForWhatsApp,
  buildDueTodayWhatsAppMessage,
  buildNewClientWhatsAppMessage,
  assertWhatsAppCloudConfigured,
  sendWhatsAppTextMessage
} = require("./whatsappService");

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

function sleep(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendWhatsAppAlertsToClients({ clients, messageText }) {
  let sentCount = 0;
  const skippedClients = [];
  const failedClients = [];

  for (const client of clients) {
    const normalizedPhone = normalizePhoneForWhatsApp(client.phone);

    if (!normalizedPhone) {
      skippedClients.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        reason: "رقم غير صالح للواتساب"
      });
      continue;
    }

    try {
      await sendWhatsAppTextMessage({
        to: normalizedPhone,
        message: messageText
      });
      sentCount += 1;
      await sleep(env.whatsappCloudMessageDelayMs);
    } catch (error) {
      failedClients.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        reason: error.message || "تعذر إرسال رسالة واتساب"
      });
    }
  }

  return {
    sentCount,
    skippedCount: skippedClients.length,
    failedCount: failedClients.length,
    skippedClients,
    failedClients
  };
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
      { products: { contains: filters.search, mode: "insensitive" } }
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
    return addWorkDaysWith28DayMonth(normalizeToWorkDate(new Date()), rejectedRetryDays);
  }

  if (outcome === ClientStatuses.NO_ANSWER) {
    return currentDate;
  }

  if (Number.isFinite(Number(advanceDays)) && Number(advanceDays) > 0) {
    const baseDate = referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(new Date());
    return addWorkDaysWith28DayMonth(baseDate, Number(advanceDays));
  }

  const nextVisitBaseDate = currentDate ? normalizeToWorkDate(currentDate) : normalizeToWorkDate(new Date());
  return calculateNextVisitDate(nextVisitBaseDate, visitType);
}

function getVisitTypeLabel(type) {
  const labels = {
    WEEKLY: "أسبوعي",
    BIWEEKLY: "كل أسبوعين",
    MONTHLY: "شهري"
  };

  return labels[type] || type;
}

async function handleClientVisit({ clientId, user, outcome, note, visitType, advanceDays, referenceDate }) {
  const existingClient = await getClientById(clientId, user, false);

  if (existingClient.status === ClientStatuses.REJECTED && outcome === ClientStatuses.NO_ANSWER) {
    const canRetry = canRetryRejectedClient(existingClient);
    if (!canRetry) {
      throw createHttpError(400, `يمكن إعادة المحاولة مع هذا العميل بعد ${normalizeToWorkDate(existingClient.nextVisitDate).toISOString().slice(0, 10)}`);
    }
  }

  const previousStatus = existingClient.status;
  const previousNextVisitDate = existingClient.nextVisitDate;
  const nextVisitType = visitType || existingClient.visitType;
  const visitTypeChanged = existingClient.visitType !== nextVisitType;

  const newStatus = outcome;
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
      ? "تمت إعادة تفعيل العميل بعد فترة رفض"
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
      status: {
        not: ClientStatuses.REJECTED
      }
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
      updatedCount: 0
    };
  }

  const now = normalizeToWorkDate(new Date());
  const nextVisitDatesByType = {
    [VisitTypes.WEEKLY]: calculateNextVisitDate(now, VisitTypes.WEEKLY),
    [VisitTypes.BIWEEKLY]: calculateNextVisitDate(now, VisitTypes.BIWEEKLY),
    [VisitTypes.MONTHLY]: calculateNextVisitDate(now, VisitTypes.MONTHLY)
  };
  const idsByVisitType = {
    [VisitTypes.WEEKLY]: [],
    [VisitTypes.BIWEEKLY]: [],
    [VisitTypes.MONTHLY]: []
  };
  const regionHandledNote =
    note || "\u062a\u0645 \u0627\u0644\u062a\u0639\u0627\u0645\u0644 \u0645\u0639 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644";

  const visitHistoryPayload = clients.map((client) => {
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
    updatedCount: clients.length
  };
}

async function sendDueTodayWhatsAppAlerts({ user, regionId, customMessage }) {
  assertWhatsAppCloudConfigured();

  const dueDate = normalizeToWorkDate(new Date()).toISOString().slice(0, 10);
  const where = buildClientWhere(
    {
      dueDate,
      ...(regionId ? { regionId } : {})
    },
    user
  );

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true
    },
    orderBy: [{ nextVisitDate: "asc" }, { id: "asc" }]
  });

  if (clients.length === 0) {
    return {
      dueDate,
      totalDueClients: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedClients: [],
      failedClients: []
    };
  }

  const messageText =
    String(customMessage || "").trim() || buildDueTodayWhatsAppMessage({ representativeName: user.name, dueDate: new Date() });

  const result = await sendWhatsAppAlertsToClients({ clients, messageText });

  return {
    dueDate,
    totalDueClients: clients.length,
    ...result
  };
}

async function sendNewClientsWhatsAppAlerts({ user, regionId, customMessage }) {
  assertWhatsAppCloudConfigured();

  const createdDateStart = toStartOfUtcDay(new Date());
  const nextDateStart = new Date(createdDateStart);
  nextDateStart.setUTCDate(nextDateStart.getUTCDate() + 1);
  const createdDate = createdDateStart.toISOString().slice(0, 10);

  const where = {
    createdAt: {
      gte: createdDateStart,
      lt: nextDateStart
    },
    status: {
      not: ClientStatuses.REJECTED
    }
  };

  if (user.role === Roles.REPRESENTATIVE) {
    where.regionId = Number(user.regionId);
  }

  if (regionId) {
    where.regionId = Number(regionId);
  }

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  if (clients.length === 0) {
    return {
      createdDate,
      totalNewClients: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedClients: [],
      failedClients: []
    };
  }

  const messageText = String(customMessage || "").trim() || buildNewClientWhatsAppMessage({ representativeName: user.name });
  const result = await sendWhatsAppAlertsToClients({ clients, messageText });

  return {
    createdDate,
    totalNewClients: clients.length,
    ...result
  };
}

module.exports = {
  listClients,
  getClientById,
  handleClientVisit,
  handleRegionClients,
  sendDueTodayWhatsAppAlerts,
  sendNewClientsWhatsAppAlerts,
  enforceClientScope,
  canRetryRejectedClient
};

const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const asyncHandler = require("../middlewares/asyncHandler");
const { Roles, VisitTypes, ClientStatuses } = require("../constants/enums");
const { getCurrentWorkWeekStart, normalizeToWorkDate } = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");
const {
  listClients,
  listClientsByRegionPage,
  getClientById,
  handleClientVisit,
  toggleExceptionalStatus,
  bulkEditClients
} = require("../services/clientService");
const { logActivity } = require("../services/logService");

function normalizeClientName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePhoneForComparison(value) {
  return String(value || "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D+/g, "");
}

async function findDuplicatePhoneClient({ normalizedPhone, excludeClientId }) {
  if (!normalizedPhone) {
    return null;
  }

  const exclusionSql =
    Number.isInteger(Number(excludeClientId)) && Number(excludeClientId) > 0
      ? Prisma.sql`AND c.id <> ${Number(excludeClientId)}`
      : Prisma.empty;

  const duplicatedRows = await prisma.$queryRaw`
    SELECT c.id, c.name, c.phone, c."regionId"
    FROM "Client" c
    WHERE c."isDeleted" = false AND regexp_replace(
      translate(c.phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
      '[^0-9]',
      '',
      'g'
    ) = ${normalizedPhone}
    ${exclusionSql}
    LIMIT 1
  `;

  return duplicatedRows[0] || null;
}

async function assertClientUniqueness({
  name,
  phone,
  regionId,
  excludeClientId,
  force = false
}) {
  const normalizedName = normalizeClientName(name);
  const normalizedPhone = normalizePhoneForComparison(phone);
  const numericRegionId = Number(regionId);
  const excludedId = Number(excludeClientId);

  if (!force) {
    if (normalizedPhone) {
      const duplicateByPhone = await findDuplicatePhoneClient({
        normalizedPhone,
        excludeClientId: excludedId
      });

      if (duplicateByPhone) {
        throw createHttpError(
          409,
          `رقم الهاتف مستخدم بالفعل مع العميل "${duplicateByPhone.name}" (ID: ${duplicateByPhone.id})`
        );
      }
    }

    if (normalizedName && Number.isInteger(numericRegionId) && numericRegionId > 0) {
      const exclusionSql =
        Number.isInteger(excludedId) && excludedId > 0
          ? Prisma.sql`AND c.id <> ${excludedId}`
          : Prisma.empty;

      const duplicatedRows = await prisma.$queryRaw`
        SELECT c.id, c.name
        FROM "Client" c
        WHERE c."isDeleted" = false
          AND c."regionId" = ${numericRegionId}
          AND LOWER(c.name) = LOWER(${normalizedName})
          ${exclusionSql}
        LIMIT 1
      `;
      const duplicateByName = duplicatedRows[0] || null;

      if (duplicateByName) {
        throw createHttpError(
          409,
          `اسم العميل موجود بالفعل داخل نفس المنطقة (ID: ${duplicateByName.id})`
        );
      }
    }
  }

  return { normalizedName, normalizedPhone };
}

const listClientRecords = asyncHandler(async (req, res) => {
  if (req.user.role === Roles.REPRESENTATIVE && req.query.regionId && !req.user.regions?.some(r => Number(r.id) === Number(req.query.regionId))) {
    throw createHttpError(403, "غير مصرح لك باستعراض هذه المنطقة");
  }

  const result = await listClients(req.query, req.user);
  res.json(result);
});

const listClientsByRegion = asyncHandler(async (req, res) => {
  if (req.user.role === Roles.REPRESENTATIVE && req.query.regionId && !req.user.regions?.some(r => Number(r.id) === Number(req.query.regionId))) {
    throw createHttpError(403, "غير مصرح لك باستعراض هذه المنطقة");
  }

  const result = await listClientsByRegionPage(req.query, req.user);
  res.json(result);
});

const getOverdueSummary = asyncHandler(async (req, res) => {
  const overdueWhere = {
    isDeleted: false,
    nextVisitDate: { lt: normalizeToWorkDate(new Date()) },
    status: { in: [ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER] }
  };

  const [total, distinctDates] = await Promise.all([
    prisma.client.count({ where: overdueWhere }),
    prisma.client.findMany({
      where: overdueWhere,
      select: { nextVisitDate: true },
      distinct: ['nextVisitDate'],
      orderBy: { nextVisitDate: 'asc' }
    })
  ]);

  res.json({
    total,
    dates: distinctDates.map(d => d.nextVisitDate)
  });
});

const getClientDetails = asyncHandler(async (req, res) => {
  const client = await getClientById(req.params.id, req.user, true);
  res.json({ item: client });
});

const createClient = asyncHandler(async (req, res) => {
  const payload = req.body;

  const region = await prisma.region.findUnique({
    where: { id: Number(payload.regionId) }
  });

  if (!region) {
    throw createHttpError(400, "المنطقة غير موجودة");
  }

  const { normalizedName } = await assertClientUniqueness({
    name: payload.name,
    phone: payload.phone,
    regionId: payload.regionId,
    force: payload.force
  });

  const normalizedStatus = payload.status || ClientStatuses.ACTIVE;

  const client = await prisma.$transaction(async (tx) => {
    const newClient = await tx.client.create({
      data: {
        name: normalizedName,
        phone: String(payload.phone || "").trim(),
        address: String(payload.address || "").trim(),
        locationUrl: payload.locationUrl ? String(payload.locationUrl).trim() : undefined,
        regionId: payload.regionId,
        products: String(payload.products || "").trim(),
        price: payload.price ? String(payload.price).trim() : undefined,
        visitType: payload.visitType,
        customVisitIntervalDays:
          payload.visitType === VisitTypes.CUSTOM ? Number(payload.customVisitIntervalDays) : null,
        status: normalizedStatus,
        noAnswerCount: normalizedStatus === ClientStatuses.NO_ANSWER ? 1 : 0,
        nextVisitDate: payload.nextVisitDate
          ? normalizeToWorkDate(payload.nextVisitDate)
          : getCurrentWorkWeekStart(new Date()),
        createdById: req.user.id
      },
      include: {
        region: true
      }
    });

    if (payload.note && String(payload.note).trim() !== "") {
      await tx.visitHistory.create({
        data: {
          client: { connect: { id: newClient.id } },
          visitedBy: { connect: { id: req.user.id } },
          previousStatus: normalizedStatus || ClientStatuses.ACTIVE,
          newStatus: normalizedStatus || ClientStatuses.ACTIVE,
          note: String(payload.note).trim(),
          previousNextVisitDate: null,
          newNextVisitDate: newClient.nextVisitDate,
          visitDate: new Date()
        }
      });
      newClient.visits = [{ note: String(payload.note).trim() }];
    }

    return newClient;
  });

  await logActivity({
    userId: req.user.id,
    action: "CREATE_CLIENT",
    entityType: "CLIENT",
    entityId: client.id,
    entityName: client.name,
    details: `تم إضافة عميل جديد: ${client.name}`
  });

  res.status(201).json({
    message: "تم إنشاء العميل",
    item: client
  });
});

const updateClient = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);
  const existing = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!existing) {
    throw createHttpError(404, "العميل غير موجود");
  }

  const nextRegionId = req.body.regionId ? Number(req.body.regionId) : existing.regionId;

  if (req.body.regionId) {
    const region = await prisma.region.findUnique({ where: { id: nextRegionId } });
    if (!region) {
      throw createHttpError(400, "المنطقة غير موجودة");
    }
  }

  const hasNameInPayload = Object.prototype.hasOwnProperty.call(req.body, "name");
  const hasPhoneInPayload = Object.prototype.hasOwnProperty.call(req.body, "phone");

  const nextName = hasNameInPayload ? req.body.name : existing.name;
  const nextPhone = hasPhoneInPayload ? req.body.phone : existing.phone;

  const { normalizedName } = await assertClientUniqueness({
    name: nextName,
    phone: nextPhone,
    regionId: nextRegionId,
    excludeClientId: clientId,
    force: req.body.force
  });

  const hasCustomIntervalInPayload = Object.prototype.hasOwnProperty.call(req.body, "customVisitIntervalDays");
  const finalVisitType = req.body.visitType || existing.visitType;
  const finalCustomVisitIntervalDays =
    finalVisitType === VisitTypes.CUSTOM
      ? hasCustomIntervalInPayload
        ? Number(req.body.customVisitIntervalDays)
        : existing.customVisitIntervalDays
      : null;

  if (finalVisitType === VisitTypes.CUSTOM && !Number.isInteger(finalCustomVisitIntervalDays)) {
    throw createHttpError(400, "حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
  }

  const { regionId: _regionId, force: _force, note: _note, ...restBody } = req.body;

  const updatePayload = {
    ...restBody,
    ...(hasNameInPayload ? { name: normalizedName } : {}),
    ...(hasPhoneInPayload ? { phone: String(nextPhone || "").trim() } : {}),
    customVisitIntervalDays: finalCustomVisitIntervalDays,
    ...(req.body.nextVisitDate ? { nextVisitDate: normalizeToWorkDate(req.body.nextVisitDate) } : {}),
    region: { connect: { id: nextRegionId } }
  };

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    if (req.body.status === ClientStatuses.NO_ANSWER) {
      updatePayload.noAnswerCount = Number(existing.noAnswerCount || 0) + 1;
    } else {
      updatePayload.noAnswerCount = 0;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "locationUrl")) {
    const normalizedLocationUrl = String(req.body.locationUrl || "").trim();
    updatePayload.locationUrl = normalizedLocationUrl || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "price")) {
    const normalizedPrice = String(req.body.price || "").trim();
    updatePayload.price = normalizedPrice || null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedClient = await tx.client.update({
      where: { id: clientId },
      data: updatePayload,
      include: {
        region: true
      }
    });

    if (Object.prototype.hasOwnProperty.call(req.body, "note")) {
      const newNote = String(req.body.note).trim();
      
      const latestVisitWithNote = await tx.visitHistory.findFirst({
        where: { 
          clientId: updatedClient.id,
          note: { not: null }
        },
        orderBy: { visitDate: 'desc' }
      });

      if (latestVisitWithNote && latestVisitWithNote.note.trim() !== "") {
        if (newNote === "") {
          await tx.visitHistory.update({
            where: { id: latestVisitWithNote.id },
            data: { note: "" }
          });
        } else if (newNote !== latestVisitWithNote.note) {
          await tx.visitHistory.update({
            where: { id: latestVisitWithNote.id },
            data: { note: newNote }
          });
        }
      } else if (newNote !== "") {
        await tx.visitHistory.create({
          data: {
            client: { connect: { id: updatedClient.id } },
            visitedBy: { connect: { id: req.user.id } },
            previousStatus: existing.status || ClientStatuses.ACTIVE,
            newStatus: updatedClient.status || ClientStatuses.ACTIVE,
            note: newNote,
            previousNextVisitDate: existing.nextVisitDate,
            newNextVisitDate: updatedClient.nextVisitDate,
            visitDate: new Date()
          }
        });
      }
    }

    return updatedClient;
  });

  await logActivity({
    userId: req.user.id,
    action: "UPDATE_CLIENT",
    entityType: "CLIENT",
    entityId: updated.id,
    entityName: updated.name,
    details: `تم تعديل بيانات العميل: ${updated.name}`
  });

  res.json({
    message: "تم تحديث العميل",
    item: updated
  });
});

const handleClient = asyncHandler(async (req, res) => {
  const updatedClient = await handleClientVisit({
    clientId: req.params.id,
    user: req.user,
    outcome: req.body.outcome,
    note: req.body.note,
    visitType: req.body.visitType,
    customVisitIntervalDays: req.body.customVisitIntervalDays,
    advanceDays: req.body.advanceDays,
    referenceDate: req.body.referenceDate
  });

  await logActivity({
    userId: req.user.id,
    action: "HANDLE_CLIENT",
    entityType: "CLIENT",
    entityId: updatedClient.id,
    entityName: updatedClient.name,
    details: req.user.role === Roles.ADMIN 
      ? `تم اتخاذ إجراء مع العميل: ${updatedClient.name}`
      : `تم طلب إجراء للعميل: ${updatedClient.name}`
  });

  res.json({
    message: "تم تحديث حالة العميل",
    item: updatedClient
  });
});

const deleteClient = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);
  const existing = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!existing) {
    throw createHttpError(404, "العميل غير موجود");
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { 
      isDeleted: true,
      deletedAt: new Date()
    }
  });

  await logActivity({
    userId: req.user.id,
    action: "DELETE_CLIENT",
    entityType: "CLIENT",
    entityId: existing.id,
    entityName: existing.name,
    details: `تم حذف العميل: ${existing.name}`
  });

  res.json({
    message: "تم حذف العميل بنجاح"
  });
});


const toggleExceptional = asyncHandler(async (req, res) => {
  const { isExceptional, exceptionalReason, exceptionalNextVisitDate, products, price } = req.body;
  const client = await toggleExceptionalStatus(Number(req.params.id), req.user, isExceptional, exceptionalReason, exceptionalNextVisitDate, products, price);
  
  res.json({
    message: isExceptional ? "تم تسجيل الشكوى كعميل مستقل" : "تم إلغاء حالة الشكوى",
    item: client
  });
});

const bulkEdit = asyncHandler(async (req, res) => {
  const result = await bulkEditClients(req.user, req.body);
  res.json({
    message: `تم تعديل ${result.updatedCount} عميل بنجاح`,
    updatedCount: result.updatedCount
  });
});

module.exports = {
  listClientRecords,
  listClientsByRegion,
  getClientDetails,
  createClient,
  updateClient,
  handleClient,
  deleteClient,
  getOverdueSummary,
  toggleExceptional,
  bulkEdit
};

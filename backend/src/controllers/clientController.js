const prisma = require("../config/prisma");
const asyncHandler = require("../middlewares/asyncHandler");
const { Roles } = require("../constants/enums");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");
const {
  listClients,
  getClientById,
  handleClientVisit,
  sendDueTodayWhatsAppAlerts,
  sendNewClientsWhatsAppAlerts
} = require("../services/clientService");

const listClientRecords = asyncHandler(async (req, res) => {
  if (req.user.role === Roles.REPRESENTATIVE && req.query.regionId && Number(req.query.regionId) !== Number(req.user.regionId)) {
    throw createHttpError(403, "لا يمكنك الوصول إلى مناطق أخرى");
  }

  const result = await listClients(req.query, req.user);
  res.json(result);
});

const getClientDetails = asyncHandler(async (req, res) => {
  const client = await getClientById(req.params.id, req.user, true);
  res.json({ item: client });
});

const createClient = asyncHandler(async (req, res) => {
  const payload = req.body;

  if (req.user.role === Roles.REPRESENTATIVE) {
    throw createHttpError(403, "لا تملك صلاحية إضافة عملاء");
  }

  const region = await prisma.region.findUnique({
    where: { id: Number(payload.regionId) }
  });

  if (!region) {
    throw createHttpError(400, "المنطقة غير موجودة");
  }

  const client = await prisma.client.create({
    data: {
      name: payload.name,
      phone: payload.phone,
      address: payload.address,
      regionId: payload.regionId,
      products: payload.products,
      visitType: payload.visitType,
      status: payload.status,
      nextVisitDate: payload.nextVisitDate ? normalizeToWorkDate(payload.nextVisitDate) : normalizeToWorkDate(new Date()),
      createdById: req.user.id
    },
    include: {
      region: true
    }
  });

  res.status(201).json({
    message: "تم إنشاء العميل",
    item: client
  });
});

const updateClient = asyncHandler(async (req, res) => {
  if (req.user.role === Roles.REPRESENTATIVE) {
    throw createHttpError(403, "لا تملك صلاحية تعديل بيانات العميل");
  }

  const existing = await prisma.client.findUnique({
    where: { id: Number(req.params.id) }
  });

  if (!existing) {
    throw createHttpError(404, "العميل غير موجود");
  }

  if (req.body.regionId) {
    const region = await prisma.region.findUnique({ where: { id: Number(req.body.regionId) } });
    if (!region) {
      throw createHttpError(400, "المنطقة غير موجودة");
    }
  }

  const updated = await prisma.client.update({
    where: { id: Number(req.params.id) },
    data: {
      ...req.body,
      ...(req.body.nextVisitDate ? { nextVisitDate: normalizeToWorkDate(req.body.nextVisitDate) } : {})
    },
    include: {
      region: true
    }
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
    advanceDays: req.body.advanceDays,
    referenceDate: req.body.referenceDate
  });

  res.json({
    message: "تم تحديث حالة العميل",
    item: updatedClient
  });
});

const deleteClient = asyncHandler(async (req, res) => {
  if (req.user.role === Roles.REPRESENTATIVE) {
    throw createHttpError(403, "لا تملك صلاحية حذف العملاء");
  }

  const clientId = Number(req.params.id);
  const existing = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!existing) {
    throw createHttpError(404, "العميل غير موجود");
  }

  await prisma.client.delete({
    where: { id: clientId }
  });

  res.json({
    message: "تم حذف العميل بنجاح"
  });
});

const sendTodayWhatsAppAlerts = asyncHandler(async (req, res) => {
  const regionId = req.body.regionId ? Number(req.body.regionId) : undefined;

  if (req.user.role === Roles.REPRESENTATIVE && regionId && regionId !== Number(req.user.regionId)) {
    throw createHttpError(403, "لا يمكنك إرسال تنبيهات لمناطق أخرى");
  }

  const result = await sendDueTodayWhatsAppAlerts({
    user: req.user,
    regionId,
    customMessage: req.body.message
  });

  res.json({
    message: "تم تنفيذ تنبيهات واتساب لعملاء اليوم",
    item: result
  });
});

const sendNewClientsWhatsAppAlertsController = asyncHandler(async (req, res) => {
  const regionId = req.body.regionId ? Number(req.body.regionId) : undefined;

  if (req.user.role === Roles.REPRESENTATIVE && regionId && regionId !== Number(req.user.regionId)) {
    throw createHttpError(403, "لا يمكنك إرسال تنبيهات لمناطق أخرى");
  }

  const result = await sendNewClientsWhatsAppAlerts({
    user: req.user,
    regionId,
    customMessage: req.body.message
  });

  res.json({
    message: "تم تنفيذ تنبيهات واتساب للعملاء الجدد",
    item: result
  });
});

module.exports = {
  listClientRecords,
  getClientDetails,
  createClient,
  updateClient,
  handleClient,
  deleteClient,
  sendTodayWhatsAppAlerts,
  sendNewClientsWhatsAppAlertsController
};

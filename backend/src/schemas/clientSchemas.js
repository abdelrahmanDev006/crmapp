const { z } = require("zod");
const { VisitTypes, ClientStatuses } = require("../constants/enums");

const dateInputSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "تاريخ الزيارة غير صالح");

const createClientSchema = z.object({
  name: z.string().min(2, "اسم العميل مطلوب"),
  phone: z.string().min(8, "رقم الهاتف مطلوب"),
  address: z.string().min(3, "العنوان مطلوب"),
  regionId: z.coerce.number().int().positive(),
  products: z.string().min(1, "المنتجات مطلوبة"),
  visitType: z.enum([VisitTypes.WEEKLY, VisitTypes.BIWEEKLY, VisitTypes.MONTHLY]),
  status: z.enum([ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER, ClientStatuses.REJECTED]).optional(),
  nextVisitDate: dateInputSchema.optional()
});

const updateClientSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(8).optional(),
  address: z.string().min(3).optional(),
  regionId: z.coerce.number().int().positive().optional(),
  products: z.string().min(1).optional(),
  visitType: z.enum([VisitTypes.WEEKLY, VisitTypes.BIWEEKLY, VisitTypes.MONTHLY]).optional(),
  status: z.enum([ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER, ClientStatuses.REJECTED]).optional(),
  nextVisitDate: dateInputSchema.optional()
});

const clientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z
    .coerce.number()
    .int()
    .min(1)
    .default(20)
    .transform((value) => Math.min(value, 100)),
  search: z.string().trim().optional(),
  visitType: z.enum([VisitTypes.WEEKLY, VisitTypes.BIWEEKLY, VisitTypes.MONTHLY]).optional(),
  status: z.enum([ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER, ClientStatuses.REJECTED]).optional(),
  regionId: z.coerce.number().int().positive().optional(),
  dueDate: dateInputSchema.optional(),
  createdDate: dateInputSchema.optional(),
  dueOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      return value.toLowerCase() === "true";
    })
});

const handleClientSchema = z.object({
  outcome: z.enum([ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER, ClientStatuses.REJECTED]),
  note: z.string().max(500).optional(),
  visitType: z.enum([VisitTypes.WEEKLY, VisitTypes.BIWEEKLY, VisitTypes.MONTHLY]).optional(),
  advanceDays: z.coerce.number().int().min(1).max(365).optional(),
  referenceDate: dateInputSchema.optional()
});

const bulkRegionHandleSchema = z.object({
  note: z.string().max(500).optional()
});

const sendWhatsAppAlertsSchema = z.object({
  regionId: z.coerce.number().int().positive().optional(),
  message: z.string().trim().min(3).max(1000).optional()
});
const sendTodayWhatsAppAlertsSchema = sendWhatsAppAlertsSchema;
const sendNewClientsWhatsAppAlertsSchema = sendWhatsAppAlertsSchema;

module.exports = {
  createClientSchema,
  updateClientSchema,
  clientQuerySchema,
  handleClientSchema,
  bulkRegionHandleSchema,
  sendTodayWhatsAppAlertsSchema,
  sendNewClientsWhatsAppAlertsSchema
};

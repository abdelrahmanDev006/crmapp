const { z } = require("zod");
const { VisitTypes, ClientStatuses } = require("../constants/enums");

const visitTypeValues = [VisitTypes.WEEKLY, VisitTypes.BIWEEKLY, VisitTypes.MONTHLY];

const dateInputSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "تاريخ الزيارة غير صالح");

function isValidLocationUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return true;
  }

  if (/\s/.test(raw)) {
    return false;
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    const isHttpProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";

    if (!isHttpProtocol) {
      return false;
    }

    const hostname = String(parsed.hostname || "").trim();
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const hasPublicSuffix = hostname.includes(".") && !hostname.startsWith(".") && !hostname.endsWith(".");
    const isLocalhost = hostname === "localhost";

    return isIpv4 || hasPublicSuffix || isLocalhost;
  } catch {
    return false;
  }
}

const locationUrlSchema = z
  .string()
  .trim()
  .max(1000, "رابط اللوكيشن طويل جدًا")
  .refine(isValidLocationUrl, "رابط اللوكيشن غير صالح");

const priceSchema = z.string().trim().max(120, "قيمة السعر طويلة جدًا");

const createClientSchema = z.object({
  name: z.string().min(2, "اسم العميل مطلوب"),
  phone: z.string().min(8, "رقم الهاتف مطلوب"),
  address: z.string().min(3, "العنوان مطلوب"),
  locationUrl: locationUrlSchema.optional(),
  regionId: z.coerce.number().int().positive(),
  products: z.string().min(1, "المنتجات مطلوبة"),
  price: priceSchema.optional(),
  visitType: z.enum(visitTypeValues),
  status: z.enum([ClientStatuses.ACTIVE, ClientStatuses.NO_ANSWER, ClientStatuses.REJECTED]).optional(),
  nextVisitDate: dateInputSchema.optional()
});

const updateClientSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(8).optional(),
  address: z.string().min(3).optional(),
  locationUrl: locationUrlSchema.optional(),
  regionId: z.coerce.number().int().positive().optional(),
  products: z.string().min(1).optional(),
  price: priceSchema.optional(),
  visitType: z.enum(visitTypeValues).optional(),
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
  visitType: z.enum(visitTypeValues).optional(),
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
  visitType: z.enum(visitTypeValues).optional(),
  advanceDays: z.coerce.number().int().min(1).max(365).optional(),
  referenceDate: dateInputSchema.optional()
});

const bulkRegionHandleSchema = z.object({
  note: z.string().max(500).optional()
});

module.exports = {
  createClientSchema,
  updateClientSchema,
  clientQuerySchema,
  handleClientSchema,
  bulkRegionHandleSchema
};

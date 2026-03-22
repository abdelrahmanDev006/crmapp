const { z } = require("zod");
const { Roles } = require("../constants/enums");

const createUserSchema = z
  .object({
    name: z.string().min(2, "الاسم مطلوب"),
    email: z.string().email("البريد الإلكتروني غير صالح"),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
    role: z.enum([Roles.ADMIN, Roles.REPRESENTATIVE]),
    regionId: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (data.role === Roles.REPRESENTATIVE && !data.regionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تحديد منطقة للمندوب",
        path: ["regionId"]
      });
    }
  });

const updateUserSchema = z
  .object({
    name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل").optional(),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").optional(),
    role: z.enum([Roles.ADMIN, Roles.REPRESENTATIVE]).optional(),
    regionId: z.coerce.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (data.role === Roles.REPRESENTATIVE && (data.regionId === undefined || data.regionId === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "تحديد المنطقة للمندوب إجباري",
        path: ["regionId"]
      });
    }
  });

const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z
    .coerce.number()
    .int()
    .min(1)
    .default(20)
    .transform((value) => Math.min(value, 100)),
  search: z.string().trim().optional()
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  userListQuerySchema
};

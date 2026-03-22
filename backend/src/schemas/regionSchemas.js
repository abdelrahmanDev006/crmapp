const { z } = require("zod");

const createRegionSchema = z.object({
  name: z.string().trim().min(2, "اسم المنطقة مطلوب").max(100, "اسم المنطقة طويل جدًا")
});

const updateRegionSchema = z
  .object({
    name: z.string().trim().min(2, "اسم المنطقة مطلوب").max(100, "اسم المنطقة طويل جدًا").optional()
  })
  .refine((data) => data.name !== undefined, {
    message: "لا توجد بيانات للتحديث"
  });

module.exports = {
  createRegionSchema,
  updateRegionSchema
};

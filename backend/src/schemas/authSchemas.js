const { z } = require("zod");

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة")
});

module.exports = {
  loginSchema
};

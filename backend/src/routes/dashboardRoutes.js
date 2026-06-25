const express = require("express");
const rateLimit = require("express-rate-limit");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");
const { summary, backup } = require("../controllers/dashboardController");

const router = express.Router();

const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: "عدد محاولات تنزيل النسخة الاحتياطية كبير"
});

router.use(authenticate);
router.get("/summary", summary);
router.get("/backup", backupLimiter, authorizeRoles(Roles.ADMIN), backup);

module.exports = router;

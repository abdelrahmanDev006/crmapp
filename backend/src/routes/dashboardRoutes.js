const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");
const { summary, backup } = require("../controllers/dashboardController");

const router = express.Router();

router.use(authenticate);
router.get("/summary", summary);
router.get("/backup", authorizeRoles(Roles.ADMIN), backup);

module.exports = router;

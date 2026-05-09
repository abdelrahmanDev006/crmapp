const express = require("express");
const router = express.Router();
const { getLogs } = require("../controllers/logController");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");

router.use(authenticate);
router.use(authorizeRoles(Roles.ADMIN));

router.get("/", getLogs);

module.exports = router;

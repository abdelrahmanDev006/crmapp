const express = require("express");
const { authenticate } = require("../middlewares/auth");
const { summary, backup } = require("../controllers/dashboardController");

const router = express.Router();

router.use(authenticate);
router.get("/summary", summary);
router.get("/backup", backup);

module.exports = router;

const express = require("express");
const { authenticate } = require("../middlewares/auth");
const { summary } = require("../controllers/dashboardController");

const router = express.Router();

router.use(authenticate);
router.get("/summary", summary);

module.exports = router;

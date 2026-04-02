const express = require("express");
const validate = require("../middlewares/validate");
const { loginSchema } = require("../schemas/authSchemas");
const { login, me } = require("../controllers/authController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.post("/login", validate(loginSchema), login);
router.get("/me", authenticate, me);

module.exports = router;

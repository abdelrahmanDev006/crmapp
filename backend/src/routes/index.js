const express = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const clientRoutes = require("./clientRoutes");
const regionRoutes = require("./regionRoutes");
const dashboardRoutes = require("./dashboardRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/clients", clientRoutes);
router.use("/regions", regionRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;

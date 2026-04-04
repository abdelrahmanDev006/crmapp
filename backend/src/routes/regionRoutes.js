const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");
const validate = require("../middlewares/validate");
const { idParamSchema } = require("../schemas/commonSchemas");
const { bulkRegionHandleSchema } = require("../schemas/clientSchemas");
const { createRegionSchema, updateRegionSchema } = require("../schemas/regionSchemas");
const { listRegions, getRegionDetails, handleWholeRegion, createRegion, updateRegion, deleteRegion } = require("../controllers/regionController");

const router = express.Router();

router.use(authenticate);

router.get("/", listRegions);
router.post("/", authorizeRoles(Roles.ADMIN), validate(createRegionSchema), createRegion);
router.get("/:id", validate(idParamSchema, "params"), getRegionDetails);
router.patch("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), validate(updateRegionSchema), updateRegion);
router.delete("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), deleteRegion);
router.post(
  "/:id/handle-all",
  authorizeRoles(Roles.ADMIN, Roles.REPRESENTATIVE),
  validate(idParamSchema, "params"),
  validate(bulkRegionHandleSchema),
  handleWholeRegion
);

module.exports = router;

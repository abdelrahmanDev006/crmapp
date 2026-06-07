const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");
const validate = require("../middlewares/validate");
const { idParamSchema } = require("../schemas/commonSchemas");
const {
  clientQuerySchema,
  regionPageClientQuerySchema,
  createClientSchema,
  updateClientSchema,
  handleClientSchema,
  toggleExceptionalSchema
} = require("../schemas/clientSchemas");
const {
  listClientRecords,
  listClientsByRegion,
  getClientDetails,
  createClient,
  updateClient,
  handleClient,
  deleteClient,
  approveVisit,
  rejectVisit,
  getOverdueSummary,
  toggleExceptional
} = require("../controllers/clientController");

const router = express.Router();

router.use(authenticate);

router.get("/overdue-summary", authorizeRoles(Roles.ADMIN), getOverdueSummary);
router.get("/by-region", validate(regionPageClientQuerySchema, "query"), listClientsByRegion);
router.get("/", validate(clientQuerySchema, "query"), listClientRecords);
router.get("/:id", validate(idParamSchema, "params"), getClientDetails);
router.post("/:id/handle", validate(idParamSchema, "params"), validate(handleClientSchema), handleClient);
router.post("/:id/approve", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), approveVisit);
router.post("/:id/reject", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), rejectVisit);
router.post("/", authorizeRoles(Roles.ADMIN), validate(createClientSchema), createClient);
router.patch("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), validate(updateClientSchema), updateClient);
router.delete("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), deleteClient);
router.put("/:id/exceptional", validate(idParamSchema, "params"), validate(toggleExceptionalSchema), toggleExceptional);

module.exports = router;

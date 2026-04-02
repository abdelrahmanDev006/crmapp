const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");
const validate = require("../middlewares/validate");
const { idParamSchema } = require("../schemas/commonSchemas");
const {
  clientQuerySchema,
  createClientSchema,
  updateClientSchema,
  handleClientSchema
} = require("../schemas/clientSchemas");
const {
  listClientRecords,
  getClientDetails,
  createClient,
  updateClient,
  handleClient,
  deleteClient
} = require("../controllers/clientController");

const router = express.Router();

router.use(authenticate);

router.get("/", validate(clientQuerySchema, "query"), listClientRecords);
router.get("/:id", validate(idParamSchema, "params"), getClientDetails);
router.post("/:id/handle", validate(idParamSchema, "params"), validate(handleClientSchema), handleClient);
router.post("/", authorizeRoles(Roles.ADMIN), validate(createClientSchema), createClient);
router.patch("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), validate(updateClientSchema), updateClient);
router.delete("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), deleteClient);

module.exports = router;

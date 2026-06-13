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
  toggleExceptionalSchema,
  bulkEditClientSchema
} = require("../schemas/clientSchemas");
const {
  listClientRecords,
  listClientsByRegion,
  getClientDetails,
  createClient,
  updateClient,
  handleClient,
  deleteClient,
  getOverdueSummary,
  toggleExceptional,
  bulkEdit
} = require("../controllers/clientController");

const router = express.Router();

// TEMP
const { PrismaClient } = require("@prisma/client");
const prismaTemp = new PrismaClient();
router.get("/migrate-notes", async (req, res) => {
  const clients = await prismaTemp.client.findMany({
    include: {
      visits: {
        where: { note: { not: null, notIn: [''] } },
        orderBy: { visitDate: 'asc' },
        take: 1
      }
    }
  });
  let count = 0;
  for (const c of clients) {
    if (c.visits.length > 0 && c.visits[0].note) {
      await prismaTemp.client.update({
        where: { id: c.id },
        data: { note: c.visits[0].note }
      });
      count++;
    }
  }
  res.json({ message: `Migrated ${count} notes successfully.` });
});

router.use(authenticate);

router.get("/overdue-summary", authorizeRoles(Roles.ADMIN), getOverdueSummary);
router.get("/by-region", validate(regionPageClientQuerySchema, "query"), listClientsByRegion);
router.get("/", validate(clientQuerySchema, "query"), listClientRecords);
router.put("/bulk-edit", validate(bulkEditClientSchema), bulkEdit);
router.get("/:id", validate(idParamSchema, "params"), getClientDetails);
router.post("/:id/handle", validate(idParamSchema, "params"), validate(handleClientSchema), handleClient);

router.post("/", authorizeRoles(Roles.ADMIN), validate(createClientSchema), createClient);
router.patch("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), validate(updateClientSchema), updateClient);
router.delete("/:id", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), deleteClient);
router.put("/:id/exceptional", authorizeRoles(Roles.ADMIN), validate(idParamSchema, "params"), validate(toggleExceptionalSchema), toggleExceptional);

module.exports = router;

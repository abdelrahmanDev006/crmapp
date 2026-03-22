const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth");
const { Roles } = require("../constants/enums");
const validate = require("../middlewares/validate");
const { idParamSchema } = require("../schemas/commonSchemas");
const { userListQuerySchema, createUserSchema, updateUserSchema } = require("../schemas/userSchemas");
const { listUsers, createUser, updateUser, deleteUser } = require("../controllers/userController");

const router = express.Router();

router.use(authenticate, authorizeRoles(Roles.ADMIN));

router.get("/", validate(userListQuerySchema, "query"), listUsers);
router.post("/", validate(createUserSchema), createUser);
router.patch("/:id", validate(idParamSchema, "params"), validate(updateUserSchema), updateUser);
router.delete("/:id", validate(idParamSchema, "params"), deleteUser);

module.exports = router;

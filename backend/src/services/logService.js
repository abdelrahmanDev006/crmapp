const prisma = require("../config/prisma");

async function logActivity({ userId, action, entityType, entityId = null, entityName = null, details = null }) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: Number(userId),
        action,
        entityType,
        entityId: entityId ? Number(entityId) : null,
        entityName,
        details
      }
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

module.exports = {
  logActivity
};

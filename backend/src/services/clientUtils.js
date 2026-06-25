const { Prisma } = require("@prisma/client");
const { Roles, ClientStatuses } = require("../constants/enums");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");

function normalizeRepresentativeAction(value) {
  const action = String(value || "").trim().toUpperCase();
  const allowedActions = new Set([
    "PENDING",
    ClientStatuses.ACTIVE,
    ClientStatuses.NO_ANSWER,
    ClientStatuses.REJECTED
  ]);

  return allowedActions.has(action) ? action : null;
}

function toSqlTimestamp(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid SQL timestamp value");
  }

  return date.toISOString().replace("T", " ").replace("Z", "");
}

function sqlTimestamp(dateValue) {
  return Prisma.sql`${toSqlTimestamp(dateValue)}::timestamp`;
}

function canUserAccessRegion(user, regionId) {
  if (user.role === Roles.ADMIN) {
    return true;
  }

  return user.regions?.some((region) => Number(region.id) === Number(regionId)) || false;
}

function getWorkDateRange(dateValue) {
  const start = normalizeToWorkDate(dateValue);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function isWithinDateRange(value, range) {
  const normalized = normalizeToWorkDate(value);
  return normalized >= range.start && normalized < range.end;
}

function enforceClientScope(user, client) {
  if (!client) {
    throw createHttpError(404, "العميل غير موجود");
  }

  if (user.role === Roles.REPRESENTATIVE && (!user.regions || !user.regions.some(r => Number(r.id) === Number(client.regionId)))) {
    throw createHttpError(403, "لا يمكنك الوصول لهذا العميل");
  }
}

function enforceRepresentativeClientAction(user, client) {
  if (user.role !== Roles.REPRESENTATIVE) {
    return;
  }

  if (!user.allowedDate) {
    throw createHttpError(403, "لم يتم تحديد يوم عمل لهذا المندوب");
  }

  const allowedRange = getWorkDateRange(user.allowedDate);

  if (!isWithinDateRange(client.nextVisitDate, allowedRange)) {
    throw createHttpError(403, "لا يمكنك تسجيل زيارة لهذا العميل خارج يوم العمل المحدد");
  }
}

module.exports = {
  normalizeRepresentativeAction,
  toSqlTimestamp,
  sqlTimestamp,
  canUserAccessRegion,
  getWorkDateRange,
  isWithinDateRange,
  enforceClientScope,
  enforceRepresentativeClientAction
};

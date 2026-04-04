const prisma = require("../config/prisma");
const env = require("../config/env");
const { Roles } = require("../constants/enums");
const { verifyToken } = require("../utils/jwt");
const { createHttpError } = require("../utils/httpError");

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.[env.authCookieName];

  const headerToken =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : null;
  const token = headerToken || cookieToken;

  if (!token) {
    return next(createHttpError(401, "غير مصرح بالدخول"));
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      include: { region: true }
    });

    if (!user || !user.isActive) {
      return next(createHttpError(401, "المستخدم غير صالح أو غير نشط"));
    }

    req.user = user;
    return next();
  } catch {
    return next(createHttpError(401, "رمز الدخول غير صالح"));
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(createHttpError(401, "غير مصرح بالدخول"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(createHttpError(403, "ليس لديك صلاحية لتنفيذ هذا الإجراء"));
    }

    return next();
  };
}

function canAccessRegion(user, regionId) {
  if (!regionId) {
    return true;
  }

  if (user.role === Roles.ADMIN) {
    return true;
  }

  return Number(user.regionId) === Number(regionId);
}

function enforceRegionAccess(user, regionId) {
  if (!canAccessRegion(user, regionId)) {
    throw createHttpError(403, "لا يمكنك الوصول إلى هذه المنطقة");
  }
}

module.exports = {
  authenticate,
  authorizeRoles,
  canAccessRegion,
  enforceRegionAccess
};

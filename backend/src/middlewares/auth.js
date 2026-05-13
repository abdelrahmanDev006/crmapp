const prisma = require("../config/prisma");
const env = require("../config/env");
const { Roles } = require("../constants/enums");
const { verifyToken } = require("../utils/jwt");
const { createHttpError } = require("../utils/httpError");

// --- In-Memory User Cache ---
// يخزن بيانات المستخدم في الذاكرة لمدة دقيقتين لتجنب query لقاعدة البيانات في كل طلب
const userCache = new Map();
const USER_CACHE_TTL_MS = 2 * 60 * 1000; // دقيقتان

// تنظيف الذاكرة المؤقتة كل 5 دقائق لمنع تسريب الذاكرة (Memory Leak)
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of userCache.entries()) {
    if (now > entry.expiresAt) {
      userCache.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref();

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

function invalidateUserCache(userId) {
  userCache.delete(Number(userId));
}
// --- End Cache ---

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
    const userId = Number(payload.sub);

    // جرّب الـ Cache أولاً
    let user = getCachedUser(userId);

    if (!user) {
      // اذهب لقاعدة البيانات فقط إذا لم يكن موجوداً في الـ Cache
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: { regions: true }
      });
      if (user?.isActive) {
        setCachedUser(userId, user);
      }
    }

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

  const userRegionIds = user.regions?.map(r => Number(r.id)) || [];
  return userRegionIds.includes(Number(regionId));
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
  enforceRegionAccess,
  invalidateUserCache
};

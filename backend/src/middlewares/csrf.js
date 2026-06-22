const env = require("../config/env");
const { createHttpError } = require("../utils/httpError");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function tryExtractOrigin(headers) {
  const origin = headers["origin"];

  if (origin) return origin;

  const referer = headers["referer"];

  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const source = tryExtractOrigin(req.headers);

  if (!source) {
    if (req.cookies?.[env.authCookieName]) {
      return next(createHttpError(403, "طلب غير مصرح به: مصدر الطلب غير معروف"));
    }

    return next();
  }

  const isAllowed = env.allowedOrigins.some((allowed) => {
    if (source === allowed) return true;
    if (allowed.endsWith("/*") && source.startsWith(allowed.slice(0, -2))) return true;
    return false;
  });

  if (!isAllowed) {
    return next(createHttpError(403, "طلب غير مصرح به: مصدر الطلب غير معروف"));
  }

  return next();
}

module.exports = csrfProtection;

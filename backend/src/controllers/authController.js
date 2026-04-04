const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const env = require("../config/env");
const asyncHandler = require("../middlewares/asyncHandler");
const { generateToken } = require("../utils/jwt");
const { createHttpError } = require("../utils/httpError");

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    regionId: user.regionId,
    region: user.region
      ? {
          id: user.region.id,
          code: user.region.code,
          name: user.region.name
        }
      : null
  };
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: "/",
    maxAge: env.authCookieMaxAgeHours * 60 * 60 * 1000
  };
}

const login = asyncHandler(async (req, res) => {
  const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
  const { password } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive"
      }
    },
    include: { region: true }
  });

  if (!user || !user.isActive) {
    throw createHttpError(401, "بيانات الدخول غير صحيحة");
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    throw createHttpError(401, "بيانات الدخول غير صحيحة");
  }

  const token = generateToken(user);
  res.cookie(env.authCookieName, token, getAuthCookieOptions());

  res.json({
    message: "تم تسجيل الدخول بنجاح",
    user: sanitizeUser(user)
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(env.authCookieName, {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: "/"
  });

  res.json({
    message: "تم تسجيل الخروج بنجاح"
  });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    user: sanitizeUser(req.user)
  });
});

module.exports = {
  login,
  logout,
  me,
  sanitizeUser
};

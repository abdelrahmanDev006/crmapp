const path = require("path");
const dotenv = require("dotenv");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const requiredVariables = ["DATABASE_URL", "JWT_SECRET"];

for (const key of requiredVariables) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseCookieSameSite(value, fallback = "lax") {
  const normalized = String(value || fallback).trim().toLowerCase();
  const allowed = new Set(["lax", "strict", "none"]);

  return allowed.has(normalized) ? normalized : fallback;
}

function parseTimeZone(value, fallback) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return fallback;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return fallback;
  }
}

function isWeakJwtSecret(secret) {
  const normalized = String(secret || "").toLowerCase().trim();
  const weakPatterns = [
    "change-me",
    "change_me",
    "replace_with",
    "strong_characters",
    "super-secret",
    "jwt_secret",
    "123456",
    "password"
  ];

  if (normalized.length < 32) {
    return true;
  }

  return weakPatterns.some((pattern) => normalized.includes(pattern));
}

const defaultAllowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const resolvedOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultAllowedOrigins;
const authCookieName = String(process.env.AUTH_COOKIE_NAME || "crm_access_token").trim() || "crm_access_token";
const authCookieSameSite = parseCookieSameSite(process.env.AUTH_COOKIE_SAME_SITE, "lax");
const authCookieSecure = parseBoolean(process.env.AUTH_COOKIE_SECURE, isProduction);
const authCookieMaxAgeHours = Math.max(1, parseNumber(process.env.AUTH_COOKIE_MAX_AGE_HOURS, 24));
const workTimezone = parseTimeZone(process.env.WORK_TIMEZONE, "Africa/Cairo");

if (isProduction) {
  if (isWeakJwtSecret(process.env.JWT_SECRET)) {
    throw new Error("JWT_SECRET is too weak for production. Use at least 32 strong characters.");
  }

  if (resolvedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS must include at least one production frontend origin.");
  }

  const invalidProductionOrigins = resolvedOrigins.filter((origin) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  );

  if (invalidProductionOrigins.length > 0) {
    throw new Error("ALLOWED_ORIGINS contains localhost/127.0.0.1 in production.");
  }

  if (!authCookieSecure) {
    throw new Error("AUTH_COOKIE_SECURE must be true in production.");
  }

  if (authCookieSameSite === "none" && !authCookieSecure) {
    throw new Error("AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.");
  }
}

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  rejectedRetryDays: Math.max(1, Number(process.env.REJECTED_RETRY_DAYS || 28)),
  corsCredentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
  allowedOrigins: resolvedOrigins,
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
  authRateLimitWindowMinutes: Math.max(1, parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15)),
  authRateLimitMax: Math.max(1, parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 100)),
  authCookieName,
  authCookieSameSite,
  authCookieSecure,
  authCookieMaxAgeHours,
  workTimezone
};

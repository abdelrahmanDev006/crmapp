const path = require("path");
const dotenv = require("dotenv");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

const env = require("../src/config/env");

const issues = [];

function isLikelyPlaceholder(value) {
  const normalized = String(value || "").toLowerCase().trim();
  const placeholders = [
    "change-me",
    "example",
    "your-",
    "placeholder",
    "super-secret",
    "admin@crm.local"
  ];

  return placeholders.some((placeholder) => normalized.includes(placeholder));
}

function parseBoolean(value, fallback = false) {
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

if (!env.isProduction) {
  issues.push("NODE_ENV must be set to production.");
}

if (env.allowedOrigins.length === 0) {
  issues.push("ALLOWED_ORIGINS must contain at least one frontend domain.");
}

for (const origin of env.allowedOrigins) {
  if (!origin.startsWith("https://")) {
    issues.push(`ALLOWED_ORIGINS should use HTTPS in production: ${origin}`);
  }
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  issues.push("JWT_SECRET must be at least 32 characters.");
}

if (isLikelyPlaceholder(process.env.JWT_SECRET)) {
  issues.push("JWT_SECRET appears to be placeholder/default.");
}

const databaseUrl = process.env.DATABASE_URL || "";
if (isLikelyPlaceholder(databaseUrl) || databaseUrl.includes("postgres:postgres@")) {
  issues.push("DATABASE_URL appears to contain default credentials.");
}

const directUrl = process.env.DIRECT_URL || "";
if (directUrl && isLikelyPlaceholder(directUrl)) {
  issues.push("DIRECT_URL appears to be placeholder/default.");
}

const usesSupabase = databaseUrl.includes(".supabase.co");
if (usesSupabase) {
  if (!directUrl) {
    issues.push("DIRECT_URL is required when using Supabase with Prisma migrations.");
  }

  if (!databaseUrl.includes("sslmode=require")) {
    issues.push("DATABASE_URL should include sslmode=require when using Supabase.");
  }

  if (directUrl && !directUrl.includes("sslmode=require")) {
    issues.push("DIRECT_URL should include sslmode=require when using Supabase.");
  }
}

if (process.env.SEED_ADMIN_PASSWORD === "Admin@123") {
  issues.push("SEED_ADMIN_PASSWORD is set to development default.");
}

if (process.env.SEED_REP_DEFAULT_PASSWORD === "Rep@1234") {
  issues.push("SEED_REP_DEFAULT_PASSWORD is set to development default.");
}

const whatsappEnabled = parseBoolean(process.env.WHATSAPP_CLOUD_ENABLED, false);
if (whatsappEnabled) {
  if (!process.env.WHATSAPP_CLOUD_ACCESS_TOKEN) {
    issues.push("WHATSAPP_CLOUD_ACCESS_TOKEN is required when WHATSAPP_CLOUD_ENABLED=true.");
  } else if (isLikelyPlaceholder(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN)) {
    issues.push("WHATSAPP_CLOUD_ACCESS_TOKEN appears to be placeholder/default.");
  }

  if (!process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID) {
    issues.push("WHATSAPP_CLOUD_PHONE_NUMBER_ID is required when WHATSAPP_CLOUD_ENABLED=true.");
  }
}

if (issues.length > 0) {
  console.error("[PRODUCTION ENV CHECK] FAILED");
  for (let index = 0; index < issues.length; index += 1) {
    console.error(`- ${issues[index]}`);
  }
  process.exit(1);
}

console.log("[PRODUCTION ENV CHECK] PASSED");
console.log(`- ENV_FILE=${envFile}`);
console.log(`- NODE_ENV=${env.nodeEnv}`);
console.log(`- ALLOWED_ORIGINS=${env.allowedOrigins.join(",")}`);
console.log(`- AUTH_RATE_LIMIT=${env.authRateLimitMax}/${env.authRateLimitWindowMinutes}min`);

/**
 * Autonomous Code Review — Unit & Logic Tests
 * Sandboxed: No production DB connection. Uses mocks.
 * Run: node tests/unit-review.test.js
 */

// ── Prevent any real DB connection ──
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mockdb";
process.env.JWT_SECRET   = "test_secret_key_for_review_00000000000000";
process.env.NODE_ENV     = "development";
process.env.WORK_TIMEZONE = "Africa/Cairo";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";

// ── Test Utilities ──
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  ❌ ${label}`);
  }
}

function section(name) {
  console.log(`\n${"═".repeat(60)}\n  📦 ${name}\n${"═".repeat(60)}`);
}

// ══════════════════════════════════════════════════════════════
//  1. Date Utilities (dateUtils.js)
// ══════════════════════════════════════════════════════════════
section("Date Utilities — dateUtils.js");

const {
  normalizeToWorkDate,
  addWorkDaysWith28DayMonth,
  getCurrentWorkWeekStart,
  calculateNextVisitDate
} = require("../src/utils/dateUtils");

// 1a. normalizeToWorkDate — should strip time
const d1 = normalizeToWorkDate(new Date("2026-06-08T15:30:00Z"));
assert(d1 instanceof Date, "normalizeToWorkDate returns Date");
assert(d1.getUTCHours() === 21 || d1.getUTCHours() === 0 || d1.getUTCMinutes() === 0,
  "normalizeToWorkDate strips sub-day time components (timezone-adjusted)");

// 1b. normalizeToWorkDate — invalid input should throw
try {
  normalizeToWorkDate("not-a-date");
  assert(false, "normalizeToWorkDate throws on invalid input");
} catch {
  assert(true, "normalizeToWorkDate throws on invalid input");
}

// 1c. addWorkDaysWith28DayMonth
const base = normalizeToWorkDate(new Date("2026-06-01"));
const plus7 = addWorkDaysWith28DayMonth(base, 7);
const diff7 = Math.round((plus7 - base) / (1000 * 60 * 60 * 24));
assert(diff7 === 7, `addWorkDaysWith28DayMonth(+7) = ${diff7} days`);

const plus28 = addWorkDaysWith28DayMonth(base, 28);
const diff28 = Math.round((plus28 - base) / (1000 * 60 * 60 * 24));
assert(diff28 === 28, `addWorkDaysWith28DayMonth(+28) = ${diff28} days`);

// 1d. addWorkDaysWith28DayMonth — NaN days fallback
const plusNaN = addWorkDaysWith28DayMonth(base, "abc");
const diffNaN = Math.round((plusNaN - base) / (1000 * 60 * 60 * 24));
assert(diffNaN === 0, `addWorkDaysWith28DayMonth(NaN) falls back to 0 days (got ${diffNaN})`);

// 1e. calculateNextVisitDate — WEEKLY
const weekly = calculateNextVisitDate(base, "WEEKLY");
const weeklyDiff = Math.round((weekly - base) / (1000 * 60 * 60 * 24));
assert(weeklyDiff === 7, `calculateNextVisitDate(WEEKLY) = ${weeklyDiff} days`);

// 1f. calculateNextVisitDate — MONTHLY (28 days)
const monthly = calculateNextVisitDate(base, "MONTHLY");
const monthlyDiff = Math.round((monthly - base) / (1000 * 60 * 60 * 24));
assert(monthlyDiff === 28, `calculateNextVisitDate(MONTHLY) = ${monthlyDiff} days`);

// 1g. calculateNextVisitDate — unsupported type should throw
try {
  calculateNextVisitDate(base, "UNKNOWN_TYPE");
  assert(false, "calculateNextVisitDate throws on unsupported type");
} catch {
  assert(true, "calculateNextVisitDate throws on unsupported type");
}

// 1h. getCurrentWorkWeekStart
const weekStart = getCurrentWorkWeekStart(new Date("2026-06-08T12:00:00Z")); // Monday
assert(weekStart instanceof Date, "getCurrentWorkWeekStart returns Date");
assert(weekStart <= new Date("2026-06-08T23:59:59Z"), "getCurrentWorkWeekStart <= input date");

// ══════════════════════════════════════════════════════════════
//  2. Enums & Constants
// ══════════════════════════════════════════════════════════════
section("Enums & Constants — enums.js");

const { Roles, VisitTypes, ClientStatuses, VisitIntervalDays } = require("../src/constants/enums");

assert(Roles.ADMIN === "ADMIN", "Roles.ADMIN");
assert(Roles.REPRESENTATIVE === "REPRESENTATIVE", "Roles.REPRESENTATIVE");
assert(VisitTypes.ONE_TIME === "ONE_TIME", "VisitTypes.ONE_TIME");
assert(ClientStatuses.PENDING_APPROVAL === "PENDING_APPROVAL", "ClientStatuses.PENDING_APPROVAL");
assert(VisitIntervalDays.WEEKLY === 7, "VisitIntervalDays.WEEKLY = 7");
assert(VisitIntervalDays.BIWEEKLY === 14, "VisitIntervalDays.BIWEEKLY = 14");
assert(VisitIntervalDays.MONTHLY === 28, "VisitIntervalDays.MONTHLY = 28");
assert(VisitIntervalDays.ONE_TIME === 0, "VisitIntervalDays.ONE_TIME = 0");

// ══════════════════════════════════════════════════════════════
//  3. HttpError Utility
// ══════════════════════════════════════════════════════════════
section("HTTP Error — httpError.js");

const { HttpError, createHttpError } = require("../src/utils/httpError");

const err = createHttpError(404, "Not Found");
assert(err instanceof HttpError, "createHttpError returns HttpError");
assert(err instanceof Error, "HttpError extends Error");
assert(err.statusCode === 404, "HttpError has correct statusCode");
assert(err.message === "Not Found", "HttpError has correct message");

// ══════════════════════════════════════════════════════════════
//  4. JWT Utility
// ══════════════════════════════════════════════════════════════
section("JWT — jwt.js");

const { generateToken, verifyToken } = require("../src/utils/jwt");

const fakeUser = { id: 42, role: "ADMIN", regionId: 1 };
const token = generateToken(fakeUser);
assert(typeof token === "string" && token.length > 20, "generateToken returns string token");

const decoded = verifyToken(token);
assert(decoded.sub === 42, "verifyToken decodes sub correctly");
assert(decoded.role === "ADMIN", "verifyToken decodes role correctly");

// Invalid token should throw
try {
  verifyToken("invalid.token.here");
  assert(false, "verifyToken throws on invalid token");
} catch {
  assert(true, "verifyToken throws on invalid token");
}

// ══════════════════════════════════════════════════════════════
//  5. Zod Schemas (clientSchemas.js)
// ══════════════════════════════════════════════════════════════
section("Validation Schemas — clientSchemas.js");

const {
  createClientSchema,
  handleClientSchema,
  toggleExceptionalSchema,
  clientQuerySchema
} = require("../src/schemas/clientSchemas");

// 5a. Valid create payload
const validCreate = createClientSchema.safeParse({
  name: "عميل تجريبي",
  phone: "01012345678",
  address: "شارع التحرير",
  regionId: 1,
  products: "منتج أ",
  visitType: "WEEKLY"
});
assert(validCreate.success, "createClientSchema accepts valid payload");

// 5b. Invalid create — missing name
const invalidCreate = createClientSchema.safeParse({
  phone: "01012345678",
  address: "شارع",
  regionId: 1,
  products: "x",
  visitType: "WEEKLY"
});
assert(!invalidCreate.success, "createClientSchema rejects missing name");

// 5c. CUSTOM without days
const customNoDays = createClientSchema.safeParse({
  name: "عميل",
  phone: "01012345678",
  address: "شارع التحرير",
  regionId: 1,
  products: "منتج",
  visitType: "CUSTOM"
  // customVisitIntervalDays missing
});
assert(!customNoDays.success, "createClientSchema rejects CUSTOM without days");

// 5d. handleClientSchema valid
const validHandle = handleClientSchema.safeParse({
  outcome: "ACTIVE",
  note: "تم التعامل"
});
assert(validHandle.success, "handleClientSchema accepts valid outcome");

// 5e. handleClientSchema — invalid outcome
const invalidHandle = handleClientSchema.safeParse({ outcome: "UNKNOWN" });
assert(!invalidHandle.success, "handleClientSchema rejects invalid outcome");

// 5f. toggleExceptionalSchema
const validToggle = toggleExceptionalSchema.safeParse({
  isExceptional: true,
  exceptionalReason: "شكوى منتج",
  exceptionalNextVisitDate: "2026-06-15"
});
assert(validToggle.success, "toggleExceptionalSchema accepts valid payload");

const invalidToggle = toggleExceptionalSchema.safeParse({});
assert(!invalidToggle.success, "toggleExceptionalSchema rejects empty payload");

// 5g. clientQuerySchema — pageSize capped at 1000
const bigPage = clientQuerySchema.safeParse({ pageSize: 9999 });
assert(bigPage.success && bigPage.data.pageSize === 1000, 
  `clientQuerySchema caps pageSize to 1000 (got ${bigPage.data?.pageSize})`);

// ══════════════════════════════════════════════════════════════
//  6. resolveNextVisitDate (extracted logic test)
// ══════════════════════════════════════════════════════════════
section("Business Logic — resolveNextVisitDate (via clientService.js re-import)");

// We can't import the full service (Prisma dependency), but we can test
// the pure logic by re-creating it with the same deps
function resolveNextVisitDate({
  currentDate,
  visitType,
  customVisitIntervalDays,
  outcome,
  advanceDays,
  referenceDate
}) {
  if (visitType === VisitTypes.ONE_TIME) {
    return new Date("2099-12-31T23:59:59.999Z");
  }
  if (outcome === ClientStatuses.REJECTED) {
    return referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(new Date());
  }
  if (outcome === ClientStatuses.NO_ANSWER) {
    const noAnswerBaseDate = currentDate
      ? normalizeToWorkDate(currentDate)
      : referenceDate
        ? normalizeToWorkDate(referenceDate)
        : normalizeToWorkDate(new Date());
    const noAnswerRetryDate = addWorkDaysWith28DayMonth(noAnswerBaseDate, 7);
    return normalizeToWorkDate(noAnswerRetryDate);
  }
  if (Number.isFinite(Number(advanceDays)) && Number(advanceDays) > 0) {
    const baseDate = referenceDate ? normalizeToWorkDate(referenceDate) : normalizeToWorkDate(new Date());
    const advancedDate = addWorkDaysWith28DayMonth(baseDate, Number(advanceDays));
    return normalizeToWorkDate(advancedDate);
  }
  const nextVisitBaseDate = currentDate ? normalizeToWorkDate(currentDate) : normalizeToWorkDate(new Date());
  if (visitType === VisitTypes.CUSTOM) {
    if (!customVisitIntervalDays) throw new Error("Missing custom days");
    return normalizeToWorkDate(addWorkDaysWith28DayMonth(nextVisitBaseDate, customVisitIntervalDays));
  }
  const calculatedNextVisitDate = calculateNextVisitDate(nextVisitBaseDate, visitType);
  return normalizeToWorkDate(calculatedNextVisitDate);
}

// 6a. ONE_TIME is moved far into the future because nextVisitDate is required.
const oneTimeActive = resolveNextVisitDate({
  currentDate: new Date(), visitType: "ONE_TIME", outcome: "ACTIVE"
});
assert(oneTimeActive.getUTCFullYear() === 2099, "ONE_TIME + ACTIVE = far future date (archived)");

// 6b. ONE_TIME is archived consistently — REJECTED
const oneTimeRejected = resolveNextVisitDate({
  currentDate: new Date(), visitType: "ONE_TIME", outcome: "REJECTED"
});
assert(oneTimeRejected.getUTCFullYear() === 2099, "ONE_TIME + REJECTED = far future date (archived)");

// 6c. ONE_TIME is archived consistently — NO_ANSWER
const oneTimeNoAnswer = resolveNextVisitDate({
  currentDate: new Date(), visitType: "ONE_TIME", outcome: "NO_ANSWER"
});
assert(oneTimeNoAnswer.getUTCFullYear() === 2099, "ONE_TIME + NO_ANSWER = far future date (archived)");

// 6d. WEEKLY + ACTIVE → +7 days
const weeklyActive = resolveNextVisitDate({
  currentDate: base, visitType: "WEEKLY", outcome: "ACTIVE"
});
const weeklyActiveDiff = Math.round((weeklyActive - base) / (1000 * 60 * 60 * 24));
assert(weeklyActiveDiff === 7, `WEEKLY + ACTIVE = +${weeklyActiveDiff} days`);

// 6e. NO_ANSWER → +7 from current date
const noAnswerDate = resolveNextVisitDate({
  currentDate: base, visitType: "MONTHLY", outcome: "NO_ANSWER"
});
const noAnswerDiff = Math.round((noAnswerDate - base) / (1000 * 60 * 60 * 24));
assert(noAnswerDiff === 7, `NO_ANSWER retry = +${noAnswerDiff} days`);

// 6f. CUSTOM
const customResult = resolveNextVisitDate({
  currentDate: base, visitType: "CUSTOM", customVisitIntervalDays: 10, outcome: "ACTIVE"
});
const customDiff = Math.round((customResult - base) / (1000 * 60 * 60 * 24));
assert(customDiff === 10, `CUSTOM(10) = +${customDiff} days`);

// 6g. advanceDays overrides normal scheduling
const advResult = resolveNextVisitDate({
  currentDate: base, visitType: "WEEKLY", outcome: "ACTIVE", advanceDays: 14
});
assert(advResult !== null, "advanceDays returns non-null date");

// ══════════════════════════════════════════════════════════════
//  7. Env Config Safety
// ══════════════════════════════════════════════════════════════
section("Env Config — env.js");

const env = require("../src/config/env");

assert(env.nodeEnv === "development", "nodeEnv = development");
assert(!env.isProduction, "isProduction = false");
assert(env.workTimezone === "Africa/Cairo", "workTimezone = Africa/Cairo");
assert(env.authCookieName === "crm_access_token", "default cookie name");
assert(env.authRateLimitMax >= 1, "rate limit max >= 1");
assert(env.rejectedRetryDays >= 1, "rejectedRetryDays >= 1");

// ══════════════════════════════════════════════════════════════
//  8. Controller normalizers (clientController.js)
// ══════════════════════════════════════════════════════════════
section("Controller Normalizers (inline tests)");

function normalizeClientName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePhoneForComparison(value) {
  return String(value || "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D+/g, "");
}

assert(normalizeClientName("  أحمد   محمد  ") === "أحمد محمد", "normalizeClientName collapses spaces");
assert(normalizeClientName("") === "", "normalizeClientName handles empty");
assert(normalizeClientName(null) === "", "normalizeClientName handles null");

assert(normalizePhoneForComparison("٠١٠١٢٣٤٥٦٧٨") === "01012345678", "normalizePhone converts Arabic numerals");
assert(normalizePhoneForComparison("+20-101-234-5678") === "201012345678", "normalizePhone strips non-digits");
assert(normalizePhoneForComparison("") === "", "normalizePhone handles empty");

// ══════════════════════════════════════════════════════════════
//  9. Security Checks
// ══════════════════════════════════════════════════════════════
section("Security Audit");

// 9a. Production weak JWT check
function isWeakJwtSecret(secret) {
  const normalized = String(secret || "").toLowerCase().trim();
  const weakPatterns = ["change-me","change_me","replace_with","strong_characters","super-secret","jwt_secret","123456","password"];
  if (normalized.length < 32) return true;
  return weakPatterns.some((pattern) => normalized.includes(pattern));
}

assert(isWeakJwtSecret("short"), "isWeakJwtSecret detects short secrets");
assert(isWeakJwtSecret("supersecret1234567890supersecret1234567890"), "isWeakJwtSecret detects 'super-secret' pattern");
assert(!isWeakJwtSecret("a_very_long_unique_random_key_that_is_safe!!"), "isWeakJwtSecret accepts strong secrets");

// 9b. Check that the dev .env JWT_SECRET would be flagged in production
const fs = require("fs");
const envContent = fs.readFileSync(require("path").join(__dirname, "../.env"), "utf8");
const jwtLine = envContent.match(/JWT_SECRET="?([^"\r\n]+)"?/);
if (jwtLine) {
  assert(isWeakJwtSecret(jwtLine[1]), 
    `⚠️ Dev JWT_SECRET ("${jwtLine[1].slice(0,20)}...") is weak — MUST be changed for production`);
}

// ══════════════════════════════════════════════════════════════
//  SUMMARY
// ══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`  📊 RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}`);

if (failures.length > 0) {
  console.log("\n  ❌ Failed tests:");
  failures.forEach(f => console.log(`    - ${f}`));
}

process.exit(failed > 0 ? 1 : 0);

const { VisitIntervalDays, VisitTypes } = require("../constants/enums");

function toStartOfUtcDay(input = new Date()) {
  const date = new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function incrementMonth(year, month) {
  const nextMonth = month + 1;
  if (nextMonth > 11) {
    return { year: year + 1, month: 0 };
  }

  return { year, month: nextMonth };
}

function safeUtcDate(year, month, day) {
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const finalDay = Math.max(1, Math.min(day, maxDay));
  return new Date(Date.UTC(year, month, finalDay));
}

function normalizeToWorkDate(input = new Date()) {
  const date = toStartOfUtcDay(input);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  // Business rule: company month is fixed to 28 working days.
  const day = Math.min(date.getUTCDate(), 28);
  return safeUtcDate(year, month, day);
}

function addWorkDaysWith28DayMonth(input, daysToAdd) {
  const date = normalizeToWorkDate(input);
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth();
  let day = date.getUTCDate() + daysToAdd;

  // Instead of real month length, rollover happens every 28 work days.
  while (day > 28) {
    day -= 28;
    const next = incrementMonth(year, month);
    year = next.year;
    month = next.month;
  }

  return safeUtcDate(year, month, day);
}

function calculateNextVisitDate(currentDate, visitType) {
  const interval = VisitIntervalDays[visitType];
  if (!interval) {
    throw new Error(`Unsupported visit type: ${visitType}`);
  }

  return addWorkDaysWith28DayMonth(currentDate, interval);
}

function isDue(date, referenceDate = new Date()) {
  const current = normalizeToWorkDate(referenceDate);
  const check = normalizeToWorkDate(date);
  return check.getTime() <= current.getTime();
}

function toIsoDate(input) {
  return normalizeToWorkDate(input).toISOString();
}

module.exports = {
  toStartOfUtcDay,
  normalizeToWorkDate,
  addWorkDaysWith28DayMonth,
  calculateNextVisitDate,
  isDue,
  toIsoDate,
  VisitTypes
};

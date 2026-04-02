const { VisitIntervalDays } = require("../constants/enums");
const WORK_WEEK_DAYS = 7;
const WORK_WEEK_START_DAY = 6; // Saturday in JavaScript Date (0=Sunday ... 6=Saturday)

function toStartOfUtcDay(input = new Date()) {
  const date = new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeToWorkDate(input = new Date()) {
  return toStartOfUtcDay(input);
}

function addWorkDaysWith28DayMonth(input, daysToAdd) {
  const date = normalizeToWorkDate(input);
  const safeDaysToAdd = Number.isFinite(Number(daysToAdd)) ? Number(daysToAdd) : 0;
  const shiftedDate = new Date(date);
  // Business month is 28 days, so monthly cycle is always +28 days.
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + safeDaysToAdd);
  return normalizeToWorkDate(shiftedDate);
}

function getCurrentWorkWeekStart(input = new Date()) {
  const date = normalizeToWorkDate(input);
  const shiftToWeekStart = (date.getUTCDay() - WORK_WEEK_START_DAY + WORK_WEEK_DAYS) % WORK_WEEK_DAYS;
  return addWorkDaysWith28DayMonth(date, -shiftToWeekStart);
}

function getNextOrSameWorkWeekStart(input = new Date()) {
  const date = normalizeToWorkDate(input);
  const shiftToWeekStart = (WORK_WEEK_START_DAY - date.getUTCDay() + WORK_WEEK_DAYS) % WORK_WEEK_DAYS;
  return addWorkDaysWith28DayMonth(date, shiftToWeekStart);
}

function calculateNextVisitDate(currentDate, visitType) {
  const interval = VisitIntervalDays[visitType];
  if (!interval) {
    throw new Error(`Unsupported visit type: ${visitType}`);
  }

  return addWorkDaysWith28DayMonth(currentDate, interval);
}

module.exports = {
  toStartOfUtcDay,
  normalizeToWorkDate,
  addWorkDaysWith28DayMonth,
  getCurrentWorkWeekStart,
  getNextOrSameWorkWeekStart,
  calculateNextVisitDate
};

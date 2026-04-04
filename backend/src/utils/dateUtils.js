const { DateTime } = require("luxon");
const env = require("../config/env");
const { VisitIntervalDays } = require("../constants/enums");

const WORK_WEEK_DAYS = 7;
const WORK_WEEK_START_DAY = 6; // Saturday in JavaScript Date (0=Sunday ... 6=Saturday)

function toSafeDate(input = new Date()) {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function toWorkDateTime(input = new Date()) {
  return DateTime.fromJSDate(toSafeDate(input), { zone: env.workTimezone });
}

function toStartOfUtcDay(input = new Date()) {
  return normalizeToWorkDate(input);
}

function normalizeToWorkDate(input = new Date()) {
  return toWorkDateTime(input).startOf("day").toUTC().toJSDate();
}

function addWorkDaysWith28DayMonth(input, daysToAdd) {
  const safeDaysToAdd = Number.isFinite(Number(daysToAdd)) ? Number(daysToAdd) : 0;
  // Business month is 28 days, so monthly cycle is always +28 days.
  return toWorkDateTime(input).startOf("day").plus({ days: safeDaysToAdd }).toUTC().toJSDate();
}

function getCurrentWorkWeekStart(input = new Date()) {
  const date = toWorkDateTime(input).startOf("day");
  const dayIndex = date.weekday % WORK_WEEK_DAYS; // Convert Luxon weekday to JS day index
  const shiftToWeekStart = (dayIndex - WORK_WEEK_START_DAY + WORK_WEEK_DAYS) % WORK_WEEK_DAYS;
  return date.minus({ days: shiftToWeekStart }).toUTC().toJSDate();
}

function getNextOrSameWorkWeekStart(input = new Date()) {
  const date = toWorkDateTime(input).startOf("day");
  const dayIndex = date.weekday % WORK_WEEK_DAYS; // Convert Luxon weekday to JS day index
  const shiftToWeekStart = (WORK_WEEK_START_DAY - dayIndex + WORK_WEEK_DAYS) % WORK_WEEK_DAYS;
  return date.plus({ days: shiftToWeekStart }).toUTC().toJSDate();
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

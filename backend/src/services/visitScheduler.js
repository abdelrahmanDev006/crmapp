const { VisitTypes, ClientStatuses } = require("../constants/enums");
const {
  normalizeToWorkDate,
  calculateNextVisitDate,
  addWorkDaysWith28DayMonth
} = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");

function normalizeCustomVisitIntervalDays(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return null;
  }

  return parsed;
}

function resolveNextVisitDate({
  currentDate,
  visitType,
  customVisitIntervalDays,
  outcome,
  advanceDays,
  referenceDate
}) {
  // ONE_TIME: no next visit after ANY handling (ACTIVE, REJECTED, NO_ANSWER)
  // Since nextVisitDate is now required in the DB, we set it to a far future date 
  // so it never appears in due or overdue lists.
  if (visitType === VisitTypes.ONE_TIME) {
    return new Date("2099-12-31T23:59:59.999Z");
  }

  if (outcome === ClientStatuses.REJECTED) {
    // Keep canceled clients available for manual reactivation/offers at any time.
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
    const customIntervalDays = normalizeCustomVisitIntervalDays(customVisitIntervalDays);

    if (!customIntervalDays) {
      throw createHttpError(400, "حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
    }

    return normalizeToWorkDate(addWorkDaysWith28DayMonth(nextVisitBaseDate, customIntervalDays));
  }

  const calculatedNextVisitDate = calculateNextVisitDate(nextVisitBaseDate, visitType);
  return normalizeToWorkDate(calculatedNextVisitDate);
}

function getVisitTypeLabel(type, customVisitIntervalDays = null) {
  const labels = {
    WEEKLY: "أسبوعي",
    BIWEEKLY: "أسبوعين",
    MONTHLY: "شهري",
    CUSTOM: "ميعاد آخر",
    ONE_TIME: "بيع"
  };

  if (type === VisitTypes.CUSTOM) {
    const customIntervalDays = normalizeCustomVisitIntervalDays(customVisitIntervalDays);
    if (customIntervalDays) {
      return `ميعاد آخر (كل ${customIntervalDays} يوم)`;
    }
  }

  return labels[type] || type;
}

module.exports = {
  normalizeCustomVisitIntervalDays,
  resolveNextVisitDate,
  getVisitTypeLabel
};

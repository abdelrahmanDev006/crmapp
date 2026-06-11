const Roles = {
  ADMIN: "ADMIN",
  REPRESENTATIVE: "REPRESENTATIVE"
};

const VisitTypes = {
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MONTHLY: "MONTHLY",
  CUSTOM: "CUSTOM",
  ONE_TIME: "ONE_TIME"
};

const ClientStatuses = {
  ACTIVE: "ACTIVE",
  NO_ANSWER: "NO_ANSWER",
  REJECTED: "REJECTED"
};

const VisitIntervalDays = {
  [VisitTypes.WEEKLY]: 7,
  [VisitTypes.BIWEEKLY]: 14,
  [VisitTypes.MONTHLY]: 28,
  [VisitTypes.ONE_TIME]: 0
};

module.exports = {
  Roles,
  VisitTypes,
  ClientStatuses,
  VisitIntervalDays
};

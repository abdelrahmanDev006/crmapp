const Roles = {
  ADMIN: "ADMIN",
  REPRESENTATIVE: "REPRESENTATIVE"
};

const VisitTypes = {
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MONTHLY: "MONTHLY",
  CUSTOM: "CUSTOM"
};

const ClientStatuses = {
  ACTIVE: "ACTIVE",
  NO_ANSWER: "NO_ANSWER",
  REJECTED: "REJECTED",
  PENDING_APPROVAL: "PENDING_APPROVAL"
};

const VisitIntervalDays = {
  [VisitTypes.WEEKLY]: 7,
  [VisitTypes.BIWEEKLY]: 14,
  [VisitTypes.MONTHLY]: 28
};

module.exports = {
  Roles,
  VisitTypes,
  ClientStatuses,
  VisitIntervalDays
};

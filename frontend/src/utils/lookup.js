export const VisitType = {
  WEEKLY: "أسبوعي",
  BIWEEKLY: "أسبوعين",
  MONTHLY: "شهري",
  CUSTOM: "ميعاد آخر",
  ONE_TIME: "بيع"
};

export const ClientStatus = {
  ACTIVE: "نشط",
  NO_ANSWER: "لم يرد",
  REJECTED: "كانسل",
  PENDING_APPROVAL: "في انتظار الاعتماد"
};

export function getClientStatusLabel(status, noAnswerCount) {
  if (status === "NO_ANSWER") {
    const parsedCount = Number(noAnswerCount);

    if (Number.isInteger(parsedCount) && parsedCount > 0) {
      return `لم يرد ${parsedCount}`;
    }
  }

  return ClientStatus[status] || status;
}

export function getVisitTypeLabel(type, customVisitIntervalDays) {
  if (type === "CUSTOM") {
    const parsed = Number(customVisitIntervalDays);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return `ميعاد آخر (كل ${parsed} يوم)`;
    }

    return VisitType.CUSTOM;
  }

  return VisitType[type] || type;
}

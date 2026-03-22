import { ClientStatus, VisitType } from "./lookup";

export function formatDate(dateValue) {
  if (!dateValue) return "-";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatRegionCode(codeValue) {
  const parsed = Number(codeValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "-";
  }

  return `M${String(Math.trunc(parsed)).padStart(2, "0")}`;
}

export function getStatusLabel(status) {
  return ClientStatus[status] || status;
}

export function getVisitTypeLabel(type) {
  return VisitType[type] || type;
}

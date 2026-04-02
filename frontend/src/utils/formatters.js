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

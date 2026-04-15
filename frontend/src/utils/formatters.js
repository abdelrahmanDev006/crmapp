const weekDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function toSafeDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  if (typeof dateValue === "string") {
    const plainDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
    if (plainDateMatch) {
      const [, yearText, monthText, dayText] = plainDateMatch;
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      const localDate = new Date(year, month - 1, day);

      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
  }

  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(dateValue) {
  const date = toSafeDate(dateValue);
  if (!date) return "-";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

export function formatDateWithWeekday(dateValue) {
  const date = toSafeDate(dateValue);
  if (!date) return "-";

  const dayName = weekDays[date.getDay()] || "";
  return `${formatDate(date)} (${dayName})`;
}

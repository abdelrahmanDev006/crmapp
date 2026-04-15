export function formatDate(dateValue) {
  if (!dateValue) return "-";

  if (typeof dateValue === "string") {
    const plainDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
    if (plainDateMatch) {
      const [, year, month, day] = plainDateMatch;
      return `${day}/${month}/${year}`;
    }
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

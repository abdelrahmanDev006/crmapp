import { getVisitTypeLabel } from "../utils/lookup";

export default function VisitTypeBadge({ type, customVisitIntervalDays = null }) {
  const label = getVisitTypeLabel(type, customVisitIntervalDays);
  const badgeClassName = type === "CUSTOM" ? "visit-pill visit-pill-custom" : type === "ONE_TIME" ? "visit-pill visit-pill-one-time" : "visit-pill";

  return (
    <span className={badgeClassName} title={label}>
      {label}
    </span>
  );
}

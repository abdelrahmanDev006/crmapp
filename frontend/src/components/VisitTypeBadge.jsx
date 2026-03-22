import { VisitType } from "../utils/lookup";

export default function VisitTypeBadge({ type }) {
  return <span className="visit-pill">{VisitType[type] || type}</span>;
}

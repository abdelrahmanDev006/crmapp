import { getClientStatusLabel } from "../utils/lookup";

const statusClassMap = {
  ACTIVE: "status-pill status-active",
  NO_ANSWER: "status-pill status-no-answer",
  REJECTED: "status-pill status-rejected",
  PENDING_APPROVAL: "status-pill status-pending"
};

export default function StatusBadge({ status, noAnswerCount }) {
  return <span className={statusClassMap[status] || "status-pill"}>{getClientStatusLabel(status, noAnswerCount)}</span>;
}

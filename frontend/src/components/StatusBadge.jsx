import { ClientStatus } from "../utils/lookup";

const statusClassMap = {
  ACTIVE: "status-pill status-active",
  NO_ANSWER: "status-pill status-no-answer",
  REJECTED: "status-pill status-rejected"
};

export default function StatusBadge({ status }) {
  return <span className={statusClassMap[status] || "status-pill"}>{ClientStatus[status] || status}</span>;
}

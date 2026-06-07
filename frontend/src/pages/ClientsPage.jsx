import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clientsApi, regionsApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import Pagination from "../components/Pagination";
import VisitTypeBadge from "../components/VisitTypeBadge";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate, formatDateWithWeekday } from "../utils/formatters";
import { getClientStatusLabel, getVisitTypeLabel } from "../utils/lookup";

const tabs = [
  { key: "ALL", label: "جميع العملاء" },
  { key: "WEEKLY", label: "أسبوعي" },
  { key: "BIWEEKLY", label: "أسبوعين" },
  { key: "MONTHLY", label: "شهري" },
  { key: "CUSTOM", label: "ميعاد آخر" },
  { key: "ONE_TIME", label: "عملاء البيع" },
  { key: "NO_ANSWER", label: "لم يرد" },
  { key: "REJECTED", label: "كانسل" },
  { key: "PENDING", label: "في انتظار الاعتماد" }
];

const playToastSound = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "warning") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "danger" || type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    // Ignore audio errors if browser blocks autoplay
  }
};

const initialCreateForm = {
  name: "",
  phone: "",
  address: "",
  locationUrl: "",
  regionId: "",
  products: "",
  price: "",
  visitType: "MONTHLY",
  customVisitIntervalDays: "",
  status: "ACTIVE",
  nextVisitDate: "",
  note: ""
};

const NEW_CLIENT_WINDOW_DAYS = 7;

function mapTabToFilters(tab) {
  if (tab === "ALL") {
    return {};
  }

  if (tab === "NO_ANSWER") {
    return { status: "NO_ANSWER" };
  }

  if (tab === "REJECTED") {
    return { status: "REJECTED" };
  }

  if (tab === "PENDING") {
    return { status: "PENDING_APPROVAL" };
  }

  return {
    status: "ACTIVE",
    visitType: tab
  };
}

function getTodayInputDate() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function getDateTextOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function getLocationHref(locationUrl) {
  const raw = String(locationUrl || "").trim();

  if (!raw) {
    return null;
  }

  if (/\s/.test(raw)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = String(parsed.hostname || "").trim();
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const hasPublicSuffix = hostname.includes(".") && !hostname.startsWith(".") && !hostname.endsWith(".");
    const isLocalhost = hostname === "localhost";

    if (!isIpv4 && !hasPublicSuffix && !isLocalhost) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function getDialHref(phoneValue) {
  const normalizedPhone = String(phoneValue || "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\d+]/g, "");

  if (!normalizedPhone) {
    return null;
  }

  return `tel:${normalizedPhone}`;
}

function isNewClient(createdAt, todayDateText) {
  const createdDateText = getDateTextOrNull(createdAt);

  if (!createdDateText) {
    return false;
  }

  const todayDate = new Date(`${todayDateText}T00:00:00.000Z`);
  const createdDate = new Date(`${createdDateText}T00:00:00.000Z`);

  if (Number.isNaN(todayDate.getTime()) || Number.isNaN(createdDate.getTime())) {
    return false;
  }

  const diffInDays = Math.floor((todayDate.getTime() - createdDate.getTime()) / 86400000);
  return diffInDays >= 0 && diffInDays < NEW_CLIENT_WINDOW_DAYS;
}

function getSafeExportText(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function parseCustomVisitIntervalDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return null;
  }

  return parsed;
}

function normalizeImportKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u200f\u200e]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "");
}

function pickImportValue(row, candidateKeys) {
  const normalizedEntries = Object.entries(row || {}).map(([key, value]) => [normalizeImportKey(key), value]);

  for (const candidateKey of candidateKeys) {
    const normalizedCandidateKey = normalizeImportKey(candidateKey);
    const matchingEntry = normalizedEntries.find(([key]) => key === normalizedCandidateKey);

    if (matchingEntry && String(matchingEntry[1] ?? "").trim()) {
      return matchingEntry[1];
    }
  }

  return "";
}

function normalizeVisitType(value) {
  const text = String(value || "").trim();
  const normalizedText = normalizeImportKey(text);

  if (!normalizedText) {
    return { visitType: "WEEKLY", customVisitIntervalDays: null };
  }

  if (["weekly", "أسبوعي", "اسبوعي"].map(normalizeImportKey).includes(normalizedText)) {
    return { visitType: "WEEKLY", customVisitIntervalDays: null };
  }

  if (
    ["biweekly", "كلأسبوعين", "كلاسبوعين", "أسبوعين", "اسبوعين"].map(normalizeImportKey).includes(normalizedText)
  ) {
    return { visitType: "BIWEEKLY", customVisitIntervalDays: null };
  }

  if (["monthly", "شهري"].map(normalizeImportKey).includes(normalizedText)) {
    return { visitType: "MONTHLY", customVisitIntervalDays: null };
  }

  if (normalizedText.includes(normalizeImportKey("ميعاد آخر")) || normalizedText.includes(normalizeImportKey("معاد آخر"))) {
    const customDaysMatch = text.match(/(\d+)/);
    return {
      visitType: "CUSTOM",
      customVisitIntervalDays: customDaysMatch ? parseCustomVisitIntervalDays(customDaysMatch[1]) : null
    };
  }

  return { visitType: "WEEKLY", customVisitIntervalDays: null };
}

function normalizeStatus(value) {
  const normalizedText = normalizeImportKey(value);
  const normalizedNoAnswerText = normalizeImportKey("لم يرد");
  const normalizedRejectedKeywords = ["ساقط", "مرفوض", "كانسل", "ملغي", "مرتجع", "rejected", "cancelled"].map(normalizeImportKey);

  if (
    normalizedText.startsWith(normalizedNoAnswerText) ||
    ["لميَرُد", "noanswer", "no_answer"].map(normalizeImportKey).includes(normalizedText)
  ) {
    return "NO_ANSWER";
  }

  if (normalizedRejectedKeywords.some((keyword) => normalizedText.startsWith(keyword))) {
    return "REJECTED";
  }

  return "ACTIVE";
}

function formatImportDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeNextVisitDate(XLSX, value) {
  if (!value && value !== 0) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatImportDate(value);
  }

  if (typeof value === "number") {
    const parsedCode = XLSX.SSF.parse_date_code(value);

    if (parsedCode) {
      return formatImportDate(new Date(parsedCode.y, parsedCode.m - 1, parsedCode.d));
    }
  }

  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return text;
  }

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsedDate = new Date(text);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return formatImportDate(parsedDate);
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function ClientTableRows({
  clients,
  todayDateText,
  actionState,
  onHandleClient,
  onApproveVisit,
  onRejectVisit,
  isRepresentative,
  isAdmin,
  selectedClientIds,
  onToggleClientSelection
}) {
  return clients.map((client) => {
    const clientIsNew = isNewClient(client.createdAt, todayDateText);
    const locationHref = getLocationHref(client.locationUrl);
    const dialHref = getDialHref(client.phone);
    const isActionLoadingForClient = actionState.clientId === client.id;
    const isHandleActionLoading = isActionLoadingForClient && actionState.outcome === "ACTIVE";
    const isNoAnswerActionLoading = isActionLoadingForClient && actionState.outcome === "NO_ANSWER";
    const isApproveLoading = isActionLoadingForClient && actionState.outcome === "APPROVE";
    const isRejectLoading = isActionLoadingForClient && actionState.outcome === "REJECT";
    const isCancelActionLoading = isActionLoadingForClient && actionState.outcome === "REJECTED";

    return (
      <tr key={client.id} className={`client-row-${client.visitType}`}>
        <td className="col-checkbox" data-label="تحديد" style={{ textAlign: "center", width: "40px" }}>
          <input
            type="checkbox"
            checked={selectedClientIds?.has(client.id) || false}
            onChange={() => onToggleClientSelection(client.id)}
            style={{ width: "18px", height: "18px", cursor: "pointer" }}
          />
        </td>
        <td className="col-name" data-label="العميل">
          <div className="client-name-cell">
            <span className="client-name-text">{client.name}</span>
            <span className={clientIsNew ? "client-freshness-pill client-freshness-new" : "client-freshness-pill client-freshness-old"}>
              {clientIsNew ? "جديد" : "قديم"}
            </span>
          </div>
        </td>
        <td className="col-phone" data-label="الهاتف">{client.phone}</td>
        <td className="col-address" data-label="العنوان">{client.address}</td>
        <td className="col-location" data-label="اللوكيشن">
          {locationHref ? (
            <a
              href={locationHref}
              target="_blank"
              rel="noopener noreferrer"
              className="location-link-icon"
              aria-label={`فتح لوكيشن العميل ${client.name}`}
              title="فتح اللوكيشن"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
            </a>
          ) : (
            <span className="location-link-missing">-</span>
          )}
        </td>

        <td className="col-products" data-label="المنتجات">{client.products}</td>
        <td className="col-price" data-label="السعر">{client.price || "-"}</td>

        <td className="col-visit-type" data-label="الزيارة">
          <VisitTypeBadge type={client.visitType} customVisitIntervalDays={client.customVisitIntervalDays} />
        </td>
        <td className="col-notes details-note-text" data-label="الملاحظات" title={client.visits?.find(v => v?.note !== null && v?.note !== undefined)?.note || ""}>
          {client.visits?.find(v => v?.note !== null && v?.note !== undefined)?.note || "-"}
        </td>

        <td className="actions-cell col-actions" data-label="الإجراءات">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", width: "100%", maxWidth: "180px", margin: "0 auto" }}>
            {isRepresentative && (dialHref || locationHref) && (
              <div style={{ gridColumn: "span 2", display: "flex", gap: "4px" }}>
                {dialHref && (
                  <a className="ghost-btn quick-action-btn" href={dialHref} style={{ flex: 1, padding: "4px" }}>
                    اتصال
                  </a>
                )}
                {locationHref && (
                  <a className="ghost-btn quick-action-btn" href={locationHref} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "4px" }}>
                    خريطة
                  </a>
                )}
              </div>
            )}

            {!isRepresentative && (
              <>
                {client.status !== "REJECTED" && client.status !== "PENDING_APPROVAL" && client.visitType !== "ONE_TIME" && (
                  <button
                    type="button"
                    className="danger-btn"
                    style={{ padding: "4px 8px", fontSize: "0.85rem", minHeight: "0" }}
                    disabled={isActionLoadingForClient}
                    onClick={() => onHandleClient(client, "REJECTED")}
                  >
                    {isCancelActionLoading ? "..." : "كانسل"}
                  </button>
                )}
                {isAdmin && (
                  <Link
                    className="secondary-btn"
                    to={`/clients/${client.id}?edit=true`}
                    style={{ padding: "4px 8px", fontSize: "0.85rem", minHeight: "0", background: "#f0f0f0", color: "#333", border: "1px solid #ccc" }}
                  >
                    تعديل
                  </Link>
                )}
              </>
            )}

            {client.status !== "REJECTED" && client.status !== "PENDING_APPROVAL" && client.visitType !== "ONE_TIME" && (
              <>
                <button
                  type="button"
                  className="primary-btn"
                  style={{ padding: "4px 8px", fontSize: "0.85rem", minHeight: "0" }}
                  disabled={isActionLoadingForClient}
                  onClick={() => onHandleClient(client, "ACTIVE")}
                >
                  {isHandleActionLoading ? "..." : "تم التعامل"}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: "4px 8px", fontSize: "0.85rem", minHeight: "0" }}
                  disabled={isActionLoadingForClient}
                  onClick={() => onHandleClient(client, "NO_ANSWER")}
                >
                  {isNoAnswerActionLoading ? "..." : "لم يرد"}
                </button>
                {isRepresentative && (
                  <button
                    type="button"
                    className="danger-btn"
                    style={{ gridColumn: "span 2", padding: "4px 8px", fontSize: "0.85rem", minHeight: "0" }}
                    disabled={isActionLoadingForClient}
                    onClick={() => onHandleClient(client, "REJECTED")}
                  >
                    {isCancelActionLoading ? "..." : "كانسل"}
                  </button>
                )}
              </>
            )}

            {!isRepresentative && client.status === "PENDING_APPROVAL" && (
              <div className="admin-approval-actions" style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "6px", background: "#fff3cd", padding: "6px", borderRadius: "8px", border: "1px solid #ffeeba" }}>
                <div style={{ fontSize: "0.8rem", color: "#856404", fontWeight: "bold", textAlign: "center", lineHeight: "1.2" }}>
                  <div style={{ marginBottom: "4px" }}>
                    <span style={{ display: "block", padding: "3px", background: "#ffc107", color: "#000", borderRadius: "4px", fontSize: "0.85rem" }}>
                      {client.pendingOutcome === "ACTIVE" ? "تم التعامل" :
                        client.pendingOutcome === "NO_ANSWER" ? "لم يرد" :
                          client.pendingOutcome === "REJECTED" ? "كانسل" :
                            client.pendingOutcome === "POSTPONED" ? "مؤجل" :
                              client.pendingOutcome || "غير معروف"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={isActionLoadingForClient}
                    onClick={() => onApproveVisit(client)}
                    style={{ flex: 1, background: "#28a745", borderColor: "#28a745", padding: "4px 0", fontSize: "0.85rem" }}
                  >
                    {isApproveLoading ? "..." : "اعتماد"}
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={isActionLoadingForClient}
                    onClick={() => onRejectVisit(client)}
                    style={{ flex: 1, padding: "4px 0", fontSize: "0.85rem" }}
                  >
                    {isRejectLoading ? "..." : "رفض"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  });
}

export default function ClientsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isRepresentative = user?.role === "REPRESENTATIVE";
  const importFileInputRef = useRef(null);
  const restoredScrollRef = useRef(false);

  const [regions, setRegions] = useState([]);
  const [regionRepresentatives, setRegionRepresentatives] = useState({});
  const [loadingRegionRepresentativeIds, setLoadingRegionRepresentativeIds] = useState({});
  const [expandedRegionIds, setExpandedRegionIds] = useState(() => {
    try {
      const saved = localStorage.getItem("crm_expandedRegionIds");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem("crm_activeTab");
    const validTabs = ["ALL", "ACTIVE", "NO_ANSWER", "REJECTED", "PENDING_APPROVAL"];
    return validTabs.includes(saved) ? saved : "ALL";
  });
  const [page, setPage] = useState(() => {
    const saved = Number(localStorage.getItem("crm_page"));
    return Number.isInteger(saved) && saved > 0 ? saved : 1;
  });
  const [search, setSearch] = useState(() => {
    const saved = localStorage.getItem("crm_search");
    return typeof saved === "string" ? saved : "";
  });
  const [overdueSummary, setOverdueSummary] = useState({ count: 0, dates: [] });
  const [selectedDueDate, setSelectedDueDate] = useState(() => {
    const saved = localStorage.getItem("crm_selectedDueDate");
    if (saved !== null && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
    if (saved === "") return "";
    return user?.role === "REPRESENTATIVE" ? getTodayInputDate() : "";
  });
  const [data, setData] = useState({ items: [], totalRegionPages: 1, totalRegions: 0, total: 0, regionPage: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState({ clientId: null, outcome: null });
  const [showCreate, setShowCreate] = useState(false);
  const [isSaleCreate, setIsSaleCreate] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [copyPhonesLoading, setCopyPhonesLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [importExcelLoading, setImportExcelLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error' }
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    playToastSound(type);
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const todayDateText = getTodayInputDate();
  const debouncedSearch = useDebouncedValue(search, 350);

  const [selectedClientIds, setSelectedClientIds] = useState(new Set());
  const toggleClientSelection = useCallback((id) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkOutcome = async (outcome) => {
    if (selectedClientIds.size === 0) return;
    
    let noteText = "";
    if (isRepresentative) {
      noteText = window.prompt(`أدخل ملاحظة للعملاء المحددين (${selectedClientIds.size} عميل) - اختياري:`);
      if (noteText === null) return;
    }

    const idsToProcess = Array.from(selectedClientIds);
    setSelectedClientIds(new Set()); // مسح التحديد فوراً

    // --- Optimistic Update ---
    setData(prev => ({
      ...prev,
      items: prev.items.filter(item => !idsToProcess.includes(item.id)),
      total: Math.max(0, prev.total - idsToProcess.length)
    }));

    const outcomeLabels = {
      ACTIVE: "تم التعامل",
      NO_ANSWER: "لم يرد",
      REJECTED: "كانسل"
    };
    const outcomeTypes = {
      ACTIVE: "success",
      NO_ANSWER: "warning",
      REJECTED: "danger"
    };
    const type = outcomeTypes[outcome] || "success";
    showToast(`✅ تم بنجاح معالجة ${idsToProcess.length} عملاء كـ «${outcomeLabels[outcome]}»`, type);

    try {
      await Promise.all(idsToProcess.map(id => clientsApi.handle(id, { outcome, note: noteText || undefined })));
    } catch (err) {
      showToast("❌ حدث خطأ أثناء معالجة بعض العملاء", "error");
      loadClients();
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem("crm_expandedRegionIds", JSON.stringify(expandedRegionIds));
    } catch {
      // تجاهل أخطاء localStorage
    }
  }, [expandedRegionIds]);

  useEffect(() => {
    localStorage.setItem("crm_activeTab", activeTab);
    localStorage.setItem("crm_page", page.toString());
    localStorage.setItem("crm_search", search);
    localStorage.setItem("crm_selectedDueDate", selectedDueDate);

    // تصفير السكرول فقط إذا تم استعادة السكرول السابق بالفعل (لمنع مسحه عند تحميل الصفحة أول مرة)
    if (restoredScrollRef.current) {
      sessionStorage.setItem("crm_scrollY", "0");
    }
  }, [activeTab, page, search, selectedDueDate]);

  // 1. حفظ موضع السكرول في الوقت الفعلي أثناء التصفح (لتجنب انهيار الارتفاع عند Unmount)
  useEffect(() => {
    const handleScroll = () => {
      if (!loading && data.items.length > 0) {
        sessionStorage.setItem("crm_scrollY", window.scrollY.toString());
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [loading, data.items]);

  // 2. استعادة موضع السكرول على مراحل (Staggered Scroll) لضمان النجاح مهما كان رندر العناصر بطيئاً
  useEffect(() => {
    if (!loading && data.items.length > 0 && !restoredScrollRef.current) {
      const savedScrollY = sessionStorage.getItem("crm_scrollY");
      if (savedScrollY && savedScrollY !== "0") {
        const scrollPosition = parseInt(savedScrollY, 10);

        const tryScroll = () => {
          window.scrollTo(0, scrollPosition);
        };

        // تشغيل فوري + تشغيل بعد 50 مللي ثانية + تشغيل بعد 200 مللي ثانية
        tryScroll();
        const t1 = setTimeout(tryScroll, 50);
        const t2 = setTimeout(tryScroll, 200);
        const t3 = setTimeout(() => {
          tryScroll();
          restoredScrollRef.current = true;
        }, 400);

        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      } else {
        restoredScrollRef.current = true;
      }
    }
  }, [loading, data.items]);

  const matchesCurrentFilters = useCallback((client) => {
    // 1. Check Date Filter
    if (selectedDueDate) {
      const clientDateStr = client.nextVisitDate ? client.nextVisitDate.slice(0, 10) : "";
      if (clientDateStr !== selectedDueDate) {
        return false;
      }
    }

    // 2. Check Tab Filter
    if (activeTab === "ALL") {
      if (!selectedDueDate && client.status === "REJECTED") return false;
      return true;
    }

    if (activeTab === "NO_ANSWER") {
      return client.status === "NO_ANSWER";
    }

    if (activeTab === "REJECTED") {
      return client.status === "REJECTED";
    }

    if (activeTab === "PENDING") {
      return client.status === "PENDING_APPROVAL";
    }

    // Otherwise, it's a visitType tab (WEEKLY, BIWEEKLY, MONTHLY, CUSTOM, ONE_TIME)
    return client.status === "ACTIVE" && client.visitType === activeTab;
  }, [activeTab, selectedDueDate]);

  const queryFilters = useMemo(() => mapTabToFilters(activeTab), [activeTab]);
  const hasDueDateFilter = Boolean(selectedDueDate);
  const selectedDueDateDisplay = selectedDueDate ? formatDate(`${selectedDueDate}T00:00:00.000Z`) : "يوم/شهر/سنة";
  const createNextVisitDateDisplay = createForm.nextVisitDate
    ? formatDateWithWeekday(`${createForm.nextVisitDate}T00:00:00.000Z`)
    : "يوم/شهر/سنة";
  const groupedClientsByRegion = useMemo(() => {
    const groupedMap = new Map();

    data.items.forEach((client) => {
      const regionId = client.region?.id || 0;

      if (!groupedMap.has(regionId)) {
        groupedMap.set(regionId, {
          regionId,
          regionCode: client.region?.code || Number.MAX_SAFE_INTEGER,
          regionName: client.region?.name || "بدون منطقة",
          clients: []
        });
      }

      groupedMap.get(regionId).clients.push(client);
    });

    return Array.from(groupedMap.values()).sort((firstGroup, secondGroup) => {
      if (firstGroup.regionCode !== secondGroup.regionCode) {
        return firstGroup.regionCode - secondGroup.regionCode;
      }

      return firstGroup.regionName.localeCompare(secondGroup.regionName, "ar");
    });
  }, [data.items]);

  const toggleRegionGroup = useCallback(async (regionId) => {
    const shouldExpand = !expandedRegionIds[regionId];

    setExpandedRegionIds((prev) => ({
      ...prev,
      [regionId]: shouldExpand
    }));

    if (!shouldExpand || !regionId || Object.prototype.hasOwnProperty.call(regionRepresentatives, regionId)) {
      return;
    }

    setLoadingRegionRepresentativeIds((prev) => ({
      ...prev,
      [regionId]: true
    }));

    try {
      const response = await regionsApi.getById(regionId);
      const representatives = response.data?.item?.representatives || [];
      const activeRepresentativeNames = representatives
        .filter((representative) => representative.isActive !== false)
        .map((representative) => representative.name)
        .filter(Boolean);

      setRegionRepresentatives((prev) => ({
        ...prev,
        [regionId]: activeRepresentativeNames
      }));
    } catch {
      setRegionRepresentatives((prev) => ({
        ...prev,
        [regionId]: []
      }));
    } finally {
      setLoadingRegionRepresentativeIds((prev) => ({
        ...prev,
        [regionId]: false
      }));
    }
  }, [expandedRegionIds, regionRepresentatives]);

  const handleCopyRegionPhones = async (group) => {
    const uniquePhones = [...new Set(group.clients.map(c => String(c.phone || "").trim()).filter(Boolean))];
    if (uniquePhones.length === 0) {
      showToast("لا توجد أرقام متاحة للنسخ في هذه المنطقة.", "warning");
      return;
    }

    const textToCopy = uniquePhones.join("\n");
    let copied = false;

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        copied = true;
      } catch (err) {}
    }
    
    if (!copied) {
      try {
        const helper = document.createElement("textarea");
        helper.value = textToCopy;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        copied = document.execCommand("copy");
        document.body.removeChild(helper);
      } catch (err) {}
    }

    if (copied) {
      showToast(`تم نسخ ${uniquePhones.length} رقم بنجاح.`, "success");
    } else {
      showToast("تعذر نسخ الأرقام. حاول مرة أخرى.", "error");
    }
  };

  const handlePrintRegion = (group) => {
    const printWindow = window.open("", "_blank");
    const todayStr = new Date().toLocaleDateString("ar-EG");
    const filterDateStr = hasDueDateFilter ? selectedDueDate : todayStr;

    const representativeNames = regionRepresentatives[group.regionId] || [];
    const representativeText = representativeNames.length > 0 ? representativeNames.join(" - ") : "غير محدد";

    const clientRows = group.clients
      .map(
        (c, i) => {
          const noteText = c.visits?.find(v => v?.note !== null && v?.note !== undefined)?.note || "";
          return `
            <tr>
              <td>${i + 1}</td>
              <td style="font-weight:600">${c.name}</td>
              <td style="direction:ltr;text-align:center">${c.phone}</td>
              <td class="col-address">${c.address}</td>
              <td>${c.products || "-"}</td>
              <td style="text-align:center;font-weight:600">${c.price || "-"}</td>
              <td class="col-notes">${noteText}</td>
            </tr>
          `;
        }
      )
      .join("");

    const html = `
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>طباعة منطقة: ${group.regionName}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
              padding: 28px 32px;
              color: #1a2a32;
              background: #fff;
              line-height: 1.5;
            }
            .report-header {
              background: linear-gradient(135deg, #0e7a78 0%, #0a5f5d 100%);
              color: #fff;
              border-radius: 12px;
              padding: 22px 28px;
              margin-bottom: 22px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            }
            .report-header h1 {
              font-size: 22px;
              font-weight: 800;
              letter-spacing: -0.3px;
            }
            .report-header .brand {
              font-size: 12px;
              opacity: 0.85;
              background: rgba(255,255,255,0.18);
              padding: 5px 14px;
              border-radius: 20px;
              font-weight: 700;
              letter-spacing: 0.5px;
              white-space: nowrap;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 22px;
            }
            .meta-card {
              background: #f4fafa;
              border: 1px solid #d4e8e7;
              border-radius: 10px;
              padding: 14px 16px;
              text-align: center;
            }
            .meta-card .meta-label {
              font-size: 11px;
              color: #5a7a80;
              font-weight: 700;
              margin-bottom: 4px;
              letter-spacing: 0.3px;
            }
            .meta-card .meta-value {
              font-size: 16px;
              font-weight: 800;
              color: #0e7a78;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border-radius: 10px;
              overflow: hidden;
              border: 1px solid #d4e5e4;
            }
            thead tr {
              background: linear-gradient(135deg, #0e7a78 0%, #0a5f5d 100%);
            }
            th {
              color: #fff;
              font-weight: 700;
              font-size: 10px;
              padding: 10px 5px;
              text-align: right;
              letter-spacing: 0.2px;
            }
            td {
              padding: 30px 5px;
              font-size: 10.5px;
              text-align: right;
              border-bottom: 1px solid #e8f0ef;
              color: #2a3d45;
            }
            tr {
              page-break-inside: avoid;
            }
            tbody tr:nth-child(even) {
              background: #f8fcfc;
            }
            td:first-child, th:first-child {
              text-align: center;
              width: 30px;
              color: #7a9a9e;
              font-weight: 700;
            }
            .col-address {
              width: 35%;
            }
            .col-notes {
              min-width: 100px;
            }

            .report-footer {
              margin-top: 28px;
              padding-top: 14px;
              border-top: 2px solid #e8f0ef;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 11px;
              color: #8a9da3;
            }
            .report-footer .footer-brand {
              font-weight: 700;
              color: #0e7a78;
            }
            @media print {
              @page { margin: 10mm; }
              body { padding: 0; }
              .report-header { border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .meta-grid { margin-bottom: 16px; }
              .meta-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <h1>تقرير منطقة: ${group.regionName}</h1>
            <span class="brand">CRM SYSTEM</span>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-label">تاريخ التقرير</div>
              <div class="meta-value">${filterDateStr}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">المندوب</div>
              <div class="meta-value" style="font-size:13px">${representativeText}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">عدد العملاء</div>
              <div class="meta-value">${group.clients.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم العميل</th>
                <th>الهاتف</th>
                <th class="col-address">العنوان</th>
                <th>المنتجات</th>
                <th>السعر</th>
                <th class="col-notes">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              ${clientRows}
            </tbody>
          </table>

          <div class="report-footer">
            <span>طُبع بتاريخ: ${new Date().toLocaleString("ar-EG")}</span>
            <span class="footer-brand">CRM System</span>
          </div>

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const buildRegionPageParams = useCallback((regionPageOverride) => {
    const params = {
      regionPage: regionPageOverride ?? page,
      regionPageSize: 3,
      search: debouncedSearch || undefined,
      ...queryFilters
    };

    if (hasDueDateFilter) {
      params.dueDate = selectedDueDate;
    }

    return params;
  }, [page, debouncedSearch, hasDueDateFilter, queryFilters, selectedDueDate]);

  const buildClientListParams = useCallback((pageOverride, pageSizeOverride) => {
    const params = {
      page: pageOverride ?? 1,
      pageSize: pageSizeOverride ?? 100,
      search: debouncedSearch || undefined,
      ...queryFilters
    };

    if (hasDueDateFilter) {
      params.dueDate = selectedDueDate;
    }

    return params;
  }, [debouncedSearch, hasDueDateFilter, queryFilters, selectedDueDate]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await clientsApi.listByRegion(buildRegionPageParams(page));
      const responseData = response.data || {};

      setData({
        items: responseData.items || [],
        total: responseData.totalClients || 0,
        totalRegions: responseData.totalRegions || 0,
        totalRegionPages: responseData.totalRegionPages || 1,
        regionPage: responseData.regionPage || 1
      });
    } catch (err) {
      setError(err.message || "تعذر تحميل العملاء");
    } finally {
      setLoading(false);
    }
  }, [buildRegionPageParams, page]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, hasDueDateFilter, queryFilters, selectedDueDate]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadOverdueCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await clientsApi.getOverdueSummary();
      setOverdueSummary({
        count: res.data.total || 0,
        dates: res.data.dates || []
      });
    } catch (err) {
      console.error("Failed to load overdue count", err);
    }
  }, [isAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOverdueCount();
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadOverdueCount, data.items.length]); // Reload count only when client list changes


  useEffect(() => {
    let mounted = true;

    async function loadRegions() {
      try {
        const response = await regionsApi.list();
        if (mounted) {
          setRegions(response.data.items || []);
        }
      } catch {
        // Region metadata is only used to show grouping details.
      }
    }

    loadRegions();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (groupedClientsByRegion.length === 0) {
      // لا تمسح المناطق المفتوحة أثناء التحميل
      return;
    }

    setExpandedRegionIds((prev) => {
      const nextState = {};

      groupedClientsByRegion.forEach((group) => {
        nextState[group.regionId] = prev[group.regionId] ?? false;
      });

      return nextState;
    });
  }, [groupedClientsByRegion]);

  useEffect(() => {
    const pendingRegionIds = groupedClientsByRegion
      .map((group) => Number(group.regionId))
      .filter((regionId) => regionId > 0)
      .filter((regionId) => !Object.prototype.hasOwnProperty.call(regionRepresentatives, regionId))
      .filter((regionId) => !loadingRegionRepresentativeIds[regionId]);

    if (pendingRegionIds.length === 0) {
      return;
    }

    setLoadingRegionRepresentativeIds((prev) => {
      const nextState = { ...prev };
      pendingRegionIds.forEach((regionId) => {
        nextState[regionId] = true;
      });
      return nextState;
    });

    async function loadVisibleRegionRepresentatives() {
      const responses = await Promise.allSettled(pendingRegionIds.map((regionId) => regionsApi.getById(regionId)));

      const nextRepresentatives = {};
      const nextLoadingState = {};

      responses.forEach((response, index) => {
        const regionId = pendingRegionIds[index];
        nextLoadingState[regionId] = false;

        if (response.status !== "fulfilled") {
          nextRepresentatives[regionId] = [];
          return;
        }

        const representatives = response.value.data?.item?.representatives || [];

        nextRepresentatives[regionId] = representatives
          .filter((representative) => representative.isActive !== false)
          .map((representative) => representative.name)
          .filter(Boolean);
      });

      setRegionRepresentatives((prev) => ({ ...prev, ...nextRepresentatives }));
      setLoadingRegionRepresentativeIds((prev) => ({ ...prev, ...nextLoadingState }));
    }

    loadVisibleRegionRepresentatives();
  }, [groupedClientsByRegion, loadingRegionRepresentativeIds, regionRepresentatives]);

  const totalRegionPages = data.totalRegionPages || 1;

  useEffect(() => {
    if (!loading && totalRegionPages > 0 && page > totalRegionPages) {
      setPage(totalRegionPages);
    }
  }, [totalRegionPages, loading, page]);

  async function handleApproveVisit(client) {
    setError("");

    // --- Optimistic Update: أزل العميل فوراً لضمان سرعة الاستخدام ---
    setData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== client.id),
      total: Math.max(0, prev.total - 1)
    }));

    showToast(`✅ تم اعتماد إجراء العميل «${client.name}» بنجاح`);

    try {
      await clientsApi.approve(client.id);
    } catch (err) {
      // في حالة الفشل، أظهر الخطأ وأعد تحميل القائمة لتصحيح البيانات
      showToast(err.message || "تعذر اعتماد الزيارة", "error");
      loadClients();
    }
  }

  async function handleRejectVisit(client) {
    setError("");

    // --- Optimistic Update: أزل العميل فوراً لضمان سرعة الاستخدام ---
    setData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== client.id),
      total: Math.max(0, prev.total - 1)
    }));

    showToast(`↩️ تم رد إجراء العميل «${client.name}» للحالة النشطة`, "warning");

    try {
      await clientsApi.reject(client.id);
    } catch (err) {
      showToast(err.message || "تعذر رفض الزيارة", "error");
      loadClients();
    }
  }

  async function handleClientOutcome(client, outcome) {
    let noteText = "";
    if (isRepresentative) {
      if (outcome === "REJECTED") {
        noteText = window.prompt("يرجى إدخال سبب إلغاء العميل (اختياري):");
        if (noteText === null) return;
      } else if (outcome === "NO_ANSWER") {
        noteText = window.prompt("يرجى إدخال أي ملاحظة حول عدم الرد (اختياري):");
        if (noteText === null) return;
      } else if (outcome === "ACTIVE") {
        noteText = window.prompt("برجاء كتابة تفاصيل التعامل أو أي ملاحظات (اختياري):");
        if (noteText === null) return;
      }
    }

    setError("");

    // --- Optimistic Update: أزل العميل فوراً لضمان سرعة الاستخدام ---
    setData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== client.id),
      total: Math.max(0, prev.total - 1)
    }));

    const outcomeLabels = {
      ACTIVE: "✅ تم تسجيل «تم التعامل» مع العميل",
      NO_ANSWER: "📞 تم تسجيل «لم يرد» للعميل",
      REJECTED: "❌ تم تسجيل «كانسل» للعميل"
    };
    const outcomeTypes = {
      ACTIVE: "success",
      NO_ANSWER: "warning",
      REJECTED: "danger"
    };
    
    const label = outcomeLabels[outcome] || "✅ تم تنفيذ الإجراء";
    const suffix = isRepresentative ? " — في انتظار اعتماد الإدارة" : "";
    showToast(`${label}: «${client.name}»${suffix}`, outcomeTypes[outcome] || "success");

    try {
      // إرسال الطلب في الخلفية
      await clientsApi.handle(client.id, {
        outcome,
        note: noteText || undefined
      });
    } catch (err) {
      showToast(err.message || "تعذر تحديث حالة العميل", "error");
      loadClients();
    }
  }

  async function handleCreateClient(event) {
    event.preventDefault();
    setCreateLoading(true);
    setError("");
    setInfoMessage("");

    try {
      if (!createForm.nextVisitDate) {
        throw new Error(isSaleCreate ? "تاريخ البيع مطلوب." : "تاريخ الزيارة القادمة مطلوب. يرجى اختيار تاريخ مناسب للعميل.");
      }

      const customVisitIntervalDays =
        createForm.visitType === "CUSTOM" ? parseCustomVisitIntervalDays(createForm.customVisitIntervalDays) : null;

      if (createForm.visitType === "CUSTOM" && !customVisitIntervalDays) {
        throw new Error("حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
      }

      const createPayload = {
        name: createForm.name,
        phone: createForm.phone,
        address: createForm.address,
        locationUrl: createForm.locationUrl || undefined,
        regionId: Number(createForm.regionId),
        products: createForm.products,
        price: createForm.price || undefined,
        visitType: createForm.visitType,
        customVisitIntervalDays: customVisitIntervalDays || undefined,
        status: createForm.status,
        nextVisitDate: createForm.nextVisitDate ? `${createForm.nextVisitDate}T00:00:00.000Z` : undefined,
        note: createForm.note ? createForm.note.trim() : undefined
      };

      let createdClient;
      try {
        const response = await clientsApi.create(createPayload);
        createdClient = response.data.item;
      } catch (apiErr) {
        if (apiErr.status === 409 && apiErr.message) {
          const confirmAdd = window.confirm(apiErr.message + "\n\nهل تريد المتابعة وإضافة العميل على أي حال؟");
          if (confirmAdd) {
            const response = await clientsApi.create({ ...createPayload, force: true });
            createdClient = response.data.item;
          } else {
            return; // User cancelled
          }
        } else {
          throw apiErr;
        }
      }

      setCreateForm(initialCreateForm);
      setShowCreate(false);
      setIsSaleCreate(false);
      
      setData(prev => {
        const isMatching = matchesCurrentFilters(createdClient);
        let newItems = [...prev.items];
        if (isMatching) {
          newItems.push(createdClient);
        }
        newItems.sort((a, b) => new Date(a.nextVisitDate) - new Date(b.nextVisitDate) || a.id - b.id);
        return {
          ...prev,
          items: newItems,
          total: isMatching ? prev.total + 1 : prev.total
        };
      });
    } catch (err) {
      setError(err.message || "تعذر إضافة العميل");
    } finally {
      setCreateLoading(false);
    }
  }

  function onTabChange(nextTab) {
    setActiveTab(nextTab);
    setPage(1);
  }

  function onDueDateChange(value) {
    setSelectedDueDate(value);
    setPage(1);
  }

  // function applyRepresentativeQuickFilter(type) {
  //   setSearch("");
  //   setPage(1);

  //   if (type === "TODAY_DUE") {
  //     setSelectedDueDate(todayDateText);
  //     setActiveTab("ALL");
  //     return;
  //   }

  //   if (type === "NO_ANSWER") {
  //     setSelectedDueDate("");
  //     setActiveTab("NO_ANSWER");
  //     return;
  //   }

  //   setSelectedDueDate("");
  //   setActiveTab("ALL");
  // }

  async function handleCopyAllPhones() {
    setCopyPhonesLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const firstPageResponse = await clientsApi.list(buildClientListParams(1, 1000));
      const firstPageData = firstPageResponse.data || {};
      const allItems = [...(firstPageData.items || [])];
      const totalPages = Math.max(1, Number(firstPageData.totalPages || 1));

      for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        const response = await clientsApi.list(buildClientListParams(currentPage, 1000));
        allItems.push(...(response.data?.items || []));
      }

      const uniquePhones = [...new Set(allItems.map((client) => String(client.phone || "").trim()).filter(Boolean))];

      if (uniquePhones.length === 0) {
        setInfoMessage("لا توجد أرقام متاحة للنسخ حسب الفلاتر الحالية.");
        return;
      }

      const textToCopy = uniquePhones.join("\n");
      let copied = false;

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        copied = true;
      } else {
        const helper = document.createElement("textarea");
        helper.value = textToCopy;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        copied = document.execCommand("copy");
        document.body.removeChild(helper);
      }

      if (!copied) {
        throw new Error("تعذر نسخ الأرقام. حاول مرة أخرى.");
      }

      setInfoMessage(`تم نسخ ${uniquePhones.length} رقم بنجاح.`);
    } catch (err) {
      setError(err.message || "تعذر نسخ الأرقام");
    } finally {
      setCopyPhonesLoading(false);
    }
  }

  async function handleExportExcel() {
    const password = window.prompt("برجاء إدخال كلمة المرور لتصدير البيانات:");
    if (password !== "CRM@Export2026#Secure") {
      alert("كلمة المرور غير صحيحة!");
      return;
    }

    setExportExcelLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const firstPageResponse = await clientsApi.list(buildClientListParams(1, 1000));
      const firstPageData = firstPageResponse.data || {};
      const allItems = [...(firstPageData.items || [])];
      const totalPages = Math.max(1, Number(firstPageData.totalPages || 1));

      for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        const response = await clientsApi.list(buildClientListParams(currentPage, 1000));
        allItems.push(...(response.data?.items || []));
      }

      if (allItems.length === 0) {
        setInfoMessage("لا توجد بيانات لتصديرها حسب الفلاتر الحالية.");
        return;
      }

      const exportRows = allItems.map((client, index) => ({
        "م": index + 1,
        "اسم العميل": getSafeExportText(client.name),
        "رقم الهاتف": getSafeExportText(client.phone),
        "العنوان": getSafeExportText(client.address),
        "اللوكيشن": getSafeExportText(client.locationUrl || ""),
        "المنتجات": getSafeExportText(client.products),
        "السعر": getSafeExportText(client.price || ""),
        "نوع الزيارة": getSafeExportText(getVisitTypeLabel(client.visitType, client.customVisitIntervalDays)),
        "الحالة": getSafeExportText(getClientStatusLabel(client.status, client.noAnswerCount)),
        "الزيارة القادمة": client.status === "REJECTED" ? "-" : formatDate(client.nextVisitDate),
        "الملاحظات": getSafeExportText(client.visits?.[0]?.note || "")
      }));

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      worksheet["!cols"] = [
        { wch: 6 },
        { wch: 24 },
        { wch: 18 },
        { wch: 28 },
        { wch: 28 },
        { wch: 16 },
        { wch: 24 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 18 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "العملاء");

      const fileDate = getTodayInputDate();
      XLSX.writeFile(workbook, `clients-export-${fileDate}.xlsx`);

      setInfoMessage(`تم تصدير ${allItems.length} عميل إلى ملف إكسيل بنجاح.`);
    } catch (err) {
      setError(err.message || "تعذر تصدير ملف الإكسيل");
    } finally {
      setExportExcelLoading(false);
    }
  }

  function handleImportButtonClick() {
    importFileInputRef.current?.click();
  }

  async function handleImportExcel(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isAdmin) {
      setError("فقط الأدمن يمكنه توريد العملاء.");
      return;
    }

    if (regions.length === 0) {
      setError("تعذر تحميل المناطق. حدّث الصفحة أولًا ثم حاول مرة أخرى.");
      return;
    }

    setImportExcelLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("ملف الإكسيل فارغ.");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false
      });

      if (!rows.length) {
        throw new Error("ملف الإكسيل لا يحتوي على بيانات.");
      }

      const regionByName = new Map(regions.map((region) => [normalizeImportKey(region.name), region.id]));
      const regionByCode = new Map(regions.map((region) => [String(region.code), region.id]));
      const preparedRows = [];
      const failedRows = [];

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const name = String(pickImportValue(row, ["اسم العميل", "العميل", "name"])).trim();
        const phone = String(pickImportValue(row, ["رقم الهاتف", "الهاتف", "phone"])).trim();
        const address = String(pickImportValue(row, ["العنوان", "address"])).trim();
        const locationUrl = String(pickImportValue(row, ["اللوكيشن", "لوكيشن العميل", "location", "locationUrl"])).trim();
        const products = String(pickImportValue(row, ["المنتجات", "products"])).trim();
        const price = String(pickImportValue(row, ["السعر", "price"])).trim();
        const regionName = String(pickImportValue(row, ["المنطقة", "region", "regionName"])).trim();
        const regionCode = String(pickImportValue(row, ["كود المنطقة", "regionCode", "code"])).trim();
        const visitTypeValue = pickImportValue(row, ["نوع الزيارة", "الزيارة", "visitType"]);
        const statusValue = pickImportValue(row, ["الحالة", "status"]);
        const nextVisitDateValue = pickImportValue(row, ["الزيارة القادمة", "تاريخ الزيارة القادمة", "nextVisitDate"]);
        const customDaysValue = pickImportValue(row, ["كل كام يوم", "عدد الأيام", "customVisitIntervalDays"]);
        const normalizedVisitType = normalizeVisitType(visitTypeValue);
        const customVisitIntervalDays =
          normalizedVisitType.visitType === "CUSTOM"
            ? parseCustomVisitIntervalDays(customDaysValue) || normalizedVisitType.customVisitIntervalDays
            : null;
        const nextVisitDate = normalizeNextVisitDate(XLSX, nextVisitDateValue);
        const regionId = regionByCode.get(regionCode) || regionByName.get(normalizeImportKey(regionName));

        if (!name || !phone || !address || !products) {
          failedRows.push(`السطر ${rowNumber}: بيانات أساسية ناقصة`);
          return;
        }

        if (!regionId) {
          failedRows.push(`السطر ${rowNumber}: المنطقة غير معروفة`);
          return;
        }

        if (normalizedVisitType.visitType === "CUSTOM" && !customVisitIntervalDays) {
          failedRows.push(`السطر ${rowNumber}: نوع "ميعاد آخر" يحتاج عدد أيام`);
          return;
        }

        preparedRows.push({
          name,
          phone,
          address,
          locationUrl: locationUrl || undefined,
          regionId,
          products,
          price: price || undefined,
          visitType: normalizedVisitType.visitType,
          customVisitIntervalDays: customVisitIntervalDays || undefined,
          status: normalizeStatus(statusValue),
          nextVisitDate: nextVisitDate ? `${nextVisitDate}T00:00:00.000Z` : undefined
        });
      });

      if (!preparedRows.length) {
        throw new Error(failedRows[0] || "لم يتم العثور على صفوف صالحة للتوريد.");
      }

      let importedCount = 0;

      for (const chunk of chunkArray(preparedRows, 5)) {
        const results = await Promise.allSettled(chunk.map((row) => clientsApi.create(row)));

        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            importedCount += 1;
            return;
          }

          const failedRowIndex = importedCount + failedRows.length + index + 2;
          failedRows.push(`سطر تقريبي ${failedRowIndex}: ${result.reason?.message || "تعذر التوريد"}`);
        });
      }

      await loadClients();

      const failedSummary = failedRows.length ? ` تعذر توريد ${failedRows.length} صف.` : "";
      const failedPreview = failedRows.length ? ` ${failedRows.slice(0, 5).join(" | ")}` : "";
      setInfoMessage(`تم توريد ${importedCount} عميل بنجاح.${failedSummary}${failedPreview}`);
    } catch (err) {
      setError(err.message || "تعذر توريد ملف الإكسيل");
    } finally {
      setImportExcelLoading(false);
    }
  }

  const paginatedGroups = groupedClientsByRegion;

  return (
    <div className={`stack clients-page${isRepresentative ? " clients-page-representative" : ""}`}>
      {/* Toast notification */}
      {toast && (
        <div
          key={toast.message}
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: toast.type === "error" || toast.type === "danger" ? "#991b1b" : toast.type === "warning" ? "#b45309" : toast.type === "info" ? "#1e40af" : "#064e3b",
            color: "#fff",
            padding: "14px 24px",
            borderRadius: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            fontSize: "1rem",
            fontWeight: "700",
            lineHeight: "1.5",
            width: "auto",
            minWidth: "300px",
            maxWidth: "90vw",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            animation: "toastSlideIn 0.3s ease",
            direction: "rtl"
          }}
        >
          <span style={{ flex: 1, textAlign: "right", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
            {toast.message.replace("...", "")}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ flexShrink: 0, background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1.2rem", opacity: 0.8, padding: 0 }}
          >✕</button>
        </div>
      )}
      <section className="panel">
        <div className="panel-header split">
          <h3>العملاء</h3>
          {isAdmin && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="primary-btn" onClick={() => {
                if (showCreate && !isSaleCreate) { setShowCreate(false); }
                else { setShowCreate(true); setIsSaleCreate(false); setCreateForm({ ...initialCreateForm, visitType: "MONTHLY" }); }
              }}>
                {showCreate && !isSaleCreate ? "إغلاق نموذج الإضافة" : "إضافة عميل"}
              </button>
              <button type="button" className="primary-btn" style={{ background: "#b8860b" }} onClick={() => {
                if (showCreate && isSaleCreate) { setShowCreate(false); setIsSaleCreate(false); }
                else { setShowCreate(true); setIsSaleCreate(true); setCreateForm({ ...initialCreateForm, visitType: "ONE_TIME" }); }
              }}>
                {showCreate && isSaleCreate ? "إغلاق نموذج البيع" : "إضافة عميل بيع"}
              </button>
            </div>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}
        {infoMessage && <div className="info-box">{infoMessage}</div>}

        {isAdmin && overdueSummary.count > 0 && (
          <div className="overdue-banner" style={{
            background: "#ffebee",
            color: "#c62828",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "flex-start",
            border: "1px solid #ffcdd2",
            flexDirection: "column",
            gap: "8px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>⚠️</span>
              <strong style={{ fontSize: "1rem" }}>
                تنبيه هام: هناك عملاء لم يتم تحديد موقفهم في الأيام السابقة!
              </strong>
            </div>

            <div style={{ fontSize: "0.95rem", paddingRight: "30px", opacity: 0.9 }}>
              الأيام التي لم يتم تقفيلها بعد: <strong>{Array.from(new Set(overdueSummary.dates.map(d => {
                const dt = new Date(d);
                return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
              }))).join(" ، ")}</strong>
            </div>
          </div>
        )}

        {isAdmin && showCreate && (
          <form className="form-grid create-form clients-create-form" onSubmit={handleCreateClient} style={isSaleCreate ? { borderColor: "#d4af37", background: "linear-gradient(165deg, #fffef5 0%, #fdf8e8 100%)" } : undefined}>
            {isSaleCreate && (
              <div className="full-width" style={{ background: "rgba(212,175,55,0.12)", color: "#7a5c00", padding: "10px 14px", borderRadius: "10px", fontWeight: 700, textAlign: "center", border: "1px solid rgba(212,175,55,0.3)" }}>
                💰 نموذج إضافة عميل بيع (مرة واحدة فقط) — بعد تسجيل "تم التعامل" سيتم أرشفة العميل تلقائياً
              </div>
            )}
            <label>
              اسم العميل
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              رقم الهاتف
              <input
                value={createForm.phone}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
                required
              />
            </label>
            <label>
              العنوان
              <input
                value={createForm.address}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, address: event.target.value }))}
                required
              />
            </label>
            <label>
              لوكيشن العميل
              <input
                value={createForm.locationUrl}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, locationUrl: event.target.value }))}
              />
            </label>
            <label>
              المنطقة
              <select
                value={createForm.regionId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, regionId: event.target.value }))}
                required
              >
                <option value="">اختر المنطقة</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المنتجات
              <input
                value={createForm.products}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, products: event.target.value }))}
                required
              />
            </label>
            <label>
              السعر
              <input
                value={createForm.price}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="مثال: 150"
              />
            </label>
            {!isSaleCreate && (
              <label>
                نوع الزيارة
                <select
                  value={createForm.visitType}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      visitType: event.target.value,
                      customVisitIntervalDays:
                        event.target.value === "CUSTOM" ? prev.customVisitIntervalDays || "3" : ""
                    }))
                  }
                >
                  <option value="WEEKLY">أسبوعي</option>
                  <option value="BIWEEKLY">أسبوعين</option>
                  <option value="MONTHLY">شهري</option>
                  <option value="CUSTOM">ميعاد آخر</option>
                </select>
              </label>
            )}
            {!isSaleCreate && createForm.visitType === "CUSTOM" && (
              <label>
                كل كام يوم؟
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={createForm.customVisitIntervalDays}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, customVisitIntervalDays: event.target.value }))
                  }
                  required
                />
              </label>
            )}
            {!isSaleCreate && (
              <label>
                الحالة
                <select
                  value={createForm.status}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="ACTIVE">نشط</option>
                  <option value="NO_ANSWER">لم يرد</option>
                  <option value="REJECTED">كانسل</option>
                </select>
              </label>
            )}
            <label>
              {isSaleCreate ? "تاريخ البيع" : "تاريخ الزيارة القادمة"}
              <div className="clients-date-input form-date-input">
                <span className={createForm.nextVisitDate ? "clients-date-value" : "clients-date-placeholder"}>
                  {createNextVisitDateDisplay}
                </span>
                <span className="clients-date-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm13 8H4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1zm-1-4H5a1 1 0 0 0-1 1v1h16V7a1 1 0 0 0-1-1z" />
                  </svg>
                </span>
                <input
                  type="date"
                  className="clients-date-native-input"
                  value={createForm.nextVisitDate}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, nextVisitDate: event.target.value }))}
                  title={isSaleCreate ? "تاريخ البيع" : "تاريخ الزيارة القادمة"}
                  lang="ar-EG"
                />
              </div>
            </label>
            <label className="full-width">
              الملاحظات
              <textarea
                value={createForm.note}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="أضف ملاحظات عن العميل (اختياري)"
                rows="2"
              />
            </label>
            <button type="submit" className="primary-btn" disabled={createLoading} style={isSaleCreate ? { background: "#b8860b" } : undefined}>
              {createLoading ? "جارٍ الحفظ..." : isSaleCreate ? "حفظ عميل البيع" : "حفظ العميل"}
            </button>
          </form>
        )}

        {isAdmin && (
          <div className="tabs-row">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? "tab-btn active" : "tab-btn"}
                onClick={() => onTabChange(tab.key)}
                disabled={hasDueDateFilter}
                title={hasDueDateFilter ? "ألغِ فلتر التاريخ أولًا لاستخدام التبويبات" : tab.label}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}


        {hasDueDateFilter && isAdmin && (
          <div className="info-box">
            عرض العملاء المستحقين في تاريخ: {formatDate(`${selectedDueDate}T00:00:00.000Z`)}. تم تعطيل التبويبات
            مؤقتًا حتى يتم مسح فلتر التاريخ.
          </div>
        )}

        <div className="filters-row">
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو الهاتف أو العنوان..."
          />

          {isAdmin && (
            <>
              <button
                type="button"
                className="secondary-btn"
                disabled={copyPhonesLoading || loading}
                onClick={handleCopyAllPhones}
                title="نسخ كل الأرقام حسب الفلاتر الحالية"
              >
                {copyPhonesLoading ? "جاري تجميع الأرقام..." : "نسخ كل الأرقام"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                disabled={exportExcelLoading || loading}
                onClick={handleExportExcel}
                title="تصدير ملف إكسيل حسب الفلاتر الحالية"
              >
                {exportExcelLoading ? "جاري التصدير..." : "تصدير إكسيل"}
              </button>
            </>
          )}
          {isAdmin && (
            <div className="clients-date-filter">
              <span className="clients-date-label">تاريخ الاستحقاق</span>
              <div className="clients-date-input">
                <span className={selectedDueDate ? "clients-date-value" : "clients-date-placeholder"}>{selectedDueDateDisplay}</span>
                <span className="clients-date-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm13 8H4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1zm-1-4H5a1 1 0 0 0-1 1v1h16V7a1 1 0 0 0-1-1z" />
                  </svg>
                </span>
                <input
                  type="date"
                  className="clients-date-native-input"
                  value={selectedDueDate}
                  onChange={(event) => onDueDateChange(event.target.value)}
                  title="تاريخ الاستحقاق"
                  lang="ar-EG"
                />
              </div>
              <button
                type="button"
                className="ghost-btn calendar-mini-btn"
                onClick={() => onDueDateChange(getTodayInputDate())}
              >
                اليوم
              </button>
              <button
                type="button"
                className="ghost-btn calendar-mini-btn"
                disabled={!hasDueDateFilter}
                onClick={() => onDueDateChange("")}
              >
                مسح
              </button>
            </div>
          )}

          <button type="button" className="secondary-btn" onClick={loadClients}>
            تحديث
          </button>
          {isAdmin && (
            <>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleImportExcel}
              />
              <button
                type="button"
                className="primary-btn"
                disabled={importExcelLoading || loading}
                onClick={handleImportButtonClick}
                title="توريد العملاء من ملف إكسيل"
              >
                {importExcelLoading ? "جاري التوريد..." : "توريد"}
              </button>
            </>
          )}
        </div>

        {loading ? (
          <div className="table-empty">جاري تحميل العملاء...</div>
        ) : data.items.length === 0 ? (
          <div className="table-empty">لا توجد بيانات في هذا التصنيف</div>
        ) : (
          <div className="clients-region-groups">
            {paginatedGroups.map((group) => {
              const representativeNames = regionRepresentatives[group.regionId] || [];
              const isLoadingRepresentatives = Boolean(loadingRegionRepresentativeIds[group.regionId]);
              const isExpanded = Boolean(expandedRegionIds[group.regionId]);

              return (
                <section key={group.regionId || group.regionName} className="clients-region-group">
                  <div className="clients-region-group-header">
                    <div className="clients-region-group-meta">
                      <h4>{group.regionName}</h4>
                      {isAdmin && (
                        <p>
                          {isLoadingRepresentatives
                            ? "جاري تحميل بيانات المندوب..."
                            : representativeNames.length > 0
                              ? `المندوب: ${representativeNames.join(" - ")}`
                              : "لا يوجد مندوب محدد لهذه المنطقة"}
                        </p>
                      )}
                    </div>
                    <div className="clients-region-group-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ marginLeft: "10px", background: "#f0f0f0", color: "#333" }}
                        onClick={() => handleCopyRegionPhones(group)}
                        title="نسخ أرقام عملاء المنطقة المفتوحة حالياً"
                      >
                        📋 نسخ الأرقام
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ marginLeft: "10px", background: "#f0f0f0", color: "#333" }}
                          onClick={() => handlePrintRegion(group)}
                        >
                          🖨️ طباعة
                        </button>
                      )}
                      <strong>{group.clients.length} عميل</strong>
                      <button
                        type="button"
                        className={isExpanded ? "secondary-btn clients-region-toggle" : "primary-btn clients-region-toggle"}
                        onClick={() => toggleRegionGroup(group.regionId)}
                      >
                        {isExpanded ? "إخفاء" : "عرض"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="table-wrapper">
                      <table className="mobile-table clients-table">
                        <thead>
                          <tr>
                            <th className="col-checkbox" style={{ width: "40px" }}></th>
                            <th className="col-name">العميل</th>
                            <th className="col-phone">الهاتف</th>
                            <th className="col-address">العنوان</th>
                            <th className="col-location">اللوكيشن</th>
                            <th className="col-products">المنتجات</th>
                            <th className="col-price">السعر</th>
                            <th className="col-visit-type">الزيارة</th>
                            <th className="col-notes">الملاحظات</th>
                            <th className="col-actions">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          <ClientTableRows
                            clients={group.clients}
                            todayDateText={todayDateText}
                            actionState={actionState}
                            onHandleClient={handleClientOutcome}
                            onApproveVisit={handleApproveVisit}
                            onRejectVisit={handleRejectVisit}
                            isRepresentative={isRepresentative}
                            isAdmin={isAdmin}
                            selectedClientIds={selectedClientIds}
                            onToggleClientSelection={toggleClientSelection}
                          />
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <Pagination page={page} totalPages={totalRegionPages} onChange={setPage} />
      </section>

      {/* شريط الإجراءات الجماعية */}
      {selectedClientIds.size > 0 && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1e293b",
          color: "#fff",
          padding: "12px 24px",
          borderRadius: "50px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          zIndex: 9999,
          direction: "rtl"
        }}>
          <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
            تم تحديد ({selectedClientIds.size}) عميل
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => handleBulkOutcome("ACTIVE")} className="primary-btn" style={{ minHeight: "0", padding: "6px 16px", borderRadius: "20px" }}>تم التعامل</button>
            <button type="button" onClick={() => handleBulkOutcome("NO_ANSWER")} className="secondary-btn" style={{ minHeight: "0", padding: "6px 16px", borderRadius: "20px" }}>لم يرد</button>
            <button type="button" onClick={() => handleBulkOutcome("REJECTED")} className="danger-btn" style={{ minHeight: "0", padding: "6px 16px", borderRadius: "20px" }}>كانسل</button>
            <button type="button" onClick={() => setSelectedClientIds(new Set())} className="ghost-btn" style={{ minHeight: "0", padding: "6px 16px", borderRadius: "20px", color: "#ccc" }}>إلغاء التحديد</button>
          </div>
        </div>
      )}
    </div>
  );
}

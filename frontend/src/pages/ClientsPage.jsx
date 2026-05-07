import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clientsApi, regionsApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import Pagination from "../components/Pagination";
import StatusBadge from "../components/StatusBadge";
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
  { key: "NO_ANSWER", label: "لم يرد" },
  { key: "REJECTED", label: "كانسل" },
  { key: "PENDING", label: "في انتظار الاعتماد" }
];

const initialCreateForm = {
  name: "",
  phone: "",
  address: "",
  locationUrl: "",
  regionId: "",
  products: "",
  price: "",
  visitType: "WEEKLY",
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
  isRepresentative
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
      <tr key={client.id}>
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

        {!isRepresentative && (
          <>
          </>
        )}
        <td className="col-visit-type" data-label="الزيارة">
          <VisitTypeBadge type={client.visitType} customVisitIntervalDays={client.customVisitIntervalDays} />
        </td>
        <td className="col-next-visit" data-label="الزيارة القادمة">
          {client.status === "REJECTED" ? "-" : formatDateWithWeekday(client.nextVisitDate)}
        </td>
        <td className="col-notes" data-label="الملاحظات" className="details-note-text" title={client.visits?.[0]?.note || ""}>
          {client.visits?.[0]?.note || "-"}
        </td>

        <td className="actions-cell col-actions" data-label="الإجراءات">
          {isRepresentative && (dialHref || locationHref) && (
            <div className="rep-quick-actions" aria-label={`اختصارات العميل ${client.name}`}>
              {dialHref && (
                <a className="ghost-btn quick-action-btn" href={dialHref}>
                  اتصال
                </a>
              )}
              {locationHref && (
                <a className="ghost-btn quick-action-btn" href={locationHref} target="_blank" rel="noopener noreferrer">
                  خريطة
                </a>
              )}
            </div>
          )}

          {!isRepresentative && (
            <Link className="ghost-btn" to={`/clients/${client.id}`}>
              التفاصيل
            </Link>
          )}

          {!isRepresentative && client.status === "PENDING_APPROVAL" && (
            <div className="admin-approval-actions" style={{ display: "flex", gap: "5px" }}>
              <button
                type="button"
                className="primary-btn"
                disabled={isActionLoadingForClient}
                onClick={() => onApproveVisit(client)}
                style={{ background: "#28a745", borderColor: "#28a745" }}
              >
                {isApproveLoading ? "..." : "اعتماد"}
              </button>
              <button
                type="button"
                className="danger-btn"
                disabled={isActionLoadingForClient}
                onClick={() => onRejectVisit(client)}
              >
                {isRejectLoading ? "..." : "رفض"}
              </button>
            </div>
          )}

          {client.status !== "REJECTED" && client.status !== "PENDING_APPROVAL" && (
            <>
              <button
                type="button"
                className="primary-btn"
                disabled={isActionLoadingForClient}
                onClick={() => onHandleClient(client, "ACTIVE")}
              >
                {isHandleActionLoading ? "جاري..." : "تم التعامل"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                disabled={isActionLoadingForClient}
                onClick={() => onHandleClient(client, "NO_ANSWER")}
              >
                {isNoAnswerActionLoading ? "جاري..." : "لم يرد"}
              </button>
              {isRepresentative && (
                <button
                  type="button"
                  className="danger-btn"
                  disabled={isActionLoadingForClient}
                  onClick={() => onHandleClient(client, "REJECTED")}
                >
                  {isCancelActionLoading ? "جاري..." : "كانسل"}
                </button>
              )}
            </>
          )}
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

  const [regions, setRegions] = useState([]);
  const [regionRepresentatives, setRegionRepresentatives] = useState({});
  const [loadingRegionRepresentativeIds, setLoadingRegionRepresentativeIds] = useState({});
  const [expandedRegionIds, setExpandedRegionIds] = useState({});
  const [activeTab, setActiveTab] = useState("ALL");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedDueDate, setSelectedDueDate] = useState("");
  const [data, setData] = useState({ items: [], totalPages: 1, total: 0, page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState({ clientId: null, outcome: null });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [copyPhonesLoading, setCopyPhonesLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [importExcelLoading, setImportExcelLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const todayDateText = getTodayInputDate();
  const debouncedSearch = useDebouncedValue(search, 350);

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

  const buildClientListParams = useCallback(() => {
    const params = {
      page: 1,
      pageSize: 5000,
      search: debouncedSearch || undefined
    };

    if (hasDueDateFilter) {
      params.dueDate = selectedDueDate;
    } else {
      Object.assign(params, queryFilters);
    }

    return params;
  }, [debouncedSearch, hasDueDateFilter, queryFilters, selectedDueDate]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await clientsApi.list(buildClientListParams());
      setData(response.data);
      // Reset to first page when data changes (e.g. search/filter)
      setPage(1);
    } catch (err) {
      setError(err.message || "تعذر تحميل العملاء");
    } finally {
      setLoading(false);
    }
  }, [buildClientListParams]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

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
      setExpandedRegionIds({});
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

  useEffect(() => {
    if (!loading && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data.totalPages, loading, page]);

  async function handleApproveVisit(client) {
    if (actionState.clientId) return;
    setActionState({ clientId: client.id, outcome: "APPROVE" });
    setError("");
    setInfoMessage("");
    try {
      await clientsApi.approve(client.id);
      await loadClients();
      setInfoMessage("تم اعتماد الزيارة بنجاح.");
    } catch (err) {
      setError(err.message || "تعذر اعتماد الزيارة");
    } finally {
      setActionState({ clientId: null, outcome: null });
    }
  }

  async function handleRejectVisit(client) {
    if (actionState.clientId) return;
    setActionState({ clientId: client.id, outcome: "REJECT" });
    setError("");
    setInfoMessage("");
    try {
      await clientsApi.reject(client.id);
      await loadClients();
      setInfoMessage("تم رفض الزيارة بنجاح.");
    } catch (err) {
      setError(err.message || "تعذر رفض الزيارة");
    } finally {
      setActionState({ clientId: null, outcome: null });
    }
  }

  async function handleClientOutcome(client, outcome) {
    setActionState({ clientId: client.id, outcome });
    setError("");
    setInfoMessage("");

    try {
      await clientsApi.handle(client.id, {
        outcome
      });
      await loadClients();

      if (isRepresentative) {
        setInfoMessage("تم إرسال الطلب بنجاح وهو الآن في انتظار اعتماد الإدارة.");
      } else {
        setInfoMessage("تم تحديث حالة العميل بنجاح.");
      }
    } catch (err) {
      setError(err.message || "تعذر تحديث حالة العميل");
    } finally {
      setActionState({ clientId: null, outcome: null });
    }
  }

  async function handleCreateClient(event) {
    event.preventDefault();
    setCreateLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const customVisitIntervalDays =
        createForm.visitType === "CUSTOM" ? parseCustomVisitIntervalDays(createForm.customVisitIntervalDays) : null;

      if (createForm.visitType === "CUSTOM" && !customVisitIntervalDays) {
        throw new Error("حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
      }

      await clientsApi.create({
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
      });

      setCreateForm(initialCreateForm);
      setShowCreate(false);
      await loadClients();
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

  function applyRepresentativeQuickFilter(type) {
    setSearch("");
    setPage(1);

    if (type === "TODAY_DUE") {
      setSelectedDueDate(todayDateText);
      setActiveTab("ALL");
      return;
    }

    if (type === "NO_ANSWER") {
      setSelectedDueDate("");
      setActiveTab("NO_ANSWER");
      return;
    }

    setSelectedDueDate("");
    setActiveTab("ALL");
  }

  async function handleCopyAllPhones() {
    setCopyPhonesLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const firstPageResponse = await clientsApi.list(buildClientListParams(1, 100));
      const firstPageData = firstPageResponse.data || {};
      const allItems = [...(firstPageData.items || [])];
      const totalPages = Math.max(1, Number(firstPageData.totalPages || 1));

      for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        const response = await clientsApi.list(buildClientListParams(currentPage, 100));
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
    if (password !== "123") {
      alert("كلمة المرور غير صحيحة!");
      return;
    }

    setExportExcelLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const firstPageResponse = await clientsApi.list(buildClientListParams(1, 100));
      const firstPageData = firstPageResponse.data || {};
      const allItems = [...(firstPageData.items || [])];
      const totalPages = Math.max(1, Number(firstPageData.totalPages || 1));

      for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        const response = await clientsApi.list(buildClientListParams(currentPage, 100));
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

  const regionPageSize = 10;
  const totalRegionPages = Math.ceil(groupedClientsByRegion.length / regionPageSize);
  const paginatedGroups = groupedClientsByRegion.slice((page - 1) * regionPageSize, page * regionPageSize);

  return (
    <div className={`stack clients-page${isRepresentative ? " clients-page-representative" : ""}`}>
      <section className="panel">
        <div className="panel-header split">
          <h3>العملاء</h3>
          {isAdmin && (
            <button type="button" className="primary-btn" onClick={() => setShowCreate((prev) => !prev)}>
              {showCreate ? "إغلاق نموذج الإضافة" : "إضافة عميل"}
            </button>
          )}
        </div>

        {isAdmin && showCreate && (
          <form className="form-grid create-form clients-create-form" onSubmit={handleCreateClient}>
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
            {createForm.visitType === "CUSTOM" && (
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
            <label>
              تاريخ الزيارة القادمة
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
                  title="تاريخ الزيارة القادمة"
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
            <button type="submit" className="primary-btn" disabled={createLoading}>
              {createLoading ? "جارٍ الحفظ..." : "حفظ العميل"}
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

        {isRepresentative && (
          <div className="rep-mobile-shortcuts" role="group" aria-label="اختصارات سريعة للمندوب">
            <button
              type="button"
              className={
                hasDueDateFilter && selectedDueDate === todayDateText
                  ? "primary-btn rep-shortcut-btn"
                  : "ghost-btn rep-shortcut-btn"
              }
              onClick={() => applyRepresentativeQuickFilter("TODAY_DUE")}
            >
              مستحق اليوم
            </button>
            <button
              type="button"
              className={!hasDueDateFilter && activeTab === "NO_ANSWER" ? "primary-btn rep-shortcut-btn" : "ghost-btn rep-shortcut-btn"}
              onClick={() => applyRepresentativeQuickFilter("NO_ANSWER")}
            >
              لم يرد
            </button>
            <button
              type="button"
              className={!hasDueDateFilter && activeTab === "ALL" ? "primary-btn rep-shortcut-btn" : "ghost-btn rep-shortcut-btn"}
              onClick={() => applyRepresentativeQuickFilter("ALL")}
            >
              كل العملاء
            </button>
          </div>
        )}

        {hasDueDateFilter && (
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

        {error && <div className="error-box">{error}</div>}
        {infoMessage && <div className="info-box">{infoMessage}</div>}

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
                      <p>
                        {isLoadingRepresentatives
                          ? "جاري تحميل بيانات المندوب..."
                          : representativeNames.length > 0
                          ? `المندوب: ${representativeNames.join(" - ")}`
                          : "لا يوجد مندوب محدد لهذه المنطقة"}
                      </p>
                    </div>
                    <div className="clients-region-group-actions">
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
                            <th className="col-name">العميل</th>
                            <th className="col-phone">الهاتف</th>
                            <th className="col-address">العنوان</th>
                            <th className="col-location">اللوكيشن</th>
                            <th className="col-products">المنتجات</th>
                            <th className="col-price">السعر</th>
                            {!isRepresentative && (
                              <>
                              </>
                            )}
                            <th className="col-visit-type">الزيارة</th>
                            <th className="col-next-visit">الزيارة القادمة</th>
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
    </div>
  );
}

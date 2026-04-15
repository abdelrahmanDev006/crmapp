import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clientsApi, regionsApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import Pagination from "../components/Pagination";
import StatusBadge from "../components/StatusBadge";
import VisitTypeBadge from "../components/VisitTypeBadge";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate, formatDateWithWeekday } from "../utils/formatters";

const tabs = [
  { key: "ALL", label: "جميع العملاء" },
  { key: "WEEKLY", label: "أسبوعي" },
  { key: "BIWEEKLY", label: "كل أسبوعين" },
  { key: "MONTHLY", label: "شهري" },
  { key: "NO_ANSWER", label: "لم يرد" },
  { key: "REJECTED", label: "مرفوض" }
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
  status: "ACTIVE",
  nextVisitDate: ""
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

export default function ClientsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [regions, setRegions] = useState([]);
  const [activeTab, setActiveTab] = useState("ALL");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [selectedDueDate, setSelectedDueDate] = useState("");
  const [data, setData] = useState({ items: [], totalPages: 1, total: 0, page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionClientId, setActionClientId] = useState(null);
  const [deleteClientId, setDeleteClientId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [copyPhonesLoading, setCopyPhonesLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const todayDateText = getTodayInputDate();
  const debouncedSearch = useDebouncedValue(search, 350);

  const queryFilters = useMemo(() => mapTabToFilters(activeTab), [activeTab]);
  const hasDueDateFilter = Boolean(selectedDueDate);
  const selectedDueDateDisplay = selectedDueDate ? formatDate(`${selectedDueDate}T00:00:00.000Z`) : "يوم/شهر/سنة";
  const createNextVisitDateDisplay = createForm.nextVisitDate
    ? formatDateWithWeekday(`${createForm.nextVisitDate}T00:00:00.000Z`)
    : "يوم/شهر/سنة";

  const buildClientListParams = useCallback((targetPage = 1, targetPageSize = 20) => {
    const params = {
      page: targetPage,
      pageSize: targetPageSize,
      search: debouncedSearch || undefined
    };

    if (hasDueDateFilter) {
      params.dueDate = selectedDueDate;
    } else {
      Object.assign(params, queryFilters);
    }

    if (isAdmin && selectedRegionId) {
      params.regionId = Number(selectedRegionId);
    }

    return params;
  }, [debouncedSearch, hasDueDateFilter, isAdmin, queryFilters, selectedDueDate, selectedRegionId]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await clientsApi.list(buildClientListParams(page, 20));
      setData(response.data);
    } catch (err) {
      setError(err.message || "تعذر تحميل العملاء");
    } finally {
      setLoading(false);
    }
  }, [buildClientListParams, page]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let mounted = true;

    async function loadRegions() {
      try {
        const response = await regionsApi.list();
        if (mounted) {
          setRegions(response.data.items || []);
        }
      } catch {
        // Regions filter is optional on this page.
      }
    }

    loadRegions();

    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!loading && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data.totalPages, loading, page]);

  async function handleClientAction(clientId) {
    setActionClientId(clientId);
    setInfoMessage("");

    try {
      await clientsApi.handle(clientId, {
        outcome: "ACTIVE",
        note: "تم التعامل مع العميل"
      });
      await loadClients();
    } catch (err) {
      setError(err.message || "تعذر تحديث حالة العميل");
    } finally {
      setActionClientId(null);
    }
  }

  async function handleDeleteClient(client) {
    const confirmed = window.confirm(`هل تريد حذف العميل "${client.name}"؟`);
    if (!confirmed) {
      return;
    }

    setDeleteClientId(client.id);
    setError("");
    setInfoMessage("");

    try {
      await clientsApi.remove(client.id);
      await loadClients();
    } catch (err) {
      setError(err.message || "تعذر حذف العميل");
    } finally {
      setDeleteClientId(null);
    }
  }

  async function handleCreateClient(event) {
    event.preventDefault();
    setCreateLoading(true);
    setError("");
    setInfoMessage("");

    try {
      await clientsApi.create({
        name: createForm.name,
        phone: createForm.phone,
        address: createForm.address,
        locationUrl: createForm.locationUrl || undefined,
        regionId: Number(createForm.regionId),
        products: createForm.products,
        price: createForm.price || undefined,
        visitType: createForm.visitType,
        status: createForm.status,
        nextVisitDate: createForm.nextVisitDate ? `${createForm.nextVisitDate}T00:00:00.000Z` : undefined
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

  return (
    <div className="stack">
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
                onChange={(event) => setCreateForm((prev) => ({ ...prev, visitType: event.target.value }))}
              >
                <option value="WEEKLY">أسبوعي</option>
                <option value="BIWEEKLY">كل أسبوعين</option>
                <option value="MONTHLY">شهري</option>
              </select>
            </label>
            <label>
              الحالة
              <select
                value={createForm.status}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="ACTIVE">نشط</option>
                <option value="NO_ANSWER">لم يرد</option>
                <option value="REJECTED">رفض التعامل</option>
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
            <button type="submit" className="primary-btn" disabled={createLoading}>
              {createLoading ? "جارٍ الحفظ..." : "حفظ العميل"}
            </button>
          </form>
        )}

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

          {isAdmin && (
            <select
              value={selectedRegionId}
              onChange={(event) => {
                setSelectedRegionId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">كل المناطق</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}

          <button type="button" className="secondary-btn" onClick={loadClients}>
            تحديث
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={copyPhonesLoading || loading}
            onClick={handleCopyAllPhones}
            title="نسخ كل الأرقام حسب الفلاتر الحالية"
          >
            {copyPhonesLoading ? "جاري تجميع الأرقام..." : "نسخ كل الأرقام"}
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}
        {infoMessage && <div className="info-box">{infoMessage}</div>}

        {loading ? (
          <div className="table-empty">جاري تحميل العملاء...</div>
        ) : data.items.length === 0 ? (
          <div className="table-empty">لا توجد بيانات في هذا التصنيف</div>
        ) : (
          <div className="table-wrapper">
            <table className="mobile-table clients-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>الهاتف</th>
                  <th>العنوان</th>
                  <th>اللوكيشن</th>
                  <th>المنطقة</th>
                  <th>المنتجات</th>
                  <th>السعر</th>
                  <th>الزيارة</th>
                  <th>الحالة</th>
                  <th>الزيارة القادمة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((client) => {
                  const clientIsNew = isNewClient(client.createdAt, todayDateText);
                  const locationHref = getLocationHref(client.locationUrl);

                  return (
                    <tr key={client.id}>
                      <td data-label="\u0627\u0644\u0639\u0645\u064a\u0644">
                        <div className="client-name-cell">
                          <span className="client-name-text">{client.name}</span>
                          <span className={clientIsNew ? "client-freshness-pill client-freshness-new" : "client-freshness-pill client-freshness-old"}>
                            {clientIsNew ? "جديد" : "قديم"}
                          </span>
                        </div>
                      </td>
                      <td data-label="\u0627\u0644\u0647\u0627\u062a\u0641">{client.phone}</td>
                      <td data-label="\u0627\u0644\u0639\u0646\u0648\u0627\u0646">{client.address}</td>
                      <td data-label="\u0627\u0644\u0644\u0648\u0643\u064a\u0634\u0646">
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
                      <td data-label="\u0627\u0644\u0645\u0646\u0637\u0642\u0629">{client.region?.name}</td>
                      <td data-label="\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a">{client.products}</td>
                      <td data-label="\u0627\u0644\u0633\u0639\u0631">{client.price || "-"}</td>
                      <td data-label="\u0627\u0644\u0632\u064a\u0627\u0631\u0629">
                        <VisitTypeBadge type={client.visitType} />
                      </td>
                      <td data-label="\u0627\u0644\u062d\u0627\u0644\u0629">
                        <StatusBadge status={client.status} />
                      </td>
                      <td data-label="\u0627\u0644\u0632\u064a\u0627\u0631\u0629 \u0627\u0644\u0642\u0627\u062f\u0645\u0629">{formatDateWithWeekday(client.nextVisitDate)}</td>
                      <td className="actions-cell" data-label="\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a">
                        <Link className="ghost-btn" to={`/clients/${client.id}`}>
                          التفاصيل
                        </Link>
                        {client.status !== "REJECTED" && (
                          <button
                            type="button"
                            className="primary-btn"
                            disabled={actionClientId === client.id}
                            onClick={() => handleClientAction(client.id)}
                          >
                            {actionClientId === client.id ? "جاري..." : "تم التعامل"}
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            className="danger-btn"
                            disabled={deleteClientId === client.id}
                            onClick={() => handleDeleteClient(client)}
                          >
                            {deleteClientId === client.id ? "جاري الحذف..." : "حذف"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      </section>
    </div>
  );
}

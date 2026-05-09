import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { clientsApi, regionsApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import StatusBadge from "../components/StatusBadge";
import VisitTypeBadge from "../components/VisitTypeBadge";
import { formatDate, formatDateWithWeekday } from "../utils/formatters";

function toInputDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function parseCustomVisitIntervalDays(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return null;
  }

  return parsed;
}

export default function ClientDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [client, setClient] = useState(null);
  const [regions, setRegions] = useState([]);
  const [nextVisitType, setNextVisitType] = useState("WEEKLY");
  const [nextCustomVisitIntervalDays, setNextCustomVisitIntervalDays] = useState("3");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [saveDetailsLoading, setSaveDetailsLoading] = useState(false);
  const [note, setNote] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLocationUrl, setEditLocationUrl] = useState("");
  const [editRegionId, setEditRegionId] = useState("");
  const [editProducts, setEditProducts] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNextVisitDate, setEditNextVisitDate] = useState("");
  const [editVisitType, setEditVisitType] = useState("WEEKLY");
  const [editCustomVisitIntervalDays, setEditCustomVisitIntervalDays] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editNote, setEditNote] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/clients");
  }

  const loadClient = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await clientsApi.getById(id);
      const item = response.data.item;
      setClient(item);
      const normalizedVisitType = ["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"].includes(item.visitType)
        ? item.visitType
        : "MONTHLY";
      setNextVisitType(normalizedVisitType);
      setNextCustomVisitIntervalDays(
        item.visitType === "CUSTOM"
          ? String(item.customVisitIntervalDays || 3)
          : "3"
      );
      setEditName(item.name || "");
      setEditPhone(item.phone || "");
      setEditAddress(item.address || "");
      setEditLocationUrl(item.locationUrl || "");
      setEditRegionId(String(item.region?.id || ""));
      setEditProducts(item.products || "");
      setEditPrice(item.price || "");
      setEditNextVisitDate(toInputDate(item.nextVisitDate));
      setEditVisitType(normalizedVisitType);
      setEditCustomVisitIntervalDays(
        item.visitType === "CUSTOM"
          ? String(item.customVisitIntervalDays || "")
          : ""
      );
      setEditStatus(item.status || "ACTIVE");
      const visits = Array.isArray(item.visits) ? item.visits : [];
      const latestNote = visits.find((v) => v?.note !== null && v?.note !== undefined);
      setEditNote(latestNote && latestNote.note !== "" ? String(latestNote.note) : "");
    } catch (err) {
      setError(err.message || "تعذر تحميل بيانات العميل");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

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
        if (mounted) {
          setRegions([]);
        }
      }
    }

    loadRegions();

    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  const locationHref = useMemo(() => getLocationHref(client?.locationUrl), [client?.locationUrl]);
  const currentNextVisitInputDate = useMemo(() => toInputDate(client?.nextVisitDate), [client?.nextVisitDate]);
  const latestVisitNote = useMemo(() => {
    const visits = Array.isArray(client?.visits) ? client.visits : [];
    const latestVisitWithNote = visits.find((visit) => visit?.note !== null && visit?.note !== undefined);

    if (!latestVisitWithNote || latestVisitWithNote.note === "") {
      return "-";
    }

    return String(latestVisitWithNote.note);
  }, [client?.visits]);
  const editNextVisitDateDisplay = editNextVisitDate ? formatDateWithWeekday(`${editNextVisitDate}T00:00:00.000Z`) : "يوم/شهر/سنة";
  const hasDetailsChanges = useMemo(() => {
    if (!client) {
      return false;
    }

    return (
      editName !== (client.name || "") ||
      editPhone !== (client.phone || "") ||
      editAddress !== (client.address || "") ||
      editLocationUrl !== (client.locationUrl || "") ||
      editRegionId !== String(client.region?.id || "") ||
      editProducts !== (client.products || "") ||
      editPrice !== (client.price || "") ||
      editNextVisitDate !== currentNextVisitInputDate ||
      editVisitType !== (client.visitType || "WEEKLY") ||
      editStatus !== (client.status || "ACTIVE") ||
      (editVisitType === "CUSTOM" &&
        editCustomVisitIntervalDays !== String(client.customVisitIntervalDays || "")) ||
      editNote !== (latestVisitNote === "-" ? "" : latestVisitNote)
    );
  }, [
    client,
    currentNextVisitInputDate,
    editAddress,
    editCustomVisitIntervalDays,
    editLocationUrl,
    editName,
    editNextVisitDate,
    editNote,
    editPhone,
    editPrice,
    editProducts,
    editRegionId,
    editStatus,
    editVisitType,
    latestVisitNote
  ]);

  async function submitOutcome(outcome) {
    setActionLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const customVisitIntervalDays =
        nextVisitType === "CUSTOM" ? parseCustomVisitIntervalDays(nextCustomVisitIntervalDays) : null;

      if (nextVisitType === "CUSTOM" && !customVisitIntervalDays) {
        throw new Error("حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
      }

      await clientsApi.handle(id, {
        outcome,
        note: note || undefined,
        visitType: nextVisitType,
        customVisitIntervalDays: customVisitIntervalDays || undefined
      });
      setNote("");
      await loadClient();
    } catch (err) {
      setError(err.message || "تعذر تحديث الحالة");
    } finally {
      setActionLoading(false);
    }
  }

  async function submitClientDetailsUpdate() {
    setSaveDetailsLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const customVisitIntervalDays =
        editVisitType === "CUSTOM" ? parseCustomVisitIntervalDays(editCustomVisitIntervalDays) : null;

      if (editVisitType === "CUSTOM" && !customVisitIntervalDays) {
        throw new Error("حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
      }

      const updatePayload = {
        name: editName,
        phone: editPhone,
        address: editAddress,
        locationUrl: editLocationUrl,
        regionId: editRegionId ? Number(editRegionId) : undefined,
        products: editProducts,
        price: editPrice,
        visitType: editVisitType,
        status: editStatus,
        customVisitIntervalDays: editVisitType === "CUSTOM" ? customVisitIntervalDays : undefined,
        nextVisitDate: editNextVisitDate ? `${editNextVisitDate}T00:00:00.000Z` : undefined,
        note: editNote.trim()
      };

      try {
        await clientsApi.update(id, updatePayload);
      } catch (apiErr) {
        if (apiErr.response?.status === 409 && apiErr.response?.data?.message) {
          const confirmAdd = window.confirm(apiErr.response.data.message + "\n\nهل تريد المتابعة وتحديث العميل على أي حال؟");
          if (confirmAdd) {
            await clientsApi.update(id, { ...updatePayload, force: true });
          } else {
            return; // User cancelled
          }
        } else {
          throw apiErr;
        }
      }

      setInfoMessage("تم تحديث بيانات العميل بنجاح");
      await loadClient();
    } catch (err) {
      setError(err.message || "تعذر تحديث بيانات العميل");
    } finally {
      setSaveDetailsLoading(false);
    }
  }

  if (loading) {
    return <section className="panel">جاري تحميل العميل...</section>;
  }

  if (!client) {
    return (
      <section className="panel error-box">
        العميل غير موجود
        <div style={{ marginTop: "10px" }}>
          <button type="button" className="secondary-btn" onClick={goBack}>
            العودة للعملاء
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header split">
          <div>
            <h3>{client.name}</h3>
            <p>{client.region?.name}</p>
          </div>
          <div className="action-bar">
            <button type="button" className="secondary-btn" onClick={goBack}>
              العودة للعملاء
            </button>
          </div>
        </div>

        {client.status === "REJECTED" && (
          <div className="info-box">
            هذا العميل في قائمة الكانسل حاليًا. يمكنك إعادة تفعيله في أي وقت وإرسال عروض أو منتجات جديدة.
          </div>
        )}

        <div className={`details-grid client-row-${client.visitType}`}>
          <div>
            <span>الهاتف</span>
            <strong>{client.phone}</strong>
          </div>
          <div>
            <span>العنوان</span>
            <strong>{client.address}</strong>
          </div>
          <div>
            <span>اللوكيشن</span>
            {locationHref ? (
              <a href={locationHref} target="_blank" rel="noopener noreferrer" className="ghost-btn inline-btn">
                فتح اللوكيشن
              </a>
            ) : (
              <strong>-</strong>
            )}
          </div>
          <div>
            <span>المنتجات</span>
            <strong>{client.products}</strong>
          </div>
          <div>
            <span>السعر</span>
            <strong>{client.price || "-"}</strong>
          </div>
          <div>
            <span>الحالة</span>
            <StatusBadge status={client.status} noAnswerCount={client.noAnswerCount} />
          </div>
          <div>
            <span>نوع الزيارة</span>
            <VisitTypeBadge
              type={client.visitType}
              customVisitIntervalDays={client.customVisitIntervalDays}
            />
          </div>
          <div>
            <span>الملاحظات</span>
            <strong className="details-note-text">{latestVisitNote}</strong>
          </div>
          <div>
            <span>الزيارة القادمة</span>
            <strong>{client.status === "REJECTED" ? "-" : formatDateWithWeekday(client.nextVisitDate)}</strong>
          </div>
        </div>

        {isAdmin && (
          <>
            {showEditForm && (
              <div className="client-edit-form" style={{ marginTop: "20px" }}>
                <h4 className="client-edit-title">✏️ تعديل بيانات العميل</h4>
            <div className="client-edit-grid">
              <label className="client-edit-field">
                <span className="client-edit-label">اسم العميل</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="أدخل اسم العميل"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">رقم الهاتف</span>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(event) => setEditPhone(event.target.value)}
                  placeholder="أدخل رقم الهاتف"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">العنوان</span>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(event) => setEditAddress(event.target.value)}
                  placeholder="أدخل العنوان"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">رابط اللوكيشن (Google Maps)</span>
                <input
                  type="text"
                  value={editLocationUrl}
                  onChange={(event) => setEditLocationUrl(event.target.value)}
                  placeholder="أدخل رابط اللوكيشن"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">المنطقة</span>
                <select
                  value={editRegionId}
                  onChange={(event) => setEditRegionId(event.target.value)}
                  disabled={saveDetailsLoading || actionLoading || regions.length === 0}
                >
                  <option value="">اختر المنطقة</option>
                  {regions.map((regionOption) => (
                    <option key={regionOption.id} value={regionOption.id}>
                      {regionOption.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">المنتجات</span>
                <input
                  type="text"
                  value={editProducts}
                  onChange={(event) => setEditProducts(event.target.value)}
                  placeholder="أدخل المنتجات"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">السعر</span>
                <input
                  type="text"
                  value={editPrice}
                  onChange={(event) => setEditPrice(event.target.value)}
                  placeholder="أدخل السعر"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">الحالة</span>
                <select
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value)}
                  disabled={saveDetailsLoading || actionLoading}
                >
                  <option value="ACTIVE">نشط</option>
                  <option value="NO_ANSWER">لم يرد</option>
                  <option value="REJECTED">كانسل</option>
                </select>
              </label>
              <label className="client-edit-field">
                <span className="client-edit-label">نوع الزيارة</span>
                <select
                  value={editVisitType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setEditVisitType(nextType);
                    if (nextType !== "CUSTOM") {
                      setEditCustomVisitIntervalDays("");
                    } else if (!editCustomVisitIntervalDays) {
                      setEditCustomVisitIntervalDays(String(client.customVisitIntervalDays || 3));
                    }
                  }}
                  disabled={saveDetailsLoading || actionLoading}
                >
                  <option value="WEEKLY">أسبوعي</option>
                  <option value="BIWEEKLY">أسبوعين</option>
                  <option value="MONTHLY">شهري</option>
                  <option value="CUSTOM">ميعاد آخر</option>
                </select>
              </label>
              {editVisitType === "CUSTOM" && (
                <label className="client-edit-field">
                  <span className="client-edit-label">كل كام يوم؟</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={editCustomVisitIntervalDays}
                    onChange={(event) => setEditCustomVisitIntervalDays(event.target.value)}
                    placeholder="عدد الأيام"
                    disabled={saveDetailsLoading || actionLoading}
                  />
                </label>
              )}
              <label className="client-edit-field">
                <span className="client-edit-label">تاريخ الزيارة القادمة</span>
                <div className="clients-date-input inline-date-control">
                  <span className={editNextVisitDate ? "clients-date-value" : "clients-date-placeholder"}>
                    {editNextVisitDateDisplay}
                  </span>
                  <span className="clients-date-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm13 8H4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1zm-1-4H5a1 1 0 0 0-1 1v1h16V7a1 1 0 0 0-1-1z" />
                    </svg>
                  </span>
                  <input
                    type="date"
                    className="clients-date-native-input"
                    value={editNextVisitDate}
                    onChange={(event) => setEditNextVisitDate(event.target.value)}
                    title="تاريخ الزيارة القادمة"
                    lang="ar-EG"
                    disabled={saveDetailsLoading || actionLoading}
                  />
                </div>
              </label>
              <label className="client-edit-field client-edit-field-full">
                <span className="client-edit-label">الملاحظات</span>
                <input
                  type="text"
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                  placeholder="أدخل أو عدّل الملاحظات"
                  disabled={saveDetailsLoading || actionLoading}
                />
              </label>
            </div>
            <div className="client-edit-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={saveDetailsLoading || actionLoading || !hasDetailsChanges}
                onClick={submitClientDetailsUpdate}
              >
                {saveDetailsLoading ? "جاري الحفظ..." : "💾 حفظ بيانات العميل"}
              </button>
            </div>
          </div>
            )}
          </>
        )}

        <div className="action-bar" style={{ marginTop: "20px", borderTop: "2px solid var(--border)", paddingTop: "16px" }}>
          <button type="button" className="primary-btn" disabled={actionLoading} onClick={() => submitOutcome("ACTIVE")}>
            تم التعامل
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={actionLoading}
            onClick={() => submitOutcome("NO_ANSWER")}
          >
            لم يرد
          </button>
          <button
            type="button"
            className="danger-btn"
            disabled={actionLoading}
            onClick={() => submitOutcome("REJECTED")}
          >
            كانسل
          </button>
          {isAdmin && (
            <button 
              type="button" 
              className="secondary-btn" 
              style={{ marginRight: "auto", background: "#f0f0f0", color: "#333", border: "1px solid #ccc" }}
              onClick={() => setShowEditForm(!showEditForm)}
            >
              {showEditForm ? "إخفاء التعديلات ⬆️" : "عرض التعديلات ✏️"}
            </button>
          )}
        </div>

        {infoMessage && <div className="info-box">{infoMessage}</div>}
        {error && <div className="error-box">{error}</div>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>سجل الزيارات</h3>
        </div>

        {client.visits?.length ? (
          <div className="table-wrapper">
            <table className="visit-history-table mobile-table">
              <thead>
                <tr>
                  <th>تاريخ الزيارة</th>
                  <th>الحالة السابقة</th>
                  <th>الحالة الجديدة</th>
                  <th>التاريخ السابق</th>
                  <th>التاريخ الجديد</th>
                  <th>بواسطة</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {client.visits.map((visit) => (
                  <tr key={visit.id}>
                    <td data-label="تاريخ الزيارة">{formatDate(visit.visitDate)}</td>
                    <td data-label="الحالة السابقة">
                      <StatusBadge status={visit.previousStatus} />
                    </td>
                    <td data-label="الحالة الجديدة">
                      <StatusBadge status={visit.newStatus} />
                    </td>
                    <td data-label="التاريخ السابق">{formatDate(visit.previousNextVisitDate)}</td>
                    <td data-label="التاريخ الجديد">{formatDate(visit.newNextVisitDate)}</td>
                    <td data-label="بواسطة">{visit.visitedBy?.name || "-"}</td>
                    <td data-label="ملاحظة">{visit.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-empty">لا يوجد زيارات مسجلة بعد</div>
        )}
      </section>
    </div>
  );
}

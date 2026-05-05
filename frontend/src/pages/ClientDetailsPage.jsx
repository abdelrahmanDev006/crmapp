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
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [note, setNote] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editRegionId, setEditRegionId] = useState("");
  const [editProducts, setEditProducts] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNextVisitDate, setEditNextVisitDate] = useState("");
  const [editCustomVisitIntervalDays, setEditCustomVisitIntervalDays] = useState("");
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
      setClient(response.data.item);
      const normalizedVisitType = ["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"].includes(response.data.item.visitType)
        ? response.data.item.visitType
        : "MONTHLY";
      setNextVisitType(normalizedVisitType);
      setNextCustomVisitIntervalDays(
        response.data.item.visitType === "CUSTOM"
          ? String(response.data.item.customVisitIntervalDays || 3)
          : "3"
      );
      setEditPhone(response.data.item.phone || "");
      setEditAddress(response.data.item.address || "");
      setEditRegionId(String(response.data.item.region?.id || ""));
      setEditProducts(response.data.item.products || "");
      setEditPrice(response.data.item.price || "");
      setEditNextVisitDate(toInputDate(response.data.item.nextVisitDate));
      setEditCustomVisitIntervalDays(
        response.data.item.visitType === "CUSTOM"
          ? String(response.data.item.customVisitIntervalDays || "")
          : ""
      );
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
    const latestVisitWithNote = visits.find((visit) => String(visit?.note || "").trim().length > 0);

    if (!latestVisitWithNote) {
      return "-";
    }

    return String(latestVisitWithNote.note || "").trim();
  }, [client?.visits]);
  const editNextVisitDateDisplay = editNextVisitDate ? formatDateWithWeekday(`${editNextVisitDate}T00:00:00.000Z`) : "يوم/شهر/سنة";
  const hasDetailsChanges = useMemo(() => {
    if (!client) {
      return false;
    }

    return (
      editPhone !== (client.phone || "") ||
      editAddress !== (client.address || "") ||
      editRegionId !== String(client.region?.id || "") ||
      editProducts !== (client.products || "") ||
      editPrice !== (client.price || "") ||
      editNextVisitDate !== currentNextVisitInputDate ||
      (client.visitType === "CUSTOM" &&
        editCustomVisitIntervalDays !== String(client.customVisitIntervalDays || ""))
    );
  }, [
    client,
    currentNextVisitInputDate,
    editAddress,
    editCustomVisitIntervalDays,
    editNextVisitDate,
    editPhone,
    editPrice,
    editProducts,
    editRegionId
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
        client.visitType === "CUSTOM" ? parseCustomVisitIntervalDays(editCustomVisitIntervalDays) : null;

      if (client.visitType === "CUSTOM" && !customVisitIntervalDays) {
        throw new Error("حدد عدد الأيام لنوع الزيارة (ميعاد آخر)");
      }

      await clientsApi.update(id, {
        phone: editPhone,
        address: editAddress,
        regionId: editRegionId ? Number(editRegionId) : undefined,
        products: editProducts,
        price: editPrice,
        customVisitIntervalDays: client.visitType === "CUSTOM" ? customVisitIntervalDays : undefined,
        nextVisitDate: editNextVisitDate ? `${editNextVisitDate}T00:00:00.000Z` : undefined
      });
      setInfoMessage("تم تحديث بيانات العميل بنجاح");
      await loadClient();
    } catch (err) {
      setError(err.message || "تعذر تحديث بيانات العميل");
    } finally {
      setSaveDetailsLoading(false);
    }
  }

  async function handleDeleteClient() {
    const confirmed = window.confirm(`هل تريد حذف العميل "${client.name}"؟`);
    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);
    setError("");
    setInfoMessage("");

    try {
      await clientsApi.remove(id);
      navigate("/clients");
    } catch (err) {
      setError(err.message || "تعذر حذف العميل");
    } finally {
      setDeleteLoading(false);
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
            {isAdmin && (
              <button
                type="button"
                className="danger-btn"
                disabled={deleteLoading || actionLoading || saveDetailsLoading}
                onClick={handleDeleteClient}
              >
                {deleteLoading ? "جاري الحذف..." : "حذف العميل"}
              </button>
            )}
          </div>
        </div>

        {client.status === "REJECTED" && (
          <div className="info-box">
            هذا العميل في قائمة الكانسل حاليًا. يمكنك إعادة تفعيله في أي وقت وإرسال عروض أو منتجات جديدة.
          </div>
        )}

        <div className="details-grid">
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
          <div className="action-bar" style={{ marginBottom: "12px" }}>
            <input
              type="text"
              value={editPhone}
              onChange={(event) => setEditPhone(event.target.value)}
              placeholder="رقم الهاتف"
              disabled={saveDetailsLoading || actionLoading}
            />
            <input
              type="text"
              value={editAddress}
              onChange={(event) => setEditAddress(event.target.value)}
              placeholder="العنوان"
              disabled={saveDetailsLoading || actionLoading}
            />
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
            <input
              type="text"
              value={editProducts}
              onChange={(event) => setEditProducts(event.target.value)}
              placeholder="المنتجات"
              disabled={saveDetailsLoading || actionLoading}
            />
            <input
              type="text"
              value={editPrice}
              onChange={(event) => setEditPrice(event.target.value)}
              placeholder="السعر"
              disabled={saveDetailsLoading || actionLoading}
            />
            {client.visitType === "CUSTOM" && (
              <input
                type="number"
                min="1"
                max="365"
                value={editCustomVisitIntervalDays}
                onChange={(event) => setEditCustomVisitIntervalDays(event.target.value)}
                placeholder="كل كام يوم؟"
                disabled={saveDetailsLoading || actionLoading}
              />
            )}
            {client.status !== "REJECTED" && (
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
            )}
            <button
              type="button"
              className="primary-btn"
              disabled={saveDetailsLoading || actionLoading || !hasDetailsChanges}
              onClick={submitClientDetailsUpdate}
            >
              {saveDetailsLoading ? "جاري الحفظ..." : "حفظ بيانات العميل"}
            </button>
          </div>
        )}

        <div className="action-bar">
          <select
            value={nextVisitType}
            onChange={(event) => {
              const nextType = event.target.value;
              setNextVisitType(nextType);

              if (nextType !== "CUSTOM") {
                setNextCustomVisitIntervalDays("3");
              } else if (!parseCustomVisitIntervalDays(nextCustomVisitIntervalDays)) {
                setNextCustomVisitIntervalDays(String(client.customVisitIntervalDays || 3));
              }
            }}
            disabled={actionLoading}
          >
            <option value="WEEKLY">الزيارة القادمة: أسبوعي</option>
            <option value="BIWEEKLY">الزيارة القادمة: أسبوعين</option>
            <option value="MONTHLY">الزيارة القادمة: شهري</option>
            <option value="CUSTOM">الزيارة القادمة: ميعاد آخر</option>
          </select>
          {nextVisitType === "CUSTOM" && (
            <input
              type="number"
              min="1"
              max="365"
              value={nextCustomVisitIntervalDays}
              onChange={(event) => setNextCustomVisitIntervalDays(event.target.value)}
              placeholder="كل كام يوم؟"
              disabled={actionLoading}
            />
          )}
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ملاحظة الزيارة (مثال: عرض منتج جديد)"
            disabled={actionLoading}
          />
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
                    <td data-label="\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0632\u064a\u0627\u0631\u0629">{formatDate(visit.visitDate)}</td>
                    <td data-label="\u0627\u0644\u062d\u0627\u0644\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629">
                      <StatusBadge status={visit.previousStatus} />
                    </td>
                    <td data-label="\u0627\u0644\u062d\u0627\u0644\u0629 \u0627\u0644\u062c\u062f\u064a\u062f\u0629">
                      <StatusBadge status={visit.newStatus} />
                    </td>
                    <td data-label="\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0633\u0627\u0628\u0642">{formatDate(visit.previousNextVisitDate)}</td>
                    <td data-label="\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062c\u062f\u064a\u062f">{formatDate(visit.newNextVisitDate)}</td>
                    <td data-label="\u0628\u0648\u0627\u0633\u0637\u0629">{visit.visitedBy?.name || "-"}</td>
                    <td data-label="\u0645\u0644\u0627\u062d\u0638\u0629">{visit.note || "-"}</td>
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

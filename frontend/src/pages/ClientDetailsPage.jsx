import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { clientsApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import StatusBadge from "../components/StatusBadge";
import VisitTypeBadge from "../components/VisitTypeBadge";
import { formatDate } from "../utils/formatters";

function isDatePastOrToday(dateValue) {
  const checkDate = new Date(dateValue);
  const today = new Date();

  checkDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return checkDate.getTime() <= today.getTime();
}

function getLocationHref(locationUrl) {
  const raw = String(locationUrl || "").trim();

  if (!raw) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export default function ClientDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [client, setClient] = useState(null);
  const [nextVisitType, setNextVisitType] = useState("WEEKLY");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [saveDetailsLoading, setSaveDetailsLoading] = useState(false);
  const [note, setNote] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editProducts, setEditProducts] = useState("");
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
      setNextVisitType(response.data.item.visitType || "WEEKLY");
      setEditPhone(response.data.item.phone || "");
      setEditAddress(response.data.item.address || "");
      setEditProducts(response.data.item.products || "");
    } catch (err) {
      setError(err.message || "تعذر تحميل بيانات العميل");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  const rejectedWaiting = useMemo(() => {
    if (!client || client.status !== "REJECTED") {
      return false;
    }

    return !isDatePastOrToday(client.nextVisitDate);
  }, [client]);

  const locationHref = useMemo(() => getLocationHref(client?.locationUrl), [client?.locationUrl]);
  const hasDetailsChanges = useMemo(() => {
    if (!client) {
      return false;
    }

    return (
      editPhone !== (client.phone || "") ||
      editAddress !== (client.address || "") ||
      editProducts !== (client.products || "")
    );
  }, [client, editAddress, editPhone, editProducts]);

  async function submitOutcome(outcome) {
    setActionLoading(true);
    setError("");
    setInfoMessage("");

    try {
      await clientsApi.handle(id, {
        outcome,
        note: note || undefined,
        visitType: nextVisitType
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
      await clientsApi.update(id, {
        phone: editPhone,
        address: editAddress,
        products: editProducts
      });
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
          <button type="button" className="secondary-btn" onClick={goBack}>
            العودة للعملاء
          </button>
        </div>

        {rejectedWaiting && (
          <div className="info-box">
            هذا العميل بحالة رفض تعامل حاليًا. يمكنك تسجيل "تم التعامل" الآن إذا وافق العميل، أو إعادة المحاولة
            الكاملة بعد تاريخ {formatDate(client.nextVisitDate)}.
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
            <span>نوع الزيارة</span>
            <VisitTypeBadge type={client.visitType} />
          </div>
          <div>
            <span>الحالة الحالية</span>
            <StatusBadge status={client.status} />
          </div>
          <div>
            <span>الزيارة القادمة</span>
            <strong>{formatDate(client.nextVisitDate)}</strong>
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
            <input
              type="text"
              value={editProducts}
              onChange={(event) => setEditProducts(event.target.value)}
              placeholder="المنتجات"
              disabled={saveDetailsLoading || actionLoading}
            />
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
          <select value={nextVisitType} onChange={(event) => setNextVisitType(event.target.value)} disabled={actionLoading}>
            <option value="WEEKLY">الزيارة القادمة: أسبوعي</option>
            <option value="BIWEEKLY">الزيارة القادمة: كل أسبوعين</option>
            <option value="MONTHLY">الزيارة القادمة: شهري</option>
          </select>
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
            disabled={actionLoading || rejectedWaiting}
            onClick={() => submitOutcome("NO_ANSWER")}
          >
            لم يرد
          </button>
          <button
            type="button"
            className="danger-btn"
            disabled={actionLoading || rejectedWaiting}
            onClick={() => submitOutcome("REJECTED")}
          >
            رفض التعامل
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

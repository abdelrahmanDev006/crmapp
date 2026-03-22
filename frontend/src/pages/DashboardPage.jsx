import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardApi, regionsApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccessMessage, setActionSuccessMessage] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [deletingRegionId, setDeletingRegionId] = useState(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await dashboardApi.getSummary();
      setData(response.data);
    } catch (err) {
      setLoadError(err.message || "تعذر تحميل لوحة التحكم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function handleCreateRegion() {
    const inputValue = window.prompt("اكتب اسم المنطقة الجديدة");
    const regionName = String(inputValue || "").trim();

    if (!regionName) {
      return;
    }

    setCreateLoading(true);
    setActionError("");
    setActionSuccessMessage("");

    try {
      await regionsApi.create({ name: regionName });
      await loadSummary();
      setActionSuccessMessage(`تمت إضافة المنطقة "${regionName}" بنجاح`);
    } catch (err) {
      setActionError(err.message || "تعذر إضافة المنطقة");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDeleteRegion(region) {
    const hasLinkedData = Number(region.clientsCount || 0) > 0 || Number(region.representativesCount || 0) > 0;

    if (hasLinkedData) {
      setActionSuccessMessage("");
      setActionError("لا يمكن حذف منطقة مرتبطة بعملاء أو مستخدمين");
      return;
    }

    const confirmed = window.confirm(`هل تريد حذف منطقة "${region.name}"؟`);
    if (!confirmed) {
      return;
    }

    setDeletingRegionId(region.id);
    setActionError("");
    setActionSuccessMessage("");

    try {
      await regionsApi.remove(region.id);
      await loadSummary();
      setActionSuccessMessage(`تم حذف منطقة "${region.name}" بنجاح`);
    } catch (err) {
      setActionError(err.message || "تعذر حذف المنطقة");
    } finally {
      setDeletingRegionId(null);
    }
  }

  if (loading) {
    return <div className="panel">جاري تحميل لوحة التحكم...</div>;
  }

  if (loadError) {
    return <div className="panel error-box">{loadError}</div>;
  }

  return (
    <div className="stack">
      <section className="metrics-grid">
        <article className="metric-card">
          <h3>إجمالي العملاء</h3>
          <strong>{data?.totals?.totalClients || 0}</strong>
        </article>
        <article className="metric-card">
          <h3>عملاء مستحقون اليوم</h3>
          <strong>{data?.totals?.dueClients || 0}</strong>
        </article>
        <article className="metric-card">
          <h3>لم يرد</h3>
          <strong>{data?.totals?.noAnswerClients || 0}</strong>
        </article>
        <article className="metric-card">
          <h3>مرفوض</h3>
          <strong>{data?.totals?.rejectedClients || 0}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header split">
          <div>
            <h3>المناطق</h3>
            <p>إجمالي المناطق الحالية: {data?.regions?.length || 0}</p>
          </div>
          {isAdmin && (
            <button type="button" className="primary-btn" disabled={createLoading} onClick={handleCreateRegion}>
              {createLoading ? "جاري إضافة المنطقة..." : "إضافة منطقة"}
            </button>
          )}
        </div>

        <div className="stack">
          {actionError && <div className="error-box">{actionError}</div>}
          {actionSuccessMessage && <div className="info-box">{actionSuccessMessage}</div>}

          <div className="regions-grid">
            {data?.regions?.map((region) => (
              <article key={region.id} className="region-card">
                <h4>{region.name}</h4>
                <ul>
                  <li>عدد العملاء: {region.clientsCount}</li>
                  <li>عدد المندوبين: {region.representativesCount}</li>
                  <li>عملاء مستحقون: {region.dueClientsCount}</li>
                  <li>لم يرد: {region.noAnswerCount}</li>
                </ul>
                <div className="action-bar">
                  <button type="button" className="primary-btn" onClick={() => navigate(`/regions/${region.id}`)}>
                    عرض المنطقة
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="danger-btn"
                      disabled={deletingRegionId === region.id}
                      onClick={() => handleDeleteRegion(region)}
                    >
                      {deletingRegionId === region.id ? "جاري الحذف..." : "حذف المنطقة"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

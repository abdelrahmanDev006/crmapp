import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { regionsApi } from "../api/crmApi";
import { formatRegionCode } from "../utils/formatters";

export default function RegionsManagementPage() {
  const [regions, setRegions] = useState([]);
  const [newRegionName, setNewRegionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [actionRegionId, setActionRegionId] = useState(null);
  const [editingRegionId, setEditingRegionId] = useState(null);
  const [editingRegionName, setEditingRegionName] = useState("");
  const [pendingDeleteRegionId, setPendingDeleteRegionId] = useState(null);
  const [error, setError] = useState("");

  const loadRegions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await regionsApi.list();
      setRegions(response.data.items || []);
    } catch (err) {
      setError(err.message || "تعذر تحميل المناطق");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  async function handleCreateRegion(event) {
    event.preventDefault();
    setCreateLoading(true);
    setError("");

    try {
      await regionsApi.create({
        name: newRegionName
      });
      setNewRegionName("");
      await loadRegions();
    } catch (err) {
      setError(err.message || "تعذر إضافة المنطقة");
    } finally {
      setCreateLoading(false);
    }
  }

  function startRenameRegion(region) {
    setEditingRegionId(region.id);
    setEditingRegionName(region.name);
    setPendingDeleteRegionId(null);
    setError("");
  }

  function cancelRenameRegion() {
    setEditingRegionId(null);
    setEditingRegionName("");
  }

  async function saveRenameRegion(regionId) {
    const normalizedName = editingRegionName.trim();

    if (!normalizedName) {
      setError("اسم المنطقة مطلوب");
      return;
    }

    setActionRegionId(regionId);
    setError("");

    try {
      await regionsApi.update(regionId, { name: normalizedName });
      setEditingRegionId(null);
      setEditingRegionName("");
      await loadRegions();
    } catch (err) {
      setError(err.message || "تعذر تحديث اسم المنطقة");
    } finally {
      setActionRegionId(null);
    }
  }

  function requestDeleteRegion(regionId) {
    setPendingDeleteRegionId(regionId);
    setEditingRegionId(null);
    setEditingRegionName("");
    setError("");
  }

  function cancelDeleteRegion() {
    setPendingDeleteRegionId(null);
  }

  async function confirmDeleteRegion(regionId) {
    setActionRegionId(regionId);
    setError("");

    try {
      await regionsApi.remove(regionId);
      setPendingDeleteRegionId(null);
      await loadRegions();
    } catch (err) {
      setError(err.message || "تعذر حذف المنطقة");
    } finally {
      setActionRegionId(null);
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h3>إضافة منطقة جديدة</h3>
          <p>يمكنك إضافة أي عدد من المناطق، وسيتم استخدامها مباشرة في المستخدمين والعملاء.</p>
        </div>

        <form className="form-grid create-form" onSubmit={handleCreateRegion}>
          <label>
            اسم المنطقة
            <input value={newRegionName} onChange={(event) => setNewRegionName(event.target.value)} required />
          </label>
          <button type="submit" className="primary-btn users-create-btn" disabled={createLoading}>
            {createLoading ? "جاري الحفظ..." : "إضافة المنطقة"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header split">
          <h3>كل المناطق</h3>
          <button type="button" className="secondary-btn" onClick={loadRegions}>
            تحديث
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <div className="table-empty">جاري تحميل المناطق...</div>
        ) : regions.length === 0 ? (
          <div className="table-empty">لا توجد مناطق حتى الآن</div>
        ) : (
          <div className="table-wrapper">
            <table className="mobile-table regions-table">
              <thead>
                <tr>
                  <th>المنطقة</th>
                  <th>الكود</th>
                  <th>العملاء</th>
                  <th>المندوبون</th>
                  <th>المستحقون</th>
                  <th>لم يرد</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((region) => {
                  const deleteDisabled = region.clientsCount > 0 || region.representativesCount > 0;
                  const isEditing = editingRegionId === region.id;
                  const isDeletePending = pendingDeleteRegionId === region.id;

                  return (
                    <tr key={region.id}>
                      <td data-label="المنطقة">
                        {isEditing ? (
                          <input
                            className="inline-edit-input"
                            value={editingRegionName}
                            onChange={(event) => setEditingRegionName(event.target.value)}
                          />
                        ) : (
                          region.name
                        )}
                      </td>
                      <td data-label="الكود">{formatRegionCode(region.code)}</td>
                      <td data-label="العملاء">{region.clientsCount}</td>
                      <td data-label="المندوبون">{region.representativesCount}</td>
                      <td data-label="المستحقون">{region.dueClientsCount}</td>
                      <td data-label="لم يرد">{region.noAnswerCount}</td>
                      <td className="actions-cell" data-label="الإجراءات">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="primary-btn"
                              disabled={actionRegionId === region.id}
                              onClick={() => saveRenameRegion(region.id)}
                            >
                              {actionRegionId === region.id ? "جاري..." : "حفظ"}
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={actionRegionId === region.id}
                              onClick={cancelRenameRegion}
                            >
                              إلغاء
                            </button>
                          </>
                        ) : isDeletePending ? (
                          <>
                            <button
                              type="button"
                              className="danger-btn"
                              disabled={actionRegionId === region.id}
                              onClick={() => confirmDeleteRegion(region.id)}
                            >
                              {actionRegionId === region.id ? "جاري..." : "تأكيد الحذف"}
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={actionRegionId === region.id}
                              onClick={cancelDeleteRegion}
                            >
                              إلغاء
                            </button>
                          </>
                        ) : (
                          <>
                            <Link to={`/regions/${region.id}`} className="ghost-btn">
                              عرض
                            </Link>
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={actionRegionId === region.id}
                              onClick={() => startRenameRegion(region)}
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              className="danger-btn"
                              disabled={actionRegionId === region.id || deleteDisabled}
                              onClick={() => requestDeleteRegion(region.id)}
                              title={deleteDisabled ? "لا يمكن حذف منطقة مرتبطة بعملاء أو مندوبين" : "حذف المنطقة"}
                            >
                              حذف
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

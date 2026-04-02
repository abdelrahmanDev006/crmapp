import { useCallback, useEffect, useState } from "react";
import { regionsApi, usersApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "REPRESENTATIVE",
  regionId: ""
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [usersData, setUsersData] = useState({ items: [], totalPages: 1, page: 1 });
  const [regions, setRegions] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);
  const [toggleLoadingId, setToggleLoadingId] = useState(null);
  const [saveRegionLoadingId, setSaveRegionLoadingId] = useState(null);
  const [regionDraftByUserId, setRegionDraftByUserId] = useState({});
  const debouncedSearch = useDebouncedValue(search, 350);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await usersApi.list({
        page,
        pageSize: 20,
        search: debouncedSearch || undefined
      });
      setUsersData(response.data);
    } catch (err) {
      setError(err.message || "تعذر تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setRegionDraftByUserId((previous) => {
      const next = { ...previous };

      usersData.items.forEach((item) => {
        if (item.role === "REPRESENTATIVE") {
          next[item.id] = next[item.id] ?? String(item.region?.id || "");
        } else {
          delete next[item.id];
        }
      });

      return next;
    });
  }, [usersData.items]);

  useEffect(() => {
    if (!loading && usersData.totalPages > 0 && page > usersData.totalPages) {
      setPage(usersData.totalPages);
    }
  }, [loading, page, usersData.totalPages]);

  useEffect(() => {
    let mounted = true;

    async function loadRegions() {
      try {
        const response = await regionsApi.list();
        if (mounted) {
          setRegions(response.data.items || []);
        }
      } catch {
        // Regions list is optional for the create form.
      }
    }

    loadRegions();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreateLoading(true);
    setError("");

    try {
      await usersApi.create({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        regionId: form.role === "REPRESENTATIVE" ? Number(form.regionId) : undefined
      });

      setForm(initialForm);
      await loadUsers();
    } catch (err) {
      setError(err.message || "تعذر إنشاء المستخدم");
    } finally {
      setCreateLoading(false);
    }
  }

  async function toggleUserStatus(item) {
    setError("");
    setToggleLoadingId(item.id);

    try {
      await usersApi.update(item.id, { isActive: !item.isActive });
      await loadUsers();
    } catch (err) {
      setError(err.message || "تعذر تحديث حالة المستخدم");
    } finally {
      setToggleLoadingId(null);
    }
  }

  async function deleteUser(item) {
    const confirmed = window.confirm(`هل تريد حذف المستخدم ${item.name}؟`);
    if (!confirmed) {
      return;
    }

    setError("");
    setDeleteLoadingId(item.id);

    try {
      await usersApi.remove(item.id);
      await loadUsers();
    } catch (err) {
      setError(err.message || "تعذر حذف المستخدم");
    } finally {
      setDeleteLoadingId(null);
    }
  }

  async function saveRepresentativeRegion(item) {
    const selectedRegionId = Number(regionDraftByUserId[item.id] || 0);

    if (item.role !== "REPRESENTATIVE") {
      return;
    }

    if (!selectedRegionId) {
      setError("اختر منطقة صحيحة للمندوب");
      return;
    }

    if (selectedRegionId === Number(item.region?.id)) {
      return;
    }

    setError("");
    setSaveRegionLoadingId(item.id);

    try {
      await usersApi.update(item.id, { regionId: selectedRegionId });
      await loadUsers();
    } catch (err) {
      setError(err.message || "تعذر تحديث منطقة المندوب");
    } finally {
      setSaveRegionLoadingId(null);
    }
  }

  function isCurrentUser(item) {
    return Number(item.id) === Number(currentUser?.id);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h3>إضافة مستخدم</h3>
        </div>

        <form className="form-grid create-form users-create-form" onSubmit={handleCreate}>
          <label>
            الاسم
            <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label>
            كلمة المرور
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
          <label>
            الصلاحية
            <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="REPRESENTATIVE">مندوب</option>
              <option value="ADMIN">أدمن</option>
            </select>
          </label>
          <label className="users-create-region-field">
            المنطقة
            <select
              className="users-create-region-select"
              value={form.regionId}
              disabled={form.role !== "REPRESENTATIVE"}
              onChange={(event) => setForm((prev) => ({ ...prev, regionId: event.target.value }))}
              required={form.role === "REPRESENTATIVE"}
            >
              <option value="">اختر المنطقة</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-btn users-create-btn" disabled={createLoading}>
            {createLoading ? "جاري الحفظ..." : "إنشاء المستخدم"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header split">
          <h3>المستخدمون</h3>
          <div className="filters-row compact">
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="بحث بالاسم أو البريد"
            />
            <button type="button" className="secondary-btn" onClick={loadUsers}>
              تحديث
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <div className="table-empty">جاري تحميل المستخدمين...</div>
        ) : (
          <div className="table-wrapper">
            <table className="mobile-table users-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>البريد</th>
                  <th>الدور</th>
                  <th>المنطقة</th>
                  <th>الحالة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {usersData.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="\u0627\u0644\u0627\u0633\u0645">{item.name}</td>
                    <td data-label="\u0627\u0644\u0628\u0631\u064a\u062f">{item.email}</td>
                    <td data-label="\u0627\u0644\u062f\u0648\u0631">{item.role === "ADMIN" ? "\u0623\u062f\u0645\u0646" : "\u0645\u0646\u062f\u0648\u0628"}</td>
                    <td className="user-region-cell" data-label="\u0627\u0644\u0645\u0646\u0637\u0642\u0629">
                      {item.role === "REPRESENTATIVE" ? (
                        <div className="user-region-control">
                          <select
                            className="user-region-select"
                            value={regionDraftByUserId[item.id] ?? String(item.region?.id || "")}
                            onChange={(event) =>
                              setRegionDraftByUserId((prev) => ({
                                ...prev,
                                [item.id]: event.target.value
                              }))
                            }
                            disabled={saveRegionLoadingId === item.id}
                          >
                            <option value="">اختر المنطقة</option>
                            {regions.map((region) => (
                              <option key={region.id} value={region.id}>
                                {region.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="secondary-btn user-region-save-btn"
                            disabled={
                              saveRegionLoadingId === item.id ||
                              !regionDraftByUserId[item.id] ||
                              Number(regionDraftByUserId[item.id]) === Number(item.region?.id)
                            }
                            onClick={() => saveRepresentativeRegion(item)}
                          >
                            {saveRegionLoadingId === item.id ? "جاري..." : "حفظ"}
                          </button>
                        </div>
                      ) : (
                        <span className="user-region-empty">-</span>
                      )}
                    </td>
                    <td data-label="\u0627\u0644\u062d\u0627\u0644\u0629">{item.isActive ? "\u0646\u0634\u0637" : "\u0645\u0648\u0642\u0648\u0641"}</td>
                    <td className="actions-cell" data-label="\u0627\u0644\u0625\u062c\u0631\u0627\u0621">
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={toggleLoadingId === item.id || isCurrentUser(item)}
                        onClick={() => toggleUserStatus(item)}
                        title={isCurrentUser(item) ? "لا يمكن إيقاف حسابك الحالي" : item.isActive ? "إيقاف المستخدم" : "تفعيل المستخدم"}
                      >
                        {toggleLoadingId === item.id ? "جاري..." : item.isActive ? "إيقاف" : "تفعيل"}
                      </button>

                      <button
                        type="button"
                        className="danger-btn"
                        disabled={isCurrentUser(item) || deleteLoadingId === item.id}
                        onClick={() => deleteUser(item)}
                        title={isCurrentUser(item) ? "لا يمكن حذف حسابك الحالي" : "حذف المستخدم"}
                      >
                        {deleteLoadingId === item.id ? "جاري الحذف..." : "حذف"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
            السابق
          </button>
          <span>
            صفحة {usersData.page} من {usersData.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= usersData.totalPages}
            onClick={() => setPage((prev) => prev + 1)}
          >
            التالي
          </button>
        </div>
      </section>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { regionsApi, usersApi } from "../api/crmApi";
import { useAuth } from "../auth/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "REPRESENTATIVE",
  regionIds: []
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
  const [saveDateLoadingId, setSaveDateLoadingId] = useState(null);
  const [editingRegionsUserId, setEditingRegionsUserId] = useState(null);
  const [editingDateUserId, setEditingDateUserId] = useState(null);
  const [regionDraftByUserId, setRegionDraftByUserId] = useState({});
  const [allowedDateDraftByUserId, setAllowedDateDraftByUserId] = useState({});
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
      const nextRegion = { ...previous };
      usersData.items.forEach((item) => {
        if (item.role === "REPRESENTATIVE") {
          nextRegion[item.id] = nextRegion[item.id] ?? (item.regions?.map(r => r.id) || []);
        } else {
          delete nextRegion[item.id];
        }
      });
      return nextRegion;
    });

    setAllowedDateDraftByUserId((previous) => {
      const nextDate = { ...previous };
      usersData.items.forEach((item) => {
        if (item.role === "REPRESENTATIVE") {
          nextDate[item.id] = nextDate[item.id] ?? (item.allowedDate || "");
        } else {
          delete nextDate[item.id];
        }
      });
      return nextDate;
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
        regionIds: form.role === "REPRESENTATIVE" ? form.regionIds.map(Number) : undefined
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
    const selectedRegionIds = regionDraftByUserId[item.id] || [];

    if (item.role !== "REPRESENTATIVE") {
      return;
    }

    if (selectedRegionIds.length === 0) {
      setError("اختر منطقة واحدة على الأقل للمندوب");
      return;
    }

    const existingRegionIds = item.regions?.map(r => r.id) || [];
    const isSame = selectedRegionIds.length === existingRegionIds.length && 
                   selectedRegionIds.every(id => existingRegionIds.includes(id));

    if (isSame) {
      return;
    }

    setError("");
    setSaveRegionLoadingId(item.id);

    try {
      await usersApi.update(item.id, { regionIds: selectedRegionIds });
      await loadUsers();
      setEditingRegionsUserId(null);
    } catch (err) {
      setError(err.message || "تعذر تحديث منطقة المندوب");
    } finally {
      setSaveRegionLoadingId(null);
    }
  }

  async function saveAllowedDate(item) {
    const selectedDate = allowedDateDraftByUserId[item.id];

    if (item.role !== "REPRESENTATIVE" || !selectedDate) {
      return;
    }

    if (selectedDate === item.allowedDate) {
      return;
    }

    setError("");
    setSaveDateLoadingId(item.id);

    try {
      await usersApi.update(item.id, { allowedDate: selectedDate });
      await loadUsers();
      setEditingDateUserId(null);
    } catch (err) {
      setError(err.message || "تعذر تحديث يوم عرض المندوب");
    } finally {
      setSaveDateLoadingId(null);
    }
  }

  async function clearAllowedDate(item) {
    if (item.role !== "REPRESENTATIVE" || !item.allowedDate) {
      return;
    }

    setError("");
    setSaveDateLoadingId(item.id);

    try {
      await usersApi.update(item.id, { allowedDate: null });
      setAllowedDateDraftByUserId((prev) => ({ ...prev, [item.id]: "" }));
      await loadUsers();
      setEditingDateUserId(null);
    } catch (err) {
      setError(err.message || "تعذر إخفاء العملاء عن المندوب");
    } finally {
      setSaveDateLoadingId(null);
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
          <div style={{ gridColumn: '1 / -1', marginBottom: '10px' }}>
            <span style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>المناطق المخصصة للمندوب</span>
            {form.role !== "REPRESENTATIVE" ? (
              <div style={{ padding: '10px', background: '#f3f4f6', borderRadius: '8px', color: '#6b7280', fontSize: '0.9rem' }}>
                تحديد المناطق متاح فقط لصلاحية "مندوب"
              </div>
            ) : (
              <div style={{ 
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', 
                padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' 
              }}>
                {regions.map((region) => (
                  <label key={region.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color, #0e7a78)' }}
                      checked={form.regionIds?.includes(region.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm(prev => ({ ...prev, regionIds: [...(prev.regionIds || []), region.id] }));
                        } else {
                          setForm(prev => ({ ...prev, regionIds: (prev.regionIds || []).filter(id => id !== region.id) }));
                        }
                      }}
                    />
                    <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>{region.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
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
                  <th>عرض يوم</th>
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
                    <td className="user-region-cell" data-label="المنطقة">
                      {item.role === "REPRESENTATIVE" ? (
                        <button 
                          type="button" 
                          className="ghost-btn" 
                          onClick={() => setEditingRegionsUserId(item.id)}
                        >
                          المناطق ({regionDraftByUserId[item.id]?.length || 0}) ✎
                        </button>
                      ) : (
                        <span className="user-region-empty">-</span>
                      )}
                    </td>
                    <td className="user-date-cell" data-label="عرض يوم">
                      {item.role === "REPRESENTATIVE" ? (
                        <button 
                          type="button" 
                          className="ghost-btn" 
                          onClick={() => setEditingDateUserId(item.id)}
                          style={{ color: item.allowedDate ? 'var(--primary-color, #0e7a78)' : undefined }}
                        >
                          {item.allowedDate || "غير محدد"} ✎
                        </button>
                      ) : (
                        <span className="user-date-empty">-</span>
                      )}
                    </td>
                    <td data-label="الحالة">{item.isActive ? "نشط" : "موقوف"}</td>
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

      {/* Regions Modal */}
      {editingRegionsUserId && (() => {
        const item = usersData.items.find(u => u.id === editingRegionsUserId);
        if (!item) return null;
        return (
          <div className="modal-overlay" onClick={() => setEditingRegionsUserId(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.2rem' }}>تعديل مناطق: {item.name}</h3>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px', padding: '10px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                {regions.map((region) => {
                  const drafts = regionDraftByUserId[item.id] || [];
                  const isChecked = drafts.includes(region.id);
                  return (
                    <label key={region.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px' }}>
                      <input
                        type="checkbox"
                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color, #0e7a78)' }}
                        checked={isChecked}
                        disabled={saveRegionLoadingId === item.id}
                        onChange={(e) => {
                          const newDrafts = e.target.checked 
                            ? [...drafts, region.id] 
                            : drafts.filter(id => id !== region.id);
                          setRegionDraftByUserId(prev => ({ ...prev, [item.id]: newDrafts }));
                        }}
                      />
                      <span style={{ fontSize: '1rem' }}>{region.name}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="ghost-btn" onClick={() => setEditingRegionsUserId(null)}>إلغاء</button>
                <button 
                  type="button" 
                  className="primary-btn" 
                  disabled={saveRegionLoadingId === item.id || !(regionDraftByUserId[item.id]?.length > 0)}
                  onClick={() => saveRepresentativeRegion(item)}
                >
                  {saveRegionLoadingId === item.id ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Date Modal */}
      {editingDateUserId && (() => {
        const item = usersData.items.find(u => u.id === editingDateUserId);
        if (!item) return null;
        return (
          <div className="modal-overlay" onClick={() => setEditingDateUserId(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '350px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.2rem' }}>تعديل يوم العرض: {item.name}</h3>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>التاريخ المسموح به</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem' }}
                  value={allowedDateDraftByUserId[item.id] ?? (item.allowedDate || "")}
                  onChange={(e) => setAllowedDateDraftByUserId(prev => ({ ...prev, [item.id]: e.target.value }))}
                  disabled={saveDateLoadingId === item.id}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                <button 
                  type="button" 
                  className="primary-btn" 
                  disabled={saveDateLoadingId === item.id || !allowedDateDraftByUserId[item.id] || allowedDateDraftByUserId[item.id] === item.allowedDate}
                  onClick={() => saveAllowedDate(item)}
                >
                  {saveDateLoadingId === item.id ? "جاري الحفظ..." : "تعيين التاريخ"}
                </button>
                {item.allowedDate && (
                  <button 
                    type="button" 
                    className="danger-btn" 
                    disabled={saveDateLoadingId === item.id}
                    onClick={() => clearAllowedDate(item)}
                  >
                    إخفاء وإلغاء التاريخ
                  </button>
                )}
                <button type="button" className="ghost-btn" style={{ marginTop: '8px' }} onClick={() => setEditingDateUserId(null)}>إغلاق</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

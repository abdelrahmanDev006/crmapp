import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { logsApi } from "../api/crmApi";

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let active = true;

    async function loadLogs() {
      try {
        setLoading(true);
        const res = await logsApi.list({ 
          page, 
          pageSize: 10,
          search: searchTerm,
          date: dateFilter
        });
        if (active) {
          setLogs(res.data.items || []);
          setTotalPages(res.data.totalPages || 1);
        }
      } catch (err) {
        if (active) {
          setError("تعذر تحميل السجل");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(() => {
      loadLogs();
    }, 300); // 300ms debounce

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, searchTerm, dateFilter, user?.role]);

  if (user?.role !== "ADMIN") return null;

  return (
    <div className="page-container fade-in">
      <header className="page-header">
        <h1 className="page-title">سجل النشاطات</h1>
        <p className="page-description">مراقبة حركات إضافة العملاء والمستخدمين في النظام</p>
      </header>

      <section className="activity-logs-section">
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
          <input 
            type="text" 
            placeholder="بحث بالتفاصيل، المندوب، الإجراء..." 
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            style={{
              flex: "1",
              minWidth: "240px",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #d1d9d9",
              fontSize: "0.9rem",
              outline: "none"
            }}
          />
          <input 
            type="date" 
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #d1d9d9",
              fontSize: "0.9rem",
              outline: "none",
              width: "180px"
            }}
          />
          {(searchTerm || dateFilter) && (
            <button 
              onClick={() => {
                setSearchTerm("");
                setDateFilter("");
                setPage(1);
              }}
              className="secondary-btn"
              style={{ padding: "10px 18px", height: "auto" }}
            >
              إعادة تعيين
            </button>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}
        
        {loading ? (
          <div className="loading-state">جاري تحميل السجل...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">لا يوجد نشاطات مسجلة بعد.</div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>الوقت</th>
                    <th>المستخدم</th>
                    <th>الإجراء</th>
                    <th>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td dir="ltr" style={{ textAlign: "right", fontSize: "0.85rem" }}>
                        {new Date(log.createdAt).toLocaleString("ar-EG")}
                      </td>
                      <td>
                        <span className={`status-badge ${log.user?.role === 'ADMIN' ? 'active' : 'postponed'}`}>
                          {log.user?.name}
                        </span>
                      </td>
                      <td>
                        {{
                          "CREATE_CLIENT": "إضافة عميل",
                          "UPDATE_CLIENT": "تعديل عميل",
                          "HANDLE_CLIENT": "إجراء عميل",
                          "DELETE_CLIENT": "حذف عميل",
                          "APPROVE_VISIT": "اعتماد زيارة",
                          "REJECT_VISIT": "رفض زيارة",
                          "CREATE_USER": "إنشاء حساب",
                          "UPDATE_USER": "تعديل حساب",
                          "DELETE_USER": "حذف حساب",
                          "CREATE_REGION": "إضافة منطقة",
                          "UPDATE_REGION": "تعديل منطقة",
                          "DELETE_REGION": "حذف منطقة",
                          "HANDLE_REGION": "إجراء منطقة"
                        }[log.action] || log.action}
                      </td>
                      <td style={{ color: "#555" }}>{log.details || log.entityName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))} 
                  disabled={page === 1}
                  className="secondary-btn"
                >
                  السابق
                </button>
                <span>{page} من {totalPages}</span>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                  disabled={page === totalPages}
                  className="secondary-btn"
                >
                  التالي
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

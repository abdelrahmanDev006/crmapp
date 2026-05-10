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

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    async function loadLogs() {
      try {
        setLoading(true);
        const res = await logsApi.list({ page, pageSize: 10 });
        setLogs(res.data.items || []);
        setTotalPages(res.data.totalPages || 1);
      } catch (err) {
        setError("تعذر تحميل السجل");
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [page, user?.role]);

  if (user?.role !== "ADMIN") return null;

  return (
    <div className="page-container fade-in">
      <header className="page-header">
        <h1 className="page-title">سجل النشاطات</h1>
        <p className="page-description">مراقبة حركات إضافة العملاء والمستخدمين في النظام</p>
      </header>

      <section className="activity-logs-section">
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

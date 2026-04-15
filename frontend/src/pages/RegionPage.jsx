import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { clientsApi, regionsApi } from "../api/crmApi";
import Pagination from "../components/Pagination";
import StatusBadge from "../components/StatusBadge";
import VisitTypeBadge from "../components/VisitTypeBadge";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDateWithWeekday } from "../utils/formatters";

export default function RegionPage() {
  const { id } = useParams();

  const [region, setRegion] = useState(null);
  const [clientsData, setClientsData] = useState({ items: [], totalPages: 1, page: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  const loadRegion = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [regionResponse, clientsResponse] = await Promise.all([
        regionsApi.getById(id),
        clientsApi.list({
          page,
          pageSize: 20,
          regionId: Number(id),
          search: debouncedSearch || undefined
        })
      ]);

      setRegion(regionResponse.data.item);
      setClientsData(clientsResponse.data);
    } catch (err) {
      setError(err.message || "تعذر تحميل المنطقة");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, id, page]);

  useEffect(() => {
    loadRegion();
  }, [loadRegion]);

  useEffect(() => {
    if (!loading && clientsData.totalPages > 0 && page > clientsData.totalPages) {
      setPage(clientsData.totalPages);
    }
  }, [clientsData.totalPages, loading, page]);

  async function handleWholeRegion() {
    const confirmed = window.confirm("هل تريد تأكيد التعامل مع المنطقة بالكامل؟");
    if (!confirmed) return;

    setBulkLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const response = await regionsApi.handleAll(id, {
        note: "تم التعامل مع المنطقة بالكامل"
      });
      const updatedCount = Number(response.data?.item?.updatedCount || 0);
      const skippedRejectedCount = Number(response.data?.item?.skippedRejectedCount || 0);

      if (skippedRejectedCount > 0) {
        setInfoMessage(
          `تم تحديث ${updatedCount} عميل. تم تخطي ${skippedRejectedCount} عميل مرفوض لأن موعد إعادة المحاولة لم يحن بعد.`
        );
      } else {
        setInfoMessage(`تم تحديث ${updatedCount} عميل في المنطقة.`);
      }

      await loadRegion();
    } catch (err) {
      setError(err.message || "تعذر تنفيذ العملية");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <section className="panel">
      {loading ? (
        <div className="table-empty">جاري تحميل بيانات المنطقة...</div>
      ) : (
        <>
          <div className="panel-header split">
            <div>
              <h3>{region?.name}</h3>
              <p>
                العملاء: {region?.clientsCount || 0} | المندوبون: {region?.representativesCount || 0}
              </p>
            </div>
            <button type="button" className="primary-btn" disabled={bulkLoading} onClick={handleWholeRegion}>
              {bulkLoading ? "جاري التنفيذ..." : "تم التعامل مع المنطقة بالكامل"}
            </button>
          </div>

          <div className="filters-row">
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="بحث داخل عملاء المنطقة"
            />
            <button type="button" className="secondary-btn" onClick={loadRegion}>
              تحديث
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}
          {infoMessage && <div className="info-box">{infoMessage}</div>}

          {clientsData.items.length === 0 ? (
            <div className="table-empty">لا يوجد عملاء في هذه المنطقة</div>
          ) : (
            <div className="table-wrapper">
              <table className="mobile-table">
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>الهاتف</th>
                    <th>المنتجات</th>
                    <th>السعر</th>
                    <th>نوع الزيارة</th>
                    <th>الحالة</th>
                    <th>الزيارة القادمة</th>
                    <th>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {clientsData.items.map((client) => (
                    <tr key={client.id}>
                      <td data-label="\u0627\u0644\u0639\u0645\u064a\u0644">{client.name}</td>
                      <td data-label="\u0627\u0644\u0647\u0627\u062a\u0641">{client.phone}</td>
                      <td data-label="\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a">{client.products}</td>
                      <td data-label="\u0627\u0644\u0633\u0639\u0631">{client.price || "-"}</td>
                      <td data-label="\u0646\u0648\u0639 \u0627\u0644\u0632\u064a\u0627\u0631\u0629">
                        <VisitTypeBadge type={client.visitType} />
                      </td>
                      <td data-label="\u0627\u0644\u062d\u0627\u0644\u0629">
                        <StatusBadge status={client.status} />
                      </td>
                      <td data-label="\u0627\u0644\u0632\u064a\u0627\u0631\u0629 \u0627\u0644\u0642\u0627\u062f\u0645\u0629">{formatDateWithWeekday(client.nextVisitDate)}</td>
                      <td className="actions-cell" data-label="\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644">
                        <Link to={`/clients/${client.id}`} className="ghost-btn">
                          عرض
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination page={clientsData.page} totalPages={clientsData.totalPages} onChange={setPage} />
        </>
      )}
    </section>
  );
}

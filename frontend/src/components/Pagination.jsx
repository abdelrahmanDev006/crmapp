export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) {
    return null;
  }

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="pagination">
      <button type="button" disabled={!canPrev} onClick={() => onChange(page - 1)}>
        السابق
      </button>
      <span>
        صفحة {page} من {totalPages}
      </span>
      <button type="button" disabled={!canNext} onClick={() => onChange(page + 1)}>
        التالي
      </button>
    </div>
  );
}

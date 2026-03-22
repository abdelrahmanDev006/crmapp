import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="panel centered">
      <h2>الصفحة غير موجودة</h2>
      <p>المسار المطلوب غير متاح.</p>
      <Link to="/" className="primary-btn inline-btn">
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}

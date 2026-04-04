import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading, authError } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading-screen">جاري تحميل البيانات...</div>;
  }

  if (!user) {
    if (authError) {
      return <div className="loading-screen">{authError}</div>;
    }

    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (children) {
    return children;
  }

  return <Outlet />;
}

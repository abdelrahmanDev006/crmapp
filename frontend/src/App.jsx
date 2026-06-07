import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppShell from "./layout/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import RegionPage from "./pages/RegionPage";
import ClientDetailsPage from "./pages/ClientDetailsPage";
import UsersPage from "./pages/UsersPage";
import LogsPage from "./pages/LogsPage";
import NotFoundPage from "./pages/NotFoundPage";

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">جاري التحميل...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              user?.role === "ADMIN" ? (
                <DashboardPage />
              ) : (
                <Navigate to="/clients" replace />
              )
            }
          />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="exceptional-clients" element={<ClientsPage forceTab="EXCEPTIONAL" />} />
          <Route path="regions/:id" element={<RegionPage />} />
          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route path="clients/:id" element={<ClientDetailsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="logs" element={<LogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

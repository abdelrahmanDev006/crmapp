import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function AppShell() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const handleFreshNav = () => {
    sessionStorage.setItem("crm_scrollY", "0");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1 className="brand-title">إدارة العملاء</h1>
          <p className="brand-subtitle">نظام متابعة الزيارات الدورية</p>
        </div>

        <div className="user-block">
          <strong>{user?.name}</strong>
          <span>{isAdmin ? "أدمن" : "مندوب"}</span>
          <span>{user?.regions && user.regions.length > 0 ? user.regions.map(r => r.name).join('، ') : "جميع المناطق"}</span>
        </div>

        <nav className="sidebar-nav">
          {isAdmin && (
            <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={handleFreshNav}>
              لوحة التحكم
            </NavLink>
          )}
          <NavLink to="/clients" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={handleFreshNav}>
            العملاء
          </NavLink>
          <NavLink to="/exceptional-clients" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={handleFreshNav}>
            عملاء الشكاوى
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/users" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={handleFreshNav}>
                المستخدمون
              </NavLink>
              <NavLink to="/logs" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={handleFreshNav}>
                سجل النشاطات
              </NavLink>
            </>
          )}
        </nav>

        <button type="button" className="secondary-btn" onClick={logout}>
          تسجيل الخروج
        </button>
      </aside>

      <div className="main-column">
        <header className="top-header">
          <h2>سيستم ادارة عملاء</h2>
          <p>متابعة دقيقة للعملاء والمناطق</p>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = location.state?.from?.pathname || "/";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-backdrop" aria-hidden="true">
        <span className="login-orb login-orb-one" />
        <span className="login-orb login-orb-two" />
        <span className="login-orb login-orb-three" />
      </div>

      <div className="login-layout">
        <section className="login-showcase">
          <span className="login-chip">CRM APP</span>
          <h1>إدارة العملاء والزيارات بطريقة أذكى</h1>
          <p>تابع العملاء، نفّذ الزيارات، وراجع المناطق من شاشة واحدة واضحة وسريعة.</p>

          <div className="login-highlights">
            <span>متابعة جميع المناطق</span>
            <span>سجل زيارات كامل</span>
            <span>صلاحيات أدمن ومندوب</span>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-header">
            <h2>تسجيل الدخول</h2>
            <p>أدخل بياناتك للمتابعة إلى لوحة التحكم</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-field">
              <span>البريد الإلكتروني</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="login-field">
              <span>كلمة المرور</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-toggle-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
            </label>

            {error && <div className="error-box">{error}</div>}

            <button type="submit" className="primary-btn login-submit-btn" disabled={loading}>
              {loading ? "جاري تسجيل الدخول..." : "دخول"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

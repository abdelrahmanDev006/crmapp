import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/crmApi";
import { TOKEN_STORAGE_KEY } from "../constants/storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      if (!token) {
        setAuthError("");
        setLoading(false);
        return;
      }

      try {
        const response = await authApi.me();
        if (mounted) {
          setUser(response.data.user);
          setAuthError("");
        }
      } catch (error) {
        const statusCode = error?.status;

        if (mounted) {
          if (statusCode === 401 || statusCode === 403) {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            setToken(null);
            setUser(null);
            setAuthError("");
          } else {
            setAuthError(error.message || "تعذر التحقق من الجلسة");
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [token]);

  const login = async (credentials) => {
    const response = await authApi.login(credentials);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.data.token);
    setToken(response.data.token);
    setUser(response.data.user);
    setAuthError("");

    return response.data.user;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setAuthError("");
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      authError,
      login,
      logout,
      isAuthenticated: Boolean(token && user)
    }),
    [user, token, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

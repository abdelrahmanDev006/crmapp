import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/crmApi";

const AuthContext = createContext(null);
const LEGACY_TOKEN_STORAGE_KEY = "crm_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);

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
  }, []);

  const login = async (credentials) => {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    const response = await authApi.login(credentials);
    setUser(response.data.user);
    setAuthError("");

    return response.data.user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Continue local cleanup even if API logout fails.
    }

    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    setUser(null);
    setAuthError("");
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      login,
      logout,
      isAuthenticated: Boolean(user)
    }),
    [user, loading, authError]
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

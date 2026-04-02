import axios from "axios";
import { TOKEN_STORAGE_KEY } from "../constants/storage";

function normalizeApiUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  if (raw.startsWith("/")) {
    const normalizedPath = raw.endsWith("/") && raw.length > 1 ? raw.slice(0, -1) : raw;
    return normalizedPath.endsWith("/api") ? normalizedPath : `${normalizedPath}/api`;
  }

  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  const withoutTrailingSlash = withProtocol.endsWith("/") ? withProtocol.slice(0, -1) : withProtocol;

  if (withoutTrailingSlash.endsWith("/api")) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/api`;
}

const configuredApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
const apiBaseUrl = configuredApiUrl || (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");

const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = error.response?.data?.message || "حدث خطأ أثناء تنفيذ الطلب";

    if (error.code === "ECONNABORTED") {
      message = "انتهت مهلة الاتصال بالخادم، حاول مرة أخرى";
    } else if (!error.response) {
      message = "تعذر الاتصال بالخادم، تأكد من الشبكة أو حالة السيرفر";
    }

    const wrappedError = new Error(message);
    wrappedError.status = error.response?.status || null;
    wrappedError.code = error.code || null;
    wrappedError.cause = error;
    return Promise.reject(wrappedError);
  }
);

export default http;

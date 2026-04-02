const DEFAULT_BASE_URL = "http://localhost/api";
const DEFAULT_TIMEOUT_MS = 10000;

function getBaseUrl() {
  const raw = String(process.env.SMOKE_API_BASE_URL || DEFAULT_BASE_URL).trim();
  return raw.replace(/\/+$/, "");
}

function getTimeoutMs() {
  const parsed = Number(process.env.SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function request(path, options = {}) {
  const baseUrl = getBaseUrl();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const baseUrl = getBaseUrl();
  console.log(`[SMOKE] Base URL: ${baseUrl}`);

  const health = await request("/health");
  assertCondition(health.response.ok, `[SMOKE] Health check failed (${health.response.status})`);
  assertCondition(health.data && health.data.status === "ok", "[SMOKE] Health payload is invalid");
  console.log("[SMOKE] Health endpoint is OK");

  const email = String(process.env.SMOKE_ADMIN_EMAIL || "").trim();
  const password = String(process.env.SMOKE_ADMIN_PASSWORD || "").trim();

  if (!email || !password) {
    console.log("[SMOKE] Login tests skipped (SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not provided)");
    return;
  }

  const login = await request("/auth/login", {
    method: "POST",
    body: { email, password }
  });

  assertCondition(login.response.ok, `[SMOKE] Login failed (${login.response.status})`);
  assertCondition(login.data && login.data.token, "[SMOKE] Login response does not include token");
  console.log("[SMOKE] Login endpoint is OK");

  const token = login.data.token;
  const me = await request("/auth/me", { token });
  assertCondition(me.response.ok, `[SMOKE] /auth/me failed (${me.response.status})`);
  assertCondition(me.data && me.data.user && me.data.user.id, "[SMOKE] /auth/me payload is invalid");
  console.log("[SMOKE] Authenticated /auth/me endpoint is OK");

  const summary = await request("/dashboard/summary", { token });
  assertCondition(summary.response.ok, `[SMOKE] /dashboard/summary failed (${summary.response.status})`);
  assertCondition(summary.data && summary.data.totals, "[SMOKE] /dashboard/summary payload is invalid");
  console.log("[SMOKE] Dashboard summary endpoint is OK");
}

run()
  .then(() => {
    console.log("[SMOKE] Completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });

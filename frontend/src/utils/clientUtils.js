export const NEW_CLIENT_WINDOW_DAYS = 7;

export function mapTabToFilters(tab) {
  if (tab === "ALL") {
    return {};
  }

  if (tab === "NO_ANSWER") {
    return { status: "NO_ANSWER" };
  }

  if (tab === "REJECTED") {
    return { status: "REJECTED" };
  }

  if (tab === "ONE_TIME") {
    return { visitType: "ONE_TIME" };
  }

  return {
    status: "ACTIVE",
    visitType: tab
  };
}

export function getTodayInputDate() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

export function getDateTextOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function getLocationHref(locationUrl) {
  const raw = String(locationUrl || "").trim();

  if (!raw) {
    return null;
  }

  if (/\s/.test(raw)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = String(parsed.hostname || "").trim();
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const hasPublicSuffix = hostname.includes(".") && !hostname.startsWith(".") && !hostname.endsWith(".");
    const isLocalhost = hostname === "localhost";

    if (!isIpv4 && !hasPublicSuffix && !isLocalhost) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function parsePrice(value) {
  if (!value && value !== 0) {
    return 0;
  }

  const num = parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

export function getDialHref(phoneValue) {
  const normalizedPhone = String(phoneValue || "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\d+]/g, "");

  if (!normalizedPhone) {
    return null;
  }

  return `tel:${normalizedPhone}`;
}

export function isNewClient(createdAt, todayDateText) {
  const createdDateText = getDateTextOrNull(createdAt);

  if (!createdDateText) {
    return false;
  }

  const todayDate = new Date(`${todayDateText}T00:00:00.000Z`);
  const createdDate = new Date(`${createdDateText}T00:00:00.000Z`);

  if (Number.isNaN(todayDate.getTime()) || Number.isNaN(createdDate.getTime())) {
    return false;
  }

  const diffInDays = Math.floor((todayDate.getTime() - createdDate.getTime()) / 86400000);
  return diffInDays >= 0 && diffInDays < NEW_CLIENT_WINDOW_DAYS;
}

export function getSafeExportText(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseCustomVisitIntervalDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return null;
  }

  return parsed;
}

export function normalizeImportKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u200f\u200e]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "");
}

export function pickImportValue(row, candidateKeys) {
  const normalizedEntries = Object.entries(row || {}).map(([key, value]) => [normalizeImportKey(key), value]);

  for (const candidateKey of candidateKeys) {
    const normalizedCandidateKey = normalizeImportKey(candidateKey);
    const matchingEntry = normalizedEntries.find(([key]) => key === normalizedCandidateKey);

    if (matchingEntry && String(matchingEntry[1] ?? "").trim()) {
      return matchingEntry[1];
    }
  }

  return "";
}

export function normalizeVisitType(value) {
  const text = String(value || "").trim();
  const normalizedText = normalizeImportKey(text);

  if (!normalizedText) {
    return { visitType: "WEEKLY", customVisitIntervalDays: null };
  }

  if (["weekly", "أسبوعي", "اسبوعي"].map(normalizeImportKey).includes(normalizedText)) {
    return { visitType: "WEEKLY", customVisitIntervalDays: null };
  }

  if (
    ["biweekly", "كلأسبوعين", "كلاسبوعين", "أسبوعين", "اسبوعين"].map(normalizeImportKey).includes(normalizedText)
  ) {
    return { visitType: "BIWEEKLY", customVisitIntervalDays: null };
  }

  if (["monthly", "شهري"].map(normalizeImportKey).includes(normalizedText)) {
    return { visitType: "MONTHLY", customVisitIntervalDays: null };
  }

  if (normalizedText.includes(normalizeImportKey("ميعاد آخر")) || normalizedText.includes(normalizeImportKey("معاد آخر"))) {
    const customDaysMatch = text.match(/(\d+)/);
    return {
      visitType: "CUSTOM",
      customVisitIntervalDays: customDaysMatch ? parseCustomVisitIntervalDays(customDaysMatch[1]) : null
    };
  }

  return { visitType: "WEEKLY", customVisitIntervalDays: null };
}

export function normalizeStatus(value) {
  const normalizedText = normalizeImportKey(value);
  const normalizedNoAnswerText = normalizeImportKey("لم يرد");
  const normalizedRejectedKeywords = ["ساقط", "مرفوض", "كانسل", "ملغي", "مرتجع", "rejected", "cancelled"].map(normalizeImportKey);

  if (
    normalizedText.startsWith(normalizedNoAnswerText) ||
    ["لميَرُد", "noanswer", "no_answer"].map(normalizeImportKey).includes(normalizedText)
  ) {
    return "NO_ANSWER";
  }

  if (normalizedRejectedKeywords.some((keyword) => normalizedText.startsWith(keyword))) {
    return "REJECTED";
  }

  return "ACTIVE";
}

export function formatImportDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getCellText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatImportDate(value);
  }

  return String(value).trim();
}

export function rowsToObjects(rows) {
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow || []).map(getCellText);

  return dataRows.map((row) =>
    headers.reduce((record, header, index) => {
      if (header) {
        record[header] = row[index] ?? "";
      }

      return record;
    }, {})
  );
}

export function excelSerialDateToDate(serial) {
  const parsed = Number(serial);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const excelEpochOffset = 25569;
  const millisecondsPerDay = 86400000;
  const utcMilliseconds = Math.round((parsed - excelEpochOffset) * millisecondsPerDay);
  const date = new Date(utcMilliseconds);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function normalizeNextVisitDate(value) {
  if (!value && value !== 0) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatImportDate(value);
  }

  if (typeof value === "number") {
    const parsedDate = excelSerialDateToDate(value);
    if (parsedDate) {
      return formatImportDate(parsedDate);
    }
  }

  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return text;
  }

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsedDate = new Date(text);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return formatImportDate(parsedDate);
}

export function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

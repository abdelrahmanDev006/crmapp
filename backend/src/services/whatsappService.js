const env = require("../config/env");
const { normalizeToWorkDate } = require("../utils/dateUtils");
const { createHttpError } = require("../utils/httpError");

function normalizePhoneForWhatsApp(phone) {
  const digitsOnly = String(phone || "").replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("00")) {
    return digitsOnly.slice(2);
  }

  if (digitsOnly.startsWith("0")) {
    return `2${digitsOnly}`;
  }

  return digitsOnly;
}

function buildDueTodayWhatsAppMessage({ representativeName, dueDate = new Date() }) {
  const dueDateText = normalizeToWorkDate(dueDate).toISOString().slice(0, 10);

  return `مرحبًا، معك ${representativeName || "مندوب الشركة"}. نؤكد لك أن زيارتنا الدورية لك اليوم ${dueDateText}. إذا لديك أي ملاحظة، فضلاً أخبرنا قبل موعد الزيارة.`;
}

function buildNewClientWhatsAppMessage({ representativeName }) {
  return `مرحبًا، معك ${representativeName || "مندوب الشركة"}. نرحب بانضمامك كعميل جديد لدينا، ويسعدنا خدمتك في أي وقت. لأي استفسار يمكنك التواصل معنا مباشرة.`;
}

function assertWhatsAppCloudConfigured() {
  if (!env.whatsappCloudEnabled) {
    throw createHttpError(503, "خدمة إرسال واتساب غير مفعلة حاليًا");
  }

  if (!env.whatsappCloudAccessToken || !env.whatsappCloudPhoneNumberId) {
    throw createHttpError(503, "إعدادات WhatsApp Cloud API غير مكتملة على السيرفر");
  }
}

async function sendWhatsAppTextMessage({ to, message }) {
  const endpoint = `https://graph.facebook.com/${env.whatsappCloudApiVersion}/${env.whatsappCloudPhoneNumberId}/messages`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.whatsappCloudRequestTimeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappCloudAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: message
        }
      }),
      signal: controller.signal
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response.ok) {
      const apiMessage = payload?.error?.message || "فشل إرسال رسالة واتساب";
      throw new Error(apiMessage);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال مع WhatsApp Cloud API");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  normalizePhoneForWhatsApp,
  buildDueTodayWhatsAppMessage,
  buildNewClientWhatsAppMessage,
  assertWhatsAppCloudConfigured,
  sendWhatsAppTextMessage
};

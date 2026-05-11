const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const prisma = require("./config/prisma");
const apiRoutes = require("./routes");
const env = require("./config/env");
const { notFound, errorHandler } = require("./middlewares/errorHandlers");

const app = express();

const allowedOrigins = new Set(env.allowedOrigins);
app.set("trust proxy", env.trustProxy);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without Origin header (server-to-server/Postman/cURL).
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: env.corsCredentials
  })
);

app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: env.jsonBodyLimit }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMinutes * 60 * 1000,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: "عدد محاولات تسجيل الدخول كبير، حاول لاحقًا"
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // دقيقة واحدة
  max: 500,            // 500 طلب لكل IP في الدقيقة
  standardHeaders: true,
  legacyHeaders: false,
  message: "عدد الطلبات كبير جداً، انتظر لحظة"
});

app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected", timestamp: new Date().toISOString() });
  }
});

app.use("/api", apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
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

      callback(null, allowedOrigins.has(origin));
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

app.use("/api/auth/login", authLimiter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

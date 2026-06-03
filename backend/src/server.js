const app = require("./app");
const env = require("./config/env");
const prisma = require("./config/prisma");

let server;
let shuttingDown = false;

async function start() {
  await prisma.$connect();

  server = app.listen(env.port, () => {
    console.log(`API server running on port ${env.port}`);
  });

  // Railway's reverse proxy has a 60s keepalive timeout.
  // Node.js default keepAliveTimeout is 5s — far too low.
  // Setting Node's timeout HIGHER than the proxy's prevents the proxy
  // from sending requests on connections Node has already closed.
  // This eliminates the "- -" (no response) entries in Railway logs.
  server.keepAliveTimeout = 65000;  // 65 seconds
  server.headersTimeout   = 66000;  // must be > keepAliveTimeout
}

async function shutdown(reason, error) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (error) {
    console.error(`[${reason}]`, error);
  } else {
    console.log(`Shutting down (${reason})`);
  }

  // Force exit after 10 seconds if graceful shutdown hangs
  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(error ? 1 : 0);
  }, 10000);
  forceExitTimer.unref();

  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(error ? 1 : 0);
    });
    return;
  }

  await prisma.$disconnect();
  process.exit(error ? 1 : 0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => shutdown("uncaughtException", error));
process.on("unhandledRejection", (reason) => shutdown("unhandledRejection", reason));

start().catch((error) => shutdown("startup", error));

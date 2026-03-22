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

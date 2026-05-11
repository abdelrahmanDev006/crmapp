const cluster = require("cluster");
const os = require("os");

if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  console.log(`[Cluster] Starting ${cpuCount} worker(s)...`);

  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code) => {
    console.warn(`[Cluster] Worker ${worker.id} exited (code ${code}). Restarting...`);
    cluster.fork();
  });
} else {
  // كل Worker يشغّل السيرفر الحقيقي
  require("./server");
}

import { jobs, saveJob, dataDir } from "../lib/db";
import { executeJob } from "../lib/engine";
import { open, unlink, readFile } from "node:fs/promises";
import path from "node:path";
const lock = path.join(dataDir, "worker.lock");
try {
  const previous = Number(await readFile(lock, "utf8"));
  try {
    process.kill(previous, 0);
    console.error("A UXBench worker is already running.");
    process.exit(1);
  } catch {
    await unlink(lock);
  }
} catch {
  /* No prior worker. */
}
const handle = await open(lock, "wx");
await handle.writeFile(String(process.pid));
await handle.close();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void unlink(lock).finally(() => process.exit(0));
  });
for (const job of jobs().filter((j) => j.status === "running")) {
  job.status = "failed";
  job.error =
    "Worker was interrupted. Start a fresh audit to collect a complete run set.";
  saveJob(job);
}
console.log("UXBench audit worker ready.");
while (true) {
  const job = jobs()
    .reverse()
    .find((j) => j.status === "queued");
  if (job) await executeJob(job);
  else await new Promise((r) => setTimeout(r, 1000));
}

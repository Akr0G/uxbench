import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"])
  if (existsSync(file)) process.loadEnvFile(file);
const children = [
  spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.argv[2] || "dev",
      "--hostname",
      process.env.UXBENCH_HOST || "127.0.0.1",
      "--port",
      process.env.PORT || "3000",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) child.on("exit", (code) => stop(code || 0));

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Job, Review } from "./types";
export const dataDir = path.resolve(
  /* turbopackIgnore: true */ process.env.UXBENCH_DATA_DIR || "data",
);
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "uxbench.sqlite"));
db.exec("PRAGMA busy_timeout=10000;");
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, updated TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, data TEXT NOT NULL);",
);
export function saveJob(job: Job) {
  job.updatedAt = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO jobs VALUES (?,?,?)").run(
    job.id,
    job.updatedAt,
    JSON.stringify(job),
  );
}
export function getJob(id: string): Job | undefined {
  const row = db.prepare("SELECT data FROM jobs WHERE id=?").get(id);
  return row ? JSON.parse(row.data as string) : undefined;
}
export function jobs(): Job[] {
  return db
    .prepare("SELECT data FROM jobs ORDER BY updated DESC LIMIT 100")
    .all()
    .map((r) => JSON.parse(r.data as string));
}
export function saveReview(review: Review) {
  db.prepare("INSERT OR REPLACE INTO reviews VALUES (?,?)").run(
    review.id,
    JSON.stringify(review),
  );
}
export function reviews(): Review[] {
  return db
    .prepare("SELECT data FROM reviews")
    .all()
    .map((r) => JSON.parse(r.data as string));
}

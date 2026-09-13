import { z } from "zod";
import { METHODOLOGY } from "./config";
import { validateUrl } from "./security";
import { jobs, saveJob } from "./db";
import type { Job, Site } from "./types";
import { RULES } from "./rules";
const schema = z.object({
  mode: z.enum(["quick", "standard", "competition"]).default("standard"),
  sites: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        url: z.string().max(2048),
        pages: z.array(z.string().max(2048)).min(1).max(5),
      }),
    )
    .min(1)
    .max(5),
  fresh: z.boolean().default(false),
});
export async function createJob(input: unknown) {
  const data = schema.parse(input);
  if (data.mode === "quick" && data.sites.some((s) => s.pages.length !== 1))
    throw new Error("Quick mode tests exactly one page per site.");
  if (new Set(data.sites.map((s) => s.pages.length)).size !== 1)
    throw new Error("Comparisons require the same page count for every site.");
  if (
    jobs().filter((j) => j.status === "queued" || j.status === "running")
      .length >= 5
  )
    throw new Error("The audit queue is full. Wait for a job to finish.");
  const sites: Site[] = [];
  for (const site of data.sites) {
    const url = await validateUrl(site.url);
    const pages = [];
    for (const input of site.pages) {
      const page = await validateUrl(input);
      if (new URL(page).origin !== new URL(url).origin)
        throw new Error("Selected pages must belong to their website origin.");
      pages.push(page);
    }
    sites.push({
      name: site.name,
      url,
      pages: [...new Set(pages)],
      results: [],
      scores: {
        accessibility: null,
        performance: null,
        responsive: null,
        usability: null,
        technical: null,
      },
      score: null,
    });
  }
  if (new Set(sites.map((s) => s.pages.length)).size !== 1)
    throw new Error("Each site must have the same number of unique pages.");
  const signature = JSON.stringify(
    sites.map((s) => ({ name: s.name, url: s.url, pages: s.pages })),
  );
  if (!data.fresh) {
    const cached = jobs().find(
      (j) =>
        j.status === "completed" &&
        j.mode === data.mode &&
        j.sites.every((s) => s.score !== null) &&
        Date.now() - Date.parse(j.createdAt) <
          METHODOLOGY.cacheHours * 3600000 &&
        JSON.stringify(
          j.sites.map((s) => ({ name: s.name, url: s.url, pages: s.pages })),
        ) === signature,
    );
    if (cached) return cached;
  }
  const job: Job = {
    id: crypto.randomUUID(),
    kind: sites.length > 1 ? "comparison" : "audit",
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "Queued",
    completed: 0,
    total: sites.reduce((sum, s) => sum + s.pages.length, 0),
    mode: data.mode,
    sites,
    methodology: {
      ...METHODOLOGY,
      audits: RULES.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        weight: r.weight,
        source: r.source,
        confidence: r.confidence,
        recommendation: r.recommendation,
      })),
    },
  };
  saveJob(job);
  return job;
}

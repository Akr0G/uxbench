import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { jobs } from "../lib/db";
import { METHODOLOGY } from "../lib/config";
const comparison = jobs().find(
  (j) =>
    j.kind === "comparison" &&
    j.mode === "standard" &&
    j.status === "completed" &&
    j.sites.every((s) => s.score !== null),
);
assert(comparison, "A successful Standard two-site comparison must exist.");
const baseline = comparison.sites[0];
for (const site of comparison.sites) {
  assert.equal(site.pages.length, baseline.pages.length);
  for (const page of site.results) {
    assert.deepEqual(page.errors, []);
    for (const device of ["mobile", "desktop"]) {
      const runs = page.runs.filter((r) => r.device === device);
      assert.equal(runs.length, METHODOLOGY.runs.standard);
      for (const run of runs) {
        assert.deepEqual(
          run.settings,
          baseline.results[0].runs.find((r) => r.device === device)!.settings,
        );
        assert.equal(run.version, baseline.results[0].runs[0].version);
      }
    }
    assert(page.checks.length > 0);
    assert.equal(page.screenshots.length, 2);
  }
  const c = site.scores;
  const manual =
    c.accessibility! * 0.25 +
    c.performance! * 0.25 +
    c.responsive! * 0.2 +
    c.usability! * 0.2 +
    c.technical! * 0.1;
  assert(Math.abs(manual - site.score!) < 1e-9);
}
await mkdir("data/verification", { recursive: true });
const report = {
  verifiedAt: new Date().toISOString(),
  comparisonId: comparison.id,
  mode: comparison.mode,
  sites: comparison.sites.map((s) => ({
    name: s.name,
    url: s.url,
    score: s.score,
    categories: s.scores,
    runs: s.results.reduce((n, p) => n + p.runs.length, 0),
    findings: s.results.reduce((n, p) => n + p.findings.length, 0),
  })),
  checks: [
    "Equal selected-page counts",
    "Three runs for each mobile and desktop configuration",
    "Identical recorded Lighthouse settings across sites",
    "Identical Lighthouse versions",
    "No page errors",
    "Real screenshots and custom checks",
    "Independent score arithmetic",
  ],
};
await writeFile(
  "data/verification/verified-comparison.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

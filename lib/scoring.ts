import { METHODOLOGY } from "./config";
import type { Category, Check, Finding, PageResult, Site } from "./types";
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function summary(values: number[]) {
  return {
    median: median(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    spread: values.length ? Math.max(...values) - Math.min(...values) : null,
  };
}
export function weightedChecks(checks: Check[]) {
  const relevant = checks.filter(
    (c) => c.applicable && c.tested > 0 && c.status !== "human review",
  );
  const weights = relevant.reduce((s, c) => s + c.weight, 0);
  return weights
    ? (100 *
        relevant.reduce((s, c) => s + (c.weight * c.passing) / c.tested, 0)) /
        weights
    : null;
}
export function deduplicate(findings: Finding[]) {
  return [
    ...new Map(
      findings.map((f) => [
        `${f.rule}|${f.page}|${f.selector}|${f.viewport ?? ""}`,
        f,
      ]),
    ).values(),
  ];
}
export function pageCategory(page: PageResult, category: Category) {
  if (category === "responsive" || category === "usability")
    return weightedChecks(page.checks.filter((c) => c.category === category));
  const categories =
    category === "technical" ? ["best-practices", "seo"] : [category];
  let total = 0;
  for (const [device, settings] of Object.entries(METHODOLOGY.devices)) {
    const values = categories.map((key) =>
      median(
        page.runs
          .filter((r) => r.device === device)
          .map((r) => r.categories[key])
          .filter((v): v is number => v !== null && v !== undefined),
      ),
    );
    if (values.some((v) => v === null)) return null;
    total +=
      (settings.weight * values.reduce<number>((a, b) => a + (b ?? 0), 0)) /
      values.length;
  }
  return total;
}
export function scoreSite(site: Site) {
  for (const category of Object.keys(METHODOLOGY.weights) as Category[]) {
    const values = site.results.map((p) => pageCategory(p, category));
    site.scores[category] =
      values.length && values.every((v) => v !== null)
        ? values.reduce<number>((s, v) => s + (v ?? 0), 0) / values.length
        : null;
  }
  site.score = Object.values(site.scores).every((v) => v !== null)
    ? Object.entries(METHODOLOGY.weights).reduce(
        (s, [c, w]) => s + (site.scores[c as Category] ?? 0) * w,
        0,
      )
    : null;
  return site;
}
export function tooClose(a: number[], b: number[]) {
  const x = summary(a),
    y = summary(b);
  return (
    x.median !== null &&
    y.median !== null &&
    Math.abs(x.median - y.median) <= Math.max(x.spread ?? 0, y.spread ?? 0, 1)
  );
}
export function overflow(viewport: number, scroll: number) {
  return scroll > viewport + 1;
}
export function smallTarget(width: number, height: number) {
  return width < 24 || height < 24;
}
export function vitalsRating(metric: string, value: number) {
  const limits =
    metric.includes("largest") || metric === "lcp"
      ? [2500, 4000]
      : metric.includes("interaction") || metric === "inp"
        ? [200, 500]
        : [0.1, 0.25];
  return value <= limits[0]
    ? "Good"
    : value <= limits[1]
      ? "Needs improvement"
      : "Poor";
}

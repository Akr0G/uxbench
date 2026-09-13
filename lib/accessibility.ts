import axe, { type AxeResults } from "axe-core";
import type { Page } from "playwright";
import type { Check, Finding, Severity } from "./types";
declare global {
  interface Window {
    axe: typeof axe;
  }
}
export function parseAxe(result: AxeResults, url: string, width: number) {
  const severity: Record<string, Severity> = {
    critical: "Critical",
    serious: "High",
    moderate: "Medium",
    minor: "Low",
  };
  const findings: Finding[] = [];
  for (const violation of [...result.violations, ...result.incomplete]) {
    const incomplete = result.incomplete.includes(violation);
    const criteria = violation.tags
      .filter((t) => /^wcag\d{3,4}$/.test(t))
      .map((t) => {
        const digits = t.slice(4);
        return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
      });
    for (const node of violation.nodes)
      findings.push({
        id: crypto.randomUUID(),
        rule: violation.id,
        title: violation.help,
        category: "accessibility",
        severity: incomplete
          ? "Informational"
          : severity[violation.impact || "minor"],
        confidence: incomplete ? "Human review required" : "High",
        page: url,
        selector: node.target.join(" > "),
        html: node.html,
        evidence: node.failureSummary || violation.description,
        why: violation.description,
        recommendation: `${violation.help}. See ${violation.helpUrl}`,
        standard: criteria.length
          ? `WCAG 2.2 SC ${criteria.join(", ")}`
          : "Best Practice",
        viewport: width,
      });
  }
  const checks: Check[] = result.passes.map((r) => ({
    id: r.id,
    title: r.help,
    category: "accessibility",
    weight: 0,
    applicable: true,
    tested: r.nodes.length,
    passing: r.nodes.length,
    failing: 0,
    status: "pass",
    evidence: `axe-core ${result.testEngine.version}; ${r.nodes.length} tested elements.`,
  }));
  return { findings, checks };
}
export async function accessibility(page: Page, url: string, width: number) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(
    async () =>
      await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: [
            "wcag2a",
            "wcag2aa",
            "wcag21a",
            "wcag21aa",
            "wcag22aa",
            "best-practice",
          ],
        },
      }),
  );
  const parsed = parseAxe(result, url, width);
  for (const finding of parsed.findings) {
    try {
      const box = await page
        .locator(finding.selector)
        .first()
        .boundingBox({ timeout: 500 });
      if (box) finding.box = box;
    } catch {
      /* Shadow and frame selectors remain available as textual evidence. */
    }
  }
  return { ...parsed, raw: result };
}

import type { Page } from "playwright";
import type { Category, Check, Finding, Severity } from "./types";
export interface AuditRule {
  id: string;
  title: string;
  category: Category;
  description: string;
  source: string;
  sourceCriterion?: string;
  severity: Severity;
  weight: number;
  confidence: Finding["confidence"];
  recommendation: string;
  applicability: string;
  execute: (page: Page) => Promise<Observation[]>;
}
interface Observation {
  selector: string;
  html: string;
  pass: boolean;
  evidence: string;
  box: { x: number; y: number; width: number; height: number };
}
async function inspect(page: Page, id: string): Promise<Observation[]> {
  // tsx preserves local function names with an esbuild helper. Browser-evaluated
  // callbacks have a separate realm, so provide the inert naming helper there.
  await page.evaluate("globalThis.__name = (fn) => fn");
  return page.evaluate((rule) => {
    const selector = (el: Element) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts: string[] = [];
      let e: Element | null = el;
      while (e && parts.length < 5) {
        let part = e.tagName.toLowerCase();
        if (e.parentElement)
          part += `:nth-child(${Array.from(e.parentElement.children).indexOf(e) + 1})`;
        parts.unshift(part);
        e = e.parentElement;
      }
      return parts.join(" > ");
    };
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(e).visibility !== "hidden"
      );
    };
    const all = (s: string) =>
      Array.from(document.querySelectorAll(s)).filter(visible);
    const obs = (e: Element, pass: boolean, evidence: string) => {
      const r = e.getBoundingClientRect();
      return {
        selector: selector(e),
        html: e.outerHTML.slice(0, 600),
        pass,
        evidence,
        box: {
          x: r.x + scrollX,
          y: r.y + scrollY,
          width: r.width,
          height: r.height,
        },
      };
    };
    if (rule === "reflow")
      return [
        obs(
          document.documentElement,
          document.documentElement.scrollWidth <= innerWidth + 1,
          `Viewport ${innerWidth}px; document width ${document.documentElement.scrollWidth}px. Horizontal scrolling may be intentional for exempt content; verify context.`,
        ),
      ];
    if (rule === "viewport")
      return [
        obs(
          document.documentElement,
          !!document.querySelector(
            'meta[name="viewport"][content*="width=device-width"]',
          ),
          "Checks for a device-width viewport declaration.",
        ),
      ];
    if (rule === "offscreen")
      return all("button,input,select,textarea,a[href]").map((e) => {
        const r = e.getBoundingClientRect();
        return obs(
          e,
          r.left >= -1 && r.right <= innerWidth + 1,
          `Horizontal bounds ${Math.round(r.left)}–${Math.round(r.right)}px in ${innerWidth}px viewport; review intentional carousels.`,
        );
      });
    if (rule === "image-overflow")
      return all("img").map((e) => {
        const r = e.getBoundingClientRect();
        return obs(
          e,
          r.left >= -1 && r.right <= innerWidth + 1,
          `Image width ${Math.round(r.width)}px; viewport ${innerWidth}px.`,
        );
      });
    if (rule === "clipping")
      return all("p,h1,h2,h3,label,button").map((e) => {
        const style = getComputedStyle(e);
        const clipped =
          ["hidden", "clip"].includes(style.overflowX) &&
          e.scrollWidth > e.clientWidth + 2;
        return obs(
          e,
          !clipped,
          `Content width ${e.scrollWidth}px; visible width ${e.clientWidth}px. Truncation can be intentional.`,
        );
      });
    if (rule === "target-size")
      return all('button,input,select,a[href],[role="button"]').map((e) => {
        const r = e.getBoundingClientRect();
        return obs(
          e,
          r.width >= 24 && r.height >= 24,
          `${Math.round(r.width)} × ${Math.round(r.height)} CSS px. WCAG spacing, inline, equivalent, essential and user-agent exceptions require review.`,
        );
      });
    if (rule === "headings") {
      let last = 0;
      return all("h1,h2,h3,h4,h5,h6").map((e) => {
        const level = Number(e.tagName[1]);
        const pass = level <= last + 1;
        last = level;
        return obs(
          e,
          pass,
          `Heading level ${level}: ${e.textContent?.trim().slice(0, 100)}`,
        );
      });
    }
    if (rule === "page-title")
      return [
        obs(
          document.documentElement,
          document.title.trim().length > 0,
          `Page title: ${document.title || "(empty)"}`,
        ),
      ];
    if (rule === "landmarks")
      return [
        obs(
          document.documentElement,
          !!document.querySelector('main,[role="main"]'),
          "Main landmark presence; meaningful structure needs human review.",
        ),
      ];
    if (rule === "link-purpose")
      return all("a[href]").map((e) =>
        obs(
          e,
          !/^(click here|here|read more|learn more)$/i.test(
            e.textContent?.trim() || "",
          ),
          `Visible link text: ${e.textContent?.trim().slice(0, 100)}. Context can provide a meaningful purpose.`,
        ),
      );
    if (rule === "form-labels")
      return all(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea',
      ).map((e) => {
        const input = e as HTMLInputElement;
        const labels = Array.from(input.labels || []);
        return obs(
          e,
          labels.some(visible) || !!e.getAttribute("aria-labelledby"),
          `Visible labels: ${labels.length}; placeholder: ${e.getAttribute("placeholder") || "none"}. Verify aria-labelledby is visible.`,
        );
      });
    if (rule === "input-purpose")
      return all(
        'input[type="email"],input[type="tel"],input[type="password"]',
      ).map((e) =>
        obs(
          e,
          e.hasAttribute("autocomplete"),
          `Input type ${e.getAttribute("type")}; autocomplete ${e.getAttribute("autocomplete") || "not specified"}. Applicability depends on whether personal data is collected.`,
        ),
      );
    if (rule === "status-feedback")
      return [
        obs(
          document.documentElement,
          !!document.querySelector(
            '[role="status"],[role="progressbar"],[aria-live]',
          ),
          "Static presence of live/status/progress semantics only. Interactions and feedback require human observation.",
        ),
      ];
    return [];
  }, id);
}
function rule(
  id: string,
  title: string,
  category: Category,
  weight: number,
  severity: Severity,
  confidence: Finding["confidence"],
  source: string,
  recommendation: string,
): AuditRule {
  return {
    id,
    title,
    category,
    weight,
    severity,
    confidence,
    source,
    description: title,
    applicability:
      "Visible matching elements; structural checks apply to the document.",
    recommendation,
    execute: (p) => inspect(p, id),
  };
}
async function navigationLinks(page: Page): Promise<Observation[]> {
  if (!page.url().startsWith("http")) return [];
  const origin = new URL(page.url()).origin;
  const candidates = await page
    .locator("nav a[href], header a[href]")
    .evaluateAll((els) =>
      els.slice(0, 40).map((el) => ({
        url: (el as HTMLAnchorElement).href,
        html: el.outerHTML.slice(0, 600),
        text: el.textContent || "",
      })),
    );
  const selected = [
    ...new Map(
      candidates
        .filter((l) => {
          try {
            const u = new URL(l.url);
            return (
              u.origin === origin &&
              !u.hash &&
              !/logout|delete|remove|signout/i.test(u.href)
            );
          } catch {
            return false;
          }
        })
        .map((l) => [l.url, l]),
    ).values(),
  ].slice(0, 8);
  const results: Observation[] = [];
  for (const link of selected) {
    const probe = await page.context().newPage();
    try {
      const response = await probe.goto(link.url, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      const status = response?.status();
      if (status)
        results.push({
          selector: `a[href=${JSON.stringify(link.url)}]`,
          html: link.html,
          pass: status < 400,
          evidence: `Navigation link ${link.text.trim()}: HTTP ${status} at ${link.url}. A server or bot restriction may require manual confirmation.`,
          box: { x: 0, y: 0, width: 0, height: 0 },
        });
    } catch {
      /* A timeout is not proof of a broken link; it remains unmeasured. */
    } finally {
      await probe.close();
    }
  }
  return results;
}
export const RULES: AuditRule[] = [
  rule(
    "reflow",
    "Horizontal reflow",
    "responsive",
    4,
    "High",
    "High",
    "WCAG 2.2 SC 1.4.10 — verification required",
    "Inspect overflowing content at 320 CSS pixels; remove unintended fixed-width constraints and verify WCAG exceptions.",
  ),
  rule(
    "viewport",
    "Responsive viewport",
    "responsive",
    2,
    "Medium",
    "High",
    "Best Practice",
    "Declare a responsive device-width viewport without disabling zoom.",
  ),
  rule(
    "offscreen",
    "Controls within viewport",
    "responsive",
    2,
    "Medium",
    "Medium",
    "Best Practice",
    "Ensure interactive controls can be reached at this width; inspect intentional overflow containers.",
  ),
  rule(
    "image-overflow",
    "Images within viewport",
    "responsive",
    1,
    "Medium",
    "High",
    "Best Practice",
    "Constrain images to their container and preserve their aspect ratio.",
  ),
  rule(
    "clipping",
    "Potential text clipping",
    "responsive",
    1,
    "Low",
    "Medium",
    "Best Practice",
    "Verify truncated text remains understandable and the full content is available.",
  ),
  rule(
    "target-size",
    "Small target candidates",
    "responsive",
    0,
    "Low",
    "Human review required",
    "WCAG 2.2 SC 2.5.8 — exceptions require review",
    "Check 24 × 24 CSS pixel size or the spacing and other exceptions. Do not infer failure from dimensions alone.",
  ),
  rule(
    "headings",
    "Heading sequence",
    "usability",
    2,
    "Low",
    "Medium",
    "Best Practice",
    "Use a meaningful heading hierarchy reflecting content relationships.",
  ),
  rule(
    "page-title",
    "Page title present",
    "usability",
    2,
    "Medium",
    "High",
    "Best Practice",
    "Provide a descriptive, page-specific title.",
  ),
  rule(
    "landmarks",
    "Main content landmark",
    "usability",
    2,
    "Medium",
    "High",
    "Best Practice",
    "Identify primary content with a main landmark.",
  ),
  rule(
    "link-purpose",
    "Context-dependent link names",
    "usability",
    1,
    "Low",
    "Medium",
    "Nielsen heuristic 6: Recognition rather than recall",
    "Prefer descriptive link text; verify that surrounding context resolves the purpose.",
  ),
  rule(
    "form-labels",
    "Persistent form labels",
    "usability",
    3,
    "Medium",
    "Medium",
    "Nielsen heuristic 6: Recognition rather than recall",
    "Keep field labels visible while users enter information.",
  ),
  rule(
    "input-purpose",
    "Input autocomplete hints",
    "usability",
    1,
    "Low",
    "Medium",
    "Nielsen heuristic 5: Error prevention",
    "Use appropriate autocomplete tokens where a field collects personal information.",
  ),
  rule(
    "status-feedback",
    "System feedback review",
    "usability",
    0,
    "Informational",
    "Human review required",
    "Nielsen heuristic 1: Visibility of system status",
    "Observe loading, success, error and disabled states during representative tasks.",
  ),
  {
    ...rule(
      "navigation-links",
      "Navigation link health",
      "usability",
      3,
      "High",
      "High",
      "Best Practice",
      "Repair links returning error responses, or verify whether access restrictions affect representative users.",
    ),
    execute: navigationLinks,
  },
];
export async function runRules(
  page: Page,
  url: string,
  width: number,
  category?: Category,
) {
  const checks: Check[] = [],
    findings: Finding[] = [];
  const measurements: Record<string, Observation[]> = {};
  for (const r of RULES.filter((r) => !category || r.category === category)) {
    const observations = await r.execute(page);
    measurements[r.id] = observations;
    const failing = observations.filter((o) => !o.pass);
    checks.push({
      id: r.id,
      title: r.title,
      category: r.category,
      weight: r.weight,
      applicable: observations.length > 0,
      tested: observations.length,
      passing: observations.length - failing.length,
      failing: failing.length,
      status:
        r.weight === 0
          ? "human review"
          : !observations.length
            ? "not applicable"
            : !failing.length
              ? "pass"
              : failing.length === observations.length
                ? "fail"
                : "partial",
      evidence: `${observations.length - failing.length}/${observations.length} observations passed at ${width}px. ${failing.length > 40 ? "Showing 40 example findings; all observations are retained in the raw file." : ""}`,
    });
    for (const o of failing.slice(0, 40))
      findings.push({
        id: crypto.randomUUID(),
        rule: r.id,
        title: r.title,
        category: r.category,
        severity: r.severity,
        confidence: r.confidence,
        page: url,
        selector: o.selector,
        html: o.html,
        evidence: o.evidence,
        why: r.description,
        recommendation: r.recommendation,
        standard: r.source,
        box: o.box,
        viewport: width,
      });
  }
  return { checks, findings, measurements };
}

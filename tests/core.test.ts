import test from "node:test";
import assert from "node:assert/strict";
import {
  median,
  summary,
  weightedChecks,
  scoreSite,
  deduplicate,
  tooClose,
  overflow,
  smallTarget,
  vitalsRating,
} from "../lib/scoring";
import {
  assertLocalMutation,
  isPublicIp,
  normalizeUrl,
  validateUrl,
} from "../lib/security";
import { samplePages } from "../lib/discovery";
import { parseAxe } from "../lib/accessibility";
import { getCrux } from "../lib/crux";
import type { Check, Finding, PageResult, Site } from "../lib/types";
import type { AxeResults } from "axe-core";
const check = (passing: number, tested: number, weight = 1): Check => ({
  id: "test",
  title: "test",
  category: "usability",
  weight,
  applicable: tested > 0,
  tested,
  passing,
  failing: tested - passing,
  status: passing === tested ? "pass" : "partial",
  evidence: "fixture",
});
test("median is order-independent and never fabricates missing data", () => {
  assert.equal(median([90, 70, 80]), 80);
  assert.equal(median([1, 9, 3, 5]), 4);
  assert.equal(median([]), null);
  assert.deepEqual(summary([70, 80, 90]), {
    median: 80,
    min: 70,
    max: 90,
    spread: 20,
  });
});
test("custom scoring weights audits rather than DOM size", () => {
  assert.equal(weightedChecks([check(50, 100, 3), check(10, 10, 1)]), 62.5);
  assert.equal(weightedChecks([check(500, 1000, 3), check(10, 10, 1)]), 62.5);
  assert.equal(weightedChecks([check(0, 0)]), null);
  assert.equal(
    weightedChecks([{ ...check(0, 1), status: "human review" }]),
    null,
  );
});
test("overall scoring uses declared category and device weights", () => {
  const page = {
    runs: ["mobile", "desktop"].map((device) => ({
      device,
      categories: {
        performance: device === "mobile" ? 80 : 100,
        accessibility: 100,
        "best-practices": 100,
        seo: 80,
      },
    })),
    checks: [{ ...check(1, 1), category: "responsive" }, check(1, 2)],
  } as unknown as PageResult;
  const site = { results: [page], scores: {}, score: null } as Site;
  scoreSite(site);
  assert.equal(site.scores.performance, 88);
  assert.equal(site.scores.technical, 90);
  assert.equal(site.score, 86);
});
test("missing Lighthouse result prevents inferred score", () => {
  const site = {
    results: [{ runs: [], checks: [] }],
    scores: {},
    score: null,
  } as unknown as Site;
  scoreSite(site);
  assert.equal(site.score, null);
  assert.equal(site.scores.performance, null);
});
test("URL normalization rejects schemes, credentials and nonstandard ports", () => {
  assert.equal(normalizeUrl("example.com/#section"), "https://example.com/");
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "https://u:p@example.com",
    "http://example.com:8080",
  ])
    assert.throws(() => normalizeUrl(url));
});
test("local mutation guard accepts loopback aliases but rejects real cross-origin requests", () => {
  assert.doesNotThrow(() =>
    assertLocalMutation(
      new Request("http://127.0.0.1:3000/api/jobs", {
        headers: {
          origin: "http://localhost:3000",
          "sec-fetch-site": "cross-site",
        },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertLocalMutation(
      new Request("http://127.0.0.1:3000/api/jobs", {
        headers: {
          origin: "http://127.0.0.1:3000",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertLocalMutation(
      new Request("http://10.0.0.4:10000/api/jobs", {
        headers: {
          origin: "https://uxbench-demo.onrender.com",
          "x-forwarded-host": "uxbench-demo.onrender.com",
          "x-forwarded-proto": "https",
        },
      }),
    ),
  );
  assert.throws(() =>
    assertLocalMutation(
      new Request("http://127.0.0.1:3000/api/jobs", {
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    ),
  );
  assert.throws(() =>
    assertLocalMutation(
      new Request("http://127.0.0.1:3000/api/jobs", {
        headers: { origin: "http://localhost:4000" },
      }),
    ),
  );
});
test("SSRF blocks loopback, private, link-local, reserved and mapped ranges", async () => {
  for (const ip of [
    "127.0.0.1",
    "127.20.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.31.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(isPublicIp(ip), false, ip);
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  for (const url of [
    "http://localhost",
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
  ])
    await assert.rejects(validateUrl(url));
});
test("deduplication retains different pages and viewport evidence", () => {
  const f = {
    rule: "label",
    page: "https://example.com",
    selector: "#field",
    viewport: 390,
  } as Finding;
  assert.equal(
    deduplicate([
      f,
      f,
      { ...f, page: "https://example.com/other" },
      { ...f, viewport: 1440 },
    ]).length,
    3,
  );
});
test("comparison uncertainty respects observed spread", () => {
  assert.equal(tooClose([80, 82, 84], [83, 85, 87]), true);
  assert.equal(tooClose([80, 82, 84], [95, 96, 97]), false);
  assert.equal(tooClose([], []), false);
});
test("sampling respects origin, count, roles and non-destructive paths", () => {
  const pages = samplePages("https://example.com/", [
    "/about",
    "/contact",
    "/blog/article",
    "/events",
    "/logout",
    "https://evil.example/",
    "/file.pdf",
    "/about",
  ]);
  assert.equal(pages.length, 5);
  assert.equal(new Set(pages).size, 5);
  assert(pages.includes("https://example.com/contact"));
  assert(pages.every((p) => new URL(p).origin === "https://example.com"));
});
test("responsive bounds and target dimensions use CSS pixel thresholds", () => {
  assert.equal(overflow(320, 320), false);
  assert.equal(overflow(320, 900), true);
  assert.equal(smallTarget(24, 24), false);
  assert.equal(smallTarget(23, 30), true);
});
test("axe parsing preserves DOM evidence and separates incomplete checks", () => {
  const violation = {
    id: "label",
    help: "Form label missing",
    description: "Inputs need accessible labels",
    helpUrl: "https://deque.com",
    impact: "serious",
    tags: ["wcag2a", "wcag412", "wcag2411"],
    nodes: [
      {
        target: ["#email"],
        html: '<input id="email">',
        failureSummary: "No accessible name",
      },
    ],
  };
  const results = {
    violations: [violation],
    incomplete: [{ ...violation, id: "color-contrast" }],
    passes: [],
    testEngine: { version: "fixture" },
  } as unknown as AxeResults;
  const parsed = parseAxe(results, "https://example.com", 390);
  assert.equal(parsed.findings[0].selector, "#email");
  assert.equal(parsed.findings[0].severity, "High");
  assert.match(parsed.findings[0].standard, /4\.1\.2/);
  assert.match(parsed.findings[0].standard, /2\.4\.11/);
  assert.equal(parsed.findings[1].confidence, "Human review required");
});
test("CrUX missing configuration and missing coverage stay distinct", async () => {
  const key = process.env.CRUX_API_KEY;
  delete process.env.CRUX_API_KEY;
  assert.equal(
    (await getCrux("https://example.com", "PHONE")).status,
    "not-configured",
  );
  process.env.CRUX_API_KEY = "test";
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 404 });
  try {
    const result = await getCrux("https://example.com", "PHONE");
    assert.equal(result.status, "unavailable");
    assert.match(result.message, /Not enough Chrome UX Report/);
  } finally {
    globalThis.fetch = original;
    if (key) process.env.CRUX_API_KEY = key;
    else delete process.env.CRUX_API_KEY;
  }
});
test("Core Web Vital boundaries are inclusive", () => {
  assert.equal(vitalsRating("lcp", 2500), "Good");
  assert.equal(vitalsRating("lcp", 4000), "Needs improvement");
  assert.equal(vitalsRating("inp", 501), "Poor");
  assert.equal(vitalsRating("cls", 0.1), "Good");
});

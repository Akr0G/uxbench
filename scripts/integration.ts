import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { runRules } from "../lib/rules";
import { accessibility } from "../lib/accessibility";
import { lighthouseRun } from "../lib/lighthouse";
import { startProxy } from "../lib/security";
const directory = path.resolve("data/verification");
await mkdir(directory, { recursive: true });
const broken = await readFile("fixtures/broken.html", "utf8");
const healthy = await readFile("fixtures/healthy.html", "utf8");
// This closed test-only proxy serves in-memory fixtures. It never connects to a target.
// Production validation remains unchanged; the application cannot select this transport.
const fixture = http.createServer((req, res) => {
  if (!req.url?.startsWith("http://fixture.uxbench.test/")) {
    res.writeHead(403);
    res.end();
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(req.url.includes("healthy") ? healthy : broken);
});
await new Promise<void>((r) => fixture.listen(0, "127.0.0.1", r));
const port = (fixture.address() as import("node:net").AddressInfo).port;
try {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 844 },
    });
    await page.setContent(broken);
    const responsive = await runRules(
      page,
      "http://fixture.uxbench.test/broken",
      320,
      "responsive",
    );
    assert(responsive.findings.some((f) => f.rule === "reflow"));
    assert(
      responsive.findings.some(
        (f) =>
          f.rule === "target-size" && f.confidence === "Human review required",
      ),
    );
    const axe = await accessibility(
      page,
      "http://fixture.uxbench.test/broken",
      320,
    );
    assert(
      axe.findings.some(
        (f) => f.rule === "label" && f.selector === "#unlabeled",
      ),
    );
    assert(axe.findings.some((f) => f.rule === "button-name"));
    await writeFile(
      path.join(directory, "fixture-axe.json"),
      JSON.stringify(axe.raw, null, 2),
    );
    await page.screenshot({
      path: path.join(directory, "broken-320.png"),
      fullPage: true,
    });
    await page.setContent(healthy);
    const good = await runRules(
      page,
      "http://fixture.uxbench.test/healthy",
      320,
      "responsive",
    );
    assert(!good.findings.some((f) => f.rule === "reflow"));
    console.log(
      "PASS: fixture overflow, target review, real axe DOM findings, healthy reflow.",
    );
  } finally {
    await browser.close();
  }
  const result = await lighthouseRun(
    "http://fixture.uxbench.test/broken",
    "mobile",
    0,
    port,
    directory,
    "fixture",
  );
  assert(result.run.categories.performance !== null);
  assert(
    result.run.categories.accessibility !== null &&
      result.run.categories.accessibility < 100,
  );
  console.log("PASS: actual fixture Lighthouse", result.run.categories);
  let failed = false;
  try {
    await lighthouseRun(
      "http://blocked.uxbench.test/",
      "mobile",
      0,
      port,
      directory,
      "failed-fixture",
    );
  } catch {
    failed = true;
  }
  assert(failed, "HTTP 403 must fail rather than fabricate values");
  console.log("PASS: failed Lighthouse navigation does not produce a score.");
  const guard = await startProxy();
  try {
    const response = await new Promise<number>((resolve, reject) => {
      http
        .get(
          { host: "127.0.0.1", port: guard.port, path: "http://127.0.0.1/" },
          (r) => {
            r.resume();
            resolve(r.statusCode || 0);
          },
        )
        .on("error", reject);
    });
    assert.equal(response, 403);
    console.log("PASS: proxy rejects loopback at connection time.");
  } finally {
    guard.close();
  }
} finally {
  await new Promise<void>((r) => fixture.close(() => r()));
}

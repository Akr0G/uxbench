import lighthouse from "lighthouse";
import { chromium } from "playwright";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { METHODOLOGY } from "./config";
import type { Finding, Run } from "./types";

export async function lighthouseRun(
  url: string,
  device: Run["device"],
  index: number,
  proxyPort: number,
  directory: string,
  prefix: string,
) {
  const profile = await mkdtemp(path.join(tmpdir(), "uxbench-chrome-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: "<-loopback>" },
    args: [
      "--remote-debugging-port=0",
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
    serviceWorkers: "block",
  });
  const timer = setTimeout(() => void context.close(), 120000);
  try {
    const port = Number(
      (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(
        "\n",
      )[0],
    );
    const viewport = METHODOLOGY.devices[device];
    const result = await lighthouse(url, {
      port,
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      formFactor: device,
      screenEmulation: {
        mobile: device === "mobile",
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttlingMethod: "simulate",
      throttling: { ...METHODOLOGY.throttling[device] },
      maxWaitForLoad: 45000,
      maxWaitForFcp: 30000,
      output: "json",
    });
    if (!result) throw new Error("Lighthouse did not return a report.");
    const lhr = result.lhr;
    if (lhr.runtimeError)
      throw new Error(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
    const rawFile = `${prefix}-${device}-${index}-lighthouse.json`;
    await writeFile(path.join(directory, rawFile), JSON.stringify(lhr));
    const categories = Object.fromEntries(
      Object.entries(lhr.categories).map(([key, c]) => [
        key,
        c.score === null ? null : c.score * 100,
      ]),
    );
    const metrics = Object.fromEntries(
      [
        "first-contentful-paint",
        "largest-contentful-paint",
        "total-blocking-time",
        "speed-index",
        "cumulative-layout-shift",
      ].map((key) => [key, lhr.audits[key]?.numericValue ?? null]),
    );
    const run: Run = {
      device,
      index,
      version: lhr.lighthouseVersion,
      browser: lhr.environment.hostUserAgent,
      categories,
      metrics,
      settings: lhr.configSettings,
      rawFile,
    };
    // axe is the canonical source for accessibility findings. LH contributes its category score,
    // but repeating its accessibility findings here would count the same DOM problem twice.
    const findings: Finding[] = Object.values(lhr.audits)
      .filter(
        (a) =>
          a.score !== null &&
          a.score < 1 &&
          (a.details?.type === "opportunity" || a.id.endsWith("-insight")),
      )
      .map((a) => ({
        id: crypto.randomUUID(),
        rule: a.id,
        title: a.title,
        category: "performance",
        severity: "Low",
        confidence: "High",
        page: url,
        selector: "",
        evidence: a.displayValue || a.explanation || a.title,
        why: a.description,
        recommendation: a.description,
        standard: `Lighthouse ${lhr.lighthouseVersion}`,
        viewport: viewport.width,
      }));
    return { run, findings };
  } finally {
    clearTimeout(timer);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

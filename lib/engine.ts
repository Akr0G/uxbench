import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startProxy, validateUrl } from "./security";
import { METHODOLOGY } from "./config";
import { dataDir, saveJob } from "./db";
import { lighthouseRun } from "./lighthouse";
import { accessibility } from "./accessibility";
import { runRules } from "./rules";
import { getCrux } from "./crux";
import { deduplicate, scoreSite } from "./scoring";
import { pageRole } from "./discovery";
import type { Job, PageResult } from "./types";

export async function executeJob(job: Job) {
  const update = (stage: string) => {
    job.stage = stage;
    saveJob(job);
  };
  job.status = "running";
  update("Preparing audit");
  const directory = path.join(dataDir, job.id);
  await mkdir(directory, { recursive: true });
  const proxy = await startProxy();
  try {
    // Round-robin pages across sites reduces order effects. Every run is serialized.
    const count = Math.max(...job.sites.map((s) => s.pages.length));
    for (let p = 0; p < count; p++)
      for (let s = 0; s < job.sites.length; s++) {
        const site = job.sites[s],
          url = site.pages[p];
        if (!url) continue;
        const prefix = `site-${s}-page-${p}`;
        const result: PageResult = {
          url,
          role: pageRole(url),
          errors: [],
          runs: [],
          checks: [],
          findings: [],
          screenshots: [],
          field: {},
          rawFiles: [],
        };
        const saveRaw = async (name: string, raw: unknown) => {
          await writeFile(path.join(directory, name), JSON.stringify(raw));
          result.rawFiles!.push(name);
        };
        site.results.push(result);
        try {
          await validateUrl(url);
          for (const device of ["mobile", "desktop"] as const) {
            for (let run = 0; run < METHODOLOGY.runs[job.mode]; run++) {
              update(
                `${site.name} · Page ${p + 1} · Running ${device} performance tests (${run + 1}/${METHODOLOGY.runs[job.mode]})`,
              );
              try {
                const output = await lighthouseRun(
                  url,
                  device,
                  run,
                  proxy.port,
                  directory,
                  prefix,
                );
                result.runs.push(output.run);
                result.findings.push(...output.findings);
              } catch (error) {
                result.errors.push(
                  `${device} run ${run + 1}: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
              saveJob(job);
            }
          }
          const browser = await chromium.launch({
            headless: true,
            proxy: {
              server: `http://127.0.0.1:${proxy.port}`,
              bypass: "<-loopback>",
            },
            args: [
              "--disable-quic",
              "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            ],
          });
          const browserDeadline = setTimeout(
            () => void browser.close(),
            180000,
          );
          try {
            const context = await browser.newContext({
              serviceWorkers: "block",
            });
            const page = await context.newPage();
            page.setDefaultTimeout(15000);
            update(`${site.name} · Page ${p + 1} · Loading page`);
            const response = await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: METHODOLOGY.timeout,
            });
            await page
              .waitForLoadState("networkidle", { timeout: 5000 })
              .catch(() => {});
            result.finalUrl = page.url();
            await validateUrl(result.finalUrl);
            result.status = response?.status();
            if (result.status && result.status >= 400)
              throw new Error(`Page returned HTTP ${result.status}`);
            result.navigation = await page.locator("nav a").allTextContents();
            for (const width of METHODOLOGY.widths) {
              await page.setViewportSize({
                width,
                height: width < 768 ? 844 : 900,
              });
              await page.evaluate(
                () =>
                  new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                      requestAnimationFrame(() => resolve()),
                    ),
                  ),
              );
              update(
                `${site.name} · Page ${p + 1} · Testing responsive layouts (${width}px)`,
              );
              const custom = await runRules(page, url, width, "responsive");
              await saveRaw(
                `${prefix}-${width}-responsive.json`,
                custom.measurements,
              );
              result.checks.push(...custom.checks);
              result.findings.push(...custom.findings);
              if (width === 390 || width === 1440) {
                update(
                  `${site.name} · Page ${p + 1} · Running accessibility checks (${width}px)`,
                );
                const a11y = await accessibility(page, url, width);
                result.findings.push(...a11y.findings);
                result.checks.push(...a11y.checks);
                await saveRaw(`${prefix}-${width}-axe.json`, a11y.raw);
                update(
                  `${site.name} · Page ${p + 1} · Capturing screenshots (${width}px)`,
                );
                const height = Math.min(
                  await page.evaluate(
                    () => document.documentElement.scrollHeight,
                  ),
                  12000,
                );
                const name = `${prefix}-${width}.png`;
                await page.screenshot({
                  path: path.join(directory, name),
                  clip: { x: 0, y: 0, width, height },
                  timeout: 15000,
                });
                result.screenshots.push({ name, width, height });
              }
            }
            update(
              `${site.name} · Page ${p + 1} · Evaluating usability signals`,
            );
            const custom = await runRules(page, url, 1440, "usability");
            await saveRaw(`${prefix}-1440-usability.json`, custom.measurements);
            result.checks.push(...custom.checks);
            result.findings.push(...custom.findings);
            update(
              `${site.name} · Page ${p + 1} · Testing text-spacing adaptation`,
            );
            await page.addStyleTag({
              content:
                "* { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important; } p { margin-bottom:2em !important; }",
            });
            const spacing = await runRules(page, url, 1440, "responsive");
            await saveRaw(
              `${prefix}-1440-text-spacing.json`,
              spacing.measurements,
            );
            for (const finding of spacing.findings.filter(
              (f) => f.rule === "clipping",
            ))
              result.findings.push({
                ...finding,
                rule: "text-spacing",
                title: "Potential clipping after text-spacing override",
                standard: "WCAG 2.2 SC 1.4.12 — human verification required",
                confidence: "Human review required",
              });
          } finally {
            clearTimeout(browserDeadline);
            await browser.close();
          }
          update(`${site.name} · Page ${p + 1} · Requesting real-user data`);
          result.field.mobile = await getCrux(url, "PHONE");
          result.field.desktop = await getCrux(url, "DESKTOP");
        } catch (error) {
          result.error = error instanceof Error ? error.message : String(error);
          result.errors.push(result.error);
        }
        result.findings = deduplicate(result.findings);
        job.completed++;
        scoreSite(site);
        saveJob(job);
      }
    update("Calculating results");
    for (const site of job.sites) {
      scoreSite(site);
      if (
        site.results.some(
          (p) => p.runs.length !== 2 * METHODOLOGY.runs[job.mode] || p.error,
        )
      )
        site.score = null;
    }
    job.status = job.sites.some((s) =>
      s.results.some((p) => p.runs.length || p.checks.length),
    )
      ? "completed"
      : "failed";
    update(
      job.status === "failed"
        ? "Audit failed — inspect page errors"
        : "Report ready",
    );
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    update("Audit failed");
  } finally {
    proxy.close();
  }
}

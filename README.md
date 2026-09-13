# UXBench

UXBench is a local website research application with two focused actions: grade one website or compare two websites. It runs actual Lighthouse, axe-core, and Playwright checks, then shows the score, key metrics, and prioritized findings. It does not generate demo scores or substitute results when an audit fails.

## Setup

The app uses Next.js App Router, React, TypeScript, Tailwind CSS, Lucide, Lighthouse, Playwright, axe-core, and SQLite. A project-local Node 22 runtime is included as a development dependency because the original machine had Node 17. The package lock records the tested versions. TypeScript 6 and ESLint 9 are pinned to compatible major versions because the installed React/Next lint plugins do not yet work with the newest major versions.

```sh
npm install
export PATH="$PWD/node_modules/node/bin:$PATH"
npx playwright install chromium
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:3000**. `npm run dev` starts both Next.js and a separate, serial audit worker. Keep the terminal running. The worker must be running for queued jobs to progress. On Linux, use `npx playwright install --with-deps chromium` to install browser system libraries.

For a production-mode local run:

```sh
npm run build
npm start
```

Scripts currently use the macOS/Linux project-local Node path. On Windows, use Node 22.19 or newer and run the equivalent commands with `node` instead.

## Environment

| Variable           | Purpose                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `CRUX_API_KEY`     | Optional Google Chrome UX Report API key. Enables exact-URL mobile/desktop field queries. |
| `UXBENCH_DATA_DIR` | Database and evidence directory; defaults to `./data`.                                    |
| `UXBENCH_HOST` | Bind address for Next.js; defaults to `127.0.0.1`. |
| `UXBENCH_ACCESS_USER` / `UXBENCH_ACCESS_PASSWORD` | Optional shared HTTP Basic Auth credentials for a hosted demo. |

The launcher loads `.env` and `.env.local` for both processes. Keys are never returned to the browser. No API key is needed for Lighthouse, Playwright, axe, comparisons, or exports.

## Workflow

1. Choose **Grade one website** or **Compare two websites**.
2. Enter one public HTTP(S) URL for each website. The comparison applies the identical methodology to both URLs.
3. UXBench runs Standard analysis: three Lighthouse runs on mobile and three on desktop for each site.
4. Follow actual worker stages. A score is withheld when required measurements cannot complete.
5. Review the overall score, five category scores, key measured metrics, and prioritized findings. Download the raw JSON report when you need the underlying evidence.

Completed, fully scored jobs can be reused for six hours. Select **Force a fresh audit** to bypass the cache. A restarted worker marks interrupted jobs failed; it never silently mixes fresh and interrupted runs.

## Architecture and data

- `lib/security.ts`: URL normalization, IP classification, DNS validation, and a pinned-address HTTP/CONNECT proxy.
- `lib/lighthouse.ts`: real Lighthouse Node API, one fresh browser profile per run, raw result persistence, and a hard browser deadline.
- `lib/engine.ts`: serial job stages, per-page execution, responsive checks, screenshot capture, CrUX, partial failures.
- `lib/rules.ts`: typed central custom-rule registry with applicability, weight, confidence, references, and executable checks.
- `lib/accessibility.ts`: axe execution and DOM evidence parsing. Lighthouse accessibility findings are not duplicated as axe findings.
- `lib/scoring.ts`: median and weighted scoring calculations, variability descriptions, and deduplication.
- `lib/jobs.ts`: validated creation, comparison fairness, and cache policy.
- `lib/db.ts`: SQLite in WAL mode. The app uses Node's native SQLite API instead of Prisma to keep the local installation self-contained. Jobs are versioned JSON documents containing sites, selected pages, audit runs, metrics, scores, findings, and screenshots; heuristic findings are separate records. This schema preserves the raw report topology and methodology snapshot.
- `scripts/worker.ts`: one durable queue consumer, worker lock, interruption recovery.
- `app/`: focused two-flow interface, simplified results, and API routes.

The database is `data/uxbench.sqlite`. Raw Lighthouse and axe JSON and screenshots live under `data/<job-id>/`. Evidence is served through validated asset routes, not a public upload directory. Back up the entire data directory, including SQLite WAL files, while the app is stopped for a consistent backup.

## Lighthouse and responsive testing

The engine uses Lighthouse's returned category scores. It never reimplements Google's Performance scoring curve. Each run gets a fresh Chromium profile; Chrome communicates through the SSRF proxy. Tests are serialized, with page order rotated across sites. The report retains the Lighthouse version, browser user agent, viewport, throttling settings, raw metrics, and timestamp.

Mobile is 390 × 844 with simulated mobile throttling; desktop is 1440 × 900 with simulated desktop settings. Exact network and CPU values are in `lib/config.ts` and each raw Lighthouse report. Performance runs have a 120-second hard browser deadline. The remaining browser stage has a 180-second deadline, plus navigation and individual request timeouts.

Playwright inspects widths 320, 360, 390, 768, 1024, and 1440. Checks include document overflow, offscreen controls, image overflow, clipping candidates, viewport configuration, and small target candidates. axe runs at 390 and 1440. Text-spacing overrides probe further clipping. Screenshot capture is limited to the first 12,000 CSS pixels. Up to 40 example failing elements per custom rule and width are displayed; check counts cover all applicable elements.

Navigation link health samples up to eight distinct same-origin header/navigation links. It follows browser redirects through the guarded proxy. Network timeouts are not automatically classified as broken links. Forms are not submitted and destructive-looking paths are excluded from discovery and link probes.

## Scoring

**Automated UX Evidence Score = 0.25 Accessibility + 0.25 Performance + 0.20 Responsive & Interaction + 0.20 Usability Signals + 0.10 Technical Quality.**

- Performance and Accessibility: median Lighthouse category score for each page/device, weighted 60% mobile and 40% desktop, then averaged equally across selected pages.
- Technical: mean of Lighthouse Best Practices and SEO, with the same device/page policy.
- Responsive and Usability: `100 × Σ(weight × passing/applicable) / Σ(applicable weights)`. Weights are centralized in the rule registry. Unscored human-review checks and non-applicable checks are excluded.
- axe findings support evidence inspection and do not add a second penalty for issues already reflected by Lighthouse.
- CrUX availability and human review findings never affect the automated score.
- Missing required runs/pages prevent a complete overall score. Successfully measured categories remain visible.

Manual test example: Accessibility 100, Performance 88 (80 mobile × .6 + 100 desktop × .4), Responsive 100, Usability 50, Technical 90 gives **86** overall. Unit tests independently verify this calculation and weighted partial checks.

Competition reports expose category scores and run distributions. A single-page pair is marked too close when the median difference does not exceed the larger run spread or one point. This is descriptive, not a significance test. Multi-page distributions include genuine page differences, so inspect per-page raw runs before making performance claims.

## Limits and human research

Automated checks identify measurable UX-related signals, not universal UX quality or WCAG conformance. WCAG-EM informs scope and representative sampling, but this application is not a complete WCAG-EM evaluation. A normal-text contrast target is 4.5:1, large text 3:1, with actual axe applicability. A sub-24px target is a review candidate because WCAG 2.2 SC 2.5.8 includes exceptions. Overflow can be intentional or exempt under SC 1.4.10.

Focus visibility, keyboard task flows, zoom, overlap and sticky-element obstruction, responsive menu behavior, modal interaction, real-world language, mental models, learnability, aesthetics, satisfaction, and task success need human evaluation where automatic checks cannot establish an outcome. The Methodology screen makes these coverage limits explicit. Cross-page component-style consistency, screenshot drag annotations, evaluator agreement matching, and the optional task-based user-test module are not implemented. Individual evaluator findings and screenshots are supported; ordinal severity ratings are not averaged.

Field metrics use CrUX p75 and collection period when available. LCP good ≤2,500ms (poor >4,000ms); INP good ≤200ms (poor >500ms); CLS good ≤0.1 (poor >0.25). Lighthouse TBT is not INP. A missing API key, insufficient field coverage, and API errors are separate states.

## Testing

```sh
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
# With the app running:
node_modules/node/bin/node --import tsx scripts/browser-smoke.ts
```

Unit tests cover scoring, partial weights, medians, URL validation, private/reserved address protection, deduplication, variability comparisons, page sampling, overflow, target dimensions, axe parsing, failed/missing run scoring, field-data absence, and vital thresholds.

Integration tests serve deliberately broken and healthy fixtures through an isolated in-memory test transport. They assert real axe DOM findings, responsive overflow detection, real Lighthouse values, failed Lighthouse behavior, and proxy rejection. There is no production localhost allowlist or user-selectable SSRF bypass. Verification outputs are written to `data/verification/`. The browser smoke test checks routes, keyboard dismissal, reflow, app accessibility findings, exports, and PDF generation.

## Safe deployment

This release is intended for a **trusted local research workspace**, bound to 127.0.0.1. It has no multi-user authentication. Do not expose it directly to the public internet. A hosted deployment requires authentication and authorization on reports/assets, per-user quotas, storage retention, queue monitoring, an isolated browser container, and outbound firewall rules denying private/reserved networks independently of application checks. Use a long-running Node host, not a short-lived serverless function.


The application rejects credentials, non-HTTP(S) URLs, and nonstandard ports. Its proxy validates DNS at connection time and connects to the validated IP, preventing DNS rebinding between validation and connection. Redirects, frames, and browser subresources go through the same proxy; loopback bypass is disabled and QUIC/non-proxied WebRTC are disabled. Browser exploitation requires OS/container isolation as defense in depth. Page scripts still execute as part of a real browser audit.

### Render demo deployment

`render.yaml` and the Dockerfile provide a no-card, free Render demo deployment. It includes Chromium, runs the app and audit worker in one container, and prompts you to set an invite password during setup. In Render, choose **New → Blueprint**, connect the `Akr0G/uxbench` repository, and select the `main` branch. Render reads `render.yaml`; enter an invite password when prompted and click **Apply**.

The free tier has only 512 MB RAM and can sleep after 15 minutes of inactivity. It uses temporary filesystem storage, so queued jobs and completed reports disappear when Render restarts or sleeps. Treat it as a shareable demonstration, not a reliable public service. A paid service with persistent storage and per-user authorization is required for durable public use.

## References

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [W3C WCAG-EM 2.0](https://www.w3.org/TR/WCAG-EM/)
- [Google Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/)
- [Core Web Vitals](https://web.dev/articles/vitals)
- [Chrome UX Report](https://developer.chrome.com/docs/crux/)
- [axe-core](https://github.com/dequelabs/axe-core)
- [Nielsen Norman Group: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)

The in-app Methodology page provides the scoring formula, every custom audit weight, evidence distinctions, thresholds, and limitations. If scoring definitions change, increment the methodology/rule version and retain old report snapshots.

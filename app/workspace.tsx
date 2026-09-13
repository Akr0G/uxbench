"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import type { Category, Finding, Job, Site } from "@/lib/types";
import { CATEGORY_NAMES } from "@/lib/config";
import { median } from "@/lib/scoring";

type Mode = "audit" | "compare";
const categories = Object.keys(CATEGORY_NAMES) as Category[];

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function domain(url: string) {
  try {
    return new URL(
      url.includes("://") ? url : `https://${url}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}

function number(value: number | null | undefined, digits = 0) {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function relevantFindings(site: Site) {
  const rank: Record<Finding["severity"], number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
    Informational: 4,
  };
  return site.results
    .flatMap((page) => page.findings)
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function metric(site: Site, key: string) {
  const values = site.results.map((page) =>
    median(
      page.runs.flatMap((run) =>
        run.metrics[key] === null ? [] : [run.metrics[key]],
      ),
    ),
  );
  return values.length && values.every((value) => value !== null)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0) /
        values.length
    : null;
}

export default function Workspace() {
  const [mode, setMode] = useState<Mode>("audit");
  const [firstUrl, setFirstUrl] = useState("");
  const [secondUrl, setSecondUrl] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const interval = window.setInterval(async () => {
      try {
        setJob(await request<Job>(`/api/jobs/${job.id}`));
      } catch {
        /* Polling recovers on its next attempt. */
      }
    }, 1800);
    return () => window.clearInterval(interval);
  }, [job]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const urls = mode === "compare" ? [firstUrl, secondUrl] : [firstUrl];
      const sites = urls.map((url) => ({
        name: domain(url),
        url,
        pages: [url],
      }));
      setJob(
        await request<Job>("/api/jobs", {
          mode: "standard",
          fresh: true,
          sites,
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to start the audit.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="simple-app">
      <header className="simple-header">
        <Link className="simple-brand" href="/">
          <span>UX</span>Bench
        </Link>
        <small>Evidence-based website grading</small>
      </header>
      {!job ? (
        <section className="simple-hero">
          <div className="simple-kicker">UX WEBSITE AUDIT</div>
          <h1>
            Understand your website
            <br />
            in a few clear scores.
          </h1>
          <p>
            Use the same repeatable checks for every website: accessibility,
            performance, responsive behavior, usability signals, and technical
            quality.
          </p>
          <div
            className="simple-switch"
            role="tablist"
            aria-label="Choose an audit type"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "audit"}
              className={mode === "audit" ? "active" : ""}
              onClick={() => setMode("audit")}
            >
              Grade one website
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "compare"}
              className={mode === "compare" ? "active" : ""}
              onClick={() => setMode("compare")}
            >
              Compare two websites
            </button>
          </div>
          <form className="simple-form" onSubmit={submit}>
            <label>
              Your website URL
              <input
                required
                inputMode="url"
                value={firstUrl}
                onChange={(event) => setFirstUrl(event.target.value)}
                placeholder="https://your-website.com"
              />
            </label>
            {mode === "compare" && (
              <label>
                Website to compare
                <input
                  required
                  inputMode="url"
                  value={secondUrl}
                  onChange={(event) => setSecondUrl(event.target.value)}
                  placeholder="https://another-website.com"
                />
              </label>
            )}
            {error && (
              <p className="simple-error" role="alert">
                {error}
              </p>
            )}
            <button className="simple-submit" disabled={busy}>
              {busy
                ? "Starting audit…"
                : mode === "audit"
                  ? "Grade website"
                  : "Compare websites"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="simple-note">
            Standard analysis: 3 Lighthouse runs on mobile and desktop. Results
            normally take a few minutes.
          </p>
        </section>
      ) : (
        <Result
          job={job}
          onNew={() => {
            setJob(null);
            setError("");
          }}
        />
      )}
      <section className="simple-method">
        <div>
          <ShieldCheck size={21} />
          <h2>What the grade means</h2>
        </div>
        <p>
          The Automated UX Evidence Score combines Accessibility (25%),
          Performance (25%), Responsive &amp; Interaction Quality (20%),
          Usability Signals (20%), and Technical Quality (10%). It identifies
          measurable evidence; it does not claim complete accessibility
          conformance or replace user testing.
        </p>
      </section>
    </main>
  );
}

function Result({ job, onNew }: { job: Job; onNew: () => void }) {
  const working = job.status === "queued" || job.status === "running";
  return (
    <section className="simple-result">
      <div className="result-topline">
        <div>
          <span className="simple-kicker">
            {job.kind === "comparison" ? "WEBSITE COMPARISON" : "WEBSITE GRADE"}
          </span>
          <h1>
            {working
              ? "Checking your website…"
              : job.status === "failed"
                ? "The audit could not finish"
                : job.kind === "comparison"
                  ? "Your comparison is ready."
                  : "Your website grade is ready."}
          </h1>
          <p>
            {working
              ? job.stage
              : job.kind === "comparison"
                ? "Both sites were tested with the same three mobile and three desktop Lighthouse runs."
                : "Your score is based on the completed evidence below."}
          </p>
        </div>
        <button className="simple-new" onClick={onNew}>
          <RefreshCw size={15} />
          New audit
        </button>
      </div>
      {working && (
        <div className="simple-progress" aria-live="polite">
          <div>
            <strong>{job.stage}</strong>
            <span>
              {job.completed} of {job.total} page{job.total === 1 ? "" : "s"}{" "}
              complete
            </span>
          </div>
          <progress value={job.completed} max={job.total} />
        </div>
      )}
      {job.error && (
        <p className="simple-error" role="alert">
          {job.error}
        </p>
      )}
      {!working && (
        <>
          <>
            {job.kind === "audit" ? (
              <SingleResult site={job.sites[0]} />
            ) : (
              <CompareResult sites={job.sites} />
            )}
          </>
          <details className="simple-details">
            <summary>How this was measured</summary>
            <p>
              Every site used the same 390px mobile and 1440px desktop settings,
              simulated throttling, and Standard mode: three Lighthouse runs per
              device. The score uses the saved{" "}
              <strong>UXBench Methodology 1.0</strong>. Performance uses run
              medians. CrUX real-user data is separate and never changes this
              score.
            </p>
            <a href={`/api/export?id=${job.id}`}>
              Download the raw audit data <ExternalLink size={13} />
            </a>
          </details>
        </>
      )}
    </section>
  );
}

function ScoreCard({ site }: { site: Site }) {
  return (
    <div className="simple-score-card">
      <div className="simple-score">
        <strong>{number(site.score)}</strong>
        <span>/ 100</span>
      </div>
      <div>
        <h2>{site.name}</h2>
        <p>
          {site.score === null
            ? "Incomplete measurements"
            : "Automated UX Evidence Score"}
        </p>
      </div>
    </div>
  );
}
function CategoryRows({ site }: { site: Site }) {
  return (
    <div className="simple-categories">
      {categories.map((category) => (
        <div key={category}>
          <span>{CATEGORY_NAMES[category]}</span>
          <div>
            <i style={{ width: `${site.scores[category] ?? 0}%` }} />
          </div>
          <strong>{number(site.scores[category])}</strong>
        </div>
      ))}
    </div>
  );
}
function Findings({ site }: { site: Site }) {
  const findings = relevantFindings(site).slice(0, 6);
  return (
    <section className="simple-findings">
      <h2>
        What to improve <small>{site.name}</small>
      </h2>
      {findings.length ? (
        <ul>
          {findings.map((finding) => (
            <li key={finding.id}>
              <span
                className={`simple-severity ${finding.severity.toLowerCase()}`}
              >
                {finding.severity}
              </span>
              <div>
                <strong>{finding.title}</strong>
                <p>{finding.recommendation}</p>
                <small>
                  {finding.standard} · {finding.confidence}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No prioritized issues were found in the completed checks. This does
          not establish full accessibility conformance.
        </p>
      )}
    </section>
  );
}
function SingleResult({ site }: { site: Site }) {
  const lcp = metric(site, "largest-contentful-paint");
  return (
    <>
      <div className="simple-result-grid">
        <ScoreCard site={site} />
        <section className="simple-metrics">
          <h2>Key measured metrics</h2>
          <div>
            <span>
              LCP
              <strong>{number(lcp === null ? null : lcp / 1000, 2)} s</strong>
            </span>
            <span>
              CLS
              <strong>
                {number(metric(site, "cumulative-layout-shift"), 3)}
              </strong>
            </span>
            <span>
              Performance<strong>{number(site.scores.performance)}</strong>
            </span>
          </div>
        </section>
      </div>
      <section className="simple-breakdown">
        <h2>Score breakdown</h2>
        <CategoryRows site={site} />
      </section>
      <Findings site={site} />
    </>
  );
}
function CompareResult({ sites }: { sites: Site[] }) {
  const [first, second] = sites;
  return (
    <>
      <div className="simple-compare-scores">
        {sites.map((site) => (
          <ScoreCard key={site.url} site={site} />
        ))}
      </div>
      <section className="simple-comparison">
        <h2>Side-by-side score breakdown</h2>
        {categories.map((category) => (
          <div key={category}>
            <span>{CATEGORY_NAMES[category]}</span>
            <strong>{number(first.scores[category])}</strong>
            <i />
            <strong>{number(second.scores[category])}</strong>
          </div>
        ))}
      </section>
      <div className="simple-findings-grid">
        <Findings site={first} />
        <Findings site={second} />
      </div>
    </>
  );
}

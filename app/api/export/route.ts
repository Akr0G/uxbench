import { getJob } from "@/lib/db";
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const job = getJob(url.searchParams.get("id") || "");
  if (!job) return new Response("Report not found", { status: 404 });
  const csv = url.searchParams.get("format") === "csv";
  const rows = [
    [
      "Website",
      "Page",
      "Category",
      "Rule",
      "Severity",
      "Confidence",
      "Title",
      "Selector",
      "Evidence",
      "Standard",
      "Recommendation",
    ],
    ...job.sites.flatMap((s) =>
      s.results.flatMap((p) =>
        p.findings.map((f) => [
          s.name,
          p.url,
          f.category,
          f.rule,
          f.severity,
          f.confidence,
          f.title,
          f.selector,
          f.evidence,
          f.standard,
          f.recommendation,
        ]),
      ),
    ),
  ];
  return new Response(
    csv
      ? rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
      : JSON.stringify(job, null, 2),
    {
      headers: {
        "Content-Type": csv ? "text/csv;charset=utf-8" : "application/json",
        "Content-Disposition": `attachment; filename="uxbench-${job.id}.${csv ? "csv" : "json"}"`,
      },
    },
  );
}

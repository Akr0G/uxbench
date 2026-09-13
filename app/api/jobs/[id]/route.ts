import { getJob } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const job = getJob((await params).id);
  return job
    ? Response.json(job)
    : Response.json({ error: "Audit not found" }, { status: 404 });
}

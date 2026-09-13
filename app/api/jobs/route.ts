import { jobs } from "@/lib/db";
import { createJob } from "@/lib/jobs";
import { assertLocalMutation } from "@/lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(jobs());
}
export async function POST(request: Request) {
  try {
    assertLocalMutation(request);
    if (Number(request.headers.get("content-length") || 0) > 100000)
      throw new Error("Request too large");
    return Response.json(await createJob(await request.json()), {
      status: 201,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create audit",
      },
      { status: 400 },
    );
  }
}

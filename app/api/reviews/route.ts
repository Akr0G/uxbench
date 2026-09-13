import { z } from "zod";
import { reviews, saveReview } from "@/lib/db";
import { assertLocalMutation } from "@/lib/security";
const schema = z.object({
  site: z.string().min(1).max(2048),
  page: z.string().min(1).max(2048),
  evaluator: z.string().min(1).max(80),
  heuristic: z.number().int().min(0).max(9),
  description: z.string().min(1).max(5000),
  area: z.string().max(500),
  recommendation: z.string().max(5000),
  severity: z.number().int().min(0).max(4),
  notes: z.string().max(5000),
  screenshot: z
    .string()
    .max(2000000)
    .refine(
      (s) =>
        !s || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
      "Use a PNG, JPEG, or WebP image",
    ),
});
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(reviews());
}
export async function POST(request: Request) {
  try {
    assertLocalMutation(request);
    const value = schema.parse(await request.json());
    const review = {
      ...value,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    saveReview(review);
    return Response.json(review);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to save review",
      },
      { status: 400 },
    );
  }
}

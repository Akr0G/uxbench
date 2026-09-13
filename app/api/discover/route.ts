import { discover } from "@/lib/discovery";
import { assertLocalMutation } from "@/lib/security";
export async function POST(request: Request) {
  try {
    assertLocalMutation(request);
    const input = await request.json();
    if (typeof input.url !== "string" || input.url.length > 2048)
      throw new Error("Enter a valid URL");
    return Response.json({ pages: await discover(input.url) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Discovery failed" },
      { status: 400 },
    );
  }
}

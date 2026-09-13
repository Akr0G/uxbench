import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir, getJob } from "@/lib/db";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await params;
  if (
    !/^[\da-f-]{36}$/.test(id) ||
    !/^site-\d+-page-\d+-(?:(?:320|360|390|768|1024|1440)(?:-(?:axe|responsive|usability|text-spacing))?|(?:mobile|desktop)-\d+-lighthouse)\.(png|json)$/.test(
      name,
    ) ||
    !getJob(id)
  )
    return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(dataDir, id, name));
    return new Response(data, {
      headers: {
        "Content-Type": name.endsWith(".png")
          ? "image/png"
          : "application/json",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

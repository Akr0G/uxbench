import { NextResponse, type NextRequest } from "next/server";

/** Optional shared-password gate for a hosted demo. */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const password = process.env.UXBENCH_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const username = process.env.UXBENCH_ACCESS_USER || "uxbench";
  const expected = `Basic ${btoa(`${username}:${password}`)}`;
  if (request.headers.get("authorization") === expected) return NextResponse.next();

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="UXBench"',
    },
  });
}

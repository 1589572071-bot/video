import { NextRequest, NextResponse } from "next/server";

const PUBLIC_API = [
  "/api/auth/review",
  "/api/config/status",
];

export function middleware(request: NextRequest) {
  const code = process.env.METACUT_REVIEW_ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && !PUBLIC_API.some((p) => pathname.startsWith(p))) {
    if (request.cookies.get("metacut_review_access")?.value !== code) {
      return NextResponse.json({ error: "需要访问码" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

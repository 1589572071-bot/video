import { NextRequest, NextResponse } from "next/server";
import { isReviewAuthEnabled, setReviewAccessCookie } from "@/lib/review-auth";

export async function GET(request: NextRequest) {
  const code = process.env.METACUT_REVIEW_ACCESS_CODE;
  const authed = !code || request.cookies.get("metacut_review_access")?.value === code;
  return NextResponse.json({ enabled: isReviewAuthEnabled(), authed });
}

export async function POST(request: NextRequest) {
  const expected = process.env.METACUT_REVIEW_ACCESS_CODE;
  if (!expected) {
    return NextResponse.json({ success: true, enabled: false });
  }
  const body = await request.json().catch(() => ({}));
  if (String(body.code ?? "") !== expected) {
    return NextResponse.json({ error: "访问码错误" }, { status: 401 });
  }
  return setReviewAccessCookie(NextResponse.json({ success: true, enabled: true }));
}

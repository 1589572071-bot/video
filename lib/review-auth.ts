import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "metacut_review_access";

export function isReviewAuthEnabled(): boolean {
  return Boolean(process.env.METACUT_REVIEW_ACCESS_CODE);
}

export function hasReviewAccess(request: NextRequest): boolean {
  const code = process.env.METACUT_REVIEW_ACCESS_CODE;
  if (!code) return true;
  return request.cookies.get(COOKIE_NAME)?.value === code;
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "需要访问码" }, { status: 401 });
}

export function setReviewAccessCookie(response: NextResponse): NextResponse {
  const code = process.env.METACUT_REVIEW_ACCESS_CODE;
  if (!code) return response;
  response.cookies.set(COOKIE_NAME, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { createProject } from "@/lib/project-store";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const projectId = await createProject(body.title);
  return NextResponse.json({ success: true, projectId });
}

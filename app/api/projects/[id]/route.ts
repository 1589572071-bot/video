import { NextRequest, NextResponse } from "next/server";
import { getProjectSnapshot } from "@/lib/project-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const snapshot = await getProjectSnapshot(params.id);
  if (!snapshot) {
    return NextResponse.json({ error: "项目不存在或数据库未配置" }, { status: 404 });
  }
  return NextResponse.json({ success: true, snapshot });
}

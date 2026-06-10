import { NextRequest, NextResponse } from "next/server";
import { getRenderJob } from "@/lib/render-job-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const job = await getRenderJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    steps: job.steps,
    result: job.result,
    error: job.error,
    updatedAt: job.updatedAt,
  });
}

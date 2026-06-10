import { NextRequest, NextResponse } from "next/server";
import { saveScriptVersion } from "@/lib/project-store";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const scriptId = await saveScriptVersion({
    projectId: params.id,
    versionType: body.versionType ?? null,
    label: body.label ?? body.versionType ?? "current",
    scriptMarkdown: body.scriptMarkdown ?? null,
    scriptManifest: body.scriptManifest,
    gapPlan: body.gapPlan,
  });
  return NextResponse.json({ success: true, scriptId });
}

import { NextRequest, NextResponse } from "next/server";
import { parseDirectorIntent } from "@/lib/director/intent-parser";
import { executeDirectorActions } from "@/lib/director/execute-actions";
import { DIRECTOR_TOOLS, type DirectorChatRequest } from "@/lib/director/tools";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DirectorChatRequest;
    const { message, context = {}, execute = true } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "请输入消息" }, { status: 400 });
    }

    const intent = await parseDirectorIntent({
      message: message.trim(),
      manifest: body.scriptManifest ?? undefined,
      context,
    });

    let results;
    if (execute && intent.actions.length > 0) {
      results = await executeDirectorActions(intent.actions, {
        scriptManifest: body.scriptManifest,
        product: body.product,
        productImageUrls: body.productImageUrls,
        productVideoUrls: body.productVideoUrls,
        videoAnalysis: body.videoAnalysis,
        requestOrigin: request.nextUrl.origin,
        chunkVideos: body.chunkVideos,
        projectId: body.projectId,
      });

      const failed = results.filter((r) => !r.success);
      if (failed.length === 0 && results.length > 0) {
        const summaries = results.map((r) => r.message).join("；");
        intent.reply = summaries || intent.reply;
      } else if (failed.length > 0) {
        intent.reply = `${intent.reply} ${failed.map((f) => f.message).join("；")}`;
      }
    } else if (intent.actions.length === 0 && !context.scriptSummary) {
      intent.reply = intent.reply.replace(
        "请先生成剧本",
        context.scriptSummary ? `当前剧本：${context.scriptSummary}` : "请先生成剧本"
      );
    }

    return NextResponse.json({
      success: true,
      reply: intent.reply,
      actions: intent.actions,
      results,
      toolsAvailable: DIRECTOR_TOOLS.map((t) => t.name),
    });
  } catch (e) {
    console.error("director/chat error:", e);
    return NextResponse.json({ error: "导演对话失败" }, { status: 500 });
  }
}

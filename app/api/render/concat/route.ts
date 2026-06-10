import { NextRequest, NextResponse } from "next/server";
import { concatChunkVideos } from "@/lib/editor/rerun-block";
import type { ScriptManifest } from "@/lib/types/pipeline";

/** 纯 FFmpeg 拼接 chunk 为成片（不重跑 HappyHorse） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chunkVideos = [], projectId, scriptManifest } = body as {
      chunkVideos?: string[];
      projectId?: string | null;
      scriptManifest?: ScriptManifest | null;
    };

    if (!chunkVideos.filter(Boolean).length) {
      return NextResponse.json({ error: "缺少 chunkVideos" }, { status: 400 });
    }

    const finalVideo = await concatChunkVideos(chunkVideos, projectId, scriptManifest);
    if (!finalVideo) {
      return NextResponse.json(
        { error: "无法拼接：请安装 FFmpeg 或仅有一个区块" },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, final_video: finalVideo });
  } catch (e) {
    console.error("render/concat error:", e);
    const msg = e instanceof Error ? e.message : "拼接失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

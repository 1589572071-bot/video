import { NextRequest, NextResponse } from "next/server";
import { originFromRequestHeaders } from "@/lib/asset-public-url";
import { rerunBlocks } from "@/lib/editor/rerun-block";
import type { ProductInput, ScriptManifest } from "@/lib/types/pipeline";
import type { RerunStrategy } from "@/lib/editor/block-rerun-strategy";

/** 区块重跑 HappyHorse（默认 cascade：从 N 批量重跑到结尾并拼接；chunkVideos 仅用于合并已有 chunk） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      scriptManifest,
      product,
      blockIndex,
      productImageUrls = [],
      mockMode,
      forcedMode,
      strategy = "cascade",
      chunkVideos = [],
      projectId,
    } = body as {
      scriptManifest: ScriptManifest;
      product: ProductInput;
      blockIndex: number;
      productImageUrls?: string[];
      mockMode?: boolean;
      forcedMode?: "t2v" | "i2v" | "r2v";
      strategy?: RerunStrategy;
      chunkVideos?: string[];
      projectId?: string | null;
    };

    if (!scriptManifest?.blocks || !blockIndex) {
      return NextResponse.json({ error: "缺少 scriptManifest 或 blockIndex" }, { status: 400 });
    }

    const batch = await rerunBlocks({
      manifest: scriptManifest,
      product,
      startBlockIndex: blockIndex,
      strategy,
      existingChunkVideos: chunkVideos,
      productImageUrls,
      requestOrigin: originFromRequestHeaders(request.nextUrl.origin, request.headers),
      projectId,
      mockMode,
      forcedMode,
    });

    const last = batch.results[batch.results.length - 1];

    return NextResponse.json({
      success: true,
      block_index: last?.block_index ?? blockIndex,
      video_url: last?.video_url,
      local_url: last?.local_url,
      task_id: last?.task_id,
      mode: last?.mode,
      model: last?.model,
      updated_chunks: batch.updated_chunks,
      reran_blocks: batch.reran_blocks,
      final_video: batch.final_video,
      strategy: batch.strategy,
      concat_available: batch.concat_available,
    });
  } catch (e) {
    console.error("render/block error:", e);
    const msg = e instanceof Error ? e.message : "区块重跑失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import type { ProductInput, ScriptBlockManifest, ScriptManifest } from "@/lib/types/pipeline";
import {
  generateWan26VideoChunk,
  buildBlockVideoPrompt,
  selectWan26VideoMode,
  type Wan26VideoMode,
} from "@/lib/providers/wan26-video";
import {
  concatVideos,
  downloadVideoToLocal,
  isFfmpegAvailable,
} from "@/lib/ffmpeg-utils";
import {
  burnTextOverlaysForBlockVideo,
  burnTextOverlaysForManifestChunks,
} from "@/lib/video-text-overlay";
import { isBailianConfigured, MODEL_CONFIG } from "@/lib/model-config";
import { getRerunPlan, type RerunStrategy } from "@/lib/editor/block-rerun-strategy";

export type { RerunStrategy };

export interface RerunBlockInput {
  manifest: ScriptManifest;
  product: ProductInput;
  blockIndex: number;
  productImageUrls?: string[];
  requestOrigin?: string;
  projectId?: string | null;
  mockMode?: boolean;
  forcedMode?: Wan26VideoMode;
}

export interface RerunBlockResult {
  block_index: number;
  video_url: string;
  local_url: string;
  task_id?: string;
  mode: string;
  model: string;
}

export interface RerunBlocksInput {
  manifest: ScriptManifest;
  product: ProductInput;
  startBlockIndex: number;
  strategy?: RerunStrategy;
  existingChunkVideos?: string[];
  productImageUrls?: string[];
  requestOrigin?: string;
  projectId?: string | null;
  mockMode?: boolean;
  forcedMode?: Wan26VideoMode;
}

export interface RerunBlocksResult {
  updated_chunks: string[];
  reran_blocks: number[];
  final_video: string | null;
  results: RerunBlockResult[];
  strategy: RerunStrategy;
  concat_available: boolean;
}

function resolveBlockFirstFrame(
  block: ScriptBlockManifest,
  productImageUrls?: string[]
): string | null {
  return block.shots[0]?.keyframe_url ?? productImageUrls?.[0] ?? null;
}

/** 单区块重跑万相2.6 */
export async function rerunBlock(input: RerunBlockInput): Promise<RerunBlockResult> {
  const block = input.manifest.blocks.find((b) => b.index === input.blockIndex);
  if (!block) throw new Error(`区块 ${input.blockIndex} 不存在`);

  const mockMode = input.mockMode ?? MODEL_CONFIG.render.mockMode ?? !isBailianConfigured();
  const firstFrameUrl = resolveBlockFirstFrame(block, input.productImageUrls);

  if (mockMode) {
    const url = firstFrameUrl || "/uploads/keyframes/safe-template.svg";
    return {
      block_index: block.index,
      video_url: url,
      local_url: url,
      mode: "mock",
      model: "mock",
    };
  }

  const mode =
    input.forcedMode ??
    selectWan26VideoMode(block, {
      firstFrameUrl,
      referenceImageUrls: input.productImageUrls,
      preferR2v: Boolean(input.productImageUrls?.length),
    });

  const prompt = buildBlockVideoPrompt(
    block,
    input.manifest.global_visual_anchor,
    input.product.product_name
  );

  const hh = await generateWan26VideoChunk({
    block,
    prompt,
    mode,
    firstFrameUrl: mode === "i2v" ? firstFrameUrl : undefined,
    referenceImageUrls: mode === "r2v" ? input.productImageUrls : undefined,
    requestOrigin: input.requestOrigin,
  });

  const rawLocalUrl = await downloadVideoToLocal(
    hh.videoUrl,
    `block-rerun-${block.index}-${Date.now()}`,
    {
      projectId: input.projectId,
      assetKind: "renders/chunks",
      assetRecordKind: "render_chunk",
    }
  );
  const localUrl = await burnTextOverlaysForBlockVideo({
    videoUrl: rawLocalUrl,
    block,
    basename: `block-rerun-${block.index}-text-${Date.now()}`,
    projectId: input.projectId,
    assetKind: "renders/chunks",
    assetRecordKind: "render_chunk",
  });

  return {
    block_index: block.index,
    video_url: hh.videoUrl,
    local_url: localUrl,
    task_id: hh.taskId,
    mode: hh.mode,
    model: hh.model,
  };
}

/** 单块或批量重跑，可选拼接成片 */
export async function rerunBlocks(input: RerunBlocksInput): Promise<RerunBlocksResult> {
  const strategy = input.strategy ?? "cascade";
  const plan = getRerunPlan(input.manifest, input.startBlockIndex, strategy);
  const mockMode = input.mockMode ?? MODEL_CONFIG.render.mockMode ?? !isBailianConfigured();
  const ffmpegOk = await isFfmpegAvailable();

  const updatedChunks = [...(input.existingChunkVideos ?? [])];
  while (updatedChunks.length < input.manifest.blocks.length) {
    updatedChunks.push("");
  }

  const results: RerunBlockResult[] = [];

  for (const blockIndex of plan.blocksToRun) {
    const arrayIdx = blockIndex - 1;

    const result = await rerunBlock({
      manifest: input.manifest,
      product: input.product,
      blockIndex,
      productImageUrls: input.productImageUrls,
      requestOrigin: input.requestOrigin,
      projectId: input.projectId,
      mockMode,
      forcedMode: input.forcedMode,
    });

    results.push(result);
    updatedChunks[arrayIdx] = result.local_url;
  }

  const textReadyChunks = await burnTextOverlaysForManifestChunks({
    chunkVideos: updatedChunks,
    manifest: input.manifest,
    projectId: input.projectId,
  });

  const filledChunks = textReadyChunks.filter(Boolean);
  let finalVideo: string | null = null;

  if (filledChunks.length > 0) {
    if (filledChunks.length === 1 && textReadyChunks.filter(Boolean).length === 1) {
      finalVideo = filledChunks[0];
    } else if (
      ffmpegOk &&
      textReadyChunks.every(Boolean) &&
      textReadyChunks.length > 1
    ) {
      try {
        finalVideo = await concatVideos(
          textReadyChunks.filter(Boolean),
          `rerun-final-${Date.now()}`,
          { projectId: input.projectId, assetKind: "renders/final" }
        );
      } catch (e) {
        console.warn("重跑后拼接失败:", e);
        finalVideo = filledChunks[filledChunks.length - 1];
      }
    }
  }

  return {
    updated_chunks: textReadyChunks,
    reran_blocks: plan.blocksToRun,
    final_video: finalVideo,
    results,
    strategy,
    concat_available: ffmpegOk,
  };
}

/** 仅拼接已有 chunk，不重跑 HappyHorse */
export async function concatChunkVideos(
  chunkVideos: string[],
  projectId?: string | null,
  manifest?: ScriptManifest | null
): Promise<string | null> {
  const textReadyChunks = manifest
    ? await burnTextOverlaysForManifestChunks({ chunkVideos, manifest, projectId })
    : chunkVideos;
  const urls = textReadyChunks.filter(Boolean);
  if (urls.length === 0) return null;
  if (urls.length === 1) return urls[0];
  if (!(await isFfmpegAvailable())) return null;
  return concatVideos(urls, `concat-${Date.now()}`, {
    projectId,
    assetKind: "renders/final",
  });
}

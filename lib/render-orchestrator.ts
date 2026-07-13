import { resolveShotFallback } from "./fallback-ladder";
import { isBailianConfigured, MODEL_CONFIG } from "./model-config";
import {
  buildBlockVideoPrompt,
  generateWan26VideoChunk,
  selectWan26VideoMode,
} from "./providers/wan26-video";
import { generateKeyframes } from "./keyframe-generator";
import {
  concatVideos,
  downloadVideoToLocal,
  isFfmpegAvailable,
} from "./ffmpeg-utils";
import { burnTextOverlaysForBlockVideo } from "./video-text-overlay";
import type {
  KeyframeResult,
  ProductInput,
  RenderOrchestrationResult,
  RenderShotResult,
  ScriptManifest,
  ChunkRenderTelemetry,
} from "./types/pipeline";

export interface RenderInput {
  manifest: ScriptManifest;
  product: ProductInput;
  productImageUrls?: string[];
  productVideoUrl?: string | null;
  productVideoUrls?: string[];
  referenceVideoUrl?: string | null;
  mockMode?: boolean;
  requestOrigin?: string;
  projectId?: string | null;
  onProgress?: (progress: number, message: string) => void;
}

const SAFE_TEMPLATE_URL = "/safe-template.svg";

function shouldUseMock(input: RenderInput): boolean {
  if (input.mockMode === true) return true;
  if (input.mockMode === false) return !isBailianConfigured();
  return MODEL_CONFIG.render.mockMode || !isBailianConfigured();
}

/** 渲染编排：fallback 决策 + 分镜首帧 + 万相2.6 分块 + FFmpeg 拼接 */
export async function orchestrateRender(
  input: RenderInput
): Promise<RenderOrchestrationResult> {
  const mockMode = shouldUseMock(input);
  const {
    manifest,
    product,
    productImageUrls = [],
    productVideoUrl = null,
    productVideoUrls,
    referenceVideoUrl = null,
    requestOrigin,
    projectId,
    onProgress,
  } = input;

  const report = (pct: number, msg: string) => onProgress?.(pct, msg);

  const imageCount = productImageUrls.length;
  // 兼容数组与单值：优先用 productVideoUrls 数组长度，兜底单个 url
  const videoUrlList = (productVideoUrls ?? []).filter(Boolean);
  const primaryVideoUrl = productVideoUrl ?? videoUrlList[0] ?? null;
  const videoCount = videoUrlList.length > 0 ? videoUrlList.length : primaryVideoUrl ? 1 : 0;

  let usedImages = 0;
  let usedVideos = 0;
  const shotResults: RenderShotResult[] = [];

  for (const block of manifest.blocks) {
    for (const shot of block.shots) {
      const fallback = resolveShotFallback({
        shotIndex: shot.index,
        event: {
          start: shot.start,
          end: shot.end,
          event_name: shot.narrative_stage,
        },
        gapPlan: manifest.gap_plan,
        inventory: {
          product_images_count: imageCount,
          product_video_clips_count: videoCount,
          product_image_urls: productImageUrls,
          product_video_url: primaryVideoUrl,
        },
        product,
        usedImageSlots: usedImages,
        usedVideoSlots: usedVideos,
      });

      if (fallback.asset_source === "user_image") usedImages++;
      if (fallback.asset_source === "user_video_clip") usedVideos++;

      shotResults.push({
        shot_index: shot.index,
        asset_source: fallback.asset_source,
        fallback_applied: fallback.fallback_applied,
        status:
          fallback.fallback_applied === "narrative_degrade"
            ? "degraded"
            : "success",
        message: fallback.ui_label,
      });
    }
  }

  const allTextOnly = shotResults.every((s) => s.asset_source === "text_only");
  if (allTextOnly && !mockMode && imageCount === 0) {
    return {
      cover_thumbnail: SAFE_TEMPLATE_URL,
      keyframes: [],
      shot_results: shotResults.map((s) => ({
        ...s,
        status: "blocked" as const,
        fallback_applied: "safe_template",
        message: "无可用视觉素材，请上传商品图",
      })),
      chunk_videos: [],
      final_video: null,
      gap_plan: manifest.gap_plan,
      blocked: true,
      block_reason: "无商品图且全部为 text_only",
      provider: mockMode ? "mock" : "bailian",
    };
  }

  report(10, "生成分镜首帧 · keyframe");
  const keyframeResult = await generateKeyframes(
    {
      manifest,
      product,
      productImageUrls,
      globalVisualAnchor: manifest.global_visual_anchor,
    },
    {
      mockMode,
      requestOrigin,
      projectId,
      onProgress: (msg) => report(12, msg),
    }
  );
  const keyframes: KeyframeResult[] = keyframeResult.keyframes;
  const cover_thumbnail =
    keyframeResult.cover_thumbnail ?? productImageUrls[0] ?? SAFE_TEMPLATE_URL;
  const defaultFirstFrame = cover_thumbnail ?? productImageUrls[0] ?? null;

  for (const keyframe of keyframes) {
    const sr = shotResults.find((s) => s.shot_index === keyframe.shot_index);
    if (sr) sr.keyframe_url = keyframe.url;
  }

  if (mockMode) {
    return orchestrateRenderMock({
      manifest,
      cover_thumbnail,
      defaultFirstFrame,
      shotResults,
      referenceVideoUrl,
      onProgress: report,
    });
  }

  return orchestrateRenderBailian({
    manifest,
    product,
    productImageUrls,
    keyframes,
    cover_thumbnail,
    defaultFirstFrame,
    shotResults,
    requestOrigin,
    projectId,
    onProgress: report,
  });
}

async function orchestrateRenderMock(params: {
  manifest: ScriptManifest;
  cover_thumbnail: string | null;
  defaultFirstFrame: string | null;
  shotResults: RenderShotResult[];
  referenceVideoUrl: string | null;
  onProgress?: (pct: number, msg: string) => void;
}): Promise<RenderOrchestrationResult> {
  params.onProgress?.(80, "Mock 分块占位");
  const chunkVideos = params.manifest.blocks
    .map(() => params.defaultFirstFrame ?? params.referenceVideoUrl ?? "")
    .filter(Boolean);

  const finalVideo =
    params.referenceVideoUrl ?? chunkVideos[0] ?? params.cover_thumbnail ?? null;

  params.onProgress?.(100, "Mock 渲染完成");

  return {
    cover_thumbnail: params.cover_thumbnail,
    keyframes: [],
    shot_results: params.shotResults,
    chunk_videos: chunkVideos,
    final_video: finalVideo,
    gap_plan: params.manifest.gap_plan,
    blocked: false,
    provider: "mock",
  };
}

async function orchestrateRenderBailian(params: {
  manifest: ScriptManifest;
  product: ProductInput;
  productImageUrls: string[];
  keyframes: KeyframeResult[];
  cover_thumbnail: string | null;
  defaultFirstFrame: string | null;
  shotResults: RenderShotResult[];
  requestOrigin?: string;
  projectId?: string | null;
  onProgress?: (pct: number, msg: string) => void;
}): Promise<RenderOrchestrationResult> {
  const chunkLocalUrls: string[] = [];
  const chunkTelemetry: ChunkRenderTelemetry[] = [];
  const totalBlocks = params.manifest.blocks.length;

  for (let i = 0; i < params.manifest.blocks.length; i++) {
    const block = params.manifest.blocks[i];
    const pctBase = 20 + Math.floor((i / totalBlocks) * 70);
    params.onProgress?.(pctBase, `万相2.6 区块 ${block.index}/${totalBlocks}`);

    const firstShot = block.shots[0];
    const keyframe: string | null =
      firstShot?.keyframe_url ??
      params.defaultFirstFrame ??
      params.productImageUrls[0] ??
      null;

    const mode = selectWan26VideoMode(block, {
      firstFrameUrl: keyframe,
      referenceImageUrls: params.productImageUrls,
      preferR2v:
        params.productImageUrls.length > 0 &&
        block.shots.some((s) => s.is_aigc_supplement),
    });

    const prompt = buildBlockVideoPrompt(
      block,
      params.manifest.global_visual_anchor,
      params.product.product_name
    );

    const hh = await generateWan26VideoChunk({
      block,
      prompt,
      mode,
      firstFrameUrl: mode === "i2v" ? keyframe : undefined,
      referenceImageUrls:
        mode === "r2v" ? params.productImageUrls : undefined,
      aspectRatio: params.manifest.aspect_ratio.replace(":", ":") === params.manifest.aspect_ratio
        ? params.manifest.aspect_ratio
        : "9:16",
      requestOrigin: params.requestOrigin,
      onPoll: (msg) => params.onProgress?.(pctBase + 5, msg),
    });

    const rawLocalUrl = await downloadVideoToLocal(
      hh.videoUrl,
      `chunk-${block.index}-${Date.now()}`,
      {
        projectId: params.projectId,
        assetKind: "renders/chunks",
        assetRecordKind: "render_chunk",
      }
    );
    params.onProgress?.(pctBase + 8, `烧录区块 ${block.index} 花字/字幕`);
    const localUrl = await burnTextOverlaysForBlockVideo({
      videoUrl: rawLocalUrl,
      block,
      basename: `chunk-${block.index}-text-${Date.now()}`,
      projectId: params.projectId,
      assetKind: "renders/chunks",
      assetRecordKind: "render_chunk",
    });
    chunkLocalUrls.push(localUrl);
    chunkTelemetry.push({
      block_index: block.index,
      model: hh.model,
      mode: hh.mode,
      task_id: hh.taskId,
      video_url: hh.videoUrl,
      local_url: localUrl,
    });
  }

  params.onProgress?.(92, "FFmpeg 拼接成片");
  let finalVideo: string | null = null;
  try {
    if (chunkLocalUrls.length > 1 && (await isFfmpegAvailable())) {
      finalVideo = await concatVideos(chunkLocalUrls, `final-${Date.now()}`, {
        projectId: params.projectId,
        assetKind: "renders/final",
      });
    } else {
      finalVideo = chunkLocalUrls[0] ?? null;
    }
  } catch (e) {
    console.warn("拼接失败，使用首块:", e);
    finalVideo = chunkLocalUrls[0] ?? null;
  }

  params.onProgress?.(100, "百炼渲染完成");

  return {
    cover_thumbnail: params.cover_thumbnail,
    keyframes: params.keyframes,
    shot_results: params.shotResults,
    chunk_videos: chunkLocalUrls,
    chunk_telemetry: chunkTelemetry,
    final_video: finalVideo,
    gap_plan: params.manifest.gap_plan,
    blocked: false,
    provider: "bailian",
  };
}

export function summarizeRender(result: RenderOrchestrationResult): string {
  const aigcCount = result.shot_results.filter(
    (s) => s.message === "本镜为 AI 补足" || s.status === "degraded"
  ).length;
  const provider = result.provider === "bailian" ? "百炼" : "Mock";
  const chunks = result.chunk_videos.length;
  return `${provider} · ${result.shot_results.length} 镜头 · ${chunks} 区块 · ${aigcCount} 镜 AI/降级`;
}

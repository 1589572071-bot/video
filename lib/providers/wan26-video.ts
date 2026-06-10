import { MODEL_CONFIG } from "@/lib/model-config";
import { resolveDashScopeMediaUrl } from "@/lib/asset-public-url";
import { createAsyncTask, pollTask } from "@/lib/providers/dashscope-client";
import type { ScriptBlockManifest } from "@/lib/types/pipeline";

export type Wan26VideoMode = "t2v" | "i2v" | "r2v";

export interface Wan26VideoGenerateInput {
  block: ScriptBlockManifest;
  prompt: string;
  mode: Wan26VideoMode;
  firstFrameUrl?: string | null;
  referenceImageUrls?: string[];
  durationSec?: number;
  aspectRatio?: string;
  requestOrigin?: string;
  onPoll?: (msg: string) => void;
}

export interface Wan26VideoGenerateResult {
  videoUrl: string;
  taskId: string;
  mode: Wan26VideoMode;
  model: string;
}

function clampDuration(block: ScriptBlockManifest): number {
  const dur = Math.ceil(block.end - block.start);
  return Math.min(15, Math.max(2, dur));
}

function modelForMode(mode: Wan26VideoMode): string {
  const v = MODEL_CONFIG.bailian.video;
  if (mode === "i2v") return v.i2v;
  if (mode === "r2v") return v.r2v;
  return v.t2v;
}

/** 宽高比 → 万相 2.6 文生视频 / 参考生视频的 size 参数 */
function aspectRatioToSize(ratio: string): string {
  const custom = MODEL_CONFIG.bailian.video.defaultSize;
  if (custom && custom.includes("*")) return custom;
  const r = ratio.replace(/\s/g, "");
  if (r === "9:16" || r === "720:1280") return "720*1280";
  if (r === "16:9" || r === "1280:720") return "1280*720";
  if (r === "1:1") return "960*960";
  return "720*1280";
}

async function buildWan26RequestBody(
  input: Wan26VideoGenerateInput
): Promise<Record<string, unknown>> {
  const cfg = MODEL_CONFIG.bailian.video;
  const model = modelForMode(input.mode);
  const duration = input.durationSec ?? clampDuration(input.block);
  const size = aspectRatioToSize(input.aspectRatio ?? cfg.defaultRatio);
  const resolution = cfg.defaultResolution;

  const baseParams: Record<string, unknown> = {
    duration,
    prompt_extend: true,
    shot_type: "multi",
  };

  if (input.mode === "t2v") {
    return {
      model,
      input: { prompt: input.prompt },
      parameters: { ...baseParams, size },
    };
  }

  if (input.mode === "i2v") {
    if (input.firstFrameUrl) {
      const imgUrl = await resolveDashScopeMediaUrl(
        input.firstFrameUrl,
        input.requestOrigin
      );
      return {
        model,
        input: { prompt: input.prompt, img_url: imgUrl },
        parameters: { ...baseParams, resolution },
      };
    }
    return {
      model: cfg.t2v,
      input: { prompt: input.prompt },
      parameters: { ...baseParams, size },
    };
  }

  const refPaths = (input.referenceImageUrls ?? []).slice(0, 5);
  const refs = await Promise.all(
    refPaths.map((url) => resolveDashScopeMediaUrl(url, input.requestOrigin))
  );
  const refPrompt =
    refs.length > 0
      ? `${input.prompt} character1 showcases the product with smooth commercial motion.`
      : input.prompt;

  return {
    model,
    input: {
      prompt: refPrompt,
      ...(refs.length > 0 ? { reference_urls: refs } : {}),
    },
    parameters: { ...baseParams, size },
  };
}

/** 选择万相 2.6 视频模式 */
export function selectWan26VideoMode(
  block: ScriptBlockManifest,
  opts: {
    firstFrameUrl?: string | null;
    referenceImageUrls?: string[];
    preferR2v?: boolean;
  }
): Wan26VideoMode {
  // 有首帧时优先图生视频（支持 base64，无需公网 Origin）
  if (opts.firstFrameUrl) {
    return "i2v";
  }
  if (
    opts.preferR2v &&
    opts.referenceImageUrls &&
    opts.referenceImageUrls.length > 0
  ) {
    return "r2v";
  }
  if (opts.referenceImageUrls && opts.referenceImageUrls.length > 0) {
    return "r2v";
  }
  return "t2v";
}

/** 万相 2.6 分块视频生成（百炼 video-synthesis 旧版协议） */
export async function generateWan26VideoChunk(
  input: Wan26VideoGenerateInput
): Promise<Wan26VideoGenerateResult> {
  const cfg = MODEL_CONFIG.bailian.video;
  const model = modelForMode(input.mode);
  const body = await buildWan26RequestBody(input);

  input.onPoll?.(`创建万相2.6任务 · ${model} · 区块 ${input.block.index}`);

  const taskId = await createAsyncTask(cfg.endpoint, body);
  const result = await pollTask(taskId, {
    onPoll: (r) =>
      input.onPoll?.(`万相2.6 区块 ${input.block.index}: ${r.status}`),
  });

  const videoUrl = result.videoUrl;
  if (!videoUrl) {
    throw new Error(`万相2.6 区块 ${input.block.index} 未返回 video_url`);
  }

  return { videoUrl, taskId, mode: input.mode, model };
}

export function buildBlockVideoPrompt(
  block: ScriptBlockManifest,
  globalAnchor: string,
  productName?: string
): string {
  const stages = block.shots.map((s) => s.narrative_stage).join(", ");
  const degrade = block.shots.find((s) => s.degraded_narrative)?.degraded_narrative;
  const shotPlan = block.shots
    .map((shot) => {
      const visual =
        shot.packaging?.visual_interaction ??
        shot.packaging?.narrative_content ??
        shot.degraded_narrative ??
        shot.stage_brief ??
        shot.narrative_stage;
      return `Shot ${shot.index} (${shot.start.toFixed(1)}-${shot.end.toFixed(1)}s): ${visual}`;
    })
    .join(" | ");
  return [
    degrade || `${productName ?? "product"} commercial short video`,
    shotPlan,
    globalAnchor,
    `Stages: ${stages}`,
    "Preserve the shot plan, human/product interaction, scene context, and camera rhythm. Smooth motion, cinematic lighting, e-commerce ad style.",
  ].join(" ");
}

// 兼容旧命名（逐步迁移）
export type HappyHorseMode = Wan26VideoMode;
export const selectHappyHorseMode = selectWan26VideoMode;
export const generateHappyHorseChunk = generateWan26VideoChunk;

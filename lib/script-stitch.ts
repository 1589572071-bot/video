import { detectGaps } from "./gap-detection";
import { resolveShotFallback } from "./fallback-ladder";
import { stitchWithDoubao } from "./providers/doubao-script-stitch";
import { isDoubaoConfigured } from "./model-config";
import { inferStageBrief, applyStageOverrides } from "./script-stage-brief";
import {
  alignManifestToTimelineEvents,
  alignMarkdownToTimelineEvents,
  getTimelineEvents,
  splitTimelineIntoBlocks,
} from "./timeline-shot-align";
import { buildImitationComparisonMarkdown } from "./script-imitation-parser";
import {
  buildRulesNarrativeContent,
  buildRulesStagePackaging,
} from "./rules-shot-packaging";
import type {
  GapPlan,
  ProductInput,
  ScriptBlockManifest,
  ScriptManifest,
  ScriptVersionType,
  StageBriefOverride,
  TimelineEvent,
  VideoAnalysisInput,
} from "./types/pipeline";

export interface StitchInput {
  videoAnalysis: VideoAnalysisInput | null;
  product: ProductInput;
  productImageUrls?: string[];
  productVideoUrl?: string | null;
  productVideoUrls?: string[];
  stageOverrides?: StageBriefOverride[];
  versionType?: ScriptVersionType;
}

export interface StitchOutput {
  scriptMarkdown: string;
  scriptManifest: ScriptManifest;
  gapPlan: GapPlan;
  stitch_source: "doubao" | "rules";
  stitch_fallback_reason?: string;
}

function getEvents(video: VideoAnalysisInput | null): TimelineEvent[] {
  return getTimelineEvents(video);
}

function splitBlocks(events: TimelineEvent[]) {
  return splitTimelineIntoBlocks(events);
}

/** Step3 规则引擎 fallback（无 LLM） */
export function stitchWithGapsRules(input: StitchInput): StitchOutput {
  const { videoAnalysis, product, productImageUrls = [], productVideoUrl = null } = input;

  const imageCount =
    product.user_asset_inventory?.product_images_count ?? productImageUrls.length;
  const videoCount =
    product.user_asset_inventory?.product_video_clips_count ??
    (input.productVideoUrls?.length ?? (productVideoUrl ? 1 : 0));

  const gapPlan = detectGaps(videoAnalysis, product, {
    productImagesCount: imageCount,
    productVideoClipsCount: videoCount,
  });

  const events = getEvents(videoAnalysis);
  const blocks = splitBlocks(events);

  const name = product.product_name ?? "未知商品";
  const pointsArr = product.core_selling_points ?? ["核心卖点"];
  const firstPoint = pointsArr[0];
  const audience = product.target_audience ?? "目标用户";
  const scene = product.usage_scene ?? "日常场景";
  const usage = product.usage_method ?? "直接使用";
  const painGain = product.pain_point_gain_point ?? "当前痛点；带来满足";
  const pain = painGain.split(/[；;]/)[0];
  const gain = painGain.split(/[；;]/)[1] || "带来满足";

  const resolution = videoAnalysis?.meta_info?.resolution ?? "1080x1920";
  const aspectRatio = videoAnalysis?.meta_info?.aspect_ratio ?? "9:16";
  const globalAnchor = "暖黄调室内夜景，高速切镜，霓虹高光，情绪从焦虑到满足";

  const subject = audience.includes("女性") ? "25-35岁都市白领女性" : audience;
  const situation = scene.includes("早晨")
    ? "早晨卧室梳妆台_固定镜头"
    : `${scene}_环境氛围`;
  const motion = usage.includes("晕染")
    ? "指腹轻柔晕染动作"
    : usage.includes("涂抹")
      ? "指腹轻拍涂抹"
      : "产品使用动作";
  const visualDescription = product.visual_description?.trim() || name;

  const packagingCtx = {
    subject,
    situation,
    baseMotion: motion,
    name,
    pain,
    gain,
    points: pointsArr,
    usage,
    visualDescription,
  };

  let usedImages = 0;
  let usedVideos = 0;
  let globalShotIdx = 0;

  const manifestBlocks: ScriptBlockManifest[] = [];
  let script = `## 【剧本基础信息】
- **剧本名称**：${name} · ${scene.split(/[、,，]/)[0]}
- **总时长**：${events[events.length - 1].end.toFixed(1)}s
- **分辨率**：${resolution}
- **宽高比**：${aspectRatio}
- **渲染策略**：${events[events.length - 1].end > 15 ? "长视频多区块分块（15.0s 物理硬切断点）" : "单次生成"}
- **全局视觉锚点描述**：${globalAnchor}

`;

  blocks.forEach((block, blockIdx) => {
    const isFirstBlock = blockIdx === 0;
    const renderMode = isFirstBlock ? "T2V" : "I2V";
    const renderModeLabel = isFirstBlock
      ? "纯文本生成 (T2V)"
      : "图生视频 (I2V)";
    const reference = isFirstBlock
      ? "无"
      : "本区块首镜 keyframe / 商品图";

    script += `---
## 【区块 ${blockIdx + 1}：${block.start.toFixed(1)}s - ${block.end.toFixed(1)}s】
- **渲染模式**：${renderModeLabel}
- **参考起点**：${reference}

`;

    const manifestShots = block.shots.map((event) => {
      globalShotIdx++;
      const shotIndex = globalShotIdx;
      const fallback = resolveShotFallback({
        shotIndex,
        event,
        gapPlan,
        inventory: {
          product_images_count: imageCount,
          product_video_clips_count: videoCount,
          product_image_urls: productImageUrls,
          product_video_url: productVideoUrl,
        },
        product,
        usedImageSlots: usedImages,
        usedVideoSlots: usedVideos,
      });

      if (fallback.asset_source === "user_image") usedImages++;
      if (fallback.asset_source === "user_video_clip") usedVideos++;

      const packaging = buildRulesStagePackaging(event, product, shotIndex, packagingCtx);
      const narrativeContent = buildRulesNarrativeContent(
        event,
        fallback.degraded_narrative,
        packaging
      );
      packaging.narrative_content = narrativeContent;
      const stageBrief = inferStageBrief(event.event_name, product, narrativeContent);

      const assetTag = fallback.is_aigc_supplement
        ? ` · ${fallback.ui_label ?? "本镜为 AI 补足"}`
        : fallback.asset_source === "user_image"
          ? " · 用户商品图"
          : fallback.asset_source === "user_video_clip"
            ? " · 用户演示视频"
            : "";

      script += `* **镜头 ${shotIndex} [${event.start.toFixed(1)}s - ${event.end.toFixed(1)}s] | ${event.event_name}**${assetTag}
  - 资产来源：${fallback.asset_source} | 策略：${fallback.fallback_applied}${fallback.requires_image_gen ? " | 需生图" : ""}
  - 阶段说明：${stageBrief}
  - 镜头语言：${packaging.shot_language}
  - 画面交互：${packaging.visual_interaction}
  - 叙事内容：${narrativeContent}
  - 口播文案：${packaging.voice_script}
  - 人声：${packaging.voiceover}
  - 音效：${packaging.sound_effects}
  - 背景音乐：${packaging.bgm}
  - 屏幕花字：${packaging.on_screen_text}
`;

      return {
        index: shotIndex,
        block_index: blockIdx + 1,
        start: event.start,
        end: event.end,
        narrative_stage: event.event_name,
        asset_source: fallback.asset_source,
        gap_codes: fallback.gap_codes,
        fallback_applied: fallback.fallback_applied,
        requires_image_gen: fallback.requires_image_gen,
        is_aigc_supplement: fallback.is_aigc_supplement,
        ui_label: fallback.ui_label,
        stage_brief: stageBrief,
        degraded_narrative: fallback.degraded_narrative,
        packaging,
        keyframe_url: null,
      };
    });

    manifestBlocks.push({
      index: blockIdx + 1,
      start: block.start,
      end: block.end,
      render_mode: renderMode,
      is_continuation: false,
      shots: manifestShots,
    });
  });

  script += buildImitationComparisonMarkdown({
    videoAnalysis,
    product,
    events,
    hookPain: pain,
    hookAdapted: pain,
    gain,
    firstPoint,
  });

  const scriptManifest: ScriptManifest = applyStageOverrides(
    alignManifestToTimelineEvents(
      {
        schema_version: "script_manifest/v1",
        version_type: input.versionType,
        total_duration: events[events.length - 1].end,
        aspect_ratio: aspectRatio,
        resolution,
        global_visual_anchor: globalAnchor,
        blocks: manifestBlocks,
        cover_shot_index: 1,
        gap_plan: gapPlan,
      },
      input.videoAnalysis,
      product
    ),
    input.stageOverrides
  );

  return {
    scriptMarkdown: script,
    scriptManifest,
    gapPlan,
    stitch_source: "rules",
  };
}

function buildGapPlan(input: StitchInput): GapPlan {
  const imageCount = Math.max(
    input.product.user_asset_inventory?.product_images_count ?? 0,
    input.productImageUrls?.length ?? 0
  );
  const videoCount = Math.max(
    input.product.user_asset_inventory?.product_video_clips_count ?? 0,
    input.productVideoUrls?.length ?? (input.productVideoUrl ? 1 : 0)
  );
  return detectGaps(input.videoAnalysis, input.product, {
    productImagesCount: imageCount,
    productVideoClipsCount: videoCount,
  });
}

/** Step3: 缺口检测 + 豆包剧本生成（失败 fallback 规则引擎） */
export async function stitchWithGaps(input: StitchInput): Promise<StitchOutput> {
  const gapPlan = buildGapPlan(input);
  const sampleEvents = getTimelineEvents(input.videoAnalysis);

  if (input.videoAnalysis && sampleEvents.length === 0) {
    throw new Error("样例视频缺少 narrative_structure.timeline_events，无法按结构 1:1 生成剧本");
  }

  if (isDoubaoConfigured()) {
    try {
      const llm = await stitchWithDoubao({
        videoAnalysis: input.videoAnalysis,
        product: input.product,
        gapPlan,
        productImageUrls: input.productImageUrls,
        productVideoUrl: input.productVideoUrl,
        productVideoUrls: input.productVideoUrls,
        stageOverrides: input.stageOverrides,
        versionType: input.versionType,
      });
      const scriptManifest: ScriptManifest = applyStageOverrides(
        alignManifestToTimelineEvents(
          { ...llm.scriptManifest, gap_plan: gapPlan },
          input.videoAnalysis,
          input.product
        ),
        input.stageOverrides
      );
      return {
        scriptMarkdown: alignMarkdownToTimelineEvents(llm.scriptMarkdown, input.videoAnalysis),
        scriptManifest,
        gapPlan,
        stitch_source: "doubao",
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "豆包剧本生成失败";
      console.warn("豆包 Step3 fallback 规则引擎:", reason);
      const rules = stitchWithGapsRules(input);
      return { ...rules, stitch_fallback_reason: reason };
    }
  }

  return stitchWithGapsRules(input);
}

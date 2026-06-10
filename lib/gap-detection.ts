import type {
  GapCode,
  GapItem,
  GapPlan,
  GapResolution,
  ProductInput,
  TimelineEvent,
  UserAssetInventory,
  VideoAnalysisInput,
} from "./types/pipeline";
import { getTimelineEvents } from "./timeline-shot-align";

const USAGE_STAGES = new Set([
  "usage_demo",
  "product_detail",
  "solution_intro",
]);

const ACTION_KEYWORDS = [
  "拧盖",
  "开盖",
  "挤压",
  "涂抹",
  "冲泡",
  "搅拌",
  "twist",
  "pour",
  "apply",
  "blend",
];

const SNACK_CATEGORIES = ["膨化零食", "零食", "食品", "饮料"];

const OUTDOOR_SCENES = ["户外", "露营", "运动", "旅行", "outdoor"];
const INDOOR_BACKGROUNDS = ["indoor_scene", "studio_cyclorama", "product_on_table"];

function getEvents(video: VideoAnalysisInput | null): TimelineEvent[] {
  return getTimelineEvents(video);
}

function countUsageShots(events: TimelineEvent[]): number {
  return events.filter((e) => USAGE_STAGES.has(e.event_name)).length;
}

function shotIndicesForStages(events: TimelineEvent[], stages: Set<string>): number[] {
  return events
    .map((e, i) => (stages.has(e.event_name) ? i + 1 : -1))
    .filter((i) => i > 0);
}

function detectActionMismatch(
  video: VideoAnalysisInput | null,
  product: ProductInput
): GapItem | null {
  const events = getEvents(video);
  const refActions = events
    .map((e) => `${e.description ?? ""} ${e.event_name}`)
    .join(" ")
    .toLowerCase();

  const hasComplexAction = ACTION_KEYWORDS.some((kw) =>
    refActions.includes(kw.toLowerCase())
  );
  const category = product.category ?? "";
  const usage = (product.usage_method ?? "").toLowerCase();
  const isSnackLike =
    SNACK_CATEGORIES.some((c) => category.includes(c)) ||
    usage.includes("开袋") ||
    usage.includes("即食");

  if (hasComplexAction && isSnackLike) {
    const affected = shotIndicesForStages(
      events,
      new Set(["usage_demo", "product_detail", "solution_intro"])
    );
    return {
      code: "ACTION_MISMATCH",
      severity: "high",
      description: `参考视频含复杂操作动作，但新品「${product.product_name ?? "商品"}」为${category || "该类目"}，无法 1:1 复刻`,
      affected_shots: affected,
    };
  }
  return null;
}

function detectSceneMismatch(
  video: VideoAnalysisInput | null,
  product: ProductInput
): GapItem | null {
  const bg = video?.visual_and_color?.background_type ?? "";
  const usageScene = product.usage_scene ?? "";
  const refIsIndoor = INDOOR_BACKGROUNDS.includes(bg) || !bg;
  const userWantsOutdoor = OUTDOOR_SCENES.some((s) => usageScene.includes(s));

  if (refIsIndoor && userWantsOutdoor && bg) {
    return {
      code: "SCENE_MISMATCH",
      severity: "medium",
      description: `参考视频背景为「${bg}」，与用户场景「${usageScene}」不一致`,
      affected_shots: getEvents(video).map((_, i) => i + 1),
    };
  }
  return null;
}

function detectPersonaMismatch(product: ProductInput): GapItem | null {
  const audience = product.target_audience ?? "";
  const hasFemale = audience.includes("女性") || audience.includes("女");
  const hasMale = audience.includes("男性") || audience.includes("男");

  if (hasFemale && hasMale) {
    return {
      code: "PERSONA_MISMATCH",
      severity: "low",
      description: "目标人群描述含冲突性别标签，需统一主体人设",
    };
  }
  return null;
}

function detectVisualUnderprovisioned(
  video: VideoAnalysisInput | null,
  inventory: UserAssetInventory
): GapItem | null {
  const events = getEvents(video);
  const usageShots = countUsageShots(events);
  const visualCapacity =
    inventory.product_images_count +
    inventory.product_video_clips_count * 2;

  if (usageShots > 0 && visualCapacity < usageShots) {
    const affected = shotIndicesForStages(events, USAGE_STAGES);
    return {
      code: "VISUAL_UNDERPROVISIONED",
      severity: visualCapacity === 0 ? "high" : "medium",
      description: `需要 ${usageShots} 个展示/使用镜头素材，当前商品素材为 ${inventory.product_images_count} 张图 + ${inventory.product_video_clips_count} 段演示视频（阶段②「商品演示视频」；参考爆款视频不计入）`,
      affected_shots: affected,
    };
  }

  if (inventory.product_images_count === 0 && inventory.product_video_clips_count === 0) {
    return {
      code: "VISUAL_UNDERPROVISIONED",
      severity: "high",
      description: "无商品图/演示视频，全部视觉镜头需 AIGC 补足",
      affected_shots: events.map((_, i) => i + 1),
    };
  }

  return null;
}

function buildResolutions(gaps: GapItem[]): GapResolution[] {
  const resolutions: GapResolution[] = [];

  for (const gap of gaps) {
    switch (gap.code) {
      case "VISUAL_UNDERPROVISIONED":
        resolutions.push({
          gap_code: gap.code,
          strategy: "aigc_keyframe",
          description: "缺口镜头逐镜 keyframe 生图 + I2V",
          ui_label: "本镜为 AI 补足",
        });
        if (gap.severity === "high") {
          resolutions.push({
            gap_code: gap.code,
            strategy: "narrow_usage_demo",
            description: "收窄 usage_demo 段落，减少需实拍镜头数",
            ui_label: "演示段已收窄",
          });
        }
        break;
      case "ACTION_MISMATCH":
        resolutions.push({
          gap_code: gap.code,
          strategy: "narrative_degrade",
          description: "改叙事为开箱/手拿/桌前展示等无害动作",
          ui_label: "动作已降级",
        });
        break;
      case "SCENE_MISMATCH":
        resolutions.push({
          gap_code: gap.code,
          strategy: "scene_rewrite",
          description: "以用户 usage_scene 重写情境",
          ui_label: "场景已改写",
        });
        break;
      case "PERSONA_MISMATCH":
        resolutions.push({
          gap_code: gap.code,
          strategy: "persona_swap",
          description: "切换主体人设以匹配目标人群",
          ui_label: "人设已调整",
        });
        break;
    }
  }

  return resolutions;
}

export interface DetectGapsOptions {
  productImagesCount?: number;
  productVideoClipsCount?: number;
}

/** 以实际上传 URL 数量为准，避免 user_asset_inventory 陈旧导致漏计视频 */
export function resolveUserAssetInventory(
  productJson: ProductInput,
  options: DetectGapsOptions = {}
): UserAssetInventory {
  const fromProduct = productJson.user_asset_inventory;
  return {
    product_images_count: Math.max(
      fromProduct?.product_images_count ?? 0,
      options.productImagesCount ?? 0
    ),
    product_video_clips_count: Math.max(
      fromProduct?.product_video_clips_count ?? 0,
      options.productVideoClipsCount ?? 0
    ),
    has_logo_pack: fromProduct?.has_logo_pack ?? false,
    has_endcard: fromProduct?.has_endcard ?? false,
  };
}

/** PRD §11 detectGaps + gapPlan */
export function detectGaps(
  videoJson: VideoAnalysisInput | null,
  productJson: ProductInput,
  options: DetectGapsOptions = {}
): GapPlan {
  const inventory = resolveUserAssetInventory(productJson, options);

  const gaps: GapItem[] = [];

  const visual = detectVisualUnderprovisioned(videoJson, inventory);
  if (visual) gaps.push(visual);

  const action = detectActionMismatch(videoJson, productJson);
  if (action) gaps.push(action);

  const scene = detectSceneMismatch(videoJson, productJson);
  if (scene) gaps.push(scene);

  const persona = detectPersonaMismatch(productJson);
  if (persona) gaps.push(persona);

  return {
    gaps,
    resolutions: buildResolutions(gaps),
  };
}

export function gapAffectsShot(gap: GapItem, shotIndex: number): boolean {
  if (!gap.affected_shots || gap.affected_shots.length === 0) return true;
  return gap.affected_shots.includes(shotIndex);
}

export function hasGapCode(plan: GapPlan, code: GapCode): boolean {
  return plan.gaps.some((g) => g.code === code);
}

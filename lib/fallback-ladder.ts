import type {
  AssetSource,
  FallbackStrategy,
  GapCode,
  GapPlan,
  ProductInput,
  TimelineEvent,
} from "./types/pipeline";
import { gapAffectsShot, hasGapCode } from "./gap-detection";

const PRODUCT_STAGES = new Set(["product_detail", "hook", "cta", "solution_intro"]);
const USAGE_STAGES = new Set(["usage_demo", "product_detail"]);

export interface FallbackContext {
  shotIndex: number;
  event: TimelineEvent;
  gapPlan: GapPlan;
  inventory: {
    product_images_count: number;
    product_video_clips_count: number;
    product_image_urls: string[];
    product_video_url: string | null;
  };
  product: ProductInput;
  usedImageSlots: number;
  usedVideoSlots: number;
}

export interface FallbackResult {
  asset_source: AssetSource;
  fallback_applied: FallbackStrategy;
  gap_codes: GapCode[];
  requires_image_gen: boolean;
  is_aigc_supplement: boolean;
  ui_label?: string;
  degraded_narrative?: string;
}

function activeGapCodes(plan: GapPlan, shotIndex: number): GapCode[] {
  return plan.gaps
    .filter((g) => gapAffectsShot(g, shotIndex))
    .map((g) => g.code);
}

/** 三层 fallback：用户素材 → 叙事降级 → AIGC */
export function resolveShotFallback(ctx: FallbackContext): FallbackResult {
  const { shotIndex, event, gapPlan, inventory, product } = ctx;
  const gap_codes = activeGapCodes(gapPlan, shotIndex);
  const stage = event.event_name;

  // Tier 1: 用户素材可匹配
  if (
    PRODUCT_STAGES.has(stage) &&
    inventory.product_images_count > ctx.usedImageSlots &&
    inventory.product_image_urls.length > 0
  ) {
    return {
      asset_source: "user_image",
      fallback_applied: "use_user_asset",
      gap_codes,
      requires_image_gen: false,
      is_aigc_supplement: false,
    };
  }

  if (
    USAGE_STAGES.has(stage) &&
    stage === "usage_demo" &&
    inventory.product_video_clips_count > ctx.usedVideoSlots &&
    inventory.product_video_url
  ) {
    return {
      asset_source: "user_video_clip",
      fallback_applied: "use_user_asset",
      gap_codes,
      requires_image_gen: false,
      is_aigc_supplement: false,
    };
  }

  // Tier 2: 无害降级
  if (hasGapCode(gapPlan, "ACTION_MISMATCH") && gap_codes.includes("ACTION_MISMATCH")) {
    return {
      asset_source: "aigc_video",
      fallback_applied: "narrative_degrade",
      gap_codes,
      requires_image_gen: true,
      is_aigc_supplement: true,
      ui_label: "动作已降级",
      degraded_narrative: `手拿${product.product_name ?? "商品"}于桌前展示，缓慢旋转特写`,
    };
  }

  if (hasGapCode(gapPlan, "SCENE_MISMATCH") && gap_codes.includes("SCENE_MISMATCH")) {
    return {
      asset_source: "aigc_keyframe",
      fallback_applied: "scene_rewrite",
      gap_codes,
      requires_image_gen: true,
      is_aigc_supplement: true,
      ui_label: "场景已改写",
      degraded_narrative: `${product.usage_scene ?? "使用场景"}环境氛围，商品静置展示`,
    };
  }

  if (hasGapCode(gapPlan, "PERSONA_MISMATCH")) {
    return {
      asset_source: "aigc_keyframe",
      fallback_applied: "persona_swap",
      gap_codes,
      requires_image_gen: true,
      is_aigc_supplement: gap_codes.length > 0,
      ui_label: gap_codes.length > 0 ? "人设已调整" : undefined,
      degraded_narrative: `${product.target_audience ?? "目标用户"}与${product.product_name ?? "商品"}同框`,
    };
  }

  // Tier 3: AIGC 补镜
  if (hasGapCode(gapPlan, "VISUAL_UNDERPROVISIONED")) {
    const noUserAsset =
      inventory.product_images_count === 0 &&
      inventory.product_video_clips_count === 0;

    return {
      asset_source: noUserAsset ? "text_only" : "aigc_keyframe",
      fallback_applied: "aigc_keyframe",
      gap_codes,
      requires_image_gen: true,
      is_aigc_supplement: true,
      ui_label: "本镜为 AI 补足",
    };
  }

  // 默认：有图用 AIGC 场景增强，无图纯 AI
  const hasImages = inventory.product_images_count > 0;
  return {
    asset_source: hasImages ? "aigc_keyframe" : "aigc_video",
    fallback_applied: hasImages ? "aigc_keyframe" : "aigc_video",
    gap_codes,
    requires_image_gen: !hasImages || stage === "usage_demo",
    is_aigc_supplement: !hasImages,
    ui_label: !hasImages ? "本镜为 AI 补足" : undefined,
  };
}

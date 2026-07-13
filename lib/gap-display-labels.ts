import type { FallbackStrategy, GapCode } from "@/lib/types/pipeline";

/** 缺口类型 → 评审可读的业务槽位文案 */
export const GAP_BUSINESS_LABELS: Record<GapCode, string> = {
  VISUAL_UNDERPROVISIONED: "缺少商品特写 / 演示画面素材",
  ACTION_MISMATCH: "动作与商品用法不匹配",
  SCENE_MISMATCH: "场景与目标使用情境不符",
  PERSONA_MISMATCH: "出镜人设与目标人群不符",
};

export const GAP_SEVERITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const FALLBACK_STRATEGY_LABELS: Record<FallbackStrategy, string> = {
  use_user_asset: "优先使用用户素材",
  narrative_degrade: "叙事动作降级",
  aigc_keyframe: "AI 关键帧补足",
  aigc_video: "AI 视频生成补足",
  narrow_usage_demo: "收窄使用演示段落",
  scene_rewrite: "场景情境改写",
  persona_swap: "人设切换",
  safe_template: "安全模板兜底",
};

export function formatGapCode(code: string): string {
  const key = code as GapCode;
  return GAP_BUSINESS_LABELS[key] ?? code.replace(/_/g, " ");
}

export function formatFallbackStrategy(strategy: string): string {
  const key = strategy as FallbackStrategy;
  return FALLBACK_STRATEGY_LABELS[key] ?? strategy.replace(/_/g, " ");
}

export interface GapPlanLike {
  gaps?: Array<{
    code: string;
    severity: string;
    description: string;
    affected_shots?: number[];
  }>;
  resolutions?: Array<{
    gap_code: string;
    strategy: string;
    description: string;
    ui_label?: string;
  }>;
}

export function getGapsForShot(gapPlan: GapPlanLike | null | undefined, shotIndex: number) {
  const gaps = Array.isArray(gapPlan?.gaps) ? gapPlan.gaps : [];
  return gaps.filter((g) => {
    if (!g.affected_shots?.length) return true;
    return g.affected_shots.includes(shotIndex);
  });
}

export function getResolutionLabel(
  gapPlan: GapPlanLike | null | undefined,
  gapCode: string
): string | undefined {
  const resolutions = Array.isArray(gapPlan?.resolutions)
    ? gapPlan.resolutions
    : [];
  const resolution = resolutions.find((r) => r.gap_code === gapCode);
  return resolution?.ui_label ?? (resolution ? formatFallbackStrategy(resolution.strategy) : undefined);
}

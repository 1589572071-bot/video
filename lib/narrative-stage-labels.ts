/** 叙事阶段 → 用户可读中文（前端展示用，内部仍保留英文 enum） */
export const NARRATIVE_STAGE_LABELS: Record<string, string> = {
  hook: "开场钩子",
  problem_agitation: "痛点放大",
  solution_intro: "引入方案",
  product_detail: "产品展示",
  usage_demo: "使用演示",
  testimonial: "用户证言",
  price: "价格优惠",
  cta: "行动号召",
  closing: "结尾收束",
};

export function formatNarrativeStage(stage: string): string {
  const key = stage.trim().toLowerCase();
  return NARRATIVE_STAGE_LABELS[key] ?? stage.replace(/_/g, " ");
}

export function formatRenderMode(mode: string): string {
  if (mode.includes("I2V")) return "图生视频";
  if (mode.includes("T2V")) return "文生视频";
  return mode;
}

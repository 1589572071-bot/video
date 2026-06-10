import type { ProductInput, ScriptManifest, StageBriefOverride } from "./types/pipeline";

export type { StageBriefOverride };

/** 从叙事内容中提取「；」后的叙事作用作为 fallback */
export function extractBriefFromNarrative(narrative?: string): string | undefined {
  if (!narrative?.trim()) return undefined;
  const cleaned = narrative.replace(/^Continuing exactly from the reference frame\.\s*/i, "");
  const parts = cleaned.split("；");
  const role = parts[parts.length - 1]?.trim();
  return role && role.length >= 2 ? role : undefined;
}

/** 规则引擎 / 缺失字段时，按阶段 + 商品信息生成默认说明 */
export function inferStageBrief(
  stage: string,
  product: ProductInput,
  narrativeContent?: string
): string {
  const fromNarrative = extractBriefFromNarrative(narrativeContent);
  if (fromNarrative && fromNarrative.length >= 4) return fromNarrative;

  const name = product.product_name ?? "商品";
  const points = product.core_selling_points ?? [];
  const firstPoint = points[0] ?? "核心卖点";
  const painGain = product.pain_point_gain_point ?? "痛点；爽点";
  const pain = painGain.split(/[；;]/)[0]?.trim() || "用户痛点";
  const gain = painGain.split(/[；;]/)[1]?.trim() || "使用满足";
  const usage = (product.usage_method ?? "使用产品").slice(0, 24);

  switch (stage) {
    case "hook":
      return `突出${name}，3秒内点出「${pain.slice(0, 16)}」`;
    case "problem_agitation":
      return `放大「${pain.slice(0, 20)}」场景，强化焦虑`;
    case "solution_intro":
      return `引入${name}作为解决方案，引发好奇`;
    case "product_detail":
      return `特写展示${name}，强调${firstPoint.slice(0, 18)}`;
    case "usage_demo":
      return `演示${usage}，呈现真实使用感`;
    case "testimonial":
      return `展示用户反馈，增强${name}可信度`;
    case "price":
      return `突出性价比与优惠，降低决策门槛`;
    case "cta":
      return `引导立即行动，强调${gain.slice(0, 16)}`;
    case "closing":
      return `品牌收束，强化${name}记忆点`;
    default:
      return `展示${name}相关画面`;
  }
}

export function applyStageOverrides<T extends { blocks: ScriptManifest["blocks"] }>(
  manifest: T,
  overrides?: StageBriefOverride[]
): T {
  if (!overrides?.length) return manifest;
  const map = new Map(overrides.map((o) => [o.shot_index, o.stage_brief.trim()]));
  return {
    ...manifest,
    blocks: manifest.blocks.map((block) => ({
      ...block,
      shots: block.shots.map((shot) => {
        const brief = map.get(shot.index);
        if (!brief) return shot;
        return { ...shot, stage_brief: brief };
      }),
    })),
  };
}

export function collectStageOverrides(manifest: ScriptManifest): StageBriefOverride[] {
  return manifest.blocks
    .flatMap((b) => b.shots)
    .filter((s) => s.stage_brief?.trim())
    .map((s) => ({
      shot_index: s.index,
      narrative_stage: s.narrative_stage,
      stage_brief: s.stage_brief!.trim(),
    }));
}

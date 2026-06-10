import type { ProductInput, ScriptShotPackaging } from "@/lib/types/pipeline";
import type { SampleEventRef, ShotRef } from "./migration-mapping";
import { formatNarrativeStage } from "./narrative-stage-labels";
import { inferStageBrief } from "./script-stage-brief";

export interface MigrationDetailLine {
  kind: "preserve" | "replace";
  label: string;
  text: string;
}

export interface MigrationPairBrief {
  sampleHighlight: string;
  newAdaptation: string;
}

const BRIEF_MAX = 56;

const GENERIC_NARRATIVE_ROLES = new Set([
  "建立痛点",
  "引发好奇",
  "展示爽点/满足",
  "展示爽点",
  "满足",
]);

/** 各叙事阶段在本镜中的呈现方式（用于融合摘要） */
const STAGE_PRESENTATION_LEAD: Record<string, string> = {
  hook: "以悬念/痛点切入",
  problem_agitation: "放大痛点场景",
  solution_intro: "引入解决方案",
  product_detail: "特写展示卖点",
  usage_demo: "演示真实用法",
  testimonial: "用户证言背书",
  price: "突出优惠决策",
  cta: "推动立即行动",
  closing: "品牌收束记忆",
};

const SAMPLE_STAGE_HINTS: Record<string, string> = {
  hook: "注意前 3 秒钩子是否够抓人",
  problem_agitation: "痛点是否被放大、引发共鸣",
  solution_intro: "方案引入是否自然不突兀",
  product_detail: "卖点展示是否清晰有记忆点",
  usage_demo: "用法演示是否看得懂",
  testimonial: "证言是否增强信任",
  price: "价格/优惠是否推动决策",
  cta: "行动号召是否明确有推力",
  closing: "结尾是否收束有力",
};

function truncate(text: string, max: number): string {
  return smartTruncate(text.trim(), max);
}

/** 在标点处截断，不追加省略号 */
function smartTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastBreak = Math.max(
    slice.lastIndexOf("，"),
    slice.lastIndexOf("。"),
    slice.lastIndexOf("；"),
    slice.lastIndexOf("、"),
    slice.lastIndexOf(" ")
  );
  if (lastBreak > max * 0.45) return slice.slice(0, lastBreak);
  return slice;
}

function splitNarrativeParts(narrative?: string): { scene?: string; role?: string } {
  if (!narrative?.trim()) return {};
  const cleaned = narrative.replace(/^Continuing exactly from the reference frame\.\s*/i, "");
  const parts = cleaned.split("；");
  if (parts.length >= 2) {
    return { scene: parts[0]?.trim(), role: parts.slice(1).join("；").trim() };
  }
  return { scene: cleaned.trim() };
}

function productSnippet(product?: ProductInput | null, stage?: string): string | null {
  if (!product) return null;
  const name = product.product_name?.trim();
  const points = product.core_selling_points ?? [];
  const painGain = product.pain_point_gain_point ?? "";
  const pain = painGain.split(/[；;]/)[0]?.trim();
  const gain = painGain.split(/[；;]/)[1]?.trim();
  const scene = product.usage_scene?.trim();
  const usage = product.usage_method?.trim();

  const parts: string[] = [];
  if (name) parts.push(`商品「${name}」`);

  switch (stage) {
    case "hook":
      if (pain) parts.push(`痛点「${truncate(pain, 20)}」`);
      break;
    case "problem_agitation":
      if (pain) parts.push(`放大「${truncate(pain, 20)}」`);
      if (scene) parts.push(`场景「${truncate(scene, 16)}」`);
      break;
    case "solution_intro":
    case "product_detail":
      if (points[0]) parts.push(`卖点「${truncate(points[0], 18)}」`);
      break;
    case "usage_demo":
      if (usage) parts.push(`用法「${truncate(usage, 18)}」`);
      if (scene) parts.push(`场景「${truncate(scene, 16)}」`);
      break;
    case "cta":
    case "closing":
      if (gain) parts.push(`爽点「${truncate(gain, 16)}」`);
      else if (points[0]) parts.push(`卖点「${truncate(points[0], 18)}」`);
      break;
    default:
      if (points[0]) parts.push(`卖点「${truncate(points[0], 18)}」`);
  }

  return parts.length ? parts.join(" · ") : null;
}

function sampleStageHint(stage: string): string {
  const key = stage.trim().toLowerCase();
  return SAMPLE_STAGE_HINTS[key] ?? `关注 ${formatNarrativeStage(key)} 段表现`;
}

function isThinNarrativeRole(text?: string | null): boolean {
  if (!text?.trim()) return true;
  return GENERIC_NARRATIVE_ROLES.has(text.trim());
}

function extractVoiceContent(voiceScript?: string, voiceover?: string): string | null {
  if (voiceScript?.trim()) return voiceScript.trim();
  if (!voiceover?.trim()) return null;
  const content = voiceover.split(/[+＋]/)[0]?.trim();
  return content || null;
}

/** 画面交互/叙事画面是否为各镜重复的模板公式（主体+情境+…） */
function isGenericVisualFormula(text?: string | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if ((t.match(/\+/g) ?? []).length >= 2) return true;
  if (/^特写\s*\+/.test(t)) return true;
  return false;
}

function stagePresentationPrefix(stage: string): string {
  const key = stage.trim().toLowerCase();
  const label = formatNarrativeStage(key);
  const lead = STAGE_PRESENTATION_LEAD[key];
  return lead ? `${label}：${lead}` : `${label}段`;
}

function buildSampleHighlight(sampleEvent?: SampleEventRef): string {
  if (!sampleEvent) return "—";
  if (sampleEvent.description?.trim()) {
    return truncate(sampleEvent.description, BRIEF_MAX);
  }
  return sampleStageHint(sampleEvent.event_name);
}

function buildNewAdaptation(
  shot?: ShotRef,
  product?: ProductInput | null
): string {
  if (!shot) return "—";

  const stage = shot.narrative_stage.trim().toLowerCase();
  const stageLabel = formatNarrativeStage(stage);
  const packaging = shot.packaging;
  const narrative = splitNarrativeParts(packaging?.narrative_content);

  const stageBrief = shot.stage_brief?.trim();
  const isValidBrief =
    stageBrief &&
    !isThinNarrativeRole(stageBrief) &&
    !isGenericVisualFormula(stageBrief);

  const cues: string[] = [];

  const role = narrative.role?.trim();
  if (role && !isThinNarrativeRole(role)) {
    cues.push(role);
  }

  const voice = extractVoiceContent(packaging?.voice_script, packaging?.voiceover);
  if (voice && !isGenericVisualFormula(voice)) {
    cues.push(`口播「${truncate(voice, 22)}」`);
  }

  const onScreen = packaging?.on_screen_text?.trim();
  if (onScreen) cues.push(`花字「${truncate(onScreen, 14)}」`);

  const scene = narrative.scene?.trim();
  if (scene && !isGenericVisualFormula(scene)) {
    cues.push(truncate(scene, 24));
  }

  if (cues.length) {
    const prefix = isValidBrief ? `${stageLabel}：${stageBrief}` : stagePresentationPrefix(stage);
    return smartTruncate(`${prefix}，${cues.join("，")}`, BRIEF_MAX);
  }

  if (isValidBrief) {
    return smartTruncate(`${stageLabel}：${stageBrief}`, BRIEF_MAX);
  }

  if (product) {
    const inferred = inferStageBrief(stage, product, packaging?.narrative_content);
    if (inferred && !isThinNarrativeRole(inferred)) {
      return smartTruncate(`${stageLabel}：${inferred}`, BRIEF_MAX);
    }
  }

  const productLine = productSnippet(product, stage);
  if (productLine) {
    return smartTruncate(`${stageLabel}：${productLine}`, BRIEF_MAX);
  }

  return `${stageLabel}：对齐样例结构，替换为新品卖点呈现`;
}

/** 左右对称单行摘要：样例亮点/注意点 + 新品对应改写 */
export function buildMigrationPairBrief(
  sampleEvent?: SampleEventRef,
  shot?: ShotRef,
  product?: ProductInput | null
): MigrationPairBrief {
  return {
    sampleHighlight: buildSampleHighlight(sampleEvent),
    newAdaptation: buildNewAdaptation(shot, product),
  };
}

/** 单镜迁移说明：保留什么结构 + 替换成什么新品内容 */
export function buildShotMigrationDetails(
  sampleEvent: SampleEventRef | undefined,
  shot: ShotRef | undefined,
  product?: ProductInput | null
): MigrationDetailLine[] {
  if (!shot) return [];

  const lines: MigrationDetailLine[] = [];
  const stage = shot.narrative_stage;
  const packaging = shot.packaging;

  if (sampleEvent) {
    lines.push({
      kind: "preserve",
      label: "保留结构",
      text: `阶段 ${formatNarrativeStage(stage)} · 时长 ${sampleEvent.start.toFixed(1)}–${sampleEvent.end.toFixed(1)}s 对齐样例第 ${sampleEvent.eventIndex + 1} 段`,
    });
    if (sampleEvent.description) {
      lines.push({
        kind: "preserve",
        label: "样例参考",
        text: truncate(sampleEvent.description, 72),
      });
    }
  } else {
    lines.push({
      kind: "preserve",
      label: "保留结构",
      text: `阶段 ${formatNarrativeStage(stage)} · 时间 ${shot.timeRange}`,
    });
  }

  const productLine = productSnippet(product, stage);
  if (productLine) {
    lines.push({
      kind: "replace",
      label: "迁移商品",
      text: productLine,
    });
  }

  const visual =
    packaging?.visual_interaction?.trim() ||
    splitNarrativeParts(packaging?.narrative_content).scene;
  if (visual) {
    lines.push({
      kind: "replace",
      label: "画面改写",
      text: truncate(visual, 88),
    });
  }

  const narrativeRole = splitNarrativeParts(packaging?.narrative_content).role;
  if (narrativeRole) {
    lines.push({
      kind: "replace",
      label: "叙事作用",
      text: truncate(narrativeRole, 48),
    });
  }

  const voice = extractVoiceContent(packaging?.voice_script, packaging?.voiceover);
  if (voice) {
    lines.push({
      kind: "replace",
      label: "口播改写",
      text: truncate(voice, 72),
    });
  }

  const text = packaging?.on_screen_text?.trim();
  if (text) {
    lines.push({
      kind: "replace",
      label: "花字改写",
      text: truncate(text, 40),
    });
  }

  if (shot.ui_label || shot.is_aigc_supplement) {
    lines.push({
      kind: "replace",
      label: "素材策略",
      text: shot.ui_label ?? "本镜由 AI 补足画面",
    });
  } else if (shot.asset_source === "user_image") {
    lines.push({
      kind: "replace",
      label: "素材策略",
      text: "使用上传的商品图实拍/垫图",
    });
  } else if (shot.asset_source === "user_video_clip") {
    lines.push({
      kind: "replace",
      label: "素材策略",
      text: "使用上传的商品演示视频",
    });
  }

  if (lines.length === 1 && shot.stage_brief) {
    lines.push({
      kind: "replace",
      label: "本镜意图",
      text: shot.stage_brief,
    });
  }

  return lines;
}

export function hasMigrationPackaging(packaging?: ScriptShotPackaging | null): boolean {
  if (!packaging) return false;
  return Boolean(
    packaging.visual_interaction?.trim() ||
      packaging.narrative_content?.trim() ||
      packaging.voice_script?.trim() ||
      packaging.voiceover?.trim() ||
      packaging.on_screen_text?.trim()
  );
}

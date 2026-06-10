import type { ContentStrategy, VideoAnalysisInput } from "@/lib/types/pipeline";
import { CONTENT_STRATEGY_DIMENSIONS } from "./dimensions";

/** 从原子解析字段推导部分 content_strategy（旧数据或无 LLM 输出时兜底） */
export function deriveContentStrategyFallback(
  analysis: VideoAnalysisInput | null | undefined
): Partial<ContentStrategy> | null {
  if (!analysis) return null;

  const existing = analysis.content_strategy;
  if (existing?.topic && existing.viral_core_reason) return existing;

  const events = analysis.narrative_structure?.timeline_events ?? [];
  const hookEvent = events.find((e) => e.event_name === "hook") ?? events[0];
  const rhythm = analysis.rhythm_and_density;
  const primaryType = analysis.narrative_structure?.primary_type;

  const partial: Partial<ContentStrategy> = { ...existing };

  if (!partial.hook && hookEvent) {
    partial.hook = `开场阶段（${hookEvent.start.toFixed(1)}–${hookEvent.end.toFixed(1)}s）：${hookEvent.description ?? hookEvent.event_name}`;
  }
  if (!partial.structure && events.length) {
    const stages = events.map((e) => e.event_name).join(" → ");
    partial.structure = primaryType
      ? `叙事类型 ${primaryType}，阶段链：${stages}`
      : `阶段链：${stages}`;
  }
  if (!partial.rhythm && rhythm) {
    partial.rhythm = `共 ${rhythm.shot_count ?? events.length} 镜，平均镜头 ${rhythm.avg_shot_duration?.toFixed(1) ?? "—"}s`;
  }
  if (!partial.emotion && events.length) {
    const emotions = Array.from(new Set(events.map((e) => e.emotion).filter(Boolean)));
    partial.emotion = emotions.length
      ? `各段情绪标签：${emotions.join("、")}`
      : undefined;
  }

  return Object.keys(partial).length ? partial : null;
}

function isUsableStrategyText(value: string | undefined | null): value is string {
  return Boolean(value?.trim() && value.trim() !== "—");
}

/** 合并爆款核心原因 + 可复用模板为一段话（UI 展示用） */
export function resolveViralSummaryParagraph(
  analysis: VideoAnalysisInput | null | undefined
): { text: string; isPartial: boolean } | null {
  if (!analysis) return null;

  const cs = analysis.content_strategy;
  const isPartial = !cs?.topic;
  const strategy = resolveContentStrategy(analysis);

  const reason =
    (isUsableStrategyText(cs?.viral_core_reason) && cs!.viral_core_reason.trim()) ||
    (isUsableStrategyText(strategy?.viral_core_reason) && strategy!.viral_core_reason.trim()) ||
    null;
  const template =
    (isUsableStrategyText(cs?.reusable_template) && cs!.reusable_template.trim()) ||
    (isUsableStrategyText(strategy?.reusable_template) && strategy!.reusable_template.trim()) ||
    null;

  if (reason && template) {
    return { text: `${reason}。可复用模板：${template}`, isPartial };
  }
  if (reason) return { text: reason, isPartial };
  if (template) return { text: `可复用模板：${template}`, isPartial };

  const imitation =
    (isUsableStrategyText(cs?.imitation_focus) && cs!.imitation_focus.trim()) ||
    (isUsableStrategyText(strategy?.imitation_focus) && strategy!.imitation_focus.trim()) ||
    null;
  if (imitation) return { text: imitation, isPartial: true };

  const fallback = deriveContentStrategyFallback(analysis);
  if (fallback?.structure) {
    return {
      text: `请重新解析视频以获取完整爆款要点。当前可参考：${fallback.structure}`,
      isPartial: true,
    };
  }

  return null;
}

const STITCH_GUIDE_MAX = 80;

function truncateGuide(text: string, max = STITCH_GUIDE_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function pickGuideField(
  cs: ContentStrategy | null,
  key: keyof ContentStrategy
): string | null {
  const value = cs?.[key];
  return isUsableStrategyText(value) ? value.trim() : null;
}

/** Step3 豆包剧本生成用 · 7 维思维链仿写指导摘要 */
export function buildContentStrategyGuideForStitch(
  analysis: VideoAnalysisInput | null | undefined
): string | null {
  if (!analysis) return null;

  const cs = resolveContentStrategy(analysis);
  if (!cs) return null;

  const lines: string[] = [];

  const viralReason = pickGuideField(cs, "viral_core_reason");
  if (viralReason) lines.push(`爆款定调：${truncateGuide(viralReason)}`);

  const imitation = pickGuideField(cs, "imitation_focus");
  if (imitation) lines.push(`仿写焦点：${truncateGuide(imitation)}`);

  const template = pickGuideField(cs, "reusable_template");
  if (template) lines.push(`可复用公式：${truncateGuide(template, 120)}`);

  const hook = pickGuideField(cs, "hook");
  if (hook) lines.push(`钩子参考：${truncateGuide(hook)}`);

  const expression = pickGuideField(cs, "expression_style");
  if (expression) lines.push(`表达参考：${truncateGuide(expression)}`);

  return lines.length ? lines.join("\n") : null;
}

export function resolveContentStrategy(
  analysis: VideoAnalysisInput | null | undefined
): ContentStrategy | null {
  if (analysis?.content_strategy?.topic) {
    return analysis.content_strategy;
  }
  const fallback = deriveContentStrategyFallback(analysis);
  if (!fallback) return null;

  const filled: ContentStrategy = {
    topic: fallback.topic ?? "（请重新解析视频以获取完整选题分析）",
    hook: fallback.hook ?? "—",
    structure: fallback.structure ?? "—",
    rhythm: fallback.rhythm ?? "—",
    emotion: fallback.emotion ?? "—",
    audience_need: fallback.audience_need ?? "—",
    expression_style: fallback.expression_style ?? "—",
    imitation_focus: fallback.imitation_focus ?? "—",
    viral_core_reason: fallback.viral_core_reason ?? "—",
    reusable_template: fallback.reusable_template ?? "—",
  };
  return filled;
}

export { CONTENT_STRATEGY_DIMENSIONS };

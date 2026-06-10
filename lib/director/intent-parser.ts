import type { ScriptManifest } from "@/lib/types/pipeline";
import { parseDirectorIntentWithDoubao } from "@/lib/providers/doubao-director-intent";
import type { DirectorAction, DirectorContext, DirectorIntentResult } from "./tools";

const STAGE_ALIASES: Record<string, string> = {
  hook: "hook",
  开场钩子: "hook",
  开场: "hook",
  痛点: "problem_agitation",
  痛点放大: "problem_agitation",
  problem: "problem_agitation",
  引入方案: "solution_intro",
  方案: "solution_intro",
  产品展示: "product_detail",
  展示: "product_detail",
  使用演示: "usage_demo",
  演示: "usage_demo",
  cta: "cta",
  行动号召: "cta",
  结尾: "closing",
};

export interface ParseDirectorIntentInput {
  message: string;
  manifest?: ScriptManifest;
  context?: DirectorContext;
}

function extractBriefFromChangeMessage(message: string, stageLabel?: string): string | undefined {
  const patterns = [
    /(?:改成|改为|换成|调整为|突出|强调|写|设为|：|:)\s*[「"']?(.+?)[」"']?\s*$/,
    /(?:改成|改为|换成|调整为|突出|强调)\s*(.+)/,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m?.[1]?.trim() && m[1].trim().length >= 2) {
      let brief = m[1].trim();
      if (stageLabel && brief.startsWith(stageLabel)) {
        brief = brief.slice(stageLabel.length).replace(/^[：:\s]+/, "");
      }
      if (brief.length >= 2) return brief;
    }
  }
  return undefined;
}

function findShotsByStage(manifest: ScriptManifest | undefined, stage: string): number[] {
  if (!manifest) return [];
  return manifest.blocks
    .flatMap((b) => b.shots)
    .filter((s) => s.narrative_stage === stage)
    .map((s) => s.index);
}

/** 规则引擎 fallback（豆包不可用或失败时） */
export function parseDirectorIntentRules(
  userMessage: string,
  manifest?: ScriptManifest
): DirectorIntentResult {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();
  const actions: DirectorAction[] = [];

  const blockRerun = msg.match(/(?:重跑|重生成|重新生成)\s*区块\s*(\d+)/);
  if (blockRerun) {
    const blockIndex = Number(blockRerun[1]);
    actions.push({ tool: "rerunBlock", params: { block_index: blockIndex } });
    return { reply: `正在重跑区块 ${blockIndex}…`, actions };
  }

  const modeSwitch = msg.match(/区块\s*(\d+)\s*(?:改用|使用|换成|用)\s*(r2v|i2v|t2v)/i);
  if (modeSwitch) {
    const blockIndex = Number(modeSwitch[1]);
    const mode = modeSwitch[2].toLowerCase() as "t2v" | "i2v" | "r2v";
    actions.push({ tool: "switchRenderModel", params: { block_index: blockIndex, mode } });
    return { reply: `正在以 ${mode.toUpperCase()} 模式重跑区块 ${blockIndex}…`, actions };
  }

  const modeBlockAlt = msg.match(/(r2v|i2v|t2v)\s*.*区块\s*(\d+)/i);
  if (modeBlockAlt) {
    const mode = modeBlockAlt[1].toLowerCase() as "t2v" | "i2v" | "r2v";
    const blockIndex = Number(modeBlockAlt[2]);
    actions.push({ tool: "switchRenderModel", params: { block_index: blockIndex, mode } });
    return { reply: `正在以 ${mode.toUpperCase()} 模式重跑区块 ${blockIndex}…`, actions };
  }

  if (/重生成剧本|更新剧本|重新生成剧本/.test(msg)) {
    actions.push({ tool: "regenerateScript", params: {} });
    return { reply: "正在根据当前阶段说明重生成剧本…", actions };
  }

  const shotMatch = msg.match(/第\s*(\d+)\s*镜/);
  if (shotMatch) {
    const shotIndex = Number(shotMatch[1]);
    const brief =
      extractBriefFromChangeMessage(msg) ??
      (lower.includes("加强") || lower.includes("强化")
        ? msg.replace(/第\s*\d+\s*镜/, "").trim() || undefined
        : undefined);
    if (brief) {
      actions.push({
        tool: "updateStageBrief",
        params: { shot_index: shotIndex, stage_brief: brief, auto_regenerate: true },
      });
      return { reply: `已更新镜头 ${shotIndex} 的阶段说明，并重生成剧本…`, actions };
    }
  }

  for (const [alias, stage] of Object.entries(STAGE_ALIASES)) {
    if (msg.includes(alias) || lower.includes(alias.toLowerCase())) {
      const brief =
        extractBriefFromChangeMessage(msg, alias) ??
        (/(加强|强化|突出|强调)/.test(msg)
          ? msg.replace(new RegExp(alias, "i"), "").replace(/^(加强|强化|突出|强调|修改|调整)/, "").trim() || undefined
          : undefined);

      if (brief && brief.length >= 2) {
        const shotIndices = findShotsByStage(manifest, stage);
        actions.push({
          tool: "updateStageBrief",
          params: {
            narrative_stage: stage,
            shot_indices: shotIndices.length ? shotIndices : undefined,
            stage_brief: brief,
            auto_regenerate: true,
          },
        });
        return { reply: `已更新「${alias}」阶段说明，并重生成剧本…`, actions };
      }

      if (/(加强|强化|修改|调整)/.test(msg)) {
        actions.push({
          tool: "updateStageBrief",
          params: { narrative_stage: stage, stage_brief: msg, auto_regenerate: true },
        });
        return { reply: `已更新「${alias}」并重生成剧本…`, actions };
      }
    }
  }

  if (/hook|开场|钩子/.test(lower) && /(改成|改为|换成|调整|修改|突出|强调)/.test(msg)) {
    const brief = extractBriefFromChangeMessage(msg) ?? msg.replace(/hook|开场|钩子/gi, "").trim();
    if (brief.length >= 2) {
      actions.push({
        tool: "updateStageBrief",
        params: { narrative_stage: "hook", stage_brief: brief, auto_regenerate: true },
      });
      return { reply: "已更新开场钩子并重生成剧本…", actions };
    }
  }

  if (lower.includes("hook") && (lower.includes("加强") || lower.includes("强化"))) {
    actions.push({
      tool: "updateStageBrief",
      params: { narrative_stage: "hook", stage_brief: msg, auto_regenerate: true },
    });
    return { reply: "已强化开场钩子并重生成剧本…", actions };
  }

  return {
    reply: `AI 导演已收到：「${msg}」。可尝试：「开场钩子改成突出XX卖点」「重跑区块 2」「区块 1 改用 r2v」`,
    actions: [],
  };
}

/** 豆包意图解析，失败时回退规则引擎 */
export async function parseDirectorIntent(
  input: ParseDirectorIntentInput
): Promise<DirectorIntentResult> {
  const { message, manifest, context } = input;
  try {
    return await parseDirectorIntentWithDoubao({ message, manifest, context });
  } catch (e) {
    console.warn("director intent doubao fallback:", e);
    return parseDirectorIntentRules(message, manifest);
  }
}

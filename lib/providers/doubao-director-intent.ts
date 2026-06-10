import { readFile } from "fs/promises";
import { join } from "path";
import { MODEL_CONFIG, isDoubaoConfigured } from "@/lib/model-config";
import { DIRECTOR_INTENT_SYSTEM_PROMPT } from "@/lib/prompts/director-intent-system";
import type { DirectorContext } from "@/lib/director/tools";
import type { DirectorAction, DirectorIntentResult, DirectorToolName } from "@/lib/director/tools";
import type { ScriptManifest } from "@/lib/types/pipeline";

const VALID_TOOLS = new Set<DirectorToolName>([
  "updateStageBrief",
  "regenerateScript",
  "rerunBlock",
  "switchRenderModel",
]);

const VALID_STAGES = new Set([
  "hook",
  "problem_agitation",
  "solution_intro",
  "product_detail",
  "usage_demo",
  "cta",
  "closing",
]);

const VALID_MODES = new Set(["t2v", "i2v", "r2v"]);

export interface DoubaoDirectorIntentInput {
  message: string;
  manifest?: ScriptManifest;
  context?: DirectorContext;
}

function parseJsonFromModel(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(jsonStr) as Record<string, unknown>;
}

function buildManifestSummary(manifest?: ScriptManifest) {
  if (!manifest?.blocks?.length) return null;
  return {
    total_duration: manifest.total_duration,
    block_count: manifest.blocks.length,
    shot_count: manifest.blocks.reduce((n, b) => n + b.shots.length, 0),
    blocks: manifest.blocks.map((b) => ({
      index: b.index,
      start: b.start,
      end: b.end,
      render_mode: b.render_mode,
      shots: b.shots.map((s) => ({
        index: s.index,
        start: s.start,
        end: s.end,
        narrative_stage: s.narrative_stage,
        stage_brief: s.stage_brief ?? "",
      })),
    })),
  };
}

function sanitizeAction(raw: unknown): DirectorAction | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const tool = item.tool as string;
  if (!VALID_TOOLS.has(tool as DirectorToolName)) return null;

  const params =
    item.params && typeof item.params === "object"
      ? { ...(item.params as Record<string, unknown>) }
      : {};

  if (tool === "updateStageBrief") {
    const brief = String(params.stage_brief ?? "").trim();
    if (!brief) return null;
    params.stage_brief = brief;
    if (params.auto_regenerate === undefined) params.auto_regenerate = true;
    if (params.narrative_stage != null) {
      const stage = String(params.narrative_stage).trim().toLowerCase();
      if (!VALID_STAGES.has(stage)) return null;
      params.narrative_stage = stage;
    }
    if (params.shot_index != null) params.shot_index = Number(params.shot_index);
    if (Array.isArray(params.shot_indices)) {
      params.shot_indices = params.shot_indices.map((i) => Number(i)).filter((n) => n > 0);
    }
  }

  if (tool === "rerunBlock") {
    const blockIndex = Number(params.block_index);
    if (!blockIndex || blockIndex < 1) return null;
    params.block_index = blockIndex;
  }

  if (tool === "switchRenderModel") {
    const blockIndex = Number(params.block_index);
    const mode = String(params.mode ?? "").toLowerCase();
    if (!blockIndex || blockIndex < 1 || !VALID_MODES.has(mode)) return null;
    params.block_index = blockIndex;
    params.mode = mode;
  }

  return { tool: tool as DirectorToolName, params };
}

function normalizeIntent(raw: Record<string, unknown>): DirectorIntentResult {
  const reply = String(raw.reply ?? "").trim() || "已收到您的指令。";
  const actions: DirectorAction[] = [];
  if (Array.isArray(raw.actions)) {
    for (const item of raw.actions) {
      const action = sanitizeAction(item);
      if (action) actions.push(action);
    }
  }
  return { reply, actions };
}

async function loadPromptOverride(): Promise<string> {
  const override = process.env.METACUT_PROMPT_DIRECTOR_INTENT_SYSTEM;
  if (override) return override;
  try {
    const path = join(process.cwd(), "docs/prompts/director-intent.system.md");
    const md = await readFile(path, "utf-8");
    const match = md.match(/## SYSTEM_PROMPT\s+```\n([\s\S]*?)```/);
    if (match?.[1] && !match[1].includes("待填充")) return match[1].trim();
  } catch {
    // bundled prompt
  }
  return DIRECTOR_INTENT_SYSTEM_PROMPT;
}

/** 豆包解析 AI 导演用户意图 */
export async function parseDirectorIntentWithDoubao(
  input: DoubaoDirectorIntentInput
): Promise<DirectorIntentResult> {
  if (!isDoubaoConfigured()) {
    throw new Error("未配置豆包，无法解析导演意图");
  }

  const cfg = MODEL_CONFIG.productParse;
  const systemPrompt = await loadPromptOverride();
  const userPayload = {
    user_message: input.message.trim(),
    context: input.context ?? {},
    script_manifest: buildManifestSummary(input.manifest),
  };

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.endpoint,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `请解析以下用户消息并输出 JSON：\n\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`豆包导演意图解析失败: ${response.status} ${errText.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("豆包导演意图返回为空");

  return normalizeIntent(parseJsonFromModel(rawContent));
}

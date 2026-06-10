import { readFile } from "fs/promises";
import { join } from "path";
import { MODEL_CONFIG, isDoubaoConfigured } from "@/lib/model-config";
import {
  markdownToScriptManifest,
  stripMarkdownFences,
} from "@/lib/script-markdown-parser";
import { applyStageOverrides } from "@/lib/script-stage-brief";
import { buildContentStrategyGuideForStitch } from "@/lib/content-strategy/resolve";
import { SCRIPT_STITCH_SYSTEM_PROMPT } from "@/lib/prompts/script-stitch-system";
import type {
  GapPlan,
  ProductInput,
  ScriptManifest,
  ScriptVersionType,
  StageBriefOverride,
  VideoAnalysisInput,
} from "@/lib/types/pipeline";

export type ScriptStitchSource = "doubao" | "rules";

export interface DoubaoStitchInput {
  videoAnalysis: VideoAnalysisInput | null;
  product: ProductInput;
  gapPlan: GapPlan;
  productImageUrls?: string[];
  productVideoUrl?: string | null;
  productVideoUrls?: string[];
  stageOverrides?: StageBriefOverride[];
  versionType?: ScriptVersionType;
}

export interface DoubaoStitchResult {
  scriptMarkdown: string;
  scriptManifest: Omit<ScriptManifest, "gap_plan">;
  stitch_source: ScriptStitchSource;
  stitch_fallback_reason?: string;
}

async function loadPromptOverride(): Promise<string> {
  const override = process.env.METACUT_PROMPT_SCRIPT_STITCH_SYSTEM;
  if (override) return override;
  try {
    const path = join(process.cwd(), "docs/prompts/03-script-stitch.system.md");
    const md = await readFile(path, "utf-8");
    const match = md.match(/## SYSTEM_PROMPT\s+```\n([\s\S]*?)```/);
    if (match?.[1] && !match[1].includes("待填充")) return match[1].trim();
  } catch {
    // bundled prompt
  }
  return SCRIPT_STITCH_SYSTEM_PROMPT;
}

async function callDoubaoScriptStitch(
  input: DoubaoStitchInput
): Promise<{ scriptMarkdown: string; scriptManifest: Omit<ScriptManifest, "gap_plan"> }> {
  const cfg = MODEL_CONFIG.productParse;
  if (!cfg.apiKey || !cfg.endpoint) {
    throw new Error("未配置 DOUBAO_APIKEY 或 DOUBAO_EP");
  }

  const videoUrls =
    input.productVideoUrls && input.productVideoUrls.length > 0
      ? input.productVideoUrls
      : input.productVideoUrl
        ? [input.productVideoUrl]
        : [];

  const userPayload = {
    video_analysis: input.videoAnalysis,
    product: input.product,
    gap_plan: input.gapPlan,
    version_type: input.versionType,
    stage_overrides: input.stageOverrides?.length ? input.stageOverrides : undefined,
    content_strategy_guide:
      buildContentStrategyGuideForStitch(input.videoAnalysis) ?? undefined,
    user_asset_inventory: {
      product_images_count: input.productImageUrls?.length ?? 0,
      product_video_clips_count: videoUrls.length,
      product_image_urls: input.productImageUrls ?? [],
      product_video_urls: videoUrls,
    },
  };

  const systemPrompt = await loadPromptOverride();
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
          content: `请根据以下输入，按 System Prompt 规定的 Markdown 格式输出完整段落式分镜剧本（仅 Markdown，禁止 JSON）：\n\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`豆包剧本生成失败: ${response.status} ${errText.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("豆包剧本返回为空");

  const scriptMarkdown = stripMarkdownFences(rawContent);
  if (!scriptMarkdown.includes("【剧本基础信息】")) {
    throw new Error("豆包返回格式不符合 Markdown 剧本规范");
  }

  const scriptManifest = applyStageOverrides(
    markdownToScriptManifest(scriptMarkdown, {
      gapPlan: input.gapPlan,
      product: input.product,
      productImageUrls: input.productImageUrls,
      productVideoUrl: videoUrls[0] ?? null,
      defaultResolution: input.videoAnalysis?.meta_info?.resolution,
      defaultAspectRatio: input.videoAnalysis?.meta_info?.aspect_ratio,
    }),
    input.stageOverrides
  );

  if (input.versionType) {
    scriptManifest.version_type = input.versionType;
  }

  if (!scriptManifest.blocks.length) {
    throw new Error("无法从 Markdown 解析出有效区块/镜头");
  }

  return { scriptMarkdown, scriptManifest };
}

/** Step3 豆包 Markdown 剧本缝合 */
export async function stitchWithDoubao(
  input: DoubaoStitchInput
): Promise<DoubaoStitchResult> {
  if (!isDoubaoConfigured()) {
    throw new Error("未配置豆包，无法生成剧本");
  }
  const { scriptMarkdown, scriptManifest } = await callDoubaoScriptStitch(input);
  return { scriptMarkdown, scriptManifest, stitch_source: "doubao" };
}

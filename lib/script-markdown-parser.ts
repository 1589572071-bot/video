import { resolveShotFallback } from "./fallback-ladder";
import { inferStageBrief, extractBriefFromNarrative } from "./script-stage-brief";
import type {
  AssetSource,
  GapPlan,
  ProductInput,
  ScriptBlockManifest,
  ScriptManifest,
  ManifestShot,
  ScriptShotPackaging,
} from "./types/pipeline";

export interface ParsedScriptMeta {
  title?: string;
  total_duration: number;
  resolution: string;
  aspect_ratio: string;
  global_visual_anchor: string;
}

export interface ParseMarkdownContext {
  gapPlan: GapPlan;
  product: ProductInput;
  productImageUrls?: string[];
  productVideoUrl?: string | null;
  defaultResolution?: string;
  defaultAspectRatio?: string;
}

function parseMetaField(text: string, label: string): string | undefined {
  const re = new RegExp(`\\*\\*${label}\\*\\*：(.+)`, "m");
  return text.match(re)?.[1]?.trim();
}

function parseDuration(text: string): number {
  const raw = parseMetaField(text, "总时长") ?? "0";
  const num = parseFloat(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

export function parseScriptMarkdownMeta(markdown: string): ParsedScriptMeta {
  const basic = markdown.match(/## 【剧本基础信息】([\s\S]*?)(?=---|\## 【区块)/)?.[1] ?? markdown;
  return {
    title: parseMetaField(basic, "剧本名称"),
    total_duration: parseDuration(basic),
    resolution: parseMetaField(basic, "分辨率") ?? "1080x1920",
    aspect_ratio: parseMetaField(basic, "宽高比") ?? "9:16",
    global_visual_anchor:
      parseMetaField(basic, "全局视觉锚点描述") ?? "商业短视频风格",
  };
}

interface RawBlock {
  index: number;
  start: number;
  end: number;
  renderModeLabel: string;
  body: string;
}

interface RawShot {
  index: number;
  start: number;
  end: number;
  narrative_stage: string;
  narrative_content?: string;
  stage_brief?: string;
  ui_hint?: string;
  packaging?: ScriptShotPackaging;
}

function parseShotDetailField(detail: string, label: string): string | undefined {
  const re = new RegExp(`-\\s+${label}[:：](.+)`, "m");
  return detail.match(re)?.[1]?.trim();
}

function parseShotPackaging(detail: string): ScriptShotPackaging {
  return {
    shot_language: parseShotDetailField(detail, "镜头语言"),
    visual_interaction: parseShotDetailField(detail, "画面交互"),
    narrative_content: parseShotDetailField(detail, "叙事内容"),
    voice_script: parseShotDetailField(detail, "口播文案"),
    voiceover: parseShotDetailField(detail, "人声"),
    sound_effects: parseShotDetailField(detail, "音效"),
    bgm: parseShotDetailField(detail, "背景音乐"),
    on_screen_text: parseShotDetailField(detail, "屏幕花字"),
  };
}

function hasPackagingContent(packaging?: ScriptShotPackaging): boolean {
  if (!packaging) return false;
  return Object.values(packaging).some((v) => typeof v === "string" && v.trim().length > 0);
}

function parseBlocks(markdown: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const blockRe = /## 【区块\s*(\d+)：([\d.]+)s\s*-\s*([\d.]+)s】([\s\S]*?)(?=## 【区块|$)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(markdown)) !== null) {
    const body = m[4];
    const renderLine = body.match(/\*\*渲染模式\*\*：(.+)/)?.[1] ?? "";
    blocks.push({
      index: Number(m[1]),
      start: parseFloat(m[2]),
      end: parseFloat(m[3]),
      renderModeLabel: renderLine.trim(),
      body,
    });
  }
  return blocks;
}

function parseShots(blockBody: string): RawShot[] {
  const shots: RawShot[] = [];
  const shotRe =
    /\*\s+\*\*镜头\s+(\d+)\s+\[([\d.]+)s\s*-\s*([\d.]+)s\]\s*\|\s*([^*]+?)\*\*([\s\S]*?)(?=\*\s+\*\*镜头|$)/g;
  let m: RegExpExecArray | null;
  while ((m = shotRe.exec(blockBody)) !== null) {
    const detail = m[5];
    const packaging = parseShotPackaging(detail);
    const narrative =
      packaging.narrative_content ?? parseShotDetailField(detail, "叙事内容");
    const briefLine = parseShotDetailField(detail, "阶段说明");
    const assetLine = detail.match(/资产来源：(.+)/)?.[1]?.trim();
    shots.push({
      index: Number(m[1]),
      start: parseFloat(m[2]),
      end: parseFloat(m[3]),
      narrative_stage: m[4].trim(),
      narrative_content: narrative,
      stage_brief: briefLine || extractBriefFromNarrative(narrative),
      ui_hint: assetLine,
      packaging: hasPackagingContent(packaging) ? packaging : undefined,
    });
  }
  return shots;
}

/** 将豆包 Markdown 剧本解析为 script_manifest，并叠加 fallback 决策 */
export function markdownToScriptManifest(
  markdown: string,
  ctx: ParseMarkdownContext
): Omit<ScriptManifest, "gap_plan"> {
  const meta = parseScriptMarkdownMeta(markdown);
  const rawBlocks = parseBlocks(markdown);

  const imageCount =
    ctx.product.user_asset_inventory?.product_images_count ??
    ctx.productImageUrls?.length ??
    0;
  const videoCount =
    ctx.product.user_asset_inventory?.product_video_clips_count ??
    (ctx.productVideoUrl ? 1 : 0);

  let usedImages = 0;
  let usedVideos = 0;
  const blocks: ScriptBlockManifest[] = [];

  for (const rb of rawBlocks) {
    const isI2v = /I2V|图生视频/.test(rb.renderModeLabel);
    const render_mode = isI2v ? "I2V" : "T2V";
    const rawShots = parseShots(rb.body);
    const manifestShots: ManifestShot[] = rawShots.map((rs) => {
      const fallback = resolveShotFallback({
        shotIndex: rs.index,
        event: {
          start: rs.start,
          end: rs.end,
          event_name: rs.narrative_stage,
          description: rs.narrative_content,
        },
        gapPlan: ctx.gapPlan,
        inventory: {
          product_images_count: imageCount,
          product_video_clips_count: videoCount,
          product_image_urls: ctx.productImageUrls ?? [],
          product_video_url: ctx.productVideoUrl ?? null,
        },
        product: ctx.product,
        usedImageSlots: usedImages,
        usedVideoSlots: usedVideos,
      });

      if (fallback.asset_source === "user_image") usedImages++;
      if (fallback.asset_source === "user_video_clip") usedVideos++;

      return {
        index: rs.index,
        block_index: rb.index,
        start: rs.start,
        end: rs.end,
        narrative_stage: rs.narrative_stage,
        asset_source: fallback.asset_source as AssetSource,
        gap_codes: fallback.gap_codes,
        fallback_applied: fallback.fallback_applied,
        requires_image_gen: fallback.requires_image_gen,
        is_aigc_supplement: fallback.is_aigc_supplement,
        ui_label: fallback.ui_label,
        stage_brief:
          rs.stage_brief ??
          inferStageBrief(rs.narrative_stage, ctx.product, rs.narrative_content),
        degraded_narrative: rs.narrative_content ?? fallback.degraded_narrative,
        packaging: rs.packaging,
        keyframe_url: null,
      };
    });

    blocks.push({
      index: rb.index,
      start: rb.start,
      end: rb.end,
      render_mode,
      is_continuation: false,
      shots: manifestShots,
    });
  }

  const lastEnd =
    blocks.length > 0
      ? blocks[blocks.length - 1].end
      : meta.total_duration;

  return {
    schema_version: "script_manifest/v1",
    total_duration: meta.total_duration || lastEnd,
    aspect_ratio: meta.aspect_ratio || ctx.defaultAspectRatio || "9:16",
    resolution: meta.resolution || ctx.defaultResolution || "1080x1920",
    global_visual_anchor: meta.global_visual_anchor,
    cover_shot_index: 1,
    blocks,
  };
}

export function stripMarkdownFences(content: string): string {
  return content
    .replace(/^```(?:markdown|md)?\n?|\n?```$/g, "")
    .replace(/<Drafting_Process>[\s\S]*?<\/Drafting_Process>/gi, "")
    .trim();
}

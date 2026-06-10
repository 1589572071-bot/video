import { readFile } from "fs/promises";
import { join } from "path";
import { MODEL_CONFIG, isDoubaoConfigured } from "@/lib/model-config";
import { readLocalAssetBase64 } from "@/lib/local-asset";
import { PRODUCT_PARSE_SYSTEM_PROMPT } from "@/lib/prompts/product-parse-system";
import { parseProductFromText } from "@/lib/product-parse";
import type { ProductInput, UserAssetInventory } from "@/lib/types/pipeline";
import { extractJsonObject } from "@/lib/safe-json";
import { readUpstreamJson } from "@/lib/parse-api-response";
import { MAX_ANALYZE_VIDEO_BYTES, pickVideoAnalysisFps } from "@/lib/video-limits";

export type ProductParseSource = "doubao" | "mock";

export interface ProductParseInput {
  productDescription?: string;
  productImageUrls?: string[];
  productVideoUrl?: string | null;
  productVideoUrls?: string[];
}

export interface ProductParseResult extends ProductInput {
  schema_version: string;
  parse_source: ProductParseSource;
  parse_fallback_reason?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type DoubaoContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string; fps?: number } };

function hasAnyInput(input: ProductParseInput): boolean {
  return Boolean(
    input.productDescription?.trim() ||
      (input.productImageUrls && input.productImageUrls.length > 0) ||
      input.productVideoUrl
  );
}

function buildInventory(
  imageCount: number,
  videoCount: number
): UserAssetInventory {
  return {
    product_images_count: imageCount,
    product_video_clips_count: videoCount,
    has_logo_pack: false,
    has_endcard: false,
  };
}

function parseJsonFromModel(content: string): Record<string, unknown> {
  const parsed = extractJsonObject<Record<string, unknown>>(content);
  if (!parsed) {
    throw new Error("模型返回 JSON 解析失败");
  }
  return parsed;
}

function normalizeProduct(
  raw: Record<string, unknown>,
  inventory: UserAssetInventory
): ProductInput {
  const points = raw.core_selling_points;
  return {
    schema_version: "product/v1",
    product_name: String(raw.product_name ?? "未知商品"),
    category: String(raw.category ?? "其他"),
    visual_description: String(raw.visual_description ?? "暂无描述"),
    usage_method: String(raw.usage_method ?? "直接使用"),
    core_selling_points: Array.isArray(points)
      ? points.map(String)
      : ["具体功效待补充"],
    target_audience: String(raw.target_audience ?? "目标用户"),
    usage_scene: String(raw.usage_scene ?? "日常使用"),
    pain_point_gain_point: String(raw.pain_point_gain_point ?? "提升体验"),
    ingredients_material:
      raw.ingredients_material != null ? String(raw.ingredients_material) : null,
    spec_size: raw.spec_size != null ? String(raw.spec_size) : null,
    user_asset_inventory: inventory,
  };
}

async function loadPromptOverride(): Promise<string> {
  const override = process.env.METACUT_PROMPT_PRODUCT_SYSTEM;
  if (override) return override;
  try {
    const path = join(process.cwd(), "docs/prompts/02-product-parse.system.md");
    const md = await readFile(path, "utf-8");
    const match = md.match(/## SYSTEM_PROMPT\s+```\n([\s\S]*?)```/);
    if (match?.[1]) return match[1].trim();
  } catch {
    // use bundled prompt
  }
  return PRODUCT_PARSE_SYSTEM_PROMPT;
}

async function callDoubaoProductParse(
  input: ProductParseInput
): Promise<ProductInput> {
  const cfg = MODEL_CONFIG.productParse;
  if (!cfg.apiKey || !cfg.endpoint) {
    throw new Error("未配置 DOUBAO_APIKEY 或 DOUBAO_EP");
  }

  const imageUrls = input.productImageUrls ?? [];
  const videoUrls =
    input.productVideoUrls && input.productVideoUrls.length > 0
      ? input.productVideoUrls
      : input.productVideoUrl
        ? [input.productVideoUrl]
        : [];
  const text = input.productDescription?.trim() ?? "";
  const content: DoubaoContentPart[] = [];

  for (const url of imageUrls.slice(0, 8)) {
    const asset = await readLocalAssetBase64(url);
    if (asset.sizeBytes > MAX_IMAGE_BYTES) {
      throw new Error(`商品图过大（>${MAX_IMAGE_BYTES / 1024 / 1024}MB）: ${url}`);
    }
    content.push({
      type: "image_url",
      image_url: { url: `data:${asset.mimeType};base64,${asset.base64}` },
    });
  }

  if (videoUrls.length > 0) {
    for (const videoUrl of videoUrls.slice(0, 3)) {
      const asset = await readLocalAssetBase64(videoUrl);
      if (asset.sizeBytes > MAX_ANALYZE_VIDEO_BYTES) {
        throw new Error("商品视频过大（>50MB），请压缩后再试");
      }
      content.push({
        type: "video_url",
        video_url: {
          url: `data:${asset.mimeType};base64,${asset.base64}`,
          fps: pickVideoAnalysisFps(asset.sizeBytes),
        },
      });
    }
  }

  const userLines = [
    "请解析以下商品多模态输入，严格输出 product/v1 JSON。",
    text ? `【用户文本描述】\n${text}` : "",
    imageUrls.length ? `【已附商品图】${imageUrls.length} 张` : "",
    videoUrls.length ? `【已附商品演示视频】${videoUrls.length} 段` : "",
  ].filter(Boolean);

  content.push({ type: "text", text: userLines.join("\n\n") });

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
        { role: "user", content },
      ],
      temperature: 0.1,
    }),
  });

  const data = await readUpstreamJson<{
    choices?: Array<{ message?: { content?: string } }>;
  }>(response, "豆包商品解析");
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("豆包返回为空");

  const inventory = buildInventory(imageUrls.length, videoUrls.length);
  return normalizeProduct(parseJsonFromModel(rawContent), inventory);
}

/** Step2 多模态商品解析：豆包优先，失败或无 Key 时 fallback Mock */
export async function parseProductMultimodal(
  input: ProductParseInput
): Promise<ProductParseResult> {
  if (!hasAnyInput(input)) {
    throw new Error("请至少提供文本、商品图或商品视频之一");
  }

  const imageCount = input.productImageUrls?.length ?? 0;
  const videoUrls =
    input.productVideoUrls && input.productVideoUrls.length > 0
      ? input.productVideoUrls
      : input.productVideoUrl
        ? [input.productVideoUrl]
        : [];
  const videoCount = videoUrls.length;
  const inventory = buildInventory(imageCount, videoCount);

  const useDoubao =
    isDoubaoConfigured() &&
    (imageCount > 0 || videoCount > 0 || Boolean(input.productDescription?.trim()));

  if (useDoubao) {
    try {
      const product = await callDoubaoProductParse({
        ...input,
        productVideoUrls: videoUrls,
        productVideoUrl: videoUrls[0] ?? null,
      });
      return {
        ...product,
        schema_version: product.schema_version ?? "product/v1",
        parse_source: "doubao",
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "豆包调用失败";
      console.warn("豆包商品解析失败，fallback Mock:", reason);
      const mock = parseProductFromText(input.productDescription ?? "", {
        productImagesCount: imageCount,
        productVideoClipsCount: videoCount,
      });
      return {
        ...mock,
        user_asset_inventory: inventory,
        parse_source: "mock",
        parse_fallback_reason: reason,
      };
    }
  }

  const mockReason = !isDoubaoConfigured()
    ? "未配置 DOUBAO_APIKEY / DOUBAO_EP"
    : "无有效输入";

  const mock = parseProductFromText(input.productDescription ?? "", {
    productImagesCount: imageCount,
    productVideoClipsCount: videoCount,
  });
  return {
    ...mock,
    user_asset_inventory: inventory,
    parse_source: "mock",
    parse_fallback_reason: mockReason,
  };
}

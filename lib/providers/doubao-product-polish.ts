import { readFile } from "fs/promises";
import { join } from "path";
import { MODEL_CONFIG, isDoubaoConfigured } from "@/lib/model-config";
import { PRODUCT_POLISH_SYSTEM_PROMPT } from "@/lib/prompts/product-polish-system";
import type { ProductInput } from "@/lib/types/pipeline";

export type ProductPolishSource = "doubao" | "mock";

export interface ProductPolishInput {
  product: ProductInput | Record<string, unknown>;
  dirtyFields: string[];
}

export interface ProductPolishResult {
  product: ProductInput;
  polish_source: ProductPolishSource;
  polish_fallback_reason?: string;
}

const EDITABLE_KEYS = new Set([
  "product_name",
  "category",
  "visual_description",
  "usage_method",
  "core_selling_points",
  "target_audience",
  "usage_scene",
  "pain_point_gain_point",
]);

function parseJsonFromModel(content: string): Record<string, unknown> {
  const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(jsonStr) as Record<string, unknown>;
}

function isEmptyFieldValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0 || value.every((s) => !String(s).trim());
  return false;
}

function mockPolishValue(value: unknown, key: string): unknown {
  if (isEmptyFieldValue(value)) return value;
  if (key === "core_selling_points" && Array.isArray(value)) {
    return value
      .map((s) =>
        String(s)
          .trim()
          .replace(/\s+/g, " ")
          .replace(/[;；]+/g, "；")
      )
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[，,]{2,}/g, "，")
      .replace(/[。．.]{2,}/g, "。");
  }
  return value;
}

function mergePolishedFields(
  product: ProductInput | Record<string, unknown>,
  polished: Record<string, unknown>,
  dirtyFields: string[]
): ProductInput {
  const next = { ...product } as ProductInput;
  for (const key of dirtyFields) {
    if (!(key in polished)) continue;
    const raw = polished[key];
    if (key === "core_selling_points") {
      next.core_selling_points = Array.isArray(raw)
        ? raw.map(String).filter(Boolean)
        : next.core_selling_points;
    } else if (raw != null) {
      (next as Record<string, unknown>)[key] = String(raw);
    }
  }
  return next;
}

async function loadPromptOverride(): Promise<string> {
  const override = process.env.METACUT_PROMPT_PRODUCT_POLISH_SYSTEM;
  if (override) return override;
  try {
    const path = join(process.cwd(), "docs/prompts/02-product-polish.system.md");
    const md = await readFile(path, "utf-8");
    const match = md.match(/## SYSTEM_PROMPT\s+```\n([\s\S]*?)```/);
    if (match?.[1]) return match[1].trim();
  } catch {
    // use bundled prompt
  }
  return PRODUCT_POLISH_SYSTEM_PROMPT;
}

async function callDoubaoProductPolish(
  input: ProductPolishInput
): Promise<Record<string, unknown>> {
  const cfg = MODEL_CONFIG.productParse;
  if (!cfg.apiKey || !cfg.endpoint) {
    throw new Error("未配置 DOUBAO_APIKEY 或 DOUBAO_EP");
  }

  const fieldsPayload: Record<string, unknown> = {};
  for (const key of input.dirtyFields) {
    if (EDITABLE_KEYS.has(key)) {
      fieldsPayload[key] = (input.product as Record<string, unknown>)[key];
    }
  }

  const userText = [
    "请润色以下商品特征字段，严格只输出 JSON，且只包含 fields_to_polish 中的键。",
    `fields_to_polish: ${JSON.stringify(input.dirtyFields)}`,
    `current_values: ${JSON.stringify(fieldsPayload, null, 2)}`,
  ].join("\n\n");

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
        { role: "user", content: userText },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`豆包 API 失败: ${response.status} ${errText.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("豆包返回为空");

  return parseJsonFromModel(rawContent);
}

/** 商品特征 AI 润色：豆包优先，失败或无 Key 时 fallback Mock */
export async function polishProductFields(
  input: ProductPolishInput
): Promise<ProductPolishResult> {
  const dirtyFields = input.dirtyFields.filter((k) => EDITABLE_KEYS.has(k));
  if (dirtyFields.length === 0) {
    throw new Error("没有需要润色的字段");
  }

  const nonEmptyDirty = dirtyFields.filter(
    (key) => !isEmptyFieldValue((input.product as Record<string, unknown>)[key])
  );
  if (nonEmptyDirty.length === 0) {
    throw new Error("修改的字段均为空，请先填写内容");
  }

  if (isDoubaoConfigured()) {
    try {
      const polished = await callDoubaoProductPolish({
        ...input,
        dirtyFields: nonEmptyDirty,
      });
      return {
        product: mergePolishedFields(input.product, polished, nonEmptyDirty),
        polish_source: "doubao",
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "豆包调用失败";
      console.warn("豆包商品润色失败，fallback Mock:", reason);
      const mockPolished: Record<string, unknown> = {};
      for (const key of nonEmptyDirty) {
        mockPolished[key] = mockPolishValue(
          (input.product as Record<string, unknown>)[key],
          key
        );
      }
      return {
        product: mergePolishedFields(input.product, mockPolished, nonEmptyDirty),
        polish_source: "mock",
        polish_fallback_reason: reason,
      };
    }
  }

  const mockPolished: Record<string, unknown> = {};
  for (const key of nonEmptyDirty) {
    mockPolished[key] = mockPolishValue(
      (input.product as Record<string, unknown>)[key],
      key
    );
  }
  return {
    product: mergePolishedFields(input.product, mockPolished, nonEmptyDirty),
    polish_source: "mock",
    polish_fallback_reason: "未配置 DOUBAO_APIKEY / DOUBAO_EP",
  };
}

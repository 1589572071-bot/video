import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { MODEL_CONFIG } from "@/lib/model-config";
import { resolveDashScopeMediaUrl } from "@/lib/asset-public-url";
import {
  callSync,
  createAsyncTask,
  parseSyncImageUrls,
  pollTask,
} from "@/lib/providers/dashscope-client";
import { createAssetRecord } from "@/lib/project-store";
import { isS3Configured, uploadLocalFileToStorage } from "@/lib/storage";
import type { ProductInput } from "@/lib/types/pipeline";

export interface Wan26ImageResult {
  url: string;
  localPath: string;
  prompt: string;
  usedReference: boolean;
  model: string;
  taskId?: string;
}

type ContentPart = { text: string } | { image: string };

type ImagePostprocessResult = {
  buffer: Buffer<ArrayBufferLike>;
  contentType: string;
  ext: string;
};

type ImagePostprocess = (input: {
  buffer: Buffer<ArrayBufferLike>;
  mimeType: string;
}) => ImagePostprocessResult;

async function runWan26ImageGeneration(params: {
  textPrompt: string;
  referenceUrls?: string[];
  outDir: string;
  filenamePrefix: string;
  projectId?: string | null;
  assetKind?: string;
  assetRecordKind?: string;
  postprocess?: ImagePostprocess;
}): Promise<Wan26ImageResult> {
  const cfg = MODEL_CONFIG.bailian.image;
  const refs = params.referenceUrls ?? [];
  const useEdit = refs.length > 0;
  const model = useEdit ? cfg.editModel : cfg.t2iModel;

  const content: ContentPart[] = [{ text: params.textPrompt }];
  if (useEdit) {
    for (const ref of refs.slice(0, 4)) {
      content.push({ image: ref });
    }
  }

  const body: Record<string, unknown> = {
    model,
    input: {
      messages: [{ role: "user", content }],
    },
    parameters: {
      size: cfg.defaultSize,
      n: 1,
      watermark: false,
      prompt_extend: true,
      ...(useEdit ? { enable_interleave: false } : {}),
    },
  };

  let remoteUrls: string[] = [];

  try {
    const syncData = await callSync(cfg.syncEndpoint, body);
    remoteUrls = parseSyncImageUrls(syncData);
  } catch (syncErr) {
    console.warn(`万相2.6(${model}) 同步失败，尝试异步:`, syncErr);
    const taskId = await createAsyncTask(cfg.asyncEndpoint, body);
    const polled = await pollTask(taskId, {
      intervalMs: 5000,
      timeoutMs: 120000,
    });
    remoteUrls = polled.imageUrls ?? [];
    if (polled.videoUrl) remoteUrls.push(polled.videoUrl);
  }

  const remoteUrl = remoteUrls[0];
  if (!remoteUrl) {
    throw new Error(`万相2.6(${model}) 未返回图片 URL`);
  }

  if (!existsSync(params.outDir)) {
    await mkdir(params.outDir, { recursive: true });
  }

  const imgRes = await fetch(remoteUrl);
  if (!imgRes.ok) throw new Error(`下载万相图片失败: ${imgRes.status}`);
  let buf: Buffer<ArrayBufferLike> = Buffer.from(await imgRes.arrayBuffer());
  let ext = remoteUrl.includes(".png") ? "png" : "jpg";
  let contentType = ext === "png" ? "image/png" : "image/jpeg";

  if (params.postprocess) {
    const processed = params.postprocess({ buffer: buf, mimeType: contentType });
    buf = processed.buffer;
    ext = processed.ext;
    contentType = processed.contentType;
  }

  const filename = `${params.filenamePrefix}-${Date.now()}.${ext}`;
  const localPath = join(params.outDir, filename);
  await writeFile(localPath, buf);

  const folder = params.outDir.split("/public/")[1] ?? "uploads";
  let url = `/${folder}/${filename}`;
  if (params.projectId && isS3Configured()) {
    const stored = await uploadLocalFileToStorage({
      localPath,
      contentType,
      projectId: params.projectId,
      assetKind: params.assetKind ?? "packaging",
      filename,
    });
    await createAssetRecord({
      projectId: params.projectId,
      kind: params.assetRecordKind ?? "packaging_image",
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: filename,
    });
    url = stored.url;
  }

  return {
    url,
    localPath,
    prompt: params.textPrompt,
    usedReference: useEdit,
    model,
  };
}

export interface Wan26PackagingInput {
  product: ProductInput;
  prompt: string;
  productImageUrls?: string[];
  requestOrigin?: string;
  projectId?: string | null;
  type: "cover" | "feature_card";
}

type PackagingStyleId =
  | "beauty_personal_care"
  | "food_beverage"
  | "digital_appliance"
  | "fashion_accessory"
  | "home_living"
  | "general";

interface PackagingPalette {
  accent: string;
  coverShade: string;
  coverTop: string;
  coverText: string;
  coverMuted: string;
  featurePaper: string;
  featureShade: string;
  featureText: string;
  featureMuted: string;
  divider: string;
}

interface PackagingStylePreset {
  id: PackagingStyleId;
  match: string[];
  productFallback: string;
  categoryFallback: string;
  coverBadge: string;
  featureBadge: string;
  featureHeading: string;
  featureFooter: string;
  sellingFallbacks: string[];
  coverDirection: string;
  featureDirection: string;
  baseDirection: string;
  palette: PackagingPalette;
}

const PACKAGING_STYLE_PRESETS: PackagingStylePreset[] = [
  {
    id: "beauty_personal_care",
    match: ["美妆", "个护", "护肤", "彩妆", "香水", "洗护", "护发", "发油", "精华", "面霜", "口红", "身体乳", "吹风机"],
    productFallback: "精选好物",
    categoryFallback: "个人护理",
    coverBadge: "精选推荐",
    featureBadge: "核心卖点",
    featureHeading: "三大亮点",
    featureFooter: "细节、质感、使用感一页看清",
    sellingFallbacks: ["质感细腻", "日常好用", "一眼种草"],
    coverDirection: "Premium beauty and personal-care campaign background, ivory and champagne tones, refined soft glow, single hero product, blank clean lower third with no graphic marks.",
    featureDirection: "Premium editorial beauty product layout, product on the right or upper-right, calm blank ivory panel on the left with no text or marks, polished magazine composition.",
    baseDirection: "Premium beauty e-commerce photography, refined editorial composition, professional soft lighting, product remains realistic and recognizable.",
    palette: {
      accent: "#D9B56D",
      coverShade: "#120B06",
      coverTop: "#FFF8EA",
      coverText: "#FFF8EA",
      coverMuted: "#FFF3DA",
      featurePaper: "#FFF8EA",
      featureShade: "#1C120A",
      featureText: "#251A11",
      featureMuted: "#251A11",
      divider: "#B68A45",
    },
  },
  {
    id: "food_beverage",
    match: ["食品", "饮料", "零食", "饼干", "巧克力", "咖啡", "茶饮", "果汁", "牛奶", "酒", "速食", "调味", "坚果", "糕点", "薯片", "food", "snack", "beverage", "drink"],
    productFallback: "风味好物",
    categoryFallback: "食品饮料",
    coverBadge: "今日尝鲜",
    featureBadge: "风味亮点",
    featureHeading: "三重吸引",
    featureFooter: "口味、配料、场景一页看清",
    sellingFallbacks: ["风味有记忆点", "开袋即享", "日常场景友好"],
    coverDirection: "Bright appetizing commercial food background, clean tabletop or fresh serving scene, warm natural light, hero pack shot, blank clean lower third with no graphic marks.",
    featureDirection: "Fresh food and beverage editorial layout, product pack or serving scene on the right, blank clean left panel with no text or marks, appetizing but uncluttered.",
    baseDirection: "Modern food and beverage e-commerce photography, fresh color, clean surface, realistic packaging, natural highlights, no restaurant clutter.",
    palette: {
      accent: "#E36A2E",
      coverShade: "#3A1608",
      coverTop: "#FFF1D6",
      coverText: "#FFF8E8",
      coverMuted: "#FFE7BE",
      featurePaper: "#FFF6E6",
      featureShade: "#5C220B",
      featureText: "#2B180F",
      featureMuted: "#3B2616",
      divider: "#E36A2E",
    },
  },
  {
    id: "digital_appliance",
    match: ["数码", "家电", "电器", "手机", "耳机", "音箱", "电脑", "键盘", "鼠标", "相机", "充电", "智能", "机器人", "空气炸锅", "电饭煲", "appliance", "digital", "tech"],
    productFallback: "智能好物",
    categoryFallback: "数码家电",
    coverBadge: "新品速览",
    featureBadge: "性能要点",
    featureHeading: "关键能力",
    featureFooter: "功能、体验、参数感一页看清",
    sellingFallbacks: ["核心功能清晰", "使用效率提升", "细节体验到位"],
    coverDirection: "Clean technology product campaign background, cool white and graphite tones, subtle blue accent, precise hero product lighting, blank clean lower third with no graphic marks.",
    featureDirection: "Minimal tech product background, product on the right, cool blank left panel with no text or marks, precise grid feeling without UI panels.",
    baseDirection: "Premium consumer electronics e-commerce photography, crisp reflections, controlled shadows, modern studio lighting, realistic product finish.",
    palette: {
      accent: "#4BA3FF",
      coverShade: "#07111C",
      coverTop: "#EAF4FF",
      coverText: "#F4FAFF",
      coverMuted: "#CFE6FF",
      featurePaper: "#F3F7FB",
      featureShade: "#0D1724",
      featureText: "#111827",
      featureMuted: "#334155",
      divider: "#4BA3FF",
    },
  },
  {
    id: "fashion_accessory",
    match: ["服饰", "服装", "衣服", "鞋", "包", "箱包", "首饰", "珠宝", "手表", "配饰", "穿搭", "面料", "皮革", "fashion", "apparel"],
    productFallback: "风格单品",
    categoryFallback: "服饰配饰",
    coverBadge: "风格上新",
    featureBadge: "搭配亮点",
    featureHeading: "风格细节",
    featureFooter: "版型、材质、搭配感一页看清",
    sellingFallbacks: ["版型利落", "材质有质感", "日常搭配轻松"],
    coverDirection: "Editorial fashion lookbook background, soft fabric texture or clean studio scene, product styled as a hero item, blank clean lower third with no graphic marks.",
    featureDirection: "Magazine-style fashion product layout, product or accessory on the right, airy blank left panel with no text or marks, light elegant spacing.",
    baseDirection: "Contemporary fashion e-commerce photography, tactile material, elegant negative space, clean editorial styling, no runway crowd.",
    palette: {
      accent: "#A7805C",
      coverShade: "#15110D",
      coverTop: "#F6EFE6",
      coverText: "#FFF9F0",
      coverMuted: "#EFE0CF",
      featurePaper: "#FAF5EF",
      featureShade: "#201712",
      featureText: "#241B15",
      featureMuted: "#5C4A3D",
      divider: "#A7805C",
    },
  },
  {
    id: "home_living",
    match: ["家居", "家装", "厨房", "清洁", "收纳", "床品", "家纺", "餐具", "灯具", "香薰", "居家", "母婴", "home", "living", "kitchen"],
    productFallback: "生活好物",
    categoryFallback: "家居生活",
    coverBadge: "好物推荐",
    featureBadge: "生活亮点",
    featureHeading: "实用价值",
    featureFooter: "场景、材质、体验一页看清",
    sellingFallbacks: ["融入日常场景", "使用体验轻松", "细节设计贴心"],
    coverDirection: "Warm home-living commercial background, natural window light, wood or soft neutral surface, product in a realistic calm home scene, blank clean lower third with no graphic marks.",
    featureDirection: "Clean home product editorial layout, product on the right in a natural living scene, soft blank left panel with no text or marks, calm practical composition.",
    baseDirection: "Modern home and lifestyle e-commerce photography, warm daylight, natural textures, tidy realistic setting, product remains the focus.",
    palette: {
      accent: "#6F9A73",
      coverShade: "#0D1B14",
      coverTop: "#EEF7EA",
      coverText: "#F7FFF5",
      coverMuted: "#DDEED9",
      featurePaper: "#F6FAF1",
      featureShade: "#102016",
      featureText: "#192319",
      featureMuted: "#3E5741",
      divider: "#6F9A73",
    },
  },
  {
    id: "general",
    match: [],
    productFallback: "精选商品",
    categoryFallback: "品质好物",
    coverBadge: "精选好物",
    featureBadge: "核心优势",
    featureHeading: "关键价值",
    featureFooter: "亮点、场景、体验一页看清",
    sellingFallbacks: ["品质亮点清晰", "核心优势直观", "适合日常选择"],
    coverDirection: "Universal premium e-commerce product background, clean light gray or warm white studio, single hero product, generous blank negative space in the lower third with no graphic marks.",
    featureDirection: "Universal product feature-card background, product on the right, clean blank left panel with no text or marks, neutral editorial e-commerce layout.",
    baseDirection: "Clean premium e-commerce product photography, realistic material, balanced lighting, no category-specific gimmicks.",
    palette: {
      accent: "#C7A052",
      coverShade: "#111111",
      coverTop: "#F5F4EF",
      coverText: "#FFFFFF",
      coverMuted: "#ECE7D8",
      featurePaper: "#F5F4EF",
      featureShade: "#101010",
      featureText: "#1F2933",
      featureMuted: "#4B5563",
      divider: "#C7A052",
    },
  },
];

function packagingStyleForProduct(product: ProductInput): PackagingStylePreset {
  const haystack = [
    product.category,
    product.visual_description,
    product.product_name,
    product.usage_scene,
    product.usage_method,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    PACKAGING_STYLE_PRESETS.find(
      (preset) => preset.id !== "general" && preset.match.some((keyword) => haystack.includes(keyword.toLowerCase()))
    ) ?? PACKAGING_STYLE_PRESETS[PACKAGING_STYLE_PRESETS.length - 1]
  );
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactText(value: unknown, fallback: string, max = 34): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[|｜]/g, " ")
    .trim();
  return (text || fallback).slice(0, max);
}

function splitSellingPoints(product: ProductInput, preset: PackagingStylePreset): string[] {
  const points = Array.isArray(product.core_selling_points)
    ? product.core_selling_points.map((p) => compactText(p, "", 34)).filter(Boolean)
    : [];
  if (points.length >= 3) return points.slice(0, 3);

  const fallback = String(product.pain_point_gain_point ?? "")
    .split(/[；;，,。]/)
    .map((p) => compactText(p, "", 34))
    .filter(Boolean);

  return [...points, ...fallback, ...preset.sellingFallbacks].slice(0, 3);
}

function wrapSvgText(text: string, charsPerLine: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  for (let i = 0; i < clean.length && lines.length < maxLines; i += charsPerLine) {
    lines.push(clean.slice(i, i + charsPerLine));
  }
  return lines.length ? lines : ["精选好物"];
}

function textLinesSvg(lines: string[], x: number, y: number, size: number, lineHeight: number, attrs = ""): string {
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${tspans}</text>`;
}

function buildCoverOverlaySvg(input: {
  imageData: string;
  fontFamily: string;
  productName: string;
  category: string;
  points: string[];
  preset: PackagingStylePreset;
}): string {
  const mainTitle = compactText(input.points[0], input.productName, 30);
  const subtitle = compactText(input.points[1] || input.category, input.preset.categoryFallback, 34);
  const titleLines = wrapSvgText(mainTitle, 9, 3);
  const titleSize = titleLines.length > 2 ? 66 : 76;
  const titleLineHeight = titleLines.length > 2 ? 78 : 88;
  const subtitleLines = wrapSvgText(subtitle, 15, 2);
  const p = input.preset.palette;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="coverBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.coverShade}" stop-opacity="0.00"/>
      <stop offset="56%" stop-color="${p.coverShade}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${p.coverShade}" stop-opacity="0.72"/>
    </linearGradient>
    <linearGradient id="coverTop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${p.coverTop}" stop-opacity="0.56"/>
      <stop offset="54%" stop-color="${p.coverTop}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${p.coverTop}" stop-opacity="0.00"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="${p.coverShade}" flood-opacity="0.34"/>
    </filter>
  </defs>
  <style>
    text{font-family:${input.fontFamily};letter-spacing:0}
    .small{font-size:28px;font-weight:700;fill:${p.coverMuted}}
  </style>
  <image href="${input.imageData}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1920" fill="url(#coverBottom)"/>
  <rect x="0" y="0" width="580" height="360" fill="url(#coverTop)"/>
  <line x1="88" y1="136" x2="206" y2="136" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>
  <text x="88" y="190" class="small">${xmlEscape(input.preset.coverBadge)}</text>
  <text x="88" y="232" font-size="22" font-weight="600" fill="${p.coverMuted}" fill-opacity="0.70">${xmlEscape(input.category)}</text>
  <g filter="url(#softShadow)">
    <line x1="90" y1="1284" x2="90" y2="1640" stroke="${p.accent}" stroke-width="5" stroke-linecap="round"/>
    <text x="124" y="1306" font-size="34" font-weight="700" fill="${p.accent}">${xmlEscape(input.productName)}</text>
    ${textLinesSvg(titleLines, 124, 1408, titleSize, titleLineHeight, `font-weight="900" fill="${p.coverText}"`)}
    ${textLinesSvg(subtitleLines, 126, 1664, 32, 44, `font-weight="650" fill="${p.coverText}" fill-opacity="0.84"`)}
  </g>
</svg>`;
}

function buildFeatureCardOverlaySvg(input: {
  imageData: string;
  fontFamily: string;
  productName: string;
  category: string;
  points: string[];
  preset: PackagingStylePreset;
}): string {
  const p = input.preset.palette;
  const pointRows = input.points
    .map((point, i) => {
      const y = 740 + i * 260;
      const lines = wrapSvgText(point, 13, 2);
      return `
        <g>
          <text x="130" y="${y}" font-size="30" font-weight="800" fill="${p.divider}">0${i + 1}</text>
          ${textLinesSvg(lines, 194, y, 34, 48, `font-weight="700" fill="${p.featureText}"`)}
          <line x1="130" y="${y + 92}" x2="492" y2="${y + 92}" stroke="${p.divider}" stroke-opacity="0.24" stroke-width="2"/>
        </g>
      `;
    })
    .join("");
  const productLines = wrapSvgText(input.productName, 10, 2);
  const category = compactText(input.category, input.preset.categoryFallback, 16);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="paperRail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${p.featurePaper}" stop-opacity="0.88"/>
      <stop offset="64%" stop-color="${p.featurePaper}" stop-opacity="0.68"/>
      <stop offset="100%" stop-color="${p.featurePaper}" stop-opacity="0.00"/>
    </linearGradient>
    <linearGradient id="featureShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.featureShade}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${p.featureShade}" stop-opacity="0.16"/>
    </linearGradient>
  </defs>
  <style>
    text{font-family:${input.fontFamily};letter-spacing:0}
  </style>
  <image href="${input.imageData}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1920" fill="url(#featureShade)"/>
  <rect x="0" y="0" width="650" height="1920" fill="url(#paperRail)"/>
  <line x1="92" y1="136" x2="92" y2="1840" stroke="${p.divider}" stroke-opacity="0.42" stroke-width="2"/>
  <text x="130" y="164" font-size="26" font-weight="800" fill="${p.divider}">${xmlEscape(input.preset.featureBadge)}</text>
  <text x="130" y="214" font-size="20" font-weight="650" fill="${p.featureMuted}" fill-opacity="0.56">${xmlEscape(category)}</text>
  ${textLinesSvg(productLines, 130, 360, 56, 68, `font-weight="900" fill="${p.featureText}"`)}
  <text x="130" y="540" font-size="26" font-weight="700" fill="${p.featureMuted}" fill-opacity="0.62">${xmlEscape(input.preset.featureHeading)}</text>
  <line x1="130" y1="600" x2="438" y2="600" stroke="${p.divider}" stroke-width="4" stroke-linecap="round"/>
  ${pointRows}
  <text x="130" y="1734" font-size="23" font-weight="650" fill="${p.featureMuted}" fill-opacity="0.48">${xmlEscape(input.preset.featureFooter)}</text>
</svg>`;
}

function buildPackagingOverlaySvg(input: {
  type: "cover" | "feature_card";
  imageBuffer: Buffer;
  imageMime: string;
  product: ProductInput;
  styleHint: string;
}): string {
  const preset = packagingStyleForProduct(input.product);
  const productName = compactText(input.product.product_name, preset.productFallback, 18);
  const category = compactText(input.product.category, preset.categoryFallback, 18);
  const points = splitSellingPoints(input.product, preset);
  const imageData = `data:${input.imageMime};base64,${input.imageBuffer.toString("base64")}`;
  const fontFamily = `"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif`;

  return input.type === "cover"
    ? buildCoverOverlaySvg({ imageData, fontFamily, productName, category, points, preset })
    : buildFeatureCardOverlaySvg({ imageData, fontFamily, productName, category, points, preset });
}

function packagingPostprocess(
  type: "cover" | "feature_card",
  product: ProductInput,
  styleHint: string
): ImagePostprocess {
  return ({ buffer, mimeType }) => ({
    buffer: Buffer.from(
      buildPackagingOverlaySvg({
        type,
        imageBuffer: buffer,
        imageMime: mimeType,
        product,
        styleHint,
      }),
      "utf-8"
    ),
    contentType: "image/svg+xml",
    ext: "svg",
  });
}

function buildPackagingPrompt(input: Wan26PackagingInput, refsCount: number): string {
  const { product, prompt, type } = input;
  const preset = packagingStyleForProduct(product);
  const visual = product.visual_description ? `Product visual: ${product.visual_description}.` : "";
  const custom = prompt.trim() ? `Background/style direction: ${prompt.trim()}.` : "";
  const shared = [
    preset.baseDirection,
    custom,
    visual,
    refsCount > 0
      ? "Use the reference product image only for product identity: bottle shape, package color, logo placement, material, and label proportions must stay consistent."
      : "",
    "No added text, no letters, no Chinese characters, no captions, no slogans, no subtitles, no watermarks, no labels, no UI text, no buttons, no cards.",
    "Do not create decorative typography, pseudo text, calligraphy, newspaper or poster text, handwritten marks, glyph-like symbols, or any background words. Only preserve brand marks and labels that are naturally printed on the referenced product packaging itself.",
    "Do not copy the original catalog layout, do not create a six-product grid, do not reproduce small printed description blocks.",
    "Avoid dashboard UI, neon call-to-action buttons, black info bars, sticker-like labels, or app-interface elements.",
    "Keep generous empty negative space for deterministic Chinese copy overlay added later by code; the generated background itself must remain blank in those areas.",
  ];

  const task =
    type === "cover"
      ? [
          "Create a vertical 9:16 short-video cover background.",
          preset.coverDirection,
        ]
      : [
          "Create a vertical 9:16 product feature card background.",
          preset.featureDirection,
        ];

  return [...task, ...shared].filter(Boolean).join(" ");
}

/** 画面包装：封面 / 卖点卡片（万相2.6） */
export async function generateWan26Packaging(
  input: Wan26PackagingInput
): Promise<Wan26ImageResult> {
  const { product, prompt, productImageUrls = [], requestOrigin, type, projectId } = input;
  const refs: string[] = [];
  for (const ref of productImageUrls.slice(0, 2)) {
    refs.push(await resolveDashScopeMediaUrl(ref, requestOrigin));
  }

  const textPrompt = buildPackagingPrompt(input, refs.length);

  return runWan26ImageGeneration({
    textPrompt,
    referenceUrls: refs,
    outDir: join(process.cwd(), "public", "uploads", "packaging"),
    filenamePrefix: `wan26-${type}`,
    projectId,
    assetKind: "packaging",
    assetRecordKind: type === "cover" ? "cover_image" : "feature_card",
    postprocess: packagingPostprocess(type, product, prompt),
  });
}

export interface Wan26KeyframeInput {
  shot: { index: number };
  product: { visual_description?: string };
  prompt: string;
  productImageUrls?: string[];
  requestOrigin?: string;
  projectId?: string | null;
  useReferenceImages?: boolean;
}

/** 关键帧生图（万相2.6） */
export async function generateWan26Keyframe(
  input: Wan26KeyframeInput
): Promise<Wan26ImageResult> {
  const { shot, product, prompt, productImageUrls = [], requestOrigin } = input;
  const refs: string[] = [];
  if (input.useReferenceImages) {
    for (const ref of productImageUrls.slice(0, 2)) {
      refs.push(await resolveDashScopeMediaUrl(ref, requestOrigin));
    }
  }

  const textPrompt = [
    prompt,
    product.visual_description ? `Product: ${product.visual_description}` : "",
    "Vertical 9:16 commercial product shot, static frame at t=0, no motion blur.",
  ]
    .filter(Boolean)
    .join(". ");

  return runWan26ImageGeneration({
    textPrompt,
    referenceUrls: refs,
    outDir: join(process.cwd(), "public", "uploads", "keyframes"),
    filenamePrefix: `wan26-shot${shot.index}`,
    projectId: input.projectId,
    assetKind: "keyframes",
    assetRecordKind: "keyframe",
  });
}

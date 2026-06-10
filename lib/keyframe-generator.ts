import { isBailianConfigured, MODEL_CONFIG } from "@/lib/model-config";
import { generateWan26Keyframe } from "@/lib/providers/wan26-image";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type {
  KeyframeResult,
  ManifestShot,
  ProductInput,
  ScriptManifest,
} from "./types/pipeline";

export interface KeyframeGenInput {
  manifest: ScriptManifest;
  product: ProductInput;
  productImageUrls?: string[];
  globalVisualAnchor?: string;
}

export interface KeyframeGenOutput {
  keyframes: KeyframeResult[];
  cover_thumbnail: string | null;
}

export interface KeyframeGenOptions {
  mockMode?: boolean;
  requestOrigin?: string;
  projectId?: string | null;
  onProgress?: (msg: string) => void;
}

export function buildKeyframePrompt(
  shot: ManifestShot,
  product: ProductInput,
  anchor: string
): string {
  const visual = product.visual_description ?? product.product_name ?? "product";
  const scene = product.usage_scene ?? "indoor scene";
  const staticDesc = shot.degraded_narrative
    ? shot.degraded_narrative.replace(/动作|涂抹|晕染/g, "")
    : `${visual} on table, ${scene}`;

  return [
    "Static frame at t=0, no motion blur, no movement.",
    staticDesc,
    anchor,
    "commercial product photography, shallow depth of field, warm lighting",
    `stage: ${shot.narrative_stage}`,
  ].join(", ");
}

/** 按需逐镜 keyframe 生图（万相2.6 或 Mock SVG） */
export async function generateKeyframes(
  input: KeyframeGenInput,
  options: KeyframeGenOptions = {}
): Promise<KeyframeGenOutput> {
  const mockMode = options.mockMode ?? MODEL_CONFIG.render.mockMode ?? !isBailianConfigured();
  const useBailian = !mockMode && isBailianConfigured();

  if (useBailian) {
    return generateKeyframesBailian(input, options);
  }
  return generateKeyframesMock(input);
}

async function generateKeyframesBailian(
  input: KeyframeGenInput,
  options: KeyframeGenOptions
): Promise<KeyframeGenOutput> {
  const { manifest, product, productImageUrls = [] } = input;
  const anchor = input.globalVisualAnchor ?? manifest.global_visual_anchor;
  const keyframes: KeyframeResult[] = [];
  let coverThumbnail: string | null = null;

  const allShots = manifest.blocks.flatMap((b) => b.shots);
  const shotsNeedingGen = allShots.filter(
    (s) => s.requires_image_gen || s.index === manifest.cover_shot_index
  );

  for (const shot of shotsNeedingGen) {
    const prompt = buildKeyframePrompt(shot, product, anchor);
    options.onProgress?.(`万相2.6 生图 · 镜头 ${shot.index}`);

    try {
      const result = await generateWan26Keyframe({
        shot,
        product,
        prompt,
        productImageUrls,
        requestOrigin: options.requestOrigin,
        projectId: options.projectId,
        useReferenceImages:
          productImageUrls.length > 0 &&
          (shot.is_aigc_supplement || shot.index === manifest.cover_shot_index),
      });

      keyframes.push({
        shot_index: shot.index,
        url: result.url,
        prompt: result.prompt,
        source: shot.asset_source,
        used_controlnet: result.usedReference,
      });
      shot.keyframe_url = result.url;
      if (shot.index === manifest.cover_shot_index) coverThumbnail = result.url;
    } catch (e) {
      console.error(`万相2.6 shot ${shot.index} failed, fallback mock:`, e);
      const single = await generateKeyframesMock({
        ...input,
        manifest: {
          ...manifest,
          blocks: [{ index: 1, start: shot.start, end: shot.end, render_mode: "T2V", is_continuation: false, shots: [shot] }],
          cover_shot_index: shot.index,
        },
      });
      if (single.keyframes[0]) {
        keyframes.push(single.keyframes[0]);
        shot.keyframe_url = single.keyframes[0].url;
        if (shot.index === manifest.cover_shot_index) coverThumbnail = single.keyframes[0].url;
      }
    }
  }

  if (!coverThumbnail && keyframes.length > 0) {
    coverThumbnail = keyframes[0].url;
  }

  return { keyframes, cover_thumbnail: coverThumbnail };
}

async function generateKeyframesMock(
  input: KeyframeGenInput
): Promise<KeyframeGenOutput> {
  const { manifest, product, productImageUrls = [] } = input;
  const anchor = input.globalVisualAnchor ?? manifest.global_visual_anchor;

  const outDir = join(process.cwd(), "public", "uploads", "keyframes");
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const keyframes: KeyframeResult[] = [];
  let coverThumbnail: string | null = null;
  let imageSlot = 0;

  const allShots = manifest.blocks.flatMap((b) => b.shots);
  const shotsNeedingGen = allShots.filter(
    (s) => s.requires_image_gen || s.index === manifest.cover_shot_index
  );

  for (const shot of shotsNeedingGen) {
    const prompt = buildKeyframePrompt(shot, product, anchor);
    const filename = `keyframe-shot${shot.index}-${Date.now()}.svg`;
    const filepath = join(outDir, filename);
    const url = `/uploads/keyframes/${filename}`;

    let usedReference = false;
    let source = shot.asset_source;

    if (
      productImageUrls.length > 0 &&
      (shot.asset_source === "aigc_keyframe" || shot.index === manifest.cover_shot_index)
    ) {
      const refImage = productImageUrls[imageSlot % productImageUrls.length];
      imageSlot++;
      usedReference = true;
      await writeFile(filepath, buildPlaceholderSvg(shot, product, prompt, refImage, true), "utf-8");
    } else if (shot.asset_source === "user_image" && productImageUrls.length > 0) {
      const ref = productImageUrls[imageSlot % productImageUrls.length];
      imageSlot++;
      await writeFile(filepath, buildPlaceholderSvg(shot, product, prompt, ref, false), "utf-8");
      source = "user_image";
    } else {
      await writeFile(filepath, buildPlaceholderSvg(shot, product, prompt, null, false), "utf-8");
    }

    keyframes.push({
      shot_index: shot.index,
      url,
      prompt,
      source,
      used_controlnet: usedReference,
    });
    shot.keyframe_url = url;
    if (shot.index === manifest.cover_shot_index) coverThumbnail = url;
  }

  if (!coverThumbnail && keyframes.length > 0) {
    coverThumbnail = keyframes[0].url;
  }

  return { keyframes, cover_thumbnail: coverThumbnail };
}

function buildPlaceholderSvg(
  shot: ManifestShot,
  product: ProductInput,
  prompt: string,
  refImage: string | null,
  withReference: boolean
): string {
  const title = product.product_name ?? "MetaCut";
  const label = shot.ui_label ?? shot.narrative_stage;
  const accent = shot.is_aigc_supplement ? "#F5B041" : "#00F0FF";
  const refNote = refImage ? `ref: ${refImage.slice(0, 40)}` : "pure AIGC";
  const modeNote = withReference ? "wan2.6-image" : "wan2.6-t2i";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#0B0E14"/>
  <rect x="80" y="200" width="920" height="1200" rx="24" fill="#131821" stroke="${accent}" stroke-width="4"/>
  <text x="540" y="480" fill="${accent}" font-family="sans-serif" font-size="48" text-anchor="middle">Shot ${shot.index}</text>
  <text x="540" y="560" fill="#ffffff" font-family="sans-serif" font-size="36" text-anchor="middle">${escapeXml(title)}</text>
  <text x="540" y="640" fill="#aaaaaa" font-family="sans-serif" font-size="28" text-anchor="middle">${escapeXml(label)}</text>
  <text x="540" y="720" fill="#666666" font-family="sans-serif" font-size="22" text-anchor="middle">${modeNote}</text>
  <text x="540" y="780" fill="#666666" font-family="sans-serif" font-size="18" text-anchor="middle">${escapeXml(refNote)}</text>
  <foreignObject x="100" y="850" width="880" height="400">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#888;font-size:14px;padding:12px;font-family:sans-serif;">
      ${escapeXml(prompt.slice(0, 200))}
    </div>
  </foreignObject>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getShotsRequiringImageGen(manifest: ScriptManifest): ManifestShot[] {
  return manifest.blocks
    .flatMap((b) => b.shots)
    .filter((s) => s.requires_image_gen);
}

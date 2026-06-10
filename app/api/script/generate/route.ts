import { NextRequest, NextResponse } from "next/server";
import { parseProductMultimodal } from "@/lib/providers/doubao-product-parse";
import { stitchWithGaps } from "@/lib/script-stitch";
import { saveProductProfile, saveScriptVersion } from "@/lib/project-store";
import type {
  MaterialAnalysisResult,
  ProductInput,
  ScriptVersionType,
  StageBriefOverride,
  VideoAnalysisInput,
} from "@/lib/types/pipeline";

function mergeMaterialAnalysis(
  product: ProductInput,
  materialAnalysis?: MaterialAnalysisResult | null
) {
  if (!materialAnalysis) return product;
  return { ...product, material_analysis: materialAnalysis };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      videoAnalysis,
      productDescription = "",
      product,
      productImageUrls = [],
      productVideoUrl = null,
      productVideoUrls = [],
      stageOverrides = [],
      versionType,
      materialAnalysis = null,
      projectId,
    } = body as {
      videoAnalysis?: VideoAnalysisInput | null;
      productDescription?: string;
      product?: ProductInput;
      productImageUrls?: string[];
      productVideoUrl?: string | null;
      productVideoUrls?: string[];
      stageOverrides?: StageBriefOverride[];
      versionType?: ScriptVersionType;
      materialAnalysis?: MaterialAnalysisResult | null;
      projectId?: string | null;
    };

    const videoUrls =
      productVideoUrls.length > 0
        ? productVideoUrls
        : productVideoUrl
          ? [productVideoUrl]
          : [];
    const primaryVideoUrl = videoUrls[0] ?? null;

    const timelineEvents = videoAnalysis?.narrative_structure?.timeline_events ?? [];
    if (!timelineEvents.length) {
      return NextResponse.json(
        { error: "请先完成阶段①参考视频上传与解析" },
        { status: 400 }
      );
    }

    const hasProductInput =
      productDescription.trim() !== "" ||
      productImageUrls.length > 0 ||
      videoUrls.length > 0;
    if (!hasProductInput && !product) {
      return NextResponse.json(
        { error: "请至少输入一项商品信息（文本 / 图片 / 演示视频）" },
        { status: 400 }
      );
    }

    let parsedProduct: ProductInput & { parse_source?: string };
    let parseSource: string | undefined;
    let parseFallbackReason: string | undefined;

    if (product) {
      parsedProduct = mergeMaterialAnalysis(product, materialAnalysis);
    } else {
      const result = await parseProductMultimodal({
        productDescription,
        productImageUrls,
        productVideoUrl: primaryVideoUrl,
        productVideoUrls: videoUrls,
      });
      parsedProduct = mergeMaterialAnalysis(result, materialAnalysis);
      parseSource = result.parse_source;
      parseFallbackReason = result.parse_fallback_reason;
    }

    if (!parsedProduct.user_asset_inventory) {
      parsedProduct.user_asset_inventory = {
        product_images_count: productImageUrls.length,
        product_video_clips_count: videoUrls.length,
        has_logo_pack: false,
        has_endcard: false,
      };
    } else {
      parsedProduct.user_asset_inventory.product_video_clips_count =
        videoUrls.length;
      parsedProduct.user_asset_inventory.product_images_count =
        productImageUrls.length;
    }

    const stitched = await stitchWithGaps({
      videoAnalysis: videoAnalysis ?? null,
      product: parsedProduct,
      productImageUrls,
      productVideoUrl: primaryVideoUrl,
      productVideoUrls: videoUrls,
      stageOverrides: stageOverrides.length ? stageOverrides : undefined,
      versionType,
    });
    await saveProductProfile(projectId, parsedProduct);
    await saveScriptVersion({
      projectId,
      versionType: versionType ?? null,
      label: versionType ?? "default",
      scriptMarkdown: stitched.scriptMarkdown,
      scriptManifest: stitched.scriptManifest,
      gapPlan: stitched.gapPlan,
    });

    return NextResponse.json({
      success: true,
      product: parsedProduct,
      parse_source: parseSource,
      parse_fallback_reason: parseFallbackReason,
      stitch_source: stitched.stitch_source,
      stitch_fallback_reason: stitched.stitch_fallback_reason,
      scriptMarkdown: stitched.scriptMarkdown,
      scriptManifest: stitched.scriptManifest,
      gapPlan: stitched.gapPlan,
    });
  } catch (e) {
    console.error("script/generate error:", e);
    return NextResponse.json({ error: "剧本生成失败" }, { status: 500 });
  }
}

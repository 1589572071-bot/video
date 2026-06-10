import { NextRequest, NextResponse } from "next/server";
import { parseProductMultimodal } from "@/lib/providers/doubao-product-parse";
import { saveProductProfile } from "@/lib/project-store";
import type { MaterialAnalysisResult, ProductInput } from "@/lib/types/pipeline";

function mergeMaterialAnalysis(
  product: ProductInput,
  materialAnalysis?: MaterialAnalysisResult | null
) {
  if (!materialAnalysis) return product;
  return { ...product, material_analysis: materialAnalysis };
}

/** Step2 商品多模态拆解 → product/v1 JSON */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      productDescription = "",
      productImageUrls = [],
      productVideoUrl = null,
      productVideoUrls = [],
      materialAnalysis = null,
      projectId,
    } = body as {
      productDescription?: string;
      productImageUrls?: string[];
      productVideoUrl?: string | null;
      productVideoUrls?: string[];
      materialAnalysis?: MaterialAnalysisResult | null;
      projectId?: string | null;
    };

    const videoUrls =
      productVideoUrls.length > 0
        ? productVideoUrls
        : productVideoUrl
          ? [productVideoUrl]
          : [];

    const hasInput =
      productDescription.trim() ||
      productImageUrls.length > 0 ||
      videoUrls.length > 0;
    if (!hasInput) {
      return NextResponse.json(
        { error: "请至少提供文本、商品图或商品视频之一" },
        { status: 400 }
      );
    }

    const parsed = await parseProductMultimodal({
      productDescription,
      productImageUrls,
      productVideoUrl: videoUrls[0] ?? null,
      productVideoUrls: videoUrls,
    });
    const product = mergeMaterialAnalysis(parsed, materialAnalysis);
    await saveProductProfile(projectId, product);

    return NextResponse.json({
      success: true,
      product,
      parse_source: parsed.parse_source,
      parse_fallback_reason: parsed.parse_fallback_reason,
    });
  } catch (e) {
    console.error("product/parse error:", e);
    const msg = e instanceof Error ? e.message : "商品解析失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { polishProductFields } from "@/lib/providers/doubao-product-polish";

const ALLOWED_FIELDS = new Set([
  "product_name",
  "category",
  "visual_description",
  "usage_method",
  "core_selling_points",
  "target_audience",
  "usage_scene",
  "pain_point_gain_point",
]);

/** Step2 商品特征 AI 润色 → product/v1（仅合并 dirty 字段） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product, dirtyFields = [] } = body as {
      product?: Record<string, unknown>;
      dirtyFields?: string[];
    };

    if (!product || typeof product !== "object") {
      return NextResponse.json({ error: "缺少 product 对象" }, { status: 400 });
    }

    const fields = dirtyFields.filter((f) => ALLOWED_FIELDS.has(f));
    if (fields.length === 0) {
      return NextResponse.json(
        { error: "请至少指定一个有效的 dirtyFields 字段" },
        { status: 400 }
      );
    }

    const result = await polishProductFields({ product, dirtyFields: fields });

    return NextResponse.json({
      success: true,
      product: result.product,
      polish_source: result.polish_source,
      polish_fallback_reason: result.polish_fallback_reason,
    });
  } catch (e) {
    console.error("product/polish error:", e);
    const msg = e instanceof Error ? e.message : "商品润色失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

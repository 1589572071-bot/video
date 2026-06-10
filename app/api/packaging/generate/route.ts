import { NextRequest, NextResponse } from "next/server";
import { generateWan26Packaging } from "@/lib/providers/wan26-image";
import type { ProductInput } from "@/lib/types/pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product, prompt, productImageUrls, type, projectId } = body as {
      product: ProductInput;
      prompt: string;
      productImageUrls?: string[];
      type: "cover" | "feature_card";
      projectId?: string | null;
    };

    if (!product || !prompt || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const requestOrigin = request.headers.get("origin") ?? undefined;

    const result = await generateWan26Packaging({
      product,
      prompt,
      productImageUrls,
      requestOrigin,
      type,
      projectId,
    });

    return NextResponse.json({
      success: true,
      url: result.url,
    });
  } catch (e) {
    console.error("packaging/generate error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "包装生成失败" }, { status: 500 });
  }
}

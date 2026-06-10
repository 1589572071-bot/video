import { NextRequest, NextResponse } from "next/server";
import { generateKeyframes } from "@/lib/keyframe-generator";
import type { ProductInput, ScriptManifest } from "@/lib/types/pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      scriptManifest,
      product,
      productImageUrls = [],
    } = body as {
      scriptManifest: ScriptManifest;
      product: ProductInput;
      productImageUrls?: string[];
    };

    if (!scriptManifest?.blocks) {
      return NextResponse.json({ error: "缺少 scriptManifest" }, { status: 400 });
    }

    const result = await generateKeyframes({
      manifest: scriptManifest,
      product,
      productImageUrls,
    });

    return NextResponse.json({
      success: true,
      ...result,
      scriptManifest,
    });
  } catch (e) {
    console.error("render/keyframes error:", e);
    return NextResponse.json({ error: "关键帧生成失败" }, { status: 500 });
  }
}

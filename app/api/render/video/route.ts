import { NextRequest, NextResponse } from "next/server";
import { handleRenderPost } from "@/lib/render-handler";
import { originFromRequestHeaders } from "@/lib/asset-public-url";
import type { ProductInput, ScriptManifest } from "@/lib/types/pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      scriptManifest: ScriptManifest;
      product: ProductInput;
      productImageUrls?: string[];
      productVideoUrl?: string | null;
      productVideoUrls?: string[];
      referenceVideoUrl?: string | null;
      mockMode?: boolean;
      async?: boolean;
      projectId?: string | null;
    };

    const origin = originFromRequestHeaders(request.nextUrl.origin, request.headers);
    const handled = await handleRenderPost(body, origin);

    if ("error" in handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }

    if (handled.status === 202) {
      return NextResponse.json(handled.data, { status: 202 });
    }

    return NextResponse.json(handled.data);
  } catch (e) {
    console.error("render/video error:", e);
    return NextResponse.json({ error: "视频渲染失败" }, { status: 500 });
  }
}

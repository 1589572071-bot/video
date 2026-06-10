import { NextRequest, NextResponse } from "next/server";
import { analyzeMaterialVideo } from "@/lib/providers/doubao-material-analyze";
import { saveProductProfile } from "@/lib/project-store";
import type { ProductInput } from "@/lib/types/pipeline";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoUrl, projectId, product } = body as {
      videoUrl?: string;
      projectId?: string | null;
      product?: ProductInput | null;
    };

    if (!videoUrl) {
      return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
    }

    const result = await analyzeMaterialVideo(videoUrl);
    if (projectId && product && Object.keys(product).length > 0) {
      await saveProductProfile(projectId, { ...product, material_analysis: result });
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (e) {
    console.error("material/analyze error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "素材分析失败" }, { status: 500 });
  }
}

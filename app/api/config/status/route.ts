import { NextResponse } from "next/server";
import { MODEL_CONFIG, isBailianConfigured, isDoubaoConfigured } from "@/lib/model-config";
import { isFfmpegAvailable } from "@/lib/ffmpeg-utils";
import { isDatabaseConfigured } from "@/lib/db";
import { isS3Configured } from "@/lib/storage";
import { isReviewAuthEnabled } from "@/lib/review-auth";
import { getTextOverlayStatus } from "@/lib/video-text-overlay";

export const dynamic = "force-dynamic";

/** 返回当前环境的能力配置状态，供前端提示「真实能力 / Mock 占位」 */
export async function GET() {
  let ffmpeg = false;
  let textOverlay = {
    subtitleFilter: false,
    cjkFont: false,
    available: false,
  };
  try {
    ffmpeg = await isFfmpegAvailable();
    textOverlay = await getTextOverlayStatus();
  } catch {
    ffmpeg = false;
  }

  const publicOrigin = MODEL_CONFIG.bailian.publicOrigin;
  const publicOriginValid =
    Boolean(publicOrigin) && !/your-public-domain|example\.com/.test(publicOrigin);

  return NextResponse.json({
    doubao: isDoubaoConfigured(),
    bailian: isBailianConfigured(),
    renderMock: MODEL_CONFIG.render.mockMode || !isBailianConfigured(),
    ffmpeg,
    subtitleFilter: textOverlay.subtitleFilter,
    cjkFont: textOverlay.cjkFont,
    textOverlay: textOverlay.available,
    publicOriginValid,
    database: isDatabaseConfigured(),
    objectStorage: isS3Configured(),
    reviewAuth: isReviewAuthEnabled(),
  });
}

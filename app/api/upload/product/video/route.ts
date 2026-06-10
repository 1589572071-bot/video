import { NextRequest, NextResponse } from "next/server";
import { createAssetRecord, ensureProject } from "@/lib/project-store";
import { uploadBufferToStorage } from "@/lib/storage";
import { MAX_UPLOAD_VIDEO_BYTES } from "@/lib/video-limits";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("video") as File;
    const projectId = await ensureProject(formData.get("projectId") as string | null);

    if (!file || !file.type.startsWith("video/")) {
      return NextResponse.json({ error: "请上传视频" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "商品演示视频不能超过 50MB（长视频易导致素材理解超时）" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const stored = await uploadBufferToStorage({
      bytes: Buffer.from(bytes),
      contentType: file.type,
      projectId,
      assetKind: "product/videos",
      filename: file.name,
    });
    const assetId = await createAssetRecord({
      projectId,
      kind: "product_video",
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: file.name,
    });

    return NextResponse.json({
      success: true,
      projectId,
      assetId,
      url: stored.url,
      originalName: file.name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

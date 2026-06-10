import { NextRequest, NextResponse } from 'next/server';
import { createAssetRecord, ensureProject } from '@/lib/project-store';
import { uploadBufferToStorage } from '@/lib/storage';
import { MAX_UPLOAD_VIDEO_BYTES } from '@/lib/video-limits';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('video') as File;
    const projectId = await ensureProject(formData.get('projectId') as string | null, file?.name);

    if (!file) {
      return NextResponse.json(
        { error: '未找到视频文件' },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: '只支持视频文件上传' },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
      return NextResponse.json(
        { error: '参考视频不能超过 50MB（长视频易导致解析超时，建议压缩到 2 分钟以内）' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const stored = await uploadBufferToStorage({
      bytes: buffer,
      contentType: file.type,
      projectId,
      assetKind: 'reference',
      filename: file.name,
    });
    const assetId = await createAssetRecord({
      projectId,
      kind: 'reference_video',
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: file.name,
    });

    // 返回文件信息
    return NextResponse.json({
      success: true,
      projectId,
      assetId,
      filename: stored.key,
      url: stored.url,
      size: file.size,
      type: file.type,
      originalName: file.name,
    });
  } catch (error) {
    console.error('视频上传失败:', error);
    return NextResponse.json(
      { error: '上传失败，请稍后重试' },
      { status: 500 }
    );
  }
}

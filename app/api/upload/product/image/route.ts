import { NextRequest, NextResponse } from 'next/server';
import { createAssetRecord, ensureProject } from '@/lib/project-store';
import { uploadBufferToStorage } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const projectId = await ensureProject(formData.get('projectId') as string | null);

    if (!file || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    // 限制单图 20MB
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: '图片大小不能超过 20MB' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const stored = await uploadBufferToStorage({
      bytes: Buffer.from(bytes),
      contentType: file.type,
      projectId,
      assetKind: 'product/images',
      filename: file.name,
    });
    const assetId = await createAssetRecord({
      projectId,
      kind: 'product_image',
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: file.name,
    });

    return NextResponse.json({ success: true, projectId, assetId, url: stored.url });
  } catch (e) {
    console.error('Upload product image error:', e);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }
}

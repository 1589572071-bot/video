import { readFile } from "fs/promises";
import { join } from "path";
import { readManagedAssetBytes } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export function mimeFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

/** 读取 /uploads/... 本地资源为 base64 */
export async function readLocalAssetBytes(
  urlOrPath: string
): Promise<{ buffer: Buffer; mimeType: string; sizeBytes: number }> {
  const managed = await readManagedAssetBytes(urlOrPath);
  if (managed) {
    return {
      buffer: managed.bytes,
      mimeType: managed.contentType,
      sizeBytes: managed.bytes.length,
    };
  }

  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`下载远程素材失败: ${res.status}`);
    const contentType = res.headers.get("content-type") || mimeFromPath(new URL(urlOrPath).pathname);
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      mimeType: contentType,
      sizeBytes: buffer.length,
    };
  }

  const normalized = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
  if (!normalized.startsWith("/uploads/") && !normalized.startsWith("/metacut/")) {
    throw new Error(`仅支持 /uploads/、/metacut/ 或 http(s) 路径: ${urlOrPath}`);
  }
  const filepath = join(process.cwd(), "public", normalized.replace(/^\//, ""));
  const buffer = await readFile(filepath);
  return {
    buffer,
    mimeType: mimeFromPath(normalized),
    sizeBytes: buffer.length,
  };
}

/** 读取 /uploads/...、托管 S3 或远程资源为 base64 */
export async function readLocalAssetBase64(
  urlOrPath: string
): Promise<{ base64: string; mimeType: string; sizeBytes: number }> {
  const asset = await readLocalAssetBytes(urlOrPath);
  return {
    base64: asset.buffer.toString("base64"),
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
  };
}

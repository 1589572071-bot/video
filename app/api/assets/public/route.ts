import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolveSafeUploadPath } from "@/lib/safe-upload-path";
import { parseManagedObjectKey, readManagedAssetBytes } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
};

export const dynamic = "force-dynamic";

function mimeFromName(name: string): string {
  const clean = name.split("?")[0] ?? name;
  const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".")).toLowerCase() : "";
  return MIME[ext] || "application/octet-stream";
}

function parseRangeHeader(range: string | null, totalSize: number): { start: number; end: number } | null {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(totalSize - suffixLength, 0),
      end: totalSize - 1,
    };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : totalSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalSize) {
    return null;
  }

  return {
    start,
    end: Math.min(end, totalSize - 1),
  };
}

function contentRangeTotal(contentRange?: string | null): string | null {
  const match = contentRange?.match(/\/(\d+|\*)$/);
  return match?.[1] ?? null;
}

function responseBody(buffer: Buffer): ArrayBuffer {
  const body = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(body).set(buffer);
  return body;
}

function responseWithRange(input: {
  buffer: Buffer;
  contentType: string;
  rangeHeader: string | null;
  totalSize?: number | null;
  contentRange?: string | null;
}) {
  const total = input.totalSize ?? input.buffer.length;

  if (input.contentRange) {
    return new NextResponse(responseBody(input.buffer), {
      status: 206,
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.buffer.length),
        "Content-Range": input.contentRange,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const range = parseRangeHeader(input.rangeHeader, total);
  if (input.rangeHeader && !range) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${total}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  if (range) {
    const sliced = input.buffer.subarray(range.start, range.end + 1);
    return new NextResponse(responseBody(sliced), {
      status: 206,
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(sliced.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${total}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse(responseBody(input.buffer), {
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.buffer.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** 公网代理：供百炼拉取本地 uploads 素材 */
export async function GET(request: NextRequest) {
  try {
    const rangeHeader = request.headers.get("range");
    const urlParam = request.nextUrl.searchParams.get("url");
    const keyParam = request.nextUrl.searchParams.get("key");
    const pathParam = request.nextUrl.searchParams.get("path");

    if (urlParam || keyParam) {
      const managedPath = keyParam || urlParam || "";
      const objectKey = parseManagedObjectKey(managedPath);
      if (!objectKey) {
        return NextResponse.json({ error: "无效对象资源" }, { status: 403 });
      }

      const managed = await readManagedAssetBytes(objectKey, rangeHeader);
      if (!managed) {
        return NextResponse.json({ error: "对象不存在" }, { status: 404 });
      }
      const contentType =
        managed.contentType && managed.contentType !== "application/octet-stream"
          ? managed.contentType
          : mimeFromName(objectKey);
      const total = contentRangeTotal(managed.contentRange);
      return responseWithRange({
        buffer: managed.bytes,
        contentType,
        rangeHeader,
        totalSize: total && total !== "*" ? Number(total) : managed.contentLength ?? managed.bytes.length,
        contentRange: managed.contentRange,
      });
    }

    const filepath = resolveSafeUploadPath(pathParam);
    if (!filepath) {
      return NextResponse.json({ error: "无效 path，须为 /uploads/ 下的资源" }, { status: 400 });
    }

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const contentType = mimeFromName(filepath);
    const buffer = await readFile(filepath);
    return responseWithRange({ buffer, contentType, rangeHeader });
  } catch (e) {
    console.error("assets/public error:", e);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

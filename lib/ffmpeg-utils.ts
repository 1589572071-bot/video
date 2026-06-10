import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createAssetRecord } from "@/lib/project-store";
import { isS3Configured, readManagedAssetBytes, uploadLocalFileToStorage } from "@/lib/storage";

const execFileAsync = promisify(execFile);

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** 从视频抽取末帧 */
export async function extractLastFrame(
  videoPathOrUrl: string,
  outputBasename: string
): Promise<string> {
  const outDir = join(process.cwd(), "public", "uploads", "keyframes");
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const localInput = await ensureLocalVideo(videoPathOrUrl, outDir);
  const outPath = join(outDir, `${outputBasename}.jpg`);

  await execFileAsync("ffmpeg", [
    "-y",
    "-sseof",
    "-0.25",
    "-i",
    localInput,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outPath,
  ]);

  return `/uploads/keyframes/${outputBasename}.jpg`;
}

/** 拼接多个 chunk 为 final mp4 */
export async function concatVideos(
  videoPaths: string[],
  outputBasename: string,
  opts?: { projectId?: string | null; assetKind?: string }
): Promise<string> {
  if (videoPaths.length === 0) throw new Error("无视频可拼接");
  if (videoPaths.length === 1) return videoPaths[0];

  const outDir = join(process.cwd(), "public", "uploads", "renders");
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const listPath = join(outDir, `${outputBasename}-list.txt`);
  const localPaths: string[] = [];

  for (let i = 0; i < videoPaths.length; i++) {
    localPaths.push(await ensureLocalVideo(videoPaths[i], outDir));
  }

  const listContent = localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent, "utf-8");

  const outFile = join(outDir, `${outputBasename}.mp4`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outFile,
  ]);

  const localUrl = `/uploads/renders/${outputBasename}.mp4`;
  if (opts?.projectId && isS3Configured()) {
    const stored = await uploadLocalFileToStorage({
      localPath: outFile,
      contentType: "video/mp4",
      projectId: opts.projectId,
      assetKind: opts.assetKind ?? "renders/final",
      filename: `${outputBasename}.mp4`,
    });
    await createAssetRecord({
      projectId: opts.projectId,
      kind: "final_video",
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: `${outputBasename}.mp4`,
    });
    return stored.url;
  }
  return localUrl;
}

export async function ensureLocalVideo(src: string, workDir: string): Promise<string> {
  if (src.startsWith("/uploads/") || src.startsWith("public/")) {
    const rel = src.replace(/^public/, "").replace(/^\//, "");
    return join(process.cwd(), "public", rel.replace(/^uploads\//, "uploads/"));
  }
  const managed = await readManagedAssetBytes(src);
  if (managed) {
    const ext = managed.contentType.includes("webm") ? "webm" : "mp4";
    const name = `managed-${Date.now()}.${ext}`;
    const path = join(workDir, name);
    await writeFile(path, managed.bytes);
    return path;
  }
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`下载视频失败: ${src}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const name = `dl-${Date.now()}.mp4`;
    const path = join(workDir, name);
    await writeFile(path, buf);
    return path;
  }
  if (existsSync(src)) return src;
  throw new Error(`无法解析视频路径: ${src}`);
}

/** 下载远程视频到本地 uploads/renders */
export async function downloadVideoToLocal(
  remoteUrl: string,
  basename: string,
  opts?: { projectId?: string | null; assetKind?: string; assetRecordKind?: string }
): Promise<string> {
  const outDir = join(process.cwd(), "public", "uploads", "renders");
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`下载视频失败: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${basename}.mp4`;
  const localPath = join(outDir, file);
  await writeFile(localPath, buf);
  if (opts?.projectId && isS3Configured()) {
    const stored = await uploadLocalFileToStorage({
      localPath,
      contentType: "video/mp4",
      projectId: opts.projectId,
      assetKind: opts.assetKind ?? "renders/chunks",
      filename: file,
    });
    await createAssetRecord({
      projectId: opts.projectId,
      kind: opts.assetRecordKind ?? "render_chunk",
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: file,
    });
    return stored.url;
  }
  return `/uploads/renders/${file}`;
}

export async function readLocalPublicFile(relativePath: string): Promise<Buffer> {
  const p = join(process.cwd(), "public", relativePath.replace(/^\//, ""));
  return readFile(p);
}

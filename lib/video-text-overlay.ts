import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { ensureLocalVideo, isFfmpegAvailable } from "@/lib/ffmpeg-utils";
import { createAssetRecord } from "@/lib/project-store";
import { isS3Configured, uploadLocalFileToStorage } from "@/lib/storage";
import type { ScriptBlockManifest, ScriptManifest } from "@/lib/types/pipeline";

const execFileAsync = promisify(execFile);

const CJK_FONT_CANDIDATES = [
  "Noto Sans CJK SC",
  "Noto Sans SC",
  "Source Han Sans SC",
  "WenQuanYi Micro Hei",
  "PingFang SC",
  "Microsoft YaHei",
];

export interface OverlayCue {
  start: number;
  end: number;
  kind: "flower" | "subtitle";
  text: string;
}

export interface TextOverlayStatus {
  ffmpeg: boolean;
  subtitleFilter: boolean;
  cjkFont: boolean;
  fontFamily: string | null;
  available: boolean;
}

let cachedStatus: Promise<TextOverlayStatus> | null = null;

function stripFieldLabel(text: string): string {
  return text.replace(/^(屏幕花字|花字|字幕|口播文案|人声|口播|旁白)\s*[:：]\s*/, "");
}

function normalizeChineseText(value?: string | null): string {
  if (!value) return "";
  return stripFieldLabel(value)
    .replace(/\*\*/g, "")
    .replace(/[“”"]/g, "")
    .replace(/([\u4e00-\u9fff])\s*[A-Za-z]\s*(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTextClauses(value: string): string[] {
  return normalizeChineseText(value)
    .split(/[\/｜|；;。.!！？?，,、\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksBrokenFlowerClause(text: string): boolean {
  if (/^(解决|改善|针对|满足).{5,}$/.test(text)) return true;
  if (/(找不|无法|可以|不同)$/.test(text)) return true;
  if (/人群/.test(text) && text.length > 8) return true;
  return false;
}

function cleanFlowerText(value?: string | null): string {
  const clauses = splitTextClauses(value ?? "")
    .filter((part) => part.length >= 2)
    .filter((part) => !/[+＋]/.test(part))
    .filter((part) => !looksBrokenFlowerClause(part));

  const short = clauses.filter((part) => part.length <= 10).slice(0, 2);
  if (short.length) return short.join(" / ");

  const first = splitTextClauses(value ?? "")[0];
  if (!first) return "";
  if (/断发|断裂|易断/.test(first)) return "还在断发?";
  if (/发质|人群/.test(first)) return "适配发质";
  if (/干枯|毛躁|炸毛/.test(first)) return "发丝干枯?";
  if (/粘腻|黏腻|油腻/.test(first)) return "拒绝黏腻";
  if (/顺滑|亮泽|光泽|发光/.test(first)) return "顺滑亮泽";
  if (/修护|强韧|韧性|发根/.test(first)) return "强韧修护";
  if (/补水|保湿|水润/.test(first)) return "水润保湿";
  return "";
}

function cleanVoiceScriptText(voiceScript?: string | null, legacyVoiceover?: string | null): string {
  const direct = normalizeChineseText(voiceScript);
  if (direct) return direct;

  const legacy = legacyVoiceover?.split(/\s*[+＋]\s*/)[0];
  return normalizeChineseText(legacy);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

function cueDuration(start: number, end: number): number {
  return Math.max(0, end - start);
}

function buildCue(start: number, end: number, kind: OverlayCue["kind"], text: string): OverlayCue | null {
  const trimmed = text.trim();
  if (!trimmed || cueDuration(start, end) < 0.25) return null;
  return { start, end, kind, text: trimmed };
}

export function buildBlockOverlayCues(block: ScriptBlockManifest): OverlayCue[] {
  const blockDuration = Math.max(0, block.end - block.start);
  const cues: OverlayCue[] = [];

  for (const shot of block.shots) {
    const start = clamp(shot.start - block.start, 0, blockDuration);
    const end = clamp(shot.end - block.start, 0, blockDuration);
    const flower = cleanFlowerText(shot.packaging?.on_screen_text);
    const voice = cleanVoiceScriptText(
      shot.packaging?.voice_script,
      shot.packaging?.voiceover
    );

    const flowerCue = buildCue(start, end, "flower", flower);
    if (flowerCue) cues.push(flowerCue);

    if (voice && voice !== flower) {
      const subtitleCue = buildCue(start, end, "subtitle", voice);
      if (subtitleCue) cues.push(subtitleCue);
    }
  }

  return cues;
}

async function hasSubtitleFilter(): Promise<boolean> {
  try {
    const { stdout, stderr } = await execFileAsync("ffmpeg", ["-hide_banner", "-filters"]);
    return `${stdout}\n${stderr}`.includes(" subtitles ");
  } catch {
    return false;
  }
}

function looksLikeCjkFont(match: string, candidate: string): boolean {
  const lower = match.toLowerCase();
  return (
    lower.includes(candidate.toLowerCase()) ||
    lower.includes("noto sans cjk") ||
    lower.includes("source han sans") ||
    lower.includes("wenquanyi") ||
    lower.includes("pingfang") ||
    lower.includes("microsoft yahei")
  );
}

async function resolveCjkFontFamily(): Promise<string | null> {
  for (const candidate of CJK_FONT_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync("fc-match", ["-f", "%{family}\n", candidate]);
      const family = stdout.trim().split(",")[0]?.trim();
      if (family && looksLikeCjkFont(stdout.trim(), candidate)) return family;
    } catch {
      break;
    }
  }

  if (process.platform === "darwin") return "PingFang SC";
  if (process.platform === "win32") return "Microsoft YaHei";
  return null;
}

export async function getTextOverlayStatus(): Promise<TextOverlayStatus> {
  if (!cachedStatus) {
    cachedStatus = (async () => {
      const ffmpeg = await isFfmpegAvailable();
      const [subtitleFilter, fontFamily] = await Promise.all([
        ffmpeg ? hasSubtitleFilter() : Promise.resolve(false),
        resolveCjkFontFamily(),
      ]);
      return {
        ffmpeg,
        subtitleFilter,
        cjkFont: Boolean(fontFamily),
        fontFamily,
        available: ffmpeg && subtitleFilter && Boolean(fontFamily),
      };
    })();
  }
  return cachedStatus;
}

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function wrapText(text: string, maxChars: number, maxLines: number): string {
  const chars = Array.from(text.replace(/\s+/g, ""));
  if (chars.length <= maxChars) return text;

  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    line += ch;
    if (line.length >= maxChars || /[，。！？、,.!?]/.test(ch)) {
      lines.push(line);
      line = "";
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  const consumed = lines.join("").length;
  if (consumed < chars.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。！？、,.!?]+$/, "")}…`;
  }
  return lines.join("\\N");
}

function escapeAssText(text: string): string {
  return text
    .replace(/[{}]/g, "")
    .replace(/\\/g, " ")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

function assText(cue: OverlayCue): string {
  const wrapped =
    cue.kind === "flower"
      ? wrapText(cue.text, 11, 2)
      : wrapText(cue.text, 18, 2);
  return escapeAssText(wrapped);
}

function buildAss(cues: OverlayCue[], fontFamily: string): string {
  const dialogs = cues
    .map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},${cue.kind === "flower" ? "Flower" : "Subtitle"},,0,0,0,,${assText(cue)}`)
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Flower,${fontFamily},72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,8,80,80,260,1
Style: Subtitle,${fontFamily},50,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,4,1,2,88,88,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogs}
`;
}

function escapeSubtitlePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,");
}

function isVideoLike(url: string): boolean {
  const lower = url.split("?")[0].toLowerCase();
  return [".mp4", ".mov", ".webm", ".m4v"].some((ext) => lower.endsWith(ext));
}

export function isLikelyTextBurnedUrl(url: string): boolean {
  const decoded = decodeURIComponent(url).toLowerCase();
  return decoded.includes("-text-") || decoded.includes("/text-overlay/");
}

export async function burnTextOverlaysForBlockVideo(input: {
  videoUrl: string;
  block: ScriptBlockManifest;
  basename: string;
  projectId?: string | null;
  assetKind?: string;
  assetRecordKind?: string;
}): Promise<string> {
  if (!isVideoLike(input.videoUrl)) return input.videoUrl;

  const cues = buildBlockOverlayCues(input.block);
  if (cues.length === 0) return input.videoUrl;

  const status = await getTextOverlayStatus();
  if (!status.available || !status.fontFamily) {
    if (!status.ffmpeg) throw new Error("未检测到 FFmpeg，无法烧录花字/字幕");
    if (!status.subtitleFilter) throw new Error("当前 FFmpeg 不支持 subtitles/libass，无法烧录花字/字幕");
    throw new Error("未检测到中文字体，无法烧录中文花字/字幕，请安装 fonts-noto-cjk");
  }

  const outDir = join(process.cwd(), "public", "uploads", "renders");
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const localInput = await ensureLocalVideo(input.videoUrl, outDir);
  const assPath = join(outDir, `${input.basename}.ass`);
  const outFileName = `${input.basename}.mp4`;
  const outFile = join(outDir, outFileName);

  await writeFile(assPath, buildAss(cues, status.fontFamily), "utf-8");
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    localInput,
    "-vf",
    `subtitles=${escapeSubtitlePath(assPath)}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outFile,
  ]);

  if (input.projectId && isS3Configured()) {
    const stored = await uploadLocalFileToStorage({
      localPath: outFile,
      contentType: "video/mp4",
      projectId: input.projectId,
      assetKind: input.assetKind ?? "renders/chunks",
      filename: outFileName,
    });
    await createAssetRecord({
      projectId: input.projectId,
      kind: input.assetRecordKind ?? "render_chunk",
      objectKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName: outFileName,
    });
    return stored.url;
  }

  return `/uploads/renders/${outFileName}`;
}

export async function burnTextOverlaysForManifestChunks(input: {
  chunkVideos: string[];
  manifest: ScriptManifest;
  projectId?: string | null;
}): Promise<string[]> {
  const blocks = [...input.manifest.blocks].sort((a, b) => a.index - b.index);
  const output: string[] = [];

  for (let i = 0; i < input.chunkVideos.length; i++) {
    const url = input.chunkVideos[i];
    const block = blocks[i];
    if (!url || !block || isLikelyTextBurnedUrl(url)) {
      output.push(url);
      continue;
    }
    output.push(
      await burnTextOverlaysForBlockVideo({
        videoUrl: url,
        block,
        basename: `chunk-${block.index}-text-${Date.now()}`,
        projectId: input.projectId,
        assetKind: "renders/chunks",
        assetRecordKind: "render_chunk",
      })
    );
  }

  return output;
}

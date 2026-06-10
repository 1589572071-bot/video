import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const apiKey = process.env.DASHSCOPE_API_KEY;
const baseUrl = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1";
const text = "MetaCut 口播测试，干枯毛躁，三秒修护黑钻力。";

const response = await fetch(`${baseUrl}/services/audio/tts/SpeechSynthesizer`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: process.env.COSYVOICE_MODEL || "cosyvoice-v3-flash",
    input: {
      text,
      voice: process.env.COSYVOICE_VOICE || "longanyang",
      format: "mp3",
    },
  }),
});

if (!response.ok) {
  console.error("API 失败:", response.status, (await response.text()).slice(0, 400));
  process.exit(1);
}

const data = await response.json();
const audioUrl = data?.output?.audio?.url;
if (!audioUrl) {
  console.error("无 audio.url:", JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

const outDir = join(process.cwd(), "public", "uploads", "audio");
mkdirSync(outDir, { recursive: true });
const basename = `test-tts-${Date.now()}`;
const outPath = join(outDir, `${basename}.mp3`);

const audioRes = await fetch(audioUrl);
writeFileSync(outPath, Buffer.from(await audioRes.arrayBuffer()));

const { stdout } = await execFileAsync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration",
  "-of", "default=noprint_wrappers=1:nokey=1", outPath,
]);
const durationSec = parseFloat(stdout.trim());

console.log(JSON.stringify({
  ok: true,
  publicUrl: `/uploads/audio/${basename}.mp3`,
  durationSec,
  sizeBytes: readFileSync(outPath).length,
}, null, 2));
